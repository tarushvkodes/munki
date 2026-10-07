CREATE TABLE `study_boards` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `deck_id` integer NOT NULL,
  `title` text NOT NULL,
  `strokes_json` text DEFAULT '[]' NOT NULL,
  `tutor_reply` text DEFAULT '' NOT NULL,
  `annotations_json` text DEFAULT '[]' NOT NULL,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL,
  FOREIGN KEY (`deck_id`) REFERENCES `decks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `study_files` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `deck_id` integer NOT NULL,
  `name` text NOT NULL,
  `mime_type` text NOT NULL,
  `size_bytes` integer NOT NULL,
  `blob_key` text NOT NULL,
  `created_at` integer NOT NULL,
  FOREIGN KEY (`deck_id`) REFERENCES `decks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `study_sessions` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `deck_id` integer NOT NULL,
  `started_at` integer NOT NULL,
  `ended_at` integer,
  `intention` text DEFAULT '' NOT NULL,
  `reflection` text DEFAULT '' NOT NULL,
  FOREIGN KEY (`deck_id`) REFERENCES `decks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `practice_attempts` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `deck_id` integer NOT NULL,
  `topic` text DEFAULT '' NOT NULL,
  `score` integer NOT NULL,
  `max_score` integer NOT NULL,
  `created_at` integer NOT NULL,
  FOREIGN KEY (`deck_id`) REFERENCES `decks`(`id`) ON UPDATE no action ON DELETE cascade
);