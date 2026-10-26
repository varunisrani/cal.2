# Task: body units and locale defaults (P01-04) · Phase: 01 · Owner: builder (wt-p01b1)

<!-- Save as platewise/docs/notes/P<nn>/<slug>.md. Write everything above "Compare checklist"
BEFORE writing code, in your own words. Never paste or paraphrase the reference line by line. -->

Read (reference @ `10e14b67`): `A/models/WeightDisplayFormatter.kt` (all),
`T/models/WeightDisplayFormatterTest.kt` (all), `I/Views/ProfileComponents.swift` lines 75–480
(the height and weight picker sheets only: how they open, switch unit and save). Research spec
`01-profile-goals.md` §3.2 (units, constants, height and weight display, weekly-change text),
§6 R01.18; `05-home-progress.md` §6 R05.10 (c); decisions D-16.10, D-16.37 and Proposed D-16.56
(`18-phase-wise-build-plan.md`); traps ledger rows owned by P01-04. No Evidence ids.

What it does (own words): body measurements are stored in kilograms and centimetres; the person
picks how to read them (kg or lb, cm or feet and inches, two separate settings). This module
converts with one factor (1 kg = 2.20462 lb, used both ways so a value converted there and back
is the same), shows weight with one decimal, shows height as whole centimetres (truncated) or as
feet and inches from the nearest whole inch (so 170 cm reads 5′7″, not 5′6″), and writes the
weekly pace as a short number (0.25 kg → "0.25", in lb "0.55"). It also drives the pickers: a
weight wheel is a whole part and a tenth, found by rounding the shown value to the nearest tenth
(so 160.0 lb survives a trip through kg, R05.10), held to 20–250 kg or 50–500 lb in every place
(D-16.37, Proposed D-16.56); height wheels hold 100–250 cm or 3′0″–8′11″. `defaults.ts` picks the
first-run units from the browser's locale: the United States, Liberia and Myanmar (as en-US,
en-LR, my-MM) read lb and feet/inches, every other tag kg and cm, and energy starts as kcal.
Height and weight come from the same decision, so a first run never mixes them (R01.18, D-16.10).

Inputs → outputs:
- `weightToDisplay(kg, unit)` / `weightFromDisplay(value, unit)` (unrounded); `weightShown(kg,
  unit)` → nearest tenth; `formatWeight(kg, unit, locale)` → text with exactly one decimal;
  `formatPace(kgPerWeek, unit)` → "0.25", "1.1", "2.2" (dot, at most two decimals, no trailing
  zeros).
- `WEIGHT_WHEEL[unit]` → `{min, max}`; `weightWheel(kg, unit)` → `{whole, tenth}`;
  `weightFromWheel({whole, tenth}, unit)` → kg at full precision (clamped to the wheel).
- `heightCmShown(cm)` → whole cm (truncated); `feetInches(cm)` → `{feet, inches}` from the
  nearest inch; `HEIGHT_WHEEL` → cm `{100, 250}`, inches `{36, 107}`; `cmWheel(cm)` → whole cm in
  range; `ftInWheel(cm)` → feet and inches in range; `cmFromFeetInches(feet, inches)` → cm.
- `defaultUnits(localeTag)` → `{energy, height, weight}`.
- Unit lists and guards: `WEIGHT_DISPLAY_UNITS` (`kg`, `lb`), `HEIGHT_DISPLAY_UNITS` (`cm`,
  `ftIn`), `isWeightDisplayUnit`, `isHeightDisplayUnit`; `LB_PER_KG`, `CM_PER_INCH`.

Files: created `src/domain/units/body.ts`, `src/domain/units/body.test.ts`,
`src/domain/units/defaults.ts`, `src/domain/units/defaults.test.ts`, this note.

Edge cases / failure modes:
- 170 cm → 66.93 in → 67 → 5′7″; 180 cm → 70.87 → 71 → 5′11″; 182.88 cm → exactly 6′0″; a value
  that rounds up to 12 inches carries into the feet (never 5′12″).
- Height shown in cm truncates (170.9 → 170) while the cm wheel opens on the nearest whole cm
  (171): two different rules in the spec, both kept.
- Feet and inches saved from the wheel are not rounded to whole cm (5′7″ → 170.18 cm).
- 70 kg → 154.3234 lb → "154.3"; 70 kg → "70.0"; de-DE writes "154,3".
- Weight wheel: the tenth is found after rounding the whole value, so 159.96 opens on 160.0 (not
  159.9 or a tenth of 10); 160.0 lb → kg → wheel shows 160.0; 19.9 kg opens on 20.0; 260 kg on
  250.0; 40 lb on 50.0; a wheel set to 250.9 kg saves 250 kg (the top of the range).
- Pace text uses a fixed dot whatever the locale and keeps at most two decimals: 0.25 → "0.25" /
  "0.55"; 0.5 → "0.5" / "1.1"; 1 → "1" / "2.2".
- Locale tags: canonical case does not matter (`en-us`), scripts are ignored (`en-Latn-US`),
  underscores are accepted (`en_US`); a bare language (`en`, `my`), any other region
  (`en-GB`, `es-US`) and a tag `Intl` cannot read give metric. Nothing throws.

Our design differences / decisions:
- One factor (2.20462) both ways; the reference's onboarding uses 0.453592 for lb → kg, which
  breaks round trips (a deliberate difference already listed in the phase file).
- Every weight wheel uses 20–250 kg / 50–500 lb (D-16.37, Proposed D-16.56); the reference's
  sheets use 30–300 kg.
- Locale-based defaults (D-16.10) instead of either platform's fixed default.
- Unit names are the settings values of 17 §1.3 (`kg`, `lb`, `cm`, `ftIn`); the words "kg", "lb",
  "cm" and the ′ ″ marks are catalogue copy for the UI phases, so height in feet and inches comes
  back as numbers.
- Body-fat wheels are not part of this slice (P05/P07 use 3–60 % in 0.5 steps, Proposed
  D-16.56).

Tests we will write:
- `feetInches` 170 → 5′7″, 180 → 5′11″, 182.88 → 6′0″, a value rounding to a full foot; `heightCmShown`
  truncation; `cmWheel` rounding and clamping (99 → 100, 300 → 250); `ftInWheel` clamping (80 cm →
  3′0″, 300 cm → 8′11″); `cmFromFeetInches` 5′7″ → 170.18; height round trip through the wheels.
- `formatWeight` 70 kg in kg and lb (en-US, de-DE); `weightShown`; conversions are inverse.
- `formatPace` for 0.25 / 0.5 / 1.0 in both units, plus a value that needs rounding.
- `weightWheel` 160.0 lb round trip (R05.10), 159.96 → 160.0, 72.46 kg, clamps 19.9 kg → 20.0,
  260 kg → 250.0, 40 lb → 50.0, 600 lb → 500.0; `weightFromWheel` back to kg at full precision and
  clamped; ranges are 20–250 / 50–500.
- `defaultUnits`: `en-US`, `en-LR`, `my-MM` imperial; `en-GB`, `de-DE`, `en`, `my`, `es-US`
  metric; `en-us`, `en_US`, `en-Latn-US` imperial; `''` and `'not a tag'` metric; energy always
  kcal; height and weight always agree (R01.18).
- Guards accept the unit values and reject near misses (`lbs`, `ftin`, `KG`).

Compare checklist (filled after the rewrite; reopened `A/models/WeightDisplayFormatter.kt`,
`T/models/WeightDisplayFormatterTest.kt`, `I/Views/ProfileComponents.swift` lines 75–480):
- [x] Weekly pace in kg and lb with two decimals at most and no trailing zeros
  (`src/domain/units/body.test.ts > formatPace > writes kg per week with up to two decimals and no
  trailing zeros`, `> converts to lb before rounding`).
- [x] Height sheet opens on the nearest inch (5′7″ for 170 cm) and the nearest cm
  (`body.test.ts > feetInches > rounds to the nearest inch, so 170 cm is 5 ft 7 in and 180 cm is
  5 ft 11 in`, `> carries 12 inches into the next foot`; `height wheels > open the cm wheel on the
  nearest whole cm inside the range`, `> open the feet and inches wheels on the nearest inch inside
  the range`).
- [x] Switching cm ↔ ft-in inside the sheet converts the current pick and holds it to the other
  wheel's rows (`body.test.ts > height wheels > convert the current pick when the unit is switched
  inside the sheet`).
- [x] Saving feet and inches stores unrounded cm (`body.test.ts > height wheels > store feet and
  inches as unrounded cm`, `> keep a feet and inches pick through a round trip`).
- [x] Gap found: the reference opens its wheels without clamping (only a unit switch clamps), so a
  stored value outside the rows has no row to land on. Ours clamps on opening too
  (`body.test.ts > weightWheel > holds the opening position to the range`, and the height cases
  above).
- [x] Weight sheet: whole part and tenth found by rounding (the reference adds a half to the tenth
  only, which still turns 159.96 into 159.9); one factor both ways; switching kg ↔ lb converts
  and clamps (`body.test.ts > weightWheel > shows 160.0 lb after a round trip through kg, not 159.9
  (R05.10)`, `> keeps every tenth of the lb wheel after a round trip through kg (R05.10)`,
  `> splits a weight into whole units and tenths`; `switching the weight unit inside the sheet >
  converts the current pick and holds it to the other wheel`; `weightFromWheel > returns kg at full
  precision`, `> holds the stored value to the range`).
- [x] Display: one decimal ("70.0", "154.3"), height in cm truncated (`body.test.ts >
  formatWeight > writes exactly one decimal in the locale`, `weight conversion > shows weight
  rounded to one decimal`, `> uses one pound factor in both directions`, `heightCmShown >
  truncates to whole centimetres`).
- [x] Locale defaults seed both units together (`src/domain/units/defaults.test.ts > defaultUnits >
  starts en-US, en-LR and my-MM in lb and feet and inches`, `> starts every other tag in kg and
  cm`, `> ignores case, scripts, extensions and underscores in the tag`, `> starts metric for a tag
  that cannot be read`, `> seeds height and weight together from the locale (R01.18)`, `> always
  starts energy in kcal`).
- Deliberate differences: weight wheels 20–250 kg / 50–500 lb (D-16.37, Proposed D-16.56; the
  reference sheet uses 30–300 kg); one lb factor both ways; rounding the whole value to a tenth;
  clamping on open; locale-based defaults (D-16.10) instead of a fixed platform default.
- Not taken: the "kg/wk" and "lbs/week" suffixes, unit labels and the ′ ″ marks (catalogue copy,
  P05/P07/P09); the legacy single metric flag and its migration (17 §1.3: no legacy flag); the
  body-fat wheels (P05/P07, Proposed D-16.56).

## Decisions for the lead

- `es-US` and other non-English tags in the three countries start metric: D-16.10 names exactly
  `en-US`, `en-LR` and `my-MM`. Matching is on language and region, so `en-Latn-US`, `en-us`,
  `en_US` and tags with extensions count as `en-US`.
- `weightFromWheel` clamps the stored value to the wheel's range (a 250.9 kg pick stores 250).
- Extra exports beyond the phase row: the unit lists, types (`WeightDisplayUnit`,
  `HeightDisplayUnit`, names chosen to avoid the reference's) and guards, `LB_PER_KG`,
  `CM_PER_INCH`, `weightToDisplay`, `weightFromDisplay`, `weightShown`, `WEIGHT_WHEEL`,
  `WeightWheel`, `FeetInches`, `HEIGHT_WHEEL`, `cmWheel`, `ftInWheel`, `cmFromFeetInches`,
  `heightCmShown`, `UnitDefaults`.

## Status

Done (2026-10-26). `src/domain/units/body.ts` (23 tests) and `src/domain/units/defaults.ts`
(6 tests) are in place, all passing. Nothing outside the slice's files changed. Traps covered:
R01.18, R05.10 (weight part).
