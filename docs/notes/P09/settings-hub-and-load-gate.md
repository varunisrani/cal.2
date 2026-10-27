# Task: Settings hub and load gate (P09-01) · Phase: 09 · Owner: builder (wt-p09s01)

<!-- Save as platewise/docs/notes/P<nn>/<slug>.md. Write everything above "Compare checklist"
BEFORE writing code, in your own words. Never paste or paraphrase the reference line by line. -->

Read (reference @ `10e14b67`): `android/.../ui/settings/SettingsScreen.kt` lines 255–760 (the
category list with its two families, the per-category "reads the stored snapshot" flag, the hub ↔
category state, the back handler, the spinner while the snapshot loads), and
`android/.../test/.../ui/settings/SettingsCategoryTest.kt` (category counts per card, distinct
titles, every voice section opening a category). Research spec `06-settings-data.md` §3.1, §3.20
(hub footer and About families), §5 (v1 subset: no speech, voice, workout or health categories;
snapshot gate), §6 R06.22; `05-home-progress.md` §3.1.1 (re-tap returns to the hub, the update dot
on the Settings tab). Proposed D-16.66 (our own privacy and terms; help links from
`src/config/links.ts`, hidden until supplied). Ledger rows: R06.22, ACC-A10-2, ACC-J1-2.

What it does (own words): the Settings tab opens on a hub of two cards. Preferences lists Personal
info, Goals & nutrition, Tracking & reminders, AI providers, App settings and Your data; About lists
About Platewise, Help & feedback and Privacy & terms. Pages reached from inside another page (App
settings' Add menu, Product details and Tab bar) are not on the hub: they sit under their parent,
whose name their back link carries, and the back link returns to it. Every other page's back link
says "Settings" and returns to the hub; tapping the tab again does the same. Any page that shows
stored settings is drawn only after the settings have been read: until then a spinner stands where
the page goes, so no switch ever shows its default in place of the stored value (R06.22: a tap on a
default could otherwise store it). While a new version of the app waits, a dot marks the About row
and the Settings tab, so the person can find the update without being interrupted.

Inputs → outputs: the address (`#/settings`, `#/settings/<id>`), the registry (pages and links),
`useSettings` (loaded or not), `useAppUpdate()` (current or ready) → the hub's two cards, or one
page under its back link and title, or a spinner; a dot on the About row and the Settings tab.

Files: created `src/features/settings/CategoryPage.tsx` (the load gate and the page's loading
spinner) and its test; changed `registry.ts` (parent, gate flag, hub order, link rows, the update
row), `SettingsHub.tsx` (row order, link rows, the dot), `SettingsScreen.tsx` (parent lookup,
links and update flag passed down), `CategoryFrame.tsx` (back link to the parent), their tests,
`settings.module.css`; the Settings tab dot in `src/app/TabBar.tsx` (+ `shell.module.css`, test);
words in `src/i18n/en/settings.ts`. Shared: `src/app/router.ts` (going up to the page a sub-page
was opened from steps back instead of adding an entry) + test. Placeholder `src/config/links.ts`
(P09-16 owns the real one).

Edge cases / failure modes:
- Settings never load (read failed): the gate lets the page draw, and the page shows its own
  "can't be shown" note; the spinner never spins forever on an error.
- A page that shows no stored setting (the methods page, About) opts out of the gate, as the
  reference's About and voice pages do; the default is to wait, so a new page cannot forget it.
- A page's chunk still downloading: the same spinner (one marker, `settings.pageLoading`, which
  `untilLoaded()` already waits for).
- Unknown `#/settings/<id>` → the hub, before it is painted (kept from P04-13).
- A sub-page opened straight from its address: its back link still goes to the parent (a new
  entry, since there is nothing under it to step back to).
- A link whose address is not supplied yet (placeholder) is left out of the hub, never a dead row.
- `data` and `about` register later (P09-15, P09-16): the hub order is a fixed list of ids, so
  those entries land in their slot wherever in the registry they are added.
- A registry mistake (a parent that is not a registered top-level page, a page nested two deep)
  throws when the module loads, like the existing id checks.

Our design differences / decisions:
- Our names, copy, ids and hooks; one spinner (CSS ring in our tokens) for both chunk and data.
- Categories without v1 content are absent (06 §5): no speech, voice, workout, health or AI access.
- About is our own page plus two link rows (D-16.66) instead of five About families (no Support
  family: no tip jar, ratings or launch votes in v1; no Community links).
- Sub-pages of App settings are their own addresses (`#/settings/tab-bar` etc., as landed) with a
  `parent`; the reference pushes them as separate routes from App settings too.
- The update dot is purely visual (`aria-hidden`); the update banner already announces the same
  state as a status message.
- No hub footer (made-by line and tagline) in v1: not in the P09-01 row.

Decisions for the lead:
- `methods` (How your plan is calculated) stays a top-level About row after Privacy & terms until
  About (P09-16) links to it; then one line (`parent: 'about'`) nests it, and
  `MethodsPage.test.tsx`'s "registered as an About page" test moves to the About page.
- About (P09-16) should register with `waitForSettings: false` (it shows no stored setting); its
  tests that draw it through `SettingsScreen` without a `DataProvider` need that.
- `src/config/links.ts` here is a placeholder (`help` and `privacy` both `null`, so both rows stay
  hidden); P09-16's file replaces it; the one import in `registry.ts` names `LINKS.help` and
  `LINKS.privacy`.
- `src/app/router.ts`: a nested page records the page it was opened from; navigating back up to
  that page steps back over the sub-page (so the browser's Back never returns to it).

Tests we will write:
- Hub: every v1 row in order with the real registry, sub-pages left out (ACC-J1-2); `data` and
  `about` registered at the end land in their slots; link rows open in a new tab and hide without
  an address; the dot on the About row only while an update waits.
- CategoryPage: spinner and no switch until the settings are read, then the page (R06.22,
  ACC-A10-2) with the real App settings page; same with a made-up page; a page that opts out draws
  at once; a failed read lets the page show its own note; unknown address → hub.
- Sub-pages: the back link names App settings and steps back to it; Settings tab re-tap → hub.
- TabBar: dot on Settings only while an update waits.
- Registry: parent checks; `hubGroups` order rules.
- Router: up to the opening page steps back.

Compare checklist (filled after the rewrite; reopened `SettingsScreen.kt` 255–760,
`SettingsCategoryTest.kt`):
- [x] two cards, preferences then about, rows in a fixed order; categories without v1 content
      absent (`SettingsHub.test.tsx > SettingsHub > shows every v1 category in order, with the
      sub-pages of App settings left out (ACC-J1-2)`; `registry.test.ts > the registered categories
      > name every hub row of v1 in the hub order, and link to help and privacy`)
- [x] pages registered later take their slot (`SettingsHub.test.tsx > SettingsHub > puts Your data
      and About in their slots, then help and privacy, once they exist (ACC-J1-2)`;
      `registry.test.ts > hubGroups > puts the rows it names in the hub order, wherever they were
      registered`)
- [x] distinct ids and titles per category (`registry.test.ts > the registered categories > have
      distinct ids and titles, and routes the router reads back as themselves`)
- [x] a page that shows stored settings waits for the snapshot under a spinner, never drawing
      defaults (`CategoryPage.test.tsx > CategoryPage > shows a spinner, not switches at their
      defaults, until the settings are read (R06.22, ACC-A10-2)`, `> holds back even a page that
      draws its switches at once, until the settings are read (R06.22)`)
- [x] pages with their own state skip the wait, as the reference's About and voice pages do
      (`CategoryPage.test.tsx > CategoryPage > opens a page that shows no stored setting without
      waiting for them`; `registry.test.ts > the registered categories > wait for the stored
      settings, except the methods page, which shows none`)
- [x] back to the hub from the back link, the system Back or a re-tap of the tab
      (`SettingsHub.test.tsx > SettingsHub > goes back to the hub from the back link, stepping back
      over the page (ACC-J1-1)`; `CategoryPage.test.tsx > CategoryPage > opens Tab bar under a back
      link to App settings, which steps back; a tap on Settings goes to the hub`)
- [x] sub-pages pushed from App settings come back to it (`SettingsHub.test.tsx > SettingsHub >
      opens a sub-page under a back link named after its parent, which steps back to it`, `> goes to
      the parent from a sub-page the app was opened on`; `router.test.ts > createRouter > steps back
      to the page a nested page was opened from instead of adding one`)
- [x] hub and page keep their own scroll (`router.test.ts > createRouter > steps back to the page a
      nested page was opened from instead of adding one` checks the hub's scroll on the way back)
- [x] update available: dot on the About row and the Settings tab (`SettingsHub.test.tsx >
      SettingsHub > marks the About row with a dot only while an update waits`; `TabBar.test.tsx >
      TabBar > marks Settings with a dot only while an update waits, adding no words to its name`)
- [x] an unknown page address lands on the hub (`CategoryPage.test.tsx > CategoryPage > goes to the
      hub from the address of a category that is not registered`)
- [x] a failed settings read never leaves a spinner spinning (`CategoryPage.test.tsx > CategoryPage
      > lets the page say it cannot show its settings when they cannot be read`)
- Deliberate differences: our own copy, ids, icons and hooks; one spinner for the page's download
  and its settings; About is one page plus two link rows (D-16.66), no Support or Community
  families and no hub footer in v1; a sub-page's back link carries its parent's title.
- Not taken: the voice assistant's section mapping (voice is L5); the Data page refreshing a cloud
  backup on open (no cloud backup in v1, D-16.30); AI access as its own category (03 owns it in
  the AI providers page).

## Status

Done (2026-10-27). Shared files, additive: `src/app/TabBar.tsx` (the Settings tab dot and an
`updates` prop), `src/app/shell.module.css` (`.tabDot`), `src/app/router.ts` (a nested page
records the page it was opened from; going back up to it steps back) with two tests in
`src/app/router.test.ts`, `src/app/TabBar.test.tsx` (one test, an `updates` argument),
`src/i18n/en/settings.ts` (`loading`, `links`). Placeholder: `src/config/links.ts` (P09-16 owns the
real one). Handed on: nesting `methods` under About and About's `waitForSettings: false`
(P09-16 / the lead).
