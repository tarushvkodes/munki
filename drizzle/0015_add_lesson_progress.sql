CREATE TABLE `lesson_progress` (
  `lesson_id` text PRIMARY KEY NOT NULL,
  `course` text NOT NULL,
  `title` text NOT NULL,
  `status` text DEFAULT 'not_started' NOT NULL,
  `current_phase` integer DEFAULT 0 NOT NULL,
  `phase_progress_json` text DEFAULT '{}' NOT NULL,
  `mastery_permille` integer DEFAULT 0 NOT NULL,
  `board_strokes_json` text DEFAULT '[]' NOT NULL,
  `xp_earned` integer DEFAULT 0 NOT NULL,
  `started_at` integer,
  `completed_at` integer,
  `updated_at` integer NOT NULL
);