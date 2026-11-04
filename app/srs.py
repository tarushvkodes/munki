"""SM-2 spaced repetition (SuperMemo 2), pure functions.

State per card: ease (EF, floor 1.3), interval_days, repetitions, lapses.
Grades: 'knew' -> quality 5, 'again' -> quality 1 (a lapse).
Rules (classic SM-2):
  q < 3 : repetitions reset to 0, interval = 1 day, lapse counted.
  q >= 3: interval = 1 (rep 1), 6 (rep 2), else round(interval * ease).
  ease' = ease + (0.1 - (5-q)*(0.08 + (5-q)*0.02)), floored at 1.3.
One deliberate guard on top of classic SM-2: the interval is capped at
MAX_INTERVAL_DAYS. Without it, re-grading the same card many times in one
session (the feed and Blitz happily re-serve a card) compounds the
interval past the representable date range and crashes the review —
measured: interval hit 57,298 days by the 10th straight 'knew' and the
endpoint 500'd on the 14th. No legitimate schedule needs > 1 year.
"""
from datetime import date, timedelta

MIN_EASE = 1.3
MAX_INTERVAL_DAYS = 365  # see module docstring: guards runaway compounding
QUALITY = {"knew": 5, "again": 1}
MATURE_INTERVAL = 21  # days; at/above this a card counts as "mature"

def new_state(today):
    return {"ease": 2.5, "interval_days": 0, "repetitions": 0,
            "lapses": 0, "due_date": today}

def apply_review(state, grade, today):
    """Return a NEW state dict after grading on `today` (ISO date str)."""
    if grade not in QUALITY:
        raise ValueError(f"unknown grade {grade!r}")
    q = QUALITY[grade]
    s = dict(state)
    ease = s.get("ease", 2.5)
    ease = max(MIN_EASE, ease + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)))
    if q < 3:
        s["repetitions"] = 0
        s["interval_days"] = 1
        s["lapses"] = s.get("lapses", 0) + 1
    else:
        reps = s.get("repetitions", 0) + 1
        s["repetitions"] = reps
        if reps == 1:
            s["interval_days"] = 1
        elif reps == 2:
            s["interval_days"] = 6
        else:
            s["interval_days"] = max(1, round(s.get("interval_days", 6) * ease))
        s["interval_days"] = min(s["interval_days"], MAX_INTERVAL_DAYS)
    s["ease"] = round(ease, 4)
    due = date.fromisoformat(today) + timedelta(days=s["interval_days"])
    s["due_date"] = due.isoformat()
    return s

def is_mature(state):
    return (state.get("interval_days") or 0) >= MATURE_INTERVAL and state.get("repetitions", 0) > 0
