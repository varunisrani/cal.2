# Task: Tab bar page (P09-04) · Phase: 09 · Owner: builder (wt-p09s02)

<!-- Save as platewise/docs/notes/P<nn>/<slug>.md. Write everything above "Compare checklist"
BEFORE writing code, in your own words. Never paste or paraphrase the reference line by line. -->

Read (reference @ `10e14b67`): `android/.../ui/settings/TabBarSettingsScreen.kt` (all: one card of
switches for the hideable tabs, a footer line, each switch calling the view model's one-tab write),
`ios/calorietrackerTests/TabBarSettingsTests.swift` (missing value shows every tab, tab order on
write, Home/Settings/unknown names never hidden). Research spec `06-settings-data.md` §3.5, §5; trap
R05.13 (`docs/internals/traps-ledger.md`).

What it does (own words): Settings › Tab bar lets the person take Progress or Coach out of the
bottom bar. One card lists the two tabs as switches, on while the tab is shown. Home and Settings
cannot be hidden; a line under the card says they always stay. A switch flips the moment it is
pressed and the page then follows the stored list. Each press changes one tab only: the write
reads the stored list inside its own transaction (`toggleHiddenTab`), so a page that still shows an
older list can never undo a change made elsewhere (R05.13). The bar hides the tab as soon as the
list is stored, and if the tab on screen is hidden the shell goes Home (already in TabBar, P04).

Inputs → outputs: `tabs.hidden` (read with `useSettings`) → `appSettings.setTabHidden(tab, hidden)`
→ `settingsRepo.toggleHiddenTab` → the shell's live settings → TabBar.

Files: created `src/features/settings/app/TabsPage.tsx` with its test; uses `writes.ts` and the
`appSettings` service from P09-02. Shared, additive: the `tab-bar` entry in
`src/features/settings/registry.ts`.

Edge cases / failure modes:
- Settings not read yet → nothing drawn (R06.22); read failed → a note.
- A failed write → the switch goes back to the stored value and a toast says so.
- Two quick presses on different tabs → both changes stay (one-tab writes).
- Stored names the schema does not know are dropped by the settings reader, so they never show.

Our design differences / decisions:
- Our copy and hooks; no Workouts tab in v1 (06 §5).
- The page is its own Settings category (`#/settings/tab-bar`), linked from App settings; its back
  link goes to the hub like every category until P09-01 reworks the frame.

Tests we will write:
- Two switches, both on by default, with the footer note; nothing before the settings are read.
- Turning Progress off hides it from the bar at once and keeps Coach (ACC-J7-1).
- Hiding Coach on a page opened before Progress was hidden elsewhere keeps Progress hidden (R05.13).
- The switch flips while the write is still running; a failed write flips it back with a toast.

Compare checklist (filled after the rewrite; reopened `TabBarSettingsScreen.kt`,
`TabBarSettingsTests.swift`):
- [x] one card of switches for the hideable tabs, on while shown, then a footer that Home and
      Settings always stay (`TabsPage.test.tsx > TabsPage > shows Progress and Coach switched on, and
      says Home and Settings always stay`, `> shows a tab hidden earlier switched off`)
- [x] each switch writes its one tab; the bar drops it (`TabsPage.test.tsx > TabsPage > takes
      Progress out of the bar at once and keeps Coach as it was (ACC-J7-1)`)
- [x] a page holding an older list never undoes another change (`TabsPage.test.tsx > TabsPage >
      hides Coach without undoing Progress, hidden elsewhere after the page was read (R05.13)`;
      `src/services/appSettings.test.ts > setTabHidden > hides Coach and keeps Progress hidden by an
      earlier change (R05.13)`)
- [x] the switch flips at once and the stored value then wins (`TabsPage.test.tsx > TabsPage > flips
      a switch at once and goes back to the stored list with a message when the change fails`;
      `writes.test.tsx > usePendingWrites > lets a stored value that moved elsewhere win over the
      choice`)
- [x] nothing drawn before the settings are read (`TabsPage.test.tsx > TabsPage > draws nothing until
      the settings are read (R06.22)`)
- [x] reached from App settings (`TabsPage.test.tsx > TabsPage > is reached from App settings at
      #/settings/tab-bar, under its title`)
- [x] missing value shows every tab; Home, Settings and unknown names never hidden; tab order on
      write: already covered by the schema reader and the shell (`src/app/TabBar.test.tsx >
      visibleTabs > ignores Home, Settings and unknown names, and reads names with stray spaces`;
      `src/data/repos/settingsRepo.test.ts > toggleHiddenTab > hides Coach without undoing Progress
      hidden since the screen last read (R05.13)`)
- Deliberate differences: no Workouts tab (v1); our own copy, heading and hooks; a failed write
  says so in a toast.
- Not taken: the reference's per-tab icons on the switches (our Switch rows carry none).

## Status

Done (2026-10-27). Shared, additive: the `tab-bar` entry in `src/features/settings/registry.ts`.
