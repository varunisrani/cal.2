# Task: fasting rules and goal crossing (P01-19) · Phase: 01 · Owner: builder (wt-p01c5)

<!-- Save as platewise/docs/notes/P<nn>/<slug>.md. Write everything above "Compare checklist"
BEFORE writing code, in your own words. Never paste or paraphrase the reference line by line. -->

Read (reference @ `10e14b67`): `A/models/FastingSession.kt` (the record, the goal limits, the
derived goal time and duration, the duration text), `A/data/FastingRepository.kt` (start, end
with edits in one update, cancel, edit validation, delete, the overlap test), `I/Stores/FastingStore.swift`
(the same operations on iOS, where an edit and an end are two writes),
`T/models/FastingSessionTest.kt` (duration and text), `IT/FastingStoreTests.swift` (start, end,
edit, delete, cancel; touching fasts allowed; an overlapping edit refused and nothing changed),
`T/ui/progress/LogWeightDateTest.kt` (back-dated weigh-ins never reach the goal). For the crossing
rule itself, the helper next to the weight repository's add path (`A/data/WeightRepository.kt`,
the crossing function only). Research specs `05-home-progress.md` §3.5.3 and §3.7 with §6 R05.3,
R05.7, and `01-profile-goals.md` §3.13 with §6 R01.11. No Evidence ids.

What it does (own words): fasting is a timer the person starts, ends, edits or cancels; at most
one runs at a time and no two fasts may share any stretch of time. This module holds those rules
as pure checks over the stored list, so the fasting repository (P02-09) can run one check and
one write inside a single transaction, and a refused change leaves everything as it was (R05.3).
A fast is running while it has no end; its length is (end, or now) − start and never negative;
its goal is a whole number of minutes between 1 hour and 7 days, enforced whenever a fast or the
default goal is made, changed or read. Two fasts overlap when their half-open spans meet, a
running fast reaching to infinity, so one may start exactly when another ended. The goal-crossing
rule decides whether a newly added weigh-in deserves the goal-reached dialog: only when there was
an earlier latest reading, the new one is not older than it, and the weight moved across the
target in the goal's direction (R05.7, R01.11).

Inputs → outputs:
- `FAST_GOAL_MIN_MINUTES` (60), `FAST_GOAL_MAX_MINUTES` (10 080), `DEFAULT_FAST_GOAL_MINUTES`
  (960); `clampFastGoal(minutes)` → whole minutes inside the range (not a finite number → 960);
  `decodeFastGoal(stored: unknown)` → the default goal setting as read.
- `isActive(fast)`, `goalAt(fast)` (start + clamped goal), `fastDuration(fast, now)` (ms, ≥ 0),
  `activeFast(fasts)` (the running one, or null).
- `overlaps(a, b)` on half-open spans, a running fast's end = +∞.
- `newFast(id, goalMin, now)` → a running fast with a clamped goal;
  `canStart(fasts, now)` → `null` or a refusal (`active`, `overlap`).
- `checkEdit(fasts, edited)` → `Result<Fast, FastRefusal>`: the stored fast must exist
  (`missing`); making it running while another runs is refused (`active`); end clamped up to the
  start; goal clamped; overlap with any other fast refused (`overlap`).
- `endNow(fasts, id, edits, now)` → `Result<Fast, FastRefusal>`: the fast must exist and be
  running (`missing`, `notActive`); start and goal edits are applied, end = max(now, start), goal
  clamped, overlap refused; one result for one write.
- `formatFast(minutes)` → "45m", "16h", "16h 30m" (floored; negative reads 0m).
- `trackers/goalCrossing.ts`: `latestWeighIn(list)` (latest by instant; on a tie the later one in
  the list) and `crossesGoal(previousLatest, added, goal, target)` → boolean.

Files: created `src/domain/trackers/fasting.ts`, `src/domain/trackers/fasting.test.ts`,
`src/domain/trackers/goalCrossing.ts`, `src/domain/trackers/goalCrossing.test.ts`, this note.

Edge cases / failure modes:
- Goal 30 → 60, 20 000 → 10 080, 59.6 → 60, NaN or a string → 960 (decode only).
- Duration with an end before the start (bad data) or a clock behind the start → 0.
- [08:00–10:00] and [10:00–12:00] do not overlap; [08:00–10:01] and [10:00–12:00] do; a running
  fast from 09:00 overlaps every fast that ends after 09:00, however late it starts.
- Start refused while one is running; refused when a completed fast ends after now (a fast
  edited into the future), allowed when the last fast ended exactly now.
- Editing a completed fast into another's span is refused and the input list is untouched; an
  edit that keeps the fast where it was is accepted (it never overlaps itself); a fast deleted
  meanwhile is `missing`.
- Edit an end before the start → end = start.
- Reopening a completed fast (end → null) is refused while another runs, and refused when a later
  fast exists (the open end would overlap it).
- `endNow` with a new start applies both or neither (overlap → refused, nothing returned to
  write); ending at a clock before the start ends at the start.
- Crossing: lose 80 → 79 with target 79.5 fires; a later 79 after that does not (previous is
  already past the target); a back-dated 79 does not; the very first weigh-in does not; maintain
  never; gain 70 → 72 with target 71 fires; landing exactly on the target counts; same instant as
  the previous latest counts as not older; no target → never.

Our design differences / decisions:
- Names are ours (`Fast`, `goalMin`, `canStart`, `checkEdit`, `endNow`, `crossesGoal`, …).
- The functions return values and refusal reasons and never write: P02-09 runs check + write in
  one transaction, so "End fast now" with edits is one write on every path (the reference's iOS
  path takes two, R05.3).
- `endNow` names the fast by id and refuses a fast that is no longer running, instead of quietly
  ending whichever fast is running.
- Goal minutes are rounded to whole minutes when clamped; a non-number reads as the 16 h default.
- `formatFast` is the one text helper (unit letters only, per the task decision); everything else
  returns numbers.

Tests we will write:
- Goal clamp: 30 → 60, 20 000 → 10 080, in-range kept, fractions rounded; decode of junk → 960.
- Active ⇔ no end; duration with now and with an end, never negative; goal time.
- 990 min → "16h 30m"; 45 → "45m"; 960 → "16h"; 0 and negatives → "0m"; fractions floored.
- Overlap: touching spans do not overlap, one minute more does; a running fast reaches +∞;
  symmetric (R05.3).
- `canStart`: refused while one is active; refused when a stored fast ends after now; allowed
  touching (R05.3).
- `checkEdit`: missing, reopen while another runs, end before start clamps, goal clamps,
  overlap refused with the input unchanged, an unchanged edit accepted (R05.3).
- `endNow`: applies a start edit and the end together; refused on overlap; refuses a completed
  or missing fast; end never before start (R05.3).
- Crossing: the lose sequence (fires once, later 79 no, back-dated 79 no), gain, maintain never,
  first reading never, exact target, same instant, no target (R05.7, R01.11).
- `latestWeighIn` picks by instant, not list order (R05.7).

Compare checklist (filled after the rewrite; reopened `A/models/FastingSession.kt`,
`A/data/FastingRepository.kt`, `I/Stores/FastingStore.swift`, `T/models/FastingSessionTest.kt`,
`IT/FastingStoreTests.swift`, `T/ui/progress/LogWeightDateTest.kt`):
- [x] Goal limits 60–10 080, default 16 h, clamped on create, edit, end and read
  (`src/domain/trackers/fasting.test.ts > goal minutes > clamps %d to %d` (9 rows), `> is an hour
  to a week, 16 hours by default`, `> reads the stored default goal clamped, and anything that is
  not a number as 16 hours`; `a fast > starts now, running, with a clamped goal`; `checkEdit
  (R05.3) > clamps the goal on an edit (R05.3)`; `endNow (R05.3) > clamps the edited goal`).
- [x] Active ⇔ no end; goal time; duration to now or end, never negative (`a fast > is active while
  it has no end`, `> reaches its goal at start + the goal`, `> measures to now while active and to
  its end once ended`, `> never has a negative length`, `> finds the running fast`).
- [x] Duration text floored: minutes only, hours only, both (`formatFast > %d minutes → %s` (10
  rows), `> formats a measured duration in whole minutes`).
- [x] Half-open overlap with an open end as +∞ (`overlaps (R05.3) > lets [08:00–10:00] and
  [10:00–12:00] touch without overlapping (R05.3)`, `> overlaps once the spans share a minute,
  either way round (R05.3)`, `> treats a running fast as never ending (R05.3)`).
- [x] Start refused while active or overlapping; touching allowed (`canStart (R05.3) > refuses a
  start while one is active (R05.3)`, `> refuses a start before a stored fast ends (R05.3)`, `>
  allows a start exactly when the last fast ended, or with no fasts`).
- [x] Edit: must exist, one active, end ≥ start, goal clamp, overlap refused with nothing changed
  (`checkEdit (R05.3) > refuses editing a completed fast into another's span and changes nothing
  (R05.3)`, `> clamps an end before the start up to the start (R05.3)`, `> refuses an edit of a
  fast that is no longer stored (R05.3)`, `> refuses reopening a completed fast while another runs
  (R05.3)`, `> refuses reopening a fast that a later fast follows (R05.3)`, `> accepts an edit
  that keeps a fast where it was; it never meets itself`, `> keeps a running fast running when its
  start moves (R05.3)`, `> writes only the fields of a fast`).
- [x] End with edits as one result, end never before start, overlap refuses both (`endNow (R05.3) >
  applies the edited start and goal and the end in one result (R05.3)`, `> refuses both changes
  when the edited start overlaps another fast (R05.3)`, `> ends without edits at now, keeping the
  start and goal`, `> never ends before the start (R05.3)`, `> refuses a completed or missing fast
  (R05.3)`).
- [x] Goal crossing: previous latest needed, not older, lose and gain directions, maintain never,
  transition only (`src/domain/trackers/goalCrossing.test.ts > crossesGoal (R05.7, R01.11) > fires
  once for lose 80 → 79 with target 79.5; a later 79 does not (R01.11)`, `> never fires for a
  back-dated 79 under target 79.5 (R05.7)`, `> never fires for back-dated readings past the goal,
  lose or gain (R05.7)`, `> never fires for the first reading (R05.7, R01.11)`, `> never fires for
  maintain (R05.7, R01.11)`, `> fires for gain 70 → 72 with target 71, once (R01.11)`, `> counts
  landing exactly on the target, and a reading at the same instant as the latest (R01.11)`, `> does
  not fire when the previous latest was already at or past the target (R01.11)`, `> does not fire
  for a reading that stays short of the target or moves away (R01.11)`, `> never fires without a
  target weight`).
- [x] Latest by date (`latestWeighIn (R05.7) > picks the latest by date, not the last added
  (R05.7)`, `> takes the later one in the list for two readings at the same instant`, `> is null
  for no readings`).
- Deliberate differences: checks return the fast to write or a refusal and never write (one
  transaction in P02-09, so End fast now is one write on every path, R05.3); `endNow` names the
  fast by id and refuses one that is no longer running (`notActive`) instead of ending whichever
  runs; the running fast is the latest-starting active one; goal minutes are rounded to whole
  minutes and a non-number reads as 16 h; the crossing rule is written as distances along the
  goal's direction.
- Not taken: cancel and delete (plain removals in P02-09); the store's persistence guards and
  change callbacks (P02-02, P02-09); the food block during a fast (P02-06, P06-19); the
  goal-reached dialog and notification (P02-08, P07).

## Decisions for the lead

- `formatFast` returns text per the task decision; the HANDOFF note asking for numbers is
  superseded by it. Every other helper here returns numbers or refusal codes.
- Refusal codes: `active`, `overlap`, `missing`, `notActive`. P07-07 maps `overlap` (and `active`)
  to the "overlaps another fast" message.
- `decodeFastGoal` reads the stored default goal (`fasting.defaultGoalMin`); P02-04 should use it
  (or `clampFastGoal`) when decoding and writing the setting.
- P02-08 must evaluate `crossesGoal(latestWeighIn(stored), added, profile.goal,
  profile.goalWeightKg)` before `withWeight` from `src/domain/profile/editRules.ts` clears a
  contradicted target, and before writing the new reading.
- Extra exports beyond the row: `FAST_GOAL_MIN_MINUTES`, `FAST_GOAL_MAX_MINUTES`,
  `DEFAULT_FAST_GOAL_MINUTES`, `clampFastGoal`, `decodeFastGoal`, `isActive`, `goalAt`,
  `fastDuration`, `activeFast`, `newFast`, `FastRefusal`, `FastEdits`; `latestWeighIn` and the
  `Reading` type in `goalCrossing.ts`.

## Status

Done (2026-10-26). `fasting.ts` with 49 tests and `goalCrossing.ts` with 13 tests, all passing.
Nothing outside `src/domain/trackers/**` changed; `fasting.ts` imports `src/lib/result`. Traps
covered: R05.7 (owned by P01-19); R05.3 (owned by P02-09) and R01.11 (owned by P02-08) exercised
at the domain level.
