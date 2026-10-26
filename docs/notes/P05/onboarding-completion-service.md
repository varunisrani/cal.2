# Task: Onboarding completion service (P05-07) · Phase: 05 · Owner: builder (wt-p05s3b, slice S3b)

Read (reference @ `10e14b67`): `A/ui/onboarding/OnboardingViewModel.kt` (`complete()`: what is
written and in which order), `I/calorietrackerApp.swift` lines 160–215 (the defaults written when
onboarding completes, and what a restore skips). Research spec `01-profile-goals.md` §3.4
(Completion), §3.5 (a restore-completed onboarding skips seeding and defaults), §3.10 (the tune-up
switch and its last check); decisions D-16.45 (the tune-up), D-16.15 (reminders replace the
notification and health steps), D-16.80 (maintain keeps no pace or target weight). Landed code
reused: `wizardProfile`, `remindersOn` and the `finished` flag (`wizard.ts`), the repositories'
`seedFirst` (weigh-ins, body fat: they write only into an empty history), `settingsRepo.update`
for read-modify-write of one setting, `DEFAULT_DIARY_SORT`. No reference tests cover it.

What it does (own words): when the person presses Plan ready's last button, the wizard sets
`finished`; the onboarding route then hands the answers to `onboarding.complete`, which in one
flow stores the profile with the plan as its saved targets; seeds the first weigh-in at now when
the weight history is empty, and a first body-fat reading only when body fat was entered; stores
the height and weight units chosen in the wizard; on a granted reminder answer turns on the
reminder switch and the breakfast, lunch and dinner reminders at their default times; switches
the weekly tune-up on unless the plan was changed by hand and marks today as its last check (the
first automatic check lands a week later); seeds the Home sort mode; and last of all marks
onboarding done. The boot gate sees the profile and the flag and moves the app to Home. The AI
choice and key were already stored by the AI access step. A completion after a restore (P09-14,
a flag) keeps the restored history and settings: no weigh-in, body fat, tune-up defaults or sort
mode are seeded. Repeating a completion is safe: no second weigh-in.

The onboarding route (`OnboardingRoute.tsx`) renders the wizard with the three late steps,
passes the browser's notification request, and completes when the wizard reports `finished`.
The temporary quick start (P04-09) is deleted.

Inputs → outputs:
- `complete({profile, plan, planEdited, remindersOn, units}, {now, restored?})` → resolves once
  `onboarding.done` is stored; rejects on the first failed write (nothing after it is written, and
  `onboarding.done` is never set by a failed run).
- `OnboardingRoute` → `WizardPage` with AI access, Building plan and Plan ready; a failed
  completion shows a toast and opens Plan ready again with its button live.

Files: changed `src/services/onboarding.ts` (+ test, `startWithDefaults` removed),
`src/services/context.tsx`, `src/main.tsx`, `src/app/App.tsx` (+ test); created
`src/features/onboarding/OnboardingRoute.tsx`; deleted
`src/features/onboarding/{QuickStart.tsx,QuickStart.test.tsx,quickStart.module.css}`; the
`onboarding.quickStart` and `onboarding.wizard.pending` words; e2e walking skeleton and its
parity scenario now walk the wizard.

Edge cases / failure modes:
- A write fails midway: the error reaches the route, which says so and lets the person press the
  button again; the retry rewrites the same values and the weight history already has its one
  reading.
- The weight history is not empty (a second completion, or a restore): no new weigh-in.
- No body fat entered: no body-fat reading, whatever the history holds.
- Reminders denied, dismissed or unsupported: nothing about reminders is written (all stay off).
- A reminder time already stored (from a restore) is kept when its switch is turned on.
- A Home sort mode already stored is kept (the seed writes the current value, default or not).
- `onboarding.done` is written last, so the shell never leaves onboarding before the rest is
  stored.
- Today for the tune-up's last check is the local day of `now`.

Our design differences / decisions:
- Names are ours. The service takes plain answers, not the wizard state, so `src/services` does
  not depend on a feature; the route maps the state (`wizardProfile`, `state.plan`,
  `remindersOn`, `state.units`).
- The plan is written into the profile's saved targets by the service itself (all four pinned),
  whatever the profile carried.
- No Energy Burn switch (no health store in v1), no speech provider, no health switch (D-16.15).
  AI settings and key are not written here: the AI access step stored them already.
- Units: only height and weight are stored (the wizard sets both together); energy keeps its
  default, which never depends on the locale.
- A failed completion re-opens the wizard on Plan ready with `finished` cleared (a fresh mount
  from the same answers), because the wizard's reducer has no way to clear it.

Tests we will write:
- `onboarding.test.ts` (real repositories over the test database): stores the profile with the
  plan as saved targets, one weigh-in at now, units, tune-up on with today, sort mode, done
  (ACC-B9-1, service side); a hand-edited plan leaves the tune-up off (ACC-B9-2); body fat entered
  → one reading; none entered → none; a granted answer turns on the master switch and three meal
  reminders keeping a stored time; a second completion adds no weigh-in; a restore-completed
  path seeds nothing; order: done last; a failed write leaves done unset and a retry finishes.
- `App.test.tsx`: onboarding opens the wizard's Welcome; finishing the wizard calls the
  completion with the answers.
- e2e walking skeleton: the wizard's shortest path lands on Home with targets, then Demo 1 as
  before (ACC-B9-1, Home side).

Compare checklist (filled after the rewrite; reopened `OnboardingViewModel.kt` `complete()`,
`calorietrackerApp.swift` 160–215):
- [x] Profile saved first, with the plan (`onboarding.test.ts` > complete > stores the profile
  first and onboarding done last; > stores the profile with the plan, one weigh-in at now, the
  units, the tune-up on from today, and onboarding done (ACC-B9-1))
- [x] First weigh-in only into an empty history; body fat only when entered (`onboarding.test.ts`
  > complete > seeds one body-fat reading when body fat was entered; > adds no second weigh-in or
  body-fat reading on a second completion)
- [x] Tune-up on unless hand-edited; last check today (`onboarding.test.ts` > complete > leaves
  the weekly tune-up off when the plan was changed by hand (ACC-B9-2, R01.7); > takes the last
  check from the local day of now)
- [x] Done flag last; then Home (`onboarding.test.ts` > complete > stores the profile first and
  onboarding done last; > leaves onboarding unfinished when a write fails, and a second try
  finishes with one weigh-in; the boot gate's move to Home: e2e `walking-skeleton.spec.ts`)
- [x] A restore-completed onboarding seeds nothing (`onboarding.test.ts` > complete > seeds
  nothing after a restore: no readings, no tune-up defaults, no sort mode (P09-14))
- [x] Reminders (ours, D-16.15) (`onboarding.test.ts` > complete > turns on the reminder switch
  and the three meal reminders after a granted answer, keeping a stored time)
- [x] The route completes from the wizard (`OnboardingRoute.test.tsx` > OnboardingRoute > walks
  the shortest path and finishes: the plan, one weigh-in, the units and the done flag are stored
  (ACC-B9-1); > says so when the save fails, opens Plan ready again, and a second press finishes;
  `answersOf` > maps a finished wizard to what onboarding stores)
- Deliberate differences: no Energy Burn, health or speech defaults; AI settings and key stored by
  the AI access step, not here; reminders turned on only on a granted answer (D-16.15); the Home
  sort mode seeded; a failed save is reported and can be retried (A has no failure path).
- Not taken: the hosted access mode, the health-store wiring, I's profile save on leaving Pace.

## Decisions for the lead

- "Seeds nothing after a restore" (`restored: true`) skips the weigh-in, body fat, tune-up
  defaults (switch and last check) and the sort mode; it still saves the profile with the plan,
  the units, a granted reminder answer and the done flag, which are the person's own answers.
  P09-14 can narrow this when it lands.
- The rebuild baseline (`goals.rebuildBaseline`) is not stored at completion: the Goals page seeds
  it silently on first open (`baselineToSeed`). Storing `planInputsKey(profile)` here would make a
  weigh-in before that first open raise the nudge; one line if wanted.
- Units: only height and weight are stored; `units.energy` keeps its default (kcal, never
  locale-dependent), so a kJ choice made elsewhere is never overwritten.
- The notification request (`askNotifications`) lives in `OnboardingRoute.tsx` until P09-09 adds
  a notifications service.
- `e2e/smoke.spec.ts` (shared) now checks the page title and the wizard's Get started: the Welcome
  heading is the headline, not the app's name.

## Status

Done (2026-10-26). `onboarding.ts` (10 tests, `startWithDefaults` removed), `OnboardingRoute.tsx`
(4 tests), the quick start and its words deleted, `Services.aiSetup` required and `planBuilder`
added, `main.tsx` wired, the walking-skeleton e2e and parity scenario walk the wizard. Lines
changed outside the task's files: `e2e/smoke.spec.ts` (two lines), `src/ai/transport.ts`
(`export`), `src/features/onboarding/WizardPage.tsx` and the wizard tests named in the P05-05
note.
