"""Endpoints reached by the outside world without the admin token: tracked
review links, and webhooks from Twilio and ElevenLabs. Each webhook
authenticates its sender in its own way (signature or shared secret)."""
from __future__ import annotations

import json
import logging
import secrets
from typing import Any

from fastapi import APIRouter, Header, HTTPException, Request, Response
from fastapi.responses import RedirectResponse

from app.config import settings
from app.modules import guest_recovery, review_growth
from app.routes.deps import restaurant_or_404

log = logging.getLogger(__name__)
router = APIRouter()


@router.get("/health")
def health() -> dict[str, Any]:
    return {"status": "ok", "test_mode": settings.test_mode}


# --- Module 2: tracked review link ------------------------------------------------

@router.get("/r/{token}", include_in_schema=False)
def review_link(token: str) -> Response:
    """Count the click, then send the guest to the Google review form."""
    destination = review_growth.record_click(token)
    if destination is None:
        raise HTTPException(404, "This review link is no longer active.")
    return RedirectResponse(destination, status_code=302)


@router.post("/webhooks/twilio/sms", include_in_schema=False)
async def twilio_inbound(request: Request,
                         x_twilio_signature: str | None = Header(None)) -> Response:
    """Inbound SMS (STOP / START). Point your Twilio number's messaging
    webhook at {PUBLIC_BASE_URL}/webhooks/twilio/sms."""
    form = dict(await request.form())
    if not settings.test_mode:
        from twilio.request_validator import RequestValidator

        url = f"{settings.public_base_url}/webhooks/twilio/sms"
        valid = bool(settings.twilio_auth_token) and RequestValidator(
            settings.twilio_auth_token).validate(url, form, x_twilio_signature or "")
        if not valid:
            raise HTTPException(403, "invalid Twilio signature")
    review_growth.handle_inbound_sms(
        str(form.get("To", "")), str(form.get("From", "")), str(form.get("Body", "")))
    # Empty TwiML: Twilio sends its own STOP/START confirmations.
    return Response("<Response/>", media_type="application/xml")


# --- Module 3: voice agent tools + post-call webhook ---------------------------------

VOICE_TOOLS = {
    "create-reservation": guest_recovery.handle_reservation,
    "flag-unhappy-guest": guest_recovery.handle_unhappy_flag,
    "take-message": guest_recovery.handle_message,
}


def _check_voice_secret(supplied: str | None) -> None:
    expected = settings.voice_tool_secret
    if not expected:
        if settings.test_mode:
            return
        raise HTTPException(503, "VOICE_TOOL_SECRET is not configured on the server")
    if not supplied or not secrets.compare_digest(supplied.encode(), expected.encode()):
        raise HTTPException(401, "invalid voice tool secret")


@router.post("/webhooks/voice/{restaurant_id}/{tool}")
async def voice_tool(restaurant_id: str, tool: str, request: Request,
                     x_voice_secret: str | None = Header(None)) -> dict[str, str]:
    """Called by the ElevenLabs agent mid-call. The `result` string is read
    by the agent, which relays it to the caller in its own words."""
    _check_voice_secret(x_voice_secret)
    handler = VOICE_TOOLS.get(tool)
    if handler is None:
        raise HTTPException(404, f"unknown tool {tool!r}")
    restaurant = restaurant_or_404(restaurant_id)
    try:
        body = await request.json()
    except json.JSONDecodeError as exc:
        raise HTTPException(400, "body must be JSON") from exc
    if not isinstance(body, dict):
        raise HTTPException(400, "body must be a JSON object")
    try:
        return {"result": handler(restaurant, body)}
    except Exception:  # noqa: BLE001
        # Give the agent something graceful to say rather than an HTTP error.
        log.exception("voice tool %s failed for %s", tool, restaurant_id)
        return {"result": "Something went wrong saving that. Apologize, take the caller's name "
                          "and number, and tell them the team will call them back."}


@router.post("/webhooks/elevenlabs/post-call")
async def elevenlabs_post_call(request: Request,
                               elevenlabs_signature: str | None = Header(None)) -> dict[str, Any]:
    """ElevenLabs post-call webhook: transcript + metadata for a finished call."""
    raw = await request.body()
    if not guest_recovery.verify_elevenlabs_signature(raw, elevenlabs_signature):
        raise HTTPException(401, "invalid webhook signature")
    try:
        payload = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise HTTPException(400, "body must be JSON") from exc
    # Test mode only: mock payloads carry no agent id, so allow ?restaurant_id=...
    fallback = request.query_params.get("restaurant_id") if settings.test_mode else None
    return guest_recovery.handle_post_call(payload, restaurant_id=fallback)
