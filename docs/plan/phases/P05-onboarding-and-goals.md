# P05 · Onboarding and goals

**Weeks:** 2 · **Tracks:** UI (wizard, settings pages); domain/data/AI (plan builder, rebuild, weekly tune-up) · **Depends on:** P01, P02, P03, P04 · **Status:** 🔨 in progress: P05-01..09, P05-13, P05-14 landed (11/15, 2026-10-27)

Reference paths are relative to `$PLATEWISE_REF` (`/root/reference/fud-ai`, pinned at `10e14b67`). Prefixes: `A/` = `android/app/src/main/java/com/apoorvdarshan/calorietracker/`, `I/` = `ios/calorietracker/`, `T/` = `android/app/src/test/java/com/apoorvdarshan/calorietracker/`, `IT/` = `ios/calorietrackerTests/`. A number in brackets is the file's length in lines; read only the named part of a big file. Read the research spec section first, then the reference, then its tests.

## Goal

A new person walks the wizard (sex, birthday, body, body fat, activity, goal, target, pace, reminders, AI access), watches the plan being built by their AI with a 60 s cap and a formula fallback (D-16.14), edits it on Plan Ready, and lands on Home with targets. In Settings they edit their profile and targets with locks, rebuild the plan with the AI, see the maintenance estimate, set optional nutrient goals and switch the weekly tune-up (Adaptive Goals) on or off. The goal-reached dialog appears from every weigh-in path.

## Slices and waves

Each slice owns its files; no two slices in a wave touch the same path. A builder takes one slice, runs Read → note → Rewrite → Compare for each task, then the loop until green. The lead lands one commit per slice and writes any deviation back into this file.

- **Wave A:** S1 = P05-01..03 (`src/features/onboarding/{wizard.ts,WizardPage.tsx,steps/{Welcome,Sex,Birthday,Body,BodyFat,Activity,Goal,Target,Pace,Reminders}.tsx}`) · S2 = P05-04..06 (`src/features/ai-setup/**`, `steps/{AiAccess,BuildingPlan,PlanReady}.tsx`, `src/services/goals/planBuilder.ts`) · S3 = P05-07..09 (`src/services/{onboarding.ts,goals/{rebuild,tuneUp}.ts}`, `src/app/useTuneUp.ts`).
- **Wave B:** S4 = P05-10..14 (`src/features/settings/{profile,goals}/**`, `src/features/about/MethodsPage.tsx`, `src/features/goals/**`).
- **Wave C:** P05-15 (`e2e/onboarding.spec.ts`, fake-AI scripts).

## Tasks (15)

| ID | Task | Read in reference | New files | Verify |
|---|---|---|---|---|
| P05-01 | **Wizard state machine.** `src/features/onboarding/wizard.ts` (01 §3.4, D-16.15, Proposed D-16.63): steps 0 Welcome, 1 Sex, 2 Birthday, 3 Body (height and weight), 4 Body fat, 5 Activity, 6 Goal, 7 Target weight, 8 Pace, 9 Reminders, 10 AI access, 11 Building plan, 12 Plan ready. State is canonical (cm, kg, fractions) and converted only for display, so a unit toggle keeps the entered value (R01.3). Continue is always enabled except on AI access (depends on the chosen setup) and on Target weight when the target is on the wrong side (D-16.11, R01.6; maintain skips the check). Target seed: current ∓ 5 kg (shown in the person's unit, clamped to the wheel) when a goal is chosen; re-seeded when the current weight changes unless the person already moved the target. Back: disabled on Welcome and Building plan; from Plan ready it returns to AI access (skipping Building plan, so edits are not overwritten); a Building-plan completion that arrives after the person left is ignored (R01.8). Progress = index ÷ 12, shown on steps 1–10. Maintain drops pace and target; goal body fat kept only with body fat. | `A/ui/onboarding/OnboardingViewModel.kt` [622: steps, setters, `back()`, `complete()`]; `T/ui/onboarding/OnboardingStateTest.kt` [101] | `src/features/onboarding/wizard.ts`, `src/features/onboarding/wizard.test.ts` | toggle kg → lb → kg keeps 70.0; lose with target 72 when current 70 blocks Continue; maintain skips target and pace; back from Plan ready lands on AI access; a stale completion after Back is ignored; progress 1/12 on Sex, hidden on Welcome and Plan ready. |
| P05-02 | **Wizard steps: Welcome to Body fat.** `WizardPage.tsx` hosts the header (back chevron, thin progress bar) and renders steps. `steps/Welcome.tsx`: our mark, a two-line headline and a short tour of what Platewise does (photo logging, the Coach, your own AI key, data on the device), Get Started, and a text link "Restore from a backup file" (wired in P09-14). `Sex.tsx`: three cards. `Birthday.tsx`: date input, default today − 25 years, never in the future. `Body.tsx`: one metric/imperial toggle that writes both unit settings; height 100–250 cm or 3′0″–8′11″; weight whole + tenth wheels 20–250 kg or 50–500 lb (D-16.37, Proposed D-16.56). `BodyFat.tsx`: Yes/No cards (No default); Yes shows a 3–60 % wheel in 0.5 steps (default 20 %), common ranges as a hint, and an optional goal toggle seeded with the current value; No explains that the standard formula is used; switching to No clears both values. | `A/ui/onboarding/OnboardingScreen.kt` [2 355: lines 140–460 scaffold, 553–1100 steps]; `I/Views/OnboardingView.swift` [1 843: lines 80–740] | `src/features/onboarding/WizardPage.tsx`, `src/features/onboarding/WizardPage.test.tsx`, `src/features/onboarding/steps/Welcome.tsx`, `src/features/onboarding/steps/Welcome.test.tsx`, `src/features/onboarding/steps/Sex.tsx`, `src/features/onboarding/steps/Birthday.tsx`, `src/features/onboarding/steps/Body.tsx`, `src/features/onboarding/steps/Body.test.tsx`, `src/features/onboarding/steps/BodyFat.tsx`, `src/features/onboarding/steps/BodyFat.test.tsx`, `src/features/onboarding/onboarding.module.css` | `WizardPage.test.tsx`: walking Welcome → Body fat with keyboard only; `Body.test.tsx`: toggling units converts the shown value and writes both unit settings; `BodyFat.test.tsx`: No clears a set value and its goal; `Welcome.test.tsx`: restore link present. |
| P05-03 | **Wizard steps: Activity to Reminders.** `Activity.tsx`: six cards with our own one-line descriptions and step guides (01 §3.3 table), default moderate. `Goal.tsx`: lose / maintain / gain, default maintain. `Target.tsx`: weight wheel, subtitle names the goal, inline message when the target is on the wrong side. `Pace.tsx`: maintain shows a short confirmation; lose/gain shows the weekly amount in the person's unit, Slow / Steady / Fast (0.25, 0.5, 1.0 kg a week; default 0.5) and an estimated days card = trunc(\|target − current\| ÷ weekly × 7). `Reminders.tsx` (D-16.15): explains meal reminders, a button that asks for notification permission (only a grant turns reminders on; denial shows how to allow it later), and Continue to skip. | `A/ui/onboarding/OnboardingScreen.kt` [2 355: search `GoalSpeedStep`]; `I/Views/OnboardingView.swift` [1 843: pace part] | `src/features/onboarding/steps/Activity.tsx`, `src/features/onboarding/steps/Goal.tsx`, `src/features/onboarding/steps/Target.tsx`, `src/features/onboarding/steps/Target.test.tsx`, `src/features/onboarding/steps/Pace.tsx`, `src/features/onboarding/steps/Pace.test.tsx`, `src/features/onboarding/steps/Reminders.tsx`, `src/features/onboarding/steps/Reminders.test.tsx` | `Pace.test.tsx`: 70 → 65 kg at 0.5 → 70 days; imperial readout "1.1 lb"; `Target.test.tsx`: wrong-side target shows the message; `Reminders.test.tsx`: denied permission leaves reminders off, granted turns the master switch on. |
| P05-04 | **AI access step and the shared provider form.** `src/features/ai-setup/ProviderForm.tsx` (shared with the P09 AI page): provider list (16, grouped: cloud, own server), model picker with our presets and a free-form field where allowed (P03-03), key field (masked after save, trimmed, a link-out text naming where to get a key for each provider), server URL field for Ollama and Custom (P03-04 rules; http only for loopback, with the reason shown), and a plain line that the browser stores the key on this device only (D-16.7). `steps/AiAccess.tsx`: the form plus acceptance of our short terms (a checkbox that enables Continue), a "paste your key" message when a key is needed and missing, and "Set up later" which continues without AI so the plan uses formulas (Proposed D-16.49). Leaving the step saves the choice so Building plan uses it. | `A/ui/settings/AiAccessSettings.kt` [208: BYOK part only]; `A/ui/settings/SettingsScreen.kt` [5 141: lines 1225–1520 AI section, behaviour only]; spec 03 §3.3 | `src/features/ai-setup/ProviderForm.tsx`, `src/features/ai-setup/ProviderForm.test.tsx`, `src/features/ai-setup/ModelPicker.tsx`, `src/features/ai-setup/ModelPicker.test.tsx`, `src/features/ai-setup/KeyField.tsx`, `src/features/ai-setup/KeyField.test.tsx`, `src/features/onboarding/steps/AiAccess.tsx`, `src/features/onboarding/steps/AiAccess.test.tsx`, `src/i18n/en/aiSetup.ts` | choosing Gemini shows a key field and its presets; Ollama shows a server URL and no key; `http://10.0.0.2:11434/v1` is refused with the reason; Custom without a model blocks Continue; terms unchecked blocks Continue; "Set up later" continues with no provider saved; a saved key shows masked. |
| P05-05 | **Building plan step and plan builder.** `src/services/goals/planBuilder.ts`: `buildPlan(profile, deps)` calls `requestPlan` (P03-18) without evidence and with a 60 s overall cap (D-16.14); any failure, no AI setup, or the cap → the formula plan with a flag `aiUnavailable`; a success re-derives carbs as max(0, (kcal − 4P − 9F) div 4). `steps/BuildingPlan.tsx`: an animated 0–100 counter and a checklist that ticks one item every 700 ms (about 4 s), runs `buildPlan` in parallel, advances only when both are done; Back is disabled; a result for an abandoned run is ignored (R01.8). | `A/ui/onboarding/OnboardingScreen.kt` [2 355: search `BuildingPlanStep`]; `A/ui/onboarding/OnboardingViewModel.kt` [622: `buildPlanWithAI`] | `src/services/goals/planBuilder.ts`, `src/services/goals/planBuilder.test.ts`, `src/features/onboarding/steps/BuildingPlan.tsx`, `src/features/onboarding/steps/BuildingPlan.test.tsx` | fake fetch success at 2 s → advances after the 4 s animation; AI never answers → formula plan at 60 s with the note; invalid plan reply → formula plan; no provider → formula plan immediately; Back disabled throughout. |
| P05-06 | **Plan ready step.** `steps/PlanReady.tsx` (01 §3.4, R01.7, D-16.12): big calorie number in the display unit and three macro cards; tapping one opens a wheel with the Settings ranges (kcal 800–6 000 step 50 or the kJ picker of P01-03; protein 10–500, carbs 0–800, fat 10–300, step 5) and edits through `planEdit` so calories and macros stay consistent; any edit marks the plan hand-edited; a note that the plan is tuned weekly unless the person turns that off; a warning card under 1 200 kcal suggesting to consult a doctor; "How is this calculated?" opens the methods page; the "AI unavailable" note when the formula plan was used; the final button completes onboarding (P05-07). | `A/ui/onboarding/OnboardingScreen.kt` [2 355: lines 1875–2355 plan]; `I/Views/OnboardingView.swift` [1 843: lines 1352–1843] | `src/features/onboarding/steps/PlanReady.tsx`, `src/features/onboarding/steps/PlanReady.test.tsx` | editing protein to 150 re-derives carbs; editing carbs re-derives kcal; 1 150 kcal shows the warning; an edit sets hand-edited; kJ person sees kJ and the untouched wheel keeps the exact kcal. |
| P05-07 | **Onboarding completion service.** `src/services/onboarding.ts` (01 §3.4 Completion): in one flow save the profile with the plan as saved targets; seed the first weigh-in at now when the history is empty and the first body-fat reading only when body fat was entered; save the reminder choice and AI settings and key; tune-up on unless the plan was hand-edited; tune-up last check = today; seed the Home sort mode; mark onboarding done; route to Home. A completion after a restore (P09-14) skips seeding. Delete the P04 quick start and point the onboarding route at the wizard. | `A/ui/onboarding/OnboardingViewModel.kt` [622: `complete()`]; `I/calorietrackerApp.swift` [562: lines 160–215 completion defaults] | `src/services/onboarding.ts`, `src/services/onboarding.test.ts` | hand-edited plan → tune-up off; untouched → on with last check today; body fat entered → one reading seeded; second completion does not add another weigh-in; restore-completed path seeds nothing. |
| P05-08 | **Rebuild plan service.** `src/services/goals/rebuild.ts` (01 §3.6 Applying, R01.4): snapshot the profile and switches, build the evidence pack (P01-17), call `requestPlan`, and apply only if the stored profile is exactly equal to the snapshot (any field, a lock or a target edit wins) and switches are unchanged; applying sets all four saved targets and clears every lock, then stores the rebuild baseline (P01-15). Success message: the new calorie target in the display unit plus the AI's reason. Then refresh optional nutrient goals (P03-18; failure keeps them) and, when the tune-up is on, mark today checked. Failure: a message that the provider could not be reached and goals are unchanged, pointing to the AI settings; no formula fallback here. | `A/ui/settings/SettingsViewModel.kt` [1 727: search `recalculateGoals`]; `I/ContentView.swift` [7 966: search `recalculateGoalsWithAI`] | `src/services/goals/rebuild.ts`, `src/services/goals/rebuild.test.ts` | profile edited during the call → result dropped, targets unchanged; success clears locks and stores the baseline; nutrient refresh failure keeps the old values; tune-up on → last check today; failure leaves targets and shows the failure kind. |
| P05-09 | **Weekly tune-up runner.** `src/services/goals/tuneUp.ts` drives the P01-16 reducer (D-16.45, R01.1, R01.5, R01.14): runs on app open and on `visibilitychange` → visible once onboarding is done, single-flight (overlapping triggers are dropped); applies, drops or marks per the reducer; saves the pre-tune-up plan once and restores it when the switch goes off; enabling clears locks and forces a run whose outcome is shown in a dialog (changed, unchanged with a short explanation, or could not reach the provider). `src/app/useTuneUp.ts` wires it to the app lifecycle. | `A/FudAIApp.kt` [795: lines 640–800]; `I/ContentView.swift` [7 966: search `applyAdaptiveGoalsIfDue`, `handleAdaptiveGoalsToggle`] | `src/services/goals/tuneUp.ts`, `src/services/goals/tuneUp.test.ts`, `src/app/useTuneUp.ts`, `src/app/useTuneUp.test.ts` | three visibility events in a row cause one AI call; failure marks today when still on; turning off during the call → nothing applied, nothing marked; disable restores the saved plan; enable forces a run and shows its outcome. |
| P05-10 | **Settings: personal info page.** `src/features/settings/profile/ProfilePage.tsx` (01 §3.9, R01.12): rows for sex, birthday (date and age), height (cm or ft-in sheet with a unit toggle that writes the height unit and converts), weight (sheet with unit toggle; saving adds a weigh-in through `weightRepo` so the goal-reached event and profile sync happen there), body fat (3–60 % step 0.5, Remove), goal body fat (shown with body fat; Remove), activity, goal, weekly pace (Slow / Steady / Fast with the pace text), goal weight (refused with an explanation when on the wrong side), allergen sensitivities (free list). No edit recomputes targets. Registers the Personal info category. | `A/ui/settings/SettingsScreen.kt` [5 141: lines 810–945, 3155–3290]; `I/Views/ProfileComponents.swift` [1 429: lines 75–480, 618–670] | `src/features/settings/profile/ProfilePage.tsx`, `src/features/settings/profile/ProfilePage.test.tsx`, `src/features/settings/profile/WeightSheet.tsx`, `src/features/settings/profile/WeightSheet.test.tsx`, `src/features/settings/profile/HeightSheet.tsx`, `src/features/settings/profile/AllergensSheet.tsx`, `src/features/settings/profile/AllergensSheet.test.tsx` | saving a weight adds one weigh-in and changes the profile weight; switching goal to maintain hides pace and target; a wrong-side goal weight shows the explanation and saves nothing; editing activity leaves targets unchanged and raises the rebuild nudge; allergens list add/remove. |
| P05-11 | **Settings: goals and nutrition page.** `src/features/settings/goals/GoalsPage.tsx` (01 §3.7, §3.9, D-16.45): target rows (kcal, protein, carbs, fat) with lock glyphs, pickers per P01-13 ranges and the lock engine (a refused macro edit shows why), "Reset to auto" on locked rows; when the tune-up is on, rows are read-only with an explanation and dimmed locks; Rebuild plan row with the "inputs changed" nudge (P01-15 signature, seeded baseline) that is always tappable; maintenance estimate row with an explanation that it is a formula estimate; tune-up switch with info; goal-reached alert switch; link to the methods page; entry to optional nutrient goals. Registers the category. | `A/ui/settings/SettingsScreen.kt` [5 141: lines 3390–3440, 3750–3790, 4022–4060, 4960–5080]; `I/ContentView.swift` [7 966: lines 6510–6660, 7205–7520]; `I/Views/MaintenanceEstimateRow.swift` [56] | `src/features/settings/goals/GoalsPage.tsx`, `src/features/settings/goals/GoalsPage.test.tsx`, `src/features/settings/goals/TargetRow.tsx`, `src/features/settings/goals/TargetRow.test.tsx` | locking kcal then editing protein keeps kcal; third macro lock not added; tune-up on → tapping a row explains and changes nothing; nudge appears after a weight change and not on first open; maintenance row reads close within ±50. |
| P05-12 | **Optional nutrient goals editor.** `src/features/settings/goals/NutrientGoalsSheet.tsx` (01 §3.11): the 29 goals grouped (sugars and fats, minerals, vitamins, sports compounds) with kind (limit or target) and unit; each opens a wheel with the P01-07 range and step or a typing mode (digits only, up to 7) that opens automatically when the current value is not on the wheel; typed values are clamped 0–999 999 and not snapped; the upper-limit hint shows when exceeded; vitamin D also shows IU. | `A/ui/settings/SettingsScreen.kt` [5 141: search the nutrient goals sheet]; `I/Models/OptionalNutrientGoals.swift` [364: ranges] | `src/features/settings/goals/NutrientGoalsSheet.tsx`, `src/features/settings/goals/NutrientGoalsSheet.test.tsx` | sodium wheel 0–5 000 step 50; typing 2 345 keeps 2 345; calcium 3 000 shows the hint; vitamin D 20 shows 800 IU; 12 345 678 is refused at 7 digits. |
| P05-13 | **Calculation methods page.** `src/features/about/MethodsPage.tsx`: our own explanation of the two BMR equations, the activity multipliers, the 7 700 kcal per kg rule (about 3 500 kcal per lb), the protein and fat guide and carbs as the remainder, that meal values are AI estimates, what the AI receives for planning (numbers and dates) and never receives (food names, notes, photos, ingredients), citations to the original publications, and a not-medical-advice note (BMR equations are about ±10 %; ask a professional if pregnant or under 18). Reachable from Plan ready and Settings. | `I/Views/CalculationMethodsView.swift` [185: list of topics only; write every sentence ourselves] | `src/features/about/MethodsPage.tsx`, `src/features/about/MethodsPage.test.tsx`, `src/i18n/en/about.ts` | renders every multiplier from the domain constants (not duplicated literals); links reachable from Plan ready and Settings; similarity check green on the copy. |
| P05-14 | **Goal-reached dialog.** `src/features/goals/GoalReachedDialog.tsx` (01 §3.13, D-16.13): listens for `goal-reached` on the bus (posted by `weightRepo` for every add path, R01.11) and shows a congratulation dialog with "Set a new goal" (opens the goal and target editing in Settings › Personal info) and Dismiss. A system notification is added in P09-09 when allowed. Mounted once in the app frame. | `A/ui/progress/ProgressViewModel.kt` [114: goal-reached part]; `I/Stores/WeightStore.swift` [328: search `weightGoalReached`] | `src/features/goals/GoalReachedDialog.tsx`, `src/features/goals/GoalReachedDialog.test.tsx` | a bus message opens the dialog; Set a new goal navigates to the goal row; Dismiss closes; two messages in a row show one dialog. |
| P05-15 | **Onboarding and goals e2e.** `e2e/onboarding.spec.ts`: fresh start → wizard with the fake AI as the Custom provider at loopback (P00-09, script `plan-ok`) → Plan ready shows the AI plan → edit protein → finish → Home shows the targets; second test: script `garbage` → formula plan with the AI-unavailable note; third: "Set up later" → formula plan; fourth: Settings › Goals → Rebuild plan with `plan-ok` → new target message. | none | `e2e/onboarding.spec.ts`, `e2e/fake-ai/scripts/plan-ok.json` | all four scenarios pass three times in a row in the mobile viewport. |

## Files to create (64)

| Path (under `platewise/`) | What it holds | Task |
|---|---|---|
| `src/features/onboarding/wizard.ts` | Wizard reducer: steps, gating, back rules | P05-01 |
| `src/features/onboarding/wizard.test.ts` | Tests for `wizard.ts`: the Verify cases of P05-01 | P05-01 |
| `src/features/onboarding/WizardPage.tsx` | Wizard host | P05-02 |
| `src/features/onboarding/WizardPage.test.tsx` | Tests for `WizardPage.tsx`: the Verify cases of P05-02 | P05-02 |
| `src/features/onboarding/steps/Welcome.tsx` | Welcome | P05-02 |
| `src/features/onboarding/steps/Welcome.test.tsx` | Tests for `Welcome.tsx`: the Verify cases of P05-02 | P05-02 |
| `src/features/onboarding/steps/Sex.tsx` | Sex | P05-02 |
| `src/features/onboarding/steps/Birthday.tsx` | Birthday | P05-02 |
| `src/features/onboarding/steps/Body.tsx` | Height and weight | P05-02 |
| `src/features/onboarding/steps/Body.test.tsx` | Tests for `Body.tsx`: the Verify cases of P05-02 | P05-02 |
| `src/features/onboarding/steps/BodyFat.tsx` | Body fat and goal | P05-02 |
| `src/features/onboarding/steps/BodyFat.test.tsx` | Tests for `BodyFat.tsx`: the Verify cases of P05-02 | P05-02 |
| `src/features/onboarding/onboarding.module.css` | Wizard styles | P05-02 |
| `src/features/onboarding/steps/Activity.tsx` | Activity | P05-03 |
| `src/features/onboarding/steps/Goal.tsx` | Goal | P05-03 |
| `src/features/onboarding/steps/Target.tsx` | Target weight | P05-03 |
| `src/features/onboarding/steps/Target.test.tsx` | Tests for `Target.tsx`: the Verify cases of P05-03 | P05-03 |
| `src/features/onboarding/steps/Pace.tsx` | Pace and estimated days | P05-03 |
| `src/features/onboarding/steps/Pace.test.tsx` | Tests for `Pace.tsx`: the Verify cases of P05-03 | P05-03 |
| `src/features/onboarding/steps/Reminders.tsx` | Optional reminders | P05-03 |
| `src/features/onboarding/steps/Reminders.test.tsx` | Tests for `Reminders.tsx`: the Verify cases of P05-03 | P05-03 |
| `src/features/ai-setup/ProviderForm.tsx` | Provider, model, key and server URL form | P05-04 |
| `src/features/ai-setup/ProviderForm.test.tsx` | Tests for `ProviderForm.tsx`: the Verify cases of P05-04 | P05-04 |
| `src/features/ai-setup/ModelPicker.tsx` | Preset list plus free-form id | P05-04 |
| `src/features/ai-setup/ModelPicker.test.tsx` | Tests for `ModelPicker.tsx`: the Verify cases of P05-04 | P05-04 |
| `src/features/ai-setup/KeyField.tsx` | Masked key entry | P05-04 |
| `src/features/ai-setup/KeyField.test.tsx` | Tests for `KeyField.tsx`: the Verify cases of P05-04 | P05-04 |
| `src/features/onboarding/steps/AiAccess.tsx` | AI access step | P05-04 |
| `src/features/onboarding/steps/AiAccess.test.tsx` | Tests for `AiAccess.tsx`: the Verify cases of P05-04 | P05-04 |
| `src/i18n/en/aiSetup.ts` | AI setup copy partition | P05-04 |
| `src/services/goals/planBuilder.ts` | AI plan with cap and formula fallback | P05-05 |
| `src/services/goals/planBuilder.test.ts` | Tests for `planBuilder.ts`: the Verify cases of P05-05 | P05-05 |
| `src/features/onboarding/steps/BuildingPlan.tsx` | Animated building step | P05-05 |
| `src/features/onboarding/steps/BuildingPlan.test.tsx` | Tests for `BuildingPlan.tsx`: the Verify cases of P05-05 | P05-05 |
| `src/features/onboarding/steps/PlanReady.tsx` | Plan review and edit | P05-06 |
| `src/features/onboarding/steps/PlanReady.test.tsx` | Tests for `PlanReady.tsx`: the Verify cases of P05-06 | P05-06 |
| `src/services/onboarding.ts` | Completion side effects | P05-07 |
| `src/services/onboarding.test.ts` | Tests for `onboarding.ts`: the Verify cases of P05-07 | P05-07 |
| `src/services/goals/rebuild.ts` | Rebuild with stale-result protection | P05-08 |
| `src/services/goals/rebuild.test.ts` | Tests for `rebuild.ts`: the Verify cases of P05-08 | P05-08 |
| `src/services/goals/tuneUp.ts` | Weekly tune-up orchestration | P05-09 |
| `src/services/goals/tuneUp.test.ts` | Tests for `tuneUp.ts`: the Verify cases of P05-09 | P05-09 |
| `src/app/useTuneUp.ts` | Lifecycle triggers | P05-09 |
| `src/app/useTuneUp.test.ts` | Tests for `useTuneUp.ts`: the Verify cases of P05-09 | P05-09 |
| `src/features/settings/profile/ProfilePage.tsx` | Personal info rows | P05-10 |
| `src/features/settings/profile/ProfilePage.test.tsx` | Tests for `ProfilePage.tsx`: the Verify cases of P05-10 | P05-10 |
| `src/features/settings/profile/WeightSheet.tsx` | Weight edit with unit toggle | P05-10 |
| `src/features/settings/profile/WeightSheet.test.tsx` | Tests for `WeightSheet.tsx`: the Verify cases of P05-10 | P05-10 |
| `src/features/settings/profile/HeightSheet.tsx` | Height edit with unit toggle | P05-10 |
| `src/features/settings/profile/AllergensSheet.tsx` | Allergen sensitivity list | P05-10 |
| `src/features/settings/profile/AllergensSheet.test.tsx` | Tests for `AllergensSheet.tsx`: the Verify cases of P05-10 | P05-10 |
| `src/features/settings/goals/GoalsPage.tsx` | Targets, rebuild, maintenance, tune-up | P05-11 |
| `src/features/settings/goals/GoalsPage.test.tsx` | Tests for `GoalsPage.tsx`: the Verify cases of P05-11 | P05-11 |
| `src/features/settings/goals/TargetRow.tsx` | Lockable target row | P05-11 |
| `src/features/settings/goals/TargetRow.test.tsx` | Tests for `TargetRow.tsx`: the Verify cases of P05-11 | P05-11 |
| `src/features/settings/goals/NutrientGoalsSheet.tsx` | Optional goals editor | P05-12 |
| `src/features/settings/goals/NutrientGoalsSheet.test.tsx` | Tests for `NutrientGoalsSheet.tsx`: the Verify cases of P05-12 | P05-12 |
| `src/features/about/MethodsPage.tsx` | How the numbers are calculated | P05-13 |
| `src/features/about/MethodsPage.test.tsx` | Tests for `MethodsPage.tsx`: the Verify cases of P05-13 | P05-13 |
| `src/i18n/en/about.ts` | About and methods copy partition | P05-13 |
| `src/features/goals/GoalReachedDialog.tsx` | Congratulation dialog | P05-14 |
| `src/features/goals/GoalReachedDialog.test.tsx` | Tests for `GoalReachedDialog.tsx`: the Verify cases of P05-14 | P05-14 |
| `e2e/onboarding.spec.ts` | Wizard, plan fallback, rebuild | P05-15 |
| `e2e/fake-ai/scripts/plan-ok.json` | A valid plan reply (our text) | P05-15 |

## Files to update (4)

| Path (under `platewise/`) | Change | Task |
|---|---|---|
| `src/features/onboarding/QuickStart.tsx` | Deleted; the onboarding route renders the wizard | P05-07 |
| `src/features/settings/registry.ts` | Register Personal info and Goals & nutrition | P05-10 |
| `src/app/App.tsx` | Mount the goal-reached dialog and the tune-up hook | P05-14 |
| `src/i18n/en.ts` | Import the aiSetup and about partitions (lead) | P05-04 |

## Migrations and fixtures (1)

| Path (under `platewise/`) | What it holds | Task |
|---|---|---|
| `e2e/fake-ai/scripts/plan-ok.json` | Valid plan reply | P05-15 |

## Task notes (15)

`docs/notes/P05/<slug>.md`, one per task, from `docs/notes/_template.md`, written before the code:

- `docs/notes/P05/wizard-state-machine.md` (P05-01)
- `docs/notes/P05/wizard-steps-welcome-to-body-fat.md` (P05-02)
- `docs/notes/P05/wizard-steps-activity-to-reminders.md` (P05-03)
- `docs/notes/P05/ai-access-step-and-the-shared-provider-form.md` (P05-04)
- `docs/notes/P05/building-plan-step-and-plan-builder.md` (P05-05)
- `docs/notes/P05/plan-ready-step.md` (P05-06)
- `docs/notes/P05/onboarding-completion-service.md` (P05-07)
- `docs/notes/P05/rebuild-plan-service.md` (P05-08)
- `docs/notes/P05/weekly-tune-up-runner.md` (P05-09)
- `docs/notes/P05/settings-personal-info-page.md` (P05-10)
- `docs/notes/P05/settings-goals-and-nutrition-page.md` (P05-11)
- `docs/notes/P05/optional-nutrient-goals-editor.md` (P05-12)
- `docs/notes/P05/calculation-methods-page.md` (P05-13)
- `docs/notes/P05/goal-reached-dialog.md` (P05-14)
- `docs/notes/P05/onboarding-and-goals-e2e.md` (P05-15)

## Run until green

```bash
cd platewise
pnpm install --frozen-lockfile
pnpm lint && pnpm fmt:check && pnpm typecheck && pnpm test   # fix and re-run until all pass
pnpm build && pnpm e2e                                        # browser tests, mobile viewport
PLATEWISE_REF=/root/reference/fud-ai pnpm check --require-ref # similarity, banned, assets, licences, traps, acceptance
```

Phase additions, inside the same loop:

```bash
pnpm build && pnpm exec playwright test e2e/onboarding.spec.ts
```

On any failure, fix the cause and run the whole loop again from `pnpm install`. Never skip a test, widen an allow-list without a written reason, or edit a recorded fixture to make a test pass. Real waits are banned in tests: use fake timers (`vi.useFakeTimers()`) and the clock helpers in `src/test/time.ts`.

## Compare checklist (reopen the reference after writing)

- [ ] Wizard: every step, default and range against 01 §3.4; steps 9–10 replaced by one Reminders step (D-16.15); progress maths per Proposed D-16.63.
- [ ] Plan Ready: Android ranges (D-16.12), coupled edits (R01.7), hand-edited flag turns the tune-up off.
- [ ] Completion side effects in order; tune-up last check = today.
- [ ] Rebuild: stale-result drop, lock clearing, baseline capture, nutrient refresh, no formula fallback.
- [ ] Tune-up: due rule, single-flight, failure marking, snapshot once, restore on disable (D-16.45).
- [ ] Settings profile rows: no recompute; goal-weight refusal; weight edit goes through the weight store.
- [ ] Deliberate: target-side check in the wizard (D-16.11), goal-reached offers a new goal (D-16.13), 60 s cap (D-16.14), Set up later (Proposed D-16.49).
- [ ] Every task note's compare section is ticked, each tick naming its test.
- [ ] Trap rows owned by this phase in `docs/internals/traps-ledger.md` now carry `Test:` lines (the lead updates the ledger at land time).
- [ ] Acceptance rows owned by this phase in `docs/internals/acceptance-map.md` now carry `Test:` lines.

## Done when

Wizard, settings pages and services pass their tests; `e2e/onboarding.spec.ts` passes. **Demo 2 (M3):** a fresh browser walks the wizard with the fake provider, sees the AI plan, edits protein, finishes on Home with those targets, then rebuilds the plan from Settings; a second run without AI ends on the formula plan with the note.
