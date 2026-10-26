# Task: effective targets, locks and plan editing (P01-13) · Phase: 01 · Owner: builder (wt-p01b4a)

<!-- Save as platewise/docs/notes/P<nn>/<slug>.md. Write everything above "Compare checklist"
BEFORE writing code, in your own words. Never paste or paraphrase the reference line by line. -->

Read (reference @ `10e14b67`): `A/models/UserProfile.kt` (effective values, auto-balance, the lock
and rebalance functions), `A/models/AutoBalanceMacro.kt` (all), `I/Models/UserProfile.swift` (the
same functions, to confirm both platforms agree), `I/ContentView.swift` (only `lockableGoalRow`
and the save/reset handlers right below it). Research spec `01-profile-goals.md` §3.4 (Plan ready
editing) and §3.7; decision D-16.12; traps ledger R01.7, R01.13. No Evidence ids.

What it does (own words): three layers over the four saved numbers on the profile.
1. **Effective targets** (`targets.ts`): what Home tracks against. Saved kcal wins, else the
   formula kcal. A macro with a saved value is pinned and keeps it; the energy left after the
   pinned macros (never below 0) goes to the free macros: all of it to a single free macro, or
   split in proportion to the free macros' formula kcal (whole-number division at every step),
   with the formula grams as a fallback when those weights sum to 0.
2. **Locks** (`locks.ts`, Settings only): a kcal lock and up to two macro locks. Every edit first
   freezes the four effective values into saved values, computing all of them from the state
   before the edit (R01.13), so after any edit everything is pinned. Setting kcal keeps locked
   macros and spreads the rest over the free ones, then locks kcal. Setting a macro with kcal
   locked takes energy only from the other unlocked macros (none → refused, nothing changes);
   with kcal unlocked the macro takes the value and kcal becomes the macro sum. The edited macro
   is locked afterwards unless two are locked already. Spreading (`distribute`) weights macros by
   their current kcal (or the formula kcal, at least 1, when current is 0), rounds each one but
   the last in the order protein, carbs, fat, and gives the last whatever is left. Two resets
   release a lock and re-derive the value; `clearLocks` drops every lock.
3. **Plan Ready editing** (`planEdit.ts`): the wizard's last step. Wheels: kcal 800–6 000 step 50,
   protein 10–500, carbs 0–800, fat 10–300, step 5 (D-16.12). Changing kcal, protein or fat
   re-derives carbs from the energy left; changing carbs re-derives kcal; the carbs wheel stops
   where kcal would pass 6 000. Any change marks the plan as touched (R01.7), which later turns the
   weekly tune-up off.

Inputs → outputs:
- `effectiveTargets(saved, formula)` → `Targets`; `macroKcal(targets)` → 4P + 4C + 9F.
- `setKcal(s, formula, kcal)`, `resetKcal(s, formula)`, `resetMacro(s, formula, macro)`,
  `clearLocks(s)` → the same record with `saved`, `caloriesLocked`, `lockedMacros` replaced;
  `setMacro(s, formula, macro, grams)` → the record, or `null` when refused. `s` is any record
  with those three fields (a whole `Profile` works); `formula` is `formulaPlan(profile, today)`.
- `distribute(kcal, macros, current, formula)` → grams per listed macro.
- `PLAN_WHEELS`, `carbsWheel(plan)`, `wheelStart(range, value)`, `editPlan(draft, field, value)`
  → `{plan, touched}`.

Files: created `src/domain/goals/targets.ts`, `targets.test.ts`, `locks.ts`, `locks.test.ts`,
`planEdit.ts`, `planEdit.test.ts`, this note.

Edge cases / failure modes:
- Default profile, saved 2 000 kcal and protein 150 → carbs 283, fat 29 (7 kcal lost to
  truncation, kept on purpose).
- Freezing from saved {kcal 1 500} gives carbs 248; freezing one macro at a time would give 249
  (R01.13).
- Plan locked at 2 452 kcal, protein → 150 → carbs 376, fat 39, kcal still 2 452.
- kcal locked with both other macros locked: a macro edit is refused, the record is unchanged.
- A third macro lock is never added; the edit itself still applies.
- With kcal locked, a macro asking for more than the energy available gets only what fits.
- Setting kcal below the locked macros' energy gives the free macros 0 (the target stays as set).
- Negative or fractional inputs: kcal and grams are made whole and at least 0 (non-finite → 0).
- Plan Ready: kcal 2 000, P 150, F 60 → carbs 215; carbs 300 → kcal 2 340; with P 150 and F 60
  the carbs wheel tops out at 1 210 → capped at 800; with P 500 and F 300 at 325; protein and
  fat beyond the energy give carbs 0; picking the same value does not mark the plan touched.

Our design differences / decisions:
- Names are ours (17 §1.6: `setKcal`, `setMacro`, `resetKcal`, `resetMacro`).
- The lock functions return a new record instead of mutating, generic over the three fields so a
  whole `Profile` goes in and comes out.
- Setting kcal and setting a macro lock the value inside the domain call (the reference does it
  in the screen code), so the Settings page cannot forget it.
- A refused macro edit returns `null`; there is only one reason (nothing can absorb it).
- Plan Ready couples fields the way the spec's iOS column does, with the Android ranges
  (D-16.12). Values are clamped into the field's range but never snapped, so an untouched kJ
  wheel's exact kcal survives (R06.20). The draft carries a `touched` flag (R01.7).

Tests we will write:
- `targets.test.ts`: nothing saved → formula plan; saved 2 000 + protein 150 → 283 / 29
  (ACC-C2-1); one free macro takes the rest by division; all pinned → saved values; a zero
  weight sum falls back to the formula grams; pinned energy above kcal leaves 0.
- `locks.test.ts`: freeze snapshot (R01.13); plan locked at 2 452 then protein 150 → 376 / 39;
  refusal with nothing to absorb (R01.13); third lock not added (R01.13, ACC-C6-2); kcal
  unlocked → kcal floats; a macro capped by the available energy; setKcal with locked macros;
  `distribute` weights, zero-weight fallback and last-macro remainder; resets; `clearLocks`.
- `planEdit.test.ts`: wheels per D-16.12; Plan Ready coupling (R01.7); carbs cap; touched flag;
  `wheelStart` snapping and clamping.

Compare checklist (filled after the rewrite; reopened `A/models/UserProfile.kt`,
`A/models/AutoBalanceMacro.kt`, `I/Models/UserProfile.swift`, `I/ContentView.swift`
(`lockableGoalRow` and its handlers)):
- [x] Effective kcal = saved else formula; pinned keep grams; one free macro gets the rest by
  division; several split by formula energy with integer division; zero weight → formula grams
  (`src/domain/goals/targets.test.ts > effectiveTargets > auto-balances carbs 283 g and fat 29 g
  for saved 2 000 kcal and 150 g protein (ACC-C2-1)`, `> gives a single free macro all the energy
  left, by integer division`, `> splits a saved kcal over three free macros by their formula
  energy`, `> falls back to the formula grams when the free macros have no formula energy`,
  `> leaves 0 for free macros when pinned macros already pass the kcal target`).
- [x] Every edit freezes all four values from the state before it (R01.13) (`locks.test.ts >
  setMacro > pins all three macros from the state before the edit (R01.13)`, `resetKcal > pins
  every value even when nothing was saved`).
- [x] Setting kcal: locked macros kept, the free ones share the rest, kcal then locked (the iOS
  screen handler locks it) (`locks.test.ts > setKcal > spreads a new kcal over free macros by
  their current energy and locks kcal`, `> keeps locked macros and gives the free ones what is
  left`, `> gives free macros 0 when the locked ones already pass the new kcal`).
- [x] Setting a macro with kcal locked: other unlocked macros absorb, none → refused with no
  change, the macro capped by the room left (`locks.test.ts > setMacro > keeps a locked 2 452 kcal
  plan at 2 452 when protein goes to 150: carbs 376, fat 39`, `> refuses an edit nothing can
  absorb and changes nothing (R01.13)`, `> takes energy only from unlocked macros when kcal is
  locked`, `> caps the macro at the energy the other locked macros leave`).
- [x] Setting a macro with kcal unlocked: kcal floats to the macro sum (`locks.test.ts > setMacro >
  lets kcal follow the macro sum when kcal is not locked`).
- [x] The edited macro is locked unless two already are (`locks.test.ts > setMacro > does not add a
  third macro lock, while the edit still applies (R01.13, ACC-C6-2)`, `> keeps an already locked
  macro locked without adding it twice`).
- [x] `distribute`: current-energy weights, formula fallback (at least 1), rounded shares, the
  last macro takes the rest, never below 0 (`locks.test.ts > distribute > weights by current
  energy and lets the last macro take what is left`, `> weights a macro at 0 by its formula
  energy`, `> gives equal weight to macros with no current or formula energy`, `> gives every
  macro 0 for a target at or below 0`, `> rounds each share rather than cutting it (R01.9)`).
- [x] Resets and clearing (`locks.test.ts > resetKcal > unlocks kcal and sets it to the macro
  energy`, `resetMacro > unlocks the macro and gives it the energy the other two leave`, `> gives 0
  when the other macros already pass the kcal target`, `> divides the remaining energy as a whole
  number`, `clearLocks > drops every lock and keeps the saved values`).
- [x] Plan Ready coupling with the D-16.12 wheels, the carbs cap and the touched mark (R01.7)
  (`planEdit.test.ts > PLAN_WHEELS > uses the Settings ranges: kcal 800–6 000 in 50s, grams in 5s
  (D-16.12)`, `editPlan > re-derives carbs after kcal, protein or fat: 2 000 / 150 / 60 → carbs
  215 (R01.7)`, `> re-derives kcal after carbs: carbs 300 → 2 340 kcal (R01.7)`, `> marks the plan
  touched only when a value changes (R01.7)`, `> never lets a carbs edit push kcal past 6 000`,
  `carbsWheel > tops out where kcal would reach 6 000, on the step grid, and at most 800`).
- Deliberate differences: the lock functions return copies (no mutation) and lock the edited
  value themselves; typed values are made whole and at least 0 (non-finite → 0); a refused edit is
  `null`; the unreachable "no weights" branch of the spreading step is not written (every weight
  is at least 1). Plan Ready uses the spec's iOS coupling with the Android ranges and adds the
  carbs-wheel cap and a `touched` flag that is set only when a value changes.
- Not taken: a "toggle macro lock" action (the glyph is a read-only indicator in the reference's
  newer Settings; saving locks, reset unlocks); the legacy balance-macro field; the read-only rows
  while the tune-up is on and the refusal alert (P05-11).

## Decisions for the lead

- `setKcal` and `setMacro` set the locks inside the domain call (the reference sets them in screen
  code); Settings only calls them.
- `editPlan` marks the draft touched only when the edit changed a value: opening a wheel and saving
  it unmoved does not turn the tune-up off. Easy to flip if the lead prefers "any save".
- Plan Ready keeps the row's rule literally when protein and fat alone pass kcal: carbs stay 0 and
  the macros then hold more energy than the kcal figure. The wheels do not stop protein or fat at
  that point. A follow-up for P05-06 could show it or cap those wheels too.
- `editPlan` clamps a picked value into the field's range and rounds it to a whole number, but
  never snaps it, so the exact kcal from an untouched kJ wheel survives.
- Extra exports: `macroKcal`, `distribute`, `TargetLocks`, `PlanDraft`, `PlanField`,
  `PLAN_MAX_KCAL`, `carbsWheel`, `wheelStart`. `PLAN_WHEELS` is meant for the Settings pickers
  too (P05-11), which use the same ranges.

## Status

Done (2026-10-26). Effective targets, the lock engine and Plan Ready editing are in place with
their tests (targets 9, locks 24, planEdit 10), all passing. Nothing outside `src/domain/goals/**`
and this note changed. Traps covered: R01.7, R01.13.
