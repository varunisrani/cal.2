# Task: Body-fat card and logging (P07-13) · Phase: 07 · Owner: builder (wt-p07s4c, slice S4c)

Read (reference @ `10e14b67`): `A/ui/progress/ProgressScreen.kt` lines 2296–2620 (the body-fat
section: header with its log action, when the prompt shows, which badges show and from what; the
chart's padding, zero floor and percent tick text; the log dialog with its one wheel, its range and
step; the percent and signed-change text), lines 425–455 and 585–595 (what the page hands the
section: the window's readings, the newest reading of all or else the profile value, the goal; the
seed chain of the dialog); `A/data/BodyFatRepository.kt` (adding a reading moves the profile value
to the newest one; deleting the last one leaves the profile alone). `A/ui/progress/
ProgressViewModel.kt` (`addBodyFat`: the reading is stamped at the moment of saving). Tests: the
reference has no test of the card or the dialog; `T/data/BodyFatHistoryImportTest.kt` covers health
imports only (not in v1). Research spec `05-home-progress.md` §3.5.4 (and §3.5.2 for availability,
§3.5.3 for the shared chart rules); trap R05.8; decision Proposed D-16.56 (3–60 % in 0.5 steps for
every body-fat wheel).

What it does (own words): when Body fat is chosen on Progress, its card replaces the weight card.
The header says Body fat with a "Log body fat" action. The card shows a short prompt only when the
window has no readings and the person has no body fat at all (no reading ever and none in the
profile). Otherwise it shows badges: Current (the newest reading of all, else the profile's body
fat), Goal (the profile's goal body fat, when set), and, only when the window holds readings, Net
change (last − first in the window, signed, anything closer to zero than 0.05 reads 0.0 with no
sign) and Average (the window's mean); all one decimal with a percent sign. Under the badges, only
when the window has readings, the P07-10 line chart in percent with at least one point of padding,
an axis that never goes below 0 and percent tick labels (one decimal only when not whole). "Log
body fat" opens a sheet with one wheel, 3–60 % in half steps, opening on the newest reading, else
the profile value, else 20 %; Save adds one reading stamped now through the body-fat repository,
which moves the profile's body fat to the newest reading in the same transaction (R05.8) so the
lean-mass BMR formula follows it.

Inputs → outputs:
- `BodyFatCard` {readings (window, oldest first), latest (newest of all or null), profileValue?,
  goal?, onLog} → header, prompt or badges (+ chart when the window has readings).
- `LogBodyFatSheet` {open, seed (fraction), onClose} → `services.progress.logBodyFat(fraction)`;
  `seedBodyFat(latest, profile)` → latest ?? profile ?? 0.2.
- `services/progress.ts`: `logBodyFat(fraction)` → `bodyFatRepo.addReading({at: clock.now(),
  fraction})`.
- `ProgressPage`: the window's body-fat readings and the newest of all from the page's existing
  read; the sheet on the router's sheet stack (`logBodyFat`).

Files: created `src/features/progress/BodyFatCard.tsx` (+ test), `src/features/progress/
LogBodyFatSheet.tsx`, `src/features/progress/readings.module.css` (shared with P07-14); changed
`src/features/progress/ProgressPage.tsx` (the body-fat slot), `src/services/progress.ts` (+ test),
`src/i18n/en/progress.ts`; shared: `src/main.tsx` and `src/features/progress/testing/
openProgress.tsx` (the service now takes the body-fat repository).

Edge cases / failure modes:
- A profile value but no readings anywhere: Current from the profile, no change, no average, no
  chart (no prompt either).
- Readings exist, but none in this window (a past period): Current is still the newest of all;
  Goal if set; no change, average or chart.
- Nothing stored but a goal (the metric is offered for the goal alone): the prompt; the goal badge
  waits for a first value, like the reference.
- One reading in the window: change 0.0, the average is that reading, the chart is centred.
- Change −0.04 points reads 0.0 with no sign; −0.05 reads −0.1.
- A seed outside 3–60 % (an imported value): held at the nearer end, so Save stores what the wheel
  shows; a seed inside the range but off the half-step grid saves exactly when the wheel is not
  moved (as the Settings body-fat sheet does).
- Save fails: a toast, the sheet stays open with the value.
- The chart's goal line takes part in the padding; the floor keeps a low reading's padding from
  going under 0 %.

Our design differences / decisions:
- Names, copy, layout are ours; the log form is a bottom sheet on the sheet stack (Back closes it),
  not a dialog.
- 3–60 % in 0.5 steps (Proposed D-16.56; iOS uses whole percents).
- The seed is held inside 3–60 % (the reference clamps only what the wheel shows, so an untouched
  wheel could save a value outside it).
- Percent text goes through the catalogue ("{value}%") with locale digits; the sign of a change is
  the locale's own (`Intl`, as the weight card does).
- Reuses the wizard's wheel range, rounding and 20 % default (`BODY_FAT_WHEEL`, `bodyFatPercent`,
  `DEFAULT_BODY_FAT`), as the Settings body-fat sheet does.

Tests we will write:
- `BodyFatCard.test.tsx`: no readings but a profile value → Current from the profile, no chart
  (P07-13 Verify); readings → chart with the 0 floor (the axis's lowest tick is 0 for low
  readings) and % ticks; Current is the newest of all even outside the window; Goal only when
  set; change signed with the 0.05 rule; average; the prompt only with no readings and no value;
  the log action.
- `ProgressPage`-level (in `BodyFatCard.test.tsx`): saving 18.5 % from the sheet adds a reading
  stamped now, updates the profile body fat and the card (P07-13 Verify, ACC-G5-1); the sheet opens
  on latest → profile → 20 %; Cancel stores nothing.
- `src/services/progress.test.ts`: `logBodyFat` stamps now and moves the profile body fat.

Compare checklist (filled after the rewrite; reopened `ProgressScreen.kt` 425–455, 585–595,
2296–2620, `BodyFatRepository.kt`, `ProgressViewModel.kt` `addBodyFat`):
- [x] header with the log action; the prompt only with no readings in the window and no current
      value (`BodyFatCard.test.tsx > BodyFatCard > prompts for a first reading only when no body fat
      is known at all`)
- [x] Current = the newest reading of all, else the profile value (`BodyFatCard.test.tsx >
      BodyFatCard > shows Current from the profile and no chart when there are no readings`, `> takes
      Current from the newest reading of all, before the profile value`)
- [x] Goal when set; Net change and Average only when the window has readings; badges in order
      (`BodyFatCard.test.tsx > BodyFatCard > labels the four badges in order when the window has
      readings`, `> takes Current from the newest reading of all, before the profile value`)
- [x] one decimal with %, the change signed, under 0.05 reads 0.0% without a sign
      (`BodyFatCard.test.tsx > BodyFatCard > signs a rise with +, to one decimal`, `> reads a change of
      −0.04 points as 0.0% with no sign`)
- [x] chart only with readings in the window; padding max(15 %, 1) around readings and goal; axis
      floored at 0; % ticks with a decimal only when not whole; the goal line; the values as text
      (`BodyFatCard.test.tsx > BodyFatCard > draws the window with the goal line and whole-percent
      ticks, and lists the readings`, `> starts the axis at 0 % for readings near zero, with a decimal
      only on halves`; `LineChart.test.tsx > LineChart > keeps the body-fat axis at 0 % or above`)
- [x] log: one wheel 3–60 % in 0.5 steps; Save stamps now; the profile body fat follows
      (`BodyFatCard.test.tsx > LogBodyFatSheet > saves 18.5 % stamped now and moves the profile body
      fat and the card to it (ACC-G5-1)`; `src/services/progress.test.ts > logBodyFat > stamps the
      reading now and moves the profile body fat to it (R05.8)`)
- [x] seed: newest reading by date → profile → 20 % (`BodyFatCard.test.tsx > LogBodyFatSheet > opens
      on the newest reading by date, not the last one added`, `> opens on the profile value without
      readings`, `> opens on 20 % with neither a reading nor a profile value, and saves it`)
- [x] the wheel's range holds the seed; an unmoved wheel saves the seed (`BodyFatCard.test.tsx >
      LogBodyFatSheet > holds a profile value under 3 % at the wheel’s end, and saves what it shows`,
      `> saves an unmoved wheel at the exact value it opened on`)
- [x] Cancel stores nothing; a failed save keeps the sheet (`BodyFatCard.test.tsx > LogBodyFatSheet >
      closes on Cancel without storing anything`, `> keeps the sheet open with the value and says so
      when the save fails`)
- [x] repository: the profile follows the newest reading; deleting the last leaves the profile
      value (`src/data/repos/bodyFatRepo.test.ts`, landed in P02; `src/services/progress.test.ts >
      history deletes > deletes body-fat readings; the profile follows the newest left, then keeps
      the last value (R05.8)`)
- Deliberate differences: 3–60 % in half steps on every platform (Proposed D-16.56; iOS uses whole
  percents); the seed is held inside 3–60 % instead of only clamped on the wheel; a bottom sheet
  instead of a dialog; percent text follows the locale (`Intl`); tick labels round to one decimal
  where the reference truncates (the round ticks never need either).
- Not taken: haptics on the inspector; health-store writes and imports (no health sync in v1).

## Decisions for the lead

- Styles for the body-fat wheel, the history link and the history rows are in a new
  `src/features/progress/readings.module.css` instead of `progress.module.css`, so this slice and
  S4b do not both append to the end of the same file; fold it in when convenient.
- `SIGNED_TENTH` in `BodyFatCard.tsx` repeats the one in `WeightCard.tsx`, and `percentRows` in
  `LogBodyFatSheet.tsx` is the third copy of the 3–60 % wheel rows (wizard `BodyFat.tsx`, Settings
  `BodyFatSheet.tsx`): share one copy each when a slice owns those files (follow-up).
- The sheet's place on the sheet stack is `logBodyFat` (`LOG_BODY_FAT_SHEET` in `ProgressPage.tsx`).

## Status

Done (2026-10-27). `BodyFatCard`, `LogBodyFatSheet` and `logBodyFat` in the progress service are in,
with tests. Outside the task's files: `src/main.tsx` (one line: the progress service gets
`bodyFatRepo`), `src/features/progress/testing/openProgress.tsx` (the same line for tests).
