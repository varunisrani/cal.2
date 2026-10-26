# Task: Bar chart (P07-11) · Phase: 07 · Owner: builder (wt-p07s3, slice S3)

Read (reference @ `10e14b67`): `A/ui/progress/ProgressScreen.kt` lines 1497–1970 (the calorie
section: the y top, the bar layout and its three regimes, the nearest-bar hit test, tap to pin and
drag to scrub, the thinned date labels), `T/ui/progress/ProgressRangeTest.kt` (the bar layout and
hit-test cases, among them `denselyLoggedLongPeriodsFitTheWholePlotSoTheLatestDayIsReachable`), and
the iOS drag rule `onlyClearlyHorizontalDragsScrubTheCalorieChart` (`IT/ProgressRangeTests.swift`)
with the calorie chart section of `I/Views/ProgressComponents.swift`. Research spec
`05-home-progress.md` §3.5.7 (calorie history), traps R05.15, R05.16, R05.17 (absent days).

What it does (own words): the calorie history under Progress. Each day with energy gets one bar in
the accent with rounded top corners; days without food get no bar at all (never a zero bar) and
take no slot. A dashed goal line crosses the plot; the value axis starts at 0 and ends on a round
tick at or above the larger of the highest day and the goal, with its labels on the right. Bars
share the plot's width with 4 px between them and are never wider than 60 px; when even 2 px bars
no longer fit, the gaps shrink (to 1 px at least), and past that bar and gap shrink together at
2 : 1, so every bar is always inside the plot and the newest one stays under the finger. Dates sit
under bar centres, thinned so each has at least 40 px, always including the newest day. A tap pins
the nearest bar's tooltip (date, value); a second tap on it, or a tap anywhere outside the chart,
clears it. A clearly sideways drag scrubs across bars and clears on release; a vertical or
diagonal drag is the page scroll and leaves a pinned tooltip alone. Screen readers get a hidden
table of the days and values.

Inputs → outputs:
- `chartMath.barScale(peak, goal)` → `{ top, ticks }` (0 … top, top at or above max(peak, goal)).
- `chartMath.barLayout(width, count, maxBar = 60)` → `{ start, bar, gap }`;
  `barCentre(layout, i)`; `barIndexAt(layout, count, x)` → nearest bar or `null` without bars;
  `barLabelIndices(layout, count, minWidth = 40)` → indices to label, newest always in.
- `<BarChart days goal label valueLabel formatValue formatTick data-ui />` → SVG, pinned or
  scrubbed tooltip, hidden table.

Files: created `src/ui/charts/BarChart.tsx` (+ test); bar maths in `src/domain/progress/chartMath.ts`
(+ test); shares `charts.module.css`, `paths.ts`, `usePlot.ts`, `ChartTable.tsx`, `text.ts` and the
`charts` partition with P07-10.

Edge cases / failure modes:
- A day with 0 or a non-finite value is dropped (absent, not a zero bar).
- One day: one bar, at most 60 px, centred.
- 365 (or 3 650) days on a narrow plot: all bars inside, the right edge picks the newest.
- Goal 0 or missing: no goal line; the axis follows the highest day only.
- Days given out of order: drawn by date.
- The data changes (another period) while a tooltip is pinned: the pin is dropped.
- A tap that turns into a scroll (pointer cancelled): a pinned tooltip stays.

Our design differences / decisions:
- Our own SVG, names and structure; flat accent bars (no gradient, D-16.1); the goal line in the
  success colour like the line chart's; the selected bar stays full colour and the others dim.
- Dense regime: gap = width ÷ (3n − 1) and bar = 2 × gap, which fills the plot exactly and meets
  the shrinking-gap regime without a jump (the reference splits each slot in thirds and leaves a
  third of a slot unused).
- The axis ends on a nice tick at or above the larger of the highest day and the goal, per the row
  (the reference's top is the value itself, so its top line has no label).
- Label thinning counts back from the newest day by a whole number of slots, so labels never
  overlap and the newest is always labelled (the oldest may go unlabelled).
- Missing days take no slot (bars in date order of logged days), as the reference's Android chart;
  "gap" means no bar.
- No haptic tick on the web; pointer-only inspector, the hidden table for everyone else.

Tests we will write:
- `chartMath.test.ts`: a week on 900 px gives 60 px bars with 4 px gaps, centred; the three
  regimes and their edges (2 px bars at gap 4; gap shrinking; 2 : 1 below 1 px gaps); for 150 …
  3 650 bars on 900 px and 365 bars on 360 px the group fits and the right edge and the last
  centre pick the newest bar (R05.15); hit test picks the nearest bar and clamps; label indices
  ≥ 40 px apart with the newest kept; y top at or above max(peak, goal).
- `BarChart.test.tsx`: 365 bars fit a 360 px plot with the last bar inside and a tap at the right
  edge pins the newest day (ACC-G10-1, R05.15); 7 bars are 60 px at most; labels thinned with the
  last kept; tap pins and a second tap clears; a tap outside clears; a vertical drag does not
  scrub or clear the pin; a sideways drag scrubs and release clears (R05.16); missing days are
  gaps (two bars for days 1 and 3, a zero day draws nothing); the hidden table lists the days.

Compare checklist (filled after the rewrite; reopened `ProgressScreen.kt` 1497–1970,
`ProgressRangeTest.kt` and the iOS drag rule):
- [x] three layout regimes: 4 px gaps with bars up to 60 px; 2 px bars with gaps down to 1 px; then
      bar and gap together at 2 : 1; centred (`chartMath.test.ts > barLayout > caps a week of bars
      at 60 px with 4 px gaps, centred`, `> shares the width between bars under 60 px with 4 px
      gaps`, `> keeps 2 px bars and narrows the gaps once 4 px gaps no longer fit`, `> shrinks bar
      and gap together at 2 : 1 once the gaps would drop under 1 px`, `> passes from narrowing gaps
      to shrinking bars without a jump`; `BarChart.test.tsx > BarChart > keeps each bar at most
      60 px wide, centred in a wide plot`)
- [x] the whole range always fits and the newest day is reachable at the right edge, 150 … 3 650
      bars (`chartMath.test.ts > barLayout > fits every bar inside the plot so the newest day stays
      reachable (R05.15)`; `BarChart.test.tsx > BarChart > fits a full year of bars inside a 360 px
      plot and inspects the last day (ACC-G10-1, R05.15)`)
- [x] nearest-centre hit test clamped to both ends; nothing without bars (`chartMath.test.ts >
      barIndexAt > picks the bar with the nearest centre and clamps past either end`, `> finds
      nothing without bars`)
- [x] labels under bar centres, ≥ 40 px each, newest always labelled (`chartMath.test.ts >
      barLabelIndices > thins the labels to 40 px each, counting back from the newest day`;
      `BarChart.test.tsx > BarChart > thins the dates to 40 px each and always labels the last
      day`, `> labels every day of a week`)
- [x] y axis from 0 to a round tick at or above max(highest day, goal); dashed goal line; labels on
      the right (`chartMath.test.ts > barScale > ends on the first round tick above the highest day`,
      `> reaches the goal when the goal is above every day`; `BarChart.test.tsx > BarChart > draws
      the goal as a dashed line and runs the axis to a round tick above it`, `> draws no goal line
      without a goal`)
- [x] tap pins (others dim), the same bar again clears, another bar moves the pin, a tap outside
      clears (`BarChart.test.tsx > BarChart > pins a tooltip on a tap and clears it on a second
      tap`, `> moves the pin to another bar tapped`, `> clears a pinned tooltip on a tap anywhere
      outside the chart`)
- [x] a sideways drag scrubs and clears on release; a vertical drag neither moves nor clears a pin,
      also when the page takes the scroll (`BarChart.test.tsx > BarChart > scrubs across the bars
      on a sideways drag and clears on release (R05.16)`, `> leaves a pinned tooltip alone during a
      vertical drag (R05.16)`)
- [x] days without food get no bar and no slot; days drawn in date order; another set of days drops
      the pin (`BarChart.test.tsx > BarChart > draws no bar for a missing day or a day without food
      (R05.17)`, `> draws the days in date order whatever order they come in`, `> drops a pinned
      tooltip when the days change`)
- [x] values as text, theme colours only (`BarChart.test.tsx > BarChart > lists every day and its
      value in a hidden table`, `> draws with the theme through its classes, with no colour of its
      own`)
- Deliberate differences: the dense regime fills the plot exactly (gap = width ÷ (3n − 1)); the axis
  ends on a round tick at or above the top value (per the row); labels counted back from the
  newest day so they never overlap; flat accent bars with rounded tops only (D-16.1); the goal in
  the success colour, like the line chart's; a tap outside the chart clears a pin.
- Not taken: the per-bar dashed guides of roomy layouts; the haptic tick; the slide animation of
  the inspector; the "Avg" header and empty message (the Calories card, P07-16).

## Status

Done (2026-10-26). `BarChart.tsx` and its tests are in; the bar maths live in `chartMath.ts`. No
lines changed outside the slice's files. Handed on: the Calories card (P07-16) gives the chart
display-unit values of days with energy > 0 and the goal, and owns the empty state.
