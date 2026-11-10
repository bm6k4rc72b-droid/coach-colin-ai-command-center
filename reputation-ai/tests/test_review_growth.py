import io

import pytest
from PIL import Image
from sqlalchemy import select, update

from app.db import engine, fetch_all, fetch_one, invites, outbox, utcnow
from app.modules import review_growth, review_response


@pytest.fixture(autouse=True)
def always_daytime(monkeypatch):
    monkeypatch.setattr(review_growth, "_within_sending_hours", lambda *_: True)


def sent_texts():
    return fetch_all(select(outbox).where(outbox.c.purpose == "review_invite"))


def test_no_text_without_a_recorded_opt_in(restaurant):
    result = review_growth.queue_sms_invite(restaurant, "(512) 555-0123")
    assert result == {"status": "skipped", "reason": "no_opt_in"}
    assert review_growth.send_due_invites() == 0 and sent_texts() == []


def test_opted_in_guest_gets_the_invite_with_a_tracked_link(restaurant):
    result = review_growth.queue_sms_invite(restaurant, "512-555-0123", consent_given=True)
    assert result["status"] == "queued"
    assert review_growth.send_due_invites() == 1
    [text] = sent_texts()
    assert text["recipient"] == "+15125550123"
    assert text["body"].startswith("Thanks for dining at Olive & Ember! If you enjoyed it, would "
                                   "you mind leaving a quick Google review? "
                                   "https://reviews.example.com/r/")
    assert "STOP" in text["body"]
    assert review_growth.send_due_invites() == 0  # never sent twice


def test_delayed_invite_waits_and_respects_sending_hours(restaurant, monkeypatch):
    review_growth.queue_sms_invite(restaurant, "5125550123", consent_given=True, delay_minutes=90)
    assert review_growth.send_due_invites() == 0
    with engine.begin() as conn:
        conn.execute(update(invites).values(send_at=utcnow()))
    monkeypatch.setattr(review_growth, "_within_sending_hours", lambda *_: False)
    assert review_growth.send_due_invites() == 0   # due, but it is night
    monkeypatch.setattr(review_growth, "_within_sending_hours", lambda *_: True)
    assert review_growth.send_due_invites() == 1


def test_same_guest_is_not_texted_again_within_the_cooldown(restaurant):
    review_growth.queue_sms_invite(restaurant, "5125550123", consent_given=True)
    assert review_growth.queue_sms_invite(restaurant, "5125550123")["reason"] == "recently_invited"


def test_stop_reply_cancels_queued_invites_and_blocks_future_ones(restaurant):
    review_growth.queue_sms_invite(restaurant, "5125550123", consent_given=True, delay_minutes=60)
    review_growth.handle_inbound_sms("+15125550100", "+15125550123", " stop ")
    assert fetch_one(select(invites.c.status))["status"] == "cancelled"
    assert review_growth.queue_sms_invite(restaurant, "5125550123")["reason"] == "no_opt_in"


def test_click_tracking_and_review_attribution(restaurant):
    review_growth.queue_sms_invite(restaurant, "5125550123", guest_name="Priya",
                                   consent_given=True)
    review_growth.send_due_invites()
    token = fetch_one(select(invites.c.token))["token"]
    assert "writereview?placeid=" in review_growth.record_click(token)
    # Priya's review is 3 hours old in the fixture; backdate the click to before it.
    with engine.begin() as conn:
        conn.execute(update(invites).values(
            first_clicked_at=utcnow() - __import__("datetime").timedelta(hours=5)))
    review_response.run_cycle_for(restaurant)   # imports a review by "Priya Raman"
    stats = review_growth.stats(restaurant["id"])
    assert stats["sms"] == {"queued": 0, "sent": 1, "failed": 0, "clicked": 1,
                            "click_rate": 1.0, "attributed_reviews": 1}


def test_unknown_link_token(restaurant):
    assert review_growth.record_click("nope") is None


@pytest.mark.parametrize("raw,expected", [
    ("(512) 555-0123", "+15125550123"), ("1-512-555-0123", "+15125550123"),
    ("+44 20 7946 0958", "+442079460958"),
])
def test_phone_normalization(raw, expected):
    assert review_growth.normalize_phone(raw) == expected


def test_bad_phone_number_is_rejected():
    with pytest.raises(review_growth.GrowthError):
        review_growth.normalize_phone("555-0123")


@pytest.mark.parametrize("source,size", [
    ("table_tent", (1200, 1800)), ("receipt", (576, 640)), ("plain", (1000, 1000))])
def test_qr_assets_render_and_keep_a_stable_link(restaurant, source, size):
    first = review_growth.render_qr_asset(restaurant, source)
    assert Image.open(io.BytesIO(first)).size == size
    token = review_growth.qr_token(restaurant, source)
    review_growth.render_qr_asset(restaurant, source)
    assert review_growth.qr_token(restaurant, source) == token  # reprints keep the same code
    review_growth.record_click(token)
    assert review_growth.stats(restaurant["id"])["qr_scans_all_time"][source] == 1
