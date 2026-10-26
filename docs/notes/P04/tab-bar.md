# Task: tab bar (P04-05) · Phase: 04 · Owner: builder (wt-p04s3, slice S3)

Read (reference @ `10e14b67`): `A/ui/navigation/BottomNavBar.kt` [419] layout and selection only
(which tabs are drawn, which one is selected, what a tap reports; the drag-to-switch and visual
recipe were skimmed and not taken); `A/models/TabBarSettings.kt` [26] (which tabs can be hidden,
unknown names ignored); `IT/TabBarSettingsTests.swift` [35]; `A/ui/navigation/FudAINavHost.kt`
[392] the hidden-tab effect, the "bar shown when" condition and `selectTab`. Research spec
`05-home-progress.md` §3.1.1–3.1.2, trap R05.13; `16-what-we-change.md` §2.5 (our own look).

What it does (own words): a floating bar at the bottom with Home, Progress, Coach and Settings in
that fixed order, each an icon over its name. The tab on screen is marked for the eye (accent
colour, a raised pill behind it that slides when the selection moves) and for screen readers
(`aria-current="page"`). Progress and Coach can be hidden in Settings; Home and Settings never, and
names it does not know are ignored. The bar is not drawn at all until the hidden-tab setting has
been read, so a hidden tab never flashes in at start. If the tab on screen becomes hidden (the
setting, or a restored backup) the app moves to Home. Tapping Settings while anywhere in Settings
goes back to its hub; tapping the tab already shown otherwise does nothing; tapping another tab
shows it where it was left. The bar hides while the food analysis overlay is up (an app-state
flag), and on onboarding. The content area keeps space at the bottom so the last card clears it.

Inputs → outputs: the settings feed (`tabs.hidden`) from the app data context, the route
(`useRoute`), the overlay flag (`useAppState`) → a `nav` landmark with one button per visible tab,
or nothing. Taps → `navigate` / `showTab`.

Files: created `src/app/TabBar.tsx`, `src/app/TabBar.test.tsx`, styles in
`src/app/shell.module.css`; copy `shell.tabs` (the bar's name) in `src/i18n/en/shell.ts`; tab
names reuse `common.tabs.*`.

Edge cases / failure modes:
- Settings still loading, or the settings read failed → nothing drawn, no redirect.
- Stored list with `home`, `settings` or an unknown name → only Progress/Coach entries count.
- Hiding the tab on screen while on a nested page of it (only Settings has pages, and it cannot be
  hidden) → n/a; hiding Coach while on Coach → Home, and the Coach button disappears.
- Re-tap Settings on the hub → stays (no history change).
- Onboarding route → no bar.
- Overlay flag on → no bar; off again → the bar returns with the same selection.

Our design differences / decisions:
- Our look (16 §2.5): a solid card-coloured capsule on the card token with the raised shadow, no
  translucency, sheen or gradient border; the pill is the soft accent token; the selected label is
  semibold in the accent. Sizes from our tokens, not the reference's dp values.
- The pill slides with a CSS transform transition (off under reduced motion); no spring.
- Drag-to-switch along the bar is P2 (A7), not built. The Settings "update available" dot is P09.
- Icons from our set: home, chart, chat, gear.
- The hidden-tab move to Home lives in the bar (it is mounted on every tab screen), so a hidden
  tab is left in the same render pass that stops drawing its button.

Tests we will write:
- With settings not loaded nothing renders (and no redirect happens).
- The four tabs in order, each a button named by its label with a `data-ui` hook; the current one
  has `aria-current="page"`, the others none.
- Stored `["home", "coach"]` hides only Coach; Progress hidden too leaves Home and Settings.
- Hiding Coach while on Coach routes to Home and the Coach button goes away (ACC-A3-1, R05.13).
- A hidden tab never appears while settings load (ACC-A3-2): no Coach button in any render before
  the first snapshot.
- Re-tap Settings on a sub-page goes to the hub (ACC-A4-1); re-tap Home does nothing; tapping
  Progress then Home returns to Home where it was (ACC-A1-1, with the router's scroll memory).
- The overlay flag hides the bar and it comes back afterwards.
- No bar on onboarding.

Compare checklist (filled after the rewrite; reopened `BottomNavBar.kt`, `TabBarSettings.kt`,
`TabBarSettingsTests.swift`, `FudAINavHost.kt` hidden-tab effect, bar condition and `selectTab`):
- [x] Fixed order Home, Progress, Coach, Settings (Workouts later), each an icon over its name
      (tested in `src/app/TabBar.test.tsx > TabBar > shows Home, Progress, Coach and Settings in
      that order, each named and hooked (ACC-A1-1)`)
- [x] Only Progress and Coach hide; Home, Settings and unknown names in the stored list are
      ignored (tested in `src/app/TabBar.test.tsx > TabBar > hides only Coach when the stored list
      holds home and coach (R05.13)`, `> keeps Home and Settings when both hideable tabs are
      hidden`; `> visibleTabs and tapOutcome > drops only hidden Progress and Coach, in the fixed
      order`)
- [x] Not drawn until the hidden list is read, so a hidden tab never flashes (ACC-A3-2) (tested in
      `src/app/TabBar.test.tsx > TabBar > draws nothing while the settings are not loaded, and
      moves nowhere`, `> never draws a hidden tab while the app starts (ACC-A3-2, R05.13)`)
- [x] The tab on screen becoming hidden leaves it for Home, including a change that arrives from
      the store (ACC-A3-1) (tested in `src/app/TabBar.test.tsx > TabBar > moves to Home when Coach
      is hidden while on Coach, and the tab disappears (ACC-A3-1, R05.13)`; `src/app/App.test.tsx >
      App > leaves Coach for Home when Coach is hidden from Settings while on screen (ACC-A3-1)`,
      through the real settings repository)
- [x] One tab changes at a time by read-modify-write (R05.13; the repository's
      `toggleHiddenTab`, exposed by the app data service) (tested in
      `src/services/appData.test.ts > connectAppData > hides one tab while keeping the stored state
      of the other (R05.13)`)
- [x] Re-tap Settings anywhere in Settings → hub; re-tap another current tab → nothing; another tab
      → where it was left (tested in `src/app/TabBar.test.tsx > TabBar > shows the Settings hub when
      Settings is tapped on a nested page (ACC-A4-1)`, `> does nothing when the tab on screen is
      tapped again`, `> returns to the address a tab last showed when it is tapped again later`;
      `> visibleTabs and tapOutcome > sends a Settings tap inside Settings to the hub and ignores
      another current tab`; `src/app/Shell.test.tsx > Shell > switching back to Home returns to
      where Home was scrolled (ACC-A1-1)`)
- [x] Selected tab marked for the eye and for screen readers (the reference marks it selected;
      ours `aria-current="page"`) (tested in `src/app/TabBar.test.tsx > TabBar > marks the tab on
      screen with aria-current, and only that one (ACC-A6-1)`)
- [x] Hidden under the analysis overlay; shown on nested Settings pages; none on onboarding
      (tested in `src/app/TabBar.test.tsx > TabBar > steps aside while the analysis overlay is up
      and comes back afterwards`, `> marks the tab on screen with aria-current, and only that one
      (ACC-A6-1)` (on `#/settings/units`), `> draws no bar on onboarding`)
- [x] Content keeps space under its last card while the bar shows (`data-tab-bar` on the content
      area, tested in `src/app/Shell.test.tsx > Shell > shows the screen of the route with the tab
      bar over it`, `> shows the onboarding screen headed with the app name and no tab bar`; the
      clearance itself checked by hand in Chromium: bar 64 px high, 16 px in from the sides, 12 px
      above the bottom of a 412 × 839 viewport)
- [x] The pill slides to the chosen tab (by hand in Chromium: a screenshot right after tapping
      Settings caught the pill between Coach and Settings; off under reduced motion in the CSS)
- Deliberate differences: our solid surface (card token, raised shadow, soft-accent pill, no
  translucency or gradient border); a `nav` landmark of buttons with `aria-current="page"` rather
  than tab semantics (this is app navigation, not a tab panel); the pill moves with a CSS
  transition, not a spring.
- Not taken: drag-to-switch along the bar (P2, A7); the Settings update dot (P09); Workouts (L1);
  the voice assistant condition (N-2).

## Decisions for the lead

- The hidden-tab redirect lives in `TabBar` (always mounted with the shell); while it is pending
  the bar draws nothing, so the hidden button is never shown for a frame.
- `src/app/shell.module.css` follows the primitives' sheet rules (tokens only, no gradients or
  blur, reduced motion); add it to `SHEETS` in `src/ui/stylesheets.test.ts` (one line, a file
  outside this slice).

## Status

Done (2026-10-27). Tab bar with tests; checked by hand in headless Chromium (dark and light).
Handed on: P06-04 sets `analysisOverlay` through `useAppState().set`.
