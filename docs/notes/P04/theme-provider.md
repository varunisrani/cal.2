# Task: theme provider (P04-06) · Phase: 04 · Owner: builder (wt-p04s3, slice S3)

Read (reference @ `10e14b67`): `I/Views/Theme.swift` (behaviour only: an accent read from settings
with a fallback to the default when the stored value is unknown, the accent used by every accent
element). Also `A/MainActivity.kt` (how appearance System/Light/Dark resolves against the device),
research spec `05-home-progress.md` §3.1.3. Landed runtime: `src/ui/theme.ts` (`applyTheme`,
P00-03). Decisions D-16.1 (six accents, Basil default). Acceptance id ACC-A8-1 (ACC-A8-2 is already
covered by `src/ui/theme.test.ts`).

What it does (own words): one component near the top of the app that keeps the page's colours in
step with the person's appearance and accent settings. It reads the settings snapshot from the
shell ports and hands `{ appearance, accent }` to `applyTheme`, which sets `data-theme` and
`data-accent` on `<html>` and the browser's theme colour. With System the page follows the device
live; Light and Dark ignore the device. Whenever the setting changes the new choice applies at once
and the previous device listener is dropped. Children are rendered as they are and never remounted:
every surface (the gauge, charts) reads CSS variables, so they repaint by themselves. Until the
snapshot is loaded the default choice (System, Basil) is shown, which is what `main.tsx` did before.

Inputs → outputs: settings snapshot (or nothing yet) → attributes on the root element; optional
`root` and `media` props so tests pass their own element and device query.

Files: created `src/app/ThemeProvider.tsx`, `src/app/ThemeProvider.test.tsx`; changed `src/main.tsx`
(the direct `applyTheme(DEFAULT_THEME)` call goes; the provider inside `App` does it).

Edge cases / failure modes:
- Unknown appearance or accent in the snapshot → `applyTheme` shows the default (already tested
  there); the provider passes values through.
- Unmount → the device listener is removed.
- An unchanged snapshot object with the same values → no re-apply (effect keyed on the two values).

Our design differences / decisions:
- No app-icon recolouring (a web manifest is static; spec 05 §3.1.3).
- Applied in a layout effect so the first paint after a change already has the new colours.

Tests we will write (`ThemeProvider.test.tsx`):
- changing the accent setting updates `data-accent` without remounting children.
- System + device dark → `data-theme=dark`, and follows the device when it flips.
- Light ignores a dark device, also when the device flips (ACC-A8-1).
- before the snapshot loads the default (System) is shown; unmount drops the device listener.

Compare checklist (filled after the rewrite; reopened `Theme.swift`, `MainActivity.kt` theme
part):
- [x] The accent comes from settings and recolours at once without redrawing the tree
      (`ThemeProvider.test.tsx > ThemeProvider > updates data-accent when the accent setting
      changes, without remounting its children`)
- [x] System follows the device, live (`ThemeProvider.test.tsx > ThemeProvider > shows dark in
      System mode on a dark device and follows the device live`)
- [x] Light and Dark ignore the device (`ThemeProvider.test.tsx > ThemeProvider > keeps the light
      theme when Light is chosen, even when the device is or turns dark`) (ACC-A8-1)
- [x] An unknown stored accent falls back to the default (already in `src/ui/theme.test.ts`;
      the provider passes values through)
- [x] Before the settings are read: the default, following the device; the listener is dropped on
      unmount (`ThemeProvider.test.tsx > ThemeProvider > shows the default choice, following the
      device, until the settings are read`, `> stops listening to the device when unmounted`)
- Deliberate differences: no app-icon swap (static web manifest).
- Not taken: the reference reads the stored theme before its first frame; ours shows the default
  (System) until the settings snapshot is read, so a person who chose Dark on a light device sees
  the start-up skeleton light for a moment.

## Decisions for the lead

- If that brief light skeleton matters, a small cache of the last applied choice (read in
  `main.tsx` before rendering) would close it; not done here (it is storage outside the
  repositories).

## Status

Done (2026-10-26). `src/main.tsx` no longer calls `applyTheme` itself.
