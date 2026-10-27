# Task: Gauge and pillars, full (P07-03) · Phase: 07 · Owner: builder (wt-p07s1b, slice S1b)

Read (reference @ `10e14b67`): `A/ui/components/MacroCard.kt` (all: the status rules, the value
format, the tube and its minimum fill, the over colour, the launch-fill epoch);
`A/ui/home/HomeScreen.kt` lines 1666–1850 (the dome's readout, its status in the display unit, the
kJ heading, the "view more" button under the pillars) and the pillar row that uses them (around
lines 585–620: the chosen pillars, then water when on). No reference tests cover these. Research
spec `05-home-progress.md` §3.2.2 (dome), §3.2.3 (pillars), §3.6.3 (water display); trap R05.18
(fill animation, P2: not built); acceptance ids ACC-F4-2, ACC-H4-1. The P01-07 rules
(`decodePillars`, `pillarGoal`), the P01-05 water display (`waterShown`, `formatWater`) and the
P04-03 `Gauge` and `Pillar` primitives are already in place.

What it does (own words): under the energy gauge Home shows the nutrients the person chose for
it (one to four, in the order they were picked; protein, carbs, fat and fibre until they choose),
and after them a water pillar while water tracking is on. Each pillar shows the selected day's
total above a tube that fills toward the goal, the nutrient's name, and a line saying how much is
left or how far over the day is, in the nutrient's own unit (g, mg or mcg), "Goal reached" when it
matches, or "No goal" when the goal is 0. Totals show one decimal only when they are not whole.
Protein, carbs and fat fill toward the day's targets; every other nutrient toward its optional
goal from Settings. The water pillar counts the day's water logs against the daily water goal in
the person's water unit (ml or fl oz). Water and fasting never enter the food totals (R05.4). The
gauge reads the selected day with the "Kilojoules" heading when the energy unit is kJ (landed in
P04/P07-02; kept). An "All nutrients" link sits under the pillars (P07-04 opens its sheet).

Inputs → outputs:
- `PillarRow` props: `entries` (the day's food entries), `pillars` (the stored choice), `targets`,
  `goals` (optional goals), `water` (`{ totalMl, goalMl, unit }` or null when tracking is off) →
  the row of `Pillar`s, each a group named by the nutrient and described by value and status.
- `dayNutrients.ts` helpers shared with the sheet: `amountIn(entry, id)`, `dayTotal(entries, id)`,
  `shownTotal(n)` and `amountText(n)` (one decimal only when not whole), `nutrientName(id)`,
  `statusLine(shown, goal, unit)` (left, over, reached, no goal, in g, mg, mcg, ml or fl oz),
  `shownWater(water)` (as written after the rewrite; the draft named the last two
  `amountStatus`/`waterStatus`).
- `DaySummary` gets `pillars`, `water` and `onShowAll` from `HomePage`.
- `HomePage` reads `home.pillars`, `water.on`, `water.goalMl`, `water.unit` and the selected day's
  water logs (`useDayWater`).

Files: created `src/features/home/PillarRow.tsx`, `src/features/home/PillarRow.test.tsx`,
`src/features/home/dayNutrients.ts`, `src/features/home/dayNutrients.test.ts`; changed
`src/features/home/DaySummary.tsx` (+ tests), `src/features/home/HomePage.tsx` (+ tests),
`src/features/home/home.module.css`, `src/i18n/en/home.ts`.

Edge cases / failure modes:
- A sum such as 0.1 + 0.2 against a goal of 0.3: compared as shown (one decimal), so "Goal
  reached" (kept from P04).
- An entry that does not know a nutrient counts 0 toward it (kept).
- Goal 0 (trans fat and the sports compounds by default, or a goal set to 0): "No goal", and the
  tube shows only its minimum dot.
- No readable profile: the macros have no goal ("No goal"); the optional goals still apply.
- Water on with no logs that day: "0" and "N ml left"; water off: no water pillar, even if logs
  exist (the diary still shows them, P07-05).
- fl oz: amounts and the comparison use the shown values (whole, or one decimal), so the status
  never reads "0 fl oz left".
- A stored choice that is unreadable decodes to the default four (P01-07, settings schema).
- Five pillars (four plus water) share one row on a 360 px screen.

Our design differences / decisions:
- Names are ours: `PillarRow`, `dayNutrients`, `statusLine`, `shownWater`, `WaterDay`.
- The status compares the shown values (one decimal for nutrients, the shown water amount), not
  the raw sums; the reference compares raw doubles, which can say "0g left" for a sum of decimals.
- Copy keys: the 32 pillar names live in `home.pillar.<id>` (the P04 keys `home.pillar.protein`,
  `…left` stay as they are, since the onboarding e2e reads them); the other units get their own
  messages (`home.pillar.leftMg`, …) so each language can place the unit itself.
- The link under the pillars says "All nutrients" (a 2-word label of ours) instead of a "more"
  button with a chevron.
- The fill-from-zero animation on cold start and foreground returns (R05.18) is P2 (F13) and not
  built here; the review line of R05.18 stays as it is.
- No haptic, no per-pillar colour; over the goal the status takes the accent (the `Pillar`
  primitive already does it).

Tests we will write:
- `PillarRow.test.tsx`: sodium with goal 2 300 and 2 500 eaten → "200 mg over" (ACC-F4-2); a
  nutrient with goal 0 → "No goal"; the chosen order kept, from one to four pillars; the water
  pillar only when tracking is on, after the chosen ones, with the day's amount against the goal
  (ACC-H4-1); fl oz water; mcg status for vitamin D; totals whole or one decimal; reached.
- `DaySummary.test.tsx`: kept tests; the summary shows the stored pillars and the water pillar; the
  "All nutrients" link calls back; the kJ heading switches (kept).
- `dayNutrients.test.ts`: `amountText`, `amountStatus` per unit, `waterStatus`, `dayTotal`.
- `HomePage.test.tsx`: the stored pillar choice and the water pillar (water on, logs of the
  selected day only) on Home.

Compare checklist (filled after the rewrite; reopened `MacroCard.kt`, `HomeScreen.kt` 570–625 and
1666–1850):
- [x] Status: no goal at ≤ 0, reached, left, over, in the nutrient's unit
  (`src/features/home/PillarRow.test.tsx > PillarRow > shows 200 mg over on a sodium pillar with a
  goal of 2 300 and 2 500 eaten (ACC-F4-2)`, `> shows No goal for a nutrient whose goal is 0`,
  `> fills the macros toward the targets and the rest toward their optional goals, in each unit`;
  `src/features/home/dayNutrients.test.ts > statusLine > says what is left, how far over, reached
  or no goal, in the unit given`)
- [x] Value whole or one decimal; compared as shown; over in the accent; the tube's minimum fill
  stays the primitive's (`dayNutrients.test.ts > amountText > writes one decimal only when the
  amount is not whole`, `> statusLine > compares the shown amounts, so a sum of decimals meets its
  goal`; `PillarRow > shows 200 mg over…` checks `data-over`; `src/ui/Pillar.test.tsx` keeps the
  tube)
- [x] Chosen pillars (at most 4, stored order) then water when on; water in its unit, against its
  goal (`PillarRow > keeps the chosen order, from one pillar up to four`, `> shows the water pillar
  only while tracking is on, after the chosen ones`, `> shows the day's water against the daily
  goal in the water unit (ACC-H4-1)`; `src/features/home/DaySummary.test.tsx > DaySummary pillars,
  chosen (P07-03) > shows the stored pillars in their order, then water while it is tracked`;
  `src/features/home/HomePage.test.tsx > HomePage: pillars and the day's nutrients (P07-03, P07-04)
  > shows the stored pillars, then water with the shown day's logs while it is tracked
  (ACC-H4-1)`, which also checks that water leaves the gauge alone and follows the selected day)
- [x] Goals: macros from the targets, others from the optional goals; none without a profile
  (`PillarRow > fills the macros toward the targets…`; `DaySummary pillars > reads no goal for the
  macros without a profile, and for a goal of 0`)
- [x] Gauge for the selected day, heading switches to kJ, status in the display unit
  (`DaySummary gauge > names Kilojoules and shows kJ numbers while comparing in kcal`; the selected
  day: `HomePage: the selected day (P07-01, P07-02) > shows the week bar on today, and last
  Monday's diary and summary once it is selected (ACC-F1-1)`)
- [x] The link under the pillars (`DaySummary pillars, chosen (P07-03) > opens every nutrient of
  the day from the All nutrients link under the pillars`)
- Deliberate differences: the status compares the shown amounts (the reference compares raw
  doubles); water's status compares the shown water amounts too; "All nutrients" instead of a
  "more" button with a chevron; no fallback goals without a profile (R05.12: "No goal").
- Not taken: the fill-from-zero animation (R05.18, P2/F13); the burn and steps lines (later
  phases); haptics.

## Decisions for the lead

- Copy keys: the 32 pillar names are `home.pillar.<id>`, ordered as the model lists the keys. A
  first order (macros, sugars, fats, …) tripped the similarity gate (a 13-word run against the
  reference's nutrient list on `src/i18n/en/home.ts`); the list was rebuilt in the model's own
  order (§6 of the protocol, structure not wording), and the gate is clean.
- `home.pillar.left` / `…over` stay the gram messages (the onboarding e2e reads them); the other
  units have their own messages (`leftMg`, `overMcg`, `leftFlOz`, …).
- `amountIn` moved from `DaySummary.tsx` to `dayNutrients.ts` (its test with it).
- HomePage now reads the selected day's water logs always (not only with water on), so P07-05's
  diary rows can share the read; a failing water read shows the day's error card like the others.
- The pillar row takes as many equal columns as there are pillars (1–5).

## Status

Done (2026-10-27). Created `src/features/home/PillarRow.tsx` (+ 7 tests),
`src/features/home/dayNutrients.ts` (+ 9 tests); changed `src/features/home/DaySummary.tsx`
(+ 2 tests, the rest adapted), `src/features/home/HomePage.tsx` (+ 4 tests with P07-04),
`src/features/home/home.module.css`, `src/i18n/en/home.ts`. R05.18's review line stays as it is.
