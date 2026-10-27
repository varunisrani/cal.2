# Task: Week bar (P07-01) · Phase: 07 · Owner: builder (wt-p07s1a, slice S1a)

Read (reference @ `10e14b67`): `A/ui/components/WeekStrip.kt` (all: the 53 week pages, the week
start, how the page for a day is found, the tile's letter, number, filled and ringed states, the
scroll to the selected day's page); `I/Views/HomeComponents.swift` (the week strip part only: the
same paging, the re-anchor on a week-start change, following the selected day into another week).
No reference tests cover the strip. Research spec `05-home-progress.md` §3.2.1, trap R05.14;
decision D-16.36 (future days shown but not selectable). Acceptance ids ACC-F1-1, ACC-F1-2.

What it does (own words): a row of day tiles at the top of Home, one week per page. There are 53
pages: the week that holds today and the 52 before it, oldest on the left, never a week after the
current one. The week begins on Monday or Sunday, from the "week starts on" setting. Each tile has
a one-letter weekday over the day of the month, both in the person's locale. The day Home shows
is a filled accent circle; today, when another day is shown, has an accent ring; other days are
plain. The days after today in the current week are drawn, dimmed, and cannot be chosen (D-16.36).
The person can page the bar sideways to older weeks without changing the day; tapping a tile shows
that day. When the shown day moves into another week (a day swipe, a key press), the bar moves to
that week, smoothly unless reduced motion is asked for. Changing the week start puts the bar back
on the current week. For the keyboard the bar is one radio group: Tab reaches the shown day, the
arrow keys move to the next or previous day (crossing weeks), skipping days after today.

Inputs → outputs: `WeekBar` props `today`, `selected` (day keys), `weekStart` ('mon' | 'sun'),
`onSelect(day)` → the bar. Pages come from P01-02 `weekPages(today, weekStart)`, the page of a day
from `weekPageIndex`. `oldestDay(today, weekStart)` (the first day of the oldest page) is exported
for the day swipe's lower limit.

Files: created `src/features/home/WeekBar.tsx`, `src/features/home/WeekBar.test.tsx`,
`src/features/home/week.module.css` (shared with the day swipe); words in `src/i18n/en/home.ts`
(`home.week.label`). Home mounts it (P07-02 note).

Edge cases / failure modes:
- A day after today: disabled (not clickable, not focusable), never selected by keys either.
- Today moves on at midnight (R05.14): the bar reads today from the today clock, so the ring, the
  disabled days and the pages follow; a new week adds a page and drops the oldest.
- The selected day older than the oldest page cannot happen through the bar or the swipe; if it
  did, the bar would rest on the oldest page and today's tile would take the focus stop.
- No layout yet (width 0, a hidden parent): nothing is scrolled; the next change places it.
- Right-to-left pages: the strip's scroll offsets and the arrow keys flip.
- Paging the bar by hand does not change the day; the next change of the day brings the bar back
  to the day's week (as the reference does).

Our design differences / decisions:
- Future days are disabled (D-16.36); the reference lets them be picked.
- Solid accent fill instead of a gradient and glow (D-16.1).
- The bar is a native horizontal scroll-snap strip with one page per week; placement uses the
  strip's own scroll (smooth through CSS only without reduced motion).
- Keyboard and screen-reader access is ours (radio group, full date as each tile's name, today
  marked as the current date); the reference has neither.
- No haptic on tap (no haptics helper in the web build yet; the spec allows skipping it).
- Names are ours: `WeekBar`, `oldestDay`, `week.module.css`.

Tests we will write (`WeekBar.test.tsx`):
- 53 pages of 7, the last one the current week; Monday first by default.
- Sunday start shows Sunday first; changing the setting re-anchors on the current week.
- Tomorrow's tile is disabled and a click on it selects nothing (ACC-F1-2).
- Selecting last Monday calls `onSelect` with it; a selected day in another week moves the bar to
  that week (scroll offset with a stubbed width).
- Today's ring (today marked, not checked) when another day is selected; the selected tile checked.
- Arrow keys move between enabled days, across weeks, never past today, and move the focus.
- HomePage (P07-02 tests): selecting last Monday shows that day's diary (ACC-F1-1).

Compare checklist (filled after the rewrite; reopened `A/ui/components/WeekStrip.kt`, the strip
part of `I/Views/HomeComponents.swift`):
- [x] 53 pages, the current week last, never a future week (`src/features/home/WeekBar.test.tsx >
  WeekBar > draws 53 pages of seven days, the current week last and no week after it`)
- [x] Week start from the setting; a change re-anchors on the current week, the selection kept
  (`WeekBar > shows Monday first by default and Sunday first with a Sunday start`, `> goes back to
  the current week when the first weekday changes, keeping the selection`)
- [x] Tile: narrow weekday over the day number; selected filled; today ringed when another day is
  selected (`WeekBar > rings today while another day is selected, and fills the selected one`, `>
  shows Monday first by default…` for the letter and number)
- [x] The bar follows the selected day into another week, at once on the first draw, then with the
  strip's own scroll behaviour (`WeekBar > opens on the selected day's week at once, then follows
  the selection into another week`, `> moves a day at a time with the arrow keys, across weeks and
  never past today`, `> stops the arrow keys at the oldest day of the bar`)
- [x] Future days shown but never selected (D-16.36) (`WeekBar > shows the days after today but never
  selects them: tomorrow is disabled (ACC-F1-2, D-16.36)`)
- [x] A tap selects; Home then shows that day (`WeekBar > selects a tapped day: last Monday`;
  `src/features/home/HomePage.test.tsx > HomePage: the selected day (P07-01, P07-02) > shows the
  week bar on today, and last Monday's diary and summary once it is selected (ACC-F1-1)`)
- Mutation check: drawing Home's placeholder while the next day is read (no held read) rebuilds the
  bar under the tap and fails the ACC-F1-1 test.
- Deliberate differences: future days disabled (D-16.36); a solid accent fill with no gradient or
  glow (D-16.1); today comes from the today clock, so the ring and the limits move at midnight
  (R05.14; the reference computes today once); the strip follows the selected day on every change
  (as one platform does) rather than only when the week index changes; a keyboard radio group with
  the full date as each tile's name; words are ours.
- Not taken: the per-day energy inputs one platform passes to its strip and never draws; the haptic
  on tap (no haptics helper in the web build yet).

## Status

Done (2026-10-27). Created `src/features/home/WeekBar.tsx` (+ 9 tests),
`src/features/home/week.module.css`, this note; `home.week.label` in `src/i18n/en/home.ts`. Home
mounts it (see `selected-day-and-day-swipe.md`). Data-ui: `home.week` (the radio group),
`home.week.page`, `home.week.day` (with `data-day`).
