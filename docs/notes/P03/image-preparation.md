# Task: image preparation (P03-10) · Phase: 03 · Owner: builder (wt-p03s4)

<!-- Save as platewise/docs/notes/P<nn>/<slug>.md. Write everything above "Compare checklist"
BEFORE writing code, in your own words. Never paste or paraphrase the reference line by line. -->

Read (reference @ `10e14b67`): `A/services/ai/FoodImagePreprocessor.kt` (all: size, quality, what
happens when decoding or encoding fails), `A/services/FoodImageDecoder.kt` (all: orientation, the
two decoders, how the scaled size is computed), then `IT/AIRequestConfigurationTests.swift`
(`foodPhotosAreDownscaledWithoutUpscaling` only). Research spec `03-ai-providers.md` §3.5 (image
preprocessing) and traps R03.12, R03.29; decision D-16.21.

What it does (own words): every photo sent to a model is redrawn by us first. The browser decodes
it the right way up (EXIF orientation applied), we shrink it so its longest side is at most the
size asked for (never enlarging a small photo), draw it on a canvas and encode a fresh JPEG at the
quality asked for. The model gets that JPEG as base64, never the bytes the person picked: a HEIC
or other file sent under a JPEG label made one vendor hang until the timeout (R03.12). A photo the
browser cannot read (HEIC outside Safari, a broken file) or cannot encode fails as image
conversion, so the person sees one clear message (D-16.21). The stored original is not touched.
Food analysis uses 1 600 px at 0.8; the Coach (P08) uses 1 600 px at 0.78 for the model and 700 px
at 0.68 for its thumbnails. A payload estimate (the sum of the base64 lengths) lets callers warn
before a large photo set goes out (R03.29; the warning itself is P2).

Inputs → outputs: `prepareImage(blob, { maxEdge, quality }, backend?)` →
`Result<PreparedImage, SingleFailure>` where `PreparedImage = { mediaType: 'image/jpeg', base64,
bytes, width, height }` and the failure is `{ kind: 'imageConversion' }`.
`estimatePayload(images)` → the summed base64 length in characters.

Files: created `src/ai/image.ts`, `src/ai/image.test.ts`, this note.

Edge cases / failure modes:
- 3 200 × 1 200 → 1 600 × 600; 1 200 × 3 200 (portrait) → 600 × 1 600.
- 800 × 400 keeps its size but is still drawn and encoded as JPEG (no pass-through).
- Exactly 1 600 on the long side: unchanged. A very thin image never drops a side below 1 px.
- Decode rejects (unsupported format, empty or broken file) → imageConversion.
- The decoded size is 0 or not finite → imageConversion.
- Encode rejects, or the canvas gives no blob, or the bytes are not a JPEG (a browser that fell
  back to PNG) → imageConversion. Nothing that is not a JPEG is ever returned.
- A backend that throws synchronously → imageConversion, never a throw from `prepareImage`.
- The decoded pixels are released after encoding, also when encoding fails.
- No `createImageBitmap` in the environment (jsdom, very old browsers) → imageConversion.

Our design differences / decisions:
- The canvas work sits behind a small backend (`decode` → a picture with `toJpeg` and `close`) so
  tests in jsdom use a fake; the default backend uses `createImageBitmap(blob, { imageOrientation:
  'from-image' })` and an `OffscreenCanvas`, or a canvas element where there is none.
- Output is checked for the JPEG start marker (FF D8 FF) instead of trusting the encoder's label:
  a canvas asked for a type it cannot write silently returns PNG.
- The canvas is filled white before drawing, so transparent areas (PNG screenshots) do not turn
  black in the JPEG. Our choice; the reference draws on an opaque canvas.
- One step decode then scale (the browser decodes once); no sample-size pre-shrink and no second
  decoder: the browser picks the decoder. Scaled sides are rounded to the nearest pixel, at least 1.
- Size presets (`FOOD_PHOTO`, `COACH_PHOTO`, `COACH_THUMBNAIL`) live here so P08 reuses them.
- Names are ours (`prepareImage`, `estimatePayload`, `ImageBackend`, `PreparedImage`).

Tests we will write (`image.test.ts`):
- 3 200 × 1 200 → the encoder is asked for 1 600 × 600 and the result says so (ACC-E7-1).
- 800 × 400 → encoded at 800 × 400, the output is the encoder's JPEG, not the input bytes.
- Portrait and exact-edge sizes; a thin image keeps at least 1 px.
- The quality is passed through to the encoder (0.8, 0.68).
- Decode rejection, encode rejection, a non-JPEG output, a zero size, a throwing backend →
  imageConversion; the picture is released in every case.
- base64 round-trips to the encoder's bytes; `bytes` is the JPEG length.
- `estimatePayload` equals the sum of base64 lengths; empty list → 0.
- The browser backend (with stubbed `createImageBitmap` and `OffscreenCanvas`): decodes with
  `imageOrientation: 'from-image'`, draws at the scaled size, asks for `image/jpeg` at the quality,
  closes the bitmap; the canvas-element path when there is no `OffscreenCanvas`; no
  `createImageBitmap` → imageConversion.

Compare checklist (filled after the rewrite; reopened `FoodImagePreprocessor.kt`,
`FoodImageDecoder.kt`, the iOS JPEG encoder in `GeminiService.swift` and
`foodPhotosAreDownscaledWithoutUpscaling`):
- [x] 3 200 × 1 200 → 1 600 × 600, longest side only, never enlarged; 800 × 400 kept (`src/ai/image.test.ts
  > prepareImage: size (03 §3.5) > sends a 3 200 × 1 200 photo at 1 600 × 600 (ACC-E7-1)`,
  `> shrinks a portrait photo by its longest side`, `> never enlarges a small photo, and keeps one
  exactly at the limit`)
- [x] Sides rounded with a 1 px floor, as the iOS encoder does (`> keeps at least one pixel on the
  short side of a very thin photo`)
- [x] Always a freshly encoded JPEG, also when no shrinking is needed; raw bytes never sent
  (`prepareImage: always a fresh JPEG (R03.12) > re-encodes a photo that needs no shrinking and
  sends the JPEG, not the picked bytes`)
- [x] Quality passed to the encoder (`> passes the quality through to the encoder`; thumbnail size
  `prepareImage: size (03 §3.5) > uses the smaller thumbnail size when asked`)
- [x] Undecodable input → imageConversion (`> fails as image conversion when the photo cannot be
  decoded, as HEIC outside Safari`; browser path `browserImageBackend > fails as image conversion
  when the browser cannot decode the photo`, `> … in a browser without createImageBitmap`)
- [x] Encode failure → imageConversion (`> fails as image conversion when encoding fails or does
  not give a JPEG`; `browserImageBackend > fails as image conversion when the canvas element gives
  no image`); zero size → imageConversion (`> fails as image conversion for a decoded size of zero
  or not a number`)
- [x] Decoded pixels released after use, also on failure (`> releases the decoded photo after
  encoding`; the encode-failure test counts one release each)
- [x] EXIF orientation applied by the decoder (`browserImageBackend > decodes upright, draws at the
  scaled size on an OffscreenCanvas and asks for JPEG`); canvas-element fallback (`> uses a canvas
  element where there is no OffscreenCanvas`)
- [x] Payload estimate = sum of base64 lengths (`estimatePayload (R03.29) > sums the base64 lengths
  of the prepared photos`, `> matches the photos prepareImage gives`)
- Mutation check: sending the picked bytes when no shrinking is needed fails 5 tests.
- Deliberate differences: the browser decodes (no fast/slow decoder pair, no sample-size
  pre-shrink); the output is checked for the JPEG marker; transparent areas are filled white before
  drawing; failures are values, never throws.
- Not taken: the header-only longest-side read (used by other reference screens, not by AI upload).

## Decisions for the lead

- `prepareImage(blob, size, backend?)` returns `Result<PreparedImage, SingleFailure>` with
  `{ mediaType: 'image/jpeg', base64, bytes, width, height }`; the adapters (P03-07..09) and the
  client (P03-17) can take `mediaType` and `base64` from it.
- Size presets `FOOD_PHOTO`, `COACH_PHOTO`, `COACH_THUMBNAIL` are exported here for P03-17 and P08.
- The canvas is filled white before drawing (JPEG has no transparency); easy to change in `paint`.

## Status

Done (2026-10-26). Created `src/ai/image.ts`, `src/ai/image.test.ts` (20 tests), this note.
Nothing changed outside the task's files. The "too many or too large photos" warning that uses
`estimatePayload` is P2 (R03.29).
