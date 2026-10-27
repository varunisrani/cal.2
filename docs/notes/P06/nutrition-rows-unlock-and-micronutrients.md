# Task: nutrition rows, unlock and micronutrients (P06-08) · Phase: 06 · Owner: builder (wt-p06s2a, slice S2a)

<!-- Save as platewise/docs/notes/P<nn>/<slug>.md. Write everything above "Compare checklist"
BEFORE writing code, in your own words. Never paste or paraphrase the reference line by line. -->

Read (reference @ `10e14b67`): `A/ui/home/FoodResultSheet.kt` (the scaled values, the text-to-base
helpers, the nutrition header with the lock, the value row that turns into a field, the More
Nutrition list and the line-change handler that overwrites the header), `I/Views/FoodResultView.swift`
lines 730–880 (the entry built from the scaled values) and 160–330 (the decimal and energy helpers,
the safe inverse scale, the lock toggle). Research spec `02-food-logging.md` §3.1 (nutrient set),
§3.3 (scaling rules), §3.5 (unlock), §6 R02.3–R02.5, R02.25. Domain already built:
`src/domain/servings/scale.ts` (`baseFromTyped`, `shownTenth`, `scaleFor`), `src/domain/units/
energy.ts`, `src/domain/nutrients/catalogue.ts`. Ledger rows naming P06-08: R02.5, ACC-D1-1,
ACC-D10-1.

What it does (own words): the nutrition card shows energy (in the person's unit, kcal or kJ),
protein, carbs and fat for the amount chosen above: every stored value times the scale. Its header
has a lock: tapping it turns every row, and every micronutrient row, into a decimal field filled
with the value on screen. What the person types describes the amount on screen, so it is stored
divided by the scale (40 g of protein typed at twice the amount stores 20, and shows 40, R02.3).
For energy, protein, carbs and fat an empty, negative or unreadable entry counts as 0; for the
optional values it means unknown (shown "—", never 0). Tapping the lock again shows text again with
the edits kept; the unlock is per sheet and starts locked. When the food has ingredient lines, the
header numbers are the lines' sums, and a later line change replaces values edited here (accepted
behaviour, R02.5); a short hint says so while unlocked. Below, a collapsed "Micronutrients" row
opens the 23 optional nutrients and then the 8 sports extras, each scaled and shown to 0.1 with its
unit, or "—" when unknown.

Inputs → outputs: `NutritionRows` takes the base energy and macros, the scale, the energy unit,
`unlocked` and `onUnlockedChange`, whether lines exist, and `onChange(key, base)`; `MoreNutrition`
takes the base nutrients and extras, the scale, `unlocked` and `onNutrientChange(key, base |
undefined)` / `onExtraChange(key, base | undefined)`.

Files: created `src/features/log/review/NutritionRows.tsx` (+ `NutritionRows.test.tsx`),
`src/features/log/review/MoreNutrition.tsx` (+ `MoreNutrition.test.tsx`), styles in
`src/features/log/review/review.module.css`, words in `src/i18n/en/review.ts`, this note.

Edge cases / failure modes:
- Scale 0 or not a number: treated as 1 by `baseFromTyped`, so nothing is divided by 0.
- "−5" kcal, "abc" protein, "" fat → 0. "" or "−1" sodium → unknown, shown "—".
- A half-typed "40." keeps its text while the field is open: the field shows what was typed for as
  long as the stored value and the scale are the ones the typing produced; when the amount or a
  line changes, it shows the new value.
- Energy in kJ: the field opens with whole kJ; a typed kJ value becomes whole kcal and is then
  divided by the scale; an untouched field never converts back, so the kcal stays exact (R06.20).
  The base energy may then be a fraction of a kcal, so the energy shown matches what was typed;
  the logged entry is whole kcal (the domain rounds at log).
- Locking again: fields close, values stay; unlocking again opens them at the values on screen.
- Collapsed micronutrients while unlocked: opening them shows fields.

Our design differences / decisions:
- Names, words and the hint are ours; the section is "Micronutrients".
- Micronutrient order follows our nutrient catalogue (grams, then milligrams, then micrograms,
  alphabetical inside each group), then the 8 extras in their catalogue order; the reference lists
  them in its own label order.
- Values are displayed with the browser's number format (up to one decimal) and edited as plain
  text with a dot; typed text accepts a dot or the locale's decimal mark.
- No amino-acid rows (later decision, 02-Q10).
- The lock is an icon button with a name that says what it does ("Edit nutrition" / "Done
  editing") and `aria-pressed`.

Tests we will write:
- `NutritionRows.test.tsx`: at scale 2, typing protein 40 stores base 20 and shows 40
  (ACC-D10-1, R02.3); −5 kcal → 0; "abc" and empty → 0; locking keeps the edits and shows text;
  kJ: shows the kJ value, a typed kJ value is stored as kcal ÷ scale, an untouched field changes
  nothing (R06.20); a half-typed "40." keeps its text; the lines hint shows only with lines and
  only while unlocked.
- `MoreNutrition.test.tsx`: collapsed by default, opens to 23 then 8 rows in order; scaled to 0.1
  with units; an unknown sodium shows "—" (ACC-D1-1); clearing sodium while unlocked → unknown and
  "—" after locking; a negative entry → unknown; typed values divided by the scale; extras the
  same.
- `ReviewSheet.test.tsx`: with lines, a later line change overwrites edited header values (R02.5);
  the header opens as the lines' sum; the lock is shared by the core and micronutrient rows and
  starts locked each time the sheet opens.

Compare checklist (filled after the rewrite; reopened `FoodResultSheet.kt`, `FoodResultView.swift`):
- [x] Core rows at the shown amount, energy in the person's unit
  (`src/features/log/review/NutritionRows.test.tsx > NutritionRows > shows energy and macros at
  the shown amount as text while locked`)
- [x] Typed ÷ scale (`> stores protein typed at twice the amount as half, and shows what was typed
  (ACC-D10-1, R02.3)`; `src/features/log/review/MoreNutrition.test.tsx > MoreNutrition > stores
  what is typed divided by the scale, for nutrients and extras alike (R02.3)`)
- [x] Negative or unreadable → 0 for core, unknown for optional; empty optional → unknown
  (`NutritionRows.test.tsx > NutritionRows > stores 0 for negative, unreadable or empty energy and
  macros`; `MoreNutrition.test.tsx > MoreNutrition > makes a cleared sodium unknown, shown as a
  dash once locked`, `> makes a negative or unreadable value unknown, never 0`)
- [x] Locking keeps the edits; unlocking opens at the values on screen; one lock for both lists,
  locked at first (`NutritionRows.test.tsx > NutritionRows > keeps the edits when locked again, and
  opens the fields at the values on screen`, `> keeps a half-typed 40. in the field`;
  `ReviewSheet.test.tsx > ReviewSheet > shares one lock between the nutrition rows and the
  micronutrients, locked at first`)
- [x] Energy in kJ, untouched never converts back (`NutritionRows.test.tsx > NutritionRows > shows
  kilojoules, stores a typed kJ value as kcal over the scale, and never converts an untouched field
  (R06.20)`)
- [x] Header = lines' sums; a later line change replaces unlock edits; the hint
  (`ReviewSheet.test.tsx > ReviewSheet > opens with the lines' sum as the header (R02.4) and lets
  the next line change replace values edited through the unlock (R02.5)`; `NutritionRows.test.tsx >
  NutritionRows > says that a change of ingredients adds the values up again, only while unlocked
  and only with lines (R02.5)`, `> shows no hint for a food without lines`)
- [x] Micronutrients collapsed, 23 then 8, each to 0.1 or a dash (`MoreNutrition.test.tsx >
  MoreNutrition > starts collapsed and opens to the 23 nutrients, then the 8 extras, in catalogue
  order`, `> shows each value at the shown amount to 0.1 with its unit, and a dash when unknown
  (ACC-D1-1)`)
- Mutation check: storing the typed protein without dividing by the scale fails 2 tests.
- Deliberate differences: micronutrient order is our catalogue's (grams, mg, mcg, alphabetical in
  each; then the extras), not the reference's label order; values read up to one decimal with
  trailing zeros dropped ("820", the reference "820.0"); the base energy is not rounded after a
  typed value, so the energy on screen is the one typed (the reference rounds the base to a whole
  kcal; the logged entry is whole kcal either way); an open field follows a change of amount or
  lines (the reference keeps stale text until the lock is toggled); the hint about lines is ours
  (R02.5 "warn" option).
- Not taken: amino-acid rows (02-Q10, later).

## Status

Done (2026-10-27). Created `src/features/log/review/NutritionRows.tsx` (+ 8 tests; exports
`ValueRow`, `valueKey`, `macroText`), `src/features/log/review/MoreNutrition.tsx` (+ 5 tests;
exports `optionalBase`), styles in `review.module.css`, words `review.nutrition.*`,
`review.nutrient.*`, `review.extra.*`, `review.more.*`, `review.unknown`, this note. Hooks:
`review.nutrition`, `review.lock`, `review.{kcal,protein,carbs,fat}`, `review.nutrition.hint`,
`review.more`, `review.more.toggle`, `review.more.<nutrient or extra key>`. Shared: the `lock` and
`unlock` icons in `src/ui/icons/index.tsx`. Nutrient names live in the `review` partition until a
shared nutrients partition exists (P05-12's goals sheet needs the same names).
