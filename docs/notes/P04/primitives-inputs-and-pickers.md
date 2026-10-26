# Task: primitives: inputs and pickers (P04-02) · Phase: 04 · Owner: builder (wt-p04s1, slice S1)

Read (reference @ `10e14b67`): `A/ui/components/WheelPicker.kt` (the single wheel, the split
whole + tenths wheel, the numeric and feet/inches wheels: behaviour only), `UnitToggle.kt` (the
two-option segmented control), `OptionPickerSheet.kt` (the option list sheet with a check mark).
Research spec `05-home-progress.md` §3.1.4 (segmented controls, wheel pickers become scroll-snap
wheels or native inputs) and §5 (dates and times become native inputs with `max` where the
reference forbids the future), §3.5.3 (Log Weight: two wheels, whole + tenths, a date that cannot
be in the future, a picked future day held to today), trap R05.10(c) (tenths by rounding, not
truncation: already in `src/domain/units/body.ts`); `02-food-logging.md` §3 (review date and
time); `16-what-we-change.md` D-16.12 (macros step by 5), D-16.37 (weight ranges). No reference
tests exist for these components.

What it does (own words): the controls every form and picker screen is built from.
- `Field`: a labelled text input with an optional hint, an optional unit after the value and an
  error line; hint, unit and error are tied to the input for assistive tech and the error marks it
  invalid. The caller picks `inputMode` (decimal, numeric, text) so phones show the right keypad.
- `Stepper`: a number with − and + buttons. It holds the value between `min` and `max`, moves by
  `step` and lands on the step grid (12 with a step of 5 goes up to 15, down to 10). The value
  itself is a `spinbutton`: arrow keys step, Page keys take ten steps, Home and End jump to the
  ends. The buttons switch off at the ends.
- `Segmented`: a short row of mutually exclusive choices (kg | lb, 1W … All) as a radiogroup with
  one tab stop; arrow keys move and select, Home and End jump to the ends.
- `Switch`: a whole row (label, optional description, the track) that is one `role="switch"`
  button, so the large target toggles it.
- `ListPicker`: a sheet that lists options (label and optional description) with a check mark on
  the current one; choosing one reports it and closes the sheet. It is a listbox: the arrow keys
  move between options and Enter or Space chooses. A footer slot takes extras such as a free-form
  value field.
- `Wheel`: one column of values from a list, drawn as a scroll-snap strip with the current row in
  a band at the centre, opening on the value it is given. Scrolling or tapping a row picks a
  value; the keyboard moves one row with the arrows and a page of rows with Page Up / Page Down,
  Home and End go to the ends. A native `<select>` holding the same options sits under the strip
  for assistive tech: it is the one focusable control, it mirrors the wheel and choosing in it
  moves the wheel. Several wheels side by side form one picker (whole + tenths for weight, from
  `weightWheel` in `src/domain/units/body.ts`).
- `DateTimeField`: native date and/or time inputs (`kind` = date, time or datetime). With `max`
  the browser's own picker greys out later days, and a later value that is typed anyway is held
  to `max` (the future is forbidden, as the reference clamps a picked future day to today).
  `min` is passed to the native picker and applied when the input loses focus, so typing a year
  digit by digit is not fought on the way.

Inputs → outputs:
- `Field({ label, value, onChange(text), hint, error, unit, inputMode, data-ui, ref, … })`.
- `Stepper({ label, value, onChange(n), min, max, step, format, data-ui })`.
- `Segmented({ label, options: { value, label }[], value, onChange(value), data-ui })`.
- `Switch({ label, description, checked, onChange(checked), disabled, data-ui })`.
- `ListPicker({ open, title, options: { value, label, description }[], value, onSelect(value),
  onClose, data-ui, children })`.
- `Wheel({ label, options: { value, label }[], value, onChange(value), rows, data-ui })`.
- `DateTimeField({ kind: 'date' | 'time', label, value, onChange, min, max, data-ui })` or
  `({ kind: 'datetime', label, value: { date, time }, onChange, min, max, data-ui })`; dates are
  `YYYY-MM-DD` (a day key), times `HH:MM`, compared as text (both are zero-padded).

Files: created `src/ui/Field.tsx`, `src/ui/Stepper.tsx`, `src/ui/Segmented.tsx`,
`src/ui/Switch.tsx`, `src/ui/ListPicker.tsx`, `src/ui/Wheel.tsx`, `src/ui/DateTimeField.tsx`, their
`.test.tsx`, `src/ui/inputs.module.css`; changed `src/i18n/en/common.ts` (new built-in words: the
stepper buttons' names and the Date / Time input names; shared).

Edge cases / failure modes:
- Stepper with a fractional step (0.1): sums like 0.1 + 0.2 must not show 0.30000000000000004;
  values are rounded to the step's decimals. A value off the grid steps to the next grid point.
  A value outside `min…max` from the caller is shown as given and the first step brings it inside.
- Wheel value not in the list: the list is the truth, so the wheel opens on the first row and
  reports nothing until the person moves it (callers clamp first, as `weightWheel` does).
- Wheel scroll events fire while a programmatic scroll is still moving: only a settled position
  picks a value, and a position reached on the way to a keyboard target is ignored.
- jsdom has no layout (row height 0) and no `scrollTo`: the wheel must not divide by zero and
  falls back to setting `scrollTop`.
- A focusable scroller inside an `aria-hidden` strip would be a hidden focus target: the strip
  gets `tabIndex={-1}` so only the select takes focus; the band shows focus while the select has it.
- Native select keys: we take ArrowUp/Down, Page and Home/End ourselves (preventing the native
  popup on some platforms) so the keys behave the same everywhere; Space, Enter and Alt+Down still
  open the native list.
- Date input cleared to empty (the browser reports `''`): ignored, the last value stays.
- Time with a date-and-time max: the time limit applies only on the max day; moving the date to
  the max day with a later time brings the time back to the max time.
- Segmented in a right-to-left page: ArrowLeft means "next" there.

Our design differences / decisions:
- Names are ours (no `WheelPicker`, `UnitToggle`, `OptionPickerSheet`). The look is ours: a solid
  muted track for the segmented control with a raised chip of `--raised`; a wheel band in
  `--accent-soft` with `--radius-control`; the list picker's rows are plain rows with a drawn CSS
  check mark in the accent (no icon asset), not glass cards.
- One `Wheel` primitive takes any list of `{ value, label }`; whole + tenths, feet + inches and
  stepped numeric wheels are compositions callers build from domain helpers (no special wheel
  types in `src/ui`). A date wheel is not built: dates use the native date input (§5).
- Wheel rows: 5 visible, each 44 px (a comfortable touch row), scroll-snap to the centre.
- Stepper: the value is the focus target (`spinbutton`); the − and + buttons are out of the tab
  order (keyboard users have the arrows) but stay reachable by touch and screen-reader swipe.
  Their names come from the catalogue ("Decrease {name}" / "Increase {name}").
- ListPicker closes after a choice (the reference left closing to each caller).
- DateTimeField clamps a too-late value to `max` on change and a too-early one to `min` on blur.

Tests we will write:
- `Field.test.tsx`: the input is found by its label; hint and unit describe it; an error marks it
  invalid and describes it; typing reports text; `inputMode` reaches the input.
- `Stepper.test.tsx`: + and − step by 5 and stop at min and max (buttons disabled at the ends);
  an off-grid value steps to the grid; arrow, Page, Home and End keys on the spinbutton; a 0.1
  step adds without float noise; the spinbutton reports value, bounds and text.
- `Segmented.test.tsx`: a radiogroup named by its label with one checked radio; clicking selects;
  arrow keys move focus and selection and wrap; Home/End; only the checked radio is tabbable.
- `Switch.test.tsx`: a switch named by its label and described by its description; click and Space
  toggle; disabled does not.
- `ListPicker.test.tsx`: an open picker is a dialog named by its title with a listbox; the current
  option is selected; choosing reports the value and closes; arrow keys move between options and
  Enter chooses; Done closes without choosing.
- `Wheel.test.tsx`: whole + tenths wheels open at 70.0; ArrowDown moves the whole wheel to 71 and
  the native select mirrors it; Page keys move five rows, Home/End go to the ends and stop there;
  choosing in the select moves the wheel; tapping a row picks it.
- `DateTimeField.test.tsx`: a date input with `max` holds a typed future date to `max`; a time on
  the max day is held to the max time; moving the date to the max day pulls a later time back;
  `min` applies on blur; an empty value is ignored; the time kind alone.

Compare checklist (filled after the rewrite; reopened `WheelPicker.kt`, `UnitToggle.kt`,
`OptionPickerSheet.kt`):
- [x] Wheel opens on the given value, or on the first row when the value is not in the list
      (`src/ui/Wheel.test.tsx > Wheel > opens at 70.0 on a whole and a tenths wheel`, `> opens on
      the first row when its value is not in the list`)
- [x] Wheel reports a value only when the row it settles on differs from the current one
      (`> picks the row a scroll comes to rest on`)
- [x] Five rows on show, 44 px each, the middle row emphasised and the others faded (CSS in
      `inputs.module.css`; row marking checked in `> moves to the next value on ArrowDown, and the
      native select mirrors it`)
- [x] An empty list draws nothing: gap found on compare, closed (`> draws nothing when it has no
      values`)
- [x] Whole + tenths weight picker, tenths by rounding (R05.10c, through `weightWheel` /
      `weightFromWheel`) (`> moves to the next value on ArrowDown, and the native select mirrors
      it`: 71.3 after three tenths)
- [x] Row Verify cases: Wheel opens at 70.0, ArrowDown moves to the next value, the native select
      mirrors it (the two Wheel tests above); Stepper clamps at min/max and steps by 5
      (`src/ui/Stepper.test.tsx > Stepper > steps by 5 with − and + and stops at min and max`);
      DateTimeField with `max` rejects a future date (`src/ui/DateTimeField.test.tsx >
      DateTimeField > rejects a future date: a day after max is held to max`, `> with a date and a
      time > rejects a future date, keeping the time of day when it is not later than now`);
      Segmented is a radiogroup with arrow-key navigation (`src/ui/Segmented.test.tsx > Segmented
      > is a radiogroup named by its label with the current choice checked`, `> moves and selects
      with the arrow keys, wrapping at the ends`)
- [x] Segmented: choosing the current option again reports nothing (`src/ui/Segmented.test.tsx >
      Segmented > selects a choice on click`)
- [x] Option sheet: title, label and optional second line, check on the current option
      (`src/ui/ListPicker.test.tsx > ListPicker > opens as a sheet with a listbox, the current
      option selected and focused`); choosing reports the value (`> reports the chosen value and
      closes`)
- [x] Stepped numeric values land on the step grid (`src/ui/Stepper.test.tsx > stepFrom > takes a
      value between grid points to the next point in the direction asked`, `> counts the grid
      from min`)
- Deliberate differences: one generic `Wheel` instead of numeric, decimal, split-decimal and
  feet/inches wheel types (callers build option lists from the domain helpers); each wheel draws
  its own band (no shared band spanning several columns); no unit label inside the wheel (the
  caller lays it out); a native select carries the wheel for assistive tech and the keys; the list
  picker closes itself after a choice, has keyboard navigation, and its look is plain rows with a
  drawn check, not glass cards; the segmented control is any number of options, not two; dates
  use native inputs instead of a day/month/year wheel (05 §5).
- Not taken: the date wheel (native date input); the decimal wheel stored as tenths (weights use
  whole + tenths); the option sheet's built-in custom value field and Save (a caller puts a
  `Field` and a `Button` in the `children` slot; P03/P09 do this for a typed model id).

## Decisions for the lead

- Catalogue (shared file `src/i18n/en/common.ts`, four new keys): `common.decrease` "Decrease
  {name}", `common.increase` "Increase {name}" (the stepper buttons' names), `common.date` "Date",
  `common.time` "Time" (the inputs of `DateTimeField kind="datetime"`).
- `DateTimeField` takes plain text values (`YYYY-MM-DD`, `HH:MM`) and limits, not instants: the
  screen turns a stamp into a day key and a time with `src/domain/dates` and back. `max` is held at
  once on change; `min` on blur (typing a year digit by digit passes through early years).
- Wheel: the native `<select>` is the one focusable element and carries `data-ui`; the drawn strip
  is `aria-hidden` with `tabIndex={-1}`. Page Up / Page Down move by the visible row count (5).
  A wheel mounted inside a hidden parent places itself on its first change after it has a size,
  not on becoming visible (no ResizeObserver); fine for sheets and dialogs, which mount visible.
- Segmented values are strings (each option's hook is `<ui>.<value>`); Wheel and ListPicker take
  strings or numbers.
- ListPicker selection is a listbox with roving focus; `onSelect` is followed by `onClose`.
- Follow-up: the check mark is drawn in CSS; switch to the P04-03 check icon if the look should
  match the icon set.

## Status

Done (2026-10-26). Field, Stepper (+ `stepFrom`), Segmented, Switch, ListPicker, Wheel and
DateTimeField (+ `notAfter` / `notBefore`) with tests. Outside `src/ui`: `src/i18n/en/common.ts`
(four keys; shared). Handed on: the weight, body-fat, water-goal and fasting pickers (P05, P07)
build on `Wheel`; review and weigh-in dates (P06, P07) on `DateTimeField`.
