# Task: lookup order and label memory (P06-17) · Phase: 06 · Owner: builder (wt-p06s3b, slice S3b)

<!-- Save as platewise/docs/notes/P<nn>/<slug>.md. Write everything above "Compare checklist"
BEFORE writing code, in your own words. Never paste or paraphrase the reference line by line. -->

Read (reference @ `10e14b67`): `A/services/BarcodeProductLookup.kt` (all: the order, the two
outcomes, the ingredient variant), `A/models/BarcodeLabelMemory.kt` (all: the comparison key, which
misses fall through, the newest label entry, the product details of a label scan, the one-shot
hand-off), `T/services/BarcodeProductLookupTest.kt`, `T/models/BarcodeLabelMemoryTest.kt`,
`IT/BarcodeLabelMemoryTests.swift` (all). Research spec `02-food-logging.md` §3.12 (lookup order,
saved-label memory, errors shown), §3.4 (the error state's Scan label), traps R02.14, R02.15, R02.20.
Acceptance ACC-D20-1, ACC-D20-2, ACC-D21-1, ACC-J9-1. The clients it calls landed with P06-15 and
P06-16 (`off.ts`, `fdc.ts`); the diary already finds the newest label entry by key
(`diaryRepo.latestLabelFor`, P02-06).

What it does (own words): a scanned or typed code is looked up in a fixed order, the same wherever
a barcode comes from. Open Food Facts goes first, and a product it has nutrition for always wins.
Only when it does not know the product or has no nutrition for it does the app look further: first
at the person's own diary, for the newest entry made from a photo of this product's label (codes
compared without leading zeros, so a 12-digit UPC-A and its 13-digit EAN-13 form match), then at
FoodData Central when the person stored a key. When nothing is found the person sees Open Food
Facts' own failure, except a key FoodData Central refuses, which gets its own message. Any other
Open Food Facts failure (rate limit, outage, offline, time-out, an unreadable reply, a code that is
not digits) stops there. A product found opens the review as a stored draft, so a reload brings it
back; Open Food Facts' product photo, when it can be fetched, becomes the draft's photo. A saved
label reopens as a review draft marked as coming from the saved label, so the review can say that
deleting those entries forgets the label. After a miss (not found, no nutrition, refused key) the
failure's main action is "Scan label": it remembers the code once and opens the meal-photos sheet
with the camera; the next photo analysis takes the code and runs as a label scan for this product.
Every other way out (closing that sheet, choosing another method, Cancel) forgets the code, so a
stale code never ties an unrelated meal to a product.

Inputs → outputs:
- `src/domain/food/barcode.ts`: `barcodeKey(code)` → the comparison key or undefined (R02.14).
- `src/services/barcode/lookup.ts`:
  - `lookupBarcode(code, deps)` → `Result<Found, LookupFailure>` where `Found` is an Open Food
    Facts or FoodData Central product, or a saved label entry; `deps` = fetch, signal, `unnamed`,
    language, the secrets (FDC key) and the diary (`latestLabelFor`). Ingredient scans (P06-09)
    call the same function.
  - `offersLabelScan(kind)` → true for not found, no nutrition and a refused key.
  - `createLabelScanHold()` → `{arm(code), take(), clear(), armed()}`: the one-shot hand-off.
  - `createBarcodeService(deps)` → `BarcodeService`: state `idle | looking {code} | failed {code,
    failure}`, `lookup(code)`, `cancel()`, `retry()`, `armLabelScan()` (on a miss: hold the code,
    go idle, return it), `takeArmedLabel()`, `clearArmedLabel()`, and the `scanner` (P06-14).
- On success the service stores an analysis draft (`draftsRepo.begin` + `saveResult`, source
  `barcode`, or `label` with `fromSavedLabel` for a saved label) and calls `openReview()` (the
  analysis service's `restore`, which shows a stored draft when nothing else runs).
- `src/features/log/scan/LookupOverlay.tsx`: the layer while looking (spinner, Cancel) and the
  failure dialog (Scan label / Retry / Close, and Cancel); `SavedLabelNotice.tsx`: the review's
  notice for a saved-label draft.
- Home: Scan label opens the meal-photos sheet with the camera; Analyse passes `armedLabel` to
  `analysis.start('photo', …)`; the sheet closing by any route, and every add-menu method, clears
  the hold.

Files: created `src/domain/food/barcode.ts` (+ test, with P06-14), `src/services/barcode/lookup.ts`
(+ test), `src/features/log/scan/LookupOverlay.tsx` (+ test), `src/features/log/scan/
SavedLabelNotice.tsx`, this note. Changed: `src/features/home/HomePage.tsx` (+ test). Shared,
additive: `barcode` in `Services` (`src/services/context.tsx`) and its creation in `src/main.tsx`.

Edge cases / failure modes:
- Open Food Facts succeeds while a saved label exists → the product, and neither the diary nor FDC
  is asked.
- A label entry with another code, a barcode-sourced (not label) entry, or an entry without product
  details never counts as the saved label; of two label entries the newest wins.
- No FDC key, or a blank one → no FDC request (the client refuses without sending).
- FDC failing for any reason but a refused key (outage, rate limit, no exact match, bad reply) →
  Open Food Facts' failure is shown.
- The diary cannot be read → treated as no saved label; FDC is still asked.
- Cancel while looking, while the product photo downloads or while the draft is written → nothing
  opens; a photo already stored and a draft already written are let go.
- A newer lookup replaces a running one (the old one is stopped and cleans up after itself).
- The product photo cannot be fetched or decoded → the draft has no photo (never an error).
- The hand-off: armed with a blank code → nothing armed; armed twice → the second code; taken once
  → gone; cleared → gone.
- Scan label when the failure offers none (rate limit, outage) → nothing is armed.

Our design differences / decisions:
- Names are ours: `lookupBarcode`, `Found`, `offersLabelScan`, `createLabelScanHold`,
  `armLabelScan`, `BarcodeService`, `LookupOverlay`, `SavedLabelNotice`.
- A barcode product goes through the analysis draft (D-16.46: it survives a reload) and opens
  through the analysis service's `restore`, so the review (P06-06) has one way in. A `present`
  method on the analysis service would read better; that file is not this slice's.
- The comparison key: `src/data/barcodeKey.ts` (P02-06) already holds the same rule, used by the
  diary on write and by FDC. The plan puts it in `src/domain/food/barcode.ts`; it is defined there
  now, and `src/data/barcodeKey.ts` should re-export it (a one-line change in `src/data`, outside
  this slice) so there is one rule.
- "Scan label" opens the meal-photos sheet with the camera as its picker (one tap more than the
  reference, as for Camera in the add menu, P06-01). The capture draft is kept if it already holds
  photos.
- The hold lives in the barcode service (one per app), in memory only: a reload forgets it, as in
  the reference.
- Product details of a label scan: only the barcode travels (the analysis service stamps it on the
  draft, P06-04); an Open Food Facts "no nutrition" reply carries no details in our client, so
  there is nothing else to keep.
- An invalid code (not 1–24 digits, e.g. a Code 39 with letters) shows its message with Close only:
  retrying the same code cannot help.

Tests we will write:
- `barcode.test.ts` (domain): the key: UPC-A and EAN-13 forms, all zeros, blank, letters.
- `lookup.test.ts`: OFF success never asks the label or FDC (R02.15, ACC-D20-1); OFF 429, 503,
  offline stop at OFF; not found + saved label → the label, no FDC request (ACC-D21-1); the newest
  label wins and UPC-A matches its EAN-13 form (R02.14); not found + no label + key → FDC
  (ACC-J9-1); no key → no FDC request and OFF's failure; FDC outage → OFF's not found; FDC 403 →
  key refused; an unreadable diary → FDC; Cancel. The service: a product is stored as a draft with
  its photo and the review opens; a saved label opens with `fromSavedLabel`; a miss offers Scan
  label and arms the code once (ACC-D20-2, R02.20); a rate limit offers Retry, not Scan label;
  Cancel stores nothing and lets the photo go; the hold is consumed once and cleared (R02.20).
- `LookupOverlay.test.tsx`: spinner and Cancel while looking; each failure's message and action.
- `HomePage.test.tsx`: Scan label opens the photos sheet with the camera and Analyse runs a label
  analysis with the code; arming then choosing another method clears it; closing the sheet clears
  it (R02.20).

Compare checklist (filled after the rewrite; reopened `A/services/BarcodeProductLookup.kt`,
`A/models/BarcodeLabelMemory.kt` and the three test files):
- [x] Open Food Facts wins and nothing else is asked (`src/services/barcode/lookup.test.ts >
  lookupBarcode: the order (R02.15) > takes an Open Food Facts product and never asks the saved label
  or FoodData Central (ACC-D20-1)`)
- [x] Only not found and no nutrition look further; every other failure (rate limit, outage, bad
  reply, network, invalid code, Cancel) stops (`> stops at Open Food Facts when it fails with %s,
  saved label and key or not` ×4, `> sends nothing at all for a code that is not 1–24 digits`, `> ends
  quietly when the person cancels`, `> offers a label scan only for not found, no nutrition and a
  refused key`)
- [x] The saved label comes before FoodData Central; the newest label entry with the same key wins;
  a barcode-sourced entry, another code, or a label entry without product details never counts
  (`> reopens the newest label saved for the code after a not-found, without asking FoodData Central
  (ACC-D21-1)`); UPC-A and EAN-13 forms match (`> finds a label saved under the UPC-A form when the
  EAN-13 form is scanned, and back (R02.14)`; `src/domain/food/barcode.test.ts > barcodeKey (R02.14) >
  gives a UPC-A code and its EAN-13 form the same key`)
- [x] FoodData Central only with a key (none or blank → no request), its product used, its outage or
  miss keeps Open Food Facts' failure, a refused key reported as its own (`> asks FoodData Central
  after no nutrition and no saved label, with a stored key (ACC-J9-1)`, `> sends nothing to FoodData
  Central without a key or with a blank one, and keeps Open Food Facts’ not-found`, `> keeps Open Food
  Facts’ own miss when FoodData Central is down or has no exact match`, `> reports a key FoodData
  Central refuses as its own failure, which offers a label scan`)
- [x] A saved label reopens with its values, amount, units and barcode, as a label, no new photo
  (`createBarcodeService > opens a saved label as a label draft marked as such, with its own photo
  (ACC-D21-1)`); a database product is a barcode entry (`> stores an Open Food Facts product with its
  photo as the analysis draft, then opens its review (ACC-D20-1)`, `> stores FoodData Central’s
  product without a photo (ACC-J9-1)`)
- [x] The hand-off: armed trimmed, blank arms nothing, the latest wins, taken once, cleared
  (`createLabelScanHold (R02.20) > gives the held code once, trimmed`, `> forgets the code when
  cleared, and holds nothing for a blank code`, `> holds only the latest code`); Scan label only for
  the three misses (`createBarcodeService > offers Scan label after a miss everywhere and holds the
  code for one analysis (ACC-D20-2, R02.20)`, `> offers Scan label when FoodData Central refuses the
  key`, `> offers Retry, not Scan label, when Open Food Facts is rate limited, and Retry asks again`)
- [x] Every other exit clears it, the photos sheet staying open for "Add photo" does not
  (`src/features/home/HomePage.test.tsx > HomePage: barcodes (P06-14, P06-17) > drops the held code
  when the photos sheet closes without Analyse, by Cancel or Back (R02.20)`, `> drops a held code when
  another method is chosen from the menu (R02.20)`, `lookup.test.ts > createBarcodeService > forgets a
  held code when it is cleared, or when another lookup starts (R02.20)`); the label photo consumes it
  (`HomePage.test.tsx > HomePage: barcodes (P06-14, P06-17) > offers Scan label after a miss, and the
  label photo runs as that product’s label (ACC-D20-2, R02.20)`); the label's product details keep
  the barcode (P06-04's `withBarcode`, `src/services/analysis.test.ts`)
- [x] Distinct messages for every failure (`src/features/log/scan/LookupOverlay.test.tsx >
  LookupOverlay > has a message of its own for every failure`, `> offers Retry and Cancel for %s, with
  its own message`, `> offers Scan label for %s, which holds the code and opens the camera
  (ACC-D20-2)`, `> offers only Close for a code that is not digits`)
- [x] Cancel and a newer lookup leave nothing behind (`createBarcodeService > shows nothing and
  stores nothing when Cancel comes while looking`, `> lets the product photo go when Cancel comes
  while it is being stored`, `> stops a lookup still running when a newer one starts, and opens only
  the newer`)
- Mutation check: falling through on every Open Food Facts failure fails 4 tests; a hold that keeps
  the code after `take` fails 2; not clearing on the sheet's close fails 1; the menu's no-op clear
  fails 1; not passing `armedLabel` fails 1.
- Deliberate differences: the product found goes through the stored analysis draft and opens with the
  analysis service's `restore` (reload-safe, one way into the review); "Scan label" opens the
  meal-photos sheet with the camera as its picker (one tap more than the reference); a diary that
  cannot be read counts as no saved label and FoodData Central is still asked (the reference would
  fail the lookup); an invalid code offers Close, not Retry; a new lookup also drops a held code.
- Not taken: the Add Ingredient variant with its refused-key message (P06-09 calls `lookupBarcode`
  and shows `scan.failure.keyRefused`); voice (L4); exporting photos to a gallery (not in v1).

## Decisions for the lead

- `src/services/barcode/lookup.ts`: `lookupBarcode(code, deps)` → `Result<Found, LookupMiss>` (`Found`
  = `{source: 'openFoodFacts' | 'foodDataCentral', product}` or `{source: 'savedLabel', entry}`);
  `offersLabelScan(kind)`; `createLabelScanHold()`; `createBarcodeService(deps)` → `BarcodeService`
  (`getSnapshot/subscribe`, `lookup`, `cancel`, `retry`, `armLabelScan`, `takeArmedLabel`,
  `clearArmedLabel`, `scanner`). P06-09's ingredient scan should call `lookupBarcode` (same order,
  R02.15) and show `scan.failure.<kind>`.
- Shared, additive: `barcode?: BarcodeService` in `Services`; `main.tsx` builds it with
  `openReview: () => analysis.restore()` and `unnamed: (code) => t('scan.unnamed', {code})`.
- The comparison key exists twice now: `src/data/barcodeKey.ts` (P02-06, used by the diary's
  `barcodeKey` index and by `fdc.ts`) and `src/domain/food/barcode.ts` (where the plan and the glossary
  put it). Same rule, same results. Make `src/data/barcodeKey.ts` re-export the domain one (`export {
  barcodeKey } from '../domain/food/barcode';`) and keep its test, or point its importers at the
  domain; I did not touch `src/data`.
- Review (P06-06): show `<SavedLabelNotice />` (`src/features/log/scan/SavedLabelNotice.tsx`, data-ui
  `review.savedLabel`) in the notice slot when the draft's `fromSavedLabel` is true; the flag is
  stored with the draft, so it survives a reload. A barcode product's draft has source `barcode`
  (or `label` for a saved label) and its photo ids (Open Food Facts' photo, the label's photos);
  closing the review with `closeReview()` releases a product photo nothing else names.
- A cleaner seam for later: `analysis.present(draft)` instead of the barcode service writing the
  draft itself and calling `restore()` (that file was not this slice's).
- `LookupOverlay` (`src/features/log/scan/LookupOverlay.tsx`) is mounted by Home next to the scanner;
  it reuses the analysis overlay's styles (`src/features/log/analysis.module.css`, imported, not
  changed). Data-ui: `scan.looking`, `scan.looking.cancel`, `scan.failed` (+ `.confirm`, `.cancel`).
- Not stored: Open Food Facts' `ingredientsMarkup` has no field on the analysis draft, so the label
  markers of P06-18 have nothing to read for a barcode product yet; P06-18 should add it to
  `ProductInfo` (or the draft) and this service should pass it through.
- "Scan label" keeps a capture draft that already holds meal photos (as Camera does in the add
  menu); those photos would then go with the label photo into the label analysis. Small follow-up:
  start the label scan with an empty capture draft, or warn.

## Status

Done (2026-10-27). Created `src/domain/food/barcode.ts` (key, with P06-14), `src/services/barcode/
lookup.ts` (+ 30 tests), `src/features/log/scan/LookupOverlay.tsx` (+ 16 tests),
`src/features/log/scan/SavedLabelNotice.tsx`, this note. Changed: `src/features/home/HomePage.tsx`
(lookup, Scan label, the hand-off's clearing and `armedLabel`) and its test (+ 6 tests). Shared,
additive: `barcode` in `src/services/context.tsx` and `src/main.tsx`. R02.14 (the scan flow), R02.15,
R02.20 (the label-scan half) and ACC-D20-1, ACC-D20-2, ACC-D21-1, ACC-J9-1 are now tested.
