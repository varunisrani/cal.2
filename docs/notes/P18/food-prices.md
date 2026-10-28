# Task: Food prices (P18-03, D-16.107) · Phase: 18 · Owner: builder (wt-p18s3, slice S3)

<!-- Save as platewise/docs/notes/P<nn>/<slug>.md. Write everything above "Compare checklist"
BEFORE writing code, in your own words. Never paste or paraphrase the reference line by line. -->

Read (reference @ `10e14b67`): no reference file. The reference has no price on a food entry, no
currency setting and no spending view (a search of its iOS and Android sources for price, spend
and currency finds only its own paid AI plan and store listings, which are not food data), so
there is nothing to compare against beyond the shapes it shares with us (an entry, a saved meal,
the analysis reply). Ours: the P18 phase file (D-16.107, D-16.108), `src/domain/model.ts`
(`NutritionDraft`, `DiaryEntry`, `SavedMeal`, `AnalysisDraft`), `src/data/codecs.ts` (unknown
fields left behind, so a price must be read there or it is lost on every write),
`src/data/settingsSchema.ts`, `src/data/repos/savedMealsRepo.ts` (`snapshotOf` copies through the
codec), `src/domain/food/reuse.ts` (`reuseDraft` builds a fresh draft field by field),
`src/services/diary.ts` (`entryFrom` spreads the draft), `src/domain/servings/scale.ts`
(`draftAtAmount` spreads), `src/features/log/{EntryEditor,review/ReviewSheet}.tsx`,
`src/ai/prompts/{food,contract}.ts`, `src/ai/parse/foodReply.ts`, `src/ai/tasks/food.ts`,
`src/services/{analysis,reprocess}.ts`, `src/services/backup/payload.ts` (rows through the codecs),
`src/services/transfer/{exportDiary,importDiary}.ts`, `src/features/settings/app/UnitsSection.tsx`,
`src/ui/{Field,ListPicker}.tsx`, `src/i18n/format.ts`, `src/domain/units/{numbers,defaults}.ts`.

What it does (own words): a logged food may carry what it cost. The editor and the review have a
Price field: an amount typed in the person's currency (shown beside the field as its code), empty
for no price. The currency is a setting (Settings › App settings › Units › Currency), first set
from the browser's region (India INR, the United States USD, the euro area EUR, Britain GBP, any
other region or none USD). A price is kept in the currency it was given in: changing the setting
later never converts or relabels what was logged. When the person's own words state a price (a
description "paneer roll ₹120", a photo's note "paid 5 dollars"), the analysis returns it and the
review shows it filled in; the AI is told never to estimate one, and the reader only accepts a
price when the person's words hold a number at all, so a photo without a note, or words without a
figure, never come back priced. A saved meal keeps its price, and so does a food picked again
from Recent or Often: the review opens with it, editable. A price is never 0 by default: no price
is absent, and a price of 0 (a free meal) is a price. Prices travel in backups and the diary file.

Inputs → outputs:
- `src/domain/model.ts`: `Price {amount, currency}` and `NutritionDraft.price?` (so entries, saved
  meals and analysis drafts carry it).
- `src/domain/money/price.ts` (new, pure, in the start-up download): `isCurrencyCode`,
  `currencyCodeOf`, `readPrice(raw)` (an object with a finite amount ≥ 0, kept to 2 decimals, and
  a 3-letter code, upper-cased; else undefined), `currencyForLocale(tag)`, `DEFAULT_CURRENCY`.
  `src/domain/money/priceText.ts` (new, only the lazy editor and review use it):
  `readPriceText(text, locale)` (typed text → none / an amount / invalid), `priceInputText(amount)`.
- `src/data/codecs.ts`: `decodeNutritionDraft` reads `price` through `readPrice`.
- `src/data/settingsSchema.ts`: `money.currency` (default from the locale's region, a code).
- `src/domain/food/reuse.ts`: `reuseDraft` copies the price (shared, one line).
- `src/ai/parse/foodReply.ts`: `FOOD_REPLY_KEYS.price` and `PRICE_REPLY_KEYS {amount,
  currency}`; `readFoodReply` keeps a stated price when the context's words hold a digit; a
  missing or unreadable code takes the context's currency (the setting), else the price is
  dropped.
- `src/ai/prompts/{contract,food}.ts`: the contract names `price` (null unless stated); a price
  rule for the description and for a note, with the person's currency for a bare amount or a
  symbol several currencies share.
- `src/ai/tasks/food.ts` (shared): the currency goes to the prompt and the reader, the words
  (description, note) to the reader. `src/services/analysis.ts` (shared) reads `money.currency`
  for each analysis; `src/services/reprocess.ts` (shared) takes it on the request.
- `src/features/log/review/PriceField.tsx` (new): the field (`withTypedPrice`,
  `priceTextInvalid`); `ReviewSheet` (hook `price.review`) and `EntryEditor` (`price.editor`) use
  it (an invalid amount shows its error and holds Log or Save back).
- `src/features/home/EntryRow.tsx`: the row shows its price quietly beside the time
  (`price.row`).
- `src/features/settings/app/CurrencyRow.tsx` (new) in `UnitsSection.tsx` (shared): a Currency
  row (`price.currency`) opening a list of 35 common currencies (named by `Intl.DisplayNames`),
  the stored one always in it; `money.currency` joins `PLAIN_APP_SETTINGS`
  (`src/services/appSettings.ts`, shared, one line).
- `src/i18n/format.ts` (shared): `formatMoney(amount, currency)` (Intl currency style, whole
  amounts without decimals) and `formatMoneyList` ("₹240 and $5").
- Backups: nothing new beyond the codec (rows go through it both ways). The diary file
  (`exportDiary.ts`, `importDiary.ts`): `price {amount, currency}` on an item; an import reads it
  (a malformed one refuses the food, as a malformed note does).
- Strings: a new `price` partition (`price.*`), used only by lazily loaded screens.

Files: created `src/domain/money/{price,priceText}.ts` (+ tests),
`src/features/log/review/PriceField.tsx` (+ test), `src/features/settings/app/CurrencyRow.tsx`,
`src/i18n/en/price.ts`. Changed `src/domain/model.ts`, `src/data/codecs.ts`,
`src/data/settingsSchema.ts`, `src/ai/prompts/{contract,food}.ts`, `src/ai/parse/foodReply.ts`,
`src/features/log/{EntryEditor,review/ReviewSheet}.tsx`, `src/features/home/EntryRow.tsx`,
`src/services/transfer/{exportDiary,importDiary}.ts`, their tests, `docs/user/logging-tips.md`.
Shared: `src/domain/food/reuse.ts`, `src/ai/tasks/food.ts`, `src/services/analysis.ts`,
`src/services/reprocess.ts`, `src/features/settings/app/UnitsSection.tsx`, `src/i18n/format.ts`,
`src/i18n/en.ts` (the new partitions, until the lead registers them on demand).

Edge cases / failure modes:
- A stored price with NaN, Infinity, a negative amount, a missing or malformed code: no price (the
  entry stays readable). More than 2 decimals: rounded to 2.
- A price of 0 is a price ("free"), never the same as none.
- A backup or a diary file from 1.5 (no prices) reads as before; 1.5 reading a 1.6 backup drops
  the field (its codec leaves unknown fields behind).
- The AI returns a price for a photo without a note, or for words without any figure: dropped.
- The AI returns a price without a currency, or a code that is not 3 letters: the person's
  currency when the words gave an amount; never a made-up currency.
- The AI returns a price that is negative, not finite or words ("about 100"): dropped (never a
  guess). A number written as text ("120") reads as the number, as every figure of the reply does
  (`readNumber`).
- The person changes the currency setting: prices already logged keep theirs; a price typed into
  an entry that has none takes the current setting; an entry's own price keeps its currency when
  edited.
- Changing the amount on the serving card does not change the price: the price is what the
  person paid for what they logged, and the field is right there to change.
- The Price field: "", spaces → none; "120", "4.50", "4,50", "1,200" (the locale's grouping) →
  an amount; "-5", "abc", "12 rupees" → invalid (its error, Log or Save held back).
- Reprocessing an entry from its note: a price stated in the note replaces the field's; none keeps
  the field as it was.

Our design differences / decisions:
- The price sits on `NutritionDraft` (not only on the entry), so it travels through the review
  draft, saved meals and Recent without a second path; `price` is optional, so every existing
  record and fixture stands.
- Recent and Often carry the price as saved meals do (one rule for reuse); editable at review.
- Not scaled with the amount (above). Rounded to 2 decimals for every currency (a 0-decimal
  currency such as JPY simply has none); Intl shows each currency's own digits.
- The currency list in Settings is a short list of common currencies (35) plus the stored one,
  named by the browser (`Intl.DisplayNames`), rather than all ~300 ISO codes.
- The reader's digit check is ours: a price must come from words that hold a figure ("₹120",
  "Rs 120", "$5", "5 dollars"); spelled-out amounts ("five dollars") are not taken. Simple and
  strict, so the AI can never invent one.
- The euro area default covers the 21 member states (Bulgaria joined in 2026) and the four that
  use the euro by agreement (Andorra, Monaco, San Marino, Vatican City).
- The diary file's CSV and Markdown formats are unchanged (only the JSON file carries prices);
  a price column there is a follow-up.
- A diary-file import that matches a stored entry takes the file's price, as it takes the file's
  note (the file is what was exported and edited); a file without one leaves the entry without.

Tests we will write:
- `src/domain/money/price.test.ts`, `priceText.test.ts`: `readPrice` (finite, ≥ 0, 2 decimals,
  code checks, upper-casing), `currencyForLocale` (IN, US, euro area, GB, other, bare language,
  unreadable), `readPriceText`, `priceInputText`.
- `src/data/codecs.test.ts`: an entry, a saved meal and a draft keep a price; bad prices dropped.
- `src/data/settingsSchema.test.ts`: `money.currency` default by locale and reader.
- `src/ai/parse/foodReply.test.ts`: a stated price read; none without words or without a digit;
  the setting's currency for a missing code; malformed values dropped.
- `src/ai/prompts/food.test.ts`, `contract.test.ts`: the key and the rule, the currency named.
- `src/ai/tasks/food.test.ts` (the fake AI): a description with a price → filled; without → empty;
  a photo with no note → empty even when the AI sends one.
- `src/features/log/review/PriceField.test.tsx`; `ReviewSheet.test.tsx` (an AI price shown, typed,
  cleared, invalid blocks Log, logged); `EntryEditor.test.tsx` (shown, edited, cleared, saved;
  reprocess keeps or takes the stated one).
- `src/domain/food/reuse.test.ts`: the price carried. `src/data/repos/savedMealsRepo.test.ts`: a
  saved copy keeps it.
- `src/services/backup/restore.test.ts`: a round trip keeps prices; rows without them stay without.
- `src/services/transfer/exportDiary.test.ts`, `importDiary.test.ts`: the field out and back in.
- `src/features/home/EntryRow.test.tsx`: the price shown quietly; none without one.
- `src/features/settings/app/UnitsSection.test.tsx`: the Currency row stores a choice.

Compare checklist (filled after the rewrite; reopened: nothing to reopen, the reference has no
price, currency or spending; checked the shapes it shares with us instead, an entry, a saved meal
and the analysis reply, against our own tests):
- [x] Codec: a price kept on an entry, a saved meal and a stored draft; tidied to 2 decimals and an
  upper-case code; NaN, Infinity, negatives, text amounts and bad codes are no price, the row stays
  readable (tested in `src/data/codecs.test.ts` > other food codecs > keep a price … / tidy a
  price …; `src/domain/money/price.test.ts` > readPrice (D-16.107)).
- [x] `money.currency` from the locale's region (IN, US, euro area incl. BG and the four by
  agreement, GB, else USD; bare language and unreadable tags USD), read only as a code (tested in
  `src/data/settingsSchema.test.ts` > takes the currency from the locale's region …;
  `price.test.ts` > currencyForLocale).
- [x] A stated price read and an unstated one left out, with the fake AI: description with ₹120 →
  filled; a bare amount → the person's currency; none stated → empty; words without a figure and
  photos without a note → empty even when the AI sends one; a photo's note → filled (tested in
  `src/ai/tasks/food.test.ts` > a price the person states (D-16.107); the reader's own rules in
  `src/ai/parse/foodReply.test.ts` > readFoodReply: a price the person stated (D-16.107)).
- [x] The prompts: the price rule in the description, and in a photo or label request only with a
  note; the person's currency named; `"price"` in the contract, null unless stated, never
  estimated (tested in `src/ai/prompts/food.test.ts` > the price rule (D-16.107); the key list in
  `contract.test.ts` and `foodReply.test.ts` > reply contract keys); the analysis asks in the
  setting's currency and the draft keeps the price across a reload (tested in
  `src/services/analysis.test.ts` > asks in the person's currency …).
- [x] Review: an AI price shown in its currency and logged; typed in the person's currency; cleared
  → none; text that is not an amount holds Log back; the serving amount leaves the price (tested
  in `src/features/log/review/ReviewSheet.test.tsx` > shows a price the words stated … / opens with
  no price … / holds Log back …; `PriceField.test.tsx`).
- [x] Editor: shown, edited, cleared, added in the person's currency, Save held back while invalid,
  unchanged by the serving amount, reprocess takes a stated price or keeps the typed one (tested
  in `src/features/log/EntryEditor.test.tsx` > EntryEditor: price (D-16.107)).
- [x] Saved meals and reuse carry the price (tested in `src/data/repos/savedMealsRepo.test.ts` >
  keeps the entry's price on the saved copy; `src/domain/food/reuse.test.ts` > keeps the price …).
- [x] Backups carry prices, the currency and the spend switch; rows without a price stay without
  (tested in `src/services/backup/restore.test.ts` > carries prices and the currency …); the
  diary file writes and reads them, a bad one refuses the food (tested in
  `src/services/transfer/exportDiary.test.ts` > writes the price …; `importDiary.test.ts` > reads
  a price … / refuses a food whose price … / takes the file's prices back …).
- [x] The row's price, quiet, before the time (tested in `src/features/home/EntryRow.test.tsx` >
  shows its price quietly …); the currency row in Settings (tested in
  `src/features/settings/app/UnitsSection.test.tsx` > UnitsSection: the currency (D-16.107)).
- [x] End to end in en-IN: "paneer roll, ₹120" → review 120 INR → logged → the row shows ₹120
  (tested in `e2e/logging.spec.ts` > a meal with a price, in India).
- Deliberate differences: none from the reference (it has no prices); our own choices are listed
  above under decisions.
- Not taken: a price column in the CSV and Markdown exports; spelled-out amounts ("five dollars").

## Status

Done (2026-10-28). Lines outside the task's files (shared): `src/domain/food/reuse.ts` (the price
copied), `src/ai/tasks/food.ts` (currency and words to the prompt and reader),
`src/services/analysis.ts` (reads `money.currency`), `src/services/reprocess.ts` (currency on the
request), `src/services/appSettings.ts` (`money.currency` a plain setting),
`src/features/settings/app/{UnitsSection.tsx,appSettings.module.css}` (the Currency row),
`src/i18n/format.ts` (`formatMoney`, `formatMoneyList`), `src/i18n/en.ts` (the `price` and
`spending` partitions, until they load on demand with their screens), `e2e/support.ts` (a price on
a fake food answer). Follow-ups for the lead: the naming table gains `money.currency`; the
`price` partition moves to on-demand registration with the editor, the review and Settings.
