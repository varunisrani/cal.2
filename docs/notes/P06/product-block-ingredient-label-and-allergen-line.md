# Task: product block, ingredient label and allergen line (P06-18) · Phase: 06 · Owner: builder (wt-p06s18)

<!-- Save as platewise/docs/notes/P<nn>/<slug>.md. Write everything above "Compare checklist"
BEFORE writing code, in your own words. Never paste or paraphrase the reference line by line. -->

Read (reference @ `10e14b67`): `A/models/AllergenAnalysis.kt` (all: the ladder, the folding and the
token rule, the alias table), `A/models/IngredientLabelParser.kt` (the markup part only: span →
marker, entity decoding, the word-for-word fallback, the marker splitter), `A/models/
FoodProductMetadata.kt` and `A/models/ProductInfoField.kt` (which fields count as having data, the
order, the off switch), `A/ui/home/FoodProductMetadataCard.kt` (rows, stacked lists, the label
section with its warning) and the two places `A/ui/home/FoodResultSheet.kt` shows the allergen
check and the product block; tests `T/models/AllergenAnalysisTest.kt`,
`T/models/ProductInfoFieldTest.kt`. Research spec `02-food-logging.md` §3.13, §3.14, §3.12 (OFF
details). Feature rows D22, D23 (v1-lite: one paragraph), D24. Ledger rows naming P06-18:
ACC-D22-1, ACC-D23-1, ACC-D24-1 (no trap row names P06-18).

What it does (own words): when the person keeps a list of food sensitivities in their profile, the
review shows one line under the name saying how strongly the food is tied to them: the product
declares one of them, the product warns it may contain one, the label text, the parts of the meal
or the food's name mention one (only "possible"), or nothing can be said. It never says a food is
safe. At the end of the sheet a packaged product shows its details (barcode, the database when it
was FoodData Central, package, the three scores, allergens, may contain, labels, categories and the
printed ingredient list) in a fixed order, leaving out anything empty or hidden in settings, and
nothing at all when the block is switched off. The ingredient list is one paragraph whose allergens
(as Open Food Facts marks them) are bold, with a warning when it mentions one of the person's
sensitivities.

Inputs → outputs: the reviewed food (name, ingredient lines, product details) and the profile's
`allergens` → `{verdict, matches, evidence}` → the line "<verdict>: <matches>". Open Food Facts'
plain and marked-up ingredient text (at lookup) → the text with `_x_` markers on the product
(`markedIngredients`). Product details + settings `product.show` and `product.hiddenFields` → the
fields shown, in order.

Files: created `src/domain/food/{allergens,labelText}.ts` (+ tests),
`src/features/log/review/{ProductBlock,AllergenLine,LabelText}.tsx` (+ tests for the first two; the
label is tested through the block), `src/features/log/review/product.module.css`, this note.
Changed: `src/i18n/en/review.ts` (product, allergen and label words), `ReviewSheet.tsx` (the three
slots in `AnalysisReview` only), `src/domain/model.ts` (one optional field on `ProductInfo`),
`src/services/barcode/lookup.ts` (+ test: the field set where the product becomes the draft).
Shared, additive: `src/ui/icons/index.tsx` (a `warning` icon).

Edge cases / failure modes:
- No sensitivities in the profile (or no profile, or one that cannot be read): no line at all.
- Sensitivities typed with accents, capitals, punctuation or as `en:milk`: folded before matching.
- A sensitivity that folds to nothing ("—"): never matches anything.
- Plural on either side ("peanuts" against "peanut", "eggs" against "egg").
- A multi-word sensitivity ("sesame seeds") matches only when every word appears.
- The same sensitivity found twice, or typed twice: listed once.
- No product, no lines and an unrelated name: "unable to assess", never safe.
- Markup missing, blank, or not the same words as the plain text: the plain text is shown.
- Markup with entities (`&amp;`, `&#233;`, `&#xE9;`, `&nbsp;`): decoded; an invalid code stays.
- Spaces or punctuation inside a span (`<span class="allergen">milk, </span>`): kept outside the
  marker; a span with nothing but those is left as it is.
- Stray underscores in the text: dropped; `__` (an empty pair) is not bold.
- Settings or the profile still loading: the block and the line wait (no flash of hidden fields).
- A product whose fields are all empty or hidden: no block, no heading.

Our design differences / decisions:
- Names are ours (`checkAllergens`, `markAllergens`, `labelPieces`, `ProductBlock`,
  `AllergenLine`, `LabelText`); the field keys are the settings' `PRODUCT_FIELDS`.
- Multi-word sensitivities need every word (the row's rule); the reference also accepts any one of
  its words for a sensitivity outside the alias table.
- Plurals are symmetric (a word matches itself or itself + "s", either way round); the reference
  only lets the candidate carry the "s", so "eggs" typed never matched "egg".
- The alias table is looked up with the same plural rule, so "tree nuts" and "nut" reach the tree
  nut group as "tree nut" and "nuts" do.
- Folding keeps letters of every script (the reference keeps only a–z and 0–9).
- The markers are made once, at lookup, and kept on the product as `markedIngredients` (set only
  when they differ from the plain text); the review only splits them. The plain `ingredients` text
  stays as Open Food Facts gave it, so every other reader sees plain text.
- v1-lite (D23): one paragraph, no heading strip, no list split; the warning (an icon and bold
  text) applies to the whole paragraph; a hidden "Possible allergen:" lead-in tells screen readers
  about either kind of emphasis.
- The allergen line is a short note with an icon under the name, not its own titled card.

Tests we will write:
- `allergens.test.ts`: declared beats traces and text ("milk" against `en:milk`, ACC-D24 ladder);
  traces only → may contain; "whey" in the ingredient text with "dairy" → possible (ACC-D24-1);
  then line names, then the food name; no data or no sensitivities → unable to assess; "peanuts"
  matches "peanut" both ways; accents, capitals and `xx:` prefixes; multi-word needs every word;
  each alias group; matches as typed, once, in profile order.
- `labelText.test.ts`: span markup with entities → `_milk_` markers and decoded text; edge
  punctuation outside; other spans stripped; words differ → plain; markup only → marked; the piece
  splitter (bold pieces, stray underscores, empty pairs).
- `AllergenLine.test.tsx`: the line for each verdict from the profile; no line without
  sensitivities; in `AnalysisReview` under the name, with the saved-label notice for a saved-label
  draft only.
- `ProductBlock.test.tsx`: every field in order with data; empty fields left out; hidden NOVA not
  shown (ACC-D22-1); the block off hides everything; FDC source only for FDC; the label bold from
  span markup with entities (ACC-D23-1) and the warning for a sensitivity; in `AnalysisReview` at
  the end of the sheet.
- `lookup.test.ts`: the stored draft of an Open Food Facts product carries the marked label.

Compare checklist (filled after the rewrite; reopened `AllergenAnalysis.kt`,
`IngredientLabelParser.kt` (markup part), `ProductInfoField.kt`, `FoodProductMetadata.kt`,
`FoodProductMetadataCard.kt`, the two parts of `FoodResultSheet.kt`, both tests):
- [x] Ladder declared → may contain → possible (label, then parts, then name) → unable to assess;
  first rung with a match decides and lists only its matches (`src/domain/food/allergens.test.ts >
  checkAllergens: the ladder (D24) > reports "milk" against a declared en:milk ahead of traces and
  the label`, `> gives "may contain" when only the traces name a sensitivity`, `> then looks at the
  meal's parts, then at the food's name, still only as possible`)
- [x] "whey" with "dairy" is possible (`> finds whey in the ingredient list for "dairy" as a
  possible allergen (ACC-D24-1)`; on screen: `src/features/log/review/AllergenLine.test.tsx >
  AllergenLine > says "Possible allergen: dairy" for whey in the ingredient list (ACC-D24-1)`)
- [x] Never safe: no evidence or no sensitivities → unable to assess (`allergens.test.ts > ... >
  cannot assess a food without evidence, or without sensitivities, and never calls it safe`;
  `AllergenLine.test.tsx > AllergenLine > says only that it cannot assess a food without evidence:
  never "safe"`)
- [x] Matches as typed, trimmed, once each (`allergens.test.ts > ... > lists the matches as typed
  (trimmed), once each, in the profile's order`); the reference's index slip when a blank
  sensitivity is skipped does not exist here (`> skips sensitivities that have no words`)
- [x] Folding: accents, case, `xx:` prefix, non-word characters (`checkAllergens: matching words >
  folds accents and capitals and drops language prefixes on both sides`, `allergenWords > folds,
  lower-cases, drops a language prefix and splits at anything else`); whole words (`> matches whole
  words only`)
- [x] Plurals, "peanuts" against "peanut" (`> matches "peanuts" and "peanut" either way round, and
  other plurals too`)
- [x] Multi-word sensitivities (`> needs every word of a sensitivity of several words`)
- [x] Alias table, every key and the groups' limits (`> lets "%s" find %s through its alias
  group`, `> keeps "%s" from finding %s`)
- [x] Label warning uses the same matching (`mentionsSensitivity > tells whether a text names any
  sensitivity, aliases included`)
- [x] Span → marker with edge spaces and punctuation outside, other spans stripped, underscores
  inside a span dropped, entities decoded, the plain text when the words differ or the markup is
  missing or empty, the markup alone without plain text (`src/domain/food/labelText.test.ts >
  markAllergens (D23) > ...`, seven tests; `decodeEntities > decodes the named, decimal and hex
  entities and leaves those naming no character`)
- [x] Marker splitter: bold pieces, stray underscores dropped, blank pairs plain (`labelPieces >
  splits the markers into bold pieces between plain ones`, `> drops an unpaired underscore and keeps
  an empty or blank pair plain`)
- [x] Fields in the fixed order, only with data, hidden ones dropped, off → nothing, source only
  for FoodData Central (`src/features/log/review/ProductBlock.test.tsx > shownFields (D22) > ...`,
  six tests; on screen `ProductBlock > shows every field with data in order, lists stacked under
  their name`, `> shows only the fields with data that are not hidden: a hidden NOVA group stays out
  (ACC-D22-1)`, `> hides everything, heading included, when the block is switched off`)
- [x] Label bold from span markup with entities (`ProductBlock > shows Open Food Facts' marked
  allergens in bold in the label (ACC-D23-1)`), warning for a sensitivity (`> warns on a label that
  names one of the profile's sensitivities`, `LabelText (D23) > ...`, three tests), announced as a
  possible allergen (the hidden lead-in, same tests)
- [x] Allergen line under the name, product block at the end, saved-label notice only for a saved
  label (`ProductBlock.test.tsx > AnalysisReview: the slots of P06-18 > shows the allergen line
  under the name and the product block at the end`, `> shows the saved-label notice over a draft
  from a saved label`, `> leaves the product block out for a food without product details`)
- [x] The lookup marks the label where the product becomes the draft (`src/services/barcode/
  lookup.test.ts > createBarcodeService > marks Open Food Facts' allergens on the stored product's
  ingredient list (P06-18)`, `> adds no marked list when the markup %s`)
- Mutation check: ignoring hidden fields fails 4 tests; one-way plurals fail 2.
- Deliberate differences: multi-word sensitivities need every word (the reference also takes any
  one word of a sensitivity outside the alias table); plurals both ways; the alias table looked up
  with the plural rule ("tree nuts", "nut"); letters of every script kept by the folding; a lone
  surrogate entity left as text; the markers are made once at lookup and kept beside the plain
  list (`markedIngredients`) instead of replacing it; v1-lite label (one paragraph, no heading
  strip, no list or notes split, D23); a hidden "Possible allergen:" lead-in instead of replacing
  the paragraph's spoken text; the allergen line is a note under the name, not a titled card; the
  block's heading is "Product details" and the label's "Ingredients".
- Not taken: the label's list and notes split and the heading strip (D23's P2 part, v1.x);
  storing the hidden fields as comma text (the settings schema owns that, as a list).

Decisions for the lead (smallest choices, easy to change):
- **The stored draft drops the new field.** `decodeProduct` in `src/data/codecs.ts` rebuilds the
  product field by field, so `markedIngredients` is lost when the barcode service's draft is read
  back by `analysis.restore()` (and when a diary entry is read). Until one line is added there,
  after `put(product, 'ingredients', text(fields.ingredients));`:
  `put(product, 'markedIngredients', text(fields.markedIngredients));` — a looked-up product's
  review shows the plain label without bold. I did not touch `src/data` (import only for this
  slice); a codec test for the round trip belongs with that line.
- `markedIngredients` holds the marked text, not Open Food Facts' HTML, so no markup is stored or
  exported; it is set only when it differs from `ingredients`.
- The product block and allergen words live in the `review` partition (the phase file named a
  `product` partition); P06-11's editor can reuse `AllergenLine` and `ProductBlock` as they are.
- A `warning` icon joined the shared icon set.

## Status

Done (2026-10-27), with one hand-off: the codec line above, without which ACC-D23-1 holds for the
block and the lookup but not across the stored draft. Created `src/domain/food/{allergens,
labelText}.ts` (+ tests: 36 and 12), `src/features/log/review/{AllergenLine,LabelText,
ProductBlock}.tsx` (+ tests: 6 in `AllergenLine.test.tsx`, 17 in `ProductBlock.test.tsx`, the label
tested there), `product.module.css`, this note. Changed: `src/features/log/review/ReviewSheet.tsx`
(`ANALYSIS_SLOTS`: the saved-label notice, the allergen line, the product block), `src/i18n/en/
review.ts` (+27 lines: `review.allergens.*`, `review.product.*`), `src/domain/model.ts`
(`ProductInfo.markedIngredients?`), `src/services/barcode/lookup.ts` (`productDraftOf`, + 3 tests).
Shared, additive: `src/ui/icons/index.tsx` (`warning`). Hooks: `review.allergens` (with
`data-verdict`), `review.product`, `review.product.<field>`, `review.product.label`. ACC-D22-1,
ACC-D23-1 and ACC-D24-1 are now tested.
