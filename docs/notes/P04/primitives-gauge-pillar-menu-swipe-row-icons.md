# Task: primitives: gauge, pillar, progress bar, stat badge, menu, swipe row, icons (P04-03) · Phase: 04 · Owner: builder (wt-p04s2, slice S2)

Read (reference @ `10e14b67`): `A/ui/home/HomeScreen.kt` lines 1666–1850 (the energy dome: canvas
size, stroke, dash, sweep rule, centre readout) and 2204–2470 (the swipeable rows: trigger
distance, travel cap, strip behind the row, spring back), geometry and behaviour only;
`A/ui/components/MacroCard.kt` (tube size, minimum fill, bottom-up fill, status colour when over).
The phase row names no reference tests for these. Research spec `05-home-progress.md` §3.1.4
(stat badges), §3.2.2 (dome), §3.2.3 (pillars), §3.3.3 (thin progress bar on the active fast row),
§3.3.4 (swipe to delete), §3.4 (drop-down add menu with nested pages and a Back row), §5, trap
R05.22 (a visible delete, owned by P07-14). Decisions: `16-what-we-change.md` §2.5 (siblings, not
twins: our palette, radius, elevation, our own icon set), D-16.1 (solid accents, no gradients).
Acceptance id ACC-L9-2. Icons: no reference read and no third-party set opened, by design.

What it does (own words): the display primitives Home and Progress are built from.
- `Gauge`: the energy gauge, an upper half circle drawn as a run of dashes. The empty track is
  the soft accent; the filled part, in the accent, sweeps from the left end clockwise over
  180° × min(eaten ÷ goal, 1) and stops at full when the person is over. With no goal (≤ 0)
  nothing is filled. Inside the arch sit three slots the caller fills: a heading (the unit name),
  the value (eaten, already formatted in the display unit) and a status line (left / over /
  reached / no goal, worded by the caller). The arc is decoration; the slots are real text, and
  the gauge is a labelled group whose description is the value and the status, so a screen
  reader gets exactly what is shown (ACC-L9-2).
- `Pillar`: a vertical tube 16 × 64 that fills from the bottom toward the goal. The filled part is
  never shorter than the tube is wide (zero still shows a round dot) and never taller than the
  tube. Value above, name and status below; the status takes the accent when over the goal.
- `ProgressBar`: a thin horizontal bar, a `progressbar` with a name and an optional value text,
  filled by value ÷ max and capped at full.
- `StatBadge`: a small tinted tile with a bold value over a muted label; both stay on one line
  and the value shrinks with the tile's width instead of wrapping.
- `Menu`: a button that drops a menu down (or up, for a button at the bottom of the screen). A
  row can open a nested page in place; a nested page ends with a Back row. Arrow keys rove the
  focus over the rows, Enter or Space activates, Escape or Left goes back a page and Escape at
  the top closes; Tab and a click outside close. Choosing an action closes the menu, returns the
  focus to the button, then runs the action. A row can show a check mark (a radio item).
- `SwipeRow`: wraps a diary row. Dragging it toward the leading edge slides it and grows a
  danger strip with a trash mark behind it; the slide stops at 72 % of the row's width. Letting
  go past the threshold asks the caller to delete (`onRequestDelete`, once) and the row slides
  back; the caller confirms and removes it. A shorter drag springs back. A delete button after
  the row's content is reachable by Tab; while it has focus the row slides aside to show it.
- `Icon`: our own icon set, drawn for Platewise on a 24 grid with `currentColor` strokes: plus,
  minus, camera, photos, barcode, text, pencil, clock, drop, hourglass, scale, chart, chat, gear,
  trash, heart, the four chevrons, close, check, info, copy, sort. Hidden from assistive tech
  unless given a label, then an image with that name.

Inputs → outputs:
- `gaugeSweep(eaten, goal)` → degrees 0…180, or `null` (no fill) when the goal is ≤ 0 or not a
  number. `<Gauge eaten goal heading value status statusIcon? data-ui?>`.
- `pillarFill(current, goal)` → filled height in px, 16…64. `<Pillar current goal value label
  status data-ui?>`.
- `<ProgressBar value max label valueText? data-ui?>` → `progressbar`, `aria-valuenow` in percent.
- `<StatBadge value label data-ui?>`.
- `<Menu label icon? hideLabel? entries placement? align? data-ui?>`; entries are actions
  (`onSelect`, optional `selected`), pages (`entries`) and separators.
- `<SwipeRow onRequestDelete deleteLabel? data-ui?>{row}</SwipeRow>`.
- `<Icon name label? size? className?>`.
- `src/i18n/en/display.ts`: the built-in words (Back, Delete).

Files: created `src/ui/{Gauge,Pillar,ProgressBar,StatBadge,Menu,SwipeRow}.tsx` and their
`.test.tsx`, `src/ui/display.module.css`, `src/ui/displayWords.ts`, `src/ui/icons/index.tsx`,
`src/ui/icons/index.test.tsx`, `src/i18n/en/display.ts`, this note.

Edge cases / failure modes:
- Gauge: goal 0 or negative → no fill element at all; eaten 0 → a fill of 0°; eaten negative →
  0°; over the goal → 180°, same colour; NaN or infinite input → treated as no fill (goal) or 0
  (eaten), never a broken path.
- Pillar: goal ≤ 0 → only the minimum dot; a value above the goal → full tube; negative → dot.
- ProgressBar: max ≤ 0 → empty; value above max → full, `aria-valuenow` 100.
- Menu: a nested page opened and closed by keyboard puts the focus back on the row that opened
  it; reopening the menu starts at the top page; a click outside closes without stealing the
  focus; an action that opens a sheet gets the focus after the menu has given it back.
- SwipeRow: a mostly vertical move is a scroll, never a swipe (`touch-action: pan-y` and a
  direction test after a small slop); a second pointer is ignored; `pointercancel` springs back
  without asking; the click that ends a drag is swallowed, so a row's own tap action (P06) does
  not fire after a swipe; a row narrower than the fixed threshold still reaches it (see below);
  right-to-left pages swipe the other way.
- Reduced motion: every transition uses the motion tokens, which drop to 1 ms under
  `prefers-reduced-motion`.

Our design differences / decisions:
- Look (16 §2.5): solid accent fill (no gradient), our own dash rhythm (24 dashes with 23 equal
  gaps, so both ends finish on a dash) and stroke, a menu that uses our card colours, radius and
  raised shadow, our own icon geometry. The gauge's unit heading is not upper-cased by the
  component (the caller's words are shown as given).
- The gauge's fill is the dashed track shape in the accent, revealed by a mask whose length is
  the sweep in degrees (`pathLength` 180), so the fill dashes line up with the track dashes and
  a change of value can animate with a CSS transition.
- Swipe threshold: `min(220 px, 60 % of the row width)`, so a narrow row (where 72 % of the width
  is under 220 px) can still reach it. The reference uses a fixed 220 on Android.
- Keyboard delete: the button is focusable on every row and shown by sliding the row aside while
  it has focus, rather than a permanent trash icon on every diary row. A permanent visible button
  for history lists (R05.22) is P07-14's call.
- Menu: all rows have `tabIndex -1` and the focus is moved by the arrow keys (the menu pattern's
  roving focus); Tab closes the menu and leaves the focus moving on from the button. Escape and
  Left in a nested page go back one page, as closing a submenu does.
- Built-in words come from the `display` partition through `src/ui/displayWords.ts` (a translator
  over that partition), because `src/i18n/en.ts` does not carry it until the lead lands it.
- No launch fill animation here (R05.18 is P07-03's); values transition when they change.

Tests we will write:
- `Gauge.test.tsx`: `gaugeSweep` table (1 200 / 2 000 → 108, 2 500 / 2 000 → 180, 2 000 / 2 000
  → 180, 0 → 0, negative → 0, goal 0 and negative → null, NaN); the drawn mask length equals the
  sweep; goal 0 draws no fill; over stays full; the group's name is the heading and its
  description the visible value and status; the arc is hidden from assistive tech.
- `Pillar.test.tsx`: zero shows the minimum fill; half fills 32 px; over is capped at 64; goal 0
  shows the dot; status marked over; slots are text and the tube is hidden.
- `ProgressBar.test.tsx`: half, over and no-max cases with `aria-valuenow`; name and value text.
- `StatBadge.test.tsx`: value and label render as text, value first. (Planned as a group named
  by the label; built without a role, since a group per tile would read the label twice.)
- `Menu.test.tsx`: open by click and by keyboard focuses the first row; arrows wrap; Up on the
  button focuses the last row; Enter on a page row opens it with its own rows and a Back row;
  Back and Escape/Left return to the opening row; Escape at the top closes and refocuses the
  button; an action runs once and closes; selected rows are checked radio items; a click outside
  closes; Tab closes.
- `SwipeRow.test.tsx`: release past the threshold calls the handler once and springs back; a
  short release springs back without calling; travel stops at 72 %; a narrow row uses 60 % of its
  width; a vertical move never slides; cancel springs back; the click after a drag is swallowed;
  the keyboard delete button reveals the strip and works.
- `icons/index.test.tsx`: every icon renders `aria-hidden` with a 24 viewBox and `currentColor`
  only; a label makes it a named image; names are unique and every icon draws something.

Compare checklist (filled after the rewrite; reopened `A/ui/home/HomeScreen.kt` 1666–1850 and
2204–2470, `A/ui/components/MacroCard.kt`):
- [x] Sweep = 180° × eaten ÷ goal clamped to 0…1, nothing when the goal is ≤ 0 (`Gauge.test.tsx >
      gaugeSweep > sweeps %s of %s over %s degrees`, `> fills nothing when the goal is %s`;
      `> Gauge > sweeps 108° at 1 200 of 2 000`, `> draws no fill when the goal is 0, but keeps
      the track`)
- [x] Over the goal the arc stays full and does not change colour or shape (`Gauge.test.tsx >
      Gauge > stays full at 2 500 of 2 000 and looks the same as under the goal`)
- [x] Dashed track and fill on one arc, flat dash ends, the fill drawn over the track's dashes
      (`Gauge.test.tsx > Gauge > draws the fill along the same dashed arc as the track`)
- [x] Centre readout: heading, one-line value, status with a small mark; the value is read out as
      shown (`Gauge.test.tsx > Gauge > reads the visible value and status to a screen reader
      (ACC-L9-2)`, `> keeps a decorative status mark out of the description`). The status wording
      and the kcal comparison are the caller's (P04-10).
- [x] Pillar: 16 × 64 tube, bottom-up, at least the width, at most full, zero or no goal shows
      the dot (`Pillar.test.tsx > pillarFill > fills %s of %s to %s px`, `> Pillar > shows the
      minimum fill, as tall as the tube is wide, at zero`, `> fills half the tube at half the goal
      and caps it at the top`, `> shows only the dot when there is no goal`)
- [x] Pillar status in the accent only when over a positive goal (`Pillar.test.tsx > Pillar >
      marks the status as over only past the goal`)
- [x] Active-fast bar: elapsed ÷ goal capped at 1 (`ProgressBar.test.tsx > ProgressBar > caps at
      full when the value passes the max`, `> fills by value over max and exposes the percent`)
- [x] Swipe: only toward the leading edge, travel capped at 72 % of the width, release at or
      past the threshold asks, then the row springs back; a shorter release or a cancel springs
      back without asking (`SwipeRow.test.tsx > SwipeRow > asks for the delete once on a release
      past the threshold, then springs back`, `> stops the slide at 72 % of the width`, `> springs
      back without asking on a short release`, `> springs back without asking when the pointer is
      cancelled`, `> ignores a drag away from the leading edge and a jitter under the slop`)
- [x] The strip is painted only where the row moved out, with the trash mark showing once it is
      wide enough (checked by hand in Chromium on a throwaway page: mid-drag, at the cap, and the
      keyboard reveal; the strip width is asserted in `> asks for the delete once …` and `> stops
      the slide at 72 % of the width`)
- [x] Horizontal drags only (the reference uses the platform's horizontal drag detector)
      (`SwipeRow.test.tsx > SwipeRow > never slides on a mostly vertical move, so the page can
      scroll`)
- [x] Gap closed: food rows do not swipe in selection mode → `disabled` turns the swipe and the
      delete button off (`SwipeRow.test.tsx > SwipeRow > neither swipes nor offers the delete
      button when disabled`)
- [x] Gap closed (found by hand in Chromium): a mouse drag left a text selection on the row; the
      selection is dropped when the move becomes a swipe (`SwipeRow.test.tsx > SwipeRow > drops a
      text selection the press made once the move turns into a swipe`)
- [x] Menu (spec 05 §3.4, no reference file named): nested pages end with a Back row, an action
      closes the menu (`Menu.test.tsx > Menu > opens a nested page and comes back with the Back
      row, all by keyboard`, `> runs an action in a nested page by keyboard and reopens on the top
      page`); the sort menu's current choice is checked (`> shows the selected choice as a
      checked radio row`)
- Deliberate differences: solid accent fill and our dash rhythm (25 dashes, 24 gaps); no glow
  under the pillar fill; the keyboard delete button, the 60 % threshold on narrow rows, right-to-
  left swiping (`> swipes toward the right on a right-to-left page`); Escape/Left go back a page
  in the menu; the heading is shown as the caller writes it (the reference upper-cases it).
- Not taken: the swipe toward the trailing edge that toggles a favourite on food rows (area 02;
  P06 can add a second strip to `SwipeRow`); the launch fill from zero (R05.18, P07-03); the
  burn line under the status (a later phase).

## Decisions for the lead

- `src/ui/displayWords.ts` is a translator over the `display` partition alone, so Menu's Back and
  SwipeRow's Delete work before `src/i18n/en.ts` merges the partition. After landing it can
  become `export const displayWord = t;` (the keys are `display.menu.back`,
  `display.swipeRow.delete`). The merged catalogue lints clean (`lintCatalogue({ common,
  appearance, display })` → no problems, checked with tsx).
- Swipe threshold: `min(220 px, 60 % of the row width)`; travel 72 % of the width (above).
- Keyboard delete: a focusable button after the row's content, hidden under the row until it
  has focus, then the row slides aside by 4.5 rem to show it. A permanent visible trash for
  history lists (R05.22) is P07-14's choice; it would be a small prop here.
- Menu rows all have `tabIndex -1`; the arrow keys move the focus. Tab closes the menu after
  moving the focus to the button, so the browser carries it on from there.
- user-event on Vitest fake timers hangs: Testing Library's async wrapper waits on a 0 ms timeout
  that it advances only through a global `jest`. `Menu.test.tsx` and `SwipeRow.test.tsx` stub
  `jest.advanceTimersByTime` with Vitest's clock (and unstub after each test). A shared helper in
  `src/test/` would serve every UI slice (P04-01/02 will meet the same thing); not added here to
  stay inside this slice's files. Testing Library's auto-cleanup is also off (no Vitest globals),
  so each test file calls `cleanup` after each test.
- The gauge's fill is masked with `mask-type: alpha` (in the CSS module, as React's types lack
  the attribute), so no colour literal is needed for the mask.

## Status

Done (2026-10-26). Gauge, Pillar, ProgressBar, StatBadge, Menu, SwipeRow, the icon set, the
`display` partition and their tests (112 tests in 7 files). Nothing changed outside the slice's
files; the lead adds the `display` partition to `src/i18n/en.ts` when landing.
