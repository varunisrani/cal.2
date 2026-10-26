# Task: water units and quick-add amounts (P01-05) · Phase: 01 · Owner: builder (wt-p01b1)

<!-- Save as platewise/docs/notes/P<nn>/<slug>.md. Write everything above "Compare checklist"
BEFORE writing code, in your own words. Never paste or paraphrase the reference line by line. -->

Read (reference @ `10e14b67`): `A/models/WaterUnit.kt` (all), `A/models/WaterQuickAddPresets.kt`
(all), `T/models/WaterQuickAddPresetsTest.kt` (all), `IT/WaterQuickAddPresetsTests.swift` (all);
to confirm how the goal wheel seeds and saves and how the custom field filters, the water goal
sheet in `A/ui/settings/SettingsScreen.kt` (lines 3906–3935) and the custom amount sheet in
`A/ui/home/WaterViews.kt` (lines 40–80). Research spec `05-home-progress.md` §3.6 (settings,
quick-add, logging and display), §6 R05.10 (a, b); decision D-16.39; traps ledger rows owned by
P01-05. No Evidence ids.

What it does (own words): water is stored in millilitres and can be read in ml or US fluid ounces
(1 fl oz = 29.5735295625 ml). Amounts are shown as a whole, grouped ml number, or in fl oz as a
whole number when the value is within 0.05 of one and otherwise with one decimal. The daily goal
is picked on a wheel (50–10 000 ml in steps of 50, or 2–338 fl oz in steps of 1) that opens on the
stored goal rounded to the nearest step. Three quick-add buttons hold amounts of 1–5 000 ml, kept
smallest first; anything stored that is not exactly three such whole numbers reads as 250 / 500 /
750. The editor for those amounts and the custom-amount field accept only digits (ml, at most 5
characters) or digits with one decimal place (fl oz, comma or dot, at most 6 characters); an
empty, zero or over-5 000 ml value is an error. A field the person did not change keeps its exact
stored ml, so 250 ml does not become 251 ml after a save in fl oz (R05.10). A custom amount is
converted to ml, rounded, at least 1 ml and at most 5 000 ml (D-16.39).

Inputs → outputs:
- `waterToDisplay(ml, unit)` (unrounded); `waterShown(ml, unit)` → the number to show;
  `formatWater(ml, unit, locale)` → grouped text without the unit word.
- `WATER_GOAL_WHEEL[unit]` → `{min, max, step}`; `waterGoalStart(goalMl, unit)` → opening value;
  `waterGoalSave(picked, start, storedMl, unit)` → ml to store.
- `decodeQuickAdd(value)` → three ascending ml amounts (defaults on anything else).
- `amountToMl(value, unit)` → ml or null (> 0, rounded, ≥ 1, ≤ 5 000); `maxAmountShown(unit)` →
  the largest amount a field accepts in that unit (for the error text).
- `filterAmountText(raw, unit, locale)` → the field text after each keystroke;
  `amountText(ml, unit, locale)` → the field text for a stored amount; `parseAmountText(text,
  unit, locale)` → ml or null.
- `quickAddFieldMl(text, savedMl, unit, locale)` → ml or null, keeping `savedMl` when the text is
  the one the editor seeded; `quickAddFromFields(texts, saved, unit, locale)` → three ascending ml
  or null.
- `WATER_DISPLAY_UNITS` (`ml`, `flOz`), `isWaterDisplayUnit`, `ML_PER_FL_OZ`,
  `DEFAULT_WATER_UNIT` (ml), `DEFAULT_WATER_GOAL_ML` (2 000), `DEFAULT_QUICK_ADD_ML`,
  `WATER_AMOUNT_MAX_ML`.

Files: created `src/domain/units/water.ts`, `src/domain/units/water.test.ts`, this note.

Edge cases / failure modes:
- 237 ml → 8.01 fl oz → "8"; 250 ml → 8.45 → "8.5"; 1 000 ml → "1,000" (en-US) / "1.000" (de-DE);
  fl oz values just under and over a whole number (8.04 → 8, 8.06 → 8.1, 8.96 → 9).
- Goal wheel: 2 000 ml opens at 2 000 ml or 68 fl oz; 2 025 ml rounds to 2 050; 30 ml → 50;
  20 000 ml → 10 000; 10 ml → 2 fl oz; 20 000 ml → 338 fl oz.
- Typing "8" fl oz stores 237 ml; "8,5" or "8.5" stores 251 ml; "170" fl oz (5 028 ml) is refused;
  "0", "0.0", "" and "5001" ml are refused; "0.1" fl oz is 3 ml.
- Custom amount: 6 000 ml refused (cap 5 000, D-16.39); 0.4 ml → 1 ml (minimum 1); 5 000 accepted.
- Stored quick-add amounts: `[500, 250, 750]` → `[250, 500, 750]`; duplicates allowed; two or four
  values, 0, 5 001, fractions, strings, `null`, a non-array → defaults. Decoding returns a fresh
  array, never the shared default.
- Field filter: ml keeps ASCII digits only, at most 5; fl oz keeps digits and the first decimal
  mark (comma, dot or the locale's mark, written as the locale's mark) with one digit after it,
  at most 6 characters in all; a second mark and anything after it are dropped.
- The editor's untouched check compares the field with the text it seeded, so retyping the same
  text also keeps the exact amount.
- `maxAmountShown('flOz')` is 169 (169.1 fl oz would round to 5 001 ml and be refused, so the error
  never names a value the field then rejects).

Our design differences / decisions:
- Names are ours; unit values follow 17 §1.3 (`ml`, `flOz`); stored quick-add amounts are a JSON
  array of numbers (our settings record), not comma-separated text.
- Custom amounts are capped at 5 000 ml (D-16.39); one function (`amountToMl`) serves the
  quick-add editor and the custom sheet.
- Field texts use the locale's decimal mark ("8,5" in de-DE) instead of always a dot; any typed
  comma or dot becomes that mark. Decision for the lead.
- The goal wheel in fl oz keeps the exact stored ml when it was not moved, like the kJ calorie
  wheel (R06.20); otherwise 2 000 ml opened at 68 fl oz and saved untouched would become 2 011 ml.
  The ml wheel saves what it shows. Decision for the lead (the reference has no such rule).
- Unit words ("ml", "fl oz") and the error sentence are catalogue copy for the UI phases.

Tests we will write:
- `waterShown` / `formatWater` for 237, 250, 1 000 ml in both units and locales, and the
  near-whole fl oz cases; conversions are inverse.
- Goal wheel ranges; `waterGoalStart` rounding and clamping in both units; `waterGoalSave` keeps
  2 000 ml for an untouched fl oz wheel, converts a moved one, saves the ml pick.
- `decodeQuickAdd` table (Verify plus our own bad values) and ascending order.
- `amountToMl` for 8 fl oz, 8.5 fl oz, 170 fl oz, 0, negatives, NaN, 6 000 ml, 0.4 ml, 5 000 ml.
- `filterAmountText` for ml and fl oz in en-US and de-DE; `amountText` 1 000 ml, 237 and 250 ml in
  fl oz (en-US, de-DE); `parseAmountText` for "8", "8,5", "8.5", "170", "", "0", "5001".
- `quickAddFromFields`: untouched fl oz fields keep 250/500/750 exactly (R05.10); one edited field
  ("8") gives 237; an empty or out-of-range field gives null; the result is ascending; wrong field
  counts give null; `quickAddFieldMl` per field.
- Guard accepts `ml`, `flOz`, rejects `floz`, `fl oz`.

Compare checklist (filled after the rewrite; reopened `A/models/WaterUnit.kt`,
`A/models/WaterQuickAddPresets.kt`, `T/models/WaterQuickAddPresetsTest.kt`,
`IT/WaterQuickAddPresetsTests.swift`):
- [x] Default unit ml, unknown stored units fall back (guard plus `DEFAULT_WATER_UNIT`)
  (`src/domain/units/water.test.ts > water units > defaults to ml, a 2 000 ml goal and 250 / 500 /
  750 quick-add amounts`, `> guards the two unit values`, `> converts with 1 fl oz = 29.5735295625
  ml`).
- [x] Display: grouped whole ml; fl oz whole within 0.05, else one decimal (`water.test.ts >
  waterShown > shows fl oz as a whole number within 0.05 of one, else with one decimal`, `> shows
  whole ml`; `formatWater > writes ml as a grouped whole number and fl oz with at most one
  decimal`).
- [x] Conversion to ml rounds and is at least 1 ml (`water.test.ts > amountToMl > converts to whole
  ml`, `> raises a tiny amount to 1 ml`, `> refuses zero, negative and non-finite amounts`).
- [x] Stored amounts: wrong count, out of range or unreadable → defaults; valid ones smallest
  first, duplicates kept (`water.test.ts > decodeQuickAdd > reads three amounts and keeps them
  smallest first`, `> falls back to 250 / 500 / 750 for anything that is not three amounts of
  1–5 000 ml`, `> returns a new array every time`).
- [x] Field text: plain ml digits, fl oz as shown (`water.test.ts > amountText > seeds ml fields
  with plain digits`, `> seeds fl oz fields with the shown value and the locale mark`).
- [x] Field filter: ml digits only, fl oz one decimal place with comma or dot (`water.test.ts >
  filterAmountText > keeps at most five digits for ml`, `> keeps one decimal place for fl oz,
  written with the locale mark`, `> keeps at most six characters for fl oz`).
- [x] Edited text → ml within 1–5 000: "8" → 237, "8,5" → 251, "", "0", "5001", "170" fl oz
  refused (`water.test.ts > parseAmountText > reads fl oz with a comma or a dot`, `> refuses empty,
  zero and over-the-limit fields`).
- [x] Saving the editor: nothing while a field is empty or out of range; untouched fl oz fields
  keep their exact ml; per-field values for the error state (`water.test.ts > quickAddFromFields >
  saves nothing while a field is empty, zero or over the limit`, `> keeps the exact ml of a field
  left untouched in fl oz (R05.10)`, `> converts only the fields that were edited`, `> stores the
  amounts smallest first`, `> needs exactly three fields and three stored amounts`;
  `quickAddFieldMl > keeps the stored ml of a field still showing its seeded text`, `> reads an
  edited field`).
- [x] Goal wheel ranges, seeding and saving (from the spec and the reference's settings sheet)
  (`water.test.ts > goal wheel > spans 50–10 000 ml in 50s or 2–338 fl oz in 1s`, `> opens on the
  stored goal rounded to the nearest step`, `> keeps the opening value inside the range`, `> keeps
  the exact stored ml when the fl oz wheel was not moved`, `> converts a moved fl oz wheel and
  stores what the ml wheel shows`).
- [x] Custom amount capped at 5 000 ml, and the error names a maximum the field accepts
  (`water.test.ts > amountToMl > caps a custom amount at 5 000 ml (R05.10, D-16.39)`, `> names a
  maximum the field itself accepts`).
- Deliberate differences: custom amounts capped at 5 000 ml (D-16.39); quick-add amounts stored as
  a number array rather than comma-separated text; field texts written with the locale's decimal
  mark; the fl oz goal wheel keeps the stored goal when untouched; a fl oz field without a decimal
  mark may hold 6 characters (the spec's limit) where the reference stops at 5.
- Not taken: the settings-row summary "250 · 500 · 750 ml" and unit labels (catalogue copy, P09);
  the comma-text encoder (our storage is an array).

## Decisions for the lead

- The fl oz goal wheel keeps the exact stored ml when it was not moved (the reference converts the
  rounded wheel value, so 2 000 ml becomes 2 011 ml after an untouched save). Same idea as R06.20;
  removing it is one line in `waterGoalSave`. Needs a D-id if kept.
- Amount fields show and accept the locale's decimal mark ("8,5" in de-DE); a typed comma or dot is
  rewritten as that mark. The reference always writes a dot.
- `maxAmountShown('flOz')` is 169, the largest one-decimal fl oz value the field accepts, for the
  error text.
- Extra exports beyond the phase row: unit list, type (`WaterDisplayUnit`, avoiding the reference's
  name) and guard, `DEFAULT_WATER_UNIT`, `DEFAULT_WATER_GOAL_ML`, `ML_PER_FL_OZ`, `waterToDisplay`,
  `waterShown`, `formatWater`, `WATER_GOAL_WHEEL`, `waterGoalStart`, `waterGoalSave`,
  `WATER_AMOUNT_MIN_ML`, `WATER_AMOUNT_MAX_ML`, `DEFAULT_QUICK_ADD_ML`, `decodeQuickAdd`,
  `amountToMl`, `maxAmountShown`, `filterAmountText`, `amountText`, `parseAmountText`,
  `quickAddFieldMl`, `quickAddFromFields`.

## Status

Done (2026-10-26). `src/domain/units/water.ts` and its tests (33) are in place, all passing.
Nothing outside the slice's files changed. Trap covered: R05.10 (water part: untouched fields and
the 5 000 ml cap).
