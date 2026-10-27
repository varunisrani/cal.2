# Task: nutrition data tools (P08-02) · Phase: 08 · Owner: builder (wt-p08s1)

<!-- Save as platewise/docs/notes/P<nn>/<slug>.md. Write everything above "Compare checklist"
BEFORE writing code, in your own words. Never paste or paraphrase the reference line by line. -->

Read (reference @ `10e14b67`): `android/.../services/ai/CoachTools.kt` (the dispatcher, the six
nutrition executors, the range, limit and date helpers, the model-facing descriptions and the
parameter schemas; workout and proposal parts skimmed only to know which names exist),
`ios/calorietracker/Services/CoachTools.swift` (the gate that hides workout tools and answers a
stray call with an error, `parseRange`, the fixed `yyyy-MM-dd` formatter). Research spec
`04-coach.md` §3.9 (catalogue, shared semantics, result shapes), §3.13, §6 traps R04.10, R04.16,
R04.17, R04.20; decisions D-16.32, Proposed D-16.59 (limits keep the newest rows), Proposed
D-16.64 (body fat to one decimal); glossary 17 §1.5 (our tool names); acceptance ACC-I7-2.

What it does (own words): the model can ask for six read-only slices of the person's data while
it answers. Each call is answered locally from the snapshot taken when the person pressed Send,
never from the live stores, and always as one JSON object in text. `data_overview` says how much
data there is: counts with first and last day for weigh-ins, body-fat readings and food entries,
and how many fasts were tracked and whether one is running. The five range tools take a `from`
and `to` local day (inclusive). A missing or unreadable `to` means today, a missing or unreadable
`from` means 30 days before `to`; nothing is refused, and the range used is echoed so the model
sees what it got. Lists are oldest first; when a list is longer than the limit (the model's
`limit` held to 1…max, else the tool's default) the oldest rows are dropped so the newest remain,
and the result says how many were left out. `weight_log` gives each weigh-in's day with kg and lb
at one decimal; `body_fat_log` each reading's day and percent at one decimal; `daily_energy_totals`
one row per day that has entries, with the summed kcal (a day with no entries has no row, never a
0); `food_log` each entry's day (no time), name, kcal, macros, meal, source, its weight when known
and every nutrient it carries with the unit in the key; `fasting_log` every tracked fast that
touches the range, a running one measured to the snapshot's instant. An unknown name answers with
the list of available tools; a later-phase workout or suggestion name answers that it is not
available. `toolSchemas.ts` holds the one JSON-Schema per tool, its model-facing description (our
words) and the limits, for the three chat wires to wrap.

Inputs → outputs:
- `runCoachTool(name, args, snapshot)` → JSON object string (never throws). `args` is whatever the
  wire parsed; anything that is not a plain object counts as `{}`.
- `NUTRITION_TOOLS: readonly ToolSchema[]` (`{name, description, parameters}`),
  `NUTRITION_TOOL_NAMES`, `LATER_TOOL_NAMES`, `ROW_LIMITS`, `DEFAULT_SPAN_DAYS`,
  `isNutritionToolName`, `isLaterToolName`.

Files: created `src/services/coach/tools.ts`, `tools.test.ts`, `toolSchemas.ts`,
`toolSchemas.test.ts`, this note.

Edge cases / failure modes:
- `from` or `to` that is not a real `YYYY-MM-DD` day (wrong shape, 2026-02-30, a timestamp, a
  number) → the default for that end; `from` after `to` → the two swap, and the echo shows it.
- `limit` missing, not a number, NaN → default; 0 or negative → 1; above max → max; a fraction →
  its whole part; a numeric string → read as a number.
- 400 food entries in range with `limit` 365 → the newest 365, still oldest first, with the count
  of older ones left out.
- Entries are placed by their stored day key (the day the diary shows them on), weigh-ins and
  body-fat readings by their instant's local day, fasts by overlap of their span with the range.
- A fast from 21:00 yesterday to 13:00 today touches today's range; a running fast touches every
  range from its start through today.
- Dates and timestamps never go through a locale calendar: day keys come from the calendar
  numbers of `Date`, so a Buddhist or Japanese locale still gets Gregorian `2026-10-26`.
- Optional nutrients that are missing or not finite are left out (unknown, never 0).
- A data problem (an unreadable record that throws) → `{error}`, never an exception.

Our design differences / decisions:
- Limits keep the newest rows (D-16.32, Proposed D-16.59); the reference kept the oldest (R04.10).
  Markers when a limit cut the list: `limited: true` and `omittedOlder`. They differ from the
  limiter's `truncated` / `omittedItems`, so both can appear without overwriting each other.
- Every list result is `{from, to, count, …, items}` with the list under `items`; `count` is the
  number of rows returned. `daily_energy_totals` names its count `daysWithData`.
- Body fat at one decimal (Proposed D-16.64); the reference cut it to an integer.
- Only the six nutrition tools are offered (R04.20); our later names (`workout_log`,
  `workout_plan_days`, `training_profile`, `training_rollup`, `lift_log`, `exercise_search`,
  `suggest_new_exercise`, `suggest_diary_exercise`) answer "not available", like the iOS gate.
- `food_log` carries no entry id (nothing can act on it in v1), adds the eight sports compounds
  with the nutrients, and gives `servings` when the weight is unknown.
- Fast timestamps are local ISO times with their offset (`2026-10-25T21:00:00-04:00`).
- `from` after `to` swaps instead of returning nothing (our choice; the echo makes it visible).
- Schemas use only `type`, `description`, `properties` and `required`, which all three wire
  formats accept.

Tests we will write:
- `tools.test.ts`: bad `from` → defaults and echo (R04.17); missing both → today and 30 days
  before; swap; dates stay Gregorian under a non-Gregorian locale (R04.17); inclusive ends; limit
  clamping; 400 entries, limit 365 → the newest 365, oldest first, with markers (R04.10); a day
  without entries is absent from energy totals (R04.16, ACC-I7-2); food_log fields and units in
  keys, missing nutrients absent; weight kg and lb; body fat one decimal; fasting overlap of
  21:00 yesterday to 13:00 today, a running fast measured to now, goal reached; overview counts
  and first/last days; `workout_log` → not available (R04.20); unknown name lists the six;
  non-object arguments; every result parses as a JSON object; the snapshot is not changed.
- `toolSchemas.test.ts`: exactly the six names in order; every schema is an object schema with
  only the portable keywords; range tools require `from` and `to` and offer `limit` where it
  applies; descriptions state the limits; the fasting description says a day without entries is
  not a fast (R04.16); no later-phase tool is offered (R04.20).

Compare checklist (filled after the rewrite; reopened `CoachTools.kt` executors, helpers and
schemas, and `CoachTools.swift` gating and `parseRange`):
- [x] Dispatcher: unknown name lists the available tools; gated names answer not available
  (`src/services/coach/tools.test.ts > runCoachTool: names and answers (R04.20) > answers our
  later-phase workout_log, and every other later tool, with not available`, `> answers an unknown
  name with the six available tools`)
- [x] Range defaults, silent fallback and echo (`tools.test.ts > runCoachTool: ranges (R04.17) >
  defaults a bad from to 30 days before to and echoes the range it used` and 3 more)
- [x] Inclusive local days, Gregorian dates (`tools.test.ts > runCoachTool: ranges (R04.17) >
  includes both end days whole and nothing either side`, `> keeps every date Gregorian under a
  Buddhist or Japanese locale`)
- [x] Limit clamped to [1, max], tool defaults (`tools.test.ts > runCoachTool: limits keep the
  newest rows (R04.10, D-16.32) > holds limit to 1…max, cuts fractions and reads numeric text`,
  `> uses each tool's own default and maximum`)
- [x] Overview counts, first and last day, fasts and active (`tools.test.ts > runCoachTool:
  data_overview > …` (2 tests))
- [x] Weight kg and lb at one decimal; body fat percent (`tools.test.ts > runCoachTool:
  weight_log and body_fat_log > …` (2 tests))
- [x] Daily totals only for days with entries (`tools.test.ts > runCoachTool: daily_energy_totals
  (R04.16) > leaves days without entries out instead of giving them 0 kcal (ACC-I7-2)`)
- [x] Food rows with macros, meal, source, weight and nutrients with units (`tools.test.ts >
  runCoachTool: food_log > …` (3 tests))
- [x] Fasts by overlap, running ones measured to now, goal reached (`tools.test.ts >
  runCoachTool: fasting_log > …` (4 tests))
- [x] Schemas: from/to required strings, optional integer limit, no parameters for the overview
  (`src/services/coach/toolSchemas.test.ts > NUTRITION_TOOLS: the schemas > …` (6 tests))
- [x] Fasting description: only tracked sessions count (`toolSchemas.test.ts > NUTRITION_TOOLS: a
  missing log is not a fast (R04.16) > …` (2 tests))
- Gaps found on reopening: none that needed code.
- Deliberate differences: limits keep the newest rows with `limited` / `omittedOlder` markers
  (D-16.32, Proposed D-16.59) instead of the oldest; body fat at one decimal (Proposed D-16.64)
  instead of an integer; entries placed by their stored day key rather than their instant (as
  everywhere else in Platewise, D-16.74); a `from` after `to` swaps; fast times are local ISO with
  the offset instead of UTC instants; `food_log` has no entry id and adds the sports compounds and
  `servings`; `daily_energy_totals` does not advertise a `limit` it would ignore; our key names
  (camelCase, `items`, `weighIns`, `foodEntries`) and our own descriptions.
- Not taken: the six workout tools and the two proposal tools (L3); they answer not available.

## Decisions for the lead

- `ToolSchema` is `{name, description, parameters}` (the JSON Schema under `parameters`). The chat
  wires (P08-05..07) take `readonly ToolSchema[]`; if their type names the schema field
  differently, one of the two follows the other at landing.
- `from` after `to` swaps the two (smallest change that keeps "never rejected").

## Status

Done (2026-10-27). Created the files above (29 tool tests, 11 schema tests). Nothing changed
outside the slice's files. P08-05..07 wrap `NUTRITION_TOOLS`; P08-08 calls
`runCoachTool(name, args, snapshot)` and passes the text through `limitToolResult`.
