# Task: kg only (P13 S1, D-16.91) · Phase: 13 · Owner: builder (wt-p13s1)

<!-- Save as platewise/docs/notes/P<nn>/<slug>.md. Write everything above "Compare checklist"
BEFORE writing code, in your own words. Never paste or paraphrase the reference line by line. -->

Read (reference @ `10e14b67`): no reference code read before the rewrite. The task removes a
reference feature (the kg | lb choice) by the owner's decision D-16.91, so there is nothing to
rebuild; the compare step greps the reference for every place its weight unit reaches, to check
that none of our matching places still shows pounds. Research spec `01-profile-goals.md` §3.2
(units and weight display), §6 R01.3 and R01.18; `05-home-progress.md` §3.5 (Log weight's
toggle), §6 R05.10 (c) and R05.11; `06-settings-data.md` §3.3 (metric and imperial); `04-coach.md`
§3 (weight in the context and `weight_log`). Phase file `P13-kg-coach-health-reminders.md` (Goal
item 1, D-16.91). No Evidence ids.

What it does (own words): weight is read and typed in kilograms only. The `units.weight` setting
keeps its key but has one value, `kg`: whatever is stored there (an `lb` from an earlier build, or
anything else) reads as `kg`, and the first read after the update (the settings repository's
start-up snapshot) writes `kg` back, so backups made afterwards carry `kg` too. Weights were always
stored in kg, so no weight changes: a person who read pounds now sees the same weights in kg, one
decimal, as kg always showed. A first run starts in kg in every locale; en-US, en-LR and my-MM
still start height in feet and inches (height and energy choices are unchanged). The weight unit
choice goes from Settings › App settings (Units), the wizard's Body step (its Metric | Imperial
toggle becomes a height-only cm | ft and in toggle), the Log weight sheet and the Personal info
weight sheets. Pace is kg a week. Pounds remain known in one place: the domain keeps the pound
factor and a `kgFromPounds` helper for an import that carries pounds.

Inputs → outputs:
- `WEIGHT_DISPLAY_UNITS` → `['kg']`; `WeightDisplayUnit` → `'kg'`; `isWeightDisplayUnit` true for
  `kg` only. The weight helpers keep their unit parameter (the setting still exists, with one
  value), so every screen and the Coach call them as before: `formatWeight(70, 'kg', 'en-US')` →
  `"70.0"`, `formatPace(0.5, 'kg')` → `"0.5"`, `WEIGHT_WHEEL.kg` → 20–250.
- `kgFromPounds(160)` → 72.5748… (unrounded, one factor both ways).
- Settings reader: `'units.weight'` stored `lb` / `kg` / `42` / missing → `kg` (never kept aside).
- Settings repository: on creation, before its first snapshot, a stored `units.weight` that is
  not `kg` is rewritten as `kg` (best effort: a failed rewrite still lets the snapshot load).
- `defaultUnits('en-US')` → `{ energy: 'kcal', height: 'ftIn', weight: 'kg' }`.
- Wizard: action `{ type: 'heightUnit', unit }` replaces `{ type: 'units', system }`; the weight and
  the target never move on a height-unit switch.

Files: changed `src/domain/units/body.ts`, `defaults.ts` and their tests;
`src/data/settingsSchema.ts`, `src/data/repos/settingsRepo.ts` and their tests; the wizard
(`wizard.ts`, `steps/Body.tsx`, `steps/WeightPicker.tsx`, `testing/renderWizard.tsx` and the step
tests); Settings (`app/UnitsSection.tsx`, `profile/WeightSheet.tsx`, `profile/values.ts`, their
tests and helpers); Progress (`LogWeightSheet.tsx`, `WeightCard.tsx`, `RecapCard.tsx`,
`HistorySheet` tests, `testing/openProgress.tsx`); `GoalReachedDialog.tsx`; the services that
stored a weight unit (`progress.ts`, `profileEdits.ts`, `appSettings.ts`); the AI prompts' profile
facts (`src/ai/prompts/shared.ts`); the Methods page's pound sentence; i18n (`onboarding`,
`profile`, `progress`, `goals`, `about`); parity scenarios and e2e specs that picked lb; the parity
ledger claims whose steps are renamed; this note. Coach tests touched only where they stored lb
(shared with S2).

Edge cases / failure modes:
- A stored `lb` must not count as damage: no quarantine copy, no "some data could not be read"
  notice. The reader maps every stored value to `kg`.
- The rewrite runs before the first snapshot in its own transaction; it must not block the boot
  gate if it fails, and must not write when the row is already `kg` or missing.
- A backup restored from before the update brings `lb` back as a raw row; the reader still shows
  kg and the next start-up rewrites it.
- A weight below 20 or above 250 kg still opens the wheels at their nearest end (unchanged).
- en-US: height in feet and inches next to weight in kg is now the first-run default (R01.18 no
  longer seeds both together).
- Goal checks compare weights as kg reads them, to the tenth (unchanged for kg readers).
- The Coach's `weight_log` tool still lists an `lb` column and its context still formats through
  the person's unit (now always kg): `src/services/coach/**` belongs to S2, who was told to use kg.

Our design differences / decisions:
- D-16.91 (owner): kg only; a deliberate difference from the reference, which offers kg | lb.
- The setting key stays (with one value) rather than being deleted, so older backups, the Coach's
  snapshot, the AI prompts and every screen keep reading it the same way; deleting the key would
  touch S2's files and many screens P12 is restyling.
- The rewrite lives in the settings repository's start-up read (a small list of settings to
  rewrite there) rather than a database upgrade step: it also catches a restored older backup, and
  S3 may add a schema version in parallel.
- The wizard's toggle becomes cm | ft and in (height only), labelled "Height unit".
- The Methods page drops "about 3,500 kcal for every pound" (no pound text a person can see); the
  source it cites stays.

Tests we will write:
- Domain: kg is the only weight unit; `kgFromPounds` converts with the one factor (160 lb → 72.6
  kg shown); the kg wheel keeps every tenth through a store and a reopen (R05.10); en-US, en-LR
  and my-MM start in kg (height in ft and in); every tag starts in kg.
- Settings: the reader maps `lb` and anything else to `kg`; the repository rewrites a stored `lb`
  on its first read, keeps nothing aside, and leaves a missing row missing.
- Screens with a stored `lb`: Progress (weight card, history), the Log weight sheet (no toggle,
  kg wheels), Personal info rows and the weight and goal sheets, the goal-reached dialog all show
  kg; Settings › Units offers energy and height only; the wizard in en-US starts in kg with height
  in feet and inches and switches the height unit without moving the weight.
- Updated: every test that pinned lb behaviour (listed in the report).

Compare checklist (filled after the rewrite; reopened, as greps only for where the weight unit
reaches: `A/ui/onboarding/OnboardingScreen.kt`, `A/ui/settings/SettingsScreen.kt`,
`A/ui/progress/ProgressScreen.kt` and `WeeklyRecapCard.kt`, `A/ui/home/HomeViewModel.kt`,
`A/services/ai/CoachContext.kt`, `CoachTools.kt` and `FoodAnalysisService.kt`, the backup tests):
- [x] Onboarding: no weight unit, en-US starts in kg with height in ft and in, the height toggle
  never moves the weight (`src/features/onboarding/WizardPage.test.tsx > WizardPage > shows weight
  in kg and height in feet and inches in a fresh wizard in an en-US browser (ACC-B11-2, D-16.91)`;
  `steps/Body.test.tsx > Body > offers no weight unit: only the height unit can be switched
  (D-16.91)`; `wizard.test.ts > units > keeps 70.0 kg and 170 cm through cm → ft and in → cm:
  weight is kg only (R01.3, ACC-B3-1, D-16.91)`); pace in kg a week (`steps/Pace.test.tsx > Pace >
  reads the weekly amount in kg when height is in feet and inches: "0.5 kg" (D-16.91)`).
- [x] Settings: Units offers energy and height only and says weight is kg (`src/features/settings/
  app/UnitsSection.test.tsx > UnitsSection > offers no weight unit: weight reads kg next to height
  in feet and inches, even with lb stored (ACC-J3-1, D-16.91)`); Personal info rows and the weight
  and goal sheets read kg with lb stored (`profile/ProfilePage.test.tsx > ProfilePage > shows feet
  and inches, kg for a stored lb, body fat and its goal, and the allergen list (D-16.91)`;
  `profile/WeightSheet.test.tsx > WeightSheet: the current weight > shows kg with no unit toggle for
  a person whose stored unit is lb, and an unmoved Save keeps the exact kg (D-16.91)`;
  `> WeightSheet: the goal weight (D-16.11) > refuses a gain goal that reads the same as the
  current weight, in kg even with lb stored`).
- [x] Progress: the weight card, the history and the Log weight sheet read kg with lb stored, no
  toggle (`src/features/progress/LogWeightSheet.test.tsx > LogWeightSheet > weighs in kg with no
  unit toggle, even for a person whose stored unit is lb (ACC-G4-2, R05.11, D-16.91)`;
  `HistorySheet.test.tsx > HistorySheet > writes weigh-ins in kg for a person whose stored weight
  unit is lb (D-16.91)`; `WeightCard.test.tsx > WeightCard > writes every figure in kg with one
  decimal, the only weight unit (D-16.91)`); the recap card goes through the same unit.
- [x] Home: the reference's Home reads the unit for its weight dialogs; ours shows weight only in
  the goal-reached dialog it hosts (`src/features/goals/GoalReachedDialog.test.tsx >
  GoalReachedDialog > names the weight in kg for a person whose stored weight unit is lb
  (D-16.91)`).
- [x] AI prompts' profile facts: kg only, no "they read … lb" (`src/ai/prompts/shared.test.ts >
  profileFacts > adds feet and inches for a person who reads height that way; weight stays kg
  (D-16.91)`; `plan.test.ts > planPrompt: the profile, reference values and current targets >
  gives the profile in metric plus the person's own units`).
- [x] Settings storage and backups: a stored `lb` reads as kg, is never kept aside, and the first
  read writes kg back (`src/data/repos/settingsRepo.test.ts > values an earlier build stored >
  rewrites a stored lb weight unit as kg on the first read, keeping nothing aside (D-16.91)`, and
  the two tests after it; `src/data/settingsSchema.test.ts > readSetting > reads every stored
  weight unit as kg, the only one (D-16.91)`).
- [x] First-run defaults kg in every locale (`src/domain/units/defaults.test.ts > defaultUnits >
  starts en-US, en-LR and my-MM in kg and feet and inches (D-16.91)`, `> seeds height from the
  locale and weight in kg for every tag (R01.18, D-16.91)`).
- [x] Pound import helper kept with a test (`src/domain/units/body.test.ts > kgFromPounds > turns an
  imported pound value into kg with the one pound factor, unrounded`).
- [ ] The Coach: its context formats weight through the person's unit, so it says kg now
  (`src/services/coach/context.test.ts > coachContext: the person > gives the profile in kg and
  feet and inches for a person who reads height that way (D-16.91)`), but `weight_log` still
  returns an
  `lb` column and its schema text says "and in lb" (`src/services/coach/tools.ts`,
  `toolSchemas.ts`): S2's files, left for S2 or the lead.
- Deliberate differences: kg only (D-16.91), with the height toggle alone in the wizard; the
  setting key kept with one value; the start-up rewrite instead of a database upgrade step; the
  Methods page no longer gives the per-pound figure.
- Not taken: deleting `units.weight` and the unit parameter of the weight helpers (they would touch
  the Coach's files, which S2 is changing, and many screens P12 is restyling); voice and workout
  weights (not built).

## Decisions for the lead

- `units.weight` stays a setting with the one value `kg` (type `WeightDisplayUnit = 'kg'`); the
  weight helpers keep their unit parameter, so S2's Coach code compiles unchanged after the merge.
- The rewrite of a stored `lb` runs in the settings repository's start-up read
  (`SETTINGS_REWRITTEN_ON_LOAD`), best effort, before the first snapshot; no schema version.
- The wizard's Body step toggle is now "Height unit: cm | ft and in" (`wizard.body.heightUnit`);
  the Settings Units note adds "Weight is always in kg."
- No import carries pounds today (Health Connect gives kg; our diary file and backups carry kg):
  `kgFromPounds` and `LB_PER_KG` are kept, tested, for one that does (D-16.91).
- The Methods page drops "about 3,500 kcal for every pound"; its source citation stays.

## Status

Done (2026-10-27). Weight is kg everywhere a person sees or enters it; `lb` stored by an earlier
build reads as kg and is rewritten on the first read. Lines changed outside the task's own files:
`src/services/coach/context.test.ts` and `snapshot.test.ts` (their lb cases, now kg; S2's area),
`parity/ledger/obligations.json` and `manifest.json` (the renamed steps and tests). Handed on: the
`weight_log` tool's `lb` column (S2 or the lead) and the ledger rows (the lead).
