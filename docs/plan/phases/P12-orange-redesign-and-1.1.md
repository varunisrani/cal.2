# P12 · Orange redesign and the 1.1 release

**Weeks:** 1 · **Tracks:** design system, brand assets, release · **Depends on:** P00–P11 · **Status:** ✅ done: all 5 tasks landed (2026-10-28; 1.1.0 released in the repository with P13; the APK sent to the owner)

## Goal

The owner asked (2026-10-28) for a new look across the whole app with orange as the primary colour, a light theme (white and orange) and a dark theme (dark and orange), and for 1.1 (the Android app with Health Connect, P11) to be released with it, as an APK. Every colour, size and layer already comes from `src/ui/tokens.css` (components carry no literal values), so the redesign is a new palette, a refresh of the shared components and the brand marks, then a screen-by-screen review in both themes.

## Decisions

- **D-16.90** (changes D-16.1's palette; the owner's request): Orange is Platewise's brand and the default accent. Light theme: white and near-white neutrals with warm grey lines and dark text; the orange is deep enough that white text on it and orange text on white pass WCAG AA (4.5:1). Dark theme: neutral charcoal (no green tint) with a bright orange accent and dark ink on it. The other accent presets stay as choices in Settings › App, after Orange; a stored choice is kept. Still no gradients; the contrast floors in `src/ui/contrast.test.ts` and the axe gate (`e2e/a11y.spec.ts`) apply to both themes and every preset.
- The brand mark keeps our own plate-and-leaf drawing, on an orange tile.
- **1.1.0:** `package.json` 1.1.0, CHANGELOG dated, the Android `versionCode` 2 so the APK installs over 1.0.0. Tags and GitHub releases only when the owner asks.

## Tasks (5)

| ID | Task | Verify |
|---|---|---|
| P12-01 | **Palette and themes.** tokens.css: the new light and dark neutrals, an `orange` accent preset (first, default) with dark and light variants, washes, focus, danger and success retuned to sit with orange; tokens.ts (`ACCENT_IDS`, `DEFAULT_ACCENT`, `PAGE_COLOURS`), theme defaults, the accent picker label (i18n), `<meta name="theme-color">`, the manifest colours, Capacitor and Android status-bar and splash colours. | contrast and tokens tests for every theme × preset; the a11y spec in both themes. |
| P12-02 | **Shared components.** A refreshed look in src/ui and the shell: primary buttons as orange pills, cards with larger radii and soft elevation, the tab bar with an orange active indicator, the + button, sheets, segmented controls, switches, fields, the gauge and pillars, charts in the accent. | unit tests unchanged or updated; no literal colours outside tokens.css. |
| P12-03 | **Brand marks.** `public/icons/mark.svg` and `mark-maskable.svg` on an orange tile; PNGs regenerated with the render script; Android icons and splash regenerated with `scripts/android/icons.py`. | render-icons tests; the APK shows the orange icon. |
| P12-04 | **Screen review.** Screenshots of every main screen in light and dark (onboarding, Home with food, water, a fast and the activity card, the + menu and a food review, Progress, Coach, Settings and its pages, Health Connect page), outside the repo; fix what the review finds in the feature CSS modules (hierarchy, spacing, headers, empty states) using tokens only. | the review set before and after; e2e and a11y green. |
| P12-05 | **Release 1.1.0.** Version, CHANGELOG (1.1.0 with the redesign and the Android app), release checklist section for 1.1, HANDOFF, the APK (versionName 1.1.0, versionCode 2). | the full loop green; `aapt dump badging` shows 1.1.0 / 2. |
