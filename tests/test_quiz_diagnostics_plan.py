from app import db, diagnostics, planner, quiz as quiz_mod

def _cards():
    return db.all_cards_with_state()

def test_quiz_distractor_integrity():
    cards = _cards()
    qs = quiz_mod.build_questions(cards, count=8, seed=42)
    assert len(qs) == 8
    by_id = {c["id"]: c for c in cards}
    for q in qs:
        assert len(q["options"]) == 4 and len(set(q["options"])) == 4
        assert by_id[q["card_id"]]["back"] in q["options"]
        assert quiz_mod.grade(by_id[q["card_id"]], by_id[q["card_id"]]["back"])["correct"]
        wrong = [o for o in q["options"] if o != by_id[q["card_id"]]["back"]][0]
        assert not quiz_mod.grade(by_id[q["card_id"]], wrong)["correct"]

def test_quiz_deterministic_same_seed():
    a = quiz_mod.build_questions(_cards(), count=5, seed=7)
    b = quiz_mod.build_questions(_cards(), count=5, seed=7)
    assert a == b

def test_diagnostics_ranking(client):
    cards = _cards()
    phys = [c for c in cards if c["deck_slug"] == "phys172"][:4]
    ma = [c for c in cards if c["deck_slug"] == "ma162-exam3"][:4]
    for c in phys:
        db.record_quiz_attempt("2026-11-02", c["id"], False, c["topic"])
    for c in ma:
        db.record_quiz_attempt("2026-11-02", c["id"], True, c["topic"])
    weak = diagnostics.weak_topics()
    assert weak and weak[0]["accuracy"] == 0.0
    assert all(w["topic"] in {c["topic"] for c in phys} for w in weak if w["accuracy"] == 0.0)
    targeted = diagnostics.targeted_cards(5)
    assert targeted and targeted[0]["topic"] in {c["topic"] for c in phys}

def test_plan_deterministic_and_covers_range():
    p1 = planner.generate_plan("2026-11-02")
    p2 = planner.generate_plan("2026-11-02")
    assert p1 == p2
    assert p1["days"][0]["date"] == "2026-11-02"
    assert p1["days"][-1]["date"] == "2026-11-30"
    assert all(d["focus"] for d in p1["days"])

def test_plan_deadline_weighting():
    p = planner.generate_plan("2026-11-02")
    nov8 = [d for d in p["days"] if d["date"] == "2026-11-08"][0]
    assert nov8["focus"]["deck_slug"] == "ma162-exam3"  # exam next day dominates
    nov9 = [d for d in p["days"] if d["date"] == "2026-11-09"][0]
    assert "MA 162 — Exam 3 (Lessons 21–27)" in nov9["deadlines_today"]
