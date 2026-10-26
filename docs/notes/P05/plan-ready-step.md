# Task: Plan ready step (P05-06) · Phase: 05 · Owner: builder (wt-p05s3a, slice S3a)

Read (reference @ `10e14b67`): `A/ui/onboarding/OnboardingScreen.kt` lines 1875–2355 (the plan
step, its macro cards, the per-field edit dialog with its ranges, the low-calorie card),
`I/Views/OnboardingView.swift` lines 1352–1843 (the plan values, the coupled inline wheels, the
hand-edited marker, the low-calorie card, the methods link, the final button): behaviour only.
Research spec `01-profile-goals.md` §3.4 (step 13, "Plan ready editing", "Completion"), §3.6
(the plan the AI returns), §3.13 not needed here; trap R01.7; decision D-16.12 (Android ranges
everywhere), D-16.14 (the AI-unavailable note). No reference tests exist for this screen.

What it does (own words): the last wizard step shows the plan Building plan produced: the daily
energy target as one big number in the person's energy unit (kcal or kJ) and three cards for
protein, carbs and fat in grams. Tapping any of the four opens a picker sheet with the Settings
ranges (kcal 800–6 000 in 50s, or the kJ goal wheel of P01-03; protein 10–500, carbs 0–800,
fat 10–300, all in 5s). Saving goes through the wizard's `planEdit`, which calls the domain's
`editPlan`: kcal, protein or fat re-derive carbs, carbs re-derive kcal, so the four numbers
always add up (R01.7), and any real change marks the plan touched (hand-edited). A note says the
weekly tune-up adjusts the plan once a week and can be switched off in Settings; once the
person has edited the plan it says instead that the tune-up starts off because the plan was
changed (P05-07 turns it off for a touched plan). Under 1 200 kcal a warning card suggests
checking with a doctor. When the formulas stood in for the AI, a note says so. "How is this
calculated?" opens the calculation methods page (P05-13) in a sheet. The final button
dispatches a new `finish` action; the wizard's `finished` flag is what P05-07 completes from.

Inputs → outputs: `{state, dispatch}` (the wizard's step props) and the `units.energy` setting
read through `useSettings` → `planEdit` and `finish` actions; two router sheets (`plan-edit`,
`methods`).

Files: created `src/features/onboarding/steps/PlanReady.tsx`, `PlanReady.test.tsx`,
`planReady.module.css`; changed `src/features/onboarding/wizard.ts` (+ `finish`, `finished`) and
`wizard.test.ts`; words in `src/i18n/en/onboarding.ts` under `onboarding.planReady`.

Edge cases / failure modes:
- A wheel saved where it opened changes nothing: the opening value is snapped down onto the
  wheel's steps, so saving it would move an AI plan's 2 452 kcal to 2 450 (or a kJ reader's
  exact kcal, R06.20). Untouched → no edit, the plan stays untouched.
- Protein and fat could hold more energy than the kcal target (carbs would sit at 0 and the plan
  would no longer add up; P01-14 hand-off). The protein and fat wheels top out where carbs reach
  0, and the kcal wheel starts where protein and fat alone fit; a short line under the wheel says
  why when a limit bites. Carbs use the domain's `carbsWheel` (kcal ≤ 6 000).
- The energy setting not read yet: the numbers wait (no kcal flash for a kJ reader); a read error
  falls back to kcal so onboarding can still finish.
- No plan in the state (should not happen on this step): only the heading shows.
- A second press of the final button does nothing (`finish` is idempotent; the button is
  disabled once finished).

Our design differences / decisions:
- Android's ranges (D-16.12) with iOS's coupling (R01.7), through the domain's `editPlan`.
- A picker sheet with Cancel and Save (not Android's dialog with Reset, not iOS's inline wheel):
  Reset to the built value is not offered; Cancel leaves the plan as it was.
- The tune-up note changes once the plan is touched, so the person knows editing turns the
  tune-up off at completion (the reference keeps one note and turns it off silently).
- The wheel limits that keep protein and fat inside the kcal target (see edge cases) are ours.
- The AI-unavailable note (D-16.14) and the warning's 1 200 kcal written in the person's unit.
- `finish` only sets a flag; the completion side effects are P05-07's.

Tests we will write (`PlanReady.test.tsx`, `wizard.test.ts`):
- shows the plan in kcal with three macro cards; protein 150 re-derives carbs (ACC-B8-1, R01.7).
- carbs 300 re-derives kcal.
- editing kcal to 1 150 shows the low-energy warning (ACC-B8-2); 1 200 does not.
- an edit marks the plan touched and switches the tune-up note.
- kJ reader: the number reads in kJ; the kJ wheel saved untouched keeps the exact kcal; a moved
  wheel converts (R06.20).
- the AI-unavailable note shows only for the formula plan.
- "How is this calculated?" opens the methods sheet; Done closes it.
- the protein wheel stops where carbs reach 0.
- the final button sets `finished`; `finish` elsewhere is ignored (wizard.test.ts).

Compare checklist (filled after the rewrite; reopened `OnboardingScreen.kt` 1875–2355 and
`OnboardingView.swift` 1352–1843):
- [x] Big energy number + three macro cards, each tappable (tested in `PlanReady.test.tsx` >
  PlanReady > shows the plan in kcal with a card per macro)
- [x] Ranges: kcal 800–6 000 step 50, protein 10–500, carbs 0–800, fat 10–300, step 5 (D-16.12)
  (`PlanReady.test.tsx` > PlanReady > opens each wheel on the Settings ranges, snapped down
  (D-16.12); > planWheel > keeps the Settings ranges when nothing else holds a value)
- [x] Wheel limits so the plan keeps adding up (ours) (`PlanReady.test.tsx` > PlanReady > stops
  protein and fat where carbs reach 0, and kcal where protein and fat fit; > planWheel > starts
  the kJ wheel at a step that still holds protein and fat)
- [x] Coupling: kcal/protein/fat → carbs, carbs → kcal (R01.7) (`PlanReady.test.tsx` > PlanReady
  > re-derives carbs when protein changes to 150 (ACC-B8-1, R01.7); > re-derives kcal when carbs
  change to 300 (R01.7))
- [x] Any edit marks the plan hand-edited (`PlanReady.test.tsx` > PlanReady > marks the plan
  edited and says the tune-up will start off (R01.7))
- [x] Weekly tune-up note (`PlanReady.test.tsx` > … marks the plan edited …)
- [x] Warning card under 1 200 kcal (`PlanReady.test.tsx` > PlanReady > warns under 1 200 kcal:
  1 150 shows it, 1 200 does not (ACC-B8-2))
- [x] "How is this calculated?" opens the methods page (`PlanReady.test.tsx` > PlanReady > opens
  the calculation methods in a sheet and closes it with Done)
- [x] Final button completes (here: `finish`) (`PlanReady.test.tsx` > PlanReady > finishes with
  the last button, once; `wizard.test.ts` > finishing > sets finished only on Plan ready with a
  plan, once)
- [x] kJ reader (`PlanReady.test.tsx` > PlanReady > shows kJ to a kJ reader and keeps the exact
  kcal when the wheel is saved untouched (R06.20))
- [x] AI-unavailable note (`PlanReady.test.tsx` > PlanReady > notes when the formulas stood in
  for the AI (D-16.14))
- Deliberate differences: a picker sheet with Cancel/Save instead of Android's dialog with Reset
  or iOS's inline wheels; no Reset; an untouched wheel saves nothing (Android stores the picked
  value even when unmoved); protein/fat/kcal wheels limited so the plan always adds up; the
  tune-up note changes once edited; the energy number in kJ for a kJ reader (the reference shows
  kcal on this step); the warning's minimum shown in the person's unit.
- Not taken: the gradient colours, the pencil glyphs, iOS's 800–5 000 / step 10 and 20–300 /
  0–500 / 10–200 ranges (D-16.12), the hosted-plan rating screen, saving the profile here (P05-07).

## Decisions for the lead

- The protein, fat and kcal wheel limits (protein ≤ (kcal − 9·fat) ÷ 4, fat ≤ (kcal − 4·protein)
  ÷ 9, kcal ≥ 4·protein + 9·fat, each on the wheel's steps) are UI-side helpers in
  `PlanReady.tsx`. If P05-11 wants the same limits on the Settings pickers they could move to
  `src/domain/goals/planEdit.ts` next to `carbsWheel`.
- `onboarding.wizard.pending.planReady` stays: `WizardPage.tsx` (not ours) still uses it for the
  stand-in step.

## Status

Done (2026-10-26). PlanReady with its tests; `finish`/`finished` added to the wizard reducer.
Handed on: P05-07 wires `PlanReady` into `WizardPage`'s `lateSteps` and completes onboarding when
`state.finished` turns true (the step needs a `RouterProvider` and a `DataProvider` above it, as
inside `App`).
