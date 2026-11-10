"""Mock review platform for TEST_MODE: serves reviews from a fixture file and
remembers "posted" replies in memory, so the whole pipeline runs offline."""
from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from app.platforms.base import FetchResult, Review, ReviewPlatform

FIXTURE = Path(__file__).resolve().parent.parent / "fixtures" / "mock_reviews.json"


class MockPlatform(ReviewPlatform):
    name = "mock"
    can_post_replies = True

    def __init__(self) -> None:
        self.posted: dict[str, str] = {}          # external_id -> reply text
        self.fail_next_post = False               # tests flip this to simulate an outage

    def is_configured(self, restaurant: dict[str, Any]) -> bool:
        return True

    def fetch_reviews(self, restaurant: dict[str, Any], *, since: datetime,
                      known_ids: set[str]) -> FetchResult:
        now = datetime.now(timezone.utc)
        data = json.loads(FIXTURE.read_text())
        reviews = [
            Review(
                external_id=item["id"], reviewer_name=item["reviewer_name"],
                rating=item["rating"], text=item["text"],
                created_at=now - timedelta(hours=item["hours_ago"]),
                already_replied=item.get("already_replied", False),
            )
            for item in data["reviews"]
        ]
        return FetchResult(
            reviews=[r for r in reviews if r.external_id not in known_ids and r.created_at >= since],
            average_rating=data["average_rating"], total_reviews=data["total_reviews"],
        )

    def post_reply(self, restaurant: dict[str, Any], external_id: str, text: str) -> None:
        if self.fail_next_post:
            self.fail_next_post = False
            raise RuntimeError("simulated platform outage")
        self.posted[external_id] = text
