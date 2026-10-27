# Task: Product fields page (P09-06) · Phase: 09 · Owner: builder (wt-p09s02)

<!-- Save as platewise/docs/notes/P<nn>/<slug>.md. Write everything above "Compare checklist"
BEFORE writing code, in your own words. Never paste or paraphrase the reference line by line. -->

Read (reference @ `10e14b67`): `android/.../ui/settings/ProductInfoSettingsScreen.kt` (the page part:
nothing drawn until the stored switch is read, the master switch with a footer, the per-field card
only while the block is on, each field switch writing "hidden" for its one field; the FoodData
Central key section at its end belongs to P09-07 and was not used),
`ios/calorietrackerTests/ProductInfoSettingsTests.swift` (empty storage hides nothing, display order,
unknown keys dropped, block off shows nothing). Research spec `06-settings-data.md` §3.8.

What it does (own words): Settings › Product details chooses what the product block at the end of
a scanned product's review shows. A first switch turns the whole block on or off (on by default).
While it is on, a second card holds one switch per detail, 11 in all, in the block's own order
(`PRODUCT_FIELDS` in the settings schema), each on while its detail is shown. A hidden detail is stored by its
key in `product.hiddenFields`; keys this build does not know are ignored by the settings reader. A
note says allergen warnings are not switched here: they follow the allergens in Personal info. The
review's block (`ProductBlock`, P06) already reads both settings, so a change shows there at once.

Inputs → outputs: `product.show`, `product.hiddenFields` (read with `useSettings`) →
`appSettings.set('product.show', on)` / `appSettings.setProductFieldHidden(field, hidden)` (one
field per write, read-modify-write inside one transaction) → `ProductBlock`.

Files: created `src/features/settings/app/ProductFieldsPage.tsx` with its test; uses `writes.ts`
and the `appSettings` service from P09-02. Shared, additive: the `product-fields` entry in
`src/features/settings/registry.ts`.

Edge cases / failure modes:
- Settings not read yet → nothing drawn (R06.22); read failed → a note.
- An unknown stored key (an older or newer build's field) is dropped on read, and the next write
  stores only known keys.
- Two quick presses on different fields → both stay (one-field writes, like the tabs).
- A failed write → the switch goes back and a toast says so.

Our design differences / decisions:
- The page is called Product details, like the block it controls; field names reuse the block's
  own words so the two always match.
- The field card is drawn only while the block is on (as in the reference); the hidden list is kept
  while the block is off.
- The FoodData Central key lives on the AI page (P09-07, `FoodDbSection.tsx`), not here.

Tests we will write:
- Master switch on by default with the 11 switches in display order and the allergen note.
- Hiding NOVA removes it from the review's product block (ACC-J6-1).
- Block off hides every detail and the field card; on again shows them.
- An unknown stored key is ignored and dropped by the next write.
- A failed write flips the switch back with a toast.

Compare checklist (filled after the rewrite; reopened `ProductInfoSettingsScreen.kt`,
`ProductInfoSettingsTests.swift`):
- [x] nothing drawn until the stored switch is read, so a block switched off never shows on
      (`ProductFieldsPage.test.tsx > ProductFieldsPage > draws nothing until the settings are read
      (R06.22)`)
- [x] master switch on by default, field card with every detail on, in display order, and the
      allergen note (`ProductFieldsPage.test.tsx > ProductFieldsPage > shows the block switched on and
      the 11 details in the block order, each on, with the allergen note`)
- [x] a hidden detail leaves the review's block (`ProductFieldsPage.test.tsx > ProductFieldsPage >
      takes NOVA out of the review's product block and keeps the rest (ACC-J6-1)`)
- [x] block off shows nothing and hides the field card; the hidden list is kept
      (`ProductFieldsPage.test.tsx > ProductFieldsPage > hides the whole block and the detail list
      when switched off, and keeps the hidden details`)
- [x] unknown stored keys ignored; stored list in display order (`ProductFieldsPage.test.tsx >
      ProductFieldsPage > ignores a stored detail this build does not know, and drops it with the
      next change`; `src/services/appSettings.test.ts > setProductFieldHidden > hides one detail at a
      time and stores the list in the block order`, `> drops a stored name this build does not know
      when it writes`)
- [x] a failed write flips back with a message (`ProductFieldsPage.test.tsx > ProductFieldsPage >
      flips a switch at once and goes back with a message when the change fails`)
- [x] registered and opened under its title (`ProductFieldsPage.test.tsx > ProductFieldsPage >
      opens at #/settings/product-fields under its title`; linked from `AppPage.test.tsx > AppPage >
      opens the pages under it, with Add menu first once that page is registered`)
- Deliberate differences: the page is called Product details (the block's heading); field names
  reuse the block's own words; one-field writes read the stored list inside the transaction (the
  reference rewrites the set it holds); the block's description sits in the switch's description
  line and the allergen note under the cards; a failed write says so in a toast.
- Not taken: the FoodData Central key section (P09-07, `FoodDbSection.tsx`). The block's own
  rendering rules (fields without data skipped, source only for FoodData Central) were already
  P06's and are tested in `ProductBlock.test.tsx`.

## Status

Done (2026-10-27). Shared, additive: the `product-fields` entry in
`src/features/settings/registry.ts`.
