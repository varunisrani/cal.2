# Task: theme runtime and contrast check (P00-03) · Phase: 00 · Owner: builder (wt-p00s2, slice S2)

Read (reference @ `10e14b67`): none. The phase row lists no reference file: applying a theme to
a web page has no counterpart worth reading, and the behaviour is described in research spec
`05-home-progress.md` §3.1.3 (System / Light / Dark, System follows the OS live, changes apply
at once) and §5 (`prefers-color-scheme` plus an explicit override on the root element).
Contrast targets come from the phase row (WCAG 2 ratios, L9 in `03-feature-inventory.md`,
`04-architecture.md` §6) and acceptance rows ACC-A8-2 and ACC-A9-2.

What it does (own words): one call puts the person's appearance and accent on the page.
`applyTheme({ appearance, accent }, root, media)` writes `data-theme` (`dark` or `light`) and
`data-accent` on the root element and sets the browser's theme colour (the `<meta
name="theme-color">` that tints the status bar and the installed app's title bar) to the page
colour of the theme in use. Light and Dark are fixed choices. System reads the operating
system's colour scheme and keeps listening, so switching the phone to dark mode recolours the app
without a reload. The call returns an unsubscribe that stops the listening; the theme provider of
P04-06 calls it before applying a new choice. `contrast.ts` holds the WCAG maths (relative
luminance from sRGB, contrast ratio of two hex colours), and its test sweeps the real
`tokens.css` in both themes for every accent so a palette change that hurts legibility fails CI.

Inputs → outputs:
- `applyTheme(choice, root = document.documentElement, media = the
  `(prefers-color-scheme: dark)` query)` → `() => void` (unsubscribe). Side effects: two
  attributes on `root`, the content of the theme-color meta in `root`'s document.
- `resolveTheme(appearance, systemIsDark)` → `'dark' | 'light'`.
- `parseHex('#rgb' | '#rrggbb')` → `{ r, g, b }` (0–255); `relativeLuminance(hex)` → 0…1;
  `contrastRatio(a, b)` → 1…21, symmetric.

Files: created `src/ui/theme.ts`, `src/ui/theme.test.ts`, `src/ui/contrast.ts`,
`src/ui/contrast.test.ts`; changed `src/main.tsx` (imports `tokens.css`, applies the default
theme before render).

Edge cases / failure modes:
- No `matchMedia` (old browser, jsdom): System falls back to dark, the app's default, and nothing
  is listened to.
- The theme-color meta is missing: create it in `<head>`, so later updates have a target.
- An accent id that is not one of ours (stale or hand-edited storage): use Basil.
- An appearance value that is not `light` or `dark`: treat it as System.
- Calling the unsubscribe twice, or for a fixed appearance (nothing to remove): harmless.
- Hex input: `#rgb` and `#rrggbb`, either case; anything else (names, `rgb()`, alpha) throws,
  because a contrast ratio for a translucent colour depends on what is behind it.

Our design differences / decisions:
- The page colours come from `PAGE_COLOURS` in `tokens.ts` (kept equal to the CSS by a test)
  instead of `getComputedStyle`, so the meta update needs no style recalculation and works in
  jsdom.
- The default media query is `(prefers-color-scheme: dark)`; a browser that reports no
  preference reports light, which is what System should show then.
- The contrast sweep checks the phase row's targets, with no exceptions: text ≥ 7:1 and muted
  text ≥ 4.5:1 on page and card (we also check raised and sheet, the other surfaces text sits
  on), accent ≥ 3:1 against card, accent-ink ≥ 4.5:1 on accent, danger ≥ 4.5:1 on card. Two
  additions for non-text marks (WCAG 1.4.11): the focus ring ≥ 3:1 against page and card, and
  the success colour (goal lines) ≥ 3:1 against card.
- The sweep reads the real `tokens.css` (`?raw` import) through `src/ui/testing/tokenSheet.ts`,
  a small parser that applies the cascade (specificity, then order) for a given pair of root
  attributes. It refuses a custom-property rule whose selector it cannot evaluate, so a new
  selector shape cannot slip past the sweep unchecked.

Tests we will write:
- `theme.test.ts` (a fake `MediaQueryList`): System follows a change live (dark → light →
  dark); System starts from the current OS value; Light and Dark ignore changes and attach no
  listener; `data-accent` is set, an unknown id falls back to Basil; the theme-color meta gets the
  page colour, follows System changes, and is created when missing; the unsubscribe stops
  updates and removes the listener.
- `contrast.test.ts`: #000 / #fff = 21; equal colours = 1; order does not matter; `#fff` equals
  `#ffffff`; known pairs (#767676 on white ≈ 4.54, #777777 on white ≈ 4.48, mid-grey #808080 on
  black ≈ 5.32); invalid input throws; the token sweep for 2 themes × 6 accents.

Compare checklist (filled after the rewrite; no reference files reopened: the row lists none):
- [x] System follows a media change live (tested in `src/ui/theme.test.ts > applyTheme > follows
      the operating system live in System mode`; ACC-A8-2) and starts from the current scheme
      (`> starts from the current operating system scheme in System mode`)
- [x] Light / Dark ignore it and listen to nothing (tested in `src/ui/theme.test.ts > applyTheme >
      keeps Light when the operating system turns dark, and listens to nothing`, `> keeps Dark
      when the operating system turns light, and listens to nothing`; the first is ACC-A8-1 at
      unit level, its review stays with P04-06)
- [x] theme-color meta updated (tested in `src/ui/theme.test.ts > applyTheme > puts the page
      colour of the theme in use in the theme-color meta`, `> adds a theme-color meta when the
      page has none`; live with System in `> follows the operating system live in System mode`)
- [x] Unsubscribe stops updates (tested in `src/ui/theme.test.ts > applyTheme > stops following
      the operating system once unsubscribed`); a new call replaces the old listening (`> replaces
      the listening of an earlier call on the same root`)
- [x] Accent written, unknown id → Basil (tested in `src/ui/theme.test.ts > applyTheme > sets the
      accent, and basil for an id that is not a preset`)
- [x] No `matchMedia` → dark; default query (tested in `src/ui/theme.test.ts > applyTheme > shows
      dark in System mode where matchMedia is missing`, `> uses the browser colour-scheme query by
      default`)
- [x] #000 / #fff = 21, known pairs (tested in `src/ui/contrast.test.ts > contrastRatio > is 21 for
      black on white, either way round`, `> is 1 for a colour against itself`, `> matches known
      pairs`; `> relativeLuminance > runs from 0 for black to 1 for white`; `> parseHex > …`,
      8 tests)
- [x] Token sweep, both themes × every accent (tested in `src/ui/contrast.test.ts > token contrast
      sweep > <theme> theme with <accent>: …`, 84 cases; ACC-A9-2)
- [x] The sweep's resolver applies the cascade and refuses selectors it cannot evaluate (tested in
      `src/ui/testing/tokenSheet.test.ts > resolveTokens > …`, 5 tests)
- [x] By hand on the built app (`vite preview`, Playwright Chromium): System with an OS in dark
      then light shows `data-theme` dark / light, the page background and theme-color follow,
      and flipping the emulated scheme recolours the open page without a reload.
- Deliberate differences: n/a (no reference behaviour read).
- Not taken: a contrast check of the accent fill against its translucent track (`--accent-soft`
  over the card); it needs alpha compositing and no target asks for it yet.

## Decisions for the lead

- **A new `applyTheme` on the same root stops the previous call's listening** (a `WeakMap` per
  root). `main.tsx` applies the default (System, Basil) before render and keeps following the OS;
  when the theme provider of P04-06 applies the stored choice, the default's listener goes away
  by itself, so listeners can never stack. P04-06 should still call the returned stop in its
  effect cleanup.
- **Page colours come from `PAGE_COLOURS`** in `tokens.ts`, not from `getComputedStyle`; tests
  keep them equal to `tokens.css` and to the `index.html` theme-color.
- **Sweep additions beyond the phase row** (all pass): text and muted text also on `raised` and
  `sheet`; `text-inverse` ≥ 7:1 on `text`; `focus` ≥ 3:1 on page and card; `success` ≥ 3:1 on
  card (WCAG 1.4.11 for the focus ring and goal lines).
- **Measured minima** over 2 themes × 6 accents: text 13.73:1 (dark, on raised); muted 6.33:1
  (dark, on raised); accent vs card 6.64:1 (dark, Beet) and 5.36:1 (light, Basil); accent-ink on
  accent 7.33:1 (dark, Beet) and 5.36:1 (light, Basil); danger on card 7.94:1 (dark) and 6.50:1
  (light); focus 5.85:1; success 5.61:1.
- **Exports for P04-06 and P09-02** from `theme.ts`: `APPEARANCES`, `Appearance`,
  `APPEARANCE_LABEL_KEYS` (`appearance.mode.*`), `ThemeChoice`, `DEFAULT_THEME`,
  `SYSTEM_DARK_QUERY`, `resolveTheme`, `systemSchemeQuery`, `applyTheme`. Unknown appearance
  values are treated as System, unknown accents as Basil.

## Status

Done (2026-10-26). `applyTheme`, the WCAG maths and the sweep are in place with tests; ACC-A8-2
and ACC-A9-2 now have tests. Lines outside the slice's own files: `src/main.tsx` (the
`tokens.css` import and the default `applyTheme` call before render).
