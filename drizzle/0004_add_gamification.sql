ALTER TABLE `reviews` ADD `xp_earned` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `reviews` ADD `critical` integer DEFAULT false NOT NULL;
--> statement-breakpoint
CREATE TABLE `game_profile` (
  `id` integer PRIMARY KEY NOT NULL,
  `total_xp` integer DEFAULT 0 NOT NULL,
  `current_combo` integer DEFAULT 0 NOT NULL,
  `best_combo` integer DEFAULT 0 NOT NULL,
  `blitz_best` integer DEFAULT 0 NOT NULL,
  `sound_enabled` integer DEFAULT false NOT NULL,
  `daily_nudge_enabled` integer DEFAULT false NOT NULL,
  `updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `activity_days` (
  `date_key` text PRIMARY KEY NOT NULL,
  `xp_earned` integer DEFAULT 0 NOT NULL,
  `cards_graded` integer DEFAULT 0 NOT NULL,
  `knew_count` integer DEFAULT 0 NOT NULL,
  `best_combo` integer DEFAULT 0 NOT NULL,
  `blitz_runs` integer DEFAULT 0 NOT NULL,
  `quest_claim_mask` integer DEFAULT 0 NOT NULL,
  `perfect` integer DEFAULT false NOT NULL,
  `updated_at` integer NOT NULL
);
