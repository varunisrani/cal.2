# Task: Intl format helpers (P00-06) · Phase: 00 · Owner: builder (wt-p00s3, slice S3)

Read (reference @ `10e14b67`): none. The phase row says "none"; no reference file was opened.
Sources: research spec `01-profile-goals.md` §3.2 (energy shown grouped with the locale's
separators, 2 000 kcal → 8 368 kJ), `05-home-progress.md` §3.5.2 (period label "Oct 11 – 17", the
year only when an end lies outside the current year), `06-settings-data.md` §3.22 (the app follows
the device language), `07-later-phases-and-web.md` §5.1 and trap R07.20 (format numbers and dates
with `Intl` from the first commit), the conventions in `phases/00-layout-and-conventions.md` (day
keys are local `YYYY-MM-DD`) and the lead's task brief.

What it does (own words): the UI text stays English in v1, but every number, date, time and
period follows the browser's locale, so a German browser sees "8.368" and "11.–17. Okt." where an
American one sees "8,368" and "Oct 11 – 17". `locale.ts` names the locale (the browser language,
or `en` when there is none or it is not a valid tag). `format.ts` holds small helpers over `Intl`
for integers, decimals, percentages, a calendar day, a time of day, a Progress period and a
duration. Each helper takes the locale as an optional last argument (default: the current
locale), so tests pass `en-US`, `de-DE` or `en-GB` without touching `navigator`. `Intl` objects
are built once per locale and options and reused, because creating them is slow and lists of
rows format many values.

Inputs → outputs:
- `currentLocale()` → a canonical BCP 47 tag, `en` as the fallback.
- `formatInt(n)` → whole number, grouped ("8,368"); `formatDecimal(n, maxDigits)` → up to
  `maxDigits` decimals, trailing zeros dropped; `formatPercent(fraction, maxDigits = 0)` →
  "23.5%".
- `formatDay(dayKey, style)` → `short` "Oct 11", `medium` "Oct 11, 2026", `long`
  "Sunday, October 11, 2026", `weekday` "Sun, Oct 11" (en-US shapes; other locales use their own).
- `formatTime(ms)` → the local time of an instant in the locale's short time pattern
  ("2:05 PM" en-US, "14:05" and "09:05" en-GB).
- `formatPeriod(firstKey, lastKey, todayKey)` → "Oct 11 – 17", "Sep 28 – Oct 4",
  "Dec 28, 2025 – Jan 3, 2026".
- `formatDuration(minutes)` → "45m", "16h", "16h 30m" (en; narrow unit words of the locale).
- `numberFormat(locale, options)`, `dateFormat(locale, options)`, `pluralRules(locale)`: the
  cached `Intl` objects themselves (charts and `t()` use them).

Files: created `src/i18n/locale.ts`, `src/i18n/format.ts`, `src/i18n/format.test.ts`,
`src/i18n/locale.test.ts`.

Edge cases / failure modes:
- `navigator` missing (workers, tests), `navigator.language` empty or not a valid tag (an
  `Intl` constructor would throw on it): fall back to `en`.
- Day keys parsed by hand: `new Date('2026-10-11')` is UTC midnight and shows the previous day
  west of UTC. A key that is not `YYYY-MM-DD` or not a real date (2026-02-30) throws a
  `RangeError`.
- Time zone changes while the app runs (travel; tests that switch `TZ`): a cached formatter keeps
  the zone it was built with. Every date helper therefore formats a UTC instant with
  `timeZone: 'UTC'`: day keys become that calendar day at UTC midnight, and an instant becomes its
  local wall-clock parts (read through `Date`, which follows the current zone) placed on a UTC
  instant. The output never depends on the zone a cached formatter was created in.
- Negative zero: `Intl` prints "-0" for -0.2 rounded to an integer. A value whose magnitude
  rounds to zero at the shown digits is passed as 0. (First draft used
  `signDisplay: 'negative'`; changed during the rewrite because engines before 2023 throw on that
  option, which would break every number on the page.)
- Rounding is `Intl`'s default, half away from zero (2.5 → 3, -2.5 → -3).
- `formatRange` puts thin spaces (U+2009) around the en dash in English; the period label
  replaces them with plain spaces so the text is the same in every engine and in the fallback
  path. An engine without `formatRange` gets both ends formatted in full and joined with " – ".
- A period whose first day is after its last throws a `RangeError` (a caller bug).
- Durations: fractional minutes are floored, negative ones count as 0.
- Non-finite numbers are not handled (the domain never produces them; `Intl` prints "NaN" / "∞").

Our design differences / decisions:
- Locale injection is an optional last argument, not a factory; the default reads the current
  locale on every call, so a browser language change applies without a reload.
- The cache key is `locale|JSON of options`; one `Map` per `Intl` kind.
- `formatDuration` takes whole minutes (fast goals and durations are minute-grained, P01-19);
  callers with milliseconds divide by 60 000. Output is the locale's narrow hour and minute
  units joined by `Intl.ListFormat` (unit, narrow): "1h 5m" in English, no zero padding.
- `formatDay` styles are four named shapes; a screen that needs another adds one here.
- `formatPercent` takes a fraction (body fat is stored as a fraction, `00` §2 Units).

Tests we will write:
- `format.test.ts`: 8368 → "8,368" (en-US) and "8.368" (de-DE); rounding and no "-0";
  decimals and percent in en-US and de-DE; every day style; day keys unaffected by switching the
  zone to UTC+14 and UTC−11; invalid day keys throw; time in en-US vs en-GB and following a zone
  change; period labels within one month, across months, across years, both ends in last year,
  same day, reversed throws, en-GB / de-DE shapes, the fallback without `formatRange`;
  durations; the same `Intl` object on the second call for numbers, dates and plural rules.
- `locale.test.ts`: the browser language when present, canonicalised; `en` when `navigator` is
  missing, when the language is empty and when it is not a valid tag.

Compare checklist (filled after the rewrite; no reference files reopened: the row says none, so
the comparison is against the specs named in the Read line):
- [x] 8368 grouped with the locale's separators, 01 §3.2 (tested in `src/i18n/format.test.ts >
      formatInt > groups with the locale: 8368 is "8,368" in en-US and "8.368" in de-DE`)
- [x] Period label within one month, across months, across years; year only when an end is
      outside today's year, 05 §3.5.2 (`src/i18n/format.test.ts > formatPeriod > labels a period
      within one month`, `> labels a period across two months`, `> shows the years for a period
      across two years`, `> shows the year for a period that lies wholly in another year`)
- [x] Time in en-US vs en-GB (`src/i18n/format.test.ts > formatTime > uses a 12-hour clock in
      en-US and a 24-hour clock in en-GB`); following a zone change with a cached formatter
      (`> follows the current time zone even after its formatter was cached`)
- [x] Day keys never shift with the zone (`src/i18n/format.test.ts > formatDay > shows the same
      calendar day in every time zone`)
- [x] `Intl` instances cached: same object on the second call (`src/i18n/format.test.ts > Intl
      instance cache > returns the same NumberFormat on the second call`, `> returns the same
      DateTimeFormat on the second call`, `> returns the same PluralRules on the second call`)
- [x] Locale from the browser, `en` fallback (`src/i18n/locale.test.ts > currentLocale > returns
      the browser language`, `> falls back to en without a navigator`, `> falls back to en for an
      empty or invalid language`)
- Deliberate differences: n/a (no reference behaviour read).
- Not taken: relative day names ("Today", "Yesterday") are copy and belong to the Home
  partition; an elapsed clock (h:mm:ss) for the running fast is a later helper.

## Decisions for the lead

- `formatDuration` takes **minutes** and prints the locale's narrow units joined by
  `Intl.ListFormat`: "45m", "16h", "16h 30m", "1h 5m" (no zero padding); German "16 Std., 30 Min.".
  It overlaps P01-19's `formatFast(minutes)` ("16h 30m", English, in the domain). Suggest the UI
  uses `formatDuration` and the domain helper stays for non-UI text, or P01-19 drops it.
- All date helpers format UTC instants with `timeZone: 'UTC'` (day keys at UTC midnight; instants
  as their local wall-clock parts). Same result as "local Date parts" in the brief, but cached
  formatters can never keep a stale zone, so a zone change (travel, `inTimeZone` in tests) shows at
  once.
- `formatTime` uses `timeStyle: 'short'` (the locale's own pattern: en-GB "09:05", en-US "9:05 AM").
- `formatPeriod` replaces the thin spaces `formatRange` puts around the dash with plain spaces;
  without `formatRange` it joins both full ends with " – " ("Oct 11 – Oct 17").
- `formatDay` styles: `short`, `medium`, `long`, `weekday` (shapes above). Add more here as screens
  need them.
- `formatPercent(fraction, maxDigits = 0)` takes a fraction, like stored body fat.
- Non-finite numbers are not guarded (Intl prints "NaN" / "∞"); the domain must not produce them.
- `format.test.ts` switches `process.env.TZ` with a small local `inZone` helper, because
  `src/test/time.ts` (`inTimeZone`, S1) is not in this worktree yet; swap it when S1 lands. The
  app tsconfig has no Node types, so the helper reaches `process` through `globalThis`.
- Engine floor used here (all 2021-era, matching the ES2022 build target): `formatRange`,
  `timeStyle`, `Intl.ListFormat`, unit-style `NumberFormat`. `signDisplay: 'negative'` (2023) is
  deliberately avoided.

## Status

Done (2026-10-26). `locale.ts`, `format.ts` and their tests are in place; no file outside
`src/i18n/**` and this note changed.
