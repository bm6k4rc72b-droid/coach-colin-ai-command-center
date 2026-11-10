"""Registry of review platforms."""
from __future__ import annotations

from typing import Any

from app.config import settings
from app.platforms.base import FetchResult, Review, ReviewPlatform
from app.platforms.google import GoogleBusinessProfile
from app.platforms.mock import MockPlatform
from app.platforms.stubs import TripAdvisorPlatform, YelpPlatform

# One shared instance each (the Google one caches its access token).
PLATFORMS: dict[str, ReviewPlatform] = {
    platform.name: platform
    for platform in (GoogleBusinessProfile(), YelpPlatform(), TripAdvisorPlatform(), MockPlatform())
}


def platforms_for(restaurant: dict[str, Any]) -> list[ReviewPlatform]:
    """The platforms to poll for this restaurant."""
    if settings.test_mode:
        return [PLATFORMS["mock"]]
    return [p for name, p in PLATFORMS.items() if name != "mock" and p.is_configured(restaurant)]


__all__ = ["PLATFORMS", "FetchResult", "Review", "ReviewPlatform", "platforms_for"]
