import base64
from datetime import timedelta

from sqlalchemy import insert, select

from app.db import engine, fetch_all, new_id, outbox, rating_snapshots, summaries, utcnow
from app.modules import daily_summary, guest_recovery, review_response
from tests.conftest import ADMIN


def test_daily_summary_has_every_required_section(restaurant):
    review_response.run_cycle_for(restaurant)
    guest_recovery.handle_unhappy_flag(restaurant, {
        "issue_summary": "Cold food", "severity": "medium", "conversation_id": "c1"})
    row = daily_summary.generate(restaurant)
    page = row["content_markdown"]
    assert "Google rating: 4.4 ★ (▲ up 0.10 vs last week)" in page   # 4.3 seeded a week ago
    assert "New reviews: 4" in page                  # the four written in the last 24 hours
    assert "Replies waiting for your approval: 3" in page
    assert "Unhappy callers: 1" in page
    for section in ("## What guests loved", "## What needs attention", "## Recommended actions"):
        assert section in page
    assert row["data"]["reply_queue"]["waiting_for_approval"] == 3
    assert {m["channel"] for m in fetch_all(select(outbox).where(
        outbox.c.purpose == "daily_summary"))} == {"email", "slack"}
    assert "<h1" in row["content_html"] and "<script" not in row["content_html"]


def test_summary_is_generated_once_per_day(restaurant):
    assert daily_summary.generate(restaurant) is not None
    assert daily_summary.generate(restaurant) is None
    assert daily_summary.generate(restaurant, force=True) is not None
    assert len(fetch_all(select(summaries))) == 1


def test_rating_drop_is_reported(restaurant):
    with engine.begin() as conn:
        conn.execute(insert(rating_snapshots).values(
            id=new_id(), restaurant_id=restaurant["id"], platform="mock",
            snapshot_date=utcnow().date(), average_rating=4.1, total_reviews=320))
    assert "▼ down 0.20 vs last week" in daily_summary.generate(restaurant)["content_markdown"]


def test_summary_still_goes_out_if_claude_fails(restaurant, monkeypatch):
    from app import llm

    def broken(**_):
        raise llm.LLMError("bad request")
    monkeypatch.setattr(llm, "structured", broken)
    page = daily_summary.generate(restaurant)["content_markdown"]
    assert "Google rating" in page and "Theme analysis was unavailable" in page


# --- HTTP API ---------------------------------------------------------------------

def test_admin_api_requires_the_token(client):
    assert client.get("/api/restaurants").status_code == 401
    assert client.get("/api/restaurants", headers={"X-Admin-Token": "wrong"}).status_code == 401
    assert client.get("/api/restaurants", headers=ADMIN).status_code == 200
    basic = base64.b64encode(b"anyone:test-admin-token").decode()
    assert client.get("/admin", headers={"Authorization": f"Basic {basic}"}).status_code == 200


def test_update_brand_voice_name_and_phone(client):
    response = client.put("/api/restaurants/olive-and-ember", headers=ADMIN, json={
        "name": "Olive and Ember Kitchen", "phone": "(512) 555-0199",
        "brand_voice": "Dry, witty, brief."})
    body = response.json()
    assert response.status_code == 200
    assert (body["name"], body["phone"], body["brand_voice"]) == (
        "Olive and Ember Kitchen", "(512) 555-0199", "Dry, witty, brief.")
    assert body["manager_email"] == "maria@oliveandember.example"   # untouched
    assert body["slack_webhook_url"] == "(set)"                      # never echoed back


def test_settings_validation(client):
    bad = client.put("/api/restaurants/olive-and-ember", headers=ADMIN,
                     json={"timezone": "Mars/Olympus"})
    assert bad.status_code == 422
    # 1-3 star reviews can never be configured to auto-post.
    assert client.put("/api/restaurants/olive-and-ember", headers=ADMIN,
                      json={"auto_post_min_rating": 2}).status_code == 422
    assert client.put("/api/restaurants/new-place", headers=ADMIN,
                      json={"phone": "1"}).status_code == 422       # a new restaurant needs a name


def test_approval_queue_over_http(client):
    assert client.post("/api/restaurants/olive-and-ember/reviews/poll", headers=ADMIN).json()["queued"] == 3
    queue = client.get("/api/restaurants/olive-and-ember/reviews?status=pending_approval",
                       headers=ADMIN).json()
    assert len(queue) == 3
    posted = client.post(f"/api/reviews/{queue[0]['id']}/approve", headers=ADMIN,
                         json={"reply": "We're sorry, and we'd love to make it right."}).json()
    assert posted["status"] == "posted"
    again = client.post(f"/api/reviews/{queue[0]['id']}/approve", headers=ADMIN, json={})
    assert again.status_code == 409


def test_review_link_redirect_and_qr_endpoint(client):
    png = client.get("/api/restaurants/olive-and-ember/qr/table_tent.png", headers=ADMIN)
    assert png.status_code == 200 and png.headers["content-type"] == "image/png"
    from app.modules import review_growth
    from app.db import get_restaurant
    token = review_growth.qr_token(get_restaurant("olive-and-ember"), "table_tent")
    redirect = client.get(f"/r/{token}", follow_redirects=False)
    assert redirect.status_code == 302
    assert redirect.headers["location"].startswith("https://search.google.com/local/writereview")
    assert client.get("/r/unknown", follow_redirects=False).status_code == 404


def test_voice_tool_webhook_needs_the_shared_secret(client):
    url = "/webhooks/voice/olive-and-ember/flag-unhappy-guest"
    body = {"issue_summary": "Rude host", "severity": "high", "conversation_id": "c9"}
    assert client.post(url, json=body).status_code == 401
    ok = client.post(url, json=body, headers={"X-Voice-Secret": "test-voice-secret"})
    assert ok.status_code == 200 and "manager" in ok.json()["result"]
    assert client.post("/webhooks/voice/olive-and-ember/nope", json={},
                       headers={"X-Voice-Secret": "test-voice-secret"}).status_code == 404


def test_post_call_webhook_rejects_unsigned_requests(client):
    response = client.post("/webhooks/elevenlabs/post-call", json={"type": "post_call_transcription"})
    assert response.status_code == 401
