"""Munki API — FastAPI backend. Run: ./run.sh (uvicorn app.main:app).
Serves /api/* and the single-page frontend at /. Works fully offline:
with no META_API_KEY every AI feature uses labeled deterministic fallbacks."""
import os, random
from contextlib import asynccontextmanager
from datetime import date as date_cls
from fastapi import FastAPI
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from . import config, db, diagnostics, gamification as G, meta_client, notes as notes_mod
from . import planner, quiz as quiz_mod, seed as seed_mod, srs, tutor as tutor_mod

@asynccontextmanager
async def _lifespan(_app):
    seed_mod.seed(today=date_cls.today().isoformat())
    yield

app = FastAPI(title="Munki", version="1.0.0", lifespan=_lifespan)
FRONTEND = os.path.join(config.BASE_DIR, "frontend")
if config.DEMO_MODE:
    from . import demo
    app.include_router(demo.router)

def _today():
    return date_cls.today().isoformat()

def _err(message, status):
    return JSONResponse({"error": message}, status_code=status)

def _public_card(c, critical=False):
    return {"id": c["id"], "deck_id": c["deck_id"], "deck_slug": c.get("deck_slug"),
            "deck_name": c.get("deck_name"), "front": c["front"], "back": c["back"],
            "topic": c.get("topic", "General"), "due_date": c.get("due_date"),
            "repetitions": c.get("repetitions") or 0, "interval_days": c.get("interval_days") or 0,
            "critical": critical}

def build_feed(limit=20, deck_id=None, today=None, targeted=False):
    today = today or _today()
    if targeted:
        pool = diagnostics.targeted_cards(limit)
        return [_public_card(c, G.is_critical(c["id"], today, i)) for i, c in enumerate(pool)]
    cards = db.all_cards_with_state()
    if deck_id: cards = [c for c in cards if c["deck_id"] == deck_id]
    # Single-pass partition (the original used `c not in due/new` list
    # scans — O(n^2) dict comparisons with wrong results for duplicate rows).
    due, new, later = [], [], []
    for c in cards:
        if (c.get("repetitions") or 0) > 0 and (c.get("due_date") or today) <= today:
            due.append(c)
        elif (c.get("repetitions") or 0) == 0 and (c.get("lapses") or 0) == 0:
            new.append(c)
        else:
            later.append(c)
    due.sort(key=lambda c: c["due_date"] or today)
    rng = random.Random(f"{today}:{deck_id}")
    rng.shuffle(new)
    ordered = due + new + later
    return [_public_card(c, G.is_critical(c["id"], today, i)) for i, c in enumerate(ordered[:limit])]

# ---------- health / decks ----------
@app.get("/api/health")
def health():
    return {"ok": True, "app": "munki", "meta_configured": meta_client.available(),
            "ai_source": "meta-api" if meta_client.available() else "fallback"}

@app.get("/api/decks")
def decks():
    today = _today()
    by_deck = {}
    for c in db.all_cards_with_state():
        by_deck.setdefault(c["deck_id"], []).append(c)
    out = []
    for d in db.list_decks():
        cards = by_deck.get(d["id"], [])
        total = len(cards)
        mature = sum(1 for c in cards if srs.is_mature(c))
        due = sum(1 for c in cards if (c.get("due_date") or today) <= today)
        out.append({**d, "total": total, "mature": mature, "due": due,
                    "mastery_pct": round(100 * mature / total) if total else 0,
                    "topics": sorted({c.get("topic", "General") for c in cards})})
    return {"decks": out}

@app.get("/api/feed")
def feed(limit: int = 20, deck_id: int | None = None, targeted: int = 0):
    return {"cards": build_feed(limit=limit, deck_id=deck_id, targeted=bool(targeted)),
            "date": _today()}

# ---------- review / gamification ----------
class ReviewIn(BaseModel):
    card_id: int
    grade: str
    critical: bool = False
    mode: str = "feed"
    date: str | None = None

@app.post("/api/review")
def review(body: ReviewIn):
    if body.grade not in ("knew", "again"):
        return _err("grade must be 'knew' or 'again'", 400)
    card = db.get_card(body.card_id)
    if not card: return _err("card not found", 404)
    today = body.date or _today()
    state = {"ease": card.get("ease") or 2.5, "interval_days": card.get("interval_days") or 0,
             "repetitions": card.get("repetitions") or 0, "lapses": card.get("lapses") or 0,
             "due_date": card.get("due_date") or today}
    new_state = srs.apply_review(state, body.grade, today)
    db.save_state(body.card_id, new_state)
    kv = db.kv_get_many(["combo", "best_combo", "best_combo_by_day"])
    combo = kv.get("combo", 0) + 1 if body.grade == "knew" else 0
    best = max(kv.get("best_combo", 0), combo)
    by_day = kv.get("best_combo_by_day", {}); by_day[today] = max(by_day.get(today, 0), combo)
    db.kv_set_many({"combo": combo, "best_combo": best, "best_combo_by_day": by_day})
    before_level = G.level_for_xp(db.total_xp())[0]
    xp = G.xp_for(body.grade, combo, body.critical)
    db.log_review(body.card_id, body.grade, xp, body.critical, body.mode, today)
    claimed = _claim_quest_xp(today)
    total = db.total_xp(); level, into, span = G.level_for_xp(total)
    return {"xp_gained": xp, "total_xp": total, "combo": combo, "best_combo": best,
            "multiplier": G.combo_multiplier(combo) if body.grade == "knew" else 1,
            "level": level, "level_progress": {"into": into, "span": span},
            "leveled_up": level > before_level, "quests_claimed": claimed, "state": new_state}

def _quest_status(today):
    best_today = db.kv_get("best_combo_by_day", {}).get(today, 0)
    return G.quest_status(today, db.day_activity(today), best_today)

QUEST_CLAIM_DAYS_KEPT = 14

def _claim_quest_xp(today):
    """Pay each finished quest (and a perfect day) exactly once; returns the keys paid now."""
    quests, perfect = _quest_status(today)
    claims = db.kv_get("quest_claims", {})
    new = G.unclaimed_rewards(quests, perfect, set(claims.get(today, [])))
    if not new:
        return []
    claims[today] = claims.get(today, []) + [key for key, _ in new]
    db.kv_set("quest_claims", dict(sorted(claims.items())[-QUEST_CLAIM_DAYS_KEPT:]))
    db.add_bonus_xp(sum(xp for _, xp in new))
    return [key for key, _ in new]

@app.get("/api/gamification")
def gamification(date: str | None = None):
    today = date or _today()
    total = db.total_xp(); level, into, span = G.level_for_xp(total)
    act = db.day_activity(today)
    kv = db.kv_get_many(["combo", "best_combo", "best_combo_by_day"])
    quests, perfect = G.quest_status(today, act, kv.get("best_combo_by_day", {}).get(today, 0))
    combo = kv.get("combo", 0)
    return {"total_xp": total, "level": level, "level_progress": {"into": into, "span": span},
            "combo": combo, "best_combo": kv.get("best_combo", 0),
            "multiplier": G.combo_multiplier(combo), "combo_tiers": G.COMBO_TIERS,
            "blitz_best": db.blitz_best(), "streak": G.streak(db.active_days(), today),
            "quests": quests, "perfect_day": perfect, "activity": act}

class BlitzIn(BaseModel):
    score: int
    cards: int = 0
    date: str | None = None

@app.post("/api/blitz")
def blitz(body: BlitzIn):
    prev_best = db.blitz_best()
    day = body.date or _today()
    best = db.record_blitz(day, body.score, body.cards)
    _claim_quest_xp(day)
    return {"score": body.score, "personal_best": best, "is_personal_best": body.score >= prev_best and body.score > 0}

# ---------- Study Lab: quiz ----------
class QuizIn(BaseModel):
    deck_id: int | None = None
    topic: str | None = None
    count: int = 5
    seed: int = 0

@app.post("/api/quiz")
def quiz(body: QuizIn):
    cards = db.cards_for_deck(body.deck_id) if body.deck_id else db.all_cards_with_state()
    if body.deck_id:
        deck = db.get_deck(body.deck_id)
        for c in cards: c.setdefault("deck_slug", deck["slug"] if deck else None)
    source = "fallback"
    questions = None
    if meta_client.available():
        try:
            raw = meta_client.generate_quiz_questions(cards, body.count)
            by_front = {c["front"]: c for c in cards}
            questions = []
            for q in raw:
                match = by_front.get(q.get("front"))
                questions.append({"card_id": match["id"] if match else None,
                                    "front": q["front"], "topic": q.get("topic", "General"),
                                    "options": q["options"], "explanation": q["options"][q["correct_index"]] if q.get("options") else ""})
            source = "meta-api"
        except Exception:
            questions = None
    if questions is None:
        questions = quiz_mod.build_questions(cards, count=body.count, topic=body.topic, seed=body.seed)
        source = "fallback"
    for q in questions: q.pop("correct_index", None)
    return {"source": source, "questions": questions}

class GradeIn(BaseModel):
    card_id: int
    chosen: str
    date: str | None = None

@app.post("/api/quiz/grade")
def quiz_grade(body: GradeIn):
    card = db.get_card(body.card_id)
    if not card: return _err("card not found", 404)
    result = quiz_mod.grade(card, body.chosen)
    day = body.date or _today()
    db.record_quiz_attempt(day, body.card_id, result["correct"], card.get("topic", "General"))
    _claim_quest_xp(day)
    return result

# ---------- Study Lab: tutor / notes ----------
class TutorIn(BaseModel):
    problem: str
    image_base64: str | None = None

@app.post("/api/tutor")
def tutor(body: TutorIn):
    return tutor_mod.walkthrough(body.problem, body.image_base64)

class NotesIn(BaseModel):
    text: str

@app.post("/api/notes/cards")
def notes_cards(body: NotesIn):
    if meta_client.available():
        try:
            return {"source": "meta-api", "cards": meta_client.generate_cards(body.text)}
        except Exception:
            pass
    return {"source": "fallback", "cards": notes_mod.extract_cards(body.text)}

class CardIn(BaseModel):
    front: str
    back: str
    topic: str = "General"
    deck_slug: str = "inbox"

@app.post("/api/cards")
def add_card(body: CardIn):
    deck = db.get_deck(slug=body.deck_slug)
    if not deck: return _err("deck not found", 404)
    cid = db.add_card(deck["id"], body.front, body.back, body.topic, source="user")
    if cid:
        db.save_state(cid, srs.new_state(_today()))
    return {"id": cid, "deck_slug": body.deck_slug}

# ---------- diagnostics / focus / plan / deadlines ----------
@app.get("/api/diagnostics")
def diagnostics_view():
    return {"topics": sorted(diagnostics.topic_stats().values(), key=lambda s: s["topic"]),
            "weak_topics": diagnostics.weak_topics(),
            "targeted_card_ids": [c["id"] for c in diagnostics.targeted_cards(20)]}

class FocusIn(BaseModel):
    minutes: int
    deck_id: int | None = None
    task: str | None = None
    date: str | None = None

@app.post("/api/focus")
def focus(body: FocusIn):
    day = body.date or _today()
    fid = db.record_focus(day, body.deck_id, body.minutes, body.task)
    _claim_quest_xp(day)
    return {"id": fid, "stats": db.focus_stats()}

@app.get("/api/focus/stats")
def focus_stats():
    stats = db.focus_stats()
    return {"sessions": stats, "total_minutes": sum(s["minutes"] for s in stats)}

@app.get("/api/plan")
def plan(start: str | None = None):
    return planner.generate_plan(start or _today())

@app.get("/api/deadlines")
def get_deadlines():
    return {"deadlines": db.list_deadlines()}

class DeadlineIn(BaseModel):
    title: str
    date: str
    deck_slug: str | None = None

@app.post("/api/deadlines")
def post_deadline(body: DeadlineIn):
    return {"id": db.add_deadline(body.title, body.date, body.deck_slug)}

@app.put("/api/deadlines/{did}")
def put_deadline(did: int, body: DeadlineIn):
    db.update_deadline(did, body.title, body.date, body.deck_slug); return {"ok": True}

@app.delete("/api/deadlines/{did}")
def del_deadline(did: int):
    db.delete_deadline(did); return {"ok": True}

# ---------- settings ----------
class SettingsIn(BaseModel):
    plain_language: bool | None = None
    dyslexia_font: bool | None = None
    sound: bool | None = None

@app.get("/api/settings")
def get_settings():
    return db.get_settings()

@app.put("/api/settings")
def put_settings(body: SettingsIn):
    return db.set_settings({k: v for k, v in body.model_dump().items() if v is not None})

# ---------- frontend ----------
@app.get("/")
def index():
    return FileResponse(os.path.join(FRONTEND, "index.html"))

app.mount("/static", StaticFiles(directory=FRONTEND), name="static")
