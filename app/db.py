"""SQLite storage for Munki: decks, cards, SRS state, reviews, XP,
quests, blitz, focus sessions, deadlines, quiz attempts, settings.

Connection strategy: one connection per thread, created lazily and kept
for the life of the thread (schema + pragmas applied once, not per call).
WAL mode lets the API threadpool's readers and writer share the file
safely, and every write function commits before returning — the same
durability contract as the original open-per-call design, minus the
per-call connect + DDL overhead (a review used to open 13 connections).
"""
import json, os, re, sqlite3, threading
from . import config

_SCHEMA = """
CREATE TABLE IF NOT EXISTS decks (id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT UNIQUE NOT NULL, name TEXT NOT NULL, course TEXT, description TEXT);
CREATE TABLE IF NOT EXISTS cards (id INTEGER PRIMARY KEY AUTOINCREMENT,
  deck_id INTEGER NOT NULL REFERENCES decks(id), front TEXT NOT NULL,
  back TEXT NOT NULL, topic TEXT DEFAULT 'General', source TEXT DEFAULT 'seed',
  front_key TEXT NOT NULL, UNIQUE(deck_id, front_key));
CREATE TABLE IF NOT EXISTS card_state (card_id INTEGER PRIMARY KEY REFERENCES cards(id),
  ease REAL DEFAULT 2.5, interval_days INTEGER DEFAULT 0, repetitions INTEGER DEFAULT 0,
  lapses INTEGER DEFAULT 0, due_date TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS reviews (id INTEGER PRIMARY KEY AUTOINCREMENT,
  card_id INTEGER NOT NULL, grade TEXT NOT NULL, xp INTEGER DEFAULT 0,
  critical INTEGER DEFAULT 0, mode TEXT DEFAULT 'feed', date TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')));
CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE IF NOT EXISTS blitz (id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL, score INTEGER NOT NULL, cards INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS focus_sessions (id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL, deck_id INTEGER, minutes INTEGER NOT NULL, task TEXT);
CREATE TABLE IF NOT EXISTS quiz_attempts (id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL, card_id INTEGER NOT NULL, correct INTEGER NOT NULL, topic TEXT);
CREATE TABLE IF NOT EXISTS deadlines (id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL, date TEXT NOT NULL, deck_slug TEXT, seeded INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS quest_claims (day TEXT NOT NULL, quest TEXT NOT NULL,
  xp INTEGER NOT NULL, PRIMARY KEY (day, quest));
CREATE INDEX IF NOT EXISTS idx_cards_deck ON cards(deck_id);
CREATE INDEX IF NOT EXISTS idx_reviews_date ON reviews(date);
CREATE INDEX IF NOT EXISTS idx_reviews_card ON reviews(card_id);
CREATE INDEX IF NOT EXISTS idx_quiz_attempts_date ON quiz_attempts(date);
CREATE INDEX IF NOT EXISTS idx_focus_date ON focus_sessions(date);
"""

_local = threading.local()

def _conn():
    """This thread's shared connection (created + schema-checked once)."""
    c = getattr(_local, "conn", None)
    if c is None:
        os.makedirs(os.path.dirname(config.DB_PATH), exist_ok=True)
        c = sqlite3.connect(config.DB_PATH)
        c.row_factory = sqlite3.Row
        c.execute("PRAGMA journal_mode=WAL")
        c.execute("PRAGMA synchronous=NORMAL")
        c.execute("PRAGMA busy_timeout=5000")
        c.executescript(_SCHEMA)
        _local.conn = c
    return c

def front_key(front):
    """Canonical dedupe key for a card front (shared by add_card + seed)."""
    return re.sub(r"\s+", " ", front.strip().lower())

# ---- key/value (settings, combo, bonus XP) ----
def kv_get(key, default=None):
    r = _conn().execute("SELECT value FROM kv WHERE key=?", (key,)).fetchone()
    return json.loads(r["value"]) if r else default

def kv_get_many(keys):
    keys = list(keys)
    if not keys: return {}
    marks = ",".join("?" * len(keys))
    rows = _conn().execute(f"SELECT key, value FROM kv WHERE key IN ({marks})", keys).fetchall()
    return {r["key"]: json.loads(r["value"]) for r in rows}

def kv_set(key, value):
    c = _conn()
    c.execute("INSERT OR REPLACE INTO kv (key,value) VALUES (?,?)", (key, json.dumps(value)))
    c.commit()

def kv_set_many(mapping):
    c = _conn()
    c.executemany("INSERT OR REPLACE INTO kv (key,value) VALUES (?,?)",
                  [(k, json.dumps(v)) for k, v in mapping.items()])
    c.commit()

# ---- decks / cards ----
_CARD_WITH_STATE = """SELECT cards.*, decks.slug AS deck_slug, decks.name AS deck_name,
  cs.ease, cs.interval_days, cs.repetitions, cs.lapses, cs.due_date
  FROM cards JOIN decks ON decks.id=cards.deck_id
  LEFT JOIN card_state cs ON cs.card_id=cards.id"""

def list_decks():
    return [dict(r) for r in _conn().execute("SELECT * FROM decks ORDER BY id").fetchall()]

def get_deck(deck_id=None, slug=None):
    if deck_id:
        r = _conn().execute("SELECT * FROM decks WHERE id=?", (deck_id,)).fetchone()
    else:
        r = _conn().execute("SELECT * FROM decks WHERE slug=?", (slug,)).fetchone()
    return dict(r) if r else None

def cards_for_deck(deck_id):
    rows = _conn().execute("""SELECT cards.*, cs.ease, cs.interval_days, cs.repetitions,
      cs.lapses, cs.due_date FROM cards LEFT JOIN card_state cs ON cs.card_id=cards.id
      WHERE cards.deck_id=? ORDER BY cards.id""", (deck_id,)).fetchall()
    return [dict(r) for r in rows]

def get_card(card_id):
    r = _conn().execute(_CARD_WITH_STATE + " WHERE cards.id=?", (card_id,)).fetchone()
    return dict(r) if r else None

def all_cards_with_state():
    return [dict(r) for r in _conn().execute(_CARD_WITH_STATE + " ORDER BY cards.id").fetchall()]

def save_state(card_id, state):
    c = _conn()
    c.execute("""INSERT OR REPLACE INTO card_state (card_id, ease, interval_days,
      repetitions, lapses, due_date) VALUES (?,?,?,?,?,?)""",
      (card_id, state["ease"], state["interval_days"], state["repetitions"],
       state.get("lapses", 0), state["due_date"]))
    c.commit()

def add_card(deck_id, front, back, topic, source="user"):
    c = _conn()
    cur = c.execute("INSERT OR IGNORE INTO cards (deck_id, front, back, topic, source, front_key) VALUES (?,?,?,?,?,?)",
                    (deck_id, front, back, topic or "General", source, front_key(front)))
    c.commit()
    return cur.lastrowid

def card_fronts():
    return [(r["front"], r["deck_id"]) for r in _conn().execute("SELECT front, deck_id FROM cards")]

def get_cards(ids):
    if not ids: return []
    marks = ",".join("?" * len(ids))
    rows = _conn().execute(_CARD_WITH_STATE + f" WHERE cards.id IN ({marks}) ORDER BY cards.id", list(ids))
    return [dict(r) for r in rows]

def create_deck(slug, name, description, course=""):
    c = _conn()
    cur = c.execute("INSERT INTO decks (slug, name, course, description) VALUES (?,?,?,?)",
                    (slug, name, course, description))
    c.commit()
    return cur.lastrowid

def add_cards(deck_id, rows, source, state):
    """Insert (front, back, topic) rows and their SRS state in one transaction.
    Returns the new ids; fronts the deck already holds are skipped."""
    c, ids = _conn(), []
    with c:
        for front, back, topic in rows:
            cur = c.execute("INSERT OR IGNORE INTO cards (deck_id, front, back, topic, source, front_key) VALUES (?,?,?,?,?,?)",
                            (deck_id, front, back, topic or "General", source, front_key(front)))
            if cur.rowcount:
                ids.append(cur.lastrowid)
                c.execute("""INSERT OR REPLACE INTO card_state (card_id, ease, interval_days,
                  repetitions, lapses, due_date) VALUES (?,?,?,?,?,?)""",
                  (cur.lastrowid, state["ease"], state["interval_days"], state["repetitions"],
                   state["lapses"], state["due_date"]))
    return ids

# ---- reviews / activity ----
def log_review(card_id, grade, xp, critical, mode, day):
    c = _conn()
    c.execute("INSERT INTO reviews (card_id, grade, xp, critical, mode, date) VALUES (?,?,?,?,?,?)",
              (card_id, grade, xp, int(bool(critical)), mode, day))
    c.commit()

def reviews_between(start, end):
    rows = _conn().execute("SELECT * FROM reviews WHERE date>=? AND date<=? ORDER BY id", (start, end)).fetchall()
    return [dict(r) for r in rows]

def day_activity(day):
    c = _conn()
    rev = c.execute("SELECT COUNT(*) n, SUM(CASE WHEN grade='knew' THEN 1 ELSE 0 END) knew FROM reviews WHERE date=?", (day,)).fetchone()
    foc = c.execute("SELECT COALESCE(SUM(minutes),0) m FROM focus_sessions WHERE date=?", (day,)).fetchone()
    blz = c.execute("SELECT COUNT(*) n FROM blitz WHERE date=?", (day,)).fetchone()
    qz = c.execute("SELECT COUNT(*) n FROM quiz_attempts WHERE date=?", (day,)).fetchone()
    return {"graded": rev["n"] or 0, "knew": rev["knew"] or 0,
            "focus_minutes": foc["m"] or 0, "blitz": blz["n"] or 0,
            "quizzes": 1 if (qz["n"] or 0) > 0 else 0}

def active_days():
    rows = _conn().execute("""SELECT date FROM reviews UNION SELECT date FROM focus_sessions
      UNION SELECT date FROM blitz UNION SELECT date FROM quiz_attempts""").fetchall()
    return {r["date"] for r in rows}

def total_xp():
    c = _conn()
    r = c.execute("SELECT COALESCE(SUM(xp),0) x FROM reviews").fetchone()
    q = c.execute("SELECT COALESCE(SUM(xp),0) x FROM quest_claims").fetchone()
    return (r["x"] or 0) + (q["x"] or 0) + kv_get("bonus_xp", 0)

def add_bonus_xp(n):
    kv_set("bonus_xp", kv_get("bonus_xp", 0) + n)

def quest_claims(day):
    return {r["quest"] for r in _conn().execute("SELECT quest FROM quest_claims WHERE day=?", (day,))}

def claim_quest(day, quest, xp):
    """Record and pay one quest; True only for the caller whose insert won."""
    c = _conn()
    cur = c.execute("INSERT OR IGNORE INTO quest_claims (day, quest, xp) VALUES (?,?,?)", (day, quest, xp))
    c.commit()
    return cur.rowcount == 1

# ---- blitz / focus / quiz ----
def record_blitz(day, score, cards):
    c = _conn()
    c.execute("INSERT INTO blitz (date, score, cards) VALUES (?,?,?)", (day, score, cards))
    c.commit()
    return c.execute("SELECT MAX(score) m FROM blitz").fetchone()["m"]

def blitz_best():
    return _conn().execute("SELECT MAX(score) m FROM blitz").fetchone()["m"] or 0

def record_focus(day, deck_id, minutes, task):
    c = _conn()
    cur = c.execute("INSERT INTO focus_sessions (date, deck_id, minutes, task) VALUES (?,?,?,?)", (day, deck_id, minutes, task))
    c.commit()
    return cur.lastrowid

def focus_stats():
    rows = _conn().execute("""SELECT date, COALESCE(deck_id,0) deck_id, SUM(minutes) minutes
      FROM focus_sessions GROUP BY date, deck_id ORDER BY date""").fetchall()
    return [dict(r) for r in rows]

def record_quiz_attempt(day, card_id, correct, topic):
    c = _conn()
    c.execute("INSERT INTO quiz_attempts (date, card_id, correct, topic) VALUES (?,?,?,?)", (day, card_id, int(bool(correct)), topic))
    c.commit()

def quiz_attempts():
    return [dict(r) for r in _conn().execute("SELECT * FROM quiz_attempts ORDER BY id").fetchall()]

# ---- deadlines ----
def list_deadlines():
    return [dict(r) for r in _conn().execute("SELECT * FROM deadlines ORDER BY date, id").fetchall()]

def add_deadline(title, day, deck_slug=None, seeded=0):
    c = _conn()
    cur = c.execute("INSERT INTO deadlines (title, date, deck_slug, seeded) VALUES (?,?,?,?)", (title, day, deck_slug, seeded))
    c.commit()
    return cur.lastrowid

def update_deadline(did, title, day, deck_slug):
    c = _conn()
    c.execute("UPDATE deadlines SET title=?, date=?, deck_slug=? WHERE id=?", (title, day, deck_slug, did))
    c.commit()

def delete_deadline(did):
    c = _conn()
    c.execute("DELETE FROM deadlines WHERE id=?", (did,))
    c.commit()

# ---- settings ----
def get_settings():
    s = kv_get("settings", {})
    return {"plain_language": False, "dyslexia_font": False, "sound": False, **s}

def set_settings(updates):
    s = get_settings(); s.update(updates); kv_set("settings", s); return s
