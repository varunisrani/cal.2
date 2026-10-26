# Task: theme provider (P04-06) · Phase: 04 · Owner: builder (wt-p04s3, slice S3)

Read (reference @ `10e14b67`): `I/Views/Theme.swift` [210] behaviour only (the accent is read
from one stored choice and every accent element takes it; the gauge is told to redraw when it
changes). Research spec `05-home-progress.md` §3.1.3; `16-what-we-change.md` D-16.1 (six accents
of our own); the P00-03 runtime `src/ui/theme.ts` (`applyTheme`, `resolveTheme`).

What it does (own words): puts the person's stored appearance (System, Light or Dark) and accent on
the page as soon as the settings have been read, and again every time either one changes, from
this tab or another. System follows the operating system live; Light and Dark ignore it. Nothing
below the provider is remounted: every surface, the gauge and the charts read CSS variables, so
switching the attributes on `<html>` recolours what is already drawn.

Inputs → outputs: the settings feed (`display.appearance`, `display.accent`) from the app data
context → `applyTheme({appearance, accent})` on `document.documentElement`, the stop function
called on change and on unmount. Children are rendered as they are.

Files: created `src/app/ThemeProvider.tsx`, `src/app/ThemeProvider.test.tsx`.

Edge cases / failure modes:
- Settings not loaded yet → nothing is applied; the defaults `main.tsx` applied before the first
  render stay (System + Basil), so the skeleton is themed.
- Settings read failed → defaults stay.
- A value the schema does not know never arrives here (the settings repository shows the default
  and quarantines the stored value); `applyTheme` also falls back to the default accent.
- No `matchMedia` (old browsers, jsdom) → System shows dark, as `applyTheme` decides.
- Unmount → the OS listener is removed (the stop function).

Our design differences / decisions:
- No remount, no context value for colours: the provider only writes attributes; screens never
  read the theme in JS.
- An optional `root`/`media` pair exists for tests only through `applyTheme`'s own parameters; the
  provider takes no props besides children.

Tests we will write:
- Changing the accent setting updates `data-accent` without remounting children (a child counts
  its mounts).
- System + OS dark → `data-theme="dark"`; the OS turning light follows live.
- Switching to Light ignores the OS (dark device stays light, and an OS change does nothing)
  (ACC-A8-1).
- Nothing is applied before the settings load.
- Unmount stops following the OS.

Compare checklist (filled after the rewrite; reopened `Theme.swift` and, for the start-up
read of the theme, `A/MainActivity.kt` lines 165–200):
- [x] Accent from the one stored choice, applied to every accent element at once, no remount
      (tested in `src/app/ThemeProvider.test.tsx > ThemeProvider > updates data-accent when the
      accent setting changes, without remounting children`)
- [x] System follows the OS live (tested in `src/app/ThemeProvider.test.tsx > ThemeProvider > shows
      dark in System mode on a dark device and follows the device live`; by hand in Chromium:
      emulating a light OS turned `data-theme` to light without a reload)
- [x] Light and Dark ignore the OS (ACC-A8-1) (tested in `src/app/ThemeProvider.test.tsx >
      ThemeProvider > keeps the light theme on a dark device once Light is chosen (ACC-A8-1)`)
- [x] Nothing applied before the settings are read; the OS listener ends on unmount (tested in
      `src/app/ThemeProvider.test.tsx > ThemeProvider > leaves the page alone until the settings
      are loaded`, `> stops following the device when it unmounts`)
- Gap found: the reference reads appearance and accent before its first frame; ours applies them
  when the first settings snapshot arrives, so the start-up skeleton shows on the default theme
  for that moment (a stored Light on a dark device: a dark skeleton, then light). Not closed here
  (see Decisions).
- Deliberate differences: six accents of our own (D-16.1); no app-icon swap (not possible for a
  web app).
- Not taken: nothing else.

## Decisions for the lead

- Possible follow-up for the start-up theme: keep the last applied choice in `localStorage` and
  apply it in `main.tsx` before the first render (one line there plus a small cache helper). Not
  done: it duplicates a setting outside IndexedDB and touches `main.tsx`.

## Status

Done (2026-10-27). Theme provider with tests; checked by hand in headless Chromium.
