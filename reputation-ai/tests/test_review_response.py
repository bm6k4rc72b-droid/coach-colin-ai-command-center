from sqlalchemy import select

from app import llm
from app.db import fetch_all, outbox, reviews
from app.modules import review_response
from app.platforms import PLATFORMS


def by_reviewer():
    return {r["reviewer_name"]: r for r in fetch_all(select(reviews))}


def test_positive_reviews_auto_post_and_low_stars_wait_for_a_human(restaurant):
    stats = review_response.run_cycle_for(restaurant)
    rows = by_reviewer()

    # 4-5 star, nothing sensitive -> posted with no human involved
    for name in ("Priya Raman", "Marcus Lee", "Sam"):
        assert rows[name]["status"] == "posted"
        assert rows[name]["approved_by"] == "auto"
    # 1-3 star -> approval queue, nothing posted
    assert rows["Dana Whitfield"]["status"] == "pending_approval"
    assert "low_rating" in rows["Dana Whitfield"]["flag_reasons"]
    assert rows["Tom Becker"]["status"] == "pending_approval"
    assert {"food_safety", "legal"} <= set(rows["Tom Becker"]["flag_reasons"])
    assert set(PLATFORMS["mock"].posted) == {"mock-001", "mock-002", "mock-006"}
    assert stats == {"imported": 8, "drafted": 6, "queued": 3, "posted": 3}


def test_five_star_review_mentioning_an_allergy_is_never_auto_posted(restaurant):
    review_response.run_cycle_for(restaurant)
    alicia = by_reviewer()["Alicia Gomez"]
    assert alicia["rating"] == 5
    assert alicia["status"] == "pending_approval"
    assert alicia["flagged"] and "food_safety" in alicia["flag_reasons"]


def test_keyword_safety_net_flags_even_if_the_model_does_not(restaurant, monkeypatch):
    # Simulate the model missing the problem entirely.
    monkeypatch.setattr(llm, "mock_review_draft", lambda restaurant, review: llm.ReviewDraft(
        reply="Thanks so much!", flagged=False, flag_reasons=[], sentiment="positive",
        themes=["food"], internal_note=""))
    review_response.run_cycle_for(restaurant)
    assert by_reviewer()["Alicia Gomez"]["status"] == "pending_approval"
    assert "mock-005" not in PLATFORMS["mock"].posted


def test_old_and_already_answered_reviews_are_skipped(restaurant):
    review_response.run_cycle_for(restaurant)
    rows = by_reviewer()
    assert rows["Old Timer"]["status"] == "skipped"      # older than MAX_REVIEW_AGE_DAYS
    assert rows["Renee Okafor"]["status"] == "skipped"   # owner already replied


def test_polling_twice_does_not_duplicate_or_repost(restaurant):
    review_response.run_cycle_for(restaurant)
    again = review_response.run_cycle_for(restaurant)
    assert again == {"imported": 0, "drafted": 0, "queued": 0, "posted": 0}
    assert len(fetch_all(select(reviews))) == 8


def test_manager_is_notified_with_sms_only_for_urgent_flags(restaurant):
    review_response.run_cycle_for(restaurant)
    messages = fetch_all(select(outbox).where(outbox.c.purpose == "review_approval_needed"))
    assert {m["channel"] for m in messages} == {"sms", "slack", "email"}
    sms = next(m for m in messages if m["channel"] == "sms")
    assert "food_safety" in sms["body"] and "Nothing has been posted" in sms["body"]


def test_approve_with_edit_posts_the_edited_text(restaurant):
    review_response.run_cycle_for(restaurant)
    dana = by_reviewer()["Dana Whitfield"]
    result = review_response.approve(dana["id"], reply_text="Dana, we're so sorry.",
                                     approved_by="Maria")
    assert result["status"] == "posted" and result["approved_by"] == "Maria"
    assert PLATFORMS["mock"].posted["mock-003"] == "Dana, we're so sorry."


def test_reject_never_posts(restaurant):
    review_response.run_cycle_for(restaurant)
    tom = by_reviewer()["Tom Becker"]
    assert review_response.reject(tom["id"], rejected_by="Maria")["status"] == "rejected"
    assert "mock-004" not in PLATFORMS["mock"].posted


def test_redraft_with_guidance_returns_to_the_queue(restaurant):
    review_response.run_cycle_for(restaurant)
    dana = by_reviewer()["Dana Whitfield"]
    result = review_response.regenerate(dana["id"], guidance="shorter")
    assert result["status"] == "pending_approval"
    assert "manager_requested_redraft" in result["flag_reasons"]


def test_failed_post_is_retried_on_the_next_cycle(restaurant):
    PLATFORMS["mock"].fail_next_post = True
    first = review_response.run_cycle_for(restaurant)
    assert first["posted"] == 2
    assert sum(r["status"] == "approved" for r in fetch_all(select(reviews))) == 1
    second = review_response.run_cycle_for(restaurant)
    assert second["posted"] == 1
    assert len(PLATFORMS["mock"].posted) == 3


def test_claude_refusal_or_repeated_failure_goes_to_a_human(restaurant, monkeypatch):
    def refuse(**_):
        raise llm.LLMRefusal("declined")
    monkeypatch.setattr(llm, "structured", refuse)
    review_response.run_cycle_for(restaurant)
    priya = by_reviewer()["Priya Raman"]
    assert priya["status"] == "pending_approval" and priya["flag_reasons"] == ["ai_declined"]
    assert PLATFORMS["mock"].posted == {}


def test_transient_claude_errors_leave_the_review_for_the_next_cycle(restaurant, monkeypatch):
    def outage(**_):
        raise llm.LLMTransientError("overloaded")
    monkeypatch.setattr(llm, "structured", outage)
    review_response.run_cycle_for(restaurant)
    assert by_reviewer()["Priya Raman"]["status"] == "new"
    for _ in range(2):
        review_response.run_cycle_for(restaurant)
    # After MAX_DRAFT_ATTEMPTS a person is asked to write the reply.
    assert by_reviewer()["Priya Raman"]["flag_reasons"] == ["draft_failed"]
