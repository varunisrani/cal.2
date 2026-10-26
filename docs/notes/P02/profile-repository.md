# Task: profile repository (P02-05) · Phase: 02 · Owner: builder (wt-p02s1)

<!-- Save as platewise/docs/notes/P<nn>/<slug>.md. Write everything above "Compare checklist"
BEFORE writing code, in your own words. Never paste or paraphrase the reference line by line. -->

Read (reference @ `10e14b67`): `A/data/ProfileRepository.kt` (all: a thin wrapper with a reactive
read, a save and a one-shot current value), `A/data/PreferencesStore.kt` lines 225–262 (the profile
part: an unreadable stored profile reads as "none", a save backs up an unreadable value before
replacing it, an atomic update refuses when no profile is stored or it cannot be read). Research
spec `01-profile-goals.md` §6 R01.12, R01.15, R01.17; `06-settings-data.md` §3.18 (single-value
blobs), §6 R06.1, R06.2. No Evidence ids.

What it does (own words): the profile (body data, goal choice, saved targets, locks, allergens) is
one row, `me`, of the `profile` table. Reading it tells three cases apart: nothing stored yet
(onboarding has not run), a readable profile, and a stored profile that cannot be read. The third
must never be mistaken for the first, which would send the person back through onboarding, and the
unreadable value must not be lost: it is copied into `quarantine` and the banner flag is set.
Saving writes the profile it is given; when the stored one cannot be read, its raw value is copied
aside first in the same transaction, and if that copy fails the save is refused and the stored
value stays (R01.17). Updating reads the stored profile, applies a change and writes the result in
one transaction; it refuses to run when nothing is stored or the stored profile cannot be read,
instead of starting from defaults. The repository stores exactly what it is given: no targets are
recomputed when the weight or activity changes (R01.12). Birth dates are local day keys
(`YYYY-MM-DD`), never instants (R01.15); a profile whose birth date is not a day key is refused.

Inputs → outputs: `createProfileRepo(db, {clock?})` → `get()` → `{kind: 'missing'} | {kind: 'ok',
value: Profile} | {kind: 'corrupt', raw}`; `save(profile)` → resolves, or rejects with
`WriteBlockedError` (copy failed) or `TypeError` (a profile its own codec cannot read back);
`update(change)` → the new profile, or rejects with `ProfileUnavailableError` (`reason: 'missing' |
'corrupt'`).

Files: created `src/data/repos/profileRepo.ts`, `src/data/repos/profileRepo.test.ts`, this note.

Edge cases / failure modes:
- Stored value unreadable → `get` says corrupt (with the raw value) and the guard keeps it aside
  later; never `missing`.
- `save` over an unreadable value → copy first, then write, one transaction; a failing copy →
  `WriteBlockedError`, the stored raw value untouched.
- `update` on a missing profile → rejects, nothing written. On an unreadable one → rejects, the
  stored value untouched, its raw value kept aside (a failed copy loses nothing: the row stays).
- `update`'s change returning a profile that cannot be read back → `TypeError`, the transaction
  rolls back.
- Two `update` calls at the same time → both changes kept (read-write transactions on one table
  run one after the other).
- A birth date given as an ISO instant or a Date → refused by the codec, nothing stored.

Our design differences / decisions:
- One IndexedDB row instead of a JSON string in a key/value file; the backup copy goes to the
  shared `quarantine` table (D-16.76) instead of a backup key or a file.
- `update` tells "missing" and "corrupt" apart with a typed error instead of a generic failure.
- `update` keeps an unreadable value aside before refusing (the reference only refuses); the copy
  runs after the refused transaction, because a copy inside it would be rolled back with it.
- The reference's reactive read is a live query over `get()` (P02-03); no separate "current" call.

Tests we will write:
- missing → `missing`; save then get round trip (optional fields absent stay absent).
- corrupt stored value → `corrupt` (not `missing`), raw kept aside once, flag set.
- save over corrupt → quarantine holds the raw value, then the new profile is stored (R01.17).
- save over corrupt with a failing quarantine → `WriteBlockedError`, raw value still stored.
- update on corrupt → `ProfileUnavailableError('corrupt')`, raw value unchanged, kept aside.
- update on missing → `ProfileUnavailableError('missing')`, nothing stored.
- update keeps saved targets and locks when the weight changes (R01.12).
- two concurrent updates keep both changes.
- birth date: an instant string is refused and nothing stored; a stored day key reads the same in
  Asia/Tokyo and Pacific/Honolulu (R01.15).
- a live query over `get()` follows a save.

Compare checklist (filled after the rewrite; reopened `A/data/ProfileRepository.kt`,
`A/data/PreferencesStore.kt` lines 225–262):
- [x] Reading: the reference's read turns an unreadable profile into "none"; ours keeps three cases
  apart and keeps the unreadable value aside (`src/data/repos/profileRepo.test.ts > get > answers
  missing when no profile is stored`, `> reads back exactly the profile saved, optional parts
  absent staying absent`, `> calls an unreadable profile corrupt, never missing, and keeps it aside
  (R01.17)`).
- [x] Saving backs up an unreadable value before replacing it, in the same write
  (`profileRepo.test.ts > save > keeps an unreadable profile aside, then stores the new one
  (R01.17)`); where the reference falls back to a backup key, ours refuses the save when the copy
  fails (`> refuses to save over an unreadable profile that cannot be kept aside (R01.17)`).
- [x] The atomic update fails when nothing is stored and when the stored value cannot be read,
  without running the change (`update > refuses to run when no profile is stored, instead of
  starting from defaults`, `> refuses to run on an unreadable profile, leaving it as it was and
  kept aside (R01.17)`, `> refuses to run on an unreadable profile even when it cannot be kept
  aside`); it reads, changes and writes in one transaction (`> keeps both changes when two updates
  run at once (R06.2)`) and stores what the change returns, recomputing nothing (`> changes the
  stored profile in one step and recomputes nothing (R01.12)`); a result that cannot be read back
  is refused (`> refuses a change that cannot be read back and keeps the stored profile`).
- [x] Birth dates stay local day keys (`save > refuses a birth date that is an instant, storing
  nothing (R01.15)`, `> keeps a birth date as the same day key in any zone (R01.15)`).
- [x] The reactive read (`live reads > follows a saved change like any table`).
- Deliberate differences: three-way read result instead of "profile or none"; a failed backup copy
  refuses the save (D-16.76) instead of writing the raw value under a second key; `update` names
  why it refused (`ProfileUnavailableError`, `missing` or `corrupt`) and keeps an unreadable value
  aside before refusing; no separate "current value" call (a one-shot `get()` serves boot).
- Not taken: none of the named reference parts.

## Decisions for the lead

- `update` keeps an unreadable profile aside in its own transaction after the refused one (a copy
  inside the refused transaction would roll back with it); a failed copy is ignored because the
  stored value stays in place, as for reads.
- `save` stores the profile as given plus `id: 'me'` (no tidying through the codec), so the
  repository never changes a value it was handed (R01.12); only a profile its codec cannot read
  back is refused.

## Status

Done (2026-10-26). `repos/profileRepo.ts` and its test are in place; nothing outside the task's
files changed. Unit tests: `profileRepo.test.ts` 14, all passing.
