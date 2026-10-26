# Task: adaptive cadence (P01-16) · Phase: 01 · Owner: builder (wt-p01b4b)

<!-- Save as platewise/docs/notes/P<nn>/<slug>.md. Write everything above "Compare checklist"
BEFORE writing code, in your own words. Never paste or paraphrase the reference line by line. -->

Read (reference @ `10e14b67`): `A/FudAIApp.kt` lines 640–800 (the shared evidence helper, the
weekly refresh with its in-flight guard, switch checks before and after the call, failure
marking, the stale-profile drop, the one-time snapshot and the due rule), `I/calorietrackerApp.swift`
lines 476–560 (the same run on scene activation), `T/ui/settings/ManualRecalculationPolicyTest.kt`
(a successful manual rebuild marks today only when the tune-up is on). Also, from the P01-15
reading, `A/ui/settings/SettingsViewModel.kt` lines 1340–1670 (switching the tune-up on and off,
the manual rebuild marking the check day). Research spec `01-profile-goals.md` §3.10, §6 R01.1,
R01.4, R01.5, R01.14; decision D-16.45. No Evidence ids.

What it does (own words): the weekly tune-up re-runs the person's AI plan at most once every seven
days when the app opens or comes back to the front. This module is the pure decision part; the
runner (P05-09) does the reading, the AI call and the writing. It answers four questions. Is a
check due (never checked, or an unreadable day, or seven calendar days or more since the last
one)? What does a trigger do (open and visible run when on, ready, idle and due; enable runs
even when not due; a finished manual rebuild marks today when on; finishing onboarding marks
today)? Once the reply is in, what happens (switch turned off or another input switch changed
meanwhile: give up silently; failure: keep the plan and mark today so a broken key is not hit on
every open; success while the profile changed in any field: drop it; success: keep the plan from
before the first tune-up change if none is kept yet, apply all four targets with every lock
cleared, mark today)? And what do the switch actions do (on: clear locks, then a forced run; off:
put the kept plan back and forget it)? The reference's unused deterministic corrector is not
built (D-16.45, R01.1).

Inputs → outputs:
- `isDue(lastCheckDay: unknown, today)` → boolean; `TUNE_UP_EVERY_DAYS` = 7.
- `TuneUpState {on, lastCheckDay, savedPlan}` mirrors `tuneUp.on`, `tuneUp.lastCheckDay` and
  `tuneUp.savedPlan` (17 §1.3).
- `plan(state, trigger, {today, ready, running})` with trigger `open | visible | enable |
  manualRebuildDone | onboardingDone` → `{kind: 'run', forced}` | `{kind: 'skip', reason}` |
  `{kind: 'markChecked', state}`.
- `turnOn(state, profile, context)` → `{state, profile (locks cleared, or null when nothing to
  write), decision}`; `turnOff(state, profile)` → `{state, profile (restored, or null)}`.
- `stillWanted(start, now)` → boolean, for the check between the evidence pack and the call.
- `settle(start, now, reply, today)` with `reply = {ok: true, targets} | {ok: false}` →
  `abandoned` | `failed {state}` | `dropped` | `applied {state, profile}`.

Files: created `src/domain/adaptive/cadence.ts`, `src/domain/adaptive/cadence.test.ts`, this note.

Edge cases / failure modes:
- Due rule: no day, `''`, `'2026-13-01'`, a number → due; 6 days → not due; 7 and 30 → due; a
  stored day after today (the clock went back) → not due until that day + 7, as the reference.
- Forced run (enable) ignores the due rule but not off, not ready or a run in flight.
- Single flight: any trigger that would run while a run is in flight is skipped (R01.5).
- Failure after the switch went off, or after another input switch changed: nothing marked.
- Success after the switch went off: nothing applied and nothing marked; success after a profile
  edit (weight, allergens, a target, a lock, anything): nothing applied, nothing marked, so the
  next open retries.
- Snapshot taken once: a second success keeps the first kept plan; a person whose plan was all
  automatic (`saved` = `{}`) gets `{}` kept, which restores to "all automatic" (`null` means
  "nothing kept").
- Off with nothing kept leaves the profile alone; locks are not part of the kept plan.
- Applying and turning on clear `caloriesLocked` and `lockedMacros`.

Our design differences / decisions:
- Our names (`plan`, `settle`, `turnOn`, `turnOff`, `stillWanted`, `savedPlan`); our profile
  has no legacy balance macro, so the kept plan is the four saved targets only.
- The single-flight flag and "onboarding done and a profile exists" are inputs of `plan`
  (`running`, `ready`), so the whole decision is testable here; the runner owns the flag.
- Input switches are a generic name → boolean map: in v1 there are none (Energy Burn and a
  health store are later phases), so the map is empty and the rule is ready for them.
- The default "on when never set" is the settings schema's default (P02-04), not a function here.
- Messages and dialogs (changed, unchanged, provider unreachable) are the runner's and the UI's.

Tests we will write (table-driven where possible):
- `isDue`: never checked → due; unreadable → due; 6 days → not due; 7 → due; a future day → not
  due; across a DST change (calendar days, New York).
- `plan`: open and visible run when due; skip when off, not ready, not due, running; enable forced
  runs when not due; manual rebuild marks today when on, skips when off; onboarding marks today.
- Settlement: failure while on → marked (R01.5); failure after switching off → not marked
  (R01.5); failure after an input switch changed → not marked; success after switching off →
  abandoned; profile edit during the call → dropped for each kind of field (R01.4); success
  applies all four targets, clears locks and marks today; first success keeps the old plan, a
  second keeps the first snapshot (R01.14); kept `{}` for an automatic plan.
- Switches: disable restores the kept plan and deletes it, keeps locks as they are (R01.14);
  disable with nothing kept leaves the profile; enable clears locks and forces a run.
- `stillWanted`: off or a changed switch → false.
- Three visible events while running give one run (R01.5).

Compare checklist (filled after the rewrite; reopened `A/FudAIApp.kt` lines 640–800,
`I/calorietrackerApp.swift` lines 476–560, `T/ui/settings/ManualRecalculationPolicyTest.kt`,
`A/ui/settings/SettingsViewModel.kt` lines 1388–1430 and 1570–1580):
- [x] Due rule: missing or unparseable → due; last + 7 ≤ today → due
  (`src/domain/adaptive/cadence.test.ts > isDue > %s → due %s`, rows "never checked", "not a
  calendar day", "checked 6 days ago", "checked 7 days ago", "a check day after today", the two
  DST rows).
- [x] Guards before a run, in-flight first for forced runs too (`cadence.test.ts > plan > %s`, rows
  "open while a run is in flight skips", "forced enable still skips while a run is in flight",
  "open while off skips", "open before onboarding is done skips"; `plan > runs once for three
  visible events in a row (R01.5)`; `turnOn > does not start a second run while one is in flight
  (R01.5)`).
- [x] Switch or "still on" check between the evidence and the call ends silently
  (`cadence.test.ts > stillWanted > is false once the switch is off or an input switch changed`).
- [x] Failure marks today only while on with unchanged switches, whatever the profile did
  (`cadence.test.ts > settle > marks today on a failure while still on, and keeps the plan
  (R01.5)`, `> marks nothing on a failure after the switch was turned off (R01.5)`, `> marks
  nothing on a failure after an input switch changed (R01.5)`, `> marks today on a failure even
  when the profile changed meanwhile`).
- [x] Success dropped (and not marked) when the profile changed, the profile is gone, the switch
  went off or a switch changed (`cadence.test.ts > settle > drops a success when %s changed during
  the call (R01.4)`, `> drops a success when the profile is gone (R01.4)`, `> applies and marks
  nothing on a success after the switch was turned off (R01.4)`, `> applies and marks nothing on a
  success after an input switch changed (R01.4)`).
- [x] Success: snapshot only if none, all four targets, locks cleared, today marked
  (`cadence.test.ts > settle > applies all four targets, clears every lock and marks today`, `>
  keeps the first plan on the first success and the same snapshot on the second (R01.14)`).
- [x] Off restores the snapshot when one exists, then deletes it; on clears locks (only when any
  are set) and forces a run (`cadence.test.ts > turnOff > restores the kept plan and deletes it
  (R01.14)`, `> restores the plan from before the first tune-up after two runs (R01.14)`, `> writes
  no profile when nothing is kept`; `turnOn > clears every lock and forces a run even when not
  due`, `> writes no profile when nothing is locked`).
- [x] Manual rebuild marks today only when on (`cadence.test.ts > plan > marks today after a manual
  rebuild while on, so the same tap is not followed by a tune-up (R01.5)`, and the row "a manual
  rebuild while off marks nothing").
- [x] Onboarding completion sets today (`cadence.test.ts > plan > sets the check day to today when
  onboarding completes (R01.5)`).
- Deliberate differences: the kept plan is the four saved targets only (no legacy balance macro in
  our profile); `{}` is kept for an all-automatic plan so "nothing kept" (`null`) and "all
  automatic" stay apart; switches are a generic map (empty in v1); readiness and the in-flight
  flag are inputs so the decision is testable in one place.
- Not taken: the deterministic weekly corrector (D-16.45, R01.1); messages and dialogs (runner and
  UI, P05-09); the measured-energy anchor and health switches (later phase); the hosted-quota
  flag.

## Decisions for the lead

- `applied` returns the next tune-up state and the next profile together: P05-09 should write both
  in one transaction (the reference writes the check day, then the snapshot, then the profile).
- A stored check day after today (clock moved back) is "not due" until that day + 7, as in the
  reference. Not changed; a later hardening task could treat a future day as due.
- The default "on when never set" belongs to the settings schema (P02-04); `plan` takes the
  decoded boolean. `tuneUp.savedPlan` decoding (a `SavedTargets` or `null`) is P02-04's too.
- `RunReply` takes an already validated plan (P01-14 runs inside the AI layer); `settle` copies
  the four numbers as given.
- Extra exports beyond the row: `TUNE_UP_EVERY_DAYS`, `TuneUpState`, `TuneUpTrigger`
  (adds `onboardingDone`), `TuneUpContext`, `SkipReason`, `TuneUpDecision`, `turnOn` /
  `TurnOnResult`, `turnOff` / `TurnOffResult`, `InputSwitches`, `RunStart`, `RunNow`,
  `stillWanted`, `RunReply`, `Settlement`, `settle`.

## Status

Done (2026-10-26). `cadence.ts` with 56 tests, all passing. Nothing outside
`src/domain/adaptive/**` changed; it imports `sameProfile` from `src/domain/profile/profile.ts`
(same slice). Traps exercised: R01.4 (owned by P05-08), R01.5 and R01.14 (owned by P05-09).
