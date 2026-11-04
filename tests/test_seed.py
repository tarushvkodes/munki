import json, os, re
from app import config, db, seed as seed_mod

def _all_seed_cards():
    out = []
    for f in os.listdir(config.SEED_DIR):
        if f.endswith(".json"):
            out += json.load(open(os.path.join(config.SEED_DIR, f)))["cards"]
    return out

def test_seed_sizes():
    decks = {d["slug"]: d for d in db.list_decks()}
    counts = {s: len(db.cards_for_deck(decks[s]["id"])) for s in decks}
    assert counts["ma162-exam3"] == 40
    assert counts["phys172"] == 25
    assert counts["cnit182"] == 25
    assert "inbox" in counts  # user cards may already live here (shared test DB)

def test_no_duplicate_cards_anywhere():
    fronts = [re.sub(r"\s+", " ", c["front"].strip().lower()) for c in _all_seed_cards()]
    assert len(fronts) == len(set(fronts)) == 90

def test_seed_idempotent(client):
    before = sum(len(db.cards_for_deck(d["id"])) for d in db.list_decks())
    seed_mod.seed(); seed_mod.seed()
    after = sum(len(db.cards_for_deck(d["id"])) for d in db.list_decks())
    assert before == after

def test_seed_does_not_overwrite_progress(client):
    card = db.all_cards_with_state()[0]
    from app import srs
    db.save_state(card["id"], srs.apply_review(
        {"ease": 2.5, "interval_days": 0, "repetitions": 0, "lapses": 0, "due_date": "2026-11-02"},
        "knew", "2026-11-02"))
    seed_mod.seed()
    after = db.get_card(card["id"])
    assert after["repetitions"] == 1 and after["interval_days"] == 1

def test_seeded_deadlines_present():
    titles = {d["title"] for d in db.list_deadlines()}
    assert "MA 162 — Exam 3 (Lessons 21–27)" in titles
    assert "PHYS 172 — Exam 3" in titles
    assert len([d for d in db.list_deadlines() if d["seeded"]]) == 7
