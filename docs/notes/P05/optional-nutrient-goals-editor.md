# Task: Optional nutrient goals editor (P05-12) · Phase: 05 · Owner: builder (wt-p05s4b, slice S4b)

Read (reference @ `10e14b67`): `A/ui/settings/SettingsScreen.kt` (the nutrient goals sheet and
screen: the list of goals, each row's name, unit and value; the shared number picker with its
custom-amount mode, the digits-only seven-character filter, the opening rule, the invalid and
upper-limit lines and the vitamin D detail; the per-nutrient ranges, steps and upper limits);
`I/Models/OptionalNutrientGoals.swift` (ranges, kinds, upper limits, the IU detail, the stored
maximum) and the iOS picker sheet in `I/Views/ProfileComponents.swift` (same behaviour on iOS).
Behaviour only. Research spec `01-profile-goals.md` §3.11; Proposed D-16.57 (Android ranges and
steps, typed values unsnapped and clamped 0–999 999). The domain side (specs, clamping, text
filter, wheel test, IU) landed in P01-07 (`src/domain/nutrients/goalDefaults.ts`).

What it does (own words): a sheet opened from the Goals page lists the 29 optional goals in four
groups (sugars, fibre and fats; minerals; vitamins; caffeine and sports compounds). Each row names
the nutrient, says whether the goal is a daily limit or a daily target, and shows the value in
its unit (vitamin D also in IU). Tapping a row opens an editor sheet on top: a wheel with the
nutrient's P01-07 range and step, or a typing mode for any whole number (digits only, at most 7).
The editor opens in typing mode by itself when the stored value is not a wheel value. A typed
value is clamped to 0–999 999 when saved and never moved onto the wheel's grid. Above the
nutrient's general adult upper limit a non-blocking line advises caution; vitamin D shows its IU
equivalent (× 40) for the value on screen. Saving writes through `targetEdits.setNutrientGoal`.

Inputs → outputs: `useSettings(['goals.nutrients'])` → the list; the editor's Save →
`targetEdits.setNutrientGoal(key, value)` (one settings transaction, `withGoalValue`). Router
sheets `nutrient-goals` (the list) and `nutrient-goal` (the editor), so Back closes the editor
first.

Files: created `src/features/settings/goals/NutrientGoalsSheet.tsx`,
`NutrientGoalsSheet.test.tsx`, `NutrientGoalEditor.tsx`; words under `goals.nutrients` in
`src/i18n/en/goals.ts` (names of the 29 goals, group titles, kind words, unit amounts, editor
lines).

Edge cases / failure modes:
- A stored value with a fraction (7.3, kept by the decoder) opens in typing mode; an untouched
  editor saves nothing, so the exact value survives.
- An empty typing field cannot be saved (Save disabled, a line says what to type).
- A typed value above 999 999 (seven digits allow 9 999 999): a line says it will be saved as
  999 999; Save clamps (P01-07 `goalFromText`).
- Pasted text with letters or separators: only the digits stay, at most seven.
- Switching from typing to the wheel opens the wheel at the typed value snapped down and kept in
  range; switching from the wheel to typing starts the field with the wheel's value.
- A wheel saved at the stored value writes nothing.
- The settings row not loaded yet: the sheet shows nothing until it is.

Our design differences / decisions:
- Android's ranges and steps (Proposed D-16.57) from the domain's `GOAL_SPECS`; nothing
  duplicated here.
- The IU line and the upper-limit line follow the value on screen in both modes (the reference
  shows them only while typing); the verify case "vitamin D 20 shows 800 IU" needs the wheel mode.
- Over 999 999 the reference refuses Save; we clamp, as the domain and spec say, and say so.
- The four groups and caffeine's place among the sports compounds are ours (the reference lists
  the goals in one flat list).
- The reference's "reset to defaults" button and its amino-acid estimate switch are not taken
  (not in the spec; the switch belongs to a later phase).

Tests we will write (`NutrientGoalsSheet.test.tsx`):
- lists 29 goals in four groups with kind and unit; vitamin D shows IU.
- the sodium wheel runs 0–5 000 in 50s.
- typing 2 345 for sodium keeps 2 345 exactly (ACC-C10-1); the editor reopens in typing mode.
- calcium 3 000 opens in typing mode and shows the upper-limit line; 2 000 does not.
- vitamin D at 20 shows 800 IU on the wheel.
- typing 12 345 678 stops at 1 234 567 (seven digits) and saves 999 999 with the line shown.
- an empty field cannot be saved; letters are dropped.
- an untouched editor saves nothing (a fractional stored value stays).

Compare checklist (filled after the rewrite; reopened `SettingsScreen.kt` 2367–2500,
3456–3560, 4120–4260, 4960–5080, `OptionalNutrientGoals.swift` 228–300 and
`ProfileComponents.swift` 893–1060):
- [x] 29 goals, grouped, with kind and unit; vitamin D in IU on the list (`NutrientGoalsSheet.test.tsx`
  > NutrientGoalsSheet: the list > lists the 29 goals in four groups, each with its kind and
  unit; vitamin D also in IU; > holds every goal key in exactly one group)
- [x] Wheel on the P01-07 range and step (`NutrientGoalsSheet.test.tsx` > NutrientGoalsSheet: the
  editor > opens sodium on a 0–5 000 wheel in steps of 50, at the stored goal)
- [x] Typed value kept exactly, not snapped; opens in typing mode off the wheel
  (`NutrientGoalsSheet.test.tsx` > NutrientGoalsSheet: the editor > keeps a typed sodium goal of
  2 345 exactly and reopens it in typing mode (ACC-C10-1); `targetEdits.test.ts` > targetEdits:
  switches and nutrient goals > stores a typed nutrient goal exactly and clamps only above 999 999
  (ACC-C10-1))
- [x] Upper-limit line, non-blocking (`NutrientGoalsSheet.test.tsx` > NutrientGoalsSheet: the
  editor > opens calcium at 3 000 in typing mode with the upper-limit line; 2 000 has none)
- [x] Vitamin D IU (`NutrientGoalsSheet.test.tsx` > NutrientGoalsSheet: the editor > shows
  vitamin D 20 mcg as 800 IU on the wheel, following the wheel)
- [x] Seven digits, digits only, clamped to 999 999 (`NutrientGoalsSheet.test.tsx` >
  NutrientGoalsSheet: the editor > stops typing at seven digits and saves anything over 999 999
  as 999 999; > keeps digits only and cannot save an empty field)
- [x] An untouched editor writes nothing (`NutrientGoalsSheet.test.tsx` > NutrientGoalsSheet: the
  editor > saves nothing for an editor left as it opened, so a stored fraction stays)
- Deliberate differences: the IU and upper-limit lines follow the value in both modes; over
  999 999 we clamp and say so instead of refusing Save; switching back to the wheel opens it at
  the typed value; four groups of our own.
- Not taken: "reset to defaults" and the amino-acid estimate switch.

## Status

Done (2026-10-27). Words under `goals.nutrients` in `src/i18n/en/goals.ts` (the nutrient names
live here until a shared nutrient-names partition exists; Home's pillar labels are separate).
