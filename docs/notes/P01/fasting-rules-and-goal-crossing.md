# Task: fasting rules and goal crossing (P01-19) · Phase: 01 · Owner: builder (wt-p01c5)

<!-- Save as platewise/docs/notes/P<nn>/<slug>.md. Write everything above "Compare checklist"
BEFORE writing code, in your own words. Never paste or paraphrase the reference line by line. -->

Read (reference @ `10e14b67`): `A/models/FastingSession.kt`, `A/data/FastingRepository.kt`,
`I/Stores/FastingStore.swift`, `T/models/FastingSessionTest.kt`, `IT/FastingStoreTests.swift`,
`T/ui/progress/LogWeightDateTest.kt` (and the goal-crossing helper it tests, in
`A/data/WeightRepository.kt`); research specs `05-home-progress.md` §3.5.3 (after a weigh-in),
§3.7 and §6 R05.3, R05.7; `01-profile-goals.md` §3.13 and §6 R01.11. Traps ledger rows R05.7
(owned here), R05.3 and R01.11 (owned by P02-09 / P02-08; the domain rules are here). No Evidence
ids.

What it does (own words):
- Fasting: a fast has a start, an end (none while it runs) and a goal length in minutes. The goal
  is always held to 1 hour – 7 days, whenever a fast or the default goal is made, changed or read.
  Its length is (end, or now while running) − start and never negative. At most one fast runs at a
  time and no two fasts may overlap: intervals are half-open, a running fast reaches to infinity,
  so a fast ending at 10:00 and one starting at 10:00 are fine. Starting is refused while a fast
  runs or when an open interval from now would hit a stored fast. An edit is checked against the
  stored list as a whole: the fast must still be there, it may only become running when no other
  is, an end before the start is pulled up to the start, the goal is clamped, and overlap is
  refused. "End now" applies the editor's changes and the end together, as one result, so a
  half-applied edit cannot happen (R05.3). The repository (P02-09) writes what these functions
  return inside one transaction.
- Lengths are returned as numbers; the UI prints them with `formatDuration` ("45m", "16h",
  "16h 30m"): whole minutes, floored, split into hours and minutes.
- Goal crossing: after a weigh-in is added, the goal-reached dialog appears only when there was a
  previous latest weigh-in, the new one is not older than it (a back-dated reading is history, not
  progress), and the weight passes the goal weight in the goal's direction (lose: previous above
  the target, new at or below; gain: previous below, new at or above). Never for maintain, never
  without a goal weight, never for the first weigh-in. Because "previous" is the latest by date,
  the dialog fires once, on the crossing, and not for later weigh-ins past the goal (R05.7,
  R01.11).

Inputs → outputs:
- `trackers/fasting.ts`: `MIN_GOAL_MIN` 60, `MAX_GOAL_MIN` 10 080, `DEFAULT_GOAL_MIN` 960;
  `clampGoalMin(n)`; `readDefaultGoalMin(stored)`; `isActive(fast)`; `activeFast(fasts)`;
  `fastLengthMs(fast, now)`; `fastMinutes(fast, now)`; `goalAt(fast)`; `overlaps(a, b)`;
  `canStart(fasts, now)` → Result; `startFast(fasts, id, goalMin, now)` → Result<Fast>;
  `checkEdit(fasts, edited)` → Result<Fast> (the record to store); `endNow(fasts, id, edits, now)`
  → Result<Fast>; `splitMinutes(minutes)` → `{ hours, minutes }`. Refusals are `'missing'`,
  `'ended'`, `'active'` or `'overlap'`.
- `trackers/goalCrossing.ts`: `latestByTime(readings)`; `crossesGoal(previousLatest, added, goal,
  target)` → boolean; `reachesGoalOnAdd(stored, added, profile)` → boolean (previous latest picked
  from the stored list).

Files: created `src/domain/trackers/fasting.ts`, `fasting.test.ts`, `goalCrossing.ts`,
`goalCrossing.test.ts`, this note. Uses `Result` from `src/lib/result.ts`, `clamp` from
`units/numbers.ts`, the `Fast`, `WeighIn`, `GoalKind`, `Profile` types from `model.ts`.

Edge cases / failure modes:
- Goal 30 → 60, 20 000 → 10 080, a non-finite or non-number stored goal → default 960.
- Running fast with now before its start → length 0.
- [08:00–10:00] and [10:00–12:00] do not overlap; a running fast overlaps everything after its
  start; two running fasts always overlap.
- Starting refused while a fast runs; refused when a stored completed fast ends after now.
- Editing a completed fast into another's span refused; editing a fast that was deleted refused;
  reopening a completed fast while another runs refused; end before start clamps to start.
- End now on a fast that already ended or no longer exists is refused; end now with an edited
  start that overlaps an earlier fast is refused and nothing is half-applied; end before start
  (start edited into the future) clamps.
- Goal crossing: equal timestamps count as not older; target exactly reached counts; previous
  already past the target does not fire; no target → never.

Our design differences / decisions:
- Our names; refusals are values (Result) instead of a boolean or a null session.
- The domain cannot mint ids: `startFast` takes the new id.
- Goal minutes are rounded to whole minutes before the clamp; a stored goal that is not a finite
  number reads as the 16 h default.
- `endNow` refuses an ended fast (`'ended'`) instead of silently ending whichever fast runs; the
  editor names the fast it shows.
- Lengths are numbers; text is `formatDuration` in `src/i18n/format.ts` (the domain may not import
  i18n, its tests included, so the text vectors are tested there).

Tests we will write:
- 990 min → 16 h 30 m, 960 → 16 h 0 m, 45 → 0 h 45 m (formatDuration gives "16h 30m", "16h",
  "45m" in `src/i18n/format.test.ts`); fractions floored, negatives 0.
- Goal 30 → 60, 20 000 → 10 080, everywhere: start, edit, end now, read of a fast and of the default.
- Length of a running and a completed fast; never negative; goal time = start + goal.
- Overlap: touching intervals do not overlap; running = +∞.
- Start refused while one is active; refused into a future-ending fast; allowed right at another's
  end.
- Edit: missing, reopen while another runs, end before start clamps, overlap refused (R05.3).
- End now: applies the edited start and goal with the end in one result; refusal leaves nothing
  half-applied (R05.3).
- Goal crossing: lose 80 → 79 with target 79.5 fires once, a later 79 does not, a back-dated 79
  does not, maintain never, gain mirrored, first weigh-in never, no target never (R05.7, R01.11).

Compare checklist (filled after the rewrite; reopened `A/models/FastingSession.kt`,
`A/data/FastingRepository.kt`, `I/Stores/FastingStore.swift`, `T/models/FastingSessionTest.kt`,
`IT/FastingStoreTests.swift`, `T/ui/progress/LogWeightDateTest.kt`, the crossing helper in
`A/data/WeightRepository.kt` and the add path in `I/Stores/WeightStore.swift`; fasting tests in
`src/domain/trackers/fasting.test.ts`, crossing tests in `src/domain/trackers/goalCrossing.test.ts`):
- [x] Goal 60–10 080 on create, edit, end and read, default 16 h (`clampGoalMin > holds a goal of 30
  minutes to 60 and one of 20 000 to 10 080`, `readDefaultGoalMin > clamps a stored default goal
  when it is read`, `canStart and startFast > clamps the goal of a new fast`, `checkEdit > clamps
  the goal of an edited fast`, `endNow > never ends before the start, and clamps the goal`, `fast
  state and length > puts the goal time at start + goal, with the goal clamped when read`).
- [x] Active ⇔ no end; length (end or now) − start, never negative, floored minutes (`fast state
  and length > treats a fast without an end as active, and finds it in a list`, `> counts a running
  fast up to now and a completed one up to its end`, `> never gives a negative length`, `> floors to
  whole minutes`).
- [x] Length split "45m / 16h / 16h 30m" (`splitMinutes > splits 990, 960 and 45 minutes the way
  formatDuration prints "16h 30m", "16h" and "45m"`, `> floors fractions and reads negative or
  non-finite lengths as 0`; the text itself in `src/i18n/format.test.ts > formatDuration > shows
  minutes as hours and minutes in narrow units`).
- [x] Half-open overlap with a running end at +∞ (`overlaps > does not count [08:00–10:00] and
  [10:00–12:00] as overlapping`, `> counts any shared time, either way round`, `> treats a running
  fast as reaching to infinity`).
- [x] Start refused while active or into another fast (`canStart and startFast > refuses a start
  while a fast is active`, `> refuses a start that would run into a stored fast ending later`, `>
  starts right at the end of the last fast`).
- [x] Edit validated against the stored list: exists, one active, end ≥ start, goal clamped, no
  overlap (`checkEdit > refuses editing a completed fast into another's span, and stores nothing
  (R05.3)`, `> refuses an edit of a fast that is no longer stored`, `> refuses reopening a completed
  fast while another one runs`, `> clamps an end before the start to the start`, `> lets a running
  fast stay running when its start or goal changes`, `> accepts a start moved back to the end of
  the fast before it`).
- [x] End now: edits and end as one record, refused as a whole (`endNow > applies the edited start
  and goal and the end in one record (R05.3)`, `> refuses a start edited into an earlier fast, so
  neither the edit nor the end happens`, `> ends at now with the stored start and goal when nothing
  was edited`, `> refuses a fast that already ended or is no longer stored`).
- [x] Goal crossing: previous latest required, not older, lose/gain directions, maintain never,
  fires once (`crossesGoal > fires when a lose goal goes from 80 to 79 with the target at 79.5`, `>
  does not fire for a later 79 once the latest is already past the target`, `> never fires for a
  back-dated reading, even one past the target (R05.7)`, `> counts a reading at the same instant as
  the previous latest as not older`, `> counts reaching the target exactly, but not starting at it`,
  `> fires for gain when the weight rises to or past the target`, `> never fires for maintain`, `>
  never fires for the first weigh-in or without a target`; `reachesGoalOnAdd > fires once as a lose
  series passes 79.5, then never again (R05.7, R01.11)`, `> never fires for a back-dated 79 while
  the latest is above the target`, `> takes the previous latest by date, whatever order the list is
  in`, `> skips the added reading when the list already holds it`, `> never fires for the first
  weigh-in, for maintain or without a goal weight`; `latestByTime > picks the reading with the
  greatest time, not the last one in the list`).
- Deliberate differences: refusals are named values (`missing`, `ended`, `active`, `overlap`)
  instead of a boolean or an absent session; `endNow` names the fast and refuses one that already
  ended (one platform ignores a mismatched edit and ends whichever fast runs); goal minutes are
  rounded to whole minutes and a non-number goal reads as 16 h; durations are numbers, text is the
  i18n layer's; on a same-instant tie `latestByTime` takes the reading later in the list (the
  reference takes the first maximum).
- Not taken: storage, cancel and delete (P02-09 writes inside its transaction); the active-fast
  food block (P02-06, D-16.35); the goal alert schedule (P09-08); the dialog and notification
  (P05-14, P09).

## Decisions for the lead

- `startFast` takes the new fast's id; the domain cannot mint ids.
- `endNow` with an id that is not the running fast is refused (`ended` or `missing`), so the editor
  never ends a different fast than the one it shows.
- `clampGoalMin` rounds to whole minutes before clamping and maps a non-finite value to the 16 h
  default; `readDefaultGoalMin` maps anything that is not a number to 16 h.
- The text vectors "45m / 16h / 16h 30m" are tested in `src/i18n/format.test.ts` (already landed):
  lint rule 1 also covers domain tests, so a domain test may not import `src/i18n`.
- `reachesGoalOnAdd(stored, added, profile)` is the one call P02-08 makes on every add path; it
  picks the previous latest by time from the list before the add (R01.11).

## Status

Done (2026-10-26). `fasting.ts` (31 tests) and `goalCrossing.ts` (15 tests); nothing outside the
slice's files changed. Trap R05.7 covered here; the domain parts of R05.3 (validation and the
one-record end now) and R01.11 (once, latest by date, one rule for every add path) are tested here
for P02-09 and P02-08 to build their transaction tests on.
