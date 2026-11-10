"""Central configuration, loaded once from environment variables (.env supported).

Everything external (Claude, Google, Twilio, ElevenLabs, Slack, SMTP) is
configured here. Per-restaurant settings (brand voice, phone numbers, etc.)
live in the `restaurants` table instead, so the system is multi-tenant.
"""
from __future__ import annotations

import logging
import os
from dataclasses import dataclass, field

try:  # .env is optional; real deployments usually inject env vars directly.
    from dotenv import load_dotenv

    load_dotenv()
except ImportError:  # pragma: no cover
    pass


def _bool(name: str, default: bool = False) -> bool:
    raw = os.getenv(name)
    if raw is None or raw.strip() == "":
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def _int(name: str, default: int) -> int:
    raw = os.getenv(name, "").strip()
    return int(raw) if raw else default


def _str(name: str, default: str = "") -> str:
    return os.getenv(name, default).strip()


@dataclass(frozen=True)
class Settings:
    # --- Mode -------------------------------------------------------------
    # TEST_MODE swaps every external service for a mock: mock reviews, mock
    # Claude, and notifications/SMS written to the `outbox` table, not sent.
    test_mode: bool = field(default_factory=lambda: _bool("TEST_MODE"))
    # In test mode Claude is mocked too. Set MOCK_LLM=false (with an API key)
    # to try the real prompts against the mock reviews and calls.
    mock_llm: bool = field(default_factory=lambda: _bool("MOCK_LLM", _bool("TEST_MODE")))

    # --- Core -------------------------------------------------------------
    database_url: str = field(default_factory=lambda: _str("DATABASE_URL"))
    public_base_url: str = field(
        default_factory=lambda: _str("PUBLIC_BASE_URL", "http://localhost:8000").rstrip("/")
    )
    admin_token: str = field(default_factory=lambda: _str("ADMIN_TOKEN"))
    log_level: str = field(default_factory=lambda: _str("LOG_LEVEL", "INFO"))
    run_scheduler: bool = field(default_factory=lambda: _bool("RUN_SCHEDULER", True))

    # --- Claude -----------------------------------------------------------
    claude_model: str = field(default_factory=lambda: _str("CLAUDE_MODEL", "claude-opus-5-5"))
    # Thinking depth / token spend. Leave blank for models that predate `effort`.
    claude_effort: str = field(default_factory=lambda: _str("CLAUDE_EFFORT", "medium"))
    # "default" lets the API re-run a safety-declined request on a fallback
    # model. Leave blank to disable (required for models that don't support it).
    claude_fallbacks: str = field(default_factory=lambda: _str("CLAUDE_FALLBACKS", "default"))

    # --- Module 1: review response -----------------------------------------
    review_poll_minutes: int = field(default_factory=lambda: _int("REVIEW_POLL_MINUTES", 10))
    # Unreplied reviews older than this are imported but never answered, so
    # connecting a new location doesn't blast replies at years-old reviews.
    max_review_age_days: int = field(default_factory=lambda: _int("MAX_REVIEW_AGE_DAYS", 14))
    google_client_id: str = field(default_factory=lambda: _str("GOOGLE_CLIENT_ID"))
    google_client_secret: str = field(default_factory=lambda: _str("GOOGLE_CLIENT_SECRET"))
    google_refresh_token: str = field(default_factory=lambda: _str("GOOGLE_REFRESH_TOKEN"))

    # --- Module 2: review growth (Twilio) ----------------------------------
    twilio_account_sid: str = field(default_factory=lambda: _str("TWILIO_ACCOUNT_SID"))
    twilio_auth_token: str = field(default_factory=lambda: _str("TWILIO_AUTH_TOKEN"))
    twilio_from_number: str = field(default_factory=lambda: _str("TWILIO_FROM_NUMBER"))
    twilio_messaging_service_sid: str = field(
        default_factory=lambda: _str("TWILIO_MESSAGING_SERVICE_SID")
    )
    # Don't text the same guest more often than this.
    invite_cooldown_days: int = field(default_factory=lambda: _int("INVITE_COOLDOWN_DAYS", 30))
    # Review invites only go out inside this local-time window.
    sms_quiet_start_hour: int = field(default_factory=lambda: _int("SMS_SEND_START_HOUR", 9))
    sms_quiet_end_hour: int = field(default_factory=lambda: _int("SMS_SEND_END_HOUR", 20))

    # --- Module 3: guest recovery (ElevenLabs) -----------------------------
    elevenlabs_api_key: str = field(default_factory=lambda: _str("ELEVENLABS_API_KEY"))
    elevenlabs_voice_id: str = field(default_factory=lambda: _str("ELEVENLABS_VOICE_ID"))
    # Which LLM ElevenLabs runs the live call on. Blank = ElevenLabs default.
    elevenlabs_agent_llm: str = field(default_factory=lambda: _str("ELEVENLABS_AGENT_LLM"))
    # HMAC secret ElevenLabs signs post-call webhooks with.
    elevenlabs_webhook_secret: str = field(
        default_factory=lambda: _str("ELEVENLABS_WEBHOOK_SECRET")
    )
    # Shared secret the voice agent sends on every tool call to this server.
    voice_tool_secret: str = field(default_factory=lambda: _str("VOICE_TOOL_SECRET"))

    # --- Notifications ------------------------------------------------------
    smtp_host: str = field(default_factory=lambda: _str("SMTP_HOST"))
    smtp_port: int = field(default_factory=lambda: _int("SMTP_PORT", 587))
    smtp_username: str = field(default_factory=lambda: _str("SMTP_USERNAME"))
    smtp_password: str = field(default_factory=lambda: _str("SMTP_PASSWORD"))
    email_from: str = field(default_factory=lambda: _str("EMAIL_FROM"))

    @property
    def effective_database_url(self) -> str:
        """Postgres in production; a local SQLite file when nothing is set."""
        url = self.database_url
        if not url:
            return "sqlite:///./reputation_dev.db"
        # Supabase hands out postgres:// / postgresql:// URLs; route them to psycopg 3.
        if url.startswith("postgres://"):
            url = "postgresql://" + url[len("postgres://"):]
        if url.startswith("postgresql://"):
            url = "postgresql+psycopg://" + url[len("postgresql://"):]
        return url


settings = Settings()


def setup_logging() -> None:
    logging.basicConfig(
        level=getattr(logging, settings.log_level.upper(), logging.INFO),
        format="%(asctime)s %(levelname)-7s %(name)s | %(message)s",
    )
    # httpx logs every request at INFO, which would include webhook URLs.
    logging.getLogger("httpx").setLevel(logging.WARNING)
