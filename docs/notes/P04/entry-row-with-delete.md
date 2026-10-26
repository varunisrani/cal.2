# Task: Entry row with delete (P04-12) · Phase: 04 · Owner: builder (wt-p04s5, slice S5)

Read (reference @ `10e14b67`): `A/ui/home/HomeScreen.kt` lines 2204–2470 (the swipeable rows:
which way the delete swipe goes, its threshold and cap, that releasing asks rather than deletes,
the strip behind the row) and the food row next to it (what a row shows: picture or emoji or a
fallback icon, name, time, energy, macros). Research spec `05-home-progress.md` §3.3.4 (row
gestures, every delete confirmed), §3.3.3 (row cards); `02-food-logging.md` §3.1 (what an entry
holds). Decision D-16.75 (our swipe threshold, already in `SwipeRow`).

What it does (own words): one diary row for one food entry: a square tile with the entry's emoji
(or, without one, a small icon for how it was logged), its name, the time it was logged, its energy
in the person's unit and its protein, carbs and fat in whole grams. The row sits in a `SwipeRow`:
dragging it toward the leading edge past the threshold, or using its delete button from the
keyboard, asks "Delete this entry?" in a dialog; Delete removes it through the diary service,
Cancel (or Escape, or the scrim) keeps it. The row is announced by its name and energy. Tapping
does nothing yet (the editor arrives in P06).

Inputs → outputs: `entry`, `energyUnit` → the row; `useServices().diary.deleteEntry(id)` on
confirm.

Files: created `src/features/home/EntryRow.tsx`, `EntryRow.test.tsx` (styles in
`home.module.css`; words in `src/i18n/en/home.ts`).

Edge cases / failure modes:
- A short drag springs back and asks nothing (SwipeRow).
- Delete fails (storage) → the dialog closes, the row stays, a short message says so.
- The entry disappears while the dialog is open (deleted in another tab) → the row and its dialog
  go with it.
- Long names wrap to two lines; the time and energy never wrap under the name.
- Entries with photos: there is no photo read hook yet, so the tile shows the emoji or the icon
  (follow-up for P06-02/03).

Our design differences / decisions:
- Our layout: a 44 px tile on the accent's soft tint, name and time on the first line, energy in
  the accent and the macro line muted on the second; rows share one rounded card per meal with
  hairlines between them.
- The fallback tile icon follows the entry's source (camera, label, barcode, text, pencil) instead
  of a single food glyph: our icon set has no food icon.
- The dialog's words are ours ("Delete this entry?", "<name> will be removed from your diary.").

Tests we will write (`EntryRow.test.tsx`):
- the row is a group named by name and energy ("Toast 250 kcal"); kJ reads "1,046 kJ".
- shows emoji when present, the source icon otherwise; time and P/C/F in whole grams.
- swipe past the threshold opens the dialog; Cancel keeps the row and deletes nothing.
- Delete calls `deleteEntry` once with the entry's id.
- the keyboard delete button opens the same dialog.
- a failed delete shows the message and keeps the row.

Compare checklist (filled after the rewrite; reopened `HomeScreen.kt` 2204–2470 and the food row
after it):
- [x] A swipe toward the leading edge past the threshold asks; a short release springs back and
      asks nothing (`EntryRow.test.tsx > EntryRow > asks before deleting when swiped past the
      threshold; Cancel keeps the row`, `> asks nothing after a short swipe`); threshold, cap and
      strip are SwipeRow's (D-16.75)
- [x] Every delete is confirmed; Delete calls the service once with the entry's id; Cancel keeps
      the row (`> deletes the entry once when Delete is confirmed`, `> asks before deleting when
      swiped past the threshold; Cancel keeps the row`); the keyboard path asks the same (`> opens
      the same question from the keyboard delete button`); a failure keeps the row (`> keeps the row
      and says so when the delete fails`); end to end on a database (`HomePage.test.tsx > HomePage >
      deletes an entry once confirmed and shows the empty card again`) and by hand in Chromium
- [x] Row content: emoji or fallback icon, name, time, energy in the display unit, whole-gram
      macros, announced by name and energy (`> is announced by its name and its energy in the
      chosen unit`, `> shows the time and the macros in whole grams`, `> shows the emoji when there
      is one, else an icon for how the entry was logged`)
- Deliberate differences: our own row and dialog; the fallback icon follows the source; the time
  in the locale's own short format.
- Not taken (later tasks): photo thumbnails and the photo viewer (P06-02/03, need a photo read
  hook), the serving line, the favourite swipe and heart (P06-12), tap to edit (P06-11),
  long-press selection and combine (P06-19).

## Status

Done (2026-10-26). The row and its tests are in (styles in `home.module.css`, words in the `home`
partition).
