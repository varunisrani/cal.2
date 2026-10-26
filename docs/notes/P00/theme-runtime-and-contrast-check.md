# Task: theme runtime and contrast check (P00-03) · Phase: 00 · Owner: builder (wt-p00s2, slice S2)

Read (reference @ `10e14b67`): none. The phase row lists no reference counterpart: the runtime is
browser plumbing and the contrast maths is the published WCAG 2.x definition. Sources: research
spec `05-home-progress.md` §3.1.3 (System follows the device live; a change applies at once
everywhere) and §5, `06-settings-data.md` §3.2 (Appearance row: System / Light / Dark, applies
immediately) and §5 (only `theme-color` can change at run time), `04-architecture.md` §6
(contrast checked in both themes), acceptance ids ACC-A8-2 and ACC-A9-2, inventory row L9.

What it does (own words): `applyTheme` puts a person's appearance and accent choice on the page.
It writes `data-accent` and a resolved `data-theme` (`light` or `dark`) on the root element, and
sets `<meta name="theme-color">` to the page colour of the resolved theme so the browser's own
bars match the app. With System it reads the device preference and keeps listening, so a device
switch to dark mode recolours the open app without a reload; Light and Dark ignore the device.
It returns a function that stops the listening; the caller runs it before applying a new choice.
`contrast.ts` computes WCAG relative luminance and contrast ratios for hex colours, and blends a
translucent colour over an opaque one. A test reads `tokens.css`, resolves the custom properties
for both themes × every accent, and fails if any pair the app relies on is below its floor.

Inputs → outputs:
- `applyTheme({ appearance, accent }, root?, media?)` → unsubscribe `() => void`. `root` defaults
  to `document.documentElement`; `media` to `matchMedia('(prefers-color-scheme: dark)')` when the
  browser has it, else nothing (System then means dark, our default).
- `resolveTheme(appearance, prefersDark)` → `'light' | 'dark'`.
- `relativeLuminance('#rrggbb')` → 0…1; `contrastRatio(a, b)` → 1…21 (order-free);
  `parseHex` accepts `#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa`; `blend(top, bottom)` → opaque hex.

Files: created `src/ui/theme.ts`, `src/ui/theme.test.ts`, `src/ui/contrast.ts`,
`src/ui/contrast.test.ts`; changed `src/main.tsx` (applies the stored default, System + Basil,
before the first render).

Edge cases / failure modes:
- `matchMedia` missing (old browsers, jsdom): System falls back to dark, no listener, no throw.
- An unknown accent id from old or hand-edited storage: falls back to Basil rather than leaving a
  `data-accent` that no CSS block matches.
- No `<meta name="theme-color">` in the document: one is created in `<head>`, so the runtime does
  not depend on the page shell.
- Calling the unsubscribe twice, or after a fixed appearance (no listener): harmless.
- A media change arriving after the unsubscribe: ignored, even if the browser delivers one queued
  event late (the handler checks a flag as well as being removed).
- Translucent colours in a contrast check: refused with an error (blend first), so the sweep never
  measures a wash as if it were opaque.
- The 2.x luminance formula's low-end threshold: we use 0.04045 (the sRGB standard value); the
  older 0.03928 gives identical results for 8-bit channels.

Our design differences / decisions:
- The media argument is a minimal interface (`matches`, `addEventListener('change')`,
  `removeEventListener`) so a test passes a hand-made fake and a real `MediaQueryList` fits it.
- The page colours for `theme-color` come from `PAGE_COLOURS` in `tokens.ts` (a test keeps them
  equal to `--page` in the CSS) instead of `getComputedStyle`, so the meta is right even before the
  stylesheet has loaded and in jsdom.
- Floors in the sweep, both themes × six accents, measured on every surface (`--page`, `--card`,
  `--raised`, `--sheet`), which is stricter than "page and card": text ≥ 7:1, muted text ≥ 4.5:1,
  accent ≥ 3:1 (and ≥ 4.5:1 as text, see the tokens note), accent-ink on accent ≥ 4.5:1, danger ≥
  4.5:1. Extra non-text floors (WCAG 1.4.11, 3:1): focus ring on page and card, success (goal
  lines) on card, the accent against its own wash laid over a card (a filled track must stand out
  from its empty part). Text-inverse on text ≥ 7:1 (an inverse toast).
- The default theme with no attributes is checked to equal Dark + Basil.

Tests we will write:
- `theme.test.ts`: System follows a fake media query live (dark → light → dark); Light and Dark
  ignore a change; theme-color updated to the page colour on apply and on a live change; the meta
  is created when missing; unsubscribe stops updates (and is safe twice); an unknown accent falls
  back to Basil; no `matchMedia` → dark; `resolveTheme` table.
- `contrast.test.ts`: `#000` vs `#fff` = 21; same colour = 1; order does not matter; known pairs
  (`#777777` on white ≈ 4.48, `#767676` ≈ 4.54, pure blue on white ≈ 8.59); shorthand hex; bad
  hex throws; translucent input throws; `blend` of half black over white; the token sweep.

Compare checklist (filled after the rewrite; no reference files: the row says none, so the
comparison is against the row's Verify cases, ACC-A8-2 and ACC-A9-2):
- [x] System follows a mocked media query change live, both ways, with the theme colour
      (`src/ui/theme.test.ts > applyTheme > in System mode a device theme change applies without a
      reload`; ACC-A8-2). Also checked once by hand in Chromium on the built app (`emulateMedia`
      dark → light → dark flipped `data-theme`, the meta and the page background; not committed)
- [x] Light and Dark ignore it (`src/ui/theme.test.ts > applyTheme > keeps %s whatever the device
      does`, two cases)
- [x] theme-color updated (`src/ui/theme.test.ts > applyTheme > sets the theme, the accent and the
      theme colour`, `> adds a theme-color meta when the page has none`, `> updates every
      theme-color meta the page has`)
- [x] Unsubscribe stops updates (`src/ui/theme.test.ts > applyTheme > stops following the device
      once unsubscribed`, `> ignores a change the browser had already queued before the
      unsubscribe`, `> hands over cleanly when a new choice replaces System`)
- [x] Fallbacks (`src/ui/theme.test.ts > applyTheme > shows dark for System when the browser
      cannot report a preference`, `> falls back to the defaults for values from old or edited
      storage`, `> uses the document root and the device query by default`)
- [x] #000/#fff = 21 (`src/ui/contrast.test.ts > contrast maths > rates black on white 21 and a
      colour on itself 1`); known pairs (`> matches known pairs`); parsing and blending (`> reads
      short and long hex, with or without alpha`, `> refuses a translucent colour until it is
      blended`, `> blends a translucent colour over an opaque one`)
- [x] The token sweep, both themes × six accents, no exceptions (`src/ui/contrast.test.ts > token
      contrast sweep > meets every floor: $theme theme, $accent accent`, 12 cases; `> defines every
      colour role as hex in both themes and every accent`; `> keeps surfaces and inks opaque and
      the accent wash translucent`; ACC-A9-2). A deliberate bad value (dark muted text, a light
      Ember accent) made it fail with readable lines, then was reverted.
- Deliberate differences: n/a (no reference behaviour read for this task).
- Not taken: watching the `display.*` settings (P04's theme provider calls `applyTheme`).

Lowest measured ratios (for the record): text 13.9 (dark, raised); muted 6.05 (dark, raised);
accent 5.12 (light Basil, page); accent-ink on accent 5.54 (light Basil); danger 5.82 (light,
page).

## Decisions for the lead

- `applyTheme(choice, root = document.documentElement, media = matchMedia(...) or null)`: the
  third argument is a minimal `SchemeQuery` (`matches`, `addEventListener('change')`,
  `removeEventListener`), so a real `MediaQueryList` fits and tests pass a fake. Without
  `matchMedia`, System shows dark (the default theme).
- An unknown appearance or accent (old or edited storage) shows System / Basil instead of writing
  an attribute no CSS block matches.
- The theme colour comes from `PAGE_COLOURS` (tokens.ts), not from `getComputedStyle`.
- `theme.ts` also exports `APPEARANCES`, `APPEARANCE_LABEL_KEYS`, `DEFAULT_THEME`,
  `resolveTheme`, `isAppearance` and `PREFERS_DARK_QUERY` for P04's provider and P09-02's picker.
- The sweep is stricter than the row: every surface (page, card, raised, sheet), accent as text ≥
  4.5:1, and non-text floors for focus, success and the accent against its own wash.
- `main.tsx` keeps the System listener for the page's lifetime; when P04's provider takes over it
  should own the unsubscribe and replace that call.

## Status

Done (2026-10-26). Theme runtime, contrast maths and the sweep are in place; `main.tsx` applies
System + Basil before the first render. Trap ids: none owned. Acceptance: ACC-A8-2 and ACC-A9-2
can move from `Review: P00-03` to the `Test:` lines named above.
