# Task: ingredients card and recipe split (P06-09) · Phase: 06 · Owner: builder (wt-p06s2b, slice S2b; barcode and reuse sources wt-p06s2c)

<!-- Save as platewise/docs/notes/P<nn>/<slug>.md. Write everything above "Compare checklist"
BEFORE writing code, in your own words. Never paste or paraphrase the reference line by line. -->

Read (reference @ `10e14b67`): `A/ui/home/MealIngredientsUi.kt` (all: the parts card, the
servings stepper row, the add row, the part editor dialog and its weight baseline),
`A/ui/home/IngredientIntakeHost.kt` (all: the add menu, which sources it opens, the busy row, the
error dialog, the typed-description dialog), `A/ui/home/IngredientIntakeViewModel.kt` (all: one
request at a time, the photo written only after a result, discard on close),
`T/services/BarcodeProductLookupTest.kt` (the ingredient path: a refused FoodData Central key keeps
its own message, other outcomes pass through). Also looked up how the review sheet applies a part
change with a split active (`A/ui/home/FoodResultSheet.kt`, the part-change and split handlers) to
match the domain's `keepSplit`. Research spec `02-food-logging.md` §3.15, §3.5 (header from the
parts), §6 R02.4–R02.6, R02.9; decisions D-16.73. Ledger rows naming P06-09: ACC-D13-1, ACC-D14-2
(the split control); line rules R02.4, R02.5, R02.6.

Second slice (barcode and reuse sources, wt-p06s2c): reread `A/ui/home/IngredientIntakeHost.kt`
(the barcode sheet, the saved-meals sheet and what a pick hands back), `A/services/
BarcodeProductLookup.kt` (the ingredient variant: only a refused key gets its own message),
`T/services/BarcodeProductLookupTest.kt` (`voiceAndIngredientScansGetTheSavedLabel`, the two
add-ingredient cases), `A/models/CombinedMeal.kt` (an entry and an analysis as one part: weight,
photos, emoji). Ours: `src/services/barcode/lookup.ts` (`lookupBarcode`, the order R02.15),
`src/features/log/scan/ScanSheet.tsx`, `src/features/log/reuse/ReuseSheet.tsx`; research spec §3.15
(add menu), §3.16 (reuse lists), §6 R02.15.

What it does (own words): under the nutrition rows of the review, a card lists the meal's parts:
each with its photo thumbnail or emoji (a plate when neither), its name, its weight and energy
("150 g · 168 kcal") and its protein, carbs and fat. A tap opens the part editor: name, weight,
energy in the person's unit, protein, carbs and fat. Save is on only while the values pass the
domain's line check (a name, a weight above 0, every value a number of at least 0, energy below
2³¹ − 1). Changing the weight rescales energy and macros from an unrounded baseline, so 1, 15, 150
never drift; typing a value makes the numbers on screen the new baseline. An existing part can be
removed. Under the list, "Add ingredient" opens a menu: camera, a single photo, barcode, describe
(typed text), manual (an empty editor), and the Recent, Often eaten and Saved lists. A photo or a
description is analysed by the AI as one part (its own parts are not expanded), the photo staying
as the part's photo; while that runs the card shows a busy row and the menu is off; a failure
shows its message. Barcode opens the scanner over the review; the code it hands back is looked up
in the same order as a scan from Home (R02.15: Open Food Facts, then the saved label, then
FoodData Central), with a busy row meanwhile; the product found becomes one part (with Open Food
Facts' photo of it when there is one), a saved label one part with the label's values. A lookup
that finds nothing says why with the scanner's words, except a refused FoodData Central key, which
has its own message here (no "Scan label" in this flow). The three lists open as on Home, but a
tap hands the food back instead of opening its review: it becomes one part (its own parts not
expanded, its photos carried). If the review goes away during an analysis or a lookup, the request
stops and any photo it stored is let go. Every change of the parts goes through the domain (`applyLineChange`):
the header becomes the parts' sums and the meal-level nutrients stretch by weight (R02.4), which
also replaces header values typed through the unlock (R02.5). With at least two parts, a known
weight, and a draft that is not already one portion of a split dish (R02.6), a "Servings in
recipe" stepper (1–50) divides the dish: a "serving" unit of dish ÷ N goes first in the unit list
and the amount shows 1 serving. A part change while split keeps N and the unit and shows the
edited portion (`keepSplit`).

Inputs → outputs:
- `IngredientsCard` takes the review's `IngredientsSlot` (working copy, opened draft, scale, parts
  as shown, `onLinesChange`, `onWorkingChange`) and the energy unit → calls `onLinesChange(next
  parts as shown)` for add, edit and remove, `onWorkingChange(split copy)` for the stepper.
- `LineEditor` takes the part (or none for a new one) and the energy unit → `onSave(line)`,
  `onRemove()`, `onClose()`.
- `AddIngredientMenu` takes whether the AI sources (`canAnalyse`) and barcode (`canScan`) can be
  offered → `onPhoto(file)`, `onDescribe(text)`, `onManual()`, `onCode(code)` (after the scanner
  closed), `onPick(food)` (after the reuse list closed); camera and single photo open file inputs
  and hand back the file; the describe sheet, the scanner and the three reuse lists are its own
  sheets on the router's stack, above the review.
- `src/services/ingredientIntake.ts`: `open()` gives one sheet's `IntakeSession` with
  `photo(file)`, `describe(text)` and `barcode(code)` → `{line} | {failed, messages} | {refused,
  reason} | {missed, failure} | {busy} | {stopped}`, and `close()`; it reads the AI setup per
  request (`createAiAccess`) and sends with the injected `fetch` under its own deadline (the
  timeout setting, stopped by `close`). `barcode` calls `lookupBarcode` with the session's signal
  and the deps Home's lookups use (`lookup`: the FoodData Central key, the diary's saved labels,
  the word for an unnamed product); an Open Food Facts product's photo is downloaded and stored
  like a part's photo (let go on close when nothing names it).
- `ReuseSheet` gains `onPick?(food)`: when given, a tap closes the list and hands the food there
  instead of opening its review.
- `ReviewSheet.tsx`: `ReviewWorking` gains `servings` (the split's N, absent = 1); `withLines`
  keeps a split through `keepSplit`, ends it on an ordinary change, and keeps the nutrients as
  shown when the parts had no weight before; `AnalysisReview` fills the `ingredients` slot.

Files: created `src/features/log/review/{IngredientsCard,LineEditor,AddIngredientMenu}.tsx`
(+ `IngredientsCard.test.tsx`, `LineEditor.test.tsx`), `src/features/log/review/
ingredients.module.css`, `src/i18n/en/ingredients.ts`, `src/services/ingredientIntake.ts`
(+ test), this note. Shared, additive: `src/features/log/review/ReviewSheet.tsx` (`servings`,
`withLines`, the slot in `AnalysisReview`), `src/services/context.tsx` (`ingredientIntake?`),
`src/main.tsx` (builds it), `src/i18n/en.ts` (the partition line). Second slice: changed
`AddIngredientMenu.tsx`, `IngredientsCard.tsx` (+ test), `ingredientIntake.ts` (+ test),
`src/i18n/en/ingredients.ts`; shared, additive: `src/features/log/reuse/ReuseSheet.tsx`
(`onPick`), `src/main.tsx` (the intake's `lookup` deps).

Edge cases / failure modes:
- A part of unknown weight (0 g) shows its energy without "0 g"; its editor needs a weight before
  Save, and a weight typed onto it becomes the baseline with the values as they are.
- All parts of unknown weight after a change: the basis stays (D-16.73) and the sums describe the
  amount on screen; with a split active the change is applied to the whole dish so the split and
  its unit stay.
- Parts without a weight before and with one after: no stretch ratio, so the nutrients keep the
  values on screen instead of jumping by the old scale.
- The first part added to a meal with no parts: the meal as it stands joins as the first part, so
  the total rises by the new part instead of being replaced by it (decision below).
- Removing parts down to one, or to none: the stepper hides; with none the header is 0 and the
  nutrients are 0 (no weight left).
- Split stepper at 1 and 50: the matching button is off; typed values are clamped by the domain.
- A draft that opened with a "serving" unit (a re-logged portion): no stepper (R02.6).
- Two adds at once: the menu is off while one runs; the session refuses a second (`busy`).
- AI failures show the failure's messages with a dismiss; Cancel of the review during an analysis
  aborts the request, and a photo stored for a part that is not kept is released (nothing named it).
- Photos of parts added and then removed, or of a review that is cancelled: released when the
  sheet goes; a logged entry that names one keeps it (`releaseIfUnused`).
- A picked file that is empty or over 25 MiB: refused with a message before any request; a file
  the browser cannot decode: the AI preparation fails with its message, nothing stored.
- No intake service (tests, a shell without one): manual and the three reuse lists are offered;
  barcode also needs the scanner (the barcode service), so it is off without either.
- A barcode lookup that finds nothing: the scanner's message for that kind (`scan.failure.<kind>`)
  with Dismiss; a refused FoodData Central key: our own message (it points to the key in settings,
  not to a label scan). The person's Cancel cannot happen here (the scanner closed before the
  lookup); a review that goes during the lookup aborts it and shows nothing.
- A product Open Food Facts has a photo of: downloaded under the lookup's signal and stored only
  after the lookup found it; a photo that cannot be had (CORS, too large, not an image) leaves the
  part without one. Closing the review after the photo was stored lets it go.
- A saved label found for the code: one part with the label entry's values, no photo (the label's
  photos show a label, not the food; the reference adds none either).
- A reuse pick whose food has no own photo but parts with photos: the parts' photos are carried, in
  order, without repeats (as a combined meal gathers them). Those photos stay named by the entry or
  saved meal they came from, so the session never lets them go.
- A reuse pick on a meal without parts: the meal first becomes a part, as for every first add.

Our design differences / decisions:
- Names, words and layout are ours (`IngredientsCard`, `LineEditor`, `AddIngredientMenu`,
  `IntakeSession`); the editor is a sheet with Cancel and Save in its title row and Remove at the
  bottom (the reference uses a dialog).
- First part on a meal without parts: the meal itself becomes a part first (the reference
  replaces the meal's totals with the new part's). Proposed for the lead below.
- The photo is stored after the AI answered (as the reference does), so a failed or stopped
  analysis never writes a photo; the session lets go, when the sheet goes, of every photo it
  stored that nothing names.
- Errors show inline in the card with a dismiss button instead of a dialog.
- A part of unknown weight shows no "0 g".
- Not-built sources are one list in `AddIngredientMenu` (`SOURCES_NOT_BUILT_YET`), empty since the
  second slice; voice is a later phase and is not a source yet.
- Barcode results keep Open Food Facts' photo as the part's photo (the reference adds no photo for
  a scanned ingredient); the lookup runs inside the intake session, so one request at a time and
  close-to-stop hold for it too. Its busy row says it is looking the code up.
- The reuse lists are the same sheets as on Home in a pick mode (`onPick`), so search, remove and
  move work there too.

Tests we will write:
- `IngredientsCard.test.tsx` (the real review sheet with the real card, a stand-in intake): parts
  listed with thumbnail/emoji, "N g · kcal" and P/C/F; adding a manual 100 kcal part raises the
  header by 100 (ACC-D13-1, R02.4); removing a part stretches sodium by the weight left (R02.4,
  ACC-D13-2 through the UI); a part edit replaces kcal typed through the unlock (R02.5); split into
  4 puts a serving unit first and shows 1 serving (ACC-D14-1 through the UI); a part edit while
  split keeps 4 and the serving unit (R02.6); no stepper for a re-logged portion (ACC-D14-2,
  R02.6) or with fewer than two parts; a described part arrives as one line, busy meanwhile; a
  photo part keeps its photo; a failure shows its message; closing the sheet during an analysis
  stops it; the first part on a meal without parts keeps the meal; the not-built list; copy passes
  the catalogue lint.
- Second slice, `IngredientsCard.test.tsx`: every source offered with an intake and a scanner, the
  not-built list empty; manual and the reuse lists without an intake; a typed code goes to the
  session's `barcode`, busy meanwhile, the part arrives; a refused key shows its own message, other
  misses `scan.failure.<kind>`; a saved meal picked from Saved becomes one part (its parts not
  expanded, its photos carried) and the list closes without opening a review; a Recent pick the
  same; closing the review during a lookup closes the session.
- Second slice, `ingredientIntake.test.ts`: an Open Food Facts product becomes one part with its
  photo stored; a saved label wins over FoodData Central and gives a part without a photo (R02.15);
  FoodData Central fills in after an Open Food Facts miss; a refused key is `missed keyRefused`; an
  Open Food Facts outage ends there without FoodData Central (R02.15); closing during a lookup
  aborts it, stores nothing and is `stopped`; closing lets go of a stored product photo nothing
  names.
- `LineEditor.test.tsx`: Save off for a blank name, 0 g, a negative or unreadable value; weight
  150 from 100 rescales 1.5× and back without drift; an edited value becomes the baseline; energy
  in kJ saves whole kcal, and an untouched kJ field keeps the kcal; Remove only for an existing
  part; a 0 g part takes a typed weight as its baseline.
- `src/services/ingredientIntake.test.ts` (test database, fake fetch, fake image backend): a
  description becomes one part (parts not expanded); a photo becomes one part with that photo
  stored; a failure stores nothing; closing during a request aborts it, stores nothing and the
  outcome is `stopped`; closing lets go of stored photos nothing names and keeps one an entry
  names; a second request while one runs is `busy`; empty and oversized files are refused before
  any request; the request runs under the timeout setting.

Compare checklist (filled after the rewrite; reopened `MealIngredientsUi.kt`,
`IngredientIntakeHost.kt`, `IngredientIntakeViewModel.kt`, `BarcodeProductLookupTest.kt`, and the
part-change and split handlers of `FoodResultSheet.kt`):
- [x] Parts listed with thumbnail, else emoji, else a plate; name; "N g · kcal"; P/C/F; tap opens
  the editor; empty text (`src/features/log/review/IngredientsCard.test.tsx > IngredientsCard >
  lists each part with its picture, name, weight and energy, and macros`)
- [x] A part change makes the header the line sums (`> makes the header the sum when a manual
  part of 100 kcal is added: 398 + 100 (ACC-D13-1, R02.4)`), stretches nutrients by weight
  (`> stretches sodium by the weight left when a part is removed: 400 mg × 300/400 (R02.4,
  ACC-D13-2)`) and replaces energy typed through the unlock (`> lets a part change replace energy
  typed through the unlock (R02.5)`)
- [x] Editor: name, weight, energy in the person's unit, P/C/F; Save per the P01-10 check; weight
  rescales from an unrounded baseline; a typed value is the new baseline; Remove for existing
  parts only (`src/features/log/review/LineEditor.test.tsx > LineEditor > keeps Save off for a
  weight of 0 and for a negative or unreadable value (P01-10 check)`, `> rescales energy and macros
  from the unrounded baseline as the weight is typed: 1, 15, 150 g never drift`, `> makes a typed
  value the new baseline for the next weight change`, `> shows energy in kJ and keeps the kcal of an
  untouched kJ field`, `> turns typed kJ into whole kcal`, `> offers Remove for an existing part,
  which removes it and closes`, `> has no Remove for a new part, and Cancel only closes`)
- [x] Add menu: camera, single photo, barcode, describe, manual, recent, often, saved; nothing left
  unbuilt; AI sources need an intake session, barcode also a scanner (`IngredientsCard.test.tsx >
  IngredientsCard: parts from the AI > offers every source with an intake session and a scanner;
  none is left unbuilt`, `> leaves barcode off without a scanner`, `> offers manual and the reuse
  lists without an intake service`)
- [x] AI results collapse to one part, the photo kept as the part's photo; busy state; failure
  message (`> adds a described part as one line, with a busy line and no menu while it is worked
  out`, `> adds a photo part with its photo, and logs the part with it`, `> shows a failure's
  messages until dismissed, then offers the menu again`; `src/services/ingredientIntake.test.ts >
  IntakeSession: a part from the AI (02 §3.15) > turns a description into one part of the whole
  dish, its own parts not expanded`, `> turns a photo into one part that keeps the photo, stored
  only once the AI answered`, `> stores nothing when the AI fails, and gives the failure its
  messages`)
- [x] One request at a time; the photo stored only after the answer; the request and its photo
  dropped when the sheet goes (`ingredientIntake.test.ts > IntakeSession: a part from the AI
  (02 §3.15) > runs one request at a time: a second one while the first runs is refused as busy`,
  `> IntakeSession: the sheet goes > stops a request in flight when it closes, stores nothing and
  shows nothing`, `> lets go of the photos it stored that nothing names, and keeps one a logged
  entry names`; `IngredientsCard.test.tsx > AnalysisReview: the ingredients card > stops a part
  analysis when the review is cancelled, and keeps no photo of it`, `> IngredientsCard: parts from
  the AI > closes its session when the review goes`)
- [x] Read picked files within a size bound (`ingredientIntake.test.ts > ... > refuses an empty
  file and one over 25 MiB before any request`); each request under the timeout setting (`> gives
  each request its own time limit from the AI settings`)
- [x] Servings in recipe 1–50: serving unit first, 1 serving selected (`IngredientsCard.test.tsx >
  IngredientsCard: servings in recipe > splits the pot into 4: a serving unit first, one serving of
  500 g on screen (ACC-D14-1)`); kept through a part edit with the edited portion shown (`> keeps
  the 4 servings and the serving unit through a part edit, showing the edited portion (R02.6)`);
  ended by an ordinary change (`> ends the split with an ordinary change once fewer than two parts
  are left`); hidden for a re-logged portion, one part or an unknown weight (`> offers no split for
  a re-logged portion (ACC-D14-2, R02.6), one part or an unknown weight`)
- [x] Copy from the catalogue (`> the ingredients partition > passes the catalogue lint merged
  with the other partitions`)
- Second slice (reopened `IngredientIntakeHost.kt`, `BarcodeProductLookup.kt`,
  `BarcodeProductLookupTest.kt`, `CombinedMeal.kt`, `HomeViewModel.kt` `lookupIngredientBarcode`):
- [x] A scanned or typed code goes through the same lookup as Home's scans (R02.15): Open Food
  Facts wins and nothing else is asked; a saved label before FoodData Central; FoodData Central
  only after an Open Food Facts miss and with a key; an Open Food Facts outage ends there
  (`ingredientIntake.test.ts > IntakeSession: a part from a barcode (R02.15) > turns an Open Food
  Facts product into one part of one serving, keeping its photo`, `> takes a label saved for the
  code before FoodData Central, as one part without a photo`, `> asks FoodData Central after an
  Open Food Facts miss, with the stored key`, `> stops at an Open Food Facts outage without asking
  further (R02.15)`)
- [x] The product collapses to one part (name, serving weight or 0 g, energy, macros, emoji), with
  Open Food Facts' photo stored for it (`> turns an Open Food Facts product into one part of one
  serving, keeping its photo`; `IngredientsCard.test.tsx > IngredientsCard: parts from the AI >
  looks a typed code up through the session, busy meanwhile, and adds the product as one part`)
- [x] A refused FoodData Central key has its own message; other misses keep their kind and show
  the scanner's words (`ingredientIntake.test.ts > ... > reports a refused FoodData Central key as
  its own miss, and other misses by kind`; `IngredientsCard.test.tsx > ... > says why a code found
  nothing: its own words for a refused key, the scanner's otherwise`)
- [x] Busy while the lookup runs; dropped with its photo when the sheet goes
  (`ingredientIntake.test.ts > ... > stops a lookup in flight when the sheet goes, storing
  nothing`, `> lets go of a product photo nothing names when the sheet goes`;
  `IngredientsCard.test.tsx > AnalysisReview: the ingredients card > stops a barcode lookup when
  the review is cancelled`)
- [x] Saved, Often eaten and Recent picks hand the food back (no review opens) and add it as one
  part, its parts not expanded and its photos carried (`IngredientsCard.test.tsx > IngredientsCard:
  parts from the reuse lists > adds a saved meal as one part: its parts not expanded, its photos
  carried, no review opened`, `> adds a food picked from recent as one part`, `> adds a food picked
  from often as one part`)
- Mutation check: dropping the `keepSplit` branch of `withLines` fails 1 test; dropping the meal as
  first part fails 1; highlighting protein (fit check) is covered in the other note. Second slice:
  ignoring `onPick` in `ReuseSheet` fails 3; showing `scan.failure.keyRefused` for a refused key
  fails 1; carrying only a food's own photos fails 1; giving a saved-label part the label's photos
  fails 1.
- Deliberate differences: the meal without parts becomes its first part before a new one is added
  (the reference replaces the meal's totals with the new part's); a part of unknown weight shows its
  energy without "0 g", and its editor saves once a weight is typed (the reference needs a value
  edited too); the busy row stands in for the add row (the reference shows both, refusing a second
  request); failures show inline with Dismiss, not a dialog; the editor and the describe sheet are
  sheets on the router's stack (Back closes them) and only their buttons close them; a part
  opened and saved unchanged keeps its exact numbers (values written by the editor are saved
  exactly); without a ratio (no weight before) the nutrients keep the values on screen; the
  photo of every part the sheet added is let go when the sheet goes unless a logged entry names it.
  Second slice: a scanned product keeps Open Food Facts' photo as the part's photo (the reference
  adds none); lookup misses show inline with Dismiss and the busy row says "Looking up the
  barcode…"; the refused-key message is ours; the reuse lists keep Home's order (Recent, Often
  eaten, Saved; the reference lists favourites first) and stay full lists (search, remove, move).
- Not taken: voice (later phase); the live region on the stepper count (our Stepper is a
  spinbutton); camera permission prompts (the browser's file input and the scanner handle them);
  "Scan label" after an ingredient miss (the reference offers none there either).

## Decisions for the lead

- Proposed: the first part added to a meal without parts first turns the meal itself (as shown:
  energy, macros, weight or 0 g, emoji; no photos) into a part, so ACC-D13-1 ("raises the total by
  100") holds for every meal and the nutrients stretch from the meal's weight. The reference
  replaces the meal's totals with the new part's. One function, `withMealAsPart` in
  `IngredientsCard.tsx`, to drop if the lead prefers the reference.
- `ReviewWorking` carries the split's `servings` (absent = none), so `withLines` can keep a split
  through `keepSplit`; the stepper writes it through `onWorkingChange` (`withSplit`).
- `withLines`: with no weight before and one after, the nutrients keep the values on screen (×
  the old scale) instead of jumping; a change whose parts all have unknown weights under a split is
  applied to the whole dish, so the split and its unit stay.
- The split stepper shows when `canSplit` holds for the working copy's parts and weight with the
  opened draft's units (the portion check, R02.6). A fresh AI analysis that names a unit "serving"
  therefore reads as a portion and gets no stepper; the reference only treats re-logs as portions.
  A flag on reuse drafts (P06-12) would be more exact.
- The intake service is `src/services/ingredientIntake.ts` (`ingredientIntake` in Services); it
  stores a part's photo after the answer and lets go of unnamed ones on close.
- Second slice: the ingredient barcode lookup lives in the intake session (`barcode(code)`, one
  request at a time with the AI ones, stopped by `close`); it calls `lookupBarcode` directly, not
  the barcode service, so Home's lookup layer and label-scan hold are never touched. Its deps are
  a new required `lookup` group (`secrets`, `labels`, `unnamed`) built in `main.tsx` like Home's.
- A saved label found by an ingredient scan gives a part without a photo (its photos show the
  label); easy to switch to the entry's photos in `ingredientIntake.ts` if the lead prefers.
- A reuse pick carries the food's own photos, then its parts' photos, without repeats (as a combined
  meal gathers them, `foodAsPart` in `IngredientsCard.tsx`).
- The refused-key message is a new word, `ingredients.keyRefused`; the other misses reuse
  `scan.failure.<kind>`, whose not-found and no-nutrition texts suggest scanning the label, which
  this flow does not offer (it works from Home). A shorter ingredient-only set would avoid that.

## Status

Done (2026-10-27). Created `src/features/log/review/{IngredientsCard,LineEditor,
AddIngredientMenu}.tsx` (+ `IngredientsCard.test.tsx` 18 tests, `LineEditor.test.tsx` 11),
`src/features/log/review/ingredients.module.css`, `src/i18n/en/ingredients.ts`,
`src/services/ingredientIntake.ts` (+ 9 tests), this note. Shared, additive:
`src/features/log/review/ReviewSheet.tsx` (`ReviewWorking.servings`, `withLines` refined,
`ANALYSIS_SLOTS` filled in `AnalysisReview`), `src/services/context.tsx` (`ingredientIntake?`),
`src/main.tsx` (builds it with `createAiAccess` and `browserFetch`), `src/i18n/en.ts` (partition
line). Hooks: `ingredients`, `ingredients.{empty,busy,problem,problem.dismiss,camera,library}`,
`ingredients.line.<n>[.amount|.macros]`, `ingredients.add[.<source>]`, `ingredients.split[.decrease|
.increase]`, `ingredients.editor[.name|.grams|.energy|.protein|.carbs|.fat|.save|.cancel|.remove]`,
`ingredients.describe[.text|.analyse|.cancel]`. Handed on: P06-11 (entry editor) can reuse
`IngredientsCard` through the same slot shape.

Second slice done (2026-10-27): barcode, recent, often and saved wired; `SOURCES_NOT_BUILT_YET`
is empty. Changed `AddIngredientMenu.tsx`, `IngredientsCard.tsx` (+ test, now 25 tests),
`src/services/ingredientIntake.ts` (+ test, now 16 tests), `src/i18n/en/ingredients.ts`
(`ingredients.keyRefused`). Shared, additive: `src/features/log/reuse/ReuseSheet.tsx` (`onPick`),
`src/main.tsx` (the intake's `lookup` deps). Sheet ids above the review:
`review-ingredient-scan`, `review-ingredient-{recent,often,saved}`; the scanner and the lists keep
their own hooks (`scan`, `scan.digits`, `reuse.<list>`, `reuse.row.pick`).
