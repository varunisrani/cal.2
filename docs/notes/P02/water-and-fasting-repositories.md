# Task: water and fasting repositories (P02-09) · Phase: 02 · Owner: builder (wt-p02s3)

<!-- Save as platewise/docs/notes/P<nn>/<slug>.md. Write everything above "Compare checklist"
BEFORE writing code, in your own words. Never paste or paraphrase the reference line by line. -->

Read (reference @ `10e14b67`): `A/data/FastingRepository.kt` (all), `A/data/WaterRepository.kt`
(all), `I/Stores/FastingStore.swift` (all), `IT/FastingStoreTests.swift` (all, in particular the
case where turning tracking off keeps water and completes the running fast); research spec
`05-home-progress.md` §3.6, §3.7 and §6 R05.2, R05.3, R05.9, R05.21; decisions D-16.35, D-16.39 in
`16-what-we-change.md`; setting names in `17-naming-and-glossary.md` §1.3 (`fasting.on`). Traps
ledger rows R05.2 and R05.3 (owned here). No Evidence ids.

What it does (own words):
- Water: a log is an amount in whole ml at an instant, filed under the local day of that instant.
  Adding takes the amount the person chose (1–5 000 ml, D-16.39, rounded with a minimum of 1 by
  the domain's `waterAmountMl`); deleting removes one log. Reads give one day's logs. Logs stay
  whatever the water switch says (R05.9).
- Fasting: a fast has a start, an end (none while it runs) and a goal. Every change is decided by
  the domain fasting rules (`startFast`, `checkEdit`, `endNow`) against the list read inside the
  same read-write transaction that writes the result, so no other write can slip between the check
  and the write (R05.3). A refusal (another fast running, an overlap, the fast gone or already
  ended) is returned as a value and nothing is written. "End now" from the editor stores the edited
  start and goal and the end as one record, so both land or neither does. Cancel deletes the
  running fast so it never shows in history; remove deletes any fast. Turning fasting tracking off
  writes the setting and ends (never deletes) every running fast in the same transaction, because
  with the switch off there is no way left to end it and food would stay blocked (R05.2). The same
  can happen when a backup or import brings a running fast while tracking is off, so on start-up
  `settleOnOpen` ends any running fast when tracking is off.

Inputs → outputs:
- `createWaterRepo(db, {ids?, clock?})` → `add({at, ml})` → the stored log (RangeError for an
  amount the domain refuses); `remove(id)` → true when removed; `byDay(dayKey)` → that day's logs,
  newest first; `liveDay(dayKey)` → the same as a live feed.
- `createFastRepo(db, {ids?, clock?})` →
  - `start(goalMin, now)`, `end(id, now)`, `cancel(id)`, `edit(id, changes)`,
    `endNow(id, changes, now)`, `remove(id)` → `Result<Fast, refusal>` (the fast as stored, or as
    removed for cancel and remove);
  - `setTracking(on, now)` → the fasts it ended; `settleOnOpen(now)` → the fasts it ended;
    `trackingOn()`;
  - `all()` (oldest start first), `active()`, `between(firstKey, lastKey)` (fasts that ended on
    those days plus any running fast; the diary places them with `fastsOnDay`), and `liveAll`,
    `liveActive`, `liveBetween`.

Files: created `src/data/repos/waterRepo.ts`, `waterRepo.test.ts`, `fastRepo.ts`,
`fastRepo.test.ts`, this note.

Edge cases / failure modes:
- Second start while one runs: refused `active`, nothing written.
- Start while a stored completed fast ends after now: refused `overlap`.
- Edit that would overlap another fast: refused `overlap`, both fasts exactly as before.
- End or end-now on a fast that was deleted (`missing`) or already ended (`ended`).
- End-now with an edited start that overlaps an earlier fast: refused, the running fast keeps its
  start and keeps running; with a valid start, the start, goal and end are all stored.
- End at a time before the start (the clock moved back): the end becomes the start.
- Goal outside 1 h – 7 days: clamped by the domain on start, edit and end-now.
- Cancel of a completed fast: refused `ended` (Delete is the action for those); remove deletes it.
- Tracking off with no running fast: only the setting changes. Two running fasts (damaged or
  restored data): both are ended, or food would stay blocked.
- `settleOnOpen` with tracking on: nothing changes; with the setting absent (default off) or
  unreadable (reads as off): running fasts are ended.
- Start while tracking is off: refused `tracking-off` (the start control is hidden then; this keeps
  a fast from being stranded).
- An edit that would store a value its codec cannot read (a non-finite start): thrown TypeError,
  nothing written.
- Water: 0, a negative amount, NaN or above 5 000 ml → RangeError and nothing stored; 0.4 ml → 1 ml.
- Water on a past day: stored under the local day of `at` (the caller stamps it with
  `stampForDay`); a log at 23:30 in New York belongs to that day, not the UTC day.
- Unreadable rows: left out of reads and checks, kept aside, never overwritten.

Our design differences / decisions:
- Names are ours; operations name the fast by id (the reference ends "the active one").
- Refusals are values (`Result`) for the fasting rules; a bad water amount is a caller error and
  throws before any write.
- Ending a fast because tracking went off does not re-check overlaps: ending only shortens a
  running fast, so it cannot create an overlap, and refusing would strand the fast.
- The fasting switch is read and written as the `settings` row `fasting.on` (`{key, value}`), the
  layout the schema gives key-value rows; true is on, anything else (absent, unreadable) is off.
- Start is refused while tracking is off (reference: the menu hides it; here the store refuses
  too).
- No mutex: IndexedDB already runs read-write transactions on the same tables one after another.
- Not taken: the reference's diary import into water (P09 owns imports).

Tests we will write:
- water: add stores whole ml on the local day; amounts outside 1–5 000 refused and nothing stored;
  delete; `byDay` across midnight in New York, newest first; a live feed follows an add; water logs
  survive tracking off (in the fasting tests).
- fasting: second start refused; start refused while tracking is off; overlapping edit refused and
  data unchanged (R05.3); end never before start; end-now applies the edited start and the end in
  one step (ACC-H8-1) and a refused end-now changes nothing (R05.3); cancel removes it from history;
  cancel of a completed fast refused; remove; tracking off ends the running fast and keeps water
  logs (ACC-H10-1, R05.2); tracking off with two running fasts ends both; `settleOnOpen` ends a
  restored running fast when tracking is off and leaves it when on (R05.2); `between` and the live
  active feed.

Compare checklist (filled after the rewrite; reopened `A/data/FastingRepository.kt`,
`A/data/WaterRepository.kt`, `I/Stores/FastingStore.swift`, `IT/FastingStoreTests.swift`, and the
settings caller that ends the fast when tracking goes off):
- [x] Start refused while a fast runs or when it would overlap; touching intervals allowed; goal
  clamped (`src/data/repos/fastRepo.test.ts > start > refuses a second start while a fast runs and
  stores nothing (R05.3)`, `> lets only one of two starts made at the same moment through
  (R05.3)`, `> refuses a start that would overlap a stored fast`, `> starts right where the
  previous fast ended (intervals are half-open)`, `> starts a fast now with the goal clamped to
  1 hour – 7 days`).
- [x] End sets end = now, never before the start, and the fast stays in history (`fastRepo.test.ts
  > end > ends a running fast now and keeps it in history`, `> never stores an end before the
  start`, `> refuses a fast that already ended or is gone`).
- [x] Edit checked against the stored list: missing, second running, end clamp, goal clamp,
  overlap; a refusal changes nothing (`fastRepo.test.ts > edit > refuses an edit that overlaps
  another fast and leaves both unchanged (R05.3)`, `> stores an edit, pulling an end before the
  start up to the start and clamping the goal`, `> refuses to reopen a completed fast while another
  runs`, `> refuses an edit of a fast that is gone`, `> keeps a running fast running when only its
  start and goal change`).
- [x] End now with edits is one write: both or neither (`fastRepo.test.ts > endNow > applies the
  edited start and goal and ends the fast in one step (ACC-H8-1, R05.3)`, `> changes nothing when
  the edited start would overlap: the fast keeps its start and keeps running (R05.3)`, `> changes
  nothing when the ended fast could not be stored`).
- [x] Cancel deletes the running fast; delete removes any fast (`fastRepo.test.ts > cancel and
  remove > cancel deletes the running fast so it is not in history`, `> cancel refuses a completed
  fast and keeps it`, `> remove deletes a completed fast`).
- [x] Tracking off ends (not deletes) the running fast and keeps water
  (`fastRepo.test.ts > tracking switch > switching off ends the running fast, keeps it in history
  and keeps water logs (ACC-H10-1, R05.2)`, `> switching off ends every running fast, even two left
  by damaged data`, `> switching on only writes the switch`).
- [x] A running fast that arrives with tracking off is ended on open (`fastRepo.test.ts >
  settleOnOpen > ends a restored running fast when tracking is off (R05.2)`, `> ends a running
  fast when the switch was never stored (tracking is off by default)`, `> leaves a running fast
  alone when tracking is on`).
- [x] Unreadable rows are left out and never overwritten (`fastRepo.test.ts > reads > leaves
  unreadable fasts out of reads and checks`, `> tracking switch > keeps an unreadable switch aside
  before writing over it`; `waterRepo.test.ts > remove > keeps an unreadable log aside before
  deleting it`).
- [x] Water: add refuses amounts the domain refuses (the reference ignores ml ≤ 0; we also cap at
  5 000, D-16.39), delete, reads by local day (`src/data/repos/waterRepo.test.ts > add > stores
  whole ml under the local day of the time it was drunk`, `> files the same instant under the day
  of the zone the device is in`, `> takes 1 to 5 000 ml, rounding a trace up to 1 ml (D-16.39)`,
  `> refuses an amount outside 1–5 000 ml or a time that is not an instant, and stores nothing`,
  `> remove > deletes one log and answers false for an id that is not stored`, `> byDay > lists one
  local day newest first across midnight in New York`).
- [x] Live reads (`fastRepo.test.ts > reads > pushes a start and an end to a live active-fast
  feed`; `waterRepo.test.ts > byDay > pushes an add and a delete to a live day feed`).
- [x] Fasts that ended on a day, plus the running one, for the diary (`fastRepo.test.ts > reads >
  between lists fasts that ended on those days, plus the running one`).
- Deliberate differences: the switch and the end of the running fast are one transaction (the
  reference writes the switch, then ends the fast in a second step); operations name the fast by
  id, and cancel removes only that fast (the reference removes every running one; with damaged
  data the next one then shows and can be cancelled too); start is refused while tracking is off;
  refusals are values with a reason instead of null or false; a bad water amount throws.
- Not taken: the water diary import (P09), `clear` (P02-14), the reference's mutex (IndexedDB
  already serialises read-write transactions on the same tables).

## Decisions for the lead

- API: `createWaterRepo(db, {ids?, clock?})` and `createFastRepo(db, {ids?, clock?})`; callers
  pass `now` / `at`. Refusals: the domain's `missing | ended | active | overlap`, plus
  `tracking-off` for `start`.
- The fasting switch is read and written here as the `settings` row
  `{key: 'fasting.on', value: boolean}` (`FASTING_ON_KEY`, one exported constant). The settings
  repository (P02-04) is being written in parallel: if it stores settings in another shape, change
  `FASTING_ON_KEY` / `readSwitch` / the put in `setTracking` to match, or `settleOnOpen` will read
  "off" and end a running fast on every open. A test that writes the switch through the settings
  repository and reads it here would pin it once both have landed.
- `setTracking(false)` belongs to the Settings switch (P07): the UI must call it instead of writing
  the setting through the settings repository, or the running fast is not ended (R05.2).
  `settleOnOpen(now)` must run once at start-up after the database opens (P04/P09 app start, and
  after a restore or import).
- "Food logging works again" (ACC-H10-1): this slice proves no running fast is left
  (`activeFast(all())` is undefined); the food write itself is P02-06's check. A cross-repository
  test (setTracking(false) then `diaryRepo.add`) can be added once both have landed.
- The goal alert scheduler (R05.20, P09) can watch `liveActive()`; this repository does not
  schedule anything.
- `between(first, last)` returns every running fast whatever the window; `fastsOnDay` (domain)
  keeps it to today.

## Status

Done (2026-10-26). Everything in this note is in place; no file outside the slice was changed.
