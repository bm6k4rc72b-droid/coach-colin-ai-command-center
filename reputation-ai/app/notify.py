"""Outbound messages: SMS (Twilio), email (SMTP) and Slack (incoming webhook).

Every message is recorded in the `outbox` table with its outcome. In test
mode nothing leaves the machine: messages are recorded with status "mock".
A failed channel never raises to the caller, so one broken integration (say,
a revoked Slack webhook) cannot stop a manager alert going out by SMS.
"""
from __future__ import annotations

import logging
import smtplib
from email.message import EmailMessage
from typing import Any

import httpx
from sqlalchemy import insert

from app.config import settings
from app.db import engine, new_id, outbox, utcnow
from app.retry import is_transient_http, with_retry

log = logging.getLogger(__name__)


def _record(channel: str, recipient: str, purpose: str, body: str, status: str,
            *, restaurant_id: str | None, subject: str | None = None,
            error: str | None = None) -> None:
    with engine.begin() as conn:
        conn.execute(insert(outbox).values(
            id=new_id(), restaurant_id=restaurant_id, channel=channel, recipient=recipient,
            purpose=purpose, subject=subject, body=body, status=status, error=error,
            created_at=utcnow(),
        ))


# --- SMS ------------------------------------------------------------------------

_twilio_client = None


def _twilio():
    global _twilio_client
    if _twilio_client is None:
        from twilio.rest import Client

        _twilio_client = Client(settings.twilio_account_sid, settings.twilio_auth_token)
    return _twilio_client


def _twilio_transient(exc: Exception) -> bool:
    from twilio.base.exceptions import TwilioRestException

    if isinstance(exc, TwilioRestException):
        return exc.status == 429 or exc.status >= 500
    return isinstance(exc, (ConnectionError, TimeoutError)) or is_transient_http(exc)


def send_sms(to: str, body: str, *, restaurant_id: str | None, purpose: str) -> str | None:
    """Send one SMS. Returns the provider message id, or None if it failed."""
    if settings.test_mode:
        _record("sms", to, purpose, body, "mock", restaurant_id=restaurant_id)
        return f"mock-{new_id()[:12]}"
    if not (settings.twilio_account_sid and settings.twilio_auth_token):
        _record("sms", to, purpose, body, "failed", restaurant_id=restaurant_id,
                error="Twilio is not configured")
        return None

    def _send() -> str:
        params: dict[str, Any] = {"to": to, "body": body}
        if settings.twilio_messaging_service_sid:
            params["messaging_service_sid"] = settings.twilio_messaging_service_sid
        else:
            params["from_"] = settings.twilio_from_number
        return _twilio().messages.create(**params).sid

    try:
        sid = with_retry(_send, label="twilio sms", is_transient=_twilio_transient)
    except Exception as exc:  # noqa: BLE001
        log.error("SMS to %s failed: %s", to, exc)
        _record("sms", to, purpose, body, "failed", restaurant_id=restaurant_id, error=str(exc))
        return None
    _record("sms", to, purpose, body, "sent", restaurant_id=restaurant_id)
    return sid


# --- Email ------------------------------------------------------------------------

def send_email(to: str, subject: str, text: str, *, html: str | None = None,
               restaurant_id: str | None, purpose: str) -> bool:
    if settings.test_mode:
        _record("email", to, purpose, text, "mock", restaurant_id=restaurant_id, subject=subject)
        return True
    if not (settings.smtp_host and settings.email_from):
        _record("email", to, purpose, text, "failed", restaurant_id=restaurant_id,
                subject=subject, error="SMTP is not configured")
        return False

    message = EmailMessage()
    message["From"], message["To"], message["Subject"] = settings.email_from, to, subject
    message.set_content(text)
    if html:
        message.add_alternative(html, subtype="html")

    def _send() -> None:
        with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=30) as smtp:
            smtp.starttls()
            if settings.smtp_username:
                smtp.login(settings.smtp_username, settings.smtp_password)
            smtp.send_message(message)

    try:
        with_retry(_send, label="smtp", is_transient=lambda exc: isinstance(
            exc, (smtplib.SMTPServerDisconnected, smtplib.SMTPConnectError, OSError)))
    except Exception as exc:  # noqa: BLE001
        log.error("email to %s failed: %s", to, exc)
        _record("email", to, purpose, text, "failed", restaurant_id=restaurant_id,
                subject=subject, error=str(exc))
        return False
    _record("email", to, purpose, text, "sent", restaurant_id=restaurant_id, subject=subject)
    return True


# --- Slack ------------------------------------------------------------------------

def send_slack(webhook_url: str, text: str, *, restaurant_id: str | None, purpose: str) -> bool:
    # The webhook URL is itself a credential, so it is never written to the outbox.
    if settings.test_mode:
        _record("slack", "webhook", purpose, text, "mock", restaurant_id=restaurant_id)
        return True

    def _send() -> None:
        httpx.post(webhook_url, json={"text": text}, timeout=15).raise_for_status()

    try:
        with_retry(_send, label="slack")
    except Exception as exc:  # noqa: BLE001
        log.error("slack notification failed: %s", type(exc).__name__)
        _record("slack", "webhook", purpose, text, "failed", restaurant_id=restaurant_id,
                error=type(exc).__name__)
        return False
    _record("slack", "webhook", purpose, text, "sent", restaurant_id=restaurant_id)
    return True


# --- The manager, on every channel they have configured ------------------------------

def notify_manager(
    restaurant: dict[str, Any], *, purpose: str, subject: str, body: str,
    sms_text: str | None = None, html: str | None = None,
) -> int:
    """Notify the manager by Slack and email, plus SMS when `sms_text` is given.

    Pass `sms_text` only for things that cannot wait (an unhappy guest, a
    food-safety review). Returns how many channels succeeded.
    """
    rid = restaurant["id"]
    delivered = 0
    if sms_text and restaurant.get("manager_phone"):
        delivered += bool(send_sms(restaurant["manager_phone"], sms_text[:480],
                                   restaurant_id=rid, purpose=purpose))
    if restaurant.get("slack_webhook_url"):
        delivered += send_slack(restaurant["slack_webhook_url"], f"*{subject}*\n{body}",
                                restaurant_id=rid, purpose=purpose)
    if restaurant.get("manager_email"):
        delivered += send_email(restaurant["manager_email"], subject, body, html=html,
                                restaurant_id=rid, purpose=purpose)
    if delivered == 0:
        log.error("manager of %s could not be reached for %s: no working channel", rid, purpose)
    return delivered
