"""Module 3: Guest Recovery.

The ElevenLabs voice agent answers the phone. This module is everything that
happens on our side of those calls:

  During the call (tool webhooks, see app/voice/agent_config.py):
    * create_reservation   -> saved, manager notified
    * flag_unhappy_guest   -> manager texted/emailed IMMEDIATELY, mid-call
    * take_message         -> manager notified

  After the call (ElevenLabs post-call webhook):
    * the transcript is stored and analyzed by Claude as a safety net; if
      the caller was unhappy the manager gets the summary + full transcript,
      whether or not the live agent flagged it.

So an unhappy guest is caught by two independent checks, and the manager
hears about it within seconds to minutes: always the same day.
"""
from __future__ import annotations

import hashlib
import hmac
import logging
import time
from datetime import date, datetime, timezone
from typing import Any
from zoneinfo import ZoneInfo

from sqlalchemy import insert, select, update

from app import llm, prompts
from app.config import settings
from app.db import calls, engine, fetch_one, log_action, new_id, reservations, restaurants, utcnow
from app.notify import notify_manager
from app.voice.agent_config import MAX_PARTY_SIZE

log = logging.getLogger(__name__)

SIGNATURE_TOLERANCE_SECONDS = 30 * 60


# =============================================================================
# Call records
# =============================================================================

def _upsert_call(restaurant_id: str, conversation_id: str, **values: Any) -> dict[str, Any]:
    """Create or update the row for one phone call (keyed by conversation id).

    Tool webhooks arrive mid-call and the transcript arrives afterwards, in
    either order, so every writer goes through here.
    """
    values = {key: value for key, value in values.items() if value is not None}
    with engine.begin() as conn:
        existing = conn.execute(
            select(calls.c.id).where(calls.c.conversation_id == conversation_id)).first()
        if existing is None:
            conn.execute(insert(calls).values(
                id=new_id(), restaurant_id=restaurant_id, conversation_id=conversation_id,
                created_at=utcnow(), **{"transcript": [], "issues": [], **values}))
        elif values:
            conn.execute(update(calls).where(
                calls.c.conversation_id == conversation_id).values(**values))
    return fetch_one(select(calls).where(calls.c.conversation_id == conversation_id))


def _clean(value: Any) -> str:
    return str(value).strip() if value not in (None, "") else ""


# =============================================================================
# Tool: create_reservation
# =============================================================================

def handle_reservation(restaurant: dict[str, Any], body: dict[str, Any]) -> str:
    """Validate and store a reservation request. Returns the sentence the
    voice agent relays to the caller (including any problem to fix)."""
    rid = restaurant["id"]
    name = _clean(body.get("guest_name"))
    if not name:
        return "I still need the name for the reservation."
    try:
        party_size = int(body.get("party_size"))
    except (TypeError, ValueError):
        return "I still need the number of guests."
    if party_size < 1:
        return "I still need the number of guests."
    if party_size > MAX_PARTY_SIZE:
        return (f"Parties larger than {MAX_PARTY_SIZE} are arranged by the manager directly. "
                "Offer to take a message instead.")
    try:
        day = date.fromisoformat(_clean(body.get("date")))
        clock = datetime.strptime(_clean(body.get("time")), "%H:%M").strftime("%H:%M")
    except ValueError:
        return "The date or time was not understood. Ask the caller for the date and time again."
    today = datetime.now(ZoneInfo(restaurant["timezone"])).date()
    if day < today:
        return (f"That date, {day:%A, %B %-d}, is in the past. Today is {today:%A, %B %-d}. "
                "Check the date with the caller.")

    phone = _clean(body.get("phone")) or _clean(body.get("caller_phone"))
    reservation_id = new_id()
    with engine.begin() as conn:
        conn.execute(insert(reservations).values(
            id=reservation_id, restaurant_id=rid,
            conversation_id=_clean(body.get("conversation_id")) or None,
            guest_name=name, phone=phone, party_size=party_size, reservation_date=day,
            reservation_time=clock, notes=_clean(body.get("notes")), status="requested",
            created_at=utcnow()))
    log_action("voice", "reservation_requested", restaurant_id=rid, entity_id=reservation_id,
               party_size=party_size, date=str(day), time=clock)

    when = f"{day:%A, %B %-d} at {datetime.strptime(clock, '%H:%M'):%-I:%M %p}"
    notify_manager(
        restaurant, purpose="reservation_request",
        subject=f"Reservation request: {name}, party of {party_size}, {when}",
        body=(f"Taken by the phone assistant.\n\nName: {name}\nParty size: {party_size}\n"
              f"When: {when}\nPhone: {phone or 'not given'}\n"
              f"Notes: {_clean(body.get('notes')) or 'none'}\n\n"
              "Please confirm with the guest and add it to your reservation book."))
    return (f"The reservation request for {name}, party of {party_size}, on {when} has been sent "
            "to the team. Tell the caller the restaurant will confirm it shortly.")


# =============================================================================
# Tool: flag_unhappy_guest  (real-time alert)
# =============================================================================

def handle_unhappy_flag(restaurant: dict[str, Any], body: dict[str, Any]) -> str:
    rid = restaurant["id"]
    conversation_id = _clean(body.get("conversation_id")) or f"unknown-{new_id()[:10]}"
    summary = _clean(body.get("issue_summary")) or "The caller is unhappy (no details captured)."
    severity = _clean(body.get("severity")).lower() or "medium"
    guest = _clean(body.get("guest_name")) or "Unknown guest"
    callback = _clean(body.get("callback_number")) or _clean(body.get("caller_phone")) or "unknown"
    wants_callback = body.get("wants_callback") is not False

    previous = fetch_one(select(calls).where(calls.c.conversation_id == conversation_id))
    _upsert_call(rid, conversation_id, unhappy=True, sentiment="negative", summary=summary,
                 caller_phone=_clean(body.get("caller_phone")) or None, alert_sent_at=utcnow())
    log_action("voice", "unhappy_guest_flagged", restaurant_id=rid, entity_id=conversation_id,
               severity=severity, repeat=bool(previous and previous["alert_sent_at"]))

    # The agent may flag twice (once on detection, again with name/number).
    update_note = "UPDATE: " if previous and previous["alert_sent_at"] else ""
    callback_line = (f"Call back today: {callback}" if wants_callback
                     else f"Guest asked NOT to be called. Number on file: {callback}")
    notify_manager(
        restaurant, purpose="unhappy_guest_alert",
        subject=f"{update_note}Unhappy guest on the phone ({severity}): {guest}",
        body=(f"{summary}\n\nGuest: {guest}\n{callback_line}\n\n"
              "The call may still be in progress. The full transcript follows when it ends."),
        sms_text=(f"{update_note}{restaurant['name']}: unhappy guest on the phone "
                  f"({severity}). {guest}: {summary[:220]} {callback_line}"),
    )
    return ("The manager has been alerted. Tell the caller a manager will personally follow up "
            "today.")


# =============================================================================
# Tool: take_message
# =============================================================================

def handle_message(restaurant: dict[str, Any], body: dict[str, Any]) -> str:
    message = _clean(body.get("message"))
    if not message:
        return "I did not catch the message. Ask the caller what they would like to pass on."
    guest = _clean(body.get("guest_name")) or "A caller"
    callback = _clean(body.get("callback_number")) or _clean(body.get("caller_phone")) or "not given"
    log_action("voice", "message_taken", restaurant_id=restaurant["id"],
               entity_id=_clean(body.get("conversation_id")) or None)
    notify_manager(
        restaurant, purpose="phone_message",
        subject=f"Phone message from {guest}",
        body=f"{message}\n\nFrom: {guest}\nCallback number: {callback}")
    return "The message has been passed to the team. Tell the caller someone will get back to them."


# =============================================================================
# Post-call webhook
# =============================================================================

def verify_elevenlabs_signature(raw_body: bytes, header: str | None) -> bool:
    """Check the `ElevenLabs-Signature: t=<unix>,v0=<hex hmac>` header.

    The HMAC-SHA256 is computed over "<t>.<raw body>" with the webhook secret.
    """
    secret = settings.elevenlabs_webhook_secret
    if not secret:
        # Without a secret we cannot authenticate the sender. Allowed only in
        # test mode; production refuses rather than trust unsigned requests.
        return settings.test_mode
    try:
        parts = dict(item.split("=", 1) for item in (header or "").split(","))
        timestamp, signature = parts["t"].strip(), parts["v0"].strip()
        if abs(time.time() - int(timestamp)) > SIGNATURE_TOLERANCE_SECONDS:
            return False
    except (KeyError, ValueError):
        return False
    expected = hmac.new(secret.encode(), f"{timestamp}.".encode() + raw_body,
                        hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature)


def handle_post_call(payload: dict[str, Any], restaurant_id: str | None = None) -> dict[str, Any]:
    """Store the finished call, analyze it, and alert the manager if needed.

    Safe to receive twice (ElevenLabs retries webhooks): the manager is only
    sent the transcript once per call.
    """
    if payload.get("type") not in (None, "post_call_transcription"):
        return {"status": "ignored", "reason": f"event type {payload.get('type')}"}
    data = payload.get("data") or {}
    conversation_id = _clean(data.get("conversation_id"))
    if not conversation_id:
        return {"status": "ignored", "reason": "no conversation_id"}

    # Which restaurant? Normally resolved from the agent that took the call.
    restaurant = None
    if data.get("agent_id"):
        restaurant = fetch_one(select(restaurants).where(
            restaurants.c.elevenlabs_agent_id == data["agent_id"]))
    if restaurant is None and restaurant_id:
        restaurant = fetch_one(select(restaurants).where(restaurants.c.id == restaurant_id))
    if restaurant is None:
        existing = fetch_one(select(calls).where(calls.c.conversation_id == conversation_id))
        if existing:
            restaurant = fetch_one(select(restaurants).where(
                restaurants.c.id == existing["restaurant_id"]))
    if restaurant is None:
        log.warning("post-call webhook for unknown agent %s", data.get("agent_id"))
        return {"status": "ignored", "reason": "unknown agent"}
    rid = restaurant["id"]

    transcript = [
        {"role": turn.get("role"), "message": turn.get("message"),
         "time_in_call_secs": turn.get("time_in_call_secs")}
        for turn in data.get("transcript") or []
    ]
    meta = data.get("metadata") or {}
    started = meta.get("start_time_unix_secs")
    call = _upsert_call(
        rid, conversation_id, transcript=transcript,
        caller_phone=_clean((meta.get("phone_call") or {}).get("external_number")) or None,
        duration_seconds=meta.get("call_duration_secs"),
        started_at=datetime.fromtimestamp(started, tz=timezone.utc) if started else None,
    )
    flagged_live = bool(call["alert_sent_at"])

    # Claude reads the whole transcript: the safety net behind the live agent.
    try:
        analysis = llm.structured(
            task="call_analysis",
            system=prompts.CALL_ANALYSIS_SYSTEM_PROMPT.format(name=restaurant["name"]),
            user=prompts.call_analysis_user(transcript),
            schema=prompts.CallAnalysis,
            mock=lambda: llm.mock_call_analysis(transcript),
        )
        values = {
            "summary": analysis.summary, "sentiment": analysis.sentiment,
            "issues": analysis.issues, "follow_up": analysis.follow_up,
            # Once flagged unhappy during the call, analysis never un-flags it.
            "unhappy": analysis.unhappy or call["unhappy"],
        }
    except llm.LLMError as exc:
        # Keep the call record useful even if Claude is unavailable.
        log.error("call analysis failed for %s: %s", conversation_id, exc)
        values = {"summary": call["summary"]
                  or _clean((data.get("analysis") or {}).get("transcript_summary"))
                  or "Automatic analysis failed; please read the transcript."}
    call = _upsert_call(rid, conversation_id, **values)
    log_action("voice", "call_recorded", restaurant_id=rid, entity_id=conversation_id,
               unhappy=call["unhappy"], flagged_live=flagged_live,
               duration=call["duration_seconds"])

    if call["unhappy"] and not call["transcript_sent_at"]:
        caller = call["caller_phone"] or "unknown number"
        issues = "\n".join(f"- {issue}" for issue in call["issues"] or []) or "- (see transcript)"
        notify_manager(
            restaurant, purpose="unhappy_guest_transcript",
            subject=f"Unhappy caller: summary and transcript ({caller})",
            body=(f"{call['summary']}\n\nIssues:\n{issues}\n\n"
                  f"Suggested follow-up: {call['follow_up'] or 'Call the guest back today.'}\n"
                  f"Caller: {caller}\n\n--- Transcript ---\n"
                  f"{prompts.format_transcript(transcript)}"),
            # If the live agent already triggered a text, don't send a second one.
            sms_text=None if flagged_live else (
                f"{restaurant['name']}: an unhappy guest called ({caller}). "
                f"{(call['summary'] or '')[:240]} Details sent by email/Slack."),
        )
        _upsert_call(rid, conversation_id, transcript_sent_at=utcnow(),
                     alert_sent_at=call["alert_sent_at"] or utcnow())
    return {"status": "ok", "conversation_id": conversation_id, "unhappy": call["unhappy"]}
