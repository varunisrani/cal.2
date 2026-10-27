# Task: Selected day and day swipe (P07-02) · Phase: 07 · Owner: builder (wt-p07s1a, slice S1a)

Read (reference @ `10e14b67`): `I/ContentView.swift` lines 1270–1295 (the day swipe: where it is
attached, its thresholds, the step that never passes today) and the Home state around it (the
selected day's default, the resets from quick actions, the stamp helper `logDate`);
`A/ui/home/HomeViewModel.kt` (`timestampForSelectedDay`, how the selected day is kept app-wide and
set back to today for a new Home), `A/ui/home/HomeScreen.kt` (the swipe region and its 80 dp
rule, the quick-action reset). No reference tests cover these. Research spec `05-home-progress.md`
§3.2.1 (selected day, day swipe, the stamp rule), §3.1.1 (outside entry points reset Home to
today), trap R05.14. Acceptance id ACC-F2-1. The P01-02 `stampForDay` already holds the stamp rule.

What it does (own words): Home shows one day at a time, today by default. The day lives in the
app's shared UI state (not stored), so the review sheet, which sits above the tabs, sees the same
day as Home, and leaving Home for another tab and coming back keeps it; a fresh start of the app
(a reload) always opens on today. Choosing today, or a day after it, means "follow today", so an
app left open over midnight moves to the new day by itself. Ways into Home from outside
(shortcuts, later) call a reset to today. Anything logged for the shown day is stamped with that
day: today logs at now; another day logs on that day at the current clock time. A sideways swipe
over the summary card (gauge and pillars, not the diary) moves one day: toward the left shows the
next day, toward the right the day before. It counts only when the finger travels at least 80 px
sideways and clearly more sideways than up or down (more than 1.5 times); it never goes past
today, nor before the oldest day of the week bar. Home passes the shown day to the summary, the
diary, the manual sheet, the copy-a-day sheet, and (through the shared state) every review,
including a pick from the reuse lists.

Inputs → outputs:
- `useSelectedDay()` → `{ day, today, isToday, select(day), reset(), stamp() }`: reads
  `selectedDay` from the app state (`null` = follow today) and today from the today clock; `stamp()`
  = `stampForDay(day, clock.now())` with the services' clock.
- `viewedDay(selectedDay, today)` in `src/app/appState.ts`: the day shown for a stored selection
  (a stored day after today, after a clock change, shows today).
- `DaySwipe` props `day`, `latest` (today), `earliest`, `onChange(day)`, children → a region with
  the gesture; `readSwipe(dx, dy)` is the pure rule.
- `HomePage`: the week bar and the swipe around the summary; the day's reads follow the day.

Files: created `src/features/home/useSelectedDay.ts` (+ test), `src/features/home/DaySwipe.tsx`
(+ test); changed `src/features/home/HomePage.tsx` (+ tests), `src/app/appState.ts` (+ test),
`src/i18n/en/home.ts`, `src/features/home/home.module.css` (the bar's placeholder);
`src/features/log/review/ReviewSheet.test.tsx` (one test). Shared: `src/test/screenHarness.tsx`
gives each harness its own app state.

Edge cases / failure modes:
- Swipe left on today: nothing. Swipe right on the oldest day of the bar: nothing.
- 60 px of travel, or a diagonal (80 px sideways, 60 px down): nothing; the page scrolls as usual.
- A press that the browser takes for a scroll (pointercancel): forgotten.
- The finger leaving the card mid-swipe still ends the swipe (pointer capture once it is sideways).
- A click that ends a swipe never reaches a control inside the card.
- Switching days: the last day read stays on screen until the new day is read, so Home never
  blanks and the week bar is not rebuilt under the person's finger; the page is marked busy.
- Midnight with today shown: the day follows; with a past day shown: it stays.
- A clock moved back so the stored day is after today: today is shown.

Our design differences / decisions:
- Thresholds: 80 px and |dx| > 1.5 |dy| together (the platforms use one each; the row asks for
  both).
- A lower limit at the oldest day of the week bar, so the bar can always show the day; the
  reference has none. (Decision for the lead; easy to drop.)
- A swipe's direction flips in right-to-left pages.
- No haptic on a day change (no haptics helper yet).
- The day is kept across tab switches and reset only by a fresh start or a reset call: the
  reference keeps its Home alive across tabs the same way.
- Names are ours: `useSelectedDay`, `viewedDay`, `DaySwipe`, `readSwipe`.

Tests we will write:
- `DaySwipe.test.tsx`: right 100 px → yesterday; 60 px → nothing; diagonal → nothing; left on
  today → nothing; left on yesterday → today; right on the oldest day → nothing; a click after a
  swipe is swallowed; pointercancel forgets the press; `readSwipe` table.
- `useSelectedDay.test.ts`: today by default; select yesterday; today or tomorrow → follow today;
  follows today over midnight, keeps a past day; `stamp()` today = now, yesterday = yesterday at
  the clock time; a new app state opens on today while a remount keeps the day; `reset()`.
- `HomePage.test.tsx`: the bar is shown with today selected; selecting last Monday shows that day's
  diary and summary (ACC-F1-1); swiping right shows yesterday, swiping left on today does nothing
  (ACC-F2-1); a manual entry logged while yesterday is shown is stamped yesterday at the clock time;
  copy a day copies onto the shown day.
- `ReviewSheet.test.tsx`: with yesterday shown, a review opens dated yesterday at the clock time
  with the meal for that time (D-16.16) and logs there.
- `appState.test.ts`: `viewedDay`.

Compare checklist (filled after the rewrite; reopened `I/ContentView.swift` 1270–1295 and the
selected-day state and resets, `A/ui/home/HomeViewModel.kt` `timestampForSelectedDay` and the
selected day's set-up, the tab switching in the Android nav host):
- [x] Default today; a fresh start opens on today; a tab switch keeps the day (both platforms keep
  Home alive across tabs) (`src/features/home/useSelectedDay.test.ts > useSelectedDay > shows today
  when nothing is picked`, `> opens on today after a fresh start, and keeps the day when Home is
  opened again`); outside entry points reset (`> goes back to today on reset, as a way in from
  outside does`)
- [x] Picking today or later follows today; across midnight today moves on and a picked day stays
  (R05.14) (`useSelectedDay > follows today again when today or a later day is picked`, `> moves on
  with today at midnight when today is shown, and keeps a picked day`;
  `src/app/appState.test.ts > viewedDay > shows today without a selection, the selected day before
  today, and today for a later one`)
- [x] Swipe only on the summary; left = next, right = previous; 80 px and |dx| > 1.5 |dy|; never
  past today (`src/features/home/DaySwipe.test.tsx > readSwipe > reads a move of %s, %s px as %s`;
  `DaySwipe > shows yesterday after a swipe of 100 px toward the right (ACC-F2-1)`, `> does nothing
  for a swipe of 60 px`, `> ignores a diagonal swipe that is not clearly sideways`, `> never moves
  past today: a swipe toward the left on today does nothing (ACC-F2-1)`, `> shows the next day after
  a swipe toward the left, up to today`, `> stops at the oldest day of the week bar`;
  `src/features/home/HomePage.test.tsx > HomePage: the selected day (P07-01, P07-02) > shows
  yesterday after a swipe toward the right on the summary; toward the left on today does nothing
  (ACC-F2-1)`, which also swipes the diary to no effect)
- [x] A swipe never taps a control under it; a scroll takeover is forgotten; one press at a time
  (`DaySwipe > keeps the click that ends a swipe from the summary, and lets a plain tap through`,
  `> forgets a press the browser took over for scrolling`, `> ignores a press with another mouse
  button, and a second finger`, `> shows the day before after a swipe toward the left on a
  right-to-left page`)
- [x] Stamp: today → now, another day → that day at the current clock time
  (`useSelectedDay > stamps today at now and another day at the current clock time (P01-02
  stampForDay)`)
- [x] Every logging flow on Home takes the shown day: manual (`HomePage: the selected day… > logs a
  manual entry on yesterday at the current clock time while yesterday is shown`), a reuse pick
  through the review (`> logs a pick from Recent on the day shown, at the current clock time
  (P06-12)`; `src/features/log/review/ReviewSheet.test.tsx > ReviewSheet > opens on the day Home
  shows: an earlier day at the current clock time, with the meal for it (P07-02, D-16.16)`), copy a
  day (`> copies a day onto the day shown, starting from the day before it`); the summary and the
  diary (`> shows the week bar on today, and last Monday's diary and summary once it is selected
  (ACC-F1-1)`)
- Deliberate differences: both thresholds at once (each platform uses one); a lower limit at the
  bar's oldest day; the direction flips on right-to-left pages; the last day read stays on screen
  while the next one is read; the review reads the day from the shared UI state instead of being
  handed a stamp; names and words are ours.
- Not taken: the haptic on a day change (no haptics helper yet); the voice assistant's diary-day
  hand-off (a later phase).

## Decisions for the lead

- The swipe stops at the week bar's oldest day (`oldestDay`), so the bar can always show the day;
  the reference has no lower limit. One prop to drop if unwanted.
- "Reset to today on every new Home visit after a cold start" is read as: every fresh start (a
  reload) opens on today, tab switches keep the day (both reference platforms keep Home alive across
  tabs), and `reset()` is there for shortcuts. Picking today stores `null` (follow today), so the
  day moves on at midnight; a stored day after today (clock moved back) shows today (`viewedDay`).
- `ReviewSheet.tsx` needed no change: it already stamps `selectedDay ?? today` at the opening clock
  time and takes the meal from that time (D-16.16); Home now sets `selectedDay`. A stored day after
  today is not clamped there (only after a clock change); `viewedDay` can replace `?? today` when
  that file is free.
- Shared (test only): `src/test/screenHarness.tsx` gives each harness its own app state
  (`h.appState`) instead of the module-wide store, so no test inherits another's selected day.
- `home.loadFailed` now says "This day's diary…" (it said "Today's", wrong for a past day).
- Removed the duplicate `case 'barcode'` in `HomePage.tsx` (the lead's note; identical to the
  branch fix).
- `useSteadyRead` (in `HomePage.tsx`) keeps the last read on screen while another day loads; a
  candidate for `src/data/hooks.ts` if other screens page through days.
- Data-ui: `home.swipe` (the swipe region), `home.week*` (see the week-bar note).
- Ledger lines: ACC-F1-1 → the HomePage ACC-F1-1 test; ACC-F1-2 → the WeekBar ACC-F1-2 test; ACC-F2-1
  → the two DaySwipe ACC-F2-1 tests and the HomePage ACC-F2-1 test. R05.14 may add the
  useSelectedDay midnight test.
- Follow-ups not done: the diary heading reads "Diary" for a past day (it could name the date;
  `Diary.tsx` is S2's); no haptics helper (`navigator.vibrate`) for tile taps and swipes.

## Status

Done (2026-10-27). Created `src/features/home/useSelectedDay.ts` (+ 7 tests),
`src/features/home/DaySwipe.tsx` (+ 19 tests), this note. Changed `src/features/home/HomePage.tsx`
(+ 5 tests), `src/app/appState.ts` (`viewedDay`, + 1 test), `src/i18n/en/home.ts`,
`src/features/home/home.module.css` (the bar's placeholder), `ReviewSheet.test.tsx` (+ 1 test).
Shared: `src/test/screenHarness.tsx`.
