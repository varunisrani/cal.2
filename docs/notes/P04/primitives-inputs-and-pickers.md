# Task: primitives: inputs and pickers (P04-02) · Phase: 04 · Owner: builder (wt-p04s1, slice S1)

Read (reference @ `10e14b67`): `A/ui/components/WheelPicker.kt` [439], `UnitToggle.kt` [104],
`OptionPickerSheet.kt` [186], behaviour only (what a wheel starts at, what moves it, how the
split whole + tenths wheel is composed, what a two-way toggle and an option sheet do on a tap).
Research spec `05-home-progress.md` §3.1.4 (segmented controls, wheel pickers) and §5 (web
mapping: scroll-snap wheels, native date and time inputs with `max` where the future is
forbidden), §3.5.3 (a picked future day is clamped to today), R05.10 (tenths by rounding, not
truncation: a caller's concern, noted for P07). No reference test is listed.

What it does (own words): the controls forms are built from. `Field` is a labelled text or
number input with an optional hint, an error and a unit after it; the hint and error are tied
to the input so screen readers read them, and an error marks it invalid. `Stepper` changes a
number by a step with − and + buttons or the arrow keys, never leaving min…max; at a bound the
button stays in place but does nothing. `Segmented` picks one of a few options (kg | lb,
units, ranges): a radiogroup where the arrow keys move both focus and the choice. `Switch` is
an on/off row with role `switch`. `ListPicker` is a sheet listing options with a check mark on
the chosen one; choosing one reports it and closes. `Wheel` is a scroll-snap column of values
from a list the caller builds (so a weight is a whole-number wheel plus a tenths wheel); it
opens scrolled to the given value, settles on the row in the middle when scrolling stops,
moves one row with the arrow keys and a page with Page Up / Page Down, and keeps a native
`<select>` (visually hidden, the keyboard and screen-reader path) in step with it.
`DateTimeField` uses the browser's own date and time inputs; with `max` (and `min`) a picked
value outside the range is clamped back to it, so a picker can forbid the future.

Inputs → outputs:
- `Field({ label, hint, error, unit, inputMode, value, onValueChange, data-ui, …input props })`.
- `Stepper({ label, value, min, max, step, format, onChange, data-ui })` → `onChange(next)`.
- `Segmented({ label, options, value, onChange, data-ui })` → `onChange(value)`.
- `Switch({ label, description, checked, onChange, data-ui })` → `onChange(!checked)`.
- `ListPicker({ open, title, options, value, onChange, onClose, data-ui, children })` →
  `onChange(value)` then `onClose()`; `children` show under the list (a custom-value field).
- `Wheel({ label, values, value, format, onChange, pageSize, data-ui })` → `onChange(value)`.
- `DateTimeField({ label, mode: 'date' | 'time' | 'datetime', value, min, max, onChange,
  data-ui })`; values are local wall-clock strings (`YYYY-MM-DD`, `HH:mm`,
  `YYYY-MM-DDTHH:mm`, the `datetime-local` shape) so they compare as text.

Files: created `src/ui/{Field,Stepper,Segmented,Switch,ListPicker,Wheel,DateTimeField}.tsx`, their
`*.test.tsx`, `src/ui/inputs.module.css` (uses `src/ui/primitives.ts` and is covered by
`src/ui/stylesheets.test.ts`, both from P04-01). Changed `src/i18n/en/common.ts` (shared: four
keys, `common.date` "Date", `common.time` "Time", `common.decrease` "Decrease {name}",
`common.increase` "Increase {name}").

Edge cases / failure modes:
- Stepper: fractional steps (0.5) must not drift (0.1 + 0.2): results are rounded to the step's
  decimals; a value off the grid still moves by one step and is clamped.
- Stepper at a bound: the button is `aria-disabled` (still focusable), the press is ignored.
- Segmented: arrow keys wrap; Home / End jump; only the chosen option is in the tab order.
- Wheel: a value that is not in the list opens at the nearest number (or the first entry);
  an empty list renders nothing; arrow keys at the ends stay put; a scroll that ends on the row
  already chosen reports nothing; our own scroll to the chosen row (keys, select, a new value
  from the caller) does not report back as a change.
- Wheel scroll end: `scrollend` where the browser has it, else a short quiet period after the
  last `scroll` event (Safari).
- DateTimeField: an emptied input reports nothing; with `max` on the same day the time is
  clamped too; a date after `max` becomes `max`.
- ListPicker: focus starts on the chosen option; arrow keys move between options.

Our design differences / decisions:
- Segmented shows a raised chip in our card colour on a muted track; the reference's look is
  not taken.
- Wheel: the visual column is `aria-hidden`; the hidden native `<select>` is the one control
  for keyboards and screen readers. When it has focus the wheel draws the focus ring. Rows
  fade by colour (chosen = text colour, bold; others muted), not by a gradient mask.
- Wheel keys: ArrowUp/Down one row, PageUp/Down `pageSize` rows (default 5, the visible rows),
  Home/End the ends.
- DateTimeField clamps instead of refusing silently, as the reference clamps a future day.
- ListPicker uses a listbox with options (`aria-selected`), roving focus, Enter / Space / tap to
  choose; arrows only move focus, so a key press never closes the sheet by accident.
- The stepper's buttons are named "Decrease <label>" / "Increase <label>" (common keys), so
  several steppers on one page stay distinct.

Tests we will write:
- Field: label names the input; hint and error describe it; error sets `aria-invalid`;
  `inputMode` passes through; typing reports the text.
- Stepper: steps by 5; clamps at min and max (button press and keys); Home / End; fractional
  steps do not drift; buttons and spinbutton found by role and name.
- Segmented: radiogroup with radios; click chooses; ArrowRight / ArrowLeft move and choose with
  wrap; only the chosen radio is tabbable.
- Switch: role switch with `aria-checked`; click and Space toggle; the label names it.
- ListPicker: options with the chosen one selected; choosing reports and closes; focus starts on
  the chosen option; arrow keys move focus.
- Wheel: opens at 70.0 (select value and chosen row); ArrowDown moves to the next value and
  the select mirrors it; Page keys move by a page; ends stay put; changing the select reports
  the value; a scroll that settles on another row reports it (fake timers), our own scroll does
  not.
- DateTimeField: a future date with `max` is clamped to `max`; a time after `max` on the max
  day is clamped; the inputs carry `max`; an emptied input reports nothing.

Compare checklist (filled after the rewrite; reopened `A/ui/components/{WheelPicker,UnitToggle,
OptionPickerSheet}.kt`):
- [x] Wheel: nothing for an empty list (tested in `src/ui/Wheel.test.tsx > Wheel > draws nothing
      for an empty list`)
- [x] Wheel opens at the given value, unknown values fall back (tested in `src/ui/Wheel.test.tsx >
      Wheel > opens at 70.0, with the native select and the chosen row showing it`, `> opens at
      the nearest number when the value is not in the list`; `> wheelIndexOf > finds a value, the
      nearest number, or the first entry`)
- [x] Wheel reports the row it snaps to, only when it differs (tested in `src/ui/Wheel.test.tsx >
      Wheel > reports the row a scroll settles on, once the scrolling stops`, `> settles at once
      where the browser sends scrollend`, `> scrolls to a value chosen by key without reporting
      that scroll as a change`; `> rowAtScroll > rounds to the nearest row and stays inside the
      list`)
- [x] Wheel highlight band behind the middle row, chosen row stronger, others muted (by hand in
      Chromium at Pixel 7 size: the chosen row's centre equals the column's centre on open and
      after keys; a mouse-wheel scroll of three rows settled on 73 from 70)
- [x] Split whole + tenths wheel as two lists (tested in `src/ui/Wheel.test.tsx > Wheel > builds a
      weight from a whole wheel and a tenths wheel`)
- [x] Keyboard and assistive-tech path (tested in `src/ui/Wheel.test.tsx > Wheel > moves to the
      next value on ArrowDown and the native select mirrors it`, `> moves a page with Page Down and
      Page Up, and to the ends with Home and End`, `> stays put at the ends`, `> reports a value
      picked in the native select`, `> chooses a row that is clicked`)
- [x] Two-way toggle: tapping the chosen side does nothing, the other side reports (tested in
      `src/ui/Segmented.test.tsx > Segmented > chooses an option on click`; `> is a named
      radiogroup of radios with their hooks`, `> moves and chooses with the arrow keys, wrapping at
      the ends`, `> puts only the chosen option in the tab order`)
- [x] Option sheet: title, rows with an optional second line, a check mark on the chosen one,
      a tap chooses (tested in `src/ui/ListPicker.test.tsx > ListPicker > lists the options in a
      titled sheet with the chosen one selected`, `> reports a tapped option and closes, giving
      focus back`, `> closes without a report when the chosen option is picked again`, `> starts
      with focus on the chosen option`, `> moves focus with the arrow keys and chooses with
      Enter`, `> chooses with Space too`, `> starts on the first option when nothing is chosen
      yet`)
- [x] Gap closed: the option sheet's free-form custom entry is a slot under the list (tested in
      `src/ui/ListPicker.test.tsx > ListPicker > shows extra content under the list, e.g. a field
      for a custom value`); the field and its Save are the caller's (P05-04 model picker)
- [x] Date wheel replaced by native inputs with `max` (05 §5) and the future clamped to today
      (05 §3.5.3) (tested in `src/ui/DateTimeField.test.tsx > DateTimeField > date mode > rejects a
      future date with max: it comes back as max`, `> keeps max when a future date is picked on max
      itself`, `> brings a date before min up to min`, `> reports nothing when the input is
      emptied`, `> is a labelled date input carrying max and its hook`, `> reports a past date as
      picked`; `> datetime mode > rejects a future date: it comes back as max, time included`,
      `> clamps a later time on max’s day and keeps an earlier one`, `> cuts seconds off the
      bounds`, `> shows a named group with a date and a time input`; `> is a labelled time input in
      time mode`; `> clampWallClock > compares values of one shape as text`)
- [x] Stepper (phase row: steps by 5, clamps) (tested in `src/ui/Stepper.test.tsx > Stepper >
      steps by 5 with the buttons`, `> clamps at max and min, and the button at a bound does
      nothing`, `> steps with the arrow keys and jumps with Home and End`, `> names the value and
      both buttons, and carries the hooks`, `> shows the value through the caller’s format`,
      `> ignores presses and keys while disabled`; `> stepBy > keeps fractional steps free of
      float drift`, `> moves an off-grid value by one step and clamps`)
- [x] Field and Switch (tested in `src/ui/Field.test.tsx > Field > …` 5 tests;
      `src/ui/Switch.test.tsx > Switch > …` 4 tests)
- [x] Our look, tokens only, reduced motion (tested in `src/ui/stylesheets.test.ts >
      src/ui/inputs.module.css > takes every colour from the tokens`, `> draws no gradients, blur
      or glass`, `> reads only custom properties that exist`, `> turns its motion off under
      reduced motion`)
- Deliberate differences: wheels are CSS scroll-snap columns with a hidden native select (05
  §5) instead of a fling list; a value off the list opens at the nearest number (the reference
  snaps down onto its step grid); a date is picked with the browser's date input, not three
  wheels; our own colours (accent wash band, muted rows) instead of the sheen capsule and fading
  alpha; the option sheet closes itself after a choice; the toggle is a general radiogroup of
  any number of options, not two fixed sides.
- Not taken: the unit label beside a wheel and the feet + inches / split-decimal / decimal
  wrappers (callers compose two wheels and lay out the unit; P05 onboarding and P07 weight log
  own the rounding rule of R05.10: round to the nearest tenth, never truncate); a multi-line
  text field (P06 Describe and P08 Composer own their text areas).

## Decisions for the lead

- **Wheel a11y shape**: the drawn column is `aria-hidden` and not in the tab order; the one
  keyboard and screen-reader control is a visually hidden native `<select>` named by `label`
  (option values are row indices, so float values never round-trip through strings). While it
  has focus the column draws the focus ring. Keys: ArrowUp/Down one row, PageUp/Down `pageSize`
  rows (default 5, the visible rows), Home/End; Alt+Arrow is left to the browser.
- **Wheel settling**: `scrollend` where supported, else 150 ms after the last `scroll`
  (`WHEEL_SETTLE_MS`, Safari has no `scrollend`). Moves made by keys, the select or the caller
  scroll the column instantly (no smooth scroll), so no in-between value is ever reported.
- **DateTimeField values** are wall-clock strings in the `datetime-local` shape (`YYYY-MM-DD`,
  `HH:mm`, `YYYY-MM-DDTHH:mm`); bounds longer than the mode are cut (seconds dropped). Picks
  outside `min`…`max` are clamped, not refused silently; an emptied input reports nothing.
  Datetime mode is two inputs (date + time) in a fieldset named by `label`, inputs named by the
  common words Date / Time; the time is bounded only on the bound's own day.
- **Stepper**: the value is a `spinbutton` (ArrowUp/Down, Home/End); − / + are `IconButton`s named
  "Decrease <label>" / "Increase <label>" and stay focusable (`aria-disabled`) at a bound.
  Results are rounded to the step's decimals and clamped; an off-grid value moves by one step.
- **ListPicker** values are strings (`T extends string`); a listbox with roving focus, arrows
  only move focus, Enter / Space / tap choose and close; picking the chosen one again closes
  without `onChange`.
- **Segmented** wraps with the arrow keys; no RTL flip of Left/Right yet (follow-up for L3).
- **Catalogue (shared file)**: four keys added to `src/i18n/en/common.ts` (see Files).

## Status

Done (2026-10-26). Field, Stepper, Segmented, Switch, ListPicker, Wheel and DateTimeField with
tests. Lines outside the slice's own files: `src/i18n/en/common.ts` (four keys). Follow-ups: RTL
arrow direction in Segmented; R05.10 rounding in the P07 weight dialog.
