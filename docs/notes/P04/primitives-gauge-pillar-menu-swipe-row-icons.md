# Task: primitives: gauge, pillar, menu, swipe row, icons (P04-03) · Phase: 04 · Owner: builder (wt-p04s2, slice S2)

Read (reference @ `10e14b67`): `A/ui/home/HomeScreen.kt` [3 229] lines 1666–1850 (the energy
dome: canvas size, stroke, dash pattern, start angle and sweep, readout position; geometry only)
and lines 2204–2470 (the swipeable diary rows: drag direction, cap, trigger distance, release
behaviour, the strip behind the row; geometry only); `A/ui/components/MacroCard.kt` [158] (tube
size, minimum fill, cap, slots above and below). Research spec `05-home-progress.md` §3.1.4 (stat
badges), §3.2.2 (dome), §3.2.3 (pillars), §3.3.4 (row gestures), §3.4 (the "+" drop-down with
nested pages and a Back row), R05.22 (visible delete plus confirmation); `16-what-we-change.md`
§2.5 (our visual language); conventions `00-layout-and-conventions.md` §2 (accessibility, copy,
styling). No reference test is listed for this task. Icons: nothing of the reference's icons was
opened; ours are drawn from scratch on a 24 grid.

What it does (own words): the display primitives Home and Progress are built from. `Gauge` is
the energy gauge: the upper half of a circle drawn as a dashed arc, a pale track under an accent
fill that sweeps from the left end clockwise by 180° × min(amount ÷ goal, 1); with no goal (≤ 0)
no fill is drawn at all, and over the goal it simply stays full. Inside the dome sit a heading,
the big value and a status line, all real text, so a screen reader reads exactly what is shown.
`Pillar` is a small vertical tube (16 × 64) that fills from the bottom toward a goal, never less
than a dot as tall as the tube is wide, never more than full, with the value above and the name
and status below. `ProgressBar` is a thin horizontal bar with progressbar semantics. `StatBadge`
is a small tile, value over label, whose text shrinks instead of wrapping. `Menu` is a drop-down
anchored to its button; a row with a chevron replaces the list with a sub-page that ends in a
Back row, and the keyboard moves through rows with the arrow keys (roving focus). `SwipeRow` lets
a row be dragged toward its leading edge to reveal a delete strip; letting go far enough asks the
caller to delete (the caller confirms), anything shorter springs back, and a visible delete
button does the same for keyboards. `icons/` is our own inline SVG set, one stroke style on
`currentColor`, hidden from screen readers unless given a label.

Inputs → outputs:
- `Gauge({ amount, goal, heading, value, status?, data-ui })` → an SVG dome plus a readout; parts
  `<hook>.fill`, `<hook>.value`, `<hook>.status`. `gaugeSweep(amount, goal)` → degrees, or null
  when there is no goal.
- `Pillar({ amount, goal, label, value, status, data-ui })` → tube plus slots; `pillarFillHeight
  (amount, goal)` → the fill's height in tube units (16…64).
- `ProgressBar({ label, value, max, valueText?, data-ui })` → `role="progressbar"` with the
  percentage as `aria-valuenow` and the caller's text as `aria-valuetext`.
- `StatBadge({ value, label, data-ui })` → a one-pair description list drawn value over label.
- `Menu({ label, icon?, entries, placement, align, data-ui, … })`; entries are actions
  (`onSelect`, optional `checked`, `disabled`), pages (their own `entries`) and separators →
  `onSelect()` after the menu has closed and focus is back on the button.
- `SwipeRow({ deleteLabel, onRequestDelete, deleteButton?, disabled?, children, data-ui })` →
  `onRequestDelete()` once per qualifying release or button press; never deletes.
- `Icon({ name, label?, size? })` and `ICON_NAMES`.

Files: created `src/ui/{Gauge,Pillar,ProgressBar,StatBadge,Menu,SwipeRow}.tsx`, their
`*.test.tsx`, `src/ui/icons/index.tsx`, `src/ui/icons/index.test.tsx`, `src/ui/display.module.css`.
Changed `src/ui/stylesheets.test.ts` (shared: one line, the new sheet in `SHEETS`). No catalogue
keys needed (`common.back` exists; every other label comes in as a prop).

Edge cases / failure modes:
- Gauge: goal ≤ 0 → no fill element; amount ≤ 0 or not finite → sweep 0; amount > goal → 180°
  (full, no colour change); 1 200 / 2 000 → 108°.
- Pillar: zero, negative or no goal → the minimum fill (a dot); over the goal → full; the status
  is marked as "over" only when goal > 0 and amount > goal.
- ProgressBar: max ≤ 0 → empty; values outside 0…max are clamped.
- Menu: entries that change while a sub-page is open (the page disappears) → the deepest page
  that still exists (the first page for a top-level page); Escape inside the menu must not also close a sheet behind it; Tab leaves and closes;
  a pointer press outside closes without stealing focus; a disabled row stays reachable but does
  nothing; the action runs only after focus is back on the button, so a sheet it opens returns
  focus there.
- SwipeRow: a mostly vertical move is a scroll, not a swipe (`touch-action: pan-y`, and the drag
  starts only after a small slop in the horizontal direction); a pointer click right after a drag
  is swallowed so the row's own tap does not fire (a keyboard click, `detail` 0, never is); travel is capped at 72 % of the row width; the
  trigger distance can never exceed the cap (narrow rows); right-to-left pages drag the other way;
  pointer cancel springs back without asking.

Our design differences / decisions:
- Names are ours (`Gauge`, `Pillar`, `StatBadge`, `SwipeRow`, `Menu`, `Icon`).
- Colours: track `--accent-soft`, fill `--accent`, solid only (no gradient on the arc, the tube,
  the number or the strip); the delete strip is `--danger` with `--text-inverse` icon.
- Gauge drawing: viewBox 240 × 120, stroke 14, dashes 4 on / 6 off with flat ends, the circle's
  centre on the bottom edge. The fill is the full dashed arc revealed by an alpha mask whose arc
  has `pathLength="180"`, so its dash length is the sweep in degrees; the reveal animates with a
  CSS transition (off under reduced motion) and theme changes apply through CSS variables with no
  remount. The launch fill from zero (R05.18) is P2 (F13) and not built here.
- Gauge and Pillar semantics: a `group` named by the heading (gauge) or the nutrient name
  (pillar); the drawing is `aria-hidden`; value and status are plain text in reading order, so
  the spoken text equals the visible text. No `meter` role: it cannot express "no goal" or "over"
  and would read the number twice.
- ProgressBar reports a percentage (0–100) plus the caller's `valueText`, so `aria-valuenow`
  is always valid even for odd maxima.
- StatBadge: `<dl>` with `<dt>` label and `<dd>` value, drawn value-first with
  `column-reverse`, so a screen reader hears "label, value". Shrinking uses container query
  units with a floor at half size, then clips (no wrapping).
- Menu: our own "pages" model instead of fly-out submenus: a page row has
  `aria-haspopup="menu"`, opening it replaces the list and focuses its first row; Back (the
  `common.back` word with a back chevron) returns to the row that opened it. Keys: ArrowDown /
  ArrowUp wrap, Home / End, ArrowRight opens a page row, ArrowLeft goes back, Enter / Space
  activate, Escape closes to the button, Tab closes. From the button, ArrowDown opens on the
  first row and ArrowUp on the last. Rows are not in the tab order (focus is moved in code). Rows
  with `checked` are `menuitemradio`. Hooks: the button `<hook>`, the list `<hook>.menu`, a row
  `<hook>[.<page id>…].<entry id>`, Back `<hook>.<page id>.back`. No typeahead yet.
- SwipeRow: trigger distance 220 px (`SWIPE_DELETE_PX`) or the cap when the cap is smaller;
  cap 72 % (`SWIPE_MAX_TRAVEL`); slop 8 px; the strip shows its trash icon once wider than 24 px;
  the row always springs back after a release (the caller's dialog decides). The delete button is
  always visible by default (`deleteButton="always"`, R05.22); `deleteButton="focus"` keeps it
  out of sight until the row holds keyboard focus, for dense lists such as the Home diary.
- Icons: 24 × 24 grid, stroke 1.75 on `currentColor`, round caps and joins, no fills; sized 1em
  so they follow the text. Set: plus, camera, photos, barcode, text, pencil, clock, drop,
  hourglass, scale, chart, chat, gear, trash, heart, chevron-left / right / up / down, close,
  check, info, copy, sort, plus `home` (the tab bar's first tab needs one; not in the row's list).

Tests we will write:
- Gauge: 1 200 / 2 000 sweeps 108° (the mask arc's dash, and the pure function); 2 500 / 2 000
  stays at 180°; goal 0 draws no fill; the arc is the upper half circle; the dashes are 4 / 6;
  the spoken text of the gauge equals heading, value and status as shown (ACC-L9-2); the drawing
  is hidden from screen readers; hooks.
- Pillar: zero shows the minimum fill (16 of 64); half the goal fills 32; over the goal fills 64;
  no goal shows the dot; the status is marked over only past a real goal; named group with the
  value as text.
- ProgressBar: role, name, valuenow as a percentage, valuetext, clamping, max ≤ 0.
- StatBadge: term and definition, value drawn first, hook.
- Menu: button state (`aria-expanded`, `aria-haspopup`), opens with focus on the first row; arrow
  keys move and wrap; Home / End; Enter on an action closes, returns focus and calls it once;
  a nested page and Back via the keyboard (ArrowRight / Enter in, ArrowLeft / Back out, focus on
  the row that opened it); Escape closes to the button; an outside press closes; checked rows;
  disabled rows do nothing; ArrowUp on the button opens on the last row; hooks.
- SwipeRow: release past the threshold calls the handler once and springs back; a short release
  springs back without calling; travel stops at 72 % of the width; the strip grows with the
  drag; a vertical move does not swipe; a click after a drag is swallowed; the keyboard delete
  button works; focus mode; disabled rows neither swipe nor show the button.
- Icons: every name renders one SVG with `aria-hidden` and no name; a label gives `role="img"`
  and the name; one stroke style on `currentColor`; every drawing differs from the others.
- Stylesheet: `display.module.css` joins `stylesheets.test.ts` (tokens only, no gradients or
  blur, known custom properties, reduced motion).

Compare checklist (filled after the rewrite; reopened `A/ui/home/HomeScreen.kt` 1666–1850,
2204–2470 and `A/ui/components/MacroCard.kt`):
- [x] Dome geometry: 240 × 120 box, stroke 14 inset by half, radius 113 around the bottom
      centre, from the left end clockwise, dashes 4 / 6 with flat ends, track and fill sharing the
      pattern (tested in `src/ui/Gauge.test.tsx > Gauge > draws the upper half circle from its left
      end clockwise to its right end`, `> draws the track and the fill with the same dashes, 4
      drawn and 6 left out`)
- [x] Fill = 180° × min(amount ÷ goal, 1), clamped below 0 (tested in `src/ui/Gauge.test.tsx >
      Gauge > sweeps 108° at 1 200 of 2 000`, `> stays full at 2 500 of 2 000`, `> draws an empty
      fill at zero, ready to grow`; `> gaugeSweep > sweeps 180° times the share of the goal`,
      `> stays full past the goal and never runs backwards`)
- [x] No goal: the reference draws a zero sweep; we draw no fill at all (tested in
      `src/ui/Gauge.test.tsx > Gauge > draws no fill when the goal is 0`; `> gaugeSweep > has no
      sweep at all without a goal`)
- [x] Readout inside the dome: heading, one-line value that shrinks, status; the value as text
      for screen readers, ACC-L9-2 (tested in `src/ui/Gauge.test.tsx > Gauge > reads out exactly
      the heading, value and status it shows`, `> keeps the drawing away from screen readers`)
- [x] Values move to a new level without a remount (theme and value changes reach the drawn
      gauge) (tested in `src/ui/Gauge.test.tsx > Gauge > follows a new value without remounting
      the drawing`, `> gives each gauge its own reveal, so two on a page never share one`; by hand
      in Chromium 420 px wide: the reveal's computed dash is `108px, 180px`, switching
      `data-theme` and `data-accent` recolours the drawn arc and pillars at once)
- [x] Tube 16 × 64, fully rounded, fill bottom-up, at least the tube's width, capped at full, dot
      also without a goal (tested in `src/ui/Pillar.test.tsx > Pillar > draws a 16 × 64 tube`,
      `> shows the minimum fill at zero, sitting on the bottom`, `> fills bottom-up toward the
      goal`, `> stays full past the goal and marks its status as over`; `> pillarFillHeight > …`
      4 tests)
- [x] Pillar status in the accent only when over a real goal; value above, name and status below
      (tested in `src/ui/Pillar.test.tsx > Pillar > does not mark the status as over without a
      goal`, `> reads out the value, name and status it shows, with the tube hidden`)
- [x] Swipe toward the leading edge only, capped at 72 % of the width (tested in
      `src/ui/SwipeRow.test.tsx > SwipeRow > stops at 72 % of the row width`, `> does not move
      toward the trailing edge`, `> drags toward the left edge on right-to-left pages too,
      mirrored`)
- [x] Release past 220 asks once and the row springs back; shorter springs back; cancel springs
      back (tested in `src/ui/SwipeRow.test.tsx > SwipeRow > asks once when released past the
      threshold, then springs back`, `> springs back without asking after a short release`,
      `> springs back without asking when the pointer is cancelled`)
- [x] Gap closed: on a row narrower than about 306 px the reference's 220 is out of reach; ours
      asks at the cap (tested in `src/ui/SwipeRow.test.tsx > SwipeRow > asks at the cap on a row
      too narrow to reach the usual threshold`)
- [x] Strip only over the uncovered width at the trailing edge, icon once wider than 24 (tested
      in `src/ui/SwipeRow.test.tsx > SwipeRow > uncovers the delete strip as it moves, with its
      icon once there is room`)
- [x] A drag is not a tap; a vertical move stays a scroll (tested in `src/ui/SwipeRow.test.tsx >
      SwipeRow > swallows the click that ends a drag, but not a plain tap`, `> never swallows a
      click from the keyboard`, `> leaves a mostly vertical move to the page`)
- [x] No swipe in selection mode (our `disabled`) (tested in `src/ui/SwipeRow.test.tsx > SwipeRow >
      neither swipes nor offers delete while disabled`)
- [x] Visible delete for keyboards, R05.22 (tested in `src/ui/SwipeRow.test.tsx > SwipeRow > asks
      from its visible delete button, with the keyboard`, `> keeps the delete button reachable in
      focus mode`)
- [x] Menu from spec §3.4: nested pages, a chevron on page rows, Back at the end of a sub-page,
      hairline separators, a choice closes the menu (tested in `src/ui/Menu.test.tsx > Menu >
      opens a nested page and comes back with the keyboard`, `> opens nested pages and goes back
      by pointer too`, `> runs an action once, after closing and giving focus back to the
      button`, `> is a menu button that opens with focus on the first row`, `> gives every row a
      hook under its page`, `> starts on the first page every time it opens`, `> falls back to the
      first page when the open page goes away`)
- [x] Menu keyboard and dismissal (tested in `src/ui/Menu.test.tsx > Menu > moves through the rows
      with the arrow keys, wrapping at both ends`, `> keeps its rows out of the tab order`,
      `> opens on the first row with ArrowDown and on the last with ArrowUp`, `> closes on Escape,
      gives focus back to the button and keeps the key to itself`, `> closes when Tab moves on,
      and focus goes to what follows the button`, `> closes on a press outside and leaves focus
      where the press put it`, `> closes when its button is pressed again`, `> closes when focus
      leaves for something else on the page`, `> reaches a disabled row but does nothing with
      it`, `> marks the chosen mode of a set with a check`, `> can be an icon button named by its
      label`)
- [x] Stat badge from spec §3.1.4: value over label, no wrapping (tested in
      `src/ui/StatBadge.test.tsx > StatBadge > pairs its label with its value for screen readers`,
      `> carries its hook on the tile, label first in reading order`; shrinking by hand in Chromium)
- [x] Progress bar (tested in `src/ui/ProgressBar.test.tsx > ProgressBar > …` 3 tests,
      `> progressShare > …` 2 tests)
- [x] Icons: our own set, one stroke style, hidden unless labelled (tested in
      `src/ui/icons/index.test.tsx > Icon > draws %s as decoration hidden from screen readers` (25
      cases), `> is a named image when it has a label`, `> stays hidden with an empty label`,
      `> draws every icon in one stroke style on the current colour, sized to the text`, `> has a
      different drawing for every name`, `> includes the set the screens ask for`)
- [x] Our look, tokens only, reduced motion (tested in `src/ui/stylesheets.test.ts >
      src/ui/display.module.css > takes every colour from the tokens`, `> draws no gradients, blur
      or glass`, `> reads only custom properties that exist`, `> turns its motion off under
      reduced motion`)
- Deliberate differences: solid accent instead of gradients on the arc, number, tube and bars,
  and no glow under the pillar fill (16 §2.5); no fill element at all without a goal; the delete
  strip is our danger token with no text; the trigger distance never exceeds the cap; a visible
  delete button on swiped rows (R05.22); value changes animate with a CSS transition, not a
  spring; stat badges on our raised surface instead of an accent tint.
- Not taken: the favourite swipe toward the trailing edge (food rows, area 02, P06); the burn
  line under the gauge (later phase, needs a health store); the status texts and the kJ heading
  (callers: P04-10, P07-03); the launch fill from zero (P2, F13, R05.18); typeahead in menus.

## Decisions for the lead

- **Gauge and Pillar semantics**: a `group` named by the heading (gauge) or the nutrient name
  (pillar); the drawing is `aria-hidden`; value and status are plain text in reading order, so
  the spoken text equals the shown text (ACC-L9-2). No `meter` role (it cannot say "no goal" or
  "over" and would read the number twice).
- **Gauge drawing**: the fill is the whole dashed arc under an alpha mask whose arc has
  `pathLength="180"`, so the mask's dash length is the sweep in degrees and a CSS transition
  animates it (0 ms under reduced motion). Mask ids come from `useId`. The number shrinks with
  its length (`--gauge-chars`, container query units), never wraps.
- **Pillar**: `status` is required; `data-over` marks it (accent) only when goal > 0 and amount >
  goal. The min-fill rule lives in TS (`pillarFillHeight`), not CSS, so it is tested.
- **ProgressBar** reports 0–100 in `aria-valuenow` plus the caller's `valueText`; `max` defaults
  to 1.
- **StatBadge** is a one-pair `<dl>` (label first for screen readers, drawn value first).
- **Menu**: pages replace the list (no fly-outs). Hooks: button `<hook>`, list `<hook>.menu`, rows
  `<hook>[.<page id>…].<entry id>`, Back `<hook>.<page id>.back`. `onSelect` runs after the menu
  has closed and focus is back on the button, so a sheet it opens returns focus there. Rows are
  `tabindex=-1`; Tab closes and moves on from the button. `className` goes on the anchor (P04-10
  can fix the "+" in place there) and `buttonClassName` on the button. No typeahead; no RTL flip
  of ArrowLeft / ArrowRight yet (same follow-up as Segmented).
- **SwipeRow**: trigger `min(220 px, cap)` (`SWIPE_DELETE_PX`), cap 72 % (`SWIPE_MAX_SHARE`), slop
  8 px; RTL pages drag to the right. `deleteButton="always"` by default; `"focus"` (shown while the
  row holds focus) is offered for the Home diary (P04-12 chooses). `deleteLabel` is required so
  rows stay distinct ("Delete Oatmeal"; the caller builds it with `t()`).
- **Icons**: `Icon({ name, label?, size? })` with `ICON_NAMES`; kebab-case names; `home` added to
  the listed set for the tab bar (P04-05). No flame glyph: the gauge's status slot takes any
  node if one is wanted later.
- **Catalogue**: no keys added (`common.back` already existed).

## Status

Done (2026-10-26). Gauge, Pillar, ProgressBar, StatBadge, Menu, SwipeRow and the icon set with
tests; checked by hand in headless Chromium (dark and light, two accents). Lines outside the
task's own files: `src/ui/stylesheets.test.ts` (the new sheet added to `SHEETS`). Handed on:
P04-05 (tab icons), P04-10 (Gauge, Pillar, Menu), P04-12 (SwipeRow), P04-13 (registry icons),
P07-03 (pillar row).
