"""XP / combo / levels / quests / streaks — pure, deterministic, testable.
Design rules (gamification spec): effort is never zero, no punishment,
combos break neutrally, streaks are forgiving (active OR perfect day)."""
import hashlib
from datetime import date, timedelta

BASE_XP = {"knew": 10, "again": 5}

def combo_multiplier(combo):
    """combo = consecutive 'knew' count INCLUDING the current card."""
    if combo >= 20: return 5
    if combo >= 10: return 3
    if combo >= 5: return 2
    return 1

def xp_for(grade, combo_after, critical=False):
    xp = BASE_XP[grade] * (combo_multiplier(combo_after) if grade == "knew" else 1)
    if critical: xp *= 2
    return xp

def is_critical(card_id, day, position):
    """~1-in-12 deterministic 'critical' card for a feed slot."""
    h = hashlib.sha256(f"{card_id}:{day}:{position}".encode()).hexdigest()
    return int(h[:8], 16) % 12 == 0

def level_for_xp(xp):
    """Gentle thresholds: level L needs 50*L*(L-1) total XP (L1=0, L2=100,
    L3=300, L4=600, L5=1000 ...). Returns (level, xp_into_level, xp_for_next)."""
    level = 1
    while 50 * (level + 1) * level <= xp:
        level += 1
    cur = 50 * level * (level - 1)
    nxt = 50 * (level + 1) * level
    return level, xp - cur, nxt - cur

QUEST_POOL = [
    {"key": "grade15", "label": "Grade 15 cards", "target": 15, "metric": "graded", "xp": 25},
    {"key": "combo10", "label": "Hit a 10-combo", "target": 10, "metric": "best_combo", "xp": 30},
    {"key": "blitz1", "label": "Complete one Blitz", "target": 1, "metric": "blitz", "xp": 30},
    {"key": "knew20", "label": "Get 20 'Knew it'", "target": 20, "metric": "knew", "xp": 25},
    {"key": "focus10", "label": "Focus for 10 minutes", "target": 10, "metric": "focus_minutes", "xp": 25},
    {"key": "quiz1", "label": "Finish one quiz", "target": 1, "metric": "quizzes", "xp": 30},
]
PERFECT_DAY_BONUS = 50

def quests_for(day):
    """3 quests/day, deterministic from the date (stable across calls)."""
    seed = int(hashlib.sha256(day.encode()).hexdigest()[:8], 16)
    pool = list(QUEST_POOL)
    picked = []
    for i in range(3):
        picked.append(pool.pop((seed >> (i * 4)) % len(pool)))
    return picked

def streak(active_days, today):
    """Forgiving streak: consecutive days ending today/yesterday present in
    active_days (a set of ISO dates with ANY activity or a perfect day)."""
    d = date.fromisoformat(today)
    if d.isoformat() not in active_days:
        d -= timedelta(days=1)
    n = 0
    while d.isoformat() in active_days:
        n += 1
        d -= timedelta(days=1)
    return n
