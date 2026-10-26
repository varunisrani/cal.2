# Task: Home page skeleton (P04-10) · Phase: 04 · Owner: builder (wt-p04s5, slice S5)

Read (reference @ `10e14b67`): `A/ui/home/HomeScreen.kt` (lines 226–600: the screen's layout, what
the top region shows and in which order, the floating add button and its menu; lines 1868–2150: the
meal section header, the diary items and how they are grouped), `A/ui/components/MacroCard.kt`
(the pillar status cases only). Research spec `05-home-progress.md` §3.2.2 (gauge), §3.2.3
(pillars), §3.3.1–3.3.2 and §3.3.5 (diary, section header, empty state), §3.4 (the "+" button);
traps R05.4 and R05.12. Decisions `16-what-we-change.md` §2.5 (siblings, not twins), D-16.1 (solid
accents). Acceptance ids ACC-D3-1, ACC-F3-1, ACC-F3-2, ACC-F4-1, ACC-F7-1, ACC-F10-1.

What it does (own words): Home shows today (the week bar and the day swipe come in P07). At the
top, a card with the energy gauge: a small heading naming the energy unit ("Calories", or
"Kilojoules" when the person reads kJ), what was eaten today in that unit with grouping, and one
status line: no goal, N left, N over, or goal reached. The comparison is always made in kcal and
only the difference is shown in the display unit. Under the gauge, four pillars (protein, carbs,
fat, fibre) fill toward their goals: macros from the effective targets, fibre from the optional
nutrient goals; each shows the day's amount, its name and the same kind of status in grams. Below
that, the diary: today's entries in meal sections in the fixed order breakfast, lunch, dinner,
snack, other (by-meal mode), each section headed by the meal's name and its food-only totals
(energy in the display unit, whole grams of protein, carbs and fat). A day with nothing logged
shows one card with our own empty message. A round "+" button floats at the bottom end above the
tab bar; it opens the add menu, which for now offers only "Enter manually" (the manual sheet,
P04-11). Nothing with a number is drawn until the profile, the settings and the day's entries have
been read, so no fallback goal ever flashes (R05.12).

Inputs → outputs: `useToday()`, `useDayEntries(today)`, `useTargets(today)` (missing | corrupt |
ok), `useSettings(['units.energy', 'meals.times', 'goals.nutrients'])` → the page. `DaySummary` and
`Diary` take plain props (entries, targets, goals, unit, meal times), so their rules are tested
without a database.

Files: created `src/features/home/HomePage.tsx`, `HomePage.test.tsx`, `DaySummary.tsx`,
`DaySummary.test.tsx`, `Diary.tsx`, `Diary.test.tsx`, `home.module.css`, `energy.ts` (energy text in
the display unit), `text.ts` (the slice's translator until `en.ts` merges the partitions),
`src/i18n/en/home.ts`, and the test harness `src/test/screenHarness.tsx` (real repositories over a
test database plus the tab-screen providers; it lives in `src/test` because the screen lint rule
keeps repository imports out of `src/features`). Shared: `src/app/Screen.tsx` (renders the pages);
`src/app/App.test.tsx` and `src/features/onboarding/QuickStart.test.tsx` now wrap the app in a
`DataProvider`, since Home reads data.

Edge cases / failure modes:
- Any of the reads still loading → a neutral placeholder card, no numbers, no "+" (its menu will
  depend on loaded state in P07: an active fast hides the food methods).
- A read fails → a short card saying the day cannot be shown; nothing else.
- No profile or an unreadable one → the gauge and macro pillars have no goal ("No goal");
  fibre keeps its own goal.
- Goal ≤ 0 → no fill and "No goal"; eaten = goal → "Goal reached"; over → the arc stays full and
  the status names the excess (ACC-F3-2).
- kJ: heading, eaten and the difference switch to kJ; the comparison stays in kcal, so a goal met
  exactly in kcal reads "Goal reached" even though the kJ values are rounded.
- Pillar sums of decimals: the comparison uses the amount rounded to one decimal, so 150.0000001 g
  against 150 reads "Goal reached", not "0 g over".
- An entry without fibre counts 0 toward the fibre pillar (unknown is not added).
- Empty day → the empty card (ACC-F10-1); sections appear only for meals with entries.

Our design differences / decisions:
- Our look: one card for gauge and pillars on our tokens, solid accent, no gradients or glass
  sheen, no flame glyph (our icon set has none; the status is text only). Meal headers have no
  icons (none in our set). Section totals read "250 kcal" over "P 3 g · C 30 g · F 2 g".
- A visible page heading (the tab name) keeps the document outline the same on every tab; the
  diary has its own heading ("Today") above the sections, also when it has entries.
- The four pillars are the domain's `DEFAULT_PILLARS`; the stored pillar choice and the picker
  are P07-03. The sort setting is not read yet: by-meal mode only (P07-05 adds the sort menu).
- The "+" opens the existing `Menu` primitive (above the button, end-aligned); the manual sheet
  is a routed sheet (`useSheet`), so the browser's Back closes it.
- Water and fasting rows, the week bar, day swipe, nutrient sheet and launch animation are later
  tasks (P07).

Tests we will write:
- `DaySummary.test.tsx`: 1 200 of 2 000 kcal → "800 left" and a 108° sweep (ACC-F3-1); 2 100 →
  "100 over", the arc full (ACC-F3-2); exactly 2 000 → "Goal reached"; no profile → "No goal" and
  no fill; kJ heading and numbers with the comparison in kcal; the four default pillars in order
  with their goals and statuses (ACC-F4-1); fibre unknown counts 0; a sum like 0.1 + 0.2 reaches
  0.3 g.
- `Diary.test.tsx`: empty day → the empty card (ACC-F10-1); a 300 kcal breakfast shows the
  section total 300 (ACC-F7-1); sections in meal order, rows newest first; totals in kJ; whole
  grams in the macro line.
- `HomePage.test.tsx` (real repositories over a test database): nothing with a number until the
  reads resolve (R05.12); the stored goal and today's entries reach the gauge; "+" offers Enter
  manually and opens the manual sheet (ACC-D3-1); a manual log appears under its meal with the
  gauge updated; an empty day shows the empty card.

Compare checklist (filled after the rewrite; reopened `HomeScreen.kt` 226–600 and 1868–2150,
`MacroCard.kt`):
- [x] Gauge goal is the effective calorie target; the reference's 2 000 fallback never shows, since
      nothing with a number is drawn before the reads resolve (`HomePage.test.tsx > HomePage >
      draws no number until the profile, the settings and the day's entries are read (R05.12)`)
- [x] Gauge status in four cases, compared in kcal and shown in the display unit; the arc stays
      full over the goal (`DaySummary.test.tsx > DaySummary gauge > reads 800 left with 1 200 of
      2 000 kcal eaten, and sweeps 108° (ACC-F3-1)`, `> stays full and reads 100 over at 2 100 of
      2 000 kcal (ACC-F3-2)`, `> reads goal reached when the day meets the goal exactly`, `> reads
      no goal and fills nothing without a readable profile`, `> names Kilojoules and shows kJ
      numbers while comparing in kcal`, `> shows 0 eaten on an empty day`)
- [x] Pillars: the default four in order; macros against the effective targets, the rest against
      the optional goals; no goal / left / over / reached; whole or one-decimal values; an unknown
      nutrient counts 0 (`DaySummary.test.tsx > DaySummary pillars > shows protein, carbs, fat and
      fibre against their goals, in that order (ACC-F4-1)`, `> counts an entry that does not know
      its fibre as 0 toward the fibre pillar`, `> reaches a goal met by a sum of decimals`, `> reads
      no goal for the macros without a profile, and for a goal of 0`; `> amountIn > reads macros,
      optional nutrients and extras, and counts an unknown one as 0`)
- [x] Diary by meal in the fixed order, empty sections left out, rows newest first, food keeps
      its own meal (`Diary.test.tsx > Diary > lists the meals in their fixed order and the rows of
      each newest first`, `> files an entry under the meal it was logged with, whatever its time`)
- [x] Section header: name, then food energy in the display unit and whole-gram macros, only for
      sections with food (`Diary.test.tsx > Diary > shows a 300 kcal breakfast under Breakfast with
      the section total 300 (ACC-F7-1)`, `> totals a section in the display unit with whole grams`)
- [x] Empty state: a heading for the day and one card (`Diary.test.tsx > Diary > shows the empty
      card on a day with nothing logged (ACC-F10-1)`, `> heads the list Today on today and Diary on
      another day`; `HomePage.test.tsx > HomePage > shows the empty card on a day with nothing
      logged (ACC-F10-1)`)
- [x] "+" floating at the bottom end, clear of the tab bar, the diary padded so its last card
      scrolls clear; its menu offers Enter manually, which opens the manual sheet (`HomePage.test.tsx
      > HomePage > offers Enter manually in the + menu, which opens the manual sheet over Home
      (ACC-D3-1)`); a manual log appears under its meal with the gauge moved (`> logs a manual entry
      that appears under its meal, with the gauge and the totals updated`); by hand in Chromium
      (Pixel 7, production build, dark and light): quick start → Home at 0 → "+" → Enter manually
      → Toast 250 kcal → the entry under its meal and the gauge at 250 → reload → still there →
      swipe and confirm → the empty card; no page or console errors.
- [x] Today's entries only, the stored goal and the diary from live reads; a failed read shows a
      card (`HomePage.test.tsx > HomePage > shows the stored goal and today's entries in the gauge,
      the pillars and the diary`, `> says so when the day cannot be read`)
- Deliberate differences: our own card, solid accent, no gradients, sheen or flame glyph; meal
  headers without icons (none in our set); a visible page heading and a "Today" heading above the
  sections; pillar statuses compare the amount as shown (one decimal) so float sums never read
  "0 g over"; the "+" appears with the data, not before.
- Not taken (later tasks): week bar and day swipe (P07-01/02), launch fill animation (P07-03,
  R05.18), stored pillar choice and picker, water pillar, "All nutrients" sheet (P07-03/04), sort
  menu and water/fast rows (P07-05..07), the food methods of the add menu (P06-01), meal sharing
  (N-8), burn and steps lines (N-5).

## Decisions for the lead

- `src/i18n/en.ts`: add `home`, `log` and `settings` (imports and `enPartitions`). Then
  `src/features/home/text.ts` becomes `export { t as tx, type TKey as TxKey } from
  '../../i18n/t';` (or the screens call `t` and the file goes).
- Shared edits: `src/app/Screen.tsx` renders the four pages (the `.screenTitle` rule in
  `src/app/shell.module.css` is now unused, and `TAB_LABEL_KEYS` is used only by the tab bar);
  `src/app/App.test.tsx` and `src/features/onboarding/QuickStart.test.tsx` wrap the app in a
  `DataProvider` (pending reads in the first, the test database in the second); new
  `src/test/screenHarness.tsx`.
- Follow-ups found, not fixed: (1) scroll memory: Home's reads land after the router has applied
  the saved scroll (in `RouterProvider`'s layout effect), so switching tabs brings a long diary back
  at the top; the router needs a way for a screen to apply the scroll once its data is drawn (P04-04
  owner). (2) `src/ui/icons` has no meal icons, no flame and no food glyph; Home goes without them.
  (3) No photo read hook yet: rows of entries with photos show the emoji or the source icon (P06-02/03).
  (4) Initial JS grew from 123 to 136 kB gzip: the primitives Home and the sheet use are now in the
  bundle (budget 250 kB).

## Status

Done (2026-10-26). Home, its tests and the `home` partition are in; `src/app/Screen.tsx` renders
the pages (shared); two app tests now provide data (shared). Handed on: the `en.ts` merge and the
follow-ups above (lead).
