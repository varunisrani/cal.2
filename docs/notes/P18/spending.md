# Task: Spending (P18-04, D-16.108) · Phase: 18 · Owner: builder (wt-p18s3, slice S3)

<!-- Save as platewise/docs/notes/P<nn>/<slug>.md. Write everything above "Compare checklist"
BEFORE writing code, in your own words. Never paste or paraphrase the reference line by line. -->

Read (reference @ `10e14b67`): no reference file; the reference keeps no prices, so it has no
spend line, no spending view and no spend in its Coach (see `food-prices.md`). Ours: the P18
phase file (D-16.108), `food-prices.md`, `src/features/home/{HomePage,DaySummary,SugarLine,
DayNutrientsSheet}.tsx` and the Sugar line's note (`docs/notes/P16/sugar-on-home.md`: the pattern
for a line under the summary with an honest coverage note and a switch in All nutrients),
`src/services/homePrefs.ts`, `src/features/progress/{ProgressPage,CaloriesCard}.tsx`,
`src/ui/charts/{BarChart,ChartTable}.tsx` (a day without a value gets no slot there, which is
not what "no prices" needs), `src/app/{router,Screen}.ts(x)` (nested addresses, tab memory),
`src/features/settings/{SettingsScreen,CategoryFrame}.tsx` (a nested page with a back link),
`src/data/hooks.ts` (`useEntriesBetween`), `src/domain/dates/*`, `src/services/coach/{tools,
context}.ts` and their tests.

What it does (own words): Home shows, under the day's summary, what the shown day's food cost:
"₹240 spent", with "from 4 of 6 foods" when some foods have no price; prices in another currency
are added apart ("₹240 and $5 spent"), never converted. A day where no food has a price shows no
line, so people who never type prices never see it; a switch "Spending on Home" in All nutrients,
beside Sugar on Home, turns it off (`home.spendLine`, on by default). A tap opens Progress ›
Spending (`#/progress/spending`), a page of its own under Progress (reached also from a Spending
row on Progress), fetched when first opened. It shows, in the person's currency: the last 7 or 30
days as bars (a day without a price is marked "no prices", never drawn as 0), this month's total
and the average per day that had a price, the months (this one and up to 11 before it, from the
first month with a price) as totals, the spend by meal (breakfast, lunch, dinner, snack, and
other when used) and the foods that cost most (by name, with how often). Prices in other
currencies are totalled apart under the bars and the month. Without any price yet the page says
how to add one. The Coach's food log rows carry each entry's price, and its facts for a turn hold
today's spend and how many of today's foods had a price (only when any had one).

Inputs → outputs:
- `src/domain/money/spending.ts` (new, pure, in the start-up download): `spendOf(entries,
  currency)` → `{foods, priced, totals: [{currency, amount, foods}]}` (the person's currency first,
  then the others by code), with the `Tally` it adds in hundredths.
  `src/domain/money/report.ts` (new, fetched with the page): `spendingWindow(today)`,
  `spendingReport({entries, today, currency, period})` → the day bars (`amount` or null), the
  period's total and other currencies, the month (`total`, `pricedDays`, `average`, other
  currencies), the months, by meal, the top foods. Split from `spending.ts` so the start-up
  download holds only what Home needs.
- `src/features/home/SpendLine.tsx` (new): the line (`spending.home`, `.amount`, `.coverage`), a
  button named by its words; HomePage draws it under the summary card while `home.spendLine` is on
  and any entry of the shown day has a price; the tap navigates to `SPENDING_ROUTE`.
  `DayNutrientsSheet`: the Spending on Home switch (`spending.home.switch`).
  `src/services/homePrefs.ts` (shared): `setSpendLine`.
- `src/app/router.ts` (shared): Progress takes one nested page (`#/progress/<page>`); re-tapping
  Progress inside it goes back to Progress, as Settings does.
- `src/features/progress/ProgressPage.tsx`: routes `#/progress/spending` to the lazy page and
  sends any other page back to Progress before anything is drawn; the overview gains the Spending
  row (`src/features/progress/SpendingLink.tsx`, `spending.link`).
- `src/features/progress/spending/{SpendingPage,SpendBars}.tsx` + `spending.module.css` (new, a
  chunk of their own; hooks `screen.progress.spending`, `spending.back`, `spending.period`,
  `spending.days(.total|.others)`, `spending.bars(.table)`, `spending.month(.total|.days|.average|
  .others)`, `spending.months.list`, `spending.meals.list`, `spending.top.list`, `spending.empty`,
  `spending.error`).
- `src/services/coach/tools.ts`: `price {amount, currency}` on a food row.
  `src/services/coach/context.ts`: "Spent on food: …" in Today so far.
- `src/i18n/format.ts` (shared): `formatMoney`, `formatMoneyList`. Strings: `home.spend`,
  `home.nutrients.spendLine`, `home.nutrients.spendLineHint` (Home, in the start-up catalogue; the
  coverage note reuses `home.sugar.coverage`); the new `spending` partition for the page and its
  row on Progress (lazy screens).

Files: created `src/domain/money/{spending,report}.ts` (+ test), `src/features/home/SpendLine.tsx`
(+ test), `src/features/progress/SpendingLink.tsx`, `src/features/progress/spending/*` (+ test),
`src/i18n/en/spending.ts`; the e2e is a new test in `e2e/logging.spec.ts` (its onboarding and
helpers), in en-IN and Asia/Kolkata. Changed `src/features/home/{HomePage,DayNutrientsSheet}.tsx`,
`home.module.css`, `src/features/progress/ProgressPage.tsx`, `src/services/coach/{tools,
context}.ts`, `src/data/settingsSchema.ts`, `src/i18n/en/home.ts`, tests, `docs/user/*`. Shared:
`src/app/router.ts` (+ test), `src/services/homePrefs.ts` (+ test), `src/i18n/en.ts`,
`e2e/support.ts` (a price on a fake food answer).

Edge cases / failure modes:
- No price never counts as 0: a day, a meal, a month without prices says so; the average divides
  by the days that had a price.
- A price of 0 counts: a day of free food is a day with a price ("₹0 spent").
- Several currencies on one day: each totalled apart, the person's own first; foods priced in
  another currency count as priced in "from n of m".
- The person's currency changes: totals follow the new one, and the old prices show apart as
  another currency (never converted).
- A day with entries only in another currency: the bars show it as "no prices" in the person's
  currency; the other currency's total is listed apart.
- Rounding: sums are kept in hundredths (integer cents) so 0.1 + 0.2 never shows 0.30000000004.
- Months: from the first month with a price, at most 12; a month in between without a price shows
  "No prices".
- Top foods: by name ignoring case, accents and spaces, the most spent first, ties by count then
  name; at most 5.
- Home: no line on a day without priced food, and none with the switch off; the line follows the
  shown day.
- `#/progress/anything-else`: back to Progress, nothing drawn first. Back from Spending: Progress.

Our design differences / decisions:
- Spending is a nested page under Progress (`#/progress/spending`), not a card: it has five parts
  and its own period switch; a row on Progress links to it. Home's tap goes straight there.
- The spend line sits under the summary card, outside it (the summary's own lines are the day's
  nutrition); the gauge and the pillars are untouched.
- No line on a day without any price (as the Sugar line shows none without food): a person who
  never types prices never sees spending on Home.
- The period switch (7 days / 30 days) drives the bars, by meal and top foods; the month and the
  months are calendar months. Today counts (spending is not a goal that a half day distorts).
- By meal includes "Other" only when used. Top foods: 5.
- The Coach's spend fact appears only when today has a priced food, so people who never use
  prices get no extra line in every turn; amounts are written with their ISO codes ("120 INR").
- Our own small bar drawing instead of `BarChart`: every day keeps its slot so a day without
  prices can be marked, and the hidden table lists every day ("No prices").

Tests we will write:
- `src/domain/money/spending.test.ts`: `spendOf` (none, partial, 0 counts, currencies apart, the
  person's first, cents), the report (bars with null days, month total and average per priced
  day, months from the first priced one and at most 12, by meal, top foods, other currencies).
- `src/features/home/SpendLine.test.tsx`: the text, coverage, several currencies, nothing without
  prices, the tap.
- `HomePage.test.tsx`: the line for the shown day, hidden with the switch off, the tap navigates;
  `DayNutrientsSheet.test.tsx`: the switch.
- `src/features/progress/spending/SpendingPage.test.tsx`: empty state, bars with "no prices",
  month, months, by meal, top foods, other currencies, 7/30 switch, the back link.
- `ProgressPage.test.tsx`: the Spending row opens the page; an unknown page goes back.
- `src/app/router.test.ts`: `#/progress/spending` parses; too deep refused; re-tap goes up.
- `src/services/coach/tools.test.ts`, `context.test.ts`: the price on a row; today's spend with
  coverage; none without prices.
- `src/services/homePrefs.test.ts`: `setSpendLine`.
- e2e (en-IN, Asia/Kolkata): describe a meal with a price, the review shows it, Log, Home shows
  the spend, Spending shows the day.

Compare checklist (filled after the rewrite; reopened: nothing to reopen, the reference has no
spending; checked against D-16.108 and the Sugar line's pattern instead):
- [x] The sums: no price never 0, a price of 0 counts, currencies apart with the person's first,
  hundredths (tested in `src/domain/money/spending.test.ts` > spendOf (D-16.108)); the report: every
  day a slot with null for no prices, 30 days, the month's total and the average over priced days
  rounded to hundredths, months from the first priced one and at most 12, by meal in meal order,
  top foods by name ignoring case and spaces (at most 5), other currencies apart and out of the
  person's figures, nothing after today (tested in `spending.test.ts` > spendingReport (D-16.108),
  spendingWindow).
- [x] Home's line: the amount, "from n of m foods", several currencies, cents only when there are
  some, ₹0, nothing without prices, the tap (tested in `src/features/home/SpendLine.test.tsx`); the
  shown day's spend, the tap to Progress › Spending, the switch beside Sugar on Home stores
  `home.spendLine`, no line on a day without prices (tested in
  `src/features/home/HomePage.test.tsx` > HomePage: the spend line (D-16.108);
  `DayNutrientsSheet.test.tsx` > has the Spending on Home switch …; `src/services/homePrefs.test.ts`
  > setSpendLine; `src/data/settingsSchema.test.ts` > shows the spend line …).
- [x] Spending: back link, empty state, load failure, 7 bars with "no prices" days marked and
  listed in the hidden table, the total, other currencies apart, this month, months, by meal, top
  foods, the 30-day switch (tested in `src/features/progress/spending/SpendingPage.test.tsx`); the
  Progress row opens it and Back returns, an unknown page goes back to Progress (tested in
  `src/features/progress/ProgressPage.test.tsx` > ProgressPage: Spending (D-16.108)); the address
  and the re-tap (tested in `src/app/router.test.ts` > parses one page under Progress …, returns
  to Progress when Progress is tapped on Spending …).
- [x] Coach: the price on a food log row, none without (tested in
  `src/services/coach/tools.test.ts` > gives the price in its own currency …); today's spend after
  sugar, coverage, currencies apart, no line without prices (tested in
  `src/services/coach/context.test.ts` > coachContext: what today's food cost (D-16.108)).
- [x] End to end: a described meal with its price logged in en-IN, Home's "₹120 spent", the tap
  to Spending with today's bar, yesterday marked, this month and the food listed, Back to Progress
  (tested in `e2e/logging.spec.ts` > a meal with a price, in India (D-16.107, D-16.108)).
- Deliberate differences: none from the reference (it has no spending); our choices are listed
  above.
- Not taken: a converted grand total across currencies (never converting is D-16.108's rule).

## Status

Done (2026-10-28). Lines outside the task's files (shared): `src/app/router.ts` (+ test: Progress
takes one nested page, `SPENDING_ROUTE`, the re-tap goes up for any tab with pages),
`src/services/homePrefs.ts` (+ test: `setSpendLine`), `src/i18n/en.ts` (the new partitions),
`src/i18n/format.ts`. Bundle: initial JS 249.30 → 250.98 kB gzip (+1.68, over the 250 kB budget by
0.98): Home's line, the row's price and the switch with their CSS names (+0.71 in `index`), the
shared `price` chunk the codecs and the settings defaults need (+0.53), strings and `formatMoney`
(+0.40 in `t`, of which the two new partitions are 0.23 and leave with P18-00), the settings
schema (+0.05). The Spending page and the report (3.1 kB), the editor's and review's field, the
Settings row and the AI's price rule are all fetched on demand. Fetching the spend line on demand
too would save about 0.3 kB more but would make it appear after the summary on a priced day; left
eager, for the lead to decide. Follow-ups: the `spending` partition registers with the page once
partitions load on demand; `docs/user/coach.md` (S2's) may add that the Coach sees today's spend
and each food's price.
