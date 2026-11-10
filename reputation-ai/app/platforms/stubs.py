"""Placeholders for the next platforms.

Neither Yelp nor TripAdvisor offers a self-serve API for posting owner
replies (both require partner-level access), so these are set up as
"draft here, post by hand" platforms: `can_post_replies = False` sends every
drafted reply to the approval queue, where the manager copies it across.

To finish one: implement `is_configured` and `fetch_reviews` against the
platform's reviews API (Yelp Fusion / TripAdvisor Content API), add any ids
it needs as columns on `restaurants`, and add it to PLATFORMS in __init__.py.
"""
from __future__ import annotations

from datetime import datetime
from typing import Any

from app.platforms.base import FetchResult, ReviewPlatform


class _ManualReplyPlatform(ReviewPlatform):
    can_post_replies = False

    def is_configured(self, restaurant: dict[str, Any]) -> bool:
        return False  # not wired up yet

    def fetch_reviews(self, restaurant: dict[str, Any], *, since: datetime,
                      known_ids: set[str]) -> FetchResult:
        raise NotImplementedError(f"{self.name} review fetching is not implemented yet")

    def post_reply(self, restaurant: dict[str, Any], external_id: str, text: str) -> None:
        raise NotImplementedError(f"{self.name} has no reply API; post the reply manually")


class YelpPlatform(_ManualReplyPlatform):
    name = "yelp"


class TripAdvisorPlatform(_ManualReplyPlatform):
    name = "tripadvisor"
