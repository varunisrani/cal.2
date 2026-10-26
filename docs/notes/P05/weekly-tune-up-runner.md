# Task: weekly tune-up runner (P05-09) · Phase: 05 · Owner: builder (wt-p05s3c, slice S3c)

Read (reference @ `10e14b67`): `A/FudAIApp.kt` lines 640–800 (the shared evidence helper and the
weekly refresh: its in-flight flag, the switch checks before and after the call, failure marking,
the stale-profile drop, the one-time kept plan, the due rule), `I/ContentView.swift` (the run on
demand with its in-flight flag and outcome alerts, and the switch handler: locks cleared and a
forced run on enable, the kept plan put back on disable); for the Android switch handler and its
"on" message, `A/ui/settings/SettingsViewModel.kt` (switching the tune-up on and off). Research spec
`01-profile-goals.md` §3.10 (setting, due rule, triggers, run, turning off and on), §3.6 (applying),
§6 R01.1, R01.4, R01.5, R01.14; decision D-16.45; the P01-16 reducer
(`src/domain/adaptive/cadence.ts`) and its note. No Evidence ids.

What it does (own words): the weekly tune-up keeps the plan in step with the person's real data by
running the same AI plan request as a rebuild at most once every seven days (R01.1: no formula
corrector). The runner is the part with side effects around the pure reducer: it reads the stored
switch, check day and kept plan, asks the reducer what a trigger means, gathers the evidence,
calls the AI, and writes exactly what the reducer's settlement says. Triggers: the app opening and
the page becoming visible again, once onboarding is done; turning the switch on (a forced run).
Only one run is in flight at a time: triggers that arrive meanwhile are dropped, so a burst of
visibility events costs one AI call (R01.5). A failure keeps the plan and still counts as this
week's check while the switch is on, so a broken key is not called on every open (D-16.45). A
reply that arrives after the switch went off, or after an input switch changed, does nothing; a
reply that arrives after any profile edit is dropped and nothing is marked (R01.4). The first time
the tune-up changes the plan, the plan from before is kept; turning the switch off puts it back
and forgets it (R01.14). Turning the switch on clears every lock and runs at once; its outcome
(changed with the new kcal and reason, unchanged with a short reason kind, or a failure kind) goes
back to the caller, the Settings page, to show. `useTuneUp` wires the triggers to the app's
lifecycle.

Inputs → outputs:
- `createTuneUpRunner(deps)` with the same deps as the rebuild (`PlanServiceDeps`).
- `check('open' | 'visible')`, `turnOn()` → `changed {kcal, reason?}` | `unchanged {why}` with
  `why` = `off | notReady | running | notDue | dropped | abandoned` | `failed {failure}`.
- `turnOff()` → `{restored: boolean}`.
- `useTuneUp({runner, ready, visibility?})`: sends `open` once `ready` (mount or later), and
  `visible` on every change to visible while ready; nothing after unmount. `visibility` defaults to
  `document`; tests pass their own.

Files: created `src/services/goals/tuneUp.ts`, `src/services/goals/tuneUp.test.ts`,
`src/app/useTuneUp.ts`, `src/app/useTuneUp.test.ts`; shares `src/services/goals/planRequest.ts` and
`src/services/goals/__fixtures__/harness.ts` with P05-08; this note.

Edge cases / failure modes:
- Three `visible` events in a row: the first decides to run; the others see a run in flight and
  are skipped (`running`). The in-flight flag is set in the same synchronous step as the decision,
  so two triggers can never both start a run.
- Turning the switch on while a run is in flight: locks cleared and the switch stored, the forced
  run is skipped (`running`); the run in flight then settles against the profile as it is now.
- Turning off while the AI call runs: the reply is abandoned, nothing applied, nothing marked; the
  kept plan (if any) is restored right away.
- The writes after a reply and the switch actions run one at a time, so turning off can never
  interleave with applying a reply in the same tab.
- The kept plan is written before the profile changes, so a failed profile write can never lose
  the person's own plan; if the profile turns out to have changed at that last moment, the kept
  plan this run wrote is removed again and the reply is dropped.
- Not ready (onboarding not finished, no readable profile) → `notReady`; switch off → `off`.
- Storage failures reject; the hook catches and logs them, so app open never breaks.

Our design differences / decisions:
- Names are ours (`check`, `turnOn`, `turnOff`, `useTuneUp`, `changed`/`unchanged`/`failed`).
- Outcomes are kinds and numbers; the dialog text is P05-11's. "Unchanged" carries why, so the page
  can say "it checks weekly once there is enough data" for any of them.
- The automatic runs return outcomes too (nobody shows them; tests read them).
- A tune-up that applies a plan also stores the rebuild baseline, as a rebuild does: the plan was
  just built from these inputs, so the "inputs changed" nudge would be wrong. (The reference does
  this on one platform only.) Listed for the lead.
- The hook takes `ready` from its caller (the boot state) and the runner checks "onboarding done
  and a profile exists" again from storage, which the reducer needs anyway.

Tests we will write:
- `tuneUp.test.ts` (real repositories on fake IndexedDB, fake fetch, fake timers, a gate holding
  the request open): due after 7 days → one request, plan applied, locks cleared, today marked
  (ACC-C8-1), and a second open the same day sends nothing; 6 days → nothing; three `visible` in a
  row → one request (R01.5); not ready / off → nothing; failure (401 and no key) → plan kept, today
  marked (R01.5, D-16.45); off during the call → nothing applied or marked; profile edited during
  the call → dropped, nothing marked (R01.4); two runs then off → the plan from before the first
  run is back and the kept plan is gone (R01.14, ACC-C8-2); turn on clears locks and forces a run
  that was not due, outcome changed with kcal and reason; turn on with a broken key → failed kind;
  turn on while a run is in flight → unchanged `running`; turn off with nothing kept leaves the
  profile; the run stores the baseline; R01.1 (the plan comes from the AI request, nothing changes
  without one).
- `useTuneUp.test.ts`: open on mount when ready, not before; open when ready flips; visible only
  for visible; nothing after unmount; a rejected run is caught; with the real runner, an open plus
  three visibility events give one AI request.

Compare checklist (filled after the rewrite; reopened `A/FudAIApp.kt` lines 640–800,
`I/ContentView.swift` (the on-demand run and the switch handler), `A/ui/settings/SettingsViewModel.kt`
(the switch handler)):
- [x] In-flight flag: overlapping runs dropped (`src/services/goals/tuneUp.test.ts > check: when
  a check is due (D-16.45) > makes one AI call for three visible events in a row (R01.5)`;
  `src/app/useTuneUp.test.ts > useTuneUp > turns an open and three visible events during its run
  into one AI call (R01.5)`; `tuneUp.test.ts > turnOn > returns unchanged when a run is already in
  flight, which then drops its reply`).
- [x] Skip when off, not due (unless forced) or no profile (`tuneUp.test.ts > check: when a check
  is due (D-16.45) > sends nothing when %s`, rows "checked 6 days ago", "switched off",
  "onboarding not done"; `> sends nothing when no profile is stored`; `> rebuilds the plan once
  when the app opens 7 days after the last check (ACC-C8-1)`).
- [x] Snapshot profile and switches; evidence; still on and switches unchanged before the call and
  after it (`tuneUp.test.ts > check: replies that come too late (R01.4) > drops the reply when an
  input switch changed during the call`, `> applies and marks nothing when the switch is turned
  off during the call`).
- [x] Failure: plan kept; marked today when still on and switches unchanged (`tuneUp.test.ts >
  check: failures keep the plan and count as the check (R01.5, D-16.45) > marks today and keeps
  the plan when the provider refuses the key (R01.5)`, `> changes nothing without an AI plan and
  still marks the week: no formula fallback (R01.1, D-16.45)`, `> marks nothing for a failure that
  arrives after the switch went off (R01.5)`).
- [x] Success dropped when the profile changed (`tuneUp.test.ts > check: replies that come too late
  (R01.4) > drops the reply and marks nothing when the profile changed during the call (R01.4)`).
- [x] Kept plan saved only when none is kept; four targets applied; locks cleared; today marked
  (`tuneUp.test.ts > the plan from before the tune-up (R01.14) > restores the plan from before the
  first tune-up after two runs (R01.14, ACC-C8-2)`, `> keeps an all-automatic plan as {} and puts
  it back as all automatic`; the ACC-C8-1 test above).
- [x] Off: kept plan put back and deleted; locks untouched (the R01.14 test above; `> leaves the
  profile as it is when nothing is kept`).
- [x] On: locks cleared first, then a forced run with its outcome for the caller (`tuneUp.test.ts >
  turnOn > clears every lock and runs although no check is due, returning the new kcal and
  reason`, `> returns the failure kind when the provider cannot be reached, with locks cleared`).
- [x] Triggers: app open once ready and every return to the front (`useTuneUp.test.ts > useTuneUp >
  sends open once when it mounts with onboarding done`, `> sends nothing before onboarding is
  done, then open once it is`, `> sends visible each time the page comes back to the front, never
  when it is hidden`, `> stops listening when it unmounts`, `> follows the document by default`,
  `> logs a run that failed instead of leaving the rejection unhandled`).
- Deliberate differences: on enable the locks are cleared before the switch is stored (one platform
  stores the switch first); the reply is checked against the switch and the profile in one
  write phase that turning the switch on or off cannot interleave with; the kept plan is written
  before the profile and removed again if the profile write is refused at the last moment; a
  tune-up that applies a plan also stores the rebuild baseline (one platform does this, the other
  not); every trigger returns an outcome (automatic ones are not shown); "unchanged" carries why
  instead of one fixed message.
- Not taken: the formula corrector (D-16.45, R01.1); the measured-energy anchor and health switches
  (later phase; `inputSwitches` is ready for them); the hosted-quota flag; message text (P05-11).

## Decisions for the lead

- Wiring at landing: `createTuneUpRunner(deps)` in `main.tsx` with the same deps as
  `createRebuildService` (see the P05-08 note for `fetch`); mount
  `useTuneUp({ runner, ready: useBootState()?.status === 'ready' })` in `App.tsx`; Settings (P05-11)
  calls `turnOn()` / `turnOff()` and shows `turnOn()`'s outcome in the dialog.
- The tune-up stores `goals.rebuildBaseline` when it applies a plan (spec 01 §3.9 notes one
  platform does). Remove the one line in `tuneUp.ts` if the nudge should survive a tune-up.
- "Unchanged" reasons for the enable dialog: any `unchanged` can show "it checks once a week when
  there is enough data"; `failed` shows the failure kind's message.
- The single-flight flag lives in the runner instance: create one runner for the app (the hook
  takes it as a prop; a new object starts its triggers again).

## Status

Done (2026-10-26). `tuneUp.ts` with 19 tests, `useTuneUp.ts` with 7 tests; shares
`src/services/goals/planRequest.ts` and the test harness with P05-08. Nothing outside the slice's
files changed. Traps covered: R01.1, R01.4, R01.5, R01.14. Acceptance: ACC-C8-1, ACC-C8-2.
