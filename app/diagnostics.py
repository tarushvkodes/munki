"""Per-topic diagnostics from reviews + quiz attempts -> ranked weak topics.

topic_stats() is the single aggregation pass; weak_topics() and
targeted_cards() accept a precomputed stats dict so one /api/diagnostics
request aggregates once instead of three times (the original code
recomputed the full scan inside every helper)."""
from . import db

def topic_stats():
    cards = {c["id"]: c for c in db.all_cards_with_state()}
    stats = {}
    def bump(topic, correct):
        s = stats.setdefault(topic, {"topic": topic, "attempts": 0, "correct": 0})
        s["attempts"] += 1; s["correct"] += int(correct)
    for r in db.reviews_between("2000-01-01", "2999-12-31"):
        c = cards.get(r["card_id"])
        if c: bump(c.get("topic", "General"), r["grade"] == "knew")
    for a in db.quiz_attempts():
        bump(a.get("topic") or "General", bool(a["correct"]))
    for s in stats.values():
        s["accuracy"] = round(s["correct"] / s["attempts"], 3) if s["attempts"] else 0
    return stats

def weak_topics(limit=5, stats=None):
    """Weakest first: lowest accuracy, then most attempts (more evidence)."""
    ranked = sorted((stats or topic_stats()).values(), key=lambda s: (s["accuracy"], -s["attempts"], s["topic"]))
    return ranked[:limit]

def targeted_cards(limit=20):
    stats = topic_stats()
    weak = [w["topic"] for w in weak_topics(3, stats)]
    if not weak: return []
    rank = {topic: i for i, topic in enumerate(weak)}
    cards = [c for c in db.all_cards_with_state() if c.get("topic") in rank]
    cards.sort(key=lambda c: (rank[c["topic"]], c["due_date"] or "9999"))
    return cards[:limit]
