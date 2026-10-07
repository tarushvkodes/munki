import { defineAction, z, type ActionsModule, type Ctx } from "@hatch/space-sdk";
import { and, asc, desc, eq, gte, isNull, lt, lte } from "drizzle-orm";
import * as schema from "./schema";
import { privileged } from "@space/privileged";

const ratingSchema = z.enum(["again", "hard", "good", "easy"]);
const LESSON_VIDEO_IDS = [
  "phys172-exam2-energy-principle-short", "phys172-exam2-work-short", "phys172-exam2-conservative-short", "phys172-exam2-energy-explainer",
  "lesson15-short", "lesson15-explainer", "lesson16-short", "lesson16-explainer", "lesson17-short", "lesson17-explainer",
  "lesson18-short", "lesson18-explainer", "lesson19-short", "lesson19-explainer",
  "exam2-review-series-short", "exam2-review-strategy-short", "exam2-review-exam2-explainer",
] as const;
const lessonVideoIdSchema = z.enum(LESSON_VIDEO_IDS);
const imageUploadSchema = z.object({
  name: z.string().min(1).max(240),
  mime_type: z.enum(["image/jpeg", "image/png", "image/gif", "image/webp"]),
  size_bytes: z.number().int().positive().max(12_000_000),
  data_base64: z.string(),
});
const cardSchema = z.object({
  id: z.number(),
  deck_id: z.number(),
  front: z.string(),
  back: z.string(),
  worked_video_id: z.string().nullable(),
  front_image_url: z.string().nullable(),
  back_image_url: z.string().nullable(),
  tags: z.string(),
  due_at: z.string(),
  last_reviewed_at: z.string().nullable(),
  interval_minutes: z.number(),
  repetitions: z.number(),
  lapses: z.number(),
  state: z.enum(["new", "learning", "review"]),
});

const questSchema = z.object({
  id: z.enum(["cards", "combo", "blitz", "due_deck", "practice", "focus"]),
  title: z.string(),
  progress: z.number(),
  target: z.number(),
  complete: z.boolean(),
  xp_bonus: z.number(),
});

const tutorAnnotationSchema = z.object({
  kind: z.enum(["circle", "arrow", "label"]),
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  x2: z.number().min(0).max(1).optional(),
  y2: z.number().min(0).max(1).optional(),
  text: z.string().max(48).optional(),
});
const boardCoachResponse = z.object({
  reply: z.string().max(220).regex(/[.!]$/, "The coaching sentence must end with punctuation."),
  question: z.string().max(140).regex(/\?$/, "The coaching question must end with a question mark."),
  annotations: z.array(tutorAnnotationSchema).max(3),
});
const practiceVideoSceneSchema = z.object({
  heading: z.string().min(1).max(70),
  visual: z.string().min(1).max(320),
  narration: z.string().min(1).max(360),
  seconds: z.number().int().min(4).max(24),
});
const practiceQuestionDraftSchema = z.object({
  id: z.string().max(40),
  prompt: z.string().max(500),
  choices: z.array(z.string().max(240)).length(4),
  correct_index: z.number().int().min(0).max(3),
  explanation: z.string().max(420),
  solution_steps: z.array(z.object({ title: z.string().max(70), detail: z.string().max(360) })).min(2).max(7),
  final_answer: z.string().max(280),
  worked_video: z.object({
    title: z.string().max(100),
    scenes: z.array(practiceVideoSceneSchema).min(3).max(7),
  }),
  resource_card_ids: z.array(z.number().int().positive()).max(3),
  lesson_video_ids: z.array(lessonVideoIdSchema).max(2),
});
const generatedPracticeDraftResponse = z.object({
  title: z.string().max(120),
  questions: z.array(practiceQuestionDraftSchema).min(3).max(8),
});
const practiceQuestionSchema = practiceQuestionDraftSchema.extend({
  worked_video: practiceQuestionDraftSchema.shape.worked_video.extend({ duration_seconds: z.number() }),
  resource_cards: z.array(z.object({ id: z.number(), front: z.string(), back: z.string(), worked_video_id: z.string().nullable() })),
});
const generatedPracticeResponse = z.object({
  title: z.string().max(120),
  mode: z.enum(["exam", "topic"]),
  source_label: z.string().max(160),
  questions: z.array(practiceQuestionSchema).min(3).max(8),
});
const practiceGeneratorOptionsResponse = z.object({
  exam_sources: z.array(z.object({ id: z.string(), label: z.string(), card_count: z.number(), released_at: z.string() })),
  sealed_source_count: z.number(),
  topics: z.array(z.string()),
});
const studyOkResponse = z.object({ ok: z.literal(true) });
const gradeResponse = z.object({
  ok: z.boolean(), next_due_at: z.string(), interval_label: z.string(), xp_earned: z.number(),
  quest_bonus_xp: z.number(), combo: z.number(), multiplier: z.number(), total_xp: z.number(),
  level: z.number(), level_up: z.boolean(), perfect_day: z.boolean(), quests: z.array(questSchema),
});
const blitzResponse = z.object({ personal_best: z.number(), yesterday_score: z.number(), beat_yesterday: z.boolean(), new_best: z.boolean(), bonus_xp: z.number(), perfect_day: z.boolean() });
const gameProgressResponse = z.object({
  totalXp: z.number(), bonus: z.number(), perfect: z.boolean(), combo: z.number(), multiplier: z.number(), quests: z.array(questSchema),
});
const labRewardResponse = z.object({
  xp_earned: z.number(), quest_bonus_xp: z.number(), total_xp: z.number(), level: z.number(),
  level_up: z.boolean(), perfect_day: z.boolean(), quests: z.array(questSchema),
});
const practiceSaveResponse = labRewardResponse.extend({ id: z.number() });
const watchRewardResponse = z.object({ awarded: z.boolean(), xp_earned: z.number(), total_xp: z.number(), level: z.number(), level_up: z.boolean() });
const accessoryIdSchema = z.enum(["leaf-cap", "round-glasses", "study-hoodie", "night-sky"]);
const mascotSlotSchema = z.enum(["hat", "glasses", "outfit", "background"]);
const mascotStateResponse = z.object({
  name: z.string(),
  available_xp: z.number(),
  spent_xp: z.number(),
  owned_accessory_ids: z.array(accessoryIdSchema),
  equipped: z.object({ hat: accessoryIdSchema.nullable(), glasses: accessoryIdSchema.nullable(), outfit: accessoryIdSchema.nullable(), background: accessoryIdSchema.nullable() }),
  last_interaction_at: z.string(),
});
const boardSaveResponse = z.object({ ok: z.literal(true), stale: z.boolean(), ink_revision: z.number(), strokes_json: z.string() });
const boardCoachActionResponse = boardCoachResponse.extend({ board_changed: z.boolean() });
const cramCardSchema = cardSchema.extend({
  deck_title: z.string(),
  deck_color: z.string(),
  topic: z.string(),
  priority_reason: z.string(),
  intervals: z.object({ again: z.string(), good: z.string() }),
});
const cramQueueResponse = z.object({
  deck: z.object({ id: z.number(), title: z.string(), color: z.string() }),
  target_date: z.string(),
  days_remaining: z.number(),
  urgency: z.enum(["today", "high", "steady"]),
  estimated_minutes: z.number(),
  cards: z.array(cramCardSchema),
});

const teachEvaluationSchema = z.object({
  student_reply: z.string().min(1).max(320),
  question: z.string().min(1).max(180).regex(/\?$/, "Munki's question must end with a question mark."),
  understood: z.string().min(1).max(200),
  knowledge_gap: z.string().max(200),
  teaching_quality: z.number().int().min(1).max(5),
});
const teachTopicSchema = z.object({
  id: z.number(), deck_id: z.number(), deck_title: z.string(), topic: z.string(), mastery: z.number(),
  decay_points: z.number(), total_sessions: z.number(), last_taught_at: z.string().nullable(),
});
const teachSessionSchema = z.object({
  id: z.number(), topic_id: z.number(), topic: z.string(), student_reply: z.string(), question: z.string(),
  understood: z.string(), knowledge_gap: z.string(), mastery_delta: z.number(), xp_earned: z.number(), created_at: z.string(),
});
const teachStateResponse = z.object({
  settings: z.object({ class_time: z.string().nullable(), reminder_enabled: z.boolean() }),
  streak: z.number(), class_completed_today: z.boolean(),
  topics: z.array(teachTopicSchema), recent_sessions: z.array(teachSessionSchema),
});
const teachReplyResponse = z.object({
  session_id: z.number(), student_reply: z.string(), question: z.string(), understood: z.string(), knowledge_gap: z.string(),
  mastery: z.number(), mastery_delta: z.number(), xp_earned: z.number(), total_xp: z.number(), combo: z.number(), streak: z.number(),
});
const studyHourClassSchema = z.enum(["MA 162", "PHYS 172", "CNIT 182"]);
const studyHourPhaseIdSchema = z.enum(["learn", "drill", "practice", "teach", "lock"]);
const studyHourPhaseStatusSchema = z.enum(["pending", "active", "done", "skipped"]);
const studyHourTopicSchema = z.object({
  class_name: studyHourClassSchema, assessment: z.string(), assessment_date: z.string(), label: z.string(), urgency: z.enum(["now", "building"]), deck_id: z.number().nullable(),
});
const studyHourResponse = z.object({
  date_key: z.string(), class_name: studyHourClassSchema, status: z.enum(["not_started", "active", "complete"]), current_phase: z.number().int().min(0).max(4),
  phase_started_at: z.string().nullable(), started_at: z.string().nullable(), completed_at: z.string().nullable(),
  phases: z.array(z.object({ id: studyHourPhaseIdSchema, label: z.string(), minutes: z.number(), status: studyHourPhaseStatusSchema })).length(5),
  topic: studyHourTopicSchema, completed_count: z.number(), skipped_count: z.number(), xp_earned: z.number(), combo: z.number(),
});
const studyHourListResponse = z.object({ hours: z.array(studyHourResponse).length(3) });

const lessonContentSchema = z.object({
  id: z.string().min(1).max(120),
  course: z.string().min(1).max(60),
  unit: z.string().min(1).max(120),
  title: z.string().min(1).max(160),
  exam_tag: z.string().max(120),
  source: z.string().max(240).optional(),
  learn: z.array(z.object({ heading: z.string().max(160), body_md: z.string().max(4000) })).min(1),
  drill: z.array(z.object({ front: z.string().max(2000), back: z.string().max(3000) })).min(1),
  practice: z.array(z.object({ problem: z.string().max(3000), setup_hint: z.string().max(3000), solution: z.string().max(6000), watch_video: z.string().nullable().optional() })).min(1),
  teach: z.object({ intro: z.string().max(1200), monkey_prompts: z.array(z.string().max(1200)).min(1) }),
  lockin: z.array(z.object({ prompt: z.string().max(2000), answer: z.string().max(3000) })).min(1),
});
const lessonProgressSchema = z.object({
  status: z.enum(["not_started", "active", "complete"]),
  current_phase: z.number().int().min(0).max(4),
  phase_progress_json: z.string(), mastery: z.number().int().min(0).max(1000),
  board_strokes_json: z.string(), xp_earned: z.number().int().nonnegative(),
  started_at: z.string().nullable(), completed_at: z.string().nullable(),
});
const lessonLibraryResponse = z.object({ lessons: z.array(lessonContentSchema.extend({ progress: lessonProgressSchema })) });
const lessonPhaseResponse = z.object({ progress: lessonProgressSchema, xp_earned: z.number().int().nonnegative(), combo: z.number().int().nonnegative(), level_up: z.boolean() });
const lessonTeachResponse = z.object({
  student_reply: z.string(), question: z.string(), understood: z.string(), knowledge_gap: z.string(), teaching_quality: z.number().int().min(1).max(5),
});
const munkiPackageResponse = z.object({
  download_url: z.string(),
  file_name: z.string(),
  generated_at: z.string(),
  counts: z.object({
    decks: z.number().int().nonnegative(), cards: z.number().int().nonnegative(), reviews: z.number().int().nonnegative(),
    lessons: z.number().int().nonnegative(), lesson_progress: z.number().int().nonnegative(), study_sessions: z.number().int().nonnegative(),
    practice_attempts: z.number().int().nonnegative(), teaching_sessions: z.number().int().nonnegative(), study_hours: z.number().int().nonnegative(),
    attachments: z.number().int().nonnegative(), watch_videos: z.number().int().nonnegative(),
  }),
});

let gameMutationTail: Promise<void> = Promise.resolve();
async function withGameMutationLock<T>(work: () => Promise<T>): Promise<T> {
  const previous = gameMutationTail;
  let release: () => void = () => undefined;
  gameMutationTail = new Promise<void>((resolve) => { release = resolve; });
  await previous.catch(() => undefined);
  try { return await work(); } finally { release(); }
}

function safeAnnotations(value: string): z.infer<typeof tutorAnnotationSchema>[] {
  try {
    const parsed: unknown = JSON.parse(value);
    return z.array(tutorAnnotationSchema).safeParse(parsed).data ?? [];
  } catch { return []; }
}

function levelInfo(totalXp: number) {
  const level = Math.floor(totalXp / 500) + 1;
  return { level, level_xp: totalXp % 500, next_level_xp: 500 };
}

function comboMultiplier(combo: number) {
  if (combo >= 20) return 5;
  if (combo >= 10) return 3;
  if (combo >= 5) return 2;
  return 1;
}

function hashMix(id: number, seed: number) {
  let value = (id * 2654435761 + seed * 1597334677) >>> 0;
  value ^= value >>> 16;
  value = Math.imul(value, 2246822507) >>> 0;
  value ^= value >>> 13;
  return value >>> 0;
}

const QUEST_BITS = { cards: 1, combo: 2, blitz: 4, due_deck: 8, practice: 16, focus: 32 } as const;

const M2_PROJECT_FAILURE_ORIGINAL_ANSWER = "Code errors are the largest cause (38.33%), followed by design errors (24.17%), documentation errors (13.33%), requirement errors (12.5%), and bad-fix errors (11.67%). Success comes from user involvement, executive management support, clear requirements, and proper planning.";
const M2_PROJECT_FAILURE_SPLIT = [
  {
    front: "In the M2 error data, which error category is the largest single cause of project failures?",
    back: "Code errors — 38.33%.",
  },
  {
    front: "Rank these by share of project failures, largest to smallest: bad-fix errors, design errors, documentation errors, requirement errors.",
    back: "Design errors 24.17% > documentation errors 13.33% > requirement errors 12.5% > bad-fix errors 11.67%.",
  },
  {
    front: "Name the four project success factors from M2.",
    back: "User involvement, executive management support, clear requirements, proper planning.",
  },
] as const;

const CALC2_LEARNING_REWRITES = [
  { id: 328, front: String.raw`\[\int \frac{x^3+2x}{x^2}\,dx\]
What’s the first move?`, back: String.raw`Divide term-by-term first: \(x^3/x^2+2x/x^2=x+2/x\).`, workedVideoId: "lesson17-short" },
  { id: 329, front: String.raw`\[\int \frac{dx}{x^2+1}\]
What’s the trap?`, back: String.raw`Don’t use real partial fractions; \(x^2+1\) signals the inverse-tangent rule.`, workedVideoId: "lesson17-short" },
  { id: 324, front: String.raw`\[\int(2x+1)(x-3)\,dx\]
What’s the setup?`, back: String.raw`Expand first to \(2x^2-5x-3\), then integrate term-by-term.`, workedVideoId: "lesson17-short" },
  { id: 400, front: String.raw`\[\int_1^\infty e^{-x^2}\,dx\]
Which test?`, back: String.raw`Direct comparison: for \(x\ge1\), compare \(e^{-x^2}\) with the convergent \(e^{-x}\).`, workedVideoId: "lesson17-short" },
  { id: 409, front: String.raw`\[\int x^2\ln(x)\,dx\]
Which method?`, back: String.raw`Integration by parts with \(u=\ln x\) and \(dv=x^2dx\).`, workedVideoId: "lesson17-short" },
  { id: 326, front: String.raw`\[\int \frac{x+1}{x^2-4}\,dx\]
What’s the setup?`, back: String.raw`Factor \(x^2-4=(x-2)(x+2)\), then set up \(A/(x-2)+B/(x+2)\).`, workedVideoId: "lesson16-explainer" },
  { id: 371, front: String.raw`With \(x=2\sin\theta\), why may \(\sqrt{4\cos^2\theta}\) become \(2\cos\theta\)?`, back: String.raw`Choose \(\theta\in[-\pi/2,\pi/2]\), where \(\cos\theta\ge0\).`, workedVideoId: "lesson15-explainer" },
  { id: 373, front: String.raw`\[\int \frac{x+2}{x^3-x}\,dx\]
What’s the setup?`, back: String.raw`Factor \(x(x-1)(x+1)\), then use \(A/x+B/(x-1)+C/(x+1)\).`, workedVideoId: "lesson16-explainer" },
  { id: 387, front: String.raw`\[\int_0^1 \frac{dx}{x}\]
What’s the trap?`, back: String.raw`It is Type 2 improper because the integrand blows up at the endpoint \(x=0\).`, workedVideoId: "lesson17-short" },
  { id: 384, front: String.raw`\[\frac{x}{x^2+4}\]
What numerator belongs over this irreducible quadratic?`, back: String.raw`Use a linear numerator: \((Ax+B)/(x^2+4)\), not a constant alone.`, workedVideoId: "lesson17-explainer" },
  { id: 325, front: String.raw`\[\int xe^{x^2}dx\]
Which method?`, back: String.raw`Use \(u\)-substitution with \(u=x^2\); the factor \(x\) matches its derivative.`, workedVideoId: "lesson17-short" },
  { id: 357, front: String.raw`\[\int \frac{dx}{\sqrt{9-x^2}}\]
What’s the setup?`, back: String.raw`Use trig substitution \(x=3\sin\theta\).`, workedVideoId: "lesson15-explainer" },
  { id: 341, front: String.raw`\[\int xe^{x^2}dx\]
What’s the trap?`, back: String.raw`Don’t use parts; \(u=x^2\) is the direct chain-rule match.`, workedVideoId: "lesson17-short" },
  { id: 334, front: String.raw`\[\int x^2e^x\,dx\]
Which method?`, back: String.raw`Use tabular integration by parts; the polynomial reaches zero after two rounds.`, workedVideoId: "lesson17-short" },
  { id: 393, front: String.raw`\[\int_1^\infty \frac{2x+1}{x^3+5}\,dx\]
Which comparison?`, back: String.raw`Compare with \(1/x^2\), since the dominant-term ratio behaves like \(2/x^2\).`, workedVideoId: "lesson17-short" },
  { id: 336, front: String.raw`\[\int \ln(x)\,dx\]
What’s the setup?`, back: String.raw`Use parts with \(u=\ln x\) and \(dv=dx\).`, workedVideoId: "lesson17-short" },
  { id: 337, front: String.raw`\[\int \arctan(x)\,dx\]
What’s the setup?`, back: String.raw`Use parts with \(u=\arctan x\) and \(dv=dx\).`, workedVideoId: "lesson17-short" },
  { id: 350, front: String.raw`\[\int \sec(x)\,dx\]
What’s the trick?`, back: String.raw`Multiply by \((\sec x+\tan x)/(\sec x+\tan x)\) to create a log derivative.`, workedVideoId: "lesson17-short" },
  { id: 351, front: String.raw`\[\int \sec^3(x)\,dx\]
Which method?`, back: String.raw`Use cyclic integration by parts with \(u=\sec x\) and \(dv=\sec^2x\,dx\).`, workedVideoId: "lesson17-short" },
  { id: 354, front: String.raw`\[\int_0^{\pi/2}\sin^3(x)\,dx\]
What’s the setup?`, back: String.raw`Save one \(\sin x\), rewrite \(\sin^2x=1-\cos^2x\), then use \(u=\cos x\).`, workedVideoId: "lesson15-explainer" },
  { id: 368, front: String.raw`\[\int \frac{dx}{(x^2+4)^{3/2}}\]
What’s the setup?`, back: String.raw`Use \(x=2\tan\theta\), because the denominator hides the \(\sqrt{x^2+a^2}\) form.`, workedVideoId: "lesson15-explainer" },
  { id: 380, front: String.raw`\[\int \frac{Ax+B}{x^2+a^2}\,dx\]
What’s the first move?`, back: String.raw`Split the \(Ax\) term for substitution from the \(B\) term for the arctangent rule.`, workedVideoId: "lesson17-explainer" },
  { id: 386, front: String.raw`\[\int \frac{dx}{x^2+6x+13}\]
What’s the first move?`, back: String.raw`Complete the square: \(x^2+6x+13=(x+3)^2+4\).`, workedVideoId: "lesson17-explainer" },
  { id: 391, front: String.raw`\[\int_0^1 \frac{dx}{\sqrt{x}}\]
Which rule decides convergence?`, back: String.raw`The near-zero \(p\)-rule: \(p=1/2<1\), so it converges.`, workedVideoId: "lesson17-short" },
  { id: 394, front: String.raw`\[\int_1^\infty \frac{dx}{x^2+1}\]
What should you compare with?`, back: String.raw`Compare with \(1/x^2\); comparing with divergent \(1/x\) proves nothing.`, workedVideoId: "lesson17-short" },
  { id: 396, front: String.raw`\[\int_{-\infty}^{\infty}\frac{x}{1+x^2}\,dx\]
What’s the trap?`, back: String.raw`Don’t use odd symmetry; split at zero and require both improper halves to converge.`, workedVideoId: "lesson17-short" },
  { id: 397, front: String.raw`\[\int_2^\infty \frac{dx}{x^2-1}\]
Which comparison?`, back: String.raw`For \(x\ge2\), compare with \(2/x^2\) to prove convergence.`, workedVideoId: "lesson17-short" },
  { id: 398, front: String.raw`\[\int_0^1 \frac{dx}{x+x^3}\]
Which comparison?`, back: String.raw`Near zero, compare from below with \(1/(2x)\) to prove divergence.`, workedVideoId: "lesson17-short" },
  { id: 401, front: String.raw`\[\int_{-1}^{1}\frac{dx}{x^2}\]
What’s the trap?`, back: String.raw`Split at \(x=0\); one antiderivative evaluation across the discontinuity is invalid.`, workedVideoId: "lesson17-short" },
  { id: 403, front: String.raw`\[\int e^{\sqrt{x}}\,dx\]
What’s the first move?`, back: String.raw`Substitute \(u=\sqrt{x}\) first; the resulting \(2ue^u\) then uses parts.`, workedVideoId: "lesson17-short" },
  { id: 406, front: String.raw`\[\int_0^\infty xe^{-x}\,dx\]
Which method?`, back: String.raw`Use integration by parts inside the Type 1 improper-limit setup.`, workedVideoId: "lesson17-short" },
  { id: 407, front: String.raw`\[\int \sin^2x\cos^2x\,dx\]
What’s the setup?`, back: String.raw`Use power reduction: \(\sin^2x\cos^2x=\tfrac18(1-\cos4x)\).`, workedVideoId: "lesson15-explainer" },
  { id: 408, front: String.raw`\[\int \frac{x^2}{\sqrt{4-x^2}}\,dx\]
What’s the setup?`, back: String.raw`Use \(x=2\sin\theta\); the extra \(x^2\) does not change the radical pattern.`, workedVideoId: "lesson15-explainer" },
  { id: 385, front: String.raw`\[\int \frac{2x+3}{x^2+4}\,dx\]
What’s the first move?`, back: String.raw`Split into \(2x/(x^2+4)\) for substitution and \(3/(x^2+4)\) for arctangent.`, workedVideoId: "lesson17-explainer" },
] as const;

type QuestId = keyof typeof QUEST_BITS;

function questIdsFor(dateKey: string): QuestId[] {
  const pool: QuestId[] = ["cards", "practice", "focus", "combo", "blitz", "due_deck"];
  const offset = [...dateKey].reduce((sum, char) => sum + char.charCodeAt(0), 0) % pool.length;
  return Array.from({ length: 3 }, (_, index) => pool[(offset + index) % pool.length] ?? "cards");
}

function questsFor(day: typeof schema.activityDays.$inferSelect | null, dateKey: string) {
  const cards = day?.cardsGraded ?? 0;
  const combo = day?.bestCombo ?? 0;
  const blitz = day?.blitzRuns ?? 0;
  const dueDecks = day?.dueDeckClears ?? 0;
  const practice = day?.practiceSessions ?? 0;
  const focus = day?.focusSessions ?? 0;
  const definitions = {
    cards: { id: "cards" as const, title: "Grade 15 cards", progress: Math.min(cards, 15), target: 15, complete: cards >= 15, xp_bonus: 40 },
    combo: { id: "combo" as const, title: "Hit a 10 combo", progress: Math.min(combo, 10), target: 10, complete: combo >= 10, xp_bonus: 40 },
    blitz: { id: "blitz" as const, title: "Complete a Blitz", progress: Math.min(blitz, 1), target: 1, complete: blitz >= 1, xp_bonus: 40 },
    due_deck: { id: "due_deck" as const, title: "Clear one deck’s due cards", progress: Math.min(dueDecks, 1), target: 1, complete: dueDecks >= 1, xp_bonus: 40 },
    practice: { id: "practice" as const, title: "Finish a practice set", progress: Math.min(practice, 1), target: 1, complete: practice >= 1, xp_bonus: 40 },
    focus: { id: "focus" as const, title: "Complete a focus session", progress: Math.min(focus, 1), target: 1, complete: focus >= 1, xp_bonus: 40 },
  };
  return questIdsFor(dateKey).map((id) => definitions[id]);
}

function selectedQuestMask(dateKey: string) {
  return questIdsFor(dateKey).reduce((mask, id) => mask | QUEST_BITS[id], 0);
}

async function getOrCreateProfile(ctx: Ctx) {
  const db = ctx.db<typeof schema>();
  const rows = await db.select().from(schema.gameProfile).where(eq(schema.gameProfile.id, 1)).limit(1);
  const existing = rows[0];
  if (existing) return existing;
  const now = new Date();
  await db.insert(schema.gameProfile).values({ id: 1, soundEnabled: true, updatedAt: now });
  return { id: 1, totalXp: 0, currentCombo: 0, bestCombo: 0, blitzBest: 0, soundEnabled: true, dailyNudgeEnabled: false, updatedAt: now };
}

const MASCOT_ACCESSORIES = {
  "leaf-cap": { slot: "hat", price: 80 },
  "round-glasses": { slot: "glasses", price: 120 },
  "study-hoodie": { slot: "outfit", price: 180 },
  "night-sky": { slot: "background", price: 240 },
} as const;

type AccessoryId = keyof typeof MASCOT_ACCESSORIES;
type MascotSlot = "hat" | "glasses" | "outfit" | "background";

function ownedAccessories(value: string): AccessoryId[] {
  try {
    const parsed: unknown = JSON.parse(value);
    return z.array(accessoryIdSchema).safeParse(parsed).data ?? [];
  } catch { return []; }
}

async function getOrCreateMascotProfile(ctx: Ctx) {
  const db = ctx.db<typeof schema>();
  const rows = await db.select().from(schema.mascotProfile).where(eq(schema.mascotProfile.id, 1)).limit(1);
  const existing = rows[0];
  if (existing) return existing;
  const now = new Date();
  await db.insert(schema.mascotProfile).values({ id: 1, name: "Munki", lastInteractionAt: now, updatedAt: now });
  return {
    id: 1, name: "Munki", spentXp: 0, ownedAccessoryIdsJson: "[]",
    equippedHat: null, equippedGlasses: null, equippedOutfit: null, equippedBackground: null,
    lastInteractionAt: now, updatedAt: now,
  };
}

async function serializeMascotState(ctx: Ctx, mascot: typeof schema.mascotProfile.$inferSelect): Promise<z.infer<typeof mascotStateResponse>> {
  const game = await getOrCreateProfile(ctx);
  const owned = ownedAccessories(mascot.ownedAccessoryIdsJson);
  const ownedSet = new Set(owned);
  const validEquipped = (value: string | null, slot: MascotSlot): AccessoryId | null => {
    const parsed = accessoryIdSchema.safeParse(value);
    if (!parsed.success || !ownedSet.has(parsed.data) || MASCOT_ACCESSORIES[parsed.data].slot !== slot) return null;
    return parsed.data;
  };
  return {
    name: mascot.name,
    available_xp: Math.max(0, game.totalXp - mascot.spentXp),
    spent_xp: mascot.spentXp,
    owned_accessory_ids: owned,
    equipped: {
      hat: validEquipped(mascot.equippedHat, "hat"),
      glasses: validEquipped(mascot.equippedGlasses, "glasses"),
      outfit: validEquipped(mascot.equippedOutfit, "outfit"),
      background: validEquipped(mascot.equippedBackground, "background"),
    },
    last_interaction_at: mascot.lastInteractionAt.toISOString(),
  };
}

async function getDay(ctx: Ctx, dateKey: string) {
  const rows = await ctx.db<typeof schema>().select().from(schema.activityDays).where(eq(schema.activityDays.dateKey, dateKey)).limit(1);
  return rows[0] ?? null;
}

async function applyGameProgress(ctx: Ctx, input: { mutationUuid: string; kind: "grade" | "blitz" | "practice" | "focus" | "watch" | "teach" | "study_hour" | "lesson"; dateKey: string; xp: number; knew: boolean; combo: number; blitzRun?: boolean; blitzScore?: number; clearDueDeck?: boolean; practiceRun?: boolean; focusSession?: boolean }): Promise<z.infer<typeof gameProgressResponse>> {
  const db = ctx.db<typeof schema>();
  const priorRows = await db.select().from(schema.gameMutations).where(eq(schema.gameMutations.mutationUuid, input.mutationUuid)).limit(1);
  const prior = priorRows[0];
  if (prior?.resultJson) {
    const parsed = gameProgressResponse.safeParse(JSON.parse(prior.resultJson));
    if (parsed.success) return parsed.data;
  }
  const profile = await getOrCreateProfile(ctx);
  const day = await getDay(ctx, input.dateKey);
  const isGrade = input.kind === "grade";
  const nextCards = (day?.cardsGraded ?? 0) + (isGrade ? 1 : 0);
  const nextKnew = (day?.knewCount ?? 0) + (isGrade && input.knew ? 1 : 0);
  const nextBestCombo = Math.max(day?.bestCombo ?? 0, input.combo);
  const nextBlitzRuns = (day?.blitzRuns ?? 0) + (input.blitzRun ? 1 : 0);
  const nextBlitzBest = Math.max(day?.blitzBestScore ?? 0, input.blitzScore ?? 0);
  const nextDueDeckClears = (day?.dueDeckClears ?? 0) + (input.clearDueDeck ? 1 : 0);
  const nextPracticeSessions = (day?.practiceSessions ?? 0) + (input.practiceRun ? 1 : 0);
  const nextFocusSessions = (day?.focusSessions ?? 0) + (input.focusSession ? 1 : 0);
  const selectedMask = selectedQuestMask(input.dateKey);
  const completedMask = (nextCards >= 15 ? QUEST_BITS.cards : 0)
    | (nextBestCombo >= 10 ? QUEST_BITS.combo : 0)
    | (nextBlitzRuns >= 1 ? QUEST_BITS.blitz : 0)
    | (nextDueDeckClears >= 1 ? QUEST_BITS.due_deck : 0)
    | (nextPracticeSessions >= 1 ? QUEST_BITS.practice : 0)
    | (nextFocusSessions >= 1 ? QUEST_BITS.focus : 0);
  const previousMask = day?.questClaimMask ?? 0;
  const newlyCompletedMask = completedMask & selectedMask & ~previousMask;
  const newlyCompletedCount = [1, 2, 4, 8, 16, 32].filter((bit) => (newlyCompletedMask & bit) !== 0).length;
  const mask = previousMask | (completedMask & selectedMask);
  let bonus = newlyCompletedCount * 40;
  const perfect = (mask & selectedMask) === selectedMask;
  if (perfect && !(day?.perfect ?? false)) bonus += 100;
  const gained = input.xp + bonus;
  const now = new Date();
  if (day) {
    await db.update(schema.activityDays).set({
      xpEarned: day.xpEarned + gained, cardsGraded: nextCards, knewCount: nextKnew,
      bestCombo: nextBestCombo, blitzRuns: nextBlitzRuns, blitzBestScore: nextBlitzBest,
      dueDeckClears: nextDueDeckClears, practiceSessions: nextPracticeSessions, focusSessions: nextFocusSessions,
      questClaimMask: mask, perfect, updatedAt: now,
    }).where(eq(schema.activityDays.dateKey, input.dateKey));
  } else {
    await db.insert(schema.activityDays).values({
      dateKey: input.dateKey, xpEarned: gained, cardsGraded: nextCards, knewCount: nextKnew,
      bestCombo: nextBestCombo, blitzRuns: nextBlitzRuns, blitzBestScore: nextBlitzBest,
      dueDeckClears: nextDueDeckClears, practiceSessions: nextPracticeSessions, focusSessions: nextFocusSessions,
      questClaimMask: mask, perfect, updatedAt: now,
    });
  }
  const totalXp = profile.totalXp + gained;
  await db.update(schema.gameProfile).set({
    totalXp, currentCombo: input.combo, bestCombo: Math.max(profile.bestCombo, input.combo), updatedAt: now,
  }).where(eq(schema.gameProfile.id, 1));
  const result: z.infer<typeof gameProgressResponse> = { totalXp, bonus, perfect, combo: input.combo, multiplier: comboMultiplier(input.combo), quests: questsFor({
    dateKey: input.dateKey, xpEarned: (day?.xpEarned ?? 0) + gained, cardsGraded: nextCards,
    knewCount: nextKnew, bestCombo: nextBestCombo, blitzRuns: nextBlitzRuns,
    blitzBestScore: nextBlitzBest, dueDeckClears: nextDueDeckClears,
    practiceSessions: nextPracticeSessions, focusSessions: nextFocusSessions,
    questClaimMask: mask, perfect, updatedAt: now,
  }, input.dateKey) };
  await db.insert(schema.gameMutations).values({ mutationUuid: input.mutationUuid, kind: input.kind, resultJson: JSON.stringify(result), createdAt: now }).onConflictDoNothing();
  return result;
}

function cardState(repetitions: number, intervalMinutes: number): "new" | "learning" | "review" {
  if (repetitions === 0 && intervalMinutes === 0) return "new";
  if (intervalMinutes < 1440) return "learning";
  return "review";
}

function intervalFor(rating: z.infer<typeof ratingSchema>, current: number, repetitions: number, ease: number) {
  if (rating === "again") return 10;
  if (rating === "hard") return repetitions === 0 ? 60 : Math.max(720, Math.round(current * 1.2));
  if (rating === "good") {
    if (repetitions === 0) return 1440;
    if (repetitions === 1) return 4320;
    return Math.max(1440, Math.round(current * (ease / 1000)));
  }
  if (repetitions === 0) return 5760;
  return Math.max(5760, Math.round(current * (ease / 1000) * 1.3));
}

function intervalLabel(minutes: number) {
  if (minutes < 60) return `${minutes}m`;
  if (minutes < 1440) return `${Math.round(minutes / 60)}h`;
  const days = Math.round(minutes / 1440);
  if (days < 30) return `${days}d`;
  return `${Math.round(days / 30)}mo`;
}

function dayNumber(key: string) {
  const [year = 1970, month = 1, day = 1] = key.split("-").map(Number);
  return Math.floor(Date.UTC(year, month - 1, day) / 86_400_000);
}

function dateKeyShift(key: string, offset: number) {
  const date = new Date((dayNumber(key) + offset) * 86_400_000);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function effectiveMastery(row: typeof schema.teachingTopics.$inferSelect, todayKey: string) {
  if (!row.lastTaughtDateKey) return { mastery: row.masteryPermille, decay: 0 };
  const skippedDays = Math.max(0, dayNumber(todayKey) - dayNumber(row.lastTaughtDateKey) - 1);
  const decay = Math.min(row.masteryPermille, skippedDays * 60);
  return { mastery: row.masteryPermille - decay, decay };
}

function teachingStreak(dateKeys: string[], todayKey: string) {
  const unique = new Set(dateKeys);
  let cursor = unique.has(todayKey) ? todayKey : dateKeyShift(todayKey, -1);
  let streak = 0;
  while (unique.has(cursor)) { streak += 1; cursor = dateKeyShift(cursor, -1); }
  return streak;
}

async function getOrCreateTeachingSettings(ctx: Ctx) {
  const db = ctx.db<typeof schema>();
  const rows = await db.select().from(schema.teachingSettings).where(eq(schema.teachingSettings.id, 1)).limit(1);
  const existing = rows[0];
  if (existing) return existing;
  const now = new Date();
  await db.insert(schema.teachingSettings).values({ id: 1, reminderEnabled: true, updatedAt: now });
  return { id: 1, dailyClassTime: null, reminderEnabled: true, updatedAt: now };
}

type ExamSource = { id: string; label: string; releasedAt: string; cards: (typeof schema.cards.$inferSelect)[] };

function tagParts(tags: string) {
  return tags.split(/[,;|]/).map((part) => part.trim()).filter(Boolean);
}

function examMetadata(row: typeof schema.cards.$inferSelect): { label: string; releasedAt: string } | null {
  const parts = tagParts(row.tags);
  const sourcePart = parts.find((part) => /^(?:released[-_ ]?exam|exam)\s*[:=]/i.test(part));
  const datePart = parts.find((part) => /^released[-_ ]?at\s*[:=]\s*\d{4}-\d{2}-\d{2}$/i.test(part));
  if (!sourcePart || !datePart) return null;
  const label = sourcePart.replace(/^(?:released[-_ ]?exam|exam)\s*[:=]\s*/i, "").trim();
  const releasedAt = datePart.replace(/^released[-_ ]?at\s*[:=]\s*/i, "").trim();
  return label && /^\d{4}-\d{2}-\d{2}$/.test(releasedAt) ? { label, releasedAt } : null;
}

function examSourcesForCards(cards: (typeof schema.cards.$inferSelect)[]) {
  const grouped = new Map<string, ExamSource>();
  for (const card of cards) {
    const meta = examMetadata(card);
    if (!meta) continue;
    const id = `${meta.releasedAt}:${meta.label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;
    const existing = grouped.get(id);
    if (existing) existing.cards.push(card);
    else grouped.set(id, { id, label: meta.label, releasedAt: meta.releasedAt, cards: [card] });
  }
  const ordered = [...grouped.values()].sort((a, b) => b.releasedAt.localeCompare(a.releasedAt) || b.label.localeCompare(a.label));
  return { sealed: ordered.slice(0, 2), eligible: ordered.slice(2) };
}

function contentTags(row: typeof schema.cards.$inferSelect) {
  return tagParts(row.tags).filter((tag) => !/^(?:released[-_ ]?exam|exam|released[-_ ]?at)\s*[:=]/i.test(tag));
}

function courseForDeckTitle(title: string): "MA 162" | "PHYS 172" | "CNIT 182" | null {
  if (/(?:MA\s*162|Calculus\s*II|Calc\s*2)/i.test(title)) return "MA 162";
  if (/(?:PHYS\s*172|Physics)/i.test(title)) return "PHYS 172";
  if (/CNIT\s*182/i.test(title)) return "CNIT 182";
  return null;
}

function courseForVideo(videoId: string): "MA 162" | "PHYS 172" | null {
  return videoId.startsWith("phys172-") ? "PHYS 172" : LESSON_VIDEO_IDS.includes(videoId as (typeof LESSON_VIDEO_IDS)[number]) ? "MA 162" : null;
}

function workedVideoForCard(row: typeof schema.cards.$inferSelect, deckTitle: string): string | null {
  // A video belongs to a card only when the card explicitly opts in *and* the
  // attached video belongs to the same course. Card IDs and free-form tags can
  // both survive imports, so neither is enough to route a learner by itself.
  const match = row.tags.match(/(?:^|[\s,;|])worked-video:([a-z0-9-]+)(?=$|[\s,;|])/i);
  const videoId = match?.[1] ?? null;
  if (!videoId || !LESSON_VIDEO_IDS.includes(videoId as (typeof LESSON_VIDEO_IDS)[number])) return null;
  const deckCourse = courseForDeckTitle(deckTitle);
  const videoCourse = courseForVideo(videoId);
  return deckCourse !== null && deckCourse === videoCourse ? videoId : null;
}

async function serializeCard(ctx: Ctx, row: typeof schema.cards.$inferSelect, deckTitle: string) {
  return {
    id: row.id,
    deck_id: row.deckId,
    front: row.front,
    back: row.back,
    worked_video_id: workedVideoForCard(row, deckTitle),
    front_image_url: row.frontImageBlobKey ? await ctx.blobs.getUrl(row.frontImageBlobKey) : null,
    back_image_url: row.backImageBlobKey ? await ctx.blobs.getUrl(row.backImageBlobKey) : null,
    tags: row.tags,
    due_at: row.dueAt.toISOString(),
    last_reviewed_at: row.lastReviewedAt?.toISOString() ?? null,
    interval_minutes: row.intervalMinutes,
    repetitions: row.repetitions,
    lapses: row.lapses,
    state: cardState(row.repetitions, row.intervalMinutes),
  };
}

async function storeCardImage(ctx: Ctx, cardId: number, side: "front" | "back", image: z.infer<typeof imageUploadSchema>) {
  const bytes = Buffer.from(image.data_base64, "base64");
  if (bytes.byteLength !== image.size_bytes) throw new Error("The uploaded image was incomplete.");
  const key = `card-images/${cardId}/${side}/${crypto.randomUUID()}`;
  await ctx.blobs.put(key, bytes, { contentType: image.mime_type });
  return key;
}

const STUDY_HOUR_PHASES = [
  { id: "learn" as const, label: "Learn", minutes: 15 },
  { id: "drill" as const, label: "Drill", minutes: 15 },
  { id: "practice" as const, label: "Practice", minutes: 15 },
  { id: "teach" as const, label: "Teach", minutes: 10 },
  { id: "lock" as const, label: "Lock in", minutes: 5 },
] as const;

function studyHourStatuses(value: string | null): z.infer<typeof studyHourPhaseStatusSchema>[] {
  if (!value) return ["active", "pending", "pending", "pending", "pending"];
  try {
    const parsed = z.array(studyHourPhaseStatusSchema).length(5).safeParse(JSON.parse(value));
    return parsed.success ? parsed.data : ["active", "pending", "pending", "pending", "pending"];
  } catch { return ["active", "pending", "pending", "pending", "pending"]; }
}

const STUDY_HOUR_CLASSES = ["MA 162", "PHYS 172", "CNIT 182"] as const;
type StudyHourClass = (typeof STUDY_HOUR_CLASSES)[number];

async function studyHourTopics(ctx: Ctx): Promise<Record<StudyHourClass, z.infer<typeof studyHourTopicSchema>>> {
  const decks = await ctx.db<typeof schema>().select().from(schema.decks);
  const mathDeck = decks.find((deck) => /ma\s*162|calc(?:ulus)?\s*2/i.test(deck.title));
  const physicsDeck = decks.find((deck) => /phys\s*172|physics/i.test(deck.title));
  const cnitDeck = decks.find((deck) => /cnit\s*182/i.test(deck.title) && /lab\s*exam\s*i(?!i)/i.test(deck.title))
    ?? decks.find((deck) => /cnit\s*182/i.test(deck.title));
  return {
    "MA 162": { class_name: "MA 162", assessment: "Quiz 5", assessment_date: "2026-10-08", label: "Lessons 15–17 · trig substitution II · partial fractions I & II", urgency: "now", deck_id: mathDeck?.id ?? null },
    "PHYS 172": { class_name: "PHYS 172", assessment: "Exam 2", assessment_date: "2026-10-28", label: "Exam 2 preparation", urgency: "building", deck_id: physicsDeck?.id ?? null },
    "CNIT 182": { class_name: "CNIT 182", assessment: "Lab Exam I", assessment_date: "2026-10-07", label: "Lab Exam I prep · OOP concepts, diagrams, and lab workflows", urgency: "now", deck_id: cnitDeck?.id ?? null },
  };
}

function studyHourId(dateKey: string, className: StudyHourClass) {
  return `${dateKey}:${className}`;
}

async function serializeStudyHour(ctx: Ctx, dateKey: string, className: StudyHourClass, row: typeof schema.dailySubjectStudyHours.$inferSelect | null, topics?: Record<StudyHourClass, z.infer<typeof studyHourTopicSchema>>): Promise<z.infer<typeof studyHourResponse>> {
  const statuses = row ? studyHourStatuses(row.phaseStatusesJson) : ["pending", "pending", "pending", "pending", "pending"] satisfies z.infer<typeof studyHourPhaseStatusSchema>[];
  let xpEarned = 0;
  let combo = (await getOrCreateProfile(ctx)).currentCombo;
  if (row?.resultJson) {
    const parsed = z.object({ xp_earned: z.number(), combo: z.number() }).safeParse(JSON.parse(row.resultJson));
    if (parsed.success) { xpEarned = parsed.data.xp_earned; combo = parsed.data.combo; }
  }
  const topicMap = topics ?? await studyHourTopics(ctx);
  return {
    date_key: dateKey,
    class_name: className,
    status: row?.completedAt ? "complete" : row ? "active" : "not_started",
    current_phase: row?.currentPhase ?? 0,
    phase_started_at: row?.phaseStartedAt?.toISOString() ?? null,
    started_at: row?.startedAt.toISOString() ?? null,
    completed_at: row?.completedAt?.toISOString() ?? null,
    phases: STUDY_HOUR_PHASES.map((phase, index) => ({ ...phase, status: statuses[index] ?? "pending" })),
    topic: topicMap[className],
    completed_count: statuses.filter((status) => status === "done").length,
    skipped_count: statuses.filter((status) => status === "skipped").length,
    xp_earned: xpEarned,
    combo,
  };
}

function serializeLessonProgress(row: typeof schema.lessonProgress.$inferSelect | null): z.infer<typeof lessonProgressSchema> {
  return {
    status: row?.status ?? "not_started",
    current_phase: row?.currentPhase ?? 0,
    phase_progress_json: row?.phaseProgressJson ?? "{}",
    mastery: row?.masteryPermille ?? 0,
    board_strokes_json: row?.boardStrokesJson ?? "[]",
    xp_earned: row?.xpEarned ?? 0,
    started_at: row?.startedAt?.toISOString() ?? null,
    completed_at: row?.completedAt?.toISOString() ?? null,
  };
}

function parseLessonDocuments(documents: string[]) {
  const seen = new Set<string>();
  return documents.flatMap((document) => {
    try {
      const parsed = lessonContentSchema.safeParse(JSON.parse(document));
      if (!parsed.success || seen.has(parsed.data.id)) return [];
      seen.add(parsed.data.id);
      return [parsed.data];
    } catch { return []; }
  });
}

const PACKAGE_FEATURES = [
  "spaced-repetition decks and card scheduling", "card diagrams and study-file references", "review history and XP progress",
  "guided lesson library and lesson progress", "Watch lesson video catalog", "Daily Study Hour state", "Study Lab boards and focus sessions",
  "generated practice attempts", "Teach Munki mastery and sessions", "mascot cosmetics and settings",
] as const;

export const Actions = {
  getLessonLibrary: defineAction({
    request: z.object({}), response: lessonLibraryResponse, privileged: [privileged.scanLessonFiles],
    async handler(ctx): Promise<z.infer<typeof lessonLibraryResponse>> {
      const scanned = await ctx.executePrivileged(privileged.scanLessonFiles, {});
      const lessons = parseLessonDocuments(scanned.documents);
      const progressRows = await ctx.db<typeof schema>().select().from(schema.lessonProgress);
      const progress = new Map(progressRows.map((row) => [row.lessonId, row]));
      const courseOrder = (course: string) => course.startsWith("MA") ? 0 : course.startsWith("PHYS") ? 1 : 2;
      lessons.sort((a, b) => courseOrder(a.course) - courseOrder(b.course) || a.unit.localeCompare(b.unit, undefined, { numeric: true }));
      return { lessons: lessons.map((lesson) => ({ ...lesson, progress: serializeLessonProgress(progress.get(lesson.id) ?? null) })) };
    },
  }),

  createMunkiPackage: defineAction({
    request: z.object({}), response: munkiPackageResponse, privileged: [privileged.scanLessonFiles],
    async handler(ctx): Promise<z.infer<typeof munkiPackageResponse>> {
      const db = ctx.db<typeof schema>();
      const scanned = await ctx.executePrivileged(privileged.scanLessonFiles, {});
      const lessonLibrary = parseLessonDocuments(scanned.documents);
      const decks = await db.select().from(schema.decks);
      const cards = await db.select().from(schema.cards);
      const reviews = await db.select().from(schema.reviews);
      const gameProfile = await db.select().from(schema.gameProfile);
      const gameMutations = await db.select().from(schema.gameMutations);
      const blitzAttempts = await db.select().from(schema.blitzAttempts);
      const mascotProfile = await db.select().from(schema.mascotProfile);
      const activityDays = await db.select().from(schema.activityDays);
      const studyBoards = await db.select().from(schema.studyBoards);
      const studyFiles = await db.select().from(schema.studyFiles);
      const studySessions = await db.select().from(schema.studySessions);
      const practiceAttempts = await db.select().from(schema.practiceAttempts);
      const lessonProgress = await db.select().from(schema.lessonProgress);
      const dailyStudyHours = await db.select().from(schema.dailyStudyHours);
      const dailySubjectStudyHours = await db.select().from(schema.dailySubjectStudyHours);
      const teachingSettings = await db.select().from(schema.teachingSettings);
      const teachingTopics = await db.select().from(schema.teachingTopics);
      const teachingSessions = await db.select().from(schema.teachingSessions);
      const generatedAt = new Date();
      const counts = {
        decks: decks.length, cards: cards.length, reviews: reviews.length, lessons: lessonLibrary.length,
        lesson_progress: lessonProgress.length, study_sessions: studySessions.length, practice_attempts: practiceAttempts.length,
        teaching_sessions: teachingSessions.length, study_hours: dailySubjectStudyHours.length + dailyStudyHours.length,
        attachments: studyFiles.length + cards.filter((card) => card.frontImageBlobKey || card.backImageBlobKey).length,
        watch_videos: LESSON_VIDEO_IDS.length,
      };
      const archive = {
        format: "munki-study-package", schema_version: 1, generated_at: generatedAt.toISOString(),
        manifest: { features: PACKAGE_FEATURES, counts, embedded_watch_video_ids: LESSON_VIDEO_IDS },
        content: { lessons: lessonLibrary },
        study_data: {
          decks, cards, reviews, game_profile: gameProfile, game_mutations: gameMutations, blitz_attempts: blitzAttempts,
          mascot_profile: mascotProfile, activity_days: activityDays, study_boards: studyBoards, study_files: studyFiles,
          study_sessions: studySessions, practice_attempts: practiceAttempts, lesson_progress: lessonProgress,
          daily_study_hours: dailyStudyHours, daily_subject_study_hours: dailySubjectStudyHours,
          teaching_settings: teachingSettings, teaching_topics: teachingTopics, teaching_sessions: teachingSessions,
        },
        notes: [
          "This package contains Munki's structured study content, history, progress, settings, and attachment references.",
          "Watch videos remain embedded in the Munki artifact and are listed by stable catalog ID.",
          "Binary card images and Study Lab files remain safely stored in Munki; their blob references and metadata are included here.",
        ],
      };
      const day = generatedAt.toISOString().slice(0, 10);
      const fileName = `munki-everything-${day}.json`;
      const key = `exports/${day}/${crypto.randomUUID()}-${fileName}`;
      await ctx.blobs.put(key, Buffer.from(JSON.stringify(archive, null, 2), "utf8"), { contentType: "application/json" });
      return { download_url: await ctx.blobs.getUrl(key), file_name: fileName, generated_at: generatedAt.toISOString(), counts };
    },
  }),

  saveLessonProgress: defineAction({
    request: z.object({
      lesson_id: z.string().min(1).max(120), course: z.string().min(1).max(60), title: z.string().min(1).max(160),
      current_phase: z.number().int().min(0).max(4), phase_progress_json: z.string().max(20_000), board_strokes_json: z.string().max(400_000),
    }),
    response: lessonProgressSchema,
    async handler(ctx, args): Promise<z.infer<typeof lessonProgressSchema>> {
      const db = ctx.db<typeof schema>();
      const rows = await db.select().from(schema.lessonProgress).where(eq(schema.lessonProgress.lessonId, args.lesson_id)).limit(1);
      const prior = rows[0]; const now = new Date();
      if (prior) await db.update(schema.lessonProgress).set({ currentPhase: args.current_phase, phaseProgressJson: args.phase_progress_json, boardStrokesJson: args.board_strokes_json, status: prior.status === "complete" ? "complete" : "active", updatedAt: now }).where(eq(schema.lessonProgress.lessonId, args.lesson_id));
      else await db.insert(schema.lessonProgress).values({ lessonId: args.lesson_id, course: args.course, title: args.title, status: "active", currentPhase: args.current_phase, phaseProgressJson: args.phase_progress_json, boardStrokesJson: args.board_strokes_json, startedAt: now, updatedAt: now });
      const savedRows = await db.select().from(schema.lessonProgress).where(eq(schema.lessonProgress.lessonId, args.lesson_id)).limit(1);
      ctx.invalidateQueries(); return serializeLessonProgress(savedRows[0] ?? null);
    },
  }),

  completeLessonPhase: defineAction({
    request: z.object({
      lesson_id: z.string().min(1).max(120), course: z.string().min(1).max(60), title: z.string().min(1).max(160), phase: z.number().int().min(0).max(4),
      phase_progress_json: z.string().max(20_000), board_strokes_json: z.string().max(400_000), date_key: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    }),
    response: lessonPhaseResponse,
    async handler(ctx, args): Promise<z.infer<typeof lessonPhaseResponse>> {
      return withGameMutationLock(async () => {
        const db = ctx.db<typeof schema>();
        const rows = await db.select().from(schema.lessonProgress).where(eq(schema.lessonProgress.lessonId, args.lesson_id)).limit(1);
        const prior = rows[0];
        const profile = await getOrCreateProfile(ctx);
        if (prior?.status === "complete") {
          return { progress: serializeLessonProgress(prior), xp_earned: 0, combo: profile.currentCombo, level_up: false };
        }
        if ((!prior && args.phase !== 0) || (prior && prior.currentPhase !== args.phase)) {
          throw new Error("Finish the current lesson phase before moving on.");
        }
        const now = new Date(); const nextPhase = Math.min(4, args.phase + 1); const isComplete = args.phase === 4;
        const xpByPhase = [30, 45, 50, 60, 75] as const;
        const masteryByPhase = [40, 70, 90, 140, 160] as const;
        const xp = xpByPhase[args.phase] ?? 0;
        const shouldReward = true;
        const progress = await applyGameProgress(ctx, { mutationUuid: `lesson:${args.lesson_id}:phase:${args.phase}`, kind: "lesson", dateKey: args.date_key, xp, knew: true, combo: profile.currentCombo });
        const values = {
          course: args.course, title: args.title, status: isComplete ? "complete" as const : "active" as const, currentPhase: nextPhase,
          phaseProgressJson: args.phase_progress_json, boardStrokesJson: args.board_strokes_json,
          masteryPermille: Math.min(1000, (prior?.masteryPermille ?? 0) + (shouldReward ? masteryByPhase[args.phase] ?? 0 : 0)),
          xpEarned: (prior?.xpEarned ?? 0) + (shouldReward ? xp : 0), completedAt: isComplete ? now : prior?.completedAt ?? null, updatedAt: now,
        };
        if (prior) await db.update(schema.lessonProgress).set(values).where(eq(schema.lessonProgress.lessonId, args.lesson_id));
        else await db.insert(schema.lessonProgress).values({ lessonId: args.lesson_id, ...values, startedAt: now });
        const savedRows = await db.select().from(schema.lessonProgress).where(eq(schema.lessonProgress.lessonId, args.lesson_id)).limit(1);
        ctx.invalidateQueries();
        const awardedXp = xp + progress.bonus;
        return { progress: serializeLessonProgress(savedRows[0] ?? null), xp_earned: awardedXp, combo: progress.combo, level_up: levelInfo(progress.totalXp).level > levelInfo(progress.totalXp - awardedXp).level };
      });
    },
  }),

  teachLesson: defineAction({
    request: z.object({ lesson_id: z.string().min(1).max(120), title: z.string().min(1).max(160), prompt: z.string().min(1).max(1200), explanation: z.string().min(20).max(8000), image_data_base64: z.string().optional(), image_mime_type: z.enum(["image/jpeg", "image/png"]).optional() }),
    response: lessonTeachResponse,
    async handler(ctx, args): Promise<z.infer<typeof lessonTeachResponse>> {
      const result = await ctx.inference.complete([
        `Act as Munki, a curious student being taught ${args.title}.`,
        `The student prompt is: ${args.prompt}`,
        `The learner explained: ${args.explanation}`,
        "Respond warmly as a student, name what you understood, identify at most one precise gap, and ask one short follow-up question that tests the explanation. Never give the whole solution away.",
      ].join("\n\n"), {
        schema: teachEvaluationSchema,
        ...(args.image_data_base64 && args.image_mime_type ? { images: [{ dataBase64: args.image_data_base64, mimeType: args.image_mime_type, filename: `${args.lesson_id}-whiteboard.png` }] } : {}),
      });
      return result;
    },
  }),

  listDailyStudyHours: defineAction({
    request: z.object({ date_key: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }),
    response: studyHourListResponse,
    async handler(ctx, args): Promise<z.infer<typeof studyHourListResponse>> {
      const rows = await ctx.db<typeof schema>().select().from(schema.dailySubjectStudyHours).where(eq(schema.dailySubjectStudyHours.dateKey, args.date_key));
      const topics = await studyHourTopics(ctx);
      const hours = await Promise.all(STUDY_HOUR_CLASSES.map((className) => serializeStudyHour(ctx, args.date_key, className, rows.find((row) => row.className === className) ?? null, topics)));
      return { hours };
    },
  }),

  getDailyStudyHour: defineAction({
    request: z.object({ date_key: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), class_name: studyHourClassSchema }),
    response: studyHourResponse,
    async handler(ctx, args): Promise<z.infer<typeof studyHourResponse>> {
      const rows = await ctx.db<typeof schema>().select().from(schema.dailySubjectStudyHours).where(eq(schema.dailySubjectStudyHours.id, studyHourId(args.date_key, args.class_name))).limit(1);
      return serializeStudyHour(ctx, args.date_key, args.class_name, rows[0] ?? null);
    },
  }),

  startDailyStudyHour: defineAction({
    request: z.object({ date_key: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), class_name: studyHourClassSchema }),
    response: studyHourResponse,
    async handler(ctx, args): Promise<z.infer<typeof studyHourResponse>> {
      const db = ctx.db<typeof schema>();
      const id = studyHourId(args.date_key, args.class_name);
      const existing = await db.select().from(schema.dailySubjectStudyHours).where(eq(schema.dailySubjectStudyHours.id, id)).limit(1);
      const prior = existing[0];
      if (prior) return serializeStudyHour(ctx, args.date_key, args.class_name, prior);
      const now = new Date();
      const rows = await db.insert(schema.dailySubjectStudyHours).values({
        id, dateKey: args.date_key, className: args.class_name, currentPhase: 0,
        phaseStatusesJson: JSON.stringify(["active", "pending", "pending", "pending", "pending"]),
        phaseStartedAt: now, startedAt: now, updatedAt: now,
      }).returning();
      const created = rows[0];
      if (!created) throw new Error("The study hour could not be started.");
      ctx.invalidateQueries();
      return serializeStudyHour(ctx, args.date_key, args.class_name, created);
    },
  }),

  advanceDailyStudyHour: defineAction({
    request: z.object({ date_key: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), class_name: studyHourClassSchema, phase: studyHourPhaseIdSchema, status: z.enum(["done", "skipped"]) }),
    response: studyHourResponse,
    async handler(ctx, args): Promise<z.infer<typeof studyHourResponse>> {
      return withGameMutationLock(async () => {
        const db = ctx.db<typeof schema>();
        const id = studyHourId(args.date_key, args.class_name);
        const rows = await db.select().from(schema.dailySubjectStudyHours).where(eq(schema.dailySubjectStudyHours.id, id)).limit(1);
        const row = rows[0];
        if (!row) throw new Error("Start the study hour before advancing a phase.");
        if (row.completedAt) return serializeStudyHour(ctx, args.date_key, args.class_name, row);
        const phaseIndex = STUDY_HOUR_PHASES.findIndex((phase) => phase.id === args.phase);
        if (phaseIndex !== row.currentPhase) throw new Error("Finish the current phase first.");
        const statuses = studyHourStatuses(row.phaseStatusesJson);
        statuses[phaseIndex] = args.status;
        const nextPhase = Math.min(4, phaseIndex + 1);
        const finished = phaseIndex === STUDY_HOUR_PHASES.length - 1;
        if (!finished) statuses[nextPhase] = "active";
        const now = new Date();
        let resultJson = row.resultJson;
        let completedAt: Date | null = null;
        if (finished) {
          const profile = await getOrCreateProfile(ctx);
          const completedCount = statuses.filter((status) => status === "done").length;
          const xp = 40 + completedCount * 15;
          const nextCombo = profile.currentCombo + 1;
          const progress = await applyGameProgress(ctx, {
            mutationUuid: `study-hour:${args.date_key}:${args.class_name}`, kind: "study_hour", dateKey: args.date_key,
            xp, knew: true, combo: nextCombo,
          });
          resultJson = JSON.stringify({ xp_earned: xp + progress.bonus, combo: progress.combo });
          completedAt = now;
        }
        await db.update(schema.dailySubjectStudyHours).set({
          currentPhase: nextPhase, phaseStatusesJson: JSON.stringify(statuses), phaseStartedAt: finished ? null : now,
          completedAt, resultJson, updatedAt: now,
        }).where(eq(schema.dailySubjectStudyHours.id, id));
        const updatedRows = await db.select().from(schema.dailySubjectStudyHours).where(eq(schema.dailySubjectStudyHours.id, id)).limit(1);
        ctx.invalidateQueries();
        return serializeStudyHour(ctx, args.date_key, args.class_name, updatedRows[0] ?? null);
      });
    },
  }),

  getMascotState: defineAction({
    request: z.object({}),
    response: mascotStateResponse,
    async handler(ctx): Promise<z.infer<typeof mascotStateResponse>> {
      return serializeMascotState(ctx, await getOrCreateMascotProfile(ctx));
    },
  }),

  purchaseMascotAccessory: defineAction({
    request: z.object({ accessory_id: accessoryIdSchema }),
    response: mascotStateResponse,
    async handler(ctx, args): Promise<z.infer<typeof mascotStateResponse>> {
      return withGameMutationLock(async () => {
        const db = ctx.db<typeof schema>();
        const mascot = await getOrCreateMascotProfile(ctx);
        const owned = ownedAccessories(mascot.ownedAccessoryIdsJson);
        if (owned.includes(args.accessory_id)) return serializeMascotState(ctx, mascot);
        const game = await getOrCreateProfile(ctx);
        const item = MASCOT_ACCESSORIES[args.accessory_id];
        if (game.totalXp - mascot.spentXp < item.price) throw new Error("Keep studying to earn enough XP for this accessory.");
        const nextOwned = [...owned, args.accessory_id];
        const now = new Date();
        const equipped = {
          equippedHat: item.slot === "hat" ? args.accessory_id : mascot.equippedHat,
          equippedGlasses: item.slot === "glasses" ? args.accessory_id : mascot.equippedGlasses,
          equippedOutfit: item.slot === "outfit" ? args.accessory_id : mascot.equippedOutfit,
          equippedBackground: item.slot === "background" ? args.accessory_id : mascot.equippedBackground,
        };
        await db.update(schema.mascotProfile).set({
          spentXp: mascot.spentXp + item.price,
          ownedAccessoryIdsJson: JSON.stringify(nextOwned),
          ...equipped,
          lastInteractionAt: now,
          updatedAt: now,
        }).where(eq(schema.mascotProfile.id, 1));
        ctx.invalidateQueries();
        const updated = { ...mascot, spentXp: mascot.spentXp + item.price, ownedAccessoryIdsJson: JSON.stringify(nextOwned), ...equipped, lastInteractionAt: now, updatedAt: now };
        return serializeMascotState(ctx, updated);
      });
    },
  }),

  equipMascotAccessory: defineAction({
    request: z.object({ slot: mascotSlotSchema, accessory_id: accessoryIdSchema.nullable() }),
    response: mascotStateResponse,
    async handler(ctx, args): Promise<z.infer<typeof mascotStateResponse>> {
      const db = ctx.db<typeof schema>();
      const mascot = await getOrCreateMascotProfile(ctx);
      if (args.accessory_id) {
        const item = MASCOT_ACCESSORIES[args.accessory_id];
        if (item.slot !== args.slot) throw new Error("That accessory does not fit this slot.");
        if (!ownedAccessories(mascot.ownedAccessoryIdsJson).includes(args.accessory_id)) throw new Error("Unlock this accessory before equipping it.");
      }
      const now = new Date();
      const field = args.slot === "hat" ? { equippedHat: args.accessory_id }
        : args.slot === "glasses" ? { equippedGlasses: args.accessory_id }
        : args.slot === "outfit" ? { equippedOutfit: args.accessory_id }
        : { equippedBackground: args.accessory_id };
      await db.update(schema.mascotProfile).set({ ...field, lastInteractionAt: now, updatedAt: now }).where(eq(schema.mascotProfile.id, 1));
      ctx.invalidateQueries();
      return serializeMascotState(ctx, { ...mascot, ...field, lastInteractionAt: now, updatedAt: now });
    },
  }),

  touchMascot: defineAction({
    request: z.object({}),
    response: mascotStateResponse,
    async handler(ctx): Promise<z.infer<typeof mascotStateResponse>> {
      const mascot = await getOrCreateMascotProfile(ctx);
      const now = new Date();
      await ctx.db<typeof schema>().update(schema.mascotProfile).set({ lastInteractionAt: now, updatedAt: now }).where(eq(schema.mascotProfile.id, 1));
      return serializeMascotState(ctx, { ...mascot, lastInteractionAt: now, updatedAt: now });
    },
  }),

  getWatchState: defineAction({
    request: z.object({}),
    response: z.object({ watched_video_ids: z.array(z.string()), total_xp: z.number(), level: z.number() }),
    async handler(ctx) {
      const [profile, mutations] = await Promise.all([
        getOrCreateProfile(ctx),
        ctx.db<typeof schema>().select({ mutationUuid: schema.gameMutations.mutationUuid }).from(schema.gameMutations).where(eq(schema.gameMutations.kind, "watch")),
      ]);
      return {
        watched_video_ids: mutations.map((row) => row.mutationUuid.startsWith("watch:") ? row.mutationUuid.slice(6) : row.mutationUuid),
        total_xp: profile.totalXp,
        level: levelInfo(profile.totalXp).level,
      };
    },
  }),

  awardWatchXp: defineAction({
    request: z.object({ video_id: z.string().regex(/^(?:lesson\d+-(?:short|explainer)|exam2-review-(?:strategy-short|series-short|exam2-explainer)|phys172-exam2-(?:energy-principle-short|work-short|conservative-short|energy-explainer))$/), date_key: z.string().min(8).max(10) }),
    response: watchRewardResponse,
    async handler(ctx, args): Promise<z.infer<typeof watchRewardResponse>> {
      return withGameMutationLock(async () => {
        const xp = args.video_id.endsWith("-short") ? 35 : 55;
        const mutationUuid = `watch:${args.video_id}`;
        const existing = await ctx.db<typeof schema>().select().from(schema.gameMutations).where(eq(schema.gameMutations.mutationUuid, mutationUuid)).limit(1);
        const profile = await getOrCreateProfile(ctx);
        if (existing[0]) return { awarded: false, xp_earned: 0, total_xp: profile.totalXp, level: levelInfo(profile.totalXp).level, level_up: false };
        const oldLevel = levelInfo(profile.totalXp).level;
        const progress = await applyGameProgress(ctx, { mutationUuid, kind: "watch", dateKey: args.date_key, xp, knew: false, combo: profile.currentCombo });
        const level = levelInfo(progress.totalXp).level;
        ctx.invalidateQueries();
        return { awarded: true, xp_earned: xp, total_xp: progress.totalXp, level, level_up: level > oldLevel };
      });
    },
  }),

  getHome: defineAction({
    request: z.object({ now_ms: z.number(), today_start_ms: z.number() }),
    response: z.object({
      stats: z.object({ total_cards: z.number(), due_cards: z.number(), learning_cards: z.number(), reviewed_today: z.number() }),
      decks: z.array(z.object({
        id: z.number(),
        title: z.string(),
        description: z.string(),
        color: z.string(),
        exam_date: z.string().nullable(),
        total_cards: z.number(),
        due_cards: z.number(),
        new_cards: z.number(),
        learned_cards: z.number(),
        mature_cards: z.number(),
      })),
    }),
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      const [deckRows, cardRows, reviewRows] = await Promise.all([
        db.select().from(schema.decks).orderBy(desc(schema.decks.updatedAt)),
        db.select().from(schema.cards),
        db.select().from(schema.reviews).where(gte(schema.reviews.reviewedAt, new Date(args.today_start_ms))),
      ]);
      const due = cardRows.filter((card) => card.dueAt.getTime() <= args.now_ms);
      return {
        stats: {
          total_cards: cardRows.length,
          due_cards: due.length,
          learning_cards: cardRows.filter((card) => card.repetitions > 0 && card.intervalMinutes < 1440).length,
          reviewed_today: reviewRows.length,
        },
        decks: deckRows.map((deck) => {
          const cards = cardRows.filter((card) => card.deckId === deck.id);
          return {
            id: deck.id,
            title: deck.title,
            description: deck.description,
            color: deck.color,
            exam_date: deck.examDate,
            total_cards: cards.length,
            due_cards: cards.filter((card) => card.dueAt.getTime() <= args.now_ms).length,
            new_cards: cards.filter((card) => card.repetitions === 0 && card.intervalMinutes === 0).length,
            learned_cards: cards.filter((card) => card.repetitions > 0).length,
            mature_cards: cards.filter((card) => card.intervalMinutes >= 30 * 1440).length,
          };
        }),
      };
    },
  }),

  getFeed: defineAction({
    request: z.object({ now_ms: z.number(), seed: z.number().int(), deck_id: z.number().int().positive().nullable(), limit: z.number().int().min(1).max(200).default(100) }),
    response: z.object({
      cards: z.array(cardSchema.extend({
        deck_title: z.string(), deck_color: z.string(), critical: z.boolean(),
        intervals: z.object({ again: z.string(), knew: z.string() }),
      })),
    }),
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      const allRows = args.deck_id === null
        ? await db.select().from(schema.cards)
        : await db.select().from(schema.cards).where(eq(schema.cards.deckId, args.deck_id));
      const deckRows = await db.select().from(schema.decks);
      const deckMap = new Map(deckRows.map((deck) => [deck.id, deck]));
      const examWeight = (deckId: number) => {
        const examDate = deckMap.get(deckId)?.examDate;
        if (!examDate) return 0;
        const examAt = new Date(`${examDate}T12:00:00Z`).getTime();
        if (!Number.isFinite(examAt)) return 0;
        const daysAway = Math.max(0, (examAt - args.now_ms) / 86_400_000);
        return Math.max(0, 20_000 - Math.round(daysAway * 800));
      };
      const feedScore = (row: typeof schema.cards.$inferSelect) => {
        const due = row.dueAt.getTime() <= args.now_ms ? 100_000 : 0;
        const unseen = row.repetitions === 0 ? 50_000 : 0;
        const overdueHours = due ? Math.min(20_000, Math.round((args.now_ms - row.dueAt.getTime()) / 3_600_000) * 80) : 0;
        const shuffle = hashMix(row.id, args.seed) % 10_000;
        const preference = row.feedWeight <= 1 ? -1_000_000 : Math.round((row.feedWeight - 100) * 1_000);
        return due + unseen + overdueHours + examWeight(row.deckId) + shuffle + preference;
      };
      // A buried card remains available in its deck but leaves the recommendation feed.
      // Editing it restores the default weight so a repaired card can earn its way back.
      const ordered = allRows.filter((row) => row.feedWeight > 1).sort((a, b) => feedScore(b) - feedScore(a)).slice(0, args.limit);
      return {
        cards: await Promise.all(ordered.map(async (row) => {
          const deck = deckMap.get(row.deckId);
          return {
            ...await serializeCard(ctx, row, deck?.title ?? ""),
            deck_title: deck?.title ?? "Deck",
            deck_color: deck?.color ?? "#2457D6",
            critical: hashMix(row.id, args.seed) % 12 === 0,
            intervals: {
              again: intervalLabel(intervalFor("again", row.intervalMinutes, row.repetitions, row.easePermille)),
              knew: intervalLabel(intervalFor("good", row.intervalMinutes, row.repetitions, row.easePermille)),
            },
          };
        })),
      };
    },
  }),

  getGameState: defineAction({
    request: z.object({ date_key: z.string().min(8).max(10), recent_date_keys: z.array(z.string()).max(60) }),
    response: z.object({
      total_xp: z.number(), level: z.number(), level_xp: z.number(), next_level_xp: z.number(),
      combo: z.number(), multiplier: z.number(), best_combo: z.number(), blitz_best: z.number(),
      sound_enabled: z.boolean(), daily_nudge_enabled: z.boolean(), streak: z.number(), perfect_today: z.boolean(),
      quests: z.array(questSchema),
    }),
    async handler(ctx, args) {
      const profile = await getOrCreateProfile(ctx);
      const day = await getDay(ctx, args.date_key);
      const allDays = await ctx.db<typeof schema>().select().from(schema.activityDays);
      const byDate = new Map(allDays.map((row) => [row.dateKey, row]));
      let streak = 0;
      for (const key of args.recent_date_keys) {
        const row = byDate.get(key);
        if (!row || (row.cardsGraded === 0 && row.blitzRuns === 0 && row.practiceSessions === 0 && row.focusSessions === 0 && row.xpEarned === 0)) break;
        streak += 1;
      }
      return {
        total_xp: profile.totalXp, ...levelInfo(profile.totalXp), combo: profile.currentCombo,
        multiplier: comboMultiplier(profile.currentCombo), best_combo: profile.bestCombo, blitz_best: profile.blitzBest,
        sound_enabled: profile.soundEnabled, daily_nudge_enabled: profile.dailyNudgeEnabled,
        streak, perfect_today: day?.perfect ?? false, quests: questsFor(day, args.date_key),
      };
    },
  }),

  getWeeklyRecap: defineAction({
    request: z.object({ now_ms: z.number() }),
    response: z.object({ xp: z.number(), cards: z.number(), best_combo: z.number(), accuracy: z.number(), trend_label: z.string(), active_days: z.number(), perfect_days: z.number() }),
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      const start = new Date(args.now_ms - 7 * 86_400_000);
      const priorStart = new Date(args.now_ms - 14 * 86_400_000);
      const recent = await db.select().from(schema.reviews).where(gte(schema.reviews.reviewedAt, start));
      const prior = await db.select().from(schema.reviews).where(and(gte(schema.reviews.reviewedAt, priorStart), lt(schema.reviews.reviewedAt, start)));
      const days = await db.select().from(schema.activityDays);
      const recentDays = days.filter((row) => row.updatedAt.getTime() >= start.getTime());
      const accuracy = recent.length ? Math.round((recent.filter((row) => row.rating === "good" || row.rating === "easy").length / recent.length) * 100) : 0;
      const priorAccuracy = prior.length ? Math.round((prior.filter((row) => row.rating === "good" || row.rating === "easy").length / prior.length) * 100) : 0;
      const delta = accuracy - priorAccuracy;
      return {
        xp: recentDays.reduce((sum, row) => sum + row.xpEarned, 0), cards: recent.length,
        best_combo: recentDays.reduce((best, row) => Math.max(best, row.bestCombo), 0), accuracy,
        trend_label: recent.length === 0 ? "Your next card starts the story" : delta >= 0 ? `${delta ? `Up ${delta} points` : "Holding steady"} — your recall is settling in` : "Every pass is strengthening the next one",
        active_days: recentDays.filter((row) => row.cardsGraded > 0 || row.blitzRuns > 0 || row.practiceSessions > 0 || row.focusSessions > 0 || row.xpEarned > 0).length,
        perfect_days: recentDays.filter((row) => row.perfect).length,
      };
    },
  }),

  updateGameSettings: defineAction({
    request: z.object({ sound_enabled: z.boolean(), daily_nudge_enabled: z.boolean() }),
    response: z.object({ ok: z.boolean() }),
    async handler(ctx, args) {
      await getOrCreateProfile(ctx);
      // Scheduling belongs in Teach Munki. The retired general-purpose nudge stays off.
      await ctx.db<typeof schema>().update(schema.gameProfile).set({ soundEnabled: args.sound_enabled, dailyNudgeEnabled: false, updatedAt: new Date() }).where(eq(schema.gameProfile.id, 1));
      ctx.invalidateQueries();
      return { ok: true };
    },
  }),

  finishBlitz: defineAction({
    request: z.object({ attempt_uuid: z.string().uuid(), score: z.number().int().min(0), date_key: z.string().min(8).max(10), yesterday_key: z.string().min(8).max(10) }),
    response: blitzResponse,
    async handler(ctx, args): Promise<z.infer<typeof blitzResponse>> {
      return withGameMutationLock(async () => {
        const db = ctx.db<typeof schema>();
        const priorRows = await db.select().from(schema.blitzAttempts).where(eq(schema.blitzAttempts.attemptUuid, args.attempt_uuid)).limit(1);
        const prior = priorRows[0];
        if (prior?.resultJson) {
          const parsed = blitzResponse.safeParse(JSON.parse(prior.resultJson));
          if (parsed.success) return parsed.data;
        }
        const profile = await getOrCreateProfile(ctx);
        const yesterday = await getDay(ctx, args.yesterday_key);
        const yesterdayScore = yesterday?.blitzBestScore ?? 0;
        const newBest = args.score > profile.blitzBest;
        if (newBest) await db.update(schema.gameProfile).set({ blitzBest: args.score, updatedAt: new Date() }).where(eq(schema.gameProfile.id, 1));
        const progress = await applyGameProgress(ctx, { mutationUuid: `blitz:${args.attempt_uuid}`, kind: "blitz", dateKey: args.date_key, xp: 0, knew: false, combo: profile.currentCombo, blitzRun: true, blitzScore: args.score });
        const result: z.infer<typeof blitzResponse> = {
          personal_best: Math.max(profile.blitzBest, args.score), yesterday_score: yesterdayScore,
          beat_yesterday: yesterdayScore > 0 && args.score > yesterdayScore, new_best: newBest,
          bonus_xp: progress.bonus, perfect_day: progress.perfect,
        };
        await db.insert(schema.blitzAttempts).values({ attemptUuid: args.attempt_uuid, score: args.score, dateKey: args.date_key, resultJson: JSON.stringify(result), createdAt: new Date() }).onConflictDoNothing();
        ctx.invalidateQueries();
        return result;
      });
    },
  }),

  createDeck: defineAction({
    request: z.object({
      title: z.string().trim().min(1).max(80),
      description: z.string().trim().max(240).default(""),
      color: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
      exam_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().default(null),
    }),
    response: z.object({ id: z.number() }),
    async handler(ctx, args) {
      const now = new Date();
      const rows = await ctx.db<typeof schema>().insert(schema.decks).values({ title: args.title, description: args.description, color: args.color, examDate: args.exam_date, createdAt: now, updatedAt: now }).returning({ id: schema.decks.id });
      const row = rows[0];
      if (!row) throw new Error("The deck could not be created.");
      ctx.invalidateQueries();
      return { id: row.id };
    },
  }),

  updateDeck: defineAction({
    request: z.object({ id: z.number().int().positive(), title: z.string().trim().min(1).max(80), description: z.string().trim().max(240), color: z.string().regex(/^#[0-9A-Fa-f]{6}$/), exam_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable() }),
    response: z.object({ ok: z.boolean() }),
    async handler(ctx, args) {
      await ctx.db<typeof schema>().update(schema.decks).set({ title: args.title, description: args.description, color: args.color, examDate: args.exam_date, updatedAt: new Date() }).where(eq(schema.decks.id, args.id));
      ctx.invalidateQueries();
      return { ok: true };
    },
  }),

  deleteDeck: defineAction({
    request: z.object({ id: z.number().int().positive() }),
    response: z.object({ ok: z.boolean() }),
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      const cardRows = await db.select({ frontImageBlobKey: schema.cards.frontImageBlobKey, backImageBlobKey: schema.cards.backImageBlobKey }).from(schema.cards).where(eq(schema.cards.deckId, args.id));
      const fileRows = await db.select({ blobKey: schema.studyFiles.blobKey }).from(schema.studyFiles).where(eq(schema.studyFiles.deckId, args.id));
      await db.delete(schema.decks).where(eq(schema.decks.id, args.id));
      const keys = [
        ...cardRows.flatMap((row) => [row.frontImageBlobKey, row.backImageBlobKey]),
        ...fileRows.map((row) => row.blobKey),
      ].filter((key): key is string => Boolean(key));
      // Deleting orphaned bytes is cleanup after the durable delete; a cleanup failure
      // must not tell the client that the still-successful deck deletion failed.
      await Promise.allSettled(keys.map((key) => ctx.blobs.delete(key)));
      ctx.invalidateQueries();
      return { ok: true };
    },
  }),

  getDeck: defineAction({
    request: z.object({ id: z.number().int().positive() }),
    response: z.object({
      deck: z.object({ id: z.number(), title: z.string(), description: z.string(), color: z.string(), exam_date: z.string().nullable() }).nullable(),
      cards: z.array(cardSchema),
    }),
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      const deckRows = await db.select().from(schema.decks).where(eq(schema.decks.id, args.id)).limit(1);
      const deck = deckRows[0];
      if (!deck) return { deck: null, cards: [] };
      const cards = await db.select().from(schema.cards).where(eq(schema.cards.deckId, args.id)).orderBy(asc(schema.cards.createdAt));
      return {
        deck: { id: deck.id, title: deck.title, description: deck.description, color: deck.color, exam_date: deck.examDate },
        cards: await Promise.all(cards.map((card) => serializeCard(ctx, card, deck.title))),
      };
    },
  }),

  createCards: defineAction({
    request: z.object({
      deck_id: z.number().int().positive(),
      cards: z.array(z.object({
        front: z.string().trim().min(1).max(4000),
        back: z.string().trim().min(1).max(8000),
        tags: z.string().trim().max(300).default(""),
        front_image: imageUploadSchema.optional(),
        back_image: imageUploadSchema.optional(),
      })).min(1).max(100),
    }),
    response: z.object({ count: z.number() }),
    async handler(ctx, args) {
      const now = new Date();
      const db = ctx.db<typeof schema>();
      const createdIds: number[] = [];
      const savedKeys: string[] = [];
      try {
        for (const card of args.cards) {
          const rows = await db.insert(schema.cards).values({
            deckId: args.deck_id,
            front: card.front,
            back: card.back,
            tags: card.tags,
            dueAt: now,
            createdAt: now,
            updatedAt: now,
          }).returning({ id: schema.cards.id });
          const row = rows[0];
          if (!row) throw new Error("The card could not be created.");
          createdIds.push(row.id);
          const frontImageBlobKey = card.front_image ? await storeCardImage(ctx, row.id, "front", card.front_image) : null;
          if (frontImageBlobKey) savedKeys.push(frontImageBlobKey);
          const backImageBlobKey = card.back_image ? await storeCardImage(ctx, row.id, "back", card.back_image) : null;
          if (backImageBlobKey) savedKeys.push(backImageBlobKey);
          if (frontImageBlobKey || backImageBlobKey) {
            await db.update(schema.cards).set({ frontImageBlobKey, backImageBlobKey }).where(eq(schema.cards.id, row.id));
          }
        }
        await db.update(schema.decks).set({ updatedAt: now }).where(eq(schema.decks.id, args.deck_id));
      } catch (error) {
        await Promise.allSettled(createdIds.map((id) => db.delete(schema.cards).where(eq(schema.cards.id, id))));
        await Promise.allSettled(savedKeys.map((key) => ctx.blobs.delete(key)));
        throw error;
      }
      ctx.invalidateQueries();
      return { count: args.cards.length };
    },
  }),

  applyDecisionDrillRewrite: defineAction({
    request: z.object({}),
    response: z.object({ updated: z.number(), skipped: z.number() }),
    async handler(ctx) {
      const db = ctx.db<typeof schema>();
      const [cardRows, deckRows] = await Promise.all([
        db.select().from(schema.cards),
        db.select().from(schema.decks),
      ]);
      const cardsById = new Map(cardRows.map((card) => [card.id, card]));
      const decksById = new Map(deckRows.map((deck) => [deck.id, deck]));
      let updated = 0;
      let skipped = 0;
      for (const rewrite of CALC2_LEARNING_REWRITES) {
        const card = cardsById.get(rewrite.id);
        const deck = card ? decksById.get(card.deckId) : null;
        // These legacy rewrites were authored for one MA 162 import. IDs alone are
        // not an identity: skip anything that is not demonstrably in that course.
        if (!card || !deck || !/(?:MA\s*162|Calculus\s*II|Calc\s*2)/i.test(deck.title)) {
          skipped += 1;
          continue;
        }
        const rows = await db.update(schema.cards).set({ front: rewrite.front, back: rewrite.back, updatedAt: new Date() }).where(and(eq(schema.cards.id, rewrite.id), eq(schema.cards.deckId, deck.id))).returning({ id: schema.cards.id });
        if (rows[0]) updated += 1;
      }
      if (updated > 0) ctx.invalidateQueries();
      return { updated, skipped };
    },
  }),

  splitM2ProjectFailureCard: defineAction({
    request: z.object({}),
    response: z.object({ updated: z.number(), created: z.number(), already_applied: z.boolean() }),
    async handler(ctx) {
      const db = ctx.db<typeof schema>();
      const allCards = await db.select().from(schema.cards);
      const original = allCards.find((card) => card.back === M2_PROJECT_FAILURE_ORIGINAL_ANSWER);
      const first = allCards.find((card) => card.front === M2_PROJECT_FAILURE_SPLIT[0].front && card.back === M2_PROJECT_FAILURE_SPLIT[0].back);
      const anchor = original ?? first;
      if (!anchor) throw new Error("The M2 project-failure card could not be found.");

      const deckRows = await db.select().from(schema.decks).where(eq(schema.decks.id, anchor.deckId)).limit(1);
      const deck = deckRows[0];
      if (!deck || !/CNIT\s*182/i.test(deck.title) || !/Exam\s*II/i.test(deck.title)) {
        throw new Error("The matching card is not in the CNIT 182 Exam II deck.");
      }

      const sourceTags = anchor.tags;
      const now = new Date();
      let updated = 0;
      if (original) {
        await db.update(schema.cards).set({
          front: M2_PROJECT_FAILURE_SPLIT[0].front,
          back: M2_PROJECT_FAILURE_SPLIT[0].back,
          updatedAt: now,
        }).where(eq(schema.cards.id, original.id));
        updated = 1;
      }

      let created = 0;
      for (const split of M2_PROJECT_FAILURE_SPLIT.slice(1)) {
        const exists = allCards.some((card) => card.deckId === anchor.deckId && card.front === split.front && card.back === split.back);
        if (exists) continue;
        await db.insert(schema.cards).values({
          deckId: anchor.deckId,
          front: split.front,
          back: split.back,
          tags: sourceTags,
          dueAt: now,
          createdAt: now,
          updatedAt: now,
        });
        created += 1;
      }
      ctx.invalidateQueries();
      return { updated, created, already_applied: updated === 0 && created === 0 };
    },
  }),

  updateCard: defineAction({
    request: z.object({
      id: z.number().int().positive(),
      front: z.string().trim().min(1).max(4000),
      back: z.string().trim().min(1).max(8000),
      tags: z.string().trim().max(300),
      front_image: imageUploadSchema.optional(),
      back_image: imageUploadSchema.optional(),
      remove_front_image: z.boolean().default(false),
      remove_back_image: z.boolean().default(false),
    }),
    response: z.object({ ok: z.boolean() }),
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      const rows = await db.select().from(schema.cards).where(eq(schema.cards.id, args.id)).limit(1);
      const current = rows[0];
      if (!current) throw new Error("This card no longer exists.");
      let newFrontKey: string | undefined;
      let newBackKey: string | undefined;
      try {
        newFrontKey = args.front_image ? await storeCardImage(ctx, args.id, "front", args.front_image) : undefined;
        newBackKey = args.back_image ? await storeCardImage(ctx, args.id, "back", args.back_image) : undefined;
        const frontImageBlobKey = args.remove_front_image ? null : (newFrontKey ?? current.frontImageBlobKey);
        const backImageBlobKey = args.remove_back_image ? null : (newBackKey ?? current.backImageBlobKey);
        await db.update(schema.cards).set({ front: args.front, back: args.back, tags: args.tags, frontImageBlobKey, backImageBlobKey, feedWeight: 100, updatedAt: new Date() }).where(eq(schema.cards.id, args.id));
      } catch (error) {
        await Promise.allSettled([newFrontKey, newBackKey].filter((key): key is string => Boolean(key)).map((key) => ctx.blobs.delete(key)));
        throw error;
      }
      const obsolete = [
        ...(newFrontKey || args.remove_front_image ? [current.frontImageBlobKey] : []),
        ...(newBackKey || args.remove_back_image ? [current.backImageBlobKey] : []),
      ].filter((key): key is string => Boolean(key));
      // The card edit is already durable. Blob cleanup must not turn a successful save
      // into an error or delete the newly committed image keys.
      await Promise.allSettled(obsolete.map((key) => ctx.blobs.delete(key)));
      ctx.invalidateQueries();
      return { ok: true };
    },
  }),

  deleteCard: defineAction({
    request: z.object({ id: z.number().int().positive() }),
    response: z.object({ ok: z.boolean() }),
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      const rows = await db.select({ frontImageBlobKey: schema.cards.frontImageBlobKey, backImageBlobKey: schema.cards.backImageBlobKey }).from(schema.cards).where(eq(schema.cards.id, args.id)).limit(1);
      const card = rows[0];
      await db.delete(schema.cards).where(eq(schema.cards.id, args.id));
      if (card) {
        const keys = [card.frontImageBlobKey, card.backImageBlobKey].filter((key): key is string => Boolean(key));
        await Promise.allSettled(keys.map((key) => ctx.blobs.delete(key)));
      }
      ctx.invalidateQueries();
      return { ok: true };
    },
  }),

  buryCard: defineAction({
    request: z.object({ id: z.number().int().positive() }),
    response: z.object({ ok: z.boolean() }),
    async handler(ctx, args) {
      await ctx.db<typeof schema>().update(schema.cards).set({ feedWeight: 1, updatedAt: new Date() }).where(eq(schema.cards.id, args.id));
      ctx.invalidateQueries();
      return { ok: true };
    },
  }),

  resetCard: defineAction({
    request: z.object({ id: z.number().int().positive(), now_ms: z.number() }),
    response: z.object({ ok: z.boolean() }),
    async handler(ctx, args) {
      await ctx.db<typeof schema>().update(schema.cards).set({
        dueAt: new Date(args.now_ms), lastReviewedAt: null, intervalMinutes: 0, easePermille: 2500, repetitions: 0, lapses: 0, updatedAt: new Date(),
      }).where(eq(schema.cards.id, args.id));
      ctx.invalidateQueries();
      return { ok: true };
    },
  }),

  getCramQueue: defineAction({
    request: z.object({
      deck_id: z.number().int().positive(),
      target_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      now_ms: z.number(),
    }),
    response: cramQueueResponse,
    async handler(ctx, args): Promise<z.infer<typeof cramQueueResponse>> {
      const db = ctx.db<typeof schema>();
      const deckRows = await db.select().from(schema.decks).where(eq(schema.decks.id, args.deck_id)).limit(1);
      const deck = deckRows[0];
      if (!deck) throw new Error("That deck could not be found.");
      const rows = await db.select().from(schema.cards).where(eq(schema.cards.deckId, args.deck_id));
      const targetAt = new Date(`${args.target_date}T23:59:59Z`).getTime();
      if (!Number.isFinite(targetAt)) throw new Error("Choose a valid exam date.");
      const daysRemaining = Math.max(0, Math.ceil((targetAt - args.now_ms) / 86_400_000));
      const urgencyFactor = daysRemaining <= 1 ? 3 : daysRemaining <= 3 ? 2.4 : daysRemaining <= 7 ? 1.8 : 1.2;
      const maxCards = daysRemaining <= 1 ? 100 : daysRemaining <= 3 ? 72 : daysRemaining <= 7 ? 48 : 30;
      const topicFor = (row: typeof schema.cards.$inferSelect) => row.tags.split(",").map((tag) => tag.trim()).find(Boolean) ?? "Core concepts";
      const priorityFor = (row: typeof schema.cards.$inferSelect) => {
        const unseen = row.repetitions === 0 ? 42_000 : 0;
        const weakness = row.lapses * 7_000 + Math.max(0, 2_700 - row.easePermille) * 15 + Math.max(0, 6 - row.repetitions) * 650;
        const daysSinceReview = row.lastReviewedAt ? Math.max(0, (args.now_ms - row.lastReviewedAt.getTime()) / 86_400_000) : 90;
        const stale = Math.min(90, daysSinceReview) * 260;
        const overdue = row.dueAt.getTime() <= args.now_ms ? 8_000 + Math.min(12_000, Math.max(0, (args.now_ms - row.dueAt.getTime()) / 3_600_000) * 35) : 0;
        return (unseen + weakness) * urgencyFactor + stale + overdue;
      };
      const reasonFor = (row: typeof schema.cards.$inferSelect) => {
        const reasons: string[] = [];
        if (row.repetitions === 0) reasons.push("New");
        if (row.lapses > 0) reasons.push(`${row.lapses} ${row.lapses === 1 ? "miss" : "misses"}`);
        if (!row.lastReviewedAt) reasons.push("never reviewed");
        else {
          const days = Math.max(0, Math.floor((args.now_ms - row.lastReviewedAt.getTime()) / 86_400_000));
          reasons.push(days === 0 ? "reviewed today" : `${days}d since review`);
        }
        return reasons.slice(0, 2).join(" · ");
      };
      const groups = new Map<string, Array<typeof schema.cards.$inferSelect>>();
      for (const row of rows) {
        const topic = topicFor(row);
        const group = groups.get(topic) ?? [];
        group.push(row);
        groups.set(topic, group);
      }
      for (const group of groups.values()) group.sort((a, b) => priorityFor(b) - priorityFor(a));
      const ordered: Array<typeof schema.cards.$inferSelect> = [];
      let previousTopic = "";
      while (ordered.length < Math.min(rows.length, maxCards)) {
        const candidates = [...groups.entries()].filter(([, group]) => group.length > 0);
        if (!candidates.length) break;
        const varied = candidates.filter(([topic]) => topic !== previousTopic);
        const pool = varied.length ? varied : candidates;
        pool.sort((a, b) => {
          const firstA = a[1][0];
          const firstB = b[1][0];
          if (!firstA || !firstB) return 0;
          return priorityFor(firstB) - priorityFor(firstA);
        });
        const nextEntry = pool[0];
        if (!nextEntry) break;
        const [topic, group] = nextEntry;
        const row = group.shift();
        if (!row) break;
        ordered.push(row);
        previousTopic = topic;
      }
      const cards = await Promise.all(ordered.map(async (row) => ({
        ...await serializeCard(ctx, row, deck.title),
        deck_title: deck.title,
        deck_color: deck.color,
        topic: topicFor(row),
        priority_reason: reasonFor(row),
        intervals: {
          again: intervalLabel(intervalFor("again", row.intervalMinutes, row.repetitions, row.easePermille)),
          good: intervalLabel(intervalFor("good", row.intervalMinutes, row.repetitions, row.easePermille)),
        },
      })));
      return {
        deck: { id: deck.id, title: deck.title, color: deck.color },
        target_date: args.target_date,
        days_remaining: daysRemaining,
        urgency: daysRemaining <= 1 ? "today" : daysRemaining <= 3 ? "high" : "steady",
        estimated_minutes: Math.max(cards.length ? 1 : 0, Math.ceil(cards.length * 1.15)),
        cards,
      };
    },
  }),

  getStudySession: defineAction({
    request: z.object({ deck_id: z.number().int().positive().nullable(), now_ms: z.number(), limit: z.number().int().min(1).max(100).default(50) }),
    response: z.object({
      cards: z.array(cardSchema.extend({ deck_title: z.string(), deck_color: z.string(), intervals: z.object({ again: z.string(), hard: z.string(), good: z.string(), easy: z.string() }) })),
    }),
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      const rows = args.deck_id === null
        ? await db.select().from(schema.cards).where(lte(schema.cards.dueAt, new Date(args.now_ms))).orderBy(asc(schema.cards.dueAt)).limit(args.limit)
        : await db.select().from(schema.cards).where(and(eq(schema.cards.deckId, args.deck_id), lte(schema.cards.dueAt, new Date(args.now_ms)))).orderBy(asc(schema.cards.dueAt)).limit(args.limit);
      const deckRows = await db.select().from(schema.decks);
      const deckMap = new Map(deckRows.map((deck) => [deck.id, deck]));
      return {
        cards: await Promise.all(rows.map(async (row) => {
          const deck = deckMap.get(row.deckId);
          const make = (rating: z.infer<typeof ratingSchema>) => intervalLabel(intervalFor(rating, row.intervalMinutes, row.repetitions, row.easePermille));
          return {
            ...await serializeCard(ctx, row, deck?.title ?? ""),
            deck_title: deck?.title ?? "Deck",
            deck_color: deck?.color ?? "#2457D6",
            intervals: { again: make("again"), hard: make("hard"), good: make("good"), easy: make("easy") },
          };
        })), 
      };
    },
  }),

  gradeCard: defineAction({
    request: z.object({ grade_uuid: z.string().uuid(), card_id: z.number().int().positive(), rating: ratingSchema, answered_at_ms: z.number(), date_key: z.string().min(8).max(10), critical: z.boolean().default(false), combo_safe: z.boolean().default(false) }),
    response: gradeResponse,
    async handler(ctx, args): Promise<z.infer<typeof gradeResponse>> {
      return withGameMutationLock(async () => {
        const db = ctx.db<typeof schema>();
        const priorRows = await db.select().from(schema.reviews).where(eq(schema.reviews.gradeUuid, args.grade_uuid)).limit(1);
        const prior = priorRows[0];
        if (prior?.resultJson) {
          const parsed = gradeResponse.safeParse(JSON.parse(prior.resultJson));
          if (parsed.success) return parsed.data;
        }
        if (prior) {
          const progressRows = await db.select().from(schema.gameMutations).where(eq(schema.gameMutations.mutationUuid, `grade:${args.grade_uuid}`)).limit(1);
          const progressParsed = gameProgressResponse.safeParse(JSON.parse(progressRows[0]?.resultJson || "null"));
          if (progressParsed.success) {
            const progress = progressParsed.data;
            const newLevel = levelInfo(progress.totalXp).level;
            const gained = prior.xpEarned + progress.bonus;
            const recovered: z.infer<typeof gradeResponse> = {
              ok: true,
              next_due_at: new Date(prior.reviewedAt.getTime() + prior.nextIntervalMinutes * 60_000).toISOString(),
              interval_label: intervalLabel(prior.nextIntervalMinutes), xp_earned: prior.xpEarned,
              quest_bonus_xp: progress.bonus, combo: progress.combo, multiplier: progress.multiplier,
              total_xp: progress.totalXp, level: newLevel, level_up: newLevel > levelInfo(progress.totalXp - gained).level,
              perfect_day: progress.perfect, quests: progress.quests,
            };
            await db.update(schema.reviews).set({ resultJson: JSON.stringify(recovered) }).where(eq(schema.reviews.id, prior.id));
            return recovered;
          }
          throw new Error("That grade is still being saved. Try again.");
        }
        const rows = await db.select().from(schema.cards).where(eq(schema.cards.id, args.card_id)).limit(1);
        const card = rows[0];
        if (!card) throw new Error("This card no longer exists.");
        const profile = await getOrCreateProfile(ctx);
        const knew = args.rating === "good" || args.rating === "easy";
        const combo = knew ? profile.currentCombo + 1 : args.combo_safe ? profile.currentCombo : 0;
        const multiplier = comboMultiplier(combo);
        const xp = (knew ? 10 : 5) * multiplier * (args.critical ? 2 : 1);
        const nextInterval = intervalFor(args.rating, card.intervalMinutes, card.repetitions, card.easePermille);
        const answeredAt = new Date(args.answered_at_ms);
        const nextDue = new Date(args.answered_at_ms + nextInterval * 60_000);
        const easeChange = args.rating === "again" ? -200 : args.rating === "hard" ? -150 : args.rating === "easy" ? 150 : 0;
        const nextEase = Math.max(1300, Math.min(3500, card.easePermille + easeChange));
        const nextRepetitions = args.rating === "again" ? 0 : card.repetitions + 1;
        const inserted = await db.insert(schema.reviews).values({
          gradeUuid: args.grade_uuid, cardId: card.id, rating: args.rating, reviewedAt: answeredAt,
          previousIntervalMinutes: card.intervalMinutes, nextIntervalMinutes: nextInterval, xpEarned: xp, critical: args.critical,
        }).onConflictDoNothing().returning({ id: schema.reviews.id });
        if (!inserted[0]) throw new Error("That grade is still being saved. Try again.");
        await db.update(schema.cards).set({
          dueAt: nextDue, lastReviewedAt: answeredAt, intervalMinutes: nextInterval, easePermille: nextEase,
          repetitions: nextRepetitions, lapses: card.lapses + (args.rating === "again" ? 1 : 0), updatedAt: answeredAt,
        }).where(eq(schema.cards.id, card.id));
        const remainingDueRows = card.dueAt.getTime() <= args.answered_at_ms
          ? await db.select({ id: schema.cards.id }).from(schema.cards).where(and(eq(schema.cards.deckId, card.deckId), lte(schema.cards.dueAt, answeredAt))).limit(1)
          : [];
        const progress = await applyGameProgress(ctx, { mutationUuid: `grade:${args.grade_uuid}`, kind: "grade", dateKey: args.date_key, xp, knew, combo, clearDueDeck: remainingDueRows.length === 0 && card.dueAt.getTime() <= args.answered_at_ms });
        const oldLevel = levelInfo(profile.totalXp).level;
        const newLevel = levelInfo(progress.totalXp).level;
        const result: z.infer<typeof gradeResponse> = {
          ok: true, next_due_at: nextDue.toISOString(), interval_label: intervalLabel(nextInterval), xp_earned: xp,
          quest_bonus_xp: progress.bonus, combo, multiplier, total_xp: progress.totalXp, level: newLevel,
          level_up: newLevel > oldLevel, perfect_day: progress.perfect, quests: progress.quests,
        };
        await db.update(schema.reviews).set({ resultJson: JSON.stringify(result) }).where(eq(schema.reviews.gradeUuid, args.grade_uuid));
        ctx.invalidateQueries();
        return result;
      });
    },
  }),

  getTeachState: defineAction({
    request: z.object({ today_key: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }),
    response: teachStateResponse,
    async handler(ctx, args): Promise<z.infer<typeof teachStateResponse>> {
      const db = ctx.db<typeof schema>();
      const [settings, topics, sessions, decks] = await Promise.all([
        getOrCreateTeachingSettings(ctx),
        db.select().from(schema.teachingTopics).orderBy(desc(schema.teachingTopics.updatedAt)),
        db.select().from(schema.teachingSessions).orderBy(desc(schema.teachingSessions.createdAt)).limit(40),
        db.select().from(schema.decks),
      ]);
      const deckTitles = new Map(decks.map((deck) => [deck.id, deck.title]));
      const topicNames = new Map(topics.map((topic) => [topic.id, topic.topic]));
      const streak = teachingStreak(sessions.map((session) => session.dateKey), args.today_key);
      return {
        settings: { class_time: settings.dailyClassTime, reminder_enabled: settings.reminderEnabled },
        streak,
        class_completed_today: sessions.some((session) => session.dateKey === args.today_key),
        topics: topics.map((topic) => {
          const effective = effectiveMastery(topic, args.today_key);
          return {
            id: topic.id, deck_id: topic.deckId, deck_title: deckTitles.get(topic.deckId) ?? "Class",
            topic: topic.topic, mastery: effective.mastery, decay_points: effective.decay,
            total_sessions: topic.totalSessions, last_taught_at: topic.lastTaughtAt?.toISOString() ?? null,
          };
        }),
        recent_sessions: sessions.slice(0, 8).map((session) => ({
          id: session.id, topic_id: session.topicId, topic: topicNames.get(session.topicId) ?? "Topic",
          student_reply: session.studentReply, question: session.question, understood: session.understood,
          knowledge_gap: session.knowledgeGap, mastery_delta: session.masteryDelta, xp_earned: session.xpEarned,
          created_at: session.createdAt.toISOString(),
        })),
      };
    },
  }),

  updateTeachingSchedule: defineAction({
    request: z.object({ class_time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/), reminder_enabled: z.boolean() }),
    response: z.object({ class_time: z.string(), reminder_enabled: z.boolean() }),
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      const current = await getOrCreateTeachingSettings(ctx);
      await db.update(schema.teachingSettings).set({ dailyClassTime: args.class_time, reminderEnabled: args.reminder_enabled, updatedAt: new Date() }).where(eq(schema.teachingSettings.id, current.id));
      ctx.invalidateQueries();
      return { class_time: args.class_time, reminder_enabled: args.reminder_enabled };
    },
  }),

  teachMunki: defineAction({
    request: z.object({
      deck_id: z.number().int().positive(),
      topic: z.string().trim().min(2).max(120),
      explanation: z.string().trim().min(20).max(8_000),
      date_key: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      image_data_base64: z.string().min(20).max(2_800_000).optional(),
      image_mime_type: z.enum(["image/jpeg", "image/png"]).optional(),
    }),
    response: teachReplyResponse,
    async handler(ctx, args): Promise<z.infer<typeof teachReplyResponse>> {
      if ((args.image_data_base64 && !args.image_mime_type) || (!args.image_data_base64 && args.image_mime_type)) throw new Error("The whiteboard snapshot was incomplete.");
      const db = ctx.db<typeof schema>();
      const [deckRows, cardRows, topicRows] = await Promise.all([
        db.select().from(schema.decks).where(eq(schema.decks.id, args.deck_id)).limit(1),
        db.select().from(schema.cards).where(eq(schema.cards.deckId, args.deck_id)).limit(80),
        db.select().from(schema.teachingTopics).where(eq(schema.teachingTopics.deckId, args.deck_id)),
      ]);
      const deck = deckRows[0];
      if (!deck) throw new Error("That class deck no longer exists.");
      const existingTopic = topicRows.find((row) => row.topic.trim().toLocaleLowerCase() === args.topic.trim().toLocaleLowerCase());
      const priorSessions = existingTopic
        ? await db.select().from(schema.teachingSessions).where(eq(schema.teachingSessions.topicId, existingTopic.id)).orderBy(desc(schema.teachingSessions.createdAt)).limit(4)
        : [];
      const currentMastery = existingTopic ? effectiveMastery(existingTopic, args.date_key).mastery : 0;
      const source = cardRows.map((card) => `Prompt: ${card.front}\nAnswer: ${card.back}`).join("\n\n").slice(0, 18_000);
      const continuity = priorSessions.map((session) => `Earlier teaching: ${session.explanation}\nMunki understood: ${session.understood}\nOpen gap: ${session.knowledgeGap}`).join("\n\n").slice(0, 6_000);
      const prompt = [
        `You are Munki, a curious, upbeat AI student in ${deck.title}. The teacher is teaching you ${args.topic} using the Feynman technique.`,
        "Act like a real student who is learning from this explanation. Briefly say what you now understand in your own words, identify the single most important ambiguity or misconception without being harsh, and ask exactly one concrete follow-up question that tests the explanation's missing link.",
        "Do not praise vaguely. Never guilt, scold, act sad, or claim feelings. If the explanation is accurate and complete, ask a transfer question that makes the teacher apply it to a nearby case. Keep your reply conversational and concise.",
        "Judge teaching quality from 1 to 5 based on conceptual accuracy, causal clarity, concrete detail, and whether a learner could reconstruct the idea. Use the class material only to check accuracy; do not reveal unrelated answers.",
        `Current retained mastery is ${Math.round(currentMastery / 10)}%.`,
        continuity ? `What you retained from earlier classes:\n${continuity}` : "This is your first class on this topic.",
        source ? `Relevant class material:\n${source}` : "No card material is available; be explicit about any uncertainty.",
        `Teacher's explanation:\n${args.explanation}`,
        args.image_data_base64 ? "A whiteboard snapshot is attached as part of the teacher's explanation. Read only what is clear." : "No whiteboard snapshot is attached.",
      ].join("\n\n");
      const evaluation = args.image_data_base64 && args.image_mime_type
        ? await ctx.inference.complete(prompt, { schema: teachEvaluationSchema, images: [{ dataBase64: args.image_data_base64, mimeType: args.image_mime_type, filename: "teach-munki-board.png", caption: "Teacher's current whiteboard explanation." }] })
        : await ctx.inference.complete(prompt, { schema: teachEvaluationSchema });
      const masteryGainByQuality = [0, 30, 55, 80, 110, 145];
      const masteryDelta = masteryGainByQuality[evaluation.teaching_quality] ?? 30;
      const nextMastery = Math.min(1000, currentMastery + masteryDelta);
      const now = new Date();
      let topicId: number;
      if (existingTopic) {
        topicId = existingTopic.id;
        await db.update(schema.teachingTopics).set({
          topic: args.topic.trim(), masteryPermille: nextMastery, lastTaughtDateKey: args.date_key,
          lastTaughtAt: now, totalSessions: existingTopic.totalSessions + 1, updatedAt: now,
        }).where(eq(schema.teachingTopics.id, existingTopic.id));
      } else {
        const insertedTopics = await db.insert(schema.teachingTopics).values({
          deckId: args.deck_id, topic: args.topic.trim(), masteryPermille: nextMastery,
          lastTaughtDateKey: args.date_key, lastTaughtAt: now, totalSessions: 1, updatedAt: now,
        }).returning({ id: schema.teachingTopics.id });
        const insertedTopic = insertedTopics[0];
        if (!insertedTopic) throw new Error("Munki could not start this topic.");
        topicId = insertedTopic.id;
      }
      const xp = 12 + evaluation.teaching_quality * 8;
      const profile = await getOrCreateProfile(ctx);
      const combo = evaluation.teaching_quality >= 3 ? profile.currentCombo + 1 : profile.currentCombo;
      const sessionRows = await db.insert(schema.teachingSessions).values({
        topicId, dateKey: args.date_key, explanation: args.explanation, studentReply: evaluation.student_reply,
        question: evaluation.question, understood: evaluation.understood, knowledgeGap: evaluation.knowledge_gap,
        masteryDelta, xpEarned: xp, createdAt: now,
      }).returning({ id: schema.teachingSessions.id });
      const session = sessionRows[0];
      if (!session) throw new Error("Munki's class could not be saved.");
      const progress = await applyGameProgress(ctx, {
        mutationUuid: `teach:${session.id}`, kind: "teach", dateKey: args.date_key, xp,
        knew: false, combo,
      });
      const allDates = await db.select({ dateKey: schema.teachingSessions.dateKey }).from(schema.teachingSessions);
      ctx.invalidateQueries();
      return {
        session_id: session.id, student_reply: evaluation.student_reply, question: evaluation.question,
        understood: evaluation.understood, knowledge_gap: evaluation.knowledge_gap,
        mastery: nextMastery, mastery_delta: masteryDelta, xp_earned: xp + progress.bonus,
        total_xp: progress.totalXp, combo: progress.combo, streak: teachingStreak(allDates.map((row) => row.dateKey), args.date_key),
      };
    },
  }),

  getStudyLab: defineAction({
    request: z.object({ deck_id: z.number().int().positive() }),
    response: z.object({
      deck: z.object({ id: z.number(), title: z.string(), color: z.string() }),
      boards: z.array(z.object({ id: z.number(), title: z.string(), prompt_text: z.string(), strokes_json: z.string(), tutor_reply: z.string(), annotations: z.array(tutorAnnotationSchema), ink_revision: z.number(), updated_at: z.string() })),
      files: z.array(z.object({ id: z.number(), name: z.string(), mime_type: z.string(), size_bytes: z.number(), created_at: z.string() })),
      sessions: z.array(z.object({ id: z.number(), started_at: z.string(), ended_at: z.string().nullable(), duration_minutes: z.number(), intention: z.string(), reflection: z.string() })), 
      attempts: z.array(z.object({ id: z.number(), topic: z.string(), score: z.number(), max_score: z.number(), created_at: z.string() })),
    }),
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      const [decks, boards, files, sessions, attempts] = await Promise.all([
        db.select().from(schema.decks).where(eq(schema.decks.id, args.deck_id)).limit(1),
        db.select().from(schema.studyBoards).where(eq(schema.studyBoards.deckId, args.deck_id)).orderBy(desc(schema.studyBoards.updatedAt)),
        db.select().from(schema.studyFiles).where(eq(schema.studyFiles.deckId, args.deck_id)).orderBy(desc(schema.studyFiles.createdAt)),
        db.select().from(schema.studySessions).where(eq(schema.studySessions.deckId, args.deck_id)).orderBy(desc(schema.studySessions.startedAt)).limit(20),
        db.select().from(schema.practiceAttempts).where(eq(schema.practiceAttempts.deckId, args.deck_id)).orderBy(desc(schema.practiceAttempts.createdAt)).limit(20),
      ]);
      const deck = decks[0];
      if (!deck) throw new Error("That class deck no longer exists.");
      return {
        deck: { id: deck.id, title: deck.title, color: deck.color },
        boards: boards.map((board) => ({ id: board.id, title: board.title, prompt_text: board.promptText, strokes_json: board.strokesJson, tutor_reply: board.tutorReply, annotations: safeAnnotations(board.annotationsJson), ink_revision: board.inkRevision, updated_at: board.updatedAt.toISOString() })),
        files: files.map((file) => ({ id: file.id, name: file.name, mime_type: file.mimeType, size_bytes: file.sizeBytes, created_at: file.createdAt.toISOString() })),
        sessions: sessions.map((session) => ({ id: session.id, started_at: session.startedAt.toISOString(), ended_at: session.endedAt?.toISOString() ?? null, duration_minutes: session.durationMinutes, intention: session.intention, reflection: session.reflection })),
        attempts: attempts.map((attempt) => ({ id: attempt.id, topic: attempt.topic, score: attempt.score, max_score: attempt.maxScore, created_at: attempt.createdAt.toISOString() })),
      };
    },
  }),

  createStudyBoard: defineAction({
    request: z.object({ deck_id: z.number().int().positive(), title: z.string().trim().min(1).max(80), prompt_text: z.string().trim().max(4000).default("") }),
    response: z.object({ id: z.number() }),
    async handler(ctx, args) {
      const now = new Date();
      const rows = await ctx.db<typeof schema>().insert(schema.studyBoards).values({ deckId: args.deck_id, title: args.title, promptText: args.prompt_text, createdAt: now, updatedAt: now }).returning({ id: schema.studyBoards.id });
      const row = rows[0];
      if (!row) throw new Error("The board could not be created.");
      ctx.invalidateQueries();
      return { id: row.id };
    },
  }),

  saveStudyBoard: defineAction({
    request: z.object({ board_id: z.number().int().positive(), strokes_json: z.string().max(4_000_000), ink_revision: z.number().int().nonnegative() }),
    response: boardSaveResponse,
    async handler(ctx, args): Promise<z.infer<typeof boardSaveResponse>> {
      let parsed: unknown;
      try { parsed = JSON.parse(args.strokes_json); } catch { throw new Error("The board data is not valid."); }
      if (!Array.isArray(parsed)) throw new Error("The board data is not valid.");
      const db = ctx.db<typeof schema>();
      const rows = await db.select().from(schema.studyBoards).where(eq(schema.studyBoards.id, args.board_id)).limit(1);
      const board = rows[0];
      if (!board) throw new Error("That board no longer exists.");
      if (args.ink_revision < board.inkRevision || (args.ink_revision === board.inkRevision && args.strokes_json !== board.strokesJson)) {
        return { ok: true, stale: true, ink_revision: board.inkRevision, strokes_json: board.strokesJson };
      }
      if (args.ink_revision === board.inkRevision) {
        return { ok: true, stale: false, ink_revision: board.inkRevision, strokes_json: board.strokesJson };
      }
      const saved = await db.update(schema.studyBoards).set({
        strokesJson: args.strokes_json,
        inkRevision: args.ink_revision,
        coachRequestId: null,
        updatedAt: new Date(),
      }).where(and(eq(schema.studyBoards.id, args.board_id), eq(schema.studyBoards.inkRevision, board.inkRevision))).returning({ id: schema.studyBoards.id });
      if (!saved[0]) {
        const latestRows = await db.select().from(schema.studyBoards).where(eq(schema.studyBoards.id, args.board_id)).limit(1);
        const latest = latestRows[0];
        if (!latest) throw new Error("That board no longer exists.");
        return { ok: true, stale: true, ink_revision: latest.inkRevision, strokes_json: latest.strokesJson };
      }
      return { ok: true, stale: false, ink_revision: args.ink_revision, strokes_json: args.strokes_json };
    },
  }),

  saveStudyBoardAnnotations: defineAction({
    request: z.object({ board_id: z.number().int().positive(), annotations: z.array(tutorAnnotationSchema).max(5) }), response: studyOkResponse,
    async handler(ctx, args): Promise<z.infer<typeof studyOkResponse>> {
      await ctx.db<typeof schema>().update(schema.studyBoards).set({ annotationsJson: JSON.stringify(args.annotations), updatedAt: new Date() }).where(eq(schema.studyBoards.id, args.board_id));
      ctx.invalidateQueries(); return { ok: true };
    },
  }),

  cancelStudyBoardCoach: defineAction({
    request: z.object({ board_id: z.number().int().positive(), request_id: z.string().uuid(), captured_revision: z.number().int().nonnegative() }), response: studyOkResponse,
    async handler(ctx, args): Promise<z.infer<typeof studyOkResponse>> {
      await ctx.db<typeof schema>().update(schema.studyBoards).set({ coachRequestId: null }).where(and(eq(schema.studyBoards.id, args.board_id), eq(schema.studyBoards.inkRevision, args.captured_revision), eq(schema.studyBoards.coachRequestId, args.request_id)));
      return { ok: true };
    },
  }),

  deleteStudyBoard: defineAction({
    request: z.object({ board_id: z.number().int().positive() }), response: studyOkResponse,
    async handler(ctx, args): Promise<z.infer<typeof studyOkResponse>> {
      await ctx.db<typeof schema>().delete(schema.studyBoards).where(eq(schema.studyBoards.id, args.board_id));
      ctx.invalidateQueries(); return { ok: true };
    },
  }),

  coachStudyBoard: defineAction({
    request: z.object({
      board_id: z.number().int().positive(),
      image_data_base64: z.string().min(20).max(2_000_000),
      image_mime_type: z.literal("image/jpeg"),
      strokes_json: z.string().max(4_000_000),
      question: z.string().trim().max(600).default(""),
      prior_tutor_reply: z.string().max(1_000).default(""),
      request_id: z.string().uuid(),
      hint_level: z.number().int().min(1).max(3).default(1),
      captured_revision: z.number().int().nonnegative(),
    }),
    response: boardCoachActionResponse,
    async handler(ctx, args): Promise<z.infer<typeof boardCoachActionResponse>> {
      let parsedStrokes: unknown;
      try { parsedStrokes = JSON.parse(args.strokes_json); } catch { throw new Error("The board data is not valid."); }
      if (!Array.isArray(parsedStrokes)) throw new Error("The board data is not valid.");
      const db = ctx.db<typeof schema>();
      const rows = await db.select().from(schema.studyBoards).where(eq(schema.studyBoards.id, args.board_id)).limit(1);
      const board = rows[0];
      if (!board) throw new Error("That board no longer exists.");
      if (board.inkRevision > args.captured_revision) throw new Error("The board changed before Munki could read it. Capture it again.");
      const claimed = await db.update(schema.studyBoards).set({
        strokesJson: args.strokes_json,
        inkRevision: args.captured_revision,
        coachRequestId: args.request_id,
        updatedAt: new Date(),
      }).where(and(
        eq(schema.studyBoards.id, board.id),
        lte(schema.studyBoards.inkRevision, args.captured_revision),
        isNull(schema.studyBoards.coachRequestId),
      )).returning({ id: schema.studyBoards.id });
      if (!claimed[0]) throw new Error("The board changed or another tutor check is already running. Capture it again.");
      const decks = await db.select().from(schema.decks).where(eq(schema.decks.id, board.deckId)).limit(1);
      const deck = decks[0];
      const result = await ctx.inference.complete([
        `You are a fast Socratic tutor reading a student's current whiteboard for ${deck?.title ?? "this class"}.`,
        "Inspect only the current image. Never claim to read unclear writing.",
        "Return exactly two brief visible sentences: reply is one sentence identifying the first issue and giving the allowed hint; question is one short Socratic question. Never solve the whole problem.",
        `Hint ${args.hint_level} of 3: level 1 gives only a conceptual cue; level 2 names the method and partially frames setup; level 3 reveals only the next operation or one micro-step.`,
        "If a line is wrong, place one circle tightly around that exact line using normalized coordinates. Add at most one arrow or very short label only when it makes the correction clearer; do not cover the writing.",
        args.question ? `Student asks: ${args.question}` : "Check the first questionable step.",
        args.prior_tutor_reply ? `Prior note for continuity only: ${args.prior_tutor_reply}` : "No prior note.",
      ].join("\n"), { schema: boardCoachResponse, images: [{
        dataBase64: args.image_data_base64,
        mimeType: "image/jpeg",
        filename: `${board.title}-current.jpg`,
        caption: "Current whiteboard; authoritative.",
      }] });
      const savedReply = `Nudge: ${result.reply}\nNext: ${result.question}`;
      const updated = await db.update(schema.studyBoards).set({ tutorReply: savedReply, annotationsJson: JSON.stringify(result.annotations), coachRequestId: null, updatedAt: new Date() }).where(and(eq(schema.studyBoards.id, board.id), eq(schema.studyBoards.inkRevision, args.captured_revision), eq(schema.studyBoards.coachRequestId, args.request_id))).returning({ id: schema.studyBoards.id });
      if (!updated[0]) return { ...result, annotations: [], board_changed: true };
      ctx.invalidateQueries();
      return { ...result, board_changed: false };
    },
  }),

  getPracticeGeneratorOptions: defineAction({
    request: z.object({ deck_id: z.number().int().positive() }),
    response: practiceGeneratorOptionsResponse,
    async handler(ctx, args): Promise<z.infer<typeof practiceGeneratorOptionsResponse>> {
      const cards = await ctx.db<typeof schema>().select().from(schema.cards).where(eq(schema.cards.deckId, args.deck_id)).limit(500);
      const exams = examSourcesForCards(cards);
      const topics = [...new Set(cards.flatMap(contentTags).map((tag) => tag.trim()).filter((tag) => tag.length >= 2 && tag.length <= 80))]
        .sort((a, b) => a.localeCompare(b)).slice(0, 30);
      return {
        exam_sources: exams.eligible.map((source) => ({ id: source.id, label: source.label, card_count: source.cards.length, released_at: source.releasedAt })),
        sealed_source_count: exams.sealed.length,
        topics,
      };
    },
  }),

  generatePractice: defineAction({
    request: z.object({
      deck_id: z.number().int().positive(),
      mode: z.enum(["exam", "topic"]),
      exam_source_id: z.string().max(180).nullable().default(null),
      topic: z.string().trim().max(160).default(""),
      count: z.number().int().min(3).max(8).default(5),
    }),
    response: generatedPracticeResponse,
    async handler(ctx, args): Promise<z.infer<typeof generatedPracticeResponse>> {
      const db = ctx.db<typeof schema>();
      const [decks, cards] = await Promise.all([
        db.select().from(schema.decks).where(eq(schema.decks.id, args.deck_id)).limit(1),
        db.select().from(schema.cards).where(eq(schema.cards.deckId, args.deck_id)).limit(500),
      ]);
      const deck = decks[0];
      if (!deck) throw new Error("That class deck no longer exists.");

      // Sealing is enforced here, before any prompt is built. The two newest
      // dated released-exam groups are never included in any generator mode.
      const exams = examSourcesForCards(cards);
      const sealedCardIds = new Set(exams.sealed.flatMap((source) => source.cards.map((card) => card.id)));
      const safeCards = cards.filter((card) => !sealedCardIds.has(card.id));
      let sourceCards: (typeof schema.cards.$inferSelect)[];
      let sourceLabel: string;
      if (args.mode === "exam") {
        const selected = exams.eligible.find((source) => source.id === args.exam_source_id);
        if (!selected) throw new Error("Choose an eligible older released exam. The two newest releases stay sealed for final mock evaluation.");
        sourceCards = selected.cards;
        sourceLabel = `${selected.label} · released ${selected.releasedAt}`;
      } else {
        const topic = args.topic.trim();
        if (!topic) throw new Error("Choose or enter a lesson, unit, or topic.");
        const terms = topic.toLowerCase().split(/[^a-z0-9]+/).filter((term) => term.length > 2);
        const matched = safeCards.filter((card) => {
          const haystack = `${card.front} ${card.back} ${contentTags(card).join(" ")}`.toLowerCase();
          return terms.length === 0 || terms.some((term) => haystack.includes(term));
        });
        sourceCards = matched;
        sourceLabel = topic;
      }
      if (sourceCards.length < 2) throw new Error(args.mode === "exam"
        ? "That older exam needs at least two source cards before Munki can build a faithful variant."
        : "Add at least two non-sealed cards for this topic so practice stays grounded in your material.");

      const allowedIds = new Set(sourceCards.map((card) => card.id));
      const source = sourceCards.map((card, index) => {
        const video = workedVideoForCard(card, deck.title);
        return `${index + 1}. Card ID ${card.id}${video ? ` · lesson video ${video}` : ""}\nPrompt: ${card.front}\nAnswer: ${card.back}`;
      }).join("\n\n").slice(0, 30_000);
      const draft = await ctx.inference.complete([
        `Create exactly ${args.count} practice problems for ${deck.title}.`,
        args.mode === "exam"
          ? `Model the underlying principles and difficulty of the eligible older released exam ${sourceLabel}. Change all numbers and, where relevant, reskin the scenario so recall alone cannot answer it.`
          : `Focus on this lesson, unit, or topic: ${sourceLabel}.`,
        "Use only the source material below. Never use or refer to excluded or sealed exams. Prefer full mathematical reasoning, method selection, setup, computation, and error analysis over copied definitions.",
        "Each problem needs four plausible choices, a concise explanation, a complete step-by-step solution, and a short worked-video storyboard. The storyboard must teach this exact generated problem, with 3–7 paced scenes that fully cover the solution without skipping algebra. Use source Card IDs and listed lesson video IDs only for linked resources.",
        `Eligible source material:\n${source}`,
      ].join("\n\n"), { schema: generatedPracticeDraftResponse });

      const cardMap = new Map(sourceCards.map((card) => [card.id, card]));
      return {
        title: draft.title,
        mode: args.mode,
        source_label: sourceLabel,
        questions: draft.questions.map((question, questionIndex) => {
          const resourceIds = [...new Set(question.resource_card_ids)].filter((id) => allowedIds.has(id)).slice(0, 3);
          const resourceCards = resourceIds.flatMap((id) => {
            const card = cardMap.get(id);
            return card ? [{ id: card.id, front: card.front, back: card.back, worked_video_id: workedVideoForCard(card, deck.title) }] : [];
          });
          const allowedVideos = [...new Set(question.lesson_video_ids)].filter((videoId) => sourceCards.some((card) => workedVideoForCard(card, deck.title) === videoId));
          return {
            ...question,
            id: `${questionIndex + 1}-${question.id || "problem"}`.slice(0, 40),
            resource_card_ids: resourceIds,
            lesson_video_ids: allowedVideos,
            worked_video: {
              ...question.worked_video,
              duration_seconds: question.worked_video.scenes.reduce((sum, scene) => sum + scene.seconds, 0),
            },
            resource_cards: resourceCards,
          };
        }),
      };
    },
  }),

  savePracticeAttempt: defineAction({
    request: z.object({ attempt_uuid: z.string().uuid(), deck_id: z.number().int().positive(), topic: z.string().max(160), score: z.number().int().nonnegative(), max_score: z.number().int().min(1).max(20), date_key: z.string().min(8).max(10) }),
    response: practiceSaveResponse,
    async handler(ctx, args): Promise<z.infer<typeof practiceSaveResponse>> {
      return withGameMutationLock(async () => {
        if (args.score > args.max_score) throw new Error("That score is not valid.");
        const db = ctx.db<typeof schema>();
        const priorRows = await db.select().from(schema.practiceAttempts).where(eq(schema.practiceAttempts.attemptUuid, args.attempt_uuid)).limit(1);
        const prior = priorRows[0];
        if (prior?.resultJson) {
          const parsed = practiceSaveResponse.safeParse(JSON.parse(prior.resultJson));
          if (parsed.success) return parsed.data;
        }
        const profile = await getOrCreateProfile(ctx);
        const xp = 15 + args.score * 8 + (args.max_score - args.score) * 4;
        const rows = prior ? [prior] : await db.insert(schema.practiceAttempts).values({ attemptUuid: args.attempt_uuid, deckId: args.deck_id, topic: args.topic, score: args.score, maxScore: args.max_score, createdAt: new Date() }).returning();
        const row = rows[0];
        if (!row) throw new Error("The practice result could not be saved.");
        const progress = await applyGameProgress(ctx, { mutationUuid: `practice:${args.attempt_uuid}`, kind: "practice", dateKey: args.date_key, xp, knew: false, combo: profile.currentCombo, practiceRun: true });
        const totalGained = xp + progress.bonus;
        const result: z.infer<typeof practiceSaveResponse> = {
          id: row.id, xp_earned: xp, quest_bonus_xp: progress.bonus, total_xp: progress.totalXp,
          level: levelInfo(progress.totalXp).level, level_up: levelInfo(progress.totalXp).level > levelInfo(progress.totalXp - totalGained).level,
          perfect_day: progress.perfect, quests: progress.quests,
        };
        await db.update(schema.practiceAttempts).set({ resultJson: JSON.stringify(result) }).where(eq(schema.practiceAttempts.id, row.id));
        ctx.invalidateQueries();
        return result;
      });
    },
  }),

  uploadStudyFile: defineAction({
    request: z.object({ deck_id: z.number().int().positive(), name: z.string().min(1).max(240), mime_type: z.string().max(160), size_bytes: z.number().int().positive().max(25_000_000), data_base64: z.string() }),
    response: z.object({ id: z.number() }),
    async handler(ctx, args) {
      const bytes = Buffer.from(args.data_base64, "base64");
      if (bytes.byteLength !== args.size_bytes) throw new Error("The uploaded file was incomplete.");
      const key = `study-files/${args.deck_id}/${crypto.randomUUID()}`;
      await ctx.blobs.put(key, bytes, { contentType: args.mime_type || "application/octet-stream" });
      try {
        const rows = await ctx.db<typeof schema>().insert(schema.studyFiles).values({ deckId: args.deck_id, name: args.name, mimeType: args.mime_type || "application/octet-stream", sizeBytes: args.size_bytes, blobKey: key, createdAt: new Date() }).returning({ id: schema.studyFiles.id });
        const row = rows[0];
        if (!row) throw new Error("The file could not be saved.");
        ctx.invalidateQueries(); return { id: row.id };
      } catch (error) {
        await Promise.allSettled([ctx.blobs.delete(key)]);
        throw error;
      }
    },
  }),

  getStudyFileUrl: defineAction({
    request: z.object({ file_id: z.number().int().positive() }), response: z.object({ url: z.string(), name: z.string() }),
    async handler(ctx, args) {
      const rows = await ctx.db<typeof schema>().select().from(schema.studyFiles).where(eq(schema.studyFiles.id, args.file_id)).limit(1);
      const file = rows[0]; if (!file) throw new Error("That file no longer exists.");
      return { url: await ctx.blobs.getUrl(file.blobKey), name: file.name };
    },
  }),

  deleteStudyFile: defineAction({
    request: z.object({ file_id: z.number().int().positive() }), response: studyOkResponse,
    async handler(ctx, args): Promise<z.infer<typeof studyOkResponse>> {
      const db = ctx.db<typeof schema>();
      const rows = await db.select().from(schema.studyFiles).where(eq(schema.studyFiles.id, args.file_id)).limit(1);
      const file = rows[0];
      if (file) {
        await db.delete(schema.studyFiles).where(eq(schema.studyFiles.id, file.id));
        await Promise.allSettled([ctx.blobs.delete(file.blobKey)]);
      }
      ctx.invalidateQueries(); return { ok: true };
    },
  }),

  getActiveFocusSession: defineAction({
    request: z.object({}),
    response: z.object({ session: z.object({ id: z.number(), deck_id: z.number(), deck_title: z.string(), deck_color: z.string(), started_at: z.string(), duration_minutes: z.number(), intention: z.string() }).nullable() }),
    async handler(ctx) {
      const db = ctx.db<typeof schema>();
      const sessions = await db.select().from(schema.studySessions).where(isNull(schema.studySessions.endedAt)).orderBy(desc(schema.studySessions.startedAt)).limit(1);
      const active = sessions[0];
      if (!active) return { session: null };
      const deckRows = await db.select().from(schema.decks).where(eq(schema.decks.id, active.deckId)).limit(1);
      const deck = deckRows[0];
      return { session: { id: active.id, deck_id: active.deckId, deck_title: deck?.title ?? "Study session", deck_color: deck?.color ?? "#2457D6", started_at: active.startedAt.toISOString(), duration_minutes: active.durationMinutes, intention: active.intention } };
    },
  }),

  startStudySession: defineAction({
    request: z.object({ deck_id: z.number().int().positive(), intention: z.string().trim().max(300), duration_minutes: z.number().int().min(5).max(180) }),
    response: z.object({ id: z.number(), started_at: z.string(), duration_minutes: z.number() }),
    async handler(ctx, args) {
      return withGameMutationLock(async () => {
        const db = ctx.db<typeof schema>();
        const openRows = await db.select().from(schema.studySessions).where(isNull(schema.studySessions.endedAt)).orderBy(desc(schema.studySessions.startedAt)).limit(1);
        const open = openRows[0];
        if (open) return { id: open.id, started_at: open.startedAt.toISOString(), duration_minutes: open.durationMinutes };
        const startedAt = new Date();
        const rows = await db.insert(schema.studySessions).values({ deckId: args.deck_id, intention: args.intention, durationMinutes: args.duration_minutes, startedAt }).returning({ id: schema.studySessions.id });
        const row = rows[0]; if (!row) throw new Error("The focus session could not start.");
        ctx.invalidateQueries(); return { id: row.id, started_at: startedAt.toISOString(), duration_minutes: args.duration_minutes };
      });
    },
  }),

  endStudySession: defineAction({
    request: z.object({ session_id: z.number().int().positive(), reflection: z.string().trim().max(1000), date_key: z.string().min(8).max(10) }),
    response: labRewardResponse,
    async handler(ctx, args): Promise<z.infer<typeof labRewardResponse>> {
      return withGameMutationLock(async () => {
        const db = ctx.db<typeof schema>();
        const rows = await db.select().from(schema.studySessions).where(eq(schema.studySessions.id, args.session_id)).limit(1);
        const session = rows[0];
        if (!session) throw new Error("That focus session no longer exists.");
        if (session.resultJson) {
          const parsed = labRewardResponse.safeParse(JSON.parse(session.resultJson));
          if (parsed.success) return parsed.data;
        }
        const endedAt = session.endedAt ?? new Date();
        const elapsedMinutes = Math.max(1, Math.floor((endedAt.getTime() - session.startedAt.getTime()) / 60_000));
        const xp = Math.max(5, Math.min(session.durationMinutes * 2, elapsedMinutes * 2));
        const profile = await getOrCreateProfile(ctx);
        const progress = await applyGameProgress(ctx, { mutationUuid: `focus:${session.id}`, kind: "focus", dateKey: args.date_key, xp, knew: false, combo: profile.currentCombo, focusSession: true });
        const totalGained = xp + progress.bonus;
        const result: z.infer<typeof labRewardResponse> = {
          xp_earned: xp, quest_bonus_xp: progress.bonus, total_xp: progress.totalXp,
          level: levelInfo(progress.totalXp).level, level_up: levelInfo(progress.totalXp).level > levelInfo(progress.totalXp - totalGained).level,
          perfect_day: progress.perfect, quests: progress.quests,
        };
        await db.update(schema.studySessions).set({ endedAt, reflection: args.reflection, resultJson: JSON.stringify(result) }).where(eq(schema.studySessions.id, args.session_id));
        ctx.invalidateQueries();
        return result;
      });
    },
  }),
} satisfies ActionsModule;
