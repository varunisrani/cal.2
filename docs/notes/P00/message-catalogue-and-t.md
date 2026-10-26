# Task: message catalogue and t() (P00-05) · Phase: 00 · Owner: builder (wt-p00s3, slice S3)

Read (reference @ `10e14b67`): none. The phase row says "none": the copy is ours, so no reference
file was opened, and in particular none of its string tables (`Localizable.strings`,
`strings.xml`) or its translation-format test. Sources: research spec `06-settings-data.md` §3.22
(languages) and §6 trap R06.23, `07-later-phases-and-web.md` §5.1 and trap R07.20, the naming
table `17-naming-and-glossary.md` §2 (words kept as plain labels), decision D-16.55 and the lead's
task brief.

What it does (own words): every piece of text the app shows comes from one English catalogue, so
no screen hard-codes copy and a later translation wave (L1) only adds catalogues. The catalogue is
assembled from partitions, one file per area or slice under `src/i18n/en/`, so builders working in
parallel never edit the same file; `en.ts` is the only place that lists them and only the lead
adds to it. Code asks for text with `t('common.save')`. Keys are dotted paths through the
catalogue and are checked by the compiler, so a typo does not build. A message can name values
(`{name}`) and choose between singular and plural wording (`{count, plural, one {…} other {…}}`),
with `#` inside a branch printing the count in the person's number format. A catalogue lint runs
as a unit test: every message parses, placeholders are well formed, keys are plain path segments
and no key is defined twice, in one partition or across two.

Inputs → outputs:
- `t(key, params?)` → the rendered string. Unknown key or missing param: throws in tests and in
  dev builds; in production the key itself (unknown key) or the bare `{name}` (missing param).
- `lintCatalogue(partitions)` → a list of problems `{ partition, key, problem }` (empty = clean).
- `mergePartitions(partitions)` → the composed catalogue tree (typed as the intersection of the
  partitions).

Files: created `src/i18n/en.ts`, `src/i18n/en/common.ts`, `src/i18n/catalogue.ts` (tree types,
key typing, merge, flatten), `src/i18n/message.ts` (parser and renderer), `src/i18n/t.ts`,
`src/i18n/t.test.ts`, `src/i18n/lint.ts`, `src/i18n/lint.test.ts`. `catalogue.ts` and
`message.ts` are two extra files the phase table does not list: `en.ts` needs the merge and
`t.ts` needs `en.ts`, so the merge cannot live in `t.ts` without an import cycle, and the parser
is shared by `t.ts` and `lint.ts`.

Edge cases / failure modes:
- Unknown key at runtime (only reachable with a cast or a stale key string from storage).
- Missing param, a plural value that is not a finite number.
- Unclosed `{`, a stray `}`, an empty `{}`, a bad name (`{1x}`), an unknown argument type
  (`{x, select, …}`), a plural without `other`, a repeated or unknown category, junk between
  branches, a branch without braces.
- `#` outside a plural branch is plain text; apostrophes are plain text (no ICU quoting rules, so
  "Today's total" needs nothing special). There is no escape for a literal `{` or `}`: our copy
  never needs one, and the lint rejects a stray brace.
- Plural selection must use English rules (the message's language), not the browser locale: a
  French browser would put 0 in `one`. The number printed by `#` and `{n}` follows the browser
  locale (UI text is English in v1, numbers follow the locale).
- A count such as 1.0004 prints as "1" and must also select `one`: the plural rules use the same
  fraction-digit limit as the number format (Intl's default of three).
- The same key defined in two partitions (silently overridden in a plain spread), or a message in
  one partition where another has a group of messages; a key segment with a dot in it
  (`'tabs.home'`), which would make two different trees flatten to the same key.
- An empty message, a non-string leaf, an empty group.

Our design differences / decisions:
- Partitions are nested trees rooted at their area namespace (the `common` partition holds
  `{ common: { … } }`), and `en.ts` deep-merges them. One area may then be split over several
  partitions (slices of the same phase), which is exactly where a duplicate can appear, so the
  lint checks duplicates across partitions. The runtime merge keeps the first definition and never
  throws, so a duplicate cannot crash a production page; the lint test fails instead.
- Keys typed from the catalogue (`MessageKey<typeof en>`); when the message text contains a `{`,
  the compiler also requires the params argument. Param names themselves are checked at run time.
- Number params are formatted with the cached `Intl.NumberFormat` of the current locale; strings
  are inserted as they are.
- Strict mode (`import.meta.env.MODE === 'test'` or `import.meta.env.DEV`) is the default of the
  bound `t`; `createTranslator(catalogue, { strict, locale })` builds one with explicit settings,
  which the tests use for production behaviour and fixture catalogues.
- Parsed messages are cached per key.
- Plural categories accepted: the six CLDR names; `other` is required. No `=N` exact matches and
  no `select` in this subset (easy to add later).
- Key segments must be identifiers (`^[A-Za-z][A-Za-z0-9]*$`).
- Copy in the `common` partition is ours: "Platewise", tab names Home / Progress / Coach /
  Settings, buttons Save, Cancel, Done, Delete, Back, Retry, Close, Edit, Add (standard one-word
  labels, kept as such by `17` §2).

Tests we will write:
- `t.test.ts`: real catalogue lookups (`common.save`, a tab name); `{name}` interpolation; plural
  `one`/`other` for 1 and 2; `#` printing a grouped count in en-US and de-DE; English plural rules
  even with a French number locale; unknown key throws (strict) and returns the key (production);
  missing param throws (strict) and leaves `{name}` (production); a non-number plural value
  throws; a compile-time check that an unknown key does not type-check (`@ts-expect-error`).
- `lint.test.ts`: the real catalogue passes; `{count, plural, one {x}` (unclosed) fails; a
  duplicate key across two partitions fails; plural without `other`; bad names; stray braces; a
  dotted segment; message-vs-group conflict; empty message and non-string leaf.

Compare checklist (filled after the rewrite; no reference files reopened: the row says none and
the string tables stay closed, so the comparison is against the phase row's Verify cases and the
specs named in the Read line):
- [x] Interpolation (tested in `src/i18n/t.test.ts > t interpolation > replaces {name} with the
      param`)
- [x] Plural one/other for 1 and 2 in en (`src/i18n/t.test.ts > t plurals > picks one for 1 and
      other for 2 in en`); `#` with the locale (`> prints the count in # with the locale`);
      English rules with another number locale (`> follows English plural rules whatever the
      number locale`)
- [x] Unknown key throws in tests (`src/i18n/t.test.ts > t > refuses an unknown key at compile
      time and throws for it in tests`, `> throws for an unknown key when strict`) and returns the
      key in production (`> returns the key itself for an unknown key in production`)
- [x] Missing param throws (`src/i18n/t.test.ts > t interpolation > throws when a param is
      missing`); production leaves `{name}` (`> leaves the placeholder when a param is missing in
      production`)
- [x] The real catalogue passes the lint (`src/i18n/lint.test.ts > lintCatalogue > passes the
      real catalogue`); `{count, plural, one {x}` fails (`> fails an unclosed plural`); a
      duplicate key across two partitions fails (`> fails a key defined in two partitions`)
- [x] Placeholders well formed, R06.23 groundwork (`src/i18n/lint.test.ts > lintCatalogue >
      fails a malformed placeholder: …`, 15 cases; `> accepts a well-formed message: …`, 10 cases)
- [x] The shared words of the `common` partition (`src/i18n/t.test.ts > t > holds the shared
      words: the app name, four tabs and nine buttons`)
- Deliberate differences: n/a (no reference behaviour read).
- Not taken: comparing translations with English (L1, R06.23).

## Decisions for the lead

- **Partition shape (D-16.55 detail).** A partition file exports a tree rooted at its area
  namespace (`src/i18n/en/common.ts` exports `common = { common: { … } }`). `en.ts` lists them
  in `enPartitions` and builds `en = mergePartitions(enPartitions)`, a deep merge. To land a
  slice's partition: add `import { <name> } from './en/<name>';` and the name to `enPartitions`.
  Several partitions may fill the same area group (`settings.data.*` and `settings.ai.*` from two
  slices); a key defined twice is caught by `lint.test.ts`, never by a runtime throw.
- Two files beyond the phase table: `src/i18n/catalogue.ts` (tree and key types, merge, lookup)
  and `src/i18n/message.ts` (parser and renderer). `en.ts` needs the merge and `t.ts` needs
  `en.ts`, so the merge cannot sit in `t.ts` without an import cycle; the parser is shared by
  `t.ts` and `lint.ts`. Also `src/i18n/locale.test.ts` (P00-06).
- Params are required by the compiler when a message's text contains `{`; param names are checked
  at run time only.
- Plural categories always follow English (the catalogue's language); `#` and number params follow
  the browser locale. In L1 the translator for a language passes that language instead.
- Syntax subset: `{name}`, `{n, plural, <CLDR category> {…} … other {…}}`, `#` in branches. No
  `=N` exact matches, no `select`, no escapes for literal braces (apostrophes are plain text).
- Key segments must be identifiers (`^[A-Za-z][A-Za-z0-9]*$`); the lint enforces it.
- `t.ts` exports `TKey` (any catalogue key) for props and tables that carry a key, e.g. the accent
  label keys of P00-02 once their partition exists.
- Strict mode is `import.meta.env.MODE === 'test' || import.meta.env.DEV`; in production a message
  that fails to parse is shown as its raw text.

## Status

Done (2026-10-26). Catalogue (`common` partition), typed `t()`, parser, merge and lint with tests
are in place; no file outside `src/i18n/**` and this note changed. Trap R06.23 now has tests
(lint groundwork); R07.20 groundwork is the catalogue plus the format helpers of P00-06.
