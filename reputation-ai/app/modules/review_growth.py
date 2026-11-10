"""Module 2: Review Growth.

Two ways to ask a guest for a review, both through a tracked short link
(`/r/{token}`) that counts the click and then redirects to the restaurant's
Google review form:

  * QR codes  - printable table tents and receipt strips (one link per asset
                type, so you can see which placement gets scanned)
  * SMS       - a post-visit text via Twilio, sent ONLY to numbers with a
                recorded opt-in, at most once per INVITE_COOLDOWN_DAYS, and
                only during daytime hours in the restaurant's timezone

What "conversion" means here: Google does not report which reviewer came from
which link, so the hard number is clicks. Reviews are attributed on a
best-effort basis: a new review is matched to an SMS invite when the invited
guest clicked within the previous 7 days and their first name matches the
reviewer's. Treat attributed reviews as a floor, not an exact count.
"""
from __future__ import annotations

import io
import logging
import re
import secrets
from datetime import datetime, timedelta
from typing import Any
from zoneinfo import ZoneInfo

import qrcode
from PIL import Image, ImageDraw, ImageFont
from sqlalchemy import and_, insert, select, update

from app.config import settings
from app.db import (
    as_utc, engine, fetch_all, fetch_one, get_restaurant, invites, log_action, new_id,
    sms_consent, utcnow,
)
from app.notify import send_sms

log = logging.getLogger(__name__)

ATTRIBUTION_WINDOW_DAYS = 7
QR_SOURCES = ("table_tent", "receipt", "plain")


class GrowthError(Exception):
    """A request that cannot be fulfilled (bad phone number, no review link...)."""


# =============================================================================
# Links
# =============================================================================

def google_review_url(restaurant: dict[str, Any]) -> str:
    """Google's "write a review" deep link for this place."""
    place_id = (restaurant.get("google_place_id") or "").strip()
    if not place_id:
        raise GrowthError(
            f"restaurant {restaurant['id']!r} has no google_place_id; set it before creating "
            "review links")
    return f"https://search.google.com/local/writereview?placeid={place_id}"


def tracked_url(token: str) -> str:
    return f"{settings.public_base_url}/r/{token}"


def record_click(token: str) -> str | None:
    """Count a click on a tracked link; return where to redirect (None = unknown)."""
    invite = fetch_one(select(invites).where(invites.c.token == token))
    if invite is None:
        return None
    restaurant = get_restaurant(invite["restaurant_id"])
    if restaurant is None:
        return None
    with engine.begin() as conn:
        conn.execute(update(invites).where(invites.c.id == invite["id"]).values(
            click_count=invites.c.click_count + 1,
            first_clicked_at=invite["first_clicked_at"] or utcnow()))
    log_action("growth", "link_clicked", restaurant_id=restaurant["id"], entity_id=invite["id"],
               channel=invite["channel"], source=invite["source"])
    try:
        return google_review_url(restaurant)
    except GrowthError:
        return None


# =============================================================================
# SMS consent
# =============================================================================

def normalize_phone(raw: str, default_country_code: str = "1") -> str:
    """Normalize to E.164 (+15551234567). Bare 10-digit numbers are assumed US/Canada."""
    digits = re.sub(r"\D", "", raw or "")
    if (raw or "").strip().startswith("+"):
        number = "+" + digits
    elif len(digits) == 10:
        number = f"+{default_country_code}{digits}"
    elif len(digits) == 11 and digits.startswith(default_country_code):
        number = "+" + digits
    else:
        raise GrowthError(f"could not understand phone number {raw!r}")
    if not 8 <= len(number) - 1 <= 15:
        raise GrowthError(f"could not understand phone number {raw!r}")
    return number


def set_consent(restaurant_id: str, phone: str, *, opted_in: bool, source: str) -> None:
    phone = normalize_phone(phone)
    match = and_(sms_consent.c.restaurant_id == restaurant_id, sms_consent.c.phone == phone)
    with engine.begin() as conn:
        updated = conn.execute(update(sms_consent).where(match).values(
            opted_in=opted_in, source=source, updated_at=utcnow()))
        if updated.rowcount == 0:
            conn.execute(insert(sms_consent).values(
                id=new_id(), restaurant_id=restaurant_id, phone=phone, opted_in=opted_in,
                source=source, updated_at=utcnow()))
        if not opted_in:
            # Opting out also cancels anything still waiting to be sent.
            conn.execute(update(invites).where(and_(
                invites.c.restaurant_id == restaurant_id, invites.c.phone == phone,
                invites.c.status == "queued")).values(status="cancelled", last_error="opted out"))
    log_action("growth", "consent_recorded", restaurant_id=restaurant_id,
               phone_last4=phone[-4:], opted_in=opted_in, source=source)


def has_consent(restaurant_id: str, phone: str) -> bool:
    row = fetch_one(select(sms_consent.c.opted_in).where(and_(
        sms_consent.c.restaurant_id == restaurant_id, sms_consent.c.phone == phone)))
    return bool(row and row["opted_in"])


def handle_inbound_sms(to_number: str, from_number: str, body: str) -> None:
    """Twilio inbound webhook: honor STOP / START replies.

    Twilio also blocks delivery to numbers that texted STOP; recording it here
    keeps our own list accurate so we do not even try.
    """
    from app.db import restaurants

    word = (body or "").strip().upper()
    if word in {"STOP", "STOPALL", "UNSUBSCRIBE", "CANCEL", "END", "QUIT"}:
        opted_in = False
    elif word in {"START", "UNSTOP", "YES"}:
        opted_in = True
    else:
        return
    try:
        phone = normalize_phone(from_number)
    except GrowthError:
        return
    # The guest replied to a shared sending number, so apply it to every
    # restaurant that has a consent record for them.
    rows = fetch_all(select(sms_consent.c.restaurant_id).where(sms_consent.c.phone == phone))
    for row in rows:
        set_consent(row["restaurant_id"], phone, opted_in=opted_in, source=f"sms_{word.lower()}")
    if not rows and not opted_in:
        # Unknown number opting out: remember it for every active restaurant.
        for restaurant in fetch_all(select(restaurants.c.id).where(restaurants.c.active.is_(True))):
            set_consent(restaurant["id"], phone, opted_in=False, source="sms_stop")


# =============================================================================
# SMS invites
# =============================================================================

def invite_message(restaurant: dict[str, Any], token: str) -> str:
    return (f"Thanks for dining at {restaurant['name']}! If you enjoyed it, would you mind "
            f"leaving a quick Google review? {tracked_url(token)}\nReply STOP to opt out.")


def queue_sms_invite(
    restaurant: dict[str, Any], phone: str, *, guest_name: str | None = None,
    delay_minutes: int = 0, consent_given: bool = False, consent_source: str = "api",
) -> dict[str, Any]:
    """Queue a post-visit review invite.

    Returns {"status": "queued"|"skipped", "reason": ..., "invite_id": ...}.
    `consent_given=True` means the guest opted in just now (for example a
    checkbox at checkout); it is recorded before anything is sent. Without a
    recorded opt-in, nothing is ever queued.
    """
    rid = restaurant["id"]
    phone = normalize_phone(phone)
    google_review_url(restaurant)  # fail early if the review link is not configured

    if consent_given:
        set_consent(rid, phone, opted_in=True, source=consent_source)
    if not has_consent(rid, phone):
        log_action("growth", "invite_skipped", restaurant_id=rid, phone_last4=phone[-4:],
                   reason="no_opt_in")
        return {"status": "skipped", "reason": "no_opt_in"}

    cooldown_start = utcnow() - timedelta(days=settings.invite_cooldown_days)
    recent = fetch_one(select(invites.c.id).where(and_(
        invites.c.restaurant_id == rid, invites.c.phone == phone, invites.c.channel == "sms",
        invites.c.status.in_(("queued", "sent")), invites.c.created_at >= cooldown_start)))
    if recent:
        log_action("growth", "invite_skipped", restaurant_id=rid, phone_last4=phone[-4:],
                   reason="recently_invited")
        return {"status": "skipped", "reason": "recently_invited"}

    invite_id, token = new_id(), secrets.token_urlsafe(6)
    with engine.begin() as conn:
        conn.execute(insert(invites).values(
            id=invite_id, restaurant_id=rid, token=token, channel="sms", source="sms",
            phone=phone, guest_name=guest_name, status="queued",
            send_at=utcnow() + timedelta(minutes=max(0, delay_minutes)), created_at=utcnow()))
    log_action("growth", "invite_queued", restaurant_id=rid, entity_id=invite_id,
               delay_minutes=delay_minutes)
    return {"status": "queued", "invite_id": invite_id}


def _within_sending_hours(restaurant: dict[str, Any], now: datetime) -> bool:
    local = now.astimezone(ZoneInfo(restaurant["timezone"]))
    return settings.sms_quiet_start_hour <= local.hour < settings.sms_quiet_end_hour


def send_due_invites() -> int:
    """Scheduler entry point (every minute): send queued invites that are due.

    Invites that come due outside sending hours simply wait in the queue.
    """
    now = utcnow()
    sent = 0
    due = fetch_all(select(invites).where(and_(
        invites.c.channel == "sms", invites.c.status == "queued", invites.c.send_at <= now)))
    for invite in due:
        restaurant = get_restaurant(invite["restaurant_id"])
        if restaurant is None or not restaurant["active"]:
            continue
        if not _within_sending_hours(restaurant, now):
            continue
        # Re-check consent at send time: the guest may have opted out since queueing.
        if not has_consent(restaurant["id"], invite["phone"]):
            _finish_invite(invite["id"], "cancelled", error="opted out before sending")
            continue
        # Claim the row first so a crash or a second worker cannot double-send.
        with engine.begin() as conn:
            claimed = conn.execute(update(invites).where(and_(
                invites.c.id == invite["id"], invites.c.status == "queued")).values(
                status="sending"))
        if claimed.rowcount == 0:
            continue
        sid = send_sms(invite["phone"], invite_message(restaurant, invite["token"]),
                       restaurant_id=restaurant["id"], purpose="review_invite")
        if sid:
            _finish_invite(invite["id"], "sent", provider_message_id=sid)
            sent += 1
        else:
            _finish_invite(invite["id"], "failed", error="SMS provider rejected the message")
        log_action("growth", "invite_sent" if sid else "invite_failed",
                   restaurant_id=restaurant["id"], entity_id=invite["id"])
    return sent


def _finish_invite(invite_id: str, status: str, *, provider_message_id: str | None = None,
                   error: str | None = None) -> None:
    with engine.begin() as conn:
        conn.execute(update(invites).where(invites.c.id == invite_id).values(
            status=status, provider_message_id=provider_message_id, last_error=error,
            sent_at=utcnow() if status == "sent" else None))


# =============================================================================
# Conversion tracking
# =============================================================================

def attribute_review(review: dict[str, Any]) -> str | None:
    """Best-effort: link a newly imported review to the SMS invite behind it."""
    reviewer = (review.get("reviewer_name") or "").strip().lower().split()
    if not reviewer:
        return None
    created = as_utc(review["review_created_at"])
    candidates = fetch_all(select(invites).where(and_(
        invites.c.restaurant_id == review["restaurant_id"], invites.c.channel == "sms",
        invites.c.converted_review_id.is_(None), invites.c.first_clicked_at.is_not(None),
        invites.c.first_clicked_at >= created - timedelta(days=ATTRIBUTION_WINDOW_DAYS),
        invites.c.first_clicked_at <= created + timedelta(hours=1),
    )).order_by(invites.c.first_clicked_at.desc()))
    for invite in candidates:
        guest = (invite.get("guest_name") or "").strip().lower().split()
        if guest and guest[0] == reviewer[0]:
            with engine.begin() as conn:
                conn.execute(update(invites).where(invites.c.id == invite["id"]).values(
                    converted_review_id=review["id"], converted_at=utcnow()))
            log_action("growth", "invite_converted", restaurant_id=review["restaurant_id"],
                       entity_id=invite["id"], review_id=review["id"])
            return invite["id"]
    return None


def stats(restaurant_id: str, days: int = 30) -> dict[str, Any]:
    """Invite funnel for the last `days` days, plus all-time QR scans."""
    since = utcnow() - timedelta(days=days)
    rows = fetch_all(select(invites).where(invites.c.restaurant_id == restaurant_id))
    sms = [r for r in rows if r["channel"] == "sms" and as_utc(r["created_at"]) >= since]
    sent = [r for r in sms if r["status"] == "sent"]
    clicked = [r for r in sent if r["click_count"] > 0]
    converted = [r for r in sent if r["converted_review_id"]]
    return {
        "window_days": days,
        "sms": {
            "queued": sum(r["status"] == "queued" for r in sms),
            "sent": len(sent),
            "failed": sum(r["status"] == "failed" for r in sms),
            "clicked": len(clicked),
            "click_rate": round(len(clicked) / len(sent), 3) if sent else None,
            "attributed_reviews": len(converted),
        },
        "qr_scans_all_time": {
            r["source"]: r["click_count"] for r in rows if r["channel"] == "qr"
        },
    }


# =============================================================================
# QR assets
# =============================================================================

def qr_token(restaurant: dict[str, Any], source: str) -> str:
    """Each (restaurant, asset type) has one permanent link, created on first use,
    so reprinting never changes the code."""
    if source not in QR_SOURCES:
        raise GrowthError(f"unknown QR asset {source!r}; choose from {', '.join(QR_SOURCES)}")
    google_review_url(restaurant)
    existing = fetch_one(select(invites.c.token).where(and_(
        invites.c.restaurant_id == restaurant["id"], invites.c.channel == "qr",
        invites.c.source == source)))
    if existing:
        return existing["token"]
    token = secrets.token_urlsafe(6)
    with engine.begin() as conn:
        conn.execute(insert(invites).values(
            id=new_id(), restaurant_id=restaurant["id"], token=token, channel="qr",
            source=source, status="active", created_at=utcnow()))
    log_action("growth", "qr_created", restaurant_id=restaurant["id"], source=source)
    return token


def _hex_to_rgb(color: str | None, default: tuple[int, int, int] = (31, 58, 46)) -> tuple[int, int, int]:
    match = re.fullmatch(r"#?([0-9a-fA-F]{6})", (color or "").strip())
    if not match:
        return default
    value = match.group(1)
    return tuple(int(value[i:i + 2], 16) for i in (0, 2, 4))  # type: ignore[return-value]


def _qr_image(url: str, size: int, color: tuple[int, int, int]) -> Image.Image:
    code = qrcode.QRCode(error_correction=qrcode.constants.ERROR_CORRECT_M, border=2)
    code.add_data(url)
    code.make(fit=True)
    image = code.make_image(fill_color=color, back_color="white").convert("RGB")
    return image.resize((size, size), Image.NEAREST)  # NEAREST keeps the modules crisp


def _centered_text(draw: ImageDraw.ImageDraw, text: str, *, y: int, width: int, size: int,
                   fill: Any, margin: int = 80) -> int:
    """Draw word-wrapped centered text; return the y coordinate below it."""
    font = ImageFont.load_default(size=size)
    lines, current = [], ""
    for word in text.split():
        candidate = f"{current} {word}".strip()
        if draw.textlength(candidate, font=font) <= width - 2 * margin or not current:
            current = candidate
        else:
            lines.append(current)
            current = word
    lines.append(current)
    for line in lines:
        draw.text(((width - draw.textlength(line, font=font)) / 2, y), line, font=font, fill=fill)
        y += int(size * 1.25)
    return y


def _png(image: Image.Image, dpi: int) -> bytes:
    buffer = io.BytesIO()
    image.save(buffer, format="PNG", dpi=(dpi, dpi))
    return buffer.getvalue()


def render_qr_asset(restaurant: dict[str, Any], source: str) -> bytes:
    """Return a print-ready PNG.

    table_tent : 4x6 in at 300 dpi, in the restaurant's brand color
    receipt    : 576 px wide (80 mm thermal paper), pure black on white
    plain      : just the QR code, for menus, posters or your own designs
    """
    url = tracked_url(qr_token(restaurant, source))
    brand = _hex_to_rgb(restaurant.get("brand_color"))

    if source == "plain":
        return _png(_qr_image(url, 1000, (0, 0, 0)), 300)

    if source == "receipt":
        width, black = 576, (0, 0, 0)
        image = Image.new("RGB", (width, 640), "white")
        draw = ImageDraw.Draw(image)
        y = _centered_text(draw, "How did we do?", y=24, width=width, size=40, fill=black, margin=20)
        y = _centered_text(draw, "Scan to leave a quick Google review", y=y + 4, width=width,
                           size=24, fill=black, margin=20)
        image.paste(_qr_image(url, 380, black), ((width - 380) // 2, y + 12))
        _centered_text(draw, f"Thank you from {restaurant['name']}", y=y + 410, width=width,
                       size=24, fill=black, margin=20)
        return _png(image, 203)

    # table_tent
    width, height = 1200, 1800
    image = Image.new("RGB", (width, height), "white")
    draw = ImageDraw.Draw(image)
    draw.rectangle([0, 0, width, 420], fill=brand)
    y = _centered_text(draw, restaurant["name"], y=110, width=width, size=96, fill="white")
    _centered_text(draw, "Thank you for dining with us", y=max(y + 10, 290), width=width,
                   size=44, fill="white")
    y = _centered_text(draw, "Enjoyed your visit?", y=500, width=width, size=84, fill=brand)
    y = _centered_text(draw, "Scan to leave us a quick Google review. It takes under a minute "
                             "and means the world to our team.",
                       y=y + 20, width=width, size=40, fill=(60, 60, 60), margin=120)
    qr_size = 720
    qr_top = max(y + 40, 860)
    image.paste(_qr_image(url, qr_size, brand), ((width - qr_size) // 2, qr_top))
    draw.rectangle([0, height - 60, width, height], fill=brand)
    return _png(image, 300)
