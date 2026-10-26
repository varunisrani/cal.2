# Task: body units and locale defaults (P01-04) · Phase: 01 · Owner: builder (wt-p01b1)

<!-- Save as platewise/docs/notes/P<nn>/<slug>.md. Write everything above "Compare checklist"
BEFORE writing code, in your own words. Never paste or paraphrase the reference line by line. -->

Read (reference @ `10e14b67`): `A/models/WeightDisplayFormatter.kt`,
`T/models/WeightDisplayFormatterTest.kt`, `I/Views/ProfileComponents.swift` lines 75–480 (the
height and weight picker sheets only); research spec `01-profile-goals.md` §3.2 (height, weight,
weekly-change bullets) and §6 R01.18, `05-home-progress.md` §6 R05.10 (c); decisions D-16.10,
D-16.37, D-16.56; traps ledger rows R01.18 and R05.10. No Evidence ids.

What it does (own words): the profile stores height in cm and weight in kg at full precision. A
person reads them in cm or feet and inches, and in kg or lb, two separate choices. This module
converts between them (1 kg = 2.20462 lb both ways, 1 in = 2.54 cm), shows a weight with one
decimal, shows a height as whole cm (cut, not rounded) or as feet and inches taken from the nearest
whole inch (so 170 cm reads 5′7″), and writes the weekly pace as a short number (two decimals at
most, no trailing zeros, always a dot). The pickers' wheels split a weight into a whole part and a
tenth by rounding to the nearest tenth, so a value that went lb → kg → lb never shows one tenth
less (R05.10), and every weight wheel is kept inside one range: 20–250 kg or 50–500 lb (D-16.37,
D-16.56); height wheels run 100–250 cm and 3′0″–8′11″. `defaults.ts` picks the starting units
from the browser locale: en-US, en-LR and my-MM get lb and feet/inches, every other locale kg and
cm, energy always kcal; height and weight are always decided together (D-16.10, R01.18).

Inputs → outputs:
- `weightToDisplay(kg, unit)` / `weightFromDisplay(value, unit)` → unrounded numbers;
  `formatWeight(kg, unit, locale)` → `"70.0"`, `"154.3"` (one decimal, locale marks).
- `heightCmShown(cm)` → whole cm (truncated); `toFeetInches(cm)` → `{feet, inches}`;
  `fromFeetInches({feet, inches})` → cm.
- `formatPace(kg, unit)` → `"0.25"`, `"0.55"`, `"1"`, `"2.2"`.
- `WEIGHT_LIMITS[unit]`, `weightWheel(kg, unit)` → `{whole, tenth}`, `weightFromWheel(wheel,
  unit)` → kg; `HEIGHT_LIMITS`, `heightWheelCm(cm)`, `heightWheelFeetInches(cm)`.
- `WEIGHT_MEASURES` / `HEIGHT_MEASURES`, `WeightMeasure` (`'kg' | 'lb'`), `HeightMeasure`
  (`'cm' | 'ftIn'`) and their guards: the values of the `units.weight` / `units.height` settings.
- `defaultUnits(localeTag)` → `{energy: 'kcal', height, weight}`.

Files: created `src/domain/units/body.ts`, `body.test.ts`, `defaults.ts`, `defaults.test.ts`, this
note. Uses `formatFixed` and `clamp` from `numbers.ts`.

Edge cases / failure modes:
- 160.0 lb → kg → lb lands a hair under 160 for some values; truncating the tenth would show
  159.9. The wheel rounds to the nearest tenth; a value like 159.96 rounds up to 160.0 (the whole
  part carries), never to "159.10".
- Clamping happens in the display unit: 19.9 kg → 20.0, 250.06 kg → 250.0, 40 lb → 50.0. Saving a
  wheel above the maximum (250 with a tenth of 9) is clamped too.
- kg is never rounded in storage; only the wheel and the text round.
- Feet and inches: 11.5 inches rounds up into the next foot (5′11.5″ → 6′0″), never "5′12″".
  The feet/inches wheel clamps to 36–107 total inches, the cm wheel rounds to whole cm and clamps
  to 100–250.
- Pace text uses a fixed dot whatever the locale, as the spec records; 0 → "0".
- Locale defaults: case and extensions do not matter (`en-us`, `en-US-u-nu-latn`, `en_US`), a
  script subtag is ignored (`en-Latn-US` is imperial); a bare language (`en`, `my`) or an unknown
  tag is metric; Spanish in the US (`es-US`) is metric because only the three listed tags are
  imperial.

Our design differences / decisions:
- Names are ours (`WeightMeasure`, `HeightMeasure`, `weightWheel`, `formatPace`, …); the reference's
  type and unit names are not used, and the setting values are `lb` and `ftIn` (17 §1.3).
- One weight range everywhere (D-16.56) instead of the reference's per-screen ranges.
- One conversion factor in both directions (the reference's onboarding used a second factor for
  lb → kg); round trips hold.
- The cm wheel opens on the rounded cm (nearest row); the text shows the truncated cm as the spec
  records. The unit words and the ′ ″ marks are UI copy (i18n), not built here.
- Water unit is not seeded from the locale: it stays ml by default (05 §3.6.1).

Tests we will write:
- 170 cm → 5′7″, 180 cm → 5′11″, 182.88 cm → 6′0″ and 182 cm shown; 5′7″ → 170.18 cm.
- 70 kg → "154.3" lb, "70.0" kg; de-DE uses a comma.
- R05.10: 160.0 lb → kg → wheel 160.0; a sweep over every tenth from 50.0 to 500.0 lb returns the
  same wheel after the kg round trip; 159.96 lb → 160.0.
- 19.9 kg → 20.0; above-range kg and lb values clamp; saving 250.9 kg stores 250.
- Pace texts for 0.25 / 0.5 / 1.0 in kg and lb.
- Defaults: en-US, en-LR, my-MM imperial; en-GB, de-DE, en metric; case, underscore, script and
  extension variants; invalid tag metric; height and weight always match (R01.18).

Compare checklist (filled after the rewrite; reopened `A/models/WeightDisplayFormatter.kt`,
`T/models/WeightDisplayFormatterTest.kt`, `I/Views/ProfileComponents.swift` lines 75–480):
- [x] Weekly pace in kg: 0.25 / 0.5 / 1 → "0.25" / "0.5" / "1" (tested in
  `src/domain/units/body.test.ts > formatPace > writes the kg pace with up to two decimals and no
  trailing zeros`); in lb "0.55" / "1.1" / "2.2" (`> converts the pace to lb before writing it`);
  zero (`> writes zero as "0"`).
- [x] Height wheel opens on the nearest inch, 170 cm → 5′7″ (`body.test.ts > height > shows feet and
  inches from the nearest whole inch`, `height wheels > opens the feet and inches wheels inside
  3′0″–8′11″`) and on the nearest whole cm (`height wheels > opens the cm wheel on the nearest whole
  cm inside 100–250`).
- [x] Unit switch inside the height picker clamps into the other wheel's rows (100–250 cm,
  36–107 in): `heightWheelCm(fromFeetInches(…))` and `heightWheelFeetInches(cm)` (same two tests).
- [x] Saving feet and inches gives unrounded cm (`body.test.ts > height > turns feet and inches
  back into unrounded cm`).
- [x] Weight wheel splits into whole and tenth (`body.test.ts > weightWheel > rounds to the nearest
  tenth instead of truncating (R05.10)`); the unit switch inside the weight picker converts and
  clamps (`> keeps the value when the wheel switches unit`); saving converts lb to kg with the one
  factor (`> stores the wheel value in kg unrounded and inside the limits`, `weight conversion >
  uses 2.20462 lb per kg in both directions`).
- [x] Gap closed in our own way: the reference picker caps a rounded tenth at 9, so 159.96 lb
  opens at 159.9; ours carries into the whole part (160.0). Tested in `weightWheel > rounds to the
  nearest tenth instead of truncating (R05.10)` and the sweep `> gives back every wheel position
  after a round trip through stored kg (R05.10)`.
- [x] R05.10 (c): 160.0 lb → kg → 160.0, and 84.0 lb, which truncation shows as 83.9
  (`weightWheel > shows 160.0 lb again after the value went through kg (R05.10)`).
- [x] Limits 20–250 kg / 50–500 lb, 19.9 kg → 20.0 (`weightWheel > keeps the weight inside
  20–250 kg or 50–500 lb`).
- [x] Weight shown with one decimal, 70 kg → "154.3" lb (`formatWeight > shows one decimal in
  either unit`); height cut to whole cm (`height > shows whole cm cut, not rounded`).
- [x] Locale defaults and R01.18 (`src/domain/units/defaults.test.ts > defaultUnits > starts the
  United States, Liberia and Myanmar in lb and feet and inches`, `> starts every other locale in
  kg and cm`, `> reads any spelling of the three imperial locales`, `> starts metric for a tag Intl
  cannot read`, `> always seeds height and weight together, with energy in kcal (R01.18)`).
- Deliberate differences: one weight range everywhere, 20–250 kg / 50–500 lb (D-16.56; the
  reference picker uses 30–300 kg); locale-based defaults (D-16.10) instead of a per-platform
  default and a legacy flag; setting values `lb` and `ftIn`; a rounded tenth carries into the
  whole part.
- Not taken: the picker sheets themselves, labels and the "kg/wk" text with its period word (UI,
  P05/P07 copy); body-fat pickers (not in this slice, D-16.56 body-fat steps go with P05/P07).

## Decisions for the lead

- The cm wheel opens on the rounded cm (as the reference picker does) while the text shows the
  truncated cm (as the spec records); a 182.88 cm height reads "182 cm" and opens the wheel at
  183.
- `weightFromWheel` clamps too, so a wheel showing 250.9 kg saves 250 kg; the UI may hide tenths
  above the maximum.
- `formatWeight` follows the locale's decimal mark ("154,3" in de-DE); `formatPace` keeps the
  fixed dot the spec records.
- `defaultUnits` reads language and region with `Intl.Locale` (underscores accepted); `es-US` and
  a bare `en` start metric, because only the three listed tags are imperial.
- Water unit is not seeded from the locale (stays ml, 05 §3.6.1).
- Extra exports beyond the phase row: the `*_MEASURES` lists and guards, `LB_PER_KG`,
  `CM_PER_INCH`, `WEIGHT_LIMITS`, `HEIGHT_LIMITS`, `WeightWheel`, `FeetInches`, `UnitSettings`.

## Status

Done (2026-10-26). `body.ts` (17 tests) and `defaults.ts` (5 tests), all passing; nothing outside
the slice's files changed. Traps covered: R05.10 (weight part), R01.18.
