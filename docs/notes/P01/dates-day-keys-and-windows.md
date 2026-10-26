# Task: dates, day keys and windows (P01-02) · Phase: 01 · Owner: builder (wt-p01a)

<!-- Save as platewise/docs/notes/P<nn>/<slug>.md. Write everything above "Compare checklist"
BEFORE writing code, in your own words. Never paste or paraphrase the reference line by line. -->

Read (reference @ `10e14b67`): `A/ui/components/WeekStrip.kt` (page maths only: the page count,
the current-week index and how a week's first day is found), `T/ui/progress/LogWeightDateTest.kt`
(the two time-stamp cases), `IT/WeightHistoryTests.swift` (the "Chart range" cases only), research
spec `05-home-progress.md` §3.2.1 (selected day, week strip, time-stamp rule), §3.5.2 (windows,
R05.5), §3.5.3 (back-dated weigh-ins), §6 R05.5 and R05.14; `01-profile-goals.md` §3.1 (age) and
§6 R01.15; traps ledger rows owned by P01-02. No Evidence ids.

What it does (own words): every screen and service talks about days as local calendar dates in
the device's zone, written `YYYY-MM-DD` (a day key). These four small modules turn an instant into
its day key and back into the instant the day starts, step days on the calendar (so a 23- or
25-hour DST day is still one day), build the inclusive day windows Progress shows and test whether
a timestamp falls inside one (half-open on the instants, so everything logged late on the last
day counts), stamp an entry logged on a past day with the current clock time, find when the next
local midnight falls (so the app can roll "today" over), lay out the 53 week pages of the Home
week bar, and compute a whole-year age from two day keys. No clock reads: "now" and "today" come
in as arguments; the zone is the runtime's (tests pin it).

Inputs → outputs:
- `dayKeyOf(ms)` → key; `startOfDay(key)` → ms; `addDays(key, n)` → key; `daysBetween(a, b)` →
  signed whole days (b − a); `isDayKey(x)` → boolean.
- `windowEnding(lastKey, days)` → `{first, last}` inclusive; `inDays(ms, firstKey, lastKey)` →
  boolean; `stampForDay(dayKey, nowMs)` → ms; `nextLocalMidnight(nowMs)` → ms.
- `weekStart(key, 'mon' | 'sun')` → key; `weekPages(todayKey, start)` → 53 pages oldest first,
  each with its first day and its seven day keys; `weekPageIndex(dayKey, todayKey, start)` → the
  page showing a day, clamped to the bar (added in Compare).
- `ageOn(birthKey, todayKey)` → whole years ≥ 0.

Files: created `src/domain/dates/{dayKey,ranges,week,age}.ts` and their `.test.ts` files, this
note.

Edge cases / failure modes:
- A key is never read with `new Date('YYYY-MM-DD')` (that is UTC midnight, the day before west of
  UTC). Keys are split into numbers and built with local-time constructors.
- Calendar stepping must not add 24 h of milliseconds: on the spring-forward day that lands at
  01:00 of the day after next is fine, but on the fall-back day `start + 24 h` is still the same
  day (23:00). Day arithmetic is done on the calendar, with no zone involved at all.
- A DST change at local midnight (some zones) makes midnight not exist: the day's start is then
  the first instant that does exist, which the local `Date` constructor already gives.
- A wall-clock time that does not exist on the target day (02:30 on the spring-forward day) moves
  forward to the first valid time; the result must still be on that day.
- Years below 100 must not turn into 19xx (the two-argument `Date` constructors do that), so
  years are set with `setFullYear` / `setUTCFullYear`.
- `isDayKey` rejects `2026-02-30`, `2026-13-01`, `2026-3-7`, padded strings, non-strings, and
  accepts `2028-02-29` but not `2026-02-29`.
- Malformed keys passed to the arithmetic functions throw `RangeError` (codecs validate first).
- A window of fewer than one day is treated as one day.
- `nextLocalMidnight` exactly at midnight returns the following midnight (strictly later).
- Week pages: a Sunday start and a Monday start on the same day give different first days; the
  current week's page contains the remaining future days of that week (D-16.36 makes them
  unselectable in the UI, the page still shows them) but no later page exists.
- Age on 29 February birthdays: the year completes on 1 March in a common year (28 February is
  still the previous age). A birth date after today gives 0 (R01.15).

Our design differences / decisions:
- Names are ours. A week start is `'mon' | 'sun'` (the setting value), not a boolean.
- `stampForDay` keeps hours, minutes, seconds and milliseconds of "now" (the reference drops the
  seconds on one platform); keeping them keeps same-day ordering stable. Decision for the lead.
- Day arithmetic uses UTC getters and setters as a zone-free calendar only; no instant is ever
  derived from them.
- `DayKey` is a plain string alias; `isDayKey` is the guard codecs use.
- `weekPages` returns `{start, days}` objects so the week bar needs no further date maths.

Tests we will write:
- New York (pinned zone): `addDays('2026-03-07', 1)` is `2026-03-08` and that day is 23 h long;
  `2026-11-01` is 25 h long and `addDays('2026-11-01', 1)` is `2026-11-02` (24 h of ms would not
  leave the day); month, year and leap-day rollovers; negative steps; `daysBetween` across DST;
  `dayKeyOf` just before and at local midnight; `isDayKey` accept/reject table; malformed keys
  throw.
- Ranges: a reading at 21:00 on the last day is inside the window (R05.5); the first instant of
  the first day is in, one ms earlier is out, the first instant after the last day is out;
  `windowEnding` for 7 and 30 days and across the DST change; `stampForDay` today → now,
  yesterday → same clock time on yesterday, a spring-forward day at 02:30 stays on that day;
  `nextLocalMidnight` before the DST day, on it (23 h later), and exactly at midnight (R05.14
  support).
- Week: Monday and Sunday starts for a Wednesday and for the start day itself; 53 pages, oldest
  first, consecutive 7-day steps, the last page contains today and no page starts after today's
  week; across a year boundary.
- Age: on the birthday, the day before, a future birth date → 0, 29 February in a common year;
  in `Asia/Tokyo` a birthday stored as a key gives the same age as in New York, including when
  today is derived from an instant that is still the previous day in UTC (R01.15).

Compare checklist (filled after the rewrite; reopened `A/ui/components/WeekStrip.kt` lines
76–106, `T/ui/progress/LogWeightDateTest.kt`, `IT/WeightHistoryTests.swift` lines 258–305):
- [x] 53 pages, the current week last, each page seven days from its first day (tested in
  `src/domain/dates/week.test.ts > weekPages > lists 53 pages, oldest first, with the current week
  last` and `> steps by exactly seven calendar days through the DST changes`).
- [x] The week's first day is found by stepping back from the day to the chosen weekday, Monday or
  Sunday (`week.test.ts > weekStart > finds the Monday or the Sunday before a Wednesday`,
  `> returns the day itself when it is the first day of its week`, `> puts Sunday last in a Monday
  week and Saturday last in a Sunday week`).
- [x] Gap found: the strip scrolls to the page of the selected day, clamped to the first and last
  page. Closed with `weekPageIndex` (`week.test.ts > weekPageIndex > finds the page that shows a
  day`, `> clamps days outside the bar to its first and last page`).
- [x] A back-dated stamp keeps the day and the clock time; today keeps the exact instant
  (`src/domain/dates/ranges.test.ts > stampForDay > returns now itself when the day is today`,
  `> puts an earlier day at the same wall-clock time`).
- [x] Readings logged today are inside the week window; a month-old one is not; an all-time
  (3650-day) window reaches a two-year-old reading (`ranges.test.ts > inDays > keeps a reading
  logged at 21:00 on the last day inside the window (R05.5)`, `> keeps a reading from earlier
  today and leaves out one from a month ago`, `> lets a 3650-day window reach a reading from two
  years back`).
- [x] Whole last day in, the next day out, just before the first day out (`ranges.test.ts > inDays
  > includes the whole first and last day and nothing outside them`).
- [x] Age clamps at 0 and is zone-free on keys (`src/domain/dates/age.test.ts > ageOn > clamps a
  birth date in the future to 0`, `> gives the same age in Asia/Tokyo for a birthday stored as a
  key (R01.15)`, `> turns a year older at local midnight in Tokyo while UTC is still on the day
  before`).
- [x] DST-safe calendar steps (`src/domain/dates/dayKey.test.ts > addDays > steps over the
  spring-forward day, which is 23 hours long`, `> steps over the fall-back day, where 24 hours of
  milliseconds would not leave the day`).
- [x] Midnight roll-over instant for "today" (`ranges.test.ts > nextLocalMidnight > is the start of
  the next local day`, `> comes 23 hours after midnight on the spring-forward day`, `> comes 25
  hours after midnight on the fall-back day`, `> is strictly later than now, even exactly at
  midnight`). The refresh itself (timer and `visibilitychange`) is P04-07.
- Deliberate differences: the back-dated stamp keeps seconds and milliseconds (one reference
  platform drops seconds); the week start is a `'mon' | 'sun'` value, not a boolean; the week bar's
  "today" is an argument, so it can follow the midnight roll-over (R05.14) instead of being
  computed once.
- Not taken: the narrow weekday letters and tile styling (UI, P04/P07 with `src/i18n/format.ts`);
  the goal-crossing case of the weigh-in test (P01-19, R05.7).

## Decisions for the lead

- `stampForDay` keeps the full wall-clock time of now (hours to milliseconds) on a past day.
- Malformed day keys make the arithmetic throw `RangeError`; codecs check with `isDayKey` first.
- `windowEnding` treats a length below 1 as 1 instead of throwing.
- `addDays` drops a fractional step (`Math.trunc`).
- Extra exports beyond the phase row: `splitDayKey`, `dayNumberOf`, `CalendarDate`, `DayWindow`,
  `WeekPage`, `WeekStart`, `WEEK_PAGE_COUNT`, `weekPageIndex`.
- The Tokyo test uses a local zone helper marked `// Lead: swap for inTimeZone from
  src/test/time.ts once P00-08 lands.`; it reaches `process.env` through `globalThis` because the
  app tsconfig has no Node types (a `/// <reference types="node" />` would leak Node globals into
  every `src` file).
- `dayKey.test.ts > test zone > runs with the zone pinned to New York` fails loudly when the suite
  runs without `TZ=America/New_York` (until P00-08 pins it in `vite.config.ts`).

## Status

Done (2026-10-26). Four modules and their tests are in place; nothing outside the task's files
changed. 48 tests (dayKey 14, ranges 17, week 11, age 6), all passing with
TZ=America/New_York. Traps covered: R05.5, R01.15; R05.14 has its pure part
(`nextLocalMidnight`), the refresh is P04-07.
