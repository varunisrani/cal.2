# Task: weight and body-fat repositories (P02-08) · Phase: 02 · Owner: builder (wt-p02s3)

<!-- Save as platewise/docs/notes/P<nn>/<slug>.md. Write everything above "Compare checklist"
BEFORE writing code, in your own words. Never paste or paraphrase the reference line by line. -->

Read (reference @ `10e14b67`): `A/data/WeightRepository.kt` (add, delete, profile sync, the
crossing helper; the health import parts skipped), `A/data/BodyFatRepository.kt` (add, delete,
seed, profile sync; health parts skipped), `I/Stores/WeightStore.swift` (seed, add with the
goal check, delete, profile sync, day-granular windows; tombstones and health import skipped),
`I/Stores/BodyFatStore.swift` (all), `IT/WeightHistoryTests.swift` (the back-dated goal case and
the chart-window cases; the health import and tombstone cases are for a later health phase).
Research spec `05-home-progress.md` §3.5.3–3.5.5 and §6 R05.8; `01-profile-goals.md` §3.13 and
§6 R01.11. Earlier waves: `src/domain/trackers/goalCrossing.ts` (P01-19), `src/data/guard.ts`,
`src/data/codecs.ts`, `src/data/bus.ts` (P02-02, P02-03). No Evidence ids.

What it does (own words): weigh-ins and body-fat readings are tracker rows with a time and a
value. The profile carries a "current" weight and an optional body fat that the goal formulas use,
and both must always equal the newest reading by date, never the last one typed in: a reading
logged for an earlier day is history and changes neither the profile nor the goal state. Every
add, delete and seed is one read-write transaction over the tracker table and the profile (plus
the guard's tables), so the reading and the profile can never disagree (R05.8). Adding a weigh-in
also decides, before anything is written, whether it carries the weight across the goal weight
from the far side (P01-19's `crossesGoal` against the latest stored reading); when it does, the
result says so and a `goal-reached` message goes on the bus after the commit, so every add path
(Progress, the Settings weight sheet, Coach later) raises the dialog (R01.11). A weigh-in only
moves the weight: it never clears a target weight (only the Settings weight save does that with
`withWeight`). Deleting re-syncs to the new latest; deleting the last reading leaves the profile
as it was. The first reading can be seeded from onboarding, once.

Inputs → outputs:
- `createWeightRepo(db, {clock?, newId?, bus?})`:
  - `addWeighIn({at, kg})` → `{entry, goalReached}`; posts `{type: 'goal-reached', kg}` when true.
  - `deleteWeighIn(id)` → resolves; re-syncs the profile weight when readings remain.
  - `seedFirst(kg, at)` → the new weigh-in, or null when the table already holds any row.
  - `between(firstKey, lastKey)` → readings on those local days, oldest first (charts).
  - `history()` → every reading, newest first (history sheet). `latest()` → newest or null.
- `createBodyFatRepo(db, {clock?, newId?})`: `addReading({at, fraction})` → the reading,
  `deleteReading(id)`, `seedFirst(fraction, at)`, `between(firstKey, lastKey)`, `history()`,
  `latest()`, the same shapes for body-fat readings.

Files: created `src/data/repos/weightRepo.ts`, `src/data/repos/weightRepo.test.ts`,
`src/data/repos/bodyFatRepo.ts`, `src/data/repos/bodyFatRepo.test.ts`, this note.

Edge cases / failure modes:
- Profile weight sync only when the newest differs by more than 0.01 kg; body fat when it
  differs by more than 0.0001 (a fraction).
- Back-dated weigh-in under a lose target: stored, profile weight unchanged, no message.
- A new latest crossing the target posts once; the next reading past the target does not.
- The very first reading never reaches the goal (no previous latest).
- Two readings at the same instant: the domain's `latestWeighIn` decides (the later in the list).
- Profile missing (before onboarding saved it): the reading is stored, nothing is synced, no goal.
- Profile unreadable: the reading is stored, the profile is left alone (the read keeps it aside),
  no goal check is possible, so `goalReached` is false.
- A failure while writing the profile rolls the reading back too (one transaction).
- Deleting the latest re-syncs to the previous one; deleting a reading that does not exist does
  nothing; deleting the only weigh-in or the only body-fat reading leaves the profile value.
- Seeding twice, even at the same moment, stores one row; seeding next to an unreadable row adds
  nothing (an unreadable row is still a reading, R06.1).
- Windows are whole local days: a reading late on the last day is inside.
- Unreadable rows are dropped from every read and kept in their table (P02-02).
- A weight that is not a positive finite number, a body fat outside (0, 1), or an instant that is
  not finite is refused with a RangeError before the transaction.

Our design differences / decisions:
- Names are ours (`addWeighIn`, `seedFirst`, `goalReached`, `history`).
- One transaction per change over the tracker table, `profile` and the guard tables, instead of
  a list write followed by a separate profile save.
- The crossing is decided inside the add path for every caller (iOS behaviour), not by the
  Progress screen alone (Android's Settings path never showed it, R01.11).
- The bus message goes to this tab only (`this-tab`): the dialog answers this person's action, and
  other tabs posting their own notification would duplicate it.
- No health-store sync, deletion tombstones or imports (later phase, none in v1).
- Body fat gets a `seedFirst` too, for P05-07 ("seed the first body-fat reading only when body fat
  was entered").

Tests we will write:
- Back-dated weigh-in below the target: profile weight kept, `goalReached` false, nothing on the
  bus (ACC-C11-2, R01.11).
- New latest crossing a lose target: true and one bus message; the next reading past the target
  posts nothing more (R01.11).
- The profile weight follows the latest by date, only beyond 0.01 kg (R05.8); a weigh-in past the
  target keeps the target weight.
- Deleting the latest sets the profile weight to the previous one (ACC-G7-1, R05.8); deleting the
  only weigh-in keeps the profile weight.
- A failing profile write leaves no weigh-in behind (R05.8, one transaction).
- Seeding twice in parallel stores one row; seeding next to an unreadable row adds nothing.
- Missing and unreadable profile: the reading is still stored, the profile untouched.
- Windows: whole local days, oldest first; history newest first; latest; unreadable rows dropped.
- Body fat: the profile follows the latest; a back-dated reading does not move it; deleting the
  latest re-syncs; deleting the last reading keeps the profile value (R05.8); a failing profile
  write rolls the reading back; seeding once.

Compare checklist (filled after the rewrite; reopened `A/data/WeightRepository.kt`,
`A/data/BodyFatRepository.kt`, `I/Stores/WeightStore.swift`, `I/Stores/BodyFatStore.swift`,
`IT/WeightHistoryTests.swift`):
- [x] Goal crossing decided against the latest reading stored before the add, inside the add, for
  every caller; once per crossing; never for a back-dated reading (`src/data/repos/weightRepo.test.ts
  > addWeighIn (R05.8, R01.11) > keeps the profile weight and raises nothing for a back-dated
  weigh-in below the target (ACC-C11-2, R01.11)`, `> raises goal-reached once when a new latest
  crosses the lose target (R01.11)`); never for the first reading (`> seedFirst > moves the
  profile weight to the seeded reading and never raises goal-reached`).
- [x] Profile weight follows the newest by date beyond 0.01 kg, in the same transaction as the
  write (`weightRepo.test.ts > addWeighIn (R05.8, R01.11) > moves the profile weight to the newest
  reading only when it differs by more than 0.01 kg (R05.8)`, `> stores nothing and raises nothing
  when the profile write fails (R05.8)`, `> deleteWeighIn (R05.8) > deletes the reading and the
  profile change together, or neither (R05.8)`).
- [x] A weigh-in syncs the weight only (the reference's repositories never touch the target)
  (`weightRepo.test.ts > addWeighIn (R05.8, R01.11) > only moves the weight: a reading past the
  target keeps the target weight`).
- [x] No profile → no sync and no goal (the reference returns early) (`> stores the reading
  without a profile and syncs nothing`); an unreadable profile is never overwritten (`> stores the
  reading next to an unreadable profile and leaves the profile as it was (R06.1)`).
- [x] Delete re-syncs to the new newest; an empty history leaves the profile weight
  (`weightRepo.test.ts > deleteWeighIn (R05.8) > sets the profile weight to the previous reading
  when the latest is deleted (ACC-G7-1, R05.8)`, `> leaves the profile weight as it was when the
  only reading is deleted (R05.8)`, `> changes nothing for an id that is not stored`).
- [x] Seeding is a no-op once anything is stored (`weightRepo.test.ts > seedFirst > stores one
  reading when seeded twice at the same moment`, `> adds nothing next to a reading that cannot be
  read (R06.1)`; `src/data/repos/bodyFatRepo.test.ts > seedFirst > stores one reading when seeded
  twice, and sets the profile body fat`).
- [x] Windows are whole local days, so today's readings are inside; all-time history includes old
  readings (the iOS chart-range tests) (`weightRepo.test.ts > reads > lists whole local days oldest
  first, the history newest first, and the latest by date`; `bodyFatRepo.test.ts > reads > lists
  whole local days oldest first, the history newest first, and the latest by date`); unreadable rows
  dropped and kept (`weightRepo.test.ts > reads > drops an unreadable reading from every read and
  keeps it (R06.1)`, `bodyFatRepo.test.ts > reads > drops an unreadable reading from reads and keeps
  it (R06.1)`).
- [x] Body fat follows the newest reading beyond 0.0001, a missing profile value always syncs, the
  last delete leaves the profile value (`bodyFatRepo.test.ts > addReading (R05.8) > moves the
  profile body fat to the newest reading; a back-dated one leaves it (R05.8)`, `> keeps goal body
  fat and the rest of the profile when it syncs`, `> stores nothing when the profile write fails
  (R05.8)`, `> deleteReading (R05.8) > moves the profile body fat to the previous reading when the
  newest is deleted (R05.8)`, `> keeps the profile value when the last reading is deleted (R05.8)`,
  `> deletes the reading and the profile change together, or neither (R05.8)`).
- Deliberate differences: one transaction for the reading and the profile (the reference wrote the
  list, then saved the profile); the goal check runs in the repository for every add path and posts
  on the bus (`this-tab`), returning `goalReached` as well; seeding counts unreadable rows as
  history; out-of-range values are refused with a RangeError (the reference relied on its pickers);
  deleting an id that is not stored skips the re-sync; on two readings at the same instant the
  domain's `latestWeighIn` picks the later stored one (Android's `maxBy` keeps the first).
- Not taken: health-store writes, imports, merges and deletion tombstones (no health sync in v1);
  `replaceAll` and `clear` (restore and erase, P09-13 and P02-14); the iOS cross-process reload
  (Dexie's own change propagation, P02-03).

## Decisions for the lead

- `goal-reached` is posted with reach `this-tab`: the dialog answers the person's own action in
  this tab, and a post to every tab would also make every tab's notifier (P09-09) notify. Easy to
  flip to the default (`all-tabs`) if P05-14 wants every tab to show it.
- A weigh-in or body-fat reading next to an unreadable profile is stored and the profile is left
  untouched (kept aside by the read); `goalReached` is false then. The alternative, refusing the
  reading, would lose the person's input for a problem the K9 banner already reports.
- Body fat gets `seedFirst(fraction, at)` too (P05-07 seeds the first reading when body fat was
  entered). The body-fat methods are `addReading` / `deleteReading` to read well next to
  `addWeighIn` / `deleteWeighIn`.
- Value checks: weight must be a finite number above 0 kg, body fat a fraction strictly between 0
  and 1, instants finite; anything else is a RangeError before the transaction (pickers keep the
  UI inside 20–250 kg and 3–60 %).
- P05-10 (Settings weight save) must call `addWeighIn` before it applies `withWeight` to the
  profile, so the crossing is judged before a contradicted target is dropped.

## Status

Done (2026-10-26). `weightRepo.ts` (21 tests) and `bodyFatRepo.ts` (13 tests), all passing.
Nothing outside the task's files changed. Traps covered: R05.8, R01.11 (the add-path half); also
exercises R06.1. Acceptance: ACC-C11-2, ACC-G7-1.
