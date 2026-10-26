# Task: design tokens (P00-02) · Phase: 00 · Owner: builder (wt-p00s2, slice S2)

Read (reference @ `10e14b67`): nothing before writing. The phase row allows `A/ui/theme/Color.kt`
(and the brief adds `I/Views/Theme.swift`) **only after** our values are written, to confirm that
none of our values or preset names match; the palette is never sampled. Sources: research spec
`05-home-progress.md` §3.1.3 (theme behaviour) and §5 (web mapping: presets as CSS custom
properties, applied live, our own palette and list), D-16.1 in `16-what-we-change.md`, the naming
table `17-naming-and-glossary.md` §1.3–1.4 (`display.accent`, preset ids), `04-architecture.md`
§6 (contrast checked in both themes), the conventions file (plain CSS with tokens, no colour
literals outside the tokens file) and the lead's task brief.

What it does (own words): one CSS file holds every visual constant of the app as a custom
property, so components never carry a colour, radius, size or duration of their own. The app is
dark first: with no attribute on the root element it shows the dark theme (a deep green-black
neutral base) with the Basil accent, so the very first paint, before any script runs, already
looks right. `data-theme="light"` swaps every neutral colour role for the light set. Six accent
presets of our own (Basil, Saffron, Lagoon, Beet, Ember, Ink) each set three properties: the
accent itself (fills, marks, accent text), the colour of text placed on it, and a translucent wash
used for tracks behind progress fills. The accent values differ per theme (bright on dark, deep on
light) so each passes the contrast sweep in both. `tokens.ts` gives TypeScript the preset ids, the
default, each preset's catalogue label key (for the picker of P09-02) and the two page colours
(for the theme-color meta of P00-03).

Inputs → outputs: attributes on the root element (`data-theme`, `data-accent`) → the custom
properties the rest of the CSS reads. `tokens.ts`: `ACCENT_IDS`, `AccentId`, `DEFAULT_ACCENT`,
`ACCENT_LABEL_KEYS` (typed `TKey`), `isAccentId()`, `THEMES`, `ThemeName`, `PAGE_COLOURS`.

Files: created `src/ui/tokens.css`, `src/ui/tokens.ts`, `src/ui/tokens.test.ts`,
`src/ui/testing/tokenSheet.ts` (a tiny parser and cascade resolver for `tokens.css`, shared by
the token and contrast tests) with `src/ui/testing/tokenSheet.test.ts`,
`src/i18n/en/appearance.ts` (labels); changed `src/i18n/en.ts`
(one import, one `enPartitions` entry: shared file).

Edge cases / failure modes:
- No attributes at all (first paint, or a script error before `applyTheme`): dark + Basil.
- `data-theme="light"` with no `data-accent`: light + Basil (the light Basil block also matches
  `:not([data-accent])`).
- Specificity: the light accent blocks combine both attributes (two attribute selectors), so they
  beat the single-attribute dark accent blocks wherever they sit in the file.
- An unknown `data-accent` value from stale storage: CSS falls back to the `:root` Basil values;
  `isAccentId()` lets callers reject it before it reaches the DOM.
- The page colour lives in two places (CSS for painting, `PAGE_COLOURS` for the meta tag); a test
  keeps them equal.
- Reduced motion: durations drop to 0 ms under `prefers-reduced-motion: reduce`.
- A user who enlarges text: type sizes are in `rem`, so they scale with the browser setting.

Our design differences / decisions:
- Six presets with our own names and values (D-16.1); one colour per role, no gradients, no
  base+tint pair. The wash (`--accent-soft`) is the accent at a fixed alpha, not a second colour.
- Accents are theme-aware: `[data-accent=<id>]` holds the dark values (dark is the default), and
  `[data-theme=light][data-accent=<id>]` the light ones. Each preset therefore has a block for
  each theme.
- Colour roles: `--page`, `--card`, `--raised`, `--sheet`, `--line`, `--text`, `--text-muted`,
  `--text-inverse`, `--danger`, `--success` (goal lines), `--focus`, plus `--scrim` (the dim
  layer behind sheets and dialogs) and three shadows. Colours are 6-digit hex, so the sweep can
  read them; translucent values use `rgb(r g b / a)`.
- Scales: radii `--radius-control` 12, `--radius-card` 18, `--radius-sheet` 24, `--radius-pill`
  999; spacing `--space-1` … `--space-8` named by 4 px steps (4, 8, 12, 16, 20, 24, 32; no
  `--space-7`); type sizes `--type-label` 11 … `--type-hero` 48 in `rem`, weights and line
  heights; motion `--motion-quick` / `--motion-base` / `--motion-slow` with two easings; z-layers
  `--layer-*`; safe-area insets `--safe-top|right|bottom|left` from `env()`.
- Font: the system stack only (`system-ui` first), no `@font-face`, no `url()`.
- The file ends with a three-line base rule for `html` (page background, text colour, system
  font) and `body { margin: 0 }`, so the placeholder app shows both themes (Demo M0). Component
  styles stay out of this file.
- Labels live in a new catalogue partition `appearance` (`appearance.accent.<id>`,
  `appearance.mode.<system|light|dark>`); the words are the preset names themselves.

Tests we will write (`src/ui/tokens.test.ts`):
- Six ids in picker order, default `basil`, `isAccentId` accepts each and rejects others.
- Every id has a `[data-accent=…]` block for dark and a light block, and each sets exactly
  `--accent`, `--accent-ink` and `--accent-soft`; no two presets share an accent colour.
- Every label key resolves through `t()` to the preset's name.
- `PAGE_COLOURS` equals `--page` resolved from the CSS in each theme.
- No attributes resolves like dark + Basil; light without an accent resolves like light + Basil.
- Every colour role is defined in both themes; radii and spacing scales as specified; type sizes
  within 11–48 px; no gradients, no `@font-face`, no `url(`.

Compare checklist (filled after the rewrite; reopened `A/ui/theme/Color.kt` [86] and
`I/Views/Theme.swift` [210] only to look for collisions, with a throwaway script outside the repo
that compared hex literals and searched for our preset names; nothing was taken from them):
- [x] Preset names differ: none of `basil`, `saffron`, `lagoon`, `beet`, `ember`, `ink` occurs in
      either file, and the reference's default key and preset names (05 §3.1.3, 06 inventory)
      share none of ours (tested in `src/ui/tokens.test.ts > accent presets > has six presets in
      picker order with basil as the default`)
- [x] No colour value of ours equals a reference value, except pure white `#ffffff` (our light
      card and the ink on light accents), which no palette can avoid. Our 42 colours against the
      reference's 43 hex literals: no accent of ours is within 12 RGB steps (per channel) of any
      of theirs; our near-black and near-white neutrals sit 3–12 steps from some neutral of
      theirs, as any near-black or near-white would, and none is equal
- [x] Every theme × accent passes the contrast targets (tested in `src/ui/contrast.test.ts > token
      contrast sweep > …`, 84 cases: 7 checks × 2 themes × 6 accents)
- [x] Six ids, default basil, a block per id (tested in `src/ui/tokens.test.ts > accent presets >
      has a dark and a light block for <id> in tokens.css`, 6 cases; `> gives every preset its own
      accent colour in the <theme> theme`)
- [x] Labels typed as `TKey` and resolvable (tested in `src/ui/tokens.test.ts > accent presets >
      names every preset through the catalogue`)
- [x] Defaults and fallbacks (tested in `src/ui/tokens.test.ts > themes > shows dark with basil
      when the root has no attributes`, `> falls back to basil in the light theme when the accent
      is missing or unknown`)
- [x] Page colour kept in step (tested in `src/ui/tokens.test.ts > themes > keeps PAGE_COLOURS
      equal to --page in the <theme> theme`, `> starts index.html with the dark page colour as
      its theme-color`)
- [x] Scales, fonts, safe areas, no gradients (tested in `src/ui/tokens.test.ts > scales > …`,
      6 tests)
- Deliberate differences: six solid presets of our own instead of 18 base-and-tint pairs drawn
  as gradients (D-16.1); a green default instead of a pink one; the accent has a separate value
  per theme; one muted grey per theme of our own choosing; no app-icon swap per accent.
- Not taken: anything from the two files beyond the collision check.

## Decisions for the lead

- **Theme-aware accents.** Each preset has two blocks: `[data-accent=<id>]` (dark values; dark
  is the default theme) and `[data-theme=light][data-accent=<id>]` (light values). A single
  value per preset could pass the sweep in both themes only inside a narrow luminance band (dull
  on dark, weak on light); two values let every accent reach at least 4.5:1 against the card in
  both themes, so the accent can also colour text ("Done", accent values). Measured minima:
  accent vs card 6.64:1 (dark, Beet) and 5.36:1 (light, Basil).
- **Fallbacks.** No attributes → dark + Basil; light without (or with an unknown) accent → light
  + Basil. The light Basil block also carries `[data-theme='light']` alone for that.
- **Extra role `--scrim`** (the dim layer behind sheets and dialogs) and three shadows per theme
  (`--shadow-card`, `--shadow-raised`, `--shadow-sheet`).
- **Names.** Spacing `--space-1|2|3|4|5|6|8` (n × 4 px, no 7); radii `--radius-control|card|
  sheet|pill`; type `--type-label` 11, `-small` 13, `-body` 15, `-lead` 17, `-title` 20,
  `-heading` 24, `-display` 32, `-figure` 40, `-hero` 48 (in rem); `--weight-*`, `--leading-*`;
  `--motion-quick|base|slow` (0 ms under reduced motion), `--ease-standard|out`;
  `--layer-content|sticky|tabbar|sheet|dialog|toast`; `--safe-top|right|bottom|left`.
- **Base rule** at the end of `tokens.css`: `html` gets the page background, text colour, system
  font and body line height; `body` loses its margin. Needed for Demo M0 (both themes visible);
  component styles stay out of the file.
- **Catalogue partition `appearance`** (`src/i18n/en/appearance.ts`): `appearance.mode.system|
  light|dark` and `appearance.accent.<id>`. Landing it = the import and the `appearance` entry
  in `enPartitions` (already in this worktree's `src/i18n/en.ts`, shared file).
- **Reading CSS in tests.** Vitest empties every CSS import, `?raw` included, so the tests read
  `tokens.css` from disk through `src/ui/testing/tokenSheet.ts` (`process.getBuiltinModule`,
  with the minimal `process` type the app tsconfig needs). The same helper parses the sheet and
  resolves the cascade for a pair of root attributes; later CSS tests can reuse it.

## Status

Done (2026-10-26). Tokens, presets, labels and the shared test helper are in place with tests.
Lines outside the slice's own files: `src/i18n/en.ts` (one import, one `enPartitions` entry).
