# Task: Logging e2e (P06-20) · Phase: 06 · Owner: builder (wt-p06s20, wave C)

Read (reference @ `10e14b67`): none. The phase row lists no reference file: the flows are ours, and
the spec strings together screens and services that already landed (P06-01..19) and proves them end
to end in a browser. Our own docs read: the P06-20 row, "Goal" and "Done when" (Demo 3) in
`docs/plan/phases/P06-logging-flows.md`; D-16.16 (meal from the picked time), D-16.18 (typed
digits), D-16.19 (nutrition editable after logging), D-16.20 (combine), D-16.23 (the retry ladder),
D-16.26 (plain http only for loopback), D-16.46 (drafts survive a reload); the acceptance rows whose
Review line names P06-20 (ACC-D6-1, ACC-D19-1, ACC-D25-1; no trap row names it); the landed specs
`e2e/walking-skeleton.spec.ts`, `e2e/onboarding.spec.ts` and `e2e/support.ts`; the fake AI
(`e2e/fake-ai/server.ts`, the `busy-then-ok` script); the landed code for hooks, words and
behaviour (`HomePage.tsx`, `AddMenu.tsx`, `CaptureSheet.tsx`, `AnalysisOverlay.tsx`,
`DescribeSheet.tsx`, `ReviewSheet.tsx`, `ServingCard.tsx`, `AmountField.tsx`, `NutritionRows.tsx`,
`ProductBlock.tsx`, `SavedLabelNotice.tsx`, `ScanSheet.tsx`, `DigitsField.tsx`,
`LookupOverlay.tsx`, `ReuseSheet.tsx`, `ReuseRow.tsx`, `EntryEditor.tsx`, `EntryRow.tsx`,
`SelectionBar.tsx`, `WeekBar.tsx`, `ManualSheet.tsx`), the services behind them (`analysis.ts`,
`barcode/lookup.ts`, `barcode/off.ts`, `barcode/fdc.ts`, `combine.ts`), the AI retry ladder
(`src/ai/retry.ts`) and our food reply contract (`src/ai/parse/foodReply.ts`, `units.ts`,
`parts.ts`).

What it does (own words): nine browser tests on the Pixel 7 profile, each from an empty browser,
walk the wizard with the AI as the Custom provider at the fake's loopback address (the fake answers
`plan-ok`), land on Home with the clock at 08:30 (breakfast), then log food every way P06 built:
1. A meal photo (our own small JPEG) through the camera's file input: the review opens with the
   AI's answer at 1 serving and the photo; the amount becomes 1.5 servings (≈ 540 g) and every
   value follows; Log puts it under breakfast and moves the gauge. The AI got one request with
   the photo in it, and no failure ever showed.
2. "two eggs and toast" typed in Describe: the review with the AI's estimate (ACC-D6-1), Log,
   Home shows it. The request carried the words and no photo.
3. A barcode typed with spaces: the lookup layer, Open Food Facts answers with our product
   fixture, the review opens with the product's name, one serving, its photo and its details
   (barcode, package, scores); Log, Home shows it (ACC-D19-1, ACC-D20-1). Open Food Facts was asked
   once for that code, with our app name and the browser's language; FoodData Central never (no
   key is stored).
4. A barcode Open Food Facts does not know: the failure offers Scan label (ACC-D20-2), which opens
   the photos sheet on the camera; the label photo's analysis runs as that product's label (the
   review's details show its barcode); Log stores a label entry. Scanning the same code again
   finds that saved label and opens it with its notice (ACC-D21-1).
5. Reuse: a food entered by hand on yesterday (picked in the week bar) is found in Recent from
   today, opens in the review (never logged on the tap, ACC-D16-2), and Log puts it on today;
   yesterday keeps its own (Demo 3).
6. Edit: a row's tap opens the entry editor; through the nutrition lock the kcal goes from 250 to
   320; Save keeps the row's time, and the row and the gauge read 320 (ACC-D12-2, D-16.19).
7. Combine: a long-press on one row starts picking (the bar replaces "+"), a tap picks a second,
   Combine leaves one row "first + second" with the summed kcal (D-16.20).
8. Reload during the review: after a photo analysis the page reloads and the review comes back
   with the same name, values, amount and photo (ACC-D25-1, D-16.46); Log, and a second reload
   opens no review.
9. `busy-then-ok`: the fake's first answer is 429; the overlay (a spinner) stays, no failure ever
   shows, the ladder's wait (driven by the page clock) sends the same request again, and the
   review opens with the second answer (R03.6, D-16.23).
Every test routes all non-loopback traffic: Open Food Facts' API and image host and FoodData
Central get our fixtures; any other host is aborted and recorded, and the test fails if one was
asked. Uncaught page errors fail every test.

Inputs → outputs:
- `e2e/logging.spec.ts` → nine Playwright tests over the built app (`vite preview`), one worker,
  Pixel 7, `en-US`, UTC, reduced motion, the page clock installed at 2026-10-27 08:30 UTC.
- `e2e/fixtures/meal.jpg` → our own small JPEG (drawn with Pillow: a plate on a table), the
  meal and label photo and the product photo the image host serves.
- `e2e/fixtures/off-product.json`, `off-not-found.json` → our made-up product (spelt crackers of
  an invented bakery, code 2001234567893, in Open Food Facts' v2 product shape) and the
  not-found body (status 0) for code 2009876543213.
- `e2e/support.ts` (additive) → inline fake AI scripts built from our reply keys (a grain bowl
  photo, eggs on toast, a rice-cake label), `fakeAi.useReplies`, the food database routes with a
  record of what was asked and what strayed, and a recorder of hooks that ever appeared.

Files: created `e2e/logging.spec.ts`, `e2e/fixtures/meal.jpg`, `e2e/fixtures/off-product.json`,
`e2e/fixtures/off-not-found.json`, this note; changed `e2e/support.ts` (additions only).

Edge cases / failure modes:
- The fake keeps its script and recordings between tests: every test resets it, loads `plan-ok`
  for the wizard, then loads its own replies (a load rewinds the script and keeps recordings, so
  request counts are taken after the wizard's one plan request).
- Open Food Facts' not-found reply is a 404 with `status: 0`; either alone means notFound to our
  client. A fulfilled cross-origin reply needs `Access-Control-Allow-Origin`, as the real hosts
  send. FoodData Central's search is a POST with a key header (a preflight): its route answers
  both, but with no key stored nothing may reach it, and the test checks that.
- The scanner asks for the camera; headless Chromium has none and grants nothing, so the scanner
  shows its camera state and the typed digits, which is the path under test (D-16.18).
- The photo goes through the camera's file input (the file chooser of "Add photo"), so the real
  store, thumbnail and AI preparation run on a real JPEG.
- The clock runs at real speed after `page.clock.install`. The two timers the flows wait on are
  driven with the clock helper instead of waited out: the long-press (held for 1 s of page clock,
  over the row's 500 ms) and the retry ladder's first wait (`RETRY_WAITS_MS[0]`), each with
  `page.clock.runFor`.
- The analysis overlay is fetched on the first analysis and React shows a resolved lazy part
  after a short reveal delay, so against a fast fake it may never appear at all: the photo and
  describe tests do not wait for it (they check that no failure ever showed); the busy test sees
  it, with its spinner, during the ladder's wait.
- A failure dialog that flashes and goes would pass a final "not shown" check: an init script
  records every `data-ui` hook of interest that ever entered the page (`analysis.failed`,
  `scan.looking`, `scan.failed`), so "never shown" is real.
- After Log the review's draft is cleared a moment after the entry is written; the second reload
  of test 8 comes after the row is on screen, which in every run was after that clear.
- The review is not on the router's sheet stack and edits are not kept across a reload (landed
  behaviour): the reload test reloads before any edit and compares the stored values.

Our design differences / decisions:
- Copy comes from the catalogue through `words()`; locators are roles, names and `data-ui` hooks.
- The fake AI replies for these flows are inline scripts in `e2e/support.ts` (no new script
  files): the fake already accepts an inline `{ replies }`, and each reply is built from the
  reply contract's key constants, so a renamed key breaks the spec at type level.
- The product photo is served from the same fixture JPEG (one asset of ours, as the row lists).
- Network guard: one `context.route` with a URL predicate (everything but loopback), so the app
  and the fake are untouched and any other host shows up as a recorded, aborted request.

Decisions for the lead:
- FoodData Central with a stored key cannot be driven yet: no screen stores the `fdc` key until
  P09-07 (AI providers page), and e2e may not write IndexedDB. The route is in place (search
  answered with no match, recorded); test 4 proves the key-less order (OFF miss → no FDC call →
  Scan label). P09-19 can add the keyed path once the key field exists.
- No `data-ui` hook was missing: every locator uses a hook or a role the landed components
  already carry, so no component changed.
- Open Food Facts' not-found reply is assumed to be HTTP 404 with `status: 0` (what the v2 API
  sends for an unknown code); our client reads either alone as notFound, so the spec does not
  depend on it.

Tests we will write (`e2e/logging.spec.ts > logging flows (Demo 3)`):
- `logs a meal photo at 1.5 servings and Home shows it under its meal`
- `describes "two eggs and toast", reviews the AI's estimate and logs it (ACC-D6-1)`
- `looks up typed barcode digits in Open Food Facts and logs the product (ACC-D19-1, ACC-D20-1)`
- `offers Scan label for a product Open Food Facts lacks, logs the label, and finds that label on the next scan (ACC-D20-2, ACC-D21-1, R02.15, R02.20)`
- `logs yesterday's food again from Recent, on today, leaving yesterday as it was (ACC-D16-2)`
- `edits an entry's calories from its row through the nutrition lock (ACC-D12-2, D-16.19)`
- `combines two entries picked with a long-press into one (D-16.20)`
- `reopens the review with the same values after a reload, and only until it is logged (ACC-D25-1, D-16.46)`
- `shows no error when the provider is busy once and then answers (R03.6, D-16.23)`
Every test three times in a row (`--repeat-each=3`), one worker; then the whole e2e folder once.

Compare checklist (filled after the rewrite; no reference file applies: the flows are ours, so
each tick names the test of `e2e/logging.spec.ts > logging flows (Demo 3)` that proves it; T1..T9
are the nine tests above, in order):
- [x] Photo → analysis → 1.5 servings → Log → Home: the review opens on 1 serving (520 kcal, 34 /
      58 / 16 g, ≈ 360 g) with the photo; "1.5" makes it "servings", ≈ 540 g, 780 kcal, 51 / 87 /
      24 g; the row "Chicken grain bowl 780 kcal" with P 51 · C 87 · F 24 under breakfast, the
      gauge at 780; one food request carrying one image (T1)
- [x] Describe "two eggs and toast" → review (340 kcal, 18 / 30.8 / 16 g, 1 plate, the emoji) →
      Log → Home; the request carried the words and no image (T2, ACC-D6-1)
- [x] Typed digits "2 001234 567893" → the lookup layer → our OFF product: "Millbrook Bakery Spelt
      Crackers with Rosemary", 1 serving ≈ 25 g, 105 kcal, 3 / 16 / 3 g, its photo, barcode,
      package, Nutri-Score B, NOVA 3, no Eco-Score (unknown), Gluten, Sesame seeds, categories and
      a bold "Spelt" → Log → Home; OFF asked once with `lc=en` and `app_name=Platewise`, one
      product photo, no FDC, no AI (T3, ACC-D19-1, ACC-D20-1)
- [x] OFF not found → "Couldn't find this product" with the not-found message → Scan label →
      the photos sheet on the camera → the label photo analysed as a label (the review's details
      carry the barcode, no saved-label notice) → Log; the same code again → OFF miss → the saved
      label opens with its notice and values, without the AI; FDC never asked (T4, ACC-D20-2,
      ACC-D21-1, R02.15, R02.20)
- [x] Recent: yesterday's hand-entered porridge → the review (serving count only, 310 kcal) while
      today stays empty → Log → today's breakfast and gauge 310; yesterday still one row (T5,
      ACC-D16-2)
- [x] Row tap → editor → lock → kcal 250 → 320 → Save: the row reads 320 with its `datetime`
      unchanged, the gauge 320 (T6, ACC-D12-2, D-16.19)
- [x] Long-press (1 s of page clock) → the bar with "1 selected" and Combine off, "+" hidden → tap
      the coffee ("Select …", not pressed) → "2 selected" → Combine → one row "Toast + Coffee with
      milk 310 kcal", gauge 310, "+" back (T7, D-16.20)
- [x] Review → reload → the same name, amount, unit, values and photo, no new AI request → Log →
      reload → the entry, no review (T8, ACC-D25-1, D-16.46)
- [x] `busy-then-ok`: after the 429 the overlay and its spinner stay and no failure shows; one
      ladder wait on the page clock → a third request equal to the second → the review (410 kcal,
      1 bowl) → Log → Home; the failure never appeared (T9, R03.6, D-16.23)
- [x] Network guard: every test ends with no request off loopback outside the routed hosts; a
      `fetch('https://example.com/…')` added to T6 failed it on the stray list (file restored)
- [x] The busy check fails when the provider does fail: with `garbage` in place of `busy-then-ok`
      T9 failed at "the overlay stays up and no failure shows" (file restored)
- [x] No uncaught page error in any test (the `afterEach` check)
- Deliberate differences: none against the reference (no reference flow).
- Not taken: FoodData Central with a key (see Decisions for the lead); a parity scenario (none is
  listed for P06).

## Status

Done (2026-10-27). The nine tests passed three times in a row (27/27, `--repeat-each=3`, one
worker), and the whole e2e folder once (15/15, the walking skeleton and onboarding included). No
file outside the task's set changed; `e2e/support.ts` only gained helpers (and `fakeAi.useReplies`).
