# 18 · Phase-wise build plan

How Platewise gets built: the loop every task follows, the two tracks and their weeks, then each phase with what to read, what to write, how to compare and when it is done. The task-level detail lives in `phases/`; the repo tree and rules in `phases/00-layout-and-conventions.md`.

## The loop for every task

1. **Read.** The research spec section first (`research/<nn>-*.md`), then the reference files the task lists, only the named parts of big files, then the reference tests it names (they list the edge cases). REA Evidence counts as reference material.
2. **Note.** Write `docs/notes/P<nn>/<slug>.md` from `docs/notes/_template.md` before any code, in our own words. Its `Read:` line is the audit trail.
3. **Close the reference and rewrite.** Write from the note, the spec and the phase file, with our names (17) and our structure; tests next to code.
4. **Reopen and compare.** Walk the reference branch by branch; close each gap our own way and tick the note's checklist, naming the test that covers each case. Never paste to fill a gap.
5. **Check.** The run-until-green loop (`00-layout-and-conventions.md` §3) and the phase's additions; UI flows also run their parity scenario through REA. A failure sends you back to step 3.

Reference paths are relative to `$PLATEWISE_REF` (`/root/reference/fud-ai`, pinned at `10e14b67`). Prefixes: `A/` = `android/app/src/main/java/com/apoorvdarshan/calorietracker/`, `I/` = `ios/calorietracker/`, `T/` = `android/app/src/test/java/com/apoorvdarshan/calorietracker/`, `IT/` = `ios/calorietrackerTests/`. A number in brackets is the file's length in lines; read only the named part of a big file. Read the research spec section first, then the reference, then its tests.

## Weeks and tracks

| Week | Domain/data/AI track | UI track | Demo |
|---|---|---|---|
| 1 | P00 (CI, harness, budget, fake AI server); P01 wave A (types, dates) | P00 (tokens, theme, icons, catalogue, lint); P04 S1–S2 primitives on fakes | M0 |
| 2 | P01 waves B–C; P02 wave A | P04 S1–S3 (primitives, router, tab bar, theme, boot) | — |
| 3 | P02 waves B–C; P03 wave A | P04 S4–S5 (diary service, Home, manual entry), P04-14 | Demo 1 (M2) |
| 4 | P03 waves B–C | P05 S1 (wizard), S2 UI parts | M1 complete |
| 5 | P05 S3 (plan builder, rebuild, tune-up) | P05 S4 (settings pages), P05-15 | Demo 2 (M3) |
| 6–8 | P06 S1 (photos, analysis), S3 (barcode services) | P06 S2a, S2b, S4, then wave C | Demo 3 (M4) |
| 8–10 | P07 S3 (chart maths), S4b domain (recap, averages) | P07 S1, S2, S4a, S4b cards, P07-17 | Demo 4 (M5) |
| 10–11 | P08 S1 (context, tools), S2 (wires), wave B (engine, session) | P08 S3 (Coach UI on a fake session), P08-14 | Demo 5 (M6) |
| 11–13 | P09 S2 (reminders), S3a/S3b (export, import, backup) | P09 S1a, S1b, S4 (settings pages, SW, manifest), P09-19 | Demo 6 (M7) |
| 13–14 | P10 S1, S2, S4 | P10 S3, S5 | v1.0 (M8) |

**Order, refined.** The suggested order holds, with four changes and their reasons: (1) the UI track starts P04's primitives in week 1 because they depend on nothing but the tokens; (2) the shared provider form (`features/ai-setup/`) is built in P05, not P09, because onboarding's AI step needs it; P09 reuses it on the full AI page; (3) the water and fasting settings rows are built in P07 with their features and mounted on a Tracking page that P09 completes, so the trackers are usable before P09; (4) domain modules that only one feature uses (add menu, reuse lists, barcode keys, allergens, recap, chart maths) are created in that feature's phase, keeping P01 to the shared core.

## P00 · Foundations (remaining work)

**Weeks:** 1 · **Depends on:** — · **Tasks:** 10 · **File:** [`phases/P00-foundations.md`](phases/P00-foundations.md)

**Goal.** Finish the ground every later phase stands on. CI runs the full loop on every push, including `pnpm check --require-ref` against the pinned reference. The design tokens, the six accent presets (D-16.1) and our own icon exist. One English message catalogue and the Intl helpers are in place, so no feature ever hard-codes copy (R07.20 groundwork). Lint rules enforce the architecture's seams (pure domain, one AI seam, data access only through repositories). A scripted OpenAI-compatible fake provider on loopback lets every later e2e and parity run work without keys.

**Read in reference.**

- No reference reading. After writing the tokens, open `A/ui/theme/Color.kt` [86] and `I/Views/Theme.swift` [210] only to confirm nothing matches.

**Write.**

- [ ] P00-01 CI workflow
- [ ] P00-02 Design tokens
- [ ] P00-03 Theme runtime and contrast check
- [ ] P00-04 Brand icon set
- [ ] P00-05 Message catalogue and t()
- [ ] P00-06 Intl format helpers
- [ ] P00-07 Lint boundaries and the copy rule
- [ ] P00-08 Clock, ids and test time helpers
- [ ] P00-09 Fake AI provider server
- [ ] P00-10 Bundle budget script

**Compare / verify.** Token values and names checked against the reference palette (nothing matches); assets check green. Then the phase's checklist and its run-until-green additions.

**Done when.** CI (or `scripts/ci-local.sh` until D-16.54 is confirmed) runs every step green, including `pnpm check --require-ref`. The token contrast sweep, catalogue lint, lint-rule fixtures, fake AI server tests and bundle budget all pass. **Demo M0:** `pnpm dev` shows the placeholder app in dark and light with the Basil accent and our favicon; `PLATEWISE_REF=/root/reference/fud-ai pnpm check --require-ref` prints a green table.

## P01 · Domain core (pure TypeScript)

**Weeks:** 1–2 · **Depends on:** P00 · **Tasks:** 19 · **File:** [`phases/P01-domain-core.md`](phases/P01-domain-core.md)

**Goal.** Every number the product shows comes from pure, clock-free functions in `src/domain/`, unit-tested against the values the research recorded: units and conversions (kcal/kJ, kg/lb, cm/ft-in, ml/fl oz), the nutrient catalogue, day keys and ranges in the local zone, meal times and diary grouping, serving scaling with unknown weights, ingredients, recipe splits and combining, BMR/TDEE and plan maths with exact truncation rules, the lock engine, the AI plan validator, Adaptive cadence, the evidence pack, the weight forecast and the fasting rules. No React, no Dexie, no `Date.now()`: time and locale are parameters.

**Read in reference.**

- Spec 01 §3.2–3.3, §3.6–3.8, §3.10, §3.12–3.13; spec 02 §3.2–3.3, §3.15; spec 05 §3.6–3.7.
- `A/models/UserProfile.kt` [337: formulas, auto-balance, locks]; `I/Models/UserProfile.swift` [705: formula part].
- `A/models/{ActivityLevel,AutoBalanceMacro,EnergyUnit,MealSchedule,NutrientGoals,WeightDisplayFormatter}.kt` [60, 22, 108, 44, 278, 17].
- `A/models/{ServingUnitOption,ServingAmountExpression,RecipeServings,CombinedMeal,MealIngredient,IngredientPortion,MealMicronutrientStretch}.kt` [132, 119, 103, 84, 44, 18, 146].
- `A/models/{WaterUnit,WaterQuickAddPresets,FastingSession}.kt` [38, 50, 43].
- `A/services/{GoalEvidence,WeightAnalysisService}.kt` [423, 267]; `I/Services/{GoalEvidence,WeightAnalysisService}.swift` [551, 164].
- Big files, named parts only: `A/services/ai/FoodAnalysis.kt` [666: `parseGoalCalculation`]; `I/Services/GeminiService.swift` [1 989: `parseGoalCalculation`, `closestFat`]; `A/FudAIApp.kt` [795: lines 640–800]; `A/ui/settings/SettingsViewModel.kt` [1 727: lines 1340–1670].
- Tests: `T/models/{UserProfileGoalFormulaTest,EnergyUnitTest,WeightDisplayFormatterTest,OptionalNutrientGoalsTest,MealScheduleTest,ServingAmountExpressionTest,RecipeServingsTest,CombinedMealTest,IngredientPortionTest,MealMicronutrientStretchTest,FoodServingRestoreTest,FastingSessionTest,WaterQuickAddPresetsTest}.kt`; `T/services/{GoalEvidenceTest}.kt`; `T/services/ai/GoalCalculationParserTest.kt`; `IT/{MaintenanceBreakdownTests,EnergyUnitTests,GoalEvidenceTests,RecipeServingsTests,FastingStoreTests}.swift`.

**Write.**

- [ ] P01-01 Domain model types
- [ ] P01-02 Dates, day keys and windows
- [ ] P01-03 Energy units (kcal and kJ)
- [ ] P01-04 Body units and locale defaults
- [ ] P01-05 Water units and quick-add amounts
- [ ] P01-06 Number parsing, quantity formatting and amount expressions
- [ ] P01-07 Nutrient catalogue and goal defaults
- [ ] P01-08 Meal times and diary grouping
- [ ] P01-09 Serving units and scaling
- [ ] P01-10 Ingredient lines and nutrient stretch
- [ ] P01-11 Recipe split and combining entries
- [ ] P01-12 Goal formulas and maintenance estimate
- [ ] P01-13 Effective targets, locks and plan editing
- [ ] P01-14 Plan validator for AI replies
- [ ] P01-15 Profile rules and plan-input signature
- [ ] P01-16 Adaptive cadence
- [ ] P01-17 Goal evidence pack
- [ ] P01-18 Weight forecast
- [ ] P01-19 Fasting rules and goal crossing

**Compare / verify.** Walk every formula, truncation and rejection branch; deliberate differences recorded (one lb factor, Android ranges, combine rule, no corrector). Then the phase's checklist and its run-until-green additions.

**Done when.** Every module in `src/domain/` has its tests next to it and they pass under `TZ=America/New_York` and the Tokyo cases. The domain imports nothing outside itself (lint rule 1). **Demo (M1, part 1):** `pnpm test src/domain --reporter=verbose` lists the default-profile plan (2 452 kcal, 112 / 406 / 42 g), the plan-validator vectors and the fasting cases.

## P02 · Data layer (Dexie schema and repositories)

**Weeks:** 2 · **Depends on:** P01 · **Tasks:** 15 · **File:** [`phases/P02-data-layer.md`](phases/P02-data-layer.md)

**Goal.** Everything the person records lives in one IndexedDB database (`platewise`) behind repositories in `src/data/`. Every change is one transaction that reads, changes and writes (R06.2); an active fast refuses food writes inside that same transaction (R05.1); unreadable records are kept aside in a quarantine table and never silently replaced (R06.1, R05.6, R01.17); every committed write reaches every live query and every open tab (R06.3). Keys sit in their own table, wrapped by a non-extractable WebCrypto key (Proposed D-16.51). Photos are blobs deleted only when nothing references them (R02.8, R06.18). No UI yet: hooks and repositories are tested with fake-indexeddb.

**Read in reference.**

- Spec 06 §3.18–3.19, §5; spec 02 §3.10, §3.19–3.20; spec 05 §3.5.3–3.5.5, §3.7; spec 04 §3.7.
- `A/data/{PersistedJsonGuard,ConsistentDataStore,KeyStore,FoodRepository,WeightRepository,BodyFatRepository,FastingRepository,WaterRepository,ChatRepository,ProfileRepository,FudaiDataStore}.kt` [131, 43, 129, 428, 236, 181, 91, 36, 65, 18, 62].
- `I/Services/PersistedBlobGuard.swift` [302]; `I/Stores/{FoodStore,WeightStore,BodyFatStore,FastingStore,ChatStore}.swift` [757: lines 1–186 and 305–500, 328, 106, 131, 103].
- Big files, named parts only: `A/data/PreferencesStore.kt` [1 739: lines 140–260 guarded lists, 230–260 profile, Keys object 1588–1700]; `A/services/FoodImageStore.kt` [576: store, prune, references].
- Tests: `T/data/{PersistedJsonGuardTest,ConsistentDataStoreTest}.kt`; `IT/{DiaryPersistenceSafetyTests,FastingStoreTests,WeightHistoryTests,FoodPhotoRemovalTests}.swift`; `T/models/FoodEntryPhotoRemovalTest.kt`.

**Write.**

- [ ] P02-01 Dexie schema, open and upgrade safety
- [ ] P02-02 Record guard and quarantine
- [ ] P02-03 Change bus, live queries and other tabs
- [ ] P02-04 Settings repository and schema
- [ ] P02-05 Profile repository
- [ ] P02-06 Diary repository
- [ ] P02-07 Photo store and reference-checked cleanup
- [ ] P02-08 Weight and body-fat repositories
- [ ] P02-09 Water and fasting repositories
- [ ] P02-10 Saved meals repository
- [ ] P02-11 Coach message repository
- [ ] P02-12 Secrets repository
- [ ] P02-13 Drafts repository
- [ ] P02-14 Erase, persistence and storage estimates
- [ ] P02-15 Feature hooks

**Compare / verify.** Every guarded write path quarantines; the fast check is inside the writing transaction; profile sync rules; photo owners complete. Then the phase's checklist and its run-until-green additions.

**Done when.** All repositories pass their tests with fake-indexeddb; the cross-tab and in-flight-write tests pass; lint shows no `dexie` import outside `src/data`. **Demo (M1, part 2):** `pnpm test src/data --reporter=verbose` shows the fast-blocks-food, quarantine and cross-tab cases passing.

## P03 · AI layer (catalogue, adapters, client, parsers, prompts)

**Weeks:** 2–3 · **Depends on:** P01 (validator, units); P02 for settings and secrets (wave C only) · **Tasks:** 19 · **File:** [`phases/P03-ai-layer.md`](phases/P03-ai-layer.md)

**Goal.** One seam for every model call: `src/ai/client.ts` takes a request, resolves the role (vision primary, optional text provider, image and text standbys), prepares images, calls one of three wire adapters with one retry ladder and one overall deadline (D-16.23), re-asks once on a cut-off answer, falls back to the standby on any failure including an answer that fails validation (D-16.22), and returns typed results or one error kind with fixed copy. Our own prompts and reply contract live in `src/ai/prompts/`. Everything is tested with a scripted fake fetch, no keys and no network.

**Read in reference.**

- Spec 03 (all of §2–§3, §5, §6); spec 01 §3.6 (plan prompt intent), §3.11 (nutrient goals).
- `A/models/{AIProvider,OpenRouterReasoningEffort,ServingUnitOption}.kt` [339, 27, 132]; `I/Models/AIProvider.swift` [979].
- `A/services/ai/{AiError,RetryPolicy,GeminiClient,OpenAICompatibleClient,AnthropicClient,FoodImagePreprocessor,ServingUnitRepairPolicy}.kt` [91, 139, 248, 239, 154, 36, 47]; `A/services/FoodImageDecoder.kt` [151]; `A/services/SecureHttpClient.kt` [43].
- `I/Services/{AIErrorMessages,AIRequestErrorPolicy,GeminiRequestConfiguration,ServingUnitRepairPolicy}.swift` [86, 13, 101, 47].
- Big files, named parts only: `A/services/ai/FoodAnalysisService.kt` [806: `callAi`, `dispatch`, standby configs; prompts for intent only]; `A/services/ai/FoodAnalysis.kt` [666: `extractJson`, `parseFoodResponse`, `parseIngredients`, `parseLabelResponse`, `parseServingUnitOptionsResult`, `parseOptionalNutrientGoals`]; `I/Services/GeminiService.swift` [1 989: router 820–1105, adapters 1105–1435, parsing 1436–1989].
- Tests: `T/services/ai/{AIRequestConfigurationTest,GeminiClientTest,RetryPolicyErrorTest,RetryPolicyThreadingTest,AiErrorTest,OpenAITokenLimitParameterTest,OpenAIResponseParserTest,AnthropicResponseParserTest,OpenRouterReasoningEffortTest,ServingUnitFallbackDecisionTest,ServingUnitRepairPolicyTest,IngredientBreakdownParserTest,GoalCalculationParserTest}.kt`; `IT/{AIModelRegistryTests,AIRequestConfigurationTests,AIRequestErrorIntegrationTests,AIErrorMessagesTests,AIRequestErrorPolicyTests,GeminiRequestConfigurationTests,ServingUnitFallbackTests,AnthropicResponseParsingTests,OpenAITokenLimitTests}.swift`.
- Never read the reference's prompt text for wording (01-clean-room §4): prompts are written from the spec's described intent.

**Write.**

- [ ] P03-01 Error kinds, classification and messages
- [ ] P03-02 Fake fetch and wire fixtures
- [ ] P03-03 Provider catalogue and model presets
- [ ] P03-04 AI settings, roles, endpoints and standby validity
- [ ] P03-05 Transport and deadlines
- [ ] P03-06 Retry ladder
- [ ] P03-07 Gemini adapter
- [ ] P03-08 OpenAI-compatible adapter
- [ ] P03-09 Anthropic adapter
- [ ] P03-10 Image preparation
- [ ] P03-11 JSON extraction
- [ ] P03-12 Food reply parser
- [ ] P03-13 Unit choices and parts breakdown
- [ ] P03-14 Plan, nutrient-goal and label readers
- [ ] P03-15 Food prompts and reply contract
- [ ] P03-16 Planning and fit-check prompts
- [ ] P03-17 Client pipeline
- [ ] P03-18 Food and planning tasks with unit repair
- [ ] P03-19 Browser CORS probe (gated)

**Compare / verify.** Every error-kind branch and its order; the thinking table; token parameter names; truncation per format; deliberate D-16.22–D-16.26 differences. Then the phase's checklist and its run-until-green additions.

**Done when.** The AI layer passes its tests with the fake fetch: adapters, retry, deadline, standby, parsers, repair and prompts. No module outside `src/ai/transport.ts` calls `fetch` for AI (lint). **Demo (M1, part 3):** `pnpm test src/ai/client.test.ts --reporter=verbose` shows a 503 ladder, a standby rescue of an unusable answer, a compact re-ask and a silent cancel.

## P04 · App shell, UI primitives and the walking skeleton

**Weeks:** 2–3 (primitives can start in week 1 on the UI track) · **Depends on:** P00; P01 and P02 for the wave-B feature tasks · **Tasks:** 14 · **File:** [`phases/P04-shell-and-walking-skeleton.md`](phases/P04-shell-and-walking-skeleton.md)

**Goal.** The product runs end to end in a real phone-sized browser: the tab bar with Home, Progress, Coach and Settings; a start-up skeleton until the profile and settings are read (no fallback goals or default switches flash); a temporary "start with defaults" path in place of onboarding; Home with the energy gauge, macro pillars and the diary grouped by meal; a manual entry that lands under its meal and survives a reload. The UI primitives every later screen uses exist with accessible names and values as text.

**Read in reference.**

- Spec 05 §3.1–3.4; spec 02 §3.8; spec 06 §3.1 (hub).
- `A/ui/navigation/{FudAIRoutes,FudAINavHost,BottomNavBar}.kt` [38, 392: `selectTab`, lifecycle, 419]; `A/models/TabBarSettings.kt` [26]; `A/ui/components/{FudGlass,WheelPicker,UnitToggle,OptionPickerSheet,MacroCard}.kt` [339, 439, 104, 186, 158]; `I/Views/{Theme,ManualEntryView}.swift` [210, 165].
- Big file, named parts only: `A/ui/home/HomeScreen.kt` [3 229: lines 226–600 layout, 1666–1850 gauge, 1868–2150 headers and grouping, 2204–2470 rows, 3054–3229 manual entry].
- Tests: `T/ui/navigation/FudAIRoutesTest.kt`; `IT/TabBarSettingsTests.swift`; `T/ui/home/{FoodSubmissionGateTest,ManualEntryInputTest}.kt`; `T/ui/settings/SettingsCategoryTest.kt`.

**Write.**

- [ ] P04-01 Primitives: buttons, cards, sheets, dialogs, toasts
- [ ] P04-02 Primitives: inputs and pickers
- [ ] P04-03 Primitives: gauge, pillar, menu, swipe row, icons
- [ ] P04-04 Hash router and sheet stack
- [ ] P04-05 Tab bar
- [ ] P04-06 Theme provider
- [ ] P04-07 Boot gate, today clock and error boundary
- [ ] P04-08 Diary service (first cut)
- [ ] P04-09 Temporary quick start
- [ ] P04-10 Home page skeleton
- [ ] P04-11 Manual entry sheet
- [ ] P04-12 Entry row with delete
- [ ] P04-13 Tab placeholders and settings hub registry
- [ ] P04-14 Walking-skeleton e2e and parity scenario

**Compare / verify.** Tab rules, gauge statuses, diary grouping and food-only totals, manual entry rules. Then the phase's checklist and its run-until-green additions.

**Done when.** Unit tests for primitives, shell and Home pass; the walking-skeleton spec passes in the mobile viewport. **Demo 1 (M2):** open the app on a phone-sized window, start with defaults, add "Toast, 250 kcal" by hand, see it under its meal with the gauge at 250, reload, and it is still there.

## P05 · Onboarding and goals

**Weeks:** 2 · **Depends on:** P01, P02, P03, P04 · **Tasks:** 15 · **File:** [`phases/P05-onboarding-and-goals.md`](phases/P05-onboarding-and-goals.md)

**Goal.** A new person walks the wizard (sex, birthday, body, body fat, activity, goal, target, pace, reminders, AI access), watches the plan being built by their AI with a 60 s cap and a formula fallback (D-16.14), edits it on Plan Ready, and lands on Home with targets. In Settings they edit their profile and targets with locks, rebuild the plan with the AI, see the maintenance estimate, set optional nutrient goals and switch the weekly tune-up (Adaptive Goals) on or off. The goal-reached dialog appears from every weigh-in path.

**Read in reference.**

- Spec 01 §3.1, §3.4, §3.6–3.11, §3.13; spec 03 §3.3 (provider form).
- `A/ui/onboarding/OnboardingViewModel.kt` [622: steps, setters, `buildPlanWithAI`, `back()`, `complete()`]; `A/ui/settings/AiAccessSettings.kt` [208: BYOK part]; `I/Views/{MaintenanceEstimateRow,CalculationMethodsView}.swift` [56, 185: topics only].
- Big files, named parts only: `A/ui/onboarding/OnboardingScreen.kt` [2 355: lines 140–460, 553–1100, 1875–2355]; `I/Views/OnboardingView.swift` [1 843: lines 80–740, 1352–1843]; `A/ui/settings/SettingsScreen.kt` [5 141: lines 810–945, 1225–1520, 3155–3290, 3390–3440, 3750–3790, 4022–4060, 4960–5080]; `I/ContentView.swift` [7 966: lines 4818–4851, 4945–5240, 6510–6660, 7205–7520]; `I/Views/ProfileComponents.swift` [1 429: lines 75–480, 618–670, 803–1000]; `A/FudAIApp.kt` [795: lines 640–800]; `I/calorietrackerApp.swift` [562: lines 160–215, 476–560].
- Tests: `T/ui/onboarding/OnboardingStateTest.kt`; `T/ui/settings/ManualRecalculationPolicyTest.kt`; `IT/{GoalEvidenceTests,MaintenanceBreakdownTests}.swift`.

**Write.**

- [ ] P05-01 Wizard state machine
- [ ] P05-02 Wizard steps: Welcome to Body fat
- [ ] P05-03 Wizard steps: Activity to Reminders
- [ ] P05-04 AI access step and the shared provider form
- [ ] P05-05 Building plan step and plan builder
- [ ] P05-06 Plan ready step
- [ ] P05-07 Onboarding completion service
- [ ] P05-08 Rebuild plan service
- [ ] P05-09 Weekly tune-up runner
- [ ] P05-10 Settings: personal info page
- [ ] P05-11 Settings: goals and nutrition page
- [ ] P05-12 Optional nutrient goals editor
- [ ] P05-13 Calculation methods page
- [ ] P05-14 Goal-reached dialog
- [ ] P05-15 Onboarding and goals e2e

**Compare / verify.** Wizard steps and ranges, Plan Ready coupling, completion side effects, rebuild and tune-up rules, profile edit rules. Then the phase's checklist and its run-until-green additions.

**Done when.** Wizard, settings pages and services pass their tests; `e2e/onboarding.spec.ts` passes. **Demo 2 (M3):** a fresh browser walks the wizard with the fake provider, sees the AI plan, edits protein, finishes on Home with those targets, then rebuilds the plan from Settings; a second run without AI ends on the formula plan with the note.

## P06 · Logging flows

**Weeks:** 3 · **Depends on:** P01, P02, P03, P04 (P05 for the allergen list and the provider form) · **Tasks:** 20 · **File:** [`phases/P06-logging-flows.md`](phases/P06-logging-flows.md)

**Goal.** Every way to log food works and every number is checked before it is saved: the add menu (Snap & scan, Describe, Reuse), photos (up to 10, a note, plate-built-in-steps), typed descriptions, barcodes by camera or typed digits (Open Food Facts, then the saved label, then FoodData Central), saved meals (recent, often eaten, saved), copy a day, and manual entry. The review sheet handles serving units, arithmetic amounts, nutrition unlock, ingredient lines, recipe splits, the fit check, product information and the allergen line; logged entries can be edited (nutrition included, D-16.19), reprocessed and combined. Drafts survive a reload (D-16.46).

**Read in reference.**

- Spec 02 (all of §3, §5, §6); spec 03 §3.11 (fit check).
- `A/models/{AddMenuConfig,AllergenAnalysis,BarcodeLabelMemory,FoodProductMetadata,ProductInfoField,IngredientLabelParser}.kt` [221, 115, 66, 52, 64, 294: markup part]; `I/Models/AddMenuConfig.swift` [196].
- `A/services/{OpenFoodFactsService,FoodDataCentralService,BarcodeProductLookup,FoodImageDecoder}.kt` [369, 383, 75, 151]; `I/Services/{OpenFoodFactsService,FoodDataCentralService,StoredPhotoCompressor}.swift` [533, 416, 255].
- `A/ui/home/{FoodResultSheet,EditFoodEntrySheet,SavedMealsSheet,BarcodeScannerSheet,ContextNoteSheet,PhotoCaptureDraftViewModel,MealIngredientsUi,IngredientIntakeHost,IngredientIntakeViewModel,FoodProductMetadataCard}.kt` [1 303, 961, 721, 200, 251, 200, 355, 331, 119, 235]; `I/Views/{FoodResultView,EditFoodEntryView,RecentsView,TextFoodInputView}.swift` [1 750: lines 160–330, 730–880, 1109–1300; 837; 281; 80].
- Big files, named parts only: `A/ui/home/HomeViewModel.kt` [1 255: lines 440–1255 analyse, save, drafts, re-log, reprocess]; `A/ui/home/HomeScreen.kt` [3 229: lines 260–420 menu dispatch, 860–1200 sheets and errors, 2706–2850 copy day]; `A/ui/home/FoodSheetPrimitives.kt` [846: `ServingQuantityCard`]; `I/ContentView.swift` [7 966: search `photosPicker(`, `startAnalysis(`, `RecentsView(mode:`, `private func copy(`, `supportedTypes`].
- Tests: `T/models/{AddMenuConfigTest,AllergenAnalysisTest,BarcodeLabelMemoryTest,ProductInfoFieldTest,IngredientLabelParserTest,FoodEntryPhotoRemovalTest,CombinedMealTest}.kt`; `T/services/{OpenFoodFactsServiceTest,FoodDataCentralServiceTest,BarcodeProductLookupTest,FoodImageStoreRestoreTest}.kt`; `T/ui/home/{PendingReviewStateTest,FoodDraftSaversTest}.kt`; `IT/{OpenFoodFactsServiceTests,FoodDataCentralServiceTests,BarcodeLabelMemoryTests,StoredPhotoCompressorTests,AddMenuConfigTests,CombinedMealTests}.swift`.

**Write.**

- [ ] P06-01 Add-menu layout and menu
- [ ] P06-02 Photo storage service
- [ ] P06-03 Capture sheet and capture drafts
- [ ] P06-04 Analysis service and overlay
- [ ] P06-05 Describe sheet (typed meal)
- [ ] P06-06 Review sheet frame
- [ ] P06-07 Serving card and amount field
- [ ] P06-08 Nutrition rows, unlock and micronutrients
- [ ] P06-09 Ingredients card and recipe split
- [ ] P06-10 Fit check (what-if) sheet
- [ ] P06-11 Entry editor
- [ ] P06-12 Reuse lists: recent, often eaten, saved
- [ ] P06-13 Copy a day
- [ ] P06-14 Barcode scanner and typed digits
- [ ] P06-15 Open Food Facts client
- [ ] P06-16 FoodData Central client
- [ ] P06-17 Lookup order and label memory
- [ ] P06-18 Product block, ingredient label and allergen line
- [ ] P06-19 Home selection and combine
- [ ] P06-20 Logging e2e

**Compare / verify.** Every add-menu method (handle / hide / later), review sections, scaling and unknown-weight cases, edit rules, lookup order and mappings, reuse lists. Then the phase's checklist and its run-until-green additions.

**Done when.** Every P06 module passes its tests; `e2e/logging.spec.ts` passes; the initial bundle stays under budget with the WASM decoder lazy. **Demo 3 (M4):** log a photo with the fake provider, change the amount with "1.5" servings, log it; type a barcode and log the product; log yesterday's breakfast again from Recent; edit an entry's calories; combine two entries; reload mid-review and see the draft come back.

## P07 · Home depth, Progress, water, fasting, weight and body fat

**Weeks:** 2–3 · **Depends on:** P01, P02, P04, P06 (add menu, diary rows) · **Tasks:** 17 · **File:** [`phases/P07-home-progress-trackers.md`](phases/P07-home-progress-trackers.md)

**Goal.** Home becomes the full day view: a week bar of 53 weeks, day swipe, the gauge and up to four chosen pillars plus water, the day's nutrient sheet, both sort modes, water and fasting rows. Water and fasting work end to end (off by default; an active fast pauses food logging with "End fast and log", D-16.35). Progress shows the last completed week's recap, ranges with period arrows, weight and body-fat cards with charts and logging, histories with confirmed deletes, the calorie history and nutrient averages.

**Read in reference.**

- Spec 05 §3.2–3.7; spec 06 §3.4 (tracking rows).
- `A/ui/components/{WeekStrip,MacroCard}.kt` [238, 158]; `A/ui/home/{NutritionDetailSheet,WaterViews}.kt` [623, 99]; `A/ui/progress/{ProgressViewModel,ProgressMetric,WeeklyRecap,WeeklyRecapCard}.kt` [114, 20, 277, 329]; `I/Models/WeeklyRecap.swift` [298]; `I/Views/FastingViews.swift` [320].
- Big files, named parts only: `A/ui/progress/ProgressScreen.kt` [2 901: lines 167–657 ranges and layout, 760–1400 weight chart, 1497–1970 calorie chart and stats, 1974–2270 histories and log weight, 2296–2620 body fat]; `A/ui/home/HomeScreen.kt` [3 229: lines 1235–1527 fasting rows and dialogs, 1868–2150 headers]; `I/Views/{HomeComponents,ProgressComponents,ProgressMetricViews}.swift` [778, 2 131, 583: week strip, chart domains, history views]; `I/ContentView.swift` [7 966: lines 1270–1295 day swipe, 1490–1560 + menu].
- Tests: `T/ui/progress/{ProgressRangeTest,LogWeightDateTest,ProgressMetricTest,WeeklyRecapTest}.kt`; `T/ui/home/HomeDiaryMealGroupTest.kt`; `IT/{ProgressRangeTests,WeeklyRecapTests,FastingStoreTests,WeightHistoryTests}.swift`.

**Write.**

- [ ] P07-01 Week bar
- [ ] P07-02 Selected day and day swipe
- [ ] P07-03 Gauge and pillars, full
- [ ] P07-04 Day nutrients sheet and pillar picker
- [ ] P07-05 Diary depth: sort modes, water and fast rows
- [ ] P07-06 Water flows and settings
- [ ] P07-07 Fasting flows, editor and settings
- [ ] P07-08 Add menu: water and fasting entries
- [ ] P07-09 Progress layout, ranges and periods
- [ ] P07-10 Line chart
- [ ] P07-11 Bar chart
- [ ] P07-12 Weight card and logging
- [ ] P07-13 Body-fat card and logging
- [ ] P07-14 History sheets
- [ ] P07-15 Weekly recap
- [ ] P07-16 Calories card and averages
- [ ] P07-17 Home and Progress e2e

**Compare / verify.** Week bar, pillars, diary modes, water and fasting rules, Progress maths, recap rules, weight logging and histories. Then the phase's checklist and its run-until-green additions.

**Done when.** All P07 tests pass; `e2e/home-progress.spec.ts` passes; Progress charts stay out of the initial bundle. **Demo 4 (M5):** browse to last Tuesday in the week bar and log a glass of water there; start a fast and see food paused, then end it and log in one step; log a back-dated weight and see it on the 1M chart; open last week's recap.

## P08 · Coach

**Weeks:** 2 · **Depends on:** P01 (forecast), P02 (coach repo), P03 (client parts), P04 · **Tasks:** 14 · **File:** [`phases/P08-coach.md`](phases/P08-coach.md)

**Goal.** The Coach tab answers questions from the person's own log. Each turn rebuilds a short context (profile, formulas, forecast, data counts, today's intake, calories left and water, D-16.27) and lets the model call six read-only nutrition tools for up to six rounds on all three wire formats; results are capped at 60 000 characters keeping the newest rows (D-16.32). Replies follow the person's language (D-16.28), render as safe Markdown and can be copied. Errors are friendly with Details and Retry (D-16.31); Reset drops late replies (D-16.34); the newest 200 messages are kept (D-16.29).

**Read in reference.**

- Spec 04 (all); spec 01 §3.12 (forecast).
- `A/ui/coach/CoachViewModel.kt` [259]; `A/services/ai/{CoachContext,ToolResultLimiter}.kt` [123, 56]; `A/models/ChatMessage.kt` [29].
- Big files, named parts only: `A/ui/coach/CoachScreen.kt` [1 407: `EmptyState`, `InputBar`, bubbles, `parseMarkdownBlocks`]; `A/services/ai/ChatService.kt` [679: `sendMessage`, `runProvider`, the three loops]; `A/services/ai/CoachTools.kt` [1 261: executors 104–708 nutrition part, schemas 1014–1097]; `I/Views/ChatView.swift` [1 248: `suggestedPrompts`, composer, `MessageBubble`]; `I/Services/ChatService.swift` [1 036: fallback, loops]; `I/Services/CoachTools.swift` [1 262: gating, `parseRange`].
- Tests: `T/services/ai/{ToolResultLimiterTest,RetryPolicyThreadingTest,OpenAITokenLimitParameterTest}.kt`; `T/ui/coach/CoachFailureSummaryTest.kt`; `IT/AIModelRegistryTests.swift` [lines 355–382].

**Write.**

- [ ] P08-01 Coach context and system prompt
- [ ] P08-02 Nutrition data tools
- [ ] P08-03 Tool-result limiter
- [ ] P08-04 History normaliser
- [ ] P08-05 Chat wire: OpenAI-compatible with tools
- [ ] P08-06 Chat wire: Anthropic with tools
- [ ] P08-07 Chat wire: Gemini with tools
- [ ] P08-08 Chat engine
- [ ] P08-09 Coach session service
- [ ] P08-10 Coach page
- [ ] P08-11 Composer and photo attachment
- [ ] P08-12 Prompt chips
- [ ] P08-13 Markdown rendering and copy
- [ ] P08-14 Coach e2e

**Compare / verify.** Every branch of the three tool loops, the context blocks, tool semantics, persistence and error handling. Then the phase's checklist and its run-until-green additions.

**Done when.** All Coach tests pass; `e2e/coach.spec.ts` passes. **Demo 5 (M6):** with the fake provider, ask "what did I eat yesterday?" and see an answer built from a `food_log` call; send a chip; force a failure and retry it; press Reset during a slow reply and see nothing arrive afterwards.

## P09 · Settings, data and platform

**Weeks:** 2–3 · **Depends on:** P02–P08 · **Tasks:** 19 · **File:** [`phases/P09-settings-data-platform.md`](phases/P09-settings-data-platform.md)

**Goal.** Settings is complete for v1 (hub, App Settings and units, meal times, tab bar, add-menu editor, product fields, AI providers and standbys, reminders and notifications, your data, About). Data leaves and returns safely: diary export (JSON, Markdown, CSV; kcal always), import of our own diary format with a preview and a safe merge, a local backup file with photos and the Coach chat but never keys, and an all-or-nothing restore that asks first (D-16.42). The app installs, works offline apart from AI and food databases, offers updates without surprise reloads, asks for persistent storage (D-16.8), and runs under a strict CSP.

**Read in reference.**

- Spec 06 (all of §3, §5, §6); spec 01 §3.5 (restore on Welcome); spec 03 §3.3 (AI page).
- `A/ui/settings/{TabBarSettingsScreen,AddMenuSettingsScreen,ProductInfoSettingsScreen,ExportDiarySheet,ImportDiarySheet,StorageSettingsCard}.kt` [119, 621, 200, 220, 151, 182]; `A/export/{DiaryExporter,DiaryImporter}.kt` [342, 336]; `A/backup/{CloudBackupArchive,CloudBackupCoordinator,CloudBackupRestore}.kt` [289, 322, 106]; `A/services/{ReminderDispatchPolicy,DailySummaryPolicy,StorageMaintenance}.kt` [7, 45, 114]; `A/ui/about/AboutScreen.kt` [683: section list only].
- `I/Services/{DiaryExporter,DiaryImporter,CloudBackupArchive,CloudBackupService}.swift` [358, 437, 413, 466]; `I/Stores/NotificationManager.swift` [602: lines 89–450]; `A/ui/onboarding/{ReturningUser,ReturningUserStep}.kt` [224, 695: state machine only].
- Big files, named parts only: `A/ui/settings/SettingsScreen.kt` [5 141: lines 255–760, 950–1160, 1225–1520, 1585–1990, 2185–2365, 2855–3140, 3290–3400, 3786–4020]; `A/services/NotificationService.kt` [856]; `I/Views/ProfileComponents.swift` [1 429: lines 1100–1330]; `I/ContentView.swift` [7 966: lines 5740–5850, 6190, 6360, 6880]. Reference doc: `docs/cloud-backup.md` (behaviour only).
- Tests: `T/export/{DiaryExporterTest,DiaryImporterTest}.kt`; `T/backup/{CloudBackupArchiveTest,CloudBackupRestoreTest}.kt`; `T/services/{ReminderDispatchPolicyTest,DailySummaryPolicyTest}.kt`; `T/ui/settings/AddMenuGroupCountTest.kt`; `T/ui/onboarding/ReturningUserStateTest.kt`; `IT/{DiaryExporterTests,DiaryImporterTests,CloudBackupArchiveTests,DailySummaryPolicyTests,RepeatingReminderSettingsTests,TabBarSettingsTests,ProductInfoSettingsTests}.swift`.

**Write.**

- [ ] P09-01 Settings hub and load gate
- [ ] P09-02 App settings and units pages
- [ ] P09-03 Meal times editor
- [ ] P09-04 Tab bar page
- [ ] P09-05 Add-menu editor
- [ ] P09-06 Product fields page
- [ ] P09-07 AI providers page and food-database key
- [ ] P09-08 Reminder engine
- [ ] P09-09 Notifications settings and notifier
- [ ] P09-10 Export diary
- [ ] P09-11 Import diary
- [ ] P09-12 Backup archive codec and content hash
- [ ] P09-13 Backup and restore
- [ ] P09-14 Restore from file on Welcome
- [ ] P09-15 Your data page, storage card and persistence
- [ ] P09-16 About, licences and credits
- [ ] P09-17 Service worker and update flow
- [ ] P09-18 Manifest, install and CSP
- [ ] P09-19 Settings, data and offline e2e

**Compare / verify.** Settings rows kept or dropped with a reason, export/import rules, backup inclusion lists and order of restore steps, reminder cancel paths, erase order. Then the phase's checklist and its run-until-green additions.

**Done when.** All P09 tests pass; `e2e/settings-data.spec.ts` passes in both projects; the bundle stays under budget. **Demo 6 (M7):** install the built app, turn the network off and reopen it; export this week as CSV; back up, erase everything, restore the file from Welcome and find the same diary, photos, saved meals and Coach chat; keys are not in the file.

## P10 · Hardening and release

**Weeks:** 2 · **Depends on:** P00–P09 · **Tasks:** 14 · **File:** [`phases/P10-hardening-and-release.md`](phases/P10-hardening-and-release.md)

**Goal.** Prove v1.0: every P0/P1 feature has passing acceptance tests (`pnpm check:acceptance --strict`), every trap has a test or a reasoned review line, the REA parity pass has classified every divergence, accessibility and the bundle budget pass, the security review is written, live provider checks are recorded, user docs exist, and the release is prepared (tagging only when the user asks).

**Read in reference.**

- No new reference code. The REA reference observations in `~/rea-lab/parity/fud-ai/` (outside the repo) and the store screenshots they cite; Evidence ids only in the repo.

**Write.**

- [ ] P10-01 Parity scenarios: food and Home
- [ ] P10-02 Parity scenarios: Progress, Coach, settings and data
- [ ] P10-03 Parity runner
- [ ] P10-04 Obligations ledger and parity report
- [ ] P10-05 Acceptance strict pass
- [ ] P10-06 Traps ledger completion
- [ ] P10-07 Accessibility pass
- [ ] P10-08 Bundle budget and shipped inventory
- [ ] P10-09 Security review
- [ ] P10-10 Similarity report
- [ ] P10-11 Browser matrix
- [ ] P10-12 Live provider check (gated)
- [ ] P10-13 User docs
- [ ] P10-14 Release prep

**Compare / verify.** Every parity divergence classified; every visible D-id has an acceptance test; nothing of the reference in `dist/`. Then the phase's checklist and its run-until-green additions.

**Done when.** `pnpm check --require-ref --strict` green, parity report with no unclassified divergence, accessibility and bundle gates green, security and similarity reports written, user docs published in the repo. **Demo (M8, v1.0):** the release checklist walked live: install, onboard with a real or fake provider, log by photo, barcode and hand, check Progress, ask the Coach, back up and restore.

## After v1.0

Order from research 07 §5.2 as the lead set it on 2026-10-26 (Proposed D-16.53). Each phase gets its own file in `phases/` in the same format when scheduled; their trap rows (R07.x, R04.21) already sit in the traps ledger.

| Phase | Scope | PWA mapping | Depends on | Notes |
|---|---|---|---|---|
| **L1** | i18n wave 1: infrastructure on the v1 catalogue, 2–4 languages, an in-app language picker, an RTL check | `Intl`, catalogue partitions per locale, `dir="rtl"`, logical CSS | v1 (every string already in the catalogue) | Catalogue lint compares placeholders with English (R06.23); Coach already answers in the person's language (D-16.28) |
| **L2** | Workouts core (diary and planner, library from the upstream open dataset at a pinned commit under its own licence, sets/reps/RPE, timers, net burn, routines, own exercises) and the rest timer | IndexedDB tables, on-demand images with a capped cache, wall-clock rest end | L1 optional | Never the reference's copy, art or CDN (R07.5); burn feeds the day summary directly and does not change the calorie goal (R07.1) |
| **L3** | AI text workouts, AI fill for own exercises, Coach workout tools and exercise proposals, the training chip | the v1 AI client and Coach engine | L2, v1 Coach | Proposal integrity (R04.21); tool names `workout_log`, `exercise_search`, … (17 §1.5) |
| **L4** | Speech-to-text for food logging and Coach (Web Speech plus BYOK recorded STT for vendors that pass a CORS spike, with standby) and direct meal-share links with an import route | `SpeechRecognition`, `MediaRecorder` or an AudioWorklet WAV encoder, Web Share | v1 describe flow | Recordings deleted in every outcome (R07.10); share payload versioned and capped (R07.16); iOS storage partitions (R07.17); optional on-device speech model (R07.21) |
| **L5** | Live-voice spike: one vendor with browser-safe auth, read-only tools first | WebSocket or WebRTC with an ephemeral token | L4 | Browser WebSockets cannot send auth headers (R07.12); writes need confirm, undo and timeouts (R07.13) |
| v1.x | P2 backlog: press-and-slide tab bar (A7), haptics (A12), per-100 g label analysis (D29), preset upgrades (E15), photo-size message (E16), gauge fill animation (F13), compress photos (K8), manifest shortcuts (L8), full ingredient-label split (D23) | — | v1.0 | Can interleave with L1 |
| Candidates | Body measurements (N-7), Google Drive backup (N-4), key passphrase lock (N-6), Coach streaming (D-16.47), own workout illustrations | — | — | Unscheduled until the user decides |
| Not planned | Short share links, weekly challenge, hosted AI, community bot (N-8); health-store sync (N-5); widgets, watch, Siri (D-16.3) | — | — | Need a backend or a native platform |

## Proposed decisions (D-16.49+)

Where the specs leave a choice open and no D-id settles it, the plan proposes one. Builders follow the proposal until the lead confirms or changes it; the lead records the outcome in `16-what-we-change.md` (this file does not edit it).

| ID | Open point | Recommendation |
|---|---|---|
| Proposed D-16.49 | Onboarding AI step (01 §3.4 step 11; no hosted path in Platewise) | Offer "Set up later": onboarding continues without a provider, the plan uses the formulas with the D-16.14 note, and AI features show how to add a key. Otherwise a person without a key cannot finish onboarding. |
| Proposed D-16.50 | Meal kind on Copy a day (02-Q2; D-16.16 covers only the review) | Copies keep each entry's original meal kind; saved-meal re-logs go through the review and follow D-16.16. Copying yesterday's breakfast at 20:00 should stay breakfast. |
| Proposed D-16.51 | Keys at rest (03 §3.15 item 8; D-16.7 says "separate table") | Wrap each key with a non-extractable AES-GCM device key kept in IndexedDB; a missing or unusable wrapping key reads as "no keys" (R03.27). Protects copies of raw storage only; the D-16.7 warning stays. Checked: Node 22 can structured-clone the key, so tests work with fake-indexeddb. |
| Proposed D-16.52 | Backup file container (06 §5; D-16.30) | A ZIP with stored (uncompressed) entries written and read by our own small codec in `src/services/backup/zip.ts`, `payload.json` first then `photos/`; no new dependency. Photos are already JPEG, so compression would save little. |
| Proposed D-16.53 | Later-phase numbering (16 §2.4 lists L1 workouts, L2 voice, L3 languages, L4 measurements and Drive, L5 live voice) | Adopt the lead's 2026-10-26 order from research 07 §5.2: L1 i18n; L2 workouts core and rest timer; L3 AI text workouts and Coach workout tools; L4 speech-to-text and direct meal-share links; L5 live-voice spike. Body measurements (N-7), Google Drive backup (N-4) and the key passphrase lock (N-6) become unscheduled candidates. Update the L labels in 16 §2.4. |
| Proposed D-16.54 | CI location (intake: the rest of the Ai1 repo is untouched) | Put one workflow at the repository root, `.github/workflows/platewise.yml`, filtered to `platewise/**`; it is the only file outside `platewise/`. Until confirmed, `platewise/ci/platewise.yml` is the source and `scripts/ci-local.sh` reproduces it. |
| Proposed D-16.55 | One catalogue vs parallel builders | `src/i18n/en.ts` stays the single catalogue export, composed of per-area partitions under `src/i18n/en/`; each slice owns its partition and only the lead adds the import to `en.ts`. Keeps "one catalogue" without merge conflicts. |
| Proposed D-16.56 | Weight and body-fat ranges outside Progress (D-16.37 names the pickers in general; 01 has 30–250 kg in onboarding, other ranges in Settings) | Use 20–250 kg / 50–500 lb for every weight picker (onboarding, Settings, Log weight) and 3–60 % in 0.5 steps for every body-fat picker. |
| Proposed D-16.57 | Optional nutrient goal pickers (01 §3.11 has Android and iOS columns) | Use the Android ranges and steps, consistent with D-16.12; typed custom values stay unsnapped and clamped 0–999 999. |
| Proposed D-16.58 | Food reply strictness (03 §3.6: Android defaults missing macros to 0, iOS requires numbers) | kcal, protein, carbs and fat must be present as finite numbers or numeric strings; anything else is an invalid answer, which triggers the standby under D-16.22. |
| Proposed D-16.59 | Coach tool `limit` direction (04-Q9; D-16.32 settles only the size cap) | When a range holds more rows than `limit`, keep the newest N (output still oldest first), the same direction as the size cap. |
| Proposed D-16.60 | Scope of the overall AI deadline (D-16.23) | The deadline also covers the serving-unit repair request of the same analysis and every Coach round of one turn; per-attempt cap 75 s for fixed cloud providers, the remaining budget for Ollama and Custom; the timeout row is shown for every provider. |
| Proposed D-16.61 | Reminder times and content (06-Q6; D-16.41 fixes the model, not the times) | Defaults breakfast 08:00, lunch 12:00, dinner 19:00, daily summary 20:00, water 14:00 (D-16.40), all off; meal reminders are not suppressed by logging; the summary reads "eaten X of Y, Z left"; no streak, weight or body-fat reminders. |
| Proposed D-16.62 | Label scanning after a barcode miss (02 §3.12 vs 03 §3.5) | "Scan label" uses the multi-photo meal request with source label; the dedicated per-100 g label analysis is v1.x (inventory D29). |
| Proposed D-16.63 | Wizard steps after dropping the health step (01-Q7, D-16.15) | 13 steps, indices 0–12 (Welcome … Reminders, AI access, Building plan, Plan ready); progress = index ÷ 12, shown on steps 1–10. |
| Proposed D-16.64 | Body-fat value in Coach tool output (04 §3.16: Android truncates, iOS rounds) | Round to one decimal. |
| Proposed D-16.65 | Default answer token limit (03-Q6) | Keep 1 024 for every provider (now visible for all, D-16.25); measure multi-dish replies in the P10-12 live check and raise the default if cut-offs are common. |
| Proposed D-16.66 | About, help, privacy and terms URLs (06-Q7) | Ship our own short privacy and terms pages in the app; help, contact and source links come from `src/config/links.ts` and stay hidden until the owner supplies them. |
