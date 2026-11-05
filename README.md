# Munki 🐵 — the study app that opens like a feed, not a chore

**Meta Global AI Developer Hackathon — Indie Dev track submission.**

## Pitch

Tarushv is a Purdue freshman with ADHD juggling MA 162, PHYS 172, and CNIT 182. Every study app he tried starts with menus, deck pickers, and setup — decisions *before* learning, which is exactly where an ADHD brain bounces off. Munki deletes the decision: **open the app and you're already studying.** Home is an infinite flashcard feed (due-weighted, mixed decks). Tap to flip, "Knew it" / "Again", XP floats up, combos build, and a 2–5 minute session feels like progress instead of homework.

Munki is not a demo deck viewer: it runs a **real SM-2 spaced-repetition engine** over **real course content** — decision-first cards for the actual exams on his calendar (MA 162 Exam 3, Nov 9; PHYS 172 Exam 3, Nov 30; CNIT 182's November deliverable stack) — plus a **Study Lab** (Socratic whiteboard tutor, quiz generator, focus timer, diagnostics) and a **deterministic study planner** that weighs what's due, what's weak, and what's about to be an exam.

## Run it

```bash
./run.sh            # creates .venv, installs deps, serves http://127.0.0.1:8010
```

Works **fully offline**. No key, no account, no setup — the feed is live on first paint.

### Meta Model API (optional)

```bash
export META_API_KEY=<your dev.meta.ai key>
export META_API_BASE_URL=https://api.meta.ai/v1   # default
export META_MODEL=muse-spark-1.3                    # default
./run.sh
```

Config is **environment-only** — no key is ever stored in code or files. With a key, the tutor generates Socratic walkthroughs (including from a photo/sketch of your whiteboard), Munki Drop writes cards, and quiz questions are model-written. **Without a key, every feature still works** via deterministic fallbacks, and every AI-shaped output is honestly labeled `"meta-api"` vs `"fallback"` — Munki never fabricates model output.

## Features

- **Munki Drop** — paste notes or a syllabus, or drop a PDF, `.txt`, or `.md` file (up to 15 MB), and a ready-to-study deck lands at the front of the feed. The offline extractor reads headings as topics and turns definitions ("Term: definition", "X is a Y", "X refers to Y"), formulas ("p = mv (momentum)"), Q/A pairs, bullet lists, and key-idea lines into cards. It cleans PDF artifacts first: ligatures, hyphenated and wrapped lines, page numbers, and running headers and footers. Every card is checked against every deck (and the rest of the batch) so nothing lands twice, and committing the same import again adds nothing. Preview first, then commit into a new `drop-*` deck or an existing one. With a Meta key the model writes the cards instead, and any Meta failure falls back to the extractor, labeled `fallback`.
- **Feed-first home** — a physical card stack: fresh Munki Drop cards first (newest import on top, in document order), then due cards, then new, and it refills itself as you go. Tap or `Space` flips the card in 3D. Drag it and it follows your finger with a KNEW IT / AGAIN stamp; a flick (velocity, not just distance) flings it off with momentum, and a short drag springs back. The next card is already waiting underneath. Keyboard: `Space` flip, `1`/`→` knew it, `2`/`←` again. First run shows a one-line coach on the card itself, never a modal.
- **Gamification without punishment** — XP on every grade (Knew it = 10, Again = 5, never zero), combo multipliers (×2 @ 5, ×3 @ 10, ×5 @ 20), ~1-in-12 **CRITICAL** cards paying double, gentle levels, deck **mastery rings**, 3 auto daily quests that pay their XP once, a perfect-day bonus, and **forgiving streaks** (an active day *or* a perfect day keeps it alive). No leaderboards, no red-X shaming, no streak-loss drama. Sound is optional and **off by default**.
- **Reward moments (visual only)** — every grade sends an XP chip flying along an arc into the HUD counter, which rolls up; knew-it grades burst sparks. Combo tiers slam a banner over the card with a shockwave and recolor the stage glow. CRITICAL cards wear a spinning holographic border. Quests pop, shine, and pay out with a toast; a perfect day rains confetti; the streak flame ignites; level up takes the screen with rays and confetti. Everything animates transform and opacity only, particles draw on one canvas, and `prefers-reduced-motion` turns movement into short fades.
- **Blitz mode** — 60-second rapid-fire, score = XP, personal best, one-tap "Run it back."
- **Real SRS (SM-2)** — per-card ease / interval / repetitions / due date; lapses reset properly; reviews persist in SQLite.
- **Seed decks (90 cards, zero duplicates across decks)** — MA 162 Exam 3 (40: sequences, series tests, power/Taylor, polar — decision-first: *which test, what's the setup, what's the trap*), PHYS 172 (25: momentum/energy/angular-momentum principles), CNIT 182 (25: SDLC, diagrams, ERD, SQL/joins, security & risk math). Seeding is idempotent and never overwrites your progress.
- **Study Lab**
  - *Whiteboard tutor* — draw on the canvas + type the problem → step-by-step Socratic walkthrough (final answer last, on purpose). Meta path sends the sketch as a vision input; fallback = template walkthroughs (series-test selection, Taylor setup, momentum setup, polar, SQL) + a generic scaffold.
  - *Quiz generator* — MC questions built from real cards (correct answer + plausible same-deck distractors), instant grading with explanations; results feed diagnostics.
  - *Focus sessions* — Pomodoro-style timer (25/5 default, configurable), lock-in mode, minutes logged per deck/day.
  - *Diagnostics* — per-topic accuracy from reviews + quizzes → ranked "still cooking" topics → **Targeted review** pulls those cards to the front of the feed.
- **Study plan view** — seeded real deadlines (MA Exam 3 Nov 9 · PHYS Exam 3 Nov 30 · CNIT 182: SQL Nov 4, ERD Nov 6, Implementation + Security Nov 13, Exam III + Lab Exam II Nov 18, Milestone III Nov 20) in an **editable** deadlines table; a deterministic day-by-day plan weighs SRS due counts, weak topics, and deadline proximity.
- **Inclusion** — plain-language toggle, dyslexia-friendly font toggle, full keyboard navigation, `prefers-reduced-motion` respected, high-contrast-safe palette.

## Architecture

```
app/
  main.py         FastAPI API + serves the SPA
  srs.py          SM-2 engine (pure functions)
  gamification.py XP / combo / levels / quests / streaks (pure, deterministic)
  db.py           SQLite: decks, cards, card_state, reviews, blitz, focus,
                  deadlines, settings — one connection per thread (WAL,
                  schema + indexes applied once), not one per call
  seed.py         idempotent seeding (seed data separate from user data)
  seed_data/      ma162.json · phys172.json · cnit182.json
  quiz.py         card-derived MC generation + grading (distractor integrity)
  diagnostics.py  per-topic accuracy → weak-topic ranking → targeted queue
  planner.py      deterministic deadline-weighted day-by-day plan
  tutor.py        Meta walkthroughs OR labeled template fallbacks
  drop.py         Munki Drop: PDF/text ingestion + cleanup, card rule table
                  under a heading tracker, cross-deck dedupe, preview/commit
  meta_client.py  OpenAI-compatible Meta client (env-only, raises → fallback)
  demo.py         dev-only recording primes, mounted only when MUNKI_DEMO=1
frontend/         vanilla JS ES modules, no build step
  app.js          entry: view registry, settings, keyboard, drag-a-file-anywhere
  js/stack.js     card stack: drag, velocity fling, spring-back, 3D flip
  js/rewards.js   HUD + reward choreography from gamification snapshot diffs
  js/motion.js    WAAPI helpers, spring integrator, arc flights, count-ups
  js/fx.js        one canvas for sparks, confetti, and shockwave rings
  js/views/       feed, drop, blitz, lab, decks, plan (each owns its markup)
tests/            pytest: SRS math, gamification, seed invariants, quiz,
                  diagnostics, planner, API endpoints, fallback labeling,
                  refactor regressions, Munki Drop (pdf_fixture.py builds
                  test PDFs with the stdlib), quest payouts, demo primes
```

## Recording a demo

Reward moments can be put on cue. Start a scratch copy with the dev-only demo API on:

```bash
MUNKI_DEMO=1 MUNKI_DATA_DIR=/tmp/munki-demo ./run.sh
```

Then open `http://127.0.0.1:8010/?demo=1` with any of:

- `prime=levelup,combo,combo19,quest,streak` sets the state one grade away from a level up, a ×2 combo (combo 4), a ×5 combo (combo 19), a finished quest, or a 3-day streak.
- `critical=1` makes the first card CRITICAL.
- `coach=reset` replays the first-run coach; `coach=skip` hides it.
- `panel=0` hides the small pink DEMO panel, which has the same primes as buttons.

Without `MUNKI_DEMO=1` the `/api/demo/*` routes do not exist, and without `?demo=1` the frontend never loads `js/demo.js`. Stable `data-hook` attributes mark every element a recording script targets (`feed-card`, `grade-knew`, `xp-counter`, `combo-meter`, `drop-study`, and so on).

## Performance & hardening (Nov 2 refactor pass)

Measured with a connection-counting benchmark harness (TestClient, scratch DB):

| Operation | Before | After |
|---|---|---|
| POST /api/review | 8.30 ms · 13 connections | **2.42 ms · shared connection** |
| GET /api/diagnostics | 10.89 ms · stats computed 3× | **5.26 ms · computed once** |
| GET /api/plan | 11.48 ms | **5.63 ms** (planner core 4.27 → 1.50 ms) |
| GET /api/decks | 5.93 ms · N+1 queries | **2.60 ms · one grouped query** |
| GET /api/gamification | 6.54 ms · 7 connections | **2.32 ms** |
| build_feed(30) | 1.28 ms · O(n²) partition | **0.65 ms · single pass** |

The same pass fixed a latent crash: re-grading one card repeatedly in a
session compounded its SM-2 interval unboundedly (57,298 days by the 10th
straight "Knew it"; the review endpoint 500'd on the 14th). Intervals are
now capped at 365 days (`srs.MAX_INTERVAL_DAYS`) — the only deliberate
deviation from textbook SM-2, and it only binds in territory no real
schedule reaches. Also: quiz questions accept exactly one graded attempt
(diagnostics stay honest), Blitz can no longer leak a timer or double-post
a score, the sound toggle drives a small WebAudio synth (still off by
default), and the plain-language toggle actually swaps in simpler copy.

## Judging fit

- **Impact (30)** — built for one real student's real semester and a real neurotype: ADHD-first session design (2–5 min, zero-friction entry, no punishment mechanics) directly targets the moment students quit studying apps.
- **Meta tooling (25)** — Meta Model API (`muse-spark-1.3`, OpenAI-compatible) powers tutor walkthroughs with vision (whiteboard sketches), card generation, and quiz writing when configured — with honest fallback labeling, not fake AI.
- **Demo experience (25)** — one command, offline-capable, feed is studying within a second of opening; Blitz and combos demo in under a minute (script below).
- **Technical depth (20)** — real SM-2 scheduling, deterministic gamification/quest/planner algorithms, diagnostics loop that changes what the feed serves, and a full pytest suite (SM-2 math, distractor integrity, seed idempotency, API surface).

## 2-minute demo script

1. *(0:00)* `./run.sh`, open the app — **don't click anything in a menu**: you're already looking at a flashcard. "This is the whole idea: opening Munki = studying."
2. *(0:20)* Flip (`Space`), grade "Knew it" (`1`) a few times — XP floaters, combo meter climbing to ×2. Point at today's 3 quests and the streak.
3. *(0:50)* Hit **Blitz**, run 20 seconds of the 60 — rapid-fire grading, then "Run it back" and the personal best.
4. *(1:15)* **Study Lab → Whiteboard tutor**: type "Σ (2n/(3n+1))^n — which test?" → Socratic steps. Note the `Source: fallback` label; with `META_API_KEY` set, the same box returns a model walkthrough labeled `meta-api`, sketch included.
5. *(1:40)* **Plan view**: show the real deadline stack and today's deterministic focus; **Decks**: mastery rings. Close: "Real SRS, real course content, no punishment mechanics — a study OS an ADHD brain actually opens."

## Honest limitations

- Quiz distractors in fallback mode are other cards' answers — plausible by topic, not model-crafted; the Meta path writes better ones when a key is present.
- The tutor's fallback walkthroughs cover five problem families plus a generic scaffold; outside those, steps are generic (and labeled as such).
- Quests track same-day activity stored locally; there's no account system or cross-device sync — it's a solo, local-first app by design.
- The whiteboard canvas is a sketch pad, not handwriting recognition; the Meta vision path interprets it, the fallback ignores the drawing.
- Seed content is one semester's courses (Tarushv's) — Munki Drop is the path for new material.
- Munki Drop's offline extractor reads structure, not meaning: prose without definitions, formulas, Q/A, or lists yields few cards, and scanned PDFs (no text layer) yield none. It says so instead of guessing.

## Tests

```bash
.venv/bin/python -m pytest -q
```
