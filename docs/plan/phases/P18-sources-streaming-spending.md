# P18 · Nutrient sources, live Coach replies, food prices and spending

**Weeks:** 1 · **Tracks:** i18n (catalogue on demand); Home (nutrient sources); Coach (streaming); data, analysis,
Progress (prices and spending) · **Depends on:** P00–P17 · **Status:** 📋 planned (2026-10-29, at the owner's request)
· **Ships as:** 1.6.0

## Goal

The owner asked (2026-10-29) for four things: tap Sugar, Fat, Fibre or any nutrient and see which foods gave the most of
it, and each food's own amounts; the Coach's reply shown live as it is written; a price on each food (typed on the
foods already logged, and taken from what the person says when they describe a meal: "paneer roll, ₹120"); and a view
of how much money goes on food each day and each month.

Initial JavaScript is 249.3 kB of the 250 kB budget (L10), so the catalogue's words for screens that load on demand
must load with them before these features add their own.

## Decisions

- **P18-00 Catalogue partitions on demand.** Partitions used only by lazily loaded screens or by the Android app (at
  least `walk`, `onboarding`, and others the builder finds worth it) leave the initial bundle and are registered when
  their screens' chunks load, before those screens draw; `t()` and the catalogue lint see every partition, the tests
  see them all, and nothing on screen ever shows a raw key. Report the initial size before and after.
- **D-16.105 Nutrient sources.** In All nutrients each nutrient row (calories, the macros, the 23 nutrients, the
  sports compounds) opens **Sources** for the shown day: the day's foods that carry that nutrient, largest first, each
  with its amount and share of the day's total, the total against the goal or limit when one is set, and the foods with
  no figure counted apart ("3 foods have no fibre figure"), never as 0. A food opens its entry, which lists all its
  nutrients. The Sugar line (D-16.98) opens Sugar's sources directly; a pillar opens its nutrient's sources.
- **D-16.106 Coach replies stream** (replaces D-16.47; inventory I13 becomes P1). The Coach asks every provider for a
  streamed reply (Anthropic and OpenAI-compatible server-sent events, Gemini `streamGenerateContent` with `alt=sse`) and
  shows the text as it arrives, with a working mark; tool rounds stream their text and run their tools when the round
  ends; the reply is stored once it is complete. An answer that does not come as a stream (an older Custom or Ollama
  server) is read whole, as today. A failure mid-reply keeps the error and Retry (I11) and stores nothing partial.
  Thinking is never shown. Switching chats leaves a streaming reply running (D-16.99); its chat shows it live when
  opened. Food analysis and every JSON task stay unstreamed.
- **D-16.107 Food prices.** A diary entry may carry a price (`price?: { amount: number; currency: string }`, ISO 4217
  code, amount in that currency's major unit). The currency is a setting (`money.currency`, defaulting from the
  locale's region: INR for India, USD for the United States, EUR in the euro area, else USD) in Settings › Units. The
  entry editor and the review sheet have a Price field; a saved meal keeps its price when logged again (editable).
  When the person's own words (a described meal, a photo's note) state a price, the analysis returns it and the review
  shows it; the AI never guesses one. Entries without a price are "no price", never 0. Prices travel in backups and the
  diary file; 1.5 drops the field when it reads a 1.6 backup.
- **D-16.108 Spending.** Home shows the shown day's spend under the day's summary when any entry has a price ("₹240
  spent today", "from 4 of 6 foods" when some have none), with a switch (`home.spendLine`, on). Progress › Spending:
  the last 7 and 30 days as bars, this month's total and the average per day with a price, the months (up to 12) as
  totals, spend by meal (breakfast, lunch, dinner, snack) and the foods that cost most; prices in another currency are
  totalled apart. The Coach's food log rows carry the price and its context today's spend.

## Slices (wave 24, parallel)

- **S0 catalogue on demand** (P18-00).
- **S1 nutrient sources** (P18-01).
- **S2 Coach streaming** (P18-02).
- **S3 prices and spending** (P18-03, P18-04).

## Tasks (5)

| ID | Task | Verify |
|---|---|---|
| P18-00 | **Catalogue partitions on demand.** Lazy registration for partitions only lazy or Android-only screens use; `t()`, the lint and the tests see all; no raw key ever drawn. | unit tests for registration and a missing-partition guard; every screen test and e2e unchanged; initial bundle measured before and after. |
| P18-01 | **Nutrient sources.** The Sources sheet from All nutrients, the Sugar line and the pillars; amounts, shares, the goal or limit, foods without a figure; a food opens its entry. | unit tests for the sums (no figure never 0) and the sheet; an e2e step from the Sugar line. |
| P18-02 | **Coach streaming.** Streamed requests and readers for the three wire formats, the fallback for an answer that is not a stream, the live text in the chat, tool rounds, errors, a reply running in another chat. | unit tests per wire format with recorded streams (text deltas, tool calls, stops, errors, a non-stream answer); the fake AI serves a stream in e2e; the Coach e2e sees text grow. |
| P18-03 | **Prices.** The entry field and codec, the currency setting, the editor and review Price fields, saved meals, the analysis prompt and reader (a stated price only), backups and the diary file. | unit tests: codec, a stated price read and an unstated one left out, editor, review, saved meal, backup round trip. |
| P18-04 | **Spending.** The Home line and its switch, Progress › Spending (days, months, by meal, top foods, other currencies apart), the Coach's food log price and today's spend. | unit tests for the sums (no price never 0, currencies apart) and the screens; e2e: log a meal with a price, see it on Home and in Spending. |
