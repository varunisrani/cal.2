# 02 — Food log data model and logging flows: behavioural specification (clean-room)

Scope: the logged-food record and every nutrient it carries; meal types and custom meal times;
serving units, amount expressions and scaling; the review-before-log screen (nutrition unlock,
"What if?" preview as a flow); editing and manual entry; photo, text and barcode input (Open Food
Facts, USDA FoodData Central, saved-label memory); ingredients, recipe servings, combined meals,
ingredient-label parsing and allergen checks; saved meals (Recents, Frequent, Favorites); Copy from
Day; the entries of the Home "+" add menu; storage and compression of food photos.
Out of scope: AI prompts, provider calls, response parsing and the What-if prompt (`03-*`); Home
layout, diary list, selection mode and daily totals (`05-*`); fasting (block rule only noted here);
goals and optional-nutrient goal values (`01-*`); backup/restore and export (backup area); voice
input and live voice (later phase); health-store sync (later phase).

Reference: `apoorvdarshan/fud-ai` @ `10e14b67116c52b515d2389621266e32b3a99840`; shipped build checked:
store screenshots only (no APK/IPA available).
Sources studied: Android models, repository, services and Home UI listed in §4; iOS models, store,
views and services listed in §4; Android unit tests under `T/models`, `T/services`, `T/ui/home`;
iOS tests under `IT`; store screenshots S1–S2 (§4). No REA run was needed: the source settles this
area. Marketing-site Evidence `ev_fa243a1fe14ed63cc6252910410ee973c07740c25cc70484db1eab53b44d991a`
was not needed for any claim here.

Conventions:
- **Logged food** = one diary row. **Nutrition draft** = what an analysis or lookup produces before
  review (same nutrient set as a logged food, plus serving metadata and a "mass known" flag).
- **Base values** = the nutrition the draft describes for its own base amount. **Scale** = displayed
  amount ÷ base amount. Every value shown or saved is base × scale.
- **Mass known** = the original food weight in grams is known (finite and > 0).
- "A" = Android behaviour, "i" = iOS behaviour. When both agree the claim is unprefixed.
- "MUST" marks an invariant the reference defends; the defensive code or a test shows a past bug.

---

## 1. Overview

Food logging turns one of seven inputs into a **nutrition draft**, shows it on a **review screen**
where the user corrects name, amount, nutrition, ingredients, meal and time, and then writes one
**logged food** to the diary. Saved meals, Copy from Day and Combine reuse logged foods. Photos are
stored as files outside the diary record and referenced by filename.

```
 "+" menu ─┬─ Camera ─┐                          ┌─ AI analysis (area 03) ─┐
           ├─ Photos ─┼─ photo sheet (≤10, note) ─┤                        │
           ├─ Text ───┴──────────────────────────►│                        ├─► nutrition draft
           ├─ Voice (later) ─────────────────────►└────────────────────────┘        │
           ├─ Barcode ─► scanner ─► OFF → saved label → FDC ────────────────────────┤
           ├─ Recent / Frequent / Favorites ─► pick saved food ─► draft from entry ─┤
           ├─ Copy from Day ─► copies logged foods directly (no review) ──┐         ▼
           └─ Manual ─► form ─► logged food directly (no review) ─────────┤   review screen
                                                                          │   (Log / What if?)
                                                                          ▼         │
                                                      diary (logged foods) ◄────────┘
                                                            │  edit screen (Save / Reprocess /
                                                            │  favourite / delete)
                                                            ▼
                                       photo files (shared by diary rows, favourites, draft)
```

What the user sees: a sheet with an analysing overlay (preview + Cancel), then the review sheet
(S1: toolbar `Cancel` · "Review Food" · `What if?` · `Log`; photo; Name; Quantity with unit
picker), then the row on Home. What the system guarantees: one tap on Log writes exactly one row;
nutrition is stored for the amount actually eaten; an unknown food mass is never invented; a photo
file is deleted only when nothing references it; food cannot be logged while a fast is active.
[obs]

## 2. Reference names (rename in rebuild)

| Kind | Names (reference only; they become banned identifiers) |
|---|---|
| Binary / CLI and flags | none in this area |
| Env vars | none in this area |
| Files and folders | photo folder `fudai-food-images/`; thumbnails `fudai-food-thumbnails-v2/` (legacy `fudai-food-thumbnails/`); `fudai-food-images-compressing/`; restore staging `fudai-food-images-restore/`, `fudai-food-thumbnails-restore/`; capture drafts `food-capture-drafts/`; photo names `<uuid>.jpg`, i extra photos `<uuid>-<index>.jpg` |
| HTTP routes / URL schemes | `fudai://log-food?method=<key>` (i deep link for a log method) |
| RPC methods / events / commands | i notifications `ai.fud.foodEntriesDidChange`, `FudAI.foodLogMethodRequested`; i pending key `foodLogMethod.pending` |
| Settings and storage keys | `foodEntries`, `favoriteFoodEntries`, legacy `favorites` (set of keys), `pendingFoodAnalysisDraft`, `addMenu.config`, `quickAction.slot1..3`, `mealBreakfastStartMinutes`, `mealLunchStartMinutes`, `mealDinnerStartMinutes`, `mealSnackStartMinutes`, `foodMeasurementPreferGramsByDefault`, `productInfoShown`, `productInfoHiddenFields`, `saveMealPhotosToGallery`, `lastRecentsSegment`, `foodLogSortOrder` (`standard`/`latestMealsFirst`), `aminoAcidEstimatesEnabled`, i keychain `usdaFoodDataCentralAPIKey`, A saved-state `capturePhotoFilenames` |
| Persisted enum values | source `barcode`/`manual`/`nutritionLabel`/`snapFood`/`textInput`; meal `breakfast`/`dinner`/`lunch`/`other`/`snack`; log methods (alphabetical) `barcode`/`camera`/`copy_from_day`/`favorites`/`frequent`/`manual`/`photos`/`recent`/`text`/`voice`/(i)`siri_phrases`; default group ids `__default_describe_meal__`, `__default_group__`, `__default_photo_scan__`, `__default_reuse_meal__`; product-info field keys (alphabetical) `allergens`, `barcode`, `categories`, `ecoScore`, `ingredientLabel`, `labels`, `novaGroup`, `nutriScore`, `package`, `source`, `traces`; data source `usdaFoodDataCentral`; supplemental keys (alphabetical) `betaAlanine`, `betaine`, `creatine`, `hmb`, `lArginine`, `lCarnitine`, `lCitrulline`, `taurine`; amino keys = the lower-case amino-acid names |
| Persisted record keys (logged food, alphabetical) | top level: `additionalImageFilenames, addedSugar, caffeine, calcium, calories, carbs, cholesterol, customNote, emoji, fat, fiber, folate, id, imageFilename, ingredients, iron, magnesium, mealType, monounsaturatedFat, name, omega3, polyunsaturatedFat, potassium, productMetadata, progressiveMeal, protein, saturatedFat, selectedServingQuantity, selectedServingUnit, servingSizeGrams, servingUnitOptions, sodium, source, sugar, supplementalNutrients, timestamp, transFat, vitaminA, vitaminB12, vitaminC, vitaminD, vitaminE, vitaminK, zinc`; unit option `gramsPerUnit, quantity, unit`; ingredient line `additionalImageFilenames, calories, carbs, emoji, fat, grams, imageFilename, name, protein` (+ i `id`); product `allergens, barcode, categories, dataSource, ecoScore, ingredientsText, labels, novaGroup, nutriScore, packageQuantity, traces` + image URL key (A `imageUrl`, i `imageURL`); A only `healthConnectOrigin`, `healthConnectRecordId`; i legacy inline `imageData` |
| Distinctive type / screen names | `FoodEntry`, `FoodAnalysis`, `FoodResultSheet`/`FoodResultView`, `EditFoodEntrySheet`/`EditFoodEntryView`, `SavedMealsSheet`/`RecentsView`, `MultiPhotoCaptureSheet`, `ContextNoteSheet`, `PhotoCaptureDraftViewModel`, `IngredientIntakeSection`, `BarcodeLabelMemory`, `LabelScanBarcodeHandoff`, `BarcodeProductLookup`, `FoodSubmissionGate`, `PendingFoodAnalysisDraft`, `RecipeServings`, `MealMicronutrientStretch`, `IngredientLabelParser`, `PortionScale`, `GeminiService`, `FoodStore`, `FoodRepository` |
| Other (strings, ids) | User-Agent `FudAI/<version> (https://fud-ai.app)`; internal issue numbers (#343, #426–#428, #458, #485, #491, #533, #601) |

Third-party protocol names used by this area (keep exact; verify against vendor docs):
- Open Food Facts: `GET https://world.openfoodfacts.org/api/v2/product/{code}.json` with query
  `lc` = device language code and `fields` = a comma-joined list of these product fields
  (alphabetical here; order does not matter to the API): `allergens_tags`, `brands`,
  `categories_tags`, `ecoscore_grade`, `generic_name`, `image_front_url`, `ingredients_text`,
  `ingredients_text_with_allergens`, `labels_tags`, `nova_group`, `nutriments`,
  `nutriscore_grade`, `product_name`, `product_quantity`, `product_quantity_unit`, `quantity`,
  `serving_quantity`, `serving_size`, `traces_tags`. Response `status`, `product`. Nutriment
  values are read as `<key>_serving` or `<key>_100g`; keys used (alphabetical): `added-sugars`,
  `beta-alanine`, `betaine`, `caffeine`, `calcium`, `carbohydrates`, `cholesterol`, `creatine`,
  `energy`, `energy-kcal`, `fat`, `fiber`, `folates`, `hmb`, `iron`, `l-arginine`, `l-carnitine`,
  `l-citrulline`, `magnesium`, `monounsaturated-fat`, `omega-3-fat`, `polyunsaturated-fat`,
  `potassium`, `proteins`, `saturated-fat`, `sodium`, `sugars`, `taurine`, `trans-fat`,
  `vitamin-a`, `vitamin-b12`, `vitamin-c`, `vitamin-d`, `vitamin-e`, `vitamin-k`, `zinc`.
  Allergen markup `<span class="allergen">…</span>`; product images host `images.openfoodfacts.org`.
- USDA FoodData Central: `POST https://api.nal.usda.gov/fdc/v1/foods/search`, header `X-Api-Key`,
  body `{query, dataType:["Branded"], requireAllWords:false, pageSize:25}`; response `foods[]` with
  `brandName`, `brandOwner`, `dataType`, `description`, `foodCategory`, `gtinUpc`,
  `householdServingFullText`, `ingredients`, `servingSize`, `servingSizeUnit`,
  `foodNutrients[]{nutrientId, unitName, value}` and `labelNutrients.<key>.value` with keys
  (alphabetical) `addedSugar`, `calcium`, `calories`, `carbohydrates`, `cholesterol`, `fat`,
  `fiber`, `iron`, `potassium`, `protein`, `saturatedFat`, `sodium`, `sugars`, `transFat`; key
  sign-up `https://fdc.nal.usda.gov/api-key-signup`. Nutrient ids in §3.12.

## 3. Behaviour

### 3.1 The logged-food record

- **Data shape** (conceptual):
  `LoggedFood { id, name, kcal: int, proteinG, carbsG, fatG, loggedAt: instant, photos: PhotoRef[]
  (ordered, first = primary), emoji?, source: photo|label|barcode|text|manual, meal: MealKind,
  nutrients: OptionalNutrients, extras: map<key, grams>, massG?: number, unitOptions: UnitOption[],
  chosenUnit?: string, chosenQuantity?: number, note?: string, progressive: bool,
  ingredients: IngredientLine[], product?: ProductDetails }` [obs]
- **Core values:** energy is a whole number of kcal; protein, carbs and fat are unrounded decimal
  grams. The energy field is shown and typed in the user's energy unit (kcal or kJ, owned by
  settings) but always stored as kcal. [obs]
- **Optional nutrients** (absent = unknown, never 0), grouped by storage unit, alphabetical within
  each group [obs]:

  | Unit | Nutrients | Count |
  |---|---|---|
  | grams | added sugar, fiber, monounsaturated fat, omega-3, polyunsaturated fat, saturated fat, sugar, trans fat | 8 |
  | milligrams | caffeine, calcium, cholesterol, iron, magnesium, potassium, sodium, vitamin C, vitamin E, zinc | 10 |
  | micrograms | folate, vitamin A, vitamin B12, vitamin D, vitamin K | 5 |

  That is 23 fixed fields. A further **extras map** (grams, keyed) holds 8 sports compounds
  (alphabetical: beta-alanine, betaine, creatine, HMB, L-arginine, L-carnitine, L-citrulline,
  taurine) and, when the opt-in amino-acid setting is on, 9 essential amino-acid estimates — the
  three branched-chain ones (valine, leucine, isoleucine) plus tryptophan, threonine, lysine,
  phenylalanine, methionine and histidine. Extras scale like every other nutrient. Amino values
  round to 0.001 g, other extras to 0.1 g. [obs]
- **Serving metadata:** `massG` = grams the stored nutrition describes (absent when the mass is
  unknown); `unitOptions` = up to 4 non-gram units (`UnitOption { unit, gramsPerUnit, quantity? }`);
  `chosenUnit` / `chosenQuantity` = what the user picked (absent when grams were used). See §3.3.
- **Media:** photo references are filenames; ingredient lines may carry their own photos. The
  gallery order is primary, extra photos, then ingredient photos, de-duplicated. For a progressive
  meal the list thumbnail uses the last extra photo first, without changing gallery order. [obs,
  `FoodEntryThumbnailTest`]
- **Product details** (barcode logs, and label scans linked to a barcode):
  `ProductDetails { barcode, packageText?, ingredientsText?, allergens[], traces[], nutriScore?,
  novaGroup?: 1..4, ecoScore?, labels[], categories[], imageUrl?, dataSource?: "usda" }`. [obs]
- **Timestamps:** one instant (`loggedAt`). The diary day is its local calendar date in the device
  zone; there is no separate "meal date". New logs default to "now" for today, or the viewed day at
  the current wall-clock time for another day. [obs]
- **Derived:** *favourite key* = lower-cased name + "|" + kcal (§3.16). *Mass known* = `massG`
  finite and > 0. *Review reference* = `massG` if known, else `chosenQuantity` if > 0, else 1. [obs]
- **Duplicating for re-log** (saved meals, Copy from Day): new id, new timestamp, meal = meal for the
  current time unless given, everything else copied including photos, note, ingredients and product
  details. A shares the photo files; i writes new photo files from the bytes. [obs]
- **Decoding:** missing meal type decodes as `other`; numbers may arrive as int or decimal; unknown
  keys are ignored. [obs]
- A also stores two health-store fields (origin, record id); restored-from-health-store rows have
  no mass and get `chosenUnit = "serving"`, `chosenQuantity = 1`. [obs] (Health stores: later phase.)

### 3.2 Meal types and custom meal times

- **Meal kinds:** breakfast, lunch, dinner, snack, other. `other` is never chosen automatically. [obs]
- **Schedule:** four start times in minutes after midnight. Defaults: breakfast 05:00 (300), lunch
  12:00 (720), dinner 18:00 (1080), snack 23:00 (1380). [obs, `MealScheduleTest`]
- **Valid** only when 0 ≤ breakfast < lunch < dinner < snack < 1440. An invalid schedule is
  replaced by the defaults on read and on save. [obs]
- **Classification** of a time of day (minute precision):
  minute ≥ snack or minute < breakfast → snack; else ≥ dinner → dinner; else ≥ lunch → lunch;
  else breakfast. Example with defaults: 04:59 snack, 05:00 breakfast, 11:59 breakfast, 12:00
  lunch, 17:59 lunch, 18:00 dinner, 22:59 dinner, 23:00 snack. [obs, test]
- **Where it is used:** the default meal on the review screen, manual entry, saved-meal re-logs and
  Copy from Day is the meal for the device's *current* time — not for the time the user picks on
  the review screen, and not the copied entry's original meal. Changing the logged time does not
  change the meal. [obs] (R02.13, Q1–Q2.)
- **Grouping on Home** (display only, area 05): either fixed order breakfast → lunch → dinner →
  snack → other, or "latest meals first" (runs of consecutive same-meal entries, newest first).
  A seeds "latest meals first" for users finishing onboarding; otherwise "standard". [obs]

### 3.3 Serving units, amount expressions and scaling

- **Grams are the source of truth.** Every unit option converts to grams with `gramsPerUnit`.
  The amount the user enters becomes `displayedGrams = quantity × gramsPerUnit`; scale =
  displayedGrams ÷ baseGrams. Volume units (ml, cup, fl oz) are just options whose
  `gramsPerUnit` already folds in density (S1 shows "242.7 ml"). [obs]
- **Option list rules** [obs]:
  - A unit's id is its trimmed, lower-cased name. Gram spellings (`g`, `gram`, `grams`) are never
    stored as options; grams are always offered first by the picker when the mass is known.
  - Normalising an incoming list: fill a missing `quantity` with baseGrams ÷ gramsPerUnit, drop
    invalid (empty name or gramsPerUnit ≤ 0), gram, and duplicate units, keep the first **4**.
  - Initial unit: the "prefer grams" setting (default off) picks grams when the mass is known;
    otherwise the draft's chosen unit if it is in the picker; otherwise the first option; otherwise
    grams.
  - Initial quantity text: the stored chosen quantity for a non-gram unit, else baseGrams ÷
    gramsPerUnit.
  - Switching unit keeps the grams and rewrites the quantity (grams ÷ new gramsPerUnit).
  - Plural display: unchanged when the quantity is 1 (±0.0001), and unchanged for the metric
    and measure abbreviations (the three gram spellings, kilogram, milligram, millilitre, litre,
    ounce, fluid ounce, tablespoon and teaspoon abbreviations); "piece" becomes "pieces"; any
    other unit gains an "s" unless it already ends in one. The unit named "serving" shows the
    localised word for Serving.
- **Unknown mass:** the picker offers only one "serving" unit whose numeric basis is a *serving
  count* (gramsPerUnit 1, quantity = review reference). Grams are hidden, the "≈ N g" line is
  hidden, and the saved row keeps `massG` absent, `chosenUnit = "serving"`,
  `chosenQuantity = count`. Reopening uses that count as the base, so 2 servings stay 2 servings.
  An unknown mass is never turned into 100 g. [obs, `FoodServingRestoreTest`]
- **Quantity formatting:** whole numbers without decimals; below 10 → up to 2 decimals; else up to
  1 decimal; trailing zeros removed. [obs]
- **Decimal parsing** (all numeric inputs): try plain `.` first; if the text has a comma and no dot,
  treat the comma as decimal; otherwise accept the locale's decimal separator after removing its
  grouping separator. [obs, i `ServingUnitEditorTests`]
- **Amount expressions** (`QuantityExpression`): the quantity field accepts arithmetic.
  - Operators `+ − × ÷` (also ASCII `- * /`), standard precedence (× ÷ before + −), unary +/−,
    decimals with `.` or the locale separator, whitespace ignored; no parentheses. [obs]
  - Invalid → no value: empty, trailing operator ("50+"), letters, division by a divisor whose
    magnitude ≤ machine epsilon, non-finite results. Examples: 50+20 = 70; 200−35 = 165; 80×2 = 160;
    300÷3 = 100; 50+20×2 = 90; "1,5+0,5" in German = 2. [obs, `ServingAmountExpressionTest`]
  - Calculator row (visible while the field has focus): `C` (clear), `+ − × ÷` (an operator key
    replaces a trailing operator instead of stacking), and `=` which shows the live result
    ("= 70") once the text contains an operation and writes the formatted result. [obs]
  - While typing, every valid value > 0 updates displayedGrams immediately. On blur: a valid
    value > 0 is reformatted; anything else reverts to the current grams in the current unit.
    A clear (×) button empties the field. [obs]
- **Scaling rules** [obs]:
  - Displayed kcal = round(base kcal × scale); macros = base × scale (unrounded, shown with
    0 or 1 decimal: whole numbers without decimals, else one decimal).
  - Optional nutrients and extras are shown base × scale rounded to 0.1 (`—` when unknown).
  - Ingredient lines scale grams, kcal (rounded), and macros by the same factor.
  - When a value is typed at the displayed amount, the stored base = typed ÷ scale (scale floored
    at 0.0001 on A, treated as 1 when ≤ 0 on i).
  - Logging stores base × scale for everything, `massG` = displayedGrams (when known).

### 3.4 Logging pipeline and shared states

- **Trigger / inputs:** an add-menu method (§3.18), a quick action, or a saved-meal pick.
- **States** (one pipeline per app, A view model / i root view):

  | State | Event | Next |
  |---|---|---|
  | idle | start photo / text / barcode | analysing (overlay with first photo or spinner, Cancel) |
  | analysing | result | review (draft persisted on A, §3.10) |
  | analysing | Cancel | idle; HTTP aborted; no error dialog; draft files of that attempt deleted |
  | analysing | failure | error dialog: message + Retry (re-runs the same request with the same photos/text/barcode) + Cancel |
  | error (barcode not found / no nutrition / USDA key refused) | `Scan label` | camera opens with the barcode armed (§3.12) |
  | review | Log | saving (Log disabled) → idle; the new row appears |
  | review | Cancel | idle; draft and its photo files deleted |
  | saving | fast active | "Food logging paused" dialog; nothing written; review stays |

  Starting a new analysis discards any previous draft and its files first. [obs]
- **Single submission:** a gate allows one Log/Save at a time; repeated taps while the first is in
  flight are ignored. Manual entry has the same gate. [obs, `FoodSubmissionGateTest`]
- **Fasting block:** writing a new row (log, re-log, copy, combine, manual) is refused while a
  fasting session is active; the UI shows a "Food logging paused" dialog. Quick actions for food
  check this before opening anything. [obs] (Rule owned with the fasting area.)
- **Saving a reviewed draft** (A): new id; photos = the saved meal's existing files (re-log), else
  the draft's stored files, else the in-memory bytes written now; nutrition = base × scale; source =
  the re-logged entry's source, else the pending source, else photo when there are photos, else
  text; note and progressive flag from the draft; product details kept. After success the draft
  record is cleared and, if the user enabled it, logged photos are exported to the device gallery.
  [obs]
- **Errors on save:** a storage failure shows an error dialog; the review stays. [obs]

### 3.5 Review screen (review-before-log)

- **Trigger / inputs:** a nutrition draft, its photos (0–10), the source, the initial timestamp,
  whether it came from a saved barcode label, whether recipe servings are allowed.
- **Layout (top to bottom)** [obs; S1]:
  1. Toolbar: `Cancel`, title "Review Food", `What if?`, `Log` (Log disabled while saving).
  2. Photos: horizontally scrolling 240-pt rounded squares, an "i/n" badge when > 1, tap → full-
     screen viewer (decoded at most 2048 px); previews decoded at 720 px; spinner while decoding;
     without photos the emoji at large size (fallback plate emoji).
  3. Saved-label notice (only when the draft came from a saved label; §3.12).
  4. Food Details: editable Name (blank on save → keeps the draft's name).
  5. Allergen Check (only when the profile lists sensitivities): one summary line (§3.14).
  6. Serving: quantity field + unit picker + "≈ N g" line for non-gram units when mass is known.
  7. Nutrition: kcal, protein, carbs, fat, with a lock toggle (below).
  8. Ingredients: lines, add menu, "Servings in recipe" stepper when eligible (§3.15).
  9. More Nutrition: collapsed row; expands to the 23 optional nutrients, then the 8 sports
     extras, then (if enabled) an amino-acid header and 9 amino rows.
  10. Meal: meal-kind picker (default §3.2).
  11. Date & Time: date picker (A range: 10 years back to the current year) and time picker. [obs]
  12. Product Information (barcode products only, when the setting shows it and any visible field
      has data; §3.13).
- **Header totals:** when the draft has ingredient lines, kcal and macros shown are the sum of the
  lines, not the draft's own header numbers. [obs]
- **Nutrition unlock ("edit then lock")** [obs]:
  - Locked (default): values are plain text.
  - Tap the lock → every nutrition row (core rows and every More Nutrition row) becomes an inline
    decimal field pre-filled with the displayed value (1 decimal for nutrients). Typing updates the
    base value immediately (typed ÷ scale). Negative or unparsable input → 0 for core values,
    unknown for optional nutrients; empty optional → unknown (removed from extras).
  - Tap again → locks, dismisses the keyboard; values stay as edited.
  - Unlock state is per sheet; it does not persist. The edit screen has no unlock (§3.7).
  - Editing nutrition does not touch ingredient lines; a later ingredient change recomputes the
    header from the lines and overwrites those edits (R02.5).
- **Dismissal:** swipe-to-dismiss is disabled on A; Cancel (or back) discards. [obs]
- **Recovery:** A keeps all review edits (amount, unit, nutrient edits, ingredient editor, time)
  across rotation/process recreation. [obs, `FoodDraftSaversTest`]

### 3.6 "What if?" preview

- **Trigger:** `What if?` on the review screen. Nothing is logged. [obs]
- **Inputs:** the candidate row as currently edited (scaled values, chosen time and meal); the day's
  logged foods for the chosen date; the profile's effective kcal/protein/carbs/fat goals.
- **Shown:** for kcal, protein, carbs, fat: "+added" and "after / goal", where after = sum of that
  day's rows + candidate. i also shows "N left" or "N over" and highlights over-goal kcal, carbs and
  fat (never protein); A shows only added and after/goal, and without a profile shows after only.
  [obs]
- **AI suggestion (flow only; prompt in area 03):** starts automatically when the preview opens (i
  re-runs when the candidate's numbers, the day's entry count or goals change). Inputs: candidate,
  day rows, profile, weight unit. States: loading ("checking fit" text + spinner) → suggestion text
  (selectable on i) | error message | empty → a "no suggestion" message. i offers Retry on error; A
  does not. Without a finished profile A shows a hint to finish onboarding instead. A `Done` button
  closes the preview. [obs]

### 3.7 Editing a logged entry

- **Trigger:** tap a diary row (area 05) → edit screen. Same layout as review, with differences [obs]:
  - Toolbar primary is `Save`; it becomes `Reprocess` while the note field differs from the saved
    note, and "Reprocessing…" while running (inputs disabled).
  - Nutrition rows are read-only (no lock). They change only via the amount, ingredient edits or
    reprocessing. More Nutrition lists only nutrients that have values and is hidden when none do.
  - Each photo has a remove (×) button. Removals are staged and applied on Save; removing the
    primary promotes the next photo, and when no meal photo is left the first ingredient photo
    becomes primary. Nutrition and ingredients never change. [obs, `FoodEntryPhotoRemovalTest`]
  - A "Reprocess with AI" note field; Favourite toggle; `Delete Food Log` with a confirmation;
    Share (later phase).
- **Serving on edit:** base = the row's review reference; options normalised as in §3.3; recipe
  servings offered only when the row is not already a logged portion (§3.15).
- **Save:** writes name (blank keeps old), meal, note (trimmed, blank → none), scaled nutrition
  (optional nutrients rounded to 0.1 when scale ≠ 1), serving metadata, scaled ingredients, minus
  removed photos. **The timestamp is kept exactly** (seconds included) unless the user changed the
  date or the minute; then it becomes the picked local date + time. [obs]
- **Reprocess:** builds a description from name, "quantity unit" (or "N g" from mass) and the note
  ("name, 2 slice. note"); re-runs photo analysis with that description when the row has photos,
  else text analysis. The result replaces name, emoji, all nutrition, serving metadata (unknown mass
  → "serving" × quantity or 1) and ingredients in the open sheet; any recipe split is cleared; the
  note becomes the saved note so the button returns to `Save`. Nothing is written until Save.
  Errors show inline under the note. [obs]
- **After save:** photo files no longer referenced by any row, favourite or draft are deleted. [obs]
- **Delete:** removes the row; its photos are deleted only if unreferenced. [obs]

### 3.8 Manual entry (no AI)

- **Form:** Name (required, trimmed), energy in the user's unit (required whole number; A filters
  to digits), protein, carbs, fat (optional decimals, blank → 0), fiber (optional, blank or
  negative → unknown), meal kind (default §3.2), `Save` and `Cancel`. [obs, `ManualEntryInputTest`]
- **Result:** logged directly (no review) at the viewed day's timestamp, source manual, energy
  converted to kcal, no serving metadata, no photo. [obs]
- i: sheet cannot be swiped away; keyboard has a Done key. [obs]

### 3.9 Photo input

- **Camera:** in-app camera (permission requested first; denial clears an armed label barcode).
  Each shot goes to the **meal-photos sheet**. "Add Photo" returns to the camera. [obs]
- **Library:** system picker, images only, multi-select up to **10** (i keeps selection order).
  "Add Photos" reopens the picker; the total is capped at 10. [obs]
  - A reads each file with a hard cap of **25 MiB**; if any selected file is unreadable or too
    large the whole batch is rejected with an image-conversion error (never a silently shorter
    set). i silently skips files it cannot read. [obs] (R02.17)
- **Meal-photos sheet** [obs]:
  - Header "N of 10 photos"; photo cards (240×260 pt) with "Photo k" badge and a remove button;
    removing the last photo closes the sheet.
  - **Progressive meal** switch with an info dialog; enabled only with ≥ 2 photos and sent only
    then (meaning: chronological photos of one meal being eaten; prompt in area 03).
  - **Optional note** (multi-line) — sent with the photos as context; A stores it as the row's note,
    i does not store it on log (R02.20).
  - `Analyze` (disabled while photos are still being imported or saved), `Cancel` (clears).
- **Capture drafts (A):** photos taken or imported before Analyze are written to a separate
  capture folder and listed in saved state, so they survive rotation and process death, and diary
  cleanup can never delete them. Operations are serialised; a "clear" invalidates in-flight
  imports; if a write fails the files of that batch are removed. [obs]
- **Source:** photo, unless the label-scan barcode was armed (§3.12) → label. Up to 10 non-empty
  images are analysed together. [obs]
- i only: an optional AR measurement of camera height and tilt adds real-world scale to the prompt
  (10–100 cm height, ≤ 30° tilt). [obs] Out of scope for the PWA.

### 3.10 Pending analysis drafts (A only)

- **Purpose:** an analysis that finished but was not yet logged survives the app being killed.
- **Shape:** `PendingDraft { draft: NutritionDraft, photoRefs[], source?, createdAt, fromSavedLabel }`.
- **Flow** [obs]:
  1. On result, the overlay drops at once and review opens from memory.
  2. In the background the photos are written as new files (no thumbnail yet), then the draft
     record is saved, then thumbnails are pre-warmed.
  3. If the user logged or dismissed meanwhile (a generation counter changed, or the pending draft
     is no longer the same object), the just-written files are deleted and the record is not kept.
  4. On app start, a stored draft re-opens the review (with photos, source and saved-label notice)
     unless another analysis or review already started.
  5. Log reuses the draft's files; Cancel, Cancel-analysis, a new analysis or Log clears the record
     and (except Log) deletes its files; if the UI does not know the filenames yet, they are read
     from the stored record first.
- `createdAt` is stored but no expiry is applied. [obs] i keeps no persisted draft. [obs, by search]

### 3.11 Text input

- **Form:** multi-line field (3–5 lines), focused on open; placeholder cycles through 4 example
  meal descriptions every 2 s while empty; `Analyze` enabled when the text is not blank; `Cancel`.
  [obs]
- **Flow:** trimmed text → text analysis (area 03) → review. Source text. No photo. [obs]
- Voice input produces text and enters the same flow (later phase).

### 3.12 Barcode lookup

- **Scanner:** full-screen back camera with tap-to-focus and a hint card; the first non-empty
  decoded value is used once, then the scanner closes. A decodes all formats; i decodes EAN-13,
  EAN-8, UPC-E, Code 128, Code 39, Code 93, ITF-14 and Interleaved 2 of 5. No manual digit entry on
  either platform. [obs]
- **Lookup order** (every barcode path — Home scan, add-ingredient scan, voice — uses it) [obs,
  `BarcodeProductLookupTest`]:
  1. **Open Food Facts.** Any product with nutrition wins; later sources are never asked.
  2. If OFF says *product not found* or *missing nutrition* only: the **saved label** for this
     barcode (most recent label-sourced row with a matching normalised barcode).
  3. Then **USDA FoodData Central**, only if the user stored a key.
  4. Otherwise the original OFF error is shown — except a refused USDA key, which is reported as its
     own error. Any other OFF failure (rate limit, outage, offline…) stops at step 1.
- **Open Food Facts request** [obs, `OpenFoodFactsServiceTest`]:
  - Code: trimmed; must be 1–24 ASCII digits, else *invalid barcode* (no request). Sent as scanned
    (leading zeros kept).
  - Headers: an identifying User-Agent (app name/version + site); i also sends `Accept:
    application/json`. Query: the field list in §2 and `lc` = device language.
  - Status: 404 → not found; 429 → rate limited; 5xx → service unavailable; other non-2xx →
    unexpected response; unparsable body → unexpected; `status == 0` or no product → not found;
    no nutriments → missing nutrition. Network: offline, timeout, other network — each with its own
    message.
- **OFF mapping** [obs]:
  - Serving grams = max(`serving_quantity`, else grams parsed from `serving_size`, else 100; 1).
  - Per-serving value = `<key>_serving`, else `<key>_100g` × servingGrams ÷ 100.
  - kcal = `energy-kcal`, else `energy` (kJ) × 0.23900573614. If kcal, protein, carbs and fat are
    all missing → missing nutrition. Missing core values become 0; kcal rounded.
  - OFF reports minerals and vitamins in grams: mg = g × 1000, mcg = g × 1 000 000; all optional
    values rounded to 0.1. Extras from the hyphenated keys.
  - Unit options: "serving" (gramsPerUnit = serving grams, quantity 1) and, when the package weight
    is known and differs by > 0.01 g, "package". Chosen: 1 serving.
  - Package grams: `product_quantity` with unit kg ×1000, mg ÷1000, g, l ×1000, ml ×1; else the
    `quantity` text when the whole text is one number (dot or comma decimal) and one unit out of
    g, kg, mg, l, ml, oz (case-insensitive).
  - Grams from free text (also reused by FDC): lower-case it, turn commas into dots and "fl. oz"
    into "fl oz", then take the first number followed by a recognised unit. Conversions: g ×1,
    ml ×1 (millilitres count as grams), l ×1000, kg ×1000, mg ÷1000, oz ×28.3495, fl oz ×29.5735.
    "fl oz" must be recognised before plain "oz", or fluid ounces read as ounces.
  - Name: product name, else generic name; brand = first comma-separated brand. If both exist and
    the name does not contain the brand (case-insensitive) → "Brand Name"; else name, brand, or
    "Barcode <code>". Emoji: a label/tag emoji.
  - Details: package text; ingredients text with allergen markers (§3.13); allergens ≤ 16, traces
    ≤ 16, labels ≤ 12, categories ≤ 8 — each tag loses its `xx:` language prefix, `-`/`_` become
    spaces, case-insensitive duplicates dropped, first letter upper-cased; Nutri-Score and
    Eco-Score upper-cased unless "unknown"/"not-applicable"; NOVA kept only for 1–4; front image URL.
  - Product photo: downloaded only from `https://images.openfoodfacts.org`, only if 2xx, content
    type image/*, ≤ 5 000 000 bytes; otherwise none (never an error). It becomes the row's photo.
- **USDA FoodData Central** (optional second source) [obs, `FoodDataCentralServiceTest`]:
  - No request at all without a non-blank key and an all-digit code. The key travels in a request
    header (see §2); URLs and logs never contain it. A key with any character outside printable
    ASCII (0x21–0x7E, e.g. a pasted zero-width space) is treated as refused and nothing is sent.
    Timeout 15 s.
  - Search text = every plausible GTIN spelling of the code, space-separated so the search ORs
    them: the raw scan; the significant digits (leading zeros removed); and the significant digits
    left-padded with zeros to widths 8, 12, 13 and 14 whenever they fit. Duplicates removed; no
    request for non-digits, an all-zero code, or more than 14 significant digits.
  - 401/403 → key refused; any other failure (rate limit, 5xx, bad body, network) → unavailable,
    which silently falls back to the OFF error.
  - Only foods whose type is Branded (or missing) and whose GTIN equals the scanned code after
    stripping leading zeros are used; the first with nutrition wins.
  - Serving weight from `servingSize` + `servingSizeUnit` (vendor unit codes, case-insensitive):
    ×1 for the gram codes `g`, `gram`, `grams`, `grm` and the millilitre codes `ml`, `mlt`;
    ×1000 for `kg`, `l`, `ltr`; ÷1000 for `mg`; ×28.3495 for `oz`, `onz`; ×29.5735 for `fl oz`,
    `foz`. Otherwise grams found in `householdServingFullText` (free-text rule above). Any
    positive weight is kept, even below 1 g.
  - Known weight: label (per-serving) values win; else per-100 g values × weight ÷ 100. Unit option
    "serving" × 1.
  - Unknown weight: label and per-100 g sets are never mixed. If the label set has ≥ 1 core value
    and at least as many core values as the per-100 g set → one *logged serving* with unknown mass;
    else a 100 g basis in grams with no options.
  - Nutrient ids, sorted by id; where a field has several ids, the "try first" id is marked ¹:

    | id | field | id | field | id | field |
    |---|---|---|---|---|---|
    | 1003 | protein | 1089 | iron | 1162 | vitamin C |
    | 1004 | fat | 1090 | magnesium | 1177 | folate (fallback) |
    | 1005¹, 1050 | carbs | 1092 | potassium | 1178 | vitamin B12 |
    | 1008¹, 2047, 2048 | kcal (unit KCAL) | 1093 | sodium | 1185 | vitamin K |
    | 1057 | caffeine | 1095 | zinc | 1190¹ | folate |
    | 1062 | kJ, used only without kcal (× 0.23900573614) | 1106 | vitamin A | 1235 | added sugar |
    | 1063 | sugars (fallback) | 1109 | vitamin E | 1253 | cholesterol |
    | 1079 | fiber | 1110 | vitamin D in IU, only without 1114 (× 0.025 µg) | 1257 | trans fat |
    | 1087 | calcium | 1114 | vitamin D | 1258 | saturated fat |
    | 2000¹ | sugars | 1292 | monounsaturated fat | 1293 | polyunsaturated fat |

    Units G, MG, UG/MCG are converted to grams first; the first entry per id wins; negative values
    are ignored. Label values for the five minerals the label carries (calcium, cholesterol, iron,
    potassium, sodium) are in mg. FDC supplies no omega-3 and no extras.
  - Name: description (title-cased with English casing rules when it is all capitals) and
    brandName or brandOwner, combined like OFF. Details: barcode, ingredients (no allergen markup),
    category, data source = USDA. No product photo.
- **Saved-label memory** [obs, `BarcodeLabelMemoryTest`, `PendingReviewStateTest`]:
  - When OFF reports not found or missing nutrition (or USDA refuses the key), the error dialog's
    primary action is `Scan label` instead of Retry. It arms a one-shot barcode hand-off and opens
    the camera. The next photo analysis consumes it: source = label, product details = existing
    ones (if any) with this barcode. Every other exit (camera closed or denied, sheet dismissed,
    another method, cancel) clears it.
  - Later scans of the same code that OFF still cannot use reopen the most recent such row as a
    review draft, with a notice explaining that the saved label is being used and that deleting
    those logs forgets it. The notice also survives a restored draft (A).
  - Barcode comparison key: trimmed; all digits → leading zeros removed ("0" if none left), so
    UPC-A and its EAN-13 form match; otherwise lower-cased.
- **Errors shown:** distinct messages for invalid code, not found, missing nutrition, rate limited,
  service unavailable, unexpected response, offline, timeout, network, USDA key refused (points the
  user to the key setting or label scan), and a generic lookup failure. [obs]

### 3.13 Product information and ingredient-label parsing

- **Product block** (review and edit, end of sheet): fields in fixed order barcode, source (only
  for USDA products), package, Nutri-Score, NOVA group, Eco-Score, allergens, may contain, labels,
  categories, ingredient label. Only fields with data and not hidden by the user are shown; the
  whole block can be switched off (setting default on). List fields render as stacked rows. [obs,
  `ProductInfoFieldTest`]
- **Allergen markup → markers:** OFF's plain ingredients text often lacks markers; the marked-up
  version wraps allergens in spans. The spans are turned into underscore markers (edge spaces and
  punctuation stay outside the marker), HTML entities decoded, other spans stripped. If the result
  does not match the plain text word for word (ignoring markers, whitespace and entities), the plain
  text is used. [obs]
- **Parser (display only; never creates nutrition lines)** [obs, `IngredientLabelParserTest`]:
  - Strip a leading "Ingredients:"-style heading (≤ 30 characters, no separators or brackets, a
    known heading stem in ~15 languages incl. CJK, Arabic, Hindi).
  - Split into sentences at full stops outside brackets that are followed by a line break, a
    capitalised word, or a precautionary phrase ("may contain", "contains", "traces", and
    equivalents in ~14 languages, case- and accent-insensitive). Decimals ("8.7%") and "vit. C"
    stay together.
  - The first sentence splits at top-level commas/semicolons (also full-width, ideographic and
    Arabic ones), keeping bracketed sub-ingredients and decimal commas ("8,7%") together;
    whitespace collapsed (incl. no-break spaces), trailing full stops trimmed, empties dropped.
  - 2–60 entries → a list, later sentences → notes. 1 entry or > 60 → the whole label as one
    paragraph (so nothing is cut off and the warning still applies).
  - Underscore markers become bold allergen segments; stray underscores dropped.
  - Entries matching a user sensitivity get a warning icon and bold text; assistive tech announces
    any entry with either kind of emphasis as a possible allergen.

### 3.14 Allergen analysis

- **Inputs:** the profile's sensitivity list (free text, configured elsewhere) and one food.
- **Ladder** (first match wins) [obs, `AllergenAnalysisTest`]:
  1. declared product allergens → *Declared allergen match*;
  2. product traces → *May contain*;
  3. ingredients text, then ingredient line names, then the food name → *Possible allergen*;
  4. nothing (or no sensitivities) → *Unable to assess* (never "safe").
  The result lists the matched sensitivities as the user typed them and one evidence source.
- **Matching:** accent-folded, lower-cased, `xx:` prefix removed, non-alphanumerics → spaces,
  token-based; a token matches itself, itself + "s", or the singular of a candidate ending in "s".
  A multi-word sensitivity also matches when all its tokens appear. [obs]
- **Alias groups** (a sensitivity typed as any key on the left searches for every term on the
  right; terms listed in our own order):

  | Typed sensitivity | Also searched for |
  |---|---|
  | "dairy" or "milk" | lactose, whey, casein, dairy, milk |
  | "soy" or "soya" | soybean, soya, soy |
  | "peanut" or "peanuts" | groundnut, peanut |
  | "nuts" or "tree nut" | the seven common tree nuts: walnut, pistachio, pecan, cashew, almond, macadamia, hazelnut |
  | "wheat" | gluten, wheat |
  | "gluten" | the gluten grains rye, oat, barley, plus wheat and gluten |
- **UI:** one summary line ("<assessment>: <matches>") near the top of review and edit when the
  profile has sensitivities. [obs]

### 3.15 Ingredients, recipe servings and combined meals

- **Shape:** `IngredientLine { name, grams (0 = unknown), kcal: int, proteinG, carbsG, fatG,
  photoRefs[], emoji? }` (i also gives each line an id). Lines carry macros only, no
  micronutrients. [obs]
- **Card:** each line shows thumbnail/emoji, name, "N g · kcal", and P/C/F; tap → editor; an
  empty state text; an add row with a menu; the recipe stepper when eligible. [obs]
- **Add-ingredient menu** (review and edit): Camera, Photos (single image), Barcode, Text, Voice,
  Manual, Favorites, Frequent, Recents. AI and barcode results collapse to one line (name, grams if
  mass known else 0, kcal, macros, emoji; a photo source stores the photo as the line's image).
  A saved-meal pick collapses that row (its nested lines are not expanded; its photos carried).
  Busy spinner while analysing; errors in a dialog; a USDA key refusal uses its own message. The
  in-flight request and any photo it wrote are discarded if the sheet goes away. [obs,
  `BarcodeProductLookupTest`]
- **Line editor:** name, weight (g), energy (user unit), protein, carbs, fat; `Save` enabled when the
  name is non-blank, weight > 0, all values non-negative numbers, kcal finite and < 2³¹−1. Changing
  the weight rescales energy and macros proportionally from an unrounded baseline; editing any
  nutrient value makes the current numbers the new baseline. Existing lines also offer Remove.
  [obs, `IngredientPortionTest`]
- **Applying a line change** (add, edit, remove) [obs, `MealMicronutrientStretchTest`]:
  - Header kcal/macros := sums of the lines (as displayed, i.e. at the current scale).
  - Optional nutrients and extras are stretched by new total grams ÷ old total grams (unchanged if
    old total is 0; all set to 0 if the new total is 0).
  - If the new total grams > 0: base = that total, amount = that total in grams, unit options
    cleared, recipe servings reset to 1. If 0 (all weights unknown): serving left as it was.
- **Recipe servings ("Servings in recipe")** [obs, `RecipeServingsTest`]:
  - Shown only with ≥ 2 lines, mass known and total > 0, and when the draft/row is not already a
    *logged portion* (has any unit named "serving" — i.e. a re-log of a split recipe; splitting
    again would divide the portion). Stepper 1–50 (clamped).
  - Split N: a "serving" unit with gramsPerUnit = total ÷ N replaces any existing "serving" unit and
    is placed first (so it survives the 4-option cap); select it with quantity 1.
  - Line edits while a split is active: the user is editing one portion, so the edited lines are
    multiplied back up (÷ current scale) into a new whole recipe, which is divided into the same N
    again. The chosen unit is kept and its quantity is recomputed, so the displayed amount equals
    the edited portion's grams.
  - Saved later, the row keeps the "serving" unit, so re-logging 2 servings = 2 × portion grams.
- **Combined meal** (Home selection of ≥ 2 rows, area 05 owns the selection UI) [obs,
  `CombinedMealTest`]:
  - Each row becomes one line (grams = its known mass or 0).
  - Name: names (trimmed, non-empty) joined with " + " when ≤ 3; else first two + " + K more" with
    K = count − 2; none → "Combined meal".
  - Timestamp and meal from the latest row; photos = all rows' photos in order, de-duplicated;
    emoji = first available; source manual; mass = sum of line grams when > 0.
  - Micronutrients, extras, notes and product details of the originals are **not** carried (R02.9).
  - The originals are removed in the same write; blocked during a fast.
- **v1 worthiness:** ingredient list, line editor, add via photo/text/barcode/manual/saved, and
  recipe servings — v1. Combined meal — v1 (cheap once Home selection exists). Ingredient-label
  parser — v1-lite (show the label as a paragraph with OFF allergen emphasis; full sentence/list
  split can follow). Allergen analysis — v1 (pure function; needs the profile sensitivity list).
  Add-by-voice — later phase.

### 3.16 Saved meals: Recents, Frequent, Favorites

- **Opened from** the add menu (each list is its own destination with its title), and from the
  add-ingredient menu. [obs] A still stores a "last list" setting, apparently left from an older
  tabbed design. [inf]
- **Recents:** every row logged in the last **30 days** (now − 30 × 24 h), newest first, one item
  per row (not de-duplicated). [obs]
- **Frequent:** rows of the last **90 days** grouped by favourite key (lower-cased name + "|" +
  kcal); the group's template is its most recent row; subtitle "N× logged"; sorted by count
  descending, then name ascending (case-insensitive). [obs]
- **Favorites:** an ordered list of *copies* of rows (snapshots), persisted separately; a favourite
  survives deletion of the original row and does not follow later edits of it. Toggle by favourite
  key: if a favourite with the same key exists it is removed, else a copy is appended (any copy with
  the same id dropped first). Favouriting happens from the edit screen, the Home row (area 05) and,
  on i, swipe actions in Recents/Frequent. A migrates a legacy set-of-keys format once by seeding
  copies from matching diary rows. [obs]
- **Search:** one field per list; case-insensitive substring of the name on the trimmed query; i
  also diacritic-insensitive. Empty states: "no logs", "no favourites" (with a hint to swipe), and
  "no match". [obs]
- **Rows:** 56-pt thumbnail (photo, emoji or a fork-and-knife icon), name with a heart when a
  favourite, kcal, optional subtitle, P/C/F tags, a trailing log button. [obs]
- **Tap a row → review**, never an instant log: the row is converted back into a draft (mass known
  → its grams and options; unknown → one logged serving), its photos loaded, source kept, meal = the
  current-time meal, timestamp = viewed day; Log reuses the row's photo files (A) or writes copies
  (i). Recipe servings are hidden if the row is a logged portion. [obs]
- **Swipe actions:** Favorites: swipe left to remove (A threshold 120 dp, travel capped at 55 % of
  the width; i destructive swipe action). i Recents/Frequent: swipe to favourite/unfavourite. [obs]
- **Reorder favourites:** i drag via an Edit button; A per-row up/down buttons (drag was dropped as
  unreliable inside a sheet). Move semantics: remove at `from`, insert at `to` clamped to the list.
  Reordering is hidden while a search is active, because filtered positions do not map to the
  stored order. [obs]

### 3.17 Copy from Day

- Source date picker (default: the day before the target day); foods of that day grouped by meal in
  fixed order; copy everything (`Copy all` or the primary button with a count), one meal group, or
  one food. Text notes that originals stay unchanged. Empty day → empty state and `Done`. [obs]
- Each copy: new id, timestamp = target day + current time, **meal = the current-time meal** (the
  original meal is not kept, on both platforms), everything else copied. Stops at the first copy a
  fast blocks. [obs] (R02.13, Q2)

### 3.18 Add-menu entries and what each starts

- **Methods** (A 10, i 11): Camera (camera, then photo sheet; A label "Camera + Note"), Photos
  (library picker), Barcode (scanner), Text Input (text sheet), Voice (voice sheet — later phase),
  Manual Entry (form), Recent / Frequent / Favorites (saved lists), Copy from Day (§3.17); i also
  "Siri Phrases" (platform-only). Every method first clears an armed label barcode. [obs]
- **Configuration:** `MenuConfig { version, groups: {id, name, methods[]}[], standalone: methods[] }`
  [obs, `AddMenuConfigTest`]:
  - Default: three groups — Photo & Scan (camera, photos, barcode), Describe Meal (text, voice,
    manual), Reuse Meal (recent, frequent, favorites, copy from day). i stores the same groups in
    reverse order because its menu opens upward (S2 shows Photo & Scan at the top). Default group
    names are stored as ids and localised at display.
  - At most 3 groups; each method appears once (first occurrence wins, groups before standalone);
    unknown method ids dropped; empty groups dropped on save (kept while editing); a blank name gets
    the generic group name; standalone methods show under the groups (version 2; version-1 configs
    with a non-empty group ignore their standalone list).
  - Decode: missing or unreadable → default; everything unknown but something had been configured →
    default; an explicitly empty menu stays empty.
  - Restoring a hidden method: to a named group, to standalone, to the flat list in a flat layout,
    else to the last group (or the first non-empty group when the last is empty).
  - The editor lives in settings; this area only defines the entries.
- **Quick actions** (app-icon shortcuts): 3 slots, default Camera, Voice, Barcode; also Photos,
  Text, Favorites, Frequent, Recent, Manual, Fasting. Food actions reset Home to today and are
  refused during a fast. [obs] (Later phase; see §5.)

### 3.19 Food images: storage, compression, ownership

- **Storage:** each photo is a separate file named by a fresh id; the diary record holds only
  filenames (diary blobs have size limits: i 4 MiB for the whole store). A thumbnail cache sits
  beside it. [obs]
- **New photos** [obs, i `StoredPhotoCompressorTests`]:
  - Longest side > **2048 px** → re-encoded as an upright JPEG at **quality 0.80** capped at 2048 px,
    kept only if smaller than the original; otherwise (small, undecodable, already well
    compressed) the original bytes are kept. A does this before writing; i writes first and
    downscales in a background job that skips the file if it changed meanwhile.
  - i's review screen re-encodes each photo at JPEG quality **0.5** before handing it to the store
    (R02.19).
  - Thumbnails: longest side **320 px**, JPEG quality **0.76**, written at store time or lazily on
    first use; memory cache (A 4/8/12 MB by device class; i 64 items / 12 MB).
  - Decoding always applies EXIF orientation; previews at 720 px, viewer at most 2048 px. A falls
    back to the platform's modern decoder for HEIC/WebP.
  - Photos sent to AI are re-encoded separately (1600 px, quality 0.80; area 03); stored photos are
    never changed by that.
- **Settings tools (owned by settings):** storage usage, clear thumbnail cache, and a confirmed,
  lossy "Compress photos" that caps existing photos at 2048 px, swapping in only smaller copies and
  only if the file is unchanged, skipping everything while a backup restore runs. [obs]
- **Ownership and cleanup** [obs, `FoodEntryPhotoRemovalTest`, i `FoodPhotoRemovalTests`]:
  - Owners: diary rows (including ingredient-line photos), favourites, the pending draft (and other
    areas' records that reference images). A file is deleted only when no owner references it.
  - After an edit, only the files that edit removed are considered. After delete, combine, toggle
    favourite, replace-all or import, a full prune removes unreferenced files and orphan
    thumbnails.
  - If any owner list cannot be decoded, nothing is deleted. Pruning and deletes are skipped while
    a backup restore is replacing photos (generation check).
  - i: when saving a row fails, files written for it are removed unless still referenced.
- **Gallery export:** optional setting (default off) copies logged photos to the device gallery
  (never for re-logs). [obs] Later phase for the PWA.

### 3.20 Persistence guards

- Every change to the diary list is decode + change + encode in one transaction; an unreadable
  stored diary is preserved (raw copy) and never replaced by "the one new row". Reads of an
  unreadable diary show empty while flagging corruption. [obs] (Detailed in the backup/persistence
  area.)
- The first successful log triggers a one-time store-review prompt. [obs] Not applicable.

## 4. File map (what to read in the Read step)

Evidence images: S1 = `/root/reference/fud-ai/store/screenshots/play/04-review-before-you-log.png`
(review toolbar, photo, Name, Quantity with ml unit); S2 =
`/root/reference/fud-ai/store/screenshots/ios/05-log-food-your-way.png` (+ menu groups).

| Sub-area | Reference path | Lines | Read what | Docs / tests to read with it |
|---|---|---|---|---|
| Record | `A/models/FoodEntry.kt` | 171 | all | `T/models/FoodServingRestoreTest.kt` |
| Record (i) | `I/Models/FoodEntry.swift` | 901 | 177–420 (units, record), 650–870 (keys, duplicate, review draft, combine) | `IT/FoodServingRestoreTests.swift` |
| Photos on record (i) | `I/Models/FoodEntryPhoto.swift` | 167 | all | `IT/FoodPhotoRemovalTests.swift` |
| Enums | `A/models/{FoodSource,MealType,FoodLogMethod,QuickAction}.kt` | 13/31/72/26 | all | `T/models/QuickActionTest.kt` |
| Meal schedule | `A/models/MealSchedule.kt` | 44 | all | `T/models/MealScheduleTest.kt` |
| Nutrient units | `A/models/NutrientGoals.kt` | 278 | optional-nutrient table only | — |
| Extras | `A/models/SupplementalNutrient.kt`, `A/models/AminoAcid.kt` | 24/134 | keys, rounding | `T/models/AminoAcidTest.kt` |
| Units | `A/models/ServingUnitOption.kt`; `I/Views/ServingUnitEditor.swift` | 132/228 | all | `IT/ServingUnitEditorTests.swift` |
| Expressions | `A/models/ServingAmountExpression.kt` | 119 | all | `T/models/ServingAmountExpressionTest.kt` |
| Recipe servings | `A/models/RecipeServings.kt` | 103 | all | `T/models/RecipeServingsTest.kt` |
| Ingredients | `A/models/{MealIngredient,IngredientPortion,CombinedMeal,MealMicronutrientStretch}.kt` | 44/18/84/146 | all | `T/models/{CombinedMeal,IngredientPortion,MealMicronutrientStretch}Test.kt` |
| Draft ↔ row | `A/models/{FoodEntryReviewAnalysis,PendingFoodAnalysisDraft}.kt` | 52/21 | all | `T/ui/home/PendingReviewStateTest.kt` |
| Draft shape | `A/services/ai/FoodAnalysis.kt` | 666 | 1–140 only (draft + label scaling); parsing is area 03 | `IT/ServingUnitFallbackTests.swift` |
| Product details | `A/models/{FoodProductMetadata,ProductInfoField}.kt` | 52/64 | all | `T/models/ProductInfoFieldTest.kt` |
| Label parser | `A/models/IngredientLabelParser.kt` | 294 | all | `T/models/IngredientLabelParserTest.kt` (333) |
| Allergens | `A/models/AllergenAnalysis.kt` | 115 | all | `T/models/AllergenAnalysisTest.kt` |
| Label memory | `A/models/BarcodeLabelMemory.kt` | 66 | all | `T/models/BarcodeLabelMemoryTest.kt` |
| Add menu | `A/models/AddMenuConfig.kt`; `I/Models/AddMenuConfig.swift` | 221/196 | all | `T/models/AddMenuConfigTest.kt`, `IT/AddMenuConfigTests.swift` |
| Repository | `A/data/FoodRepository.kt` | 428 | all except health-store retry | — |
| Store (i) | `I/Stores/FoodStore.swift` | 757 | 1–186, 305–500 | — |
| Prefs | `A/data/PreferencesStore.kt` | 1739 | search `Keys`, `foodImageReferenceFilenames`, `updateFoodEntries` | `T/data/PersistedJsonGuardTest.kt` |
| OFF | `A/services/OpenFoodFactsService.kt`; `I/Services/OpenFoodFactsService.swift` | 369/533 | all | `T/services/OpenFoodFactsServiceTest.kt` |
| FDC | `A/services/FoodDataCentralService.kt`; `I/Services/FoodDataCentralService.swift` | 383/416 | all | `T/services/FoodDataCentralServiceTest.kt` (392) |
| Lookup order | `A/services/BarcodeProductLookup.kt` | 75 | all | `T/services/BarcodeProductLookupTest.kt` |
| Images | `A/services/{FoodImageStore,FoodImageDecoder}.kt`; `I/Services/{FoodImageStore,StoredPhotoCompressor}.swift` | 576/151/383/255 | store, decode, prune, compress | `T/services/FoodImageStoreRestoreTest.kt`, `IT/StoredPhotoCompressorTests.swift` |
| Home flows (A) | `A/ui/home/HomeViewModel.kt` | 1255 | 440–1255 (analyse, save, drafts, re-log, manual, reprocess) | `T/ui/home/FoodSubmissionGateTest.kt` |
| Home wiring (A) | `A/ui/home/HomeScreen.kt` | 3229 | 260–420 (menu dispatch), 860–1200 (sheets, errors), 2706–2850 (copy day), 3054–3229 (text, manual) | `T/ui/home/ManualEntryInputTest.kt` |
| Review | `A/ui/home/FoodResultSheet.kt`; `I/Views/FoodResultView.swift` | 1303/1750 | all; i 160–330, 730–880, 1109–1300 (What if) | `T/ui/home/FoodDraftSaversTest.kt` |
| Edit | `A/ui/home/EditFoodEntrySheet.kt`; `I/Views/EditFoodEntryView.swift` | 961/837 | all | — |
| Sheet primitives | `A/ui/home/FoodSheetPrimitives.kt` | 846 | `ServingQuantityCard`, date/time | — |
| Saved meals | `A/ui/home/SavedMealsSheet.kt`; `I/Views/RecentsView.swift` | 721/281 | all | — |
| Photos | `A/ui/home/{ContextNoteSheet,PhotoCaptureDraftViewModel,ContentUriBytes}.kt` | 251/200/33 | all | — |
| Barcode UI | `A/ui/home/BarcodeScannerSheet.kt`; i `ContentView.swift` 3740–3770 | 200 | all | — |
| Ingredient UI | `A/ui/home/{MealIngredientsUi,IngredientIntakeHost,IngredientIntakeViewModel}.kt` | 355/331/119 | all | — |
| Product card | `A/ui/home/FoodProductMetadataCard.kt` | 235 | all | — |
| Manual / text (i) | `I/Views/{ManualEntryView,TextFoodInputView}.swift` | 165/80 | all | — |
| AR scale (i) | `I/Models/PortionScale.swift` | 136 | skim (not for PWA) | `IT/PortionScaleTests.swift` |

Giant files: `I/ContentView.swift` [7966]: search `photosPicker(` (library import, cap 10),
`startAnalysis(` (photo pipeline), `RecentsView(mode:` (saved-meal review), `private func copy(`
(Copy from Day), `supportedTypes` (barcode formats). `A/ui/home/HomeScreen.kt` [3229]: search
`performFoodLogMethod`, `MultiPhotoCaptureSheet(`, `ui.error?.let`. Dead code: `I/Views/ServingSizeInputView.swift`
(91) has no callers. [obs]

## 5. Minimum viable subset (PWA)

**Maps directly (v1):**
- The record shape (§3.1) with all 23 optional nutrients and the 8 sports extras; meal kinds and the
  schedule with validation (§3.2); unit options, expression parser, scaling and unknown-mass rules
  (§3.3); review screen with nutrition unlock, More Nutrition, meal, date/time (§3.5); What-if
  preview with the AI suggestion flow (§3.6, prompt from area 03); edit + reprocess + staged photo
  removal (§3.7); manual entry (§3.8); text input (§3.11); ingredients, recipe servings, combine,
  allergen check (§3.15, §3.14); saved meals with search, swipe-to-remove and reorder (§3.16);
  Copy from Day (§3.17); add-menu configuration and its entries minus Voice/Siri (§3.18); fasting
  block and submission gate (§3.4).
- Barcode lookup order, OFF and FDC mapping, saved-label memory and all error kinds (§3.12),
  product block (§3.13).
- Pending analysis draft (§3.10) — adopt A's behaviour; IndexedDB makes it cheap and it protects
  against tab reloads, which are far more common on the web.

**Needs a web equivalent:**
- Camera: `<input type="file" accept="image/*" capture="environment">` for one-shot capture
  (best support on mobile) with an optional `getUserMedia` in-app camera; library: `<input
  type="file" accept="image/*" multiple>` — the browser cannot cap the selection, so cap at 10 in
  the app and say so; reject the batch if any file is unreadable or > 25 MiB (A rule).
- Image decode/encode: `createImageBitmap(blob, {imageOrientation: "from-image"})` +
  `OffscreenCanvas.convertToBlob({type: "image/jpeg", quality: 0.8})`; 2048 px storage cap, 320 px
  thumbnails at 0.76, 720 px previews. HEIC decodes only in Safari → treat as a conversion error
  elsewhere (Q9).
- Photo storage: Blobs in IndexedDB keyed by id; the diary stores ids; reference-checked cleanup
  in the same transaction family; capture drafts in their own store. Request persistent storage.
- Barcode: `BarcodeDetector` where available (Chromium Android), else a JS/WASM decoder (e.g. a
  ZXing port) for EAN-13/8, UPC-A/E, Code 128/39/93, ITF; add manual digit entry (web-only
  addition, recommended; Q5).
- OFF/FDC from the browser: plain `fetch`. Browsers do not let a page set `User-Agent`; identify
  the app another way OFF accepts (Q4). FDC's `X-Api-Key` header causes a CORS pre-flight. Product
  photo fetch needs CORS on the image host or is skipped (never an error).
- USDA key: stored locally like other BYOK keys (settings area), never put in URLs or logs.
- Quick actions → Web App Manifest `shortcuts` (later phase is fine).

**Out of v1:** voice and add-by-voice, Siri phrases, AR portion scale, on-device label OCR,
health-store fields and sync, gallery export, Share meal, amino-acid estimates (opt-in; keep the
extras map so they can be added), store-review prompt, the "Compress photos" maintenance tool
(new photos are already capped).

## 6. Hard parts / traps

1. **R02.1 Unknown mass must stay unknown.** Restored, label-per-serving and some FDC drafts have no
   food weight. Showing 100 g (or grams at all) and saving `massG = 100` silently rescales later
   edits. Keep a "mass known" flag; offer only a serving-count unit; save the count as the chosen
   quantity and use it as the base on reopen. [`FoodServingRestoreTest`, FDC
   `labelValuesWithoutAServingWeightStayOneLoggedServing`]
2. **R02.2 Two meanings of "serving".** The unknown-mass sentinel and a real recipe/OFF "serving"
   unit share the same unit name in the reference and are told apart only by the mass flag; recipe
   eligibility checks the flag. The rebuild should make the sentinel a distinct kind, not a name.
3. **R02.3 Typed values are at the displayed scale.** In review, a value typed while the amount is
   2× must be stored as typed ÷ 2, or every later amount change doubles it again. Guard scale ≤ 0.
4. **R02.4 Ingredient totals replace the header.** If a draft has lines, header macros are their
   sum; any line change recomputes the header from the lines and stretches micronutrients by the
   gram ratio (0 old grams → unchanged; 0 new grams → zeroed). Do not try to recompute micros from
   lines — lines have none. [`MealMicronutrientStretchTest`]
5. **R02.5 Unlock edits vs lines.** Header macros edited through the unlock are overwritten by the
   next line edit, and lines no longer sum to the header in between. Either accept (reference) or
   warn; do not try to redistribute edits into lines (Q7).
6. **R02.6 Recipe split on a logged portion.** Re-logging a row that already has a "serving" unit
   and splitting again divides the portion (2 servings would log 200 g of a 2 kg pot). Hide the
   control for logged portions; keep the split (same N, same unit, edited portion shown) through
   line edits; put the serving unit first so the 4-option cap keeps it. [`RecipeServingsTest`]
7. **R02.7 Favourite identity is name + kcal.** Two different foods with the same name and kcal
   collide (toggling one removes the other); favourites are snapshots that never follow edits;
   Frequent groups by the same key. Keep this deliberately (users expect "same food" grouping) or
   decide on ids (Q3). Disable reorder while searching — filtered indices do not map back.
8. **R02.8 Shared photo files.** A re-log, favourite and diary row can point at the same file.
   Delete a file only after checking every owner (rows, ingredient lines, favourites, pending
   draft, capture drafts in their own store); skip all deletion if any owner fails to decode; skip
   during restore. Removing a photo from one row must not touch the favourite's copy.
   [`stagedRemovalLeavesOriginalAndSharedSavedMealUnchanged`, i `savedRemovalKeepsFilesShared…`]
9. **R02.9 Combine loses detail.** Combined rows keep only macros (micros, extras, notes, product
   details dropped) and rows with unknown mass contribute 0 g, making the combined mass too small
   for later scaling. Decide whether to sum micros (Q8); at least keep the 0 g line visible.
10. **R02.10 Draft races.** Analysis results arrive while the user may already have logged,
    dismissed or started another scan. Use a generation counter: a late draft save deletes its own
    files; cancel cleanup only touches its own attempt; restore on launch yields to a newer
    analysis. Starting an analysis must discard the previous draft's files.
11. **R02.11 Double submission.** Log/Save/Manual Save must be single-flight; a second tap before
    the write finishes created duplicate rows. [`FoodSubmissionGateTest`]
12. **R02.12 Fasting block is a write-time rule.** The repository refuses new rows during an active
    fast; every caller (log, re-log, copy loop, combine, manual, quick action) must surface the
    "paused" dialog and keep the review open rather than lose it.
13. **R02.13 Meal kind comes from the current clock.** Review default, re-logs and Copy from Day
    use the current time's meal, not the picked time or the original meal; copying yesterday's
    breakfast at 20:00 files it under dinner. Reproduce or fix deliberately (Q1, Q2).
14. **R02.14 Barcode normalisation.** UPC-A scanned as EAN-13 gains a leading zero. Saved-label
    matching and FDC GTIN matching strip leading zeros; OFF requests keep the code exactly as
    scanned. FDC search must OR all variants (raw, stripped, 8/12/13/14-padded) and accept only an
    exact GTIN match — fuzzy search hits are other products. [`BarcodeLabelMemoryTest`,
    `foodsWithoutAnExactGtinAreNeverUsed`]
15. **R02.15 Lookup fallback order.** OFF success always wins over a saved label; saved label and
    USDA are tried only for not-found/missing-nutrition; a USDA outage keeps the OFF error, a
    refused key is surfaced (with Scan label); no key → no request. Same order for Home scans and
    add-ingredient scans. [`BarcodeProductLookupTest`]
16. **R02.16 Per-serving vs per-100 g.** OFF: prefer `_serving`, else scale `_100g`; serving at
    least 1 g; kJ-only energy × 0.23900573614; OFF minerals are grams. FDC: label values are per
    serving, Branded values per 100 g — never mix them when the serving weight is unknown; keep
    servings below 1 g as given. [FDC `per100GramValuesWithoutAServingWeight…`]
17. **R02.17 Photo import truncation.** A picked set with an unreadable or > 25 MiB file must fail
    as a whole (A) — silently analysing 9 of 10 photos gives wrong totals (i does drop silently).
    Cloud-backed picks must be read off the main thread.
18. **R02.18 USDA key hygiene.** Header only, never URL; reject keys with characters outside
    printable ASCII before sending (pasted zero-width spaces broke requests); title-case all-caps
    names with English casing rules (Turkish/Azeri locales produced a dotless "ı").
    [`keysAHeaderCannotCarryAreRefusedWithoutARequest`, `allCapsNamesKeepEnglishCasing…`]
19. **R02.19 Platform photo quality differs.** i re-encodes logged photos at JPEG 0.5; A keeps the
    original bytes up to 2048 px (q 0.80 when downscaled, only if smaller). Pick one rule (A's) and
    never re-encode restored photos. Bake EXIF orientation into thumbnails (A's first thumbnail
    cache lost it and had to be rebuilt).
20. **R02.20 The capture note.** A stores the photo note as the row's note (and Reprocess uses it);
    i drops it on log. Store it (A). Arm/consume the label-scan barcode exactly once and clear it
    on every other exit, or a stale code links an unrelated meal to a product.
    [`pendingLabelBarcodeIsConsumedOnceAndClearedOnCancel`]
21. **R02.21 Edit must not move the timestamp.** Pickers work at minute precision; re-saving an
    untouched entry rewrote its seconds and re-ordered same-minute rows. Keep the original instant
    unless date or minute changed.
22. **R02.22 Expression edge cases.** Trailing operator, letters and division by ~0 are invalid
    (revert on blur, never save 0 or ∞); operator keys replace a trailing operator; accept both `.`
    and the locale separator; Unicode − × ÷. [`ServingAmountExpressionTest`]
23. **R02.23 Add-menu decoding.** Unknown method ids are dropped; a config that becomes empty only
    because of unknown ids falls back to the default, but a deliberately empty menu stays empty;
    v1 configs ignore their flat list when a group has methods. [`AddMenuConfigTest`]
24. **R02.24 Diary writes are transactional.** Append = read + change + write in one transaction;
    a decode failure must preserve the stored diary, never replace it with the new row.
25. **R02.25 Rounding consistency.** A rounds micros to 0.1 in the preview/edit but stores unrounded
    products at log; amino extras round to 0.001. Store unrounded base × scale and round only for
    display, so preview, What-if and stored totals agree.

## 7. Open questions

1. Should the meal kind follow the time picked on the review screen (and on edit when the time
   changes)? Reference: no. Needed: product decision.
2. Should Copy from Day and saved-meal re-logs keep the original meal kind? Reference: both take
   the current-time meal. Needed: product decision.
3. Keep favourite identity as lower-cased name + kcal (snapshot copies), or move to ids with
   "update favourite" on edit? Needed: product decision (affects Frequent grouping too).
4. Open Food Facts and FDC from a browser: do both send CORS headers for these endpoints, how
   should a PWA identify itself to OFF without a User-Agent header, and does
   `images.openfoodfacts.org` allow CORS image fetches? Needed: a live check (REA
   `capture-browser-scenario` or a test page) against the vendor endpoints and OFF's API docs.
5. Add manual barcode digit entry (no reference equivalent)? Recommended for iOS Safari where
   `BarcodeDetector` is missing and camera decoding is weaker. Needed: product decision.
6. Which JS barcode decoder (size vs format coverage)? Needed: build spike on iOS Safari and
   low-end Android.
7. Allow direct nutrition edits on the edit screen (reference only allows them before logging)?
   And should unlock edits warn when lines exist? Needed: product decision.
8. Should Combine sum micronutrients and extras of the originals instead of dropping them?
   Needed: product decision.
9. HEIC photos on non-Safari browsers: reject with a message, or convert with a WASM decoder?
   Needed: product decision + bundle-size check.
10. Amino-acid estimates in v1 or later? (Prompt cost in area 03.) Needed: lead decision.

## 8. What to read later

- Reference docs: none specific to this area (behaviour is in code comments and tests).
- Reference tests that list the edge cases: `T/models/{RecipeServings,ServingAmountExpression,
  MealSchedule,BarcodeLabelMemory,CombinedMeal,FoodEntryPhotoRemoval,FoodEntryThumbnail,
  MealMicronutrientStretch,IngredientLabelParser,AllergenAnalysis,AddMenuConfig,ProductInfoField,
  IngredientPortion,FoodServingRestore}Test.kt`; `T/services/{OpenFoodFacts,FoodDataCentral,
  BarcodeProductLookup,FoodImageStoreRestore}*Test.kt`; `T/ui/home/{FoodSubmissionGate,
  PendingReviewState,ManualEntryInput,FoodDraftSavers}Test.kt`; `IT/{ServingUnitFallback,
  StoredPhotoCompressor,FoodPhotoRemoval,ServingUnitEditor,AddMenuConfig,RecipeServings}Tests.swift`.
- REA Evidence (outside the repo): none produced for this area; site capture
  `ev_fa243a1fe14ed63cc6252910410ee973c07740c25cc70484db1eab53b44d991a` not used.
- Related specs: `03-*.md` (analysis prompts, response parsing incl. unit options and ingredient
  breakdown validation, What-if prompt, AI image preprocessing); `05-*.md` (Home layout, diary
  rows, selection/combine UI, daily totals); fasting spec (active-fast rule); settings spec (meal
  schedule editor, prefer-grams, product-info toggles, USDA key, add-menu editor, energy unit,
  photo storage tools); backup spec (diary/favourites/photos persistence and restore).
