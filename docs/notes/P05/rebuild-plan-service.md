# Task: rebuild plan service (P05-08) · Phase: 05 · Owner: builder (wt-p05s3c, slice S3c)

Read (reference @ `10e14b67`): `A/ui/settings/SettingsViewModel.kt` (the manual rebuild function
and the small helper that decides the tune-up check day after it: behaviour only),
`I/ContentView.swift` (the manual rebuild with its stale-profile guard, the follow-up nutrient
goal request, the tune-up marking), `T/ui/settings/ManualRecalculationPolicyTest.kt` (a successful
manual rebuild marks today only while the tune-up is on). Research spec `01-profile-goals.md`
§3.6 (callers, Applying, after a rebuild, failure), §3.7 (rebuild clears every lock), §3.8 (the
evidence pack), §3.9 (the rebuild baseline), §6 R01.4, R01.5; decisions D-16.45, D-16.23 and
Proposed D-16.60 (one deadline per action). No Evidence ids.

What it does (own words): the person taps "Rebuild plan" in Settings and their AI works out new
daily targets from the profile, the formulas and their own logged data. The service takes a copy
of the stored profile (and of the input switches, none in v1), builds the evidence pack from the
last 90 finished days, and sends the plan request through the AI client, which runs it under one
time limit of its own. A failure of any kind leaves every target as it was and comes back as the
failure's kind (no formula plan here: the person fixes their AI setup and tries again). A plan that
arrives after the person changed anything in the profile (a body field, a target, a lock,
allergens) or an input switch is thrown away, so a slow reply never overwrites their edit
(R01.4). Otherwise the four targets are stored, every lock is cleared and the plan-inputs key is
stored as the rebuild baseline, which clears the "inputs changed" nudge. While the weekly tune-up
is on, today then counts as its check, so the same tap is not followed by a second AI call on the
next app open (R01.5). Last, the optional nutrient goals are asked for again; when that fails the
person's goals stay as they are.

Inputs → outputs:
- `createRebuildService(deps)` with deps = the profile, settings, weight, body-fat and diary
  repositories, a clock, `aiAccess()` → `{settings, keys}`, the `fetch` to hand the AI client,
  and optionally `inputSwitches()` (none in v1).
- `rebuild()` → `rebuilt {kcal, reason?, nutrientGoals: 'refreshed' | 'kept'}` | `failed {failure}`
  | `dropped` | `noProfile` | `busy`. Kinds and numbers only: the Settings page (P05-11) words them
  (the kcal in the person's energy unit, the failure kind's message pointing to AI settings).
- Storage failures reject (as the other services do); AI failures are values.

Files: created `src/services/goals/rebuild.ts`, `src/services/goals/rebuild.test.ts`, and a
module both goals services share, `src/services/goals/planRequest.ts` (deps type, reading units and
the evidence, sending the plan request, applying over an unchanged profile); test support in
`src/services/goals/__fixtures__/harness.ts`; this note.

Edge cases / failure modes:
- A second tap while a rebuild runs does nothing (`busy`); the gate reopens after a failure too.
- No readable profile → `noProfile`, nothing sent.
- The profile changes between the read and the write of the result (another tab, a Settings edit
  in the last moment): the write is a compare-and-set inside the profile repository's one
  transaction, so the edit still wins.
- An input switch changed while the evidence was gathered or while the call ran → `dropped`.
- An implausible or incoherent plan is refused by the plan check inside the AI layer (R01.2) and
  comes back as a failure; targets unchanged (ACC-C3-2).
- No key / "set up later": the client fails before sending (`noKey`), targets unchanged.
- Nutrient goals edited by the person while their refresh ran: the refreshed goals are not
  written (their edit wins), reported as `kept`.

Our design differences / decisions:
- Names are ours (`rebuild`, `rebuilt`, `dropped`, `planRequest.ts`).
- The tune-up's check day is written right after the plan is stored, before the nutrient-goal
  request (which can take a while), so an app reopen during that request cannot start a tune-up.
  The marking is the P01-16 reducer's `manualRebuildDone` decision.
- "Its own deadline": the plan request goes to the client without a deadline, so the client starts
  one from the person's timeout setting for that request alone; the nutrient-goal request is a
  second action with its own deadline (D-16.23 counts per action; D-16.60 does not join the two).
- Dropped results return `dropped` instead of the reference's silent return, so the page can say
  nothing changed.
- A failure that comes back while the profile changed still reports the failure (the targets are
  untouched either way); a failure after an input switch changed reports `dropped`, as the
  tune-up does.
- `fetch` is an explicit dependency: lint keeps the global `fetch` out of services.

Tests we will write (`rebuild.test.ts`, real repositories on fake IndexedDB, the fake fetch, fake
timers; a gate holds the request open so edits land "during the call"):
- success stores 2 300 / 120 / 347 / 48, clears the calorie lock and macro locks, stores the
  baseline and returns kcal 2 300 with the reason (ACC-C4-1);
- a weight edit during the call → `dropped`, targets and locks unchanged (R01.4, ACC-C4-2); a
  lock-only edit and a target edit are dropped too;
- an input switch flipped during the call → `dropped`;
- the request carries the evidence pack built from the stored weigh-ins (prompt equals the plan
  prompt for the same pack);
- nutrient goals refreshed on success; kept when their request fails; kept when the person edited
  them meanwhile;
- tune-up on → last check today; off → unchanged (R01.5);
- provider failure (401) → `failed` with `keyRejected`, no formula plan, targets unchanged; no key →
  `noKey` without a request; implausible plan (protein 300) → targets unchanged (ACC-C3-2);
- a second call while one runs → `busy`, one request; no profile → `noProfile`.

Compare checklist (filled after the rewrite; reopened `A/ui/settings/SettingsViewModel.kt` (the
manual rebuild and its check-day helper), `I/ContentView.swift` (the manual rebuild),
`T/ui/settings/ManualRecalculationPolicyTest.kt`):
- [x] In-flight guard: a second tap does nothing; the gate reopens after a failure
  (`src/services/goals/rebuild.test.ts > rebuild: one at a time > turns a second tap away while the
  first rebuild runs`, `> takes a new tap once a failed rebuild has finished`).
- [x] Snapshot of profile and switches before the evidence; switches checked again after the
  evidence and after the call (`rebuild.test.ts > rebuild: a profile changed during the call
  (R01.4) > drops the plan when an input switch changed during the call`).
- [x] The request carries the evidence pack of the stored data (`rebuild.test.ts > rebuild: a
  stored plan > sends the plan request with the evidence pack of the stored log and weigh-ins`).
- [x] Failure: goals unchanged, no formula fallback, the failure kind returned (`rebuild.test.ts >
  rebuild: failures leave the plan as it was > returns the failure kind and changes nothing when
  the provider refuses the key`, `> sends nothing and uses no formula plan when no key is stored`,
  `> leaves the targets for an implausible plan: protein 300 for this body (ACC-C3-2)`).
- [x] Whole-profile equality (not only plan inputs) before applying (`rebuild.test.ts > rebuild: a
  profile changed during the call (R01.4) > drops the plan when %s changed, leaving targets and
  locks (R01.4, ACC-C4-2)`, rows weight, lock, target, allergens).
- [x] Apply: four targets, every lock cleared, baseline stored (`rebuild.test.ts > rebuild: a
  stored plan > stores all four targets, clears every lock and returns the kcal and the reason
  (ACC-C4-1)`, `> stores the plan-inputs key of the new plan as the rebuild baseline`).
- [x] Tune-up check day set to today only while it is on; its kept plan untouched (`rebuild.test.ts
  > rebuild: the weekly tune-up (R01.5) > counts as this week’s check while the tune-up is on
  (R01.5)`, `> leaves the check day alone while the tune-up is off`, `> keeps the tune-up’s saved
  plan as it was`).
- [x] Nutrient goals refreshed after success; a failure keeps them (`rebuild.test.ts > rebuild:
  optional nutrient goals > asks for them again after the plan, changing only the goals the reply
  names`, `> keeps the goals as they were when their request fails`).
- [x] Success returns the new kcal and the AI's reason (the ACC-C4-1 test above).
- Deliberate differences: a dropped result returns `dropped` (the reference returns silently; one
  platform also flags "needs rebuild", which our signature nudge already shows because the
  baseline does not move); a failure that comes back after a profile edit still reports the
  failure (one platform drops it silently; the targets are untouched either way); refreshed
  nutrient goals are not written over goals the person edited during that request
  (`rebuild.test.ts > rebuild: optional nutrient goals > keeps goals the person edited while their
  request ran`); the check day is written before the nutrient-goal request, as on both platforms.
- Not taken: the legacy balance macro (not in our profile); the measured-energy anchor, body
  measurements and workouts in the request (later phases); the hosted-AI routing; message text
  (P05-11 words the kinds).

## Decisions for the lead

- `fetch` is a required dependency of both goals services (the lint rule bans the global `fetch`
  outside `src/ai/transport.ts`). `main.tsx` cannot write the global either, and the transport's
  browser default is not exported while `AiDeps.fetch` is required: export a browser `fetch` from
  `src/ai/transport.ts` (or make `AiDeps.fetch` optional) when wiring.
- `aiAccess` is called per request (plan, then nutrient goals), so a key saved meanwhile is used.
- Outcomes are kinds and numbers, no partition: P05-11 shows `rebuilt` as the kcal in the
  person's energy unit plus `reason`, `failed` through the AI failure catalogue with a pointer to
  AI settings, `dropped` as "your profile changed, nothing was updated", and ignores `busy`.
- The deadline: the plan request and the nutrient-goal request each get one from the timeout
  setting (two actions). If the lead wants one deadline over both, start it in `rebuild()` and
  pass it in `AiDeps.deadline`.
- Tests use `useFakeClock` from `src/services/goals/__fixtures__/harness.ts`: fake timers with
  `setImmediate` left real, because the fake IndexedDB runs on it and `useFakeTime` (all timers
  fake) stalls every repository call. A shared helper in `src/test/time.ts` would help later
  service tests.

## Status

Done (2026-10-26). `rebuild.ts` with 20 tests, plus the shared `planRequest.ts` and the test
harness; nothing outside `src/services/goals/**` and this note changed. Traps covered: R01.4 (the
rebuild wiring), R01.5 (the rebuild's check day). Acceptance: ACC-C3-2, ACC-C4-1, ACC-C4-2 (ACC-C3-1
is the plan validator's, already covered in P01-14).
