# 17 · Naming and glossary

Three tables: what each reference name becomes in Platewise (§1), the words the UI uses and why (§2),
and the domain glossary builders and docs share (§3). The reference column exists only so a reader
can translate while reading the specs; product code uses the Platewise column. §4 proposes the
reference-only names that are distinctive enough to ban in product code.

Identifier lists inside a cell are sorted alphabetically, not in the reference's order.

## 1. Reference name → Platewise name

### 1.1 Product and identity

| Concept | Reference name (reading only) | Platewise name |
|---|---|---|
| Product | Fud AI | **Platewise** |
| Repository slug, site | `fud-ai`, `fud-ai.app` | `platewise`; no site yet (About links are placeholders, Proposed D-16.66) |
| Package id and path | `com.apoorvdarshan.calorietracker`; iOS target `calorietracker` | web app: manifest `id` `./`; Android app (P11, D-16.89): application id and Kotlin package `app.platewise.android` (`android/app/src/main/java/app/platewise/android/`), app name Platewise |
| Environment prefix | — | `PLATEWISE_` (`PLATEWISE_REF`, `PLATEWISE_FAKE_AI_PORT`, `PLATEWISE_PROBE`) |
| URL schemes and deep links | `fudai://add-meal`, `fudai://log-food?method=` | hash routes: `#/home`, `#/progress`, `#/coach`, `#/settings/<page>`, `#/log/<method>` (manifest shortcuts) |
| OpenRouter attribution headers | the reference's repository URL and product name | Platewise's own URL and name |
| HTTP `User-Agent` for food databases | `FudAI/<version> (…)` | none (browsers forbid setting it); identify the app the way Open Food Facts documents for browsers |
| Logo, icons, palette | pink default plus 17 named presets with gradients; reference artwork | our mark (`public/icons/mark.svg`), six solid presets (D-16.1), our inline icon set |

### 1.2 Storage

| Concept | Reference name (reading only) | Platewise name |
|---|---|---|
| Store | Android DataStore file `fudai_prefs`; iOS UserDefaults | IndexedDB database `platewise` (Dexie), schema version 2 (version 2 adds `activity`, P11-03) |
| Profile blob | `userProfile` | table `profile`, row `me` |
| Food diary | `foodEntries` | table `entries` |
| Favourites | `favoriteFoodEntries`, legacy `favorites` | table `savedMeals` (own ids, D-16.17) |
| Pending analysis draft | `pendingFoodAnalysisDraft`; capture list `capturePhotoFilenames` | table `drafts`, rows `analysis` and `capture` |
| Weights, body fat, water, fasts | `bodyFatEntries`, `fastingSessions`, `waterEntries`, `weightEntries` | tables `bodyFat`, `fasts`, `water`, `weighIns` |
| Coach chat | `coachChatHistory` (one JSON string) | table `coachMessages` (one row per message) |
| Photos and thumbnails | folders `fudai-food-images`, `fudai-food-images-compressing`, `fudai-food-thumbnails-v2`, … | table `photos` (blob and thumbnail per row) |
| Quarantine for unreadable data | `CorruptDataBackups`, `corrupt-backups`, `<key>.json.corrupt-<ms>` | table `quarantine` |
| Secrets | `fudai_keychain`, iOS Keychain service; entries `apikey_<provider>`, `speechApiKey_<provider>`, `usdaFoodDataCentralApiKey` | table `secrets`, slots `<providerId>` and `fdc`, wrapped by a device key (Proposed D-16.51) |
| Misc metadata | migration markers (`aiModelRegistryMigrationVersion`, `fallbackBaseURLMigrationVersion`, `geminiModelMigrationVersion`) | table `meta` (`presetUpgradeVersion`, `wrapKey`, `coachGeneration`, `unreadableData`, `restoring`) |
| Health activity copy (Android app) | none: Home reads the health store live | table `activity` (key: day key; `{day, steps, activeKcal, totalKcal, distanceM, sessions, syncedAt}`), schema version 2; never in a backup |
| Health sync state (Android app) | `deletedWeightEntryIds`, `healthNutritionImportedKeys`, `importedHealthWorkoutsV1`; a background write-retry worker | table `meta`: `healthImported` (weigh-in ids imported once, so a deleted one never returns), `healthLastSync` (when the last sync ended), `healthSent` (what write-back last sent, by client record id); device state, never in a backup |

### 1.3 Settings keys

| Area | Reference keys (reading only, sorted) | Platewise key (table `settings`) |
|---|---|---|
| Display | `appThemeColor`, `appearanceMode`, `weekStartsOnMonday` | `display.accent` (`basil`…), `display.appearance`, `display.weekStart` (`mon` or `sun`) |
| Units | `energyUnit` (`kcal`/`kj`), `heightUnit` (`cm`/`ftin`), `useMetric`, `weightUnit` (`kg`/`lbs`) | `units.energy` (`kcal` or `kJ`), `units.height` (`cm` or `ftIn`), `units.weight` (`kg` or `lb`); no legacy flag |
| Logging | `foodMeasurementPreferGramsByDefault`, `lastRecentsSegment`, `saveMealPhotosToGallery` | `log.gramsFirst`; the other two are not carried |
| Meal times | `mealBreakfastStartMinutes`, `mealDinnerStartMinutes`, `mealLunchStartMinutes`, `mealSnackStartMinutes` | `meals.times` (one record `{breakfast, lunch, dinner, lateSnack}`) |
| Home | `foodLogSortOrder` (`latestMealsFirst`/`standard`), `homeTopNutrients` | `home.sort` (`byMeal` or `newestFirst`), `home.pillars`, `home.sugarLine` |
| Tabs and menus | `addMenu.config`, `hiddenTabs`, `productInfoHiddenFields`, `productInfoShown`, `quickAction.slot1..3` | `menu.layout`, `tabs.hidden`, `product.hiddenFields`, `product.show`; quick-action slots not carried |
| Progress | `progressIncludeToday` | `progress.countToday` |
| Water | `waterDailyGoalMl`, `waterQuickAddPresetsMl`, `waterTrackingEnabled`, `waterUnit` (`floz`/`ml`) | `water.goalMl`, `water.quickAddMl`, `water.on`, `water.unit` (`flOz` or `ml`) |
| Fasting | `fastingDefaultGoalMinutes`, `fastingTrackingEnabled` | `fasting.defaultGoalMin`, `fasting.on` |
| Reminders | `breakfast…/lunch…/dinnerReminderEnabled/Hour/Minute`, `dailySummaryEnabled/Hour/Minute`, `fastingGoalNotificationEnabled`, `goalReachedNotificationsEnabled`, `notificationsEnabled`, `streakReminder…`, `waterReminderEnabled/Hour/Minute`, `weightLogReminder…`, `bodyFatLogReminder…` | `remind.master`, `remind.breakfast`, `remind.lunch`, `remind.dinner`, `remind.summary`, `remind.water` (each `{on, at: 'HH:MM'}`), `remind.fastGoal`, `alerts.goalReached`; P17: `notify.off` (kinds turned off), `notify.quiet`, `notify.onlyIfNotLogged`, `notify.inbox`, `notify.device` (device state); `coach.setsReminders`, `coach.checkIns`; no streak, weight or body-fat reminders (D-16.41) |
| Goals | `adaptiveGoalsEnabled`, `adaptiveGoalsLastCheckDay`, `adaptiveGoalsPreviousTargets`, `lastRecalcGoalSignature`, `onboardingPlanEdited`, `optionalNutrientGoals` | `tuneUp.on`, `tuneUp.lastCheckDay`, `tuneUp.savedPlan`, `goals.rebuildBaseline`, wizard state `planTouched`, `goals.nutrients` |
| Onboarding | `acceptedTermsAndPrivacy`, `aiAnalysisConsentGiven`, `hasCompletedOnboarding` | `onboarding.termsAccepted`, `onboarding.done` |
| AI | `aiRequestTimeoutSeconds`, `aiUserContext`/`userContext`, `customBaseURL_<p>`, `fallbackCustomBaseURL_<p>`, `maxResponseTokens`/`aiMaxResponseTokens`, `openRouterReasoningEffort`, `selected(Text)(Fallback)AIProvider/Model`, `separateTextProviderEnabled`, `textAIFallbackEnabled`, `aiFallbackEnabled` | one record `ai.settings`: `{primary, textRole: {on, provider, model}, imageStandby, textStandby, endpoints: {<p>: {main, standby}}, instructions, maxTokens, timeoutSec, openRouterEffort}`; `ai.answerLimitRaised` (D-16.104, set once the old 1 024 limit was raised) |
| Backup and prompts | `cloudBackup…`, `hasSeenWhatsNew.*`, `lastNotifiedUpdateVersion`, `reviewPromptedAfterFirstLog` | `backup.lastAt`, `storage.persistAsked`, `storage.nudgeDone`; no What's New or review prompt (D-16.43) |
| Health Connect (Android app, P11) | `energyBurnEnabledV2` (I), `healthConnectEnabled`, `healthEnergyGoalsEnabled` (A), `healthKitEnabled` | `health.connected` (false; device-local, never in a backup), `health.countActiveCalories` (true), `health.importWeights` (true), `health.writeBack` (false); no Energy Burn goal setting (later item) |

### 1.4 Formats and enum values

| Concept | Reference (reading only, sorted) | Platewise |
|---|---|---|
| Backup archive | format id `fudai-cloud-backup` v1; entries `backup.json`, `photos/`; Drive file `fudai-backup.zip`; value tags `b`, `d`, `i`, `s`, `ss` | format `platewise-backup` v1; entries `payload.json`, `photos/`; file `platewise-backup-<yyyy-MM-dd>.zip`; plain JSON values |
| Diary export | file `Fud-Food-Diary-<start>_to_<end>.<ext>`; app id `Fud AI`; `format_version` `1.5`; sources `ai_estimated`, `manually_edited` | file `platewise-diary-<start>_to_<end>.<ext>`; `format: 'platewise-diary'`, `version: '1.0'`; sources `ai`, `manual` |
| Entry source | `barcode`, `manual`, `nutritionLabel`, `snapFood`, `textInput` | `barcode`, `label`, `manual`, `photo`, `text` |
| Activity level | `active`, `extraActive`, `light`, `moderate`, `sedentary`, `veryActive` | `active`, `athlete`, `hard`, `light`, `moderate`, `sedentary` |
| Meal, sex, goal | `breakfast`/`dinner`/`lunch`/`other`/`snack`; `female`/`male`/`other`; `gain`/`lose`/`maintain` | the same plain English words (generic) |
| Log methods | `barcode`, `camera`, `copy_from_day`, `favorites`, `frequent`, `manual`, `photos`, `recent`, `siri_phrases`, `text`, `voice` | `barcode`, `camera`, `copyDay`, `describe`, `library`, `manual`, `often`, `recent`, `saved` (`voice` reserved for L4) |
| Default menu groups | `__default_describe_meal__`, `__default_group__`, `__default_photo_scan__`, `__default_reuse_meal__` | `describe`, `reuse`, `snapScan`; a blank name shows the catalogue's generic group label |
| Accent presets | `fudPink` and 17 others | `basil`, `beet`, `ember`, `ink`, `lagoon`, `saffron` |
| AI error ids | `ai.error.<kind>` (`both_failed`, `connection`, `credits`, `daily_quota`, …) | `AiFailure.kind` (`bothFailed`, `connection`, `credits`, `dailyQuota`, …); messages under the `ai` catalogue partition |
| Provider ids | Android enum names (`ANTHROPIC`, `CUSTOM_OPENAI`, `GEMINI`, …); iOS display strings | `anthropic`, `cerebras`, `custom`, `deepinfra`, `deepseek`, `fireworks`, `gemini`, `groq`, `huggingface`, `mistral`, `ollama`, `openai`, `openrouter`, `qwen`, `together`, `xai` |
| Food reply keys (our prompt contract) | `calories`, `ingredients[]`, `serving_size_grams`, `unit_options[] {grams_per_unit, quantity, unit}`, snake_case nutrient keys | `kcal`, `parts[]`, `servingGrams`, `units[] {count, gramsEach, unit}`, `nutrients {<our nutrient keys>}` |
| Plan reply keys | `calories`, `carbs`, `fat`, `protein`, `reason` | `carbs`, `fat`, `kcal`, `protein`, `why` |
| Product field keys | `allergens`, `barcode`, `categories`, `ecoScore`, `ingredientLabel`, `labels`, `novaGroup`, `nutriScore`, `package`, `source`, `traces` | `allergens`, `barcode`, `categories`, `eco`, `ingredients`, `labels`, `nova`, `nutri`, `package`, `source`, `traces` |
| Coach message fields | Android `attachmentImageBase64`, `content`, `proposals`; iOS `attachmentImageData`, `exerciseProposals` | `id`, `role`, `text`, `at`, `thumb` (Blob), `state` |

### 1.5 Coach tool names (model-facing)

| Reference (reading only) | Platewise |
|---|---|
| `get_body_fat_history` | `body_fat_log` |
| `get_calorie_totals` | `daily_energy_totals` |
| `get_data_summary` | `data_overview` |
| `get_fasting_history` | `fasting_log` |
| `get_food_entries` | `food_log` |
| `get_weight_history` | `weight_log` |
| `get_exercise_lift_history`, `get_training_summary`, `get_workout_history`, `get_workout_plans`, `get_workout_preferences`, `search_exercise_library` | `lift_log`, `training_rollup`, `workout_log`, `workout_plan_days`, `training_profile`, `exercise_search` (L3; not offered in v1) |
| `propose_add_exercise_to_day`, `propose_custom_exercise` | `suggest_diary_exercise`, `suggest_new_exercise` (L3) |

### 1.6 Types, modules and screens

| Reference (reading only) | Platewise |
|---|---|
| `AIErrorMessages`, `AIRequestErrorPolicy`, `AiError`, `AiErrorKind` | `src/ai/errors.ts`: `AiFailure`, `classify`, `fromNetwork` |
| `AIProvider`, `AIProviderSettings` | `src/ai/catalog/providers.ts`, `src/ai/settings.ts` (`AiSettings`) |
| `AdaptiveGoalService`, `refreshAdaptiveGoalsIfNeeded` | `src/services/goals/tuneUp.ts`, `src/domain/adaptive/cadence.ts` |
| `AddMenuConfig` | `AddMenuLayout` (`src/domain/food/addMenu.ts`) |
| `AllergenAnalysis` | `checkAllergens` (`src/domain/food/allergens.ts`) |
| `AutoBalanceMacro`, `applyCaloriesEdit`, `applyMacroEdit`, `resetCaloriesToBalance`, `resetMacroToBalance` | `src/domain/goals/targets.ts`, `locks.ts` (`setKcal`, `setMacro`, `resetKcal`, `resetMacro`) |
| `BarcodeLabelMemory`, `BarcodeProductLookup`, `LabelScanBarcodeHandoff` | `src/domain/food/barcode.ts` (`barcodeKey`), `src/services/barcode/lookup.ts` (`lookupBarcode`, `armLabelScan`) |
| `CalorieGauge`, `CalorieHero` | `Gauge` (`src/ui/Gauge.tsx`), `DaySummary` |
| `ChatRepository`, `ChatStore` | `coachRepo` |
| `ChatService`, `CoachContext`, `CoachTools`, `ToolResultLimiter` | `src/services/coach/{engine,context,tools,limiter}.ts` |
| `CloudBackupArchive`, `CloudBackupCoordinator`, `CloudBackupRestore` | `src/services/backup/{zip,archive,hash,backup,restore}.ts` |
| `CombinedMeal` | `combineEntries` |
| `ConsistentDataStore` | `src/data/live.ts` |
| `DailySummaryPolicy`, `ReminderDispatchPolicy`, `NotificationService`, `NotificationManager` | `src/services/reminders/{schedule,engine,notifier}.ts` |
| `DiaryExporter`, `DiaryImporter` | `exportDiary`, `importDiary` (`src/services/transfer/`) |
| `EditFoodEntrySheet`, `EditFoodEntryView` | `EntryEditor` |
| `FastingSession`, `FastingSessionEditorView` | `Fast`, `FastEditor` |
| `FoodAnalysis`, `FoodJsonParser`, `parseFoodResponse` | `NutritionDraft`, `src/ai/parse/foodReply.ts` |
| `FoodEntry` | `DiaryEntry` |
| `FoodImagePreprocessor`, `FoodImageDecoder` | `prepareImage` (`src/ai/image.ts`), `src/lib/imageCodec.ts` |
| `FoodImageStore`, `StoredPhotoCompressor` | `photoRepo`, `src/services/photos.ts` |
| `FoodProductMetadata`, `ProductInfoField` | `ProductInfo`, `ProductField` |
| `FoodRepository`, `FoodStore` | `diaryRepo` |
| `FoodResultSheet`, `FoodResultView` | `ReviewSheet` |
| `FoodSubmissionGate` | single-flight gate in `src/services/diary.ts` |
| `FudAINavHost`, `FudAIRoutes`, `FudAIBottomNavBar` | `src/app/router.ts`, `TabBar` |
| `FudAITheme`, `FudGlass*`, `AppColors` | `src/ui/tokens.css`, `Card`, `Dialog`, `Sheet` |
| `GeminiService`, `FoodAnalysisService` | `src/ai/client.ts`, `src/ai/tasks/*` |
| `GoalCalculation`, `calculateGoals`, `parseGoalCalculation` | plan reply, `requestPlan`, `readPlanReply` + `checkPlan` |
| `GoalEnergyMath`, `MaintenanceBreakdown` | `src/domain/goals/{formulas,maintenance}.ts` |
| `GoalEvidence`, `GoalEvidenceBuilder`, `NutritionDayCompleteness` | `buildEvidence`, `DayCoverage` (`none`, `partial`, `full`) |
| `HealthConnectManager` (`A/services/health/`) | Capacitor plugin `HealthConnect` (`HealthConnectPlugin`, `HealthConnectGateway`, in `android/app/src/main/java/app/platewise/android/health/`); web side `src/services/health/` (`createHealthService`, `isHealthAvailable`, `loadHealth`), `healthRepo` |
| `HomeTopNutrient`, `MacroCard`, `MacroVerticalBar` | pillar nutrient, `Pillar`, `PillarRow` |
| `IngredientLabelParser` | `src/domain/food/labelText.ts` |
| `IngredientPortion`, `MealIngredient`, `MealMicronutrientStretch` | `IngredientLine`, `rescaleLine`, `applyLineChange` |
| `KeyStore`, `KeychainHelper` | `secretsRepo` |
| `MealSchedule` | `MealTimes` |
| `MultiPhotoCaptureSheet`, `ContextNoteSheet`, `PhotoCaptureDraftViewModel` | `CaptureSheet`, `captureDrafts` |
| `NutritionDetailSheet`, `NutritionDetailView` | `DayNutrientsSheet` |
| `OnboardingScreen`, `OnboardingView`, `OnboardingViewModel`, `OnboardingStep` | `WizardPage`, `wizard.ts`, `WizardStep` |
| `OpenFoodFactsService`, `FoodDataCentralService` | `src/services/barcode/{off,fdc}.ts` |
| `PendingFoodAnalysisDraft` | `AnalysisDraft` |
| `PersistedBlobGuard`, `PersistedJsonGuard` | `src/data/guard.ts` |
| `ProgressScreen`, `ProgressTabView`, `WeeklyRecapCalculator` | `ProgressPage`, `buildRecap` |
| `QuantityExpression`, `ServingAmountExpression` | `evalAmount` |
| `RecipeServings` | `splitRecipe` |
| `ReturningUser`, `ReturningUserState`, `ReturningUserView` | `RestoreFromFile` |
| `SavedMealsSheet`, `RecentsView` | `ReuseSheet` |
| `SecureHttpClient` | `src/ai/transport.ts` |
| `ServingUnitOption`, `ServingUnitRepairPolicy` | `UnitChoice`, `repairUnitsIfNeeded` |
| `UserProfile` | `Profile` |
| `WaterQuickAddPresets` | quick-add amounts (`src/domain/units/water.ts`) |
| `WeekEnergyStrip`, `WeekStrip` | `WeekBar` |
| `WeightAnalysisService`, `WeightForecast` | `forecastWeight` (`src/domain/forecast/forecast.ts`) |
| `crossesWeightGoal`, `goalInputSignature`, `recalculatedFromFormulas` | `crossesGoal`, `planInputsKey`, `formulaPlan` |

## 2. UI vocabulary

| Reference wording (reading only) | Platewise wording | Why |
|---|---|---|
| Review Food | Check before logging | Says what the person does and that nothing is saved yet |
| What if? | Fit check | Names the result (does this meal fit today?) rather than a hypothetical |
| Favorites | Saved | They are saved meals with their own identity (D-16.17), not a star on a row |
| Recents / Frequent | Recent / Often eaten | Plain words; "frequent" reads as an adjective without a noun |
| Copy from Day | Copy a day | Shorter, verb first |
| Text Input / Describe Meal | Describe | One verb for the method and its group |
| Manual Entry | Enter manually | Verb first like the other methods |
| Camera + Note / Photos | Camera / Photo library | The note lives inside the capture sheet for both |
| Photo & Scan, Reuse Meal | Snap & scan, Reuse | Short group names that fit the menu width |
| Progressive meal | Plate built in steps | Describes the photo sequence the switch is for |
| Servings in recipe | Split into servings | Says the action |
| More Nutrition | Micronutrients | The section holds exactly those, plus the sports compounds |
| Adaptive Goals | Weekly tune-up | Tells when it runs and that it adjusts, not replaces, the plan |
| Recalculate Goals | Rebuild plan | "Plan" is our word for the four targets |
| Tap to update | Inputs changed — rebuild | States the cause, not just a command |
| Auto-balance | Auto | Short; the row already shows the computed value |
| Estimated Maintenance | Maintenance estimate | Noun first, reads as a value |
| Weekly Recap | Last week | The card always shows a completed week |
| Include today | Count today | Clearer that it changes the averages |
| View More | All nutrients | Says what the sheet contains |
| Food logging paused | Fast in progress | Names the cause; the dialog then offers End fast and log (D-16.35) |
| Fallback provider | Standby provider | "Backup" already means the data file; standby says it waits for failures |
| Use Separate Text Provider | Different model for text | Describes the effect |
| Custom AI Instructions | Notes for the AI | Friendlier; they are notes, not code |
| Max Response Tokens | Answer length limit | Explains the purpose; "tokens" stays in the unit label |
| Request Timeout | Give up after | Describes the deadline (D-16.23) in the person's terms |
| Theme Color | Accent | One word; there is no other theme colour setting |
| Default to Grams | Grams first | Shorter, same meaning |
| Quick Add Amounts | Water buttons | Names what the person sees in the menu |
| + Menu | Add menu | Speakable |
| Data Management | Your data | Plain, possessive |
| Delete All Data | Erase everything | Unambiguous and distinct from deleting one entry |
| Clear Food Log | Clear diary | "Diary" is our word for the day's list |
| Reset Chat | Clear chat | Same verb family as Clear diary |
| Ask your Coach | Ask about your log | Says what the Coach can see |
| Calorie dome or ring | Energy gauge | Works for kcal and kJ |
| Home nutrient cards | Pillars (code) / Home nutrients (UI) | "Pillar" is the code name; the UI says what they show |

Words kept as they are because they are one- or two-word standard labels: Home, Progress, Coach,
Settings, Log, Save, Cancel, Done, Delete, Retry, Breakfast, Lunch, Dinner, Snack, Water.

## 3. Domain glossary

| Term | Meaning |
|---|---|
| **Entry** (diary entry) | One logged food row: energy in kcal, macros in grams, optional nutrients and extras, a serving basis, photos, meal and time. Water logs, weigh-ins and fasts are not entries. |
| **Diary** | The selected day's entries, water logs and fasts, grouped into meal sections on Home. |
| **Day key** | A local calendar day as `YYYY-MM-DD` in the device's zone, derived from an instant; diary queries use it. |
| **Meal kind** | breakfast, lunch, dinner, snack or other; suggested from the **meal times** for an entry's time (D-16.16). |
| **Meal times** | Four start minutes (breakfast, lunch, dinner, late snack) that classify a time of day; late snack wraps past midnight. |
| **Serving basis** | What an entry's numbers describe: a known weight in grams, or a **serving count** when the weight is unknown (never 100 g). |
| **Unit choice** | A named unit (slice, cup, piece, serving of a split recipe) with grams per unit; at most four per entry. |
| **Scale** | Shown amount ÷ base amount; every shown value is base × scale; typed values are stored ÷ scale. |
| **Nutrition draft** | What an analysis or lookup produces before review: name, values, basis, unit choices, parts. |
| **Part / ingredient line** | One component of a meal with grams, kcal and macros (no micronutrients); the header totals are the sum of the parts. |
| **Recipe split** | Dividing a whole recipe into N servings by adding a serving unit; a logged portion cannot be split again. |
| **Saved meal** | A snapshot copy of an entry with its own id, kept in order (D-16.17). |
| **Label memory** | The most recent label-sourced entry for a barcode, reused when the food databases cannot find it. |
| **Product info** | Barcode product metadata: package, scores, allergens, traces, labels, categories, ingredient label. |
| **Profile** | The one record of body data and goal choice (sex, birth date, height, weight, activity, goal, pace, target, body fat, allergens, saved targets, locks). |
| **Plan** | The four daily targets (kcal, protein, carbs, fat), from the AI or the formulas. |
| **Formula plan** | The plan computed by BMR × activity, the pace adjustment and the macro rules, with the spec's truncations. |
| **Target / effective target** | The value Home tracks against: the saved value if pinned, else the auto-balanced one. |
| **Pinned / auto** | A macro with a saved value is pinned; one without is auto and shares the remaining energy. |
| **Lock** | A Settings flag that keeps a value fixed while others rebalance; calories plus at most two macros. |
| **Plan check** | The validator that refuses or normalises an AI plan so 4P + 4C + 9F equals kcal (R01.2). |
| **Rebuild** | The person-triggered AI plan calculation with evidence; applied only if the profile did not change meanwhile. |
| **Weekly tune-up** (adaptive check) | The automatic rebuild at most every 7 days on app open; marks the week checked even on failure (D-16.45). |
| **Evidence pack** | Numbers and dates about logged days, weigh-ins and body fat sent with a plan request; today excluded, missing days unknown. |
| **Coverage** | Whether a day's log looks complete: none, partial or full, from energy against the goal. |
| **Forecast** | Weight expected at 30/60/90 days from average intake and TDEE, with an under-logging hint; used by the Coach. |
| **Maintenance estimate** | trunc(TDEE) compared with the effective target: deficit, surplus, or close (±50 kcal). |
| **Weigh-in / body-fat reading** | A dated weight in kg or body fat as a fraction; the profile follows the latest by date. |
| **Goal crossing** | A new latest weigh-in that passes the goal weight in the goal's direction; raises the goal-reached dialog once. |
| **Water log** | A dated amount in ml; never part of nutrition totals. |
| **Quick-add amounts** | The three water buttons (1–5 000 ml each). |
| **Fast** | A tracked fasting period with a start, an end (none while active) and a goal in minutes (60–10 080). |
| **Active fast** | A fast without an end; while one exists every food write is refused (D-16.35 offers End fast and log). |
| **Overlap** | Two fasts whose half-open intervals intersect, an active fast's end counting as infinite; never allowed. |
| **Pillar** | A vertical gauge on Home for one nutrient (or water) against its goal. |
| **Gauge** | The half-arc energy gauge on Home. |
| **Week bar** | The 53-week day picker at the top of Home. |
| **Window / period** | The inclusive range of days a Progress range shows; arrows step whole windows. |
| **Recap** | The last completed week compared with the week before. |
| **Role** | Which provider serves a request: primary (vision), text role, image standby, text standby. |
| **Standby** | The provider tried once when the primary fails or answers unusably (D-16.22). |
| **Deadline** | The overall time limit of one user action, from the timeout setting (D-16.23). |
| **Compact re-ask** | One repeat request after a cut-off answer asking for the bare object only. |
| **Unit repair** | The extra request for unit choices, only for zero-macro foods with a known weight. |
| **Failure kind** | One of the fixed AI error kinds, each with one message of ours. |
| **Turn / round** | A Coach question and its reply / one HTTP request inside a turn (at most six). |
| **Context block** | The per-turn text the Coach receives: profile, formulas, forecast, counts, today's numbers. |
| **Data tool** | A read-only Coach function over the turn's data snapshot. |
| **Limiter** | The 60 000-character cap on a tool result that keeps the newest rows (D-16.32). |
| **Generation** | A counter that makes late results stale: per analysis draft and per Coach conversation. |
| **Quarantine** | Where unreadable stored data is kept, untouched, before anything would overwrite it. |
| **Backup file** | Our ZIP with `payload.json` and `photos/`, never keys (Proposed D-16.52). |
| **Content hash** | SHA-256 over sorted values and photo names and sizes, leaving out backup bookkeeping. |
| **Reminder** | A notice due at a wall-clock time, shown while the app is open or on the next open (D-16.5). |
| **Notifier** | Shows a reminder as a system notification when allowed, otherwise as an in-app banner. |
| **Persistence** | The browser's promise not to evict our storage; requested after the first logged entry (D-16.8). |

## 4. Banned-pattern proposals

These reference-only names are distinctive enough that product code should never contain them. Add
them to `tooling/checks/banned-patterns.json` (same shape as the existing entries). Generic words
(`UserProfile`, `FoodEntry`, `ChatService`, `breakfast`, `waterTrackingEnabled`-style names a
builder might choose naturally) are deliberately left out. Already banned: the product name
variants, `\bfud\b`, `apoorv`, `calorie[\s._-]*tracker`, `com\.apoorvdarshan`.

| id | pattern | flags | hint |
|---|---|---|---|
| `coach-read-tools` | `\bget_(body_fat_history\|calorie_totals\|data_summary\|exercise_lift_history\|fasting_history\|food_entries\|training_summary\|weight_history\|workout_history\|workout_plans\|workout_preferences)\b` | — | the reference's model-facing Coach tool names; ours are `data_overview`, `food_log`, … (17 §1.5) |
| `coach-proposal-tools` | `\b(propose_add_exercise_to_day\|propose_custom_exercise\|search_exercise_library)\b` | — | the reference's proposal and search tool names; ours are in 17 §1.5 |
| `fud-prefixed-identifiers` | `\b[Ff]ud[A-Z]\w*` | — | reference-prefixed identifiers such as its glass components and its default accent key |
| `guard-and-store-classes` | `\b(AIErrorMessages\|AIRequestErrorPolicy\|BarcodeLabelMemory\|BarcodeProductLookup\|ConsistentDataStore\|FoodImagePreprocessor\|FoodSubmissionGate\|KeychainHelper\|LabelScanBarcodeHandoff\|MealMicronutrientStretch\|PersistedBlobGuard\|PersistedJsonGuard\|SecureHttpClient\|ServingUnitRepairPolicy\|ToolResultLimiter)\b` | — | reference class names; use the Platewise module names in 17 §1.6 |
| `goal-classes` | `\b(AdaptiveGoalResult\|AdaptiveGoalService\|BuildingPlanStepView\|GoalEnergyMath\|GoalEvidenceBuilder\|HomeTopNutrient\|MaintenanceBreakdown\|NutritionDayCompleteness\|ReturningUserState\|WeeklyRecapCalculator\|WeightAnalysisService)\b` | — | reference goal and progress types; see 17 §1.6 |
| `screen-classes` | `\b(CalorieGauge\|CalorieHero\|CoachExerciseProposal\w*\|CoachProposal(Applier\|Collector)\|ContextNoteSheet\|EditFoodEntry(Sheet\|View)\|FoodResult(Sheet\|View)\|IngredientIntakeSection\|IngredientLabelParser\|MacroVerticalBar\|MultiPhotoCaptureSheet\|NutritionDetail(Sheet\|View)\|PendingFoodAnalysisDraft\|PhotoCaptureDraftViewModel\|WeekEnergyStrip)\b` | — | reference screen and view names; ours are `ReviewSheet`, `EntryEditor`, `CaptureSheet`, `DayNutrientsSheet`, `WeekBar`, … |
| `backup-classes` | `\b(CloudBackup(Archive\|Coordinator\|Restore\|Service)\|DiaryExporter\|DiaryImporter\|DriveCloudBackupClient)\b` | — | reference backup and export types; ours live in `src/services/backup/` and `src/services/transfer/` |
| `storage-keys-goals` | `\b(acceptedTermsAndPrivacy\|adaptiveGoals(Enabled\|LastCheckDay\|PreviousTargets)\|aiAnalysisConsentGiven\|goalReachedNotificationsEnabled\|hasCompletedOnboarding\|lastRecalcGoalSignature\|onboardingPlanEdited)\b` | — | reference storage keys; ours are in 17 §1.3 |
| `storage-keys-logging` | `\b(aminoAcidEstimatesEnabled\|favoriteFoodEntries\|foodLogSortOrder\|foodMeasurementPreferGramsByDefault\|lastRecentsSegment\|meal(Breakfast\|Dinner\|Lunch\|Snack)StartMinutes\|pendingFoodAnalysisDraft\|productInfoHiddenFields\|productInfoShown\|saveMealPhotosToGallery)\b` | — | reference storage keys; ours are in 17 §1.3 |
| `storage-keys-home` | `\b(appThemeColor\|coachChatHistory\|fastingDefaultGoalMinutes\|fastingGoalNotificationEnabled\|homeTopNutrients\|progressIncludeToday\|waterQuickAddPresetsMl\|weekStartsOnMonday\|weightDeletionTombstones)\b` | — | reference storage keys; ours are in 17 §1.3 |
| `storage-keys-ai` | `\b(aiAccessMode\|aiFallbackEnabled\|aiMaxResponseTokens\|aiModelRegistryMigrationVersion\|aiRequestTimeoutSeconds\|aiUserContext\|fallbackBaseURLMigrationVersion\|geminiModelMigrationVersion\|openRouterReasoningEffort\|selected(Text)?(Fallback)?AI(Model\|Provider)\|separateTextProviderEnabled\|textAIFallbackEnabled)\b` | — | reference AI settings keys; ours is one `ai.settings` record |
| `storage-key-prefixes` | `\b((fallback)?[cC]ustomBaseURL\|apikey\|speechApiKey)_` | — | reference per-provider key prefixes; ours are `secrets` slots and `ai.settings.endpoints` |
| `reminder-keys` | `\b(streakReminder(Enabled\|Hour\|Minute)\|(bodyFatLogReminder\|breakfastReminder\|dailySummary\|dinnerReminder\|lunchReminder\|waterReminder\|weightLogReminder)(Hour\|Minute))\b` | — | reference reminder keys; ours are `remind.<name>` with `{on, at}` |
| `prompt-flags` | `\bhas(Completed\|Notified\|Seen)(HostedUpsell\|MeetDeveloper\|ProductHunt\|WhatsNew)\w*` | — | reference one-time prompt flags; Platewise has no such prompts in v1 |
| `backup-bookkeeping-keys` | `\bcloudBackup(AccountEmail\|FileId\|LastHash)\b` | — | reference cloud-backup keys |
| `ai-error-ids` | `\bai\.error\.[a-z_]+` | — | reference error string ids; ours are `AiFailure` kinds |
| `export-source-labels` | `\b(ai_estimated\|manually_edited)\b` | — | reference export labels; ours are `ai` and `manual` |
| `default-menu-group-ids` | `__default_[a-z_]+__` | — | reference add-menu group ids; ours are `snapScan`, `describe`, `reuse` |
| `later-phase-keys` | `\b(WorkoutPersistedState\|importedHealthWorkoutsV1\|widget_snapshot_v1\|workoutDiaryStateV1)\b` | — | reference workout and widget state names; L2 defines its own |

In the table `\|` stands for `|`. The same entries, ready to append to the JSON array (no flags:
these names are case-sensitive identifiers):

```json
[
  {
    "id": "coach-read-tools",
    "pattern": "\\bget_(body_fat_history|calorie_totals|data_summary|exercise_lift_history|fasting_history|food_entries|training_summary|weight_history|workout_history|workout_plans|workout_preferences)\\b",
    "hint": "the reference's model-facing Coach tool names; ours are data_overview, food_log, ... (17 §1.5)"
  },
  {
    "id": "coach-proposal-tools",
    "pattern": "\\b(propose_add_exercise_to_day|propose_custom_exercise|search_exercise_library)\\b",
    "hint": "the reference's proposal and search tool names; ours are in 17 §1.5"
  },
  {
    "id": "fud-prefixed-identifiers",
    "pattern": "\\b[Ff]ud[A-Z]\\w*",
    "hint": "reference-prefixed identifiers (glass components, default accent key)"
  },
  {
    "id": "guard-and-store-classes",
    "pattern": "\\b(AIErrorMessages|AIRequestErrorPolicy|BarcodeLabelMemory|BarcodeProductLookup|ConsistentDataStore|FoodImagePreprocessor|FoodSubmissionGate|KeychainHelper|LabelScanBarcodeHandoff|MealMicronutrientStretch|PersistedBlobGuard|PersistedJsonGuard|SecureHttpClient|ServingUnitRepairPolicy|ToolResultLimiter)\\b",
    "hint": "reference class names; use the Platewise module names in 17 §1.6"
  },
  {
    "id": "goal-classes",
    "pattern": "\\b(AdaptiveGoalResult|AdaptiveGoalService|BuildingPlanStepView|GoalEnergyMath|GoalEvidenceBuilder|HomeTopNutrient|MaintenanceBreakdown|NutritionDayCompleteness|ReturningUserState|WeeklyRecapCalculator|WeightAnalysisService)\\b",
    "hint": "reference goal and progress types; see 17 §1.6"
  },
  {
    "id": "screen-classes",
    "pattern": "\\b(CalorieGauge|CalorieHero|CoachExerciseProposal\\w*|CoachProposal(Applier|Collector)|ContextNoteSheet|EditFoodEntry(Sheet|View)|FoodResult(Sheet|View)|IngredientIntakeSection|IngredientLabelParser|MacroVerticalBar|MultiPhotoCaptureSheet|NutritionDetail(Sheet|View)|PendingFoodAnalysisDraft|PhotoCaptureDraftViewModel|WeekEnergyStrip)\\b",
    "hint": "reference screen and view names; ours are ReviewSheet, EntryEditor, CaptureSheet, DayNutrientsSheet, WeekBar, ..."
  },
  {
    "id": "backup-classes",
    "pattern": "\\b(CloudBackup(Archive|Coordinator|Restore|Service)|DiaryExporter|DiaryImporter|DriveCloudBackupClient)\\b",
    "hint": "reference backup and export types; ours live in src/services/backup and src/services/transfer"
  },
  {
    "id": "storage-keys-goals",
    "pattern": "\\b(acceptedTermsAndPrivacy|adaptiveGoals(Enabled|LastCheckDay|PreviousTargets)|aiAnalysisConsentGiven|goalReachedNotificationsEnabled|hasCompletedOnboarding|lastRecalcGoalSignature|onboardingPlanEdited)\\b",
    "hint": "reference storage keys; ours are in 17 §1.3"
  },
  {
    "id": "storage-keys-logging",
    "pattern": "\\b(aminoAcidEstimatesEnabled|favoriteFoodEntries|foodLogSortOrder|foodMeasurementPreferGramsByDefault|lastRecentsSegment|meal(Breakfast|Dinner|Lunch|Snack)StartMinutes|pendingFoodAnalysisDraft|productInfoHiddenFields|productInfoShown|saveMealPhotosToGallery)\\b",
    "hint": "reference storage keys; ours are in 17 §1.3"
  },
  {
    "id": "storage-keys-home",
    "pattern": "\\b(appThemeColor|coachChatHistory|fastingDefaultGoalMinutes|fastingGoalNotificationEnabled|homeTopNutrients|progressIncludeToday|waterQuickAddPresetsMl|weekStartsOnMonday|weightDeletionTombstones)\\b",
    "hint": "reference storage keys; ours are in 17 §1.3"
  },
  {
    "id": "storage-keys-ai",
    "pattern": "\\b(aiAccessMode|aiFallbackEnabled|aiMaxResponseTokens|aiModelRegistryMigrationVersion|aiRequestTimeoutSeconds|aiUserContext|fallbackBaseURLMigrationVersion|geminiModelMigrationVersion|openRouterReasoningEffort|selected(Text)?(Fallback)?AI(Model|Provider)|separateTextProviderEnabled|textAIFallbackEnabled)\\b",
    "hint": "reference AI settings keys; ours is one ai.settings record"
  },
  {
    "id": "storage-key-prefixes",
    "pattern": "\\b((fallback)?[cC]ustomBaseURL|apikey|speechApiKey)_",
    "hint": "reference per-provider key prefixes; ours are secrets slots and ai.settings.endpoints"
  },
  {
    "id": "reminder-keys",
    "pattern": "\\b(streakReminder(Enabled|Hour|Minute)|(bodyFatLogReminder|breakfastReminder|dailySummary|dinnerReminder|lunchReminder|waterReminder|weightLogReminder)(Hour|Minute))\\b",
    "hint": "reference reminder keys; ours are remind.<name> with {on, at}"
  },
  {
    "id": "prompt-flags",
    "pattern": "\\bhas(Completed|Notified|Seen)(HostedUpsell|MeetDeveloper|ProductHunt|WhatsNew)\\w*",
    "hint": "reference one-time prompt flags; Platewise has no such prompts in v1"
  },
  {
    "id": "backup-bookkeeping-keys",
    "pattern": "\\bcloudBackup(AccountEmail|FileId|LastHash)\\b",
    "hint": "reference cloud-backup keys"
  },
  {
    "id": "ai-error-ids",
    "pattern": "\\bai\\.error\\.[a-z_]+",
    "hint": "reference error string ids; ours are AiFailure kinds"
  },
  {
    "id": "export-source-labels",
    "pattern": "\\b(ai_estimated|manually_edited)\\b",
    "hint": "reference export labels; ours are ai and manual"
  },
  {
    "id": "default-menu-group-ids",
    "pattern": "__default_[a-z_]+__",
    "hint": "reference add-menu group ids; ours are snapScan, describe, reuse"
  },
  {
    "id": "later-phase-keys",
    "pattern": "\\b(WorkoutPersistedState|importedHealthWorkoutsV1|widget_snapshot_v1|workoutDiaryStateV1)\\b",
    "hint": "reference workout and widget state names; L2 defines its own"
  }
]
```

Status 2026-10-26: these 19 entries are now in `tooling/checks/banned-patterns.json` (24 patterns in all) and `pnpm check:banned` passes. Checked before adding: every pattern matches the reference (between 4 and 766 hits each) and has zero
findings in the product tree outside the exempt docs. Re-run `pnpm check:banned` after adding them.
Tests that need one of these words build it from pieces.
