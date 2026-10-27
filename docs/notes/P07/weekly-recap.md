# Task: Weekly recap (P07-15) · Phase: 07 · Owner: builder (wt-p07s4b, slice S4b)

Read (reference @ `10e14b67`): `A/ui/progress/WeeklyRecap.kt` (all: the week start for the
setting, the per-week tallies, the highlight order and cap, the ±10 % test, the signed change),
`A/ui/progress/WeeklyRecapCard.kt` (all: the session-only offset, the arrows, the tiles and their
change lines, the weight row, the highlight rows, the note and the empty message),
`I/Models/WeeklyRecap.swift` (all: the same model on iOS); where `ProgressScreen.kt` mounts the card
(only once the profile is read; goals from the effective targets; today and the zone re-read on
return to the app). Tests: `T/ui/progress/WeeklyRecapTest.kt`, `IT/WeeklyRecapTests.swift`
(week boundaries for both week starts, the current week never recapped, the zone regrouping,
tallies with the 10 % edge and 149.6 g, an empty week, weight change from ≥ 2 readings, comparison
with the week before, highlight order and cap, the average needing three days, signed changes,
kJ figures with kcal comparisons). Research spec `05-home-progress.md` §3.5.6, R05.19, R05.4;
decision D-16.44. No REA evidence needed.

What it does (own words): at the top of Progress a card recaps the last week that has fully
ended, by the app's week start (Monday or Sunday), and compares it with the week before. The week
containing today is never recapped: on the last day of a week the card still shows the one before.
Arrows step to earlier weeks and back, never past the last finished week; the step count lives only
as long as the page. For each week it counts the days with any food, the days whose calories land
within 10 % of the calorie goal (always worked out in kcal, whatever unit is shown), the days whose
protein, rounded to a whole gram, reaches the protein goal, the average calories over the logged
days, the weigh-ins and, from two of them, the change from the first to the last, and the longest
run of logged days. Four tiles show days logged out of 7, days near the calorie goal, days the
protein goal was met (each with "+2 / −1 / 0" against the week before, in the accent when it is
better) and the average with the goal under it. Below: the weight change, then up to three
good-news lines in a fixed order, then a short note on what the changes compare. A week with no
food and no weigh-ins shows one empty message instead. Water and fasts never count.

Inputs → outputs:
- `recap.ts` (pure): `recapWeek(today, weekStart, offset)` → the recapped `DayWindow`;
  `recapSpan(today, weekStart, offset)` → both compared weeks (what the card reads);
  `tallyWeek(first, entries, weighIns, goals)` → `WeekTally`; `highlightsFor(week, before,
  kcalGoal)` → `Highlight[]` (≤ 3); `nearCalorieGoal(kcal, goal)`; `buildRecap({today,
  weekStart, offset, entries, weighIns, goals})` → `WeeklyRecap {first, last, week, before,
  highlights}`; `hasActivity(tally)`.
- `RecapCard` (no props): reads `display.weekStart`, `units.energy`, `units.weight`, the targets
  for today, the food entries and the weigh-ins of the two weeks; draws the card.
- `ProgressPage`: one mount in place of the recap slot.

Files: created `src/domain/progress/recap.ts` (+ test), `src/features/progress/RecapCard.tsx`
(+ test), `src/features/progress/recap.module.css`; changed `src/features/progress/ProgressPage.tsx`
(the slot becomes the card), `src/i18n/en/progress.ts` (new `progress.recap` keys only).

Edge cases / failure modes:
- Today is the first day of a week → the recap is the week that ended yesterday; today the last
  day of a week → the week before it (the current week is never recapped).
- A Sunday-evening entry: in the recapped week with Monday weeks, in the next one with Sunday
  weeks (both week starts tested).
- 1 800 kcal against 2 000 counts (exactly 10 % under); 1 799 does not; a goal of 0 counts nothing.
- 149.6 g of protein counts for a goal of 150; a protein goal of 0 counts nothing.
- No logged day → no average ("—"), no average highlight; the average highlight also needs three
  logged days.
- One weigh-in → no weight row; two or more → last minus first by time, whatever the stored order.
- kJ shown: the average and the goal convert for display only; the near-goal test stays in kcal.
- Offset never below 0; the forward arrow is off at 0.
- Today moves on (midnight, or the page shown again after a night asleep): `useToday()` changes
  and the recap rolls on to the week that just ended (R05.14 through `TodayProvider`).
- Reads loading → a quiet placeholder block, no numbers; a read fails → one message in the card.
- No profile (cannot reach Progress before onboarding, but a corrupt one can happen) → no card.

Our design differences / decisions:
- Names, structure and words are ours (`WeekTally`, `Highlight` kinds, `recapSpan`).
- Workout and burn tiles, burn totals and the more-workouts highlight are left out (D-16.44); with
  them gone, four tiles in a 2 × 2 grid (four across on a wide card) instead of six in three columns.
- "Activity" for the empty message is food or a weigh-in (workouts do not exist yet).
- Entries count on their stored day key (the day the Home diary shows them on), not on their
  instant in the zone the device is in now: the recap and Home always agree about which day a meal
  belongs to. The reference regroups late-night entries after a zone change; here they stay on the
  day they were logged for. Weigh-ins have no day key and count by instant (`inDays`, R05.5).
  Decision for the lead below.
- The average tile's label switches with the unit ("Average calories" / "Average kilojoules")
  rather than writing the unit word into the number.
- The card reads its own data, so the page only mounts it (the calories and averages cards land on
  the same page in parallel).
- The weight change uses the weight card's rule: one decimal, signed, under 0.05 shown as 0.0.

Tests we will write:
- `recap.test.ts`: last finished week for Monday and Sunday weeks from a Saturday; never the
  current week (last day of a week vs the day after); offset 1 is the week before; a late-Sunday
  entry with both week starts; tallies (logged, near goal with the 10 % edge, protein 149.6 vs 150,
  rounded average, longest run) with entries outside both edges left out; 1 799 vs 1 800; goal 0;
  an empty week; weigh-ins and change from ≥ 2 in any order; the week before for comparison and no
  highlight for a quieter week; highlight order and the cap of three; a streak and more days without
  a full week; the average needing three days; kJ never changes a count.
- `RecapCard.test.tsx`: the last finished week's dates and days logged n/7 with the change from the
  week before (ACC-G8-1); at most three highlights, improvements only (ACC-G8-2); accent on better
  changes only; kJ average and goal with kcal counting; arrows back and forward, forward off at 0;
  the empty message, with water and a fast in that week (R05.4); the weight row; the week rolls on
  when the page is shown again after midnight; Sunday weeks from the setting.

Compare checklist (filled after the rewrite; reopened `WeeklyRecap.kt`, `WeeklyRecapCard.kt`,
`WeeklyRecap.swift`, `WeeklyRecapTest.kt`, `WeeklyRecapTests.swift`):
- [x] the last week that ended, by the setting's week start, offset 1 the week before
      (`recap.test.ts > recapWeek > recaps the last week that has ended, by the week start setting
      (R05.19)`; `RecapCard.test.tsx > RecapCard > recaps the last week that ended: days logged of 7
      with the change from the week before (ACC-G8-1, R05.19)`)
- [x] the current week never recapped, even on its last day (`recap.test.ts > recapWeek > never
      recaps the current week, even on its last day (R05.19)`; the card test above logs a meal today)
- [x] a late-Sunday meal in different weeks for Monday and Sunday weeks (`recap.test.ts > buildRecap >
      puts a late-Sunday meal in different weeks for Monday and Sunday weeks (R05.19)`;
      `RecapCard.test.tsx > RecapCard > follows the week start setting: a late-Sunday meal leaves the
      recap for Sunday weeks (R05.19)`)
- [x] ±10 % inclusive, in kcal, nothing for a goal of 0 (`recap.test.ts > nearCalorieGoal > takes 10 %
      either side of the goal: 1 800 and 2 200 count, 1 799 does not (R05.19)`, `> counts nothing
      without a calorie goal`)
- [x] protein to the whole gram (149.6 meets 150), nothing for a goal of 0 (`recap.test.ts > tallyWeek
      > counts logged days, days near the goal and protein days, 149.6 g meeting 150 (R05.19)`, `> counts
      no day near a goal of 0 and no protein day for a protein goal of 0`)
- [x] rounded average over logged days, none for an empty week; longest run (`recap.test.ts >
      tallyWeek > averages over the logged days to the whole kcal, and finds the longest run`, `> gives an
      empty week no average, no change and nothing to show`)
- [x] weigh-ins and the change from ≥ 2 by time, late on the last day in (`recap.test.ts > tallyWeek >
      takes the weight change from the first weigh-in to the last, in time order`, `> gives no change for
      a single weigh-in`; `RecapCard.test.tsx > RecapCard > shows the change from the first to the last
      weigh-in of the week, with no food logged`, `> leaves the weight row out for a single weigh-in`)
- [x] the week before for the changes, no line for a quieter week (`recap.test.ts > buildRecap > sets
      an earlier week against the one before it and names nothing for a quieter week`)
- [x] highlight order, improvements only, at most three; the full week leaves out "more days"; the
      average needs three days (`recap.test.ts > highlightsFor > …` six cases; `RecapCard.test.tsx >
      RecapCard > names a step forward and never a step back (ACC-G8-2)`, `> shows at most three lines,
      the first three in their order (ACC-G8-2, R05.19)`)
- [x] tile changes "+1 / −1 / 0", accent only when better (`RecapCard.test.tsx > RecapCard > recaps the
      last week that ended…`)
- [x] kJ figures with kcal counts: 1 850 → 7,740, goal 8,368, three days near the goal
      (`recap.test.ts > buildRecap > counts an average of 1 850 kcal near a 2 000 kcal goal on every day`;
      `RecapCard.test.tsx > RecapCard > shows energy in kJ while every day is still measured in kcal
      (R05.19)`)
- [x] arrows: back freely, forward stops at the last ended week, session only (`RecapCard.test.tsx >
      RecapCard > steps back to earlier weeks and forward again, never past the last week that ended`;
      `recap.test.ts > recapWeek > treats a negative or fractional offset…`)
- [x] empty message when no food and no weigh-ins; water and fasts never count (`RecapCard.test.tsx >
      RecapCard > shows only the empty message for a week of water and fasts (R05.4)`)
- [x] today re-read on return to the page (`RecapCard.test.tsx > RecapCard > moves on to the week that
      just ended when the page is shown again after midnight (R05.14)`)
- [x] shown only with a profile, at the top of the page (`RecapCard.test.tsx > RecapCard > sits at the
      top of the Progress page, above the range control`; no profile: `targets.kind !== 'ok'` draws
      nothing, read by eye)
- Deliberate differences: no workout and burn tiles, no burn totals, no more-workouts highlight
  (D-16.44), so four tiles in a 2 × 2 grid (four across on a wide card); entries count on their
  stored day key, so a zone change does not regroup them (decision below); the average tile names
  the unit in its label instead of in the number; our own words for every label and line; the last
  shown week stays on screen (busy) while the next one is read instead of a blank block.
- Not taken: workout-day collection from plans and burns, the burn figures and their kJ change rule
  (no workouts in v1); the text-scale switch to two columns (the grid already gives two columns on a
  phone).

## Decisions for the lead

- **Verify cell of P07-15 says "1 799 kcal with goal 2 000 counts (±10 %)".** Under the row's own
  rule (and spec 05 §3.5.6, R05.19, the reference's tests) 1 799 is 10.05 % under, so it does not
  count; 1 800 is the edge that does. Built and tested as the rule says (`recap.test.ts >
  nearCalorieGoal > takes 10 % either side of the goal: 1 800 and 2 200 count, 1 799 does not
  (R05.19)`; the card test shows a 1 799 day not counted). If the cell is what you want, it is one
  line in `nearCalorieGoal` (for example a whole-percent rounding of the gap) plus those two tests.
- **Day grouping after travel.** Entries count on their stored `dayKey` (the day Home shows them
  on), not on their instant in the device's current zone, so the recap and the diary always agree.
  R05.19 notes the reference regroups late-night entries after a zone change; here they stay put.
  Weigh-ins have no day key and count by instant in the current zone (`inDays`), recomputed when
  today, the readings or the settings change. Smallest choice; changing it means reading a day
  either side and grouping by `dayKeyOf(loggedAt)`.
- The card reads its own data (settings, targets for today, the two weeks' entries and weigh-ins),
  so `ProgressPage.tsx` changes by one mount: the `RecapSlot` placeholder is gone and `<RecapCard />`
  takes its place. Merge with S4d's calories/averages mount by hand.
- `src/i18n/en/progress.ts`: a new `progress.recap` group inserted after `loadFailed`; the file's
  header comment does not mention the recap yet (left as is to keep the change additive).
- Traps ledger: R05.19 can take the `Test:` lines above; R05.4's "averages and the recap" review line
  is half covered by `RecapCard.test.tsx > RecapCard > shows only the empty message for a week of
  water and fasts (R05.4)`. Acceptance: ACC-G8-1 and ACC-G8-2 as listed in the checklist.

## Status

Done (2026-10-27). `recap.ts` with its tests, `RecapCard` with its tests and stylesheet, the
`progress.recap` words and the mount on the Progress page. Lines changed outside the new files:
`src/features/progress/ProgressPage.tsx` (the recap slot becomes the card), `src/i18n/en/progress.ts`
(additive keys). Nothing handed on.
