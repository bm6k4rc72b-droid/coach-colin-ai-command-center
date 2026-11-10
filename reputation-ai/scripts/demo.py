"""End-to-end demo in test mode: no accounts, no API keys, nothing sent.

    python -m scripts.demo

Runs all four modules against mock reviews and mock phone calls using a
throwaway SQLite database, and prints what each one did, including every
message that *would* have gone to the manager and to guests.
"""
from __future__ import annotations

import os
import tempfile

# Must be set before the app is imported: config is read once at import time.
os.environ["TEST_MODE"] = "true"
os.environ.setdefault("DATABASE_URL", f"sqlite:///{tempfile.mkdtemp()}/demo.db")
os.environ.setdefault("PUBLIC_BASE_URL", "https://reviews.example.com")
os.environ.setdefault("LOG_LEVEL", "WARNING")

import json  # noqa: E402
from datetime import date, timedelta  # noqa: E402
from pathlib import Path  # noqa: E402

from sqlalchemy import select  # noqa: E402

from app.config import setup_logging  # noqa: E402
from app.db import fetch_all, init_db, invites, outbox, reviews  # noqa: E402
from app.demo_data import seed_demo_restaurant  # noqa: E402
from app.modules import daily_summary, guest_recovery, review_growth, review_response  # noqa: E402
from app.routes.public import VOICE_TOOLS  # noqa: E402

FIXTURES = Path(__file__).resolve().parent.parent / "app" / "fixtures"


def heading(text: str) -> None:
    print(f"\n{'=' * 78}\n{text}\n{'=' * 78}")


def load_mock_calls() -> list[dict]:
    """Mock calls use relative dates like "+3d" so they never go stale."""
    data = json.loads((FIXTURES / "mock_calls.json").read_text())["calls"]
    for call in data:
        for tool_call in call["tool_calls"]:
            raw = tool_call["body"].get("date", "")
            if raw.startswith("+"):
                tool_call["body"]["date"] = str(date.today() + timedelta(days=int(raw[1:-1])))
    return data


def main() -> None:
    setup_logging()
    init_db()
    restaurant = seed_demo_restaurant()
    rid = restaurant["id"]

    heading("MODULE 1: Review Response")
    print("Cycle:", review_response.run_cycle_for(restaurant))
    for r in fetch_all(select(reviews).order_by(reviews.c.review_created_at.desc())):
        print(f"\n  {r['rating']}★ {r['reviewer_name']:<16} -> {r['status'].upper()}"
              f"  {r['flag_reasons'] or ''}")
        if r["draft_reply"]:
            print(f"     reply: {r['draft_reply'][:110]}")
    pending = fetch_all(select(reviews).where(reviews.c.status == "pending_approval"))
    approved = review_response.approve(pending[0]["id"], reply_text=None, approved_by="demo manager")
    print(f"\n  Manager approved the reply to {approved['reviewer_name']} -> {approved['status'].upper()}")

    heading("MODULE 2: Review Growth")
    print("No opt-in on file :", review_growth.queue_sms_invite(restaurant, "512-555-0123"))
    print("Guest opted in    :", review_growth.queue_sms_invite(
        restaurant, "512-555-0123", guest_name="Jamie", consent_given=True,
        consent_source="pos_checkbox"))
    print("Same guest again  :", review_growth.queue_sms_invite(restaurant, "512-555-0123"))
    # Bypass the daytime-only sending window so the demo works at any hour.
    review_growth._within_sending_hours = lambda *_: True
    print("Texts sent        :", review_growth.send_due_invites())
    token = fetch_all(select(invites.c.token).where(invites.c.channel == "sms"))[0]["token"]
    print("Guest taps link   ->", review_growth.record_click(token))
    for source in ("table_tent", "receipt"):
        path = Path(tempfile.gettempdir()) / f"{rid}-{source}.png"
        path.write_bytes(review_growth.render_qr_asset(restaurant, source))
        print(f"QR asset          : {path}")
    print("Funnel            :", json.dumps(review_growth.stats(rid)))

    heading("MODULE 3: Guest Recovery (mock phone calls)")
    for call in load_mock_calls():
        print(f"\n  Call: {call['description']}")
        for tool_call in call["tool_calls"]:
            result = VOICE_TOOLS[tool_call["tool"]](restaurant, tool_call["body"])
            print(f"    agent tool {tool_call['tool']} -> {result[:90]}")
        outcome = guest_recovery.handle_post_call(call["post_call"], restaurant_id=rid)
        print(f"    post-call analysis -> unhappy={outcome['unhappy']}")

    heading("MODULE 4: Daily Summary")
    print(daily_summary.generate(restaurant, force=True)["content_markdown"])

    heading("OUTBOX: every message the system would have sent")
    for m in fetch_all(select(outbox).order_by(outbox.c.created_at)):
        first_line = (m["subject"] or m["body"]).splitlines()[0][:84]
        print(f"  [{m['channel']:<5}] {m['purpose']:<26} -> {m['recipient']:<30} {first_line}")


if __name__ == "__main__":
    main()
