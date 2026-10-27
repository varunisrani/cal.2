# Task: Day nutrients sheet and pillar picker (P07-04) · Phase: 07 · Owner: builder (wt-p07s1b, slice S1b)

Read (reference @ `10e14b67`): `A/ui/home/NutritionDetailSheet.kt` (all: the sections and their
order, the per-day sums, the row layout, the dash for 0, the home-cards row, the picker dialog and
its toggle, the locked water row, Done and Cancel); `I/Views/HomeComponents.swift` (the nutrient
picker part only: the chosen order with position numbers, water after them with a lock, the
check marks, Reset, Done disabled outside 1–4, Cancel). No reference tests cover these. Research
spec `05-home-progress.md` §3.2.3 (picker rules, stored order), §3.2.4 (the sheet); acceptance ids
ACC-F5-1, ACC-F6-1. P01-07 already holds `togglePillar` (1–4, the last stays, a fifth replaces the
most recent pick), `DEFAULT_PILLARS` and the catalogue's units and goal-less nutrients.

What it does (own words): an "All nutrients" link under the pillars opens a sheet with every
nutrient of the selected day. It starts with a "Home pillars" row naming the nutrients Home shows
(and water, when water tracking is on); tapping it opens the picker. With water tracking on, a
water section shows the day's water against the goal in the water unit, with a note that water
always follows the chosen pillars. Then the macros: energy in the person's unit and protein, carbs
and fat, each against its target. Then the detailed nutrition: the 21 optional nutrients that have
goals plus mono- and polyunsaturated fat (which never have one), then the 8 sports compounds, each
with its unit and its goal. A detailed total of exactly 0 shows a dash; other totals show one
decimal only when not whole. The picker lists all 32 nutrients with a check on the chosen ones and,
above them, the chosen order with position numbers (water last, locked, while tracking is on).
Tapping follows the P01-07 rules. "Reset to default" puts back protein, carbs, fat and fibre.
Done saves the choice (then Home redraws its pillars); Cancel, Back or the scrim keeps what was
stored. Nothing changes the stored choice until Done.

Inputs → outputs:
- `DayNutrientsSheet` props: `open`, `onClose`, `day` + `isToday` (the line naming the day),
  `entries`, `targets` (or null), `goals`, `energyUnit`, `pillars`, `water` (or null),
  `onChoosePillars` → the sheet.
- `PillarPicker` props: `open`, `chosen` (stored), `waterOn`, `onSave(keys)` (a promise),
  `onClose` → the sheet; the draft lives only while it is open.
- `homePrefs.setPillars(keys)` (new service, `src/services/homePrefs.ts`) → stores `home.pillars`
  through the settings repository (validated by the schema).
- `HomePage`: two sheets on the router's sheet stack, `nutrients` and `pillars` (the picker opens
  over the sheet, so Back closes the picker first).

Files: created `src/features/home/DayNutrientsSheet.tsx`, `src/features/home/DayNutrientsSheet.test.tsx`,
`src/features/home/PillarPicker.tsx`, `src/features/home/PillarPicker.test.tsx`,
`src/features/home/nutrients.module.css`, `src/services/homePrefs.ts`,
`src/services/homePrefs.test.ts`; changed `src/features/home/HomePage.tsx` (+ tests),
`src/i18n/en/home.ts`; shared, additive: `src/services/context.tsx` (`homePrefs?`),
`src/main.tsx` (wiring).

Edge cases / failure modes:
- The sheet is open while the person switches day (swipe is under the sheet, so only through
  Back/reload): it always shows the entries Home has for the selected day.
- No readable profile: the macros show "No goal" instead of a target.
- A goal of 0 shows "No goal"; mono- and polyunsaturated fat show no goal at all.
- A total of exactly 0 in the detailed list shows "—"; in the macros it shows "0".
- The last chosen nutrient cannot be unchecked (nothing happens); a fifth replaces the latest pick
  (not the first).
- Cancel after changes, Back, Escape or the scrim: the stored choice is unchanged; reopening starts
  again from it.
- Saving fails: a toast says so and the picker stays open with the draft.
- Water tracking off: no water row in the picker, no water section; the home-pillars row names the
  chosen ones only.

Our design differences / decisions:
- Names are ours: `DayNutrientsSheet`, `PillarPicker`, `homePrefs`, sheet ids `nutrients` and
  `pillars`; words are ours ("All nutrients", "Home pillars", "Reset to default").
- The picker is a sheet over the nutrients sheet (both platforms use a dialog or a sheet); it takes
  the iOS extras (positions, Reset) as the row asks.
- Water sits in the chosen-order list as its last, locked position, not among the 32 choices.
- Detailed order is ours: sugars, fibre and fats (with the two goal-less fats), minerals,
  vitamins, caffeine, then the sports compounds; a test keeps it complete.
- A goal of 0 shows "No goal" (the reference shows "/ 0"); goal-less fats show nothing.
- The sheet names the day it shows (Today, or the date) under its title.
- The amino-acid section is not taken: Platewise has no amino-acid estimate setting in v1.
- Done is never disabled: the draft can only hold 1–4 nutrients.

Tests we will write:
- `DayNutrientsSheet.test.tsx`: values are for the entries given (the selected day's); every
  nutrient with its goal and unit (ACC-F6-1); MUFA and PUFA show no goal; a 0 total shows "—";
  energy in kJ with its goal; no profile → "No goal" for the macros; the home-pillars row names
  the chosen ones (plus water) and calls back; the water section only when on.
- `PillarPicker.test.tsx`: the chosen order with positions and water locked last; picking a fifth
  replaces the latest pick (ACC-F5-1); the last one stays; Cancel leaves the setting unchanged;
  Reset restores protein, carbs, fat, fibre; Done saves the draft; a failed save keeps the sheet
  open with a toast.
- `homePrefs.test.ts`: setPillars stores the choice; a refused value is not stored.
- `HomePage.test.tsx`: the link opens the sheet for the selected day (yesterday's values); the
  picker opens over it; Done stores the choice and Home shows the new pillars; Cancel keeps them.

Compare checklist (filled after the rewrite; reopened `NutritionDetailSheet.kt`,
`HomeComponents.swift` 357–476):
- [x] Sections and their order (pillars, water when on, macros, details); values for the selected
  day (`src/features/home/DayNutrientsSheet.test.tsx > DayNutrientsSheet > shows the day's water
  against its goal in the water unit only while tracking is on`, `> names the day it shows: Today,
  or the date`; `src/features/home/HomePage.test.tsx > HomePage: pillars and the day's nutrients
  (P07-03, P07-04) > opens the shown day's nutrients from All nutrients: yesterday's while
  yesterday is shown (ACC-F6-1)`)
- [x] Every nutrient with its unit and goal; energy in the display unit; the 23 + 8 detailed rows
  (`DayNutrientsSheet > lists every nutrient of the day with its unit and its goal (ACC-F6-1)`,
  `> shows energy in kJ against the target, and no goal for the macros without a profile`;
  `src/features/home/dayNutrients.test.ts > the nutrient lists > lists the 23 optional nutrients,
  then the 8 sports compounds, each once, in the sheet`)
- [x] Goal-less fats; a dash for a 0 detailed total, "0" for a macro (`DayNutrientsSheet > shows no
  goal at all for monounsaturated and polyunsaturated fat`, `> shows a dash for a detailed total of
  exactly 0, and 0 for an empty macro`)
- [x] The home-pillars row names the chosen ones plus water and opens the picker over the sheet
  (`DayNutrientsSheet > names the pillars Home shows, plus water while it is tracked, and opens the
  picker from them`; `HomePage: pillars… > chooses pillars over the sheet: Done stores them and
  Home shows them (ACC-F5-1)` checks the sheet stack `['nutrients', 'pillars']`)
- [x] Picker rules: all 32, 1–4, the last stays, a fifth replaces the most recent pick
  (`src/features/home/PillarPicker.test.tsx > PillarPicker > offers all 32 nutrients and shows the
  chosen order with positions, without water when it is not tracked`, `> replaces the latest pick
  when a fifth nutrient is picked (ACC-F5-1)`, `> takes a ticked nutrient out and puts a new one at
  the end`, `> keeps the last nutrient: unticking the only one changes nothing`)
- [x] Water locked and last while tracked (`PillarPicker > shows water last and locked while it is
  tracked`)
- [x] Positions, Reset to default, Done saves, Cancel discards, a failed save stays open
  (`PillarPicker > restores protein, carbs, fat and fibre on Reset to default, saved only by Done`,
  `> saves the draft on Done and then closes`, `> drops the draft on Cancel: nothing is saved`,
  `> stays open with the draft and says so when saving fails`; `HomePage: pillars… > leaves the
  stored pillars as they were on Cancel, and opens again from them`;
  `src/services/homePrefs.test.ts > setPillars > stores the pillars in the order they were picked`,
  `> refuses an empty choice and keeps what was stored`)
- Deliberate differences: our detailed order (Settings › Nutrient goals' reading order, the two
  goal-less fats after saturated fat); totals written whole or to one decimal (the reference always
  writes one decimal); a goal of 0 says "No goal" (the reference shows "/ 0"); no fallback goals
  without a profile; the picker is a sheet over the sheet with both platforms' parts (iOS positions
  and Reset, Android's unit line and locked water row); the sheet names its day; words ours.
- Not taken: the amino-acid section (no such setting in v1); icons and letter badges per row.

## Decisions for the lead

- Copy: `home.nutrients.*` (sheet), `home.picker.*` (picker), `home.amount.*` and the new
  `home.unit.*` words; the two goal-less fats' names are `home.nutrients.monounsaturatedFat` /
  `polyunsaturatedFat` (every other name is a pillar's, `home.pillar.<id>`).
- A goal of 0 reads "No goal" in the sheet as on the pillars; mono- and polyunsaturated fat show no
  goal text at all.
- The day line: "Today" or the long date (`formatDay(day, 'long')`).
- New service `src/services/homePrefs.ts` (`setPillars`); `Services.homePrefs` is optional like the
  other late services, wired in `main.tsx`. Without it (the screen harness), Done shows the save
  failure toast. Screen tests that need it pass their own `ServicesProvider`.
- Sheet ids `nutrients` and `pillars`, exported from `HomePage.tsx` as `NUTRIENTS_SHEET` and
  `PILLAR_PICKER_SHEET`; both sheets render only once Home's reads are ready.
- Data-ui: `home.allNutrients` (link), `home.nutrients` (sheet; `.day`, `.choose`, `.pillars`,
  `.water`, `.macros`, `.detail`, `.row.<id>`), `home.picker` (`.cancel`, `.done`, `.reset`,
  `.order`, `.order.<id|water>`, `.option.<id>`).
- Follow-up: `src/i18n/format.ts` has a private list formatter; the sheet uses `Intl.ListFormat`
  directly for the names line. A public `formatList` there would be tidier (not my file).

## Status

Done (2026-10-27). Created `src/features/home/DayNutrientsSheet.tsx` (+ 8 tests),
`src/features/home/PillarPicker.tsx` (+ 9 tests), `src/features/home/nutrients.module.css`,
`src/services/homePrefs.ts` (+ 2 tests); changed `src/features/home/HomePage.tsx` (+ 4 tests with
P07-03), `src/i18n/en/home.ts`. Shared, additive: `src/services/context.tsx` (`homePrefs?`),
`src/main.tsx` (one import, one line).
