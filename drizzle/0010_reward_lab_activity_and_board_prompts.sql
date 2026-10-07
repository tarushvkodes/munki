ALTER TABLE `activity_days` ADD `practice_sessions` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `activity_days` ADD `focus_sessions` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `study_boards` ADD `prompt_text` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `practice_attempts` ADD `attempt_uuid` text;
--> statement-breakpoint
ALTER TABLE `practice_attempts` ADD `result_json` text DEFAULT '' NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX `practice_attempts_attempt_uuid_unique` ON `practice_attempts` (`attempt_uuid`);
--> statement-breakpoint
ALTER TABLE `study_sessions` ADD `result_json` text DEFAULT '' NOT NULL;