# Task: brand icon set (P00-04) · Phase: 00 · Owner: builder (wt-p00s2, slice S2)

Read (reference @ `10e14b67`): none, and on purpose: the reference's app icon, its alternate
icons and its store graphics stay closed (phase row and the lead's brief). Sources: D-16.1 (our
own palette, Basil default), `17-naming-and-glossary.md` §1 (our mark is `public/icons/mark.svg`),
`06-settings-data.md` §5 (manifest icons are static; no icon swapping), the P00-04 row.

What it does (own words): Platewise gets a mark of its own: a plate seen from above (an outer rim
and an inner well) with one small leaf resting on it, drawn in flat Basil colours on a deep basil
tile. It exists as two hand-written SVGs, the mark (a rounded tile, for "any" purpose) and a
maskable variant (a full-bleed square whose drawing sits inside the central safe circle, so a
launcher can crop it to any shape). A script renders the PNG sizes a web app needs with the
Playwright Chromium that is already installed: 192 and 512 (the manifest's "any" icons), a
maskable 512, a 180 touch icon for iOS home screens, and a 32 favicon. The output is
deterministic, so re-running the script never changes the committed files, and it checks the size
written in each PNG header.

Inputs → outputs: `public/icons/mark.svg`, `public/icons/mark-maskable.svg` →
`icon-192.png`, `icon-512.png` (from the mark), `icon-maskable-512.png`, `touch-180.png` (from the
maskable variant: iOS fills transparency with black and rounds the corners itself, so it needs a
full-bleed square), `favicon-32.png` (from the mark). `index.html` gains the favicon (PNG 32 and
the SVG) and touch-icon links.

Files: created `public/icons/{mark.svg,mark-maskable.svg,icon-192.png,icon-512.png,
icon-maskable-512.png,touch-180.png,favicon-32.png}`, `scripts/render-icons.ts`,
`scripts/render-icons.test.ts`; changed `index.html` (icon links; theme-color set to our dark
page colour).

Edge cases / failure modes:
- Determinism: fixed viewport, device scale 1, the SVG inlined as a data URL so nothing is fetched,
  the image decoded before the screenshot, transparent background for the rounded mark, no
  animations, one browser per run. Two runs must give byte-identical files.
- The leaf and the rim must still read at 32 px: few shapes, no hairlines, strong value contrast
  between tile, plate and leaf.
- Maskable safe zone: the whole drawing inside a circle of radius 40 % of the size around the
  centre. The script checks the rendered pixels (every pixel outside that circle must equal the
  background), which holds whatever the SVG's structure (first planned as a geometry check on the
  SVG; the pixel check replaced it because it does not depend on how the paths are written).
- A PNG with the wrong size (a wrong viewport or clip): the script reads each written file's IHDR
  and exits non-zero on a mismatch or a bad signature.
- Chromium missing: the script fails with Playwright's own error; it never runs
  `playwright install`.

Our design differences / decisions:
- The geometry and colours are ours; the colours are the Basil preset's (deep basil tile, light
  plate, bright and deep basil leaf), with no gradient.
- The SVGs are hand-written source, the PNGs generated: edit the SVG, re-run the script, commit
  both.
- Playwright is imported lazily inside the render function, so the PNG header helper can be unit
  tested without starting a browser.

Tests we will write:
- `scripts/render-icons.test.ts` (node environment): the IHDR reader returns width and height of a
  minimal PNG header and rejects a wrong signature or a short file; the PNG decoder undoes every
  row filter; the safe-zone counter; the committed PNGs have their sizes and the maskable ones
  stay in the safe circle; the SVGs hold no gradient, no `<image>`, no external reference.
- Script runs: `pnpm exec tsx scripts/render-icons.ts` twice, then `cmp`/`git status` to prove the
  PNGs are identical; `pnpm check:assets` (no file identical to a reference asset).

Compare checklist (filled after the rewrite; no reference files: the row forbids opening the
icon and store art, and none was opened):
- [x] Two runs give byte-identical PNGs: `pnpm exec tsx scripts/render-icons.ts` twice, `cmp` of
      all five files against a copy of the first run's output: identical (5/5), same SHA-256 list
- [x] Each PNG has the stated size, read from its IHDR by the script after writing and by
      `scripts/render-icons.test.ts > the committed icon set > $file has its size and stays in the
      safe zone` (5 cases); reader and decoder (`> readPngHeader > reads the size, depth and
      colour type from IHDR`, `> refuses a file that is not a PNG`, `> decodePng > undoes every
      row filter of an RGBA image`)
- [x] Maskable safe zone: no pixel outside the 40 % circle in `icon-maskable-512.png` and
      `touch-180.png` (script check; `> checkIcon > reports a maskable render that draws outside
      the safe zone`). The plate reaches 33.6 % of the size.
- [x] Our own flat art (`scripts/render-icons.test.ts > the committed icon set > %s is
      self-contained flat art`); `pnpm check:assets`: 7 product assets, none identical to a
      reference asset
- Deliberate differences: a static icon (no per-accent icon variants; 06 §5).
- Not taken: a monochrome or SVG-only favicon for every browser (the PNG 32 and the SVG are both
  linked; browsers pick).

## Decisions for the lead

- Mark: a 512 tile in deep Basil (`#1d7647`, the light-theme Basil accent), a plate (rim
  `#fcfefc`, well `#d1e4d8`, a Basil wash on the light page) and one leaf in deep Basil with a
  pale midrib. The maskable variant is the same drawing on a full-bleed square.
- `touch-180.png` is rendered from the maskable SVG (iOS fills transparency with black and rounds
  corners itself); `favicon-32.png`, `icon-192.png` and `icon-512.png` from the rounded mark, with
  transparent corners.
- `index.html` links `favicon-32.png` (32×32 PNG), `mark.svg` (SVG icon) and `touch-180.png`
  (apple-touch-icon); the theme-color is the dark page colour `#09120d`. The web app manifest
  (icons 192/512/maskable 512) is not part of this slice.
- The script also decodes PNGs (8-bit RGB/RGBA, what Chromium writes) for the safe-zone check;
  Playwright is imported lazily so the helpers are unit-tested without a browser. Exit codes: 0
  done, 1 a check failed, 2 the browser could not run.

## Status

Done (2026-10-26). Two SVGs, five PNGs, the render script and its test are in place; `index.html`
has the icon links. Nothing outside the brief's files.
