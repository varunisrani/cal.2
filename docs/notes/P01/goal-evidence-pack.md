# Task: goal evidence pack (P01-17) · Phase: 01 · Owner: builder (wt-p01c5)

<!-- Save as platewise/docs/notes/P<nn>/<slug>.md. Write everything above "Compare checklist"
BEFORE writing code, in your own words. Never paste or paraphrase the reference line by line. -->

Read (reference @ `10e14b67`): `A/services/GoalEvidence.kt` (all: the day rows, the completeness
rule, the four period summaries, the signal summaries over completed days, the per-day weight and
body-fat lists, the workout and measured-energy parts, the confidence score and the prompt
section), `I/Services/GoalEvidence.swift` (all: the same build on the iOS calendar, its
latest-per-day helper, measurement snapshots, the truncating averages), `T/services/GoalEvidenceTest.kt`
(window edges, the private-text test, timer rows over burn snapshots, three total-energy days),
`IT/GoalEvidenceTests.swift` (the same cases plus the forecast case used by P01-18). Research
spec `01-profile-goals.md` §3.8 and §6 R01.16. No Evidence ids.

What it does (own words): when the person asks for a new plan (or the weekly tune-up runs), the
AI gets a compact, numbers-only picture of how they have actually been eating and weighing in,
so it can lean on real data when there is enough of it and ignore it when there is not. The pack
covers the 90 finished days that end yesterday: today is left out because a half-logged day
looks like under-eating. Each day is either unknown (nothing logged: never read as 0 kcal), a
partial log or a full log, judged against the person's current kcal target. On top of the days
come four rolling summaries (7, 14, 28 and 90 days), the weigh-in and body-fat signals over the
same spans, the most recent dated readings and logged days, and a 0–100 confidence that says
how much the AI may trust all of it. Nothing that names or describes food (names, notes,
photos, ingredient lists, product details, entry ids) ever enters the pack (R01.16).

Inputs → outputs: `buildEvidence({profile, entries, weighIns, bodyFat, today})` →
`EvidencePack`:
- `first` / `last`: the nutrition window (today − 90 … today − 1).
- `days`: 90 rows oldest first. A day without entries is `{day, coverage: 'none'}` with no
  numbers at all; a logged day carries kcal (sum), protein/carbs/fat (sums, unrounded), fibre
  (sum over the entries that recorded it, `null` when none did), `fibreLogs`, `logs` and
  coverage `partial` or `full`.
- `periods`: for 7, 14, 28, 90 days: `days`, `loggedDays`, `fullDays`, `coveragePercent`
  (full × 100 div days), `logs`, average kcal over logged days and over full days (whole kcal,
  `Math.round`), average protein/carbs/fat over logged days and average fibre over the days that
  know it (grams, rounded to one decimal); `null` where nothing is averaged.
- `signals`: for the same spans, over exactly N finished days (today − N … today − 1): weigh-in
  count, span in days and change in kg (last − first, both only with ≥ 2), body-fat count.
- `weights` / `bodyFat`: the latest reading of each day from the window start through
  today (weigh-ins may include today), oldest first; the pack keeps the last 30 and the number
  of older days left out. Body fat is in percent (stored fraction × 100).
- `loggedDays`: the last 45 logged day rows and how many older logged days were left out.
- `confidence`: `nutritionPoints` = round(full days in the latest 28 ÷ 28 × 55) capped at 55;
  `weightPoints` = 25 (≥ 6 weigh-in days spanning ≥ 28 days), 18 (≥ 3 spanning ≥ 14), 10 (≥ 2),
  else 0, counted over the de-duplicated weigh-in days of the window; `energyPoints` = 0 (no
  measured source in v1); `score` = the sum capped at 100; `level` high ≥ 70, medium ≥ 40, else
  low; plus the counts the prompt text states (`fullDaysInSpan`, `weighInDays`,
  `weighInSpanDays`, `energyDays`).
- `goalKcal`: the kcal goal the days were judged against.
Constants exported: `EVIDENCE_DAYS` (90), `EVIDENCE_PERIODS` ([7, 14, 28, 90]), the coverage
shares and floor, the detail limits (30, 45), the confidence span and cap. Helpers exported:
`completedWindow(today)` (first and last day, shared with the forecast, P01-18), `inWindow`,
`dayCoverage`, `weightPoints`, `confidenceLevel`.

Files: created `src/domain/forecast/evidence.ts`, `src/domain/forecast/evidence.test.ts`, this note.

Edge cases / failure modes:
- An entry dated today, or 91+ days ago, or after today, is not in any day row.
- Coverage goal = max(800, effective kcal), effective kcal from `effectiveTargets(saved,
  formulaPlan(profile, today))`. Full when kcal ≥ round(0.85 × goal), or with ≥ 2 logs when kcal
  ≥ max(800, round(0.65 × goal)). With goal 2 000: one log 1 700 full, 1 699 partial; two logs
  1 300 full, 1 299 partial; one log 1 300 partial. A target below 800 still judges against 800.
- Fibre: an entry without a fibre value is "unknown", not 0; a day where no entry knows fibre has
  `fibre: null` and is left out of the fibre average.
- Two weigh-ins on one day: the later instant wins (equal instants: the later one in the list).
- A weigh-in today counts for the weight list and the weight confidence but not for the signal
  summaries, which cover finished days only.
- Coverage percent uses integer division (20 full of 28 → 71).
- No weigh-ins, or a single weigh-in day: weight points 0 and span 0 (10 points need two days).
- Confidence for 20 full days in 28 → round(39.28…) = 39 nutrition points.

Our design differences / decisions:
- Names are ours (`buildEvidence`, `DayCoverage` = `none | partial | full`, `EvidencePack`, …).
- A day without entries holds no numbers at all (a separate shape), so "unknown" can never be
  read as 0 kcal by the prompt renderer (R01.16).
- Entries are placed by their stored `dayKey` (the day the diary shows them on); weigh-ins and
  body-fat readings, which carry only an instant, by `dayKeyOf(at)` in the runtime zone.
- Averages are rounded as the row says (Android rounds, iOS truncates): kcal to whole numbers,
  grams to one decimal (the precision the prompt shows). Daily sums are not rounded.
- The confidence carries counts, not sentences: the prompt text (P03-16) writes the reasons in
  its own words, so the domain holds no copy.
- Workouts, body measurements and measured energy are not built in v1 (later phases). The input
  is one object so they can be added as optional fields without changing callers; until then the
  pack has no workout rows (so no workout calories can enter, R01.16) and energy points are 0.
- No time-zone parameter: the runtime zone is the device zone, as everywhere in `src/domain`.

Tests we will write:
- Window: 90 rows, first = today − 90, last = yesterday; today's entries never counted; an
  entry 91 days back is outside (R01.16).
- A day with no entries reads none and has no kcal (R01.16).
- Coverage thresholds at 0.85 and 0.65 with goal 2 000 (full/partial pairs above); the 800 floor
  for a small target; a saved kcal target is the goal.
- Fibre known in x of y; null fibre when none known; fibre average over known days only.
- Period summaries: logged/full/coverage %, logs, rounded averages, null averages when empty.
- Signal summaries: today's weigh-in excluded, span and change with ≥ 2, body-fat counts.
- Latest reading per day; last 30 and the older count; last 45 logged days and the older count.
- Confidence: 20 full days in 28 → 39; capped at 55; weight tiers 25 / 18 / 10 / 0 at their
  edges; energy 0; level edges 70 and 40.
- Privacy: JSON of the pack contains none of the fixture's names, notes, ingredient names, photo
  ids, product text or entry ids (R01.16).
- A day in New York across the DST change still counts once.

Compare checklist (filled after the rewrite; reopened `A/services/GoalEvidence.kt`,
`I/Services/GoalEvidence.swift`, `T/services/GoalEvidenceTest.kt`, `IT/GoalEvidenceTests.swift`):
- [x] Window: 90 finished days ending yesterday; today and older days never in a day row
  (`src/domain/forecast/evidence.test.ts > completedWindow > is the 90 finished days ending
  yesterday`; `buildEvidence: the food window > has one row per finished day, oldest first, ending
  yesterday`, `> never counts today's entries (R01.16)`, `> leaves out an entry 91 days back and
  one dated after today`).
- [x] Missing day = unknown, not zero (`buildEvidence: the food window > reads a day with no entries
  as none, holding no kcal at all (R01.16)`).
- [x] Completeness rule: goal floored at 800, 0.85 bar, two-log 0.65 bar floored at 800, both
  rounded (`dayCoverage > goal %i, %i kcal over %i logs → %s` (13 rows), `> judges days against a
  saved kcal target of 2 000 at 0.85 and 0.65`, `> uses the formula kcal when nothing is saved, and
  never a goal below 800`).
- [x] Day sums and fibre known in x of y, null when unknown (`buildEvidence: the food window > sums
  energy and macros of a day without rounding them`; `buildEvidence: fibre > sums fibre only over
  entries that recorded it, known in 2 of 3 logs`, `> gives no fibre value, rather than 0, when no
  entry of the day recorded it`, `> averages fibre over the logged days that know it`).
- [x] Period summaries: last N days, logged and full days, coverage % by integer division, log
  count, averages over logged and full days, empty spans (`buildEvidence: period summaries >
  summarises the spans 7, 14, 28 and 90 in that order`, `> counts logged days, full days, logs and
  coverage per span`, `> averages over logged days and over full days`, `> rounds kcal averages to
  whole kcal and gram averages to one decimal`, `> leaves every average empty, not 0, for a span
  with nothing logged`).
- [x] Signal summaries over exactly N finished days; span and change only with ≥ 2
  (`buildEvidence: signal summaries > covers exactly N finished days, leaving today's readings
  out`, `> gives no span or change below two weigh-ins`).
- [x] Latest reading per day from the window start through today; last 30 and the older count;
  body fat in percent; last 45 logged days (`buildEvidence: dated readings > keeps the latest
  weigh-in of each day, today included`, `> keeps the later of two readings at the same instant`,
  `> leaves out readings before the window and after today`, `> keeps the latest 30 reading days
  and counts the older ones`, `> gives body fat in percent, latest of each day`, `> keeps the last
  45 logged days as detail and counts the older ones`).
- [x] Confidence: nutrition from the latest 28 days capped at 55, weight tiers over the window's
  weigh-in days, score capped at 100, labels at 70 and 40 (`buildEvidence: confidence > gives 39
  nutrition points for 20 full days in the latest 28`, `> counts only the latest 28 days and caps
  nutrition at 55`, `> weight tier: %i weigh-in days over %i days → %i points` (8 rows), `> counts
  weigh-in days over the window through today for the weight points`, `> adds the parts and labels
  the score at 70 and 40`).
- [x] Privacy: no name, note, photo, ingredient, product text or id (`buildEvidence: privacy >
  holds none of the names, notes, ingredients, photos, product text or ids of the fixture
  (R01.16)`); no workout rows, no energy points (`> has no workout or measured-energy rows and
  adds no energy points in v1 (R01.16)`).
- [x] Local days in other zones (`buildEvidence: time zones > counts readings on the 25-hour day
  once, by local day (New York)`, `> files a late-evening weigh-in on its local day in Tokyo`).
- Deliberate differences: entries are placed by their stored `dayKey` (the reference uses the
  timestamp's date in the zone); a day without entries is its own shape with no numbers; averages
  are rounded (kcal whole, grams one decimal; Android rounds kcal and keeps grams, iOS truncates
  kcal); the confidence holds counts instead of English reason sentences; body fat goes in as
  percent like the reference, from our stored fraction.
- Not taken: workouts (timer rows over burn snapshots, burn-only shells, no workout calories), tape
  measurements with their ratios and Navy estimate, measured health energy and its tiers (20 / 12 /
  7 points), total-energy averages: all later phases. The prompt text itself is P03-16.

## Decisions for the lead

- Workout, measurement and measured-energy inputs are not declared yet: no record types exist for
  them in `model.ts`. `EvidenceInput` is one object, so a later phase adds them as optional fields
  without touching callers. Until then the pack has no workout rows (so no workout calories,
  R01.16), `energyPoints` and `energyDays` are 0.
- Gram averages are rounded to one decimal (the row says "averages rounded"; the reference keeps
  them unrounded and prints one decimal). kcal averages are whole numbers (`Math.round`).
- Daily macro sums, weights and weight changes are left unrounded; P03-16 formats them.
- Entries are bucketed by `entry.dayKey`; weigh-ins and body fat by `dayKeyOf(at)` in the runtime
  zone. If P02-06 ever lets `dayKey` drift from `loggedAt`, the pack follows the diary page.
- Extra exports beyond the row: `inWindow`, `dayCoverage`, `weightPoints`, `confidenceLevel`, the
  constants listed above and the record types; the pack also carries `goalKcal`.

## Status

Done (2026-10-26). `evidence.ts` with 55 tests in `evidence.test.ts`, all passing. Nothing outside
`src/domain/forecast/**` changed; it imports `dates`, `goals/formulas`, `goals/targets` and
`goals/integers`. Trap covered: R01.16 (owned by P01-17).
