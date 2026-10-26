# Task: water units and quick-add amounts (P01-05) · Phase: 01 · Owner: builder (wt-p01b1)

<!-- Save as platewise/docs/notes/P<nn>/<slug>.md. Write everything above "Compare checklist"
BEFORE writing code, in your own words. Never paste or paraphrase the reference line by line. -->

Read (reference @ `10e14b67`): `A/models/WaterUnit.kt`, `A/models/WaterQuickAddPresets.kt`,
`T/models/WaterQuickAddPresetsTest.kt`, `IT/WaterQuickAddPresetsTests.swift`; research spec
`05-home-progress.md` §3.6 (settings, quick-add, logging and display) and §6 R05.10;
decision D-16.39; traps ledger row R05.10. No Evidence ids.

What it does (own words): water is stored in whole ml. A person reads it in ml or US fluid ounces
(1 fl oz = 29.5735295625 ml). Shown amounts are a grouped whole number of ml, or fluid ounces as a
whole number when the value is within 0.05 of one, else with one decimal. The daily goal wheel
runs 50–10 000 ml in steps of 50 or 2–338 fl oz in steps of 1 and opens on the stored goal rounded
to the nearest step. Three quick-add amounts (1–5 000 ml each, kept smallest first, 250/500/750
when the stored value is anything else) are edited in three text fields in the current unit: ml
fields take digits only (5 characters), fl oz fields digits and one decimal place with a comma or
a dot (6 characters). Empty, zero or above 5 000 ml is an error; a field the person did not change
keeps its exact stored ml so 250 ml does not drift to 251 through "8.5" fl oz. A custom amount is
converted to ml, rounded, at least 1 and at most 5 000 ml (D-16.39).

Inputs → outputs:
- `waterDisplayValue(ml, unit)` → number (`8`, `8.5`, `1000`); `formatWater(ml, unit, locale)` →
  `"1,000"`, `"8"`, `"8.5"`.
- `waterAmountMl(value, unit)` → whole ml in 1–5 000, or `null` for ≤ 0, non-finite or above the
  cap (used by the custom amount and the editor).
- `WATER_GOAL_WHEEL[unit]`, `waterGoalStart(goalMl, unit)`, `waterGoalSave(picked, start,
  storedMl, unit)`.
- `decodeQuickAdd(raw)` → sorted triple or the defaults; `sortQuickAdd(amounts)`.
- `filterWaterField(text, unit)`, `waterFieldText(ml, unit)`, `parseWaterField(text, unit)` →
  ml or `null`; `quickAddFieldMl(field, unit)` and `quickAddFromFields(fields, unit)` with
  `{text, savedText, savedMl}` per field.
- `WATER_MEASURES`, `WaterMeasure` (`'ml' | 'flOz'`, the `water.unit` setting), `isWaterMeasure`.

Files: created `src/domain/units/water.ts`, `src/domain/units/water.test.ts`, this note. Uses
`readPlainNumber`, `formatFixed` and `clamp` from `numbers.ts`.

Edge cases / failure modes:
- 237 ml → 8.014 fl oz → "8"; 250 ml → 8.45 → "8.5"; a value 0.04 below a whole number shows the
  whole number.
- Decoding: not an array, two or four values, a value of 0 or 5 001, a non-integer (250.5), a
  string or `null` inside → defaults; duplicates are allowed (200, 200, 330); the result is a new
  sorted array, the input is never mutated.
- Editor: "8" fl oz → 237 ml; "8,5" → 251; "170" fl oz → 5 028 ml → error; "" and "0" → error;
  "5001" ml → error. The filter drops letters, a second decimal mark and a second decimal digit,
  and keeps the person's own mark (comma or dot).
- Untouched field: its text equals the text it opened with → its saved ml as is (R05.10 a).
- Custom amount: 0.4 ml → 1 ml; 6 000 ml → refused; 169.1 fl oz rounds to 5 001 ml → refused
  (R05.10 b, D-16.39).
- Goal wheel: 2 000 ml → 67.6 fl oz → opens at 68; 2 030 ml opens at 2 050 in ml; values outside
  the range clamp to the ends.

Our design differences / decisions:
- Names are ours; quick-add amounts are stored as a number array (`water.quickAddMl`), not as
  comma-separated text, so the decoder takes an unknown value and checks it is an array.
- The editor filter keeps the decimal mark the person typed instead of turning a comma into a dot.
- The goal wheel keeps the stored goal when it is saved without being moved, in either unit (the
  same rule as the kJ calorie wheel, R06.20). Not in the spec; decision for the lead.
- The quick-add editor works per field object (`{text, savedText, savedMl}`), so the UI can show
  the error under the field that has it and enable Save only when all three resolve.

Tests we will write:
- Display: 237 → "8", 250 → "8.5", 1 000 ml → "1,000" (en-US) / "1.000" (de-DE), fl oz one decimal
  with a comma in de-DE.
- Editor: field text, filters, parse cases above; untouched 250 ml stays 250 after a fl oz round
  trip, a changed field converts (R05.10).
- Decoding table; [500, 250, 750] → [250, 500, 750]; [250, 500] → defaults.
- Custom: 6 000 ml refused, 0.4 ml → 1, 5 000 accepted, fl oz rounding over the cap refused.
- Goal wheel ranges, steps, nearest-step seeding, clamping, untouched save.

Compare checklist (filled after the rewrite; reopened `A/models/WaterUnit.kt`,
`A/models/WaterQuickAddPresets.kt`, `T/models/WaterQuickAddPresetsTest.kt`,
`IT/WaterQuickAddPresetsTests.swift`):
- [x] Display: whole fl oz within 0.05, else one decimal; grouped ml (tested in
  `src/domain/units/water.test.ts > waterDisplayValue > shows fl oz whole within 0.05 of a whole
  number, else with one decimal`, `> shows whole ml`, `formatWater > groups ml the locale way`,
  `> writes fl oz whole or with one decimal in the locale marks`).
- [x] Conversion to ml rounds and is at least 1 (`water.test.ts > waterAmountMl > converts to whole
  ml`, `> gives at least 1 ml for any amount above zero`).
- [x] Decoding: the reference's invalid list (missing, empty, garbage, two, four, 0, 5 001, a
  non-number) falls back (`water.test.ts > decodeQuickAdd > falls back to 250, 500 and 750 for
  anything else`); valid amounts come back smallest first, duplicates allowed (`> returns three
  valid amounts smallest first`); stored order (`sortQuickAdd > puts the amounts in storage
  order`).
- [x] Editor text: "1000", "8", "8.5" (`water.test.ts > waterFieldText > opens with plain digits in
  the current unit`).
- [x] Edited amounts: "200" ml, "8" → 237, "8,5" → 251; "", "0", "5001", "170" fl oz refused
  (`water.test.ts > parseWaterField > converts the typed amount to ml`, `> refuses empty, zero and
  amounts above 5 000 ml`).
- [x] Input filter: "2a5.0" ml → "250"; "8,57" fl oz keeps one decimal place
  (`water.test.ts > filterWaterField > keeps up to five digits for ml`, `> keeps digits, one
  decimal mark and one decimal place for fl oz`).
- [x] Nothing saves while a field is empty or out of range; per-field results [237, null, 750];
  no fields → nothing (`water.test.ts > quick-add editor > saves nothing while any field is empty,
  zero or above 5 000 ml`, `> needs exactly three fields`).
- [x] R05.10 (a): untouched fl oz fields keep exact ml, a changed one converts
  (`water.test.ts > quick-add editor > keeps the exact stored ml of a fl oz field that was not
  touched (R05.10)`, `> converts only the fields that changed`).
- [x] R05.10 (b) / D-16.39: custom amount capped at 5 000 ml, 0.4 ml → 1 (`water.test.ts >
  waterAmountMl > caps a custom amount at 5 000 ml (R05.10, D-16.39)`, `> gives at least 1 ml for
  any amount above zero`).
- [x] Goal wheel ranges, nearest-step seeding and clamping (`water.test.ts > water goal wheel >
  runs 50–10 000 ml in steps of 50 or 2–338 fl oz in steps of 1`, `> opens on the stored goal
  rounded to the nearest step`, `> keeps the opening position inside the wheel`, `> keeps the
  stored goal when the wheel was not moved`, `> converts a moved wheel to whole ml`).
- Deliberate differences: quick-add amounts are a stored number array, not comma-separated text;
  the custom amount has the 5 000 ml cap (D-16.39) where the reference allows 99 999; the filter
  keeps the typed comma instead of turning it into a dot; a fl oz field holds 6 characters with or
  without a decimal mark (the reference allows 5 without one); setting value `flOz`.
- Not taken: the "250 · 500 · 750 ml" settings summary and unit labels (UI copy, P07-06, built
  from `formatWater`); storage keys and the unit's stored spelling (P02-04).

## Decisions for the lead

- `waterGoalSave` keeps the stored goal when the wheel is saved where it opened, in either unit
  (same rule as R06.20 for the kJ calorie wheel; without it 2 000 ml opened in fl oz and saved
  becomes 2 011 ml). Not in the spec.
- `decodeQuickAdd(raw: unknown)` expects an array of numbers (the `water.quickAddMl` setting); a
  comma-separated string falls back to the defaults.
- The custom amount sheet uses `parseWaterField` (same filter, conversion and 1–5 000 ml range as
  the quick-add editor).
- `formatWater` writes fl oz with the locale's decimal mark; `waterFieldText` always writes a dot
  (the field accepts both).
- Extra exports beyond the phase row: `waterDisplayValue`, `WATER_AMOUNT_MIN_ML`,
  `WATER_AMOUNT_MAX_ML`, `WATER_FIELD_MAX_LENGTH`, `QuickAddField`, `quickAddFieldMl`.

## Status

Done (2026-10-26). `water.ts` and 28 tests, all passing; nothing outside the slice's files changed.
Trap covered: R05.10 (water parts a and b).
