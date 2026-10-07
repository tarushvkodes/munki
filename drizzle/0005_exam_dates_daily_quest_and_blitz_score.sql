ALTER TABLE `decks` ADD `exam_date` text;
--> statement-breakpoint
ALTER TABLE `activity_days` ADD `blitz_best_score` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `activity_days` ADD `due_deck_clears` integer DEFAULT 0 NOT NULL;
