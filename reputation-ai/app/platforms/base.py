"""The contract every review platform implements.

To add Yelp or TripAdvisor: subclass `ReviewPlatform`, implement the two
methods, and register the class in `app/platforms/__init__.py`. Nothing in
the review-response module is Google-specific.
"""
from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any


@dataclass
class Review:
    """A review normalized across platforms."""

    external_id: str            # the platform's own id for the review
    reviewer_name: str
    rating: int                 # 1-5
    text: str
    created_at: datetime        # timezone-aware UTC
    already_replied: bool = False


@dataclass
class FetchResult:
    reviews: list[Review] = field(default_factory=list)
    average_rating: float | None = None   # the platform's current overall rating
    total_reviews: int | None = None


class ReviewPlatform(ABC):
    name: str
    # False for platforms with no reply API: replies are still drafted and
    # approved here, then a person pastes them into the platform by hand.
    can_post_replies: bool = True

    @abstractmethod
    def is_configured(self, restaurant: dict[str, Any]) -> bool:
        """Whether this restaurant has the ids/credentials this platform needs."""

    @abstractmethod
    def fetch_reviews(self, restaurant: dict[str, Any], *, since: datetime,
                      known_ids: set[str]) -> FetchResult:
        """Return reviews newer than `since` that are not in `known_ids`."""

    @abstractmethod
    def post_reply(self, restaurant: dict[str, Any], external_id: str, text: str) -> None:
        """Publish `text` as the owner reply. Raise on failure."""
