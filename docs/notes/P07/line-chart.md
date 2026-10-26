# Task: Line chart (P07-10) · Phase: 07 · Owner: builder (wt-p07s3, slice S3)

Read (reference @ `10e14b67`): `A/ui/progress/ProgressScreen.kt` lines 760–1400 (the weight chart:
y padding with the goal, the tick rule, the bucket limits and bucket averaging, the x label rule,
the drag inspector and why its position stays out of shared state), `I/Views/ProgressComponents.swift`
(the weight chart's domain and padding, the downsampling helper, the x axis policy). Research spec
`05-home-progress.md` §3.5.3 (weight chart), §3.5.4 (body-fat chart), trap R05.16. No tests in the
reference for this chart beyond the drag rule shared with the bars (P07-11).

What it does (own words): the trend chart under the weight and body-fat cards. Readings are drawn
as a smooth curve in the accent with a faint wash under it, over a faintly tinted plot with a few
round-numbered horizontal grid lines (labels on the right) and dashed vertical guides under the
date labels. The value axis is padded around the readings and the goal so neither touches an edge;
body fat uses a smaller pad and never goes below 0 %. A goal draws as a dashed line in the success
colour. Long windows are averaged into a limited number of points so the line stays readable and a
scrub has few targets; dots mark the points only while there are few enough to tell apart.
Dragging sideways over the plot shows a dashed vertical line, a ringed dot and a small tooltip
(date, value) on the nearest point; letting go hides it. A vertical or diagonal drag is the page
scroll and never scrubs. Screen readers get a hidden table of the plotted points.

Inputs → outputs:
- `chartMath.paddedRange(values, { minPad, floor })` → `{ min, max }` (values include the goal).
- `chartMath.niceStep(rough)`, `niceTicks(min, max, about = 5)` → round tick values inside the range.
- `chartMath.bucketLimit(spanDays)`, `downsample(points)` → at most the limit of averaged points.
- `chartMath.timeAxisLabels(firstAt, lastAt)` → `{ style: 'day' | 'monthYear', labels: [{ at, day, share }] }`.
- `chartMath.isClearlyHorizontal(dx, dy)` → whether a drag scrubs (shared with the bar chart).
- `<LineChart points goal minPad floor label valueLabel formatValue formatTick data-ui />` → SVG,
  tooltip while scrubbing, hidden table.

Files: created `src/domain/progress/chartMath.ts` (+ test), `src/ui/charts/LineChart.tsx` (+ test),
`src/ui/charts/charts.module.css`, shared helpers `src/ui/charts/paths.ts` (+ test, SVG path
strings), `src/ui/charts/usePlot.ts` (width measuring and the press/drag/tap reader),
`src/ui/charts/ChartTable.tsx` (the hidden table), `src/ui/charts/ChartTooltip.tsx` (the tooltip
card), `src/ui/charts/text.ts` (the charts' translator and axis dates), `src/i18n/en/charts.ts`
(partition rooted at `charts`).

Edge cases / failure modes:
- One reading: centred, one date label, the pad keeps the range open.
- All readings on one day, or a span of two days: repeated date labels are dropped.
- More readings than the limit inside one day: they fall in one bucket.
- A span over 150 days that crosses New Year: three labels with month and year.
- Goal far from the readings: the range stretches to include it (it is in the padded values).
- Body fat near 0: the lower bound is floored at 0.
- Floating ticks (0.1 steps): rounded to the step's decimals, so labels never read 0.30000000000000004.
- The plot is not measured yet (first frame, or jsdom): nothing is drawn but the table is there.
- The data changes during a drag: the selection is checked against the new points.
- A drag that leaves the plot: x is clamped to the plot, so the end points stay reachable.

Our design differences / decisions:
- Names, structure and styling are ours: SVG with our tokens (accent line, flat accent wash at low
  opacity, no gradients per D-16.1; success colour for the goal; tick and guide lines in `--line`).
- Buckets are equal runs of calendar days (day keys from `src/domain/dates`): the covered days are
  split into exactly `limit` runs and each non-empty run gives one point averaged in time and
  value, so 365 daily readings give exactly 30 points. (The reference rounds the bucket length up
  to whole days and can end with one bucket fewer than the limit.)
- The plot is inset a few px left and right so the end dots are not cut in half.
- Dashed vertical guides sit under the date labels instead of at fixed quarters.
- The hidden table lists the plotted points (bucket averages when the series was averaged, with a
  sentence saying so) rather than hundreds of raw readings; the history sheet (P07-14) lists every
  reading.
- No haptic tick on the web (no decision asks for `navigator.vibrate`).
- The inspector is pointer-only; keyboard and screen-reader users read the hidden table.
- A press without movement does nothing on this chart (only the bar chart pins on tap).

Tests we will write:
- `chartMath.test.ts`: ticks for 68.2–74.9 kg (padded 66.2–76.9 → 68, 70, …, 76); nice steps 1/2/5/10;
  floating steps round; padding includes the goal; the body-fat pad of 1 and the 0 floor; bucket
  limits at each span edge; 365 daily points → 30 points averaged in time and value; a sparse
  series passes through; labels: 5 de-duplicated, 3 with month and year for a 200-day span across
  New Year, 5 for a 200-day span inside one year, one centred label for one reading; the drag rule.
- `LineChart.test.tsx`: goal line drawn and a sideways drag shows the tooltip with date and value,
  release hides it (ACC-G3-1); a vertical drag and a diagonal drag do not scrub (R05.16); moving
  within one point's zone does not re-render, moving to the next point renders once (render
  counter via `Profiler`, R05.16); 365 daily readings draw 30 points and no dots, the table lists 30
  rows (R05.16); dots shown for ≤ 31 points; the hidden table names dates and values; ticks on the
  right.
- `paths.test.ts`: the smooth curve passes through every point; the area closes on the floor.

Compare checklist (filled after the rewrite; reopened `ProgressScreen.kt` 760–1400 and the chart
parts of `ProgressComponents.swift`):
- [x] y range padded by max(15 % of the spread, 2) around the readings and the goal; body fat
      max(15 %, 1) floored at 0 (`chartMath.test.ts > paddedRange > takes the goal into the range
      so its line stays inside`, `> pads body fat by at least 1 point and never below 0 %`;
      `LineChart.test.tsx > LineChart > keeps the body-fat axis at 0 % or above`)
- [x] about five round ticks (1, 2, 5, 10 × 10^k), labels on the right, one decimal only when not
      whole (`chartMath.test.ts > niceTicks > gives 68, 70 … 76 for weigh-ins from 68.2 to 74.9 kg`,
      `> prints decimal steps exactly`, `niceStep > rounds a rough step of …`;
      `LineChart.test.tsx > LineChart > labels round ticks on the right of the plot`)
- [x] bucket limits 60/48/36/30/24 by span; buckets averaged in time and value; sparse series
      untouched (`chartMath.test.ts > bucketLimit > lets a … -day span plot … points`,
      `downsample > turns 365 daily readings into 30 points averaged in time and value (R05.16)`,
      `> averages the readings of one day into one point when the series is dense`,
      `> keeps a series within its limit as it is, oldest first`; `LineChart.test.tsx > LineChart >
      averages a year of daily weigh-ins into 30 points (R05.16)`)
- [x] dots only at ≤ 31 plotted points (`LineChart.test.tsx > LineChart > marks the points with dots
      only while there are 31 or fewer`)
- [x] x labels: five even, repeats dropped; first/middle/last with month and year past 150 days
      across New Year; one centred label for one reading (`chartMath.test.ts > timeAxisLabels >
      writes month and year at the first, middle and last date for 200 days across New Year`,
      `> drops a label that repeats the day before it`, `> needs more than 150 days before New Year
      switches to month and year`, `> puts one label in the middle for a single reading`;
      `LineChart.test.tsx > LineChart > writes month and year under a 200-day span across New Year`)
- [x] goal as a dashed line; sideways drag shows the dashed vertical line, ringed dot and a tooltip
      (date, value) on the nearest point, kept inside the plot, gone on release (`LineChart.test.tsx
      > LineChart > draws the goal line and shows a tooltip on the nearest point while pressed and
      dragged (ACC-G3-1)`)
- [x] only clearly sideways drags scrub; vertical and diagonal drags stay the page's
      (`chartMath.test.ts > isClearlyHorizontal > lets only drags well over half again as wide as
      they are tall scrub (R05.16)`; `LineChart.test.tsx > LineChart > does not scrub on a vertical
      drag (R05.16)`, `> does not scrub on a diagonal drag that is not clearly sideways (R05.16)`)
- [x] pointer position kept out of render state; a render only when the nearest point changes
      (`LineChart.test.tsx > LineChart > renders again only when the nearest point changes (R05.16)`)
- [x] smooth Catmull-Rom curve through every point and the area closed on the plot floor, clipped
      to the plot (`paths.test.ts > smoothPath > starts at the first point and passes through every
      other one`, `areaPath > closes the curve on the floor below its first and last points`)
- [x] values as text (`LineChart.test.tsx > LineChart > lists its points and the goal as text for
      screen readers`); theme colours only through CSS variables (`> draws with the theme through
      its classes, with no colour of its own`)
- Deliberate differences: buckets are `limit` equal runs of calendar days (exactly 30 for a year
  of daily readings; the reference rounds the bucket up to whole days); flat accent wash instead
  of a gradient (D-16.1); the goal in our success colour; guides under the date labels instead of
  fixed quarters; plot inset 8 px so end dots show whole; the drag rule is the 1.5 ratio on both
  charts (the reference's iOS weight chart only asks |dx| > |dy|); the hidden table lists the
  plotted points with a note when they are averages.
- Not taken: the haptic tick per change (no web decision); the springy slide of the inspector line
  (it jumps, which also suits reduced motion); iOS's stride-based x axis (the row takes the
  five-label rule); a keyboard inspector (the hidden table carries the values).

## Decisions for the lead

- `src/i18n/en.ts`: add the `charts` partition (import and `enPartitions`); then
  `src/ui/charts/text.ts` becomes `export { t as chartT } from '../../i18n/t';`.

- No decision covers haptics on the web; the charts give none (smallest choice; easy to add with
  `navigator.vibrate` later).
- Follow-up: a keyboard inspector (arrow keys over the plot) would help sighted keyboard users; the
  values are in the hidden table today.

## Status

Done (2026-10-26). `chartMath.ts` (shared with P07-11), `LineChart.tsx`, the shared helpers in
`src/ui/charts/` and the `charts` partition are in, with tests. No lines changed outside the
slice's files. Handed on: the `en.ts` merge (lead); the cards that use the chart (P07-12, P07-13).
