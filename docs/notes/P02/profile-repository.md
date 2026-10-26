# Task: profile repository (P02-05) · Phase: 02 · Owner: builder (wt-p02s1)

Read (reference @ `10e14b67`): `A/data/ProfileRepository.kt` (all), `A/data/PreferencesStore.kt`
(lines 225–260: the single-value backup helper and the profile read, save and atomic update);
research spec `06-settings-data.md` §3.18 (single-value blobs, atomic profile update);
`01-profile-goals.md` §6 R01.15, R01.17; `05-home-progress.md` §3.2 and §6 R05.12 (fallback goals
before the profile loads). The guard and its profile codec from P02-02 (`src/data/guard.ts`,
`src/data/codecs.ts`). No Evidence ids.

What it does (own words): the person's body data and goal choice is one row (`profile`, key `me`).
Reading it gives one of three answers, never two of them mixed up: there is none yet (onboarding
has not finished), here it is, or something is stored that cannot be read. The last must never
look like "none", or the app would send the person back to onboarding and the next save would
write over their only copy (R01.17). Saving keeps an unreadable stored record aside in the
quarantine first, in the same transaction, and refuses the save if that copy fails. An update reads
and writes inside one transaction and refuses to run on an unreadable (or missing) record rather
than starting from made-up defaults. Birth dates are stored as local day keys, never instants, so
the day does not move with the time zone. A live feed of the profile starts in a loading state and
only then says missing, ok or corrupt, so screens can wait instead of showing fallback goals
(R05.12).

Inputs → outputs:
- `createProfileRepo(db, {clock?})` → `{get, save, update, feed}`.
- `get()` → `{kind: 'missing'}` | `{kind: 'ok', value: Profile}` | `{kind: 'corrupt', raw}`.
- `save(profile)` → stores the record in the codec's normal form; `WriteBlockedError` when an
  unreadable stored record could not be kept aside; `TypeError` for a record that would not read
  back (for example a birth date that is not a day key).
- `update(change)` → the new profile; `ProfileMissingError` when there is none,
  `ProfileUnreadableError` (carrying the raw value) when it cannot be read; nothing is written then.
- `feed` → a live feed whose state is loading, then ready with the same three answers.

Files: created `src/data/repos/profileRepo.ts`, `src/data/repos/profileRepo.test.ts`, this note.

Edge cases / failure modes:
- Missing is not corrupt: no copy, no flag.
- Corrupt stored record → `get` answers corrupt with the raw value and keeps it aside once.
- Save over a corrupt record → the raw value is in the quarantine, then the new record is stored.
- The quarantine copy fails → the save is refused and the stored bytes stay.
- Update on a corrupt record → rejected; the change function never runs; the stored value is
  unchanged (it is kept aside and flagged in that transaction, which commits).
- Update on a missing record → rejected; nothing written.
- The change function throws or returns a record that cannot be read → nothing written.
- Two updates at once → both changes kept (one transaction after the other).
- A birth date given as an instant or text → refused by the codec, nothing written; a stored day
  key reads the same in any zone.

Our design differences / decisions:
- The reference's update starts from "no saved profile" errors and lets an undecodable record
  throw out of the store's edit; here both are named errors, and the corrupt case keeps the raw
  value aside before rejecting.
- Save stores the codec's normal form (unknown fields gone, optional fields absent rather than
  undefined), so a round trip returns exactly what was saved.
- Names are ours: `createProfileRepo`, `ProfileMissingError`, `ProfileUnreadableError`.

Tests we will write:
- Missing → `missing`; save then get round trip; the live feed goes loading → missing → ok
  (R05.12 data part) and follows a save.
- Corrupt stored record → `corrupt` with its raw value, kept aside; save quarantines then writes
  (R01.17); a failing quarantine copy refuses the save and leaves the record.
- `update` on corrupt rejects, never calls the change, changes nothing; `update` on missing
  rejects; two concurrent updates keep both changes; an update whose result cannot be read writes
  nothing.
- Birth date stored as a day key and read back unchanged in Tokyo; a timestamp birth date is
  refused.

Compare checklist (filled after the rewrite; reopened `A/data/ProfileRepository.kt`,
`A/data/PreferencesStore.kt` lines 225–260):
- [x] Saving keeps an undecodable stored profile before replacing it
  (`src/data/repos/profileRepo.test.ts > profile: saving > keeps a corrupt stored profile aside before saving over
  it (R01.17)`), and a failed copy refuses the save (`> refuses the save and leaves the stored
  bytes when they cannot be kept aside (R01.17)`).
- [x] The atomic update reads and writes in one transaction (`profileRepo.test.ts > profile:
  updating > keeps both changes when two updates run at the same time`, `> changes the stored
  profile and returns what it stored`).
- [x] Update with no saved profile is an error, not a fresh profile (`> profile: updating > rejects
  when there is no profile, and writes nothing`).
- [x] Update on an undecodable profile refuses to run and leaves the bytes (`> profile: updating >
  rejects on a corrupt profile, never runs the change and leaves the record (R01.17)`).
- [x] Readers can wait for the first read instead of seeing "no profile" (`> profile: live > stays
  loading until the first read, then answers missing, then follows a save (R05.12)`).
- Deliberate differences: an undecodable profile reads as `corrupt` with its raw value instead of
  "no profile" (the reference's flow maps a failed decode to null, which is the R01.17 trap), in
  reads and in the live feed (`> profile: reading > answers corrupt for a record that cannot be
  read, never missing, and keeps it aside (R01.17)`, `> profile: live > shows an unreadable profile
  as corrupt, never as missing (R01.17)`); the corrupt update keeps the value aside before it
  rejects; save stores the codec's normal form (`> profile: saving > stores the normal form:
  optional fields left undefined are absent`); birth dates must be day keys (`> stores the birth
  date as a day key that reads the same day in any zone`, `> refuses a birth date given as an
  instant, and writes nothing`).
- Not taken: the in-store backup key for the raw text (the quarantine table replaces it).

## Decisions for the lead

- The repository is a factory, `createProfileRepo(db, {clock?})`, returning `get`, `save`,
  `update` and one shared live `feed`; errors are `ProfileMissingError` and
  `ProfileUnreadableError` (with `raw`).
- An update on a corrupt record commits the quarantine copy (and the banner flag) before it
  rejects, so the person can be told some data could not be read; the profile row is unchanged.
- Save and update store the codec's normal form, so a round trip returns exactly what was stored;
  a record the codec cannot read is refused with a TypeError.
- R05.12 (no fallback goals before the profile is read) is covered here for the data part only:
  the feed is `loading` until the first read finishes. Home's skeleton stays with P04-07.

## Status

Done (2026-10-27). Repository and tests in place; no file outside the slice was changed.
