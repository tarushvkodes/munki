"""Quest XP is paid once per quest per day, the perfect day once, and the
dev-only demo API stays off unless MUNKI_DEMO=1."""
from fastapi import FastAPI
from fastapi.testclient import TestClient
from app import db, demo, gamification as G

DAY = "2031-03-03"


def _quest(metric):
    for offset in range(60):
        day = f"2031-04-{offset % 28 + 1:02d}" if offset < 28 else f"2031-05-{offset % 28 + 1:02d}"
        for q in G.quests_for(day):
            if q["metric"] == metric:
                return day, q
    raise AssertionError(f"no day with a {metric} quest")


def test_quest_xp_paid_exactly_once(client):
    day, quest = _quest("graded")
    card = db.all_cards_with_state()[0]
    before = db.total_xp()
    paid = []
    for _ in range(quest["target"] + 3):
        r = client.post("/api/review", json={"card_id": card["id"], "grade": "again", "date": day}).json()
        paid += r["quests_claimed"]
    assert paid.count(quest["key"]) == 1
    grade_xp = 5 * (quest["target"] + 3)
    assert db.total_xp() - before >= grade_xp + quest["xp"]
    g = client.get(f"/api/gamification?date={day}").json()
    assert [q for q in g["quests"] if q["key"] == quest["key"]][0]["done"] is True


def test_perfect_day_bonus_once():
    quests = [{"key": "a", "xp": 25, "done": True}, {"key": "b", "xp": 30, "done": True}]
    first = G.unclaimed_rewards(quests, True, set())
    assert ("perfect", G.PERFECT_DAY_BONUS) in first and sum(x for _, x in first) == 105
    assert G.unclaimed_rewards(quests, True, {k for k, _ in first}) == []


def test_gamification_exposes_combo_tiers(client):
    g = client.get("/api/gamification").json()
    assert g["combo_tiers"] == [[5, 2], [10, 3], [20, 5]]
    assert g["multiplier"] == G.combo_multiplier(g["combo"])


def test_demo_api_off_by_default(client):
    assert client.post("/api/demo/prime", json={"scenarios": ["levelup"]}).status_code == 404


def test_demo_primes_level_up_and_combo(client):
    demo_app = FastAPI(); demo_app.include_router(demo.router)
    dc = TestClient(demo_app)
    r = dc.post("/api/demo/prime", json={"scenarios": ["levelup", "combo", "nope"], "date": DAY}).json()
    assert set(r["applied"]) == {"levelup", "combo"} and r["unknown"] == ["nope"]
    card = db.all_cards_with_state()[1]
    res = client.post("/api/review", json={"card_id": card["id"], "grade": "knew", "date": DAY}).json()
    assert res["leveled_up"] is True
    assert res["combo"] == 5 and res["multiplier"] == 2


def test_demo_streak_prime_extends_streak_on_first_activity(client):
    demo_app = FastAPI(); demo_app.include_router(demo.router)
    day = "2031-06-10"
    TestClient(demo_app).post("/api/demo/prime", json={"scenarios": ["streak"], "date": day})
    assert client.get(f"/api/gamification?date={day}").json()["streak"] == 2
    client.post("/api/focus", json={"minutes": 1, "date": day})
    assert client.get(f"/api/gamification?date={day}").json()["streak"] == 3
