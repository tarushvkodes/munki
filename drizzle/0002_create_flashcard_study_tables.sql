CREATE TABLE decks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  color TEXT NOT NULL DEFAULT '#2457D6',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE TABLE cards (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  deck_id INTEGER NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
  front TEXT NOT NULL,
  back TEXT NOT NULL,
  tags TEXT NOT NULL DEFAULT '',
  due_at INTEGER NOT NULL,
  last_reviewed_at INTEGER,
  interval_minutes INTEGER NOT NULL DEFAULT 0,
  ease_permille INTEGER NOT NULL DEFAULT 2500,
  repetitions INTEGER NOT NULL DEFAULT 0,
  lapses INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE INDEX cards_deck_due_idx ON cards(deck_id, due_at);
--> statement-breakpoint
CREATE TABLE reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  card_id INTEGER NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  rating TEXT NOT NULL,
  reviewed_at INTEGER NOT NULL,
  previous_interval_minutes INTEGER NOT NULL,
  next_interval_minutes INTEGER NOT NULL
);
--> statement-breakpoint
CREATE INDEX reviews_card_reviewed_idx ON reviews(card_id, reviewed_at);
