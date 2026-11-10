"""Small, explicit retry helper (exponential backoff + jitter).

Used for the plain-HTTP integrations (Google, Twilio, ElevenLabs, Slack).
The Anthropic SDK already retries 429/5xx/network errors on its own.
"""
from __future__ import annotations

import logging
import random
import time
from typing import Callable, TypeVar

import httpx

log = logging.getLogger(__name__)
T = TypeVar("T")


class PermanentError(Exception):
    """An error that retrying will not fix (bad credentials, bad request...)."""


def is_transient_http(exc: Exception) -> bool:
    """Network problems, timeouts, 408/429 and 5xx are worth retrying."""
    if isinstance(exc, httpx.HTTPStatusError):
        code = exc.response.status_code
        return code in (408, 429) or code >= 500
    return isinstance(exc, httpx.TransportError)


def with_retry(
    fn: Callable[[], T],
    *,
    label: str,
    attempts: int = 3,
    base_delay: float = 1.0,
    is_transient: Callable[[Exception], bool] = is_transient_http,
    sleep: Callable[[float], None] = time.sleep,
) -> T:
    """Call `fn`, retrying transient failures. Re-raises the last error."""
    for attempt in range(1, attempts + 1):
        try:
            return fn()
        except Exception as exc:  # noqa: BLE001 - classified just below
            if attempt == attempts or not is_transient(exc):
                raise
            delay = base_delay * (2 ** (attempt - 1)) + random.uniform(0, 0.5)
            log.warning("%s failed (attempt %d/%d): %s; retrying in %.1fs",
                        label, attempt, attempts, exc, delay)
            sleep(delay)
    raise AssertionError("unreachable")  # pragma: no cover
