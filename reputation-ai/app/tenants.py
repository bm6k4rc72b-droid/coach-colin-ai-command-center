"""Create and update restaurants (brand settings). Shared by the admin API,
the dashboard and the CLI so validation lives in one place."""
from __future__ import annotations

import re
from typing import Any
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from pydantic import BaseModel, Field, field_validator
from sqlalchemy import insert, update

from app.db import engine, get_restaurant, log_action, restaurants, utcnow

SLUG = re.compile(r"^[a-z0-9][a-z0-9-]{1,62}$")
SECRET_FIELDS = ("slack_webhook_url",)


class RestaurantSettings(BaseModel):
    """Every editable field. Omitted fields are left unchanged; an empty
    string clears a text field."""

    name: str | None = Field(None, min_length=1, max_length=120)
    phone: str | None = None
    address: str | None = None
    hours: str | None = None
    parking: str | None = None
    menu_highlights: str | None = None
    brand_voice: str | None = None
    extra_info: str | None = None
    sign_off: str | None = None
    brand_color: str | None = None
    manager_name: str | None = None
    manager_phone: str | None = None
    manager_email: str | None = None
    slack_webhook_url: str | None = None
    google_account_id: str | None = None
    google_location_id: str | None = None
    google_place_id: str | None = None
    timezone: str | None = None
    summary_time: str | None = None
    auto_post_min_rating: int | None = Field(None, ge=4, le=6)
    active: bool | None = None

    @field_validator("timezone")
    @classmethod
    def _valid_timezone(cls, value: str | None) -> str | None:
        if value is not None:
            try:
                ZoneInfo(value)
            except (ZoneInfoNotFoundError, ValueError) as exc:
                raise ValueError(f"unknown timezone {value!r} (use e.g. America/Chicago)") from exc
        return value

    @field_validator("summary_time")
    @classmethod
    def _valid_time(cls, value: str | None) -> str | None:
        if value is not None and not re.fullmatch(r"([01]\d|2[0-3]):[0-5]\d", value):
            raise ValueError("summary_time must be 24-hour HH:MM, e.g. 07:30")
        return value

    @field_validator("brand_color")
    @classmethod
    def _valid_color(cls, value: str | None) -> str | None:
        if value and not re.fullmatch(r"#[0-9a-fA-F]{6}", value):
            raise ValueError("brand_color must look like #1F3A2E")
        return value

    @field_validator("slack_webhook_url")
    @classmethod
    def _valid_webhook(cls, value: str | None) -> str | None:
        if value and not value.startswith("https://hooks.slack.com/"):
            raise ValueError("slack_webhook_url must be a https://hooks.slack.com/ URL")
        return value


def upsert_restaurant(restaurant_id: str, changes: RestaurantSettings) -> dict[str, Any]:
    """Create the restaurant if new, otherwise apply only the provided fields.

    `auto_post_min_rating` is limited to 4-6 on purpose: 1-3 star reviews
    always go to a human. Set it to 6 to require approval for every reply.
    """
    if not SLUG.fullmatch(restaurant_id):
        raise ValueError("restaurant id must be a lowercase slug like 'olive-and-ember'")
    values = changes.model_dump(exclude_unset=True, exclude_none=True)
    # Empty strings clear a field (stored as NULL), except required ones.
    values = {key: (value if value != "" else None) for key, value in values.items()}
    for required in ("name", "timezone", "summary_time"):
        if required in values and values[required] is None:
            del values[required]

    existing = get_restaurant(restaurant_id)
    with engine.begin() as conn:
        if existing is None:
            if not values.get("name"):
                raise ValueError("a new restaurant needs at least a name")
            conn.execute(insert(restaurants).values(id=restaurant_id, **values))
        elif values:
            conn.execute(update(restaurants).where(restaurants.c.id == restaurant_id).values(
                updated_at=utcnow(), **values))
    log_action("admin", "restaurant_created" if existing is None else "restaurant_updated",
               restaurant_id=restaurant_id,
               fields=sorted(key for key in values if key not in SECRET_FIELDS))
    return get_restaurant(restaurant_id)


def public_view(restaurant: dict[str, Any]) -> dict[str, Any]:
    """Restaurant row for API responses, with credentials masked."""
    view = dict(restaurant)
    for field in SECRET_FIELDS:
        view[field] = "(set)" if view.get(field) else None
    return view
