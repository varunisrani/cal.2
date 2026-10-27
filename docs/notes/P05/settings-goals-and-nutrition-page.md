# Task: Settings: goals and nutrition page (P05-11) · Phase: 05 · Owner: builder (wt-p05s4b, slice S4b)

Read (reference @ `10e14b67`): `A/ui/settings/SettingsScreen.kt` lines 3390–3440 (the four
target pickers with their ranges, the save that goes through the lock engine, the refused-edit
callback, the reset button only on locked rows), 3750–3790 (the height and weight sheets: only
the sheet shape), 4022–4060 (body-fat sheets: not used here) and 4960–5080 (nutrient picker
ranges, steps, upper limits, the vitamin D detail), plus the goals section it renders (rows,
the read-only rule while the weekly check is on, the rebuild row with its nudge, the info
dialogs); `I/ContentView.swift` lines 6510–6660 (target sheets), 7205–7520 (the nudge baseline,
lockable rows with dimmed glyphs, the read-only explanation, set/reset through the engine, the
rebuild flow and its failure message, the weekly switch handler); `I/Views/MaintenanceEstimateRow.swift`
(the row and its info). Behaviour only. Research spec `01-profile-goals.md` §3.7 (locks,
pickers), §3.9 (nudge, toggles), §3.10 (turning the tune-up on and off), §3.11 (entry to the
nutrient goals); decisions D-16.12 (Android ranges), D-16.45 (the tune-up is the AI rebuild on a
weekly timer). No reference tests exist for this screen.

What it does (own words): the Settings category "Goals and nutrition". A card of daily targets
lists energy (in kcal or kJ), protein, carbs and fat, each with a lock glyph, and between energy
and protein a read-only maintenance estimate row: the formula's daily burn and how the target
sits against it (deficit, surplus or close, ±50 kcal); tapping it explains that it is a formula
estimate. Tapping a target opens a wheel sheet on the P01-13 ranges (energy 800–6 000 kcal in 50s
or the kJ goal wheel; protein 10–500, carbs 0–800, fat 10–300 in 5s). Saving goes through the
lock engine (`setKcal`, `setMacro`), so the edited value is locked and the free ones rebalance;
an edit the engine refuses (energy locked and both other macros locked) changes nothing and a
dialog says why. A locked row's sheet also offers "Reset to auto" (`resetKcal`, `resetMacro`).
While the weekly tune-up is on the rows are read-only: the glyphs are dimmed, a note says the
tune-up sets these numbers, and a tap explains instead of opening a sheet. A second card holds
Rebuild plan (always tappable; it shows "Inputs changed — rebuild" while the plan-input key
differs from the stored baseline, which is seeded silently on first open, and words the
rebuild's outcome in a dialog), the weekly tune-up switch with an info button (turning it on
shows the forced run's outcome in a dialog; turning it off puts the earlier plan back), the entry
to the nutrient goals sheet (P05-12) and a link to the methods page. A third card holds the
goal-reached alert switch.

Inputs → outputs: reads `useTargets(today)` (profile, formula, effective targets) and
`useSettings(['units.energy', 'tuneUp.on', 'alerts.goalReached', 'goals.rebuildBaseline',
'goals.nutrients'])`; acts through `services.targetEdits` (target edits, resets, baseline seed,
the two switches, nutrient goal saves) and `services.rebuild.rebuild()`. Router sheets
`goal-target`, `nutrient-goals`, `nutrient-goal`; the methods link navigates to
`#/settings/methods`.

Files: created `src/features/settings/goals/{GoalsPage,TargetRow,TargetSheet}.tsx` with tests
for the page and the row, `goals.module.css`, `wheelOptions.ts`, `src/services/goals/targetEdits.ts` (+ test);
words under `goals.page` in `src/i18n/en/goals.ts`. Shared, additive: `targetEdits` in
`Services` (src/services/context.tsx) and `main.tsx`, the `goals` record in
`src/features/settings/registry.ts`.

Edge cases / failure modes:
- The profile is missing, unreadable or still loading: only a short line shows; no rows, no
  actions (the page is reached after onboarding, so this is rare).
- A wheel saved where it opened: the opening value was snapped down onto the steps; saving it
  must not move an exact value (an AI's 2 452 kcal, a kJ reader's kcal, R06.20). Save then
  sends the exact current value, so the row still becomes locked (Save means "keep this").
- Energy locked plus two macro locks: editing the free macro works; editing a locked macro has
  no absorber, so the service reports `refused` and the dialog says which locks to reset.
- A third macro lock: the edit applies, the lock is not added (engine rule, R01.13).
- The tune-up switch flips while a target sheet is open: the service checks `tuneUp.on` and
  refuses the edit (`tuneUpOn`), so the page cannot write over the tune-up's plan.
- A rebuild already running: the service answers `busy`; the page ignores it (the row already
  shows that a rebuild is running). `noProfile` and `dropped` get their own short messages.
- The forced tune-up run can take as long as the AI timeout: the switch is disabled and the row
  says a check is running until the outcome arrives.
- The baseline seed runs twice under StrictMode: it is idempotent (writes only when no usable
  baseline is stored, checked inside the settings transaction).
- A kJ reader: rows, the maintenance figure, the deficit text and outcome messages are in kJ.

Our design differences / decisions:
- Names are ours: "Goals and nutrition", "Weekly tune-up", "Rebuild plan", "Inputs changed —
  rebuild", "Maintenance estimate", "Auto" (17 §2).
- Saving an untouched wheel keeps the exact value and locks it (the reference stores the
  snapped value); the reference's behaviour for a moved wheel is kept.
- The service refuses target edits while the tune-up is on (the reference only gates the UI).
- Turning the tune-up off shows a short toast when the earlier plan came back (the reference is
  silent). Turning it on shows the forced run's outcome in a dialog, as in the reference.
- A rebuild failure shows our "goals unchanged, check AI settings" line plus the failure kind's
  own message (P03-01), so a refused key reads differently from a timeout.
- `planWheel` (Plan ready's limits) is not needed: in Settings the lock engine keeps the values
  consistent itself, so the wheels are the plain P01-13 ranges and PlanReady is not touched.
- The goal-reached switch stores `alerts.goalReached` (default off, P02-04); the in-app dialog
  does not depend on it, the system notification arrives with P09-09.

Tests we will write (`GoalsPage.test.tsx`, `TargetRow.test.tsx`, `targetEdits.test.ts`):
- shows the four targets in kcal (and kJ) with lock glyphs; a locked row says so.
- locking energy then editing protein keeps energy, lowers carbs and fat (ACC-C6-1).
- with energy and two macros locked, editing a locked macro is refused and the dialog says why.
- a third macro lock is not added; the value still applies (ACC-C6-2 at the screen).
- "Reset to auto" shows only on locked rows and unlocks the row.
- tune-up on: rows read-only with dimmed glyphs, a tap explains and changes nothing (ACC-C8-3).
- nudge: none on first open (baseline seeded), shown after a new weigh-in (ACC-C5-1).
- rebuild outcomes: new energy in the display unit plus the reason; failure says goals are
  unchanged and points to AI settings.
- maintenance row: a target 40 kcal under the estimate reads close (ACC-C7-1); deficit and
  surplus read with the amount; tapping explains.
- tune-up switch: on shows the forced run's outcome; off puts the plan back with a toast.
- goal-reached switch writes the setting; methods link navigates.
- service: each edit goes through the engine in one profile transaction; refused and tune-up-on
  edits write nothing; the baseline seed writes once; the switch returns the runner's outcome.

Compare checklist (filled after the rewrite; reopened `SettingsScreen.kt` 830–960, 2000–2125,
3390–3440, 4647–4760, 4914–4960, `ContentView.swift` 6510–6660, 7205–7520 and
`MaintenanceEstimateRow.swift`):
- [x] Four target rows with lock glyphs, kcal or kJ (`GoalsPage.test.tsx` > GoalsPage: targets
  and locks > shows the four targets with lock glyphs, under the page title; > shows and edits
  the energy target in kJ, keeping the exact kcal when untouched (R06.20); `TargetRow.test.tsx` > TargetRow > names the
  target, its value and a locked glyph; > shows an open glyph for a value left to the automatic
  balance)
- [x] Pickers on the P01-13 ranges; saving locks through the engine; locked energy holds while a
  macro moves (`GoalsPage.test.tsx` > GoalsPage: targets and locks > keeps calories and lowers
  carbs and fat when protein rises with calories locked (ACC-C6-1); `targetEdits.test.ts` >
  targetEdits: edits through the lock engine (P01-13) > keeps energy and lowers carbs and fat when
  protein rises with energy locked (ACC-C6-1); > locks energy and spreads it over the three free
  macros)
- [x] Refused edit says why and changes nothing (`GoalsPage.test.tsx` > GoalsPage: targets and
  locks > refuses an edit nothing can absorb, says why and changes nothing (R01.13);
  `targetEdits.test.ts` > … > refuses an edit nothing can absorb and writes nothing (R01.13))
- [x] Third macro lock not added (`GoalsPage.test.tsx` > GoalsPage: targets and locks > applies an
  edit to the third macro without locking it (R01.13, ACC-C6-2); `targetEdits.test.ts` > … >
  applies an edit without adding a third macro lock (R01.13, ACC-C6-2))
- [x] Reset to auto only on locked rows (`GoalsPage.test.tsx` > GoalsPage: targets and locks >
  offers Reset to auto only on a locked row, and it frees the value; `targetEdits.test.ts` > … >
  resets a locked macro to auto: unlocked, it takes the energy the others leave; > resets energy
  to auto: unlocked, it becomes the energy of the macros)
- [x] Tune-up on: read-only rows, dimmed glyphs, a tap explains (`GoalsPage.test.tsx` > GoalsPage:
  targets and locks > keeps the rows read-only while the tune-up is on: a tap explains and changes
  nothing (ACC-C8-3); `TargetRow.test.tsx` > TargetRow > dims the glyph while the tune-up owns the
  targets and is described by the reason; `targetEdits.test.ts` > … > refuses every edit while
  the tune-up is on and writes nothing (ACC-C8-3))
- [x] Nudge seeded silently, raised by a weigh-in, row always tappable (`GoalsPage.test.tsx` >
  GoalsPage: rebuild plan > shows no nudge on first open and shows it after a new weigh-in
  (ACC-C5-1, R01.12); `targetEdits.test.ts` > targetEdits: the rebuild baseline (P01-15) > seeds
  the baseline silently on first open and keeps it after a change (R01.12))
- [x] Rebuild outcome worded: new target in the display unit plus the reason; failure keeps goals
  and points to AI settings (`GoalsPage.test.tsx` > GoalsPage: rebuild plan > words a rebuilt
  plan: the new target in the display unit and the AI reason (ACC-C4-1); > says a failed rebuild
  left the goals as they were and points to AI settings)
- [x] Maintenance estimate: close within ±50, deficit/surplus with the amount, formula-estimate
  explanation (`GoalsPage.test.tsx` > GoalsPage: maintenance estimate > reads a target 40 kcal
  under the estimate as close to it (ACC-C7-1); > reads a deficit and a surplus with the daily
  amount; > explains on a tap that it is a formula estimate)
- [x] Tune-up switch: on shows the forced run's outcome (changed, unchanged, failed); off puts
  the plan back; info button (`GoalsPage.test.tsx` > GoalsPage: switches and links > turns the
  tune-up on and shows the outcome of the forced run; > explains a forced run that changed
  nothing; > says the tune-up could not reach the AI when its forced run failed; > turns the
  tune-up off and says the earlier plan is back; > explains the tune-up from its info button;
  `targetEdits.test.ts` > targetEdits: switches and nutrient goals > turns the tune-up on through
  the runner and returns its forced run; > turns the tune-up off through the runner and says
  whether the plan came back)
- [x] Goal-reached alert switch (`GoalsPage.test.tsx` > GoalsPage: switches and links > stores the
  goal-reached alert switch; `targetEdits.test.ts` > … > stores the goal-reached alert switch)
- [x] Methods link and the nutrient goals entry (`GoalsPage.test.tsx` > GoalsPage: switches and
  links > links to the methods page and opens the nutrient goals)
- Deliberate differences: an unmoved wheel saves the exact value (and locks it); the service
  refuses edits while the tune-up is on; a toast when turning the tune-up off restored the plan;
  the failure kind's own message under the rebuild failure; the goal-reached switch defaults off
  (P02-04) where the reference defaults on, and only stores the choice until P09-09 sends the
  notification.
- Not taken: Energy Burn (needs a health store, later phase); the reference's spinner on the
  rebuild row (ours says "Rebuilding your plan…" in the row and ignores taps meanwhile).
- Similarity: the first run flagged the nutrient name list in `src/i18n/en/goals.ts` (13 words
  in the reference's enum order). Rewritten in the order of our model (grams, milligrams,
  micrograms, then the sports compounds); `check:similarity` is clean since.

## Status

Done (2026-10-27). Lines outside the task's own files (all additive): `targetEdits` in
`Services` (src/services/context.tsx) and in `main.tsx` (the tune-up runner is now one const
shared by `tuneUp` and `targetEdits`), the `goals` record in `src/features/settings/registry.ts`.
`planWheel` was not needed, so PlanReady is untouched.
