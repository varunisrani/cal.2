# Task: water and fasting repositories (P02-09) · Phase: 02 · Owner: builder (wt-p02s3)

<!-- Save as platewise/docs/notes/P<nn>/<slug>.md. Write everything above "Compare checklist"
BEFORE writing code, in your own words. Never paste or paraphrase the reference line by line. -->

Read (reference @ `10e14b67`): `A/data/FastingRepository.kt` (all: start, end with an edited
copy, cancel, update, delete, the overlap test, each inside one store update),
`A/data/WaterRepository.kt` (all: add refuses zero, delete), `I/Stores/FastingStore.swift` (all:
the same operations as separate in-memory steps), `IT/FastingStoreTests.swift` (all, with
`disablingTrackingPreservesWaterAndCompletesActiveFast`; `activeFastBlocksFoodUntilItEnds` is
P02-06's). Research spec `05-home-progress.md` §3.6.3, §3.7 and §6 R05.2, R05.3. Earlier waves:
`src/domain/trackers/fasting.ts` (P01-19), `src/domain/meals/diary.ts` (`fastsOnDay`, P01-08),
`src/data/guard.ts`, `src/data/codecs.ts` (P02-02). Settings key `fasting.on` from
`docs/plan/17-naming-and-glossary.md` §1.3. No Evidence ids.

What it does (own words): water logs are plain rows (an amount in ml, an instant and its local
day); the repository adds them (at least 1 ml; the 5 000 ml cap belongs to the entry sheet),
deletes them and lists a day's logs. Fasts follow strict rules: one running fast at most, no two
fasts sharing time, an end never before the start, a goal of 1 hour to 7 days. Every fast
operation opens one read-write transaction, reads the stored list there, asks the P01-19 rules
whether the change is allowed, and writes the one resulting row or nothing; a refusal comes back
as a value (`active`, `overlap`, `missing`, `notActive`) so the editor can show the overlap
message and nothing has changed (R05.3). "End fast now" with edits is one checked write. Turning
fasting tracking off writes the switch and ends (never deletes) the running fast in the same
transaction, so the fast stays in history and food logging is free again; and because a backup
restore or import can bring back a running fast while the switch is off, `settleOnOpen` ends it
at start-up (R05.2). Water logs are never touched by the switch.

Inputs → outputs:
- `createWaterRepo(db, {clock?, newId?})`: `add({at, ml})` → the stored log (day key from `at`);
  `remove(id)`; `byDay(dayKey)` → that day's logs, newest first.
- `createFastRepo(db, {clock?, newId?})`, each write → `Result<Fast, FastRefusal>`:
  - `start(goalMin, now)` (`active`, `overlap`); `end(id, now)` (`missing`, `notActive`,
    `overlap`); `cancel(id)` deletes the running fast (`missing`, `notActive`);
    `edit(id, changes)` with `start`, `end`, `goalMin` (`missing`, `active`, `overlap`);
    `endNow(id, changes, now)` (`missing`, `notActive`, `overlap`); `remove(id)` (`missing`).
  - `setTracking(on, now)` → the fasts it ended; `settleOnOpen(now)` → the fasts it ended.
  - Reads: `list()` (oldest start first), `active()`, `between(firstKey, lastKey)` (fasts that
    meet those local days, for `fastsOnDay`). Reading the switch itself is P02-04's settings
    repository.

Files: created `src/data/repos/waterRepo.ts`, `src/data/repos/waterRepo.test.ts`,
`src/data/repos/fastRepo.ts`, `src/data/repos/fastRepo.test.ts`, this note.

Edge cases / failure modes:
- Second start while one runs → `active`; a start before a stored fast ends → `overlap`; nothing
  written either way.
- Two starts at the same moment: the second transaction sees the first fast and is refused.
- Edit into another fast's span → `overlap`, every row unchanged; an end before the start is
  moved up to the start; the goal is clamped.
- End now with a new start that overlaps → neither the start nor the end is applied.
- End with a clock before the start ends at the start.
- Cancel of a fast that another tab ended meanwhile → `notActive`, the completed fast is kept.
- The switch row `fasting.on` holds a plain boolean; a stored value that is not one reads as off
  (the default) and is kept aside before it is overwritten (the guard).
- Turning tracking off while a fast runs ends it at `now`; turning it on changes no fast.
- Restored data with the switch off and a fast running → ended on open; with the switch on → left
  running.
- Two running fasts at once (only possible from merged or damaged data) → both ended when
  tracking goes off: ending only shortens a fast, so it cannot add an overlap, and a refusal there
  would leave the diary locked.
- A failure while writing the fast end rolls the switch back too (one transaction).
- Unreadable fast or water rows are dropped from reads and kept in their table (P02-02).
- Water: an amount below 1 ml or not a finite number, or an instant that is not finite, is
  refused with a RangeError.

Our design differences / decisions:
- Names are ours (`start`, `endNow`, `settleOnOpen`, `byDay`).
- Refusals come back as values from every operation, including `cancel` and `remove`, instead of
  a bare false or null.
- `end`, `cancel` and `endNow` name the fast by id and refuse a fast that is no longer running,
  instead of acting on whichever fast runs.
- `cancel` deletes only a running fast; `remove` deletes any stored fast (completed fasts' Delete).
- The switch and the fast end share one transaction (the reference wrote the setting and ended
  the fast as separate steps).
- `settleOnOpen` is new: the reference had no start-up check for a running fast restored with
  tracking off (R05.2's restore case).
- `setTracking` and `settleOnOpen` end each running fast checked on its own (P01-19 `endNow` over
  that fast alone), so stale overlaps in restored data cannot keep a fast running.
- The fasts read for validation are the readable ones; an unreadable row is kept aside, never
  overwritten.
- The switch key is a local constant `fasting.on` until P02-04's settings schema lands; both write
  the same row with a plain boolean.

Tests we will write:
- Water: add stores ml and the local day; `byDay` across New York midnight, newest first; below
  1 ml refused and nothing stored; remove; unreadable rows dropped and kept.
- Fasts: second start refused `active`, nothing written; start before a stored fast ends refused
  `overlap`; two parallel starts → one fast (R05.3).
- Edit overlapping another fast refused and every row unchanged (R05.3); end before start moved up;
  goal clamped; missing fast → `missing`.
- `endNow` with a new start applies both (ACC-H8-1, R05.3); with an overlapping start applies
  neither (R05.3).
- End: at now, never before the start; a completed fast → `notActive`.
- Cancel removes the running fast from history; a completed fast is kept (`notActive`).
- Remove deletes a completed fast; missing → `missing`.
- Tracking off ends the running fast, keeps water logs, writes the switch, leaves no running fast
  for the food check (ACC-H10-1, R05.2); tracking on leaves the fast running.
- A failing fast write keeps the switch as it was (one transaction).
- A switch value that is not a boolean is kept aside before it is overwritten.
- `settleOnOpen` ends a restored running fast when tracking is off (R05.2), leaves it when on, and
  ends two running fasts from damaged data.
- `between` returns the fasts that meet a day window, including the running one.

Compare checklist (filled after the rewrite; reopened `A/data/FastingRepository.kt`,
`A/data/WaterRepository.kt`, `I/Stores/FastingStore.swift`, `IT/FastingStoreTests.swift`):
- [x] Start refused while one runs or when it would overlap, decided inside the write
  (`src/data/repos/fastRepo.test.ts > start (R05.3) > starts a running fast with a clamped goal,
  and refuses a second start writing nothing (R05.3)`, `> refuses a start before a stored fast
  ends (R05.3)`, `> makes one fast from two starts at the same moment: the check runs inside the
  write (R05.3)`); a fast may start exactly when the last ended (`> allows a start exactly when the
  last fast ended`).
- [x] End at now, never before the start; persisted and found again after a restart (the iOS
  persistence test) (`fastRepo.test.ts > end > ends the running fast at now, and refuses one that
  has already ended`, `> never ends before the start, even with a clock behind it`, `> reads >
  finds the running fast again after the database is reopened`).
- [x] End with edits: the reference's Android end-with-updated-copy, as one checked write
  (`fastRepo.test.ts > endNow (R05.3) > applies the edited start and ends the fast in one step
  (ACC-H8-1, R05.3)`, `> applies neither the start nor the end when the edited start overlaps
  another fast (R05.3)`, `> refuses a fast that has already ended`).
- [x] Update: missing → refused, reopening while another runs refused, end clamped up, goal
  clamped, overlap refused with nothing changed (`fastRepo.test.ts > edit (R05.3) > refuses an
  edit into another fast and changes nothing (R05.3)`, `> moves an end before the start up to the
  start and clamps the goal (R05.3)`, `> refuses reopening a completed fast while another runs,
  and a fast that is not stored (R05.3)`).
- [x] Cancel deletes the running fast, delete removes any fast (`fastRepo.test.ts > cancel >
  deletes the running fast so it never shows in history`, `> keeps a fast that has already ended,
  and refuses one that is not stored`, `> remove > deletes a completed fast, and refuses one that is
  not stored`).
- [x] Tracking off ends (not deletes) the running fast and keeps water
  (`disablingTrackingPreservesWaterAndCompletesActiveFast`) (`fastRepo.test.ts > setTracking
  (R05.2) > switching fasting off ends the running fast, keeps it and the water logs, and leaves no
  fast to block food (ACC-H10-1, R05.2)`, `> switching fasting on writes the switch and leaves a
  running fast running`, `> keeps the switch as it was when ending the fast fails: one transaction
  (R05.2)`, `> keeps a switch value that cannot be read aside before writing over it (R06.1)`).
- [x] Restored running fast with tracking off (R05.2's restore case, no reference counterpart)
  (`fastRepo.test.ts > settleOnOpen (R05.2) > ends a restored running fast while tracking is off
  (R05.2)`, `> … is never set (R05.2)`, `> … is unreadable (R05.2)`, `> leaves a running fast
  running while tracking is on`, `> ends two running fasts from damaged data, though they overlap
  each other (R05.2)`).
- [x] Fast reads: unreadable rows dropped and kept, a damaged end never reads as running
  (`fastRepo.test.ts > reads > drops an unreadable fast from reads and keeps it (R06.1)`); windows
  for the diary (`> reads > lists the fasts that meet a day window, the running one included, by
  start`); live (`> reads > follows a start and an end through a live query (R06.3)`).
- [x] Water add refuses amounts below 1 ml (the reference skips ≤ 0 silently) and delete
  (`src/data/repos/waterRepo.test.ts > add > refuses 0 ml and stores nothing` and the other
  `refuses …` rows, `> accepts 1 ml and leaves the 5 000 ml cap to the entry sheets`, `> remove >
  deletes one log and does nothing for an id that is not stored`); days and order (`> add > files a
  log under the local day of its instant and lists a day newest first`); unreadable and live
  (`> byDay > drops an unreadable log from the day and keeps it (R06.1)`, `> byDay > follows an add
  through a live query (R06.3)`).
- Deliberate differences: refusals are values from every operation (`active`, `overlap`,
  `missing`, `notActive`) instead of false/null; `end`, `cancel` and `endNow` name the fast by id
  and refuse one that is no longer running (Android's cancel removed every running fast, iOS acted on
  whichever ran); the switch and the fast end share one transaction; `settleOnOpen` is new; the
  settle paths end every running fast checked alone; water below 1 ml is a RangeError, not a
  silent skip; no in-process mutex (Dexie serialises read-write transactions over the same tables).
- Not taken: the diary import into water (`importDiary`, P09); `clear` (erase, P02-14); the iOS
  `completed(on:)` day filter (the domain's `fastsOnDay`, P01-08, over `between`); the change
  callbacks (live queries, P02-03); the food block during a fast (P02-06).

## Decisions for the lead

- The switch key is a local constant `FASTING_ON_KEY = 'fasting.on'` in `fastRepo.ts` with a plain
  boolean value (17 §1.3). When P02-04 lands, point it at the schema's key (or export it from
  there); both slices write the same row. P02-04's in-memory snapshot must follow this direct
  write (a live query on `settings` does).
- A switch that is missing or unreadable reads as off (its default), so `settleOnOpen` ends a
  running fast then: a running fast the UI cannot show would keep food logging locked (R05.2).
- `setTracking` and `settleOnOpen` end every running fast, each checked on its own with P01-19's
  `endNow`: ending only shortens a fast, so it cannot add an overlap, and a refusal there would
  strand the fast. Both return the fasts they ended (for the goal-alert cancel in P09-08).
- `cancel(id)` deletes only a running fast (`notActive` for a completed one, e.g. ended in another
  tab meanwhile); `remove(id)` deletes any fast.
- Boot (P04-07) should call `fastRepo.settleOnOpen(now)` once after the database opens, and the
  restore (P09-13) after it writes.
- `between(firstKey, lastKey)` returns fasts whose span meets those local days, a fast ending
  exactly at the first midnight included (that is the day `fastsOnDay` files it under).

## Status

Done (2026-10-26). `waterRepo.ts` (10 tests) and `fastRepo.ts` (28 tests), all passing. Nothing
outside the task's files changed. Traps covered: R05.2, R05.3 (the atomic-write half); also
exercises R06.1 and R06.3. Acceptance: ACC-H8-1, ACC-H10-1.
