# Task: the Coach reads Health Connect (P13 S2, D-16.94) · Phase: 13 · Owner: builder (wt-p13s2, slice S2)

Read (reference @ `10e14b67`): nothing to rebuild from. The reference's Coach has no Health
Connect or HealthKit data: `services/ai/CoachContext.kt` and `CoachTools.kt` were searched for
health, steps and burn and only their own workout-diary tools turned up (an L-phase feature, R04.20),
read for intent only (a workout's burn never rewrites the calorie target). Platewise sources read:
the P13 phase file (Goal item 3, D-16.94), `src/services/coach/**`, `src/ai/prompts/coach.ts`,
`src/services/health/**`, `src/data/repos/healthRepo.ts`, `src/features/home/burn.ts` (how Home
counts active calories in the target), notes `docs/notes/P08/{nutrition-tools,coach-context}.md`
and `docs/notes/P11/{health-service,health-ui}.md`.

What it does (own words): in the Android app, once Health Connect is connected, the Coach knows the
person's activity. Each turn's snapshot copies the stored activity days (steps, active and total
calories, distance, workouts) and the "Count active calories" switch. The facts block gains a short
"Activity today" section: today's steps, active and total calories, distance and workouts, whether
the switch is on, and the energy target that follows (the goal plus today's active calories when it
is on, the goal alone when it is off); what is left of today's targets is worked out from that same
target, as Home does. A seventh tool, `activity_log`, gives the same figures day by day for a range
of at most 90 days (the last 7 by default). The system text says what the activity data is, that
active calories are already in the target while the switch is on (never add them again), that total
calories include resting burn (never extra food), and to use `activity_log` for steps, workouts,
burn and trends. On the web, and in the Android app while Health Connect is not connected, none of
it exists: no tool offered, no activity lines, no activity rules; a stray `activity_log` call gets
an error saying it needs Health Connect. Weights in the Coach are kg only (D-16.91).

Inputs → outputs:
- `takeSnapshot(sources)`: `sources.activityRepo` (optional, the Android app's activity copy) and
  the settings `health.connected`, `health.countActiveCalories` → `snapshot.activity`
  (`{countActive, days}`), or null without the repository, while not connected, or when the read
  fails. `snapshot.units.weight` is always `kg`.
- `coachContext(snapshot)` → the facts block, with "Activity today" when `snapshot.activity` is set.
- `coachTools(activity)` → the six nutrition schemas, plus `activity_log` when `activity` is true.
- `runCoachTool('activity_log', {from, to}, snapshot)` →
  `{from, to, daysWithData, [limited, omittedOlderDays], items: [{date, steps?, activeKcal?,
  totalKcal?, distanceM?, workouts: [{type, start, minutes, activeKcal?}]}]}`.
- `coachSystemPrompt({context, notes, activity})` → the system text, with the activity rules only
  when `activity` is true.
- `main.tsx` hands `health?.activityRepo` to the Coach session's data sources.

Files: changed `src/services/coach/{snapshot,context,toolSchemas,tools,engine}.ts`,
`src/ai/prompts/coach.ts`, their tests and `session.test.ts`, the fixture
`src/services/coach/__fixtures__/snapshot.ts`; shared: `src/main.tsx` (one line) and
`scripts/ai-live-check/page.ts` (`activity: null`). This note.

Edge cases / failure modes:
- No activity repository (web) → `activity` null; connected switch off → null; the read throws →
  null (a failed health read never keeps the Coach from answering, as on Home).
- Range: missing `to` → today; missing `from` → 6 days before `to` (the last 7 days); `from`
  after `to` → swapped; longer than 90 days → the 90 days ending on `to`, with `limited: true` and
  `omittedOlderDays`.
- A day with no stored row, or a stored row with nothing in it → no row (it means no data, never 0
  steps). A value Health Connect did not have → its key is left out, never 0.
- Workouts by start time; minutes rounded; a workout without active kcal leaves that key out; its
  type as the plugin names it (`running`, `strengthTraining`), `other` when empty. No workout title
  or source app is sent (free text the person typed elsewhere).
- Today without a row → "nothing recorded yet today" in the context.
- Counting on but no active kcal today (null or 0), or a goal of 0 → the target stays the goal and
  the line says why (Home's rule: only a positive goal and a positive whole burn add anything).
- Counting off → the target is the goal; active calories are never added.
- Distance in km to one decimal; ft-in readers also get miles (the app shows miles beside ft-in).
- kJ readers: the existing kJ rule already says every figure and every tool result is kcal.

Our design differences / decisions:
- Platewise-only feature (D-16.94); no reference counterpart.
- `activity_log` is offered only while `snapshot.activity` is set; the six nutrition tools stay
  exactly as they were. R04.20's "only the six" becomes "the six, plus `activity_log` in the
  Android app while Health Connect is connected" (wording for the lead).
- Result shape follows `daily_energy_totals` (`daysWithData`, `items` with `date`) and `food_log`
  (unknown values left out, units in the key: `activeKcal`, `distanceM`). A range over 90 days is
  shortened rather than refused, keeping the newest days (as D-16.32 keeps the newest rows).
- The target rule is written again in the Coach (`countedBurn` in `features/home/burn.ts` is a
  screen file); a test checks the two agree.
- Weight is kg only in the Coach (D-16.91): the snapshot no longer reads `units.weight`, and
  `weight_log` drops its `lb` field.

Tests we will write:
- `toolSchemas.test.ts`: the activity schema (portable keywords, from/to, the 90-day and 7-day
  wording, what is in a row); `coachTools(false)` is the six, `coachTools(true)` adds activity_log.
- `tools.test.ts`: activity_log rows from a fake activity copy (values, rounding, workouts, left-out
  unknowns), default last 7 days, swap, the 90-day clamp with its markers, empty and missing days
  absent, the error when not connected, the available list naming activity_log only when connected.
- `context.test.ts`: the block present with counting on (target = goal + active, left worked out
  from it), counting off, nothing today, miles for ft-in readers; absent when `activity` is null;
  weights in kg.
- `coach.test.ts`: the activity rules (what it is, already counted, resting burn, the tool) only
  with `activity`; the six-tool and no-workout tests unchanged without it.
- `snapshot.test.ts`: activity copied when connected, null when not connected, without a repository,
  and when the read fails; weight unit kg.
- `engine.test.ts`: the fake AI calls activity_log, the next round carries its result and the
  answer quotes it; the tool is not offered (and the rules are absent) without activity.
- `session.test.ts`: a connected activity copy reaches the request (tool and facts).

Compare checklist (filled after the rewrite; reopened `CoachContext.kt` (its "data available"
lines) and `CoachTools.kt` (its tool list and descriptions), searching both for health, steps and
burn: no Health Connect counterpart, so every row below is Platewise's own rule):
- [x] `activity_log` schema: from/to like the range tools, portable keywords, 7-day default, 90-day
  cap, what a row holds (`src/services/coach/toolSchemas.test.ts > ACTIVITY_TOOL: Health Connect
  day by day (D-16.94) > …` (5 tests))
- [x] Offered only with activity, after the six (`toolSchemas.test.ts > ACTIVITY_TOOL: Health
  Connect day by day (D-16.94) > is offered after the six only when the turn has Health Connect
  activity`; `engine.test.ts > runTurn: Health Connect activity (D-16.94) > offers activity_log and
  sends its rules and today’s activity only when the snapshot has activity`)
- [x] Rows from a fake activity copy: values rounded, workouts by start, unknowns left out, no title
  or source (`src/services/coach/tools.test.ts > runCoachTool: activity_log (D-16.94) > gives the
  stored days of the last 7 by default, oldest first, with their figures and workouts`, `> sends no
  workout title or source app, and names an untyped workout "other"`)
- [x] Empty and missing days absent, never 0 (`tools.test.ts > runCoachTool: activity_log
  (D-16.94) > leaves out days with no row and days Health Connect gave nothing, never writing 0`,
  `> answers an empty copy with no rows`)
- [x] Range clamp to the newest 90 days with markers; defaults; swap (`tools.test.ts >
  runCoachTool: activity_log (D-16.94) > holds a range to its newest 90 days and says how many
  older days it left out`, `> reads bad days as missing, defaults to the 7 days ending on to, and
  swaps a reversed range`)
- [x] Not offered and refused on the web / not connected (`tools.test.ts > runCoachTool:
  activity_log (D-16.94) > says it needs Health Connect when the snapshot has no activity (the web,
  or not connected)`, `> names activity_log among the available tools only while it is connected`;
  `engine.test.ts > runTurn: Health Connect activity (D-16.94) > answers a stray activity_log call on
  the web with an error and still finishes the turn`; `session.test.ts > createCoachSession: Health
  Connect activity (D-16.94) > offers no activity tool while Health Connect is not connected, or
  without a copy`)
- [x] Snapshot: copied when connected with the switch, null otherwise or on a failed read
  (`src/services/coach/snapshot.test.ts > takeSnapshot: Health Connect activity (D-16.94) > …`
  (5 tests))
- [x] Context block: figures, workouts, switch on/off, target = goal + active, left from that target,
  nothing today, miles for ft-in readers, no titles, absent without activity
  (`src/services/coach/context.test.ts > coachContext: Health Connect activity (D-16.94) > …`
  (8 tests), the last one `> counts today's active calories in the target the way Home does
  (P11-04)` against `countedBurn`)
- [x] System text: what the data is, already counted while on (never twice), total includes resting
  burn, the tool for steps/workouts/burn/trends, every other rule kept, nothing without activity
  (`src/ai/prompts/coach.test.ts > coachSystemPrompt: Health Connect activity (D-16.94) > …`
  (6 tests))
- [x] Engine: the fake AI calls `activity_log`, the next round carries its result, the answer quotes
  it (`src/services/coach/engine.test.ts > runTurn: Health Connect activity (D-16.94) > runs an
  activity_log call on the snapshot and answers with what it returned`)
- [x] Wiring from the stores through the session (`src/services/coach/session.test.ts >
  createCoachSession: Health Connect activity (D-16.94) > reads the activity copy at Send and offers
  activity_log while Health Connect is connected`)
- [x] Weights in kg in the Coach (`tools.test.ts > runCoachTool: weight_log and body_fat_log > gives
  each weigh-in's day with its weight in kg to one decimal, oldest first (D-16.91)`;
  `snapshot.test.ts > takeSnapshot (R04.22) > copies every entry, weigh-in, reading and fast, today’s
  water and the settings it needs`; `context.test.ts > coachContext: the person > gives the height
  in feet and inches to a person who reads them, every weight in kg (D-16.91)`)
- Gaps found on reopening: none.
- Deliberate differences: the reference's Coach never lets a workout's estimated burn change the
  calorie target; Platewise counts Health Connect's measured active calories in the day's target
  when the person's "Count active calories" switch is on (D-16.89), and the Coach follows the same
  rule and says so, so it never counts them twice. The reference's workout data is its own diary;
  ours is a read-only copy of what Health Connect holds.
- Not taken: workout titles and the recording app (free text from other apps); per-day targets in
  the tool rows (the switch's past state is not stored); the last sync time.

## Decisions for the lead

- `activity_log` is offered when `snapshot.activity` is set, which is exactly Home's rule for the
  activity card and the burn: the health service exists (Android app) and `health.connected` is on.
  Health Connect's own availability and grants are not re-checked per turn; a revoked grant leaves
  the stored copy, as Home shows it.
- The 90-day cap shortens instead of refusing, keeping the newest days, with `limited: true` and
  `omittedOlderDays` (the nutrition tools' `limited` / `omittedOlder` pattern).
- The activity rules join the system text only when the tool is offered, so the web prompt is
  unchanged word for word.
- R04.20 ("v1 offers and mentions only the six nutrition tools") needs new wording: "the six
  nutrition tools, plus `activity_log` in the Android app while Health Connect is connected
  (D-16.94); a stray workout call gets not available". Its four tests keep their names and pass.
- Kg only in the Coach (D-16.91, with S1): the snapshot sets `units.weight` to `kg` without reading
  the setting, `weight_log` drops `lb`, two context tests moved from lb to kg (names changed, neither
  is in a ledger).
- `CoachSnapshot.activity` is required (`CoachActivity | null`), so `scripts/ai-live-check/page.ts`
  gains `activity: null` (shared, one line).

## Status

Done (2026-10-27). Lines outside the slice's files: `src/main.tsx` (the activity copy handed to
the Coach session, one line and a comment), `scripts/ai-live-check/page.ts` (`activity: null`).
Start-up download +0.10 kB gzip (the snapshot's activity read; 237.72 → 237.82 kB); the tool, the
context block and the prompt rules are in the lazy coach engine chunk (9.90 → 11.60 kB gzip).
