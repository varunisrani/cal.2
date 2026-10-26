# Task: Open Food Facts client (P06-15) · Phase: 06 · Owner: builder (wt-p06s3a)

<!-- Save as platewise/docs/notes/P<nn>/<slug>.md. Write everything above "Compare checklist"
BEFORE writing code, in your own words. Never paste or paraphrase the reference line by line. -->

Read (reference @ `10e14b67`): `A/services/OpenFoodFactsService.kt` (all: request, status
mapping, mapping, package size, tags, scores, photo, name, free-text grams),
`I/Services/OpenFoodFactsService.swift` (all: the same plus the error list and the flexible number
decoding), then `T/services/OpenFoodFactsServiceTest.kt` and `IT/OpenFoodFactsServiceTests.swift`.
Research spec `02-food-logging.md` §2 (the OFF field list and nutriment keys), §3.12 (request,
status mapping, mapping, product photo), §3.13 (the allergen markup only, for what the ingredient
text carries), §5 (browser notes), §7 Q4; trap R02.16 (the OFF half). Vendor check on
2026-10-26: OFF's API introduction asks reads for a custom `User-Agent` and documents `app_name` /
`app_version` / `app_uuid` query parameters for write queries; nothing for browsers. A live check
of `world.openfoodfacts.org/api/v2/product/…` and `images.openfoodfacts.org` both answer
`Access-Control-Allow-Origin: *` (the API's allowed headers list `X-User-Agent`).

What it does (own words): a scanned or typed code is looked up in Open Food Facts and turned into
a review draft for one serving. The code is only trimmed; anything that is not 1–24 ASCII digits
is refused before any request, and the digits go out exactly as scanned (leading zeros kept,
R02.14). The reply's HTTP status and body are sorted into failure kinds the lookup screen can name
(not found, missing nutrition, rate limited, service down, odd reply, offline, timeout, other
network trouble). A product is read per serving: the serving weight comes from the product (or
its serving text, else 100 g, never under 1 g), each value is the per-serving figure when OFF
has one and the per-100 g figure scaled to the serving otherwise (R02.16). Energy falls back from
kcal to kJ. OFF gives minerals and vitamins in grams, so they are converted to the units the
diary stores. The draft offers "serving" and, when the package weight is known and different,
"package". The product block gets the package text, ingredient text, cleaned tag lists, scores
and NOVA. The front photo can be downloaded separately; any problem there means no photo, never
an error.

Inputs → outputs: `lookupOff(code, deps)`; deps = `{ fetch, unnamed(code), signal?, language? }`
→ `Promise<Result<BarcodeProduct, OffFailure>>` where `BarcodeProduct = { draft: NutritionDraft,
source: 'barcode', ingredientsMarkup? }` and `OffFailure = { kind }`. `downloadProductPhoto(url,
deps)` → `Promise<Blob | undefined>`. Shared with FDC (`product.ts`): the result type, free-text
grams, the name rule, number readers, unit conversion and rounding; (`http.ts`): one request under
a timeout and the person's Cancel, with network failures sorted into offline / timeout / network /
cancelled.

Files: created `src/services/barcode/off.ts`, `off.test.ts`, `product.ts`, `product.test.ts`,
`http.ts`, `__fixtures__/off-*.json`, this note.

Edge cases / failure modes:
- Code with a space inside, a slash, letters, Arabic-Indic digits, empty or 25 digits → `invalid`,
  no request.
- 404 → `notFound` whatever the body; 429 → `rateLimited`; 500–599 → `unavailable`; any other
  non-2xx (a 301, a 403) → `unexpected`; a 2xx body that is not a JSON object → `unexpected`.
- `status` 0 (also the string "0") or no `product` object → `notFound`.
- No `nutriments` object, or none of kcal, protein, carbs, fat → `noNutrition` (an empty
  `nutriments` included).
- Numbers may come as numbers or as text with a comma decimal ("10,0"); anything else is missing.
- kJ only: kcal = kJ × 0.23900573614; kcal rounded to a whole number; macros kept unrounded;
  other values rounded to 0.1 in their stored unit.
- Serving 0.4 g → 1 g; serving text "1 large egg (50 g)" → 50 g (see decisions).
- Package equal to the serving (within 0.01 g) → no package unit.
- No product or generic name and no brand → the caller's word for an unnamed product.
- Network: device offline → `offline`; our time limit → `timeout`; other failures → `network`;
  the person's Cancel → `cancelled` (shown as nothing).
- Photo: another host, http, non-2xx, a non-image type, a declared or actual size over
  5 000 000 bytes, an empty body, a CORS or network failure, a cancel → no photo.

Our design differences / decisions:
- Names are ours (`lookupOff`, `downloadProductPhoto`, `BarcodeProduct`, kinds `invalid`,
  `notFound`, `noNutrition`, `rateLimited`, `unavailable`, `unexpected`, `offline`, `timeout`,
  `network`, `cancelled`).
- Failures are values, never throws; `fetch` is injected (`deps.fetch`); no words in this module:
  the unnamed-product name comes from the caller (`deps.unnamed`), like `combineEntries`.
- No `User-Agent` (browsers forbid it); the request carries `app_name=Platewise`, the parameter
  OFF documents for naming an app in a request (see "Decisions for the lead").
- `lc` is the browser language's primary subtag (`en` when there is none); the `fields` list is
  the 19 fields of 02 §2.
- Gram text: a unit must not run on into a letter, so "1 large egg (50 g)" reads 50 g, not 1 l, and
  "1 lb" reads nothing; "gr", "gram" and "grams" count as grams (deliberate, safer than the
  reference, which reads the "l" of "large").
- A serving quantity of 0 or less is treated as missing (falls through to the serving text, then
  100 g); negative nutriment values are treated as missing.
- `ProductInfo.ingredients` holds OFF's plain ingredient text; the marked-up text travels beside
  the draft (`ingredientsMarkup`) for `labelText.ts` (P06-18) to turn into markers.
- The product photo is a separate call so P06-17 decides when to fetch it; its body is read with a
  5 000 000-byte cap instead of trusting the declared size alone.

Decisions for the lead:
- OFF identification from a browser (02-Q4): `app_name=Platewise` on every request (documented for
  write queries; harmless on reads). OFF's CORS policy also allows an `X-User-Agent` header, which
  would cost a pre-flight; one line to switch if preferred.
- OFF time limit: 30 s (`OFF_TIMEOUT_MS`), our own choice; the reference relies on platform
  defaults (60–75 s). The photo download uses the same limit.
- A user Cancel gives the kind `cancelled` (not in the row's list), shown as nothing, like the AI
  `cancelled` kind.
- Gram parsing lives in `src/services/barcode/product.ts` (the row names
  `src/domain/food/productText.ts`, which this slice may not create); move it to the domain later if
  another caller needs it.

Tests we will write (`off.test.ts`, `product.test.ts`; fake fetch, our fixtures, fake timers):
- Request: path keeps leading zeros, `fields` holds the 19 names, `lc` from the language,
  `app_name`, no `User-Agent`; invalid codes send nothing.
- Status mapping: 404, 429, 503, 301, unreadable body, `status: "0"`, no product, no nutriments,
  empty nutriments.
- Mapping: per-serving preferred over per-100 g; a 30 g serving scales `_100g` by 0.3; kJ-only
  energy; sodium 0.4 g → 400 mg, vitamins in mcg; extras; rounding; serving at least 1 g; units
  serving and package (and package dropped when equal); name and brand rule; tags `en:gluten` →
  "Gluten", limits 16/16/12/8, duplicates; scores upper-cased unless unknown; NOVA 1–4 only.
- Network: offline, timeout at 30 s (fake timers), network error, Cancel.
- Photo: trusted host ok; other host, non-image, non-2xx, declared oversize, actual oversize,
  network failure → none.
- `product.test.ts`: "12 fl oz" → 354.9 g, "12 oz" → 340.2 g, "1,5 kg", "fl. oz", "1 large egg
  (50 g)", nothing found.

Compare checklist (filled after the rewrite; reopened `A/services/OpenFoodFactsService.kt`,
`I/Services/OpenFoodFactsService.swift`, `T/services/OpenFoodFactsServiceTest.kt`,
`IT/OpenFoodFactsServiceTests.swift`):
- [x] Code trimmed, 1–24 ASCII digits, sent as scanned; other codes refused before any request
  (tested in `off.test.ts > lookupOff: the request > refuses a code that is not 1–24 ASCII digits
  and sends nothing` and `… > sends the code as scanned with leading zeros, the field list, lc and
  app_name`).
- [x] The 19 fields, `lc`, `Accept: application/json`, no User-Agent (tested in `off.test.ts >
  lookupOff: the request > sends the code as scanned …` and `… > asks in the browser's language
  when none is given`).
- [x] 404 before the body, 429, 5xx, other non-2xx, unreadable body, `status` 0 as number or text,
  no product (tested in `off.test.ts > lookupOff: replies > *`).
- [x] No nutriments and empty nutriments → missing nutrition (tested in `off.test.ts >
  lookupOff: replies > maps a product without kcal, protein, carbs or fat to noNutrition`).
- [x] Offline, timeout and other network failures distinct; a cancel stays a cancel (tested in
  `off.test.ts > lookupOff: network > *`).
- [x] Per-serving first, else per-100 g scaled; text numbers with a comma; kJ fallback; kcal
  rounded; mg/mcg conversions; 0.1 rounding; extras from hyphenated keys (tested in `off.test.ts >
  lookupOff: one serving (R02.16) > reads our fixture per serving …`, `… > scales per-100 g values
  by 0.3 for a 30 g serving`, `… > converts kJ-only energy …`, `… > turns grams into mg and mcg
  …`).
- [x] Serving from quantity, else text, else 100 g, at least 1 g (tested in `off.test.ts >
  lookupOff: one serving (R02.16) > takes the serving from its quantity, else its text, else 100
  g, and never below 1 g`).
- [x] Serving unit and package unit with the 0.01 g rule; package from the numeric quantity or a
  plain quantity text (tested in `… > offers a package unit only when its weight is known and
  differs from the serving`).
- [x] Name rule and the unnamed fallback (tested in `… > names the product brand first unless the
  name already holds it` and `product.test.ts > productName > *`).
- [x] Tags cleaned, repeats dropped, limits 16/16/12/8; scores upper-cased unless unknown or not
  applicable; NOVA 1–4 (tested in `… > cleans tags: …` and `… > upper-cases the scores unless
  unknown, and keeps NOVA only for 1–4`).
- [x] Free-text grams with "fl oz" before "oz", comma decimals, "fl. oz" (tested in
  `product.test.ts > gramsInText > *`).
- [x] Photo only from https `images.openfoodfacts.org`, 2xx, image type, ≤ 5 000 000 bytes, else
  none; a cancel or time-out is none too (tested in `off.test.ts > downloadProductPhoto > *`).
- Deliberate differences: no `User-Agent` (`app_name` instead); a 30 s limit of our own; a unit in
  free text must not run on into a letter, and "gr", "gram", "grams" count as grams; a serving
  quantity of 0 or less and negative nutriments count as missing; NOVA must be a whole 1–4 (the iOS
  build rounds); tags upper-case only their first letter (as Android; the iOS build capitalises
  every word); ingredient text stored plain with the markup beside it (the markers are P06-18's);
  the photo read is capped while it streams; failures are values, cancel included.
- Not taken: the localized error strings (the screen owns the words, P06-17); the
  `lookupWithImage` pairing (P06-17 calls `downloadProductPhoto` when it wants the photo); the
  `httpStatus` carried on failures (nothing reads it).

## Status

Done (2026-10-26). `off.ts`, `product.ts`, `http.ts`, their tests and the OFF fixtures are in
place; nothing outside the slice's files changed. Unit tests: `off.test.ts` 24 and
`product.test.ts` 10, all passing. Handed on to P06-17: call `lookupOff` then
`downloadProductPhoto(draft.product.imageUrl)`, pass `unnamed` from the catalogue, and turn
`ingredientsMarkup` into markers with `labelText.ts` (P06-18) once it lands.
