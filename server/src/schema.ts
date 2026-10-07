import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const decks = sqliteTable("decks", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  color: text("color").notNull().default("#2457D6"),
  examDate: text("exam_date"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

export const cards = sqliteTable("cards", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  deckId: integer("deck_id")
    .notNull()
    .references(() => decks.id, { onDelete: "cascade" }),
  front: text("front").notNull(),
  back: text("back").notNull(),
  frontImageBlobKey: text("front_image_blob_key"),
  backImageBlobKey: text("back_image_blob_key"),
  tags: text("tags").notNull().default(""),
  feedWeight: integer("feed_weight").notNull().default(100),
  dueAt: integer("due_at", { mode: "timestamp_ms" }).notNull(),
  lastReviewedAt: integer("last_reviewed_at", { mode: "timestamp_ms" }),
  intervalMinutes: integer("interval_minutes").notNull().default(0),
  easePermille: integer("ease_permille").notNull().default(2500),
  repetitions: integer("repetitions").notNull().default(0),
  lapses: integer("lapses").notNull().default(0),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

export const reviews = sqliteTable("reviews", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  cardId: integer("card_id")
    .notNull()
    .references(() => cards.id, { onDelete: "cascade" }),
  gradeUuid: text("grade_uuid").unique(),
  rating: text("rating", { enum: ["again", "hard", "good", "easy"] }).notNull(),
  reviewedAt: integer("reviewed_at", { mode: "timestamp_ms" }).notNull(),
  previousIntervalMinutes: integer("previous_interval_minutes").notNull(),
  nextIntervalMinutes: integer("next_interval_minutes").notNull(),
  xpEarned: integer("xp_earned").notNull().default(0),
  critical: integer("critical", { mode: "boolean" }).notNull().default(false),
  resultJson: text("result_json").notNull().default(""),
});

export const gameMutations = sqliteTable("game_mutations", {
  mutationUuid: text("mutation_uuid").primaryKey(),
  kind: text("kind").notNull(),
  resultJson: text("result_json").notNull().default(""),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
});

export const blitzAttempts = sqliteTable("blitz_attempts", {
  attemptUuid: text("attempt_uuid").primaryKey(),
  score: integer("score").notNull(),
  dateKey: text("date_key").notNull(),
  resultJson: text("result_json").notNull().default(""),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
});

export const gameProfile = sqliteTable("game_profile", {
  id: integer("id").primaryKey(),
  totalXp: integer("total_xp").notNull().default(0),
  currentCombo: integer("current_combo").notNull().default(0),
  bestCombo: integer("best_combo").notNull().default(0),
  blitzBest: integer("blitz_best").notNull().default(0),
  soundEnabled: integer("sound_enabled", { mode: "boolean" }).notNull().default(true),
  dailyNudgeEnabled: integer("daily_nudge_enabled", { mode: "boolean" }).notNull().default(false),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

export const mascotProfile = sqliteTable("mascot_profile", {
  id: integer("id").primaryKey(),
  name: text("name").notNull().default("Munki"),
  spentXp: integer("spent_xp").notNull().default(0),
  ownedAccessoryIdsJson: text("owned_accessory_ids_json").notNull().default("[]"),
  equippedHat: text("equipped_hat"),
  equippedGlasses: text("equipped_glasses"),
  equippedOutfit: text("equipped_outfit"),
  equippedBackground: text("equipped_background"),
  lastInteractionAt: integer("last_interaction_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

export const activityDays = sqliteTable("activity_days", {
  dateKey: text("date_key").primaryKey(),
  xpEarned: integer("xp_earned").notNull().default(0),
  cardsGraded: integer("cards_graded").notNull().default(0),
  knewCount: integer("knew_count").notNull().default(0),
  bestCombo: integer("best_combo").notNull().default(0),
  blitzRuns: integer("blitz_runs").notNull().default(0),
  blitzBestScore: integer("blitz_best_score").notNull().default(0),
  dueDeckClears: integer("due_deck_clears").notNull().default(0),
  practiceSessions: integer("practice_sessions").notNull().default(0),
  focusSessions: integer("focus_sessions").notNull().default(0),
  questClaimMask: integer("quest_claim_mask").notNull().default(0),
  perfect: integer("perfect", { mode: "boolean" }).notNull().default(false),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

export const studyBoards = sqliteTable("study_boards", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  deckId: integer("deck_id").notNull().references(() => decks.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  promptText: text("prompt_text").notNull().default(""),
  strokesJson: text("strokes_json").notNull().default("[]"),
  tutorReply: text("tutor_reply").notNull().default(""),
  annotationsJson: text("annotations_json").notNull().default("[]"),
  inkRevision: integer("ink_revision").notNull().default(0),
  coachRequestId: text("coach_request_id"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

export const studyFiles = sqliteTable("study_files", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  deckId: integer("deck_id").notNull().references(() => decks.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  mimeType: text("mime_type").notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  blobKey: text("blob_key").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
});

export const studySessions = sqliteTable("study_sessions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  deckId: integer("deck_id").notNull().references(() => decks.id, { onDelete: "cascade" }),
  startedAt: integer("started_at", { mode: "timestamp_ms" }).notNull(),
  endedAt: integer("ended_at", { mode: "timestamp_ms" }),
  durationMinutes: integer("duration_minutes").notNull().default(25),
  intention: text("intention").notNull().default(""),
  reflection: text("reflection").notNull().default(""),
  resultJson: text("result_json").notNull().default(""),
});

export const practiceAttempts = sqliteTable("practice_attempts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  deckId: integer("deck_id").notNull().references(() => decks.id, { onDelete: "cascade" }),
  topic: text("topic").notNull().default(""),
  attemptUuid: text("attempt_uuid").unique(),
  score: integer("score").notNull(),
  maxScore: integer("max_score").notNull(),
  resultJson: text("result_json").notNull().default(""),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
});

export const lessonProgress = sqliteTable("lesson_progress", {
  lessonId: text("lesson_id").primaryKey(),
  course: text("course").notNull(),
  title: text("title").notNull(),
  status: text("status", { enum: ["not_started", "active", "complete"] }).notNull().default("not_started"),
  currentPhase: integer("current_phase").notNull().default(0),
  phaseProgressJson: text("phase_progress_json").notNull().default("{}"),
  masteryPermille: integer("mastery_permille").notNull().default(0),
  boardStrokesJson: text("board_strokes_json").notNull().default("[]"),
  xpEarned: integer("xp_earned").notNull().default(0),
  startedAt: integer("started_at", { mode: "timestamp_ms" }),
  completedAt: integer("completed_at", { mode: "timestamp_ms" }),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

export const dailyStudyHours = sqliteTable("daily_study_hours", {
  dateKey: text("date_key").primaryKey(),
  currentPhase: integer("current_phase").notNull().default(0),
  phaseStatusesJson: text("phase_statuses_json").notNull().default('["active","pending","pending","pending","pending"]'),
  phaseStartedAt: integer("phase_started_at", { mode: "timestamp_ms" }),
  startedAt: integer("started_at", { mode: "timestamp_ms" }).notNull(),
  completedAt: integer("completed_at", { mode: "timestamp_ms" }),
  resultJson: text("result_json").notNull().default(""),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

export const dailySubjectStudyHours = sqliteTable("daily_subject_study_hours", {
  id: text("id").primaryKey(),
  dateKey: text("date_key").notNull(),
  className: text("class_name", { enum: ["MA 162", "PHYS 172", "CNIT 182"] }).notNull(),
  currentPhase: integer("current_phase").notNull().default(0),
  phaseStatusesJson: text("phase_statuses_json").notNull().default('["active","pending","pending","pending","pending"]'),
  phaseStartedAt: integer("phase_started_at", { mode: "timestamp_ms" }),
  startedAt: integer("started_at", { mode: "timestamp_ms" }).notNull(),
  completedAt: integer("completed_at", { mode: "timestamp_ms" }),
  resultJson: text("result_json").notNull().default(""),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

export const teachingSettings = sqliteTable("teaching_settings", {
  id: integer("id").primaryKey(),
  dailyClassTime: text("daily_class_time"),
  reminderEnabled: integer("reminder_enabled", { mode: "boolean" }).notNull().default(true),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

export const teachingTopics = sqliteTable("teaching_topics", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  deckId: integer("deck_id").notNull().references(() => decks.id, { onDelete: "cascade" }),
  topic: text("topic").notNull(),
  masteryPermille: integer("mastery_permille").notNull().default(0),
  lastTaughtDateKey: text("last_taught_date_key"),
  lastTaughtAt: integer("last_taught_at", { mode: "timestamp_ms" }),
  totalSessions: integer("total_sessions").notNull().default(0),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

export const teachingSessions = sqliteTable("teaching_sessions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  topicId: integer("topic_id").notNull().references(() => teachingTopics.id, { onDelete: "cascade" }),
  dateKey: text("date_key").notNull(),
  explanation: text("explanation").notNull(),
  studentReply: text("student_reply").notNull(),
  question: text("question").notNull(),
  understood: text("understood").notNull().default(""),
  knowledgeGap: text("knowledge_gap").notNull().default(""),
  masteryDelta: integer("mastery_delta").notNull().default(0),
  xpEarned: integer("xp_earned").notNull().default(0),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
});
