"""Module 1: Review Response.

Each cycle (every REVIEW_POLL_MINUTES) does three things per restaurant:

  1. sync    - pull new reviews from every configured platform into `reviews`
  2. draft   - have Claude write a reply for each review with status "new"
  3. post    - publish every reply with status "approved"

Routing after drafting:

  rating >= auto_post_min_rating AND not flagged  ->  approved (by "auto") -> posted
  anything else                                    ->  pending_approval -> a human
                                                       approves / edits / rejects

"Flagged" means Claude *or* the keyword safety net below spotted something
sensitive (food safety, health, legal, harassment...). Two independent checks
guard the only path where a reply is published with no human involved.
"""
from __future__ import annotations

import logging
import re
from datetime import timedelta
from typing import Any

from sqlalchemy import and_, insert, select, update
from sqlalchemy.exc import IntegrityError

from app import llm, prompts
from app.config import settings
from app.db import (
    as_utc, engine, fetch_all, fetch_one, get_restaurant, log_action, new_id,
    rating_snapshots, reviews, utcnow,
)
from app.notify import notify_manager
from app.platforms import PLATFORMS, platforms_for

log = logging.getLogger(__name__)

FETCH_WINDOW_DAYS = 30        # how far back we import reviews (for theme analysis)
MAX_DRAFT_ATTEMPTS = 3        # then a human writes the reply
MAX_POST_ATTEMPTS = 5         # then the review is marked failed and the manager told
MAX_AUTO_REPLY_CHARS = 1500   # an unusually long draft gets a human look
URGENT_REASONS = {"food_safety", "health", "legal", "harassment"}

# Keyword safety net. Intentionally broad: a false positive only costs a
# manager a few seconds, a false negative auto-posts under a serious review.
SENSITIVE_PATTERNS: dict[str, re.Pattern[str]] = {
    "food_safety": re.compile(
        r"food poison|got sick|sick after|made (me|us|him|her) (sick|ill)|threw up|vomit|diarrh|"
        r"nausea|undercooked|raw (chicken|pork|meat)|\bhair in\b|cockroach|roach|rodent|\brats?\b|"
        r"\bmice\b|mouse|mold|maggot|\bbugs?\b|glass in|plastic in|metal in|allerg|anaphyla|"
        r"e\.? ?coli|salmonella|norovirus|expired|spoiled|rotten", re.I),
    "health": re.compile(
        r"hospital|emergency room|\bER\b|urgent care|ambulance|paramedic|injur|slipped|"
        r"\bfell\b|burn(ed|t) (my|his|her|me)|chok(ed|ing)|stitches|broken (tooth|bone)", re.I),
    "legal": re.compile(
        r"lawyer|attorney|lawsuit|\bsu(e|ing)\b|legal action|health (department|inspector)|"
        r"\bpolice\b|\bcops?\b|report(ed|ing)? (you|this|them)|chargeback|fraud|\bscam|"
        r"discriminat|\bADA\b", re.I),
    "harassment": re.compile(
        r"harass|grop(ed|ing)|touched (me|her|him)|inappropriate(ly)?|racis[tm]|racial|sexis[tm]|"
        r"homophob|transphob|\bslur\b|assault|threaten|stalk", re.I),
}


def keyword_flags(text: str) -> list[str]:
    return [reason for reason, pattern in SENSITIVE_PATTERNS.items() if pattern.search(text or "")]


# =============================================================================
# 1. Sync
# =============================================================================

def sync_reviews(restaurant: dict[str, Any]) -> int:
    """Import new reviews from every platform. Returns how many were added."""
    rid = restaurant["id"]
    now = utcnow()
    added = 0
    for platform in platforms_for(restaurant):
        known = {row["external_id"] for row in fetch_all(
            select(reviews.c.external_id).where(
                and_(reviews.c.restaurant_id == rid, reviews.c.platform == platform.name)))}
        try:
            result = platform.fetch_reviews(
                restaurant, since=now - timedelta(days=FETCH_WINDOW_DAYS), known_ids=known)
        except Exception as exc:  # noqa: BLE001 - one platform failing must not stop the others
            log.exception("fetching %s reviews failed for %s", platform.name, rid)
            log_action("reviews", "fetch_failed", restaurant_id=rid,
                       platform=platform.name, error=str(exc)[:300])
            continue

        _save_rating_snapshot(rid, platform.name, result.average_rating, result.total_reviews)

        for review in result.reviews:
            too_old = review.created_at < now - timedelta(days=settings.max_review_age_days)
            skip_reason = ("already_replied" if review.already_replied
                           else "older_than_reply_window" if too_old else None)
            row = {
                "id": new_id(), "restaurant_id": rid, "platform": platform.name,
                "external_id": review.external_id, "reviewer_name": review.reviewer_name,
                "rating": review.rating, "text": review.text,
                "review_created_at": review.created_at, "fetched_at": now,
                "status": "skipped" if skip_reason else "new",
                "flag_reasons": [], "themes": [],
            }
            try:
                with engine.begin() as conn:
                    conn.execute(insert(reviews).values(**row))
            except IntegrityError:
                continue  # another worker imported it first
            added += 1
            log_action("reviews", "imported", restaurant_id=rid, entity_id=row["id"],
                       platform=platform.name, rating=review.rating, skipped=skip_reason)
            # Module 2 hook: did this review come from one of our invites?
            from app.modules import review_growth
            review_growth.attribute_review(row)
    return added


def _save_rating_snapshot(rid: str, platform: str, average: float | None,
                          total: int | None) -> None:
    """Keep one rating snapshot per day (the latest poll of the day wins)."""
    if average is None:
        return
    today = utcnow().date()
    match = and_(rating_snapshots.c.restaurant_id == rid, rating_snapshots.c.platform == platform,
                 rating_snapshots.c.snapshot_date == today)
    with engine.begin() as conn:
        updated = conn.execute(update(rating_snapshots).where(match).values(
            average_rating=average, total_reviews=total))
        if updated.rowcount == 0:
            conn.execute(insert(rating_snapshots).values(
                id=new_id(), restaurant_id=rid, platform=platform, snapshot_date=today,
                average_rating=average, total_reviews=total))


# =============================================================================
# 2. Draft
# =============================================================================

def draft_reply(restaurant: dict[str, Any], review: dict[str, Any],
                guidance: str | None = None) -> dict[str, Any]:
    """Have Claude draft a reply, then decide: auto-post or human approval.

    Returns the updated review row.
    """
    rid, review_id = restaurant["id"], review["id"]
    platform = PLATFORMS[review["platform"]]
    values: dict[str, Any]

    try:
        draft = llm.structured(
            task="review_reply",
            system=prompts.review_response_system(restaurant),
            user=prompts.review_response_user(review, guidance),
            schema=prompts.ReviewDraft,
            mock=lambda: llm.mock_review_draft(restaurant, review),
        )
    except llm.LLMRefusal:
        # Claude would not write a reply; a person has to.
        values = {"status": "pending_approval", "flagged": True, "flag_reasons": ["ai_declined"],
                  "draft_reply": "", "last_error": None}
    except llm.LLMError as exc:
        attempts = review["draft_attempts"] + 1
        values = {"draft_attempts": attempts, "last_error": str(exc)[:500]}
        if attempts >= MAX_DRAFT_ATTEMPTS:
            values.update(status="pending_approval", flagged=True,
                          flag_reasons=["draft_failed"], draft_reply="")
        log.warning("drafting reply for review %s failed (attempt %d): %s",
                    review_id, attempts, exc)
    else:
        reasons = list(dict.fromkeys(  # de-duplicated, order kept
            (draft.flag_reasons if draft.flagged else []) + keyword_flags(review.get("text") or "")
        ))
        if draft.flagged and not reasons:
            reasons = ["other"]
        flagged = bool(reasons)
        reply = draft.reply.strip()

        routing_reasons = list(reasons)
        if review["rating"] < restaurant["auto_post_min_rating"]:
            routing_reasons.append("low_rating")
        if not platform.can_post_replies:
            routing_reasons.append("manual_platform")
        if not reply or len(reply) > MAX_AUTO_REPLY_CHARS:
            routing_reasons.append("unusual_draft")
        if guidance:
            routing_reasons.append("manager_requested_redraft")  # always shown back to them

        auto_post = not routing_reasons
        values = {
            "draft_reply": reply, "flagged": flagged, "flag_reasons": routing_reasons,
            "sentiment": draft.sentiment, "themes": draft.themes[:4],
            "internal_note": draft.internal_note, "last_error": None,
            "status": "approved" if auto_post else "pending_approval",
        }
        if auto_post:
            values.update(final_reply=reply, approved_by="auto")

    with engine.begin() as conn:
        conn.execute(update(reviews).where(reviews.c.id == review_id).values(**values))
    if "status" in values:
        log_action("reviews", "drafted", restaurant_id=rid, entity_id=review_id,
                   routed_to=values["status"], reasons=values.get("flag_reasons", []))
    return {**review, **values}


# =============================================================================
# 3. Post
# =============================================================================

def post_reply(restaurant: dict[str, Any], review: dict[str, Any]) -> bool:
    """Publish an approved reply. On failure it stays "approved" and is retried
    next cycle, up to MAX_POST_ATTEMPTS."""
    rid, review_id = restaurant["id"], review["id"]
    platform = PLATFORMS[review["platform"]]
    try:
        platform.post_reply(restaurant, review["external_id"], review["final_reply"])
    except Exception as exc:  # noqa: BLE001
        attempts = review["post_attempts"] + 1
        gave_up = attempts >= MAX_POST_ATTEMPTS
        with engine.begin() as conn:
            conn.execute(update(reviews).where(reviews.c.id == review_id).values(
                post_attempts=attempts, last_error=str(exc)[:500],
                status="failed" if gave_up else "approved"))
        log_action("reviews", "post_failed", restaurant_id=rid, entity_id=review_id,
                   attempt=attempts, gave_up=gave_up, error=str(exc)[:300])
        if gave_up:
            notify_manager(
                restaurant, purpose="reply_post_failed",
                subject=f"Could not post a review reply ({review['platform']})",
                body=(f"The reply to {review.get('reviewer_name')}'s {review['rating']}-star review "
                      f"failed to post after {attempts} attempts.\nLast error: {exc}\n\n"
                      f"Retry it from the dashboard: {_dashboard_url(rid)}"))
        return False

    with engine.begin() as conn:
        conn.execute(update(reviews).where(reviews.c.id == review_id).values(
            status="posted", posted_at=utcnow(), last_error=None))
    log_action("reviews", "posted", restaurant_id=rid, entity_id=review_id,
               platform=review["platform"], approved_by=review.get("approved_by"))
    return True


# =============================================================================
# The cycle
# =============================================================================

def run_cycle_for(restaurant: dict[str, Any]) -> dict[str, int]:
    rid = restaurant["id"]
    stats = {"imported": sync_reviews(restaurant), "drafted": 0, "queued": 0, "posted": 0}

    newly_pending: list[dict[str, Any]] = []
    for review in fetch_all(select(reviews).where(
            and_(reviews.c.restaurant_id == rid, reviews.c.status == "new"))):
        updated = draft_reply(restaurant, review)
        if updated["status"] != "new":
            stats["drafted"] += 1
        if updated["status"] == "pending_approval":
            newly_pending.append(updated)
    stats["queued"] = len(newly_pending)

    for review in fetch_all(select(reviews).where(
            and_(reviews.c.restaurant_id == rid, reviews.c.status == "approved"))):
        stats["posted"] += post_reply(restaurant, review)

    if newly_pending:
        _notify_pending(restaurant, newly_pending)
    return stats


def run_cycle() -> None:
    """Scheduler entry point: every active restaurant, isolated from each other."""
    from app.db import active_restaurants

    for restaurant in active_restaurants():
        try:
            stats = run_cycle_for(restaurant)
            if any(stats.values()):
                log.info("review cycle %s: %s", restaurant["id"], stats)
        except Exception:  # noqa: BLE001
            log.exception("review cycle failed for %s", restaurant["id"])


def _dashboard_url(rid: str) -> str:
    return f"{settings.public_base_url}/admin?restaurant={rid}"


def _notify_pending(restaurant: dict[str, Any], pending: list[dict[str, Any]]) -> None:
    """One message per cycle listing the replies that need a human."""
    lines = []
    urgent: set[str] = set()
    for review in pending[:5]:
        urgent |= URGENT_REASONS & set(review.get("flag_reasons") or [])
        lines.append(
            f"{review['rating']}★ from {review.get('reviewer_name') or 'a guest'} "
            f"on {review['platform']}  [{', '.join(review.get('flag_reasons') or [])}]\n"
            f"  Review: {(review.get('text') or '(no text)')[:300]}\n"
            f"  Draft reply: {(review.get('draft_reply') or '(none, please write one)')[:400]}")
    if len(pending) > 5:
        lines.append(f"...and {len(pending) - 5} more.")
    count = len(pending)
    notify_manager(
        restaurant, purpose="review_approval_needed",
        subject=f"{restaurant['name']}: {count} review repl{'y' if count == 1 else 'ies'} "
                f"need{'s' if count == 1 else ''} your approval",
        body="\n\n".join(lines) + f"\n\nApprove, edit or reject: {_dashboard_url(restaurant['id'])}",
        # Only safety/legal issues justify a text message.
        sms_text=(f"{restaurant['name']}: a new review mentions {', '.join(sorted(urgent))}. "
                  f"Nothing has been posted. Review it: {_dashboard_url(restaurant['id'])}"
                  ) if urgent else None,
    )


# =============================================================================
# Human approval queue (called by the dashboard / API)
# =============================================================================

class ReviewStateError(Exception):
    """The requested action does not apply to the review's current status."""


def _load(review_id: str) -> tuple[dict[str, Any], dict[str, Any]]:
    review = fetch_one(select(reviews).where(reviews.c.id == review_id))
    if review is None:
        raise ReviewStateError("review not found")
    restaurant = get_restaurant(review["restaurant_id"])
    if restaurant is None:
        raise ReviewStateError("restaurant not found")
    return review, restaurant


def approve(review_id: str, *, reply_text: str | None, approved_by: str) -> dict[str, Any]:
    """Approve the draft (optionally edited) and post it right away."""
    review, restaurant = _load(review_id)
    if review["status"] not in ("pending_approval", "failed"):
        raise ReviewStateError(f"cannot approve a review with status {review['status']!r}")
    text = (reply_text if reply_text is not None else review.get("draft_reply") or "").strip()
    if not text:
        raise ReviewStateError("the reply is empty")

    values = {"status": "approved", "final_reply": text, "approved_by": approved_by,
              "post_attempts": 0}
    with engine.begin() as conn:
        conn.execute(update(reviews).where(reviews.c.id == review_id).values(**values))
    log_action("reviews", "approved", restaurant_id=restaurant["id"], entity_id=review_id,
               approved_by=approved_by, edited=text != (review.get("draft_reply") or "").strip())
    review = {**review, **values}

    if not PLATFORMS[review["platform"]].can_post_replies:
        # No reply API: the manager pastes it into the platform themselves.
        with engine.begin() as conn:
            conn.execute(update(reviews).where(reviews.c.id == review_id).values(
                status="posted", posted_at=utcnow()))
        log_action("reviews", "marked_posted_manually", restaurant_id=restaurant["id"],
                   entity_id=review_id)
    else:
        post_reply(restaurant, review)  # if this fails, the next cycle retries it
    return fetch_one(select(reviews).where(reviews.c.id == review_id))


def reject(review_id: str, *, rejected_by: str, reason: str = "") -> dict[str, Any]:
    """Decide not to reply to this review at all."""
    review, restaurant = _load(review_id)
    if review["status"] not in ("pending_approval", "failed"):
        raise ReviewStateError(f"cannot reject a review with status {review['status']!r}")
    with engine.begin() as conn:
        conn.execute(update(reviews).where(reviews.c.id == review_id).values(
            status="rejected", approved_by=rejected_by))
    log_action("reviews", "rejected", restaurant_id=restaurant["id"], entity_id=review_id,
               rejected_by=rejected_by, reason=reason)
    return fetch_one(select(reviews).where(reviews.c.id == review_id))


def regenerate(review_id: str, *, guidance: str) -> dict[str, Any]:
    """Ask Claude for a new draft following the manager's guidance. The new
    draft always comes back to the queue; it is never auto-posted."""
    review, restaurant = _load(review_id)
    if review["status"] != "pending_approval":
        raise ReviewStateError(f"cannot redraft a review with status {review['status']!r}")
    draft_reply(restaurant, review, guidance=guidance or "Please write a different version.")
    return fetch_one(select(reviews).where(reviews.c.id == review_id))


def pending_count(restaurant_id: str) -> int:
    return len(fetch_all(select(reviews.c.id).where(and_(
        reviews.c.restaurant_id == restaurant_id, reviews.c.status == "pending_approval"))))


def oldest_pending_age_days(restaurant_id: str) -> int | None:
    rows = fetch_all(select(reviews.c.review_created_at).where(and_(
        reviews.c.restaurant_id == restaurant_id, reviews.c.status == "pending_approval")))
    if not rows:
        return None
    oldest = min(as_utc(row["review_created_at"]) for row in rows)
    return (utcnow() - oldest).days
