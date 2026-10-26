# Task: energy units, kcal and kJ (P01-03) · Phase: 01 · Owner: builder (wt-p01b1)

<!-- Save as platewise/docs/notes/P<nn>/<slug>.md. Write everything above "Compare checklist"
BEFORE writing code, in your own words. Never paste or paraphrase the reference line by line. -->

Read (reference @ `10e14b67`): `A/models/EnergyUnit.kt` (all), `I/Models/UnitPreferences.swift`
(the energy enum: conversion, typed input, goal wheel), `T/models/EnergyUnitTest.kt` (all),
`IT/EnergyUnitTests.swift` (all). Research spec `01-profile-goals.md` §3.2 (energy unit),
`06-settings-data.md` §3.3 (display and units), §6 R06.20; traps ledger rows owned by P01-03. No
Evidence ids.

What it does (own words): energy is always stored in kilocalories. A person can choose to read and
type kilojoules instead; then every amount is converted on the way to the screen (× 4.184, rounded
to a whole kJ) and on the way back from a field (÷ 4.184, rounded to a whole kcal). Because both
directions round, a stored kcal value shown in kJ and saved again without change comes back as the
same kcal. Typed text is read in the person's locale (grouping and decimal marks) with a
comma-as-decimal fallback, and anything that is not a single non-negative finite number is
refused. The calorie goal wheel spans 800–6 000 kcal in steps of 50, or 3 400–25 100 kJ in steps
of 100; it opens on the shown goal snapped down to a step and kept in range. Saving a kJ wheel
that was not moved keeps the exact stored goal, otherwise the snapped kJ value would nudge the
goal by up to about 24 kcal on every open-and-save (R06.20).

Inputs → outputs:
- `toDisplay(kcal, unit)` → whole display units; `toDisplayUnrounded(kcal, unit)` → the exact
  amount for charts and averages; `fromDisplay(value, unit)` → whole kcal.
- `formatEnergy(kcal, unit, locale)` → grouped whole number text ("8,368", "8.368").
- `parseEnergy(text, locale)` → the typed display value or null; `typedKcal(text, unit, locale)`
  → kcal or null (parse, then `fromDisplay`).
- `ENERGY_GOAL_WHEEL[unit]` → `{min, max, step}`; `pickerStart(kcalGoal, unit)` → opening value;
  `pickerSave(picked, start, storedKcal, unit)` → kcal to store.
- `ENERGY_DISPLAY_UNITS`, `EnergyDisplayUnit`, `isEnergyDisplayUnit`, `DEFAULT_ENERGY_UNIT`
  (kcal), `KJ_PER_KCAL`.

Files: created `src/domain/units/energy.ts`, `src/domain/units/energy.test.ts`, this note.

Edge cases / failure modes:
- 1 kcal → 4 kJ, 100 → 418, 2 000 → 8 368; kcal → kJ → kcal is the identity for every whole kcal
  from 0 to 10 000 (both roundings meet; no exact .5 tie can occur for whole inputs).
- kcal shown in kcal is unchanged for whole values; a fractional kcal is rounded to a whole one.
- Parsing: leading and trailing spaces trimmed; empty, letters, trailing junk ("12abc"), a
  negative sign, "Infinity" and "NaN" → null. "8,368" in en-US → 8 368; "8.368" in de-DE → 8 368;
  "418,4" in de-DE → 418.4; " 8368.4 " in en-US → 8 368.4 (→ 2 000 kcal).
- Goal wheel: 2 000 kcal opens the kJ wheel at 8 300 (8 368 snapped down), the kcal wheel at
  2 000; 790 kcal opens the kcal wheel at 800 (clamped up); a tiny goal opens the kJ wheel at
  3 400; a huge one at the top. The kJ range converts inside 800–6 000 kcal.
- Saving: kJ wheel untouched (picked = start) → the stored kcal unchanged (2 000 stays 2 000);
  8 400 kJ → 2 008 kcal; the kcal wheel always saves what it shows (2 037 opened at 2 000 and
  saved untouched stores 2 000, as the spec says).

Our design differences / decisions:
- Names are ours; the unit values are the settings values of 17 §1.3 (`kcal`, `kJ`).
- `pickerSave` takes the opening position as an argument (the UI keeps it) instead of
  recomputing it from the stored goal.
- `parseEnergy` returns the typed value in display units; `typedKcal` is the one-call version
  for fields that store kcal.
- Grouping marks are only honoured in grouping positions (P01-06 `parseLocaleNumber`), so
  "418,4" in en-US reads 418.4 rather than 4 184.
- The AI kJ instruction line is prompt prose and belongs to P03 (`src/ai/prompts/shared.ts`); unit
  labels ("kcal", "kJ") are catalogue copy for the UI phases.

Tests we will write:
- `toDisplay` for 0, 1, 100, 2 000 in kJ and a whole value in kcal; `toDisplayUnrounded(250)` is
  1 046 kJ; `fromDisplay` 8 368 → 2 000 and 418 → 100, 4.184 → 1; the 0..10 000 identity.
- `formatEnergy` en-US and de-DE, and that the de-DE text parses back.
- `parseEnergy` accept table (en-US, de-DE, trimmed, plain decimal) and reject table ("", "  ",
  "abc", "12abc", "-5", "-50", "Infinity", "NaN", "1e3"); `typedKcal` in both units.
- Wheel ranges and steps; the kJ range converts inside the kcal range; `pickerStart` 2 000 → 8 300
  (kJ) and 2 000 (kcal), 790 → 800, 100 → 3 400, 9 000 → 25 100 / 6 000.
- `pickerSave`: untouched kJ keeps 2 000 (R06.20), and keeps an odd goal like 1 999; 8 400 → 2 008;
  kcal saves the pick; a moved kJ wheel converts.
- Guard accepts `kcal`, `kJ`, rejects `kj`, `KJ`, `''`.

Compare checklist (filled after the rewrite; reopened `A/models/EnergyUnit.kt`,
`I/Models/UnitPreferences.swift` (energy part), `T/models/EnergyUnitTest.kt`,
`IT/EnergyUnitTests.swift`):
- [x] Default kcal; unknown stored values read as kcal: the guard rejects them and the codec
  falls back to `DEFAULT_ENERGY_UNIT` (`src/domain/units/energy.test.ts > energy units > defaults
  to kcal and guards the two unit values`).
- [x] kcal → whole kJ (0, 1, 100, 2 000), kcal unchanged, unrounded amount for charts
  (`energy.test.ts > toDisplay > converts kcal to whole kJ`, `> leaves whole kcal unchanged in
  kcal`, `> gives the unrounded amount for charts and averages`).
- [x] Typed kJ → whole kcal and the 0..10 000 identity (`energy.test.ts > fromDisplay > converts
  typed kJ back to whole kcal`, `> returns every whole kcal from 0 to 10 000 unchanged after a trip
  through kJ`).
- [x] Grouped number text in en-US and de-DE (`energy.test.ts > formatEnergy > writes the display
  value grouped in the locale`, `> writes text that parseEnergy reads back`).
- [x] Typed text in the locale: "8368", "8,368", " 8368.4 " (en-US), "8.368", "418,4" (de-DE), and
  refusals for "", "abc", "12abc", "-50" (`energy.test.ts > parseEnergy > accepts the locale's
  grouping and decimal marks`, `> falls back to a comma as the decimal mark`, `> refuses empty,
  non-numeric, trailing junk, negative and non-finite text`; kcal values in `typedKcal > reads a
  field and converts it to the kcal to store`).
- [x] Wheel ranges and steps; the kJ range converts inside 800–6 000 kcal and sits on the step grid
  (`energy.test.ts > goal wheel > spans 800–6 000 kcal in 50s or 3 400–25 100 kJ in 100s`,
  `> keeps the kJ range inside the kcal range`).
- [x] Opening position: 2 000 kcal → 8 300 kJ, a tiny goal → 3 400, 790 → 800 (`energy.test.ts >
  pickerStart > opens on the shown goal snapped down to a step`, `> keeps the opening value inside
  the range`).
- [x] Untouched kJ wheel keeps 2 000; 8 400 kJ → 2 008; the kcal wheel snaps 2 037 to 2 000
  (`energy.test.ts > pickerSave > keeps the exact stored kcal when the kJ wheel was not moved
  (R06.20)`, `> converts a kJ pick that differs from the opening value`, `> stores what the kcal
  wheel shows`).
- Deliberate differences: grouping marks count only in grouping places, so "418,4" in en-US is
  418.4 (a lenient reader gives 4 184) and "8368.4" in de-DE is 8 368.4 (not 83 684); the parser
  refuses exponents and `Infinity` outright; `pickerSave` takes the opening position as an
  argument.
- Not taken: the unit labels and "N kcal" / "N kJ" sentences and the kJ twins of notification
  texts (catalogue copy, UI phases and P09-08); the AI kJ instruction line (P03, our own prose);
  the widget snapshot (no widgets in v1); an unrounded kJ → kcal helper (nothing stores fractional
  kcal).

## Decisions for the lead

- Grouped parsing checks group positions (first group 1–3 digits, inner groups 2–3, last group 3);
  text that fails falls back to a comma as the decimal mark. User-visible only for odd input such
  as "418,4" in en-US.
- `toDisplay` in kcal rounds a fractional kcal to a whole one (whole kcal come back unchanged).
- Extra exports beyond the phase row: `ENERGY_DISPLAY_UNITS`, `EnergyDisplayUnit`,
  `isEnergyDisplayUnit`, `DEFAULT_ENERGY_UNIT`, `KJ_PER_KCAL`, `toDisplayUnrounded`,
  `formatEnergy`, `typedKcal`, `ENERGY_GOAL_WHEEL`. The unit type is named `EnergyDisplayUnit`
  (the reference's enum name is avoided).

## Status

Done (2026-10-26). `src/domain/units/energy.ts` and its tests (19) are in place, all passing; it
reads numbers through `numbers.ts` (P01-06). Nothing outside the slice's files changed. Trap
covered: R06.20.
