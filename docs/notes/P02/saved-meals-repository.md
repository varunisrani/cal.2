# Task: saved meals repository (P02-10) · Phase: 02 · Owner: builder (wt-p02s4)

<!-- Save as platewise/docs/notes/P<nn>/<slug>.md. Write everything above "Compare checklist"
BEFORE writing code, in your own words. Never paste or paraphrase the reference line by line. -->

Read (reference @ `10e14b67`): `A/data/PreferencesStore.kt` (only the `favoriteFoodEntries` flow,
its update helper and its part of the photo reference snapshot), and, to see what toggling and
moving do with that list, the favourites block of `A/data/FoodRepository.kt` (toggle, move, the
one-time migration; lines 205–275). Research spec `02-food-logging.md` §3.16 (lists, toggle,
reorder) and the "favourite key" line of §2; decision D-16.17; acceptance row ACC-D17-1. The
reference has no unit test for the favourites list itself (its photo-removal tests only use a
favourite as a second photo owner, which P02-07 covers). No Evidence ids.

What it does (own words): a person can keep any logged food as a saved meal and log it again
later from the Saved list. A saved meal is a frozen copy of the entry at the moment it was saved:
it has its own id, remembers which entry it came from, and later edits or deletion of that entry
never reach it. The list keeps the person's own order. Saving is a toggle on an entry: if a saved
meal made from that entry exists it goes away, otherwise a copy is added at the end. The
reference matched favourites by lower-cased name plus calories, so two different foods that
happen to share both collided (toggling one removed the other); D-16.17 drops that key and links
the copy to its entry id instead. Reordering takes an item out at one position and puts it back
at another, the target clamped to the list, as the reference's up/down buttons and drag do.

Inputs → outputs (`savedMealsRepo(db, {newId?, clock?})`):
- `list()` → saved meals in the person's order (ascending `order`, ties by id); unreadable rows are
  left out and kept aside by the guard.
- `feed()` → a live feed of `list()` for the P02-15 hook.
- `toggleFromEntry(entry)` → `{kind: 'saved', meal}` (a new copy appended) or
  `{kind: 'removed', meals}` (every readable saved meal whose `originEntryId` is the entry's id).
- `isSaved(entryId)` → boolean.
- `remove(id)` → the removed meal, or null when nothing readable had that id.
- `move(from, to)` → true when the order changed.

Files: created `src/data/repos/savedMealsRepo.ts`, `src/data/repos/savedMealsRepo.test.ts`, this
note.

Edge cases / failure modes:
- Two entries with the same name and kcal: each toggle looks only at its own entry id, so both can
  be saved and unsaving one leaves the other.
- The original entry is edited or deleted later: the copy is untouched (it is a separate row built
  from a fresh copy of the values; nothing in it points back except `originEntryId`).
- More than one saved meal from the same entry (a restored backup could hold that): unsaving
  removes all of them, so the heart reads "not saved" afterwards.
- `move` with `from` outside the list (or not a whole number) or a `to` that is not a number:
  nothing changes. `to` past either end is clamped (0 → 9 in a list of three lands last).
- Rows whose `order` is missing read as 0 (codec default) and still list; a move renumbers every
  readable row 0…n−1, so ties disappear after the first move.
- An unreadable saved-meal row: left out of every read, kept aside in the quarantine (guard), never
  deleted or renumbered by `move`, `remove` or a toggle. Since the person cannot see it, a toggle
  on its entry saves a fresh copy instead of silently dropping it.
- An entry the draft codec cannot read cannot be saved (TypeError before any write).
- Removing a saved meal can leave photos nobody uses. This repository does not touch photos:
  `remove` and an unsaving toggle return the removed meals so the caller can pass their
  `photoIds` to the photo store's reference-checked release after the commit.

Our design differences / decisions:
- Identity by origin entry id instead of a name+kcal key (D-16.17); the reference's legacy
  set-of-keys migration has no counterpart (we have no legacy data).
- The copy is built through the draft codec (`decodeDraft`), so it carries exactly the food fields,
  freshly copied, and never the entry's own fields (id, time, day key, meal, barcode key).
- New copies go after the highest stored `order`; `move` renumbers the readable rows densely.
- Each operation is one read-write transaction (reads inside it), so two quick toggles cannot both
  see "not saved".
- Photo cleanup is left to the caller (lead's integration with `photoRepo.releaseIfUnused`); the
  reference pruned images right after every toggle.

Tests we will write:
- toggle twice returns to an empty list and `isSaved` follows.
- two entries with the same name and kcal are saved as two meals; unsaving one keeps the other
  (ACC-D17-1, D-16.17).
- move 0 → 9 in a list of three lands last; a negative target lands first; `from` out of range
  changes nothing.
- editing (and deleting) the original entry keeps the snapshot.
- the copy has its own id, no entry-only fields, and goes to the end of the list.
- `remove` returns the meal with its photo ids; an unknown id returns null.
- an unreadable saved-meal row is left out of the list, kept aside, and survives moves and
  toggles.
- the live feed follows a toggle.

Compare checklist (filled after the rewrite; reopened `A/data/PreferencesStore.kt`
(`favoriteFoodEntries` and the guarded list update it goes through), `A/data/FoodRepository.kt`
(favourites block)):
- [x] Saved meals are copies kept apart from the diary: they survive deletion of the original,
  do not follow its edits, and keep their order across reloads (tested in
  `src/data/repos/savedMealsRepo.test.ts > saved meals > keeps the snapshot when the original entry
  is edited or deleted`, `> saved meals > reorders across a reload`).
- [x] Toggle removes the match when there is one, else appends a copy at the end (`>
  toggleFromEntry > returns to an empty list when toggled twice`, `> toggleFromEntry > appends a
  copy with its own id after the last saved meal`).
- [x] The reference's name + kcal key collision cannot happen here (`> toggleFromEntry > saves two
  foods with the same name and calories separately (ACC-D17-1, D-16.17)`).
- [x] Move: take out at `from`, insert at `to` clamped to 0…length of the shortened list; a `from`
  outside the list leaves it as it was (`> move > lands last when moved from 0 to 9 in a list of
  three`, `> move > moves down and up by one like the row buttons`, `> move > lands first for a
  negative target and changes nothing for an index outside the list`).
- [x] The reference reads, changes and writes the list in one store transaction and keeps an
  unreadable list aside before replacing it; here each operation is one read-write transaction
  and an unreadable row is never replaced at all, only kept aside and left in its table (`> saved
  meals > leaves an unreadable row out, keeps it aside and never touches it`).
- [x] Saved meals own photos (the reference's photo reference snapshot counts them); removal
  hands the photo ids back to the caller instead of pruning here (`> remove > returns the removed
  meal with its photo ids`, `> toggleFromEntry > removes every saved meal made from the entry`).
- Deliberate differences: identity by origin entry id (D-16.17) instead of the name + kcal key, so
  the reference's "drop any copy with the same id" step has no counterpart; unsaving removes every
  copy made from that entry; no prune after a toggle (the caller releases the returned photo ids
  through the photo store); a `to` that is not a number is refused rather than clamped.
- Not taken: the one-time migration from the legacy key set (no legacy data); the derived
  "favourite key" set for row hearts (`isSaved` and the list's `originEntryId` replace it); the
  key for Frequent grouping (a diary query, P06).

## Decisions for the lead

- API shape: `savedMealsRepo(db, {newId?, clock?})` returns `{list, feed, toggleFromEntry, isSaved,
  remove, move}`; `clock` only stamps quarantine copies.
- Photo cleanup: after `remove(id)` or a toggle that answers `{kind: 'removed'}` has resolved
  (committed), the caller passes the removed meals' `photoIds` to `releaseIfUnused(db, ids)` of
  `src/data/repos/photoRepo.ts` (P02-07), outside the saved-meal transaction so the photo store's
  reference check sees the committed state. Natural home: the step that wires repositories to
  features (P02-15 or the P06-12 saved list and the entry editor's save toggle); this repository
  imports nothing from the photo store.
- Unsaving removes every readable saved meal made from that entry (duplicates can only come from a
  restore).
- Ordering is done in memory (≤ a few hundred rows) rather than through the `order` index, because
  rows without a numeric `order` (read as 0) are missing from that index.

## Status

Done (2026-10-27). Everything in this note is in place; no file outside the slice was changed.
