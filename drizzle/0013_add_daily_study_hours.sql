CREATE TABLE `daily_study_hours` (
  `date_key` text PRIMARY KEY NOT NULL,
  `current_phase` integer NOT NULL DEFAULT 0,
  `phase_statuses_json` text NOT NULL DEFAULT '["active","pending","pending","pending","pending"]',
  `phase_started_at` integer,
  `started_at` integer NOT NULL,
  `completed_at` integer,
  `result_json` text NOT NULL DEFAULT '',
  `updated_at` integer NOT NULL
);
