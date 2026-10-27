# Task: accessibility pass (P10-07) · Phase: 10 · Owner: builder (wt-p10s3)

<!-- Save as platewise/docs/notes/P<nn>/<slug>.md. Write everything above "Compare checklist"
BEFORE writing code, in your own words. Never paste or paraphrase the reference line by line. -->

Read (reference @ `10e14b67`): none. The row's "Read in reference" column says none: this is a
check of our own screens against WCAG through axe, with no counterpart to read. Read instead:
`docs/plan/03-feature-inventory.md` L9, `docs/plan/04-architecture.md` §6 (accessibility),
`docs/internals/acceptance-map.md` (ACC-L9-1 is reviewed by this task, ACC-L9-2 is already a unit
test), D-16.75 (the keyboard delete button of a swipe row) and D-16.81 (the chart's hidden table
serves keyboard and screen readers), `src/ui/tokens.css` (the reduced-motion block, `--focus`),
`src/ui/{Gauge,Pillar}.tsx`, `src/ui/charts/{LineChart,BarChart,ChartTable}.tsx`, and the e2e
specs and helpers already landed (`e2e/support.ts`, `walking-skeleton`, `home-progress`,
`logging`, `coach`) for how the wizard, the fake AI and the food databases are driven.

What it does (own words): one Playwright spec that runs axe-core on every main screen in both
colour themes and fails on any finding axe rates serious or critical, then walks two everyday
tasks with the keyboard alone. The screens are the wizard (each of its steps), Home (with food,
water and a fast in the diary), a food review, Progress (with weigh-ins on the chart), the Coach
(with an answer in Markdown), the Settings list and every Settings page. The theme comes from the
browser's colour scheme (the app's appearance is System by default), so one page is checked
dark, switched to light with `emulateMedia`, and checked again. The keyboard walk logs a food by
hand (the + button, the menu, the manual sheet, Save) and a weight on Progress (the tab bar, Log
weight, the unit, the wheels, the date, Save), checking at every stop that the focused control
shows a focus ring. Values as text (L9): the gauge, each pillar and each chart give their numbers
to a screen reader (the group's description, the hidden table); the spec reads them back.
Reduced motion: with `reducedMotion: 'reduce'` the motion tokens drop to 1 ms; without it they
keep their normal length.

Inputs → outputs: the built app under `vite preview`, the fake AI on loopback, our routed food
databases → pass/fail per screen and theme, with every serious or critical axe finding named
(rule, impact, target) in the failure.

Files: created `e2e/a11y.spec.ts`, this note. `package.json` and `pnpm-lock.yaml` gain
`@axe-core/playwright` 4.14.0 (dev dependency, exact; it brings `axe-core` 4.14.0). Fixes, each in
the component that owns the finding (see "Fixes"): `src/features/onboarding/onboarding.module.css`,
`src/features/settings/profile/ProfilePage.tsx`, `src/features/home/{EntryRow.tsx,
selection.module.css,FastRow.tsx,diaryRows.module.css}`, `src/features/progress/{HistoryLink.tsx,
readings.module.css}`, `src/features/coach/coach.module.css`, `src/ui/SwipeRow.tsx` and
`src/features/log/reuse/ReuseSheet.tsx` (with a new test in each one's unit file); two unit tests
follow a change of markup: `src/features/settings/profile/ProfilePage.test.tsx` (the row's text
has a space) and `src/features/progress/HistorySheet.test.tsx` (the card contains the button).

Edge cases / failure modes:
- axe runs on the document as it is at that moment: a sheet that is still sliding in, a lazy
  screen still on its skeleton, or a toast on its way out would be checked half drawn. Each scan
  waits first for the screen's own content (a `data-ui` hook) and runs with reduced motion, so
  transitions take 1 ms.
- Colour contrast is measured on what is painted. Both themes come from the same tokens the unit
  sweep checks (`src/ui/contrast.test.ts`), so a contrast finding here means a component paints a
  pair the sweep does not cover.
- The theme flip must really happen before the second scan: the spec waits for
  `data-theme="light"` on `<html>`, not for a fixed time.
- Hidden content (closed sheets, the visually hidden chart table) is either out of the tree or
  styled to stay readable: axe skips `display: none`, and checks the hidden table as text.
- A keyboard walk must never fall back on the mouse: the walk uses `keyboard.press` only, finds
  the next stop by pressing Tab until the wanted control holds the focus (with a bound, so a
  control that cannot be reached fails instead of looping), and checks the focus ring with the
  computed outline (or box shadow) of `document.activeElement`.
- The focus ring needs `:focus-visible`, which the browser sets for keyboard focus; a focus moved
  by script after a mouse click might not show it, so the walk starts from the keyboard.
- Native `<select>` wheels and the date input take arrow keys and typed digits; on Chromium a
  focused `<select>` changes value with ArrowUp/ArrowDown without opening.
- Moderate and minor findings do not fail the run (the row asks for serious and critical); they
  are listed in the test's attachment so the lead can see them.

Our design differences / decisions:
- Rules: axe's WCAG 2.0/2.1 A and AA tags plus its best practices, all rules on. The gate is the
  impact (serious, critical), as the row says.
- One test per area (wizard, Home with review, Progress, Coach, Settings) instead of one per
  screen: each needs the wizard walked first, and walking it once per area keeps the run short.
- Both themes in the same test through `page.emulateMedia({ colorScheme })`: the stored
  appearance stays System, so no Settings write is needed between the two scans.
- No new dependency beyond `@axe-core/playwright` (MPL-2.0, a dev dependency; the licences check
  covers production dependencies only, and nothing of axe ships in `dist/`).

Tests we will write (`e2e/a11y.spec.ts`):
- axe, both themes: the wizard from Welcome to Plan ready, each step.
- axe, both themes: Home with food, water and a fast; the + menu; a food review (a product by
  typed barcode digits, from our Open Food Facts fixture).
- axe, both themes: Progress with two weigh-ins on the weight chart and the history sheet.
- axe, both themes: the Coach with an answer in Markdown.
- axe, both themes: the Settings list and every registered Settings page.
- Values as text: the gauge's description, a pillar's description and the weight chart's table
  carry the numbers shown.
- Keyboard only: a manual entry logged and a weight logged, focus visible at every stop.
- Reduced motion: the motion tokens are 1 ms under `reduce` and their normal length without it.

Compare checklist (filled after the rewrite; no reference to reopen; compared with the row's
Verify column and L9 instead):
- [x] axe has no serious or critical finding on the wizard, Home, review, Progress, Coach and
      Settings in both themes (`e2e/a11y.spec.ts > accessibility checks on the main screens, in
      both themes (ACC-L9-1) >` `the wizard, each step from Welcome to Plan ready`, `the + menu,
      the manual sheet, a food review, then Home with food, water and a fast`, `Progress with two
      weigh-ins, the Log weight sheet and the history`, `the Coach, empty and with an answer in
      Markdown`, `the Settings list and every Settings page`)
- [x] the keyboard walk logs a manual entry and a weight (`e2e/a11y.spec.ts > the keyboard alone >
      logs a food entered by hand and a weight, with a focus ring at every stop`)
- [x] gauge, pillars and charts expose their values as text (`e2e/a11y.spec.ts > values as text
      (L9) > the gauge, the pillars and the charts give their numbers to a screen reader`; the
      gauge's own unit test stays `src/ui/Gauge.test.tsx` for ACC-L9-2)
- [x] focus visible at every keyboard stop: every screen of the five axe tests is walked once
      round with Tab (the + menu with the arrow keys), and the keyboard walk checks every stop on
      its way
- [x] reduced motion respected: every screen of the five axe tests has no transition or animation
      over 1 ms and no endless animation under `reduce`; `e2e/a11y.spec.ts > reduced motion >
      with reduce, the motion tokens are 1 ms and transitions take that long` and `> without a
      preference > the same transitions take their normal length`
- Deliberate differences: none (no reference counterpart). Visible changes from the fixes: the
  steps-a-day line of a checked activity card is plain text colour, the Coach field shows the
  focus ring; the rows look as before.
- Not taken: the Building plan step (it lasts as long as the fake's reply, too short to scan
  reliably); sheets not on the listed screens (entry editor, fit check, water and fasting sheets,
  the capture sheet), which the lead may add to the spec later; contrast for the five other
  accents (axe sees only the default accent; the token sweep in `src/ui/contrast.test.ts` covers
  every accent for its pairs, but not accent text on the accent wash, see Decisions).

## Fixes

The first runs (built app at `e370445`, axe-core 4.14.0) found two kinds of serious finding and
nothing critical; the focus walk found one field without a ring once it looked where the app
draws its rings (on a descendant for a week-bar day, on the `::after` of a stretched button, on a
field box around its input); the motion sweep found nothing.

1. `color-contrast` (serious), wizard › Activity, light theme only: the steps-a-day line of the
   checked card is accent text on the accent wash over the page, 4.2:1 for 13 px text. Owner:
   `src/features/onboarding/onboarding.module.css` (`ChoiceCards`). Change: on a checked card the
   line takes `--text`; unchecked cards keep the accent (5.5:1 on the card).
2. `label-content-name-mismatch` (serious, WCAG 2.5.3 Label in Name): a button whose visible text
   holds more than its accessible name. axe reads all the text inside a button as its label.
   - Settings › Personal info rows (`src/features/settings/profile/ProfilePage.tsx`): name
     "Sex: Male", text "Sex" and "Male" in two spans with no space between, which axe reads as
     one word. Change: a space between the spans (a flex row draws nothing for it). The name is
     unchanged; the row's text content gains the space (its unit test now expects it).
   - Home's food row (`src/features/home/EntryRow.tsx`, `selection.module.css`): the tap target
     held the tile, the name, the time, the energy and the macros, named "Edit Toast". Change: the
     button now holds the name only, and its `::after` covers the tile and both lines (the
     stretched-target pattern the fast row already used), so the hit area, the long-press, the
     swipe and the focus ring are where they were and the name stays "Edit Toast".
   - Home's fast rows (`src/features/home/FastRow.tsx`, `diaryRows.module.css`), running and
     finished: the same change; names ("Fasting now 30m", "16h fast") and descriptions unchanged.
   - Progress › the history card (`src/features/progress/HistoryLink.tsx`,
     `readings.module.css`): the same change; the name stays the history's title and the count
     line still describes it. Its unit test now checks that the card after the metric card
     contains the button, as the button is no longer the card itself.
3. Focus not visible (our walk, WCAG 2.4.7): the Coach's message field. The field drops its
   outline and the capsule around it only turned its 1 px border to the accent. Owner:
   `src/features/coach/coach.module.css` (`Composer`). Change: the capsule draws the same 2 px
   focus ring as every other field while the field has the keyboard focus
   (`:has(.field:focus-visible)`); the accent border stays.

4. Two controls with one name (reported by the parity pass, P10-04): each saved meal in the
   reuse Saved sheet had its visible trash button and the swipe row's keyboard delete button,
   both named "Remove <name>", so a keyboard or screen-reader user met the same action twice in a
   row. Owner: `src/ui/SwipeRow.tsx` gains `keyboardDelete` (default true; false leaves its
   keyboard button out and keeps the swipe), and `src/features/log/reuse/ReuseSheet.tsx` passes
   `false` for saved rows, whose own Remove button stays (ACC-D17-2's test relies on it). The hook
   `reuse.saved.row.delete` goes with the button; no parity scenario or e2e spec used it. Tests,
   both failing first: `src/ui/SwipeRow.test.tsx > SwipeRow > leaves its keyboard delete button
   out where the content shows its own, and still swipes (P10-07)` and
   `src/features/log/reuse/ReuseSheet.test.tsx > ReuseSheet: Saved > gives each saved meal one
   Remove control: the visible one, no keyboard twin (P10-07)`.

## Decisions for the lead

- Gate: axe's `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`, `wcag22aa` and `best-practice` rules;
  serious and critical fail, moderate and minor are attached to the report only (listed under
  "Lesser findings" below).
- WCAG 2.5.3 is met by keeping each row button's text equal to its label (the stretched-target
  pattern), not by putting the whole row into the name: names stay short ("Edit Toast"), every
  existing test that finds a row by name keeps working, and the e2e specs of other slices need
  no change.
- The focus check counts an outline drawn on the element, its pseudo-elements, its three nearest
  ancestors or its descendants. Outlines are used for focus only in this app; a new outline used
  for decoration would hide a missing ring from this check.
- The Settings scan finds the hub's pages from the hub itself and adds the four pages opened from
  App settings and About by name (`SUB_PAGES`); a new sub-page must be added there.
- The a11y spec takes its device from the Playwright project (Pixel 7 on Chromium, as the other
  specs), so it can run on WebKit and Firefox in the browser matrix.

Follow-ups found, not done here:
- Lesser finding, the only one left on the scanned screens (`heading-order`, moderate): a Coach
  reply's `##` heading is drawn as `h4` (`src/features/coach/markdown.tsx` maps `#` to `h3`), and
  the Coach page has no `h2`/`h3` above the thread, so the outline skips a level. Either the
  thread gets an `h2` (visually hidden) or replies start at `h2`.
- Accent text on the accent wash: only the checked activity card used it on the scanned screens.
  The contrast sweep (`src/ui/contrast.test.ts`) could add that pair for every accent, or the
  design could keep accent text off the wash.
- The licences check reads production dependencies only; `@axe-core/playwright` and `axe-core`
  are MPL-2.0, dev-only and never in `dist/`. The notices script may want to list dev tools too.

## Status

Done (2026-10-27, base `68a1456`; first done on `71e9727`, whose product files are the same).
After `pnpm build`: `e2e/a11y.spec.ts` 18/18 on `mobile-chromium` with `--workers=1
--repeat-each=2` (with `e2e/hosts.spec.ts`, 20/20); the whole e2e folder once with `--workers=1`:
47 passed, 1 skipped by design (the `@offline` test outside `offline-chromium`), of 48. Unit
tests of the touched components: `src/features/{home,progress,settings/profile,onboarding,coach}`,
`src/features/log/reuse`, `src/ui/SwipeRow.test.tsx` and `scripts/parity.test.ts`, 55 files,
581/581; the two Remove tests failed again with the fix taken out for the check (2 failed, 38
passed in their two files) and pass with it. `scripts/parity.test.ts` 28/28 (no `data-ui` hook a
scenario uses was renamed or removed). Lesser findings re-read from this run's report: only the
moderate `heading-order` on the Coach with an answer, both themes (follow-up above). The finished
fast's button keeps its `-title` id although no ARIA reference uses it now: the unit tests of
`Diary` and `HomePage` read a row's title through `[id$="-title"]`. Lines outside the task's own
files: the fixes listed under "Fixes", in the components that own them, and the unit tests that
follow their markup or prove the fix.
