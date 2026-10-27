# Task: Onboarding and goals e2e (P05-15) · Phase: 05 · Owner: builder (wt-p05s5, wave C)

Read (reference @ `10e14b67`): none. The flows are our own (the phase row lists no reference file):
the spec strings together screens and services that already landed (P05-01..14) and proves them
end to end against the fake AI provider (P00-09). Our own docs read: the P05-15 row, "Goal" and
"Done when" (Demo 2) in `docs/plan/phases/P05-onboarding-and-goals.md`; D-16.14 (60 s cap, then
the formula plan with a note), D-16.22 (an unusable answer sends the standby in), D-16.26 (plain
http only for loopback); traps R01.2, R01.7, R03.3, R03.20; `docs/internals/acceptance-map.md`
(B6, B7, B8, B9, C4); the fake AI's note (`docs/notes/P00/fake-ai-provider-server.md`) and
`e2e/fake-ai/server.ts`; the landed code for hooks and words (`WizardPage.tsx`, `AiAccess.tsx`,
`ProviderForm.tsx`, `ModelPicker.tsx`, `KeyField.tsx`, `BuildingPlan.tsx`, `PlanReady.tsx`,
`planBuilder.ts`, `rebuild.ts`, `GoalsPage.tsx`, `TargetRow.tsx`, `DaySummary.tsx`,
`SettingsHub.tsx`, `TabBar.tsx`), the plan reply contract (`src/ai/parse/planReply.ts`,
`src/domain/goals/planValidator.ts`, `src/ai/prompts/plan.ts` answer section) and the catalogue
partitions (`onboarding`, `aiSetup`, `home`, `goals`, `common`, `shell`).

What it does (own words): four browser tests on the Pixel 7 profile, each from a fresh profile
(Playwright gives every test a new browser context, so IndexedDB starts empty), walk the wizard
with every body answer on its default (the profile whose formula plan is 2 452 kcal, 112 g
protein, 406 g carbs, 42 g fat):
1. AI access with the Custom provider pointed at the fake AI over loopback http, no key (it is
   optional), a model id typed, the terms ticked; the fake answers with `plan-ok`. Building plan
   runs its animation, Plan ready shows the AI's plan (not the formula one, no AI-unavailable
   note). Protein is raised to 150 g on its wheel and carbs follow; Start tracking lands on Home,
   whose gauge and pillars show exactly those targets.
2. The same setup with the fake answering `garbage`: the AI was asked once, could not be read,
   and Plan ready shows the formula plan with the AI-unavailable note (at once after the
   animation: an unusable answer is a failure, not a wait for the 60 s cap).
3. "Set up later": no request reaches the fake, and Plan ready shows the formula plan with the
   note.
4. `plan-ok` again, the calories moved down on Plan ready before finishing, then Settings › Goals
   and nutrition shows the edited target; with `plan-ok` loaded once more, Rebuild plan reports
   the new daily target (the AI's) and its reason, and the target rows show the AI's plan again.

Inputs → outputs:
- `e2e/onboarding.spec.ts` → four Playwright tests over the built app (`vite preview`), one
  worker, Pixel 7 with `en-US`, UTC and reduced motion; the page clock installed at a fixed
  morning so "today" (and so the age in the formulas) is fixed. Each passes or names its step.
- `e2e/fake-ai/scripts/plan-ok.json` → one 200 chat completion whose message is our plan reply
  (`kcal`, `protein`, `carbs`, `fat`, `why`) that passes `checkPlan` for the default profile.
- `e2e/support.ts` (new, shared) → `LOCALE`, `words()` and `ui()` (moved out of the walking
  skeleton spec, which now imports them) and a small fake-AI client: reset, load a named script,
  read the recorded chat requests; the provider base URL for the Custom provider.

Files: created `e2e/onboarding.spec.ts`, `e2e/fake-ai/scripts/plan-ok.json`, `e2e/support.ts`,
this note; changed `e2e/walking-skeleton.spec.ts` (imports `LOCALE`, `words`, `ui` from the
helper instead of defining them; nothing else).

Edge cases / failure modes:
- The plan must pass the plan check against the formula plan of the same day: protein inside
  78–146 g, fat inside 21–63 g, kcal inside 1 226–4 904, the energy adding up. `plan-ok` is
  2 400 kcal, 125 g protein, 340 g carbs, 60 g fat (4 × 125 + 4 × 340 + 9 × 60 = 2 400 exactly;
  protein inside the prompt's own ±15 % of the formula's 112 g), so the exact fit leaves it as is
  and it differs from the formula plan in every value.
- The fake server is shared by every test and keeps its script and recordings between them:
  every test resets it first, then loads what it needs. A rebuild after onboarding loads `plan-ok`
  again (a load rewinds the script but keeps the recordings).
- The rebuild asks for the optional nutrient goals after storing the plan. `plan-ok` holds one
  reply, so that follow-up gets the fake's "script used up" 500 and the goals are kept (the
  service's documented failure path); the test checks only the plan and the message.
- A plan edited on Plan ready turns the weekly tune-up off; an untouched one leaves it on with
  today checked. Either way nothing is due on Home, so no tune-up request can take a scripted
  reply. Test 4 edits the plan so the rebuild visibly changes the targets (and the Goals rows are
  editable, not owned by the tune-up).
- Building plan takes about 4 s of the page's clock, which runs at real speed after
  `page.clock.install`; every wait is a locator expectation (no fixed sleeps, no clock jumps).
- The Custom provider's key field is a password input (no ARIA textbox role): the test leaves it
  empty and checks only its label says it is optional.
- Uncaught page errors fail every test (collected from the first load).

Our design differences / decisions:
- Copy comes from the catalogue through the message renderer (`t()` reads `import.meta.env`,
  which Playwright's loader lacks); locators are roles, accessible names and `data-ui` hooks.
- The fake's address comes from `portFromEnv()` and `HOST` of `e2e/fake-ai/server.ts`, so the
  specs read `PLATEWISE_FAKE_AI_PORT` exactly as the server does (blank means the default).
- The helper talks to the fake with Node's `fetch` from the test worker (the e2e lint block only
  bars IndexedDB); a control call that fails throws with the fake's own message.
- ACC-B7-1's 60 s cap stays proved by the unit test (fake timers); the e2e half proves that an AI
  that cannot be used ends on the formula plan with the note, which is what the decision for this
  task asks (four tests, no cap wait).

Decisions for the lead:
- `plan-ok` has one reply, as the phase row says; a rebuild's nutrient-goals follow-up therefore
  meets the fake's "script used up" 500 and keeps the goals. A later script (or a second reply)
  could cover the refreshed path end to end.

Tests we will write (`e2e/onboarding.spec.ts > onboarding and goals (Demo 2)`):
- `walks the wizard with the AI as a Custom provider at loopback, edits protein on Plan ready and
  finds those targets on Home (ACC-B7-2, ACC-B8-1, ACC-B9-1, R01.7, R03.20)`
- `falls back to the formula plan with the AI-unavailable note when the AI answer cannot be read
  (ACC-B7-1)`
- `uses the formula plan and sends nothing when AI is set up later (ACC-B6-2)`
- `rebuilds the plan from Settings › Goals and nutrition and names the new daily target
  (ACC-C4-1)`
All four three times in a row (`--repeat-each=3`), one worker, together with the walking
skeleton (which now imports the helper).

Compare checklist (filled after the rewrite; no reference file applies: the flows are ours, so
each tick names the test of `e2e/onboarding.spec.ts > onboarding and goals (Demo 2)` that proves
it; T1..T4 are the four tests above, in order):
- [x] Custom at loopback http, no key, the model required (Continue disabled and the "type a model
      id" line until one is typed), terms → Continue → Building plan without Back → Plan ready
      with the AI plan (2,400 / 125 / 340 / 60), no AI-unavailable note, one chat request to
      `/v1/chat/completions` carrying our model id (T1, steps "AI access: …" and "Building plan,
      then Plan ready with the AI plan")
- [x] Protein to 150 g re-derives carbs (315 g) and keeps 2,400 kcal; the tune-up note switches
      to the edited wording; Start tracking → Home's gauge reads "0 / 2,400 left" and the three
      pillars "150 / 315 / 60 g left" (T1, last two steps)
- [x] `garbage` → exactly one request, then the formula plan (2,452 / 112 / 406 / 42) with the
      AI-unavailable note, right after the animation (T2; about 6 s a run, so no cap wait)
- [x] Set up later → no request at all, the formula plan with the note (T3)
- [x] Calories down to 2,000 on Plan ready (carbs 240) → Goals rows show it → Rebuild plan with
      `plan-ok` → "Plan rebuilt", "Your new daily target is 2,400 kcal." and the AI's reason → OK
      → the rows read 2,400 kcal, 125 / 340 / 60 g (T4)
- [x] No uncaught page error in any test (the `afterEach` check)
- [x] The spec fails when the AI plan is refused: with `plan-ok`'s protein set to 300 (outside
      78–146 g) T1 fails on Plan ready ("2,452 kcal a day" received for "2,400"); file restored.
- Deliberate differences: none against the reference (no reference flow).
- Not taken: the 60 s cap end to end (unit-tested); a parity scenario (none is listed for P05);
  the nutrient-goals refresh after a rebuild (see Decisions for the lead).

## Status

Done (2026-10-27). Created `e2e/onboarding.spec.ts`, `e2e/fake-ai/scripts/plan-ok.json`,
`e2e/support.ts` and this note; `e2e/walking-skeleton.spec.ts` now imports `LOCALE`, `words` and
`ui` from `e2e/support.ts` instead of defining them (no other change). No `src/` change: every
step already had a role, a name or a `data-ui` hook. The lead adds the four tests' `Test:` lines
to ACC-B6-2, ACC-B7-1, ACC-B7-2, ACC-B8-1, ACC-B9-1 and ACC-C4-1, and to traps R01.7 and R03.20.
