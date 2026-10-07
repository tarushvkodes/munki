ALTER TABLE `reviews` ADD `grade_uuid` text;
--> statement-breakpoint
ALTER TABLE `reviews` ADD `result_json` text DEFAULT '' NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX `reviews_grade_uuid_unique` ON `reviews` (`grade_uuid`);
--> statement-breakpoint
CREATE TABLE `game_mutations` (
  `mutation_uuid` text PRIMARY KEY NOT NULL,
  `kind` text NOT NULL,
  `result_json` text DEFAULT '' NOT NULL,
  `created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `blitz_attempts` (
  `attempt_uuid` text PRIMARY KEY NOT NULL,
  `score` integer NOT NULL,
  `date_key` text NOT NULL,
  `result_json` text DEFAULT '' NOT NULL,
  `created_at` integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE `study_boards` ADD `ink_revision` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `study_sessions` ADD `duration_minutes` integer DEFAULT 25 NOT NULL;
