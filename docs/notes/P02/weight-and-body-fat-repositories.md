# Task: weight and body-fat repositories (P02-08) · Phase: 02 · Owner: builder (wt-p02s3)

<!-- Save as platewise/docs/notes/P<nn>/<slug>.md. Write everything above "Compare checklist"
BEFORE writing code, in your own words. Never paste or paraphrase the reference line by line. -->

Read (reference @ `10e14b67`): `A/data/WeightRepository.kt` (add, delete, seed, profile sync, goal
crossing; the health import skipped), `A/data/BodyFatRepository.kt` (all but the health import),
`I/Stores/WeightStore.swift` (add, delete, seed, latest, day-range read, profile sync; health import
and tombstones skipped), `I/Stores/BodyFatStore.swift` (all), `IT/WeightHistoryTests.swift` (all;
most cases are about the health import and day ranges); research spec `05-home-progress.md`
§3.5.3–3.5.5 and §6 R05.5, R05.7, R05.8; `01-profile-goals.md` R01.11; decisions D-16.37, D-16.38
in `16-what-we-change.md`. Traps ledger rows R01.11 and R05.8 (owned here). No Evidence ids.

What it does (own words): weigh-ins and body-fat readings are histories of dated values. The
profile keeps one current weight (it drives the energy formulas) and an optional current body fat
(it picks the lean-mass formula); both must always equal the latest reading by date, or Settings,
Progress and the targets disagree. So every add and delete changes the reading and the profile in
one transaction (R05.8): after an add the profile weight follows the latest weigh-in by date when
they differ by more than 0.01 kg; a back-dated reading is not the latest, so it leaves the profile
alone. After a delete the profile follows the new latest; when nothing is left the profile keeps
its value (a person who clears their history still needs a weight, and losing the body-fat value
would silently switch the formula). Adding a weigh-in also checks the goal: only a new latest
reading that passes the goal weight in the goal's direction counts (the domain's
`reachesGoalOnAdd`), and then the repository posts `goal-reached` on the app bus after the commit.
Every caller (Progress, the Settings weight edit, Coach later) adds through this one function, so
the dialog is raised from one place and once per crossing (R01.11). The first weigh-in can be seeded
from the onboarding weight, and seeding again does nothing. Reads give a day window oldest first
(charts, net change), the whole history newest first (the history sheet) and the latest reading
overall (the Current badge); each also exists as a live feed.

Inputs → outputs:
- `createWeightRepo(db, {ids?, bus?, clock?})` →
  - `addWeighIn({at, kg})` → `{entry, goalReached}`; posts `{type: 'goal-reached', weighInId, kg}`
    when `goalReached`.
  - `deleteWeighIn(id)` → true when a row was removed.
  - `seedFirst(kg, at)` → the new weigh-in, or null when the history already has rows.
  - `between(firstKey, lastKey)` → weigh-ins on those local days, oldest first;
    `history()` → all, newest first; `latest()` → the latest by time or undefined;
    `liveBetween`, `liveHistory`, `liveLatest` → the same as live feeds.
- `createBodyFatRepo(db, {ids?, clock?})` → `addReading({at, fraction})`, `deleteReading(id)`,
  `seedFirst(fraction, at)`, `between`, `history`, `latest` and their live feeds.

Files: created `src/data/repos/weightRepo.ts`, `weightRepo.test.ts`, `bodyFatRepo.ts`,
`bodyFatRepo.test.ts`, this note.

Edge cases / failure modes:
- Back-dated weigh-in below the target: stored, profile weight unchanged, no `goal-reached`.
- A new latest crossing the lose target posts once; a later reading further past it does not.
- Two weigh-ins added at the same time that both cross: the transactions run one after the other,
  the second sees the first as the previous latest, so only one post.
- Same instant as the latest: counts as not older (the domain rule), and the new one becomes the
  latest for the profile too.
- Profile weight 80.005, new latest 80.0: within 0.01 kg, the profile is not rewritten.
- No profile yet (before onboarding ends): the reading is stored, no sync, no goal check.
- Unreadable profile: the reading is stored, the profile is left exactly as it is (kept aside by
  the guard), no goal check; never overwritten from a default.
- Deleting the only weigh-in or the only body-fat reading: the profile keeps its value.
- Deleting an id that is not there: nothing changes, false.
- Unreadable weigh-in rows are left out of reads and of "latest", and kept aside; a delete over an
  unreadable row copies it aside first.
- A weight outside 20–250 kg (the wheels' widest range, `WEIGHT_LIMITS`), a body fat outside the
  codec's open 0–1 range, or a time that is not an instant: refused with a thrown RangeError before
  any write.
- Window reads are half-open on instants, so a reading at 23:00 on the last day is inside (R05.5).

Our design differences / decisions:
- Names are ours. One transaction per add or delete covering the reading table and `profile`
  (the reference saves the list and the profile in two steps).
- The goal check reads the stored list inside the add's transaction and the post happens after the
  commit, so a rolled-back add never announces anything.
- The profile is patched field by field (`weightKg` or `bodyFat`) instead of rewritten from its
  decoded copy, so fields a newer build added are kept.
- Weight range is enforced in the repository from the domain's `WEIGHT_LIMITS.kg` (D-16.37); body
  fat has no domain range yet, so only the codec's 0–1 bound applies (the 3–60 % wheel is the UI's).
- Health-store import, deletion tombstones and cloud merge are not taken (no health sync in v1).
- Body fat gets `seedFirst` too, like weight (the reference seeds both from onboarding).
- History delete asks first (D-16.38): a UI rule, not here; the repository deletes when asked.

Tests we will write:
- weight: back-dated weigh-in below the target keeps the profile weight and posts nothing
  (ACC-C11-2, R05.7); a new latest crossing the lose target posts once, the next one past it does
  not (R01.11); two parallel crossing adds post once; deleting the latest re-syncs to the previous
  one (ACC-G7-1, R05.8); deleting the only weigh-in keeps the profile weight; the 0.01 kg tolerance;
  seeding twice adds one row; no profile and an unreadable profile; out-of-range refused and nothing
  stored; window half-open and oldest first, history newest first, latest overall; a live feed sees
  an add.
- body fat: add syncs the profile to the latest; back-dated reading leaves it; deleting the latest
  re-syncs; deleting the last reading keeps the profile value (R05.8); seed idempotent; unreadable
  profile untouched; out-of-range refused; reads and a live feed.

Compare checklist (filled after the rewrite; reopened `A/data/WeightRepository.kt`,
`A/data/BodyFatRepository.kt`, `I/Stores/WeightStore.swift`, `I/Stores/BodyFatStore.swift`,
`IT/WeightHistoryTests.swift`, and the onboarding and settings callers of the seeds):
- [x] Profile weight follows the latest weigh-in by date, more than 0.01 kg apart, in the add's own
  transaction (`src/data/repos/weightRepo.test.ts > addWeighIn > moves the profile weight to the
  latest weigh-in only when it differs by more than 0.01 kg (R05.8)`).
- [x] Back-dated weigh-in: no profile change, no goal (`weightRepo.test.ts > addWeighIn > keeps
  the profile weight and posts nothing for a back-dated weigh-in below the target (ACC-C11-2,
  R05.7)`).
- [x] Goal crossing against the previous latest, once, from the one add path (`weightRepo.test.ts
  > addWeighIn > posts goal-reached once when a new latest weigh-in crosses the lose target
  (R01.11)`, `> posts once when two crossing weigh-ins are added at the same moment (R01.11)`,
  `> posts for a gain goal and never for maintain`, `> never counts the very first weigh-in as
  reaching the goal`, `> announces nothing and changes nothing when the add fails`).
- [x] No profile: entry stored, no sync, no goal (`weightRepo.test.ts > addWeighIn > stores the
  weigh-in without a profile and checks no goal`; `bodyFatRepo.test.ts > addReading > stores the
  reading without a profile`).
- [x] Delete re-syncs to the new latest; deleting the last leaves the profile (`weightRepo.test.ts
  > deleteWeighIn > sets the profile weight to the previous weigh-in when the latest is deleted
  (ACC-G7-1, R05.8)`, `> keeps the profile weight when the only weigh-in is deleted`;
  `bodyFatRepo.test.ts > deleteReading > moves the profile body fat to the new latest when the
  latest is deleted (R05.8)`, `> keeps the profile body fat when the last reading is deleted
  (R05.8)`).
- [x] Body-fat sync: absent profile value is set, 0.0001 tolerance, latest by date
  (`bodyFatRepo.test.ts > addReading > moves the profile body fat to the latest reading (R05.8)`,
  `> does not rewrite the profile for a difference within the tolerance`, `> leaves the profile
  body fat on the latest reading when an older one is added`).
- [x] Seeds are idempotent, for weight and body fat (onboarding seeds both) (`weightRepo.test.ts >
  seedFirst > adds one row when seeded twice`, `> does not seed a history whose only rows cannot
  be read`; `bodyFatRepo.test.ts > seedFirst > adds one row when seeded twice`).
- [x] Day-granular windows include readings late on the last day, oldest first; history newest
  first; latest overall (`weightRepo.test.ts > reads > lists a window oldest first and keeps a
  weigh-in from late on its last day (R05.5)`, `> lists the history newest first and gives the
  newest as the latest`; the same two in `bodyFatRepo.test.ts > reads`).
- [x] An unreadable store never loses data: the reference blocks writes while an unreadable blob
  has no backup; here rows are separate, an unreadable profile is left untouched and an unreadable
  row is kept aside before a delete (`weightRepo.test.ts > addWeighIn > stores the weigh-in and
  leaves an unreadable profile exactly as it was`, `> deleteWeighIn > keeps an unreadable weigh-in
  aside before deleting it`; `bodyFatRepo.test.ts > addReading > stores the reading and leaves an
  unreadable profile exactly as it was`, `> deleteReading > keeps an unreadable reading aside
  before deleting it`).
- [x] Live reads (`weightRepo.test.ts > reads > pushes a new latest weigh-in to a live feed`;
  `bodyFatRepo.test.ts > reads > pushes a new reading to a live history feed`).
- Deliberate differences: the reading and the profile change in one transaction (the reference
  saves them in two steps, with the profile read again in between); the goal announcement goes on
  the app bus after the commit instead of a return value or a notification-centre post; the
  profile is patched one field at a time; weights outside 20–250 kg and body fat outside 0–1 are
  refused before writing (the reference stores whatever it is given); the seed counts unreadable
  rows as history.
- Not taken: health-store import, merge and write-back, deletion tombstones, cloud merge,
  `replaceAll` (restore is P09) and `clear` (erase is P02-14), the external-change reload (Dexie
  already pushes other tabs' commits to live queries, and the sync never leaves a gap to repair).

## Decisions for the lead

- API: `createWeightRepo(db, {ids?, bus?, clock?})` and `createBodyFatRepo(db, {ids?, clock?})`
  return objects of plain async functions plus `live*` feeds (no React). Callers pass the time
  (`at`); ids default to `newId`, the bus to `appBus()`.
- `goal-reached` is posted with `bus.post`, which also reaches other open tabs. The dialog owner
  (P05-14 / P07) should raise it only for `origin === 'this-tab'`, or every open tab will show it.
- Unreadable profile on an add: the reading is still stored and the profile is left untouched (no
  sync, no goal). Refusing the weigh-in would lose what the person just typed; the unreadable-data
  banner already tells them something is wrong.
- Profile sync patches `weightKg` / `bodyFat` with `table.update` instead of going through the
  profile repository (P02-05, written in parallel). If the lead prefers one writer for the profile,
  swap `follow` for `profileRepo.update` once both have landed; it must stay inside this
  transaction.
- Range checks: weight uses `WEIGHT_LIMITS.kg` (20–250 kg, D-16.37) and throws a RangeError; body
  fat has no domain range, so only the codec's open 0–1 bound is enforced (a 3–60 % domain constant
  would let the repository check the wheel's range too).
- Found while building (and confirmed by the lead's note): a `transact` body must itself be an
  `async` function; `() => helper()` lost the transaction after a few awaits
  (PrematureCommitError, with the quarantine copy committed early). Every body here is an `async`
  arrow that awaits its helper. `copyInOwnTx` in `src/data/guard.ts` still passes
  `() => copyAside(...)`; it works in today's tests but has the same shape.

## Status

Done (2026-10-26). Everything in this note is in place; no file outside the slice was changed.
