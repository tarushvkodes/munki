"""Idempotent seeding: decks/cards from app/seed_data/*.json + seeded
deadlines + an empty Inbox deck. Never overwrites user progress: cards are
keyed by (deck, normalized front); state rows are created only if missing."""
import json, os
from . import config, db
from .srs import new_state

SEED_DEADLINES = [
    ("CNIT 182 — SQL deliverable", "2026-11-04", "cnit182"),
    ("CNIT 182 — ERD deliverable", "2026-11-06", "cnit182"),
    ("MA 162 — Exam 3 (Lessons 21–27)", "2026-11-09", "ma162-exam3"),
    ("CNIT 182 — Database Implementation + Security Plan", "2026-11-13", "cnit182"),
    ("CNIT 182 — Exam III + Lab Exam II", "2026-11-18", "cnit182"),
    ("CNIT 182 — Milestone III", "2026-11-20", "cnit182"),
    ("PHYS 172 — Exam 3", "2026-11-30", "phys172"),
]

def seed(today="2026-11-02"):
    c = db._conn()  # shared connection — seed never closes it
    for fname in sorted(os.listdir(config.SEED_DIR)):
        if not fname.endswith(".json"): continue
        data = json.load(open(os.path.join(config.SEED_DIR, fname)))
        c.execute("INSERT OR IGNORE INTO decks (slug, name, course, description) VALUES (?,?,?,?)",
                  (data["slug"], data["name"], data.get("course"), data.get("description")))
        deck_id = c.execute("SELECT id FROM decks WHERE slug=?", (data["slug"],)).fetchone()["id"]
        for card in data["cards"]:
            c.execute("INSERT OR IGNORE INTO cards (deck_id, front, back, topic, source, front_key) VALUES (?,?,?,?, 'seed', ?)",
                      (deck_id, card["front"], card["back"], card.get("topic", "General"), db.front_key(card["front"])))
    c.execute("INSERT OR IGNORE INTO decks (slug, name, course, description) VALUES ('inbox','Inbox — from your notes','','Cards you approve from Notes → Cards land here.')")
    # state for any card missing one
    rows = c.execute("SELECT id FROM cards WHERE id NOT IN (SELECT card_id FROM card_state)").fetchall()
    for r in rows:
        st = new_state(today)
        c.execute("INSERT INTO card_state (card_id, ease, interval_days, repetitions, lapses, due_date) VALUES (?,?,?,?,?,?)",
                  (r["id"], st["ease"], st["interval_days"], st["repetitions"], st["lapses"], st["due_date"]))
    existing = {(r["title"], r["date"]) for r in c.execute("SELECT title, date FROM deadlines WHERE seeded=1").fetchall()}
    for title, day, slug in SEED_DEADLINES:
        if (title, day) not in existing:
            c.execute("INSERT INTO deadlines (title, date, deck_slug, seeded) VALUES (?,?,?,1)", (title, day, slug))
    c.commit()
