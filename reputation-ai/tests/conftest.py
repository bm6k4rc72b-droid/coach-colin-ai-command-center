"""Test setup: everything runs in TEST_MODE against a throwaway SQLite file."""
import os
import tempfile

# Config is read once at import time, so set the environment before importing the app.
os.environ.update({
    "TEST_MODE": "true",
    "MOCK_LLM": "true",
    "DATABASE_URL": f"sqlite:///{tempfile.mkdtemp()}/test.db",
    "PUBLIC_BASE_URL": "https://reviews.example.com",
    "ADMIN_TOKEN": "test-admin-token",
    "VOICE_TOOL_SECRET": "test-voice-secret",
    "ELEVENLABS_WEBHOOK_SECRET": "test-webhook-secret",
    "RUN_SCHEDULER": "false",
})

import pytest  # noqa: E402
from sqlalchemy import delete  # noqa: E402

from app.db import engine, init_db, metadata  # noqa: E402
from app.demo_data import seed_demo_restaurant  # noqa: E402
from app.platforms import PLATFORMS  # noqa: E402


@pytest.fixture(autouse=True)
def clean_db():
    """Start every test from an empty database with just the demo restaurant."""
    init_db()
    with engine.begin() as conn:
        for table in reversed(metadata.sorted_tables):
            conn.execute(delete(table))
    PLATFORMS["mock"].posted.clear()
    PLATFORMS["mock"].fail_next_post = False
    yield


@pytest.fixture
def restaurant():
    return seed_demo_restaurant()


@pytest.fixture
def client():
    from fastapi.testclient import TestClient

    from app.main import app

    with TestClient(app) as test_client:
        yield test_client


ADMIN = {"X-Admin-Token": "test-admin-token"}
