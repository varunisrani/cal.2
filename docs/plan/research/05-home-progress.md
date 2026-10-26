# 05 — App shell, Home, Progress, weight, body fat, water and fasting: behavioural specification (clean-room)

Scope: the app shell (tab bar, navigation rules, theme behaviour, card/glass layout language), the Home
screen (calorie dome, nutrient pillars, custom Home nutrient cards, week strip, day swipe, unified diary
with meal sections and sort modes, the nutrition detail sheet, empty states, the "+" entry point), the
Progress tab (weekly recap, ranges, period navigation, metric switcher, weight and body-fat charts and
histories, calorie history, macro and nutrient averages), logging weight and body fat, water tracking
and fasting tracking.
Out of scope: what each food entry of the "+" menu does, the food review/edit sheets, multi-select
"combine into meal", meal sharing and copy-from-day (food-logging area, area 02); onboarding and goal
maths (goals area); the Settings screens themselves beyond the water/fasting/tab-bar/theme rows
described here (settings area); Coach chat; backup/export; and the later-phase features that show up
inside these screens (workouts, steps, health-store sync, voice assistant, weekly challenge, widgets).
Reference: `apoorvdarshan/fud-ai` @ `10e14b67116c52b515d2389621266e32b3a99840`; shipped build checked:
store screenshots only (Play: 8 PNGs, App Store: 10 PNGs, plus the two contact sheets). No APK/IPA was
inspected. REA was not needed for this area: the source settles everything below.
Sources studied: Android Home, Progress, navigation, theme, components, data and model files; iOS
`ContentView.swift` (tab view, HomeView, NutritionDetailView, ProgressTabView, settings toggles only),
iOS Home/Progress/Fasting/Water/Theme views, models and stores; Android unit tests under `T/models`,
`T/ui/home`, `T/ui/progress`, `T/ui/navigation`; iOS tests for fasting, water presets, weight history,
progress ranges, recap and tab bar.

Conventions used below:
- **Day** = a local calendar day in the device's current time zone. **Today** = the day containing now.
- **Accent** = the user-chosen theme colour; it always comes as a pair (base, lighter tint) used as a
  two-stop gradient.
- **Display unit** = what the user sees (kcal or kJ; kg or lb; ml or fl oz). Storage is always kcal,
  kg, ml and a 0–1 fraction for body fat.
- **Diary** = the scrolling list on Home under the summary. **Tracker** = the water or fasting feature.
- **Glass card** = the translucent rounded card style described in §3.1.4.
- A, I, T, IT are the reference roots from the shared brief; they appear only in §4.
- "MUST" marks an invariant the reference defends with defensive code or a test (a past bug).

---

## 1. Overview

The app is a five-tab shell. Home is the daily dashboard and the only place where food, water and
fasting are added from the "+" button. Progress is the history dashboard: a weekly recap, a range
picker, one selected body metric (weight or body fat in v1), the calorie history and nutrient
averages. Water and fasting are optional trackers, both **off by default**; when on, they add entries to
the "+" menu, a row type to the diary, and (water only) a pillar on Home. Neither ever changes
nutrition totals. An active fast does, however, **block all food logging** until it is ended or
cancelled (§3.6.5).

```
                      ┌──────────────────────── App shell ───────────────────────┐
                      │ theme (system/light/dark + accent)  ·  floating tab bar   │
                      │ Home │ Progress │ Coach │ Settings │ Workouts (later)     │
                      └───┬──────────┬──────────────────────────────┬────────────┘
                          │          │                              │
        ┌─────────────────▼───┐   ┌──▼──────────────────────┐   ┌───▼─────────────────────┐
        │ Home (selected day) │   │ Progress                 │   │ Settings rows (owned by │
        │ week strip          │   │ weekly recap             │   │ settings area): theme,  │
        │ calorie dome        │   │ range + period arrows    │   │ week start, tab bar,    │
        │ nutrient pillars    │   │ metric: weight/body fat  │   │ water, fasting          │
        │ View More sheet     │   │ history lists            │   └─────────────────────────┘
        │ diary (food, water, │   │ include-today switch     │
        │   fasting rows)     │   │ calories chart, averages │
        │ "+" menu            │   └──────────┬───────────────┘
        └──┬───────┬──────┬───┘              │
           │       │      │                  │
     food store  water  fasting       weight · body fat stores ──► profile (latest weight /
     (area 02)   store  store                                       latest body fat feed BMR)
              ▲             │
              └── blocks ───┘  (an active fast refuses every food write)
```

What the user sees: a dark-first, single-accent interface. Every progress mark (dome, pillars, bars,
chart line, selected day) uses the accent; there is no per-macro colour coding [obs] (all macro colours
resolve to the accent base). Numbers animate in from zero when the app is opened.

What the system guarantees:
- Water and fasting never enter calorie/macro totals, meal-section totals, meal shares, Progress
  averages or the weekly recap [obs, `HomeDiaryMealGroupTest`].
- At most one fast is active; fasts never overlap; a fast's end is never before its start [obs,
  `FastingSessionTest`, iOS `FastingStoreTests`].
- The profile's current weight and current body fat follow the latest reading by date [obs].
- Turning a tracker off hides its new-entry UI but keeps and still shows its history [obs].
- A corrupt stored list is never silently replaced with an empty one (§6, R05.6).

## 2. Reference names (rename in rebuild)

| Kind | Names (reference only; they become banned identifiers) |
|---|---|
| Binary / CLI and flags | none for this area |
| Env vars | none |
| Files and folders | `FudAINavHost`, `FudAIRoutes`, `FudAIBottomNavBar`, `FudGlass` (`FudGlassSurface`, `FudGlassDialog`, `FudGlassDialogActions`, `FudGlassPrimaryButton`, `FudIconBubble`), `FudAITheme`, `AppColors`, `WeekEnergyStrip`, `CalorieGauge`, `CalorieHero`, `MacroVerticalBar`, `MacroCard`, `NutritionDetailSheet`/`NutritionDetailView`, `ProgressTabView`, `WeeklyRecapCalculator`, `FastingSessionEditorView`, `PersistedJsonGuard`, `PersistedBlobGuard` |
| HTTP routes / URL schemes | in-app routes `home`, `progress`, `coach`, `settings`, `workouts`, `settings/tab-bar`, `settings/body-measurements` (and other `settings/*`) |
| RPC methods / events / commands | Darwin notification `ai.fud.weightEntriesDidChange`; in-app event `weightGoalReached` |
| Settings and storage keys | `hiddenTabs` (CSV of `progress`,`coach`,`workouts`), `appearanceMode` (`system`/`light`/`dark`), `appThemeColor` (default `fudPink`), `weekStartsOnMonday` (default true), `homeTopNutrients` (CSV, default `protein,carbs,fat,fiber`), `foodLogSortOrder` (`standard`/`latestMealsFirst`), `waterTrackingEnabled`, `waterDailyGoalMl`, `waterUnit` (`ml`/`floz`), `waterQuickAddPresetsMl` (CSV, default `250,500,750`), `waterReminderEnabled`, `waterReminderHour`, `waterReminderMinute`, `waterEntries`, `fastingTrackingEnabled`, `fastingDefaultGoalMinutes`, `fastingGoalNotificationEnabled`, `fastingSessions`, `weightEntries`, `bodyFatEntries`, `weightDeletionTombstones`, `progressIncludeToday`, `weightUnit` (`kg`/`lbs`), `energyUnit` |
| Other (scopes, error tags, IPC channels) | accent preset keys (`fudPink`, `red`, `orange`, … `lime`, 18 in all) and the default accent's display name; notification channels for water, fasting, weight, body fat |

Notes on the keys: the CSV formats and the enum string values matter only if Platewise ever imports a
reference backup (backup area decides). Platewise uses its own key names.

Third-party protocol names used by this area: none in v1. (Health Connect / HealthKit appear in the
reference only for later-phase sync, steps and the burn line.) Web platform APIs the rebuild will use:
`prefers-color-scheme`, `Notification`, `ServiceWorkerRegistration.showNotification`,
`navigator.vibrate`, `visibilitychange`; check each against MDN at build time.

## 3. Behaviour

### 3.1 App shell

#### 3.1.1 Tabs and navigation

- **Tabs and order** [obs, both platforms]: Home, Progress, Coach, Settings, Workouts. The order is
  fixed; the user can only show or hide tabs. Settings sits before Workouts.
- **Visibility setting** (Settings › Tab Bar): one switch each for Progress, Coach and Workouts. Home
  and Settings are always shown; the footer says so [obs]. Stored as the set of hidden tabs. When
  that set is read back, any entry that is not one of the three hideable tabs is dropped (Home and
  Settings can never end up hidden), and with nothing stored all five tabs show
  [obs, the tab-bar tests on both platforms].
- Changing one switch MUST read the current stored set and change only that tab, so another tab's
  state is not overwritten by a stale screen copy [obs, `hidingOneTabKeepsTheOtherStoredTabs`].
- If the tab on screen becomes hidden (by the setting or by a restored backup), the app returns to
  Home [obs].
- The hidden set is loaded asynchronously; until it is known the tab bar is not drawn at all, so a
  hidden tab never flashes in [obs].
- **Tab bar hides** while a food analysis is running (the analysing overlay is the only thing on
  screen) and while the voice assistant is expanded [obs]. It stays visible on nested Settings pages,
  where Settings shows as selected.
- **Re-tapping** the Settings tab while inside Settings (hub or a nested page) returns to the Settings
  hub [obs]. Re-tapping the current tab otherwise does nothing. Switching tabs restores each tab's
  saved state (scroll, local UI) [obs].
- A dot badge on the Settings tab marks "update available" [obs]. (PWA: a waiting service-worker
  update.)
- External entry points (home-screen quick actions, shortcuts) switch to Home, reset Home to today and
  close any open Home sheet before acting [obs].

#### 3.1.2 Tab bar look and motion

- A floating capsule, 72 high with fully round ends, inset 14 from the sides and 10 from the bottom
  safe area; translucent backdrop with a vertical sheen, a thin gradient border and a soft shadow
  (stronger in dark mode) [obs, Android; iOS uses the system tab bar].
- Each item: icon above an 11-size label. The selected item is accent-tinted, its icon slightly larger
  (scale 1.08 with a springy settle) and semibold; unselected items are 55–62 % opacity foreground.
- A brighter "pill" sits behind the selected item and springs to the new item on selection. The user
  can also press anywhere on the bar and slide horizontally: the pill follows the finger, a light haptic
  ticks each time it crosses an item boundary, and on release it snaps to the nearest item and selects
  it [obs]. Taps still work (the drag starts only after the touch slop).
- Scrollable tab content reserves 132 bottom padding so its last card clears the bar; docked
  controls reserve 82 [obs].

#### 3.1.3 Theme behaviour

- **Appearance**: System (default), Light or Dark. System follows the OS setting live [obs].
- **Accent**: one of 18 presets, default a pink [obs]. Each preset is a pair (base, lighter tint). The
  base colours every accent element; the pair forms the gradient used on the dome, the selected day,
  pillar fills, chart bars and primary buttons. On iOS the accent also swaps the app icon [obs] (PWA: not
  possible; manifest icons are static).
- Light mode uses a warm off-white page background with white cards; dark mode uses a near-black page
  with dark-grey cards; muted text is a mid grey in both [obs]. Platewise picks its own palette.
- Theme changes apply immediately everywhere, including already-drawn charts and the dome [obs, iOS
  observes the setting explicitly because its gauge would otherwise skip the redraw].
- Font: the platform default family; sizes run 11 (labels) to 50 (dome number) [obs].

#### 3.1.4 Layout language (describe, then restyle)

- **Glass card**: a rounded card (corner 20 on section cards, 14 on small controls, 18 on list links,
  22 on history lists, 28 on dialogs and sheet tops) with a translucent fill, a top-to-bottom white
  sheen fading to a faint accent wash, a hairline gradient border (bright top-left to faint accent
  bottom-right) and a soft shadow [obs].
- **Dialogs** are glass cards 24 in from the screen edges with 20 padding, 16 between blocks, a bold
  21-size title, a muted message and a right-aligned action row (secondary text button + primary
  filled button; destructive actions use red) [obs].
- **Sheets** slide up with 28-radius top corners, a title row with a trailing Done in accent [obs].
- **Segmented controls**: a muted track with the selected segment raised as a white (light) or 18 %
  white (dark) chip [obs]. The Progress destination switch uses an accent-gradient selected chip.
- **Stat badges**: small tinted tiles (accent at ~5.5 % opacity, radius 10) with a bold value over a
  muted label; text shrinks (down to 10/7) rather than wrap [obs].
- **Wheel pickers** for weight, body fat, hours and water goal; on the web these become scroll-snap
  wheels or native inputs (§5).

### 3.2 Home: top region

#### 3.2.1 Selected day

- Home shows one selected day, default today. Every new Home opens on today [obs]. Quick actions and
  shortcuts reset it to today [obs].
- **Week strip** (top): paged by whole weeks, 53 pages (the current week and the 52 before it); it
  never pages into future weeks [obs]. Each page shows 7 day tiles: a narrow weekday letter (11 size,
  muted; accent when selected) over the day number in a 36 circle. Selected day: accent-gradient
  filled circle with white number and a soft accent glow. Today when not selected: thin accent ring,
  accent number. Others: plain [obs].
- The week begins on Monday by default or on Sunday per the "week starts on" setting (shared with the
  recap and other week strips) [obs]. Changing the setting re-anchors the strip on the current week
  [obs, iOS].
- When the selected day moves into another week (by swipe), the strip animates to that week [obs].
- Tapping a tile selects it with a light haptic [obs]. Days later in the current week than today are
  visible and **tappable** [obs]; see §7 Q5.
- **Day swipe**: a horizontal swipe on the top region only (dome and pillars, not the diary) changes
  the day: swipe toward the left = next day, toward the right = previous day [obs]. Thresholds: Android
  needs 80 of horizontal travel; iOS needs more than 60 and a horizontal component above 1.5 × the
  vertical one [obs]. The swipe never moves past today [obs].
- **Timestamp rule for logging on the selected day** (water here; food in area 02): if the selected day
  is today, use now; otherwise use that day at the current wall-clock time [obs]. The same rule backs
  backdated weigh-ins (§3.5.3).

#### 3.2.2 Calorie dome ("ring/arc gauge")

- A top-half semicircle 240 wide (aspect 2:1), stroke 14, drawn **dashed** (4 on, 6 off, flat ends)
  [obs]. Track: accent at 12 % opacity. Fill: accent gradient from left, sweeping clockwise
  `180° × min(eaten / goal, 1)`; nothing when goal ≤ 0.
- Centre readout, inside the dome: a small uppercase heading naming the unit ("Calories", or
  "Kilojoules" when the energy unit is kJ); the eaten amount in display units, 50 size, bold, accent
  gradient text, grouped thousands, shrinking to fit; a flame glyph plus a status line in accent [obs]:
  - goal ≤ 0 → "No goal";
  - eaten < goal → "N left", N = goal − eaten in display units;
  - eaten > goal → "N over";
  - equal → "Goal reached".
  The comparison is made in kcal; the difference is shown in the display unit [obs].
- The dome does **not** change colour or shape when over goal; it simply stays full [obs].
- Optional burn line under the status (later phase: needs a health store): the energy burned and
  whether the day is in deficit, surplus or balance, with the difference [obs].
- Goal = the profile's effective calorie target; if no profile has loaded yet the code falls back to
  2000 (and 150 g protein, 220 g carbs, 70 g fat). The Android splash screen is held until the profile
  loads so these fallbacks never show [obs] (R05.12).
- **Launch fill**: on app open (cold start, or return from background after the app was hidden) the
  dome and pillars snap to empty and spring up to their values (Android spring: damping 0.85, low
  stiffness; iOS: response 0.9, damping 0.85). Switching tabs or editing data does not replay it;
  values then animate directly to the new level [obs] (R05.18).
- Steps line (later phase, health store): "N steps" under the dome when available [obs].

#### 3.2.3 Nutrient pillars (custom Home nutrient cards)

- A row of up to 4 user-chosen nutrient pillars, then a fixed **Water** pillar when water tracking is
  on (so up to 5) [obs]. Default selection: protein, carbs, fat, fiber [obs].
- Choosable nutrients (32): protein, carbs, fat, fiber, sugar, added sugar, saturated fat,
  cholesterol, caffeine, sodium, potassium, trans fat, calcium, iron, magnesium, zinc, vitamins A, C,
  D, B12, E, K, folate, omega-3, and eight supplement compounds (creatine, taurine, betaine, HMB, beta-alanine and the
  L-forms of arginine, carnitine and citrulline) [obs]. Units: g for macros, sugars, fats, omega-3 and supplements; mg for cholesterol,
  caffeine, sodium, potassium, calcium, iron, magnesium, zinc, vitamins C and E; mcg for vitamins A, D,
  B12, K and folate.
- Each pillar: the current day total above (bold, accent gradient, 1 decimal only when not whole);
  a vertical rounded tube 16 × 64 filling bottom-up toward the goal (minimum visible fill = the tube's
  width, so even zero shows a dot; fill capped at 100 %); the nutrient name (11, semibold); a status
  line (10): "N g left", "N g over" (in accent), "Goal reached" or "No goal" [obs]. (Store screenshots
  show "/125g" style goal captions instead of the status line; the code at the pin shows the status
  [obs]; the screenshots predate it [inf].)
- Goals: protein/carbs/fat from the profile's effective targets; all others from the optional nutrient
  goals (settings area), whose defaults are [obs]:

  | Nutrient | Default goal | Nutrient | Default goal |
  |---|---|---|---|
  | Sugar | 50 g | Iron | 18 mg |
  | Added sugar | 25 g | Magnesium | 400 mg |
  | Fiber | 30 g | Zinc | 11 mg |
  | Saturated fat | 20 g | Vitamin A | 900 mcg |
  | Cholesterol | 300 mg | Vitamin C | 90 mg |
  | Caffeine | 400 mg | Vitamin D | 20 mcg |
  | Sodium | 2300 mg | Vitamin B12 | 3 mcg |
  | Potassium | 3500 mg | Vitamin E | 15 mg |
  | Trans fat | 0 g | Vitamin K | 120 mcg |
  | Calcium | 1000 mg | Folate | 400 mcg |
  | Omega-3 | 2 g | each supplement | 0 g |

  Custom goals are clamped to 0–999,999 [obs]. A goal of 0 shows "No goal".
- Water pillar: current and goal in the water display unit (ml or fl oz), same status rules [obs].
- **Picker** (opened from the nutrition detail sheet, §3.2.4): a list of all 32 nutrients with check
  marks; constraints: 1–4 selected; tapping a selected one removes it unless it is the last; tapping a
  new one when 4 are already chosen **replaces the most recently added** one [obs, both platforms].
  Water appears as a locked, non-selectable row ("shown after selected nutrients") when water tracking
  is on. iOS also lists the chosen order with position numbers and offers Reset to the default
  selection [obs]; Android has neither. Done saves; Cancel discards.
- Stored order is selection order; decoding trims, ignores unknown names, removes duplicates, keeps the
  first 4 and falls back to the default when nothing valid remains [obs].

#### 3.2.4 "View More" and the nutrition detail sheet

- A centred "View More ›" text button (accent at 60 % opacity) under the pillars opens a full-height
  sheet titled with a Done action [obs]. All values are for the **selected day**.
- Sections, in order [obs]:
  1. **Home cards**: one row naming the current Home nutrients (plus "Water" if on) that opens the
     picker (§3.2.3).
  2. **Water** (only when tracking is on): today's amount / goal in the water unit, with a note that
     water is shown after the selected nutrients.
  3. **Macros**: Calories (display unit) / goal, Protein / goal, Carbs / goal, Fat / goal.
  4. **Detailed nutrition**: sugar, added sugar, fiber, saturated fat, monounsaturated fat and
     polyunsaturated fat (these two have no goal), cholesterol, caffeine, sodium, potassium, trans fat,
     calcium, iron, magnesium, zinc, vitamins A, C, D, B12, E, K, folate, omega-3, then the 8
     supplements; each with its goal.
  5. **Amino acids** (only when the opt-in estimate setting is on): per amino acid the day's estimate
     and a body-weight reference, never presented as a goal, plus an explanatory note.
- Row layout: an icon or a letter badge, the label, the value in accent with its unit, then a muted
  "/ goal" [obs]. A detailed nutrient with a total of exactly 0 shows "—" rather than "0.0" [obs].
  Macros use the whole-or-one-decimal format.

### 3.3 Home: diary

#### 3.3.1 Content and grouping

- The diary lists, for the selected day: food entries (area 02 owns their row and edit sheet), water
  entries, completed fasts **that ended on that day**, and the active fast **only when the selected day
  is today** [obs].
- Water and fasting rows are placed in a meal section by their time of day using the user's meal
  schedule: a fast uses its end time, or its start time while active [obs]. Default schedule
  boundaries: breakfast from 05:00, lunch from 12:00, dinner from 18:00, snack from 23:00 until 05:00
  [obs]. Food rows use their own meal type.
- **Sort modes** (persisted, default Standard) [obs, `HomeDiaryMealGroupTest`]:
  - **Standard** ("Breakfast → Lunch → Dinner"): one section per meal type in the fixed order
    Breakfast, Lunch, Dinner, Snack, Other; empty sections are omitted; rows inside a section are
    newest first.
  - **Latest meals first**: all rows newest first; consecutive rows of the same meal type form one
    section, so a meal type can appear several times (e.g. Snack, Dinner, Snack).
- The sort control ("⇅ Sort", accent) appears only in the **first** section header and opens a small
  menu with the two modes, the current one checked [obs].

#### 3.3.2 Meal section header

- Meal icon (muted) and name; then Sort (first section only); then a share icon when the section has
  food rows (sharing is area 02) [obs].
- Below the title, on the leading half only (so it never sits under the floating buttons): the
  section's food calories in accent (display unit) and "NP · NC · NF" with each macro rounded to whole
  grams [obs]. Totals appear only when the section has at least one food row; water and fasting rows
  never add to them [obs].

#### 3.3.3 Row types (water and fasting; food is area 02)

- **Water row**: a 56 square tile with a water-drop emoji, the title "Water", the log time, and the
  amount in the water unit right-aligned in accent [obs].
- **Active fast row**: hourglass tile; "Fast in progress" with "Started <time>"; right side: elapsed
  time in accent and "<goal> goal"; a chevron; under it a thin progress bar (elapsed / goal, capped
  at 1) [obs]. The elapsed time ticks once per second while visible [obs].
- **Completed fast row**: hourglass tile; "<duration> fast"; "<start> – <end>" times; "<goal> goal";
  chevron [obs].
- Duration format: "Nm" under one hour, "Nh" on a whole hour, otherwise "Nh Mm"; minutes are floored
  [obs, `FastingSessionTest`: 16 h 30 min → "16h 30m"].
- Row cards: glass-like rows inside a section with rounded outer corners (22) on the first and last
  row and hairline dividers between rows [obs].

#### 3.3.4 Row gestures

- **Swipe to delete** (water rows, completed fast rows, food rows): drag toward the leading edge; a red
  strip with a trash icon grows behind the row; releasing past 220 (Android) asks for confirmation;
  shorter releases spring back; drag travel is capped at 72 % of the row width [obs]. iOS uses native
  trailing swipe actions with full swipe [obs].
- Every diary delete goes through a confirmation dialog: "Delete Food Log?", "Delete Water Log?",
  "Delete Fasting Log?" with a short consequence message and a destructive Delete [obs].
- **Fasting rows**: tap opens the fasting editor (§3.6.4). On iOS, swiping an **active** fast offers
  End Fast and Cancel Fast; on Android the active row has no swipe [obs].
- Food-row tap, long-press multi-select and favourite swipe are area 02.

#### 3.3.5 Empty state

- When the selected day has no rows of any kind: a section titled "Today's Diary" (today) or "Diary"
  (other days) containing one card "No diary entries" [obs]. There is no illustration or call to
  action [obs].

### 3.4 Home: the "+" entry point

- Bottom-right floating 60 circle in the accent with a white plus, 24 from the edge and 100 above the
  bottom inset; on Android a voice button sits to its left (later phase) [obs]. The diary keeps enough
  bottom padding to scroll its last card clear of both buttons and the tab bar [obs].
- It opens a glass drop-down menu (238 wide) with nested pages: a row with a chevron opens a sub-page
  that ends with a Back row [obs]. Contents, Android order top to bottom [obs]:
  1. Food groups and standalone food methods from the configurable add menu (area 02) — **omitted
     entirely while a fast is active**;
  2. hairline; **Water ›** (only when water tracking is on);
  3. **Start Fast** (fasting on, no active fast) or **Fasting ›** (fasting on, a fast is active).
- Water sub-page: the three preset amounts (each logs immediately with a light haptic and closes the
  menu), "Custom amount" (opens the custom sheet), Back [obs]. iOS shows Custom first and the presets
  largest first [obs]; iOS menus opened from a bottom button render nearest-first, so the on-screen
  order is probably the same [inf].
- Fasting sub-page: End Fast, Cancel Fast, Back [obs]. End and Cancel take effect immediately with no
  confirmation [obs].
- Selection mode (multi-select of food rows, area 02) replaces the floating buttons with a combine bar
  [obs].

### 3.5 Progress

#### 3.5.1 Layout, top to bottom

1. A destination switch: "My Progress" | "Weekly Challenge" (the challenge is a later phase) [obs].
2. **Weekly Recap** card (§3.5.6), shown once the profile has loaded [obs].
3. Range picker (segmented): 1W, 1M, 3M, 6M, 1Y, All [obs]. Default 1W; the choice is not persisted
   across launches [obs].
4. Period navigator (not for All): ‹ label › [obs].
5. Metric switcher (segmented): Weight, Body Fat, Workouts, Steps — conditional (§3.5.2).
6. The selected metric's card (§3.5.3, §3.5.4).
7. The selected metric's history link (§3.5.5).
8. "Include today" switch (§3.5.7).
9. Calories card, Macro averages card, Nutrient averages card (§3.5.7).

Everything sits in glass cards with 18 between them and 16 side padding [obs]. The store screenshots
show the older layout (range picker at top, no recap, no destination switch) [obs].

#### 3.5.2 Ranges, periods and metric availability

- Range day counts [obs]: 1W = 7, 1M = 30, 3M = 90, 6M = 180, 1Y = 365, All = 3650.
- A window is inclusive local days `[end − (days − 1), end]`. Offset 0 ends today; each step back moves
  the whole window by `days`, so windows are contiguous [obs, `ProgressRangeTest`]. The offset is
  session-only and resets to 0 whenever the range changes [obs].
- Period label: abbreviated month and day range ("Oct 11 – 17" style), with the year only when either
  end lies outside the current year [obs]. The forward arrow is disabled at offset 0 [obs].
- Arrows (not swipes) page periods because charts own horizontal drags [obs].
- Timestamped readings (weight, body fat) are in range when `startOfDay(first) ≤ t < startOfDay(last
  + 1 day)` (R05.5).
- Metric availability, in this fixed order [obs, `ProgressMetricTest`]:
  - Weight: always.
  - Body Fat: when there is any body-fat entry, or the profile has a current body fat, or a body-fat
    goal.
  - Workouts (later phase): when there is a calculated workout burn of 1–5000 kcal with a valid date,
    or imported workouts.
  - Steps (later phase): when step reading is permitted.
  If the selected metric disappears, the selection falls back to Weight [obs].

#### 3.5.3 Weight card and logging

- Header "Weight" and a "⊕ Log Weight" accent action [obs].
- Empty (no weigh-ins in the window): a centred muted prompt to log the first weight [obs].
- Stat badges, left to right [obs]:
  - **Current**: the latest weigh-in overall (not limited to the window);
  - **Goal**: the profile's goal weight, if set;
  - **Net change**: last − first weigh-in **within the window**, signed ("+1.9 kg", "-1.1 kg"); values
    with magnitude under 0.05 show as 0.0 without a sign;
  - **Average**: the mean of weigh-ins within the window.
  All one decimal, in kg or lb (lb = kg × 2.20462).
- **Chart** (190 tall, faint accent-tinted plot area) [obs]:
  - x = time between the first and last weigh-in in the window (one reading is centred); y = weight,
    padded by `max(15 % of (max − min), 2)` units around the readings **and the goal**.
  - About 5 "nice" y ticks (steps of 1, 2, 5 or 10 × a power of ten) as faint horizontal lines with
    labels on the right; 4 faint dashed vertical guides.
  - A smooth curve (Catmull-Rom) in the accent with a faint accent area wash under it; dots on each
    point only while there are ≤ 31 plotted points.
  - The goal as a dashed horizontal line in a distinct "goal" colour (green in the reference).
  - Dense windows are downsampled into equal date buckets averaged by time and value; bucket limit by
    span: ≤ 45 days → 60, ≤ 100 → 48, ≤ 200 → 36, ≤ 400 → 30, else 24 [obs].
  - X labels: 5 evenly spaced dates (duplicates dropped), or first/middle/last with month and year when
    the span exceeds 150 days and crosses a calendar year [obs].
  - **Inspector**: press and drag horizontally to show a dashed vertical line, a ringed dot and a
    tooltip (date, value with unit) on the nearest point; a light haptic per change; it disappears on
    release [obs]. iOS uses its chart framework with the same y padding rule and a stride-based x axis
    (1, 5, 14, 30 or 60 days by span) [obs].
- **Log Weight dialog** [obs]:
  - A kg | lb toggle — changing it **changes the app-wide weight unit**.
  - A two-wheel picker: whole number and tenths. Ranges: Android 30–250 kg / 60–500 lb; iOS 20–250 kg /
    50–500 lb. When toggling units the current value converts and clamps into the new range.
  - Seed: latest weigh-in → profile weight → 70 kg.
  - A Date row (default today); the picker cannot choose a future day (a picked future day is clamped
    to today).
  - Save stores kg. Timestamp: today → now; an earlier day → that day at the current clock time
    (seconds dropped on Android) [obs, `LogWeightDateTest`].
- After a weigh-in is saved:
  - the profile's current weight becomes the latest weigh-in by date if it differs by more than 0.01
    kg (feeds BMR/TDEE) [obs];
  - **goal reached**: only if the new entry is not older than the previous latest entry, and the goal
    is Lose and the previous latest was above the goal and the new one is at or below it, or the goal
    is Gain and previous was below and new is at or above; never for Maintain; never for the very first
    entry [obs, `backdatedWeighInNeverCountsAsReachingTheGoal`]. It shows a celebration dialog (one
    "keep going" action, a hint to revisit the goal in Settings) and, when notifications and goal
    alerts are on, a notification [obs].
- The first weigh-in is seeded from the onboarding weight if the history is empty (idempotent) [obs].

#### 3.5.4 Body-fat card and logging

- Shown only when Body Fat is available (§3.5.2). Header "Body Fat", "⊕ Log Body Fat" [obs].
- Empty only when there are no entries in the window **and** no current value: prompt to log the first
  reading [obs].
- Stat badges: Current = latest entry overall, else the profile's current value; Goal (if set); Net
  change and Average only when the window has entries; percentages with one decimal, change signed,
  under 0.05 shown as 0.0 [obs].
- Chart only when the window has entries: same as weight, but y padding `max(15 %, 1)` points, lower
  bound floored at 0 %, ticks labelled with "%" (one decimal only when not whole) [obs].
- **Log Body Fat dialog**: one wheel 3–60 %; Android steps by 0.5, iOS by whole percent [obs]. Seed:
  latest → profile → 20 %. No date picker: the reading is stamped now [obs].
- After saving, the profile's current body fat follows the latest reading (it selects the lean-mass
  BMR formula in the goals area). Deleting readings re-syncs to the new latest; deleting the last
  reading leaves the profile value as it was [obs].

#### 3.5.5 Weight History and Body Fat History

- Below the metric card, a glass link card for the selected metric only: list icon, "Weight History"
  (or "Body Fat History") and the entry count with a short hint that the list can be viewed and edited, chevron [obs]. Hidden when there are
  no entries at all.
- Tapping opens a sheet with all entries **newest first**: value (one decimal, kg/lb or %) over a
  medium date, a trash button per row; Done closes it [obs].
- Delete: Android deletes immediately on tap of the trash icon, no confirmation [obs]; iOS asks for
  confirmation naming the date and value, offers swipe-to-delete too, and removes the row from the
  open list at once [obs]. iOS added the visible trash button after users read swipe-only deletion as
  "cannot delete" [obs].
- Deleting syncs the profile to the new latest reading (weight: only if any remain) [obs].
- The reference also records deleted ids so a health-store re-import cannot resurrect them [obs] (only
  relevant once health sync exists).

#### 3.5.6 Weekly Recap card

- Recaps the most recent **completed** week (offset 0 = the week before the one containing today) and
  compares it with the week before it. Arrows browse earlier weeks; forward stops at offset 0; the
  offset is session-only [obs, `WeeklyRecapTest`].
- Week boundaries follow the app's week-start setting, not the locale [obs]. "Today" and the time zone
  are re-read each time the app returns to the foreground, so a week that ended meanwhile rolls over
  and travel regroups late-night entries [obs].
- Per week (seven local days) [obs]:
  - logged days = days with any food entry;
  - calorie-target days = logged days whose calories are within ±10 % of a positive calorie goal;
  - protein-goal days = logged days whose protein, rounded to a whole gram, is ≥ a positive goal;
  - average calories = total ÷ logged days, rounded; none when nothing was logged;
  - workouts = distinct days with a performed workout or a calculated burn (later phase);
    active burn = sum over days of that day's largest positive burn;
  - weigh-ins = readings in the week; weight change = last − first when there are ≥ 2;
  - longest logging streak = longest run of consecutive logged days.
- Six tiles in a 3-column grid (2 columns when the text scale is ≥ 1.2): Days logged "n/7", Calorie
  target days "n/7", Protein goal days "n/7", Avg calories (with "target N" caption), Workouts, Active
  burn. Each tile shows its change versus the previous week as "+2", "−1" or "0", in accent when it is
  an improvement [obs]. Energy figures follow the energy unit; the ±10 % test always runs in kcal
  [obs].
- A weight-change row when available, then up to **3 highlights**, in this priority [obs]:
  1. logged every day (7/7) — otherwise a logging streak of ≥ 3 days;
  2. more workout days than last week;
  3. more calorie-target days;
  4. more protein-goal days;
  5. average calories on target (needs ≥ 3 logged days);
  6. more logged days (only when not a full week).
  Only improvements are called out, never regressions [obs].
- A small note explains the comparison. A week with no logged days, workouts or weigh-ins shows only
  a centred empty message [obs].

#### 3.5.7 Include today, calorie history and averages

- **Include today** switch (persisted, default on). Off ends the nutrition window yesterday and shifts
  past periods by one day too, so they stay contiguous; while off and a range other than All is
  selected, its caption shows the shifted window [obs, `nutritionWindowEndsYesterdayWhenTodayIsExcluded`].
  It applies to the calorie chart and the averages only, not to the weight/body-fat window [obs].
- Nutrition stats are computed off the main thread; changing range, period, switch, entries or goals
  cancels the previous computation; while computing with nothing to show a loading card appears, and
  a small spinner overlays stale-but-shown results [obs].
- **Calories card**: title and "Avg: N kcal" (or kJ) where N is the integer mean over days with
  calories > 0 [obs]. Empty: a centred "no food logged" message.
  - Only days with calories > 0 get a bar; days without food are **absent**, not zero [obs].
  - Bars: rounded tops, accent gradient bottom-to-top; a dashed goal line at the calorie goal; y top =
    the highest nice tick at or above `max(maxDay, goal)`; labels on the right [obs].
  - Bar geometry: bars share the width with 4 gaps, each bar at most 60 wide; when even 2-wide bars no
    longer fit with 4 gaps, the gap shrinks (not below 1); beyond that bar and gap scale together
    (2 : 1). The group is centred and always fits, so the newest day stays reachable [obs, R05.15].
  - Tap a bar to pin its tooltip (date, value); tap it again or tap elsewhere to clear; press-drag
    scrubs across bars with a haptic per change and clears on release; only clearly horizontal drags
    (|dx| > 1.5 |dy| on iOS) scrub so vertical page scroll still works [obs].
  - X labels under bar centres, thinned so each label has at least 40 of width; the last day is always
    labelled [obs].
- **Macro averages**: Protein, Carbs, Fat — average per **logged day** (any food entry) in the window,
  shown as "avg g / goal g" with a thin accent bar (minimum visible width 6) [obs].
- **Nutrient averages**: every other Home-choosable nutrient (fiber … HMB) the same way; a nutrient is
  listed unless its average is under 0.05 and its goal is 0; with goal 0 the value shows without
  "/ goal" [obs].

### 3.6 Water

#### 3.6.1 Settings

- **Water tracking**: off by default [obs]. When on, these rows appear:
  - **Daily goal**: default 2000 ml. Wheel: 50–10,000 ml in steps of 50, or 2–338 fl oz in steps of 1;
    the current goal is rounded to the nearest 50 ml / whole fl oz to seed it; stored in ml [obs].
  - **Unit**: ml (default) or fl oz; 1 fl oz = 29.5735295625 ml [obs].
  - **Quick add**: three amounts, default 250 / 500 / 750 ml (§3.6.2).
- Water entries persist regardless of the switch, and existing entries still show in the diary when
  tracking is off [obs].
- Turning tracking off also turns the water reminder off and cancels it [obs].

#### 3.6.2 Quick-add presets

- Exactly 3 amounts, each 1–5000 ml, stored sorted ascending [obs]. Decoding: anything that is not
  exactly 3 valid integers falls back to the defaults [obs, `WaterQuickAddPresetsTest`].
- Editor: three text fields in the current unit; ml accepts digits only (max 5 chars); fl oz accepts
  digits and one decimal place (comma or dot, max 6 chars) [obs]. A field that is empty, zero or above
  5000 ml shows an error naming the maximum and disables Save [obs]. A field the user did not touch
  keeps its exact stored ml instead of round-tripping through fl oz [obs]. Reset restores 250/500/750.
- Examples [obs]: 237 ml shows as "8" fl oz; 250 ml as "8.5"; typing "8" fl oz saves 237 ml; "8,5"
  saves 251 ml; "170" fl oz is rejected.

#### 3.6.3 Logging and display

- From "+" › Water: a preset logs immediately; "Custom amount" opens a sheet with one numeric field
  (same character filter as above) suffixed by the unit and an Add button enabled once the value is
  > 0 [obs]. The amount converts to ml, rounded, minimum 1 [obs]. The custom field has **no upper
  limit** beyond its 5-character length [obs] (R05.10).
- Entries are stamped by the selected-day rule (§3.2.1) — water can be logged onto past days [obs].
- Display: ml as a grouped integer; fl oz as a whole number when within 0.05 of one, else one decimal;
  "<value> <unit>" [obs].
- Progress display: the Water pillar on Home (§3.2.3) and the Water section of the detail sheet; the
  diary rows (§3.3.3). There is no separate water screen and water is not charted on Progress [obs].
- Delete via diary swipe + confirmation (§3.3.4).

#### 3.6.4 Reminder

- "Water reminder" switch in Notifications, shown only while water tracking is on; default off [obs].
- One daily reminder at a stored time, default 14:00; iOS lets the user pick the time, Android has no
  time UI and always uses the stored value [obs]. It fires only when global notifications are on,
  water tracking is on and the reminder is on [obs]. The message invites the user to drink and log.

### 3.7 Fasting

#### 3.7.1 Settings and model

- **Fasting tracking**: off by default [obs]. When on: **default goal** (1–168 hours, default 16 h)
  and, under Notifications, **goal reached** alert (default on) [obs].
- `Fast { id, start, end?: absent while active, goalMinutes }`. Goal minutes are clamped to 60–10,080
  (1 h – 7 days) everywhere a fast is created or edited, and the stored default goal is clamped the
  same way when read and written [obs]. Pickers work in whole hours.
- Derived: active ⇔ no end; goal time = start + goal; duration = (end or now) − start, never negative
  [obs, `FastingSessionTest`].

#### 3.7.2 Starting, ending, cancelling

- **Start**: "+" › Start Fast opens a goal chooser seeded with the default goal (Android: − / + stepper
  1–168; iOS: wheel 1–168) and a Start button. The fast starts **now** [obs].
- **End**: "+" › Fasting › End Fast sets end = now (never before start) [obs].
- **Cancel**: "+" › Fasting › Cancel Fast deletes the active fast entirely; it never appears in history
  [obs].
- A home-screen shortcut for fasting: if tracking is off, a "Fasting Tracking off" dialog tells the
  user to enable it in Settings; if a fast is active, the editor opens; otherwise the start chooser
  [obs].
- Turning fasting tracking off **ends** (not cancels) an active fast, so the in-progress fast is kept
  in history and stops blocking food [obs, iOS test `disablingTrackingPreservesWaterAndCompletesActiveFast`].

#### 3.7.3 Invariants (MUST)

- Starting is refused if any fast is active or if the new fast would overlap any stored fast [obs].
- Two fasts overlap when `startA < endB and startB < endA`, with an active fast's end treated as
  +∞ [obs].
- Every edit is validated against the **current stored list** in one atomic step: the fast must still
  exist; making it active is refused if another one is active; end is clamped to ≥ start; goal is
  clamped; overlap with any other fast is refused [obs].
- A refused edit or end leaves data unchanged and shows "Fast overlaps another session" with a hint to
  adjust the times [obs].

#### 3.7.4 Editor (tap a fasting row)

- Title "Active Fast" or "Edit Fast" [obs].
- Rows: Started (date + time), Ended (date + time, completed fasts only, never before Started), Goal in
  hours with − / + (1–168) [obs].
- Active fast: an **End Fast Now** button that applies the edited start and goal and ends the fast in
  one step [obs; Android atomic, iOS does update-then-end as two writes] and a **Cancel Fast**
  destructive button. Completed fast: a **Delete Fast** destructive button (no extra confirmation)
  [obs].
- Save applies the edits (active stays active); Cancel discards [obs].

#### 3.7.5 Food logging is blocked during a fast

- While a fast is active, every food write is refused at the store level: add, re-log a saved meal,
  copy from another day, combine entries, import a shared meal [obs, both platforms; iOS test
  `activeFastBlocksFoodUntilItEnds`]. The "+" menu hides all food methods; quick actions and the
  shared-meal import show a "Food logging paused" dialog asking the user to end or cancel the fast
  [obs]. Water can still be logged [obs].
- Food entries never alter or end a fast, and a fast never alters food data [obs].

#### 3.7.6 Timer, persistence and goal alert

- The timer is derived from the stored start, so it survives restarts, reboots and time away; the
  active row refreshes every second while visible [obs].
- **Goal alert**: one notification at start + goal, scheduled only if that time is still in the
  future and only when global notifications, fasting tracking and the goal alert are all on [obs]. It
  is cancelled when the fast ends, is cancelled or deleted; rescheduled after an edit, on app start and
  after a device reboot or app update [obs]. Its text names the goal length and tells the user they may end the fast when ready; the fast stays active [obs].

### 3.8 Body measurements (adjacent; reached from Settings)

- Optional tape-measure history for neck, waist, hips, chest, upper arm, thigh, calf and wrist, stored
  in cm, shown in cm or inches by the height unit (1 in = 2.54 cm); editor range 10–250 cm / 4–100 in;
  a site can be cleared [obs].
- Snapshots are per calendar day: a change made on a day that already has a snapshot overwrites
  that day's values, while a change on a day without one creates a fresh snapshot that copies the
  untouched sites from the latest earlier one; a snapshot whose sites are all empty is not kept [obs].
- Derived metrics: waist ÷ hips; waist ÷ height; U.S. Navy body-fat estimate (men:
  `495 / (1.0324 − 0.19077·log10(waist − neck) + 0.15456·log10(height)) − 450`; women:
  `495 / (1.29579 − 0.35004·log10(waist + hips − neck) + 0.22100·log10(height)) − 450`, cm, rejected
  outside 2–65 %); wrist frame from height ÷ wrist (men: > 10.4 small, ≥ 9.6 medium, else large; women:
  > 11.0 small, ≥ 10.1 medium, else large) [obs]. Measurements never change the profile; they are
  extra context for goals and Coach [obs]. Ownership: settings/goals area (§7 Q11).

## 4. File map (what to read in the Read step)

| Sub-area | Reference path | Lines | Read what | Docs / tests to read with it |
|---|---|---|---|---|
| Routes, hidden tabs | `A/ui/navigation/FudAIRoutes.kt`, `A/models/TabBarSettings.kt` | 38, 26 | all | `T/ui/navigation/FudAIRoutesTest.kt`, `IT/TabBarSettingsTests.swift` |
| Nav host, tab rules, launch-fill epoch | `A/ui/navigation/FudAINavHost.kt` | 392 | `selectTab`, hidden-tab effects, lifecycle epoch | — |
| Floating tab bar | `A/ui/navigation/BottomNavBar.kt` | 419 | all (drag pill) | — |
| Theme | `A/ui/theme/{Color,Theme,Type}.kt`, `I/Views/Theme.swift` | 86, 54, 27, 210 | accent pairs, scheme roles | — |
| Glass components | `A/ui/components/FudGlass.kt`, `UnitToggle.kt`, `WheelPicker.kt`, `OptionPickerSheet.kt` | 339, 104, 439, 186 | surface, dialog, split-decimal wheel | — |
| Home screen | `A/ui/home/HomeScreen.kt` | 3229 | lines 226–1232 (screen, + menu, dialogs), 1235–1527 (fasting rows/dialogs), 1666–1850 (dome), 1868–2150 (headers, grouping), 2204–2470 (swipes, water row) | `T/ui/home/HomeDiaryMealGroupTest.kt` |
| Home state | `A/ui/home/HomeViewModel.kt` | 1255 | state, water/fast actions, `timestampForSelectedDay` | `T/ui/home/FoodSubmissionGateTest.kt` |
| Week strip, pillars | `A/ui/components/WeekStrip.kt`, `MacroCard.kt` | 238, 158 | all | — |
| Detail sheet + picker | `A/ui/home/NutritionDetailSheet.kt` | 623 | all | — |
| Water | `A/ui/home/WaterViews.kt`, `A/models/{WaterUnit,WaterEntry,WaterQuickAddPresets}.kt`, `A/data/WaterRepository.kt` | 99, 38, 14, 50, 36 | all | `T/models/WaterQuickAddPresetsTest.kt`, `IT/WaterQuickAddPresetsTests.swift` |
| Fasting | `A/models/FastingSession.kt`, `A/data/FastingRepository.kt`, `I/Stores/FastingStore.swift`, `I/Views/FastingViews.swift` | 43, 91, 131, 320 | all | `T/models/FastingSessionTest.kt`, `IT/FastingStoreTests.swift` |
| Nutrient catalogue | `A/models/NutrientGoals.kt` | 278 | Home nutrient list, defaults | `T/models/OptionalNutrientGoalsTest.kt` |
| Meal schedule | `A/models/MealSchedule.kt` | ~50 | `mealTypeAt` | `T/models/MealScheduleTest.kt` |
| Progress screen | `A/ui/progress/ProgressScreen.kt` | 2901 | 167–657 (ranges, layout), 760–1400 (navigator, toggle, weight chart, ticks, downsample), 1497–1970 (calorie chart, geometry, stats), 1974–2270 (histories, log weight), 2296–2620 (body fat) | `T/ui/progress/{ProgressRangeTest,LogWeightDateTest,ProgressMetricTest}.kt`, `IT/ProgressRangeTests.swift` |
| Progress state, metrics | `A/ui/progress/{ProgressViewModel,ProgressMetric,ProgressDestinationSelector}.kt` | 114, 20, 114 | all | — |
| Weekly recap | `A/ui/progress/{WeeklyRecap,WeeklyRecapCard}.kt`, `I/Models/WeeklyRecap.swift` | 277, 329, 298 | all | `T/ui/progress/WeeklyRecapTest.kt`, `IT/WeeklyRecapTests.swift` |
| Weight / body fat stores | `A/data/{WeightRepository,BodyFatRepository}.kt`, `I/Stores/{WeightStore,BodyFatStore}.swift` | 236, 181, 328, 106 | add/delete/profile sync/goal crossing; skip health import | `IT/WeightHistoryTests.swift` |
| Body measurements | `A/data/BodyMeasurementRepository.kt`, `A/models/BodyMeasurement.kt` | 69, 166 | all | — |
| Corrupt-store guard | `A/data/PersistedJsonGuard.kt`, `A/data/PreferencesStore.kt` | — | decode outcomes; `updateJsonList` | `T/data/PersistedJsonGuardTest.kt` |
| Notifications | `A/services/NotificationService.kt` | — | `scheduleFastingGoal`, water reminder, boot receiver | — |
| iOS Home components | `I/Views/HomeComponents.swift` | 778 | week strip, gauge, pillars, nutrient picker | — |
| iOS Progress components | `I/Views/ProgressComponents.swift`, `I/Views/ProgressMetricViews.swift` | 2131, 583 | `TimeRange`, chart domains, log sheets, history views | — |

Giant files:
- `I/ContentView.swift` [7,966]: tab view at lines 115–400 (`standardTabView`, hidden-tab fallback);
  HomeView from line 1039 (state at 1200–1300, day swipe ~1270–1295, fasting helpers ~1415–1440, "+"
  menu `homeActionBar` ~1490–1560, list body ~1657–1900, fasting sheets ~2203–2225);
  NutritionDetailView from 3179; ProgressTabView 4080–4460; water/fasting toggles in the settings view
  around 5520–5625. Search for `struct HomeView`, `homeActionBar`, `daySwipeGesture`,
  `struct ProgressTabView`, `Fasting Tracking`.
- `A/ui/home/HomeScreen.kt` [3,229] and `A/ui/progress/ProgressScreen.kt` [2,901]: see the line ranges
  above; skip camera, barcode, analysis and copy-from-day code (area 02).

## 5. Minimum viable subset

v1 (PWA) needs, mapped directly:
- **Shell**: tabs Home, Progress, Coach, Settings (Workouts hidden until its phase); fixed order;
  show/hide for Progress and Coach; Home and Settings always shown; hidden-tab fallback to Home;
  re-tap Settings returns to its hub; tab bar hidden during food analysis. Floating capsule bar with a
  sliding selected pill (drag-to-switch is nice-to-have).
- **Theme**: System / Light / Dark via `prefers-color-scheme` plus an explicit override on the root
  element; accent presets as CSS custom properties (base + tint); apply live. Platewise defines its own
  palette and preset list. App-icon recolouring is out (static manifest icons).
- **Home**: week strip (53 weeks, configurable start day), day swipe, calorie dome with status line and
  launch-fill animation, 1–4 nutrient pillars + water pillar, the nutrition detail sheet with the
  picker, unified diary with both sort modes, section totals, empty state, "+" menu with water and
  fasting pages, delete confirmations. Omit: burn line, steps line, voice button (later phases).
- **Progress**: weekly recap (food and weight parts; see §7 Q3 for workout tiles), ranges and periods,
  metric switcher with Weight and Body Fat only, charts with inspector, stat badges, history sheets
  with visible delete + confirmation, Log Weight with date, Log Body Fat, include-today switch, calorie
  chart, macro and nutrient averages. Omit the destination switch (Weekly Challenge is later), Workouts
  and Steps metrics.
- **Water**: everything in §3.6 except the platform reminder (below).
- **Fasting**: everything in §3.7, including the food-logging block (pending §7 Q1).
- **Storage**: IndexedDB object stores for water entries, fasts, weight entries, body-fat entries
  (one record per entry, keyed by id) and a settings store; every multi-step invariant (fast overlap,
  food-blocked-by-fast, profile sync to latest) runs inside one `readwrite` transaction spanning the
  stores it reads.

Needs a web equivalent:
- **Haptics** → `navigator.vibrate` where supported (not in iOS Safari); silently skip otherwise.
- **Wheel pickers** → CSS scroll-snap wheels, or `<input type="number">` with steppers; dates and times
  → `<input type="date">` / `<input type="datetime-local">` with `max` set to today/now where the
  reference forbids the future.
- **Fasting goal alert and water reminder** → web notifications. A PWA cannot reliably schedule a
  local notification for a future time while closed (no trigger API in browsers today). v1 options:
  fire in-page or from the service worker while the app is open/backgrounded and alive, and show the
  missed alert on next open; true background delivery needs Web Push from a server (none in v1). See
  §7 Q2.
- **"App returned to foreground"** (launch fill, recap rollover, today refresh) → `visibilitychange`
  to `visible` after `hidden`, plus `pageshow`.
- **Splash hold** → render a skeleton until the profile record has been read from IndexedDB.

Out of v1: health-store sync (steps, burn line, imported workouts, deletion tombstones), workouts
metric and recap workout data (pending Q3), weekly challenge, voice, widgets and watch water logging,
home-screen quick actions beyond what the manifest `shortcuts` field offers (a fasting shortcut could
map to a manifest shortcut URL), body measurements unless the settings/goals area claims them.

## 6. Hard parts / traps

1. **R05.1 Active fast blocks food — at the store, not just the menu.** Both platforms refuse every food
   write while a fast is active (add, re-log, copy-from-day, combine, shared-meal import), and the
   UI hides food methods. If the rebuild only hides menu items, quick actions, imports, Coach tools or
   copy-from-day will still log food mid-fast. The rebuild MUST check for an active fast inside the
   same IndexedDB transaction that writes the food (Android reads the fast list just before its write,
   which leaves a small race). [obs, `IT/FastingStoreTests.activeFastBlocksFoodUntilItEnds`]
2. **R05.2 A stranded active fast locks the diary.** With tracking off the fasting menu disappears, so
   an active fast could never be ended and food would stay blocked. The reference ends the fast when
   the switch goes off. The rebuild MUST do the same, and MUST also handle an active fast arriving with
   tracking off (backup restore, import): either end it on load or keep a way to end it visible.
   [obs, `disablingTrackingPreservesWaterAndCompletesActiveFast`; the restore case is [inf]]
3. **R05.3 Fast invariants are all-or-nothing.** One active fast, no overlap (half-open intervals,
   active = open-ended), end ≥ start, goal 60–10,080 min. "End now with edits" must apply the edit and
   the end atomically; iOS does two writes (update, then end) and can leave a half-applied edit if the
   second step fails. Validate against the stored list inside the transaction and report a refusal as
   the overlap dialog. [obs, comments in the Android fasting store; `overlappingSessionsAreRejected`]
4. **R05.4 Water and fasting must never leak into nutrition.** Section totals, day totals, meal share,
   favourites, Progress averages and the recap must read food entries only. Mixing row types in one
   list makes this easy to get wrong. [obs, `HomeDiaryMealGroupTest`]
5. **R05.5 Today's readings vanish at a range edge.** Filtering timestamps with a closed range whose
   upper bound is the *start* of the last day drops everything logged later that day (an iOS bug fixed
   with a "contains day" check). Use `[startOfDay(first), startOfDay(last + 1))` in the device zone.
   [obs, `IT/WeightHistoryTests.progressRangesIncludeReadingsLoggedToday`, `dayRangeContainsWholeLastDay`]
6. **R05.6 A corrupt list must not become empty and then be saved.** The reference once read an
   unreadable diary as `[]`, appended one entry and wrote `[entry]` over the user's history. Both
   platforms now separate "missing" from "corrupt", skip unreadable rows, preserve the raw text before
   any overwrite, and (iOS) block writes until preserved. With IndexedDB per-record stores the risk
   moves to imports and to any JSON blob setting (presets, hidden tabs, nutrient selection): decode
   tolerantly and never write back a fallback over unreadable data. [obs, the Android corrupt-list guard and its test; the iOS blob guard]
7. **R05.7 Backdated weigh-ins must not celebrate.** Goal-reached fires only when the new entry is not
   older than the previous latest and the value crosses the goal in the goal's direction; never for
   Maintain or the first entry. "Latest" means latest by date, not last inserted — the same rule drives
   the profile weight and body fat. [obs, `LogWeightDateTest.backdatedWeighInNeverCountsAsReachingTheGoal`]
8. **R05.8 Profile sync side-effects.** Every weight add/delete updates the profile weight (BMR/TDEE),
   every body-fat add/delete updates the profile body fat (BMR formula choice). Deleting the last body
   fat reading must not clear the profile value; deleting all weights leaves the profile weight. Run
   the sync in the same transaction as the write, or goals and Settings disagree. [obs]
9. **R05.9 Tracker switches hide UI, not history.** Turning water or fasting off must keep showing their
   past rows in the diary and keep them in backups. [obs, comment in the Android Home screen; iOS fasting test]
10. **R05.10 Unit round-trips.** (a) Water presets: an untouched fl oz field must keep its exact ml,
    otherwise 250 ml becomes 251 after one save. (b) The custom water field has no upper bound beyond
    5 digits (99,999 ml); cap it at the preset maximum (5000 ml) or decide otherwise (§7 Q10). (c) The
    Android weight wheel derives tenths by truncation, so 160.0 lb converted to kg and back can show
    159.9; round to the nearest tenth (iOS adds 0.5 first). Store kg at full precision. [obs]
11. **R05.11 The Log Weight unit toggle is global.** Flipping kg/lb inside the dialog changes the
    app-wide weight unit; the defaults also differ (Android falls back to kg, iOS to lb). Decide the
    Platewise default (locale-based is natural) and keep the toggle global or make it local, but not
    both. [obs]
12. **R05.12 Fallback goals flash before the profile loads.** Home's code falls back to 2000 kcal /
    150 / 220 / 70 g; Android holds the splash until the profile is read to hide them. The PWA must
    show a skeleton until the IndexedDB profile read resolves. [obs, Android launch code]
13. **R05.13 Hidden tabs flash or strand the user.** Read the hidden-tab setting before drawing the
    bar; on change (including a restored backup) leave a now-hidden tab for Home; ignore unknown names;
    never allow Home or Settings to be hidden; update one tab by read-modify-write. [obs, the route tests]
14. **R05.14 "Today" goes stale.** The week strip computes today once; recap and steps re-read today on
    return to foreground. A PWA left open past midnight would keep yesterday as "today" (wrong ring,
    wrong day-swipe limit, wrong timestamps). Recompute today on `visibilitychange` and on a timer at
    local midnight. [obs strip; recap re-read obs]
15. **R05.15 Dense calorie charts lose the newest days.** A fixed 2 + 4 bar slot on 365 days needs
    ~2,186 px, so bars ran off the plot and the inspector stopped around day 150. Use the adaptive
    geometry (shrink gap, then scale) so the group always fits. [obs,
    `ProgressRangeTest.denselyLoggedLongPeriodsFitTheWholePlotSoTheLatestDayIsReachable`]
16. **R05.16 Chart gestures fight page scroll and lag.** Only clearly horizontal drags (|dx| > 1.5|dy|)
    may scrub; a tap pins and a second tap clears. Making every pointer move a state change of the
    whole chart caused severe input lag on 6M/1Y/All — keep the pointer position local and update only
    when the nearest point changes; downsample long series (60/48/36/30/24 bucket limits). [obs,
    `onlyClearlyHorizontalDragsScrubTheCalorieChart`, comment in the Android weight chart]
17. **R05.17 Averages divide by the right denominator.** Macro and nutrient averages divide by days with
    any food entry; the calorie "Avg" divides by days with calories > 0 (integer division); days with no
    food are absent from the bar chart, not zero bars; "Include today" shifts the window and past
    periods by one day. Getting any of these wrong silently changes the numbers users compare. [obs,
    `excludingTodayKeepsAPartialDayOutOfTheAverages`]
18. **R05.18 Launch-fill replays too often.** The fill-from-zero animation must play on cold start and
    after a real background → foreground return, not on tab switches, sheet dismissals, permission
    prompts or data edits. Keep an "open epoch" above the router and remember the last epoch each
    gauge played. [obs]
19. **R05.19 Weekly recap edge rules.** Weeks start per the app setting, not the locale; the current
    week is never recapped before it ends; a time-zone change regroups late-night entries; protein is
    rounded before comparing; ±10 % uses kcal even in kJ mode; at most 3 highlights in fixed priority;
    the average highlight needs ≥ 3 logged days. [obs, `WeeklyRecapTest` (17 cases)]
20. **R05.20 Fast goal alert lifecycle.** Schedule only for a future goal time; cancel on end, cancel
    and delete; reschedule on edit, on launch and after reboot; gate on three switches. Forgetting the
    cancel produces a "goal reached" alert for a fast the user already ended. [obs, the Android notification service]
21. **R05.21 Fasting rows belong to the day they end.** A fast that crosses midnight appears on its end
    day; an active fast appears only on today. Showing it on its start day duplicates or loses it when
    browsing. [obs]
22. **R05.22 Delete affordance.** Android deletes weight/body-fat history rows instantly on a small
    trash tap; iOS confirms, and added the visible trash button because swipe-only deletion read as
    "cannot delete" (issue #518). Rebuild: visible trash plus confirmation, and remove the row from the
    open list at once. [obs]

## 7. Open questions

1. Should an active fast hard-block food logging in Platewise (reference: yes, every path), or only
   warn? Needed: product decision.
2. Water reminder and fasting goal alert in a PWA: accept "only while the app is alive + show missed
   alert on next open" for v1, defer, or add Web Push (needs a server)? Needed: product decision; check
   current browser support for scheduled notifications at build time.
3. The weekly recap's Workouts and Active burn tiles (and the "more workouts" highlight) have no data in
   v1. Hide them, or show zeros? Needed: product decision.
4. Progress destination switch: drop it in v1 (Weekly Challenge is later) or show a disabled second
   tab? Needed: product decision (recommend drop).
5. The week strip lets the user select future days of the current week while the day swipe refuses to
   pass today; logging on a future day stamps a future time. Keep, or disable future tiles? Needed:
   product decision.
6. Default units: weight (kg on Android, lb on iOS), water (ml), week start (Monday). Locale-based or
   fixed? Needed: product decision.
7. Picker ranges differ: weight 30–250 kg / 60–500 lb (Android) vs 20–250 kg / 50–500 lb (iOS); body
   fat step 0.5 (Android) vs 1 (iOS). Which to adopt? Needed: product decision (recommend 20–250 /
   50–500 and 0.5).
8. Confirm before deleting a weight/body-fat history row (iOS) or delete at once (Android)? Needed:
   product decision (recommend confirm).
9. How many accent presets does Platewise ship, and does it keep the base+tint gradient concept?
   Needed: design decision (brand work).
10. Cap for the custom water amount (reference: effectively none). Needed: product decision
    (recommend 5000 ml, matching presets).
11. Which area owns body measurements (§3.8): settings/goals or this one? Needed: lead decision.
12. Water reminder time: expose a time picker (iOS) or fix it at 14:00 (Android)? Needed: product
    decision; depends on Q2.

## 8. What to read later

- Reference docs: none specific to this area beyond code comments; the store screenshots
  (`store/screenshots/{play,ios}`) show the shipped dark Home, diary and Progress layouts, which
  predate the recap, the status lines under the pillars and the destination switch.
- Reference tests that list the edge cases: `T/models/FastingSessionTest.kt`,
  `T/models/WaterQuickAddPresetsTest.kt`, `T/models/MealScheduleTest.kt`,
  `T/models/OptionalNutrientGoalsTest.kt`, `T/ui/home/HomeDiaryMealGroupTest.kt`,
  `T/ui/progress/{ProgressRangeTest,LogWeightDateTest,ProgressMetricTest,WeeklyRecapTest}.kt`,
  `T/ui/navigation/FudAIRoutesTest.kt`, `T/data/PersistedJsonGuardTest.kt`,
  `IT/{FastingStoreTests,WaterQuickAddPresetsTests,WeightHistoryTests,ProgressRangeTests,WeeklyRecapTests,TabBarSettingsTests}.swift`.
- REA Evidence (outside the repo): none produced for this area; the marketing-site capture
  `ev_fa243a1fe14ed63cc6252910410ee973c07740c25cc70484db1eab53b44d991a` was not needed.
- Related specs: `02-*.md` (food logging: "+" menu food entries, food rows, edit sheet, combine,
  share, copy-from-day — must honour R05.1); the goals/onboarding spec (effective targets, BMR formula
  choice fed by R05.8); the settings spec (theme, week start, units, notifications, optional nutrient
  goals, tab bar, water and fasting rows); the backup spec (keys in §2, active-fast restore R05.2).
