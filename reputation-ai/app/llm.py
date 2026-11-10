"""Claude client wrapper.

One function matters: `structured(...)` sends a system prompt + user message
and returns a validated Pydantic object. The rest of the codebase never
touches the Anthropic SDK directly, which keeps test mode trivial: when
MOCK_LLM is on, a rule-based stand-in produces the same shapes offline.
"""
from __future__ import annotations

import logging
import re
from typing import Any, Callable, TypeVar

from pydantic import BaseModel

from app.config import settings
from app.prompts import CallAnalysis, ReviewDraft, SummaryAnalysis, Theme

log = logging.getLogger(__name__)
T = TypeVar("T", bound=BaseModel)

FALLBACK_BETA = "server-side-fallback-2026-07-01"


class LLMError(Exception):
    """Claude could not produce a usable answer (not worth an immediate retry)."""


class LLMTransientError(LLMError):
    """Rate limit / outage / network problem. Safe to try again next cycle."""


class LLMRefusal(LLMError):
    """Claude declined the request. Callers route the item to a human."""


_client = None


def _get_client():
    global _client
    if _client is None:
        import anthropic

        # Credentials come from ANTHROPIC_API_KEY. The SDK itself retries
        # 429 / 5xx / connection errors with backoff.
        _client = anthropic.Anthropic(max_retries=3, timeout=120.0)
    return _client


def structured(
    *, task: str, system: str, user: str, schema: type[T],
    mock: Callable[[], T] | None = None,
) -> T:
    """Ask Claude for a response matching `schema`.

    `task` is a label for logs. `mock` builds the offline answer in test mode.
    """
    if settings.mock_llm:
        if mock is None:
            raise LLMError(f"no mock available for task {task!r}")
        return mock()

    import anthropic

    client = _get_client()
    request: dict[str, Any] = {
        "model": settings.claude_model,
        "max_tokens": 16000,
        "system": system,
        "messages": [{"role": "user", "content": user}],
        "output_format": schema,
    }
    if settings.claude_effort:
        request["output_config"] = {"effort": settings.claude_effort}

    try:
        if settings.claude_fallbacks:
            # If a safety classifier declines the request, the API re-runs it
            # on a fallback model inside the same call.
            response = client.beta.messages.parse(
                betas=[FALLBACK_BETA], fallbacks=settings.claude_fallbacks, **request
            )
        else:
            response = client.messages.parse(**request)
    except (anthropic.RateLimitError, anthropic.APIConnectionError) as exc:
        raise LLMTransientError(f"{task}: {exc}") from exc
    except anthropic.APIStatusError as exc:
        if exc.status_code >= 500:
            raise LLMTransientError(f"{task}: Claude API {exc.status_code}") from exc
        # 400/401/403/404: configuration problem; retrying will not help.
        raise LLMError(f"{task}: Claude API {exc.status_code}: {exc.message}") from exc

    if response.stop_reason == "refusal":
        raise LLMRefusal(f"{task}: Claude declined to respond")
    if response.stop_reason == "max_tokens":
        raise LLMError(f"{task}: response was cut off at max_tokens")
    if response.parsed_output is None:
        raise LLMError(f"{task}: response did not match the expected schema")

    usage = response.usage
    log.info("claude task=%s model=%s input_tokens=%s output_tokens=%s",
             task, response.model, usage.input_tokens, usage.output_tokens)
    return response.parsed_output


# =============================================================================
# Offline stand-ins used when MOCK_LLM is on. Deliberately simple and
# deterministic: they exist to exercise the pipeline, not to write good copy.
# =============================================================================

_MOCK_FLAGS = {
    "food_safety": r"food poisoning|got sick|sick after|vomit|undercooked|raw chicken|hair in|allergic",
    "legal": r"lawyer|attorney|lawsuit|health department|\bsue\b",
    "harassment": r"harass|racist|discriminat|threaten",
}
_MOCK_THEMES = {
    "slow service": r"slow|wait(ed)?\b|forever|45 minutes",
    "friendly staff": r"friendly|attentive|welcoming|kind",
    "great food": r"delicious|amazing|incredible|best|perfect",
    "cold food": r"\bcold\b|lukewarm",
    "noise level": r"loud|noisy",
    "wrong order": r"wrong (order|dish)|forgot",
}


def mock_review_draft(restaurant: dict[str, Any], review: dict[str, Any]) -> ReviewDraft:
    text = (review.get("text") or "").lower()
    first_name = (review.get("reviewer_name") or "there").split()[0]
    reasons = [reason for reason, pattern in _MOCK_FLAGS.items() if re.search(pattern, text)]
    themes = [theme for theme, pattern in _MOCK_THEMES.items() if re.search(pattern, text)]
    rating = review["rating"]
    sign_off = f" {restaurant['sign_off']}" if restaurant.get("sign_off") else ""
    if rating >= 4 and not reasons:
        reply = (f"Thank you so much, {first_name}! We're delighted you enjoyed your visit to "
                 f"{restaurant['name']} and can't wait to welcome you back.{sign_off}")
        sentiment = "positive"
    else:
        phone = f" at {restaurant['phone']}" if restaurant.get("phone") else ""
        reply = (f"{first_name}, thank you for telling us, and we're sorry your visit fell short. "
                 f"We'd like to make this right. Please reach out to us directly{phone}.{sign_off}")
        sentiment = "negative" if rating <= 2 else "mixed"
    return ReviewDraft(
        reply=reply, flagged=bool(reasons), flag_reasons=reasons, sentiment=sentiment,
        themes=themes or ["general experience"],
        internal_note="[mock draft] Generated offline in test mode.",
    )


def mock_call_analysis(transcript: list[dict[str, Any]]) -> CallAnalysis:
    caller_text = " ".join(
        (turn.get("message") or "") for turn in transcript if turn.get("role") == "user"
    ).lower()
    unhappy = bool(re.search(
        r"disappoint|terrible|awful|unacceptable|refund|manager|never (coming|again)|sick|rude|cold",
        caller_text,
    ))
    return CallAnalysis(
        summary="[mock] " + (caller_text[:160] or "No caller speech recorded."),
        sentiment="negative" if unhappy else "neutral",
        unhappy=unhappy,
        issues=["Caller reported a poor experience"] if unhappy else [],
        follow_up="Call the guest back today." if unhappy else "",
    )


def mock_summary_analysis(data: dict[str, Any]) -> SummaryAnalysis:
    positive: dict[str, int] = {}
    negative: dict[str, int] = {}
    for review in data.get("reviews_past_week", []):
        bucket = positive if review["rating"] >= 4 else negative
        for theme in review.get("themes") or []:
            bucket[theme] = bucket.get(theme, 0) + 1

    def top(bucket: dict[str, int]) -> list[Theme]:
        ranked = sorted(bucket.items(), key=lambda item: -item[1])[:3]
        return [Theme(theme=name.capitalize(), detail=f"Mentioned in {count} review(s) this week.")
                for name, count in ranked]

    actions = []
    waiting = data.get("reply_queue", {}).get("waiting_for_approval", 0)
    if waiting:
        actions.append(f"Approve or edit the {waiting} review reply(ies) waiting in the queue.")
    for call in data.get("unhappy_calls", []):
        actions.append(f"Call back the guest from {call.get('caller_phone') or 'an unknown number'}.")
    if not actions:
        actions.append("No urgent follow-ups today.")
    new_count = data.get("new_reviews_since_last_summary", 0)
    return SummaryAnalysis(
        headline=f"[mock] {new_count} new review(s); {waiting} awaiting your approval.",
        positive_themes=top(positive), negative_themes=top(negative),
        recommended_actions=actions[:4],
    )
