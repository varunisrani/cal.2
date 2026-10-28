# Acceptance map

v1.0 is done when every P0 and P1 feature of the inventory (`docs/plan/03-feature-inventory.md`) passes its acceptance tests. This page names those tests. Each P0/P1 feature has one or more acceptance ids (`ACC-<feature>-<n>`), each one a behaviour a person can see, mapped to the tests that prove it.

`pnpm check:acceptance` (`tooling/checks/acceptance.ts`, row formats in `checks.md`) reads the inventory and this page without running any test. It fails when a P0/P1 feature has no acceptance id, an id names a test that does not exist or is skipped, or an id has neither a test nor a review line. `pnpm check:acceptance --strict` also fails on review-only ids; it is the v1.0 gate (P10-05).

**Rules for rows.** A test reference is `file > describe > test` relative to `platewise/`. Until its task lands, an id carries only a `Review:` line naming the owning task. When the task lands, the lead replaces the `Review:` line with `Test:` lines. A feature changed on purpose is mapped to our version and cites its decision in the inventory row. Missing behaviour with no planned task goes under Known gaps, never as an id.

## A · Shell and navigation

### A1 · Bottom tab bar in a fixed order (P0)

- **ACC-A1-1** The four tabs appear in that order and switching back to Home returns to where you were
  - Test: src/app/TabBar.test.tsx > TabBar > shows Home, Progress, Coach and Settings in that order, and Home comes back where it was

### A2 · Hash routes for tabs and nested Settings pages (P0)

- **ACC-A2-1** Pressing Back with two sheets open closes only the top one
  - Test: src/app/router.test.ts > createRouter > closes only the top sheet when Back is pressed with two sheets open
- **ACC-A2-2** An unknown address opens Home
  - Test: src/app/router.test.ts > createRouter > opens Home for an unknown address and keeps the address out of history

### A3 · Progress and Coach can be hidden (P1)

- **ACC-A3-1** Hiding Coach while viewing it moves you to Home and the tab disappears
  - Test: src/app/TabBar.test.tsx > TabBar > moves to Home when Coach is hidden while on Coach, and the tab disappears
- **ACC-A3-2** A hidden tab never flashes into the bar while the app starts
  - Test: src/app/TabBar.test.tsx > TabBar > draws nothing before the hidden-tab setting arrives, so a hidden tab never shows for a moment

### A4 · Tapping Settings while inside a Settings page returns to the … (P1)

- **ACC-A4-1** From a nested Settings page, tapping the Settings tab shows the hub
  - Test: src/app/TabBar.test.tsx > TabBar > returns to the Settings hub when Settings is tapped on a nested page

### A5 · The tab bar hides while a food analysis overlay is showing (P1)

- **ACC-A5-1** During an analysis the tab bar is not visible and it returns afterwards
  - Test: src/features/log/AnalysisOverlay.test.tsx > AnalysisOverlay > hides the tab bar during an analysis and brings it back afterwards (ACC-A5-1)

### A6 · Floating capsule tab bar with a selected pill that slides to the … (P1)

- **ACC-A6-1** The selected tab is marked visually and for screen readers (`aria-current`)
  - Test: src/app/TabBar.test.tsx > TabBar > names every tab and marks only the selected one with aria-current

### A8 · Appearance (P1)

- **ACC-A8-1** Choosing Light keeps the light theme even when the device is dark
  - Test: src/app/ThemeProvider.test.tsx > ThemeProvider > keeps the light theme when Light is chosen, even when the device is or turns dark
- **ACC-A8-2** In System mode a device theme change applies without a reload
  - Test: src/ui/theme.test.ts > applyTheme > in System mode a device theme change applies without a reload

### A9 · Six solid accent presets of our own (Basil default, Saffron, … (P1)

- **ACC-A9-1** Picking Ember recolours every accent element at once
  - Test: src/features/settings/app/AppPage.test.tsx > AppPage > recolours every accent element at once when Ember is chosen (ACC-A9-1)
  - Test: e2e/settings-data.spec.ts > settings and data (Demo 6) > changes the accent and the units: the page and Home follow at once, a reload keeps them, and no stored value changes (ACC-A9-1, ACC-C12-1, D-16.1)
- **ACC-A9-2** Every accent passes the contrast sweep in both themes
  - Test: src/ui/contrast.test.ts > token contrast sweep > meets every floor: $theme theme, $accent accent

### A10 · Start-up skeleton until the profile and settings are read, so … (P0)

- **ACC-A10-1** No calorie numbers appear before the stored profile has been read
  - Test: src/app/Boot.test.tsx > Boot > shows no Home numbers before the profile read resolves
- **ACC-A10-2** A Settings page shows a spinner, not default switches, until settings are loaded
  - Test: src/features/settings/CategoryPage.test.tsx > CategoryPage > shows a spinner, not switches at their defaults, until the settings are read (R06.22, ACC-A10-2)

### A11 · "Today" moves to the new day at local midnight and when the app … (P1)

- **ACC-A11-1** Leaving the app open past midnight switches Home to the new day
  - Test: src/app/TodayProvider.test.tsx > TodayProvider > moves to the new day at 23:59:59 plus one second

## B · Onboarding and profile

### B1 · Welcome screen with a short tour and Get Started (P0)

- **ACC-B1-1** A fresh install opens on Welcome and Get Started begins the wizard
  - Test: src/features/onboarding/WizardPage.test.tsx > WizardPage > opens a fresh wizard on Welcome without Back or progress, and Get started begins it (ACC-B1-1)

### B2 · Wizard steps (P0)

- **ACC-B2-1** Each step accepts its value and Continue moves on
  - Test: src/features/onboarding/WizardPage.test.tsx > WizardPage > walks from Welcome to Body fat with the keyboard only, each step keeping its answer (ACC-B2-1)
  - Test: src/features/onboarding/WizardPage.test.tsx > WizardPage > walks from Activity to AI access, each step starting on its default (ACC-B2-1)
- **ACC-B2-2** Pace 0.5 kg/week from 70 to 65 kg shows 70 days
  - Test: src/features/onboarding/steps/Pace.test.tsx > Pace > estimates 70 days from 70 to 65 kg at 0.5 kg a week (ACC-B2-2)

### B3 · Switching metric and imperial in the wizard keeps the value … (P1)

- **ACC-B3-1** Switching the height unit to ft-in and back keeps the height, and the weight still reads 70.0 kg (kg only, D-16.91)
  - Test: src/features/onboarding/wizard.test.ts > units > keeps 70.0 kg and 170 cm through cm → ft and in → cm: weight is kg only (R01.3, ACC-B3-1, D-16.91)

### B4 · Target weight must be below the current weight to lose and above … (P1)

- **ACC-B4-1** A lose target above the current weight blocks Continue with an explanation
  - Test: src/features/onboarding/wizard.test.ts > target weight > blocks Continue for a lose target of 72 kg when the current weight is 70 (R01.6, ACC-B4-1)
  - Test: src/features/onboarding/steps/Target.test.tsx > Target > shows why a lose target above the current weight is refused and holds Continue (ACC-B4-1)

### B5 · Optional Reminders step using web notifications, replacing the … (P1)

- **ACC-B5-1** Denying permission leaves reminders off and the wizard continues
  - Test: src/features/onboarding/steps/Reminders.test.tsx > Reminders > leaves reminders off after a denial, says how to allow them later, and continues (ACC-B5-1)

### B6 · AI access step (P1)

- **ACC-B6-1** Continue stays disabled until a needed key is entered and the terms are accepted
  - Test: src/features/onboarding/steps/AiAccess.test.tsx > AiAccess > keeps Continue disabled until a needed key is entered and the terms are accepted, then stores the choice (ACC-B6-1)
- **ACC-B6-2** Set up later continues and the plan uses the formulas
  - Test: src/features/onboarding/steps/AiAccess.test.tsx > AiAccess > continues with "Set up later" and saves no provider, so the plan uses the formulas (ACC-B6-2)
  - Test: e2e/onboarding.spec.ts > onboarding and goals (Demo 2) > uses the formula plan and sends nothing when AI is set up later (ACC-B6-2)

### B7 · Building the plan (P1)

- **ACC-B7-1** With the AI unreachable the formula plan appears after 60 s with a note
  - Test: src/features/onboarding/steps/BuildingPlan.test.tsx > BuildingPlan with the real plan builder and Plan ready > shows the formula plan with the AI-unavailable note at 60 s when the AI never answers (ACC-B7-1, R01.8, D-16.14)
  - Test: e2e/onboarding.spec.ts > onboarding and goals (Demo 2) > falls back to the formula plan with the AI-unavailable note when the AI answer cannot be read (ACC-B7-1)
- **ACC-B7-2** A valid AI plan is shown after the animation
  - Test: src/features/onboarding/steps/BuildingPlan.test.tsx > BuildingPlan with the real plan builder and Plan ready > shows the AI plan on Plan ready after the animation when the AI answered at 2 s (ACC-B7-2)
  - Test: src/features/onboarding/steps/BuildingPlan.test.tsx > BuildingPlan > moves on only once the 4 s animation is over when the plan came at 2 s, for the run it started (ACC-B7-2)
  - Test: e2e/onboarding.spec.ts > onboarding and goals (Demo 2) > walks the wizard with the AI as a Custom provider at loopback, edits protein on Plan ready and finds those targets on Home (ACC-B7-2, ACC-B8-1, ACC-B9-1, R01.7, R03.20)

### B8 · Plan Ready (P1)

- **ACC-B8-1** Changing protein re-derives carbs so the plan still adds up
  - Test: src/features/onboarding/steps/PlanReady.test.tsx > PlanReady > re-derives carbs when protein changes to 150 (ACC-B8-1, R01.7)
  - Test: e2e/onboarding.spec.ts > onboarding and goals (Demo 2) > walks the wizard with the AI as a Custom provider at loopback, edits protein on Plan ready and finds those targets on Home (ACC-B7-2, ACC-B8-1, ACC-B9-1, R01.7, R03.20)
- **ACC-B8-2** A plan under 1 200 kcal shows the warning
  - Test: src/features/onboarding/steps/PlanReady.test.tsx > PlanReady > warns under 1 200 kcal: 1 150 shows it, 1 200 does not (ACC-B8-2)

### B9 · Finishing onboarding saves the profile and plan, seeds the first … (P0)

- **ACC-B9-1** After finishing, Home shows the plan's targets and Progress shows the first weigh-in
  - Test: src/services/onboarding.test.ts > complete > stores the profile with the plan, one weigh-in at now, the units, the tune-up on from today, and onboarding done (ACC-B9-1)
  - Test: src/features/onboarding/OnboardingRoute.test.tsx > OnboardingRoute > walks the shortest path and finishes: the plan, one weigh-in, the units and the done flag are stored (ACC-B9-1)
  - Test: e2e/onboarding.spec.ts > onboarding and goals (Demo 2) > walks the wizard with the AI as a Custom provider at loopback, edits protein on Plan ready and finds those targets on Home (ACC-B7-2, ACC-B8-1, ACC-B9-1, R01.7, R03.20)
- **ACC-B9-2** An edited plan leaves the weekly tune-up off
  - Test: src/services/onboarding.test.ts > complete > leaves the weekly tune-up off when the plan was changed by hand (ACC-B9-2, R01.7)

### B10 · Restore from a backup file on Welcome (P1)

- **ACC-B10-1** Restoring a complete backup from Welcome lands on Home with its entries
  - Test: src/features/onboarding/RestoreFromFile.test.tsx > RestoreFromFile on Welcome > restores a complete backup after its preview and lands on Home with its entries, seeding nothing (ACC-B10-1)
  - Test: e2e/settings-data.spec.ts > settings and data (Demo 6) > backs up, erases everything and restores from Welcome to the same diary, chat and settings (ACC-K3-1, ACC-K4-1, ACC-K6-1, ACC-B10-1, R06.8)
- **ACC-B10-2** Restoring a backup without a profile continues the wizard and keeps the entries
  - Test: src/features/onboarding/RestoreFromFile.test.tsx > RestoreFromFile on Welcome > continues a backup without a profile at the Sex step, keeping its entries through to the end (ACC-B10-2)

### B11 · Unit defaults from the browser locale (P1)

- **ACC-B11-1** The unit defaults for an en-US browser are kg and ft-in, and kg and cm for en-GB (D-16.91)
  - Test: src/domain/units/defaults.test.ts > defaultUnits > starts en-US, en-LR and my-MM in kg and feet and inches (D-16.91)
  - Test: src/domain/units/defaults.test.ts > defaultUnits > starts every other tag in kg and cm
  - Test: src/domain/profile/profile.test.ts > firstRunDefaults > seeds kg and feet and inches for en-US (D-16.91)
  - Test: src/data/settingsSchema.test.ts > SETTING_SPECS > takes the height unit from the locale, weight always kg and energy always kcal (R01.18, D-16.91)
- **ACC-B11-2** A fresh wizard in an en-US browser shows weight in kg, with height in ft-in (D-16.91)
  - Test: src/features/onboarding/WizardPage.test.tsx > WizardPage > shows weight in kg and height in feet and inches in a fresh wizard in an en-US browser (ACC-B11-2, D-16.91)

### B12 · Personal info in Settings (P1)

- **ACC-B12-1** Saving a weight in Settings adds a weigh-in and updates the profile
  - Test: src/features/settings/profile/WeightSheet.test.tsx > WeightSheet: the current weight > adds one weigh-in for now and changes the profile weight (ACC-B12-1)
  - Test: src/services/profileEdits.test.ts > saveWeight > adds one weigh-in stamped now and moves the profile weight to it (ACC-B12-1)
- **ACC-B12-2** A goal weight on the wrong side is refused with a reason
  - Test: src/features/settings/profile/WeightSheet.test.tsx > WeightSheet: the goal weight (D-16.11) > shows why a lose goal above the current weight is refused and saves nothing (ACC-B12-2)
  - Test: src/services/profileEdits.test.ts > setGoalWeight (D-16.11, D-16.80) > refuses a lose target that is not below the current weight and stores nothing (ACC-B12-2)

### B13 · Calculation methods page in our words with sources and a … (P1)

- **ACC-B13-1** The methods page opens from Plan Ready and from Settings
  - Test: src/features/onboarding/steps/PlanReady.test.tsx > PlanReady > opens the calculation methods in a sheet and closes it with Done
  - Test: src/features/about/MethodsPage.test.tsx > MethodsPage > is registered as an About page in Settings at #/settings/methods
  - Test: src/features/settings/goals/GoalsPage.test.tsx > GoalsPage: switches and links > links to the methods page and opens the nutrient goals

## C · Goals and formulas

### C1 · BMR (Mifflin-St Jeor, or Katch-McArdle with body fat), TDEE with … (P0)

- **ACC-C1-1** The default profile gets 2 452 kcal, 112 g protein, 406 g carbs, 42 g fat
  - Test: src/domain/goals/formulas.test.ts > formulaPlan > gives the default profile 2 452 kcal, 112 g protein, 406 g carbs, 42 g fat (ACC-C1-1)

### C2 · Effective targets (P0)

- **ACC-C2-1** Saving 2 000 kcal and 150 g protein auto-balances carbs 283 g and fat 29 g
  - Test: src/domain/goals/targets.test.ts > effectiveTargets > auto-balances carbs 283 g and fat 29 g for saved 2 000 kcal and 150 g protein (ACC-C2-1)

### C3 · AI plan calculation with strict validation and exact 4/4/9 … (P1)

- **ACC-C3-1** A plan reply of 2 000 / 150 / 215 / 61 is stored as 2 000 / 150 / 215 / 60
  - Test: src/domain/goals/planValidator.test.ts > checkPlan: accepted replies > stores 2 000 / 150 / 215 / 61 as 2 000 / 150 / 215 / 60 (R01.2, ACC-C3-1)
- **ACC-C3-2** An implausible reply leaves the targets unchanged
  - Test: src/services/goals/rebuild.test.ts > rebuild: failures leave the plan as it was > leaves the targets for an implausible plan: protein 300 for this body (ACC-C3-2)

### C4 · Rebuild plan (P1)

- **ACC-C4-1** Rebuild shows the new calorie target and the AI's reason
  - Test: src/services/goals/rebuild.test.ts > rebuild: a stored plan > stores all four targets, clears every lock and returns the kcal and the reason (ACC-C4-1)
  - Test: src/features/settings/goals/GoalsPage.test.tsx > GoalsPage: rebuild plan > words a rebuilt plan: the new target in the display unit and the AI reason (ACC-C4-1)
  - Test: e2e/onboarding.spec.ts > onboarding and goals (Demo 2) > rebuilds the plan from Settings › Goals and nutrition and names the new daily target (ACC-C4-1)
- **ACC-C4-2** Editing the profile while a rebuild runs discards its result
  - Test: src/services/goals/rebuild.test.ts > rebuild: a profile changed during the call (R01.4) > drops the plan when %s changed, leaving targets and locks (R01.4, ACC-C4-2)

### C5 · "Inputs changed" nudge on Rebuild when goal inputs changed since … (P1)

- **ACC-C5-1** After a new weigh-in the Rebuild row shows the nudge; on first open it does not
  - Test: src/features/settings/goals/GoalsPage.test.tsx > GoalsPage: rebuild plan > shows no nudge on first open and shows it after a new weigh-in (ACC-C5-1, R01.12)
  - Test: src/services/goals/targetEdits.test.ts > targetEdits: the rebuild baseline (P01-15) > seeds the baseline silently on first open and keeps it after a change (R01.12)

### C6 · Target editing with a calorie lock and up to two macro locks, … (P1)

- **ACC-C6-1** With calories locked, raising protein lowers carbs and fat and keeps calories
  - Test: src/features/settings/goals/GoalsPage.test.tsx > GoalsPage: targets and locks > keeps calories and lowers carbs and fat when protein rises with calories locked (ACC-C6-1)
  - Test: src/services/goals/targetEdits.test.ts > targetEdits: edits through the lock engine (P01-13) > keeps energy and lowers carbs and fat when protein rises with energy locked (ACC-C6-1)
- **ACC-C6-2** A third macro lock is not added
  - Test: src/domain/goals/locks.test.ts > setMacro > does not add a third macro lock, while the edit still applies (R01.13, ACC-C6-2)

### C7 · Maintenance estimate row (P1)

  - Test: src/features/settings/goals/GoalsPage.test.tsx > GoalsPage: targets and locks > applies an edit to the third macro without locking it (R01.13, ACC-C6-2)
  - Test: src/services/goals/targetEdits.test.ts > targetEdits: edits through the lock engine (P01-13) > applies an edit without adding a third macro lock (R01.13, ACC-C6-2)
- **ACC-C7-1** A target 40 kcal under maintenance reads close to maintenance
  - Test: src/features/settings/goals/GoalsPage.test.tsx > GoalsPage: maintenance estimate > reads a target 40 kcal under the estimate as close to it (ACC-C7-1)

### C8 · Weekly tune-up (Adaptive Goals) (P1)

- **ACC-C8-1** Opening the app 7 days after the last check rebuilds the plan once
  - Test: src/services/goals/tuneUp.test.ts > check: when a check is due (D-16.45) > rebuilds the plan once when the app opens 7 days after the last check (ACC-C8-1)
- **ACC-C8-2** Turning the tune-up off restores the plan from before its first change
  - Test: src/services/goals/tuneUp.test.ts > the plan from before the tune-up (R01.14) > restores the plan from before the first tune-up after two runs (R01.14, ACC-C8-2)
- **ACC-C8-3** While it is on, tapping a target explains why it cannot be edited
  - Test: src/features/settings/goals/GoalsPage.test.tsx > GoalsPage: targets and locks > keeps the rows read-only while the tune-up is on: a tap explains and changes nothing (ACC-C8-3)
  - Test: src/services/goals/targetEdits.test.ts > targetEdits: edits through the lock engine (P01-13) > refuses every edit while the tune-up is on and writes nothing (ACC-C8-3)

### C9 · The evidence sent with a plan request holds only numbers and … (P1)

- **ACC-C9-1** No food name, note or ingredient appears in a plan request
  - Test: src/ai/prompts/plan.test.ts > planPrompt: the evidence > holds no food name, note or ingredient of the logged entries (ACC-C9-1)
  - Test: src/ai/prompts/evidenceText.test.ts > evidenceText: privacy (R01.16, ACC-C9-1) > never contains a food name, note, ingredient, product text, photo or id of the fixture

### C10 · Optional nutrient goals for 29 nutrients with defaults, ranges, … (P1)

- **ACC-C10-1** A typed sodium goal of 2 345 mg is kept exactly
  - Test: src/features/settings/goals/NutrientGoalsSheet.test.tsx > NutrientGoalsSheet: the editor > keeps a typed sodium goal of 2 345 exactly and reopens it in typing mode (ACC-C10-1)
  - Test: src/services/goals/targetEdits.test.ts > targetEdits: switches and nutrient goals > stores a typed nutrient goal exactly and clamps only above 999 999 (ACC-C10-1)
- **ACC-C10-2** An AI refresh that returns only sodium leaves the other goals unchanged
  - Test: src/ai/parse/nutrientGoals.test.ts > readNutrientGoals: only the goals that came back change (R03.25, R01.10) > changes only sodium when the answer gives only sodium (ACC-C10-2)

### C11 · Goal-reached dialog when a new latest weigh-in crosses the goal, … (P1)

- **ACC-C11-1** Logging 79.4 kg with a 79.5 kg lose target shows the dialog once
  - Test: src/features/goals/GoalReachedDialog.test.tsx > GoalReachedDialog > shows the dialog once when 79.4 kg crosses a 79.5 kg lose target (ACC-C11-1, R01.11)
- **ACC-C11-2** A back-dated weigh-in below the target shows nothing
  - Test: src/data/repos/weightRepo.test.ts > addWeighIn (R05.8, R01.11) > keeps the profile weight and raises nothing for a back-dated weigh-in below the target (ACC-C11-2, R01.11)

### C12 · Energy unit kcal or kJ for every display and input, stored as kcal (P1)

- **ACC-C12-1** Switching to kJ shows 8 368 kJ for a 2 000 kcal goal without changing it
  - Test: src/features/settings/app/UnitsSection.test.tsx > UnitsSection > shows Kilojoules and 8,368 kJ for a 2,000 kcal goal once kJ is chosen, and keeps every stored kcal (ACC-C12-1)
  - Test: e2e/settings-data.spec.ts > settings and data (Demo 6) > changes the accent and the units: the page and Home follow at once, a reload keeps them, and no stored value changes (ACC-A9-1, ACC-C12-1, D-16.1)
- **ACC-C12-2** Opening and saving the kJ goal wheel unchanged keeps 2 000 kcal
  - Test: src/domain/units/energy.test.ts > pickerSave > keeps the exact stored kcal when the kJ wheel was not moved (R06.20)
  - Test: src/features/settings/goals/GoalsPage.test.tsx > GoalsPage: targets and locks > shows and edits the energy target in kJ, keeping the exact kcal when untouched (R06.20)
  - Test: src/features/onboarding/steps/PlanReady.test.tsx > PlanReady > shows kJ to a kJ reader and keeps the exact kcal when the wheel is saved untouched (R06.20)

### C13 · Weight forecast (30/60/90-day weights, days to goal, under-logging … (P1)

- **ACC-C13-1** With two food days and two weigh-ins the Coach context lists the forecast
  - Test: src/services/coach/context.test.ts > coachContext: the weight forecast (P01-18) > lists the forecast with two food days and two weigh-ins (ACC-C13-1)

## D · Food logging

### D1 · Diary entry with energy, macros, 23 optional nutrients and 8 … (P0)

- **ACC-D1-1** An entry without sodium shows a dash for sodium, not 0
  - Test: src/features/log/review/MoreNutrition.test.tsx > MoreNutrition > shows each value at the shown amount to 0.1 with its unit, and a dash when unknown (ACC-D1-1)

### D2 · Manual entry (name, energy in your unit, protein, carbs, fat, … (P0)

- **ACC-D2-1** A manual entry appears under its meal and the gauge updates
  - Test: e2e/walking-skeleton.spec.ts > walking skeleton (Demo 1) > a manual entry lands under its meal, moves the gauge, survives a reload and is deleted only after confirming (ACC-D2-1)
- **ACC-D2-2** Energy typed in kJ is stored as kcal
  - Test: src/features/log/ManualSheet.test.tsx > ManualSheet > saves 2 093 kJ as 500 kcal (ACC-D2-2)

### D3 · "+" menu with three default groups (Snap & scan, Describe, Reuse) … (P0)

- **ACC-D3-1** The + menu offers Enter manually
  - Test: src/features/home/HomePage.test.tsx > HomePage > offers Enter manually in the + menu, which opens the manual sheet over Home (ACC-D3-1)
- **ACC-D3-2** The default menu shows the three groups and their methods
  - Test: src/features/log/AddMenu.test.tsx > AddMenu > draws the default menu's three groups as pages with their methods and Back (ACC-D3-2)

### D4 · Photo capture (P1)

- **ACC-D4-1** Picking 12 photos keeps 10 and says so
  - Test: src/features/log/capture/CaptureSheet.test.tsx > CaptureSheet > keeps the first 10 of 12 picked photos and says 2 were left out (ACC-D4-1)
  - Test: src/services/captureDrafts.test.ts > add: up to 10 photos (ACC-D4-1) > keeps the first 10 of 12 picked photos and counts the 2 left out
- **ACC-D4-2** One oversized photo refuses the whole batch
  - Test: src/features/log/capture/CaptureSheet.test.tsx > CaptureSheet > refuses a pick with a 30 MiB photo whole: a message, no card and nothing stored (ACC-D4-2, R02.17)
  - Test: src/services/captureDrafts.test.ts > add: a pick is kept whole or not at all (R02.17) > refuses the whole pick when one file is over 25 MiB, and stores nothing (ACC-D4-2)

### D5 · Analysing overlay with Cancel (P1)

- **ACC-D5-1** Cancel stops the analysis with no error message
  - Test: src/services/analysis.test.ts > Cancel (ACC-D5-1) > stops the request with no error, and lets the photos and the capture record go
  - Test: src/features/log/AnalysisOverlay.test.tsx > AnalysisOverlay > closes on Cancel with no error message, and the tab bar comes back (ACC-D5-1)
- **ACC-D5-2** Retry repeats the same request after a failure
  - Test: src/services/analysis.test.ts > failure and Retry (ACC-D5-2) > shows the failure's message, keeps the photos, and Retry sends the same request again
  - Test: src/features/log/AnalysisOverlay.test.tsx > AnalysisOverlay > shows the failure with Retry, which sends the same request again (ACC-D5-2)

### D6 · Typed meal description with rotating examples (P1)

- **ACC-D6-1** Describing "two eggs and toast" opens the review with the AI's estimate
  - Test: e2e/logging.spec.ts > logging flows (Demo 3) > describes "two eggs and toast", reviews the estimate from the AI and logs it (ACC-D6-1)

### D7 · Review before logging (P1)

- **ACC-D7-1** Changing the time to the evening switches the suggested meal to dinner
  - Test: src/features/log/review/ReviewSheet.test.tsx > ReviewSheet > suggests the meal for the picked time: 08:00 is breakfast and 19:30 dinner (ACC-D7-1, R02.13, D-16.16)
- **ACC-D7-2** Log writes exactly one entry even when tapped twice
  - Test: src/features/log/review/ReviewSheet.test.tsx > ReviewSheet > writes one entry when Log is pressed twice (ACC-D7-2, R02.11)

### D8 · The amount field accepts arithmetic (+ − × ÷) with a calculator row (P1)

- **ACC-D8-1** Typing 50+20 sets the amount to 70 g
  - Test: src/features/log/review/AmountField.test.tsx > AmountField > sets the amount to 70 while 50+20 is typed (ACC-D8-1)
- **ACC-D8-2** An unfinished expression reverts on leaving the field
  - Test: src/features/log/review/AmountField.test.tsx > AmountField > puts an unfinished 50+ back to the amount on leaving the field (ACC-D8-2, R02.22)

### D9 · Serving units (P1)

- **ACC-D9-1** An entry with an unknown weight reopens at its serving count and never shows grams
  - Test: src/domain/servings/scale.test.ts > initialAmount > reopens an unknown weight saved at 2 servings at 2 servings and never shows grams (R02.1)
- **ACC-D9-2** Switching from slices to grams keeps the amount
  - Test: src/features/log/review/ServingCard.test.tsx > ServingCard > keeps the weight when switching from 2 slices of 30 g to grams, which shows 60 (ACC-D9-2)

### D10 · Nutrition unlock on review (P1)

- **ACC-D10-1** Typing 40 g protein at double amount stores 20 g per base amount
  - Test: src/features/log/review/NutritionRows.test.tsx > NutritionRows > stores protein typed at twice the amount as half, and shows what was typed (ACC-D10-1, R02.3)

### D11 · Fit check (what-if) (P1)

- **ACC-D11-1** The fit check shows the day's total with the meal added and how far over or under the goal it is
  - Test: src/features/log/FitCheckSheet.test.tsx > FitCheckSheet: the day with the meal > shows a day at 1,500 of 2,000 plus 700 as +700 and 2,200 / 2,000, 200 over and highlighted (ACC-D11-1)
- **ACC-D11-2** A failed suggestion offers Retry
  - Test: src/features/log/FitCheckSheet.test.tsx > FitCheckSheet: the suggestion > shows the failure with Retry, which asks again at once (ACC-D11-2)

### D12 · Edit a logged entry (P1)

- **ACC-D12-1** Saving an untouched entry keeps its exact time
  - Test: src/features/log/EntryEditor.test.tsx > EntryEditor: Save > keeps loggedAt to the millisecond and every value when an untouched entry is saved (ACC-D12-1, R02.21)
- **ACC-D12-2** Editing calories of a logged entry saves the new value
  - Test: src/features/log/EntryEditor.test.tsx > EntryEditor: Save > saves calories edited through the unlock (ACC-D12-2, D-16.19), at the amount shown
  - Test: e2e/logging.spec.ts > logging flows (Demo 3) > edits an entry's calories from its row through the nutrition lock (ACC-D12-2, D-16.19)
- **ACC-D12-3** Delete asks before removing the entry
  - Test: src/features/log/EntryEditor.test.tsx > EntryEditor: Saved and Delete > asks before deleting, and deletes on Delete (ACC-D12-3)

### D13 · Ingredient lines added by camera, photo, barcode, text, manual or … (P1)

- **ACC-D13-1** Adding a 100 kcal line raises the meal total by 100
  - Test: src/features/log/review/IngredientsCard.test.tsx > IngredientsCard > makes the header the sum when a manual part of 100 kcal is added: 398 + 100 (ACC-D13-1, R02.4)
- **ACC-D13-2** Removing a line scales sodium by the remaining weight
  - Test: src/domain/servings/ingredients.test.ts > applyLineChange > scales sodium by 300/400 when a 100 g line leaves a 400 g meal (R02.4)
  - Test: src/features/log/review/IngredientsCard.test.tsx > IngredientsCard > stretches sodium by the weight left when a part is removed: 400 mg × 300/400 (R02.4, ACC-D13-2)

### D14 · Split into servings (1–50), hidden for portions that were already … (P1)

- **ACC-D14-1** Splitting a 2 kg pot into 8 offers a 250 g serving
  - Test: src/domain/servings/recipe.test.ts > splitRecipe > splits a 2 kg pot into 8: a 250 g serving first, selected with count 1
  - Test: src/features/log/review/IngredientsCard.test.tsx > IngredientsCard: servings in recipe > splits the pot into 4: a serving unit first, one serving of 500 g on screen (ACC-D14-1)
- **ACC-D14-2** A re-logged portion offers no split
  - Test: src/domain/servings/recipe.test.ts > canSplit > refuses a re-logged portion, which would divide the portion again (R02.6)
  - Test: src/features/log/review/IngredientsCard.test.tsx > IngredientsCard: servings in recipe > offers no split for a re-logged portion (ACC-D14-2, R02.6), one part or an unknown weight

### D15 · Combine selected entries into one meal that sums every nutrient … (P1)

- **ACC-D15-1** Combining three entries leaves one entry named after them at the latest time
  - Test: src/services/combine.test.ts > combine > replaces three entries by one named "Toast + Eggs + Tea" at the latest time, in one write (ACC-D15-1, R02.24)
  - Test: src/features/home/SelectionBar.test.tsx > SelectionBar > combines three rows into one named "Toast + Eggs + Tea" at the latest time, then ends picking (ACC-D15-1)
  - Test: src/features/home/HomePage.test.tsx > HomePage: picking and combining rows (P06-19) > combines three picked rows into one entry named "Toast + Eggs + Tea" at the latest time, and the "+" comes back (ACC-D15-1, D-16.20)

### D16 · Recent (30 days) and Often eaten (90 days, grouped by name and … (P1)

- **ACC-D16-1** Searching "cafe" finds "Café latte"
  - Test: src/domain/food/reuse.test.ts > search > finds "Café" for "cafe", and "cafe" for "CAFÉ" (ACC-D16-1)
  - Test: src/features/log/reuse/ReuseSheet.test.tsx > ReuseSheet: search > finds "Café latte" for "cafe", ignoring case, accents and the spaces around (ACC-D16-1)
- **ACC-D16-2** Tapping a recent item opens the review instead of logging at once
  - Test: src/features/log/reuse/ReuseSheet.test.tsx > ReuseSheet: Recent > opens the review with the entry's grams, units, photos and source, and logs nothing (ACC-D16-2)
  - Test: e2e/logging.spec.ts > logging flows (Demo 3) > logs yesterday's food again from Recent, on today, leaving yesterday as it was (ACC-D16-2)

### D17 · Saved meals with their own ids, toggled from the editor and Home … (P1)

- **ACC-D17-1** Two different foods with the same name and calories can both be saved
  - Test: src/data/repos/savedMealsRepo.test.ts > toggleFromEntry > saves two different foods with the same name and calories separately (ACC-D17-1, D-16.17)
- **ACC-D17-2** Reorder buttons are hidden while searching
  - Test: src/features/log/reuse/ReuseSheet.test.tsx > ReuseSheet: Saved > hides the reorder buttons while searching, and keeps remove (ACC-D17-2)

### D18 · Copy a day (P1)

- **ACC-D18-1** Copying yesterday adds new entries today and leaves yesterday unchanged
  - Test: src/services/copyDay.test.ts > copy > copies yesterday onto today with new ids at the clock time, meals kept and yesterday unchanged (ACC-D18-1)
  - Test: src/features/log/CopyDaySheet.test.tsx > CopyDaySheet > copies all of them with the count on the button, keeps their meals and leaves yesterday as it was (ACC-D18-1)
  - Test: src/features/home/HomePage.test.tsx > HomePage: the add menu opens its sheets (P06-01) > copies a day onto the day Home shows, and the copies appear in the diary (ACC-D18-1)

### D19 · Barcode scanning by camera, plus typing the digits (D-16.18) (P1)

- **ACC-D19-1** Typing a barcode looks up the product
  - Test: e2e/logging.spec.ts > logging flows (Demo 3) > looks up typed barcode digits in Open Food Facts and logs the product (ACC-D19-1, ACC-D20-1)
- **ACC-D19-2** Without native barcode support the scanner still works
  - Test: src/services/barcode/decoder.test.ts > watch: the WASM reader (ACC-D19-2) > loads the WASM reader only when the first frame needs it, and once

### D20 · Barcode lookup (P1)

- **ACC-D20-1** A product found by Open Food Facts opens its review
  - Test: src/services/barcode/lookup.test.ts > createBarcodeService > stores an Open Food Facts product with its photo as the analysis draft, then opens its review (ACC-D20-1)
  - Test: src/features/home/HomePage.test.tsx > HomePage: barcodes (P06-14, P06-17) > closes the scanner on typed digits, and a product found opens its review (ACC-D20-1)
  - Test: e2e/logging.spec.ts > logging flows (Demo 3) > looks up typed barcode digits in Open Food Facts and logs the product (ACC-D19-1, ACC-D20-1)
- **ACC-D20-2** A product missing everywhere offers Scan label
  - Test: src/services/barcode/lookup.test.ts > createBarcodeService > offers Scan label after a miss everywhere and holds the code for one analysis (ACC-D20-2, R02.20)
  - Test: src/features/home/HomePage.test.tsx > HomePage: barcodes (P06-14, P06-17) > offers Scan label after a miss, and the label photo runs as that product’s label (ACC-D20-2, R02.20)
  - Test: e2e/logging.spec.ts > logging flows (Demo 3) > offers Scan label for a product Open Food Facts lacks, logs the label, and finds that label on the next scan (ACC-D20-2, ACC-D21-1, R02.15, R02.20)

### D21 · Saved-label memory (P1)

- **ACC-D21-1** Scanning the same unknown barcode again reopens the saved label with a notice
  - Test: src/services/barcode/lookup.test.ts > createBarcodeService > opens a saved label as a label draft marked as such, with its own photo (ACC-D21-1)
  - Test: e2e/logging.spec.ts > logging flows (Demo 3) > offers Scan label for a product Open Food Facts lacks, logs the label, and finds that label on the next scan (ACC-D20-2, ACC-D21-1, R02.15, R02.20)

### D22 · Product information block (barcode, source, package, Nutri-Score, … (P1)

- **ACC-D22-1** A barcode product shows only the fields that have data and are not hidden
  - Test: src/features/log/review/ProductBlock.test.tsx > ProductBlock > shows only the fields with data that are not hidden: a hidden NOVA group stays out (ACC-D22-1)

### D23 · Ingredient label shown with allergen emphasis (P1)

- **ACC-D23-1** Allergens marked by Open Food Facts are shown in bold in the label text
  - Test: src/features/log/review/ProductBlock.test.tsx > ProductBlock > shows Open Food Facts' marked allergens in bold in the label (ACC-D23-1)
  - Test: src/data/codecs.test.ts > other food codecs > keep the marked ingredient list of a product through a stored analysis draft (ACC-D23-1)

### D24 · Allergen line for the profile's sensitivities (P1)

- **ACC-D24-1** With "dairy" listed, a product containing whey shows a possible-allergen line
  - Test: src/domain/food/allergens.test.ts > checkAllergens: the ladder (D24) > finds whey in the ingredient list for "dairy" as a possible allergen (ACC-D24-1)
  - Test: src/features/log/review/AllergenLine.test.tsx > AllergenLine > says "Possible allergen: dairy" for whey in the ingredient list (ACC-D24-1)

### D25 · Analysis drafts survive a reload and reopen the review (D-16.46) (P1)

- **ACC-D25-1** Reloading during the review reopens it with the same values
  - Test: e2e/logging.spec.ts > logging flows (Demo 3) > reopens the review with the same values after a reload, and only until it is logged (ACC-D25-1, D-16.46)

### D26 · One tap logs exactly one entry (P0)

- **ACC-D26-1** Double-tapping Save on manual entry creates one entry
  - Test: src/services/diary.test.ts > logEntry > writes one entry for two rapid calls (R02.11, ACC-D26-1)

### D27 · Food logging is paused during a fast, with End fast and log (D-16.35) (P1)

- **ACC-D27-1** During a fast, Log shows the paused dialog and End fast and log does both
  - Test: src/features/fasting/PausedDialog.test.tsx > the review during a fast (D-16.35) > ends the fast and logs the food in one step with End fast and log (ACC-D27-1)
  - Test: src/features/log/ManualSheet.test.tsx > ManualSheet > ends the fast and stores the entry with End fast and log (ACC-D27-1, D-16.35)
  - Test: src/services/fasting.test.ts > endFastAndLog (D-16.35) > ends the running fast now and stores the food, in one step (ACC-D27-1)
  - Test: e2e/home-progress.spec.ts > Fasting on Home (Demo 4) > pauses a manual entry when a fast starts in another tab; End fast and log does both (ACC-D27-1, R05.1, D-16.35)
- **ACC-D27-2** No path writes food during an active fast
  - Test: src/data/repos/diaryRepo.test.ts > food during a fast > refuses an add while a fast runs and writes nothing (R05.1, R02.12, ACC-D27-2)

### D28 · Stored photos upright, capped at 2 048 px when that saves space, … (P1)

- **ACC-D28-1** Deleting an entry keeps a photo still used by a saved meal
  - Test: src/data/repos/photoRepo.test.ts > releaseIfUnused > keeps a photo shared by an entry and a saved meal when the entry is deleted (ACC-D28-1, R02.8)
- **ACC-D28-2** An undecodable HEIC photo is refused with a message
  - Test: src/services/photos.test.ts > store: one rule for new photos (R02.19) > refuses a photo the browser cannot decode, as HEIC outside Safari, and writes nothing (ACC-D28-2)
  - Test: src/features/log/capture/CaptureSheet.test.tsx > CaptureSheet > says plainly when this browser cannot open a photo, as HEIC outside Safari (ACC-D28-2, D-16.21)

## E · AI providers and analysis

### E1 · 16 bring-your-own-key providers with their wire formats (P1)

- **ACC-E1-1** The provider list shows 16 providers and each offers its presets
  - Test: src/ai/catalog/presets.test.ts > presets per provider (D-16.25, ACC-E1-1) > offers presets for every provider in each picker it appears in, except Custom

### E2 · Gemini, OpenAI-compatible and Anthropic adapters with each … (P1)

- **ACC-E2-1** Every Anthropic request carries the browser-access header
  - Test: src/ai/adapters/anthropic.test.ts > buildAnthropic: headers (R03.1) > sends the browser-access header, the key and the version on every request (ACC-E2-1)
- **ACC-E2-2** OpenAI requests use the newer token-limit parameter
  - Test: src/ai/adapters/openaiCompat.test.ts > tokenLimitField (R03.10) > gives OpenAI max_completion_tokens for every model (ACC-E2-2)

### E3 · Vision primary, optional text provider, image standby and text standby (P1)

- **ACC-E3-1** A typed description goes to the text provider when one is set; photos always go to the primary
  - Test: src/ai/settings.test.ts > roleFor: who serves a request (03 §3.3, ACC-E3-1) > sends a photo request to the primary even with a text provider switched on
- **ACC-E3-2** Two Ollama servers can be primary and standby at once
  - Test: src/ai/settings.test.ts > standbyFor: when a standby may run (R03.5) > lets two Ollama servers run the same model as primary and standby (ACC-E3-2)

### E4 · Retry 429/503/529 at 1, 2 and 4 s on every format (P1)

- **ACC-E4-1** A busy provider is retried three times before the busy message
  - Test: src/ai/retry.test.ts > withRetries: the ladder (03 §3.9, D-16.23) > gives the busy message after four 503 replies and no fifth request (ACC-E4-1)
- **ACC-E4-2** No analysis waits longer than the timeout setting
  - Test: src/ai/deadline.test.ts > one time limit for the whole action (D-16.23, R03.6, ACC-E4-2) > ends a four-attempt ladder early, at 180 s exactly

### E5 · The standby also runs when the primary's answer fails validation, … (P1)

- **ACC-E5-1** An unreadable answer from the primary is rescued by the standby
  - Test: src/ai/client.test.ts > complete: the standby (D-16.22, R03.4) > tries the standby when the primary answer fails validation, and returns its value (ACC-E5-1)

### E6 · Cut-off answers are detected and re-asked once in a compact form (P1)

- **ACC-E6-1** A cut-off answer is re-asked once and then succeeds
  - Test: src/ai/client.test.ts > complete: a cut-off answer is asked for once more (03 §3.8) > asks once more with the compact note and returns that answer (ACC-E6-1)

### E7 · Photos prepared upright, at most 1 600 px, JPEG 0.8, never … (P1)

- **ACC-E7-1** A 3 200 × 1 200 photo is sent at 1 600 × 600
  - Test: src/ai/image.test.ts > prepareImage: size (03 §3.5) > sends a 3 200 × 1 200 photo at 1 600 × 600 (ACC-E7-1)

### E8 · Food answers parsed tolerantly (P1)

- **ACC-E8-1** An answer wrapped in prose and a code fence is still read
  - Test: src/ai/parse/json.test.ts > parseModelJson: answers wrapped in prose or a fence (R03.13, ACC-E8-1) > reads an answer wrapped in prose and a plain fence with a language word
- **ACC-E8-2** A breakdown that does not add up is dropped and the totals kept
  - Test: src/ai/parse/parts.test.ts > readParts: a breakdown that does not add up is dropped and the totals kept (ACC-E8-2) > drops a breakdown covering 0.4 of the meal kcal

### E9 · A second request for serving units only for zero-energy foods with … (P1)

- **ACC-E9-1** Black coffee without units gets a unit list from one extra request; pizza does not trigger one
  - Test: src/ai/tasks/food.test.ts > analyzePhotos: the unit repair request (R03.17, ACC-E9-1) > asks once more for the units of black coffee and applies them (ACC-E9-1)
  - Test: src/ai/tasks/food.test.ts > analyzePhotos: the unit repair request (R03.17, ACC-E9-1) > does not ask again for a pizza without units (ACC-E9-1)

### E10 · Every AI failure shown as one friendly message per kind, never the … (P1)

- **ACC-E10-1** A refused key shows the paste-a-valid-key message
  - Test: src/ai/errors.test.ts > messages (ACC-E10-1, ACC-E10-2) > shows the paste-a-valid-key message for a refused key (ACC-E10-1)
- **ACC-E10-2** A provider error body never appears on screen
  - Test: src/ai/errors.test.ts > messages (ACC-E10-1, ACC-E10-2) > never shows the provider body, whatever its shape (ACC-E10-2)

### E11 · Notes for the AI sent in the system message of every request (D-16.24) (P1)

- **ACC-E11-1** Notes reach the primary, the standby and the compact re-ask
  - Test: src/ai/client.test.ts > complete: notes for the AI in the system channel (D-16.24, R03.23) > sends the notes to the primary, the re-ask and the standby (ACC-E11-1)

### E12 · Answer length limit for every provider (default 1 024 tokens) and … (P1)

- **ACC-E12-1** The token limit setting is visible with Gemini selected
  - Test: src/features/settings/ai/AiPage.test.tsx > AiPage > shows the answer length limit with Gemini as the main provider, and stores a new one (ACC-E12-1, R03.9)

### E13 · Server URLs (P1)

- **ACC-E13-1** An http address on the local network is refused with the reason
  - Test: src/features/ai-setup/ProviderForm.test.tsx > ProviderForm > refuses http://10.0.0.2:11434/v1 and says why (ACC-E13-1, D-16.26, R03.3)
  - Test: src/features/onboarding/steps/AiAccess.test.tsx > AiAccess > refuses a plain-http server on the local network with the reason and holds Continue (ACC-E13-1)
- **ACC-E13-2** An Ollama model tag can be typed freely
  - Test: src/ai/catalog/presets.test.ts > resolveModel: a saved pick > keeps an Ollama tag typed freely (R03.21, ACC-E13-2)

### E14 · Keys kept in a separate local store, trimmed, shown masked, never … (P1)

- **ACC-E14-1** A saved key shows only its first and last four characters
  - Test: src/data/repos/secretsRepo.test.ts > mask (ACC-E14-1) > shows the first four and the last four characters of a 40-character key
  - Test: src/features/ai-setup/KeyField.test.tsx > KeyField > shows a saved key masked, never whole, and offers to replace it (ACC-E14-1)
- **ACC-E14-2** A backup file never contains a key
  - Test: src/services/backup/backup.test.ts > makeBackup > never holds a key, the rows kept aside or this device’s state (ACC-E14-2, R06.7)
  - Test: src/services/backup/plantedKey.test.ts > backup: no key in any output (P10-09, ACC-E14-2, D-16.30) > hands over (%s) a file with no stored key in its bytes, its decoded Blobs or its photos
  - Test: src/services/backup/plantedKey.test.ts > backup: no key in any output (P10-09, ACC-E14-2, D-16.30) > restores on another device without any key, and leaves that device’s own keys as they were

## F · Home and day view

### F1 · Week bar of 53 weeks starting on the chosen weekday (P1)

- **ACC-F1-1** Selecting last Monday shows that day's diary
  - Test: src/features/home/HomePage.test.tsx > HomePage: the selected day (P07-01, P07-02) > shows the week bar on today, and last Monday's diary and summary once it is selected (ACC-F1-1)
  - Test: e2e/home-progress.spec.ts > Home: days, pillars and the diary (Demo 4) > logs water on last Tuesday and on yesterday from the week bar, never on today (ACC-H3-2, ACC-H1-1, ACC-H4-1, ACC-F1-1, ACC-F1-2, ACC-F9-1, ACC-F11-1, R05.4, R05.9)
- **ACC-F1-2** Tomorrow cannot be selected
  - Test: src/features/home/WeekBar.test.tsx > WeekBar > shows the days after today but never selects them: tomorrow is disabled (ACC-F1-2, D-16.36)
  - Test: e2e/home-progress.spec.ts > Home: days, pillars and the diary (Demo 4) > logs water on last Tuesday and on yesterday from the week bar, never on today (ACC-H3-2, ACC-H1-1, ACC-H4-1, ACC-F1-1, ACC-F1-2, ACC-F9-1, ACC-F11-1, R05.4, R05.9)

### F2 · Swipe the day summary to change day, never past today (P1)

- **ACC-F2-1** Swiping right shows yesterday; swiping left on today does nothing
  - Test: src/features/home/DaySwipe.test.tsx > DaySwipe > shows yesterday after a swipe of 100 px toward the right (ACC-F2-1)
  - Test: src/features/home/DaySwipe.test.tsx > DaySwipe > never moves past today: a swipe toward the left on today does nothing (ACC-F2-1)
  - Test: src/features/home/HomePage.test.tsx > HomePage: the selected day (P07-01, P07-02) > shows yesterday after a swipe toward the right on the summary; toward the left on today does nothing (ACC-F2-1)
  - Test: e2e/home-progress.spec.ts > Home: days, pillars and the diary (Demo 4) > swipes the summary to yesterday and back, never past today (ACC-F2-1)

### F3 · Energy gauge with the eaten amount and left, over, goal reached or … (P0)

- **ACC-F3-1** With 1 200 of 2 000 kcal eaten the gauge reads 800 left
  - Test: src/features/home/DaySummary.test.tsx > DaySummary gauge > reads 800 left with 1 200 of 2 000 kcal eaten, and sweeps 108° (ACC-F3-1)
- **ACC-F3-2** Over the goal the gauge stays full and reads the excess
  - Test: src/features/home/DaySummary.test.tsx > DaySummary gauge > stays full and reads 100 over at 2 100 of 2 000 kcal (ACC-F3-2)

### F4 · Nutrient pillars (P0)

- **ACC-F4-1** Home shows protein, carbs, fat and fibre pillars by default
  - Test: src/features/home/DaySummary.test.tsx > DaySummary pillars > shows protein, carbs, fat and fibre against their goals, in that order (ACC-F4-1)
  - Test: e2e/home-progress.spec.ts > Home: days, pillars and the diary (Demo 4) > chooses pillars from All nutrients: a fifth pick takes the latest place, and Done keeps it (ACC-F4-1, ACC-F5-1, ACC-F6-1)
- **ACC-F4-2** A sodium pillar shows how far over its limit the day is
  - Test: src/features/home/PillarRow.test.tsx > PillarRow > shows 200 mg over on a sodium pillar with a goal of 2 300 and 2 500 eaten (ACC-F4-2)

### F5 · Pillar picker (P1)

- **ACC-F5-1** Choosing a fifth nutrient replaces the most recent choice
  - Test: src/features/home/PillarPicker.test.tsx > PillarPicker > replaces the latest pick when a fifth nutrient is picked (ACC-F5-1)
  - Test: src/features/home/HomePage.test.tsx > HomePage: pillars and the day's nutrients (P07-03, P07-04) > chooses pillars over the sheet: Done stores them and Home shows them (ACC-F5-1)
  - Test: e2e/home-progress.spec.ts > Home: days, pillars and the diary (Demo 4) > chooses pillars from All nutrients: a fifth pick takes the latest place, and Done keeps it (ACC-F4-1, ACC-F5-1, ACC-F6-1)

### F6 · All-nutrients sheet for the selected day (P1)

- **ACC-F6-1** The sheet lists every nutrient for the selected day with its goal
  - Test: src/features/home/DayNutrientsSheet.test.tsx > DayNutrientsSheet > lists every nutrient of the day with its unit and its goal (ACC-F6-1)
  - Test: src/features/home/HomePage.test.tsx > HomePage: pillars and the day's nutrients (P07-03, P07-04) > opens the shown day's nutrients from All nutrients: yesterday's while yesterday is shown (ACC-F6-1)
  - Test: e2e/home-progress.spec.ts > Home: days, pillars and the diary (Demo 4) > chooses pillars from All nutrients: a fifth pick takes the latest place, and Done keeps it (ACC-F4-1, ACC-F5-1, ACC-F6-1)

### F7 · Diary grouped by meal with food-only section totals (P0)

- **ACC-F7-1** Entries appear under their meal with that meal's total
  - Test: src/features/home/Diary.test.tsx > Diary > shows a 300 kcal breakfast under Breakfast with the section total 300 (ACC-F7-1)
  - Test: e2e/home-progress.spec.ts > Home: days, pillars and the diary (Demo 4) > sorts the diary newest first, where breakfast comes back, and by meal again (ACC-F7-1, ACC-F7-2)
- **ACC-F7-2** Newest first shows repeated meal sections in time order
  - Test: src/features/home/Diary.test.tsx > Diary: water, fasts and the sort order (P07-05) > shows repeated meal sections in time order when sorted newest first (ACC-F7-2)
  - Test: src/features/home/HomePage.test.tsx > HomePage: water and fasts (P07-05, P07-08) > stores the sort order from the first header; newest first shows a meal again (ACC-F7-2)
  - Test: e2e/home-progress.spec.ts > Home: days, pillars and the diary (Demo 4) > sorts the diary newest first, where breakfast comes back, and by meal again (ACC-F7-1, ACC-F7-2)

### F8 · Water and fast rows in the diary (P1)

- **ACC-F8-1** A fast from 20:00 to 12:00 shows on the second day only
  - Test: src/domain/meals/diary.test.ts > fastsOnDay > shows a fast from 20:00 to 12:00 the next day on the second day only (R05.21, ACC-F8-1)
  - Test: src/features/home/HomePage.test.tsx > HomePage: water and fasts (P07-05, P07-08) > shows the day's water and fasts with both trackers off, a fast over midnight on its end day only, and no tracker in the menu (R05.9, R05.21, ACC-F8-1)
- **ACC-F8-2** The active fast row counts up every second
  - Test: src/features/home/FastRow.test.tsx > FastRow > advances by one second with fake timers (ACC-F8-2)
  - Test: e2e/home-progress.spec.ts > Fasting on Home (Demo 4) > starts, cancels and ends fasts from the + menu, which holds only Fasting while one runs (ACC-H6-1, ACC-H7-1, ACC-F11-2, ACC-F8-2, R05.21)

### F9 · Swipe to delete diary rows, always with a confirmation (P1)

- **ACC-F9-1** Swiping a water row asks before deleting it
  - Test: src/features/home/WaterRow.test.tsx > WaterRow > asks before deleting on a swipe, and keeps the log on Cancel (ACC-F9-1)
  - Test: src/features/home/WaterRow.test.tsx > WaterRow > deletes the log once Delete is confirmed (ACC-F9-1)
  - Test: src/features/home/HomePage.test.tsx > HomePage: water and fasts (P07-05, P07-08) > asks before deleting a water row and removes it once confirmed (ACC-F9-1)
  - Test: e2e/home-progress.spec.ts > Home: days, pillars and the diary (Demo 4) > logs water on last Tuesday and on yesterday from the week bar, never on today (ACC-H3-2, ACC-H1-1, ACC-H4-1, ACC-F1-1, ACC-F1-2, ACC-F9-1, ACC-F11-1, R05.4, R05.9)

### F10 · Empty-day message (P0)

- **ACC-F10-1** A day without entries shows the empty message
  - Test: src/features/home/Diary.test.tsx > Diary > shows the empty card on a day with nothing logged (ACC-F10-1)
  - Test: src/features/home/HomePage.test.tsx > HomePage > shows the empty card on a day with nothing logged (ACC-F10-1)

### F11 · "+" button opening food methods, Water and fasting entries (P0)

- **ACC-F11-1** With water tracking on, the + menu has a Water page that logs a preset at once
  - Test: src/features/water/WaterMenuPage.test.tsx > WaterMenuPage > logs 500 ml on the selected day at once, confirms it and is done (ACC-F11-1)
  - Test: src/features/log/AddMenu.test.tsx > AddMenu: water and fasting (P07-08) > opens the water page inside the menu, where a preset logs on the day shown at once (ACC-F11-1, ACC-H1-1)
  - Test: e2e/home-progress.spec.ts > Home: days, pillars and the diary (Demo 4) > logs water on last Tuesday and on yesterday from the week bar, never on today (ACC-H3-2, ACC-H1-1, ACC-H4-1, ACC-F1-1, ACC-F1-2, ACC-F9-1, ACC-F11-1, R05.4, R05.9)
- **ACC-F11-2** During a fast the + menu shows only water and fasting entries
  - Test: src/features/log/AddMenu.test.tsx > AddMenu: water and fasting (P07-08) > shows only Water and Fasting while a fast runs: no food group or method (ACC-F11-2)
  - Test: src/features/home/HomePage.test.tsx > HomePage: water and fasts (P07-05, P07-08) > starts a fast from the + menu; while it runs the menu holds only Fasting, which ends it (ACC-H6-1, ACC-F11-2)
  - Test: e2e/home-progress.spec.ts > Fasting on Home (Demo 4) > starts, cancels and ends fasts from the + menu, which holds only Fasting while one runs (ACC-H6-1, ACC-H7-1, ACC-F11-2, ACC-F8-2, R05.21)

### F12 · Long-press multi-select with a combine bar (P1)

- **ACC-F12-1** Long-pressing a row enters selection mode and shows the combine bar
  - Test: src/features/home/EntryRow.test.tsx > EntryRow: on Home (P06-19) > starts picking after a press held still for half a second, and the click that ends it does nothing more (ACC-F12-1)
  - Test: src/features/home/HomePage.test.tsx > HomePage: picking and combining rows (P06-19) > starts picking on a long-press: the bar with the count, Cancel and Combine takes the place of "+" (ACC-F12-1)
  - Test: src/features/home/SelectionBar.test.tsx > SelectionBar > says how many rows are picked and offers Combine from two (ACC-F12-1)
  - Test: e2e/home-progress.spec.ts > Fasting on Home (Demo 4) > pauses a combine during a fast; End fast and log ends it and combines (ACC-F12-1, R05.1, D-16.35)

### F14 · Sugar on Home against the sugar limit (P1, P16)

- **ACC-F14-1** Home shows the shown day's sugar against the Sugar limit with a thin bar; past it the bar is full and "over" shows in the warning colour; with the limit off, the grams alone
  - Test: src/features/home/SugarLine.test.tsx > SugarLine (D-16.98) > reads the grams against the limit, with a bar filled that far
  - Test: src/features/home/SugarLine.test.tsx > SugarLine (D-16.98) > says how far over past the limit, with the bar full, both in the warning colour
  - Test: src/features/home/SugarLine.test.tsx > SugarLine (D-16.98) > shows the grams alone, with no bar and never over, while the limit is off
  - Test: src/features/home/DaySummary.test.tsx > DaySummary Sugar line (D-16.98) > sits under the pillars, above All nutrients, against the Sugar limit of the goals
  - Test: src/features/home/HomePage.test.tsx > HomePage: the Sugar line (D-16.98) > shows the shown day's sugar, opens All nutrients from it, and its switch there hides it
- **ACC-F14-2** A food without a sugar figure never counts as 0 g ("from n of m foods", "No sugar figures")
  - Test: src/domain/nutrients/sugar.test.ts > sugarOfDay (D-16.98) > never counts a food without a sugar figure as 0 g: it is left out and counted apart
  - Test: src/features/home/SugarLine.test.tsx > SugarLine (D-16.98) > says from how many foods when some have no sugar figure, never counting them as 0 g
  - Test: src/features/home/SugarLine.test.tsx > SugarLine (D-16.98) > says there are no sugar figures, with no number and no bar, when no food has one
  - Test: e2e/home-progress.spec.ts > Home: days, pillars and the diary (Demo 4) > chooses pillars from All nutrients: a fifth pick takes the latest place, and Done keeps it (ACC-F4-1, ACC-F5-1, ACC-F6-1)
- **ACC-F14-3** Added sugar shows when any food has the figure
  - Test: src/features/home/SugarLine.test.tsx > SugarLine (D-16.98) > adds the added sugar when any food carries it, after the rest, in reading order
- **ACC-F14-4** The Sugar line is hidden while Sugar is a pillar, and the Sugar on Home switch (on by default) turns it off
  - Test: src/features/home/DaySummary.test.tsx > DaySummary Sugar line (D-16.98) > is hidden while Sugar is one of the pillars, which shows it instead
  - Test: src/features/home/DaySummary.test.tsx > DaySummary Sugar line (D-16.98) > is hidden while its switch is off
  - Test: src/features/home/DayNutrientsSheet.test.tsx > DayNutrientsSheet > has the Sugar on Home switch under Choose pillars, showing the stored value (D-16.98)
  - Test: src/features/home/HomePage.test.tsx > HomePage: the Sugar line (D-16.98) > is hidden while Sugar is a pillar, and on a day with nothing eaten
  - Test: src/data/settingsSchema.test.ts > SETTING_SPECS > shows the Sugar line on Home until the person turns it off (D-16.98)
  - Test: e2e/home-progress.spec.ts > Home: days, pillars and the diary (Demo 4) > chooses pillars from All nutrients: a fifth pick takes the latest place, and Done keeps it (ACC-F4-1, ACC-F5-1, ACC-F6-1)
- **ACC-F14-5** The Coach's fresh context gives today's sugar and the limit, and how many entries had a figure
  - Test: src/services/coach/context.test.ts > coachContext: today's sugar against the Sugar limit (D-16.98) > says how many entries had a figure when not all did, never counting the rest as 0 g
  - Test: src/services/coach/context.test.ts > coachContext: today's sugar against the Sugar limit (D-16.98) > says sugar is not known, rather than 0 g, when no entry today has a figure
  - Test: src/services/coach/snapshot.test.ts > takeSnapshot (R04.22) > copies the Sugar limit from Nutrient goals, 0 while it is off (D-16.98)

## G · Progress, weight and body fat

### G1 · Ranges 1W, 1M, 3M, 6M, 1Y and All with period arrows and labels (P1)

- **ACC-G1-1** The back arrow on 1M shows the previous 30 days with its label
  - Test: src/features/progress/RangeBar.test.tsx > RangeBar > shows the previous 30 days and their dates after the back arrow on 1M (ACC-G1-1)

### G2 · Metric switch between Weight and Body Fat (P1)

- **ACC-G2-1** Body Fat is offered only after a reading or a body-fat goal exists
  - Test: src/features/progress/ProgressPage.test.tsx > ProgressPage > offers no Body fat without a reading, a profile value or a goal (ACC-G2-1)
  - Test: src/features/progress/ProgressPage.test.tsx > ProgressPage > offers Body fat after Weight once only a body-fat goal exists (ACC-G2-1)

### G3 · Weight card (P1)

- **ACC-G3-1** The weight chart shows the goal line and a tooltip when pressed
  - Test: src/ui/charts/LineChart.test.tsx > LineChart > draws the goal line and shows a tooltip on the nearest point while pressed and dragged (ACC-G3-1)
  - Test: e2e/home-progress.spec.ts > Progress (Demo 4) > logs a weight for last Tuesday in kg and shows it on the 1M chart, keeping today's as Current (ACC-G4-1, ACC-G4-2, ACC-G3-1, R05.5, R05.11, R05.16)
- **ACC-G3-2** A change under 0.05 kg reads 0.0 without a sign
  - Test: src/features/progress/WeightCard.test.tsx > WeightCard > shows 0.0 without a sign for a net change of −0.04 kg (ACC-G3-2)
  - Test: src/domain/progress/ranges.test.ts > changeToTenth > reads a change closer to zero than 0.05 as 0, never −0 (ACC-G3-2)

### G4 · Log weight (P1)

- **ACC-G4-1** A weight logged for last week lands on that day without changing the current weight
  - Test: src/features/progress/LogWeightSheet.test.tsx > LogWeightSheet > logs a weight for last week on that day at the current clock time, keeping the current weight (ACC-G4-1)
  - Test: src/services/progress.test.ts > logWeight > puts an earlier day at the current clock time and keeps the newer profile weight (ACC-G4-1)
  - Test: e2e/home-progress.spec.ts > Progress (Demo 4) > logs a weight for last Tuesday in kg and shows it on the 1M chart, keeping today's as Current (ACC-G4-1, ACC-G4-2, ACC-G3-1, R05.5, R05.11, R05.16)
- **ACC-G4-2** The Log weight sheet weighs in kg with no unit toggle, also for a person who chose lb before (D-16.91)
  - Test: src/features/progress/LogWeightSheet.test.tsx > LogWeightSheet > weighs in kg with no unit toggle, even for a person whose stored unit is lb (ACC-G4-2, R05.11, D-16.91)
  - Test: e2e/home-progress.spec.ts > Progress (Demo 4) > logs a weight for last Tuesday in kg and shows it on the 1M chart, keeping today's as Current (ACC-G4-1, ACC-G4-2, ACC-G3-1, R05.5, R05.11, R05.16)

### G5 · Body-fat card and Log body fat (3–60 % in 0.5 steps) (P1)

- **ACC-G5-1** Logging 18.5 % updates the body-fat card and the profile
  - Test: src/features/progress/BodyFatCard.test.tsx > LogBodyFatSheet > saves 18.5 % stamped now and moves the profile body fat and the card to it (ACC-G5-1)

### G6 · Weight and body-fat histories, newest first, delete with … (P1)

- **ACC-G6-1** Deleting a weigh-in asks first and removes it from the list at once
  - Test: src/features/progress/HistorySheet.test.tsx > HistorySheet > takes the row out of the open list at once, before the store answers (ACC-G6-1, R05.22)
  - Test: e2e/home-progress.spec.ts > Progress (Demo 4) > deletes a weigh-in from the history only after confirming, and Current follows (ACC-G6-1, ACC-G7-1, R05.8, R05.22)

### G7 · The profile's weight and body fat follow the latest reading (P1)

- **ACC-G7-1** Deleting the latest weigh-in sets the profile weight to the previous one
  - Test: src/data/repos/weightRepo.test.ts > deleteWeighIn (R05.8) > sets the profile weight to the previous reading when the latest is deleted (ACC-G7-1, R05.8)
  - Test: e2e/home-progress.spec.ts > Progress (Demo 4) > deletes a weigh-in from the history only after confirming, and Current follows (ACC-G6-1, ACC-G7-1, R05.8, R05.22)

### G8 · Weekly recap of the last completed week against the one before, … (P1)

- **ACC-G8-1** The recap shows days logged out of 7 and the change from the week before
  - Test: src/features/progress/RecapCard.test.tsx > RecapCard > recaps the last week that ended: days logged of 7 with the change from the week before (ACC-G8-1, R05.19)
  - Test: e2e/home-progress.spec.ts > Progress (Demo 4) > recaps last week logged through the week bar in its tiles, and Count today moves the calorie average (ACC-G8-1, ACC-G8-2, ACC-G9-1, R05.17, R05.19)
- **ACC-G8-2** At most three highlights appear, improvements only
  - Test: src/features/progress/RecapCard.test.tsx > RecapCard > names a step forward and never a step back (ACC-G8-2)
  - Test: src/features/progress/RecapCard.test.tsx > RecapCard > shows at most three lines, the first three in their order (ACC-G8-2, R05.19)
  - Test: src/domain/progress/recap.test.ts > highlightsFor > keeps the first three in their order when more improved (R05.19, ACC-G8-2)
  - Test: src/domain/progress/recap.test.ts > highlightsFor > never names a step back (ACC-G8-2)
  - Test: e2e/home-progress.spec.ts > Progress (Demo 4) > recaps last week logged through the week bar in its tiles, and Count today moves the calorie average (ACC-G8-1, ACC-G8-2, ACC-G9-1, R05.17, R05.19)

### G9 · Count-today switch for the nutrition charts (P1)

- **ACC-G9-1** Turning off Count today removes today's partial day from the averages
  - Test: src/domain/progress/averages.test.ts > windowNutrition > Count today (ACC-G9-1, R05.17) > leaves today's partial day out of the bars and every average when it is not
  - Test: src/features/progress/NutritionCards.test.tsx > NutritionCards > takes out the partial today when Count today is turned off on the page (ACC-G9-1, R05.17)
  - Test: e2e/home-progress.spec.ts > Progress (Demo 4) > recaps last week logged through the week bar in its tiles, and Count today moves the calorie average (ACC-G8-1, ACC-G8-2, ACC-G9-1, R05.17, R05.19)

### G10 · Calorie history bars with a goal line and inspector (P1)

- **ACC-G10-1** A full year of bars fits the chart and the last day can be inspected
  - Test: src/ui/charts/BarChart.test.tsx > BarChart > fits a full year of bars inside a 360 px plot and inspects the last day (ACC-G10-1, R05.15)

### G11 · Macro and nutrient averages per logged day (P1)

- **ACC-G11-1** Averages divide by days with entries, not by every day in the range
  - Test: src/domain/progress/averages.test.ts > windowNutrition > averages per logged day (ACC-G11-1, R05.17) > divides the macros by the days with food, not by the days of the window
  - Test: src/features/progress/NutritionCards.test.tsx > NutritionCards > divides the averages by the days with food, not by the days of the period (ACC-G11-1)

## H · Water and fasting

### H1 · Water tracking switch (off by default), daily goal, ml or fl oz (P1)

- **ACC-H1-1** Turning water tracking on adds the water pillar and the Water page in the + menu
  - Test: src/features/settings/tracking/TrackingPage.test.tsx > TrackingPage > adds the water pillar on Home once water is turned on, and a log from the water page fills it (ACC-H1-1)
  - Test: src/features/log/AddMenu.test.tsx > AddMenu: water and fasting (P07-08) > offers Water, then Start fast, under a hairline while each is tracked (ACC-H1-1, ACC-H6-1)
  - Test: src/features/home/HomePage.test.tsx > HomePage: water and fasts (P07-05, P07-08) > logs a custom amount from the + menu's water page on the sheet over Home (ACC-H1-1)
  - Test: e2e/home-progress.spec.ts > Home: days, pillars and the diary (Demo 4) > logs water on last Tuesday and on yesterday from the week bar, never on today (ACC-H3-2, ACC-H1-1, ACC-H4-1, ACC-F1-1, ACC-F1-2, ACC-F9-1, ACC-F11-1, R05.4, R05.9)

### H2 · Three quick-add amounts (1–5 000 ml) that keep exact values … (P1)

- **ACC-H2-1** 250 ml stays 250 ml after editing in fl oz without touching it
  - Test: src/features/water/PresetsEditor.test.tsx > PresetsEditor > keeps 250 ml exactly through a save in fl oz when no field is touched (R05.10, ACC-H2-1)

### H3 · Log water by quick amount or a custom amount up to 5 000 ml on the … (P1)

- **ACC-H3-1** A custom amount of 6 000 ml is refused
  - Test: src/features/water/CustomWaterSheet.test.tsx > CustomWaterSheet > refuses 6 000 ml with a message naming 5,000 ml and stores nothing (ACC-H3-1, R05.10, D-16.39)
  - Test: src/services/water.test.ts > logWater > refuses more than 5 000 ml, nothing, and part of a ml, storing nothing (ACC-H3-1, D-16.39)
- **ACC-H3-2** Water logged while yesterday is selected lands on yesterday
  - Test: e2e/home-progress.spec.ts > Home: days, pillars and the diary (Demo 4) > logs water on last Tuesday and on yesterday from the week bar, never on today (ACC-H3-2, ACC-H1-1, ACC-H4-1, ACC-F1-1, ACC-F1-2, ACC-F9-1, ACC-F11-1, R05.4, R05.9)

### H4 · Water pillar and water section in the all-nutrients sheet (P1)

- **ACC-H4-1** The water pillar shows today's amount against the goal
  - Test: src/features/home/PillarRow.test.tsx > PillarRow > shows the day's water against the daily goal in the water unit (ACC-H4-1)
  - Test: src/features/home/HomePage.test.tsx > HomePage: pillars and the day's nutrients (P07-03, P07-04) > shows the stored pillars, then water with the shown day's logs while it is tracked (ACC-H4-1)
  - Test: e2e/home-progress.spec.ts > Home: days, pillars and the diary (Demo 4) > logs water on last Tuesday and on yesterday from the week bar, never on today (ACC-H3-2, ACC-H1-1, ACC-H4-1, ACC-F1-1, ACC-F1-2, ACC-F9-1, ACC-F11-1, R05.4, R05.9)

### H5 · Water reminder with a time picker, default 14 (P1)

- **ACC-H5-1** A water reminder set for 15:00 shows at 15:00 while the app is open
  - Test: src/services/reminders/engine.test.ts > createReminderEngine: daily reminders > shows a water reminder set for 15:00 at 15:00 while the app is open (ACC-H5-1)

### H6 · Fasting tracking switch (off by default) and a default goal of … (P1)

- **ACC-H6-1** Turning fasting on offers Start fast in the + menu
  - Test: src/features/fasting/FastingSettings.test.tsx > FastingSettings > shows the default goal of 16 hours once fasting is on (ACC-J10-1, ACC-H6-1)
  - Test: src/features/log/AddMenu.test.tsx > AddMenu: water and fasting (P07-08) > offers Water, then Start fast, under a hairline while each is tracked (ACC-H1-1, ACC-H6-1)
  - Test: src/features/home/HomePage.test.tsx > HomePage: water and fasts (P07-05, P07-08) > starts a fast from the + menu; while it runs the menu holds only Fasting, which ends it (ACC-H6-1, ACC-F11-2)
  - Test: e2e/home-progress.spec.ts > Fasting on Home (Demo 4) > starts, cancels and ends fasts from the + menu, which holds only Fasting while one runs (ACC-H6-1, ACC-H7-1, ACC-F11-2, ACC-F8-2, R05.21)

### H7 · Start, end and cancel a fast from the + menu (P1)

- **ACC-H7-1** Starting a 16 h fast shows it as active; cancelling removes it from history
  - Test: src/features/fasting/StartFastSheet.test.tsx > StartFastSheet > opens on the default 16 hours and starts a running fast now (ACC-H7-1)
  - Test: src/features/fasting/FastEditor.test.tsx > FastEditor > cancels a running fast so it leaves no history (ACC-H7-1)
  - Test: e2e/home-progress.spec.ts > Fasting on Home (Demo 4) > starts, cancels and ends fasts from the + menu, which holds only Fasting while one runs (ACC-H6-1, ACC-H7-1, ACC-F11-2, ACC-F8-2, R05.21)

### H8 · Fast editor (P1)

- **ACC-H8-1** End fast now applies the edited start and ends the fast in one step
  - Test: src/data/repos/fastRepo.test.ts > endNow (R05.3) > applies the edited start and ends the fast in one step (ACC-H8-1, R05.3)
  - Test: src/features/fasting/FastEditor.test.tsx > FastEditor > applies the edited start and goal and ends the fast now in one write (ACC-H8-1, R05.3)

### H9 · One active fast, no overlaps, an end never before the start (P1)

- **ACC-H9-1** Editing a fast to overlap another shows the overlap message and changes nothing
  - Test: src/features/fasting/FastEditor.test.tsx > FastEditor > refuses an edit that overlaps another fast: says so with a hint and changes nothing (ACC-H9-1, R05.3)

### H10 · Turning fasting off ends the active fast (P1)

- **ACC-H10-1** Switching fasting off ends the active fast and food logging works again
  - Test: src/data/repos/fastRepo.test.ts > setTracking (R05.2) > switching fasting off ends the running fast, keeps it and the water logs, and leaves no fast to block food (ACC-H10-1, R05.2)
  - Test: src/features/fasting/FastingSettings.test.tsx > FastingSettings > ends the running fast when switched off, keeps it, says so, and food logs again (ACC-H10-1, R05.2)

### H11 · Fasting goal-reached alert (P1)

- **ACC-H11-1** A fast reaching its goal while the app is open shows the alert; an ended fast never does
  - Test: src/services/reminders/engine.test.ts > createReminderEngine: the fasting goal (R05.20) > shows the goal at start + goal while the app is open, once (ACC-H11-1)
  - Test: src/services/reminders/engine.test.ts > createReminderEngine: the fasting goal (R05.20) > never shows the goal of a fast that ended before it (ACC-H11-1)
  - Test: src/services/reminders/ports.test.ts > the engine over the stored data > shows the goal of a fast left running, at its goal time (ACC-H11-1)

## I · Coach

### I1 · Coach tab (P1)

- **ACC-I1-1** An empty chat shows four prompts that send when tapped
  - Test: src/features/coach/CoachPage.test.tsx > CoachPage: empty chat (P08-10) > shows the title, what the Coach can see and four cards in place of a conversation (ACC-I1-1)
  - Test: src/features/coach/CoachPage.test.tsx > CoachPage: empty chat (P08-10) > sends a card’s words at once when it is tapped (ACC-I1-1)
- **ACC-I1-2** While a reply is pending three animated dots show
  - Test: src/features/coach/TypingDots.test.tsx > TypingDots (P08-10) > moves the lit dot on every 350 ms and back to the first after the third (ACC-I1-2)
  - Test: src/features/coach/TypingDots.test.tsx > TypingDots (P08-10) > shows three dots with the first lit, and says the Coach is writing (ACC-I1-2)
  - Test: src/features/coach/CoachPage.test.tsx > CoachPage: conversation > shows the typing dots while a reply is pending, the lit one moving every 350 ms (ACC-I1-2)
  - Test: src/features/coach/MessageList.test.tsx > MessageList: typing dots > shows the dots after the last message only while a reply is pending (ACC-I1-2)
- **ACC-I1-3** The conversation follows the newest message while the person is at the end; scrolled up, it stays and Jump to latest shows how many are new
  - Test: src/features/coach/MessageList.test.tsx > MessageList: following the end > follows a reply and the waiting dots while the person is at the end or within 80 px of it
  - Test: src/features/coach/MessageList.test.tsx > MessageList: following the end > stays where the person scrolled up to and counts the new messages on Jump to latest
  - Test: src/features/coach/MessageList.test.tsx > MessageList: following the end > glides to the newest on Jump to latest, at once with reduced motion
- **ACC-I1-4** A reminder the Coach proposes is added only from its card, once, and then shows in Settings › Tracking & reminders (D-16.93)
  - Test: e2e/coach.spec.ts > reminders through the Coach (P13, D-16.93) > adds the reminder the Coach proposed from its card, and it is in Settings › Tracking & reminders
  - Test: src/features/coach/ReminderCard.test.tsx > ReminderCard: Add (P13, D-16.93) > adds once for two quick taps, and again never after a reload
  - Test: src/ai/prompts/coach.test.ts > coachSystemPrompt: reminders (P13, D-16.93) > never lets the model say a reminder is set before the person taps Add

### I2 · Composer (P1)

- **ACC-I2-1** A photo alone can be sent
  - Test: src/features/coach/Composer.test.tsx > Composer: Send (P08-11) > turns Send on for a photo alone and sends it with no words (ACC-I2-1)
- **ACC-I2-2** Shift+Enter adds a new line instead of sending
  - Test: src/features/coach/Composer.test.tsx > Composer: keys > adds a line on Shift+Enter instead of sending (ACC-I2-2)
- **ACC-I2-3** The composer grows to six lines, keeps the focus after Send and stays above the keyboard
  - Test: src/features/coach/Composer.test.tsx > Composer: growing with the text > grows with the text to six lines, then scrolls (P13)
  - Test: src/features/coach/Composer.test.tsx > Composer: Send (P08-11) > keeps the focus in the field after Send, so the keyboard stays up (P13)
  - Test: src/features/coach/keyboard.test.ts > useKeyboardInset (P13) > follows the viewport as the keyboard opens, the page scrolls under it, and it closes

### I3 · Goal-aware prompt chips (P1)

- **ACC-I3-1** Chips change when the goal changes
  - Test: src/features/coach/ChipRow.test.tsx > useCoachChips: chips follow the goal live > switches from the lose chips to the gain chips when the goal changes (ACC-I3-1)
- **ACC-I3-2** A chip sends together with the attached photo
  - Test: src/features/coach/ChipRow.test.tsx > ChipRow: sending (D-16.33, R04.14) > sends the attached photo with the chip and clears it (ACC-I3-2, R04.14)
  - Test: e2e/coach.spec.ts > coach chat (Demo 5) > sends a card at once, then a chip with the attached photo, keeping the typed words (D-16.33, D-16.85, R04.14)

### I4 · Replies rendered as simple Markdown with safe links (P1)

- **ACC-I4-1** A list in a reply renders as a list and links open in a new tab
  - Test: src/features/coach/markdown.test.tsx > MarkdownReply: blocks > draws a list as a list and opens an https link in a new tab (ACC-I4-1)
- **ACC-I4-2** Copy puts the reply text on the clipboard
  - Test: src/features/coach/CopyButton.test.tsx > CopyButton > puts the raw reply text on the clipboard and confirms it briefly (ACC-I4-2)
  - Test: e2e/coach.spec.ts > coach chat (Demo 5) > answers "What did I eat yesterday?" from a food_log call, copies the reply and keeps the chat over a reload (ACC-I7-1, ACC-I10-2)
- **ACC-I4-3** Copy works without the Clipboard API and says Copied
  - Test: src/features/coach/CopyButton.test.tsx > CopyButton > copies with the copy command and says Copied when there is no Clipboard API (P13)

### I5 · Delete chat (was Reset) with confirmation (P1)

- **ACC-I5-1** Delete chat (was Reset) during a pending reply removes the chat, the reply never lands, and a new chat opens
  - Test: src/services/coach/session.test.ts > createCoachSession: Reset (R04.6, D-16.34) > aborts the running request, ends pending at once and leaves the chat empty (ACC-I5-1)
  - Test: e2e/coach.spec.ts > coach chat (Demo 5) > clears the chat while a slow reply is pending, and that reply never arrives (ACC-I5-1, R04.6, D-16.34)
  - Test: src/services/coach/session.test.ts > createCoachSession: several chats (P16-02, D-16.99) > deletes one chat while two wait: its request is aborted and its reply never lands; the other goes on

### I6 · Fresh context each turn (P1)

- **ACC-I6-1** The context sent with a question includes today's calories left and water
  - Test: src/services/coach/context.test.ts > coachContext: today so far (D-16.27) > gives today's intake, what is left of each target and water (ACC-I6-1)

### I7 · Six read-only nutrition tools (P1)

- **ACC-I7-1** Asking about yesterday's meals uses the food log tool and answers from it
  - Test: e2e/coach.spec.ts > coach chat (Demo 5) > answers "What did I eat yesterday?" from a food_log call, copies the reply and keeps the chat over a reload (ACC-I7-1, ACC-I10-2)
- **ACC-I7-2** Daily totals leave out days without entries
  - Test: src/services/coach/tools.test.ts > runCoachTool: daily_energy_totals (R04.16) > leaves days without entries out instead of giving them 0 kcal (ACC-I7-2)

### I8 · Tool loop of up to six rounds on all three formats, with the … (P1)

- **ACC-I8-1** A question needing two tool rounds is answered
  - Test: src/services/coach/engine.test.ts > runTurn: rounds (04 §3.11, R04.19) > answers after two tool rounds, each round carrying the calls and their results (ACC-I8-1)
- **ACC-I8-2** A seventh round is never sent; the round-limit message shows
  - Test: src/services/coach/engine.test.ts > runTurn: rounds (04 §3.11, R04.19) > ends with roundLimit when the sixth round still asks for tools, and sends no seventh (R04.11, ACC-I8-2)

### I9 · Tool results capped at 60 000 characters on every provider, … (P1)

- **ACC-I9-1** A year of entries is trimmed to fit and the newest rows are kept
  - Test: src/services/coach/limiter.test.ts > limitToolResult: cutting a long list (R04.9, D-16.32) > trims a year of food_log output and keeps the newest days (ACC-I9-1)

### I10 · Conversations kept locally (P1)

- **ACC-I10-1** After 205 messages the oldest 5 are gone
  - Test: src/data/repos/coachRepo.test.ts > append and the 200-message cap > keeps the newest 200 of 205 messages, removing the oldest with their thumbnails (ACC-I10-1, R04.8, D-16.29)
  - Test: e2e/coach.spec.ts > coach chat (Demo 5) > keeps the newest 200 messages after 101 exchanges, also after a reload (D-16.29, R04.8)
  - Test: src/data/repos/coachRepo.test.ts > append and the 200-message cap > caps each chat on its own: a full chat drops its own oldest, another chat keeps all of its (P16-02)
- **ACC-I10-2** The chat survives a reload
  - Test: e2e/coach.spec.ts > coach chat (Demo 5) > answers "What did I eat yesterday?" from a food_log call, copies the reply and keeps the chat over a reload (ACC-I7-1, ACC-I10-2)

### I11 · Friendly errors with Details and Retry on the failed turn (D-16.31) (P1)

- **ACC-I11-1** A failed turn shows a friendly message, Details and Retry; Retry does not repeat the question
  - Test: src/services/coach/session.test.ts > createCoachSession: failures and Retry (D-16.31, R04.4) > marks a failed question with its kind and the provider’s message, keys cut out (ACC-I11-1)
  - Test: src/services/coach/session.test.ts > createCoachSession: failures and Retry (D-16.31, R04.4) > asks a failed question again without storing it twice, its mark cleared (R04.4, ACC-I11-1)
  - Test: e2e/coach.spec.ts > coach chat (Demo 5) > shows a failed turn with Details, and Retry answers it without asking twice (D-16.31, R04.4)
  - Test: src/services/coach/plantedKey.test.tsx > Coach Details: no key in any output (P10-09, D-16.31, R03.18) > stores and shows a refusal from %s with every key cut out

### I12 · The standby provider re-runs the whole turn when the primary fails (P1)

- **ACC-I12-1** With the primary failing, the standby answers and nothing from the failed attempt remains
  - Test: src/services/coach/engine.test.ts > runTurn: the standby (R04.1, D-16.22) > re-runs the whole turn on the standby after the primary fails, with nothing from the first attempt (ACC-I12-1)

### I14 · Several Coach chats: New chat and chat history (P1, P16)

- **ACC-I14-1** New chat opens an empty chat with the goal's prompts; it is stored with its first question; the Coach tab opens the most recent chat
  - Test: src/features/coach/CoachPage.test.tsx > CoachPage: several chats (P16-03, D-16.99) > New chat opens an empty chat with the goal’s questions; its first send goes to it
  - Test: src/features/coach/CoachPage.test.tsx > CoachPage: several chats (P16-03, D-16.99) > opens the most recent chat, with its name under the heading
  - Test: src/data/repos/coachRepo.test.ts > chats (P16-02, D-16.99) > stores a chat with its first message, titled from it, and nothing for a chat that was never started
- **ACC-I14-2** Chats lists every chat newest first with its name, last use, last message and a waiting mark; a tap opens it
  - Test: src/features/coach/ChatsSheet.test.tsx > ChatsSheet (P16-03, D-16.99) > lists every chat newest first: its name, when it was last used and its last message
  - Test: src/features/coach/ChatsSheet.test.tsx > ChatsSheet (P16-03, D-16.99) > marks the open chat and the chats waiting for a reply
  - Test: src/features/coach/CoachPage.test.tsx > CoachPage: several chats (P16-03, D-16.99) > lists every chat in Chats, newest first, and a tap opens one
- **ACC-I14-3** A reply keeps going when the person switches chats and lands in its own chat; several chats wait at once; each chat sends only its own messages
  - Test: src/services/coach/session.test.ts > createCoachSession: several chats (P16-02, D-16.99) > answers two chats at once, each reply in its own chat, each request with its own chat only
  - Test: src/services/coach/session.test.ts > createCoachSession: several chats (P16-02, D-16.99) > keeps a reply running while a new chat is started and asked, and lands it in its own chat
  - Test: src/features/coach/CoachPage.test.tsx > CoachPage: several chats (P16-03, D-16.99) > leaves Send free in this chat while another chat waits for its reply
  - Test: e2e/coach.spec.ts > several chats (P16, D-16.99) > starts a chat, then a new one while the first reply runs, switches back through Chats, renames and deletes
- **ACC-I14-4** Rename keeps the person's title over the automatic one
  - Test: src/data/repos/coachRepo.test.ts > chats (P16-02, D-16.99) > renames a chat for good: later messages never bring the automatic title back
  - Test: src/features/coach/RenameChatSheet.test.tsx > RenameChatSheet (P16-03) > stores the words on one line and closes
- **ACC-I14-5** Delete asks first; a reply for a deleted chat is dropped
  - Test: src/services/coach/session.test.ts > createCoachSession: several chats (P16-02, D-16.99) > deletes one chat while two wait: its request is aborted and its reply never lands; the other goes on
  - Test: src/features/coach/CoachPage.test.tsx > CoachPage: several chats (P16-03, D-16.99) > deletes a chat from the list after asking; the open chat stays
- **ACC-I14-6** The 1.3 conversation becomes one chat; chats travel in backups at document version 1; a 1.3 backup restores into one chat
  - Test: src/data/schema.test.ts > schema version 4 (P16-02) > moves the conversation into one chat titled from its first question, with its times, every row kept
  - Test: src/services/backup/backup.test.ts > makeBackup > carries the Coach’s chats as one more list, the document still at version 1 (P16-02)
  - Test: src/services/backup/restore.test.ts > inspectBackup and applyBackup > restores a file made by 1.3, its messages without chats, into one chat (P16-02)
- **ACC-I14-7** Erase everything removes all chats
  - Test: src/services/yourData.test.ts > createYourDataService: Erase everything > deletes everything, the nudge’s key too, and another open tab starts again on Welcome (ACC-K6-1)

## J · Settings and configuration

### J1 · Settings hub with categories in a fixed order, back link, pages … (P0)

- **ACC-J1-1** The hub lists its categories and each opens with a back link
  - Test: src/features/settings/SettingsHub.test.tsx > SettingsHub > opens a category from its row, under a back link labelled Settings (ACC-J1-1)
- **ACC-J1-2** The hub shows every v1 category in order
  - Test: src/features/settings/SettingsHub.test.tsx > SettingsHub > shows every v1 category in order, with the sub-pages of App settings left out (ACC-J1-2)
  - Test: src/features/settings/SettingsHub.test.tsx > SettingsHub > puts Your data and About in their slots, then help and privacy, once they exist (ACC-J1-2)

### J2 · App settings (P1)

- **ACC-J2-1** Choosing Sunday as the first weekday changes the week bar
  - Test: src/features/settings/app/AppPage.test.tsx > AppPage > starts the week bar on Sunday once Sunday is chosen (ACC-J2-1)
- **ACC-J2-2** Grams first opens reviews in grams
  - Test: src/features/log/review/ReviewSheet.test.tsx > ReviewSheet > opens in grams when grams come first, else in the unit the draft chose (ACC-J2-2)

### J3 · Height, weight and energy units as separate settings (P1)

- **ACC-J3-1** Energy and height are separate unit choices; weight has none and reads kg next to height in ft-in (D-16.91)
  - Test: src/features/settings/app/UnitsSection.test.tsx > UnitsSection > offers no weight unit: weight reads kg next to height in feet and inches, even with lb stored (ACC-J3-1, D-16.91)

### J4 · Meal times editor (P1)

- **ACC-J4-1** Moving lunch to 11:30 files a 11:45 entry under lunch
  - Test: src/features/settings/tracking/MealTimesSheet.test.tsx > MealTimesSheet > files an entry logged at 11:45 under lunch once lunch starts at 11:30 (ACC-J4-1)

### J5 · Add-menu editor (P1)

- **ACC-J5-1** Hiding Copy a day removes it from the + menu and restoring it brings it back
  - Test: src/features/settings/app/MenuEditorPage.test.tsx > MenuEditorPage > takes Copy a day off the + menu when hidden and brings it back when put back (ACC-J5-1)

### J6 · Product information settings (P1)

- **ACC-J6-1** Hiding the NOVA field removes it from product reviews
  - Test: src/features/settings/app/ProductFieldsPage.test.tsx > ProductFieldsPage > takes NOVA out of the review's product block and keeps the rest (ACC-J6-1)

### J7 · Tab bar settings page (P1)

- **ACC-J7-1** Hiding Progress removes it from the bar and keeps Coach as it was
  - Test: src/features/settings/app/TabsPage.test.tsx > TabsPage > takes Progress out of the bar at once and keeps Coach as it was (ACC-J7-1)

### J8 · AI providers page (P1)

- **ACC-J8-1** Setting an image standby makes photo analyses fall back to it
  - Test: src/features/settings/ai/AiPage.test.tsx > AiPage > makes photo requests fall back to the photo standby set here (ACC-J8-1)
- **ACC-J8-2** The page states that keys stay in this browser
  - Test: src/features/settings/ai/AiPage.test.tsx > AiPage > says plainly that keys stay in this browser, which cannot fully shield them (ACC-J8-2, D-16.7)

### J9 · FoodData Central key setting (P1)

- **ACC-J9-1** With a key stored, a barcode missing from Open Food Facts is looked up in FoodData Central
  - Test: src/services/barcode/lookup.test.ts > createBarcodeService > stores FoodData Central’s product without a photo (ACC-J9-1)

### J10 · Tracking & reminders page (P1)

- **ACC-J10-1** The tracking page shows water and fasting rows only when each is switched on
  - Test: src/features/settings/tracking/TrackingPage.test.tsx > TrackingPage > shows water's own rows only while water is switched on (ACC-J10-1)
  - Test: src/features/water/WaterSettings.test.tsx > WaterSettings > shows the goal, the unit and the quick-add amounts once water is on (ACC-J10-1)
  - Test: src/features/settings/tracking/TrackingPage.test.tsx > TrackingPage > shows fasting's own rows only while fasting is switched on (ACC-J10-1)
  - Test: src/features/fasting/FastingSettings.test.tsx > FastingSettings > shows the default goal of 16 hours once fasting is on (ACC-J10-1, ACC-H6-1)

### J11 · Reminders (P1)

- **ACC-J11-1** Denying notification permission leaves the switch off with a pointer to browser settings
  - Test: src/features/settings/tracking/RemindersSection.test.tsx > RemindersSection > leaves the switch off when the browser says no, and points to the browser's site settings (ACC-J11-1, R06.13)
  - Test: e2e/settings-data.spec.ts > settings and data (Demo 6) > keeps the notification switch off when the browser says no, and points to the browser's settings (ACC-J11-1, R06.13)
- **ACC-J11-2** A reminder missed while the app was closed shows once on the next open
  - Test: src/services/reminders/engine.test.ts > createReminderEngine: daily reminders > shows a lunch reminder missed while the app was closed once on the next open (ACC-J11-2)
  - Test: src/services/reminders/schedule.test.ts > due > lists a reminder once when its time passed since it was dealt with (ACC-J11-2)
  - Test: src/services/reminders/notifier.test.ts > the engine and the notifier together, as main.tsx joins them > shows a lunch missed while the app was closed as a banner once, on the next open (ACC-J11-2)
- **ACC-J11-3** In the Android app every reminder that is on is scheduled with Android and comes with the app closed: meals and water daily at their clock time, the summary for its next 7 days with each day's numbers, the fasting goal once at start + goal, the person's own on their weekdays or date; a reminder turned off or moved is taken back or moved, and the app hands everything over again when it starts
  - Test: src/services/reminders/nativePlan.test.ts > nativePlan (D-16.92) > repeats meals and water every day at their wall-clock time, opening Home
  - Test: src/services/reminders/nativePlan.test.ts > nativePlan (D-16.92) > hands the summary over as its next 7 days, each with that day's numbers
  - Test: src/services/reminders/nativePlan.test.ts > nativePlan (D-16.92) > hands over the fasting goal once at start + goal, opening the fast
  - Test: src/services/reminders/nativePlan.test.ts > nativePlan (D-16.92) > repeats a written reminder weekly on each of its days
  - Test: src/services/reminders/nativePlan.test.ts > nativePlan (D-16.92) > hands over a once reminder at its moment, and nothing once it has passed
  - Test: src/services/reminders/nativeSync.test.ts > createNativeReminders: the schedule (D-16.92) > takes back a reminder switched off, and leaves the others alone
  - Test: src/services/reminders/nativeSync.test.ts > createNativeReminders: the schedule (D-16.92) > hands over again only the reminder whose time moved
  - Test: src/services/reminders/nativeSync.test.ts > createNativeReminders: the schedule (D-16.92) > moves the fasting goal with the fast, and takes it back when the fast ends
  - Test: src/services/reminders/nativeSync.test.ts > createNativeReminders: the schedule (D-16.92) > hands everything over again when the app starts, as a force stop drops the alarms
- **ACC-J11-4** In the Android app nothing is scheduled while Android refuses notifications, a permission taken away takes everything back, and Erase everything takes every notification back
  - Test: src/services/reminders/nativeSync.test.ts > createNativeReminders: the permission (Android 13+) > hands nothing over and takes everything back while Android refuses
  - Test: src/services/reminders/nativeSync.test.ts > createNativeReminders: the permission (Android 13+) > starts handing over once the permission is granted
  - Test: src/services/reminders/nativeSync.test.ts > createNativeReminders: taps, errors and stop > takes every notification back on stop (erase everything), at once, and stops listening
- **ACC-J11-5** Tapping a reminder's notification opens the app on Home showing today
  - Test: src/services/reminders/nativeSync.test.ts > createNativeReminders: taps, errors and stop > opens the fast for the fasting goal and Home for everything else
  - Test: src/services/reminders/nativeSync.test.ts > createNativeReminders: taps, errors and stop > opens what a tap that started the app was about, once the engine listens
- **ACC-J11-6** The person adds, edits, switches and deletes reminders of their own (1–80 characters, a time, weekdays or one date), at most 20
  - Test: src/features/settings/tracking/CustomReminders.test.tsx > CustomRemindersCard (P13, D-16.93) > adds a reminder on chosen weekdays, on, and lists it with when it comes
  - Test: src/features/settings/tracking/CustomReminders.test.tsx > CustomRemindersCard (P13, D-16.93) > adds a reminder once, on a date
  - Test: src/features/settings/tracking/CustomReminders.test.tsx > CustomRemindersCard (P13, D-16.93) > says what is wrong under the field it is about, and stores nothing
  - Test: src/features/settings/tracking/CustomReminders.test.tsx > CustomRemindersCard (P13, D-16.93) > edits a reminder in place, keeping its switch
  - Test: src/features/settings/tracking/CustomReminders.test.tsx > CustomRemindersCard (P13, D-16.93) > deletes a reminder from its sheet, and says so
  - Test: src/features/settings/tracking/CustomReminders.test.tsx > CustomRemindersCard (P13, D-16.93) > keeps at most 20: Add goes off with a line saying why
  - Test: src/services/reminders/customReminders.test.ts > addCustomReminder (the Coach will call it, D-16.93) > keeps at most 20, and says the list is full after that
  - Test: src/services/reminders/customReminders.test.ts > addCustomReminder (the Coach will call it, D-16.93) > refuses a once reminder whose moment has passed, and keeps one later today
  - Test: src/domain/reminders/custom.test.ts > checkCustomReminder (D-16.93) > needs 1 to 80 characters of text, counting an emoji as one
  - Test: e2e/reminders.spec.ts > reminders of your own (P13) > adds a reminder of your own, shows it at its time while open, edits and deletes it (D-16.93)
- **ACC-J11-7** Switching one of your own reminders on (or adding one) while notifications are off asks for the permission; a refusal leaves it off and points to the settings
  - Test: src/features/settings/tracking/CustomReminders.test.tsx > CustomRemindersCard (P13, D-16.93) > asks for the permission when one is switched on while notifications are off, and turns them on with a grant
  - Test: src/features/settings/tracking/CustomReminders.test.tsx > CustomRemindersCard (P13, D-16.93) > leaves the switch off when the permission is refused, and the Notifications card points to the settings
  - Test: src/features/settings/tracking/CustomReminders.test.tsx > CustomRemindersCard (P13, D-16.93) > points to Android's settings in the Android app when Android refuses (D-16.92)
- **ACC-J11-8** On the web your own reminders show while the app is open, on their days, like the daily ones
  - Test: src/services/reminders/engine.test.ts > createReminderEngine: the reminders the person wrote (P13, D-16.93) > shows one at its time on its days while the app is open, with its own words
  - Test: src/services/reminders/notifier.test.ts > createNotifier: reminders > shows a reminder the person wrote with its own words, and as its own banner (P13)
  - Test: e2e/reminders.spec.ts > reminders of your own (P13) > adds a reminder of your own, shows it at its time while open, edits and deletes it (D-16.93)

## K · Data management, backup and privacy

### K1 · Export the diary as JSON, Markdown or CSV for today, this week (by … (P1)

- **ACC-K1-1** Exporting this week as CSV gives a file with food and water rows
  - Test: e2e/settings-data.spec.ts > settings and data (Demo 6) > exports this week as CSV with its header, the food row and the water rows (ACC-K1-1)
- **ACC-K1-2** A kJ user's export still holds kcal and says so
  - Test: src/services/transfer/exportDiary.test.ts > exporting from the diary (the transfer service) > keeps kcal in a kJ reader's file (R06.14, ACC-K1-2)
  - Test: src/services/transfer/exportFormats.test.ts > toCsv > is the same for a kJ reader: the header names kcal and values stay kcal (R06.14, ACC-K1-2)
  - Test: src/services/transfer/exportFormats.test.ts > toMarkdown > tells a kJ reader the energy is in kcal and keeps the kcal numbers (R06.14, ACC-K1-2)
  - Test: src/features/settings/data/ExportSheet.test.tsx > ExportSheet > keeps kcal in a kJ reader's CSV and names the column in kcal (R06.14, ACC-K1-2)

### K2 · Import our own diary JSON (P1)

- **ACC-K2-1** A file with one invalid value is refused and nothing changes
  - Test: src/services/transfer/importDiary.test.ts > importing into the diary (the transfer service) > changes nothing when one value of the file is invalid (ACC-K2-1)
  - Test: src/features/settings/data/ImportSheet.test.tsx > ImportSheet > refuses a file with one invalid value, says why, and changes nothing (ACC-K2-1)
- **ACC-K2-2** Replacing a range keeps the photos of matched entries
  - Test: src/services/transfer/importDiary.test.ts > importing into the diary (the transfer service) > keeps a matched entry's id and photos and takes the file's values (ACC-K2-2, R06.16)
  - Test: src/features/settings/data/ImportSheet.test.tsx > ImportSheet > replaces the dates, keeps a matched entry's photos, then closes and says so (ACC-K2-2)
  - Test: e2e/settings-data.spec.ts > settings and data (Demo 6) > imports our diary file with Replace: the matched entry keeps its photo and takes the file's values (ACC-K2-2, R06.16)

### K3 · Back up to a file (P1)

- **ACC-K3-1** Back up now produces one file with the diary, photos and chat
  - Test: src/services/backup/backup.test.ts > makeBackup > makes one file with the diary, its photos and the Coach chat (ACC-K3-1)
  - Test: src/features/settings/data/BackupSection.test.tsx > BackupSection > says there is no backup yet, then hands one file over and shows its time (ACC-K3-1)
  - Test: e2e/settings-data.spec.ts > settings and data (Demo 6) > backs up, erases everything and restores from Welcome to the same diary, chat and settings (ACC-K3-1, ACC-K4-1, ACC-K6-1, ACC-B10-1, R06.8)
- **ACC-K3-3** In the Android app a backup is saved by itself into Documents › Platewise daily or weekly, and "Last backup" moves to it
  - Test: src/services/backup/auto.test.ts > automatic backup: when it runs (P14-01) > saves the same file as Back up now into the folder and moves Last backup (ACC-K3-3)
  - Test: src/services/backup/auto.test.ts > automatic backup: when it runs (P14-01) > is due a day after the newest backup when Daily, and not before
  - Test: src/services/backup/auto.test.ts > automatic backup: when it runs (P14-01) > is due a week after the newest backup when Weekly, and not before
  - Test: src/features/settings/data/AutoBackupCard.test.tsx > AutoBackupCard (P14-02) > shows the switch on, Daily, no automatic backup yet and where the files go (ACC-K3-3)
- **ACC-K3-4** Only the newest 7 automatic backups are kept, and a file Platewise did not write is never deleted or overwritten
  - Test: src/services/backup/auto.test.ts > automatic backup: keeping 7 (P14-01) > keeps the newest 7 it wrote and never deletes a file it did not write (ACC-K3-4)
  - Test: src/services/backup/auto.test.ts > automatic backup: keeping 7 (P14-01) > writes next to a file of the same name it did not write, never over it
- **ACC-K3-5** A failed automatic backup says why on the card and is tried again next time
  - Test: src/services/backup/auto.test.ts > automatic backup: failures (P14-01) > keeps %s as the problem, changes no Last backup, and tries again next time (ACC-K3-5)
  - Test: src/features/settings/data/AutoBackupCard.test.tsx > AutoBackupCard (P14-02) > says why the last automatic backup failed and what to do (%s, ACC-K3-5)
- **ACC-K3-6** A listed automatic backup restores through the same check and question
  - Test: src/features/settings/data/AutoBackupCard.test.tsx > AutoBackupCard (P14-02) > restores a listed backup through the restore sheet’s check and question (ACC-K3-6)
  - Test: src/features/settings/data/AutoBackupCard.test.tsx > AutoBackupCard (P14-02) > lists this install’s automatic backups, newest first, with their date and size (ACC-K3-6)
  - Test: src/services/backup/auto.test.ts > automatic backup: triggers and the card (P14-01) > reads a listed backup back for the restore check, and refuses a file it did not write (ACC-K3-6)
- **ACC-K3-7** The web app shows no automatic backup and loads none of its code
  - Test: src/features/settings/data/AutoBackupCard.test.tsx > AutoBackupCard (P14-02) > draws nothing on the web, where there is no automatic backup
  - Test: src/services/backup/autoLoad.test.ts > loadAutoBackup (P14-01, D-16.95) > fetches nothing and builds nothing on the web, where there is no Capacitor bridge

### K4 · Restore from a file (P1)

- **ACC-K4-1** Restore shows what the file holds and asks before replacing anything
  - Test: src/features/settings/data/RestoreSheet.test.tsx > RestoreSheet > shows when the backup was made and what it holds, and changes nothing before Restore (R06.8, ACC-K4-1)
  - Test: src/services/backup/restore.test.ts > inspectBackup and applyBackup > shows what the file holds before anything changes (R06.8, ACC-K4-1)
  - Test: e2e/settings-data.spec.ts > settings and data (Demo 6) > backs up, erases everything and restores from Welcome to the same diary, chat and settings (ACC-K3-1, ACC-K4-1, ACC-K6-1, ACC-B10-1, R06.8)
- **ACC-K4-2** A damaged file changes nothing
  - Test: src/features/settings/data/RestoreSheet.test.tsx > RestoreSheet > says a file is not a backup and changes nothing (ACC-K4-2)
  - Test: src/features/settings/data/RestoreSheet.test.tsx > RestoreSheet > says a damaged file changed nothing (ACC-K4-2)
  - Test: src/services/backup/restore.test.ts > inspectBackup and applyBackup > refuses a damaged file, changing nothing (ACC-K4-2, R06.6)

### K5 · Clear the diary (P1)

- **ACC-K5-1** Clear diary removes entries but keeps saved meals, weights and settings
  - Test: src/services/yourData.test.ts > createYourDataService: Clear diary > removes every entry and the photos only they used; saved meals, weights, water, fasts, the profile, chat and settings stay (ACC-K5-1)
  - Test: src/features/settings/data/DataPage.test.tsx > DataPage > clears the diary: entries go; saved meals with their photos, weights, water and settings stay (ACC-K5-1)

### K6 · Erase everything and return to onboarding (P1)

- **ACC-K6-1** Erase everything empties the app, other open tabs included, and shows Welcome
  - Test: src/services/yourData.test.ts > createYourDataService: Erase everything > deletes everything, the nudge’s key too, and another open tab starts again on Welcome (ACC-K6-1)
  - Test: src/features/settings/data/DataPage.test.tsx > DataPage > asks before erasing everything, then tells the backup, stops the reminders, erases and starts again (R06.5, ACC-K6-1)
  - Test: e2e/settings-data.spec.ts > settings and data (Demo 6) > backs up, erases everything and restores from Welcome to the same diary, chat and settings (ACC-K3-1, ACC-K4-1, ACC-K6-1, ACC-B10-1, R06.8)

### K7 · Storage card (P1)

- **ACC-K7-1** The storage card shows photo bytes and whether storage is persistent
  - Test: src/features/settings/data/StorageCard.test.tsx > StorageCard > shows … until measured, then photo and thumbnail bytes, usage of the quota and that the data may be cleared (ACC-K7-1, R06.19)
  - Test: src/features/settings/data/StorageCard.test.tsx > StorageCard > says Yes and warns of nothing when the browser keeps the data, and Not available without an estimate (ACC-K7-1)
  - Test: src/services/yourData.test.ts > createYourDataService: the storage card > measures photo and thumbnail bytes, the site’s usage of its quota and the persistence (ACC-K7-1, R06.19)

### K9 · Unreadable stored data is kept aside, never overwritten, and a … (P1)

- **ACC-K9-1** A damaged entry is skipped, kept aside, and the other entries still show
  - Test: src/data/guard.test.ts > readAll > drops an unreadable entry, keeps it in its table and aside, and sets the flag (R06.1, ACC-K9-1)
- **ACC-K9-2** A notice above the screen says some saved data could not be read and was kept aside; Dismiss takes it away for good
  - Test: src/app/DamagedDataNotice.test.tsx > DamagedDataNotice > draws nothing while no stored data has been set aside, and shows the notice once some has (R06.1, ACC-K9-2)
  - Test: src/app/DamagedDataNotice.test.tsx > DamagedDataNotice > clears the flag on Dismiss, and stays gone after the live state is read again (R06.1, ACC-K9-2)

## L · Platform

### L1 · Installable app (P1)

- **ACC-L1-1** The manifest lists our icons and the app can be installed
  - Test: src/app/InstallPrompt.test.tsx > InstallPrompt > shows the kept install offer once, then not again within seven days (ACC-L1-1)
  - Test: src/app/InstallPrompt.test.tsx > manifest.webmanifest > lists our icons, a maskable one included, each present with the size it claims (ACC-L1-1)
- **ACC-L1-2** iOS Safari shows Add-to-Home-Screen instructions
  - Test: src/app/InstallPrompt.test.tsx > InstallPrompt > explains Add to Home Screen in Safari on %s (ACC-L1-2)

### L2 · Works offline except AI and food-database lookups (P1)

- **ACC-L2-1** The installed app reloads with the network off
  - Test: e2e/settings-data.spec.ts > offline (service workers allowed) > reloads with the network off from the service worker, and an AI request offline says so (ACC-L2-1, R03.2)
- **ACC-L2-2** AI requests are never cached by the service worker
  - Test: src/sw/sw.test.ts > fetch > leaves a request to %s alone: no answer, no cache (ACC-L2-2)

### L3 · Update-ready banner and Settings dot (P1)

- **ACC-L3-1** A new version shows Update ready and waits for the tap
  - Test: src/app/swRegistration.test.ts > registerServiceWorker > sets the flag when a waiting worker appears, and reloads only after Reload (ACC-L3-1)
  - Test: src/app/UpdateBanner.test.tsx > UpdateBanner > shows Update ready and reloads only when Reload is pressed (ACC-L3-1)

### L4 · Persistent storage requested after the first logged entry, with … (P1)

- **ACC-L4-1** Logging the first entry asks for persistent storage once
  - Test: src/services/storageNudge.test.ts > createStorageNudge: the persistence request (D-16.8) > asks the browser once, after the first logged entry, and not again after a reload (ACC-L4-1)

### L5 · Notifications through the browser when permitted, otherwise in-app … (P1)

- **ACC-L5-1** Without permission a due reminder shows as an in-app banner
  - Test: src/services/reminders/notifier.test.ts > createNotifier: reminders > uses the banner when the permission is %s (ACC-L5-1)
  - Test: src/app/ReminderBanners.test.tsx > ReminderBanners > shows a missed lunch with when it was due, and takes it away on Dismiss (ACC-L5-1)

### L6 · Privacy (P1)

- **ACC-L6-1** The page's CSP allows only our own scripts
  - Test: src/app/InstallPrompt.test.tsx > index.html > carries the CSP with exactly these directives, before anything loads (ACC-L6-1)
- **ACC-L6-2** The built app contacts no host outside the providers and food databases
  - Test: e2e/hosts.spec.ts > the hosts the built app contacts (ACC-L6-2) > only its own origin, the AI provider and the food databases, across every screen

### L7 · Every open tab sees every saved change (P1)

- **ACC-L7-1** An entry added in one tab appears in another open tab
  - Test: src/data/live.test.ts > other tabs > shows an entry added in one tab in another open tab (ACC-L7-1)

### L9 · Accessible names on every control (P1)

- **ACC-L9-1** Automated accessibility checks find no serious problems on the main screens
  - Test: e2e/a11y.spec.ts > accessibility checks on the main screens, in both themes (ACC-L9-1) > the wizard, each step from Welcome to Plan ready
  - Test: e2e/a11y.spec.ts > accessibility checks on the main screens, in both themes (ACC-L9-1) > the + menu, the manual sheet, a food review, then Home with food, water and a fast
  - Test: e2e/a11y.spec.ts > accessibility checks on the main screens, in both themes (ACC-L9-1) > Progress with two weigh-ins, the Log weight sheet and the history
  - Test: e2e/a11y.spec.ts > accessibility checks on the main screens, in both themes (ACC-L9-1) > the Coach, empty and with an answer in Markdown
  - Test: e2e/a11y.spec.ts > accessibility checks on the main screens, in both themes (ACC-L9-1) > the Settings list and every Settings page
- **ACC-L9-2** The gauge's value is readable by a screen reader
  - Test: src/ui/Gauge.test.tsx > Gauge > reads the visible value and status to a screen reader (ACC-L9-2)

### L10 · Initial JavaScript at most 250 KB gzip (P1)

- **ACC-L10-1** The production build stays within the bundle budget
  - Test: scripts/bundle-budget.test.ts > measureBundle > passes under budget, counting the entry and its static imports once each
  - Test: scripts/bundle-budget.test.ts > measureBundle > fails over budget and names every counted file

## M · Android app (P11, P15)

### M11 · Health-store sync, steps, burn line and the measured-energy anchor (P1)

- **ACC-M11-1** On the Android app Settings lists Health Connect, and Connect shows what is allowed, the switches and the last sync; the web never offers it
  - Test: src/features/settings/registry.test.ts > pages a copy of the app does not offer (P11-04) > offers Health Connect on the web never, and in the Android app after Tracking (ACC-M11-1)
  - Test: src/features/settings/health/HealthPage.test.tsx > HealthPage (P11-04) > connects on Connect, then shows what is allowed, the switches and the last sync (ACC-M11-1)
- **ACC-M11-2** With "Count active calories" on, Home's target is the goal plus the day's active calories with the line "<goal> goal + <N> burned"; with it off the goal stays; the stored goal never changes
  - Test: src/features/home/HomePage.test.tsx > HomePage: Health Connect on the Android app (P11-04) > counts the day's active calories in the gauge, says goal + burned, and shows the activity card (ACC-M11-2)
  - Test: src/features/home/HomePage.test.tsx > HomePage: Health Connect on the Android app (P11-04) > keeps the goal and shows no line while counting is off; the card stays
- **ACC-M11-3** Progress shows steps, active calories, total calories burned and distance for 7 or 30 days
  - Test: src/features/progress/ActivityHistoryCard.test.tsx > ActivityHistoryCard (P11-04) > shows the last 7 days of steps and active calories, each with the mean of its days (ACC-M11-3)
  - Test: src/features/progress/ActivityHistoryCard.test.tsx > ActivityHistoryCard (P11-04) > covers 30 days once chosen
  - Test: src/features/progress/ActivityHistoryCard.test.tsx > ActivityHistoryCard (P11-04) > adds the period's total burn and distance, each with the mean of its days, in km beside cm (ACC-M11-3)
  - Test: src/features/progress/ActivityHistoryCard.test.tsx > ActivityHistoryCard (P11-04) > writes the distance in miles for a person who reads feet and inches
- **ACC-M11-4** A sync fills the last 30 days, a second sync changes nothing, and a deleted imported weigh-in never returns
  - Test: src/services/health/service.test.ts > sync (P11-03) > fills the last 30 days from Health Connect and keeps the sync time
  - Test: src/services/health/service.test.ts > sync (P11-03) > changes nothing on a second sync with the same answers
  - Test: src/data/repos/healthRepo.test.ts > importWeighIns (R07.22) > never brings back a reading the person deleted here
- **ACC-M11-5** With writing on, entries and weigh-ins reach Health Connect under our ids and follow add, edit and delete; imported weigh-ins are never sent back
  - Test: src/services/health/service.test.ts > write-back (D-16.89) > sends the window's entries when turned on, then follows add, edit and delete
  - Test: src/services/health/service.test.ts > write-back (D-16.89) > sends weigh-ins typed here and removes deleted ones, never imported ones
  - Test: src/services/health/service.test.ts > write-back (D-16.89) > holds back an entry logged for later today, sends the others, and sends it once its time has passed
  - Test: src/services/health/service.test.ts > the pass for a held-back record (ACC-M11-5) > sends an entry logged for later today a second after its time, with nothing else happening
  - Test: src/services/health/service.test.ts > the pass for a held-back record (ACC-M11-5) > keeps one timer at most, for the earliest record, cleared by each pass and by stop
- **ACC-M11-6** Access removed in Health Connect shows with Grant access, and a failed sync never blocks the diary
  - Test: src/features/settings/health/HealthPage.test.tsx > HealthPage (P11-04) > shows access removed in Health Connect with Grant access, and reads again once it is back
  - Test: src/services/health/service.test.ts > sync (P11-03) > keeps a failure in the status without rejecting, and clears it on the next success
  - Test: src/features/home/HomePage.test.tsx > HomePage: Health Connect on the Android app (P11-04) > draws the day and its goal when Health Connect's copy cannot be read
- **ACC-M11-7** The web app and PWA show no health feature and never fetch the health code
  - Test: src/services/health/load.test.ts > loadHealth > fetches nothing and builds nothing on the web, where there is no Capacitor bridge
  - Test: src/features/home/HomePage.test.tsx > HomePage: Health Connect on the Android app (P11-04) > shows no health feature without a health service, as on the web (D-16.89)
  - Test: src/features/progress/ProgressPage.test.tsx > ProgressPage: Health Connect on the Android app (P11-04) > shows no activity card without a health service, as on the web (D-16.89)
- **ACC-M11-8** Home's activity card also shows the day's total calories burned and its distance (km beside centimetres, miles beside feet and inches); neither is added to the target
  - Test: src/features/home/ActivityCard.test.tsx > ActivityCard (P11-04) > shows the total burn and the distance under steps and active calories, in km beside cm
  - Test: src/features/home/ActivityCard.test.tsx > ActivityCard (P11-04) > writes the distance in miles for a person who reads feet and inches
  - Test: src/features/home/HomePage.test.tsx > HomePage: Health Connect on the Android app (P11-04) > writes the day's distance in km for a person who reads centimetres
- **ACC-M11-9** In the Android app, Tracking & reminders and the onboarding step ask Android for the notification permission, and a refusal points to Android's settings (P13 replaces P11's "not available in the app yet")
  - Test: src/features/settings/tracking/RemindersSection.test.tsx > RemindersSection > asks Android in the Android app, and points to Android's settings when it says no (P13, D-16.92)
  - Test: src/features/settings/tracking/RemindersSection.test.tsx > RemindersSection > turns on in the Android app after a grant, and reads the permission again on return (P13)
  - Test: src/features/onboarding/steps/Reminders.test.tsx > Reminders > offers the button in the Android app, where Android asks, and turns reminders on after a grant (P13)
  - Test: src/features/onboarding/steps/Reminders.test.tsx > Reminders > points to Android's settings when Android refuses, and continues with reminders off (P13)
  - Test: src/features/onboarding/steps/Reminders.test.tsx > Reminders > keeps the button on the web, also where the browser has no notifications (ACC-M11-9)
- **ACC-M11-10** In the Android app with Health Connect connected, the Coach reads steps, active and total calories, distance and workouts per day through `activity_log` (at most 90 days, the last 7 by default); on the web or while not connected the tool is not offered
  - Test: src/services/coach/tools.test.ts > runCoachTool: activity_log (D-16.94) > gives the stored days of the last 7 by default, oldest first, with their figures and workouts
  - Test: src/services/coach/tools.test.ts > runCoachTool: activity_log (D-16.94) > holds a range to its newest 90 days and says how many older days it left out
  - Test: src/services/coach/engine.test.ts > runTurn: Health Connect activity (D-16.94) > runs an activity_log call on the snapshot and answers with what it returned
  - Test: src/services/coach/engine.test.ts > runTurn: Health Connect activity (D-16.94) > offers activity_log and sends its rules and today’s activity only when the snapshot has activity
  - Test: src/services/coach/session.test.ts > createCoachSession: Health Connect activity (D-16.94) > offers no activity tool while Health Connect is not connected, or without a copy
- **ACC-M11-11** Each turn the Coach knows today's activity, whether "Count active calories" is on and the resulting target, with what is left worked out from it; none of it on the web
  - Test: src/services/coach/context.test.ts > coachContext: Health Connect activity (D-16.94) > gives today's figures and workouts, and the target with today's active calories counted in
  - Test: src/services/coach/context.test.ts > coachContext: Health Connect activity (D-16.94) > keeps the target at the goal when counting is off, saying active calories are not added
  - Test: src/services/coach/context.test.ts > coachContext: Health Connect activity (D-16.94) > has no activity lines on the web or while Health Connect is not connected
  - Test: src/services/coach/snapshot.test.ts > takeSnapshot: Health Connect activity (D-16.94) > copies every stored day and the counting switch while Health Connect is connected
- **ACC-M11-12** The Coach's instructions say active calories are already in the target while counting is on (never counted twice), that total calories include resting burn, and to use `activity_log` for steps, workouts, burn and trends
  - Test: src/ai/prompts/coach.test.ts > coachSystemPrompt: Health Connect activity (D-16.94) > says active calories are already in the target while counting is on, so never twice
  - Test: src/ai/prompts/coach.test.ts > coachSystemPrompt: Health Connect activity (D-16.94) > says total calories include resting burn and are no extra food
  - Test: src/ai/prompts/coach.test.ts > coachSystemPrompt: Health Connect activity (D-16.94) > points questions on steps, workouts, burn and trends to activity_log
  - Test: src/ai/prompts/coach.test.ts > coachSystemPrompt: Health Connect activity (D-16.94) > adds none of it without activity, as on the web

### M16 · Cloud backup (Google Drive) and the welcome-back cloud restore (P1 on Android, P15)

- **ACC-M16-1** With Google Drive connected (Android app), each automatic backup and Back up now is also uploaded to the person's own Drive, into "Platewise backups" (one request up to 5 MiB, a resumable upload above)
  - Test: src/services/backup/drive.test.ts > Google Drive copies: uploads (P15-04, D-16.97) > copies a backup made by Back up now into Drive, and lists it (ACC-M16-1)
  - Test: src/services/backup/drive.test.ts > Google Drive copies: uploads (P15-04, D-16.97) > copies the file an automatic backup wrote, without making another (onChecked, ACC-M16-1)
  - Test: src/services/backup/driveClient.test.ts > the Drive client: uploads (P15-04) > sends a backup of 5 MiB or less in one multipart request, tagged as a backup (ACC-M16-1)
  - Test: src/services/backup/driveClient.test.ts > the Drive client: uploads (P15-04) > sends a larger backup through a resumable session (ACC-M16-1)
  - Test: src/features/settings/data/DriveCard.test.tsx > DriveCard (P15-04) > copies a backup made with Back up now to Google Drive (ACC-M16-1)
- **ACC-M16-2** Only the newest 7 copies this phone made are kept; copies from another phone and other files are never deleted
  - Test: src/services/backup/drive.test.ts > Google Drive copies: uploads (P15-04, D-16.97) > keeps this phone’s newest 7 copies and never deletes a file it did not make (ACC-M16-2)
  - Test: src/services/backup/drive.test.ts > Google Drive copies: uploads (P15-04, D-16.97) > a new phone’s uploads never push out the old phone’s copies (ACC-M16-2)
  - Test: src/services/backup/driveClient.test.ts > the Drive client: listing, downloading, deleting and keeping 7 (P15-04) > keeps this phone’s newest 7 and never deletes another phone’s copies or a file it did not make (ACC-M16-2)
- **ACC-M16-3** A failed upload says why on the card and is retried at the next start or return; a refused token is refreshed once
  - Test: src/services/backup/drive.test.ts > Google Drive copies: uploads (P15-04, D-16.97) > refreshes the token once when Drive refuses it, then sends (ACC-M16-3)
  - Test: src/services/backup/drive.test.ts > Google Drive copies: failures and retries (P15-04) > keeps an offline failure as the status, and the next start sends a fresh backup (ACC-M16-3)
  - Test: src/services/backup/driveClient.test.ts > the Drive client: tokens (P15-04) > refreshes the token once on a 401 and repeats the request (ACC-M16-3)
  - Test: src/features/settings/data/DriveCard.test.tsx > DriveCard (P15-04) > shows the last upload and why the last one failed (%s, ACC-M16-3)
- **ACC-M16-4** A Drive copy restores through the same check and question, from Settings and from Welcome
  - Test: src/features/onboarding/RestoreFromDrive.test.tsx > RestoreFromDrive on Welcome (P15-04) > connects, lists the Drive backups and restores the one picked through the same check and question (ACC-M16-4)
  - Test: src/services/backup/drive.test.ts > Google Drive copies: the list and restoring from it (P15-04) > downloads a listed copy for the restore check, and refuses one it did not list (ACC-M16-4)
  - Test: src/features/settings/data/DriveCard.test.tsx > DriveCard (P15-04) > restores a Drive backup through the restore sheet’s check and question (ACC-M16-4)
- **ACC-M16-5** Connect says plainly when this copy of Platewise is not registered with Google; the web app shows no Drive backup and loads none of its code
  - Test: src/features/onboarding/RestoreFromDrive.test.tsx > RestoreFromDrive on Welcome (P15-04) > is not offered on the web (ACC-M16-5)
  - Test: src/services/backup/driveLoad.test.ts > loadDriveBackup (P15-04, D-16.97) > fetches nothing and builds nothing on the web, where there is no Capacitor bridge (ACC-M16-5)
  - Test: src/features/settings/data/DriveCard.test.tsx > DriveCard (P15-04) > draws nothing on the web, where there is no Google Drive backup (ACC-M16-5)
  - Test: src/features/settings/data/DriveCard.test.tsx > DriveCard (P15-04) > says plainly when this copy of Platewise is not registered with Google (ACC-M16-5)

### M18 · Walk recorder and walk score (P1 on Android, P15)

- **ACC-M18-1** In the Android app the Walk screen explains each permission before Android asks, then records the walk live (time, distance, pace, steps, cadence, active calories, the route as a line), pauses and resumes, and stops after a question
  - Test: src/features/walk/WalkScreen.test.tsx > WalkScreen (P15-03) > explains each permission before Android asks, then starts the walk
  - Test: src/features/walk/WalkScreen.test.tsx > WalkScreen (P15-03) > goes back to Start from the explanation
  - Test: src/features/walk/WalkScreen.test.tsx > WalkScreen (P15-03) > shows the time, distance, pace, steps, cadence, active calories and the route live
  - Test: src/features/walk/WalkScreen.test.tsx > WalkScreen (P15-03) > pauses and resumes
  - Test: src/features/walk/WalkScreen.test.tsx > WalkScreen (P15-03) > says what is missing without location and steps
  - Test: src/features/walk/WalkScreen.test.tsx > WalkScreen (P15-03) > asks before stopping, keeps walking on Keep walking, and shows the summary on Stop
  - Test: src/features/walk/WalkScreen.test.tsx > WalkScreen (P15-03) > saves on Save and goes Home
  - Test: src/features/walk/WalkScreen.test.tsx > WalkScreen (P15-03) > removes the walk on Discard, after asking
  - Test: src/features/walk/WalkScreen.test.tsx > WalkScreen (P15-03) > keeps the walk when the summary is left with Back (Save is the default)
  - Test: src/services/walks/service.test.ts > starting a walk > explains first when Android has not been asked, then asks and starts with the route
  - Test: src/services/walks/service.test.ts > starting a walk > starts at once when Android was asked before, without the route when location was refused
  - Test: src/services/walks/service.test.ts > starting a walk > starts with what was allowed when the person refuses in Android
  - Test: src/services/walks/service.test.ts > starting a walk > goes back to idle from the explanation, and says so when the tracker cannot start
  - Test: src/services/walks/service.test.ts > while walking > follows the tracker’s updates, and pauses and resumes
  - Test: src/services/walks/service.test.ts > while walking > reads the walk again when the page comes back, finishing one stopped from the notification
- **ACC-M18-2** A finished walk shows its score out of 100 with its four parts (brisk minutes, duration, intensity, pace) and what each means; a part that was not measured is left out
  - Test: src/domain/walks/score.test.ts > walkScore > weighs brisk share 40, duration 25, intensity 20 and pace 15
  - Test: src/domain/walks/score.test.ts > walkScore > gives each part its share
  - Test: src/domain/walks/score.test.ts > walkScore > keeps the duration full past 30 minutes and every part within its weight
  - Test: src/domain/walks/score.test.ts > walkScore > gives no pace points at 85 % of the average or slower
  - Test: src/domain/walks/score.test.ts > walkScore > leaves the pace out with nothing to compare, and scales the rest to 100
  - Test: src/domain/walks/score.test.ts > walkScore > leaves brisk out without steps or a route, and intensity out without a speed
  - Test: src/domain/walks/score.test.ts > walkScore > gives no score when neither brisk minutes nor intensity was measured
  - Test: src/domain/walks/score.test.ts > walkScore > scores an empty walk 0
  - Test: src/domain/walks/score.test.ts > effortOf > reads under 3 METs as light, 3 to 6 as moderate, 6 and up as vigorous
  - Test: src/features/walk/WalkSummary.test.tsx > WalkSummary (P15-03) > shows the score large with its four parts and what each means
  - Test: src/features/walk/WalkSummary.test.tsx > WalkSummary (P15-03) > says why there is no score when nothing about the effort was measured
- **ACC-M18-3** Distance leaves out poor fixes and the line across a pause; a minute is brisk at 100 steps a minute or more (4.8 km/h without steps); METs come from the 2024 Adult Compendium walking codes; calories are MET × kg × hours, active calories (MET − 1) × kg × hours
  - Test: src/domain/walks/geo.test.ts > metresBetween > measures great-circle metres
  - Test: src/domain/walks/geo.test.ts > countedMoves > adds up a steady walk
  - Test: src/domain/walks/geo.test.ts > countedMoves > leaves out fixes worse than 50 m and positions that are not real
  - Test: src/domain/walks/geo.test.ts > countedMoves > never adds up jitter while standing still
  - Test: src/domain/walks/geo.test.ts > countedMoves > counts slow progress from the last counted point, not hop by hop
  - Test: src/domain/walks/geo.test.ts > countedMoves > leaves out a jump faster than walking and keeps the anchor
  - Test: src/domain/walks/geo.test.ts > countedMoves > does not count across a gap of more than a minute (a pause or a lost fix)
  - Test: src/domain/walks/geo.test.ts > countedMoves > reads fixes in time order
  - Test: src/domain/walks/stats.test.ts > walkStats on a steady walk > measures the distance, the active time and the pace
  - Test: src/domain/walks/stats.test.ts > walkStats on a steady walk > counts the steps and the cadence, overall and minute by minute
  - Test: src/domain/walks/stats.test.ts > walkStats on a steady walk > counts every minute as brisk at 110 steps a minute
  - Test: src/domain/walks/stats.test.ts > walkStats on a steady walk > takes the speed from the route and the METs from the Compendium band
  - Test: src/domain/walks/stats.test.ts > walkStats on a steady walk > works out the energy as MET × kg × hours and the active part as (MET − 1) × kg × hours
  - Test: src/domain/walks/stats.test.ts > walkStats: brisk minutes > counts no brisk minute at 90 steps a minute
  - Test: src/domain/walks/stats.test.ts > walkStats: brisk minutes > counts only the brisk part of a walk
  - Test: src/domain/walks/stats.test.ts > walkStats: brisk minutes > uses 4.8 km/h along the route when steps are missing
  - Test: src/domain/walks/stats.test.ts > walkStats with a pause > keeps the paused minutes out of the brisk minutes and the distance
  - Test: src/domain/walks/stats.test.ts > walkStats without sensors > takes the speed from the steps and the height without location
  - Test: src/domain/walks/stats.test.ts > walkStats without sensors > measures time only without both, at the METs of an ordinary walk, brisk unknown
  - Test: src/domain/walks/stats.test.ts > walkStats without sensors > falls back to the steps when location was allowed but no fix came
  - Test: src/domain/walks/stats.test.ts > walkStats: odd input > keeps the highest step count when a count goes down
  - Test: src/domain/walks/stats.test.ts > walkStats: odd input > measures a live walk up to now, its last minute partial
  - Test: src/domain/walks/stats.test.ts > walkStats: odd input > gives no energy without a weight and no cadence under 30 s
  - Test: src/domain/walks/mets.test.ts > metForSpeed (2024 Adult Compendium walking codes) > lists the eight level-walking codes, slowest first, with their values
  - Test: src/domain/walks/mets.test.ts > metForSpeed (2024 Adult Compendium walking codes) > reads each band from its lower speed in km/h
  - Test: src/domain/walks/mets.test.ts > metForSpeed (2024 Adult Compendium walking codes) > reads the slowest band for no speed
  - Test: src/features/walk/WalkSummary.test.tsx > WalkSummary (P15-03) > explains brisk minutes by speed when there were no steps, in the person's unit
- **ACC-M18-4** The week's moderate minutes (brisk minutes of recorded walks and other walking sessions in Health Connect that do not overlap them) are shown against 150 as a ring
  - Test: src/domain/walks/week.test.ts > weekWalkingMinutes > aims at the WHO 150 minutes a week
  - Test: src/domain/walks/week.test.ts > weekWalkingMinutes > adds the brisk minutes of recorded walks in the week
  - Test: src/domain/walks/week.test.ts > weekWalkingMinutes > adds other apps' walking sessions whole, never one overlapping a recorded walk
  - Test: src/features/walk/WalkSummary.test.tsx > WalkSummary (P15-03) > shows the figures in the person’s units and the week’s moderate minutes as a ring
- **ACC-M18-5** Heart-rate zones by % of 220 − age show only when Health Connect holds heart rate for the walk
  - Test: src/domain/walks/heartRate.test.ts > heart-rate zones > takes 220 − age as the top and starts zones at 50, 60, 70, 80 and 90 %
  - Test: src/domain/walks/heartRate.test.ts > heart-rate zones > adds each sample up to the next one, the last up to the end
  - Test: src/domain/walks/heartRate.test.ts > heart-rate zones > lets one sample stand for 30 s at most, and leaves out samples outside the walk or the range
  - Test: src/domain/walks/heartRate.test.ts > heart-rate zones > is null without a sample in the walk
  - Test: src/services/walks/service.test.ts > stopping > keeps the heart-rate zones Health Connect holds for the walk while it is connected
  - Test: src/services/walks/service.test.ts > stopping > reads no heart rate while Health Connect is not connected
  - Test: src/features/walk/WalkSummary.test.tsx > WalkSummary (P15-03) > shows the heart-rate zones only when Health Connect had heart rate for the walk
  - Test: src/features/walk/WalkSummary.test.tsx > WalkSummary (P15-03) > has no zones without heart rate
- **ACC-M18-6** Walks are stored in a walks table (schema version 3) and travel in backups; a backup made before walks restores with none
  - Test: src/data/schema.test.ts > schema version 3 (P15-02) > adds the walks table, keyed by id with an index on the start
  - Test: src/data/schema.test.ts > schema version 3 (P15-02) > carries the walks in backups and leaves the activity copy out
  - Test: src/data/schema.test.ts > schema version 3 (P15-02) > moves a version 2 database with rows in every table to version 3, every row kept and the walks table empty
  - Test: src/data/schema.test.ts > schema version 3 (P15-02) > moves a version 1 database straight to version 3
  - Test: src/data/repos/walkRepo.test.ts > walkRepo (P15-02) > stores a walk and reads it back
  - Test: src/data/repos/walkRepo.test.ts > walkRepo (P15-02) > lists every walk newest first, and the walks of some local days oldest first
  - Test: src/data/repos/walkRepo.test.ts > walkRepo (P15-02) > refuses a walk that ends before it starts
  - Test: src/data/repos/walkRepo.test.ts > walkRepo (P15-02) > removes a walk and marks one written to Health Connect
  - Test: src/data/repos/walkRepo.test.ts > walkRepo (P15-02) > leaves an unreadable row out of every read and keeps it aside, never deleting it
  - Test: src/data/codecs.test.ts > decodeWalk (P15-02) > reads a stored walk as it was written, unknown fields left behind
  - Test: src/data/codecs.test.ts > decodeWalk (P15-02) > cannot read a walk without its id, start and end in order, or its active time
  - Test: src/data/codecs.test.ts > decodeWalk (P15-02) > reads damaged figures leniently: unknown, default or left out
  - Test: src/services/backup/restore.test.ts > inspectBackup and applyBackup > restores a file made before walks were recorded, leaving no walks (P15-02)
  - Test: src/domain/walks/route.test.ts > thinRoute > keeps short routes whole and thins long ones to the cap, first and last kept
  - Test: src/domain/walks/route.test.ts > encodeRoute and decodeRoute > round-trips a route to a metre and a second
  - Test: src/domain/walks/route.test.ts > encodeRoute and decodeRoute > keeps negative and large changes
  - Test: src/domain/walks/route.test.ts > encodeRoute and decodeRoute > is short: a 10-minute walk takes a few bytes a fix
  - Test: src/domain/walks/route.test.ts > encodeRoute and decodeRoute > reads empty text as no route and refuses text it did not write
  - Test: src/domain/walks/route.test.ts > routeShape > fits the route into the box, north up, and marks its start and end
  - Test: src/domain/walks/route.test.ts > routeShape > draws no line for fewer than two fixes
- **ACC-M18-7** Burn is never counted twice: with Health Connect connected the day's burn is Health Connect's alone (walks are written to it); without it the day's walks' active calories count in "goal + burned" when the switch is on
  - Test: src/features/home/burn.test.ts > countedBurn > adds the day's active calories, rounded to whole kcal
  - Test: src/features/home/burn.test.ts > countedBurn > adds nothing without active calories, for 0 or less, without a day or without a goal
  - Test: src/features/home/burn.test.ts > walkBurn (P15-03) > adds the active calories of the day's recorded walks, rounded to whole kcal
  - Test: src/features/home/burn.test.ts > walkBurn (P15-03) > adds nothing without walks, for 0 or less, or without a goal
  - Test: src/features/home/burn.test.ts > burnSource (D-16.96) > counts Health Connect's day whenever it is connected, never the walks on top
  - Test: src/features/home/burn.test.ts > burnSource (D-16.96) > counts the recorded walks without Health Connect, and nothing on the web
  - Test: src/features/home/burn.test.ts > withBurn > raises only the energy target
  - Test: src/features/home/HomePage.test.tsx > HomePage: walks on the Android app (P15-03) > counts the day's recorded walks without Health Connect, lists them and opens the Walk screen
  - Test: src/features/home/HomePage.test.tsx > HomePage: walks on the Android app (P15-03) > keeps Health Connect's burn alone while it is connected: the walks are written there
  - Test: src/features/home/HomePage.test.tsx > HomePage: walks on the Android app (P15-03) > counts no walk while counting is off
  - Test: src/features/home/HomePage.test.tsx > HomePage: walks on the Android app (P15-03) > says a day without walks has none, and goes back to a walk in progress
  - Test: src/features/home/ActivityCard.test.tsx > ActivityCard: walks (P15-03) > lists the day’s walks without Health Connect and has the Walk button, in miles for feet
  - Test: src/features/home/ActivityCard.test.tsx > ActivityCard: walks (P15-03) > says there are no walks without Health Connect, and adds no line with it
  - Test: src/features/home/ActivityCard.test.tsx > ActivityCard: walks (P15-03) > leaves out the distance of a walk without a route
  - Test: src/features/settings/health/HealthPage.test.tsx > HealthPage: walks (P15-03) > offers Count active calories for the recorded walks before Health Connect is connected
- **ACC-M18-8** Save keeps the walk (and writes it to Health Connect when connected with write-back on); Discard removes it; walks Health Connect has not been given yet are written at start
  - Test: src/services/walks/service.test.ts > Save and Discard > writes the walk to Health Connect on Save while connected with writing on
  - Test: src/services/walks/service.test.ts > Save and Discard > keeps the walk without writing it when writing is off or Health Connect is not connected
  - Test: src/services/walks/service.test.ts > Save and Discard > keeps the walk unwritten when Health Connect refuses it
  - Test: src/services/walks/service.test.ts > Save and Discard > removes the walk on Discard
  - Test: src/services/walks/service.test.ts > stopping > works the walk out, stores it and lets the tracker’s copy go
  - Test: src/services/walks/service.test.ts > stopping > keeps the tracker’s copy when the walk cannot be stored, and finishes it on Try again
  - Test: src/services/walks/healthLink.test.ts > healthWalkLink (P15-02) > writes only while connected with writing on
  - Test: src/services/walks/healthLink.test.ts > healthWalkLink (P15-02) > writes a walk under its id, 0 m when it had no route
  - Test: src/services/walks/healthLink.test.ts > healthWalkLink (P15-02) > reads heart rate as instants, none while not connected or when refused
  - Test: src/services/walks/healthLink.test.ts > healthWalkLink (P15-02) > reads at most the first 24 h of a longer walk, as Health Connect answers no more
  - Test: src/services/walks/healthLink.test.ts > healthWalkLink (P15-02) > reports a write Health Connect refused as not written, never throwing
- **ACC-M18-9** A walk in progress is picked up when the app opens again, and a walk stopped from its notification opens its summary
  - Test: src/services/walks/service.test.ts > open at start-up > finds nothing when the tracker holds no walk
  - Test: src/services/walks/service.test.ts > open at start-up > picks up a walk in progress and follows it
  - Test: src/services/walks/service.test.ts > open at start-up > finishes and shows a walk stopped from the notification while the app was away
  - Test: src/services/walks/service.test.ts > open at start-up > writes the walks of the last ${CATCH_UP_DAYS} days Health Connect has not been given
  - Test: src/services/walks/service.test.ts > open at start-up > never writes the walk the summary shows before Save or Discard
  - Test: src/services/walks/service.test.ts > the tracker’s own rules > takes up the walk the tracker still holds when Start is pressed again
  - Test: src/services/walks/service.test.ts > the tracker’s own rules > goes back to idle when Pause finds no walk (it was let go elsewhere)
- **ACC-M18-10** Progress › Walks shows the week ring and the walks, each opening its summary; the summary compares the walk with the person's earlier walks
  - Test: src/features/walk/WalkSummary.test.tsx > Progress › Walks (P15-03) > lists every walk newest first with its date, time, distance and score, and the week ring
  - Test: src/features/walk/WalkSummary.test.tsx > Progress › Walks (P15-03) > opens a walk’s summary in a sheet
  - Test: src/features/walk/WalkSummary.test.tsx > Progress › Walks (P15-03) > says there are no walks yet
  - Test: src/features/walk/WalkSummary.test.tsx > WalkSummary (P15-03) > compares the walk with the walks before it, or says it is the first
  - Test: src/features/walk/WalkSummary.test.tsx > WalkSummary (P15-03) > says this is the first walk when there is none before it
  - Test: src/domain/walks/record.test.ts > buildWalk > keeps every figure, the score and the route of a stopped walk
  - Test: src/domain/walks/record.test.ts > buildWalk > compares the pace with the last earlier walks only
  - Test: src/domain/walks/record.test.ts > earlierWalks and walkAverages > takes the 10 newest walks that ended before this one started
  - Test: src/domain/walks/record.test.ts > earlierWalks and walkAverages > averages their minutes, distance, speed and score
- **ACC-M18-11** The Coach reads recorded walks through a walk_log tool (the last 7 days by default, at most 90) and knows what the score means
  - Test: src/services/coach/tools.test.ts > runCoachTool: walk_log (D-16.96) > gives the walks of the last 7 days by default, oldest first, one row each
  - Test: src/services/coach/tools.test.ts > runCoachTool: walk_log (D-16.96) > holds at most the newest 90 days of a longer range and says how many it left out
  - Test: src/services/coach/tools.test.ts > runCoachTool: walk_log (D-16.96) > says it needs the walk recorder where there is none (the web)
  - Test: src/services/coach/tools.test.ts > runCoachTool: walk_log (D-16.96) > answers {error} instead of throwing when the walks cannot be read
  - Test: src/services/coach/toolSchemas.test.ts > WALK_TOOL: the recorded walks (D-16.96) > is offered after activity and before the reminder tool, only where the app records walks
  - Test: src/services/coach/toolSchemas.test.ts > WALK_TOOL: the recorded walks (D-16.96) > takes a from and to day range like activity_log, at most 90 days, portable keywords only
  - Test: src/services/coach/toolSchemas.test.ts > WALK_TOOL: the recorded walks (D-16.96) > says what a row holds and that a missing day means no walk recorded
  - Test: src/services/coach/engine.test.ts > runTurn: recorded walks (D-16.96) > offers walk_log with what the walk score means only when the snapshot holds walks
  - Test: src/services/coach/context.test.ts > coachContext: recorded walks without Health Connect (D-16.96) > lists today's walks and counts their active calories in the target, as Home does
  - Test: src/services/coach/context.test.ts > coachContext: recorded walks without Health Connect (D-16.96) > keeps the goal while counting is off, and says when no walk is recorded today
  - Test: src/services/coach/context.test.ts > coachContext: recorded walks without Health Connect (D-16.96) > counts Health Connect's burn alone while it is connected
  - Test: src/services/coach/context.test.ts > coachContext: recorded walks without Health Connect (D-16.96) > counts today's walks the way Home does (P15-03)
  - Test: src/services/coach/snapshot.test.ts > takeSnapshot: recorded walks (D-16.96) > copies every recorded walk, newest first, where the app records walks
  - Test: src/services/coach/snapshot.test.ts > takeSnapshot: recorded walks (D-16.96) > has no walks where nothing records them (the web), and none when they cannot be read
  - Test: src/ai/prompts/coach.test.ts > coachSystemPrompt: walks (P15, D-16.96) > says what walk_log gives and what the walk score means
  - Test: src/ai/prompts/coach.test.ts > coachSystemPrompt: walks (P15, D-16.96) > names exactly the tools offered with it
  - Test: src/ai/prompts/coach.test.ts > coachSystemPrompt: walks (P15, D-16.96) > adds none of it where the app records no walks
- **ACC-M18-12** The web app shows no walk recorder and fetches none of its code
  - Test: src/services/walks/load.test.ts > loadWalks (P15-02) > fetches nothing and builds nothing on the web, where there is no Capacitor bridge
  - Test: src/app/App.test.tsx > App > goes Home from #/walk where nothing records walks, as on the web (P15-03)
  - Test: src/features/log/AddMenu.test.tsx > AddMenu: the walk recorder (P15-03) > has no Walk row without the walk recorder, as on the web
  - Test: src/features/settings/health/HealthPage.test.tsx > HealthPage: walks (P15-03) > keeps the options away before connecting where nothing records walks

## Known gaps

Behaviour of the reference that v1.0 ships without, decided on 2026-10-26 and recorded in `docs/plan/16-what-we-change.md` §2.8 (N-ids) or §2.6 (D-ids). None of these is a P0/P1 row.

- **Workouts, exercise library, burn (N-1).** No workout tab, no burn line on Home, no workout tiles in the recap (D-16.44); Coach offers nutrition tools only. Later: L2–L3.
- **Voice input and live voice (N-2).** No microphone in the + menu or the Coach composer. Later: L4 (speech-to-text), L5 (live voice spike).
- **Other languages (N-3).** English only; every string is in the catalogue and numbers and dates follow the browser locale. Later: L1.
- **Cloud backup (N-4).** A local backup file instead (K3, K4; D-16.30); the welcome-back cloud restore becomes a file restore (B10).
- **Health-store sync and steps (N-5).** No steps, no measured energy anchor, no health import. Not planned (no browser API).
- **Key passphrase lock (N-6).** Keys are wrapped by a device key and the Settings page states the browser's limits (E14, D-16.7).
- **Body measurements, amino acids (N-7).** Not recorded; the Coach context has no measurement block.
- **Hosted AI, weekly challenge, short share links (N-8).** Not planned; every server-side trap (R07.14, R07.15, R07.18, R07.19) is recorded as not planned in the traps ledger.
- **What's New dialog (D-16.43), streaming Coach replies (D-16.47), on-device models (D-16.6), watch, widgets and Siri (D-16.3).** Not in v1.
