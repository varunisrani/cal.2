# Task: barcode scanner and typed digits (P06-14) · Phase: 06 · Owner: builder (wt-p06s3b, slice S3b)

<!-- Save as platewise/docs/notes/P<nn>/<slug>.md. Write everything above "Compare checklist"
BEFORE writing code, in your own words. Never paste or paraphrase the reference line by line. -->

Read (reference @ `10e14b67`): `A/ui/home/BarcodeScannerSheet.kt` (all: the camera sheet, its
one-shot guard, the hint card and the close button), `I/ContentView.swift` lines 3740–3770 (the
formats the iOS scanner asks for). The row lists no tests for the scanner. Research spec
`02-food-logging.md` §3.12 ("Scanner") and §3.4 (the pipeline states); decision D-16.18 (camera
plus typed digits); acceptance ACC-D19-2 (the scanner without native support). No REA evidence.

What it does (own words): "Barcode" in the add menu opens a full-screen scanner over Home. The back
camera fills the screen with a close button at the top and a card at the bottom saying what to do
and where products come from. Frames are read one after another until one holds a code; the first
value that is not blank is used once, the scanner closes and the lookup (P06-17) takes over. The
browser's own `BarcodeDetector` reads the frames when it exists and knows our formats; otherwise a
WASM reader (zxing-wasm) is loaded the first time a frame needs it, in a chunk of its own, so the
app's start-up never pays for it. Where the camera can focus on a point, tapping the preview
focuses there. Under the card there is always a field to type the digits (the reference has none):
spaces are ignored, only digits are accepted, 1 to 24 of them. When the browser refuses the camera
the scanner says so and puts the focus in that field; a browser without a camera, or one where the
reader cannot load, says the camera cannot scan here and keeps the field.

Inputs → outputs:
- `src/services/barcode/decoder.ts`: `createScanner(env?)` → `Scanner {openCamera(), watch(video,
  onCode, onBroken?)}`; `openCamera()` → `Result<ScanCamera, 'denied' | 'unavailable'>` with
  `ScanCamera {stream, canFocus, focusAt(x, y), stop()}`; `watch` reads frames on a timer and hands
  the first non-empty trimmed value to `onCode` once, returns its stop. `browserScannerEnv()` is the
  real environment (`navigator.mediaDevices`, `globalThis.BarcodeDetector`, the lazy WASM import, a
  canvas frame grab); tests pass their own.
- `src/services/barcode/wasmReader.ts` (new, the lazy chunk): the zxing-wasm reader with its
  `.wasm` file served from our own build, never a CDN.
- `src/domain/food/barcode.ts`: `readTypedBarcode(text)` → the digits or why they are refused
  (`empty`, `notDigits`, `tooLong`).
- `src/features/log/scan/ScanSheet.tsx`: props `open`, `onCode(code)`, `onClose()`;
  `DigitsField.tsx`: props `onSubmit(code)`, an optional input ref.
- Home: `barcode` in the add menu opens the scanner (sheet id `scan`, so Back closes it); a code
  from the camera or the field closes it and starts the lookup.

Files: created `src/services/barcode/decoder.ts` (+ test), `src/services/barcode/wasmReader.ts`,
`src/domain/food/barcode.ts` (+ test, shared with P06-17), `src/features/log/scan/ScanSheet.tsx` (+
test), `src/features/log/scan/DigitsField.tsx` (+ test), `src/features/log/scan/scan.module.css`,
`src/i18n/en/scan.ts`, this note. Changed: `src/features/log/AddMenu.tsx` (barcode leaves the
not-built list) and its test, `src/features/home/HomePage.tsx` (the scanner sheet) and its test.
Shared, additive: the `scan` line in `src/i18n/en.ts`.

Edge cases / failure modes:
- A frame with no code, or only blank values, reads the next frame; a frame that throws (video not
  ready) too. Once a value is handed on, no frame is read again, even if a read was in flight.
- The scanner closed before the camera answered: the stream that arrives is stopped at once.
- `BarcodeDetector` present but knowing none of our formats (or failing to report them, or
  refusing them when built) → the WASM reader.
- The WASM reader fails to load (offline on first use) → the "cannot scan here" state; typing
  still works.
- `getUserMedia` missing (insecure page, old browser) or no camera → unavailable; refused
  (`NotAllowedError`, `SecurityError`) → denied.
- A laptop has only a front camera: the back camera is asked for as the ideal, not required, so the
  front one still opens.
- Typed text: "0 12345 67890 5" → "012345678905"; letters or punctuation → refused with a line under
  the field; more than 24 digits → refused; empty → the button is off.
- Tap-to-focus only where the track says it can focus on a point; elsewhere a tap does nothing.

Our design differences / decisions:
- Names are ours: `Scanner`, `ScanCamera`, `watch`, `readTypedBarcode`, `ScanSheet`, `DigitsField`.
- Typed digits are ours (D-16.18); the reference has camera only.
- Formats: EAN-13, EAN-8, UPC-A, UPC-E, Code 128, Code 39, Code 93 and ITF on both paths (the
  plan's list); Android reads every format, iOS a list close to this one.
- The camera opens in a full-screen layer of our own (not a bottom sheet) with the Back button
  closing it through the router like every sheet.
- Frames are read every 150 ms after the previous read settles, so decoding never hogs the page;
  the WASM path reads a canvas copy capped at 1 280 px on its longest side.
- No focus ring is drawn after a tap (the reference draws one); the camera's own refocus is the
  feedback. A small follow-up if wanted.

Tests we will write:
- `decoder.test.ts`: native detector built with our formats, first non-empty value once, blank
  values skipped, no WASM load; native without our formats → WASM; no native → the WASM loader is
  called lazily (not on create, once for two watches) with our formats; the default loader imports
  the lazy module (mocked); a stop before a code stops reading; a failed WASM load reports broken;
  `openCamera` asks for the back camera without audio, maps refusals to denied and the rest to
  unavailable; tap focus only where supported; `stop` ends every track.
- `barcode.test.ts` (domain): typed digits with spaces, letters, too long, empty.
- `ScanSheet.test.tsx`: the first value closes the scanner once; camera denied shows the field
  with focus; unavailable says so; typed digits hand on the code; close and Escape; the camera
  stops on close; tap-to-focus.
- `DigitsField.test.tsx`: spaces dropped, letters refused, 25 digits refused, the error clears on
  typing.
- `HomePage.test.tsx`: "Barcode" in the menu opens the scanner; typed digits close it and start the
  lookup.

Compare checklist (filled after the rewrite; reopened `A/ui/home/BarcodeScannerSheet.kt`,
`I/ContentView.swift` lines 3740–3770):
- [x] The first non-blank value, trimmed, is used once and frames after it are not read (tested in
  `src/services/barcode/decoder.test.ts > watch: the browser’s own detector > hands on the first
  non-blank value once, trimmed, and stops reading`, `> reads nothing more once stopped, even when
  a read was under way`; `src/features/log/scan/ScanSheet.test.tsx > ScanSheet > hands on the first
  code it reads, once, however many frames follow (P06-14)`)
- [x] A camera that answers after the scanner closed is turned off at once; closing turns the
  camera off and stops reading (`ScanSheet.test.tsx > ScanSheet > turns off a camera that opens only
  after the scanner closed`, `> turns the camera off and stops reading when it closes`)
- [x] Formats: our eight on both paths, a detector asked only for those it reports; none of ours →
  the WASM reader, as iOS falls back to "unavailable" only when none is available (here a reader is
  always available) (`decoder.test.ts > watch: the browser’s own detector > asks only for the formats
  of ours it reports reading`, `watch: the WASM reader (ACC-D19-2) > takes the WASM reader when the
  browser’s detector reads none of our formats`, `> loads the WASM reader only when the first frame
  needs it, and once`)
- [x] The camera facing away, no sound; refused vs missing (`decoder.test.ts > openCamera > asks for
  the camera facing away, without sound, and stops every track`, `> reads a refusal by the person or
  the page as denied`, `> reads no camera, a busy camera or no camera API as unavailable`); their
  states on screen (`ScanSheet.test.tsx > ScanSheet > says the camera is off and puts the focus in the
  digits when access is refused`, `> says the camera cannot scan here when there is none`)
- [x] Tap-to-focus where supported (`decoder.test.ts > openCamera > focuses on a tapped point where
  the camera can, kept inside the picture`, `> does nothing on a tap where the camera cannot focus on
  a point`; `ScanSheet.test.tsx > ScanSheet > focuses where the picture is tapped, mapped through the
  crop, where the camera can`)
- [x] Close button and the system's back gesture close it (`ScanSheet.test.tsx > ScanSheet > closes
  from its button and from Escape`; Back through the router like every sheet,
  `src/features/home/HomePage.test.tsx > HomePage: barcodes (P06-14, P06-17) > opens the scanner from
  Barcode in the menu (P06-14)` checks it is on the sheet stack)
- [x] Hint card with the hint and where products come from (`ScanSheet.test.tsx > ScanSheet > takes
  its words from a catalogue partition that passes the lint`)
- [x] Typed digits (D-16.18) (`src/domain/food/barcode.test.ts > readTypedBarcode (D-16.18) > …`,
  `src/features/log/scan/DigitsField.test.tsx > DigitsField (D-16.18) > …`, `ScanSheet.test.tsx >
  ScanSheet > hands on typed digits without their spaces (D-16.18)`)
- [x] The WASM reader stays out of start-up: imported only on first use (`decoder.test.ts > watch: the
  WASM reader (ACC-D19-2) > imports the reader chunk on first use, never with this module`) and
  `pnpm check:bundle` lists `wasmReader-*.js` (12.18 kB gzip) as a lazy chunk, the `.wasm` file
  as a separate asset.
- Mutation check: handing on every value instead of the first fails 3 decoder tests; dropping the
  sheet's once-guard fails 1; using a detector that reads none of our formats fails 1.
- Deliberate differences: typed digits (D-16.18); the back camera is the ideal, not a requirement,
  so a laptop's front camera still scans (Android binds only a back camera); one list of eight
  formats on both paths (Android reads every format); a full-screen layer with the hint and the
  digits in a panel under the picture instead of a card over it; no focus ring after a tap; a
  detector without our formats falls back to the WASM reader instead of "unavailable".
- Not taken: the reference's zoom and subject-area refocus on iOS (no web API for either across
  browsers); the camera choice preferring an autofocus lens (browsers do not say which lens is
  which).

## Decisions for the lead

- `src/services/barcode/decoder.ts`: `createScanner(env?)` → `Scanner {openCamera(), watch(video,
  onCode, onBroken?)}`; `ScanCamera {stream, canFocus, focusAt(x, y), stop()}`; formats
  `SCAN_FORMATS` / `WASM_FORMATS`; `browserScannerEnv()` is the real browser. The WASM reader lives in
  `src/services/barcode/wasmReader.ts` (new file), reached only by `import('./wasmReader')`; its
  `.wasm` is served from our build (`zxing-wasm/reader/zxing_reader.wasm?url`, 967 kB raw, 422 kB
  gzip), never the library's CDN default. P10's service worker should not precache it (or should,
  by choice): it loads only on browsers without a usable `BarcodeDetector`.
- `src/domain/food/barcode.ts` also holds `readTypedBarcode` (1–24 ASCII digits after dropping
  spaces) for the digits field.
- Home: sheet id `SCAN_SHEET = 'scan'`; data-ui hooks `scan`, `scan.close`, `scan.preview`,
  `scan.starting`, `scan.denied`, `scan.unavailable`, `scan.hint`, `scan.digitsForm`, `scan.digits`,
  `scan.digits.submit`; the menu row is `home.add.barcode`.
- Test helper note: a state update made in a promise callback (not a store) waits for the end of an
  act scope, so `until` from `src/test/screenHarness.tsx` cannot see it; the Home barcode tests use a
  `settle()` (`act(async () => undefined)`) first. A shared helper would help the next slices.

## Status

Done (2026-10-27). Created `src/services/barcode/decoder.ts` (+ 16 tests),
`src/services/barcode/wasmReader.ts`, `src/domain/food/barcode.ts` (+ 10 tests, shared with
P06-17), `src/features/log/scan/ScanSheet.tsx` (+ 12 tests), `src/features/log/scan/DigitsField.tsx`
(+ 5 tests), `src/features/log/scan/scan.module.css`, `src/i18n/en/scan.ts`, this note. Changed:
`src/features/log/AddMenu.tsx` (barcode leaves `METHODS_NOT_BUILT_YET`) and 2 of its tests,
`src/features/home/HomePage.tsx` (the scanner sheet) and its test. Shared, additive: the `scan` line
in `src/i18n/en.ts`. ACC-D19-2 is now tested.
