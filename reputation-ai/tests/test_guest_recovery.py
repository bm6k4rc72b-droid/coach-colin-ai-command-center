import hashlib
import hmac
import json
import time
from datetime import date, timedelta
from pathlib import Path

from sqlalchemy import select

from app.db import calls, fetch_all, fetch_one, outbox, reservations
from app.modules import guest_recovery
from app.voice.agent_config import build_agent_config

CALLS = json.loads((Path(__file__).parent.parent / "app/fixtures/mock_calls.json").read_text())["calls"]
ROUTINE, FLAGGED_LIVE, MISSED_LIVE = CALLS


def messages(purpose):
    return fetch_all(select(outbox).where(outbox.c.purpose == purpose))


def test_unhappy_guest_alerts_the_manager_during_the_call(restaurant):
    result = guest_recovery.handle_unhappy_flag(restaurant, FLAGGED_LIVE["tool_calls"][0]["body"])
    assert "manager" in result
    alerts = messages("unhappy_guest_alert")
    assert {m["channel"] for m in alerts} == {"sms", "slack", "email"}
    sms = next(m for m in alerts if m["channel"] == "sms")
    assert sms["recipient"] == restaurant["manager_phone"]
    assert "Robert Hale" in sms["body"] and "5125550199" in sms["body"]
    assert fetch_one(select(calls))["unhappy"] is True


def test_post_call_sends_transcript_once_and_no_second_text(restaurant):
    guest_recovery.handle_unhappy_flag(restaurant, FLAGGED_LIVE["tool_calls"][0]["body"])
    for _ in range(2):  # ElevenLabs may deliver the webhook twice
        guest_recovery.handle_post_call(FLAGGED_LIVE["post_call"], restaurant_id=restaurant["id"])
    follow_ups = messages("unhappy_guest_transcript")
    assert {m["channel"] for m in follow_ups} == {"slack", "email"}   # no duplicate SMS
    assert "My steak was cold" in follow_ups[0]["body"]
    assert len(fetch_all(select(calls))) == 1


def test_post_call_analysis_catches_an_unhappy_guest_the_agent_missed(restaurant):
    result = guest_recovery.handle_post_call(MISSED_LIVE["post_call"], restaurant_id=restaurant["id"])
    assert result["unhappy"] is True
    assert {m["channel"] for m in messages("unhappy_guest_transcript")} == {"sms", "slack", "email"}


def test_routine_call_alerts_nobody(restaurant):
    result = guest_recovery.handle_post_call(ROUTINE["post_call"], restaurant_id=restaurant["id"])
    assert result["unhappy"] is False
    assert fetch_all(select(outbox)) == []


def test_reservation_is_saved_and_sent_to_the_manager(restaurant):
    day = date.today() + timedelta(days=3)
    body = {**ROUTINE["tool_calls"][0]["body"], "date": str(day)}
    result = guest_recovery.handle_reservation(restaurant, body)
    assert "Helen Park" in result and "7:30 PM" in result
    saved = fetch_one(select(reservations))
    assert (saved["party_size"], saved["reservation_date"], saved["reservation_time"]) == (4, day, "19:30")
    assert messages("reservation_request")


def test_reservation_problems_are_explained_to_the_agent(restaurant):
    base = {"guest_name": "Helen", "party_size": 4, "time": "19:30"}
    past = guest_recovery.handle_reservation(restaurant, {**base, "date": "2020-01-01"})
    assert "in the past" in past
    big = guest_recovery.handle_reservation(
        restaurant, {**base, "party_size": 30, "date": str(date.today())})
    assert "take a message" in big
    assert fetch_all(select(reservations)) == []


def test_webhook_signature_verification():
    body = b'{"type":"post_call_transcription"}'
    now = str(int(time.time()))

    def sign(timestamp, secret="test-webhook-secret"):
        digest = hmac.new(secret.encode(), f"{timestamp}.".encode() + body, hashlib.sha256)
        return f"t={timestamp},v0={digest.hexdigest()}"

    assert guest_recovery.verify_elevenlabs_signature(body, sign(now))
    assert not guest_recovery.verify_elevenlabs_signature(body, sign(now, secret="wrong"))
    assert not guest_recovery.verify_elevenlabs_signature(body + b" ", sign(now))
    assert not guest_recovery.verify_elevenlabs_signature(body, sign(str(int(now) - 7200)))  # stale
    assert not guest_recovery.verify_elevenlabs_signature(body, None)


def test_agent_config_contains_prompt_tools_and_can_redact_the_secret(restaurant):
    config = build_agent_config(restaurant, redact_secret=True)
    prompt = config["conversation_config"]["agent"]["prompt"]
    assert "Olive & Ember" in prompt["prompt"] and "{{system__time_utc}}" in prompt["prompt"]
    assert "{name}" not in prompt["prompt"]
    tools = {tool["name"]: tool for tool in prompt["tools"]}
    assert set(tools) == {"create_reservation", "flag_unhappy_guest", "take_message", "end_call"}
    flag = tools["flag_unhappy_guest"]["api_schema"]
    assert flag["url"] == "https://reviews.example.com/webhooks/voice/olive-and-ember/flag-unhappy-guest"
    assert "test-voice-secret" not in json.dumps(config)
    assert "test-voice-secret" in json.dumps(build_agent_config(restaurant))
