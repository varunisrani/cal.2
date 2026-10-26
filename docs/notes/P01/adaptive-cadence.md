# Task: adaptive cadence (P01-16) · Phase: 01 · Owner: builder (wt-p01b4)

<!-- Save as platewise/docs/notes/P<nn>/<slug>.md. Write everything above "Compare checklist"
BEFORE writing code, in your own words. Never paste or paraphrase the reference line by line. -->

Read (reference @ `10e14b67`): `A/FudAIApp.kt` lines 640–800 (the weekly refresh and its due
rule), `I/calorietrackerApp.swift` lines 476–560 (the same on the other platform),
`I/Models/UserProfile.swift` (the tune-up settings: on by default, the saved plan, the due rule,
mark today), `A/ui/settings/SettingsViewModel.kt` lines 1388–1430 (switching it on and off) and
`adaptiveCheckDayAfterManualRecalculation`, `T/ui/settings/ManualRecalculationPolicyTest.kt`;
research spec `01-profile-goals.md` §3.6 (applying a result), §3.10 and §6 R01.1, R01.4, R01.5,
R01.14; decision D-16.45. Traps ledger rows R01.4, R01.5, R01.14 (owned by P05-08/P05-09; the
decision rules are here). No Evidence ids.

What it does (own words): the weekly tune-up re-runs the AI plan at most once every 7 calendar days.
This module is the pure decision part; the runner (P05-09) does the storage and the AI call. It
answers: is a run due (never checked, or a stored day that does not parse, or today at least 7
days after the last check); what to do for a trigger (app open or the page becoming visible: run
when on and due, else skip; switching on: clear locks and run regardless of the due rule; a
successful manual rebuild: mark today when on; onboarding finished: mark today); whether a run
should still go ahead just before the AI call (still on, switches unchanged); and what to do with
the outcome: on failure keep the goals and mark today, but only when still on and the switches are
unchanged (a broken key is not hit on every open, R01.5); on success drop the result when the
switch went off, a switch changed, or any profile field changed meanwhile (R01.4); otherwise save
the current saved targets as the pre-tune-up plan only if no such plan is stored yet, apply the new
plan with every lock cleared, and mark today (R01.14). Switching off restores the stored plan onto
the profile and deletes it. The reference's unused deterministic weekly corrector is not built
(D-16.45).

Inputs → outputs:
- `TUNE_UP_EVERY_DAYS` 7; `readTuneUpOn(stored)` → boolean (absent reads on); `isDue(lastCheck,
  today)` → boolean.
- `decide({ on, lastCheckDay, today }, trigger)` with trigger `'open' | 'visible' | 'enable' |
  'manualRebuildDone' | 'onboardingDone'` → `{ kind: 'run', forced, clearLocks }` |
  `{ kind: 'skip', why: 'off' | 'notDue' }` | `{ kind: 'markChecked', day }`.
- `stillWanted(start, now)` → boolean, where `start = { today, profile, switches }` and `now = { on,
  profile, switches, savedPlan }`.
- `settle(start, now, outcome)` with outcome `{ kind: 'failed' }` | `{ kind: 'planned', plan }` →
  `{ kind: 'abort' }` | `{ kind: 'markChecked', day }` | `{ kind: 'drop' }` |
  `{ kind: 'apply', profile, savedPlan, lastCheckDay }`.
- `turnOn(profile)` → profile with locks cleared; `turnOff(profile, savedPlan)` → `{ profile,
  savedPlan: undefined }` with the saved targets restored when a plan was stored.

Files: created `src/domain/adaptive/cadence.ts`, `cadence.test.ts`, this note. Uses `daysBetween`
and `isDayKey` from `src/domain/dates/dayKey.ts`, `applyPlan`/`clearLocks` from
`goals/locks.ts`, `sameProfile` from `profile/profile.ts`.

Edge cases / failure modes:
- Last check 6 days ago → not due; 7 → due; a last check in the future (clock moved back) → not
  due; garbage or a non-string → due.
- A forced run (switching on) ignores the due rule.
- Failure after the switch went off, or after a switch changed → nothing marked.
- Failure while a profile edit happened → still marked (the failure is about the provider).
- Success with a profile edit, a lock or target edit, or a deleted profile → dropped, nothing
  marked (the next open can run again).
- First success stores the pre-tune-up plan; later successes keep that first plan.
- Switching off without a stored plan leaves the profile as it is; locks are not part of the stored
  plan.
- The day marked is the day the run started (`start.today`), so a run that crosses midnight marks
  the day it was decided on.
- Single-flight (overlapping runs) is the runner's job (P05-09); this module holds no state.

Our design differences / decisions:
- Our names (`decide`, `settle`, `stillWanted`, `turnOn`, `turnOff`, outcome kinds); stored keys
  are P02's (`tuneUp.on`, `tuneUp.lastCheckDay`, `tuneUp.savedPlan`).
- Switches are a plain record of booleans so later phases (measured energy) can add theirs without
  changing the rules; v1 passes an empty record.
- No deterministic corrector (D-16.45); no legacy balance macro in the stored plan (not in our
  model).

Tests we will write (table-driven): never checked → due; checked 6 days ago → not due; 7 → due;
unparseable → due; future → not due; forced enable runs when not due and clears locks; off → skip;
manual rebuild marks today only when on; onboarding marks today; failure while on → marked;
failure after switching off → not marked; failure after a switch change → not marked; profile
edit during the call → dropped; first success saves the old plan, second success keeps the first
snapshot; apply clears locks; disable restores the stored plan and deletes it; disable with nothing
stored changes nothing; day keys checked in Asia/Tokyo too.

Compare checklist (filled after the rewrite; reopened `A/FudAIApp.kt` lines 714–800,
`I/calorietrackerApp.swift` lines 476–560, `I/Models/UserProfile.swift` lines 598–688,
`A/ui/settings/SettingsViewModel.kt` lines 158–161 and 1388–1430,
`T/ui/settings/ManualRecalculationPolicyTest.kt`):
- [x] Due rule: absent or unparseable → due; today ≥ last + 7 (tested in
  `src/domain/adaptive/cadence.test.ts > isDue > never checked → due`, `> an unparseable day →
  due`, `> an impossible day → due`, `> a number instead of a day → due`, `> checked today → not
  due`, `> checked 6 days ago → not due`, `> checked 7 days ago → due`, `> checked 30 days ago →
  due`, `> a check day in the future → not due`, `> counts calendar days across a DST change and in
  Asia/Tokyo`).
- [x] Off → skip; due unless forced; switching on clears locks and forces a run (`decide > open,
  never checked`, `> visible, 7 days on`, `> open, 6 days on`, `> open while off`, `> visible while
  off`, `> enable when not due (forced)`, `turnOn and turnOff > clears every lock when switching
  on`); absent setting reads on (`readTuneUpOn > reads an absent or unreadable setting as on`).
- [x] Check before the call: off or a switch changed → abort (`stillWanted > goes on only while the
  tune-up is on and no switch changed`).
- [x] Failure marks today only while on and unchanged (`settle > marks today checked after a
  failure while still on (R01.5)`, `> marks a failure checked even when the profile changed
  meanwhile`, `> does not mark a failure after switching off, or after a switch changed`).
- [x] Success dropped on any profile change, a missing profile, switching off (`settle > drops a
  result when the profile was edited during the call (R01.4)`, `> drops a result that comes back
  after switching off`).
- [x] Success: snapshot only if none, apply with locks cleared, mark today (`settle > applies a plan
  with all locks cleared, saves the old plan on the first success and marks today`, `> keeps the
  first snapshot on a second success (R01.14)`, `> marks the day the run started, not a later
  one`).
- [x] Switching off restores and deletes (`turnOn and turnOff > restores the stored plan when
  switching off and deletes it (R01.14)`, `> changes nothing when switching off with no stored plan`,
  `> gives back the original plan after two tune-ups and a switch-off`).
- [x] Manual rebuild marks today only when on; onboarding marks today (`decide > manual rebuild
  while on`, `> manual rebuild while off`, `> onboarding done`, `> onboarding done with the plan
  edited (off)`).
- Deliberate differences: no deterministic corrector (D-16.45); the marked day is the day the run
  started on both outcomes (one platform marked the end day on success); switches are a named record
  of booleans; no legacy balance macro in the stored plan.
- Not taken: single-flight guard, the "no profile" skip, the outcome messages and the forced-run
  dialog (runner and UI, P05-09); the measured-energy anchor (later phase).

## Decisions for the lead

- The reducer marks `start.today` (the day the run was decided on) for both failure and success.
- `decide('onboardingDone')` marks today whether the tune-up is on or off (completion always sets
  the check day, 01 §3.4).
- `settle` returns `abort` (switched off or a switch changed) and `drop` (profile changed) as two
  kinds so the runner can log them apart; both change nothing.
- `turnOff` returns `{ profile, savedPlan: undefined }`: the caller writes the profile and deletes
  `tuneUp.savedPlan`.

## Status

Done (2026-10-26). `cadence.ts` (34 tests, table-driven); nothing outside the slice's files changed.
Traps with tests here: R01.5, R01.4, R01.14 (decision rules; the rows are owned by P05-08/P05-09,
which add the runner tests), R01.1 (no corrector built, D-16.45).
