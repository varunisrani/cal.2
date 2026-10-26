# Task: Building plan step and plan builder (P05-05) · Phase: 05 · Owner: builder (wt-p05s3b, slice S3b)

Read (reference @ `10e14b67`): `A/ui/onboarding/OnboardingScreen.kt` (the building-plan step
only: what it shows, its timing, when it moves on), `A/ui/onboarding/OnboardingViewModel.kt`
(the plan request of the building step, `next`/`back` around it). Research spec
`01-profile-goals.md` §3.4 (Building plan, navigation) and §3.6 (what the plan request is and how
a reply is checked); decisions D-16.14 (60 s cap, then the formula plan with a note), D-16.45
(no formula correction elsewhere; here the formula plan is the onboarding fallback only), D-16.80
(maintain keeps no pace or target: the profile the request sends comes from `wizardProfile`).
Trap R01.8 (the cap and the fallback are ours to prove; Back and stale runs are already proved in
`wizard.test.ts`). Landed code reused, not re-derived: `requestPlan` (`src/ai/tasks/planning.ts`),
`startDeadline` (`src/ai/deadline.ts`), `roleFor`/`missingFor` (`src/ai/settings.ts`),
`formulaPlan`/`carbsLeft` (`src/domain/goals/formulas.ts`), the wizard's `planBuilt` action and
`buildRun` counter (`wizard.ts`). No reference tests cover this step.

What it does (own words):
- `planBuilder` (service): given the wizard's profile, today and the body units, it reads the
  stored AI setup. With nothing set up (the row is null, "Set up later") or a serving role that
  still lacks a key, model or address, it answers at once with the formula plan, flagged
  `aiUnavailable`. Otherwise it asks the AI for a plan with no evidence pack, all of it (primary,
  retries, standby) under one 60 s deadline handed to the client. A good answer becomes the plan,
  carbs worked out again from what kcal, protein and fat leave; any failure, a refused answer, the
  cap, or an error reading storage gives the formula plan flagged `aiUnavailable`. It never
  rejects.
- `BuildingPlan` (wizard step 11): a big percent counter climbing 0 → 100 and a five-line
  checklist that ticks one line every 700 ms, over about 4 s, while the plan is built in
  parallel. The step moves to Plan ready (`planBuilt` with the run it started for) only once both
  the animation and the plan are done. There is no Back (the wizard hides it here). A plan that
  arrives after the step went away is dropped (R01.8). With reduced motion the counter jumps line
  by line instead of counting, but the lines still tick in order at the same pace.

Inputs → outputs:
- `buildPlan({profile, today, units, cancel?}, {aiAccess, energyUnit, fetch})` →
  `{plan: Targets, aiUnavailable: boolean}`; `createPlanBuilder(deps).build(request)` is the same
  bound to its deps (the `planBuilder` service); `storedAiAccess({settingsRepo, secretsRepo})` →
  a reader of `{settings: AiSettings | null, keys}` for `main.tsx`.
- `BuildingPlan({state, dispatch})` → one `planBuilt {run, plan, aiUnavailable}`.

Files: created `src/services/goals/planBuilder.ts` (+ test),
`src/features/onboarding/steps/BuildingPlan.tsx` (+ test), `buildingPlan.module.css`; changed
`src/services/context.tsx` (`planBuilder` in `Services`), `src/main.tsx` (wiring),
`src/i18n/en/onboarding.ts` (the step's words).

Edge cases / failure modes:
- The AI never answers: the deadline aborts the request at 60 s and the plan builder also stops
  waiting at that moment, so a client that ignored the abort still could not hold the step.
- The person's own time limit (30–600 s) does not apply here: the 60 s cap is the only deadline.
- A refused reply (out of range, incoherent, implausible) goes to the standby inside the client;
  if that fails too → formula plan.
- Storage read fails (setup or energy unit) → formula plan, never a stuck step.
- The plan arrives before the animation ends → wait for the animation; the animation ends first →
  advance the moment the plan arrives.
- The step leaves (unmount) while building → the request is cancelled and its result ignored.
- In development React mounts effects twice: each mount starts its own request and the first is
  cancelled, so exactly one plan is dispatched.

Our design differences / decisions:
- Names, words and the checklist lines are ours (energy, protein, fat, carbs from what is left, a
  final check); no health score line (we have no health score).
- The cap (D-16.14): A waits without limit. Ours stops at 60 s and uses the formula plan with
  `aiUnavailable`, which Plan ready turns into its note.
- On failure the formula plan becomes four pinned targets (I's way), not empty targets (A's), so
  Plan ready edits and the saved plan are the same numbers the person saw.
- "No AI setup" is judged on the role that would serve a request without photos (`roleFor`): the
  primary during onboarding, since the text provider is off there.
- The counter, the lines and the hold come from one 50 ms frame timer (14 frames a line, 80
  frames in all = 4 000 ms), so the counter and the list never drift apart and fake timers drive
  the whole step.
- The energy unit for the request's kJ line is read by the service from settings, so the step
  needs no data reads of its own.

Tests we will write:
- `planBuilder.test.ts` (fake fetch, fake timers): no setup → formula at once, no request; a
  missing key → formula at once; an answer at 2 s → the AI plan with carbs re-derived; a reply
  the plan check refuses → formula; network failure → formula; never answers → still waiting at
  59.9 s, formula at 60 s even with a 600 s time limit (R01.8, D-16.14); storage read fails →
  formula; cancel → formula and the request aborted; `storedAiAccess` reads AI keys only.
- `BuildingPlan.test.tsx`: the counter and lines over time, no plan before the animation ends
  even when the AI answered at 2 s (ACC-B7-2); a slow plan advances the moment it lands; no Back
  throughout; a plan for a step that went away is dropped (R01.8); reduced motion keeps the order
  and timing; the AI never answering ends on Plan ready with the formula plan and its note after
  60 s (ACC-B7-1).

Compare checklist (filled after the rewrite; reopened `OnboardingScreen.kt` building-plan step,
`OnboardingViewModel.kt` plan request and `next`/`back`):
- [x] Five lines, one every 700 ms, the counter at 100 when the last line ticks, then a short
  hold (`BuildingPlan.test.tsx` > BuildingPlan > counts to 100 % and ticks one line every 700 ms
  while the plan is built)
- [x] Plan built in parallel; advance only when both are done (`BuildingPlan.test.tsx` >
  BuildingPlan > moves on only once the 4 s animation is over when the plan came at 2 s, for the
  run it started (ACC-B7-2); > moves on the moment a plan that is slower than the animation
  lands)
- [x] Carbs re-derived from the AI's kcal, protein and fat (`planBuilder.test.ts` > buildPlan >
  uses the AI's plan when it answers at 2 s, with carbs worked out from what kcal, protein and fat
  leave)
- [x] No evidence pack for the onboarding request (`planBuilder.test.ts` > buildPlan > asks
  without an evidence pack, in the energy unit the person reads)
- [x] Failure → formula values (`planBuilder.test.ts` > buildPlan > falls back to the formula
  plan when the plan check refuses the reply; > falls back to the formula plan when the provider
  cannot be reached; > gives the formula plan when reading the stored setup fails;
  `BuildingPlan.test.tsx` > BuildingPlan > ends on the formula plan when the plan builder itself
  fails)
- [x] No Back while building (`BuildingPlan.test.tsx` > BuildingPlan > shows no Back while it
  builds (R01.8)); Back from Plan ready skips this step (`wizard.test.ts`, landed)
- [x] The cap and its note (ours, D-16.14) (`planBuilder.test.ts` > buildPlan > stops waiting at
  60 s and gives the formula plan, even with a 600 s time limit (R01.8, D-16.14);
  `BuildingPlan.test.tsx` > BuildingPlan with the real plan builder and Plan ready > shows the
  formula plan with the AI-unavailable note at 60 s when the AI never answers (ACC-B7-1, R01.8,
  D-16.14))
- [x] A plan for a step that went away is dropped (ours, R01.8) (`BuildingPlan.test.tsx` >
  BuildingPlan > drops a plan that lands after the step went away, and stops its request (R01.8))
- [x] No AI setup → formulas at once (`planBuilder.test.ts` > buildPlan > gives the formula plan
  at once, sending nothing, when no AI is set up (Set up later); > gives the formula plan at once
  when the provider still lacks its key)
- Deliberate differences: the 60 s cap (D-16.14); pinned formula targets on failure (I's rule)
  with the `aiUnavailable` note; the counter climbs smoothly (A jumps 20 % a line) except under
  reduced motion; our five lines and words; a 500 ms hold instead of 400 ms, so the whole
  animation is 4 s.
- Not taken: the gradient bar colours, the health-score line, the hosted plan's quota note, A's
  100 ms polling (the step reacts to the plan's promise).

## Decisions for the lead

- `buildPlan(request, deps)` takes `{profile, today, units, cancel?}`, not a bare profile: the
  request needs today (age) and the body units, and the step's cancel. The energy unit is read by
  the service (`deps.energyUnit`), so the step needs no data reads.
- "No AI setup" is judged with `roleFor({}, settings)` + `missingFor` (the role a request without
  photos goes to); during onboarding that is the primary, as the task says.
- `storedAiAccess({settingsRepo, secretsRepo})` (in `planBuilder.ts`) reads the `ai.settings` row
  and every AI provider's key (not the `fdc` key). The rebuild and tune-up services' `aiAccess`
  can use the same reader (map a null row to `DEFAULT_AI_SETTINGS` there, or move the reader to its
  own module).
- `main.tsx` imports `browserFetch` from `src/ai/transport.ts` (the one `export` keyword the lead
  allowed).
- Test-only: the screen harness gained `planBuilder` and `onboarding` options and real
  onboarding/AI setup services; tests that need fake timers with the test database fake only
  `setTimeout`/`setInterval`/`Date` and step Dexie's zero-delay live-query timer by hand
  (`untilShownOnFakeTimers`), because Dexie starts each live query with `setTimeout(…, 0)`.

## Status

Done (2026-10-26). `planBuilder.ts` (12 tests), `BuildingPlan.tsx` (10 tests), the step's words.
Lines changed outside the task's files: `src/ai/transport.ts` (`export` on `browserFetch`, as the
lead said), `src/features/onboarding/WizardPage.tsx` (late steps required, the stand-ins removed)
and the tests that render it (`WizardPage.test.tsx`, `AiAccess.test.tsx`, `PlanReady.test.tsx`,
`testing/renderWizard.tsx`, which now holds test stand-ins). Trap R01.8's cap and fallback are
covered (the lead updates the ledger).
