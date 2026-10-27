# Task: FoodData Central client (P06-16) · Phase: 06 · Owner: builder (wt-p06s3a)

<!-- Save as platewise/docs/notes/P<nn>/<slug>.md. Write everything above "Compare checklist"
BEFORE writing code, in your own words. Never paste or paraphrase the reference line by line. -->

Read (reference @ `10e14b67`): `A/services/FoodDataCentralService.kt` (all: guards, request, GTIN
spellings and matching, the three amount cases, nutrient sets, serving weight, name casing),
`I/Services/FoodDataCentralService.swift` (all: the same, plus the key settings holder and the
cancel path), then `T/services/FoodDataCentralServiceTest.kt` and
`IT/FoodDataCentralServiceTests.swift` (the service suite; the lookup-order suite belongs to
P06-17). Research spec `02-food-logging.md` §2 (FDC request and response fields), §3.12 (the USDA
part and the nutrient id table), §5 (CORS pre-flight for `X-Api-Key`); traps R02.14 (exact GTIN),
R02.16 (the FDC half), R02.18. A live pre-flight on 2026-10-26 to
`api.nal.usda.gov/fdc/v1/foods/search` allows `x-api-key, content-type` from any origin.

What it does (own words): when Open Food Facts cannot help, the person's own FoodData Central key
lets the app search the USDA Branded Foods list for the scanned code. Nothing is sent without a
stored key and a code that can be a GTIN. The key must be made of characters an HTTP header can
hold (visible ASCII, no spaces): when it is not, for example after a paste that brought in an
invisible character, the lookup ends as a refused key and nothing is sent. The key only ever
travels in the `X-Api-Key` header (R02.18). The search ORs every spelling the database may store
the code under, and only a Branded food whose GTIN equals the code (leading zeros ignored) is
used, because the search also returns near misses (R02.14). The
food becomes a review draft: with a known serving weight, label values win and per-100 g values
are scaled to it; without one, the label set and the per-100 g set are never mixed (R02.16), so the
draft is either one serving of unknown weight or exactly 100 g. All-caps names get English title
case whatever the device language (R02.18).

Inputs → outputs: `lookupFdc(code, deps)`; deps = `{ fetch, secrets, unnamed(code), signal? }`
(`secrets` reads the `fdc` slot) → `Promise<Result<BarcodeProduct, FdcFailure>>`, kinds `noKey`,
`invalid`, `notFound`, `keyRefused`, `unavailable`, `cancelled`. Also `gtinSpellings(code)`,
`sameGtin(stored, scanned)` and `englishTitleCase(text)` for tests and the lookup slice.

Files: created `src/services/barcode/fdc.ts`, `fdc.test.ts`, `__fixtures__/fdc-*.json`, this
note; shares `product.ts` and `http.ts` with the OFF client (P06-15).

Edge cases / failure modes:
- No key, or a blank one → `noKey`, no request. A secrets read that fails counts as no key.
- Code with letters or other characters, all zeros, or more than 14 significant digits →
  `invalid`, no request.
- Key with a zero-width space, a line break or a non-ASCII letter → `keyRefused`, no request.
- 401 or 403 → `keyRefused`; 429, 5xx, any other status, a body that is not JSON or has no `foods`
  list, a network failure or our 15 s limit → `unavailable` (the lookup then shows OFF's error).
- The person's Cancel → `cancelled`.
- Foods of another data type, or whose GTIN differs after leading zeros are removed, are skipped;
  so is a matching food with no kcal, protein, carbs or fat; none left → `notFound`.
- Serving weight: size × unit factor (g, gram, grams, grm, ml, mlt ×1; kg, l, ltr ×1000; mg
  ÷1000; oz, onz ×28.3495; fl oz, foz ×29.5735, case-insensitive), else grams in the household
  text, else unknown. Weights under 1 g are kept.
- Nutrient entries: the first entry per id counts (older panels follow), negative values and
  unknown units are ignored; G, MG, UG/MCG converted to grams; kcal from 1008/2047/2048 in KCAL,
  else 1062 in KJ × 0.23900573614; vitamin D from 1110 in IU × 0.025 µg only without 1114.
- Label values for calcium, cholesterol, iron, potassium and sodium are milligrams.

Our design differences / decisions:
- Names are ours (`lookupFdc`, `gtinSpellings`, `sameGtin`, `englishTitleCase`, the panel helpers).
- The reference answers "nothing" for no key, a non-GTIN code and no match alike; we return
  distinct kinds (`noKey`, `invalid`, `notFound`) so tests and the lookup can tell them apart; the
  lookup treats all three like OFF's error.
- GTIN comparison uses the shared `barcodeKey` (`src/data/barcodeKey.ts`), the same key label
  memory uses.
- An unknown weight with the label set is a servings basis (`{kind: 'servings', count: 1}`, no
  named units), the domain's own case for an unknown mass (R02.1); the 100 g case is a grams basis
  of 100 with no named units.
- Title case: every letter lower-cased with English rules, then each word's first letter
  upper-cased (a word starts after a space or punctuation other than an apostrophe), so
  "GREEK YOGURT" → "Greek Yogurt" and "I" never becomes a dotless "ı".
- No product photo; data source `fdc` on the product block; no omega-3 or extras.

Decisions for the lead:
- A user Cancel gives `cancelled`, as for OFF.

Tests we will write (`fdc.test.ts`, fake fetch, our fixtures, fake timers):
- No key → no request; blank key → no request; secrets read failing → no request.
- Key with a zero-width space, a line break, an accented letter → `keyRefused`, no request.
- The request: POST to the search URL, no query string, the key only in `X-Api-Key` (not in the
  URL, not in the body), body with the OR-ed spellings, Branded, requireAllWords false, page 25.
- GTIN spellings for `012345678905`, an 8-digit code, long zero-padded code; none for letters,
  zeros, 15 significant digits; `sameGtin` cases.
- A fuzzy hit with another GTIN is ignored (only that food → `notFound`); a non-Branded food is
  skipped; the first match with nutrition wins.
- Our fixture mapped: per-100 g scaled to the serving, first entry per id wins, IU-only vitamin D,
  minerals in mg, folate fallback id, category, ingredients, source `fdc`.
- Label values win and household text gives the weight; a 0.5 g serving keeps its weight;
  label values with no weight → one serving of unknown weight (no per-100 g values mixed in);
  per-100 g set larger → 100 g basis.
- 401 and 403 → `keyRefused`; 429, 503, not JSON, no `foods`, network failure, 15 s timeout →
  `unavailable`; Cancel → `cancelled`.
- "GREEK YOGURT" → "Greek Yogurt" under a Turkish default locale; mixed case kept; brand already
  in the name not repeated.

Compare checklist (filled after the rewrite; reopened `A/services/FoodDataCentralService.kt`,
`I/Services/FoodDataCentralService.swift`, `T/services/FoodDataCentralServiceTest.kt`,
`IT/FoodDataCentralServiceTests.swift`):
- [x] No request without a key or a GTIN-shaped code (tested in `fdc.test.ts > lookupFdc: nothing
  is sent without a key and a GTIN (R02.18) > sends nothing without a stored key` and `… > sends
  nothing for a code that cannot be a GTIN`).
- [x] A key outside 0x21–0x7E is refused with no request (tested in `… > refuses a key with a
  character a header cannot carry, without a request`).
- [x] POST to the search URL, no query string, key only in `X-Api-Key`, never in the URL or body;
  body with the OR-ed spellings, Branded, `requireAllWords: false`, 25 per page (tested in
  `fdc.test.ts > lookupFdc: the request (R02.18) > puts the key in the X-Api-Key header and nowhere
  else`).
- [x] Spellings: raw, significant, padded 8/12/13/14, ≤ 14 digits, no repeats; none for letters,
  zeros or > 14 significant digits; GTIN match ignoring leading zeros (tested in `fdc.test.ts >
  gtinSpellings and sameGtin (R02.14) > *`).
- [x] Only Branded or untyped foods with the exact GTIN; the first with nutrition wins; a fuzzy hit
  is never used (tested in `fdc.test.ts > lookupFdc: the exact Branded match (R02.14, R02.16) >
  *`).
- [x] Known weight: label values first, else per-100 g scaled; first entry per id; IU-only vitamin
  D; folate fallback; label minerals in mg; household text weight; weights under 1 g kept (tested in
  `… > maps our fixture: …`, `fdc.test.ts > lookupFdc: serving weight and the two value sets
  (R02.16) > lets label values win and reads the weight from the household text`, `… > keeps a
  serving under 1 g as given`, `… > reads the serving unit codes in any case`).
- [x] Unknown weight: the label set alone as one serving of unknown weight, or 100 g of the
  per-100 g set, never mixed (tested in `… > keeps label values without a serving weight as one
  serving of unknown weight` and `… > uses exactly 100 g of the per-100 g values when they cover
  more than the label`).
- [x] kcal from the kcal ids, else kJ; negative values ignored (tested in `… > turns kJ into kcal
  only without a kcal entry, and ignores negative values`).
- [x] 401/403 → refused; 429, 5xx, bad body, no `foods`, network, time limit → unavailable; cancel
  stays a cancel (tested in `fdc.test.ts > lookupFdc: failures > *`).
- [x] All-caps names title-cased with English rules under a Turkish default; mixed case kept; a
  brand the name holds not repeated (tested in `fdc.test.ts > englishTitleCase (R02.18) > *`).
- Deliberate differences: distinct `noKey`, `invalid` and `notFound` kinds where the reference
  returns nothing; the code is checked before the key is read; a failed secrets read counts as no
  key; unknown weight is the domain's servings basis (no "logged serving" unit option); a word
  after a hyphen or other punctuation is capitalised too ("Cheese-And-Onion"; the Android build
  splits on spaces only); numbers in text may use a comma decimal.
- Not taken: the key settings holder and the sign-up URL (the FDC key page is P05/P09's); the
  product-metadata codec test (storage codecs are P02's); the lookup-order suite of the iOS tests
  (P06-17).

## Status

Done (2026-10-26). `fdc.ts`, its test and the FDC fixture are in place, sharing `product.ts` and
`http.ts` with the OFF client; nothing outside the slice's files changed. Unit tests:
`fdc.test.ts` 25, all passing. Handed on to P06-17: call `lookupFdc` only after OFF's `notFound` or
`noNutrition` and a miss on the saved label; show `keyRefused` with its own message and OFF's
failure for every other kind.
