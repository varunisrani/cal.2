# Task: wizard state machine (P05-01) · Phase: 05 · Owner: builder (wt-p05s1, slice S1)

Read (reference @ `10e14b67`): `A/ui/onboarding/OnboardingViewModel.kt` (the step list, the state
record and its gate, the setters, `next()`, `back()`, `complete()`: behaviour only),
`T/ui/onboarding/OnboardingStateTest.kt` (the AI-step gate and the step the AI step reopens on);
`I/Views/OnboardingView.swift` lines 80–260 (header, progress maths, how the profile is built).
Research spec `01-profile-goals.md` §3.1 (defaults), §3.2 (units, rounding of inches), §3.4 (the
wizard), traps R01.3, R01.6, R01.8; decisions D-16.11, D-16.15, D-16.37, D-16.56, D-16.63 (13
steps, progress = index ÷ 12 on steps 1–10).

What it does (own words): the onboarding wizard as a pure reducer with no React, clock or storage
in it. The state names the current step (13 steps, Welcome … Plan ready) and every answer in
storage units: centimetres, kilograms and body fat as a fraction. The two display units (height
and weight) are part of the state too, but they only change how screens show the numbers, so
switching metric and imperial never changes an entered value (R01.3). Continue is allowed on
every step except: Target weight while the target sits on the wrong side of the current weight
for a lose or gain goal (D-16.11, R01.6), AI access until its setup reports ready, and Building
plan / Plan ready (which leave through their own events). Back does nothing on Welcome and
Building plan; from Plan ready it returns to AI access, skipping Building plan so a finished plan
is not rebuilt by accident. Every entry into Building plan gets a new run number; a finished plan
is accepted only for the current run while Building plan is showing, so a result that arrives
after the person left is dropped (R01.8). The target weight is seeded from the current weight
(−5 kg to lose, +5 kg to gain, equal to maintain), held to the weight wheel of the person's unit,
whenever a goal is chosen, and re-seeded when the current weight changes until the person moves
the target themselves.

Inputs → outputs:
- `startWizard(today, units)` → the first state (profile defaults from `src/domain/profile`,
  target = current weight, pace steady, nothing answered).
- `wizardReducer(state, action)` → next state. Actions: `next`, `back`, `sex`, `birthDate`,
  `units` (metric | imperial: writes both units), `height`, `weight`, `bodyFatKnown`, `bodyFat`,
  `goalBodyFatOn`, `goalBodyFat`, `activity`, `goal`, `target`, `pace`, `remindersAnswered`,
  `aiReady`, `planBuilt {run, plan, aiUnavailable}`, `planEdit {field, value}`.
- Selectors: `stepIndex`, `canContinue`, `canGoBack`, `progressOf` (index ÷ 12 or null),
  `targetProblem` (the `checkGoalWeight` result), `estimatedDays`, `remindersOn`, `unitSystemOf`,
  `bodyFatPercent`, `reminderAnswerOf` (browser permission → answer), `wizardProfile` (the
  profile the answers make: maintain drops pace and target, goal body fat only with body fat,
  the plan as saved targets).

Files: created `src/features/onboarding/wizard.ts`, `src/features/onboarding/wizard.test.ts`,
this note.

Edge cases / failure modes:
- A unit switch holds each value to the new unit's wheel when the old value cannot be shown
  there (20 kg is 44.1 lb, below the 50 lb wheel; 8′11″ is above 250 cm); every value that fits
  both wheels is kept exactly (70 kg → lb → kg is 70 again).
- The target check compares the values as shown (rounded to a tenth in the display unit), so a
  target that reads the same as the current weight is refused even when the stored kg differ by
  a few grams after a unit switch.
- Choosing the same goal again does not re-seed (a moved target survives a stray tap).
- A current weight changed after the target was moved can leave the target on the wrong side:
  the Target step blocks Continue again on the way forward.
- A future birth date is held to today; an unreadable one is ignored.
- `planBuilt` for an old run, or while another step shows, changes nothing; `next` and `back` on
  Building plan change nothing.

Our design differences / decisions:
- Names, action shapes and the run-number guard are ours. Steps are string ids
  (`'welcome'` … `'planReady'`); `stepIndex` gives the D-16.63 index.
- Verify line "maintain skips target and pace" is taken as: with maintain the Target check is
  skipped and the profile drops pace and target; the steps stay in the sequence (Pace has its own
  maintain confirmation in P05-03, and the indices of D-16.63 stay fixed). See "Decisions for the
  lead".
- The reminders answer is stored as granted | denied | dismissed | unsupported; only granted
  turns reminders on (D-16.15).
- The AI step's readiness is one flag (`aiReady`) the P05-04 step sets; the plan is a `PlanDraft`
  from `src/domain/goals/planEdit.ts` plus the `aiUnavailable` flag, edited through `editPlan`.
- The body-fat wheel (3–60 % in 0.5 steps, D-16.56) is a constant here because `src/domain` is not
  this slice's; it belongs next to `WEIGHT_WHEEL` in `src/domain/units/body.ts` later.

Decisions for the lead:
- If "maintain skips target and pace" means the steps themselves are skipped, only `next` and
  `back` change (one helper), and Pace's maintain branch becomes unused.
- Reminders: the state records the answer only; P05-07 should, on a grant, set `remind.master`
  on and switch the three meal reminders on at their defaults (the step explains meal reminders),
  and on anything else leave every reminder off.

Tests we will write (`wizard.test.ts`):
- kg → lb → kg keeps 70.0 and the stored 70 (R01.3, ACC-B3-1); 170 cm reads 5′7″ and comes back.
- lose with target 72 and current 70 blocks Continue; 69.9 lets it pass; gain mirrors; maintain
  skips the check (R01.6, ACC-B4-1).
- maintain drops pace and target from the profile; goal body fat only with body fat.
- target seed per goal, re-seed on a weight change until moved, held to the wheel.
- back from Plan ready lands on AI access; Back is a no-op on Welcome and Building plan.
- a completion for an earlier run, or after leaving, is ignored; the current run's completion
  advances (R01.8).
- progress 1/12 on Sex, 10/12 on AI access, hidden on Welcome, Building plan and Plan ready.

Compare checklist (filled after the rewrite; reopened `OnboardingViewModel.kt` (state, setters,
`next`, `back`, `buildPlanWithAI`, `complete`), `OnboardingStateTest.kt`, `OnboardingView.swift`
80–260 and 560–660):
- [x] Step order and defaults: male, today − 25 y, 175 cm, 70 kg, moderate, maintain, pace 0.5
  (tested in `wizard.test.ts` > startWizard > opens on Welcome with the default profile, a steady
  pace and nothing answered; > numbers thirteen steps from Welcome (0) to Plan ready (12))
- [x] One toggle writes both units and keeps the entered value (R01.3) (`wizard.test.ts` > units >
  keeps 70.0 kg through kg → lb → kg (R01.3, ACC-B3-1); > shows 170 cm as 5 ft 7 in and keeps
  170 cm through a round trip (R01.3))
- [x] Target seed per goal, and on a weight change until moved (`wizard.test.ts` > target weight >
  seeds the target 5 kg under or over …; > re-seeds when the current weight changes, until the
  person moves the target; > holds the seed to the weight wheel)
- [x] Wrong-side target blocks Continue, maintain skips the check (D-16.11, R01.6) (`wizard.test.ts`
  > target weight > blocks Continue for a lose target of 72 kg when the current weight is 70
  (R01.6, ACC-B4-1); > refuses a gain target at or below the current weight (R01.6, D-16.11);
  > skips the check for maintain)
- [x] The AI step holds Continue until set up (the reference's only gate test) (`wizard.test.ts` >
  Continue and Back > holds AI access until its setup is ready)
- [x] Back: none on Welcome and Building plan; Plan ready → AI access (`wizard.test.ts` > Continue
  and Back > does nothing on Back from Welcome or Building plan; > goes back from Plan ready to AI
  access, skipping Building plan)
- [x] A plan for a run the person left is dropped (R01.8) (`wizard.test.ts` > building the plan >
  ignores a completion that arrives after the person left (R01.8))
- [x] Profile built: maintain drops pace and target; goal body fat only with body fat; the plan as
  saved targets (`wizard.test.ts` > maintain > skips the target check and drops pace and target
  weight from the profile; > keeps goal body fat only next to body fat; > building the plan >
  starts a new run on each visit and accepts that run’s plan)
- [x] Progress maths (D-16.63) (`wizard.test.ts` > progress > is index ÷ 12 on Sex to AI access
  and hidden on Welcome, Building plan and Plan ready)
- Deliberate differences: the target re-seeds to current ∓ 5 kg on a weight change until the
  person moves it (A resets it to the current weight on every weight change and on every goal tap,
  even the same goal; I seeds once on leaving Goal, ±10 lb or ±5 kg per wheel); the wizard refuses
  a wrong-side target (D-16.11), comparing the weights as shown; a unit switch holds a value only
  when the new wheel cannot show it; a Building-plan result counts only for its own run while
  Building plan shows (A advances from anywhere; I keeps a back button during the build); progress
  hidden on Building plan and Plan ready (D-16.63); 13 steps (D-16.15).
- Not taken: the hosted path and its plan gate (N-8); the AI step's choice / key sub-screens and
  their Back (P05-04); the iOS profile save on leaving Pace (P05-07 saves once at the end); the
  returning-user state of Welcome (P09-14); the health step (D-16.15).

## Status

Done (2026-10-26). `wizard.ts` and its 33 tests; no lines changed outside the slice. Handed on:
P05-04..06 plug their views into `WizardPage`'s `lateSteps` and use the `aiReady`, `planBuilt`
(with `state.buildRun`) and `planEdit` actions; P05-07 completes from `wizardProfile(state)`,
`remindersOn(state)` and `state.units`; the body-fat wheel constant can move to
`src/domain/units/body.ts`.
