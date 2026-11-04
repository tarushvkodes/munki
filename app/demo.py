"""Dev-only recording helpers, mounted only when MUNKI_DEMO=1.

Each scenario puts the app one action away from a reward moment so a
screen recording hits it on cue. Use a scratch MUNKI_DATA_DIR: these write
synthetic activity rows."""
from datetime import date, timedelta
from fastapi import APIRouter
from pydantic import BaseModel
from . import db, gamification as G

router = APIRouter(prefix="/api/demo")

def _level_up(today):
    """Leave 5 XP to the next level, so any graded card levels up."""
    level, into, span = G.level_for_xp(db.total_xp())
    gap = span - into - 5
    if gap > 0: db.add_bonus_xp(gap)
    return f"level {level} -> {level + 1} on the next grade"

def _combo(n):
    def apply(_today):
        db.kv_set("combo", n)
        return f"combo {n}: next 'knew' makes it {n + 1}"
    return apply

def _any_card_id():
    return db.all_cards_with_state()[0]["id"]

def _quest(today):
    """Bring the first unfinished quest that a grade can finish to one step short."""
    act = db.day_activity(today)
    best_today = db.kv_get("best_combo_by_day", {}).get(today, 0)
    quests, _ = G.quest_status(today, act, best_today)
    for q in quests:
        if q["done"]: continue
        missing = q["target"] - 1 - q["progress"]
        if q["metric"] in ("graded", "knew"):
            for _ in range(max(0, missing)):
                db.log_review(_any_card_id(), "knew", 0, False, "demo", today)
            return f"{q['key']} at {q['target'] - 1}/{q['target']}: grade one card"
        if q["metric"] == "best_combo":
            by_day = db.kv_get("best_combo_by_day", {}); by_day[today] = q["target"] - 1
            db.kv_set_many({"combo": q["target"] - 1, "best_combo_by_day": by_day})
            return f"{q['key']}: next 'knew' completes it"
        if q["metric"] == "focus_minutes" and missing > 0:
            db.record_focus(today, None, missing, "demo")
            return f"{q['key']}: log one focus minute"
    return "no quest a single grade can finish today (blitz or quiz quests finish in one action)"

def _streak(today):
    """Activity on the two previous days, so today's first grade extends the streak to 3."""
    d = date.fromisoformat(today)
    for back in (1, 2):
        db.record_focus((d - timedelta(days=back)).isoformat(), None, 1, "demo")
    return "streak 2; first activity today makes it 3"

SCENARIOS = {"levelup": _level_up, "combo": _combo(4), "combo19": _combo(19), "quest": _quest, "streak": _streak}

class PrimeIn(BaseModel):
    scenarios: list[str]
    date: str | None = None

@router.post("/prime")
def prime(body: PrimeIn):
    today = body.date or date.today().isoformat()
    unknown = [s for s in body.scenarios if s not in SCENARIOS]
    applied = {s: SCENARIOS[s](today) for s in body.scenarios if s in SCENARIOS}
    return {"applied": applied, "unknown": unknown, "scenarios": sorted(SCENARIOS)}
