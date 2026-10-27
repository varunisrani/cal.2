# Task: tab bar (P04-05) · Phase: 04 · Owner: builder (wt-p04s3, slice S3)

Read (reference @ `10e14b67`): `A/ui/navigation/BottomNavBar.kt` (layout and selection only: tab
list and order, how hidden tabs are filtered, the selected pill and its spring, item look),
`A/models/TabBarSettings.kt` (which tabs can be hidden, tolerant decode), `IT/TabBarSettingsTests.swift`;
also `FudAINavHost.kt` (when the bar is drawn at all, the hidden-tab fallback to Home). Research spec
`05-home-progress.md` §3.1.1–3.1.2, trap R05.13. Decisions `16-what-we-change.md` §2.5 (siblings,
not twins), D-16.1 (solid accents). Acceptance ids ACC-A1-1, ACC-A3-1, ACC-A3-2, ACC-A4-1, ACC-A6-1.

What it does (own words): a floating bar at the bottom of every tab screen with Home, Progress,
Coach and Settings, always in that order. Progress and Coach can be hidden by a setting; Home and
Settings never; any other name in the stored list is ignored. The bar waits for the settings
snapshot: until it is known, nothing is drawn, so a tab the person hid never appears for a moment
(R05.13). If the tab on screen becomes hidden (the setting, or a restored backup) the app goes to
Home. Tapping a tab selects it through the router; tapping Settings while anywhere in Settings goes
back to the Settings hub; tapping the tab already shown does nothing otherwise. The bar is not drawn
on onboarding or while the analysis overlay covers the screen (app-state flag). The selected tab is
tinted with the accent, has a soft pill behind it that slides to the chosen tab, and carries
`aria-current="page"`. Tab screens keep enough space at the bottom for their last card to clear
the bar.

Inputs → outputs: settings snapshot (`hiddenTabs`) from the shell ports, the route and router from
`useRoute`, the overlay flag from `appState` → a `nav` landmark with one button per visible tab.
`visibleTabs(hidden)` and `isHiddenTab(tab, hidden)` are exported for the tab-bar settings page
(P09).

Files: created `src/app/TabBar.tsx`, `src/app/TabBar.test.tsx`; styles in `src/app/shell.module.css`.

Edge cases / failure modes:
- Settings not loaded → nothing, not even an empty capsule.
- Stored list with Home, Settings, unknown words, duplicates or odd spacing → only Progress and
  Coach can take effect.
- On a hidden tab at start (address `#/coach`, Coach hidden) → Home before the first paint.
- On a nested Settings page → Settings shows as selected; re-tap → hub.
- Overlay on → bar hidden; overlay off → bar back, same selection.
- Reduced motion → the pill moves without animation (motion tokens).

Our design differences / decisions:
- Our look: a capsule on the raised card colour with the line colour as border and our raised
  shadow; a solid accent-soft pill; no sheen, no gradient border (16 §2.5, D-16.1). Sizes are ours.
- Drag-to-switch is not built (P2, A7); taps and keyboard only. No Workouts tab (later phase).
- The update dot on Settings is P09's (service worker); not here.
- Buttons with `aria-current="page"` rather than ARIA tabs: the bar switches whole screens (a
  navigation landmark), not panels in place.

Tests we will write (`TabBar.test.tsx`):
- settings not loaded → nothing renders; then it appears (ACC-A3-2, R05.13).
- four tabs in order with their names; switching back to Home restores where it was (ACC-A1-1).
- stored `["home", "coach"]` hides only Coach; unknown names ignored; Home and Settings never hide.
- hiding Coach while on Coach routes to Home and the tab disappears (ACC-A3-1).
- re-tap Settings on a sub-page goes to the hub (ACC-A4-1); re-tap Home does nothing.
- overlay flag hides the bar and it returns afterwards.
- each tab has a name, `data-ui` and `aria-current` on the selected one only (ACC-A6-1); a nested
  Settings page selects Settings; not drawn on onboarding.

Compare checklist (filled after the rewrite; reopened `BottomNavBar.kt`, `TabBarSettings.kt`,
`TabBarSettingsTests.swift`, `FudAINavHost.kt`):
- [x] Fixed order Home, Progress, Coach, Settings (no Workouts in v1) and switching back to Home
      returns to where it was (`TabBar.test.tsx > TabBar > shows Home, Progress, Coach and Settings
      in that order, and Home comes back where it was`) (ACC-A1-1)
- [x] Hideable = Progress and Coach only; unknown names, Home and Settings dropped; names trimmed
      (`TabBar.test.tsx > visibleTabs > shows every tab when nothing is hidden`, `> ignores Home,
      Settings and unknown names, and reads names with stray spaces`; `> TabBar > hides only Coach
      for a stored ["home", "coach"]`)
- [x] Not drawn until the hidden set is known (`TabBar.test.tsx > TabBar > draws nothing before
      the hidden-tab setting arrives, so a hidden tab never shows for a moment`) (ACC-A3-2,
      R05.13)
- [x] The tab on screen becomes hidden → Home (`TabBar.test.tsx > TabBar > moves to Home when Coach
      is hidden while on Coach, and the tab disappears`, `> goes to Home when the app opens on a
      hidden tab`) (ACC-A3-1, R05.13)
- [x] Re-tap Settings on a nested page → hub; re-tap the current tab otherwise does nothing
      (`TabBar.test.tsx > TabBar > returns to the Settings hub when Settings is tapped on a nested
      page`, `> does nothing when the tab on screen is tapped again`) (ACC-A4-1)
- [x] Bar hidden during the analysis and on onboarding (`TabBar.test.tsx > TabBar > hides while the
      analysis overlay is showing and comes back afterwards`, `> is not drawn on onboarding`)
- [x] Selected tab: accent tint, slightly larger icon, semibold label, a pill that moves to it;
      marked for screen readers (`TabBar.test.tsx > TabBar > names every tab and marks only the
      selected one with aria-current`) (ACC-A6-1); checked by hand in Chromium at the Pixel 7
      size in both themes (pill under Settings on `#/settings/units`, slides to Coach on tap).
- [x] The content keeps room for the bar (`.content` bottom padding = bar + gaps + safe area + a
      margin, 112 px measured in Chromium).
- Deliberate differences: our capsule look (raised card colour, line border, raised shadow, solid
  accent-soft pill), buttons with `aria-current="page"` instead of tab semantics.
- Not taken: drag-to-switch with haptic ticks (P2, A7); the update dot on Settings (P09); the
  Workouts tab (later phase); storing the hidden set one tab at a time (`toggleHiddenTab`,
  P02-04's read-modify-write, R05.13's last clause).

## Decisions for the lead

- The icon set has no home icon, so `TabBar.tsx` draws a house on the set's grid and stroke
  (`HomeGlyph`, `data-icon="home"`). It belongs in `src/ui/icons` as `home` (two paths); then
  `TabBar` can use `<Icon name="home" />` and drop the local glyph.
- Tab names come from the existing `common.tabs.*` keys (the `common` partition already holds
  them); the `shell` partition holds the bar's landmark name and the start-up and recovery words.

## Status

Done (2026-10-26). Nothing changed outside the slice's files.
