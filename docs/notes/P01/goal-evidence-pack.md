# Task: goal evidence pack (P01-17) · Phase: 01 · Owner: builder (wt-p01c5)

<!-- Save as platewise/docs/notes/P<nn>/<slug>.md. Write everything above "Compare checklist"
BEFORE writing code, in your own words. Never paste or paraphrase the reference line by line. -->

Read (reference @ `10e14b67`): `A/services/GoalEvidence.kt` (all), `I/Services/GoalEvidence.swift`
(all), `T/services/GoalEvidenceTest.kt`, `IT/GoalEvidenceTests.swift`; research spec
`01-profile-goals.md` §3.8 and §6 R01.16; traps ledger row R01.16 (owned here); acceptance row
ACC-C9-1 (owned by P03-16, which turns this pack into prompt text). No Evidence ids.

What it does (own words): when the person asks for a new plan, the AI gets a summary of how they
actually ate and what their scale said, so it can judge whether the formula plan fits. This module
builds that summary as plain numbers and dates; P03-16 writes it as text. Food is looked at over the
90 finished days that end yesterday: today's diary is still being filled in and would look like
under-eating. A day with no entries is unknown, not a zero-kcal day. Each logged day gets its sums,
a fibre sum over only the entries that recorded fibre, its entry count and a coverage guess (full
when the day reaches 85 % of the kcal goal, or 65 % with at least two entries and at least 800
kcal; else partial). Summaries for the last 7, 14, 28 and 90 days count logged and full days and
average over logged days. Weigh-ins and body-fat readings are point-in-time, so they may include
today; each day keeps its latest reading. A confidence score says how much the AI should trust the
numbers. Nothing that identifies a food (name, note, photo, ingredient, product) ever enters the
result, so it cannot leak into a request (R01.16).

Inputs → outputs: `buildEvidence({ profile, entries, weighIns, bodyFat, today })` → `EvidencePack`:
- `first`, `last`: the nutrition window (today − 90 … today − 1); `kcalGoal` = max(800, effective
  kcal) used for coverage.
- `days`: 90 rows, oldest first; a day without entries is `{ day, coverage: 'none' }` with no
  numbers at all; a logged day carries `kcal`, `protein`, `carbs`, `fat` (unrounded sums), `fibre`
  (sum or `null`), `fibreLogs`, `logs`, `coverage` `'partial' | 'full'`.
- `periods` for 7, 14, 28, 90: `days`, `loggedDays`, `fullDays`, `coveragePct` (full × 100 div
  days), `logs`, `avgKcal` and `avgFullKcal` (whole kcal, rounded, `null` when no such day),
  `avgProtein`/`avgCarbs`/`avgFat` over logged days and `avgFibre` over days with known fibre
  (unrounded grams, `null` when none).
- `signals` for the same periods over exactly N finished days (today − N … today − 1, today left
  out): weigh-in days, `weightSpanDays` and `weightChangeKg` (last − first, only with ≥ 2),
  body-fat reading days.
- `weights` / `bodyFat`: latest reading per local day from today − 90 through today, oldest first,
  as `{ rows: last 30, older: count left out }`; `nutrition`: the last 45 logged days and the count
  of older logged days.
- `confidence`: `nutrition` = round(full days in the last 28 ÷ 28 × 55), at most 55; `weight` = 25
  (≥ 6 weigh-in days spanning ≥ 28 days), 18 (≥ 3 spanning ≥ 14), 10 (≥ 2), else 0; `energy` = 0
  (no measured source in v1); `score` = sum capped at 100; `label` high ≥ 70, medium ≥ 40, else
  low; plus the counts the reason lines need (`fullDays28`, `weighIns`, `weighInSpanDays`,
  `energyDays`).

Files: created `src/domain/forecast/evidence.ts`, `src/domain/forecast/evidence.test.ts`, this note.
Uses `effectiveTargets` (goals/targets.ts), `addDays`, `dayKeyOf`, `daysBetween` (dates/dayKey.ts),
`inDays`, `windowEnding` (dates/ranges.ts).

Edge cases / failure modes:
- Today's entries never count, even when the day looks complete; entries after today too.
- Entries older than the window (91+ days back) are ignored.
- A day with entries but 0 kcal is partial (logged), not none.
- Goal below 800 (a saved low plan) → coverage uses 800.
- An entry without fibre adds to `logs` but not to `fibreLogs`; a day where no entry has fibre
  has `fibre: null`, and its fibre is left out of `avgFibre`.
- Several weigh-ins on one day → only the latest by time; readings before today − 90 or after
  today are left out. Day assignment of a reading follows the runtime zone (NY and Tokyo tested).
- Signal periods drop today's reading but the dated list keeps it.
- No logged days → averages `null`, nutrition confidence 0.

Our design differences / decisions:
- Our names (`buildEvidence`, `EvidencePack`, `DayCoverage` = `none | partial | full`).
- Food days come from the entry's stored `dayKey` (the day the diary shows it on), not from
  re-reading `loggedAt` in the current zone; weigh-ins and body fat have only an instant, so they
  use `dayKeyOf(at)` in the runtime zone.
- A missing day has no numeric fields at all (a union type), so nothing can read it as 0 kcal.
- Body fat stays a fraction (our canonical unit); the text layer shows a percent.
- kcal averages are rounded to whole kcal; gram averages stay unrounded for the text layer to print.
- Confidence reasons are numbers, not sentences; P03-16 words them.
- Workouts, body measurements and measured energy are later-phase inputs. v1 declares none of
  them: the input is one object, so a later phase adds optional fields without touching callers.
  Energy confidence is the constant 0 and no burn figure exists anywhere (R01.16).

Tests we will write:
- Window is the 90 days ending yesterday; today's entries never counted (R01.16).
- A day with no entries reads `none` and carries no kcal.
- Coverage thresholds with goal 2 000: one entry 1 700 full, 1 699 partial; two entries 1 300 full,
  1 299 partial; one entry 1 300 partial; goal floor 800 for a low saved plan.
- Fibre known in x of y; null when none.
- Period summaries for 7/14/28/90: logged, full, coverage %, logs, rounded kcal averages.
- Confidence: 20 full days in 28 → 39 nutrition points; 28 → 55 (cap); weight tiers 25/18/10/0;
  label boundaries.
- Weigh-ins: latest per day, today included, window edges; signals exclude today; span and change.
- Detail: last 45 logged days with older count; last 30 weights with older count.
- Privacy: JSON of the pack holds none of the names, notes, ingredient names, photo ids, product
  text or entry ids of the fixture, and no workout or burn key (R01.16).
- Day boundaries in America/New_York and Asia/Tokyo.

Compare checklist (filled after the rewrite; reopened `A/services/GoalEvidence.kt`,
`I/Services/GoalEvidence.swift`, `T/services/GoalEvidenceTest.kt`, `IT/GoalEvidenceTests.swift`;
all tests in `src/domain/forecast/evidence.test.ts`):
- [x] Window: 90 days ending yesterday, today never counted, nothing before the window or after
  today (`buildEvidence: the food window > covers the 90 finished days ending yesterday, oldest
  first`, `> never counts today's entries (R01.16)`, `> ignores entries from before the window and
  after today`).
- [x] Missing day is unknown, not 0 (`buildEvidence: the food window > reads a day with no entries
  as none, with no kcal at all (R01.16)`).
- [x] Coverage: goal floor 800, 85 % rule, 65 % rule with ≥ 2 logs and ≥ 800 (`dayCoverage > marks
  a day full at 85 % of a 2 000 kcal goal, or at 65 % with two entries`, `> needs 800 kcal on a busy
  day even when 65 % of the goal is less`, `> measures pack days against max(800, effective kcal)`,
  `> applies the thresholds to the summed day in the pack`, `> marks a logged 0 kcal day partial and
  a day without entries none`).
- [x] Daily sums and fibre "known in x of y" (`buildEvidence: daily rows > sums energy and macros
  and counts fibre only where an entry recorded it`, `> gives fibre null when no entry of the day
  recorded it`).
- [x] Periods 7/14/28/90: logged, full, coverage % (integer division), logs, rounded kcal averages,
  gram averages over logged days, fibre over known days (`buildEvidence: period summaries >
  summarises 7, 14, 28 and 90 days`, `> averages grams over logged days and fibre over days where it
  is known`, `> rounds kcal averages to the nearest whole kcal`, `> gives null averages when nothing
  was logged`).
- [x] Readings: latest per day, measurement window through today, signals over exactly N finished
  days, span and change only with ≥ 2 (`buildEvidence: weigh-ins and body fat > keeps the latest
  reading of each day, today included`, `> leaves out readings from before the window start and
  after today`, `> counts exactly N finished days in the signal periods, leaving today out`, `> gives
  no span or change with fewer than two weigh-ins`).
- [x] Detail caps: 45 logged days, 30 readings, with older counts (`buildEvidence: nutrition detail >
  keeps the last 45 logged days, oldest first, and counts the older ones`, `buildEvidence: weigh-ins
  and body fat > keeps the newest 30 days of readings and counts the older ones`).
- [x] Confidence: nutrition share of 55 over the last 28 days, weight tiers over the deduplicated
  readings of the whole measurement window, energy 0, label boundaries (`buildEvidence: confidence >
  gives 39 nutrition points for 20 full days in the last 28`, `> only counts full days of the last
  28`, `> caps nutrition at 55`, `> gives 25, 18, 10 or 0 weight points by weigh-in days and span`,
  `> counts weigh-in days (today included) and their span for the weight points`, `> labels 70 and
  above high, 40 and above medium, else low`).
- [x] Privacy: no names, notes, ingredients, photos, product text or ids; no workout or burn field
  (`buildEvidence: privacy (R01.16) > holds none of the names, notes, ingredients, photos or product
  text of the entries`, `> has no workout or burn field anywhere in the pack`).
- [x] Zones: weigh-in days follow the runtime zone; food days the stored key (`buildEvidence: day
  boundaries > puts weigh-ins on their local day around midnight in America/New_York`, `> … in
  Asia/Tokyo`, `> reads food days from the stored day key, so the pack is the same in Tokyo`).
- Deliberate differences: food days from the entry's stored `dayKey` (the reference re-reads the
  timestamp in the current zone); a missing day carries no numbers; body fat as a fraction; kcal
  averages rounded (one platform rounds, the other cuts; the plan says rounded); gram averages left
  unrounded; reasons as counts, not sentences; on a same-instant tie of two readings the one later
  in the list wins.
- Not taken: the prompt text (P03-16); workouts, body measurements and measured energy (later
  phases; energy share fixed at 0); a configurable look-back (one platform accepts 1–90, ours is
  fixed at 90).

## Decisions for the lead

- Food days are grouped by `DiaryEntry.dayKey`, so the pack matches the day Home shows an entry
  on; weigh-ins and body fat use `dayKeyOf(at)` in the runtime zone.
- The reserved later-phase inputs are not declared yet: `buildEvidence` takes one object, so a later
  phase adds optional `workouts`, `measurements` or `energyDays` fields without changing a caller.
  The confidence object already carries `energy: 0` and `energyDays: 0` for that phase to fill.
- The pack keeps all 90 daily rows (`days`) and, for the text, the last 45 logged rows
  (`nutrition`); weigh-in confidence counts days with a reading (deduplicated), as the reference
  does.

## Status

Done (2026-10-26). `evidence.ts` with 32 tests; nothing outside the slice's files changed. Trap
R01.16 covered (window and today, missing days, privacy, no workout or burn field). ACC-C9-1 (owned
by P03-16) can build on the privacy tests here.
