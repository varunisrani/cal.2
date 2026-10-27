# Task: Home and Progress e2e (P07-17) · Phase: 07 · Owner: builder (wt-p07s17, wave C)

Read (reference @ `10e14b67`): none. The phase row lists no reference file: the spec strings
together screens and services that already landed (P07-01..16) and proves them end to end in a
browser. Our own docs read: the P07-17 row, "Goal", "Done when" (Demo 4) and the compare checklist
of `docs/plan/phases/P07-home-progress-trackers.md`; research spec `05-home-progress.md` §3.2
(week bar, swipe, pillars, picker), §3.3 (diary, sort, rows), §3.5 (ranges, weight, histories,
recap, calories), §3.6–3.7 (water, fasting, food paused); D-16.35 (End fast and log), D-16.36
(future days shown, disabled), D-16.38 (confirmed history deletes), D-16.44 (recap without
workouts); the acceptance row whose Review line names P07-17 (ACC-H3-2; no trap row names it);
the P07 task notes for their data-ui hooks (`week-bar.md`, `selected-day-and-day-swipe.md`,
`day-nutrients-sheet-and-pillar-picker.md`, `diary-sort-water-and-fast-rows.md`,
`add-menu-water-and-fasting.md`, `fasting-flows-editor-and-settings.md`); the landed specs
`e2e/walking-skeleton.spec.ts`, `e2e/onboarding.spec.ts`, `e2e/logging.spec.ts` and
`e2e/support.ts`; the landed code for hooks, words and behaviour (`HomePage.tsx`, `WeekBar.tsx`,
`DaySwipe.tsx`, `DaySummary.tsx`, `PillarRow.tsx`, `DayNutrientsSheet.tsx`, `PillarPicker.tsx`,
`Diary.tsx`, `SortMenu.tsx`, `WaterRow.tsx`, `FastRow.tsx`, `SelectionBar.tsx`, `AddMenu.tsx`,
`WaterMenuPage.tsx`, `CustomWaterSheet.tsx`, `WaterSettings.tsx`, `FastingSettings.tsx`,
`StartFastSheet.tsx`, `PausedDialog.tsx`, `ManualSheet.tsx`, `ProgressPage.tsx`, `RangeBar.tsx`,
`WeightCard.tsx`, `LogWeightSheet.tsx`, `HistoryLink.tsx`, `HistorySheet.tsx`, `RecapCard.tsx`,
`CaloriesCard.tsx`, `LineChart.tsx`, `usePlot.ts`) and the i18n partitions they speak.

What it does (own words): ten browser tests on the Pixel 7 profile, each from an empty browser,
walk the wizard on its defaults with the AI set up later (the formula plan: 2,452 kcal, 112 g
protein), land on Home on Tuesday 2026-10-27 at 08:30 (Mondays start the week), and then:
1. Water on past days: water turned on in Settings › Tracking & reminders adds the water pillar;
   last Tuesday is picked in the week bar (the bar moves to that week; tomorrow stays disabled)
   and a 250 ml quick-add from the + menu's Water page lands there; yesterday gets a custom 330 ml;
   today stays dry and its gauge never moves for water. Yesterday's row is deleted only after
   its confirmation. With water off again the + menu loses Water and the pillar goes, but last
   Tuesday's row stays (ACC-H3-2, Demo 4).
2. Day swipe: a sideways drag of 120 px toward the right over the summary shows yesterday (the bar
   follows, the diary heading changes, the gauge reads that day); toward the left comes back to
   today; toward the left on today, or a 60 px drag, changes nothing.
3. Pillars: Home opens on protein, carbs, fat and fibre; All nutrients lists the day's amounts
   against their goals; the picker over it adds sodium as a fifth pick in place of the latest one;
   Cancel keeps the stored choice; Done stores protein, fat and sodium, Home shows them in that
   order and they survive a reload.
4. Sort: three entries (breakfast, lunch, breakfast again) read by meal with each section's
   total; Sort in the first header → Newest first shows breakfast, lunch, breakfast; the choice
   survives a reload; By meal brings the two sections back.
5. Fasts from the + menu: fasting turned on offers Start fast; the start sheet opens on 16 hours;
   while the fast runs the + menu holds only Fasting; Cancel fast leaves no row; a new fast's row
   counts up as the page clock moves an hour and shows only on today; End fast from the menu
   turns it into a finished "1h fast", which is deleted only after its confirmation.
6. Food paused, one tab: two entries logged, a fast started, a long-press picks both and Combine
   is refused with the paused dialog; Cancel keeps the fast and the picks; End fast and log ends
   the fast and combines.
7. Food paused, two tabs: a manual entry is open in one tab while another tab starts a fast; Save
   shows the paused dialog and End fast and log stores the entry and ends the fast (ACC-D27-1).
8. Back-dated weight: en-US starts in lb, so the wizard's 70 kg reads 154.3 lb; Log weight's
   kg | lb toggle turns the wheels from 154.3 lb to 70.0 kg and the whole app to kg; a future
   date is held to today; 72.4 kg on last Tuesday; Current stays on today's 70.0 kg; 1W holds
   only today's reading; 1M shows both on the chart (two dots, the hidden table), the net change
   and average; a vertical drag over the plot never shows the tooltip, a sideways one shows it on
   last Tuesday (Demo 4).
9. History: the link counts two weigh-ins; the sheet lists them newest first; deleting today's
   asks first, naming its value and date; Cancel keeps it; Delete takes the row out at once and
   Current falls back to 72.4 kg.
10. Recap: last Monday to Wednesday get food through the week bar (two days near the calorie goal,
    two with the protein goal met, three in a row) plus a meal today; Progress recaps Oct 19 – 25
    with 3/7, 2/7, 2/7 and the average against the goal, three highlights in their order, an empty
    week before it; the calorie card's Avg follows Count today (today in, then the window ending
    yesterday).
Every test routes all traffic off loopback with the logging spec's routes (any other host is
aborted, recorded and fails the test), and fails on any uncaught page error.

Inputs → outputs:
- `e2e/home-progress.spec.ts` → ten Playwright tests over the built app (`vite preview`), one
  worker, Pixel 7, `en-US`, UTC, reduced motion, the page clock installed at 2026-10-27 08:30 UTC.
- `e2e/support.ts` → unchanged: its `ui`, `words`, `LOCALE`, `routeFoodDatabases`, `recordHooks`
  and `hooksSeen` are enough; the gestures and the onboarding walk stay in the spec.

Files: created `e2e/home-progress.spec.ts`, this note.

Edge cases / failure modes:
- The clock runs at real speed after `page.clock.install`; nothing waits in real time. The fast's
  hour passes with `page.clock.fastForward` (one tick of the row's every-second timer, not 3 600),
  and the long-press is held for 1 s with `page.clock.runFor`. Times of day that depend on how long
  the wizard took (the fast's start "8:30 AM") are not asserted; durations are whole minutes and
  the real seconds between start and check stay far under one.
- `page.clock` is the context's clock, so a second tab shares it; IndexedDB is shared by origin,
  so the second tab opens on Home with the same profile.
- A drag on the summary, a swipe on a row, a long-press and a scrub on a chart are pointer
  presses with `page.mouse` (pointer events of type mouse, button 0), as the walking skeleton's
  swipe does.
- The week bar's previous page is off screen; a tap on a tile there is preceded by Playwright's own
  scroll into view, after which the app keeps the bar on that week.
- The water page inside the menu is fetched on first open; its quick-add closes the menu after the
  log is stored, with a short confirmation.
- Toasts last 4 s of page clock at real speed: each one is read right after its action.
- The floating tab bar and the "+" button cover the bottom of the page: a row or a chart is
  scrolled to the middle of the screen before a pointer press on it.
- The Settings tab reopens the page it was left on: after a switch the spec goes up to the
  Settings list with the page's back link, so the next visit starts from the list.
- en-US makes the wizard pick lb and ft/in: the weight steps read the card in lb first and switch
  to kg through the Log weight toggle (the app-wide unit, R05.11) before any kg figure.
- Number and date words are rendered with the app's own helpers in `en-US` (`words`,
  `formatDay`, `formatPeriod`, `formatDuration`), so the spec reads what the app writes.

Our design differences / decisions:
- Copy comes from the catalogue through `words()`; locators are roles, names and `data-ui` hooks.
- The AI is not set up (Set up later): none of these flows asks it, so the fake AI is not used;
  the network guard still aborts every host off loopback.
- "Try to log food" during a fast: the + menu hides every food method while a fast runs (05
  §3.7.5), so in one tab the only food write left is Combine on two picked rows (test 6); the
  review and manual sheets meet a fast when it starts elsewhere, so test 7 opens the manual entry
  in one tab and starts the fast in another.
- No `data-ui` hook was missing: every locator uses a hook or a role the landed components
  already carry, so no component changes.

Tests we will write (`e2e/home-progress.spec.ts`):
- `Home: days, pillars and the diary (Demo 4)`:
  - `logs water on last Tuesday and on yesterday from the week bar, never on today (ACC-H3-2, ACC-H1-1, ACC-H4-1, ACC-F1-1, ACC-F1-2, ACC-F9-1, ACC-F11-1, R05.4, R05.9)`
  - `swipes the summary to yesterday and back, never past today (ACC-F2-1)`
  - `chooses pillars from All nutrients: a fifth pick takes the latest place, and Done keeps it (ACC-F4-1, ACC-F5-1, ACC-F6-1)`
  - `sorts the diary newest first, where breakfast comes back, and by meal again (ACC-F7-1, ACC-F7-2)`
- `Fasting on Home (Demo 4)`:
  - `starts, cancels and ends fasts from the + menu, which holds only Fasting while one runs (ACC-H6-1, ACC-H7-1, ACC-F11-2, ACC-F8-2, R05.21)`
  - `pauses a combine during a fast; End fast and log ends it and combines (ACC-F12-1, R05.1, D-16.35)`
  - `pauses a manual entry when a fast starts in another tab; End fast and log does both (ACC-D27-1, R05.1, D-16.35)`
- `Progress (Demo 4)`:
  - `logs a weight for last Tuesday in kg and shows it on the 1M chart, keeping today's as Current (ACC-G4-1, ACC-G4-2, ACC-G3-1, R05.5, R05.11, R05.16)`
  - `deletes a weigh-in from the history only after confirming, and Current follows (ACC-G6-1, ACC-G7-1, R05.8, R05.22)`
  - `recaps last week logged through the week bar in its tiles, and Count today moves the calorie average (ACC-G8-1, ACC-G8-2, ACC-G9-1, R05.17, R05.19)`
Every test three times in a row (`--repeat-each=3`), one worker; then the whole e2e folder once.

Compare checklist (filled after the rewrite; no reference file applies: the flows are ours, so
each tick names the test of `e2e/home-progress.spec.ts` that proves it; W, S, P, D are the Home
tests water, swipe, pillars and diary sort; F1, F2, F3 the fasting tests in order; G1, G2, G3 the
Progress tests weight chart, history and recap):
- [x] Week bar: tomorrow disabled, today marked current, last Tuesday picked on the page before
      (the bar shows that week, today's tile off screen), the diary heading "Diary" (W, ACC-F1-1,
      ACC-F1-2, D-16.36)
- [x] Water: on in Settings › Tracking & reminders → the water pillar after the four chosen ones;
      "+" → Water → 250 ml logs at once on last Tuesday with its confirmation, the row under
      breakfast, the pillar 250 with 1,750 ml left, the gauge still 0; yesterday's custom 330 ml;
      today none; a swipe asks before deleting, Cancel keeps, Delete removes; water off → no
      pillar, no Water in "+", last Tuesday's row kept (W, ACC-H3-2, ACC-F9-1, ACC-F11-1,
      ACC-H1-1, ACC-H4-1, R05.4, R05.9)
- [x] Day swipe: 120 px right → yesterday (bar, heading, gauge 0); left → today (the row, gauge
      250); left on today and a 60 px drag → nothing (S, ACC-F2-1)
- [x] Pillars: protein, carbs, fat, fibre by default with protein 22 of 112 g; All nutrients:
      Protein 22 g / 112 g, Sodium — / 2,300 mg, Monounsaturated fat — with no goal; the picker:
      sodium as a fifth pick replaces fibre, Cancel keeps the four; protein, fat, sodium → Done →
      the sheet names them, Home shows them with sodium 2,300 mg left, kept after a reload (P,
      ACC-F4-1, ACC-F5-1, ACC-F6-1)
- [x] Sort: by meal one breakfast (400 kcal) and lunch (420 kcal), Sort only in the first header;
      Newest first → breakfast (Yoghurt), lunch, breakfast (Toast); kept after a reload; By meal
      joins breakfast again (D, ACC-F7-1, ACC-F7-2)
- [x] Fasts: no Start fast with fasting off; on → Start fast on 16 hours → a running row 0m with
      a 16h goal; "+" holds only Fasting; Cancel fast leaves no row; a new fast reads 1m after a
      minute and 1h after an hour of page clock (the bar "1h of 16h"); not on yesterday; End fast
      → "1h fast", "+" offers food and Start fast again; its delete button asks first and Delete
      removes it (F1, ACC-H6-1, ACC-H7-1, ACC-F11-2, ACC-F8-2, R05.21)
- [x] Food paused, one tab: a long-press picks Toast, a tap the coffee, Combine → "Food logging
      is paused"; Cancel keeps the fast running, two rows and both picks; End fast and log → one
      "Toast + Coffee with milk 310 kcal" row, gauge 310, the fast finished, Start fast offered
      (F2, ACC-F12-1, R05.1, D-16.35)
- [x] Food paused, two tabs: a manual entry typed in this tab, a fast started in another, two
      hours pass; Save → the paused dialog; Cancel keeps the sheet and its text, nothing logged;
      Save → End fast and log → "Porridge 310 kcal" under breakfast, gauge 310, a finished "2h
      fast" (F3, ACC-D27-1, R05.1, D-16.35)
- [x] Weight: 154.3 lb from the wizard in 1W; Log weight opens on 154.3 lb, the toggle turns it to
      70.0 kg; tomorrow is held to today; 72.4 kg on last Tuesday; the card in kg, 1W one dot, 0.0
      kg net; 1M (Sep 28 – Oct 27) two dots, the table's two rows, Current 70.0 kg, -2.4 kg net,
      71.2 kg average; a vertical drag never shows the tooltip (recorded), a sideways one shows
      Oct 20, 2026 and 72.4 kg, gone on release (G1, ACC-G4-1, ACC-G4-2, ACC-G3-1, R05.5, R05.11,
      R05.16)
- [x] History: "2 weigh-ins", newest first; deleting today's asks with its value and date, Cancel
      keeps two rows; Delete leaves one at once; Current 72.4 kg and "1 weigh-in" (G2, ACC-G6-1,
      ACC-G7-1, R05.8, R05.22)
- [x] Recap: Oct 19 – 25, Later off; 3/7 +3 logged, 2/7 +2 near the calorie goal, 2/7 +2 protein,
      2,100 against Goal 2,452; the three highlights run, near goal, protein (more logged days
      left out); the week before empty; 1W Avg 1,700 kcal with two bars, Count today off → the
      caption names Oct 20 – 26 and Avg 2,000 kcal (G3, ACC-G8-1, ACC-G8-2, ACC-G9-1, R05.17,
      R05.19)
- [x] Network guard: no request off loopback outside the routed hosts in any test; no uncaught
      page error in either tab (the `afterEach` checks)
- Deliberate differences: none against the reference (no reference flow); the second tab of F3
  is ours (see decisions).
- Not taken: a parity scenario (none is listed for P07-17); body fat on Progress (its card and
  sheet have unit tests, and no row of P07-17 names it).

Decisions for the lead:
- "Try to log food" during a fast is driven through Combine (one tab) and a manual entry left
  open while another tab starts the fast: the + menu offers no food method while a fast runs, so
  no other path reaches the paused dialog in one tab (the shortcuts that do in the reference are
  P09's).
- The AI is set up later in every test; none of these flows asks it, so the fake AI is not used.

## Status

Done (2026-10-27). The ten tests passed three times in a row (30/30, `--repeat-each=3`, one
worker, Pixel 7), and the whole e2e folder once (25/25: the walking skeleton, onboarding, logging
and smoke specs included). No file outside the task's set changed; `e2e/support.ts` and every
component are untouched (no `data-ui` hook was missing).
