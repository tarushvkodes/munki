from app import meta_client

def test_health(client):
    r = client.get("/api/health")
    assert r.status_code == 200 and r.json()["ok"] is True

def test_frontend_200(client):
    assert client.get("/").status_code == 200
    assert client.get("/static/app.js").status_code == 200

def test_decks_endpoint(client):
    decks = client.get("/api/decks").json()["decks"]
    slugs = {d["slug"] for d in decks}
    assert {"ma162-exam3", "phys172", "cnit182", "inbox"} <= slugs
    ma = [d for d in decks if d["slug"] == "ma162-exam3"][0]
    assert ma["total"] == 40 and "mastery_pct" in ma

def test_feed_shape(client):
    cards = client.get("/api/feed?limit=10").json()["cards"]
    assert len(cards) == 10
    assert all("front" in c and "back" in c and "critical" in c for c in cards)

def test_review_flow_and_xp(client):
    card = client.get("/api/feed?limit=1").json()["cards"][0]
    r = client.post("/api/review", json={"card_id": card["id"], "grade": "knew"}).json()
    assert r["xp_gained"] >= 10 and r["state"]["repetitions"] == 1 and r["combo"] >= 1
    r2 = client.post("/api/review", json={"card_id": card["id"], "grade": "again"})
    assert r2.json()["xp_gained"] == 5  # effort never zero (non-critical card slot aside, again ignores critical flag default False)
    bad = client.post("/api/review", json={"card_id": card["id"], "grade": "meh"})
    assert bad.status_code == 400

def test_quiz_endpoints(client):
    decks = client.get("/api/decks").json()["decks"]
    ma = [d for d in decks if d["slug"] == "ma162-exam3"][0]
    q = client.post("/api/quiz", json={"deck_id": ma["id"], "count": 3, "seed": 3}).json()
    assert q["source"] == "fallback"  # no key in test env
    assert len(q["questions"]) == 3
    first = q["questions"][0]
    assert "correct_index" not in first
    g = client.post("/api/quiz/grade", json={"card_id": first["card_id"], "chosen": first["explanation"]}).json()
    assert g["correct"] is True

def test_tutor_fallback_labeled(client):
    r = client.post("/api/tutor", json={"problem": "Σ n!/10^n — which series test?"}).json()
    assert r["source"] == "fallback" and "Ratio" in " ".join(r["steps"])
    r2 = client.post("/api/tutor", json={"problem": "some totally novel thing"}).json()
    assert r2["source"] == "fallback" and len(r2["steps"]) >= 4

def test_notes_fallback_and_inbox_add(client):
    r = client.post("/api/notes/cards", json={"text": "Ratio test: use when factorials appear.\nQ: Best join to keep unmatched rows?\nA: LEFT JOIN"}).json()
    assert r["source"] == "fallback" and len(r["cards"]) == 2
    add = client.post("/api/cards", json={"front": r["cards"][0]["front"], "back": r["cards"][0]["back"], "deck_slug": "inbox"})
    assert add.status_code == 200 and add.json()["id"]

def test_focus_logging(client):
    r = client.post("/api/focus", json={"minutes": 25, "task": "MA review"})
    assert r.status_code == 200
    stats = client.get("/api/focus/stats").json()
    assert stats["total_minutes"] >= 25

def test_blitz_records_best(client):
    r = client.post("/api/blitz", json={"score": 120, "cards": 9}).json()
    assert r["personal_best"] >= 120
    g = client.get("/api/gamification").json()
    assert g["blitz_best"] >= 120 and len(g["quests"]) == 3

def test_plan_endpoint(client):
    p = client.get("/api/plan?start=2026-11-02").json()
    assert p["days"][0]["date"] == "2026-11-02" and p["days"][-1]["date"] == "2026-11-30"

def test_deadline_crud(client):
    did = client.post("/api/deadlines", json={"title": "Test deadline", "date": "2026-12-01", "deck_slug": "phys172"}).json()["id"]
    assert client.put(f"/api/deadlines/{did}", json={"title": "Renamed", "date": "2026-12-02", "deck_slug": "phys172"}).status_code == 200
    assert client.delete(f"/api/deadlines/{did}").status_code == 200

def test_settings_roundtrip(client):
    client.put("/api/settings", json={"plain_language": True})
    assert client.get("/api/settings").json()["plain_language"] is True

def test_meta_disabled_cleanly():
    assert meta_client.available() is False
    import pytest
    with pytest.raises(RuntimeError):
        meta_client.tutor_walkthrough("x")
