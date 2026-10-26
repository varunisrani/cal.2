# Task: boot gate, today clock and error boundary (P04-07) · Phase: 04 · Owner: builder (wt-p04s3, slice S3)

Read (reference @ `10e14b67`): `A/ui/navigation/FudAINavHost.kt` (launch and lifecycle parts: start
destination chosen from the onboarding flag, the foreground-return counter, bar hidden on
onboarding), `A/MainActivity.kt` (splash hold only: the splash stays until the stored profile has
been read, except on the way to onboarding). Research spec `05-home-progress.md` §5 (splash hold →
skeleton; foreground return → `visibilitychange` and `pageshow`), traps R05.12, R05.14, spec
`06-settings-data.md` R06.22 (settings pages gate on "loaded"), R06.4 (an open failure never deletes
the database). Acceptance ids ACC-A10-1, ACC-A11-1.

What it does (own words):
- `Boot` is the start-up gate. Until both the profile state and the settings snapshot are known it
  shows a neutral skeleton: grey blocks, no numbers, no switches, so fallback goals or default
  switches never flash (R05.12, R06.22). If the database could not be opened it shows a recovery
  card (your data is still there, close other tabs, reload) instead of the app. Otherwise it routes:
  no completed profile → onboarding; a completed profile on the onboarding address → Home; else the
  tab in the address stays (a reload keeps the person where they were). The redirect replaces the
  address and happens before the screen is drawn.
- `TodayProvider` holds today's day key for the whole app. It sets a timer for the next local
  midnight and recomputes then, and also whenever the page becomes visible again or is shown from
  the back-forward cache, so an app left open overnight moves to the new day (R05.14).
- `ErrorBoundary` catches a render crash anywhere below it and shows a crash card with Reload.
- `appState` is a tiny store of UI state shared by the shell: whether the analysis overlay is up
  (the tab bar hides) and the selected day (a placeholder for P07).
- `App` composes them: error boundary → shell ports → theme → toasts → router → today → boot →
  the content area and the tab bar. `ports.ts` defines the read stores the shell needs (settings
  snapshot and boot state, `undefined` = not loaded yet) and one context that carries them.

Inputs → outputs: `ShellPorts` (two read stores), a `Router`, a `Clock` → the composed app. Boot
state: `openError` / `needsOnboarding` / `ready` (or `undefined` while loading).

Files: created `src/app/{ports.ts,Boot.tsx,Boot.test.tsx,TodayProvider.tsx,TodayProvider.test.tsx,
ErrorBoundary.tsx,ErrorBoundary.test.tsx,ShellNotice.tsx,appState.ts,appState.test.ts,Screen.tsx,
OnboardingPlaceholder.tsx,shell.module.css,shellText.ts,shellText.test.ts}`,
`src/app/testing/controlledStore.ts` (deferred stores for tests), `src/i18n/en/shell.ts`; changed
`src/app/App.tsx`, `src/app/App.test.tsx`, `src/main.tsx`.

Edge cases / failure modes:
- The settings snapshot arrives before the profile state (or the other way round) → still the
  skeleton until both are in.
- Open error → recovery card even if the address is a tab; nothing behind it renders.
- Onboarding needed while the address names a tab (or Back to an old tab entry) → onboarding again.
- Midnight while hidden: the timer may be throttled; the visibility and `pageshow` events catch up.
  A day change found by any trigger also re-arms the midnight timer.
- DST night: the next midnight comes from `nextLocalMidnight`, which handles a skipped midnight.
- A crash inside the crash card's own tree is not caught again (the card is plain primitives).
- Reload is injectable so tests do not reload jsdom.

Our design differences / decisions:
- The temporary source in `main.tsx` (decided by the lead): settings = defaults (System, Basil,
  nothing hidden), boot = no completed profile → `#/onboarding`, whose placeholder heading is the
  app name. P04-08/09 and P02-04/05 replace it with adapters over the repositories.
- The launch-fill counter (R05.18) is P07-03's; not built here.
- Tab screens are placeholders (a heading with the tab's name) in `Screen.tsx` until P04-10/13.

Tests we will write:
- `Boot.test.tsx`: no Home numbers before the profile read resolves (deferred fake store,
  ACC-A10-1, R05.12); skeleton until both stores resolve; no profile → onboarding; ready on the
  onboarding address → Home; ready keeps the address's tab; open error → recovery card with Reload.
- `TodayProvider.test.tsx`: at 23:59:59 + 1 s today advances (ACC-A11-1, R05.14);
  `visibilitychange` after a date change updates it; `pageshow` too; hidden does nothing; the timer
  re-arms for the night after.
- `ErrorBoundary.test.tsx`: a thrown child shows the crash card; Reload calls the reload function.
- `appState.test.ts`: overlay flag and selected day update and notify; unchanged values do not.
- `App.test.tsx`: the composed app boots to onboarding with the temporary source and shows only
  catalogue text; with a ready profile it shows Home and the tab bar inside the toast provider.

Compare checklist (filled after the rewrite; reopened `FudAINavHost.kt` launch and lifecycle parts,
`MainActivity.kt` splash hold):
- [x] Hold until the profile is read, so fallback goals never show (`Boot.test.tsx > Boot > shows
      no Home numbers before the profile read resolves`) (ACC-A10-1, R05.12); and the settings too
      (`> keeps the skeleton until the settings are read too, whichever arrives first`, R06.22's
      shell part)
- [x] Start on onboarding without a completed profile, else on the app (`Boot.test.tsx > Boot >
      sends a person without a completed profile to onboarding, replacing the address`, `> sends a
      person with a completed profile from onboarding to Home`, `> keeps the tab in the address
      once ready`, `> moves to Home once onboarding is finished`; `App.test.tsx > App > boots to
      onboarding with the temporary source and shows the app name`)
- [x] An open failure never shows the app and never deletes anything (`Boot.test.tsx > Boot >
      shows a recovery card with Reload instead of the app when the data cannot be opened`, R06.4's
      shell part)
- [x] Today moves at local midnight and on return to the foreground (`TodayProvider.test.tsx >
      TodayProvider > moves to the new day at 23:59:59 plus one second`, `> arms the timer again
      for the night after`, `> turns over at midnight after a 23-hour day`, `> checks the date
      again when the page becomes visible after a date change`, `> checks the date again when the
      page is shown from the back-forward cache`, `> waits while the page is hidden`, `> stops its
      timer when unmounted`) (ACC-A11-1, R05.14)
- [x] Crash card with Reload (`ErrorBoundary.test.tsx > ErrorBoundary > shows the crash card when a
      child throws while drawing`, `> reloads when Reload is pressed`; `App.test.tsx > App > shows
      the crash card with Reload when drawing the app fails`)
- [x] Bar hidden on onboarding, shown on tab screens, toasts available everywhere (`App.test.tsx >
      App > shows the skeleton, then Home and the tab bar once the profile and settings are read`,
      `> puts every screen inside the toast provider`)
- [x] App-state flag and day (`appState.test.ts > createAppState > raises and lowers the analysis
      overlay flag, telling listeners each time`, `> holds a selected day and goes back to today
      with null`, `> keeps the same snapshot and stays quiet when nothing changes`, `> stops telling
      a listener that unsubscribed`; `> useAppState > re-renders a component when the flag
      changes`)
- Deliberate differences: a skeleton in the page instead of a held splash; a recovery card for an
  open failure (the reference has no such state); the day is re-checked on `visibilitychange` and
  `pageshow` as well as at midnight.
- Not taken: the foreground-return counter for the launch fill (R05.18, P07-03); the update check,
  quick actions, voice and post-update prompts (later phases or dropped).

## Decisions for the lead

- `src/app/ports.ts`: `ReadStore<T>` (`getSnapshot(): T | undefined`, `subscribe`), `ShellSettings
  { appearance, accent, hiddenTabs }`, `BootState` = `{ status: 'openError' | 'needsOnboarding' |
  'ready' }` with `undefined` meaning "still loading", `ShellPorts { settings, boot }` provided by
  `ShellPortsContext`. `temporaryPorts()` is what `main.tsx` uses until P02-04/05 and P04-08/09
  adapt the repositories. The adapters must return the same snapshot object until something
  changes (`useSyncExternalStore`). `openError` carries no reason yet; P02-01's `DbOpenError`
  kinds can be added as an optional field when the card needs different words.
- "Else to the last tab" is read as: the tab in the address (a reload keeps the person on their
  tab), Home for an empty or onboarding address. Nothing about the last tab is stored.
- `App` takes `ports`, `router`, and optional `clock`, `appState` and `onReload` (tests);
  `main.tsx` builds the router with `createRouter(windowHost())`.
- Tab screens are placeholders in `src/app/Screen.tsx` (a heading with the tab's name) and
  onboarding is `src/app/OnboardingPlaceholder.tsx` (the app name), for P04-09/10/13 to replace.
- The `shell` partition (`src/i18n/en/shell.ts`) is read through `src/app/shellText.ts` (a
  translator over the catalogue plus the partition) until `en.ts` merges it; then
  `export const shellT = t;`. The merged catalogue lints clean (`shellText.test.ts > shellT >
  passes the catalogue lint with the shell partition merged in`).
- `shell.module.css` resets the body margin (`:global(body)`), since the shell owns the page frame.
- `useToday()` throws without a `TodayProvider`, like `useToast()`.

## Status

Done (2026-10-26). Changed outside new files: `src/app/App.tsx`, `src/app/App.test.tsx` (replaced
the placeholder tests with boot tests) and `src/main.tsx`, all in the slice's set.
