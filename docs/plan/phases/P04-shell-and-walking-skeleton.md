# P04 · App shell, UI primitives and the walking skeleton

**Weeks:** 2–3 (primitives can start in week 1 on the UI track) · **Tracks:** UI (primitives, shell, Home); data (first cut of the diary service) · **Depends on:** P00; P01 and P02 for the wave-B feature tasks · **Status:** 🔨 in progress: P04-03 landed (1/14, 2026-10-26)

Reference paths are relative to `$PLATEWISE_REF` (`/root/reference/fud-ai`, pinned at `10e14b67`). Prefixes: `A/` = `android/app/src/main/java/com/apoorvdarshan/calorietracker/`, `I/` = `ios/calorietracker/`, `T/` = `android/app/src/test/java/com/apoorvdarshan/calorietracker/`, `IT/` = `ios/calorietrackerTests/`. A number in brackets is the file's length in lines; read only the named part of a big file. Read the research spec section first, then the reference, then its tests.

## Goal

The product runs end to end in a real phone-sized browser: the tab bar with Home, Progress, Coach and Settings; a start-up skeleton until the profile and settings are read (no fallback goals or default switches flash); a temporary "start with defaults" path in place of onboarding; Home with the energy gauge, macro pillars and the diary grouped by meal; a manual entry that lands under its meal and survives a reload. The UI primitives every later screen uses exist with accessible names and values as text.

## Slices and waves

Each slice owns its files; no two slices in a wave touch the same path. A builder takes one slice, runs Read → note → Rewrite → Compare for each task, then the loop until green. The lead lands one commit per slice and writes any deviation back into this file.

- **Wave A:** S1 = P04-01, P04-02 (`src/ui/{Button,Card,Sheet,Dialog,Toast,Field,Stepper,Segmented,Switch,ListPicker,Wheel,DateTimeField}*`) · S2 = P04-03 (`src/ui/{Gauge,Pillar,ProgressBar,StatBadge,Menu,SwipeRow}*`, `src/ui/icons/**`) · S3 = P04-04..07 (`src/app/**`) · S4 = P04-08, P04-09 (`src/services/diary.ts`, `src/features/onboarding/QuickStart.tsx`).
- **Wave B:** S5 = P04-10..13 (`src/features/{home,log,progress,coach,settings}/**` files listed below).
- **Wave C:** P04-14 (`e2e/walking-skeleton.spec.ts`, `parity/walking-skeleton.platewise.json`).

## Tasks (14)

| ID | Task | Read in reference | New files | Verify |
|---|---|---|---|---|
| P04-01 | **Primitives: buttons, cards, sheets, dialogs, toasts.** React primitives with CSS modules on the P00 tokens; each interactive element takes a `data-ui` hook and an accessible name. `Button` (primary, secondary, quiet, danger; busy state that blocks repeat clicks), `IconButton` (requires a label), `Card`, `Sheet` (bottom sheet: title row with a trailing Done, focus trap, Escape closes, returns focus, optional `dismissable={false}` for sheets that must not close by swipe or backdrop, e.g. review), `Dialog` (title, message, secondary + primary actions, destructive variant; Escape = cancel), `Toast` (polite live region, auto-dismiss with fake-timer tests). Respect `prefers-reduced-motion`. | `A/ui/components/FudGlass.kt` [339: surface and dialog only, for structure; restyle per 16 §2.5] | `src/ui/Button.tsx`, `src/ui/Button.test.tsx`, `src/ui/Card.tsx`, `src/ui/Card.test.tsx`, `src/ui/Sheet.tsx`, `src/ui/Sheet.test.tsx`, `src/ui/Dialog.tsx`, `src/ui/Dialog.test.tsx`, `src/ui/Toast.tsx`, `src/ui/Toast.test.tsx`, `src/ui/primitives.module.css` | Testing Library: busy Button ignores a second click; Sheet traps Tab and restores focus; non-dismissable Sheet ignores Escape; Dialog destructive action fires once; Toast disappears after its timeout with fake timers; every control found by role and name. |
| P04-02 | **Primitives: inputs and pickers.** `Field` (label, hint, error, inputmode), `Stepper` (− / + with min, max, step, keyboard arrows), `Segmented` (radiogroup), `Switch` (role switch), `ListPicker` (a sheet listing options with a check mark), `Wheel` (scroll-snap wheel with arrow keys and Page keys, a hidden native `<select>` for assistive tech, opens at a given value, values from a list so weights can be whole + tenth wheels), `DateTimeField` (native date and time inputs with `max` support so pickers can forbid the future). Wheels replace the reference's wheel pickers (05 §3.1.4). | `A/ui/components/{WheelPicker,UnitToggle,OptionPickerSheet}.kt` [439, 104, 186: behaviour only] | `src/ui/Field.tsx`, `src/ui/Field.test.tsx`, `src/ui/Stepper.tsx`, `src/ui/Stepper.test.tsx`, `src/ui/Segmented.tsx`, `src/ui/Segmented.test.tsx`, `src/ui/Switch.tsx`, `src/ui/Switch.test.tsx`, `src/ui/ListPicker.tsx`, `src/ui/ListPicker.test.tsx`, `src/ui/Wheel.tsx`, `src/ui/Wheel.test.tsx`, `src/ui/DateTimeField.tsx`, `src/ui/DateTimeField.test.tsx`, `src/ui/inputs.module.css` | Stepper clamps at min/max and steps by 5; Wheel opens at 70.0, ArrowDown moves to the next value, the native select mirrors it; DateTimeField with `max` rejects a future date; Segmented is a radiogroup with arrow-key navigation. |
| P04-03 | **Primitives: gauge, pillar, menu, swipe row, icons.** `Gauge` (the energy gauge: an upper half-circle drawn as a dashed arc in SVG, track in the soft accent, fill sweeping 180° × min(eaten ÷ goal, 1), nothing when the goal is ≤ 0; centre slots for heading, value and status; the value is also text for screen readers), `Pillar` (vertical tube 16 × 64 filling bottom-up, a minimum visible fill equal to its width, capped at 100 %, value and status slots), `ProgressBar`, `StatBadge` (value over label, shrinks rather than wraps), `Menu` (drop-down anchored to a button with nested pages and a Back row, roving focus), `SwipeRow` (drag toward the leading edge reveals a delete strip; release past a threshold calls `onRequestDelete` (no delete without the caller's confirmation), travel capped at 72 % of the width, a visible delete button for keyboard users). `src/ui/icons/`: our own inline SVG icons drawn for Platewise (plus, camera, photos, barcode, text, pencil, clock, drop, hourglass, scale, chart, chat, gear, trash, heart, chevrons, close, check, info, copy, sort). | `A/ui/home/HomeScreen.kt` [3 229: lines 1666–1850 gauge and 2204–2470 swipe rows, geometry only]; `A/ui/components/MacroCard.kt` [158] | `src/ui/Gauge.tsx`, `src/ui/Gauge.test.tsx`, `src/ui/Pillar.tsx`, `src/ui/Pillar.test.tsx`, `src/ui/ProgressBar.tsx`, `src/ui/ProgressBar.test.tsx`, `src/ui/StatBadge.tsx`, `src/ui/StatBadge.test.tsx`, `src/ui/Menu.tsx`, `src/ui/Menu.test.tsx`, `src/ui/SwipeRow.tsx`, `src/ui/SwipeRow.test.tsx`, `src/ui/icons/index.tsx`, `src/ui/icons/index.test.tsx`, `src/ui/display.module.css` | Gauge at 1 200 / 2 000 sweeps 108°; at 2 500 / 2 000 stays full; goal 0 draws no fill; accessible text equals the visible value; Pillar zero shows the minimum fill; Menu nested page and Back via keyboard; SwipeRow release past the threshold calls the handler once, short release springs back, keyboard delete button works; icons render with `aria-hidden` unless labelled. |
| P04-04 | **Hash router and sheet stack.** `src/app/router.ts`: our own small hash router (architecture §4 row 6). Routes `#/home`, `#/progress`, `#/coach`, `#/settings` and `#/settings/<page>[/<sub>]`, plus `#/onboarding`. A sheet stack above the current tab pushes a history entry per sheet so the browser Back closes the top sheet first. Each tab remembers its scroll position and its last nested route (05 §3.1.1). `useRoute()`, `navigate()`, `openSheet()`, `closeSheet()`. | `A/ui/navigation/FudAIRoutes.kt` [38]; `A/ui/navigation/FudAINavHost.kt` [392: `selectTab` only]; `T/ui/navigation/FudAIRoutesTest.kt` [65] | `src/app/router.ts`, `src/app/router.test.ts`, `src/app/useRoute.ts`, `src/app/useRoute.test.ts` | unknown hash → `#/home`; Back with two sheets open closes the top one only; switching Home → Progress → Home restores Home's scroll; `#/settings/units` parses page and sub-page. |
| P04-05 | **Tab bar.** `src/app/TabBar.tsx` (05 §3.1.1–3.1.2): Home, Progress, Coach, Settings in that order (Workouts later); a floating capsule with our styling and a selected pill that slides to the chosen tab; not drawn until the hidden-tab setting is loaded, so a hidden tab never flashes; Progress and Coach can be hidden, Home and Settings never (unknown names ignored); when the tab on screen becomes hidden (setting or restore) the app goes to Home; re-tapping Settings inside Settings returns to its hub, re-tapping another current tab does nothing; hidden while the analysis overlay is showing (an app-state flag); the content area reserves bottom space so the last card clears the bar. Drag-to-switch is P2 (A7). | `A/ui/navigation/BottomNavBar.kt` [419: layout and selection only]; `A/models/TabBarSettings.kt` [26]; `IT/TabBarSettingsTests.swift` [35] | `src/app/TabBar.tsx`, `src/app/TabBar.test.tsx` | with settings not loaded nothing renders; hiding Coach while on Coach routes to Home; stored `["home", "coach"]` hides only Coach; re-tap Settings on a sub-page goes to the hub; overlay flag hides the bar; each tab button has a name and `aria-current`. |
| P04-06 | **Theme provider.** `src/app/ThemeProvider.tsx` reads `display.appearance` and `display.accent` from settings and applies them with P00-03 `applyTheme`; System follows the OS live; changes apply at once everywhere, including already drawn charts and the gauge (they read CSS variables, so no remount). | `I/Views/Theme.swift` [210: behaviour only] | `src/app/ThemeProvider.tsx`, `src/app/ThemeProvider.test.tsx` | changing the accent setting updates `data-accent` without remounting children; System + OS dark → `data-theme=dark`; switching to Light ignores the OS. |
| P04-07 | **Boot gate, today clock and error boundary.** `src/app/Boot.tsx`: renders a neutral skeleton until both the profile read and the settings snapshot resolve (R05.12, R06.22), then routes to onboarding when there is no completed profile, else to the last tab; a database open error (P02-01) shows a recovery card instead of the app. `src/app/TodayProvider.tsx`: provides today's day key and refreshes it at the next local midnight and on `visibilitychange` → visible and `pageshow` (R05.14). `src/app/ErrorBoundary.tsx`: a crash card with Reload. `src/app/appState.ts`: small UI state (analysis overlay visible, selected day placeholder). `App.tsx` composes them. | `A/ui/navigation/FudAINavHost.kt` [392: launch and lifecycle parts]; `A/MainActivity.kt` [246: splash hold only] | `src/app/Boot.tsx`, `src/app/Boot.test.tsx`, `src/app/TodayProvider.tsx`, `src/app/TodayProvider.test.tsx`, `src/app/ErrorBoundary.tsx`, `src/app/ErrorBoundary.test.tsx`, `src/app/appState.ts`, `src/app/appState.test.ts` | no Home numbers render before the profile read resolves (deferred fake repo); no profile → onboarding; at 23:59:59 + 1 s (fake timers) today advances; `visibilitychange` after a date change updates it; a thrown child shows the crash card. |
| P04-08 | **Diary service (first cut).** `src/services/diary.ts`: `logEntry(draft, ctx)` builds a `DiaryEntry` (new id, dayKey, kcal rounded, unrounded values) and writes it through `diaryRepo.add`; a single-flight gate per action ignores repeat calls while one is in flight (R02.11); `FastActiveError` becomes a `{kind: 'fastActive'}` result for the paused dialog (P07); `deleteEntry(id)` removes the entry and releases its photos; `requestPersistenceAfterFirstEntry` hook point (D-16.8) called after the first successful log. P06 extends this file. | `T/ui/home/FoodSubmissionGateTest.kt` [19]; `A/ui/home/HomeViewModel.kt` [1 255: save path in lines 440–700] | `src/services/diary.ts`, `src/services/diary.test.ts` | two rapid `logEntry` calls write one entry; an active fast returns `fastActive` and writes nothing; delete releases unreferenced photos; the first successful log calls the persistence hook once. |
| P04-09 | **Temporary quick start.** `src/features/onboarding/QuickStart.tsx`: a single screen shown by the onboarding route until P05 replaces it (P05-07 deletes this file): "Start with defaults" saves the default profile (P01-15) with units from the browser locale (P01-04), marks onboarding done, seeds the first weigh-in, and goes to Home. All copy in the `onboarding` partition. | none | `src/features/onboarding/QuickStart.tsx`, `src/features/onboarding/QuickStart.test.tsx`, `src/i18n/en/onboarding.ts` | clicking the button stores the default profile, one weigh-in and `onboarding.done`, then shows Home. |
| P04-10 | **Home page skeleton.** `src/features/home/HomePage.tsx` for today only (the week bar and day swipe come in P07): `DaySummary` with the Gauge (heading "Calories" or "Kilojoules", eaten in the display unit with grouping, and the status: no goal / N left / N over / goal reached, compared in kcal and shown in the display unit) and four macro pillars (protein, carbs, fat, fibre) against effective targets; `Diary` grouped by meal (P01-08, by-meal mode) with food-only section totals; the empty state "No entries yet"-style card; the floating "+" button opening a `Menu` that offers only Enter manually for now. | `A/ui/home/HomeScreen.kt` [3 229: lines 226–600 layout and 1868–2150 headers and grouping]; spec 05 §3.2–3.4 | `src/features/home/HomePage.tsx`, `src/features/home/HomePage.test.tsx`, `src/features/home/DaySummary.tsx`, `src/features/home/DaySummary.test.tsx`, `src/features/home/Diary.tsx`, `src/features/home/Diary.test.tsx`, `src/features/home/home.module.css`, `src/i18n/en/home.ts` | with a 2 000 kcal goal and 1 200 eaten the status reads 800 left; at 2 100 it reads 100 over; in kJ the heading and numbers switch while the comparison stays in kcal; empty day shows the empty card; a 300 kcal breakfast shows section total 300. |
| P04-11 | **Manual entry sheet.** `src/features/log/ManualSheet.tsx` (02 §3.8): name (required, trimmed), energy in the person's unit (required whole number), protein, carbs and fat (optional decimals, blank → 0), fibre (optional; blank or negative → unknown), meal (default from the meal times for the entry's time), Save and Cancel; the sheet cannot be dismissed by swipe or backdrop. Logs directly at the viewed day's stamp, source manual, energy converted to kcal, no serving data, no photo, through `logEntry`. Save is disabled while in flight. | `I/Views/ManualEntryView.swift` [165]; `A/ui/home/HomeScreen.kt` [3 229: lines 3054–3229 manual part]; `T/ui/home/ManualEntryInputTest.kt` [24] | `src/features/log/ManualSheet.tsx`, `src/features/log/ManualSheet.test.tsx`, `src/i18n/en/log.ts` | blank name blocks Save; 2 093 kJ saves 500 kcal; blank protein saves 0; fibre −1 saves unknown; meal defaults to lunch at 12:30; double tap saves once. |
| P04-12 | **Entry row with delete.** `src/features/home/EntryRow.tsx`: thumbnail or emoji (fallback icon), name, kcal in the display unit, P/C/F, time; inside a `SwipeRow`; delete asks with a dialog ("Delete this entry?" in our words) before calling `deleteEntry`. Tap does nothing yet (the editor arrives in P06). | `A/ui/home/HomeScreen.kt` [3 229: lines 2204–2470 rows only] | `src/features/home/EntryRow.tsx`, `src/features/home/EntryRow.test.tsx` | swipe past the threshold opens the dialog; Cancel keeps the row; Delete removes it; the row announces name and energy. |
| P04-13 | **Tab placeholders and settings hub registry.** `src/features/progress/ProgressPage.tsx` and `src/features/coach/CoachPage.tsx` show titled placeholders. `src/features/settings/SettingsHub.tsx` lists category rows from `src/features/settings/registry.ts` (id, title key, icon, route, `group: 'prefs' \| 'info'`); each later phase registers its pages in the registry (one task per phase owns that edit). A back link labelled Settings on every category page. | `A/ui/settings/SettingsScreen.kt` [5 141: lines 2185–2365 hub only]; `T/ui/settings/SettingsCategoryTest.kt` [41] | `src/features/progress/ProgressPage.tsx`, `src/features/coach/CoachPage.tsx`, `src/features/settings/SettingsHub.tsx`, `src/features/settings/SettingsHub.test.tsx`, `src/features/settings/registry.ts`, `src/features/settings/registry.test.ts`, `src/i18n/en/settings.ts` | the hub renders registered rows in order and navigates to their route; the back link returns to the hub. |
| P04-14 | **Walking-skeleton e2e and parity scenario.** `e2e/walking-skeleton.spec.ts` (Pixel 7 viewport): fresh load → quick start → Home shows 0 eaten → "+" → Enter manually → "Toast", 250 kcal → the entry appears under its meal and the gauge shows 250 → reload → it is still there → swipe-delete with confirmation → empty state. `parity/walking-skeleton.platewise.json`: the same flow as an REA `capture-browser-scenario` input with `data-ui` hooks and a `timeout_ms` on every step (02-rea-workflow §4). | none (our own flow) | `e2e/walking-skeleton.spec.ts`, `parity/walking-skeleton.platewise.json` | the Playwright spec passes three times in a row; the scenario JSON validates against the REA input shape used in 02-rea-workflow §4 (run once through REA by the lead). |

## Files to create (84)

| Path (under `platewise/`) | What it holds | Task |
|---|---|---|
| `src/ui/Button.tsx` | Buttons and icon buttons | P04-01 |
| `src/ui/Button.test.tsx` | Tests for `Button.tsx`: the Verify cases of P04-01 | P04-01 |
| `src/ui/Card.tsx` | Card surface | P04-01 |
| `src/ui/Card.test.tsx` | Tests for `Card.tsx`: the Verify cases of P04-01 | P04-01 |
| `src/ui/Sheet.tsx` | Bottom sheet with focus trap | P04-01 |
| `src/ui/Sheet.test.tsx` | Tests for `Sheet.tsx`: the Verify cases of P04-01 | P04-01 |
| `src/ui/Dialog.tsx` | Confirm and destructive dialogs | P04-01 |
| `src/ui/Dialog.test.tsx` | Tests for `Dialog.tsx`: the Verify cases of P04-01 | P04-01 |
| `src/ui/Toast.tsx` | Toasts in a live region | P04-01 |
| `src/ui/Toast.test.tsx` | Tests for `Toast.tsx`: the Verify cases of P04-01 | P04-01 |
| `src/ui/primitives.module.css` | Styles for the primitives above | P04-01 |
| `src/ui/Field.tsx` | Text and number fields | P04-02 |
| `src/ui/Field.test.tsx` | Tests for `Field.tsx`: the Verify cases of P04-02 | P04-02 |
| `src/ui/Stepper.tsx` | Minus/plus stepper | P04-02 |
| `src/ui/Stepper.test.tsx` | Tests for `Stepper.tsx`: the Verify cases of P04-02 | P04-02 |
| `src/ui/Segmented.tsx` | Segmented control | P04-02 |
| `src/ui/Segmented.test.tsx` | Tests for `Segmented.tsx`: the Verify cases of P04-02 | P04-02 |
| `src/ui/Switch.tsx` | Switch | P04-02 |
| `src/ui/Switch.test.tsx` | Tests for `Switch.tsx`: the Verify cases of P04-02 | P04-02 |
| `src/ui/ListPicker.tsx` | Option list in a sheet | P04-02 |
| `src/ui/ListPicker.test.tsx` | Tests for `ListPicker.tsx`: the Verify cases of P04-02 | P04-02 |
| `src/ui/Wheel.tsx` | Scroll-snap wheel | P04-02 |
| `src/ui/Wheel.test.tsx` | Tests for `Wheel.tsx`: the Verify cases of P04-02 | P04-02 |
| `src/ui/DateTimeField.tsx` | Date and time inputs with max | P04-02 |
| `src/ui/DateTimeField.test.tsx` | Tests for `DateTimeField.tsx`: the Verify cases of P04-02 | P04-02 |
| `src/ui/inputs.module.css` | Styles for the inputs | P04-02 |
| `src/ui/Gauge.tsx` | Half-arc energy gauge | P04-03 |
| `src/ui/Gauge.test.tsx` | Tests for `Gauge.tsx`: the Verify cases of P04-03 | P04-03 |
| `src/ui/Pillar.tsx` | Vertical nutrient tube | P04-03 |
| `src/ui/Pillar.test.tsx` | Tests for `Pillar.tsx`: the Verify cases of P04-03 | P04-03 |
| `src/ui/ProgressBar.tsx` | Thin progress bar | P04-03 |
| `src/ui/ProgressBar.test.tsx` | Tests for `ProgressBar.tsx`: the Verify cases of P04-03 | P04-03 |
| `src/ui/StatBadge.tsx` | Stat tile | P04-03 |
| `src/ui/StatBadge.test.tsx` | Tests for `StatBadge.tsx`: the Verify cases of P04-03 | P04-03 |
| `src/ui/Menu.tsx` | Drop-down menu with nested pages | P04-03 |
| `src/ui/Menu.test.tsx` | Tests for `Menu.tsx`: the Verify cases of P04-03 | P04-03 |
| `src/ui/SwipeRow.tsx` | Swipe-to-delete row | P04-03 |
| `src/ui/SwipeRow.test.tsx` | Tests for `SwipeRow.tsx`: the Verify cases of P04-03 | P04-03 |
| `src/ui/icons/index.tsx` | Our icon set | P04-03 |
| `src/ui/icons/index.test.tsx` | Tests for `index.tsx`: the Verify cases of P04-03 | P04-03 |
| `src/ui/display.module.css` | Styles for gauge, pillar, menu, swipe | P04-03 |
| `src/app/router.ts` | Hash routes, tab memory, sheet stack | P04-04 |
| `src/app/router.test.ts` | Tests for `router.ts`: the Verify cases of P04-04 | P04-04 |
| `src/app/useRoute.ts` | React bindings for the router | P04-04 |
| `src/app/useRoute.test.ts` | Tests for `useRoute.ts`: the Verify cases of P04-04 | P04-04 |
| `src/app/TabBar.tsx` | Floating tab bar with hidden-tab rules | P04-05 |
| `src/app/TabBar.test.tsx` | Tests for `TabBar.tsx`: the Verify cases of P04-05 | P04-05 |
| `src/app/ThemeProvider.tsx` | Applies appearance and accent from settings | P04-06 |
| `src/app/ThemeProvider.test.tsx` | Tests for `ThemeProvider.tsx`: the Verify cases of P04-06 | P04-06 |
| `src/app/Boot.tsx` | Start-up gate and routing to onboarding | P04-07 |
| `src/app/Boot.test.tsx` | Tests for `Boot.tsx`: the Verify cases of P04-07 | P04-07 |
| `src/app/TodayProvider.tsx` | Today's day key with midnight refresh | P04-07 |
| `src/app/TodayProvider.test.tsx` | Tests for `TodayProvider.tsx`: the Verify cases of P04-07 | P04-07 |
| `src/app/ErrorBoundary.tsx` | Crash card | P04-07 |
| `src/app/ErrorBoundary.test.tsx` | Tests for `ErrorBoundary.tsx`: the Verify cases of P04-07 | P04-07 |
| `src/app/appState.ts` | Small UI state store | P04-07 |
| `src/app/appState.test.ts` | Tests for `appState.ts`: the Verify cases of P04-07 | P04-07 |
| `src/services/diary.ts` | Log, delete, single-flight gate | P04-08 |
| `src/services/diary.test.ts` | Tests for `diary.ts`: the Verify cases of P04-08 | P04-08 |
| `src/features/onboarding/QuickStart.tsx` | Temporary start-with-defaults screen | P04-09 |
| `src/features/onboarding/QuickStart.test.tsx` | Tests for `QuickStart.tsx`: the Verify cases of P04-09 | P04-09 |
| `src/i18n/en/onboarding.ts` | Onboarding copy partition (grows in P05) | P04-09 |
| `src/features/home/HomePage.tsx` | Home layout | P04-10 |
| `src/features/home/HomePage.test.tsx` | Tests for `HomePage.tsx`: the Verify cases of P04-10 | P04-10 |
| `src/features/home/DaySummary.tsx` | Gauge and pillars | P04-10 |
| `src/features/home/DaySummary.test.tsx` | Tests for `DaySummary.tsx`: the Verify cases of P04-10 | P04-10 |
| `src/features/home/Diary.tsx` | Meal sections and totals | P04-10 |
| `src/features/home/Diary.test.tsx` | Tests for `Diary.tsx`: the Verify cases of P04-10 | P04-10 |
| `src/features/home/home.module.css` | Home styles | P04-10 |
| `src/i18n/en/home.ts` | Home copy partition | P04-10 |
| `src/features/log/ManualSheet.tsx` | Manual entry form | P04-11 |
| `src/features/log/ManualSheet.test.tsx` | Tests for `ManualSheet.tsx`: the Verify cases of P04-11 | P04-11 |
| `src/i18n/en/log.ts` | Logging copy partition (grows in P06) | P04-11 |
| `src/features/home/EntryRow.tsx` | Diary food row | P04-12 |
| `src/features/home/EntryRow.test.tsx` | Tests for `EntryRow.tsx`: the Verify cases of P04-12 | P04-12 |
| `src/features/progress/ProgressPage.tsx` | Progress tab (placeholder until P07) | P04-13 |
| `src/features/coach/CoachPage.tsx` | Coach tab (placeholder until P08) | P04-13 |
| `src/features/settings/SettingsHub.tsx` | Settings hub | P04-13 |
| `src/features/settings/SettingsHub.test.tsx` | Tests for `SettingsHub.tsx`: the Verify cases of P04-13 | P04-13 |
| `src/features/settings/registry.ts` | Category registry | P04-13 |
| `src/features/settings/registry.test.ts` | Tests for `registry.ts`: the Verify cases of P04-13 | P04-13 |
| `src/i18n/en/settings.ts` | Settings copy partition | P04-13 |
| `e2e/walking-skeleton.spec.ts` | The skeleton flow in a phone viewport | P04-14 |
| `parity/walking-skeleton.platewise.json` | REA scenario for the same flow | P04-14 |

## Files to update (3)

| Path (under `platewise/`) | Change | Task |
|---|---|---|
| `src/app/App.tsx` | Compose Boot, providers, router, tab bar | P04-07 |
| `src/app/App.test.tsx` | Replace the placeholder test with a boot test | P04-07 |
| `src/i18n/en.ts` | Import the onboarding, home, log and settings partitions (lead) | P04-09 |

## Migrations and fixtures (1)

| Path (under `platewise/`) | What it holds | Task |
|---|---|---|
| `parity/walking-skeleton.platewise.json` | REA scenario | P04-14 |

## Task notes (14)

`docs/notes/P04/<slug>.md`, one per task, from `docs/notes/_template.md`, written before the code:

- `docs/notes/P04/primitives-buttons-cards-sheets-dialogs-toasts.md` (P04-01)
- `docs/notes/P04/primitives-inputs-and-pickers.md` (P04-02)
- `docs/notes/P04/primitives-gauge-pillar-menu-swipe-row-icons.md` (P04-03)
- `docs/notes/P04/hash-router-and-sheet-stack.md` (P04-04)
- `docs/notes/P04/tab-bar.md` (P04-05)
- `docs/notes/P04/theme-provider.md` (P04-06)
- `docs/notes/P04/boot-gate-today-clock-and-error-boundary.md` (P04-07)
- `docs/notes/P04/diary-service-first-cut.md` (P04-08)
- `docs/notes/P04/temporary-quick-start.md` (P04-09)
- `docs/notes/P04/home-page-skeleton.md` (P04-10)
- `docs/notes/P04/manual-entry-sheet.md` (P04-11)
- `docs/notes/P04/entry-row-with-delete.md` (P04-12)
- `docs/notes/P04/tab-placeholders-and-settings-hub-registry.md` (P04-13)
- `docs/notes/P04/walking-skeleton-e2e-and-parity-scenario.md` (P04-14)

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
pnpm build && pnpm exec playwright test e2e/walking-skeleton.spec.ts --repeat-each=3
```

On any failure, fix the cause and run the whole loop again from `pnpm install`. Never skip a test, widen an allow-list without a written reason, or edit a recorded fixture to make a test pass. Real waits are banned in tests: use fake timers (`vi.useFakeTimers()`) and the clock helpers in `src/test/time.ts`.

## Compare checklist (reopen the reference after writing)

- [ ] Tab order, hidden-tab rules, re-tap Settings, bar hidden during analysis (05 §3.1.1).
- [ ] Gauge: half arc, sweeps by eaten ÷ goal, stays full when over, four status cases in the display unit (05 §3.2.2).
- [ ] Diary grouping and food-only totals; delete always confirmed (05 §3.3).
- [ ] Manual entry rules (02 §3.8).
- [ ] Deliberate: our own visual language (siblings, not twins, 16 §2.5); quick start is temporary.
- [ ] Every task note's compare section is ticked, each tick naming its test.
- [ ] Trap rows owned by this phase in `docs/internals/traps-ledger.md` now carry `Test:` lines (the lead updates the ledger at land time).
- [ ] Acceptance rows owned by this phase in `docs/internals/acceptance-map.md` now carry `Test:` lines.

## Done when

Unit tests for primitives, shell and Home pass; the walking-skeleton spec passes in the mobile viewport. **Demo 1 (M2):** open the app on a phone-sized window, start with defaults, add "Toast, 250 kcal" by hand, see it under its meal with the gauge at 250, reload, and it is still there.
