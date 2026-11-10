"""Shared request dependencies: admin authentication and restaurant lookup."""
from __future__ import annotations

import base64
import secrets
from typing import Any

from fastapi import Header, HTTPException

from app.config import settings
from app.db import get_restaurant


def require_admin(
    x_admin_token: str | None = Header(None),
    authorization: str | None = Header(None),
) -> None:
    """Accepts the admin token as an `X-Admin-Token` header (scripts, POS
    integrations) or as the password of HTTP Basic auth (so the dashboard
    works in a browser; any username)."""
    expected = settings.admin_token
    if not expected:
        # Fail closed: an unset token must not mean an open admin API.
        raise HTTPException(503, "ADMIN_TOKEN is not configured on the server")
    supplied = x_admin_token
    if supplied is None and authorization and authorization.lower().startswith("basic "):
        try:
            supplied = base64.b64decode(authorization[6:]).decode().split(":", 1)[1]
        except (ValueError, IndexError):
            supplied = None
    if supplied is None or not secrets.compare_digest(supplied.encode(), expected.encode()):
        raise HTTPException(401, "admin token required",
                            headers={"WWW-Authenticate": 'Basic realm="reputation-ai"'})


def restaurant_or_404(restaurant_id: str) -> dict[str, Any]:
    restaurant = get_restaurant(restaurant_id)
    if restaurant is None:
        raise HTTPException(404, f"no restaurant with id {restaurant_id!r}")
    return restaurant
