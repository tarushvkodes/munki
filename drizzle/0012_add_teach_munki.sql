CREATE TABLE `teaching_settings` (
  `id` integer PRIMARY KEY NOT NULL,
  `daily_class_time` text,
  `reminder_enabled` integer DEFAULT true NOT NULL,
  `updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `teaching_topics` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `deck_id` integer NOT NULL,
  `topic` text NOT NULL,
  `mastery_permille` integer DEFAULT 0 NOT NULL,
  `last_taught_date_key` text,
  `last_taught_at` integer,
  `total_sessions` integer DEFAULT 0 NOT NULL,
  `updated_at` integer NOT NULL,
  FOREIGN KEY (`deck_id`) REFERENCES `decks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `teaching_topics_deck_topic_unique` ON `teaching_topics` (`deck_id`, `topic`);
--> statement-breakpoint
CREATE TABLE `teaching_sessions` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `topic_id` integer NOT NULL,
  `date_key` text NOT NULL,
  `explanation` text NOT NULL,
  `student_reply` text NOT NULL,
  `question` text NOT NULL,
  `understood` text DEFAULT '' NOT NULL,
  `knowledge_gap` text DEFAULT '' NOT NULL,
  `mastery_delta` integer DEFAULT 0 NOT NULL,
  `xp_earned` integer DEFAULT 0 NOT NULL,
  `created_at` integer NOT NULL,
  FOREIGN KEY (`topic_id`) REFERENCES `teaching_topics`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `teaching_sessions_topic_created_idx` ON `teaching_sessions` (`topic_id`, `created_at`);
--> statement-breakpoint
CREATE INDEX `teaching_sessions_date_idx` ON `teaching_sessions` (`date_key`);
