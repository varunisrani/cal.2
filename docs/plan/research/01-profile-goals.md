# 01 — Profile, onboarding, goals and formulas: behavioural specification (clean-room)

Scope: the user profile (fields, units, defaults, persistence), the onboarding wizard step by step
(including the returning-user / restore screen as behaviour), BMR/TDEE formulas and alternatives,
the six activity levels, weight goal and pace, calorie-target maths, macro split with
pinned/auto-balanced macros and user locks, optional ("other") nutrient goals, the AI goal
calculation and its validation, the goal-evidence pack, Adaptive Goals, the thermodynamic weight
forecast, goal-reached alerts, energy units (kcal/kJ), metric/imperial and weight display
formatting, and the profile-edit fields and validation in Settings.
Out of scope: the Settings layout and navigation (`06-*`), AI provider plumbing / BYOK / fallback
(the AI-providers area), the Coach chat that consumes the forecast (Coach area), backup file format
and restore internals (backup area), notification scheduling (notifications area), health-store
sync (later phase), the weight/body-fat log screens (Progress area).
Reference: `apoorvdarshan/fud-ai` @ `10e14b67116c52b515d2389621266e32b3a99840`; shipped build
checked: none (no APK/IPA available); store screenshots show no onboarding screens.
Sources studied: Android models/onboarding/settings/services listed in §4, iOS models/views/services
listed in §4, Android unit tests and iOS unit tests listed in §4 and §8. REA was not needed: the
source settles every behaviour in this area.

Conventions:
- "Profile" = the single stored record of body data, goal choice and saved targets.
- "Formula values" = targets computed deterministically from the profile (§3.3).
- "Saved targets" = the four optional override numbers (calories, protein, carbs, fat) stored on
  the profile. A macro with a saved value is **pinned**; one without is **auto**.
- "Lock" = a separate user flag (calories lock, up to two macro locks) used only by Settings edits.
- "Effective" value = what the app shows and tracks against (saved value, else derived).
- "Truncate" = drop the fractional part toward zero (integer conversion); "round" = nearest, halves
  up (all rounded quantities here are positive).
- Energy is always stored in kcal; weight in kg; height in cm; body fat as a fraction 0–1.
- "MUST" marks an invariant the reference defends with code or a test.
- A = Android, I = iOS. "Both" means the two platforms agree.

---

## 1. Overview

The area owns *who the user is* and *what they aim for*. A new user walks a 14-step wizard that
collects sex, birthday, height/weight, optional body fat, activity level, goal, target weight and
pace, then asks for permissions and an AI provider, then computes a plan. The plan is computed **by
the AI** from the app's formulas (formula values are sent as an anchor); if the AI call fails, the
formula values are used. After onboarding, targets change only through: manual edits in Settings
(with a lock/rebalance engine), the **Recalculate Goals** action (AI, no formula fallback), and
**Adaptive Goals** (the same AI calculation on a weekly timer, fed by a privacy-safe numeric
"evidence pack" of logged food, weigh-ins, body fat, measurements, workouts and optional measured
energy). Editing a profile input never recomputes targets by itself; it only raises a
"recalculate" nudge.

```
 onboarding wizard ──► profile + plan (AI or formula) ──► saved targets
        │                                                    ▲   ▲   ▲
        ▼                                                    │   │   │
  first weigh-in seeded                   Settings edits ────┘   │   │ (locks / rebalance)
                                          Recalculate (AI) ──────┘   │
   food log ─┐                            Adaptive Goals (AI, weekly)┘
   weigh-ins ├─► evidence pack ──► AI goal calculator ──► validator/normaliser
   body fat  │                     (formulas + profile +       (ranges, 4/4/9 exactness,
   workouts ─┘                      reference values)           profile plausibility)
   weigh-ins + food ─► weight forecast (pure maths) ─► Coach context only
   new latest weigh-in crossing goal ─► goal-reached alert
```

What the system guarantees: stored energy is kcal regardless of display unit; a bad AI answer never
changes saved targets; an AI result is discarded if the profile changed while the call was in
flight; saved AI plans satisfy 4·P + 4·C + 9·F = calories exactly; Adaptive Goals runs at most once
per 7 calendar days and never retries a failing provider on every app open.

## 2. Reference names (rename in rebuild)

| Kind | Names (reference only; they become banned identifiers) |
|---|---|
| Binary / CLI and flags | `Fud AI` product name, package `com.apoorvdarshan.calorietracker`, iOS target `calorietracker` |
| Env vars | none in this area |
| Files and folders | `UserProfile.kt/.swift`, `ActivityLevel.kt`, `WeightGoal.kt`, `AutoBalanceMacro.kt`, `NutrientGoals.kt`, `OptionalNutrientGoals.swift`, `EnergyUnit.kt`, `UnitPreferences.swift`, `WeightDisplayFormatter.kt`, `GoalEvidence.kt/.swift`, `WeightAnalysisService.kt/.swift`, `OnboardingScreen.kt`, `OnboardingViewModel.kt`, `ReturningUser.kt`, `ReturningUserStep.kt`, `OnboardingView.swift`, `ReturningUserView.swift`, `CalculationMethodsView.swift`, `MaintenanceEstimateRow.swift`, `ProfileComponents.swift`, `ProfileRepository.kt` |
| HTTP routes / URL schemes | none |
| RPC methods / events / commands | iOS notifications `userProfileDidChange`, `weightGoalReached`; types `GoalEnergyMath`, `MaintenanceBreakdown`, `AutoBalanceMacro`, `GoalEvidenceBuilder`, `WeightForecast`, `AdaptiveGoalService`, `AdaptiveGoalResult`, `AdaptiveGoalSettings`, `EnergyBurnSettings`, `GoalCalculation`, `GoalCalculationEvidenceContext`, `NutritionDayCompleteness`, `HomeTopNutrient`, `OptionalNutrient`, `ReturningUserState`, `ReturningSource`, `OnboardingStep`, `OnboardingAiPhase`, `BuildingPlanStepView`, functions `calculateGoals`, `parseGoalCalculation`, `estimateOptionalNutrientGoals`, `suggestOptionalNutrientGoals`, `refreshAdaptiveGoalsIfNeeded`, `goalInputSignature`, `recalculatedFromFormulas`, `applyCaloriesEdit`, `applyMacroEdit`, `resetCaloriesToBalance`, `resetMacroToBalance`, `crossesWeightGoal` |
| Settings and storage keys | `userProfile`, `hasCompletedOnboarding`, `heightUnit` (`cm`/`ftin`), `weightUnit` (`kg`/`lbs`), legacy `useMetric`, `energyUnit` (`kcal`/`kj`), `optionalNutrientGoals`, `lastRecalcGoalSignature`, `adaptiveGoalsEnabled`, `adaptiveGoalsPreviousTargets`, `adaptiveGoalsLastCheckDay`, `onboardingPlanEdited` (I), `energyBurnEnabledV2` (I), `healthEnergyGoalsEnabled` / `healthEnergyGoalsPreviousTargets` / `healthEnergyGoalsLastAutoRefreshDay` (A), `goalReachedNotificationsEnabled`, `notificationsEnabled`, `healthConnectEnabled` / `healthKitEnabled`, `aiAnalysisConsentGiven`, `acceptedTermsAndPrivacy` |
| Other (persisted field names) | profile JSON fields `name`, `gender`, `birthday`, `heightCm`, `weightKg`, `activityLevel`, `goal`, `bodyFatPercentage`, `goalBodyFatPercentage`, `useBodyFatInBMR`, `weeklyChangeKg`, `goalWeightKg`, `customCalories`, `customProtein`, `customFat`, `customCarbs`, `autoBalanceMacro`, `allergenSensitivities`, `caloriesLocked`, `lockedMacros`; enum values `male/female/other`, `sedentary/light/moderate/active/veryActive/extraActive`, `lose/maintain/gain`, `protein/carbs/fat` |

Third-party protocol names used by this area: none directly. The AI goal calculation goes through
the AI-providers area; its reply is a JSON object whose keys `calories`, `protein`, `carbs`, `fat`,
`reason` are our own contract (not a vendor protocol). The optional-nutrient reply keys
(`added_sugar`, `beta_alanine`, `betaine`, `caffeine`, `calcium`, `cholesterol`, `creatine`,
`fiber`, `folate`, `hmb`, `iron`, `l_arginine`, `l_carnitine`, `l_citrulline`, `magnesium`,
`omega_3`, `potassium`, `saturated_fat`, `sodium`, `sugar`, `taurine`, `trans_fat`,
`vitamin_a`, `vitamin_b12`, `vitamin_c`, `vitamin_d`, `vitamin_e`, `vitamin_k`, `zinc`) are
likewise ours to rename.

## 3. Behaviour

### 3.1 Profile record

- **Data shape** (conceptual):
  `Profile { name?, sex: male|female|other, birthDate, heightCm, weightKg, activity: Activity,
  goal: lose|maintain|gain, bodyFat?: fraction, goalBodyFat?: fraction, weeklyChangeKg?,
  goalWeightKg?, savedCalories?, savedProtein?, savedCarbs?, savedFat?, legacyBalanceMacro?,
  allergens: string[], caloriesLocked: bool, lockedMacros: Set<protein|carbs|fat> (≤2),
  legacyUseBodyFat?: bool }` [obs]
- **Defaults** (Both) [obs]: name none; sex male; birth date = today minus 25 years (local
  midnight); height 175 cm; weight 70 kg; activity moderate; goal maintain; everything optional
  absent; allergens empty; no locks.
- **Display name**: the name if non-empty, else the literal "User"; initials = first letters of the
  first two space-separated words, upper-cased, else first letter. The name is never edited
  anywhere in the UI [obs]; keep the field only for compatibility [inf].
- **Age**: whole years between birth date and today in the local calendar. A clamps at 0 [obs];
  I has no clamp but its pickers forbid future dates [obs].
- **Body fat** is a fraction (0.20 = 20 %). **Goal body fat** is display-only (Progress chart line);
  it never feeds BMR/TDEE/macros [obs], and is cleared whenever body fat is cleared (Both) [obs].
- **legacyUseBodyFat** is decoded for old saves but ignored: Katch-McArdle is used whenever body
  fat is known (tested, §8) [obs]. It still
  appears in the goal-input signature (§3.9) [obs].
- **legacyBalanceMacro**: stored, snapshotted and cleared, but no calculation reads it [obs]. I
  onboarding sets it to carbs; Recalculate/Adaptive clear it [obs].
- **Weight sync**: adding or deleting any weigh-in sets profile weight to the newest weigh-in's
  value when it differs by more than 0.01 kg (Both) [obs]. So profile weight is "latest weigh-in".
- **Persistence**: one JSON blob. A blob that fails to decode reads as "no profile" but MUST be
  preserved (backed up) rather than overwritten on the next save (Both) [obs]. Every save emits a "profile changed" signal (I) [obs].
- **Fallback goals when no profile exists** (Home pillars): protein 150 g, carbs 220 g, fat 70 g
  (A) [obs].

### 3.2 Units, conversions and formatting

- **Height unit** `cm | ftin` and **weight unit** `kg | lbs` are two independent preferences; mixed
  combinations are valid [obs]. Defaults differ: I defaults to `ftin` + `lbs` (imperial); A falls
  back to its legacy metric flag whose default is true, so A defaults to `cm` + `kg` [obs]. A one-time
  migration (I) seeds both from the legacy flag when the height unit is unset [obs].
- **Constants** [obs]: 1 kg = 2.20462 lb (display and A conversions); I onboarding converts lb→kg
  with ×0.453592; 1 in = 2.54 cm; 1 ft = 30.48 cm.
- **Height display**: metric "N cm" (truncated); imperial total inches = round(cm / 2.54), shown as
  feet′inches″ — rounding (not truncation) so 170 cm reads 5′7″, not 5′6″ [obs, defended].
- **Weight display**: one decimal, "70.0 kg" or kg×2.20462 "154.3 lbs" [obs].
- **Weekly-change formatter** [obs, tested §8]: value = kg (metric) or
  kg×2.20462 (imperial), printed with 2 decimals in a fixed (US) locale, then trailing zeros and a
  trailing dot stripped. 0.25 → "0.25" / "0.55"; 0.5 → "0.5" / "1.1"; 1.0 → "1" / "2.2". With
  unit: "<value> kg/<period>" or "<value> lbs/<period>"; default period word differs (A "wk",
  I "week") [obs].
- **Energy unit** `kcal | kJ` [obs, tested on both platforms §8]:
  - 1 kcal = 4.184 kJ (thermochemical). Default kcal; unknown stored values read as kcal.
  - Every stored amount (entries, goals, AI requests/replies, exports) stays kcal; conversion happens only
    when a value is shown or typed in, so changing the unit leaves every stored number untouched.
  - Display value = round(kcal × 4.184) for kJ (e.g. 1 → 4, 100 → 418, 2000 → 8 368); unrounded
    amounts are used for charts/averages. Grouped with the locale's separators.
  - Typed input → kcal = round(value / 4.184). Parsing accepts locale formats ("8,368" in en-US,
    "8.368" or "418,4" in de-DE), trims spaces, falls back to treating a comma as a decimal point;
    rejects empty, non-numeric, trailing junk ("12abc"), negative and non-finite input.
  - Round trip: kcal → kJ display → kcal returns the same kcal (tested over a range) [obs].
  - **Goal picker**: kcal 800–6 000 step 50; kJ 3 400–25 100 step 100. Opening position = display
    value snapped *down* to a step, clamped to the range (2 000 kcal → 8 300 kJ). Saving: if the
    unit is kJ and the picked value equals that opening position, keep the exact stored kcal
    (2 000), otherwise convert (8 400 kJ → 2 008 kcal). This stops an untouched kJ wheel from
    nudging the goal [obs, defended].
  - **AI instruction**: for kJ users only, every AI prompt that talks to the user gains one line
    saying the user reads kJ, all numbers given to the model are kcal, and amounts stated to the
    user must be converted at 4.184 with whole numbers; tool-using prompts add that kJ amounts
    from the user must be converted back to kcal for tool arguments. kcal users' prompts are
    unchanged [obs].

### 3.3 Formulas (deterministic)

All [obs] Both unless noted; cross-checked against the formula, maintenance and evidence tests
listed in §8.

- **BMR, Katch-McArdle** (chosen whenever the profile has a body-fat value):
  `BMR = 370 + 21.6 · (1 − bodyFatFraction) · weightKg`.
- **BMR, Mifflin-St Jeor** (otherwise):
  `base = 10·kg + 6.25·cm − 5·age − 161`; male adds 166 (net +5); female **and other** use base.
- **TDEE** `= BMR × multiplier`:

  | Activity | Multiplier | Protein g/kg | Step guide (steps/day) | Meaning (own words) |
  |---|---|---|---|---|
  | sedentary | 1.2 | 0.8 | < 5 000 | seated most of the day, little planned exercise |
  | light | 1.375 | 1.2 | 5 000–7 499 | mostly seated, light exercise 1–3 days/week |
  | moderate | 1.465 | 1.6 | 7 500–9 999 | regular training or sport 3–5 days/week |
  | active | 1.55 | 1.8 | 10 000–12 499 | training most days or an on-your-feet job |
  | veryActive | 1.725 | 2.0 | 12 500–14 999 | hard training 6–7 days/week or physical work |
  | extraActive | 1.9 | 2.2 | 15 000+ | athlete-level volume, twice-daily or manual work plus training |

  Note moderate is **1.465**, not the textbook 1.55 [obs].
- **Energy per kg**: 7 700 kcal per kg, shared by goal pace and trend maths.
- **Calorie adjustment**: maintain 0; lose `−trunc(rate · 7700 / 7)`; gain `+trunc(rate · 7700 / 7)`,
  where rate = weeklyChangeKg, default 0.5 when absent. Values: 0.25 → 275, 0.5 → 550, 1.0 → 1 100.
- **Formula calories** `= trunc(TDEE) + adjustment` (no floor; the < 1 200 warning is UI only).
- **Formula protein** `= trunc((g/kg for activity + 0.2 if goal is lose) × weightKg)`. The g/kg rates
  are full-bodyweight rates; body fat MUST NOT turn them into lean-mass rates (tested: 100 kg, 30 % BF, moderate, lose → 180 g with
  or without body fat).
- **Formula fat** `= trunc(0.6 × weightKg)`.
- **Formula carbs** `= max(0, (formulaCalories − 4·protein − 9·fat) div 4)` (integer division).
- **Worked example** (default profile: male, 25 y, 175 cm, 70 kg, moderate, maintain):
  BMR 1 673.75; TDEE 2 452.04 → 2 452 kcal; protein 112 g; fat 42 g; carbs (2 452 − 448 − 378) div
  4 = 406 g. Katch example: 80 kg, 20 % BF, sedentary → BMR 1 752.4, TDEE 2 102.88 → 2 102.
- **Maintenance breakdown** (Settings "Estimated Maintenance" row): maintenance = trunc(TDEE);
  target = effective calories; difference = target − maintenance; reads **deficit** when
  difference ≤ −50, **surplus** when ≥ +50, otherwise "close to maintenance" (tolerance 50 kcal,
  because the formula is far less precise; an AI-tuned maintain target must not read as a tiny
  deficit). A formula target's difference equals the adjustment exactly. Tapping explains it is
  a formula estimate, not measured burn [obs].
- **Calculation-methods page** (reachable from Plan Ready and Settings): lists the two BMR
  equations, the multiplier table, the 7 700 kcal/kg (≈3 500 kcal/lb) rule, the macro guide
  (0.8–2.2 g/kg protein, ~0.6 g/kg fat, carbs remainder), that per-meal nutrient values are AI
  estimates, what data the AI receives for goal calculation (and what it never receives: food
  names, notes, photos, ingredients, exercise names), citations, and a not-medical-advice
  disclaimer (BMR equations ±10 %; consult a professional if pregnant, under 18, etc.) [obs].
  Rebuild writes its own copy and citations.

### 3.4 Onboarding wizard

- **Trigger**: app start while onboarding is not completed. One linear sequence of 14 steps
  (indices 0–13) [obs]:

  | # | Step | Input / behaviour |
  |---|---|---|
  | 0 | Welcome | logo, two-line headline, short feature tour (photo logging, coach, exercise library, widgets); primary "Get Started"; secondary text link to the returning-user screen (§3.5) |
  | 1 | Sex | three selection cards: male / female / other (default male) |
  | 2 | Birthday | date wheel day–month–year; default today − 25 y. I: ≤ today. A: years 1920…current year (future days inside the current year are selectable → age 0) |
  | 3 | Height & weight | one Imperial/Metric segmented toggle that writes **both** unit prefs; height cm 100–250 or ft 3–8 + in 0–11; weight whole + tenth wheels, 30–250 kg or 60–500 lb |
  | 4 | Body fat | Yes/No cards (default No). Yes reveals a % wheel 3–60 (A step 0.5, I whole %), default 20 %, a hint with common ranges (men 10–25 %, women 18–35 %), and an optional goal toggle (off by default; turning on seeds goal = current; wheel 3–60). No shows a note that a standard formula will be used. Switching back to No clears both values |
  | 5 | Activity | six cards with subtitles (§3.3), default moderate, scrollable |
  | 6 | Goal | three cards lose / maintain / gain, default maintain |
  | 7 | Desired weight | weight wheel (same ranges), subtitle = chosen goal; A repeats the unit toggle here |
  | 8 | Pace | maintain: a "balanced pace set" confirmation; lose/gain: big readout "<weekly value> <unit> per week", three icons Slow / Recommended / Fast, a slider with three positions, 0.25, 0.5 and 1.0 kg per week (default 0.5), and an "estimated days" card = trunc(|target − current| kg / weekly kg × 7) with a caption per speed |
  | 9 | Notifications | explain reminders; a button requests OS permission; result recorded; skippable via Continue |
  | 10 | Health store | explain sync; a button requests health permissions; any partial grant counts as connected; skippable |
  | 11 | AI provider | choose path (BYOK or hosted plan); BYOK needs provider, model, key (unless the provider needs none), and a base URL when the provider requires a custom endpoint; terms must be accepted to enable the button; tapping with a missing key shows "paste your key" alert. Details in the AI-providers area |
  | 12 | Building plan | animated 0→100 % counter and checklist (calories, carbs, protein, fats, health score), one item every 700 ms; runs the AI goal calculation in parallel; advances only when both the animation (~4 s) and the AI call have finished |
  | 13 | Plan ready | big calorie number + three macro cards, each tappable to edit; note that the plan auto-adjusts weekly unless Adaptive Goals is turned off; orange warning card when calories < 1 200 ("consult a doctor"; 1 200 is the minimum recommendation); "How is this calculated?" link (I); final button completes onboarding |

- **Default targets in the target-weight seed**: A sets goal weight = current weight − 5 kg (lose),
  + 5 kg (gain), = current (maintain) when a goal card is tapped, and resets goal weight to the
  current weight whenever the current weight changes [obs]. I seeds on Continue from step 6: −/+
  10 lb and −/+ 5 kg on the respective wheels, floored at 60 lb / 30 kg, keeping the tenth digit
  [obs]. Neither validates that the target is on the correct side of the current weight [obs]
  (see R01.6).
- **Profile built from the wizard**: canonical cm/kg; weekly change and goal weight are dropped for
  maintain; goal body fat kept only when body fat is set [obs].
- **Navigation / states**:
  - Header with back chevron and a thin progress bar = index / 13. A shows it on all steps except
    Welcome and Building plan; I shows it on steps 1–12 (including Building plan) and hides it on
    Plan ready [obs].
  - Continue is always enabled except on the AI step, where it depends on the chosen path [obs,
    tested §8].
  - Back on the AI step first returns from the BYOK/hosted sub-screen to the path choice; consent
    is reset when switching paths (I) [obs].
  - Back from Plan ready (A) jumps to the AI step, skipping Building plan, because re-entering it
    would re-run the AI and overwrite edits; system back is disabled on Welcome and Building plan
    (A) [obs]. Returning to the AI step reopens the path already set up [obs].
  - Leaving the AI step persists the access mode before Building plan runs, so the plan call goes
    through the path just chosen (A) [obs].
- **Building plan**: calls the AI goal calculator (§3.6) with the wizard profile, no evidence, no
  measured anchor; the call does not count against a hosted quota (I) [obs]. On success the plan
  shows the AI's four numbers (carbs re-derived as max(0, (cal − 4P − 9F) div 4)); on failure:
  - A leaves all four saved targets empty → the plan shows formula values via the auto-balance
    path (§3.7) [obs];
  - I fills all four with formula values (pinned) [obs].
  There is no overall timeout beyond the AI client's own (A waits in 100 ms polls) [obs] (R01.8).
- **Plan ready editing** — the two platforms differ [obs]:
  - A: modal wheel per field — calories 800–6 000 step 50, protein 10–500 step 5, carbs 0–800
    step 5, fat 10–300 step 5; Save stores that one override; Reset (shown when an override
    exists) clears it. No rebalancing: calories and macros can drift apart.
  - I: inline wheel per field — calories 800–5 000 step 10, protein 20–300, carbs 0–500, fat
    10–200 (step 1). Changing calories, protein or fat re-derives carbs = max(0, (cal − 4P − 9F)
    div 4); changing carbs re-derives calories = 4C + 4P + 9F.
  - Any edit (A: including Reset) marks the plan "hand-edited".
- **Completion** (final button) [obs]:
  1. Save the profile with the plan's saved targets (I also sets legacy balance macro = carbs).
  2. Seed the first weigh-in (now, profile weight) if the weight history is empty; seed the first
     body-fat reading only if body fat was entered.
  3. Save notifications/health switches, AI access mode, provider, model, key; set the initial
     speech provider to match a BYOK provider (A: BYOK only).
  4. **Adaptive Goals = on unless the plan was hand-edited**; Energy Burn (measured-energy anchor)
     = on; Adaptive last-check day = today (first automatic run lands a week later).
  5. Mark onboarding completed → Home. A restore-completed onboarding skips steps 2 and 4 (§3.5).
  I additionally saves the profile once on leaving the Pace step [obs].

### 3.5 Returning user (welcome back / restore)

- **Purpose**: a person who used the app before (reinstall or data wipe) can bring data back
  instead of re-entering it. It is a sub-state of step 0, not a step: the progress bar and step
  numbers are unchanged [obs].
- **Opening**: via the Welcome text link, or automatically once per launch when a signal suggests a
  returning user: A — the health-store permissions are still granted (an in-app data wipe does not revoke them), checked
  after the first frame, only while still on the plain Welcome and before the user chose anything;
  a late or second answer changes nothing. I — a BYOK key survived in the keychain at launch.
  Tests never read the keychain/IPC [obs, tested on both platforms §8].
- **Sources** (pick one or both): **cloud backup** (full snapshot: diary, photos, workouts,
  settings) and **health-store import** (meals, weigh-ins, body fat, workout calories the app had
  written). Picking the backup source immediately probes for a backup and shows its date; "none
  found" or "couldn't check" unpicks it with a message; Continue waits while probing (I) [obs].
- **States**: `choosing → running → finished`. Each step: `waiting | working | done | failed |
  skipped`, with a one-line message. Order is fixed: backup first, then health import (which then
  only *adds* what the backup lacks) [obs].
- **Backup step** (A): sign-in → (consent if needed) → find backup → confirm screen showing the
  backup's modified time → restore. Cancel = skipped; any failure = failed with a mapped message
  (no backup / sign-in failed / no space / not a backup / needs newer app / unreachable — anything
  unknown reads as unreachable). A step that did not restore forgets the signed-in session so
  nothing can later upload an empty phone over the cloud copy; backup is never turned on before a
  successful restore [obs]. After a restore, post-restore migrations run (model selections, speech,
  app icon, reminders) [obs].
- **Restored setup?** A restore counts as a finished setup only when it held both a profile and
  the completed flag. If not ("setup missing"), the short wizard runs over the restored data [obs].
- **Health step**: request permissions; denied → failed; read failure → failed with "try again"
  (imports are de-duplicated, so retry is safe); success → summary of what was **added** (counts
  before/after; meals, weigh-ins, other) [obs]. Without a finished restore, the newest weight and
  body fat (I also sex, birthday, height) pre-fill the wizard, clamped to its wheels: weight
  rounded to 0.1 kg and clamped to 30–250 kg or 60–500 lb (I 30.0–250.9 kg / 60.0–500.9 lb);
  body fat rounded to the wheel step and clamped 3–60 %; height clamped 100–250 cm and 3′0″–8′11″;
  birthday never in the future; only male/female map to sex; impossible values (≤0, NaN, ∞, body
  fat > 100 %) are ignored [obs, tests].
- **Finish actions**: restored with finished setup → "open app" (A relaunches so every screen loads
  restored data; I completes onboarding flagged "by restore" so new-install defaults and seeding
  are skipped). Something done but no finished setup → "continue setup" (to step 1). Nothing done
  → "try again" or "start fresh" [obs].
- **Try again**: without a restore, returns to the picker with only failed steps picked; after a
  restore only the health import can re-run (re-restoring or starting fresh would undo it); I
  re-runs health too when retrying a failed backup that followed a done health step [obs].
- **Leaving**: impossible while running and impossible once a backup was applied (Get Started
  would run the full wizard over restored data); "start fresh" only from the picker [obs].
- **Reopening** after a run that restored nothing starts at the picker again [obs].

### 3.6 AI goal calculation and validation

- **Callers**: onboarding Building plan (no evidence), Settings "Recalculate Goals", Energy-Burn
  toggle (re-runs Recalculate), Adaptive Goals (§3.10). There is **no formula fallback** for
  Recalculate/Adaptive: failure leaves targets untouched [obs].
- **What the prompt asks** (own words; never copy): act as the app's target calculator; return
  only a JSON object with integer `calories`, `protein`, `carbs`, `fat` and a short `reason`
  (under 100 characters); no other keys. It supplies:
  1. the formula set above with all constants (both BMR equations, multiplier table, 7 700 kcal/kg
     adjustment, protein rates incl. the +0.2 g/kg cut boost, fat 0.6 g/kg, carbs as remainder,
     4/4/9) and which BMR method applies to this user;
  2. permission to estimate maintenance from the person's own data, under conditions: the
     evidence block (§3.11) offers 14-, 28- and 90-day windows; for one window the model may take
     the mean intake of the fully logged days and subtract the energy of the weight change
     (7 700 kcal per kg) spread over the real number of days between the first and last weigh-in
     (not the window length). It may do so only when the evidence rating is medium or high, at
     least half of that window's days count as fully logged, there are two or more weigh-ins at
     least 14 days apart, and the trend is plausible; days with incomplete logs never count. Trust
     order: a measured energy anchor first, this data estimate second, the formula TDEE last;
  3. protein near the formula value, within about ±15 %, leaning higher in a deficit, never scaled
     down to fit a low calorie target and never reinterpreted as a lean-mass rate;
  4. calories kept within 800–6 000; keep 4P + 4C + 9F ≈ calories;
  5. the profile in canonical metric (one decimal) plus the user's preferred display units, body
     fat as % and fraction, activity, goal, weekly pace (marked as not set for maintain), goal weight;
  6. the deterministic reference values (BMR, TDEE, formula calories, formula P/C/F) as the anchor,
     and the current saved targets;
  7. optionally the measured maintenance anchor (Energy Burn; later phase), optionally the latest
     body measurements (only when no evidence pack is given — the pack owns recency), and
     optionally the evidence pack (§3.8) with an instruction to honour its confidence and
     completeness labels and never treat missing/partial days as low intake;
  8. the kJ instruction line for kJ users (§3.2).
- **Validation of the reply** (Both; MUST, tested §8)
  [obs]:
  1. Extract JSON; all four numbers required and finite (I rejects strings and booleans; A also
     accepts numeric strings).
  2. Raw ranges: calories 800–6 000, protein 10–500, carbs 0–1 500, fat 10–400; else reject.
  3. Coherence: |4P + 4C + 9F − calories| ≤ max(100, 0.15 × calories); else reject.
  4. Normalise to exact energy: calories = round(raw); protein = min(round(raw P), calories div
     4); required fat residue r = calories mod 4 (9 ≡ 1 mod 4, so fat must be ≡ calories mod 4);
     while (calories − 4P) div 9 < r and P > 0, lower P by 1; fat capacity = min(400,
     (calories − 4P) div 9); fat = the value ≡ r (mod 4) nearest to min(round(raw F), capacity)
     within [0, capacity] (ties go to the lower); carbs = (calories − 4P − 9F) div 4.
  5. Reject if protein < 10 or fat < 10 (A also if carbs < 0).
  6. Plausibility against the profile (when a profile is supplied, i.e. always in practice):
     protein within [round(0.70·ref), round(1.30·ref)] with ref = max(10, formula protein); fat
     within [round(0.50·ref), round(1.50·ref)] with ref = max(10, formula fat); calories within
     [max(800, round(0.5·ref)), min(6 000, round(2·ref))] with ref = formula calories clamped
     800–6 000. Else reject.
  7. Reason kept if a non-blank string.
  Examples: {2000, 150, 215, 61} → 2000/150/215/**60**; {801, 70, 29, 45} → exact 801; for the
  default profile protein 300 is rejected (allowed 78–146) and calories 6 000 rejected (allowed
  1 226–4 904).
- **Applying a result** (Recalculate/Adaptive) [obs]: all four saved targets = the result, legacy
  balance macro cleared, **all locks cleared**; then the recalc baseline is captured (§3.9). The
  result is applied only if the profile is *exactly* unchanged since the call started (any edit,
  including a lock or a target edit, wins) and the health/energy switches are unchanged; otherwise
  it is dropped silently (A marks "needs recalc"). Success message: states the new calorie
  target in the user's energy unit, followed by the AI's reason.
- **After a successful Recalculate**, optional nutrient goals are refreshed by AI (§3.11); failure
  there keeps existing values. If Adaptive is on, today becomes its last-check day (prevents a
  second identical AI call on the next foreground; tested) [obs].
- **Failure UI**: an alert "Couldn't Recalculate" explaining the provider could not be reached and
  goals are unchanged, pointing to provider/key settings [obs].

### 3.7 Macro maths: pinned vs auto, and user locks

Two layers sit on the same four saved values [obs, Both].

- **Auto-balance (pinned vs auto)** — derives effective values when some saved values are absent:
  - effective calories = saved calories, else formula calories;
  - pinned kcal = Σ saved macro grams × kcal/g (protein 4, carbs 4, fat 9);
    remaining = max(0, effective calories − pinned kcal);
  - one auto macro → grams = remaining div its kcal/g;
  - several auto macros → each gets kcal share = remaining × (its formula grams × kcal/g) div
    (Σ formula kcal of the auto macros), then grams = share div kcal/g (all integer division);
    if that sum is ≤ 0, use the formula grams;
  - a pinned macro's effective value is its saved value.
  Example: default profile, saved calories 2 000 and protein 150 → carbs 283 g, fat 29 g (the
  truncation loses 7 kcal).
- **Locks** (Settings only): calories lock (bool) and macro locks (at most **two**, so one macro is
  always free). Every lock-layer edit first **materialises** all four effective values into saved
  values (snapshotting all three macros before writing any), so after any edit everything is pinned.
  - **Edit calories to N** (N clamped ≥ 0): locked macros keep their grams; the unlocked macros
    share (N − locked kcal) via *distribute*; saved calories = N; then calories become **locked**.
  - **Edit macro M to g** (g ≥ 0):
    - calories locked: absorbers = the other unlocked macros; if none → edit rejected with an alert
      (nothing changes); available = max(0, calories − kcal of other locked macros); M kcal =
      min(g × kcal/g, available) → M grams = that div kcal/g; absorbers share (available − M kcal)
      via *distribute*; calories unchanged;
    - calories unlocked: M = g; calories = Σ macro kcal (floats to the new sum);
    - then M becomes locked if fewer than two macros are locked (silently left unlocked otherwise).
  - **distribute(target, macros)**: weights = each macro's current kcal, or (if 0) max(1, formula
    kcal); every macro but the last (fixed order protein, carbs, fat) gets round(target × w / Σw ÷
    kcal/g) grams; the last gets round(max(0, target − assigned kcal) ÷ kcal/g). Grams floored at 0.
    Example: default plan locked at 2 452 kcal, protein → 150: carbs 376, fat 39.
  - **Reset calories to auto-balance**: unlock calories; calories = Σ macro kcal.
  - **Reset macro to auto-balance**: unlock M; M = max(0, calories − other macros' kcal) div kcal/g.
  - **Recalculate / Adaptive** clear every lock; enabling Adaptive clears locks immediately.
  - While Adaptive is on, target rows are read-only: tapping explains that Adaptive owns the
    targets; lock glyphs are dimmed [obs].
- **Pickers** (Settings): calories per the energy-unit goal picker (§3.2); protein 10–500 step 5;
  carbs 0–800 step 5; fat 10–300 step 5; the wheel opens at the value snapped down to a step and
  clamped. "Reset to Auto-balance" appears only when that row is locked [obs].

### 3.8 Goal evidence pack

Pure function of (profile, food entries, weigh-ins, body-fat readings, workouts, body
measurements, optional daily measured energy, today, zone) [obs, tested on both platforms §8].

- **Window**: the 90 *completed* calendar days ending yesterday; today's diary is excluded (it would
  look like under-eating). Point-in-time data (weigh-ins, body fat, measurements, workouts) may also
  include today.
- **Daily nutrition rows** (one per calendar day, 90 rows): calories, protein, carbs, fat (sums),
  fiber sum only over entries that recorded fiber (unknown if none) with "known in x/y logs",
  log count, and completeness:
  - **missing** — no entries (unknown intake, NOT zero);
  - **likely complete** — calories ≥ round(0.85 × goal), or (≥ 2 logs and calories ≥ max(800,
    round(0.65 × goal))), where goal = max(800, effective calories);
  - **likely partial** — otherwise.
- **Period summaries** for 7, 14, 28, 90 days: logged days / calendar days, likely-complete days and
  coverage % (= complete × 100 div calendar days), log count, average calories over logged days,
  average over likely-complete days, average P/C/F over logged days, average fiber over days with
  known fiber. (A rounds averages; I truncates [obs].)
- **Signal summaries** for the same periods over exactly N completed days (today excluded): weigh-in
  count, weight span days and change (last − first, when ≥ 2), body-fat count, workout sessions and
  minutes, measured-energy days, average external active energy, average total energy only when
  ≥ 3 days report total.
- **Dated detail**: weights and body fat de-duplicated to the latest reading per day (last 30 shown,
  "N older omitted"); last 12 body-measurement snapshots (I: only snapshots with any value) with
  derived waist-to-hip, waist-to-height and Navy body-fat estimate; workout days (last 30) with
  sessions, minutes, exercises, sets, reps — **never** workout calorie estimates (circular signal)
  and never names; days where a whole-day "calculated burn" row coexists with real sessions use the
  real sessions only; burn-only shells are excluded; daily measured energy rows. Nutrition detail
  shows only the last 45 logged days ("N older rows omitted").
- **Confidence** (0–100): nutrition = round(complete days in latest 28 ÷ 28 × 55) capped 55;
  weight = 25 if ≥ 6 weigh-ins spanning ≥ 28 days, 18 if ≥ 3 spanning ≥ 14, 10 if ≥ 2, else 0;
  energy = 20 if ≥ 10 measured days, 12 if ≥ 5, 7 if ≥ 3, else 0. Label high ≥ 70, medium ≥ 40,
  else low. Three reason strings state the counts.
- **Privacy**: only numbers and dates. Food names, notes, photos, ingredients, meal descriptions and
  exercise names MUST never enter the pack (tested) [obs]. The pack text states this and explains
  the completeness heuristic.

### 3.9 Profile editing in Settings (fields and validation)

| Field | Control and range | Rules on save |
|---|---|---|
| Sex | list male / female / other | save |
| Birthday | date wheel (I ≤ today; A years 1920…current year); display "date (age N)" | save; A stores local midnight, round-tripping through the local date to avoid a UTC off-by-one |
| Height | cm 100–250 or ft/in (I 3′0″–8′11″; A Settings clamps 36–95 in = 3′0″–7′11″, A onboarding 36–96 in); unit toggle in the sheet writes the height-unit pref and converts the current selection | save |
| Weight | whole + tenth wheels; A 30–250 kg / 66–551 lb; I 30–300 kg / 50–500 lb; toggle converts and clamps | adds a weigh-in (now) which updates profile weight; clears goal weight if the goal direction became impossible (lose & goal ≥ new, gain & goal ≤ new); does NOT recompute targets |
| Body fat | A 5–60 % step 0.5; I 3–60 whole %; default seed 20 %; "Remove/Clear" | clearing also clears goal body fat; no targets recomputed |
| Goal body fat | shown only when body fat is set; 3–60 % (A step 0.5); seed goal → current → 15 % (A); "Remove goal" | display-only; never touches targets |
| Activity | list of six with subtitles | save |
| Weight goal | list | → maintain: clear weekly change and goal weight; → lose/gain: weekly change defaults to 0.5 if absent; clear goal weight if it contradicts the new direction |
| Weekly change | shown when goal ≠ maintain; Slow 0.25 / Moderate (I menu) or Recommended (I sheet) 0.5 / Fast 1.0, labelled with the formatter | save |
| Goal weight | shown when goal ≠ maintain; weight sheet seeded with goal or current | lose needs target < current, gain needs target > current; otherwise an alert explains and nothing is saved |
| Allergen sensitivities | free list of names | save (used by label checks elsewhere) |
| Targets | §3.7 | §3.7 |

- **Recalc nudge**: a goal-input signature = sex | birth instant | height | weight | activity |
  goal | weekly change | goal weight | body fat | legacy body-fat flag (goal body fat, allergens,
  targets excluded). A baseline is stored after each successful Recalculate (and I's Settings-run
  Adaptive); if no baseline exists it is seeded silently from the current profile on first Settings
  load, so the nudge never fires on open. When the current signature differs from the baseline, the
  Recalculate row shows a small "Tap to update" CTA; Recalculate stays tappable always [obs].
  Because weigh-ins update profile weight, any new weigh-in raises the nudge [inf].
- **Units section**: height unit, weight unit and energy unit are separate settings [obs].
- **Toggles here**: Adaptive Goals (with info), Energy Burn (needs a health store; later phase),
  goal-reached notification toggle (default on) [obs].

### 3.10 Adaptive Goals

- **Setting**: on/off; when the stored value is absent it reads **on** [obs]. Onboarding writes
  on unless the plan was hand-edited (§3.4). Last-check day stored as `YYYY-MM-DD` (local).
- **Due rule**: due when there is no (or an unparseable) last-check day, or today ≥ last-check + 7
  calendar days [obs].
- **Trigger**: every app foreground/start (A on activity start; I on scene active, only when
  onboarding is completed and not under tests), and when the user switches it on (forced run that
  ignores the due rule and shows an alert with the outcome). A single-flight guard drops overlapping
  runs [obs].
- **Run** [obs]:
  1. Skip if off, not due (unless forced), or no profile.
  2. Snapshot the profile and the health/energy switches; build the evidence pack (§3.8) and the
     measured anchor (only when Energy Burn and the health store are both on; later phase).
  3. If a switch changed or Adaptive was turned off meanwhile → abort silently.
  4. Call the AI goal calculator (§3.6) with profile, anchor, evidence, units. I's background run
     does not count toward a hosted quota.
  5. Failure → keep goals; if switches unchanged and still on, mark checked today (a bad key is not
     hit on every open); forced run shows "couldn't reach your provider — goals unchanged".
  6. Success but the profile changed (any field) or a switch changed → drop the result.
  7. Otherwise: save a **pre-Adaptive snapshot** of the four saved targets and legacy balance
     macro **only if none exists yet**; apply the result (§3.6: all four saved, locks cleared);
     mark checked today; message states the new target in the user's unit, notes it came
     from the latest data, and appends the AI's reason.
- **Turning off**: restore the pre-Adaptive snapshot (if any) onto the profile, then delete the
  snapshot [obs]. Locks are not part of the snapshot [obs].
- **Turning on**: clear locks first (rows become read-only), then force a run; if nothing
  changed, show an explanatory message that it checks weekly once enough data exists [obs].
- **Energy Burn** (later phase for the PWA): input switch only. When on and the health store has
  ≥ 3 days with active energy in the last 14, the measured maintenance anchor = average measured
  total energy (needs ≥ 3 total days) else round(BMR) + average active energy; app-written workout
  energy is excluded. Turning it on without a health store or with too little data reverts the
  switch with an alert; any genuine change re-runs Recalculate [obs].
- **Unused deterministic corrector (A only, dead code)** [obs]: a pure weekly correction exists but
  nothing calls it. For the record: needs ≥ 4 logged food days and ≥ 3 weigh-ins with an observed
  trend (else, with a measured anchor, steer toward anchor + pace); raw = (target pace − observed
  weekly kg) × 7 700 / 7, rounded and clamped to ±150 kcal/day; ignore |adj| < 25; floor =
  max(round(BMR), 1 200); ceiling = max(floor, round(1.25 × maintenance)); refuse to lower at/below
  the floor or raise at/above the ceiling; clamp the new target into [floor, ceiling]; target pace =
  −rate (lose), 0 (maintain), +rate (gain), rate default 0.5. See open question Q1.

### 3.11 Optional ("other") nutrient goals

- **Set and defaults** (Both) [obs]:

  | Nutrient | Unit | Default | Kind | Picker A | Picker I | Step A / I |
  |---|---|---|---|---|---|---|
  | Sugar | g | 50 | limit | 0–200 | 0–200 | 5 / 5 |
  | Added sugar | g | 25 | limit | 0–100 | 0–100 | 5 / 5 |
  | Fiber | g | 30 | target | 0–100 | 5–100 | 1 / 5 |
  | Saturated fat | g | 20 | limit | 0–80 | 0–80 | 1 / 5 |
  | Trans fat | g | 0 | limit | 0–10 | 0–10 | 1 / 1 |
  | Cholesterol | mg | 300 | limit | 0–1 000 | 0–1 000 | 25 / 50 |
  | Caffeine | mg | 400 | limit | 0–1 000 | 0–1 000 | 25 / 25 |
  | Sodium | mg | 2 300 | limit | 0–5 000 | 500–6 000 | 50 / 50 |
  | Potassium | mg | 3 500 | target | 0–7 000 | 1 000–6 000 | 50 / 50 |
  | Calcium | mg | 1 000 | target | 300–2 000 | 300–2 000 | 50 / 50 |
  | Iron | mg | 18 | target | 5–45 | 5–45 | 1 / 1 |
  | Magnesium | mg | 400 | target | 100–800 | 100–800 | 25 / 25 |
  | Zinc | mg | 11 | target | 3–40 | 3–40 | 1 / 1 |
  | Vitamin A | mcg | 900 | target | 300–3 000 | 300–3 000 | 50 / 50 |
  | Vitamin C | mg | 90 | target | 20–500 | 20–500 | 10 / 10 |
  | Vitamin D | mcg | 20 | target | 5–100 | 5–100 | 1 / 1 |
  | Vitamin B12 | mcg | 3 | target | 1–20 | 1–20 | 1 / 1 |
  | Vitamin E | mg | 15 | target | 5–100 | 5–100 | 1 / 1 |
  | Vitamin K | mcg | 120 | target | 30–300 | 30–300 | 10 / 10 |
  | Folate | mcg | 400 | target | 100–1 000 | 100–1 000 | 50 / 50 |
  | Omega-3 | g | 2 | target | 0–10 | 0–10 | 1 / 1 |
  | Supplements (eight: creatine, taurine, betaine, HMB, beta-alanine, and L-arginine, L-carnitine and L-citrulline) | g | 0 | target | 0–50 | 0–50 | 1 / 1 |

- **Custom values**: the picker sheet also allows typing any whole number (digits only, ≤ 7
  digits); stored values are clamped to 0–999 999 and are NOT snapped to the wheel (tested on
  both platforms). The sheet opens in
  typing mode when the current value is not a wheel value. Non-blocking guidance shows the general
  adult upper limit when exceeded: calcium 2 500, iron 45, zinc 40, vitamin A 3 000, vitamin C
  2 000, vitamin D 100, vitamin E 1 000, folate 1 000; vitamin D also shows IU = mcg × 40 [obs].
- **Storage**: one record; missing keys read as defaults; decoding failure reads as defaults (I);
  values sanitised on load (I) [obs].
- **AI refresh** after a successful Recalculate (own words): the model is asked for practical daily
  goals for exactly the listed nutrients (never calories or macros), in the stated units, as
  integers, treating the "limit" ones as ceilings, keeping supplements at 0 unless requested, and
  using general adult guidance adjusted by profile and calorie target (A also: added sugar and
  saturated fat near ≤ 10 % of calories, fiber ≈ 14 g per 1 000 kcal, conservative caffeine,
  sodium near general guidance). Inputs: age, sex, height, weight, activity, goal, current
  calories and macros (I also goal weight, body fat and the current nutrient values with their
  kind) [obs].
  - Parsing differs: I starts from the **current** values, overwrites only numeric keys returned,
    and fails if none parsed. A starts from **defaults** for missing keys (and 0 for supplements),
    accepts numeric strings and `_g`/`_mg`/camelCase key variants, floors at 0 [obs] (R01.10).
- **Home pillars** use these goals: up to 4 chosen nutrients (default protein, carbs, fat, fiber);
  de-duplicated; empty selection falls back to the default (area Home owns the UI) [obs].

### 3.12 Weight forecast (thermodynamic) and under-logging detection

Pure maths, no AI [obs, Both; tested §8].

- **Inputs**: weigh-ins, food entries, profile, now.
- **Average intake**: foods in the 90 completed days ending yesterday; days logged = distinct local
  dates with ≥ 1 entry; average = total kcal div days logged (0 if none).
- **Balance**: average − trunc(TDEE). **Predicted weekly change** = balance × 7 / 7 700 kg.
- **Current weight** = newest weigh-in, else profile weight.
- **Observed weekly change**: least-squares slope of weight vs time over weigh-ins from the window
  start through today (inclusive), × 86 400 s × 7; none if < 2 points or all at the same instant.
- **Expected weight** at 30 / 60 / 90 days = current + predicted weekly × d / 7.
- **Days to goal**: only when a goal weight exists, goal ≠ maintain, predicted ≠ 0 and moving the
  right way (lose: predicted < 0 and goal < current; gain: predicted > 0 and goal > current);
  days = round(|goal − current| × 7 / |predicted|); reach date = now + days.
- **Enough data**: ≥ 2 logged days and ≥ 2 weigh-ins in the window.
- **Trends disagree** (under-logging hint): enough data, an observed trend exists, and
  |predicted − observed| > 0.3 kg/week.
- **Consumers**: the Coach context only (prints days logged, entries used, average intake,
  balance, predicted/observed weekly change, 30/60/90-day weights, days to goal and the
  under-logging note; with too little data it says so and names the minimum of 2 food days and
  2 weigh-ins) [obs]. Not shown
  on Progress.
- Example: food 1 400 (2 days ago), 1 600 (yesterday), 300 (today) → average 1 500 over 2 days;
  3 weigh-ins used; enough data.

### 3.13 Goal-reached alert

- **Rule** (Both, MUST; tested on both platforms §8): fires when a weigh-in
  is added, a goal weight exists, a previous latest weigh-in exists, the new entry is dated at or
  after that previous latest (a back-dated entry is history, not progress), and it crosses the goal:
  lose — previous > goal and new ≤ goal; gain — previous < goal and new ≥ goal; maintain never.
  Fires only on the transition, not on every weigh-in past the goal [obs].
- **Effect**: an in-app congratulation dialog with one dismiss action; I's message suggests
  switching the goal and recalculating. A additionally posts a system notification when both the
  global notifications switch and the goal-reached switch (default on) are on [obs].
- **Paths**: I checks inside the weight store, so every add path fires (Progress, Settings weight
  edit, Coach). A checks in the repository but only the Progress add and voice paths surface it;
  the Settings weight save ignores it [obs] (R01.11).

## 4. File map (what to read in the Read step)

| Sub-area | Reference path | Lines | Read what | Docs / tests to read with it |
|---|---|---|---|---|
| Profile + formulas + locks (A) | `A/models/UserProfile.kt` | 337 | all | `T/models/UserProfileGoalFormulaTest.kt` |
| Profile + formulas + Adaptive settings (I) | `I/Models/UserProfile.swift` | 705 | all (Adaptive settings at the end) | `IT/MaintenanceBreakdownTests.swift` |
| Enums | `A/models/{ActivityLevel,WeightGoal,AutoBalanceMacro,Gender}.kt` | 60+20+22+20 | all | — |
| Weekly formatter | `A/models/WeightDisplayFormatter.kt` | 17 | all | `T/models/WeightDisplayFormatterTest.kt` |
| Energy unit | `A/models/EnergyUnit.kt`, `I/Models/UnitPreferences.swift` | 108, 176 | all | `T/models/EnergyUnitTest.kt`, `IT/EnergyUnitTests.swift` |
| Optional nutrients | `A/models/NutrientGoals.kt`, `I/Models/OptionalNutrientGoals.swift` | 278, 364 | defaults, ranges, sanitising | `T/models/OptionalNutrientGoalsTest.kt`, `IT/OptionalNutrientGoalsTests.swift` |
| Onboarding state (A) | `A/ui/onboarding/OnboardingViewModel.kt` | 622 | steps, setters, buildPlanWithAI, back(), complete() | `T/ui/onboarding/OnboardingStateTest.kt` |
| Onboarding UI (A) | `A/ui/onboarding/OnboardingScreen.kt` | 2 355 | lines 140–460 scaffold, 553–1100 steps, 1875–2355 plan | — |
| Onboarding (I) | `I/Views/OnboardingView.swift` | 1 843 | 80–740 steps, 1352–1843 plan | — |
| Returning user | `A/ui/onboarding/ReturningUser.kt`, `ReturningUserStep.kt`; `I/Views/ReturningUserView.swift` | 224, 695, 821 | state machine; I lines 1–170, 500–765 | `T/ui/onboarding/ReturningUserStateTest.kt`, `IT/ReturningUserTests.swift` |
| AI goal calc + parser (A) | `A/services/ai/FoodAnalysisService.kt`, `A/services/ai/FoodAnalysis.kt` | — | `calculateGoals`, `estimateOptionalNutrientGoals`; `parseGoalCalculation`, `parseOptionalNutrientGoals` | — |
| AI goal calc + parser (I) | `I/Services/GeminiService.swift` | large | search `calculateGoals`, `parseGoalCalculation`, `closestFat`, `suggestOptionalNutrientGoals` | `IT/GoalEvidenceTests.swift` |
| Evidence pack | `A/services/GoalEvidence.kt`, `I/Services/GoalEvidence.swift` | 423, 551 | all | `T/services/GoalEvidenceTest.kt`, `IT/GoalEvidenceTests.swift` |
| Forecast + dead corrector | `A/services/WeightAnalysisService.kt`, `I/Services/WeightAnalysisService.swift` | 267, 164 | all | `IT/GoalEvidenceTests.swift` (forecast test) |
| Adaptive run (A) | `A/FudAIApp.kt` | large | lines 640–800 (`goalCalculationEvidence`, `refreshAdaptiveGoalsIfNeeded`) | `T/ui/settings/ManualRecalculationPolicyTest.kt` |
| Adaptive run (I) | `I/calorietrackerApp.swift` | — | lines 160–215 (completion defaults), 476–560 | — |
| Settings goal logic (A) | `A/ui/settings/SettingsViewModel.kt` | large | 150–180, 300–320, 1340–1670 | — |
| Settings goal UI (A) | `A/ui/settings/SettingsScreen.kt` | large | 810–945, 3155–3290, 3390–3440, 3750–3790, 4022–4060, 4960–5080 | — |
| Settings goal UI/logic (I) | `I/ContentView.swift` | large | 4818–4851, 4945–5240, 6510–6660, 7205–7520, 7540–7600 | — |
| Profile pickers (I) | `I/Views/ProfileComponents.swift` | 1 429 | 75–480, 618–670, 803–1000 | — |
| Maintenance row / methods (I) | `I/Views/MaintenanceEstimateRow.swift`, `I/Views/CalculationMethodsView.swift` | 56, 185 | all (do not copy text) | — |
| Persistence (A) | `A/data/PreferencesStore.kt`, `A/data/ProfileRepository.kt` | large, 18 | profile 230–260, adaptive snapshot 580–660, unit defaults 656–715, keys 1585–1680 | — |
| Goal reached | `A/data/WeightRepository.kt`, `A/ui/progress/ProgressViewModel.kt`, `I/Stores/WeightStore.swift` | — | `addEntry`, `crossesWeightGoal`, `addWeight` | `T/ui/progress/LogWeightDateTest.kt`, `IT/WeightHistoryTests.swift` |
| Coach forecast use | `A/services/ai/CoachContext.kt` | — | lines 25–100 | — |

Giant files: `A/ui/onboarding/OnboardingScreen.kt` [2 355] — search `BuildingPlanStep`,
`PlanReadyStep`, `PlanEditDialog`, `GoalSpeedStep`; `I/ContentView.swift` — search
`recalculateGoalsWithAI`, `applyAdaptiveGoalsIfDue`, `handleAdaptiveGoalsToggle`,
`lockableGoalRow`, `case .editGoalWeight`, `goalsNeedRecalc`; `A/FudAIApp.kt` — search
`refreshAdaptiveGoalsIfNeeded`; `I/Services/GeminiService.swift` — search `parseGoalCalculation`.

## 5. Minimum viable subset (PWA v1)

Maps directly (pure TypeScript, unit-tested against the numbers in §3):
- Profile record in IndexedDB with canonical units, defaults, weight-sync from weigh-ins, and
  "preserve an undecodable record" behaviour.
- All formulas of §3.3 including truncation rules, the 1.465 multiplier, the +0.2 g/kg cut boost,
  the maintenance breakdown (±50 tolerance).
- Units and formatting (§3.2): independent height/weight units, the weekly formatter, kcal/kJ with
  the kJ goal-picker exact-save rule and the kJ AI instruction line. Use `Intl.NumberFormat` for
  grouping and a locale-aware parser that rejects trailing junk.
- Onboarding steps 0–8 and 11–13 as specified, with canonical-unit state (R01.3), the
  hand-edited flag, the < 1 200 warning, completion side effects (seed first weigh-in/body fat,
  Adaptive on unless hand-edited, last-check = today).
- AI goal calculation through the BYOK client with our own prompt (§3.6 content), and the full
  validator/normaliser (§3.6 steps 1–7) — the highest-value unit-test target.
- Evidence pack (§3.8) without health energy; Recalculate Goals; recalc nudge via signature.
- Lock/rebalance engine (§3.7) and the Settings fields/validation (§3.9).
- Optional nutrient goals with defaults, ranges, custom values and AI refresh (adopt I's
  "keep current values for missing keys" parsing).
- Adaptive Goals (§3.10) checked on app open and on `visibilitychange` → visible (a PWA has no
  background scheduler), with the 7-day rule, single-flight guard, failure marking, snapshot/restore.
- Weight forecast (§3.12) for the Coach; goal-reached in-app dialog (§3.13) fired from the weight
  store for every add path.

Needs a web equivalent:
- Wheels → native `<select>`/stepper or a scroll-snap wheel; keep the same ranges and steps.
- Notifications step → `Notification.requestPermission()` (iOS Safari only in an installed PWA);
  goal-reached system notification → web notification when permitted.
- Returning user → a "Restore from backup file" entry on Welcome (file input) that follows the
  same rule: a restored backup that holds a profile + completed flag skips setup, otherwise the
  wizard continues over restored data; no auto-open signal exists on the web (no keychain or
  surviving grants) [inf].
- Building plan → same animation; bound the wait by the AI client timeout and fall back to formula
  values on any error.

Out of v1: health-store step and health import; Energy Burn / measured anchor (no health stores on
the web; keep the parameter in the calculator so it can be added later); hosted AI path and quota
flags; cloud (Drive/iCloud) restore; voice-driven goal edits; I's per-language label variants.

## 6. Hard parts / traps

1. **R01.1 Adaptive Goals is an AI re-run, not a formula corrector.** The shipped behaviour re-runs
   the full AI goal calculation weekly; the deterministic weekly corrector in A is dead code. A
   rebuild that implements only the corrector changes product behaviour; one that implements only
   the AI path has no offline story. Implement the AI path; decide Q1 for the corrector.
2. **R01.2 Bad AI output must never become a plan.** Out-of-range, incoherent (> max(100, 15 %)
   mismatch), missing-macro or implausible-vs-profile replies must throw and leave targets
   untouched; accepted replies must be normalised so 4P + 4C + 9F = calories exactly (fat ≡
   calories mod 4). Port the parser tests' vectors (§3.6 examples) first.
3. **R01.3 Unit toggle must not lose the entered value.** I keeps separate imperial and metric wheel
   states in onboarding, so switching units mid-step shows the other unit's stale default instead
   of the converted value (Settings sheets convert correctly). Keep wizard state canonical (cm/kg)
   and convert for display; round inches with `round`, not truncation (170 cm → 5′7″).
4. **R01.4 Stale AI results overwrite user edits.** Recalculate/Adaptive calls take seconds. Apply a
   result only if the whole profile is identical to the snapshot taken before the call (not just
   formula inputs) and relevant switches are unchanged; otherwise drop it.
5. **R01.5 Adaptive must not hammer a broken provider or double-call.** Mark the week checked on AI
   failure (only if Adaptive is still on and switches unchanged); mark it after a successful manual
   Recalculate; set it to today at onboarding completion; guard against overlapping runs (foreground
   events fire repeatedly in a PWA).
6. **R01.6 Onboarding accepts a contradictory goal weight.** Neither platform checks that a lose
   target is below the current weight (or gain above) in the wizard, while Settings rejects it;
   the estimated-days card uses |difference| and the forecast then never yields days-to-goal.
   Validate in the wizard the same way as Settings (needs product sign-off, Q3).
7. **R01.7 Plan Ready edits diverge.** A stores per-field overrides without rebalancing (calories
   and macros can disagree); I re-derives carbs or calories. Pick I's coupling (or route edits
   through the lock engine) so the saved plan stays energy-consistent; remember any edit sets the
   hand-edited flag and turns Adaptive off at completion.
8. **R01.8 Building plan can hang or misfire.** A waits for the AI with no overall timeout; I shows
   a back button during the build and the pending completion then advances from wherever the user
   is. Disable back during the build, ignore stale completions, and cap the wait (then use formula
   values).
9. **R01.9 Truncation vs rounding is part of the spec.** TDEE, adjustment, protein, fat, carbs and
   auto-balance shares truncate (integer division); distribute() and the AI normaliser round;
   kJ display rounds. Using `Math.round` everywhere shifts values by 1 and breaks parity tests.
   JavaScript `%` on negatives differs from floor-mod: use a true floor-mod for the fat residue.
10. **R01.10 Optional-nutrient AI refresh can wipe customisations.** A fills missing keys with
    defaults and supplements with 0; I keeps current values for missing keys and fails if nothing
    numeric came back. Use I's rule; clamp 0–999 999; never snap custom values to the wheel.
11. **R01.11 Goal-reached fires inconsistently.** Only a new latest weigh-in (date ≥ previous
    latest) crossing the goal counts, and only on the transition. A's Settings weight path never
    shows it. Detect inside the weight store so every add path (Progress, Settings, Coach) fires.
12. **R01.12 Settings edits do not recalculate.** Changing weight, activity, goal or pace changes
    nothing until Recalculate (or Adaptive); only a "Tap to update" nudge appears, driven by the
    signature with a silently seeded baseline. Weigh-ins change profile weight and therefore the
    signature. Do not add auto-recompute "helpfully".
13. **R01.13 Locks: max two macros, materialise first.** Snapshot all three effective macros before
    writing any (writing one would shift another's auto value); reject a macro edit when calories
    are locked and both other macros are locked; the last macro in fixed order absorbs rounding.
14. **R01.14 Turning Adaptive off restores the pre-Adaptive plan.** The snapshot is taken once,
    before the first Adaptive change, and deleted on disable. Taking it on every run would lose the
    user's original plan.
15. **R01.15 Birthday and age edges.** A's date wheel allows future days in the current year (age
    clamps to 0); store birthdays as a local date (not a UTC instant) to avoid off-by-one in age
    east of UTC.
16. **R01.16 Evidence must stay numeric and exclude today.** Today's diary is in progress; missing
    days are unknown, not zero; workout calorie estimates are excluded to avoid a circular signal;
    no food or exercise names. Tests enforce all four.
17. **R01.17 Undecodable profile.** A failed decode reads as "no profile" (which would re-open
    onboarding); the raw record must be kept, not overwritten by the next save.
18. **R01.18 Different unit defaults per platform.** I starts imperial, A starts metric. Choose
    deliberately for the PWA (Q2) and seed both height and weight units together.

## 7. Open questions

1. Adaptive Goals offline fallback: ship only the AI re-run (reference behaviour), or also the
   dead deterministic corrector (±150 kcal/day, floor max(BMR, 1 200), ceiling 1.25 × maintenance)
   when no AI key is configured? Needed: product decision.
2. Default units for a new PWA user: imperial (I), metric (A), or by browser locale (e.g. imperial
   for `en-US`)? Needed: product decision.
3. Should the wizard reject a target weight on the wrong side of the current weight (as Settings
   does)? Needed: product decision.
4. Plan Ready ranges: adopt A's (calories 800–6 000/50, protein 10–500/5, carbs 0–800/5,
   fat 10–300/5, matching Settings) or I's narrower wheels? Recommendation: A's, for consistency.
   Needed: product decision.
5. Should the goal-reached dialog offer actions (switch goal / recalculate) or only dismiss?
   Needed: product decision.
6. Building-plan wait cap: the AI client timeout from the AI-providers spec, or a fixed cap?
   Needed: value from the AI-providers area.
7. Onboarding health-store step (10) and notifications step (9) for the PWA: drop step 10 in v1 and
   keep the 13-step progress maths consistent? Needed: product decision.

## 8. What to read later

- Reference docs: none beyond the code; I `CalculationMethodsView.swift` lists the sources and
  citations behind the formulas (write our own text).
- Reference tests that list the edge cases: `T/models/UserProfileGoalFormulaTest.kt`,
  `T/models/EnergyUnitTest.kt`, `T/models/WeightDisplayFormatterTest.kt`,
  `T/models/OptionalNutrientGoalsTest.kt`, `T/services/GoalEvidenceTest.kt`,
  `T/ui/onboarding/{OnboardingStateTest,ReturningUserStateTest}.kt`,
  `T/ui/settings/ManualRecalculationPolicyTest.kt`, `T/ui/progress/LogWeightDateTest.kt`,
  `IT/{GoalEvidenceTests,MaintenanceBreakdownTests,EnergyUnitTests,OptionalNutrientGoalsTests,ReturningUserTests,WeightHistoryTests}.swift`.
- REA Evidence (outside the repo): none produced for this area.
- Related specs: AI providers (BYOK client, timeouts, error routing) for §3.6 transport; Coach for
  the forecast context (§3.12); Progress/weight for weigh-in logging and back-dating; Settings
  layout `06-*` for where §3.9 rows live; backup/export for the restore file used by §3.5;
  notifications for the permission step and goal-reached notification.
