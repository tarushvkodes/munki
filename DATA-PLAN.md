# Data Plan

## User-provided lesson videos

Munki bundles MP4 lesson videos supplied from `~/workspace/manim/videos/` as build-time owned assets under `client/src/assets/videos/`. Before each client build, `client/sync-videos.mjs` reads every declared `lessonNN/*.mp4` entry in `client/video-manifest.json`, copies new files into owned assets, validates its lesson, topic, format, target assessment, and assessment date, and generates the registry consumed by the Watch feed. New lesson folders therefore enter the feed on the next build without component or server code changes: add the MP4 and its manifest entry. Entries marked `sealed` are omitted from the generated registry.

The manifest also records the user-provided assessment schedule: MA 162 Quiz 5 (Lessons 15–17) due October 8, 2026 at 11:59 PM; MA 162 Quiz 6 (Lessons 18–19) on October 15; MA 162 Exam 2 on October 20 at 8:00 PM; and PHYS 172 Exam 2 on October 28 at 8:00 PM. The client ranks visible videos from their declared assessment date with a steep final-week urgency curve, demotes videos whose one-time 80% completion award has already been recorded, and uses lesson order with Shorts before Explainers as the stable tie-breaker.

No network source is required at runtime. Watch completion and one-time combo-safe XP awards are stored through the artifact's existing database actions; playback progress remains in the browser video element until the 80% completion threshold is reached.

## Mascot state and cosmetics

The mascot's default name, unlocked/equipped cosmetic IDs, XP spent, and last interaction timestamp are persisted in the artifact database. Available cosmetic XP is derived from lifetime earned XP minus cosmetic spend, so buying an accessory never lowers the user's level, combo, streak, or study progress. Focus, watching, streak, idle, and celebration poses are derived from the app's real current state; no external source is used.
