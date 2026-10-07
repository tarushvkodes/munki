CREATE TABLE `daily_subject_study_hours` (
  `id` text PRIMARY KEY NOT NULL,
  `date_key` text NOT NULL,
  `class_name` text NOT NULL,
  `current_phase` integer NOT NULL DEFAULT 0,
  `phase_statuses_json` text NOT NULL DEFAULT '["active","pending","pending","pending","pending"]',
  `phase_started_at` integer,
  `started_at` integer NOT NULL,
  `completed_at` integer,
  `result_json` text NOT NULL DEFAULT '',
  `updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `daily_subject_study_hours_date_idx` ON `daily_subject_study_hours` (`date_key`);
--> statement-breakpoint
INSERT OR IGNORE INTO `daily_subject_study_hours` (`id`, `date_key`, `class_name`, `current_phase`, `phase_statuses_json`, `phase_started_at`, `started_at`, `completed_at`, `result_json`, `updated_at`)
SELECT `date_key` || ':MA 162', `date_key`, 'MA 162', `current_phase`, `phase_statuses_json`, `phase_started_at`, `started_at`, `completed_at`, `result_json`, `updated_at`
FROM `daily_study_hours`;
