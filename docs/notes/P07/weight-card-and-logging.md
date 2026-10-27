# Task: Weight card and logging (P07-12) · Phase: 07 · Owner: builder (wt-p07s4a, slice S4a)

Read (reference @ `10e14b67`): `A/ui/progress/ProgressScreen.kt` lines 1974–2270 (the history
sheets around it only for context; the log-weight dialog: unit toggle wired to the app preference,
split wheel with its ranges and conversion, the day row that clamps a future pick, the seed chain
in the page above it, the weight and signed-change formatting), lines 912–1016 (the weight card:
header with the log action, the empty prompt, which badges show and from what); `A/ui/progress/
ProgressViewModel.kt` (`addWeight` with the day and the weigh-in time rule). Test:
`T/ui/progress/LogWeightDateTest.kt` (an older day keeps the clock time, today keeps the instant,
a back-dated weigh-in never counts as reaching the goal). Research spec `05-home-progress.md`
§3.5.3, traps R05.7, R05.10, R05.11; decisions D-16.37 / Proposed D-16.56 (20–250 kg, 50–500 lb).

What it does (own words): the weight card on Progress. Its header says Weight with a "Log weight"
action. With no weigh-ins on the window's days it shows a short prompt instead of numbers.
Otherwise four badges: Current (the newest weigh-in of all, even when it lies outside the window),
Goal (the profile's goal weight, only when one is set), Net change (the window's last reading minus
its first, with a + for a gain; anything closer to zero than 0.05 reads 0.0 with no sign) and
Average (the window's mean), each with one decimal in kg or lb; then the line chart (P07-10) of the
window's readings with the goal line. "Log weight" opens a sheet: a kg | lb control that changes
the unit for the whole app (R05.11), whole and tenth wheels (20–250 kg or 50–500 lb) that keep the
weight across a unit change and hold it at the new wheel's end when it does not fit, and a date
that cannot be a future day. The wheels open on the newest weigh-in, else the profile weight, else
70 kg. Save stores kg: today at this instant, an earlier day at today's clock time on that day;
the weight repository moves the profile weight only when the new reading is the newest by date
and raises goal-reached itself (R05.7), so a back-dated weight changes neither.

Inputs → outputs:
- `ranges.ts` (shared with P07-09/13): `summarise(points)` → {change, average} or null;
  `changeToTenth(x)` → the change as shown (0 under 0.05, never −0).
- `WeightCard` {readings, latest, goalKg?, unit, onLog} → header, empty prompt or badges + chart.
- `LogWeightSheet` {open, seedKg, unit, onClose} → `services.progress.logWeight(kg, day)` and
  `services.progress.setWeightUnit(unit)`; `seedWeightKg(latestKg, profileKg)`.
- `services/progress.ts`: `logWeight(kg, day)` → `weightRepo.addWeighIn({at, kg})` with `at` from
  `stampForDay(day, now)`, a future day held at today.

Files: created `src/features/progress/WeightCard.tsx` (+ test), `src/features/progress/
LogWeightSheet.tsx` (+ test); `src/services/progress.ts` (+ test) and the progress partition are
shared with P07-09.

Edge cases / failure modes:
- One reading in the window: change 0.0, average = the reading, chart centred.
- −0.04 kg reads 0.0 (ACC-G3-2); −0.05 reads −0.1; in lb the rule applies to the lb value.
- Current outside the window (a past period): still the newest weigh-in overall.
- No goal (maintain, or none set): no Goal badge and no goal line.
- Seed below 20 kg or above the lb range: held at the wheel's end, so what the wheel shows is what
  Save stores.
- An unmoved wheel saves the exact seed (no rounding to the tenth on the way).
- The unit write fails: a toast; the sheet keeps the unit the person picked.
- Save fails: a toast, the sheet stays open with the values.
- A date typed later than today is held at today; a date earlier than `FIRST_READABLE_DAY` is held
  at it on leaving the field (the page reads readings from that day on).
- Midnight while the sheet is open: today moves, the date's upper limit with it.

Our design differences / decisions:
- Names, copy and layout are ours; the sheet is a bottom sheet on the router's sheet stack (Back
  closes it), not a dialog.
- The stamp keeps seconds and milliseconds (P01-02 `stampForDay`), where Android drops seconds.
- The unit control holds the weight at the new wheel's end when it does not fit, so the wheel and
  the stored value never disagree (the reference only clamps what the wheel shows).
- The goal-reached dialog is the app's own (P05-14), raised by the repository's bus message; the
  card does nothing for it.
- Reuses the wizard's `WeightPicker` and its unit words (`onboarding.wizard.weight`), as Settings
  does, until a shared units partition exists.

Tests we will write:
- `WeightCard.test.tsx`: net change −0.04 kg shows 0.0 without a sign (ACC-G3-2); a gain shows +,
  a loss −; Current is the latest overall even outside the window; Goal only when set; Average;
  pounds; the empty prompt; the chart's goal line and points (hidden table).
- `LogWeightSheet.test.tsx`: toggling to lb converts 70.0 → 154.3 and stores the app unit
  (ACC-G4-2, R05.11); a future date is not selectable (max, typed date held); a weight logged for
  last week lands on that day at the current clock time and keeps the profile weight (ACC-G4-1);
  today's save is stamped now and moves the profile weight; seed latest → profile → 70; held at the
  lb wheel's end on toggle.
- `src/services/progress.test.ts`: the three stamps (today, earlier day, a future day held at
  today), the unit write.

Compare checklist (filled after the rewrite; reopened `ProgressScreen.kt` 912–1016 and
2181–2270, `ProgressViewModel.kt`, `LogWeightDateTest.kt`):
- [x] header with the log action; the prompt when the window has no weigh-ins
      (`WeightCard.test.tsx > WeightCard > shows a prompt instead of badges and a chart when the window
      has no weigh-ins`)
- [x] Current is the newest weigh-in of all (`WeightCard.test.tsx > WeightCard > shows the newest
      weigh-in of all as Current, even when it lies outside the window`; `ProgressPage.test.tsx >
      ProgressPage > shows the weigh-ins of the period on show, with Current from all of them`)
- [x] Goal only when set, badges in order (`WeightCard.test.tsx > WeightCard > labels the four badges
      in order, Goal only when a goal weight is set`, `> has no Goal badge without a goal weight`)
- [x] Net change last − first in the window, signed, under 0.05 reads 0.0 without a sign, the rule
      on the shown unit (`WeightCard.test.tsx > WeightCard > shows 0.0 without a sign for a net change
      of −0.04 kg (ACC-G3-2)`, `> signs a gain with + and a loss with −, to one decimal`, `> writes a
      loss with a minus sign`, `> applies the 0.05 rule to the pound value: 0.04 kg is 0.1 lb`;
      `ranges.test.ts > changeToTenth > reads a change closer to zero than 0.05 as 0, never −0
      (ACC-G3-2)`, `> rounds the rest half away from zero to one decimal`; `ranges.test.ts > summarise >
      takes the last minus the first reading by time, and the mean`)
- [x] Average of the window, one decimal, kg or lb (× 2.20462) (`WeightCard.test.tsx > WeightCard >
      writes every figure in pounds when the unit is lb`)
- [x] chart of the window with the goal line (`WeightCard.test.tsx > WeightCard > draws the window with
      the goal line, and lists the readings as text`)
- [x] the toggle changes the app-wide unit and converts the value (`LogWeightSheet.test.tsx >
      LogWeightSheet > converts 70.0 kg to 154.3 lb on the toggle and changes the unit of the whole app
      (ACC-G4-2, R05.11)`; `src/services/progress.test.ts > settings > stores the weight unit for the
      whole app (R05.11)`)
- [x] wheels 20–250 kg / 50–500 lb, held at the end on a toggle (`LogWeightSheet.test.tsx >
      LogWeightSheet > holds a weight the pound wheels cannot show at their 50 lb end, and stores that`)
- [x] seed: newest weigh-in by date → profile → 70 kg (`LogWeightSheet.test.tsx > LogWeightSheet >
      opens on the newest weigh-in by date, not the last one added`, `> opens on the profile weight
      without weigh-ins, and on 70 kg without either`)
- [x] no future day (`LogWeightSheet.test.tsx > LogWeightSheet > offers no day after today and holds a
      later typed date at today`; `src/services/progress.test.ts > logWeight > takes a day after today
      as today`)
- [x] today → now; an earlier day → that day at the current clock time; the profile follows the
      newest by date (`src/services/progress.test.ts > logWeight > stamps today's weigh-in now and moves
      the profile weight to it`, `> puts an earlier day at the current clock time and keeps the newer
      profile weight (ACC-G4-1)`; `LogWeightSheet.test.tsx > LogWeightSheet > logs a weight for last
      week on that day at the current clock time, keeping the current weight (ACC-G4-1)`, `> stamps
      today's weight now and moves the current weight to it`)
- [x] goal reached comes from the repository, never for a back-dated weight (`src/services/
      progress.test.ts > logWeight > leaves goal-reached to the repository: a newest weight past a lose
      target raises it`, `> raises nothing for a back-dated weight under a lose target (R05.7)`)
- [x] Cancel stores nothing (`LogWeightSheet.test.tsx > LogWeightSheet > closes on Cancel without
      storing anything`)
- Deliberate differences: wheels 20–250 kg / 50–500 lb (D-16.37, the reference's Android uses
  30–250 / 60–500); the stamp keeps seconds; a bottom sheet on the sheet stack instead of a dialog;
  the toggle holds the stored value at the wheel's end (the reference only clamps the display);
  the minus is the locale's own sign from `Intl`.
- Not taken: the goal-reached notification when alerts are on (P09's alerts; the app's own dialog
  shows today); haptics.

## Decisions for the lead

- `heldOnWheels` in `LogWeightSheet.tsx` repeats Settings' `heldOnWheel` (and the wizard's hold):
  move one copy into `src/domain/units/body.ts` when a domain slice is open (follow-up).
- The weight shown with its unit reuses `onboarding.wizard.weight.shownKg/shownLb`, as Settings
  does; a shared units partition would serve all three.

## Status

Done (2026-10-27). `WeightCard`, `LogWeightSheet` and `logWeight` in the progress service are in,
with tests; outside lines are listed in the P07-09 note (same slice).
