"""Admin API (token-protected): brand settings, the approval queue, growth
tools, call history, summaries, and the audit log. The dashboard at /admin
is a thin page on top of these endpoints."""
from __future__ import annotations

from pathlib import Path
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Response
from fastapi.responses import HTMLResponse
from pydantic import BaseModel, Field
from sqlalchemy import and_, select

from app.db import action_log, calls, fetch_all, reservations, restaurants, reviews, summaries
from app.modules import daily_summary, review_growth, review_response
from app.retry import PermanentError
from app.routes.deps import require_admin, restaurant_or_404
from app.tenants import RestaurantSettings, public_view, upsert_restaurant
from app.voice import agent_config

router = APIRouter(dependencies=[Depends(require_admin)])
DASHBOARD = Path(__file__).resolve().parent.parent / "static" / "dashboard.html"


@router.get("/admin", response_class=HTMLResponse, include_in_schema=False)
def dashboard() -> str:
    return DASHBOARD.read_text()


# --- Restaurants / brand settings ------------------------------------------------

@router.get("/api/restaurants")
def list_restaurants() -> list[dict[str, Any]]:
    return [public_view(r) for r in fetch_all(select(restaurants).order_by(restaurants.c.name))]


@router.get("/api/restaurants/{restaurant_id}")
def read_restaurant(restaurant_id: str) -> dict[str, Any]:
    return public_view(restaurant_or_404(restaurant_id))


@router.put("/api/restaurants/{restaurant_id}")
def write_restaurant(restaurant_id: str, changes: RestaurantSettings) -> dict[str, Any]:
    """Create a restaurant or update its brand voice, name, phone numbers, etc.
    Only the fields you send are changed."""
    try:
        return public_view(upsert_restaurant(restaurant_id, changes))
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc


# --- Module 1: reviews and the approval queue -----------------------------------------

class ApproveBody(BaseModel):
    reply: str | None = Field(None, description="Edited reply text; omit to post the draft as-is.")
    approved_by: str = "manager"


class RejectBody(BaseModel):
    rejected_by: str = "manager"
    reason: str = ""


class RegenerateBody(BaseModel):
    guidance: str = Field("", description="What to change, e.g. 'shorter, mention the patio'.")


@router.get("/api/restaurants/{restaurant_id}/reviews")
def list_reviews(restaurant_id: str, status: str | None = None, limit: int = 50) -> list[dict[str, Any]]:
    restaurant_or_404(restaurant_id)
    condition = reviews.c.restaurant_id == restaurant_id
    if status:
        condition = and_(condition, reviews.c.status == status)
    return fetch_all(select(reviews).where(condition).order_by(
        reviews.c.review_created_at.desc()).limit(min(limit, 200)))


@router.post("/api/restaurants/{restaurant_id}/reviews/poll")
def poll_now(restaurant_id: str) -> dict[str, int]:
    """Run a fetch -> draft -> post cycle right now instead of waiting for the scheduler."""
    return review_response.run_cycle_for(restaurant_or_404(restaurant_id))


def _review_action(action, *args, **kwargs) -> dict[str, Any]:
    try:
        return action(*args, **kwargs)
    except review_response.ReviewStateError as exc:
        raise HTTPException(409, str(exc)) from exc


@router.post("/api/reviews/{review_id}/approve")
def approve_review(review_id: str, body: ApproveBody) -> dict[str, Any]:
    return _review_action(review_response.approve, review_id,
                          reply_text=body.reply, approved_by=body.approved_by)


@router.post("/api/reviews/{review_id}/reject")
def reject_review(review_id: str, body: RejectBody) -> dict[str, Any]:
    return _review_action(review_response.reject, review_id,
                          rejected_by=body.rejected_by, reason=body.reason)


@router.post("/api/reviews/{review_id}/regenerate")
def regenerate_review(review_id: str, body: RegenerateBody) -> dict[str, Any]:
    return _review_action(review_response.regenerate, review_id, guidance=body.guidance)


# --- Module 2: review growth ------------------------------------------------------------

class ConsentBody(BaseModel):
    phone: str
    opted_in: bool
    source: str = "api"


class InviteBody(BaseModel):
    phone: str
    guest_name: str | None = None
    delay_minutes: int = Field(60, ge=0, le=7 * 24 * 60,
                               description="How long after the visit to send the text.")
    consent_given: bool = Field(
        False, description="True only if the guest explicitly opted in to texts just now.")
    consent_source: str = "api"


@router.post("/api/restaurants/{restaurant_id}/consent")
def record_consent(restaurant_id: str, body: ConsentBody) -> dict[str, str]:
    restaurant_or_404(restaurant_id)
    try:
        review_growth.set_consent(restaurant_id, body.phone, opted_in=body.opted_in,
                                  source=body.source)
    except review_growth.GrowthError as exc:
        raise HTTPException(422, str(exc)) from exc
    return {"status": "recorded"}


@router.post("/api/restaurants/{restaurant_id}/invites")
def create_invite(restaurant_id: str, body: InviteBody) -> dict[str, Any]:
    """Queue a post-visit review invite. Call this from your POS or
    reservation system when a guest checks out."""
    try:
        return review_growth.queue_sms_invite(
            restaurant_or_404(restaurant_id), body.phone, guest_name=body.guest_name,
            delay_minutes=body.delay_minutes, consent_given=body.consent_given,
            consent_source=body.consent_source)
    except review_growth.GrowthError as exc:
        raise HTTPException(422, str(exc)) from exc


@router.get("/api/restaurants/{restaurant_id}/invites/stats")
def invite_stats(restaurant_id: str, days: int = 30) -> dict[str, Any]:
    restaurant_or_404(restaurant_id)
    return review_growth.stats(restaurant_id, days)


@router.get("/api/restaurants/{restaurant_id}/qr/{source}.png")
def qr_asset(restaurant_id: str, source: str) -> Response:
    """Print-ready PNG: source is table_tent, receipt or plain."""
    try:
        png = review_growth.render_qr_asset(restaurant_or_404(restaurant_id), source)
    except review_growth.GrowthError as exc:
        raise HTTPException(422, str(exc)) from exc
    return Response(png, media_type="image/png", headers={
        "Content-Disposition": f'inline; filename="{restaurant_id}-{source}.png"'})


# --- Module 3: calls ------------------------------------------------------------------------

@router.get("/api/restaurants/{restaurant_id}/calls")
def list_calls(restaurant_id: str, unhappy_only: bool = False, limit: int = 50) -> list[dict[str, Any]]:
    restaurant_or_404(restaurant_id)
    condition = calls.c.restaurant_id == restaurant_id
    if unhappy_only:
        condition = and_(condition, calls.c.unhappy.is_(True))
    return fetch_all(select(calls).where(condition).order_by(
        calls.c.created_at.desc()).limit(min(limit, 200)))


@router.get("/api/restaurants/{restaurant_id}/reservations")
def list_reservations(restaurant_id: str, limit: int = 50) -> list[dict[str, Any]]:
    restaurant_or_404(restaurant_id)
    return fetch_all(select(reservations).where(
        reservations.c.restaurant_id == restaurant_id).order_by(
        reservations.c.created_at.desc()).limit(min(limit, 200)))


@router.get("/api/restaurants/{restaurant_id}/voice/config")
def voice_config(restaurant_id: str) -> dict[str, Any]:
    """The ElevenLabs agent definition (system prompt + tools), secret redacted."""
    return agent_config.build_agent_config(restaurant_or_404(restaurant_id), redact_secret=True)


@router.post("/api/restaurants/{restaurant_id}/voice/provision")
def voice_provision(restaurant_id: str) -> dict[str, str]:
    """Create or update the ElevenLabs agent from the current brand settings."""
    try:
        return {"agent_id": agent_config.provision_agent(restaurant_or_404(restaurant_id))}
    except PermanentError as exc:
        raise HTTPException(502, str(exc)) from exc


# --- Module 4: daily summary ---------------------------------------------------------------

@router.post("/api/restaurants/{restaurant_id}/summary/run")
def run_summary(restaurant_id: str, send: bool = True) -> dict[str, Any]:
    """Generate today's summary now (replaces today's if it already exists)."""
    return daily_summary.generate(restaurant_or_404(restaurant_id), send=send, force=True)


@router.get("/api/restaurants/{restaurant_id}/summary/latest")
def latest_summary(restaurant_id: str) -> dict[str, Any]:
    restaurant_or_404(restaurant_id)
    rows = fetch_all(select(summaries).where(
        summaries.c.restaurant_id == restaurant_id).order_by(
        summaries.c.summary_date.desc()).limit(1))
    if not rows:
        raise HTTPException(404, "no summary has been generated yet")
    return rows[0]


# --- Audit log --------------------------------------------------------------------------------

@router.get("/api/restaurants/{restaurant_id}/log")
def read_log(restaurant_id: str, limit: int = 100) -> list[dict[str, Any]]:
    restaurant_or_404(restaurant_id)
    return fetch_all(select(action_log).where(
        action_log.c.restaurant_id == restaurant_id).order_by(
        action_log.c.created_at.desc()).limit(min(limit, 500)))
