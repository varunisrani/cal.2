# Task: energy units, kcal and kJ (P01-03) · Phase: 01 · Owner: builder (wt-p01b1)

<!-- Save as platewise/docs/notes/P<nn>/<slug>.md. Write everything above "Compare checklist"
BEFORE writing code, in your own words. Never paste or paraphrase the reference line by line. -->

Read (reference @ `10e14b67`): `A/models/EnergyUnit.kt` (all), `I/Models/UnitPreferences.swift`
(the energy part), `T/models/EnergyUnitTest.kt`, `IT/EnergyUnitTests.swift`; research spec
`01-profile-goals.md` §3.2 (energy unit bullets) and §6, `06-settings-data.md` §3.3 and §6 R06.20;
decisions D-16.12; traps ledger row R06.20. No Evidence ids.

What it does (own words): every energy number is stored in kcal. A person may choose to read and
type energy in kJ instead; this module is the only place that turns kcal into what is shown and
typed amounts back into kcal (1 kcal = 4.184 kJ). kJ values on screen are whole numbers; charts and
averages may use the unrounded amount. Typed text is read in the person's locale (grouping and
decimal marks), with a fallback that treats a comma as the decimal mark, and anything that is not a
plain non-negative number is refused. The calorie goal wheel covers the same span in both units
(kcal 800–6 000 step 50, kJ 3 400–25 100 step 100); it opens on the goal snapped down to a step and
kept inside the range. Because a kcal goal almost never sits on a 100 kJ step, saving a kJ wheel
that was not moved keeps the stored kcal exactly instead of nudging it.

Inputs → outputs:
- `toDisplay(kcal, unit)` → whole kJ (`round(kcal × 4.184)`) or the kcal value unchanged;
  `toDisplayExact(kcal, unit)` → the unrounded amount for charts and averages.
- `fromDisplay(value, unit)` → whole kcal (`round(value ÷ 4.184)` for kJ, `round(value)` for kcal).
- `parseEnergy(text, locale)` → the typed number in the display unit, or `null`.
- `ENERGY_GOAL_WHEEL[unit]` → `{min, max, step}`; `pickerStart(kcalGoal, unit)` → wheel value;
  `pickerSave(picked, start, storedKcal, unit)` → kcal to store.
- `ENERGY_MEASURES`, `EnergyMeasure` (`'kcal' | 'kJ'`, the values of the `units.energy` setting),
  `isEnergyMeasure` for codecs.

Files: created `src/domain/units/energy.ts`, `src/domain/units/energy.test.ts`, this note. Uses
`numberMarks` / `parseLocaleNumber` / `readPlainNumber` from `src/domain/units/numbers.ts` (P01-06,
same slice).

Edge cases / failure modes:
- Round trip: for every whole kcal from 0 to 10 000, kJ shown then typed back gives the same kcal
  (4.184 > 1, so each kJ display value maps back to a single kcal).
- Parsing: leading and trailing spaces ignored; `"8,368"` in en-US is 8 368 (grouping), `"8.368"` in
  de-DE is 8 368, `"418,4"` in de-DE is 418.4; `"8368.4"` in en-US is 8 368.4. Empty, letters,
  trailing junk (`"12abc"`), a sign (`"-5"`), `"Infinity"`, `"NaN"` and exponent forms (`"1e3"`)
  give `null`. A grouping mark must sit between digit groups the way the locale writes them (last
  group three digits), so `"1,5"` in en-US is not read as 15: it falls through to the comma
  fallback and reads 1.5.
- Locales whose grouping mark is a space (fr-FR uses a narrow no-break space) accept any space
  there; an unknown locale tag falls back to en marks instead of throwing.
- Picker: a goal below the range opens at the minimum (100 kcal → 3 400 kJ), above it at the
  maximum; 2 000 kcal opens the kJ wheel at 8 300 (8 368 snapped down).
- Save: kJ untouched (picked = start) keeps the stored kcal (R06.20); kJ moved converts
  (8 400 → 2 008); kcal always stores the picked value (so 2 037 opened at 2 000 and saved stores
  2 000, the snap-down the kcal wheel always had).

Our design differences / decisions:
- Names are ours: `EnergyMeasure` (not the reference's type name), `toDisplay`, `fromDisplay`,
  `parseEnergy`, `pickerStart`, `pickerSave` as the phase row names them.
- `parseEnergy` returns the typed value in the display unit; callers convert with `fromDisplay`.
- Stricter than the reference: exponent forms and loose grouping (`"1,5"` = 15) are not accepted.
- The unit's label ("kcal" / "kJ") and the AI prompt line are not here: labels are i18n copy, the
  prompt line is owned by `src/ai/prompts/` (03).

Tests we will write:
- 1 → 4, 100 → 418, 2 000 → 8 368 kJ; 250 kcal → 1 046 kJ unrounded; kcal unchanged.
- kcal → kJ → kcal identity for 0..10 000; 8 368 kJ → 2 000, 418 → 100.
- Parsing table for en-US and de-DE, fr-FR spaces, the rejects, and an invalid locale tag.
- Wheel: ranges and steps; 2 000 → 8 300; clamps at both ends (790 kcal → 800); kJ wheel ends
  convert back inside 800–6 000 kcal.
- R06.20: saving 8 300 untouched keeps 2 000; 8 400 → 2 008; kcal wheel stores the pick.

Compare checklist (filled after the rewrite; reopened `A/models/EnergyUnit.kt`, the energy part of
`I/Models/UnitPreferences.swift`, `T/models/EnergyUnitTest.kt`, `IT/EnergyUnitTests.swift`):
- [x] Whole kJ display: 0, 1, 100, 2 000 kcal (tested in `src/domain/units/energy.test.ts >
  toDisplay > shows kJ as whole numbers at 4.184 kJ per kcal`); kcal unchanged (`> leaves kcal as
  it is`).
- [x] Unrounded amount for charts and averages, 250 kcal → 1 046 kJ (`energy.test.ts >
  toDisplayExact > keeps the unrounded amount for charts and averages`).
- [x] kJ input stored as kcal: 8 368 → 2 000, 418 → 100, 4.184 → 1 (`energy.test.ts > fromDisplay
  > turns kJ back into whole kcal`); kcal input rounds (`> rounds typed kcal to whole kcal`).
- [x] Round trip for every kcal 0..10 000 (`energy.test.ts > fromDisplay > gives back the same kcal
  after showing it in kJ, for every kcal from 0 to 10 000`).
- [x] Typed amounts in the locale: "8368", "8,368", " 8368.4 " (en-US), "8.368", "418,4" (de-DE),
  "1200" (`energy.test.ts > parseEnergy > reads the locale grouping and decimal marks`,
  `> feeds fromDisplay to give the stored kcal`); comma fallback (`> falls back to a comma as the
  decimal mark`).
- [x] Rejects "", "abc", "12abc", "-50" and non-finite input (`energy.test.ts > parseEnergy >
  refuses empty, non-numeric, trailing junk, negative and non-finite input`).
- [x] Wheel span, steps, kJ ends inside 800–6 000 kcal, kJ minimum on the step grid
  (`energy.test.ts > pickerStart > uses the same span in both units`); 2 000 → 8 300 and the kcal
  snap-down (`> opens on the shown goal snapped down onto the step grid`); a tiny goal opens at
  the kJ minimum, 790 kcal at 800 (`> keeps the opening position inside the wheel`).
- [x] R06.20: untouched kJ wheel keeps 2 000 (`energy.test.ts > pickerSave > keeps the exact kcal
  goal when the kJ wheel was not moved (R06.20)`); 8 400 → 2 008 (`> converts a kJ pick that moved
  the wheel`); the kcal wheel stores the picked row, 2 037 opened at 2 000 saves 2 000 (`> stores
  the picked kcal row, even when the wheel was not moved`).
- [x] Unknown stored values read as kcal: `isEnergyMeasure` accepts exactly `kcal` and `kJ`
  (`energy.test.ts > isEnergyMeasure > accepts the two setting values and nothing else`); the
  default itself is applied by the settings schema (P02-04) and `defaultUnits` (P01-04).
- Deliberate differences: the setting value is `kJ` (the reference stores lower-case `kj`, 17 §1.3);
  `parseEnergy` returns the display value instead of kcal; it refuses exponent forms ("1e3") and
  loose grouping ("1,5" in en-US is 1.5, not 15), both of which the reference's parser accepts.
- Not taken: unit labels and "1,200 kcal" formatting (UI copy through `src/i18n/format.ts`); the
  kJ AI prompt line (03, `src/ai/prompts/`); the unrounded kcal-from-kJ helper (no caller); the
  widget snapshot and notification texts (no widgets in v1; notification copy is P09).

## Decisions for the lead

- Type name `EnergyMeasure` (values `'kcal' | 'kJ'`) instead of the reference's type name; the
  same `…Measure` pattern is used for weight, height and water.
- `parseEnergy(text, locale)` returns the typed number in the display unit; callers store
  `fromDisplay(value, unit)`.
- `fromDisplay` rounds in kcal mode too (stored kcal are whole numbers).
- Extra export beyond the phase row: `toDisplayExact`, `ENERGY_GOAL_WHEEL`, `ENERGY_MEASURES`,
  `isEnergyMeasure`, `KJ_PER_KCAL`.

## Status

Done (2026-10-26). `energy.ts` and 18 tests, all passing; nothing outside the slice's files
changed. Trap covered: R06.20.
