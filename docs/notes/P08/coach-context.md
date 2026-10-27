# Task: Coach context and system prompt (P08-01) · Phase: 08 · Owner: builder (wt-p08s1)

<!-- Save as platewise/docs/notes/P<nn>/<slug>.md. Write everything above "Compare checklist"
BEFORE writing code, in your own words. Never paste or paraphrase the reference line by line. -->

Read (reference @ `10e14b67`): `android/.../services/ai/CoachContext.kt` (all, for intent only:
which blocks exist and in what order, which numbers each carries and how they are rounded) and
`android/.../services/ai/ChatService.kt` (the prompt assembly function only, for intent: the order
of the parts). The reference's prompt sentences stay closed while writing and are never reused.
Research spec `04-coach.md` §3.8 (context by intent), §3.13 (a missing log is never a fast), §6
traps R04.2, R04.16, R04.19, R04.20; decisions D-16.24 (notes in the system part), D-16.27 (today's
intake, calories left and water in every turn), D-16.28 (reply in the person's language),
D-16.48 (earlier photos are not re-sent), D-16.64 (body fat to one decimal), N-7 (no body
measurements); acceptance ACC-C13-1 and ACC-I6-1. Domain code the context renders:
`src/domain/forecast/forecast.ts` (P01-18), `src/domain/goals/{formulas,targets}.ts`,
`src/domain/units/{body,energy,water}.ts`, `src/ai/prompts/shared.ts`.

What it does (own words): every Coach turn starts from a fresh picture of the person's data, taken
once when they press Send. `context.ts` turns that picture into a short block of plain lines: the
local day (with its weekday) and the time-zone id so the model can turn "yesterday" or "last
week" into dates; the profile in the person's own units; how the energy numbers are worked out
(which resting-burn equation applies and why, the resting and daily burn, the targets in effect);
the weight forecast of P01-18, or a line saying it needs at least 2 food days and 2 weigh-ins;
how much data is stored, with the rule that a day without entries proves nothing (not a fast, not
0 kcal); and today so far: what was eaten, what is left of each target, and water. kJ readers get
the energy-unit rule, with tool arguments kept in kcal. `coach.ts` wraps that block in our own
instructions: who the Coach is (food, energy balance, weight goals), answers grounded in the
person's numbers, nothing medical and a pointer to a doctor or dietitian, 2–5 sentences unless
asked for more, reply in the language of the person's message, use the facts first and tools only
for what is missing, ask for every needed tool in one round, earlier photos are not visible again,
the two answer shapes (how-to → a daily calorie number and one concrete change; projection → the
forecast's figures), then the person's notes for the AI last. Only the six nutrition tools are
named anywhere.

Inputs → outputs:
- `CoachSnapshot` (new `src/services/coach/snapshot.ts`): `now`, `timeZone`, `profile`, `units`,
  every `entries`, `weighIns`, `bodyFat`, `fasts`, and `water {on, goalMl, unit, logs}`. A plain
  object the engine takes at send time; the context and the tools read only this.
- `coachContext(snapshot)` → string (the block).
- `coachSystemPrompt({ context, notes })` → string: the whole system text, notes last.

Files: created `src/services/coach/snapshot.ts`, `src/services/coach/context.ts`,
`src/services/coach/context.test.ts`, `src/ai/prompts/coach.ts`, `src/ai/prompts/coach.test.ts`,
the shared test fixture `src/services/coach/__fixtures__/snapshot.ts`, this note.

Edge cases / failure modes:
- No body fat → the standard equation named, with "no body fat is set" as the reason; with body
  fat → the lean-mass equation. Goal body fat only when set. Goal weight only when set.
- One weigh-in or one food day → the not-enough-data line naming both minimums and today's counts.
- The forecast's scale trend can be null (all weigh-ins at one instant) → that line is left out;
  days to goal null → left out; under-logging hint only when the forecast says the paces disagree.
- Nothing eaten today → "nothing logged yet" and the full targets left. Over a target → a
  negative amount, with the sign explained.
- Water tracking off → said so, no numbers. fl oz readers also get fl oz figures.
- Weights in lb at one decimal, weekly paces signed at two decimals, in the person's unit.
- Height in cm (whole) or ft/in (nearest inch, the shared helper).
- kJ reader → the kJ rule plus "tool arguments stay in kcal"; kcal reader → no kJ text at all.
- No food name, note or ingredient ever enters the block (only counts and totals).
- No workout, training or exercise words (v1 has no workouts, R04.20).
- Blank notes → nothing added; notes are appended after everything else.

Our design differences / decisions:
- Today's intake, calories and macros left and water are in the block (D-16.27); the reference
  left them out.
- Reply language follows the person's message (D-16.28); the reference fixed English.
- The prompt says earlier photos are not visible again (R04.2, D-16.48) and asks the model to
  batch tool calls in one round (R04.19).
- No body-measurement section (N-7) and no workout lines or tool examples (R04.20).
- Body fat to one decimal (D-16.64); the reference cut it to an integer.
- The weekday is given with today's date (our addition: resolves "last Tuesday" without guessing).
- `coachSystemPrompt` appends the notes for the AI itself with the client's `withNotes`, so the
  engine (P08-08) passes the system text through unchanged. The AI layer may not import services,
  so the prompt names the six tools in its own prose and a test keeps that list equal to the
  schemas' names.
- BMR and TDEE are cut to whole kcal, the same way the forecast's maintenance figure is, so the
  balance line adds up.

Tests we will write:
- `context.test.ts`: today line with zone and weekday; profile in kg/cm and lb/ft-in; body fat and
  goal body fat at one decimal only when set; each equation and its reason; BMR/TDEE/targets;
  forecast with two food days and two weigh-ins (ACC-C13-1) and the not-enough-data line with one
  weigh-in; under-logging hint; data counts and the missing-log rule (R04.16); today's intake,
  left and water, tracking off, fl oz (ACC-I6-1); kJ rule only for kJ readers; no workout words;
  no food name from the fixture diary; the snapshot is not changed.
- `coach.test.ts`: persona and scope; no medical advice with a pointer to a clinician; 2–5
  sentences; language of the message (D-16.28); tools only for missing data and batched in one
  round (R04.19); earlier photos not visible (R04.2); answer shapes; notes last, blank notes add
  nothing; only the six nutrition tool names, equal to the schemas' list (R04.20); no workout
  words; the context is carried whole and no food name from the fixture diary appears.
- similarity check green on both files.

Compare checklist (filled after the rewrite; reopened `CoachContext.kt`, the prompt assembly in
`ChatService.kt` and the kJ instruction in `EnergyUnit.kt`, for intent only):
- [x] Today's date and zone, relative dates resolved from it (`src/services/coach/context.test.ts >
  coachContext: today > names the local day with its weekday and the time zone`)
- [x] Profile: sex, age, height and weight in the person's units, activity, goal, goal weight, body
  fat and goal body fat only when set (`context.test.ts > coachContext: the person > …` (4 tests))
- [x] Formulas: which BMR equation and why, BMR, TDEE, the targets in effect (`context.test.ts >
  coachContext: energy numbers > …` (3 tests))
- [x] Forecast block with every figure and the under-logging note, else the not-enough-data line
  naming 2 food days and 2 weigh-ins (`context.test.ts > coachContext: the weight forecast (P01-18)
  > lists the forecast with two food days and two weigh-ins (ACC-C13-1)`, `> says there is not
  enough data with only one weigh-in, naming both minimums`, `> flags possible under-logging when
  the food log and the scale disagree`, `> gives the days to the goal weight in lb for a person
  losing toward it`)
- [x] Data counts with the pointer to the overview tool and the missing-log rule, R04.16
  (`context.test.ts > coachContext: data on record and the missing-log rule (R04.16) > …` (2 tests))
- [x] kJ rule with tool arguments in kcal, only for kJ readers (`context.test.ts > coachContext:
  energy unit > adds the kJ rule, with tool arguments kept in kcal, only for a kJ reader`)
- [x] Today's intake, left and water, D-16.27 (`context.test.ts > coachContext: today so far
  (D-16.27) > gives today's intake, what is left of each target and water (ACC-I6-1)` and 3 more)
- [x] No food names, no workout words (`context.test.ts > coachContext: what never enters it > …`;
  `src/ai/prompts/coach.test.ts > coachSystemPrompt: the facts and the tools > holds no workout
  words (R04.20)`, `> never holds a food name or note from the diary`)
- [x] Persona, facts first, no medical advice with a clinician pointer, 2–5 sentences
  (`coach.test.ts > coachSystemPrompt: who the Coach is > …` (3 tests))
- [x] Tool policy with examples, nutrition tools only, batching, R04.19/R04.20 (`coach.test.ts >
  coachSystemPrompt: the facts and the tools > …` (4 tests))
- [x] Answer shapes (`coach.test.ts > coachSystemPrompt: answer shapes > …` (2 tests))
- [x] Notes for the AI last (`coach.test.ts > coachSystemPrompt: the notes for the AI (D-16.24) >
  puts the notes last`, `> adds nothing for blank or missing notes`)
- [x] Reply language and earlier photos, D-16.28 / R04.2 (`coach.test.ts > coachSystemPrompt: who
  the Coach is > replies in the language of the person's message (D-16.28)`, `> says photos from
  earlier messages are not sent again and cannot be seen (R04.2)`)
- Gaps found on reopening: none that needed code. The reference's third BMR reason (body fat set
  but its override switched off) has no counterpart: Platewise has no such switch, so body fat
  decides alone.
- Deliberate differences: reply language follows the person (D-16.28) instead of fixed English;
  today's intake, left and water added (D-16.27); body fat to one decimal (D-16.64) instead of an
  integer; height in cm is the whole centimetres the app shows (truncated) and ft/in for imperial
  readers instead of decimal inches; the weekday is given with the date; weekly pace added to the
  goal line; the photo rule (R04.2) and the batching rule (R04.19) added; our own prose, headings
  and order (role, facts, tool use, answer shapes, notes).
- Not taken: body measurements (N-7), workout counts and the training firewall line, the
  proposal-card guidance (later phases).
- Similarity check green on both files (`pnpm check --require-ref`).

## Decisions for the lead

- `CoachSnapshot` lives in `src/services/coach/snapshot.ts` (a new file of this slice). P08-09
  fills it from the repositories at send time; P08-08 passes it to `coachContext` and
  `runCoachTool`.
- `coachSystemPrompt` already ends with the notes for the AI (`withNotes`); the engine must not
  add them again.

## Status

Done (2026-10-27). Created the files above (22 context tests, 16 prompt tests). Nothing changed
outside the slice's files. P08-08 builds the system text with `coachSystemPrompt({ context:
coachContext(snapshot), notes })` and must not add the notes again.
