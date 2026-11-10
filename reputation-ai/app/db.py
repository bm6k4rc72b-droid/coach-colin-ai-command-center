"""Database schema and helpers (SQLAlchemy Core).

The tables are defined once here and work on both Postgres (Supabase) and
SQLite (local/test mode). `schema.sql` is generated from this file with
`python -m scripts.cli gen-schema`, so the two never drift apart.

Every table carries `restaurant_id`, which is what makes the system
multi-tenant: one deployment can serve any number of restaurants.
"""
from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import (
    JSON, Boolean, Column, Date, DateTime, Float, Index, Integer, MetaData,
    String, Table, Text, UniqueConstraint, create_engine, insert, select,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.engine import Engine
from sqlalchemy.pool import StaticPool

from app.config import settings

log = logging.getLogger(__name__)

metadata = MetaData()
JsonType = JSON().with_variant(JSONB(), "postgresql")
Timestamp = DateTime(timezone=True)


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def as_utc(value: datetime | None) -> datetime | None:
    """SQLite returns naive datetimes; everything we store is UTC."""
    if value is not None and value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value


def new_id() -> str:
    return uuid.uuid4().hex


# --- Brand settings: one row per restaurant (tenant) --------------------------
restaurants = Table(
    "restaurants", metadata,
    Column("id", String(64), primary_key=True),  # short slug, e.g. "olive-and-ember"
    Column("name", Text, nullable=False),
    Column("phone", String(32)),            # public number guests call
    Column("address", Text),
    Column("hours", Text),
    Column("parking", Text),
    Column("menu_highlights", Text),
    Column("brand_voice", Text),            # how replies should sound
    Column("extra_info", Text),             # FAQs: dietary options, private events...
    Column("sign_off", Text),               # e.g. "— Maria, General Manager"
    Column("brand_color", String(16), default="#1F3A2E"),
    Column("manager_name", Text),
    Column("manager_phone", String(32)),    # gets urgent SMS alerts
    Column("manager_email", Text),
    Column("slack_webhook_url", Text),
    Column("google_account_id", Text),      # Business Profile account id
    Column("google_location_id", Text),     # Business Profile location id
    Column("google_place_id", Text),        # Maps place id, used for the review link
    Column("timezone", String(64), nullable=False, default="America/New_York"),
    Column("summary_time", String(5), nullable=False, default="07:30"),  # local HH:MM
    Column("auto_post_min_rating", Integer, nullable=False, default=4),
    Column("elevenlabs_agent_id", Text),
    Column("active", Boolean, nullable=False, default=True),
    Column("created_at", Timestamp, nullable=False, default=utcnow),
    Column("updated_at", Timestamp, nullable=False, default=utcnow, onupdate=utcnow),
)

# --- Module 1: reviews and their replies ---------------------------------------
# status: new -> pending_approval | approved -> posted
#         rejected (human declined to reply) | skipped (too old / already replied)
#         failed (posting gave up after retries)
reviews = Table(
    "reviews", metadata,
    Column("id", String(32), primary_key=True, default=new_id),
    Column("restaurant_id", String(64), nullable=False),
    Column("platform", String(32), nullable=False),      # google | yelp | tripadvisor | mock
    Column("external_id", Text, nullable=False),         # the platform's review id
    Column("reviewer_name", Text),
    Column("rating", Integer, nullable=False),           # 1-5
    Column("text", Text),
    Column("review_created_at", Timestamp, nullable=False),
    Column("status", String(32), nullable=False, default="new"),
    Column("flagged", Boolean, nullable=False, default=False),
    Column("flag_reasons", JsonType, default=list),      # e.g. ["food_safety", "low_rating"]
    Column("sentiment", String(16)),                     # positive | mixed | negative
    Column("themes", JsonType, default=list),            # short phrases, feed the daily summary
    Column("draft_reply", Text),                         # what Claude wrote
    Column("final_reply", Text),                         # what was actually posted
    Column("internal_note", Text),                       # Claude's private note to the manager
    Column("approved_by", Text),                         # "auto" or a person's name
    Column("draft_attempts", Integer, nullable=False, default=0),
    Column("post_attempts", Integer, nullable=False, default=0),
    Column("last_error", Text),
    Column("fetched_at", Timestamp, nullable=False, default=utcnow),
    Column("posted_at", Timestamp),
    UniqueConstraint("restaurant_id", "platform", "external_id", name="uq_review_external"),
    Index("ix_reviews_restaurant_status", "restaurant_id", "status"),
)

# Daily rating snapshot per platform; powers "change vs last week".
rating_snapshots = Table(
    "rating_snapshots", metadata,
    Column("id", String(32), primary_key=True, default=new_id),
    Column("restaurant_id", String(64), nullable=False),
    Column("platform", String(32), nullable=False),
    Column("snapshot_date", Date, nullable=False),
    Column("average_rating", Float),
    Column("total_reviews", Integer),
    UniqueConstraint("restaurant_id", "platform", "snapshot_date", name="uq_snapshot_day"),
)

# --- Module 2: review growth -----------------------------------------------------
sms_consent = Table(
    "sms_consent", metadata,
    Column("id", String(32), primary_key=True, default=new_id),
    Column("restaurant_id", String(64), nullable=False),
    Column("phone", String(32), nullable=False),          # E.164
    Column("opted_in", Boolean, nullable=False),
    Column("source", Text),                               # "pos_checkbox", "web_form", "sms_stop"...
    Column("updated_at", Timestamp, nullable=False, default=utcnow),
    UniqueConstraint("restaurant_id", "phone", name="uq_consent_phone"),
)

# One row per SMS sent, and one row per printed QR asset (channel="qr").
# status: queued -> sent | failed | cancelled      (QR rows are always "active")
invites = Table(
    "invites", metadata,
    Column("id", String(32), primary_key=True, default=new_id),
    Column("restaurant_id", String(64), nullable=False),
    Column("token", String(32), nullable=False, unique=True),  # short link: /r/{token}
    Column("channel", String(16), nullable=False),        # sms | qr
    Column("source", String(32)),                         # table_tent | receipt | plain | sms
    Column("phone", String(32)),
    Column("guest_name", Text),
    Column("status", String(16), nullable=False, default="queued"),
    Column("send_at", Timestamp),                         # when the SMS becomes due
    Column("sent_at", Timestamp),
    Column("provider_message_id", Text),                  # Twilio SID
    Column("last_error", Text),
    Column("click_count", Integer, nullable=False, default=0),
    Column("first_clicked_at", Timestamp),
    Column("converted_review_id", String(32)),            # review attributed to this invite
    Column("converted_at", Timestamp),
    Column("created_at", Timestamp, nullable=False, default=utcnow),
    Index("ix_invites_due", "status", "send_at"),
)

# --- Module 3: phone calls handled by the voice agent ------------------------------
calls = Table(
    "calls", metadata,
    Column("id", String(32), primary_key=True, default=new_id),
    Column("restaurant_id", String(64), nullable=False),
    Column("conversation_id", Text, nullable=False, unique=True),  # ElevenLabs id
    Column("caller_phone", String(32)),
    Column("started_at", Timestamp),
    Column("duration_seconds", Integer),
    Column("transcript", JsonType, default=list),         # [{role, message, time_in_call_secs}]
    Column("summary", Text),
    Column("sentiment", String(16)),                      # positive | neutral | negative
    Column("unhappy", Boolean, nullable=False, default=False),
    Column("issues", JsonType, default=list),
    Column("follow_up", Text),                            # suggested manager action
    Column("alert_sent_at", Timestamp),                   # in-call "unhappy guest" alert
    Column("transcript_sent_at", Timestamp),              # post-call transcript follow-up
    Column("created_at", Timestamp, nullable=False, default=utcnow),
)

reservations = Table(
    "reservations", metadata,
    Column("id", String(32), primary_key=True, default=new_id),
    Column("restaurant_id", String(64), nullable=False),
    Column("conversation_id", Text),
    Column("guest_name", Text, nullable=False),
    Column("phone", String(32)),
    Column("party_size", Integer, nullable=False),
    Column("reservation_date", Date, nullable=False),
    Column("reservation_time", String(5), nullable=False),  # local HH:MM
    Column("notes", Text),
    Column("status", String(16), nullable=False, default="requested"),
    Column("created_at", Timestamp, nullable=False, default=utcnow),
)

# --- Module 4: daily summaries ---------------------------------------------------
summaries = Table(
    "summaries", metadata,
    Column("id", String(32), primary_key=True, default=new_id),
    Column("restaurant_id", String(64), nullable=False),
    Column("summary_date", Date, nullable=False),         # restaurant-local date
    Column("data", JsonType, nullable=False),             # the numbers + Claude's analysis
    Column("content_markdown", Text, nullable=False),
    Column("content_html", Text, nullable=False),
    Column("sent_at", Timestamp),
    Column("created_at", Timestamp, nullable=False, default=utcnow),
    UniqueConstraint("restaurant_id", "summary_date", name="uq_summary_day"),
)

# --- Cross-cutting: audit log + every outbound message ------------------------------
action_log = Table(
    "action_log", metadata,
    Column("id", String(32), primary_key=True, default=new_id),
    Column("restaurant_id", String(64)),
    Column("created_at", Timestamp, nullable=False, default=utcnow),
    Column("module", String(32), nullable=False),         # reviews | growth | voice | summary | admin
    Column("action", String(64), nullable=False),
    Column("entity_id", Text),
    Column("detail", JsonType, default=dict),
    Index("ix_action_log_restaurant_time", "restaurant_id", "created_at"),
)

# status: sent | failed | mock (test mode: recorded, never actually sent)
outbox = Table(
    "outbox", metadata,
    Column("id", String(32), primary_key=True, default=new_id),
    Column("restaurant_id", String(64)),
    Column("created_at", Timestamp, nullable=False, default=utcnow),
    Column("channel", String(16), nullable=False),        # sms | email | slack
    Column("recipient", Text),
    Column("purpose", String(48), nullable=False),        # review_invite | unhappy_guest_alert | ...
    Column("subject", Text),
    Column("body", Text, nullable=False),
    Column("status", String(16), nullable=False),
    Column("error", Text),
)


def _make_engine() -> Engine:
    url = settings.effective_database_url
    if url.startswith("sqlite"):
        kwargs: dict[str, Any] = {"connect_args": {"check_same_thread": False}}
        if ":memory:" in url:
            kwargs["poolclass"] = StaticPool  # one shared in-memory database
        return create_engine(url, **kwargs)
    # pool_pre_ping survives Supabase closing idle connections.
    return create_engine(url, pool_pre_ping=True, pool_size=5, max_overflow=5)


engine = _make_engine()


def init_db() -> None:
    """Create any missing tables. Safe to run repeatedly."""
    metadata.create_all(engine)


def log_action(
    module: str, action: str, *, restaurant_id: str | None = None,
    entity_id: str | None = None, **detail: Any,
) -> None:
    """Append to the audit log. Never raises: logging must not break the work."""
    log.info("[%s] %s restaurant=%s entity=%s %s", module, action, restaurant_id, entity_id, detail)
    try:
        with engine.begin() as conn:
            conn.execute(insert(action_log).values(
                id=new_id(), restaurant_id=restaurant_id, module=module, action=action,
                entity_id=entity_id, detail=detail, created_at=utcnow(),
            ))
    except Exception:  # noqa: BLE001
        log.exception("could not write action_log entry %s/%s", module, action)


def fetch_all(query) -> list[dict[str, Any]]:
    with engine.connect() as conn:
        return [dict(row._mapping) for row in conn.execute(query)]


def fetch_one(query) -> dict[str, Any] | None:
    with engine.connect() as conn:
        row = conn.execute(query).first()
        return dict(row._mapping) if row else None


def get_restaurant(restaurant_id: str) -> dict[str, Any] | None:
    return fetch_one(select(restaurants).where(restaurants.c.id == restaurant_id))


def active_restaurants() -> list[dict[str, Any]]:
    return fetch_all(select(restaurants).where(restaurants.c.active.is_(True)))
