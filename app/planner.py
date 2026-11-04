"""Deterministic study plan: from `start` to the last deadline, one focus
per day. Score per deck = due_count + weak_topic_cards*2 + proximity,
proximity = 30 / (days_until_deadline + 1) for the deck's nearest deadline.
Ties break by deck slug (stable/deterministic).

Scoring inputs that don't depend on the day (weak-topic card counts,
each deck's sorted due-date list) are computed once up front; the
per-day due count is then a bisect instead of a full card scan, so the
plan costs O(days x decks x log n) instead of O(days x decks x cards).
Output is byte-identical to the naive version (pinned by tests)."""
from bisect import bisect_right
from datetime import date, timedelta
from . import db
from .diagnostics import weak_topics

def generate_plan(start):
    deadlines = db.list_deadlines()
    if not deadlines: return {"start": start, "days": [], "note": "No deadlines yet — add one to generate a plan."}
    start_d = date.fromisoformat(start)
    end_d = max(date.fromisoformat(d["date"]) for d in deadlines)
    if end_d < start_d: end_d = start_d
    cards = db.all_cards_with_state()
    weak = {w["topic"] for w in weak_topics(3)}
    decks = [d for d in db.list_decks() if d["slug"] != "inbox"]

    # Day-independent per-deck facts, computed once.
    deck_facts = {}
    for deck in decks:
        dcards = [c for c in cards if c["deck_slug"] == deck["slug"]]
        if not dcards: continue
        deck_facts[deck["slug"]] = {
            "deck": deck,
            "due_dates": sorted(c["due_date"] for c in dcards if c.get("due_date")),
            "always_due": sum(1 for c in dcards if not c.get("due_date")),
            "weak_n": sum(1 for c in dcards if c.get("topic") in weak),
        }
    parsed_deadlines = [(date.fromisoformat(dl["date"]), dl) for dl in deadlines]

    days = []
    d = start_d
    while d <= end_d:
        today = d.isoformat()
        nearest = {}
        for dl_date, dl in parsed_deadlines:
            du = (dl_date - d).days
            if dl["deck_slug"] and du >= 0:
                if dl["deck_slug"] not in nearest or du < nearest[dl["deck_slug"]][0]:
                    nearest[dl["deck_slug"]] = (du, dl)
        best = None
        for slug, facts in deck_facts.items():
            due = facts["always_due"] + bisect_right(facts["due_dates"], today)
            weak_n = facts["weak_n"]
            prox = 0.0; dl_title = None
            if slug in nearest:
                du, dl = nearest[slug]; prox = 30.0 / (du + 1); dl_title = dl["title"]
            score = round(due + 2 * weak_n + prox, 2)
            cand = {"deck_slug": slug, "deck_name": facts["deck"]["name"], "score": score,
                    "due": due, "weak_cards": weak_n, "deadline": dl_title}
            if best is None or score > best["score"] or (score == best["score"] and slug < best["deck_slug"]):
                best = cand
        days.append({"date": today, "focus": best,
                     "deadlines_today": [dl["title"] for _, dl in parsed_deadlines if dl["date"] == today],
                     "suggested_minutes": 25 if best else 0,
                     "action": (f"Feed + targeted review: {best['deck_name']} "
                                f"({best['due']} due, {best['weak_cards']} weak-topic cards)") if best else "Rest / free review"})
        d += timedelta(days=1)
    return {"start": start, "days": days}
