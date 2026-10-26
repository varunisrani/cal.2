# Task: saved meals repository (P02-10) · Phase: 02 · Owner: builder (wt-p02s4)

<!-- Save as platewise/docs/notes/P<nn>/<slug>.md. Write everything above "Compare checklist"
BEFORE writing code, in your own words. Never paste or paraphrase the reference line by line. -->

Read (reference @ `10e14b67`): `A/data/PreferencesStore.kt`, the `favoriteFoodEntries` parts only
(the ordered list of copies stored as one guarded list, its read-modify-write update, and the
photo reference scan that counts it). Research spec `02-food-logging.md` §3.16 (favourites:
copies, toggle, reorder semantics), §3.19 (photo owners), §6 R02.7 and R02.8; decision D-16.17.
Earlier waves: `src/data/guard.ts`, `src/data/codecs.ts` (`decodeSavedMeal`),
`src/data/repos/photoRepo.ts` (`references()` already reads `savedMeals`). No Evidence ids.

What it does (own words): a saved meal is a snapshot of a logged entry that the person wants to
reuse. It is a copy with its own id and a position in the person's list, so two different foods
that share a name and calories can both be saved (D-16.17; the reference keyed favourites by name
and calories, so saving one removed the other). The heart on a diary row or in the entry editor
toggles: when a saved meal copied from that entry exists it is removed, otherwise a fresh copy of
the entry is appended at the end. The copy keeps the entry's food values, source and photo ids but
none of its diary fields (time, day, meal); editing or deleting the entry later never changes it.
The saved list can be reordered by moving one meal from one position to another (the target is
clamped to the list) and a meal can be removed. Every change is one read-write transaction, and an
unreadable saved row is dropped from reads, kept aside and never deleted or renumbered.

Inputs → outputs:
- `createSavedMealsRepo(db, {clock?, newId?})` → `SavedMealsRepo`.
- `list()` → the readable saved meals in the person's order (Dexie promise, usable in a live
  query).
- `toggleFromEntry(entry)` → `{saved: true, meal}` (copy appended) or `{saved: false, photoIds}`
  (copies of that entry removed; their photo ids for `photoRepo.releaseIfUnused`).
- `isSaved(entryId)` → whether a readable saved meal was copied from that entry.
- `remove(id)` → the removed meal's photo ids (empty when nothing was removed).
- `move(from, to)` → the list in its new order.

Files: created `src/data/repos/savedMealsRepo.ts`, `src/data/repos/savedMealsRepo.test.ts`, this
note.

Edge cases / failure modes:
- Toggle twice → back to empty; the second toggle hands back the photo ids to release.
- Two entries with the same name and kcal → two saved meals; removing one keeps the other.
- Editing the original entry (or deleting it) leaves the snapshot as it was.
- `move(0, 9)` in a list of 3 → the meal lands last; a negative target lands first; a `from`
  outside the list (or not a whole number) changes nothing.
- An unreadable saved row: dropped from `list` and `isSaved`, kept aside by the guard, never
  touched by toggle, move or renumbering (its positions are unknown); `remove` of its id keeps the
  raw value aside before deleting it (guard).
- A stored row without a usable `order` reads at position 0 (codec); a move renumbers the readable
  rows 0…n−1, so the list settles.
- Ties in `order` (from a restore or import) are broken by id so the list never jumps.
- Photos: the copy names the entry's photos, so they survive deleting the entry
  (`photoRepo.references` counts saved meals); removing a saved meal returns its photo ids and the
  photo repository deletes only those nothing else uses.

Our design differences / decisions:
- Names are ours: saved meals, `toggleFromEntry`, `originEntryId`.
- Identity is the saved meal's own id; "this entry is saved" means a copy made from that entry id
  (D-16.17), instead of the reference's name + kcal key.
- Only readable copies count for toggle and `isSaved`, so the heart and the toggle always agree.
- New copies go after the largest stored position; moves renumber the readable list densely;
  removes leave gaps (the order is kept, the gaps close on the next move).
- No legacy set-of-keys migration (nothing to migrate in a new app).

Tests we will write:
- toggle twice returns to empty; the second toggle returns the copy's photo ids.
- two entries with the same name and kcal are saved separately (ACC-D17-1); toggling one off keeps
  the other.
- `move(0, 9)` in a list of 3 lands last; a negative target lands first; an out-of-range `from`
  does nothing; the new order survives a reopen.
- editing the original entry through the diary repository keeps the snapshot; deleting it keeps
  the saved meal and its photo.
- `isSaved` follows toggles; `remove` deletes one meal and returns its photos.
- an unreadable saved row is kept aside, skipped by list/isSaved, and untouched by toggle and move.
- `list` follows a toggle through a live query.

Compare checklist (filled after the rewrite; reopened `A/data/PreferencesStore.kt`
(`favoriteFoodEntries` parts and the guarded list update behind them), spec 02 §3.16):
- [x] Saved meals are copies that outlive the original and ignore its later edits
  (`src/data/repos/savedMealsRepo.test.ts > toggleFromEntry > keeps the snapshot when the original
  entry is edited, then deleted (D-16.17)`).
- [x] Toggle removes the copy when there is one, else appends a copy at the end; toggling twice
  leaves nothing (`savedMealsRepo.test.ts > toggleFromEntry > returns to empty when toggled twice,
  handing back the photos of the copy`, `> appends a new copy after the highest stored position`).
- [x] Same name and kcal no longer collide (`savedMealsRepo.test.ts > toggleFromEntry > saves two
  different foods with the same name and calories separately (ACC-D17-1, D-16.17)`).
- [x] The person's order survives restarts; move = remove at `from`, insert at `to` clamped to the
  list (`savedMealsRepo.test.ts > move > puts the meal last when moved from 0 to 9 in a list of 3`,
  `> puts the meal first for a negative target, and changes nothing for a position outside the
  list`, `> closes the gaps a remove leaves, and keeps the new order after a reopen`).
- [x] Each change reads, changes and writes in one transaction, and unreadable data is never
  replaced by a list rebuilt without it (`savedMealsRepo.test.ts > unreadable saved rows > skips
  an unreadable row, keeps it aside, and never touches it on toggle or move (R06.1)`, `> keeps an
  unreadable row aside before remove deletes it`).
- [x] Saved meals are photo owners: a photo outlives the entry and is released only when the saved
  meal goes too (`savedMealsRepo.test.ts > toggleFromEntry > keeps the photos a saved meal names
  after its entry is deleted, and releases them once it goes (R02.8)`).
- [x] Changes reach readers at once (`savedMealsRepo.test.ts > list > follows a toggle through a
  live query (R06.3)`).
- Deliberate differences: identity by the copy's own id and the origin entry id (D-16.17) instead
  of name + kcal; one row per saved meal instead of one stored list, so an unreadable meal stays in
  its row (kept aside in quarantine) and the rest of the list is untouched; the toggle returns the
  photo ids to release instead of running a full prune.
- Not taken: the legacy set-of-keys migration and the unused "last list" setting (nothing to
  migrate in a new app); search, the reuse lists and reorder hiding while searching (P06-12).

## Decisions for the lead

- `toggleFromEntry` and `isSaved` look only at readable copies, so the heart and the toggle agree;
  an unreadable copy of the same entry stays where it is (kept aside) and a readable copy is added
  next to it.
- Positions: a new copy goes after the highest stored `order`; `remove` leaves gaps; `move`
  renumbers the readable list 0…n−1. Equal positions (from a restore) are listed by id.
- `move` takes list positions as the decision says. If another tab changes the list between the
  render and the tap, the positions may name a different meal; an id-based move would be safer
  for P06-12 and is easy to add.
- `isSaved` answers for one entry; Home rows can instead derive a set of `originEntryId`s from
  `list()` (P02-15 `useSavedMeals`) to avoid one query per row.

## Status

Done (2026-10-26). Saved meals repository and tests in place; nothing outside the task's files
changed. `savedMealsRepo.test.ts` 14, all passing.
