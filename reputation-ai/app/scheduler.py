"""Background jobs (APScheduler, in-process).

  reviews  - every REVIEW_POLL_MINUTES : fetch, draft, post
  invites  - every minute             : send queued review-invite texts
  summary  - every 5 minutes          : send any daily summary that is due

All jobs are idempotent and each restaurant is isolated, so a failure is
logged and simply retried on the next tick. Run the scheduler in exactly ONE
process: if you scale the web app to several workers, set RUN_SCHEDULER=false
on all but one (or run `python -m scripts.cli worker` as a separate service).
"""
from __future__ import annotations

from apscheduler.schedulers.background import BackgroundScheduler

from app.config import settings
from app.modules import daily_summary, review_growth, review_response


def build_scheduler() -> BackgroundScheduler:
    scheduler = BackgroundScheduler(timezone="UTC", job_defaults={
        "coalesce": True,        # after a stall, run once rather than once per missed tick
        "max_instances": 1,      # never overlap a job with itself
        "misfire_grace_time": 300,
    })
    scheduler.add_job(review_response.run_cycle, "interval", id="reviews",
                      minutes=max(1, settings.review_poll_minutes))
    scheduler.add_job(review_growth.send_due_invites, "interval", id="invites", minutes=1)
    scheduler.add_job(daily_summary.run_due, "interval", id="summary", minutes=5)
    return scheduler
