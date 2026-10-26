# Task: design tokens (P00-02) · Phase: 00 · Owner: builder (wt-p00s2, slice S2)

Read (reference @ `10e14b67`): before writing, nothing of the reference. Sources: decision D-16.1
(`16-what-we-change.md` §2.1), research spec `05-home-progress.md` §3.1.3 (theme behaviour: two
appearances, an accent that colours every progress mark, sizes from 11 up) and §5 (web mapping:
custom properties on the root, applied live), `06-settings-data.md` §3.2 and §5 (Appearance and
Accent rows, our own palette and names), `04-architecture.md` §2 row 7 and §6 (plain CSS with
custom properties; contrast checked in both themes), `00-layout-and-conventions.md` (no colour
literals outside the tokens file, logical properties), `17-naming-and-glossary.md` §1.3 and §2
(`display.accent` values `basil`…; "Accent" is the label). Only after the values below are written:
`A/ui/theme/Color.kt` and `I/Views/Theme.swift`, solely to confirm that no value and no preset
name of ours matches (by an automated comparison, not by reading its palette).

What it does (own words): one stylesheet holds every visual constant of the app as a CSS custom
property, so components never carry a colour, size or duration of their own and a theme switch is
just a change of two attributes on `<html>`. The dark set is the default (it applies with no
attribute at all and under `data-theme="dark"`): a deep green-black base. The light set applies
under `data-theme="light"`. Six accent presets of our own, chosen with `data-accent`, each give
three colours: the accent itself, the ink that sits on top of it (a button label), and a
translucent wash of it for tracks and tinted tiles. Each preset has a dark-theme and a light-theme
variant, because one colour cannot read well on both a near-black and a white card. `tokens.ts`
gives the accent picker the preset ids in display order, the default and each preset's catalogue
key for its name.

Inputs → outputs: the `data-theme` and `data-accent` attributes on the root element → the
resolved custom properties (colour roles, radii, spacing, type, shadows, motion, z-layers,
safe-area insets). `tokens.ts`: `ACCENT_IDS`, `AccentId`, `DEFAULT_ACCENT`, `ACCENT_LABEL_KEYS`
(`Record<AccentId, TKey>`), `isAccentId`, and `PAGE_COLOURS` (the page colour of each theme, which
the theme runtime writes to `<meta name="theme-color">`).

Files: created `src/ui/tokens.css`, `src/ui/tokens.ts`, `src/ui/tokens.test.ts`,
`src/i18n/en/appearance.ts` (accent and appearance names), `src/test/tokenSheet.ts` and
`src/test/tokenSheet.test.ts` (a small parser that resolves the custom properties of tokens.css
for a given pair of attributes, shared by the token and contrast tests); changed `src/i18n/en.ts`
(one import and the `appearance` entry: shared), `src/main.tsx` (imports the stylesheet).

Edge cases / failure modes:
- No attributes yet (before the theme runtime runs, or in a test): the root must still resolve to
  dark + Basil, never to an empty value.
- Light theme without an accent attribute: Light + Basil, not the dark Basil colours.
- Cascade order: an accent's light variant must beat both the light neutrals and the dark accent
  blocks; written as `[data-theme='light'][data-accent='x']` (two attributes) after the one-attribute
  blocks, so specificity, not luck, decides it. The test resolves the cascade the way a browser does
  (specificity, then source order) instead of trusting block order.
- A token declared on a selector other than the root (a descendant rule) would escape the sweep: the
  parser refuses it.
- Reduced motion: every duration drops to 1 ms (not 0, so `transitionend` listeners still fire).
- Font size settings: type sizes are in `rem`, so the browser's text-size setting scales them; the
  stated pixel sizes (11–48) hold at the default 16 px root.
- iPhone notch and home indicator: `env(safe-area-inset-*)` with a `0px` fallback, needing
  `viewport-fit=cover` (already in `index.html`).
- No gradients anywhere (D-16.1); no web fonts, no `@font-face`, no `url(` in the file.

Our design differences / decisions:
- Every value is ours, picked for contrast first: the sweep of P00-03 must pass with no exceptions.
- Colour roles: `--page`, `--card`, `--raised`, `--sheet`, `--line`, `--text`, `--text-muted`,
  `--text-inverse`, `--danger`, `--success`, `--focus`, plus `--scrim` and three shadows; accent
  roles `--accent`, `--accent-ink`, `--accent-soft`. The tested colours are hex (`#rrggbb`, and
  `#rrggbbaa` for the wash) so the test needs no colour-function parser.
- Accent values are strong enough to be used as text (≥ 4.5:1 on every surface), stricter than the
  3:1 the phase row asks for accent marks, because the specs put accent-coloured words in many
  places (a trailing Done, values, a Sort action). The test locks both floors.
- Names: radii `--radius-control` 12, `--radius-card` 18, `--radius-sheet` 24, `--radius-pill`
  999; spacing named by multiples of 4 px (`--space-1` 4 … `--space-6` 24, `--space-8` 32); type
  sizes by role (`--type-micro` 11 … `--type-display` 48) in `rem`; line heights, weights, the
  system sans and mono stacks; `--motion-quick` / `--motion-base` / `--motion-slow` /
  `--motion-count` with two easings; z-layers `--z-sticky` … `--z-toast` (sheet below dialog,
  because a confirmation can open from a sheet; toast on top); `--safe-top/right/bottom/left`.
- The stylesheet also carries a tiny page base (`html` colour scheme, background, text colour and
  font; `accent-color` for native controls) so the placeholder app shows the theme before the P04
  primitives exist. P04 may move it into its own base sheet.
- The accent picker order is the decision's order: Basil, Saffron, Lagoon, Beet, Ember, Ink.
- Catalogue: partition `appearance` holds `appearance.accent.<id>` (the six names) and
  `appearance.mode.{system,light,dark}` (the three appearance choices, used by the theme runtime's
  option list and the P09-02 picker).

Tests we will write:
- `tokens.test.ts`: six ids in order, no duplicates, default `basil`; every label key resolves to
  a distinct, non-empty catalogue name; every id has a `[data-accent='id']` block and a light
  variant in the CSS; radii, spacing, the 11–48 type range in rem, the system font stack with no
  web font, the safe-area variables; `PAGE_COLOURS` equals `--page` of each theme in the CSS and
  `index.html`'s theme-color equals the dark page colour; no gradient in the file; reduced motion
  shortens every duration.
- `tokenSheet.test.ts`: the parser strips comments, keeps declarations in source order, applies
  specificity before order, ignores `@media` blocks for the root resolution, substitutes `var()`,
  and refuses a token on a non-root selector.

Compare checklist (filled after the rewrite; reopened `A/ui/theme/Color.kt` and
`I/Views/Theme.swift` through a comparison script that lists only matches, so their palette was
never read or copied):
- [x] No value matches: 0 exact matches between our 33 colours in `tokens.css` and the 82 colour
      literals of the two files. The one exact match on the first pass was pure white (light card
      and on-accent ink); both are now off-white of our own (`#fcfefc`, `#fbfefc`) and the
      neutrals moved a little further towards green. What remains within 12/255 per channel is
      only near-black and near-white neutrals (ours green-tinted, theirs grey or warm), which every
      dark or light theme has; no accent is within that distance of any reference colour.
- [x] No preset name matches: none of `basil`, `saffron`, `lagoon`, `beet`, `ember`, `ink`
      appears in either file.
- [x] Six ids, default Basil (`src/ui/tokens.test.ts > accent presets > has the six presets of
      D-16.1 in picker order, Basil first and default`); every id has a `[data-accent=…]` block
      and a light variant (`> has a [data-accent] block in tokens.css for every id, in both
      themes`); each preset distinct per theme (`> gives each preset its own accent colour in each
      theme`); names from the catalogue (`> names every preset through the catalogue, each name
      distinct`)
- [x] Dark by default with no attributes, Basil on Light without an accent
      (`src/ui/tokens.test.ts > tokens.css > defaults to the dark theme with the Basil accent when
      the root has no attributes`, `> shows Basil on the light theme when no accent is set`)
- [x] Radii, spacing, type range, system fonts, safe areas, layers, reduced motion, no gradients
      (`src/ui/tokens.test.ts > tokens.css > has the radii 12, 18, 24 and 999`, `> has the spacing
      steps 4 to 32`, `> sizes type from 11 to 48 px in rem, so the browser text size applies`,
      `> uses the system font stack and no web font`, `> exposes the four safe-area insets`, `> has
      shadows, motion and stacking layers, with a dialog above a sheet`, `> cuts every motion
      duration to 1 ms under reduced motion`, `> draws with solid colours only (no gradients,
      D-16.1)`)
- [x] Theme colours in step with the CSS (`src/ui/tokens.test.ts > page colours > match --page of
      each theme in tokens.css`, `> start index.html with the dark page colour as the theme
      colour`)
- [x] The cascade the sweep relies on (`src/test/tokenSheet.test.ts > resolveRootTokens > applies
      specificity before file order`, `> refuses a token declared on a selector that is not about
      the root`)
- Deliberate differences: our own palette, six solid presets instead of the reference's set with
  gradients (D-16.1); a separate dark and light variant per accent instead of a base + tint pair;
  radii 12/18/24/999 (decided).
- Not taken: a gradient or tint pair per accent; recolouring the app icon with the accent (not
  possible for a web app; 06 §5).

## Decisions for the lead

- Accent colours meet 4.5:1 against every surface, so components may use `--accent` for words
  (a trailing Done, values); `contrast.test.ts` locks that floor next to the row's 3:1.
- Accent-ink is dark on the dark theme and off-white on the light theme, for all six presets.
- `tokens.css` carries a small `html` base (background, text colour, system font, line height,
  `accent-color`) so the placeholder shows the theme (Demo M0). No `body` reset: P04 owns the
  shell's base styles and may move the `html` rule there.
- Type sizes are in `rem` (11–48 px at the default 16 px root), named by role: `--type-micro` 11,
  `--type-caption` 13, `--type-body` 15, `--type-lead` 17, `--type-title` 20, `--type-heading` 26,
  `--type-figure` 34, `--type-display` 48. Spacing tokens are named by multiples of 4 px
  (`--space-8` is 32).
- New test helper `src/test/tokenSheet.ts` (+ test): Vitest blanks every `.css` import, `?raw`
  included, unless `test.css` is turned on in `vite.config.ts`, so the helper reads `tokens.css`
  from disk through a dynamically imported `node:fs` (typed locally; the app tsconfig keeps no Node
  types).
- `PAGE_COLOURS` in `tokens.ts` duplicates the two `--page` values (for `theme-color` before the
  stylesheet loads); a test keeps them equal.
- Follow-up (P04/P09-18): until `main.tsx` runs, a page with a light device preference paints the
  dark default for a moment; an inline head script or a `prefers-color-scheme` copy of the light
  neutrals would remove it, but `index.html` beyond the icon links was outside this slice.

## Status

Done (2026-10-26). Tokens, presets, labels and tests in place. Beyond `src/ui`: `src/i18n/en.ts`
(one import and the `appearance` entry; shared), `src/main.tsx` (the stylesheet import) and
`index.html` (the theme-color value), both within the lines the brief named. Handed on: the
accent picker and the Appearance row to P09-02, the theme provider (stored choice → `applyTheme`)
to P04.
