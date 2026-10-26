# Task: boot gate, today clock and error boundary (P04-07) · Phase: 04 · Owner: builder (wt-p04s3, slice S3)

Read (reference @ `10e14b67`): `A/ui/navigation/FudAINavHost.kt` [392] launch and lifecycle parts
(start destination chosen from "onboarding finished", the app-open counter on return from the
background); `A/MainActivity.kt` [246] splash hold only (the first screen is held until the stored
profile has been read when onboarding is finished). Research spec `05-home-progress.md` §3.2.2
(fallback goals never shown), §5 (foreground return → `visibilitychange`), traps R05.12, R05.14,
`06-settings-data.md` R06.22, `01-profile-goals.md` R01.17 (a corrupt profile is not "no profile").

What it does (own words): the start of the app. While the database opens and the first profile
read and settings snapshot are on their way, a neutral skeleton shows: no numbers, no switches, no
default goals that could flash (R05.12, R06.22). Then: no finished setup (no readable profile, or
setup not marked done) → onboarding; finished → the tab in the address (Home when there is none).
A database that cannot be opened (written by a newer build, a failed upgrade, no storage in this
browser) shows a recovery card with Reload instead of the app, and nothing is deleted. A profile
that cannot be read shows its own card: Reload, or set up again (the unreadable record is kept
aside by the repository before anything is written over it). Separately, a "today" clock gives
every screen today's day key and moves it at the next local midnight, and again when the app
comes back to the foreground (`visibilitychange` → visible, `pageshow`), so an app left open
overnight never keeps yesterday (R05.14). A crash anywhere below shows a crash card with Reload.

Inputs → outputs:
- `src/services/appData.ts` (lead correction: screens may not import `data/db` or `data/repos`):
  `connectAppData(options)` opens the database and builds the settings and profile repositories →
  `{kind: 'open', data, close}` or `{kind: 'failed', problem}` (the `DbOpenError` kind);
  `openAppData()` is the page's one opening (memoised, so a StrictMode double effect never opens
  twice). `AppData` = settings `{feed, snapshot, toggleHiddenTab}` and profile `{feed, get}`.
- `src/app/appDataContext.ts`: `AppDataContext`, `useAppData()`; tests pass small fakes.
- `Boot({open, children})` → skeleton | recovery card | `AppDataContext` + `ThemeProvider` + the
  gate → children on the right route.
- `TodayProvider` / `useToday()` → `DayKey`.
- `ErrorBoundary({children, reload?})` → children or the crash card.
- `appState.ts`: `createAppState()`, `AppStateContext`, `useAppState()` → `{analysisOverlay,
  selectedDay, set}`.
- `App` composes ErrorBoundary › router context › TodayProvider › ToastProvider › Boot › Shell
  (content area with per-address scroll, the placeholder screens, the tab bar).

Files: created `src/app/{Boot,TodayProvider,ErrorBoundary,ProblemCard,Shell,RouteScreen,PlaceholderPage}.tsx`,
`src/app/{appState,appDataContext}.ts`, their tests, `src/app/testing/fakeAppData.ts`,
`src/app/shell.module.css`, `src/services/appData.ts` + test, `src/i18n/en/shell.ts`. Changed
`src/app/App.tsx`, `src/app/App.test.tsx`; `src/i18n/en.ts` (shared: the import and the `shell`
entry).

Edge cases / failure modes:
- Open rejects with something that is not a `DbOpenError` → treated as `failed` (generic card).
- Settings or profile feed answers `error` (a read that failed) → a "could not read" card with
  Reload; never the onboarding screen.
- Profile `corrupt` → its own card; never onboarding by itself (R01.17).
- Setup marked done but no profile → onboarding (the reference would hold its splash forever).
- Profile saved but setup not marked done (interrupted onboarding) → onboarding.
- The gate keeps watching: when onboarding saves the profile and marks setup done, the app moves
  to Home; when everything is erased (P09), it moves to onboarding. While the route does not yet
  match the verdict, the skeleton shows (no frame of Home before the redirect).
- Midnight timer firing early, DST days (23 or 25 hours), a device that slept past midnight
  (timers paused): the next run always recomputes from the clock, and the foreground events cover
  the sleep.
- A crash in the crash card itself is out of reach (the boundary is the outermost component).

Our design differences / decisions:
- Our names; a web skeleton in place of a held splash screen.
- "Completed profile" = setting `onboarding.done` and a readable profile.
- "The last tab" = the tab in the address (a reload stays where it was); no stored last tab.
- The database-closed-by-another-tab message (`reload-needed` on the bus) is not handled here: no
  task owns it yet (follow-up for the lead).
- Midnight refresh uses one timer to the next local midnight (`startOfDay(addDays(today, 1))`),
  re-armed after each run; no polling.
- Crash card and recovery cards share one `ProblemCard` (title, message, actions).

Tests we will write:
- Boot: skeleton while open is pending; no child (with "numbers") renders before the profile read
  resolves, with a deferred fake profile feed (R05.12, ACC-A10-1); nor before the settings
  snapshot (R06.22); no profile → onboarding; done + profile → stays on the address's tab;
  corrupt profile → the card, and "set up again" → onboarding; open failure → recovery card per
  kind with Reload; feed error → read card; completion moves from onboarding to Home.
- TodayProvider: at 23:59:59 + 1 s (fake timers) today advances (ACC-A11-1, R05.14);
  `visibilitychange` after a date change updates it; `pageshow` too; a hidden tab does not
  refresh on the hidden event; the timer re-arms for the following midnight; cleanup clears it.
- ErrorBoundary: a thrown child shows the crash card; Reload calls the reload function.
- appState: defaults, set and subscribe, the hook re-renders.
- appData service: an empty database opens with settings at defaults and the profile missing; a
  saved profile reads ok; a newer database on disk gives `{kind: 'failed', problem:
  'newer-schema'}`; `openAppData()` answers the same promise twice.
- App: with a real (fake-indexeddb) database, a fresh start shows the onboarding placeholder
  headed "Platewise"; a finished setup shows Home and the tab bar.

Compare checklist (filled after the rewrite; reopened `FudAINavHost.kt` launch/lifecycle,
`MainActivity.kt` splash hold):
- [x] Start destination: onboarding unless setup was finished (tested in `src/app/Boot.test.tsx >
      Boot > goes to onboarding when there is no profile`, `> goes to onboarding when a profile
      exists but setup was never marked done`, `> stays on the tab in the address for a finished
      setup`, `> opens Home when a finished setup starts on the onboarding address`;
      `src/app/Boot.test.tsx > startVerdict > waits for both reads, and onboards without a
      finished setup`;
      `src/app/App.test.tsx > App > opens a fresh install on the onboarding screen headed
      Platewise, with no tab bar`, `> opens a finished setup on Home with the tab bar`)
- [x] Nothing with numbers is drawn before the profile read (the reference's splash hold, our
      skeleton) (R05.12, ACC-A10-1) (tested in `src/app/Boot.test.tsx > Boot > draws no Home numbers
      before the profile read resolves (R05.12, ACC-A10-1)`, `> shows a neutral skeleton, with no
      numbers, while the database opens`)
- [x] Gap closed: the reference only waits for the profile; we also wait for the settings snapshot
      (R06.22) (tested in `src/app/Boot.test.tsx > Boot > waits for the settings snapshot as well
      (R06.22)`)
- [x] Gap closed: the reference would hold its splash forever with setup done but no profile; ours
      goes to onboarding (tested in `src/app/Boot.test.tsx > startVerdict > waits for both
      reads, and onboards without a finished setup`)
- [x] Finishing onboarding opens Home with no way back (tested in `src/app/Boot.test.tsx > Boot >
      moves from onboarding to Home once setup is finished`; `src/app/router.test.ts > router >
      leaves no way back to onboarding once Home is shown`)
- [x] Corrupt profile never reads as missing (R01.17) (tested in `src/app/Boot.test.tsx >
      startVerdict > never takes an unreadable profile for a missing one (R01.17)`, `> Boot > shows a
      card for an unreadable profile instead of onboarding, and can set up again (R01.17)`)
- [x] Database open errors show a recovery card, nothing deleted (tested in `src/app/Boot.test.tsx >
      Boot > shows a recovery card instead of the app when opening fails with %s` (4 kinds), `> treats
      an opening that rejects as a database that could not be opened`, `> shows a card when a first
      read fails, never onboarding`; `src/app/App.test.tsx > App > shows a recovery card when a newer
      version wrote the database`; `src/services/appData.test.ts > connectAppData > answers
      newer-schema for a database a newer build wrote, and leaves it alone`)
- [x] Foreground return re-reads "today" (the reference's lifecycle re-reads) and a midnight timer
      moves it (R05.14, ACC-A11-1) (tested in `src/app/TodayProvider.test.tsx > TodayProvider >
      moves to the new day one second after 23:59:59 (ACC-A11-1, R05.14)`, `> keeps moving at every
      following midnight`, `> finds the midnight after a 25-hour day when the clocks go back`,
      `> updates on visibilitychange after the date changed while timers were asleep`, `> updates
      when the page is shown again from the back-forward cache`, `> follows the local day of the
      zone it runs in`, `> leaves no timer or listener behind when it unmounts`, `> refuses to be
      read without a provider`)
- [x] Crash card with Reload (tested in `src/app/ErrorBoundary.test.tsx > ErrorBoundary > shows the
      crash card when a child throws`, `> reloads from the crash card`, `> shows its children while
      nothing goes wrong`)
- [x] App state for the overlay flag and the selected day (tested in `src/app/appState.test.ts >
      createAppState > …` 3 tests, `> useAppState > re-renders with new values and sets them`)
- [x] Opening once per page and the service's surface (tested in `src/services/appData.test.ts >
      openAppData > opens the page's database once, whoever asks`, `> connectAppData > opens an empty
      database with every setting at its default and no profile`, `> reads the stored profile and
      settings`)
- [x] By hand in headless Chromium (production build, Pixel 7): a fresh load shows the onboarding
      placeholder at `#/onboarding`; with a profile and `onboarding.done` written into IndexedDB, a
      reload on `#/onboarding` opens Home; no page errors.
- Deliberate differences: a skeleton in the page instead of a held splash; the theme is read with
  the settings, not before the first frame (see the theme note); a recovery card for a corrupt
  profile with "Set up again" (the reference has no such state).
- Not taken: the app-open counter for the launch fill (R05.18, P2); update checks and post-update
  prompts (P09); quick actions and the voice assistant (later phases).

## Decisions for the lead

- **Lead correction applied**: screens never import `data/db` or `data/repos`. The new service
  `src/services/appData.ts` opens the database and builds the settings and profile repositories;
  `AppData` = `settings {feed, snapshot, toggleHiddenTab}` + `profile {feed, get}`;
  `connectAppData(options)` → `{kind: 'open', data, close}` | `{kind: 'failed', problem}` (the
  `DbOpenError` kind; anything else → `failed`); `openAppData()` is memoised per page (StrictMode
  runs Boot's effect twice in dev). The shell receives `AppData` through `AppDataContext`
  (`src/app/appDataContext.ts`, `useAppData()`); tests use `src/app/testing/fakeAppData.ts`.
  Features that need to write (QuickStart, Home) still need their own service or the P02-15 hooks.
- **Completed setup** = `onboarding.done` and a readable profile. Setup done with no profile →
  onboarding. Corrupt profile → its own card with Reload and "Set up again" (the repository keeps
  the unreadable record aside before the next save).
- **"The last tab"** = the tab in the address (a reload stays where it was). No stored last tab.
- **The gate keeps watching**: finishing onboarding moves to Home by itself (QuickStart may still
  navigate; a second navigate to the same address does nothing); erasing everything (P09) moves to
  onboarding. The skeleton shows until the route agrees with the verdict.
- **Today**: `useToday()` from `src/app/TodayProvider.tsx`; one timer to the next local midnight,
  re-armed on every refresh; refresh on `visibilitychange` → visible and `pageshow`.
- **App state**: `useAppState()` → `{analysisOverlay, selectedDay, set}`; `AppStateContext` for
  tests, the page's store otherwise.
- **Composition** (`App.tsx`): ErrorBoundary › RouterContext › TodayProvider › ToastProvider ›
  Boot (AppDataContext › ThemeProvider › gate) › Shell (content area + RouteScreen + TabBar).
  `App` takes optional `open` and `router` props for tests; `main.tsx` is unchanged.
- **Placeholders**: `src/app/RouteScreen.tsx` maps each route to a screen; wave B replaces its
  lines (onboarding keeps the app name as its heading until P05).
- Follow-ups: `reload-needed` on the bus (another tab upgraded or deleted the database) is not
  shown yet: the shell could show the recovery card with Reload; no task owns it. The `pageshow`
  refresh also runs on a first load (harmless: same day).

## Status

Done (2026-10-27). Boot gate, today clock, error boundary, app state, the app data service and the
composed App with tests; e2e smoke passes. Files outside `src/app`: `src/services/appData.ts` and
its test (new, per the lead's correction), `src/i18n/en/shell.ts` (new partition), `src/i18n/en.ts`
(shared: the import and the `shell` entry).
