# Task: brand marks (P12-03) · Phase: 12 · Owner: builder (wt-p12s1)

<!-- Save as platewise/docs/notes/P<nn>/<slug>.md. Write everything above "Compare checklist"
BEFORE writing code, in your own words. Never paste or paraphrase the reference line by line. -->

Read (reference @ `10e14b67`): none, on purpose: the reference's app icon and store art stay
closed, as in P00-04. Sources: phase file P12 (row P12-03, "the brand mark keeps our own
plate-and-leaf drawing, on an orange tile"), `docs/notes/P00/brand-icon-set.md`,
`public/icons/mark.svg`, `mark-maskable.svg`, `scripts/render-icons.ts` and its test,
`scripts/android/icons.py`, `palette-and-themes.md`.

What it does (own words): the Platewise mark keeps its drawing (a plate seen from above, rim and
well, with one small leaf resting on it) and moves onto an orange tile. The two SVGs change colours
only: the tile is a vivid orange, the plate rim a warm white, the well a pale peach, and the leaf
the light theme's deep orange so it still reads on the peach at 32 px. The PNGs (192, 512,
maskable 512, touch 180, favicon 32) are rendered again by `scripts/render-icons.ts`, and the
Android launcher icons, the adaptive icon's back layer and the splash images by
`scripts/android/icons.py`, which also writes the two generated colour files.

Inputs → outputs: the two SVGs → `pnpm exec tsx scripts/render-icons.ts` → the five PNGs →
`python3 scripts/android/icons.py` → `mipmap-*/ic_launcher*.png`, `drawable*/splash.png`,
`values/ic_launcher_background.xml` (the maskable icon's corner: orange) and
`values/splash_background.xml` (the manifest background: the dark page).

Files: `public/icons/mark.svg`, `public/icons/mark-maskable.svg`, the five PNGs, the Android
mipmaps and splash PNGs and two colour files (generated), the comment of
`android/app/src/main/res/mipmap-anydpi/ic_launcher*.xml` ("basil back layer" → orange).

Edge cases / failure modes:
- 32 px favicon: the leaf must keep enough value contrast against the well and the rim against the
  tile; colours are picked for that (checked by eye on the rendered PNGs).
- Maskable safe zone: geometry unchanged, so the drawing stays inside the 40 % circle; the render
  script and its test check the pixels.
- Determinism: a second run of the render script gives byte-identical files.
- The SVGs stay flat, self-contained art (`#rrggbb` only, no gradient, image, text or style), as the
  render-icons test requires.

Our design differences / decisions:
- Same drawing, new colours: tile `#e85a0c`, rim `#fff6ee`, well `#ffe2cc`, leaf and stem
  `#cc4e00` (the light theme's accent), vein the well colour. The tile was first the light accent
  itself; side by side at 192 and 32 px it read as burnt next to a vivid orange between the two
  themes' accents, which is what an app icon on a home screen wants. The leaf keeps the deeper
  orange: 3.65:1 on the well, so it holds at favicon size; the rim is 3.33:1 on the tile.
- The icon's rim was `#fff8f2` on the first pass; the reference comparison (see
  `palette-and-themes.md`) found that exact value there, so it moved to `#fff6ee`.

Tests we will write:
- `scripts/render-icons.test.ts` unchanged: sizes, safe zone, flat SVG art.
- Script runs: render twice and compare; `icons.py` run; `pnpm check:assets` through `pnpm check`.

Compare checklist (filled after the rewrite; no reference files: the row keeps them closed):
- [x] PNG sizes and safe zone (`scripts/render-icons.test.ts > the committed icon set > $file has
      its size and stays in the safe zone`; the script's own pixel check printed ok for all five)
- [x] Flat art (`scripts/render-icons.test.ts > the committed icon set > %s is self-contained
      flat art`)
- [x] Deterministic render: two runs of `scripts/render-icons.ts`, `cmp` equal for all five PNGs;
      two runs of `scripts/android/icons.py`, md5 of every Android PNG equal
- [x] No asset equal to a reference asset (`pnpm check --require-ref --strict`: assets PASS, 34
      product assets, none identical)
- Deliberate differences: our own mark (P00-04), now orange (D-16.90).
- Not taken: a new drawing; a monochrome themed-icon layer for Android 13 (follow-up from P11).

## Status

Done (2026-10-27). SVGs recoloured; the five PNGs and every Android launcher, round, foreground
and splash PNG regenerated with the repo's scripts (deterministic on a second run); the two
generated colour files say `#E85A0C` (launcher back layer) and `#131313` (splash). The APK is not
built here (the lead's job); the comment of the two adaptive-icon XML files now says orange.
