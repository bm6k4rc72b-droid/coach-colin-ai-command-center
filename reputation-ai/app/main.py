"""FastAPI application entry point.

    uvicorn app.main:app --port 8000

In TEST_MODE the app seeds a demo restaurant and mocks every external
service, so the dashboard at /admin works with no accounts at all.
"""
from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.config import settings, setup_logging
from app.db import init_db
from app.routes import admin, public
from app.scheduler import build_scheduler

log = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(_: FastAPI):
    setup_logging()
    init_db()
    if settings.test_mode:
        from app.demo_data import seed_demo_restaurant

        seed_demo_restaurant()
        log.warning("TEST_MODE is on: reviews, Claude%s, SMS, email and Slack are mocked",
                    "" if settings.mock_llm else " (real)")
    if not settings.admin_token:
        log.warning("ADMIN_TOKEN is not set: the admin API and dashboard will refuse requests")

    scheduler = build_scheduler() if settings.run_scheduler else None
    if scheduler:
        scheduler.start()
    try:
        yield
    finally:
        if scheduler:
            scheduler.shutdown(wait=False)


app = FastAPI(title="Restaurant Reputation AI", version="1.0.0", lifespan=lifespan)
app.include_router(public.router)
app.include_router(admin.router)
