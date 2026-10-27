# Task: reuse lists: recent, often eaten, saved (P06-12) · Phase: 06 · Owner: builder (wt-p06s4b, slice S4b)

<!-- Save as platewise/docs/notes/P<nn>/<slug>.md. Write everything above "Compare checklist"
BEFORE writing code, in your own words. Never paste or paraphrase the reference line by line. -->

Read (reference @ `10e14b67`): `A/ui/home/SavedMealsSheet.kt` (all: the three destinations, the
search, the empty states, the row, the swipe-to-remove row, the up/down buttons, the thumbnail),
`I/Views/RecentsView.swift` (all: the same lists, the accent-folding search, the edit button hidden
while searching, the tap that prepares a copy for review). For the list rules only:
`A/data/FoodRepository.kt` `recent` / `frequent` and `I/Stores/FoodStore.swift` `recentEntries` /
`frequentGroups` (cut-off with no upper bound, template = latest row, sort by count then name).
No reference tests cover these lists. Research spec `02-food-logging.md` §3.16, §3.4 (review is
the only way in), trap R02.7; decisions D-16.17 (saved meals have their own ids), D-16.16 (the
review's meal). Acceptance ACC-D16-1, ACC-D16-2, ACC-D17-2. Naming `17-naming-and-glossary.md`
(Recent / Often eaten / Saved, `ReuseSheet`).

What it does (own words): three of the add menu's Reuse methods open one sheet each, titled with
the list's name. Recent lists every entry logged in the last 30 days (now − 30 × 24 h, no upper
bound), newest first, each entry on its own row even when the same food was logged twice. Often
eaten looks back 90 days and puts entries of the same food together: same name once trimmed,
lower-cased and stripped of accents, and the same kcal; each group shows its latest entry with
"N× eaten", most-eaten first, then by name. Saved lists the saved meals (snapshots with their own
ids, D-16.17) in the person's order. Each sheet has a search field: the trimmed query matches any
part of the name, ignoring case and accents ("cafe" finds "Café latte"). Rows show a 56 px
thumbnail (the first photo, else the emoji, else an icon), the name with a heart when the food is
saved, the energy in the person's unit, "N× eaten" on Often eaten, P/C/F, and a log button.
Tapping a row never logs at once: the food becomes a draft again (a known weight opens in grams
with its units; an unknown weight opens as servings), its photos are reused (shared, not copied),
its source is kept, and it goes to the review through the analysis service's `reviewReady` state,
where the date is the viewed day and the meal follows the review's rule (D-16.16). Saved rows can
be removed (a visible button, and a swipe toward the leading edge) and moved with up/down
buttons; those buttons are hidden while a search is active, because positions in a filtered list
are not positions in the stored list (R02.7).

Inputs → outputs:
- `src/domain/food/reuse.ts`: `windowStart(now, days)` → first instant inside the window;
  `recentEntries(entries, now)` → entries of the last 30 days, newest first; `oftenEaten(entries,
  now)` → `OftenGroup {key, template, count}[]`; `foldName(name)` → the comparison form;
  `matchesQuery(name, query)`; `searchFoods(items, query, nameOf)`; `reuseDraft(food)` → the
  `NutritionDraft` part of an entry or saved meal, ready for review.
- `src/features/log/reuse/ReuseSheet.tsx`: props `list` (`recent` | `often` | `saved`), `open`,
  `onClose` → the sheet; a pick → `analysis.openForReview(reuseDraft(food), {photoIds, source})`
  after the sheet closes; Saved actions → the new `savedMeals` service (`remove`, `move`).
- `src/features/log/reuse/ReuseRow.tsx`: one row (the food, saved heart, count, energy unit,
  `onPick`, optional saved controls).
- `src/services/analysis.ts` (additive): `openForReview(draft, {photoIds, source})` begins a new
  draft generation (what `start` does to an older draft or a running analysis), stores the draft
  and shows `reviewReady`; resolves `true` when the review opened, `false` when something newer
  took over; rejects when the draft cannot be stored.
- `src/services/savedMeals.ts` (new): `remove(id)` deletes and lets go of photos nothing else
  uses; `move(from, to)`.
- Home: the `recent`, `often`, `saved` cases of `choose` open their sheets (`RECENT_SHEET`,
  `OFTEN_SHEET`, `SAVED_SHEET` on the router stack).

Files: created `src/domain/food/reuse.ts` (+ test), `src/features/log/reuse/{ReuseSheet,ReuseRow}.tsx`
(+ `ReuseSheet.test.tsx`, `reuse.module.css`), `src/services/savedMeals.ts` (+ test),
`src/i18n/en/reuse.ts`, this note. Changed: `src/services/analysis.ts` (+ test, additive),
`src/features/log/AddMenu.tsx` (the list of methods not built yet) and its test,
`src/features/home/HomePage.tsx` (+ test). Shared, additive: the `reuse` line in
`src/i18n/en.ts`, `savedMeals` (and `copyDay`, P06-13) in `Services` and `src/main.tsx`.

Edge cases / failure modes:
- An entry exactly 30 × 24 h old is still recent; one millisecond older is not. An entry from 31
  days ago is not recent (but is in Often eaten).
- "Café latte" and "cafe latte " with 120 kcal are one group; the same name with 121 kcal is
  another. The template is the group's latest entry (ties keep the one read first).
- Same count → name order on the folded names, then kcal, so the order never depends on reads.
- Search: blank or spaces-only query → the whole list; "CAFÉ" finds "cafe"; no match → its own
  empty state naming the query.
- Two saved meals with the same name and kcal are two rows, removed and moved separately (they
  have their own ids, D-16.17).
- Reorder buttons: hidden while searching; the first row's Up and the last row's Down are
  disabled. The list follows the database (live read), so a move shows once written.
- A food whose photos are gone shows its emoji (then an icon) instead of an empty frame.
- Unknown weight: the draft keeps its servings basis (R02.1); a logged portion of a split dish
  keeps its "serving" unit, so the review will not offer the split again (R02.6, P06-09).
- `openForReview` while an analysis runs or a failure shows: that attempt ends as if overtaken
  (same as `start`); while another review waits: its draft is dropped. Photos of the dropped draft
  are released only when nothing names them, so the original entry's photos stay.
- No analysis service (test stand-ins) or a failed write: the sheet has closed; a toast says the
  food could not be opened.
- Remove or move fails → a toast; the list keeps what the database holds.

Our design differences / decisions:
- Names are ours: `ReuseSheet`, `ReuseRow`, `recentEntries`, `oftenEaten`, `OftenGroup`,
  `foldName`, `reuseDraft`, "Often eaten" for Frequent, "Saved" for Favorites.
- Grouping folds accents and trims (the reference lower-cases only) and keys on our whole kcal;
  Saved is our own list with ids (D-16.17), never a name + kcal key (R02.7).
- Search folds accents on every list (one reference platform did not).
- Saved rows: a visible remove button as well as the swipe (our `SwipeRow`, whose threshold and
  travel are the diary's, not the reference's 120 dp / 55 %); up/down buttons as on one reference
  platform, never drag. No swipe on Recent / Often eaten (saving happens from the editor and Home,
  P06-11 / area 05).
- Recent and Often eaten read the days of the window up to today through `useEntriesBetween`
  (screens have no "since" read); entries stamped on a later day than today are left out.
- The review gets the draft through `analysis.openForReview`, so a reload reopens it like any
  analysis draft (D-16.46); `openForReview` is optional on `AnalysisService` until every stand-in
  carries it.
- Removing a saved meal needs a service: a new `savedMeals` service (P06-11's toggle can join it).

Tests we will write:
- `reuse.test.ts`: 31 days ago not recent, exactly 30 × 24 h recent, newest first, duplicates
  kept; "Café latte" / "cafe latte " at 120 kcal group (count 2, latest as template), 121 kcal
  apart; 91 days ago left out; sort by count then name; search "cafe" finds "Café", trimmed query,
  blank query; `reuseDraft` keeps grams and units, keeps servings, drops diary fields.
- `analysis.test.ts`: `openForReview` stores the draft with photos and source and shows
  `reviewReady` without the overlay; a reload restores it; it drops a waiting draft (releasing
  unused photos, keeping an entry's); it ends a running analysis; Cancel of the review keeps the
  entry's photos.
- `savedMeals.test.ts`: remove releases unused photos and keeps shared ones; move.
- `ReuseSheet.test.tsx`: each list's title, rows and empty state; search; tap opens review with
  the entry's grams (ACC-D16-2); "cafe" finds "Café latte" (ACC-D16-1); reorder hidden while
  searching (ACC-D17-2); two same-name-and-kcal saved meals separate (R02.7); remove by button and
  by swipe; up/down; heart on saved foods; thumbnail.
- `HomePage.test.tsx`: Recent / Often eaten / Saved open their sheets from the Reuse group.

Compare checklist (filled after the rewrite; reopened `A/ui/home/SavedMealsSheet.kt`,
`I/Views/RecentsView.swift`, `A/data/FoodRepository.kt` `recent`/`frequent`,
`I/Stores/FoodStore.swift` `recentEntries`/`frequentGroups`):
- [x] Recent: 30 × 24 h back, cut-off included, no upper bound, newest first, one row per entry
  (`src/domain/food/reuse.test.ts > recentEntries > leaves out an entry from 31 days ago, and keeps
  one from exactly 30 × 24 h ago`, `> lists newest first and keeps every entry of the same food`,
  `> keeps entries after now, which the window has no end for`;
  `src/features/log/reuse/ReuseSheet.test.tsx > ReuseSheet: Recent > lists every entry of the last
  30 days newest first, leaving out one from 31 days ago`)
- [x] Often eaten: 90 days, grouped by name + kcal (ours folds accents and trims), latest entry as
  template, count, sorted by count then name (`reuse.test.ts > oftenEaten (R02.7) > puts "Café
  latte" and "cafe latte " with 120 kcal together, the latest as template`, `> keeps the same name
  with other kcal apart`, `> looks back 90 × 24 h and no further`, `> sorts by count, most first,
  then by name ignoring case and accents`; `ReuseSheet.test.tsx > ReuseSheet: Often eaten > puts
  "Café latte" and "cafe latte " with 120 kcal together under the latest, with its count (R02.7)`)
- [x] Search: trimmed query, substring, case- and accent-insensitive, on every list
  (`reuse.test.ts > search > finds "Café" for "cafe", and "cafe" for "CAFÉ" (ACC-D16-1)`, `> trims
  the query, and a blank query matches everything`; `ReuseSheet.test.tsx > ReuseSheet: search >
  finds "Café latte" for "cafe", ignoring case, accents and the spaces around (ACC-D16-1)`)
- [x] Empty states: no logs (per window), no saved meals with a hint, no match
  (`ReuseSheet: Recent > says so when nothing was logged in the last 30 days`, `ReuseSheet: Often
  eaten > says so when nothing was logged in the last 90 days`, `ReuseSheet: Saved > says how to
  save one when there are none`, `ReuseSheet: search > says nothing matches, naming the query`)
- [x] Row: 56 px thumbnail (photo, emoji, else an icon), name with a heart when saved, energy,
  count on Often eaten, P/C/F tags, a log mark (`ReuseSheet: Recent > shows the photo as a
  thumbnail, else the emoji, and a heart on a saved food`; `ReuseSheet: Saved > lists the saved
  meals in their order, each with a heart`)
- [x] Tap → review, never an instant log: the sheet closes; known weight keeps grams, units and
  the chosen amount; unknown weight stays servings; photos reused; source kept
  (`ReuseSheet: Recent > opens the review with the entry's grams, units, photos and source, and logs
  nothing (ACC-D16-2)`, `> opens an entry of unknown weight as servings (R02.1)`; `ReuseSheet: Saved
  > opens a saved meal in the review with its own photos and source`; `reuse.test.ts > reuseDraft >
  keeps a known weight's grams and units, and drops the diary's own fields`, `> keeps an unknown
  weight as servings, never inventing grams (R02.1)`)
- [x] The review state: `openForReview` stores the draft, shows `reviewReady` without the overlay
  or a request, reopens after a reload, takes over from a running analysis, a failure or a waiting
  draft, yields to a newer start, never shows over one that began right after its write, and keeps
  shared photos on Cancel (`src/services/analysis.test.ts > openForReview: a reuse pick goes to the
  review (P06-12) > stores the draft with the photos and source it is given, and shows it with no
  overlay or request`, `> opens again after a reload (D-16.46)`, `> keeps the entry's photos when
  the review is cancelled: they are shared, not copied`, `> drops a draft waiting for review,
  letting go of the photos only it named`, `> stops an analysis that is running, whose late result
  never shows`, `> closes a failure on screen and opens the pick`, `> yields to an analysis started
  while it writes`, `> never shows the pick over an analysis started just after its draft was
  written`, `> rejects when the draft cannot be stored, leaving no review`)
- [x] Saved: own ids, so two same-name-and-kcal meals stay apart and are removed separately; remove
  by a visible button and by a swipe; up/down with the ends disabled; moves hidden while searching
  (`ReuseSheet: Saved > keeps two saved meals with the same name and kcal apart, and removes only
  the one asked (R02.7, D-16.17)`, `> removes a saved meal with a swipe toward the leading edge`, `>
  moves a meal up and down; the first cannot go up, the last cannot go down`, `> hides the reorder
  buttons while searching, and keeps remove (ACC-D17-2)`; `src/services/savedMeals.test.ts >
  createSavedMealsService > removes a saved meal and lets go of a photo nothing else names`, `>
  moves a meal by its place in the whole list`)
- [x] Menu: Recent, Often eaten and Saved open their sheets from the Reuse group
  (`src/features/home/HomePage.test.tsx > HomePage: the add menu opens its sheets (P06-01) > opens
  %s from the Reuse group (P06-12, P06-13)`; `src/features/log/AddMenu.test.tsx > AddMenu > leaves
  off the methods whose sheets are not built yet, and a group they leave empty`)
- Mutation check: no accent folding fails 7 tests; moves shown while searching fails 1 (ACC-D17-2);
  a pick that keeps the sheet open fails 2; `openForReview` without its "newer start" check fails 1.
- Deliberate differences: grouping and search fold accents and trim on both lists; saved meals are
  records with ids (D-16.17), never a name + kcal key; a visible remove button besides the swipe,
  and our diary swipe's threshold (not 120 dp / 55 %); up/down buttons instead of drag; remove stays
  available while searching (one reference platform hides the swipe then); the windows read the
  diary days up to today (no "since" read for screens), so an entry stamped on a later day is left
  out; whole grams on the P/C/F tags (as Home's rows); the thumbnail falls back to the icon of how
  the food was logged (we have no fork-and-knife icon); the search field is a native search input
  (its own clear button where the browser draws one); words are ours.
- Not taken: swipe to save or unsave on Recent / Often eaten (one platform only; saving comes with
  the editor and Home, P06-11 / area 05); the legacy favourites migration and the "last list"
  setting (none of our data is in those formats); drag handles; the sheet's fixed 420 px height.

## Decisions for the lead

- `AnalysisService.openForReview?(draft, {photoIds, source})` (`ReviewOrigin`) is optional on the
  interface until every stand-in carries it (`src/app/App.test.tsx` and
  `src/features/log/DescribeSheet.test.tsx` build literal stand-ins); `createAnalysisService`
  always has it. It resolves true/false and rejects on a storage failure. `startRequest` now uses
  the same small `overtake` helper (behaviour unchanged).
- The review (P06-06) gets no date with the draft: as for analysis drafts, it must stamp the
  viewed day (`appState.selectedDay`, null = today) at the current time and pick the meal by
  D-16.16. `createdAt` is the pick time.
- New service `src/services/savedMeals.ts` (`remove`, `move`), optional `Services.savedMeals`, built
  in `main.tsx` over its own `createSavedMealsRepo(db)` (additive lines only). P06-11's Saved
  toggle can join it.
- Sheet ids on the router stack: `recent`, `often`, `saved` (exported from `HomePage.tsx` as
  `RECENT_SHEET`, `OFTEN_SHEET`, `SAVED_SHEET`).
- `METHODS_NOT_BUILT_YET` is now `['barcode']`; the barcode builder empties it. Merge note: the
  AddMenu test "leaves off the methods whose sheets are not built yet…" then needs its expectation
  changed to the empty list (or the test dropped), and HomePage's first menu test now lists three
  groups.
- Data-ui: sheets `reuse.recent|often|saved`, search `reuse.search`, list `reuse.list`, empty
  `reuse.empty`, rows `reuse.row` (tap `reuse.row.pick`), saved controls `reuse.row.up`,
  `reuse.row.down`, `reuse.row.remove`, the swipe wrapper `reuse.saved` (its keyboard button
  `reuse.saved.delete`).
- Follow-up (not mine): `SwipeRow` always adds its own focus-revealed delete button, so a saved row
  has two "Remove …" buttons (the visible one and the swipe's keyboard one). A `SwipeRow` prop to
  leave its button out when the row shows its own would tidy this.
- Ledger lines for the lead: R02.7 → the four R02.7 / ACC-D17-2 tests above; ACC-D16-1, ACC-D16-2,
  ACC-D17-2 as named in the checklist.

## Status

Done (2026-10-27). Created `src/domain/food/reuse.ts` (+ 13 tests),
`src/features/log/reuse/{ReuseSheet,ReuseRow}.tsx`, `reuse.module.css`, `ReuseSheet.test.tsx` (17
tests), `src/services/savedMeals.ts` (+ 3 tests), `src/i18n/en/reuse.ts`, this note. Changed
`src/services/analysis.ts` (`openForReview`, + 9 tests), `src/features/log/AddMenu.tsx` (+ its test,
1 updated), `src/features/home/HomePage.tsx` (+ its test: 1 updated, 4 added through one
`it.each`, shared with P06-13). Shared, additive: the `reuse` line in `src/i18n/en.ts`,
`savedMeals` in `Services` (`src/services/context.tsx`) and `src/main.tsx`.
