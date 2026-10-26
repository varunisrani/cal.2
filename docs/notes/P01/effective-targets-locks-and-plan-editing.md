# Task: effective targets, locks and plan editing (P01-13) · Phase: 01 · Owner: builder (wt-p01b4)

<!-- Save as platewise/docs/notes/P<nn>/<slug>.md. Write everything above "Compare checklist"
BEFORE writing code, in your own words. Never paste or paraphrase the reference line by line. -->

Read (reference @ `10e14b67`): `A/models/UserProfile.kt` (pinned/auto values, the lock members,
materialise, distribute, the calorie and macro edits, the two resets), `A/models/AutoBalanceMacro.kt`,
`I/Models/UserProfile.swift` (the same part), `I/ContentView.swift` (`lockableGoalRow` and the
setCalories / setMacro / reset helpers next to it, the Settings picker ranges),
`A/ui/settings/SettingsViewModel.kt` (the calorie and macro edit actions that lock what was set),
`I/Views/OnboardingView.swift` lines 1400–1540 (Plan Ready coupling); research spec
`01-profile-goals.md` §3.4 (Plan ready editing), §3.7 and §6 R01.7, R01.9, R01.13; decision D-16.12.
Traps ledger rows R01.7, R01.13; acceptance ACC-C2-1, ACC-C6-2. No Evidence ids.

What it does (own words): the profile stores up to four saved numbers. `targets.ts` turns them into
the four values the app tracks against: kcal is the saved value or the formula value; a macro with
a saved value keeps it; the macros without one share what kcal is left after the saved ones, in
proportion to their formula energy, by whole-number division (one leftover macro takes it all). The
lock layer (`locks.ts`) is how Settings edits: before any edit it writes all four current values
into the saved slots (computed together, so writing one cannot move another), then: setting kcal
keeps locked macros and spreads the rest over the free ones, then locks kcal; setting a macro with
kcal locked keeps the total and lets the other free macros absorb the change (none free → refused,
nothing changes); with kcal free the macro takes the new value and kcal becomes the macro sum; the
edited macro then becomes locked unless two already are. Spreading weights each macro by its
current energy (or by its formula energy, at least 1, when it is 0); every macro but the last of
protein, carbs, fat is rounded; the last takes what is left. Plan Ready during onboarding
(`planEdit.ts`) is simpler: changing kcal, protein or fat re-derives carbs; changing carbs
re-derives kcal; the wheels use the Settings ranges everywhere (D-16.12).

Inputs → outputs:
- `targets.ts`: `autoBalance(saved, formula)` → `Targets`; `effectiveTargets(profile, today)`;
  `isPinned(saved, macro)`.
- `locks.ts`: `materialise(profile, today)`; `setKcal(profile, kcal, today)` → `Profile`;
  `setMacro(profile, macro, grams, today)` → `Result<Profile, 'nothingToAbsorb'>`;
  `resetKcal(profile, today)`; `resetMacro(profile, macro, today)`; `toggleKcalLock(profile)`;
  `toggleMacroLock(profile, macro)` (a third lock is not added: the same profile comes back);
  `clearLocks(profile)`; `applyPlan(profile, plan)` (all four saved, every lock cleared: used by the
  rebuild and the weekly tune-up); `distribute(kcal, macros, current, formula)` → grams per macro.
- `planEdit.ts`: `MACRO_WHEELS` (protein 10–500, carbs 0–800, fat 10–300, step 5) and
  `PLAN_WHEELS` (plus kcal 800–6 000 step 50, the same row as the kcal goal wheel of P01-03);
  `wheelStart(value, wheel)`; `carbsCeiling(plan)`; `editPlan(plan, field, value)` → `Targets`.

Files: created `src/domain/goals/targets.ts`, `targets.test.ts`, `locks.ts`, `locks.test.ts`,
`planEdit.ts`, `planEdit.test.ts`, this note. Uses `formulas.ts` (P01-12), `Result` from
`src/lib/result.ts`, `ENERGY_GOAL_WHEEL` and `StepRange` from `src/domain/units`.

Edge cases / failure modes:
- Saved macro energy above the kcal target: what is left is 0, so auto macros get 0 (never
  negative).
- Several auto macros whose formula energy sums to 0: each falls back to its formula grams.
- Materialise-first (R01.13): with kcal saved and all three macros auto, writing protein first
  would change how carbs and fat split; all three are taken from one balanced snapshot.
- A macro edit with kcal locked and both other macros locked is refused; the profile is returned
  unchanged (same values, same locks).
- A third macro lock is never added: toggling or editing a third macro leaves it free.
- Requested grams below 0 count as 0; kcal below 0 counts as 0. A macro asked for more energy than
  is available (kcal locked) takes what is available.
- `distribute` with nothing left gives 0 g to every macro; grams never go below 0.
- Reset kcal: unlock and set kcal to the macro sum. Reset macro M: unlock M and set it to what kcal
  leaves after the other two, cut to whole grams (0 when they already exceed kcal).
- Plan Ready: carbs never below 0; the carbs wheel stops where kcal would pass 6 000; values outside
  a field's range are brought inside it; values are whole numbers; kcal from the kJ wheel can sit
  between 50-kcal rows (it is not snapped).

Our design differences / decisions:
- Names from the glossary (`setKcal`, `setMacro`, `resetKcal`, `resetMacro`); `applyPlan` and
  `distribute` are ours. Profiles are immutable values: every function returns a new profile.
- Locking what was set (kcal after `setKcal`, the macro after `setMacro`) lives in the engine
  instead of the screen, so Settings and any other caller behave the same.
- A refused macro edit is a `Result` error, not a null.
- Plan Ready uses the coupling from one platform with the ranges of the other (D-16.12, R01.7):
  kcal 800–6 000 step 50, macros step 5. Marking the plan as edited is wizard state (P05-01/06).
- The legacy "balance macro" field does not exist in our model, so nothing clears it.

Tests we will write:
- Default profile with saved 2 000 kcal and protein 150 → carbs 283, fat 29 (ACC-C2-1); one auto
  macro takes all that is left; saved macros above kcal leave 0; zero formula energy falls back.
- Materialise snapshots all three before writing (R01.13).
- Default plan locked at 2 452 kcal, protein → 150 → carbs 376, fat 39, kcal stays 2 452, protein
  becomes locked.
- Kcal locked and both other macros locked → refused, nothing changes (R01.13).
- Third macro lock not added, by toggle and by edit (ACC-C6-2).
- Kcal free: macro edit makes kcal the macro sum.
- `setKcal` keeps locked macros, spreads the rest, locks kcal; the last macro absorbs rounding.
- `resetMacro`, `resetKcal`, `clearLocks`, `applyPlan`.
- Plan Ready: kcal 2 000, P 150, F 60 → carbs 215; carbs 300 → kcal 2 340; carbs wheel ceiling keeps
  kcal ≤ 6 000; carbs never negative; ranges per D-16.12.

Compare checklist (filled after the rewrite; reopened `A/models/UserProfile.kt` lines 130–330,
`I/Models/UserProfile.swift` lines 300–550, `A/models/AutoBalanceMacro.kt`,
`A/ui/settings/SettingsViewModel.kt` lines 1630–1660, `I/ContentView.swift` lines 6620–6660 and
7226–7305, `I/Views/OnboardingView.swift` lines 1400–1540):
- [x] Effective kcal = saved, else formula; pinned macros keep saved grams; remaining = max(0, kcal
  − pinned kcal); one auto macro takes remaining div kcal/g; several share by formula energy with
  integer division, falling back to formula grams when that sum is ≤ 0 (tested in
  `src/domain/goals/targets.test.ts > autoBalance > gives saved 2 000 kcal and 150 g protein carbs
  283 g and fat 29 g (ACC-C2-1)`, `> shares what is left by formula energy with integer division at
  each step (R01.9)`, `> gives a lone auto macro everything the pinned ones leave`, `> splits saved
  kcal over all three auto macros by their formula energy`, `> gives auto macros 0 when the pinned
  ones already pass the kcal target`, `> falls back to the formula grams when the auto macros have
  no formula energy`).
- [x] Materialise first, all three macros from one snapshot (`src/domain/goals/locks.test.ts >
  materialise > takes all three macros from one snapshot instead of writing them one by one
  (R01.13)`, `setMacro > materialises auto macros before the edit, so the untouched ones keep their
  values`).
- [x] `distribute`: current-energy weights, max(1, formula energy) fallback, all but the last
  rounded, the last takes the rest, grams ≥ 0 (`distribute > weights by current energy, rounds all
  but the last macro and gives the last the rest`, `> falls back to formula energy (at least 1) when
  a macro is at 0`, `> gives every macro 0 g when nothing or less than nothing is left`, `> gives a
  lone macro all of it, rounded`).
- [x] Kcal edit: locked macros kept, free ones share N − locked kcal, kcal then locked (the screen
  did the locking in the reference) (`setKcal > spreads a new total over free macros, the last one
  absorbing rounding, and locks kcal`, `> keeps locked macros and spreads the rest over the free
  ones`, `> counts kcal below 0 as 0 and leaves free macros at 0 g`, `> gives free macros 0 g when
  locked ones already use more than the new total`).
- [x] Macro edit with kcal locked: absorbers, refusal, min(g × k, available), the rest spread
  (`setMacro > locks the default plan at 2 452 kcal, sets protein to 150 → carbs 376, fat 39`,
  `> refuses a macro edit when kcal and both other macros are locked, and nothing changes (R01.13)`,
  `> lets the one free macro absorb the change when the other is locked`, `> gives the macro only
  what is available when it asks for more than kcal allows`).
- [x] Macro edit with kcal free: kcal floats to the sum; the macro is locked only under the
  two-lock cap (`setMacro > lets kcal float to the macro sum when kcal is not locked`, `> does not
  add a third macro lock when two are locked (ACC-C6-2)`, `> counts grams below 0 as 0`).
- [x] Resets and toggles (`resetKcal > unlocks kcal and sets it to the energy of the macros`,
  `resetMacro > resets a macro to auto: unlocked and set to what kcal leaves after the others`,
  `> gives 0 g when the other macros already pass kcal`, `lock toggles > does not add a third macro
  lock: the same profile comes back (ACC-C6-2)`, `> locks up to two macros in the order protein,
  carbs, fat and unlocks any of them`, `> locks and unlocks kcal`, `> clears every lock`,
  `applyPlan > saves all four targets and clears every lock`).
- [x] Settings picker ranges (`src/domain/goals/planEdit.test.ts > wheels > uses kcal 800–6 000 in
  steps of 50 and macros in steps of 5 everywhere (D-16.12)`, `> opens a wheel on the value snapped
  down onto a row, inside the wheel`).
- [x] Plan Ready coupling (`editPlan > re-derives carbs when kcal, protein or fat change: kcal 2 000,
  P 150, F 60 → carbs 215`, `> re-derives kcal when carbs change: carbs 300 → kcal 2 340`, `> keeps
  carbs at 0 when protein and fat already use all the kcal`, `> caps the carbs wheel so kcal never
  passes 6 000`, `> keeps a value inside its wheel and whole`, `> keeps a kcal value between rows (a
  kJ pick) as it is`, `> keeps 4P + 4C + 9F within 3 kcal of kcal after any edit (R01.7)`).
- Deliberate differences: Plan Ready uses one platform's coupling with the other's ranges
  (D-16.12; the reference coupling used 800–5 000 step 10 and narrower macro wheels, the other
  platform stored uncoupled overrides); locking after an edit lives in the engine; a refused edit is
  a `Result`; locks are kept in the order protein, carbs, fat; the unreachable "no weights" branch of
  the spreading routine is not written (weights are always at least 1).
- Not taken: the legacy balance macro (not in our model); read-only rows while the tune-up is on
  and the lock glyphs (UI, P05-11); marking the plan hand-edited (wizard state, P05-01/P05-06).

## Decisions for the lead

- `setKcal` and `setMacro` round a fractional input to whole kcal or grams (pickers give whole
  numbers; the kJ picker's `pickerSave` already rounds).
- `editPlan` keeps each value inside its wheel (kcal 800–6 000, protein 10–500, fat 10–300, carbs 0
  to the carbs ceiling) but does not snap to the step: an AI plan's 112 g protein or a kJ pick of
  2 008 kcal stays as it is until the person picks a row.
- `applyPlan` (all four saved, locks cleared) lives in `locks.ts`; P05-08 and the tune-up use it.

## Status

Done (2026-10-26). `targets.ts` (11 tests), `locks.ts` (27 tests), `planEdit.ts` (9 tests); nothing
outside the slice's files changed. Traps covered: R01.13, R01.7, R01.9. Acceptance: ACC-C2-1
(`src/domain/goals/targets.test.ts > autoBalance > gives saved 2 000 kcal and 150 g protein carbs
283 g and fat 29 g (ACC-C2-1)`), ACC-C6-2 (`src/domain/goals/locks.test.ts > setMacro > does not
add a third macro lock when two are locked (ACC-C6-2)` and `> lock toggles > does not add a third
macro lock: the same profile comes back (ACC-C6-2)`).
