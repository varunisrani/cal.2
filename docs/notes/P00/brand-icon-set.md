# Task: brand icon set (P00-04) · Phase: 00 · Owner: builder (wt-p00s2, slice S2)

Read (reference @ `10e14b67`): none, by rule. The reference's app icon, launcher art and store
graphics were never opened (phase row: "do not open the reference's `appicon.png` or store
graphics"). Sources: the phase row, D-16.1 (our palette), `05-home-progress.md` §3.1.3 and §5
(app-icon recolouring is out: manifest icons are static), and the W3C manifest notion of a
maskable icon (safe zone: a centred circle with a radius of 40 % of the icon).

What it does (own words): Platewise gets its own mark: a plate seen from above (a rim and a
well, two concentric circles) with a small leaf lying in the well, drawn on a deep green-black
tile. Colours are the Basil preset's bright and deep greens on the dark page colour. Two SVG
sources exist: `mark.svg` (rounded tile, for browser tabs and "any" manifest icons) and
`mark-maskable.svg` (full-bleed square, plate shrunk into the safe zone, for launchers that cut
their own shape and for iOS, which rounds corners itself and fills transparency with black). A
script renders the PNG sizes a web app needs with Playwright's Chromium, the same way every time,
so the PNGs in the repo can be regenerated and compared byte for byte.

Inputs → outputs: `public/icons/mark.svg`, `public/icons/mark-maskable.svg` →
`icon-192.png` (mark), `icon-512.png` (mark), `icon-maskable-512.png` (maskable),
`touch-180.png` (maskable: opaque) and `favicon-32.png` (mark), all in `public/icons/`.
`index.html` links the 32 px favicon, the SVG mark as a scalable favicon and the 180 px touch
icon. The manifest (P09-18) will list the 192, 512 and maskable 512 PNGs.

Files: created `public/icons/mark.svg`, `public/icons/mark-maskable.svg`, the five PNGs,
`scripts/render-icons.ts`, `scripts/render-icons.test.ts` (the PNG header reader); changed
`index.html` (icon links; theme-color kept equal to the dark page colour).

Edge cases / failure modes:
- Determinism: fixed viewport, device scale 1, sRGB colour profile forced, no GPU, no text in the
  mark (no font hinting differences); the SVG is drawn as an `<img>` whose decode is awaited
  before the screenshot. Two runs on one machine must give identical bytes.
- A PNG of the wrong size (a zoom or a scale factor slipping in): the script reads each PNG's
  IHDR chunk and fails with the file name and both sizes.
- Not a PNG, or a truncated file: the header reader throws.
- Transparency: the rounded tile leaves transparent corners in the "any" icons and the favicon;
  the maskable and touch icons are fully opaque.
- Small sizes: at 32 px the rim, well and leaf must still read; the leaf is large relative to the
  well and has no detail thinner than about 1 px at that size except the midrib.
- No Chromium installed for Playwright: Playwright's own launch error is shown; the script never
  installs anything.

Our design differences / decisions:
- Our own geometry and colours (D-16.1); nothing taken or traced from the reference. No
  per-accent icon variants (the reference swaps its iOS icon per accent; a web manifest cannot).
- The touch icon is rendered from the maskable source (opaque, plate inside the safe zone),
  which suits iOS rounding.
- The script writes the PNGs and checks each header; the "run twice, compare" check is done with
  `git diff --exit-code public/icons` / `cmp` as the phase row says, not inside the script.
- The PNG header reader is exported and unit tested (`scripts/render-icons.test.ts`, node
  environment); the browser part runs only when the file is executed.

Tests we will write:
- `scripts/render-icons.test.ts`: reads width and height from a hand-made PNG header; rejects a
  non-PNG signature, a short buffer and a first chunk that is not IHDR; the icon list names the
  five PNGs with the sizes of the phase row and only our two SVG sources.
- By hand (reported with counts): two runs of `pnpm exec tsx scripts/render-icons.ts` and `cmp`
  of every PNG; `pnpm check:assets`.

Compare checklist (filled after the rewrite; no reference files opened, by rule):
- [x] Two runs give byte-identical PNGs (run by hand: two runs of `pnpm exec tsx
      scripts/render-icons.ts`, `cmp` of all five files: identical; a third run after the last
      script edit matched them too)
- [x] Each PNG has the stated size (the script's IHDR check on every write; tested in
      `scripts/render-icons.test.ts > icon set > has <file> in public/icons at <size> px`, 5
      cases, and `> renders the five PNGs of the phase row from our two marks`)
- [x] The header reader (tested in `scripts/render-icons.test.ts > readPngSize > …`, 5 tests)
- [x] No file identical to a reference asset (`pnpm check:assets`: PASS, 7 product assets, none
      identical)
- [x] Colours: the tile is the dark page colour `#0b1210`, the rim and leaf Basil's dark-theme
      accent `#62cc85`, the well and midrib Basil's light-theme accent `#1d7a43`; the rendered
      pixels carry exactly those sRGB values (checked by hand on the PNGs)
- [x] Transparency: the favicon and "any" icons have transparent corners; the maskable and touch
      icons are opaque RGB (checked by hand on the PNGs)
- Deliberate differences: our own mark; no per-accent icon variants (a manifest icon is static).
- Not taken: the reference's icon and store art (never opened).

## Decisions for the lead

- **Geometry.** 512 viewBox: rounded tile (radius 112), rim r 188, well r 134, a lens-shaped
  leaf (base 200,312 to tip 322,190) with a short stem and a midrib. The maskable variant has a
  square full-bleed tile and the plate scaled by 0.86 (diameter 63 % of the icon, inside the
  80 % safe circle).
- **Which source feeds which PNG:** `favicon-32`, `icon-192`, `icon-512` from `mark.svg`;
  `icon-maskable-512` and `touch-180` from `mark-maskable.svg` (iOS rounds corners itself and
  fills transparency with black).
- **`index.html`** links the 32 px PNG favicon, the SVG mark as a scalable favicon and the touch
  icon; its theme-color is now the dark page colour `#0b1210` (was `#0f1412`), guarded by
  `src/ui/tokens.test.ts`.
- **Determinism is per machine.** Chromium's rasteriser can differ between builds or platforms,
  so a CI step that re-renders and runs `git diff --exit-code public/icons` could fail on another
  machine although nothing changed. Suggest keeping re-render-and-diff a local step (as the
  phase's loop lists it) and relying on `scripts/render-icons.test.ts` for sizes in CI.
- **Extra test file** `scripts/render-icons.test.ts` (node environment): the header reader and the
  committed PNG sizes. The script loads Playwright only when run, so the test needs no browser.

## Status

Done (2026-10-26). Both SVG marks, the five PNGs and the render script are in place. Lines
outside the slice's own files: `index.html` (three icon links, the theme-color value).
