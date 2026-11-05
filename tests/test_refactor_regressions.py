"""Regression tests for the Nov 2 refactor pass: the interval-cap crash,
feed uniqueness after the O(n) partition rewrite, batched kv helpers,
diagnostics/planner consistency, and quiz topic filtering."""
from app import db, diagnostics, planner, srs
from app import quiz as quiz_mod


def test_interval_capped_under_repeated_grading():
    """The pre-refactor crash: same card graded 'knew' repeatedly in one
    session compounded the interval past the date range (57,298 days by
    the 10th grade, OverflowError on the 14th). Now capped at 365."""
    s = srs.new_state("2026-11-02")
    for _ in range(40):
        s = srs.apply_review(s, "knew", "2026-11-02")
        assert s["interval_days"] <= srs.MAX_INTERVAL_DAYS
    assert s["due_date"] <= "2027-11-02"


def test_api_repeated_same_card_review_never_500(client):
    card = client.get("/api/feed?limit=1").json()["cards"][0]
    for _ in range(20):
        r = client.post("/api/review", json={"card_id": card["id"], "grade": "knew"})
        assert r.status_code == 200
        assert r.json()["state"]["interval_days"] <= 365


def test_feed_card_ids_unique(client):
    cards = client.get("/api/feed?limit=40").json()["cards"]
    ids = [c["id"] for c in cards]
    assert len(ids) == len(set(ids))
    targeted = client.get("/api/feed?targeted=1&limit=20").json()["cards"]
    tids = [c["id"] for c in targeted]
    assert len(tids) == len(set(tids))


def test_kv_many_roundtrip():
    db.kv_set_many({"refactor_a": 1, "refactor_b": {"x": [1, 2]}})
    got = db.kv_get_many(["refactor_a", "refactor_b", "refactor_missing"])
    assert got == {"refactor_a": 1, "refactor_b": {"x": [1, 2]}}
    assert db.kv_get_many([]) == {}


def test_bonus_xp_included_in_total():
    before = db.total_xp()
    db.add_bonus_xp(15)
    assert db.total_xp() == before + 15


def test_quest_claim_pays_once():
    before = db.total_xp()
    assert db.claim_quest("2031-03-01", "focus", 25)
    assert not db.claim_quest("2031-03-01", "focus", 25)
    assert db.quest_claims("2031-03-01") == {"focus"}
    assert db.total_xp() == before + 25


def test_diagnostics_consistent_single_aggregation():
    stats = diagnostics.topic_stats()
    weak = diagnostics.weak_topics(3, stats)
    assert all(w["topic"] in stats for w in weak)
    assert all(w["accuracy"] == stats[w["topic"]]["accuracy"] for w in weak)
    weak_topics = {w["topic"] for w in weak}
    for c in diagnostics.targeted_cards(10):
        assert c["topic"] in weak_topics


def test_plan_no_deadlines_note(monkeypatch):
    monkeypatch.setattr(db, "list_deadlines", lambda: [])
    p = planner.generate_plan("2026-11-02")
    assert p["days"] == [] and "note" in p


def test_quiz_topic_filter():
    cards = db.all_cards_with_state()
    topic = cards[0]["topic"]
    pool = [c for c in cards if c["topic"] == topic]
    qs = quiz_mod.build_questions(cards, count=4, topic=topic, seed=3)
    assert len(qs) == min(4, len(pool))
    assert all(q["topic"] == topic for q in qs)
