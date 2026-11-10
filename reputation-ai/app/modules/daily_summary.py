"""Module 4: Daily One-Page Summary.

Every morning at each restaurant's `summary_time` (in its own timezone) the
manager gets one page by email and/or Slack:

  * current Google rating and the change vs. a week ago
  * new reviews since the last summary
  * replies still waiting for approval
  * top 3 positive and negative themes guests mentioned
  * recommended actions for today

Division of labour: this code computes every number straight from the
database; Claude only supplies the judgment (headline, themes, actions).
The model never gets the chance to misreport a rating or a count.
"""
from __future__ import annotations

import html
import logging
from datetime import date, datetime, timedelta
from typing import Any
from zoneinfo import ZoneInfo

from sqlalchemy import and_, insert, select, update

from app import llm, prompts
from app.db import (
    as_utc, calls, engine, fetch_all, fetch_one, log_action, new_id, rating_snapshots,
    reservations, reviews, summaries, utcnow,
)
from app.modules import review_growth, review_response
from app.notify import send_email, send_slack

log = logging.getLogger(__name__)


# =============================================================================
# Gather the facts
# =============================================================================

def _rating_and_change(restaurant_id: str) -> tuple[float | None, float | None, int | None]:
    """(current rating, change vs. ~7 days ago, total review count)."""
    snapshots = fetch_all(select(rating_snapshots).where(
        rating_snapshots.c.restaurant_id == restaurant_id
    ).order_by(rating_snapshots.c.snapshot_date.desc()))
    # Prefer Google when several platforms are tracked.
    google = [s for s in snapshots if s["platform"] == "google"] or snapshots
    if not google:
        return None, None, None
    latest = google[0]
    week_ago = latest["snapshot_date"] - timedelta(days=7)
    # The most recent snapshot that is at least a week old (within reason).
    older = [s for s in google
             if week_ago - timedelta(days=3) <= s["snapshot_date"] <= week_ago]
    change = (round(latest["average_rating"] - older[0]["average_rating"], 2)
              if older and older[0]["average_rating"] is not None else None)
    return latest["average_rating"], change, latest["total_reviews"]


def collect_data(restaurant: dict[str, Any]) -> dict[str, Any]:
    rid = restaurant["id"]
    now = utcnow()
    last = fetch_one(select(summaries.c.created_at).where(
        summaries.c.restaurant_id == rid).order_by(summaries.c.created_at.desc()))
    since = as_utc(last["created_at"]) if last else now - timedelta(hours=24)
    # Never look back further than 3 days, even after an outage.
    since = max(since, now - timedelta(days=3))

    week = fetch_all(select(reviews).where(and_(
        reviews.c.restaurant_id == rid,
        reviews.c.review_created_at >= now - timedelta(days=7),
    )).order_by(reviews.c.review_created_at.desc()))
    new_reviews = [r for r in week if as_utc(r["review_created_at"]) >= since]

    rating, change, total = _rating_and_change(rid)
    unhappy_calls = fetch_all(select(calls).where(and_(
        calls.c.restaurant_id == rid, calls.c.unhappy.is_(True), calls.c.created_at >= since)))
    new_reservations = fetch_all(select(reservations.c.id).where(and_(
        reservations.c.restaurant_id == rid, reservations.c.created_at >= since)))

    return {
        "restaurant": restaurant["name"],
        "google_rating": rating,
        "rating_change_vs_last_week": change,
        "total_reviews": total,
        "new_reviews_since_last_summary": len(new_reviews),
        "new_reviews_by_stars": {
            str(stars): sum(r["rating"] == stars for r in new_reviews) for stars in (5, 4, 3, 2, 1)
        },
        "reply_queue": {
            "waiting_for_approval": review_response.pending_count(rid),
            "oldest_waiting_days": review_response.oldest_pending_age_days(rid),
            "auto_posted_since_last_summary": sum(
                r["status"] == "posted" and r["approved_by"] == "auto" for r in new_reviews),
        },
        "reviews_past_week": [
            {
                "rating": r["rating"], "platform": r["platform"],
                "reviewer": r["reviewer_name"], "text": (r["text"] or "")[:800],
                "themes": r["themes"] or [], "flag_reasons": r["flag_reasons"] or [],
                "reply_status": r["status"],
                "days_ago": (now - as_utc(r["review_created_at"])).days,
            }
            for r in week
        ],
        "unhappy_calls": [
            {"caller_phone": c["caller_phone"], "summary": c["summary"],
             "issues": c["issues"] or [], "suggested_follow_up": c["follow_up"]}
            for c in unhappy_calls
        ],
        "new_reservation_requests": len(new_reservations),
        "review_invites_last_30_days": review_growth.stats(rid)["sms"],
    }


# =============================================================================
# Render the page
# =============================================================================

def _rating_line(data: dict[str, Any]) -> str:
    rating, change = data["google_rating"], data["rating_change_vs_last_week"]
    if rating is None:
        return "not available yet"
    if change is None:
        trend = "no comparison yet (needs a week of history)"
    elif change > 0:
        trend = f"▲ up {change:.2f} vs last week"
    elif change < 0:
        trend = f"▼ down {abs(change):.2f} vs last week"
    else:
        trend = "unchanged vs last week"
    total = f" · {data['total_reviews']} reviews" if data.get("total_reviews") else ""
    return f"{rating:.1f} ★ ({trend}){total}"


def render_markdown(restaurant: dict[str, Any], day: date, data: dict[str, Any],
                    analysis: prompts.SummaryAnalysis) -> str:
    queue = data["reply_queue"]
    stars = ", ".join(f"{count}×{s}★" for s, count in data["new_reviews_by_stars"].items() if count)
    waiting = str(queue["waiting_for_approval"])
    if queue["oldest_waiting_days"]:
        waiting += f" (oldest: {queue['oldest_waiting_days']} day(s))"

    def themes(items: list[prompts.Theme]) -> str:
        if not items:
            return "- Not enough feedback this week.\n"
        return "".join(f"- **{t.theme}**: {t.detail}\n" for t in items[:3])

    actions = "".join(f"{i}. {action}\n" for i, action in
                      enumerate(analysis.recommended_actions[:4], start=1))
    return (
        f"# {restaurant['name']}: Morning Reputation Brief\n"
        f"{day:%A, %B %-d, %Y}\n\n"
        f"**{analysis.headline}**\n\n"
        f"## At a glance\n"
        f"- Google rating: {_rating_line(data)}\n"
        f"- New reviews: {data['new_reviews_since_last_summary']}"
        f"{f' ({stars})' if stars else ''}\n"
        f"- Replies waiting for your approval: {waiting}\n"
        f"- Unhappy callers: {len(data['unhappy_calls'])}\n\n"
        f"## What guests loved\n{themes(analysis.positive_themes)}\n"
        f"## What needs attention\n{themes(analysis.negative_themes)}\n"
        f"## Recommended actions\n{actions or '1. Nothing urgent today.'}"
    )


def render_html(markdown: str) -> str:
    """Tiny converter for exactly the markdown produced above (email body)."""
    out, in_list = [], None
    for raw in markdown.splitlines():
        line = html.escape(raw)
        while "**" in line and line.count("**") >= 2:
            line = line.replace("**", "<strong>", 1).replace("**", "</strong>", 1)
        kind = "ul" if raw.startswith("- ") else "ol" if raw[:2].rstrip(".").isdigit() else None
        if kind != in_list:
            if in_list:
                out.append(f"</{in_list}>")
            if kind:
                out.append(f"<{kind}>")
            in_list = kind
        if kind:
            out.append(f"<li>{line.split(' ', 1)[1]}</li>")
        elif raw.startswith("# "):
            out.append(f"<h1 style='font-size:20px;margin:0'>{line[2:]}</h1>")
        elif raw.startswith("## "):
            out.append(f"<h2 style='font-size:15px;margin:18px 0 4px'>{line[3:]}</h2>")
        elif raw.strip():
            out.append(f"<p style='margin:6px 0'>{line}</p>")
    if in_list:
        out.append(f"</{in_list}>")
    return ("<div style='font-family:-apple-system,Segoe UI,sans-serif;font-size:14px;"
            "line-height:1.45;max-width:620px;color:#222'>" + "".join(out) + "</div>")


# =============================================================================
# Generate + send
# =============================================================================

def generate(restaurant: dict[str, Any], *, send: bool = True,
             force: bool = False) -> dict[str, Any] | None:
    """Build today's summary for one restaurant. Returns the summary row, or
    None if today's was already generated (pass force=True to redo it)."""
    rid = restaurant["id"]
    day = datetime.now(ZoneInfo(restaurant["timezone"])).date()
    match = and_(summaries.c.restaurant_id == rid, summaries.c.summary_date == day)
    if fetch_one(select(summaries.c.id).where(match)) and not force:
        return None

    data = collect_data(restaurant)
    try:
        analysis = llm.structured(
            task="daily_summary",
            system=prompts.DAILY_SUMMARY_SYSTEM_PROMPT.format(name=restaurant["name"]),
            user=prompts.daily_summary_user(data),
            schema=prompts.SummaryAnalysis,
            mock=lambda: llm.mock_summary_analysis(data),
        )
    except llm.LLMTransientError:
        raise  # the scheduler tries again in a few minutes
    except llm.LLMError as exc:
        # Still send the numbers; they are the part that cannot wait.
        log.error("summary analysis failed for %s: %s", rid, exc)
        analysis = prompts.SummaryAnalysis(
            headline="Theme analysis was unavailable this morning; the numbers below are current.",
            positive_themes=[], negative_themes=[],
            recommended_actions=["Check the dashboard for reviews waiting on approval."])

    markdown = render_markdown(restaurant, day, data, analysis)
    values = {"data": {**data, "analysis": analysis.model_dump()},
              "content_markdown": markdown, "content_html": render_html(markdown)}
    with engine.begin() as conn:
        updated = conn.execute(update(summaries).where(match).values(**values))
        if updated.rowcount == 0:
            conn.execute(insert(summaries).values(
                id=new_id(), restaurant_id=rid, summary_date=day, created_at=utcnow(), **values))
    log_action("summary", "generated", restaurant_id=rid, entity_id=str(day))

    if send:
        delivered = 0
        subject = f"{restaurant['name']}: morning reputation brief, {day:%b %-d}"
        if restaurant.get("manager_email"):
            delivered += send_email(restaurant["manager_email"], subject, markdown,
                                    html=values["content_html"], restaurant_id=rid,
                                    purpose="daily_summary")
        if restaurant.get("slack_webhook_url"):
            # Slack uses single asterisks for bold and has no headings.
            slack_text = markdown.replace("**", "*").replace("## ", "").replace("# ", "")
            delivered += send_slack(restaurant["slack_webhook_url"], slack_text,
                                    restaurant_id=rid, purpose="daily_summary")
        if delivered:
            with engine.begin() as conn:
                conn.execute(update(summaries).where(match).values(sent_at=utcnow()))
        log_action("summary", "sent" if delivered else "not_delivered", restaurant_id=rid,
                   entity_id=str(day), channels=delivered)
    return fetch_one(select(summaries).where(match))


def run_due() -> None:
    """Scheduler entry point (every 5 minutes): send any summary that is due.

    A summary is due once local time has passed `summary_time` and none
    exists for today, so a restart or a transient failure only delays it.
    """
    from app.db import active_restaurants

    for restaurant in active_restaurants():
        try:
            local = datetime.now(ZoneInfo(restaurant["timezone"]))
            if local.strftime("%H:%M") >= restaurant["summary_time"]:
                generate(restaurant)
        except Exception:  # noqa: BLE001
            log.exception("daily summary failed for %s", restaurant["id"])
