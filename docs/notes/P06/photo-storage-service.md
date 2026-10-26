# Task: photo storage service (P06-02) · Phase: 06 · Owner: builder (wt-p06s1a, slice S1a)

<!-- Save as platewise/docs/notes/P<nn>/<slug>.md. Write everything above "Compare checklist"
BEFORE writing code, in your own words. Never paste or paraphrase the reference line by line. -->

Read (reference @ `10e14b67`): `A/services/FoodImageStore.kt` (the store and thumbnail parts: the
new-photo write, the restore write, the viewer and thumbnail loads, the thumbnail writer, the
"smaller or original" and "downscaled for storage" helpers, the size constants),
`A/services/FoodImageDecoder.kt` (all: orientation, the two decoders, the bounded decode, the
header-only size read), `I/Services/StoredPhotoCompressor.swift` (all: the cap, the quality, when a
copy is kept, the background job that skips restored files), `IT/StoredPhotoCompressorTests.swift`
(the new-photo, small/undecodable, not-smaller and restore cases). Research spec
`02-food-logging.md` §3.19 and trap R02.19; decision D-16.21. Acceptance id ACC-D28-2. No Evidence
ids.

What it does (own words): the one place a new meal photo becomes a stored photo. The browser
decodes the picked file the right way up (EXIF orientation applied). A file it cannot decode (HEIC
outside Safari, a damaged file) is refused as `unsupportedImage` and nothing is written (D-16.21).
A photo whose longest side is over 2 048 px is redrawn upright at 2 048 px and encoded as JPEG at
quality 0.80; that copy is kept only when it is smaller than the picked file, otherwise the picked
bytes are kept as they are (an already well-compressed photo would grow). A photo of 2 048 px or
less keeps its bytes. Every stored photo gets a 320 px JPEG thumbnail at quality 0.76, drawn from
the upright pixels, so thumbnails are never sideways. One rule on every platform (R02.19: the
reference's phone apps differ; we take the "cap only when smaller" rule). Display copies are made
on demand and never stored: a 720 px preview for the capture cards and a viewer copy of at most
2 048 px. Nothing here ever rewrites a stored photo: restored photos (a backup, P09) and photos
already stored keep their bytes; a missing thumbnail is made from them lazily. Photos sent to the
AI are prepared separately by `src/ai/image.ts` (P03-10) and never stored.

Inputs → outputs:
- `src/lib/imageCodec.ts`: `ImageCodec.decode(blob)` → an upright `Picture {width, height,
  toJpeg(maxEdge, quality), close()}` or null when the browser cannot decode it;
  `fitWithin(width, height, maxEdge)` → the scaled size; `browserImageCodec` (createImageBitmap
  with `imageOrientation: 'from-image'`, an OffscreenCanvas or a canvas element).
- `src/services/photos.ts`: `createPhotoService({photoRepo, codec?})` → `PhotoService`:
  `store(file)` → `{kind: 'stored', id}` or `{kind: 'unsupportedImage'}`; `thumbnail(id)`,
  `preview(id)`, `viewer(id)` → a Blob or null (missing or undecodable photo).

Files: created `src/lib/imageCodec.ts`, `src/lib/imageCodec.test.ts`, `src/services/photos.ts`,
`src/services/photos.test.ts`, `src/test/fakeImageCodec.ts` (a fake codec for jsdom tests, used by
P06-03 too), this note. Shared, additive: `photos` in `Services` (`src/services/context.tsx`) and
its wiring in `src/main.tsx`.

Edge cases / failure modes:
- 4 000 × 3 000 → a 2 048 × 1 536 JPEG at 0.80 when that is smaller; the row records the stored
  copy's size.
- A large photo whose 2 048 px copy is not smaller (heavily compressed) → the picked bytes, with
  the decoded size.
- Exactly 2 048 px, or 1 000 px → the picked bytes, no re-encode at all.
- The 2 048 px encode fails → the picked bytes (the photo is still stored).
- The thumbnail encode fails → the photo is stored without one; `thumbnail(id)` makes it later.
- A portrait photo tagged "rotate" decodes upright, so the cap, the stored copy and the thumbnail
  all use the upright size.
- Undecodable → `unsupportedImage`, no row written; the decoded pixels are always released.
- `preview`/`viewer` on a photo already within the size → the stored blob itself; over it → a
  fresh JPEG of the right size, the row unchanged; missing or undecodable → null.
- `thumbnail` on a photo with no thumbnail (a restored row) → makes one, stores it with
  `setThumb`, leaves the photo's bytes untouched.
- A decoded size of 0 or not a number → treated as undecodable.
- No `createImageBitmap` (jsdom, very old browsers) → the browser codec decodes nothing.

Our design differences / decisions:
- Names are ours (`imageCodec`, `Picture`, `fitWithin`, `PhotoService`, `store`, `preview`,
  `viewer`, `thumbnail`).
- Photos are blobs in IndexedDB rows (P02-07), not files; the thumbnail lives in its photo's row.
- The browser decodes once and the canvas scales (no sample-size pre-shrink, no second decoder, no
  header-only size read): `createImageBitmap` applies the orientation and picks the decoder.
- The cap is applied before the write (like the Android app), not by a background job that
  rewrites the file later: nothing ever rewrites a stored photo, so "restored photos are never
  re-encoded" holds by construction (the backup restore, P09, writes rows as they are).
- The canvas is filled white before drawing (a JPEG has no transparency); the encoder's output
  must be a JPEG, else that encode counts as failed.
- Display copies (preview 720 px, viewer ≤ 2 048 px) are encoded at the storage quality (0.80); no
  memory cache in this service (the capture sheet asks once per card).
- No "Compress photos" tool, no storage usage, no thumbnail-cache clearing: those are Settings
  tools (P09) over `photoRepo`.

Tests we will write:
- `imageCodec.test.ts`: `fitWithin` (landscape, portrait, at the edge, never enlarged, ≥ 1 px);
  the browser codec with stubbed `createImageBitmap` and `OffscreenCanvas`: decodes with
  `imageOrientation: 'from-image'`, draws at the fitted size on a white fill and asks for
  `image/jpeg` at the quality; the canvas-element fallback; a rejected decode (HEIC), a missing
  `createImageBitmap` and a zero size → null; a non-JPEG encoder output rejects; `close` releases.
- `photos.test.ts` (fake codec, real photo repository): 4 000 px stored at 2 048 when smaller;
  a well-compressed large photo kept as original; 1 000 px untouched; thumbnail 320 px at 0.76 from
  upright pixels; HEIC decode failure → `unsupportedImage` with no blob written (ACC-D28-2);
  failed big encode → original kept; failed thumbnail → stored without one; lazy thumbnail leaves a
  restored row's bytes unchanged (R02.19); preview at 720 and viewer at most 2 048, rows unchanged.

Compare checklist (filled after the rewrite; reopened `A/services/FoodImageStore.kt` (store,
restore, viewer, thumbnail, helpers), `A/services/FoodImageDecoder.kt`,
`I/Services/StoredPhotoCompressor.swift`, `IT/StoredPhotoCompressorTests.swift`):
- [x] Over 2 048 px → upright JPEG at 0.80 capped at 2 048 px, kept only when smaller
  (`smallerOrOriginal`, `downscaledForStorage`, `newPhotosAreCapped…`) (`src/services/photos.test.ts >
  store: one rule for new photos (R02.19) > stores a 4 000 px photo as a 2 048 px JPEG at 0.80 when
  that copy is smaller`)
- [x] A copy that is not smaller keeps the original bytes (`photosWhoseDownscaledCopyIsNotSmaller…`)
  (`photos.test.ts > store: one rule for new photos (R02.19) > keeps the original bytes of a large
  photo whose 2 048 px copy is not smaller`)
- [x] Within the cap (and exactly at it) the bytes are not re-encoded (`smallOrUndecodableDataIsNotReencoded`)
  (`photos.test.ts > store: … > leaves a 1 000 px photo untouched, and one exactly at 2 048 px too`)
- [x] An encode failure falls back to the original bytes (`downscaledForStorage` returns nothing)
  (`photos.test.ts > store: … > keeps the original when the 2 048 px copy cannot be encoded`)
- [x] Thumbnail 320 px at 0.76, upright (the legacy thumbnail cache lost orientation)
  (`photos.test.ts > store: … > writes a 320 px JPEG thumbnail at 0.76 from the upright picture`, `>
  gives a small photo a thumbnail too`; orientation: `src/lib/imageCodec.test.ts > browserImageCodec >
  decodes with the photo’s EXIF orientation applied and reports the upright size`)
- [x] A thumbnail missing from disk is made on first load from the full photo (`loadThumbnail`)
  without touching the photo (`photos.test.ts > stored photos are never rewritten (R02.19) > makes a
  missing thumbnail for a restored 4 000 px photo and leaves its bytes as they were`, `> hands back a
  stored thumbnail without decoding anything`, `> has no thumbnail for a missing photo or one that
  does not decode`; a failed thumbnail at store time: `store: … > stores the photo without a
  thumbnail when none can be encoded, and makes it on first use`)
- [x] Restores are byte-identical, never re-compressed (`restoreBytes`, `…RestoresKeepTheirBytes`):
  nothing in the service rewrites a stored row (same restored-photo test as above)
- [x] Viewer at most 2 048 px; previews at 720 px (`loadForViewer`, the capture card decode)
  (`photos.test.ts > display copies > previews at 720 px and gives the viewer at most 2 048 px,
  leaving the row as it was`, `> shows a photo already within the size as it is stored, without
  decoding it`, `> gives the viewer a stored 2 048 px photo as it is, and previews it at 720 px`, `>
  has nothing to show for a missing photo or one that does not decode`)
- [x] Stored cap equals the viewer cap (`storedCapMatchesTheViewerDecodeCap`) (`photos.test.ts >
  store: … > uses the sizes the plan names`)
- [x] Scaled size: longest side to the cap, never enlarged, at least 1 px (`scaledToMaxDimension`)
  (`imageCodec.test.ts > fitWithin > …` all four)
- [x] Decoded pixels are released (`bitmap.recycle()`) (`photos.test.ts > store: … > releases every
  picture it decodes`; `imageCodec.test.ts > browserImageCodec > releases the decoded pixels on
  close`, `> decodes nothing for a picture of no size, and releases it`)
- [x] An undecodable file (HEIC outside Safari) is refused with nothing written — deliberate,
  D-16.21 (`photos.test.ts > store: … > refuses a photo the browser cannot decode, as HEIC outside
  Safari, and writes nothing (ACC-D28-2)`; browser side `imageCodec.test.ts > browserImageCodec >
  decodes nothing when the browser cannot read the file, as HEIC outside Safari`, `> decodes nothing
  in a browser without createImageBitmap`)
- [x] Canvas fallback and JPEG-only output (`imageCodec.test.ts > browserImageCodec > draws at the
  fitted size on a white fill and asks for a JPEG at the quality`, `> uses a canvas element where
  there is no OffscreenCanvas`, `> rejects when the canvas element gives no image`, `> rejects when
  the encoder gives something other than a JPEG`, `> never draws a small picture larger than it is`)
- Mutation check: keeping the capped copy even when larger fails 1 test; dropping the "within the
  cap" shortcut fails 1 test.
- Deliberate differences: an undecodable photo is refused instead of stored as is (D-16.21); the
  cap is applied before the write instead of by a background job with a file-identity check, so
  nothing ever rewrites a stored photo; one decoder (the browser's) instead of a fast/slow pair and
  a header-only size read; the canvas is filled white before drawing; display copies are encoded
  JPEGs (a page shows an image from a URL, not a bitmap) at the storage quality.
- Not taken: the in-memory thumbnail cache and its device-class sizes, thumbnail pre-warming,
  storage usage and "Compress photos" and "Clear thumbnail cache" (Settings, P09, over `photoRepo`),
  restore staging (P09), exercise photos (no workouts in v1), the legacy thumbnail folder cleanup.

## Decisions for the lead

- `PhotoService` (`src/services/photos.ts`): `store(file)` → `stored {id}` | `unsupportedImage`;
  `thumbnail(id)` (lazy, saved with `setThumb`), `preview(id)` (720 px), `viewer(id)` (≤ 2 048 px)
  → Blob or null. Constants `STORED_EDGE`, `STORED_QUALITY`, `THUMB_EDGE`, `THUMB_QUALITY`,
  `PREVIEW_EDGE`, `VIEWER_EDGE` are exported. `store` rejects only on a storage error (the capture
  draft service turns that into "not saved").
- No `restore(blob)` here: a backup restore (P09) must keep photo ids, so it writes rows as they are
  in the data layer; "never re-encoded" holds because only `store` re-encodes. Rows restored without
  a thumbnail get one from `thumbnail(id)` on first use.
- `src/lib/imageCodec.ts` (`ImageCodec`, `Picture`, `fitWithin`, `longestSide`,
  `browserImageCodec`) is separate from `src/ai/image.ts` as asked; the two could share the canvas
  code later.
- New test helper `src/test/fakeImageCodec.ts` (a fake codec whose blobs carry their size in a
  header, so they decode after a trip through fake-indexeddb; `hold()` pauses decodes). Later photo
  work (P06-04 review strip, P08 Coach thumbnails) can use it.
- `photos` is optional in `Services` (like the other slice's `aiSetup`) so the existing test
  stand-ins still type-check; `main.tsx` always provides it. Make it required once those stand-ins
  carry one.
- Display copies are encoded on each call (no cache); the capture sheet asks once per card. A small
  cache can come with the review strip if needed.

## Status

Done (2026-10-26). Created `src/lib/imageCodec.ts` (+ 14 tests), `src/services/photos.ts` (+ 17
tests), `src/test/fakeImageCodec.ts`, this note. Shared, additive: `photos` in `Services`
(`src/services/context.tsx`) and its wiring in `src/main.tsx`. Trap R02.19 and ACC-D28-2 are now
tested.
