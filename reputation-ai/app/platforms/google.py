"""Google Business Profile reviews.

Uses the My Business v4 reviews endpoints with an OAuth refresh token for a
Google account that manages the locations (scope `business.manage`):

  GET  /v4/accounts/{account}/locations/{location}/reviews
  PUT  /v4/accounts/{account}/locations/{location}/reviews/{review}/reply

One OAuth credential (from env) can serve many restaurants as long as that
Google account is a manager on each location; the account and location ids
are stored per restaurant.
"""
from __future__ import annotations

import logging
import time
from datetime import datetime, timezone
from typing import Any

import httpx

from app.config import settings
from app.platforms.base import FetchResult, Review, ReviewPlatform
from app.retry import PermanentError, with_retry

log = logging.getLogger(__name__)

API_BASE = "https://mybusiness.googleapis.com/v4"
TOKEN_URL = "https://oauth2.googleapis.com/token"
STAR_RATINGS = {"ONE": 1, "TWO": 2, "THREE": 3, "FOUR": 4, "FIVE": 5}
MAX_PAGES = 10  # 50 reviews per page; plenty between two polls


def _parse_time(value: str) -> datetime:
    # e.g. "2026-03-01T18:22:05.123456Z"
    return datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(timezone.utc)


class GoogleBusinessProfile(ReviewPlatform):
    name = "google"
    can_post_replies = True

    def __init__(self) -> None:
        self._access_token: str | None = None
        self._expires_at = 0.0

    def is_configured(self, restaurant: dict[str, Any]) -> bool:
        return bool(
            settings.google_client_id and settings.google_client_secret
            and settings.google_refresh_token
            and restaurant.get("google_account_id") and restaurant.get("google_location_id")
        )

    # --- auth -----------------------------------------------------------------
    def _token(self) -> str:
        """Exchange the long-lived refresh token for a short-lived access token."""
        if self._access_token and time.time() < self._expires_at - 60:
            return self._access_token

        def _refresh() -> dict[str, Any]:
            response = httpx.post(TOKEN_URL, timeout=20, data={
                "client_id": settings.google_client_id,
                "client_secret": settings.google_client_secret,
                "refresh_token": settings.google_refresh_token,
                "grant_type": "refresh_token",
            })
            if response.status_code in (400, 401):
                raise PermanentError(
                    "Google rejected the refresh token; re-run the OAuth consent step "
                    f"(see README). Response: {response.text[:200]}"
                )
            response.raise_for_status()
            return response.json()

        payload = with_retry(_refresh, label="google token refresh")
        self._access_token = payload["access_token"]
        self._expires_at = time.time() + int(payload.get("expires_in", 3600))
        return self._access_token

    def _request(self, method: str, url: str, **kwargs: Any) -> dict[str, Any]:
        def _call() -> dict[str, Any]:
            response = httpx.request(
                method, url, timeout=30,
                headers={"Authorization": f"Bearer {self._token()}"}, **kwargs,
            )
            if response.status_code == 401:
                self._access_token = None  # force a refresh on the retry
            if response.status_code in (400, 403, 404):
                raise PermanentError(f"Google API {response.status_code}: {response.text[:300]}")
            response.raise_for_status()
            return response.json() if response.content else {}

        return with_retry(_call, label=f"google {method}")

    def _location_path(self, restaurant: dict[str, Any]) -> str:
        return (f"{API_BASE}/accounts/{restaurant['google_account_id']}"
                f"/locations/{restaurant['google_location_id']}")

    # --- ReviewPlatform --------------------------------------------------------
    def fetch_reviews(self, restaurant: dict[str, Any], *, since: datetime,
                      known_ids: set[str]) -> FetchResult:
        result = FetchResult()
        page_token: str | None = None
        for _ in range(MAX_PAGES):
            params = {"pageSize": 50, "orderBy": "updateTime desc"}
            if page_token:
                params["pageToken"] = page_token
            page = self._request("GET", f"{self._location_path(restaurant)}/reviews", params=params)
            if result.average_rating is None:
                result.average_rating = page.get("averageRating")
                result.total_reviews = page.get("totalReviewCount")

            reached_old_reviews = False
            for item in page.get("reviews", []):
                created = _parse_time(item["createTime"])
                if _parse_time(item.get("updateTime", item["createTime"])) < since:
                    reached_old_reviews = True  # newest-first, so everything after is older
                    break
                if item["reviewId"] in known_ids:
                    continue
                result.reviews.append(Review(
                    external_id=item["reviewId"],
                    reviewer_name=item.get("reviewer", {}).get("displayName", "A guest"),
                    rating=STAR_RATINGS.get(item.get("starRating", ""), 0),
                    text=item.get("comment", ""),
                    created_at=created,
                    already_replied="reviewReply" in item,
                ))
            page_token = page.get("nextPageToken")
            if reached_old_reviews or not page_token:
                break
        # Reviews without a usable star rating cannot be routed safely; drop them.
        result.reviews = [review for review in result.reviews if 1 <= review.rating <= 5]
        return result

    def post_reply(self, restaurant: dict[str, Any], external_id: str, text: str) -> None:
        self._request("PUT", f"{self._location_path(restaurant)}/reviews/{external_id}/reply",
                      json={"comment": text})
