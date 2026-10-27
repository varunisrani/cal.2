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
  - Test: src/app/TabBar.test.tsx > TabBar > draws nothing until the hidden-tab setting is read, so a hidden tab never flashes in

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

- **ACC-B3-1** 70.0 kg toggled to lb and back still reads 70.0 kg
  - Test: src/features/onboarding/wizard.test.ts > units > keeps 70.0 kg through kg → lb → kg (R01.3, ACC-B3-1)

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
- **ACC-B10-2** Restoring a backup without a profile continues the wizard and keeps the entries
  - Test: src/features/onboarding/RestoreFromFile.test.tsx > RestoreFromFile on Welcome > continues a backup without a profile at the Sex step, keeping its entries through to the end (ACC-B10-2)

### B11 · Unit defaults from the browser locale (P1)

- **ACC-B11-1** The unit defaults for an en-US browser are lb and ft-in, and kg and cm for en-GB
  - Review: P01-04
- **ACC-B11-2** A fresh wizard in an en-US browser shows weight in lb
  - Test: src/features/onboarding/WizardPage.test.tsx > WizardPage > shows weight in pounds in a fresh wizard in an en-US browser (ACC-B11-2)

### B12 · Personal info in Settings (P1)

- **ACC-B12-1** Saving a weight in Settings adds a weigh-in and updates the profile
  - Test: src/features/settings/profile/WeightSheet.test.tsx > WeightSheet: the current weight > adds one weigh-in for now and changes the profile weight (ACC-B12-1)
  - Test: src/services/profileEdits.test.ts > saveWeight > adds one weigh-in stamped now and moves the profile weight to it (ACC-B12-1)
- **ACC-B12-2** A goal weight on the wrong side is refused with a reason
  - Test: src/features/settings/profile/WeightSheet.test.tsx > WeightSheet: the goal weight (D-16.11) > shows why a lose goal above the current weight is refused and saves nothing (ACC-B12-2)
  - Test: src/services/profileEdits.test.ts > setGoalWeight (D-16.11, D-16.80) > refuses a lose target that is not below the current weight and stores nothing (ACC-B12-2)

### B13 · Calculation methods page in our words with sources and a … (P1)

- **ACC-B13-1** The methods page opens from Plan Ready and from Settings
  - Review: P05-13

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
- **ACC-C12-2** Opening and saving the kJ goal wheel unchanged keeps 2 000 kcal
  - Review: P01-03

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

## F · Home and day view

### F1 · Week bar of 53 weeks starting on the chosen weekday (P1)

- **ACC-F1-1** Selecting last Monday shows that day's diary
  - Test: src/features/home/HomePage.test.tsx > HomePage: the selected day (P07-01, P07-02) > shows the week bar on today, and last Monday's diary and summary once it is selected (ACC-F1-1)
- **ACC-F1-2** Tomorrow cannot be selected
  - Test: src/features/home/WeekBar.test.tsx > WeekBar > shows the days after today but never selects them: tomorrow is disabled (ACC-F1-2, D-16.36)

### F2 · Swipe the day summary to change day, never past today (P1)

- **ACC-F2-1** Swiping right shows yesterday; swiping left on today does nothing
  - Test: src/features/home/DaySwipe.test.tsx > DaySwipe > shows yesterday after a swipe of 100 px toward the right (ACC-F2-1)
  - Test: src/features/home/DaySwipe.test.tsx > DaySwipe > never moves past today: a swipe toward the left on today does nothing (ACC-F2-1)
  - Test: src/features/home/HomePage.test.tsx > HomePage: the selected day (P07-01, P07-02) > shows yesterday after a swipe toward the right on the summary; toward the left on today does nothing (ACC-F2-1)

### F3 · Energy gauge with the eaten amount and left, over, goal reached or … (P0)

- **ACC-F3-1** With 1 200 of 2 000 kcal eaten the gauge reads 800 left
  - Test: src/features/home/DaySummary.test.tsx > DaySummary gauge > reads 800 left with 1 200 of 2 000 kcal eaten, and sweeps 108° (ACC-F3-1)
- **ACC-F3-2** Over the goal the gauge stays full and reads the excess
  - Test: src/features/home/DaySummary.test.tsx > DaySummary gauge > stays full and reads 100 over at 2 100 of 2 000 kcal (ACC-F3-2)

### F4 · Nutrient pillars (P0)

- **ACC-F4-1** Home shows protein, carbs, fat and fibre pillars by default
  - Test: src/features/home/DaySummary.test.tsx > DaySummary pillars > shows protein, carbs, fat and fibre against their goals, in that order (ACC-F4-1)
- **ACC-F4-2** A sodium pillar shows how far over its limit the day is
  - Test: src/features/home/PillarRow.test.tsx > PillarRow > shows 200 mg over on a sodium pillar with a goal of 2 300 and 2 500 eaten (ACC-F4-2)

### F5 · Pillar picker (P1)

- **ACC-F5-1** Choosing a fifth nutrient replaces the most recent choice
  - Test: src/features/home/PillarPicker.test.tsx > PillarPicker > replaces the latest pick when a fifth nutrient is picked (ACC-F5-1)
  - Test: src/features/home/HomePage.test.tsx > HomePage: pillars and the day's nutrients (P07-03, P07-04) > chooses pillars over the sheet: Done stores them and Home shows them (ACC-F5-1)

### F6 · All-nutrients sheet for the selected day (P1)

- **ACC-F6-1** The sheet lists every nutrient for the selected day with its goal
  - Test: src/features/home/DayNutrientsSheet.test.tsx > DayNutrientsSheet > lists every nutrient of the day with its unit and its goal (ACC-F6-1)
  - Test: src/features/home/HomePage.test.tsx > HomePage: pillars and the day's nutrients (P07-03, P07-04) > opens the shown day's nutrients from All nutrients: yesterday's while yesterday is shown (ACC-F6-1)

### F7 · Diary grouped by meal with food-only section totals (P0)

- **ACC-F7-1** Entries appear under their meal with that meal's total
  - Test: src/features/home/Diary.test.tsx > Diary > shows a 300 kcal breakfast under Breakfast with the section total 300 (ACC-F7-1)
- **ACC-F7-2** Newest first shows repeated meal sections in time order
  - Test: src/features/home/Diary.test.tsx > Diary: water, fasts and the sort order (P07-05) > shows repeated meal sections in time order when sorted newest first (ACC-F7-2)
  - Test: src/features/home/HomePage.test.tsx > HomePage: water and fasts (P07-05, P07-08) > stores the sort order from the first header; newest first shows a meal again (ACC-F7-2)

### F8 · Water and fast rows in the diary (P1)

- **ACC-F8-1** A fast from 20:00 to 12:00 shows on the second day only
  - Test: src/domain/meals/diary.test.ts > fastsOnDay > shows a fast from 20:00 to 12:00 the next day on the second day only (R05.21, ACC-F8-1)
  - Test: src/features/home/HomePage.test.tsx > HomePage: water and fasts (P07-05, P07-08) > shows the day's water and fasts with both trackers off, a fast over midnight on its end day only, and no tracker in the menu (R05.9, R05.21, ACC-F8-1)
- **ACC-F8-2** The active fast row counts up every second
  - Test: src/features/home/FastRow.test.tsx > FastRow > advances by one second with fake timers (ACC-F8-2)

### F9 · Swipe to delete diary rows, always with a confirmation (P1)

- **ACC-F9-1** Swiping a water row asks before deleting it
  - Test: src/features/home/WaterRow.test.tsx > WaterRow > asks before deleting on a swipe, and keeps the log on Cancel (ACC-F9-1)
  - Test: src/features/home/WaterRow.test.tsx > WaterRow > deletes the log once Delete is confirmed (ACC-F9-1)
  - Test: src/features/home/HomePage.test.tsx > HomePage: water and fasts (P07-05, P07-08) > asks before deleting a water row and removes it once confirmed (ACC-F9-1)

### F10 · Empty-day message (P0)

- **ACC-F10-1** A day without entries shows the empty message
  - Test: src/features/home/Diary.test.tsx > Diary > shows the empty card on a day with nothing logged (ACC-F10-1)
  - Test: src/features/home/HomePage.test.tsx > HomePage > shows the empty card on a day with nothing logged (ACC-F10-1)

### F11 · "+" button opening food methods, Water and fasting entries (P0)

- **ACC-F11-1** With water tracking on, the + menu has a Water page that logs a preset at once
  - Test: src/features/water/WaterMenuPage.test.tsx > WaterMenuPage > logs 500 ml on the selected day at once, confirms it and is done (ACC-F11-1)
  - Test: src/features/log/AddMenu.test.tsx > AddMenu: water and fasting (P07-08) > opens the water page inside the menu, where a preset logs on the day shown at once (ACC-F11-1, ACC-H1-1)
- **ACC-F11-2** During a fast the + menu shows only water and fasting entries
  - Test: src/features/log/AddMenu.test.tsx > AddMenu: water and fasting (P07-08) > shows only Water and Fasting while a fast runs: no food group or method (ACC-F11-2)
  - Test: src/features/home/HomePage.test.tsx > HomePage: water and fasts (P07-05, P07-08) > starts a fast from the + menu; while it runs the menu holds only Fasting, which ends it (ACC-H6-1, ACC-F11-2)

### F12 · Long-press multi-select with a combine bar (P1)

- **ACC-F12-1** Long-pressing a row enters selection mode and shows the combine bar
  - Test: src/features/home/EntryRow.test.tsx > EntryRow: on Home (P06-19) > starts picking after a press held still for half a second, and the click that ends it does nothing more (ACC-F12-1)
  - Test: src/features/home/HomePage.test.tsx > HomePage: picking and combining rows (P06-19) > starts picking on a long-press: the bar with the count, Cancel and Combine takes the place of "+" (ACC-F12-1)
  - Test: src/features/home/SelectionBar.test.tsx > SelectionBar > says how many rows are picked and offers Combine from two (ACC-F12-1)

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
- **ACC-G3-2** A change under 0.05 kg reads 0.0 without a sign
  - Test: src/features/progress/WeightCard.test.tsx > WeightCard > shows 0.0 without a sign for a net change of −0.04 kg (ACC-G3-2)
  - Test: src/domain/progress/ranges.test.ts > changeToTenth > reads a change closer to zero than 0.05 as 0, never −0 (ACC-G3-2)

### G4 · Log weight (P1)

- **ACC-G4-1** A weight logged for last week lands on that day without changing the current weight
  - Test: src/features/progress/LogWeightSheet.test.tsx > LogWeightSheet > logs a weight for last week on that day at the current clock time, keeping the current weight (ACC-G4-1)
  - Test: src/services/progress.test.ts > logWeight > puts an earlier day at the current clock time and keeps the newer profile weight (ACC-G4-1)
- **ACC-G4-2** Toggling lb in the log sheet changes the app's weight unit
  - Test: src/features/progress/LogWeightSheet.test.tsx > LogWeightSheet > converts 70.0 kg to 154.3 lb on the toggle and changes the unit of the whole app (ACC-G4-2, R05.11)

### G5 · Body-fat card and Log body fat (3–60 % in 0.5 steps) (P1)

- **ACC-G5-1** Logging 18.5 % updates the body-fat card and the profile
  - Test: src/features/progress/BodyFatCard.test.tsx > LogBodyFatSheet > saves 18.5 % stamped now and moves the profile body fat and the card to it (ACC-G5-1)

### G6 · Weight and body-fat histories, newest first, delete with … (P1)

- **ACC-G6-1** Deleting a weigh-in asks first and removes it from the list at once
  - Test: src/features/progress/HistorySheet.test.tsx > HistorySheet > takes the row out of the open list at once, before the store answers (ACC-G6-1, R05.22)

### G7 · The profile's weight and body fat follow the latest reading (P1)

- **ACC-G7-1** Deleting the latest weigh-in sets the profile weight to the previous one
  - Test: src/data/repos/weightRepo.test.ts > deleteWeighIn (R05.8) > sets the profile weight to the previous reading when the latest is deleted (ACC-G7-1, R05.8)

### G8 · Weekly recap of the last completed week against the one before, … (P1)

- **ACC-G8-1** The recap shows days logged out of 7 and the change from the week before
  - Test: src/features/progress/RecapCard.test.tsx > RecapCard > recaps the last week that ended: days logged of 7 with the change from the week before (ACC-G8-1, R05.19)
- **ACC-G8-2** At most three highlights appear, improvements only
  - Test: src/features/progress/RecapCard.test.tsx > RecapCard > names a step forward and never a step back (ACC-G8-2)
  - Test: src/features/progress/RecapCard.test.tsx > RecapCard > shows at most three lines, the first three in their order (ACC-G8-2, R05.19)
  - Test: src/domain/progress/recap.test.ts > highlightsFor > keeps the first three in their order when more improved (R05.19, ACC-G8-2)
  - Test: src/domain/progress/recap.test.ts > highlightsFor > never names a step back (ACC-G8-2)

### G9 · Count-today switch for the nutrition charts (P1)

- **ACC-G9-1** Turning off Count today removes today's partial day from the averages
  - Test: src/domain/progress/averages.test.ts > windowNutrition > Count today (ACC-G9-1, R05.17) > leaves today's partial day out of the bars and every average when it is not
  - Test: src/features/progress/NutritionCards.test.tsx > NutritionCards > takes out the partial today when Count today is turned off on the page (ACC-G9-1, R05.17)

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

### H2 · Three quick-add amounts (1–5 000 ml) that keep exact values … (P1)

- **ACC-H2-1** 250 ml stays 250 ml after editing in fl oz without touching it
  - Test: src/features/water/PresetsEditor.test.tsx > PresetsEditor > keeps 250 ml exactly through a save in fl oz when no field is touched (R05.10, ACC-H2-1)

### H3 · Log water by quick amount or a custom amount up to 5 000 ml on the … (P1)

- **ACC-H3-1** A custom amount of 6 000 ml is refused
  - Test: src/features/water/CustomWaterSheet.test.tsx > CustomWaterSheet > refuses 6 000 ml with a message naming 5,000 ml and stores nothing (ACC-H3-1, R05.10, D-16.39)
  - Test: src/services/water.test.ts > logWater > refuses more than 5 000 ml, nothing, and part of a ml, storing nothing (ACC-H3-1, D-16.39)
- **ACC-H3-2** Water logged while yesterday is selected lands on yesterday
  - Review: P07-17

### H4 · Water pillar and water section in the all-nutrients sheet (P1)

- **ACC-H4-1** The water pillar shows today's amount against the goal
  - Test: src/features/home/PillarRow.test.tsx > PillarRow > shows the day's water against the daily goal in the water unit (ACC-H4-1)
  - Test: src/features/home/HomePage.test.tsx > HomePage: pillars and the day's nutrients (P07-03, P07-04) > shows the stored pillars, then water with the shown day's logs while it is tracked (ACC-H4-1)

### H5 · Water reminder with a time picker, default 14 (P1)

- **ACC-H5-1** A water reminder set for 15:00 shows at 15:00 while the app is open
  - Test: src/services/reminders/engine.test.ts > createReminderEngine: daily reminders > shows a water reminder set for 15:00 at 15:00 while the app is open (ACC-H5-1)

### H6 · Fasting tracking switch (off by default) and a default goal of … (P1)

- **ACC-H6-1** Turning fasting on offers Start fast in the + menu
  - Test: src/features/fasting/FastingSettings.test.tsx > FastingSettings > shows the default goal of 16 hours once fasting is on (ACC-J10-1, ACC-H6-1)
  - Test: src/features/log/AddMenu.test.tsx > AddMenu: water and fasting (P07-08) > offers Water, then Start fast, under a hairline while each is tracked (ACC-H1-1, ACC-H6-1)
  - Test: src/features/home/HomePage.test.tsx > HomePage: water and fasts (P07-05, P07-08) > starts a fast from the + menu; while it runs the menu holds only Fasting, which ends it (ACC-H6-1, ACC-F11-2)

### H7 · Start, end and cancel a fast from the + menu (P1)

- **ACC-H7-1** Starting a 16 h fast shows it as active; cancelling removes it from history
  - Test: src/features/fasting/StartFastSheet.test.tsx > StartFastSheet > opens on the default 16 hours and starts a running fast now (ACC-H7-1)
  - Test: src/features/fasting/FastEditor.test.tsx > FastEditor > cancels a running fast so it leaves no history (ACC-H7-1)

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

### I2 · Composer (P1)

- **ACC-I2-1** A photo alone can be sent
  - Test: src/features/coach/Composer.test.tsx > Composer: Send (P08-11) > turns Send on for a photo alone and sends it with no words (ACC-I2-1)
- **ACC-I2-2** Shift+Enter adds a new line instead of sending
  - Test: src/features/coach/Composer.test.tsx > Composer: keys > adds a line on Shift+Enter instead of sending (ACC-I2-2)

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

### I5 · Reset with confirmation (P1)

- **ACC-I5-1** Reset during a pending reply leaves the chat empty
  - Test: src/services/coach/session.test.ts > createCoachSession: Reset (R04.6, D-16.34) > aborts the running request, ends pending at once and leaves the chat empty (ACC-I5-1)
  - Test: e2e/coach.spec.ts > coach chat (Demo 5) > clears the chat while a slow reply is pending, and that reply never arrives (ACC-I5-1, R04.6, D-16.34)

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

### I10 · Conversation kept locally (P1)

- **ACC-I10-1** After 205 messages the oldest 5 are gone
  - Test: src/data/repos/coachRepo.test.ts > append and the 200-message cap > keeps the newest 200 of 205 messages, removing the oldest with their thumbnails (ACC-I10-1, R04.8, D-16.29)
  - Test: e2e/coach.spec.ts > coach chat (Demo 5) > keeps the newest 200 messages after 101 exchanges, also after a reload (D-16.29, R04.8)
- **ACC-I10-2** The chat survives a reload
  - Test: e2e/coach.spec.ts > coach chat (Demo 5) > answers "What did I eat yesterday?" from a food_log call, copies the reply and keeps the chat over a reload (ACC-I7-1, ACC-I10-2)

### I11 · Friendly errors with Details and Retry on the failed turn (D-16.31) (P1)

- **ACC-I11-1** A failed turn shows a friendly message, Details and Retry; Retry does not repeat the question
  - Test: src/services/coach/session.test.ts > createCoachSession: failures and Retry (D-16.31, R04.4) > marks a failed question with its kind and the provider’s message, keys cut out (ACC-I11-1)
  - Test: src/services/coach/session.test.ts > createCoachSession: failures and Retry (D-16.31, R04.4) > asks a failed question again without storing it twice, its mark cleared (R04.4, ACC-I11-1)
  - Test: e2e/coach.spec.ts > coach chat (Demo 5) > shows a failed turn with Details, and Retry answers it without asking twice (D-16.31, R04.4)

### I12 · The standby provider re-runs the whole turn when the primary fails (P1)

- **ACC-I12-1** With the primary failing, the standby answers and nothing from the failed attempt remains
  - Test: src/services/coach/engine.test.ts > runTurn: the standby (R04.1, D-16.22) > re-runs the whole turn on the standby after the primary fails, with nothing from the first attempt (ACC-I12-1)

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

- **ACC-J3-1** Weight in lb and height in cm can be combined
  - Test: src/features/settings/app/UnitsSection.test.tsx > UnitsSection > combines weight in lb with height in cm (ACC-J3-1)

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
- **ACC-J11-2** A reminder missed while the app was closed shows once on the next open
  - Test: src/services/reminders/engine.test.ts > createReminderEngine: daily reminders > shows a lunch reminder missed while the app was closed once on the next open (ACC-J11-2)
  - Test: src/services/reminders/schedule.test.ts > due > lists a reminder once when its time passed since it was dealt with (ACC-J11-2)
  - Test: src/services/reminders/notifier.test.ts > the engine and the notifier together, as main.tsx joins them > shows a lunch missed while the app was closed as a banner once, on the next open (ACC-J11-2)

## K · Data management, backup and privacy

### K1 · Export the diary as JSON, Markdown or CSV for today, this week (by … (P1)

- **ACC-K1-1** Exporting this week as CSV gives a file with food and water rows
  - Review: P09-19
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

### K3 · Back up to a file (P1)

- **ACC-K3-1** Back up now produces one file with the diary, photos and chat
  - Test: src/services/backup/backup.test.ts > makeBackup > makes one file with the diary, its photos and the Coach chat (ACC-K3-1)
  - Test: src/features/settings/data/BackupSection.test.tsx > BackupSection > says there is no backup yet, then hands one file over and shows its time (ACC-K3-1)

### K4 · Restore from a file (P1)

- **ACC-K4-1** Restore shows what the file holds and asks before replacing anything
  - Test: src/features/settings/data/RestoreSheet.test.tsx > RestoreSheet > shows when the backup was made and what it holds, and changes nothing before Restore (R06.8, ACC-K4-1)
  - Test: src/services/backup/restore.test.ts > inspectBackup and applyBackup > shows what the file holds before anything changes (R06.8, ACC-K4-1)
- **ACC-K4-2** A damaged file changes nothing
  - Test: src/features/settings/data/RestoreSheet.test.tsx > RestoreSheet > says a file is not a backup and changes nothing (ACC-K4-2)
  - Test: src/features/settings/data/RestoreSheet.test.tsx > RestoreSheet > says a damaged file changed nothing (ACC-K4-2)
  - Test: src/services/backup/restore.test.ts > inspectBackup and applyBackup > refuses a damaged file, changing nothing (ACC-K4-2, R06.6)

### K5 · Clear the diary (P1)

- **ACC-K5-1** Clear diary removes entries but keeps saved meals, weights and settings
  - Review: P09-15

### K6 · Erase everything and return to onboarding (P1)

- **ACC-K6-1** Erase everything empties the app, other open tabs included, and shows Welcome
  - Review: P09-15

### K7 · Storage card (P1)

- **ACC-K7-1** The storage card shows photo bytes and whether storage is persistent
  - Review: P09-15

### K9 · Unreadable stored data is kept aside, never overwritten, and a … (P1)

- **ACC-K9-1** A damaged entry is skipped, kept aside, and the other entries still show
  - Test: src/data/guard.test.ts > readAll > drops an unreadable entry, keeps it in its table and aside, and sets the flag (R06.1, ACC-K9-1)

## L · Platform

### L1 · Installable app (P1)

- **ACC-L1-1** The manifest lists our icons and the app can be installed
  - Test: src/app/InstallPrompt.test.tsx > InstallPrompt > shows the kept install offer once, then not again within seven days (ACC-L1-1)
  - Test: src/app/InstallPrompt.test.tsx > manifest.webmanifest > lists our icons, a maskable one included, each present with the size it claims (ACC-L1-1)
- **ACC-L1-2** iOS Safari shows Add-to-Home-Screen instructions
  - Test: src/app/InstallPrompt.test.tsx > InstallPrompt > explains Add to Home Screen in Safari on %s (ACC-L1-2)

### L2 · Works offline except AI and food-database lookups (P1)

- **ACC-L2-1** The installed app reloads with the network off
  - Review: P09-19
- **ACC-L2-2** AI requests are never cached by the service worker
  - Test: src/sw/sw.test.ts > fetch > leaves a request to %s alone: no answer, no cache (ACC-L2-2)

### L3 · Update-ready banner and Settings dot (P1)

- **ACC-L3-1** A new version shows Update ready and waits for the tap
  - Test: src/app/swRegistration.test.ts > registerServiceWorker > sets the flag when a waiting worker appears, and reloads only after Reload (ACC-L3-1)
  - Test: src/app/UpdateBanner.test.tsx > UpdateBanner > shows Update ready and reloads only when Reload is pressed (ACC-L3-1)

### L4 · Persistent storage requested after the first logged entry, with … (P1)

- **ACC-L4-1** Logging the first entry asks for persistent storage once
  - Review: P09-15

### L5 · Notifications through the browser when permitted, otherwise in-app … (P1)

- **ACC-L5-1** Without permission a due reminder shows as an in-app banner
  - Test: src/services/reminders/notifier.test.ts > createNotifier: reminders > uses the banner when the permission is %s (ACC-L5-1)
  - Test: src/app/ReminderBanners.test.tsx > ReminderBanners > shows a missed lunch with when it was due, and takes it away on Dismiss (ACC-L5-1)

### L6 · Privacy (P1)

- **ACC-L6-1** The page's CSP allows only our own scripts
  - Test: src/app/InstallPrompt.test.tsx > index.html > carries the CSP with exactly these directives, before anything loads (ACC-L6-1)
- **ACC-L6-2** The built app contacts no host outside the providers and food databases
  - Review: P10-08

### L7 · Every open tab sees every saved change (P1)

- **ACC-L7-1** An entry added in one tab appears in another open tab
  - Test: src/data/live.test.ts > other tabs > shows an entry added in one tab in another open tab (ACC-L7-1)

### L9 · Accessible names on every control (P1)

- **ACC-L9-1** Automated accessibility checks find no serious problems on the main screens
  - Review: P10-07
- **ACC-L9-2** The gauge's value is readable by a screen reader
  - Test: src/ui/Gauge.test.tsx > Gauge > reads the visible value and status to a screen reader (ACC-L9-2)

### L10 · Initial JavaScript at most 250 KB gzip (P1)

- **ACC-L10-1** The production build stays within the bundle budget
  - Test: scripts/bundle-budget.test.ts > measureBundle > passes under budget, counting the entry and its static imports once each
  - Test: scripts/bundle-budget.test.ts > measureBundle > fails over budget and names every counted file

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
