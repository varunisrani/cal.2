# Task: primitives: buttons, cards, sheets, dialogs, toasts (P04-01) · Phase: 04 · Owner: builder (wt-p04s1, slice S1)

Read (reference @ `10e14b67`): `A/ui/components/FudGlass.kt` (the surface, the dialog, its action
row and the two button styles; structure only, the look is restyled per `16` §2.5). Research spec
`05-home-progress.md` §3.1.4 (layout language: cards, dialogs, sheets) and §5 (web mapping);
`02-food-logging.md` §3 (review and manual sheets that cannot be swiped away);
`00-layout-and-conventions.md` §2 (data-ui hooks, accessible names, logical properties, tokens
only); `04-architecture.md` §2 (primitives in `src/ui`). No reference tests exist for these
components.

What it does (own words): the building blocks every later screen draws with. A `Button` comes in
four looks (primary, secondary, quiet, danger) and can be busy: while busy it shows a small
spinner, says so to assistive tech and swallows further presses, so a double tap on Save cannot
log twice. When its click handler returns a promise, the button is busy until it settles, and a
second press that lands before React re-renders is still dropped. `IconButton` is the same with
only an icon, and its label is required so it always has a name. `Card` is the rounded surface for
sections. `Sheet` is the bottom sheet: it rises from the bottom over a scrim, has a title row with
a trailing Done, keeps keyboard focus inside itself, closes on Escape, a downward drag of its
header or a tap on the scrim, and gives focus back to whatever opened it. A sheet that must not
close by accident (`dismissable={false}`, used by review and manual entry) ignores Escape, the drag
and the scrim; only its own buttons close it. `Dialog` is a centred confirmation: title, message,
a secondary (Cancel) and a primary action; the primary can be destructive (danger colour); Escape
and the scrim mean Cancel; the primary fires at most once per opening. `Toast` shows a short
message in a polite live region and removes it after a few seconds.

Inputs → outputs:
- `Button({ variant, busy, block, onClick, data-ui, … })` → a `<button>`; `onClick` may return a
  promise. `IconButton({ label, icon, data-ui, … })` → a `<button aria-label=label>`.
- `Card({ as, heading, children })` → a surface; with a heading it is a region named by it.
- `Sheet({ open, title, onClose, dismissable, leading, trailing, initialFocus, data-ui })` → a
  portal into `<body>` holding a scrim and a `role="dialog"` panel (`aria-modal`, named by the
  title). `onClose` is called for Done, Escape, the scrim and the drag (the last three only when
  dismissable).
- `Dialog({ open, title, message, confirmLabel, cancelLabel, destructive, confirmDisabled,
  onConfirm, onCancel, data-ui })` → a portal with a `role="alertdialog"` card; `cancelLabel={null}`
  shows the primary action alone (Escape and the scrim still cancel).
- `ToastProvider` + `useToast()` → `show(message, { duration })` returns an id, `dismiss(id)`.
  The provider renders one live region (`role="status"`, `aria-live="polite"`) in a portal.

Files: created `src/ui/Button.tsx`, `src/ui/Card.tsx`, `src/ui/Sheet.tsx`, `src/ui/Dialog.tsx`,
`src/ui/Toast.tsx`, their `.test.tsx`, `src/ui/primitives.module.css`, and two files the phase
table does not list: `src/ui/modalLayer.ts` (the focus trap, Escape routing, inert background,
scroll lock and focus return shared by Sheet and Dialog, so the two modal primitives do not each
carry a copy; tested through `Sheet.test.tsx` and `Dialog.test.tsx`) and `src/ui/classes.ts`
(`cx`, a one-line class-name joiner every primitive uses). No catalogue change for this task: Done
and Cancel were already in `common`.

Edge cases / failure modes:
- Two clicks in the same frame on a busy-by-promise button: the second lands before React has
  re-rendered `aria-busy`, so a ref, not state, must gate it.
- A busy submit button inside a form must also stop the form from submitting again
  (`preventDefault` on the ignored click).
- A dialog opened from a sheet: both are open, only the top one may take Escape and Tab, and the
  sheet must sit inert below the dialog. Closing the dialog hands the keys back to the sheet.
- Focus return when the opener has been removed from the page meanwhile: skip it rather than throw.
- Tab with nothing focusable in the sheet: focus stays on the panel. Shift+Tab from the panel
  itself, or from the first control, wraps to the last.
- The toast region must not sit inside an inert subtree, or a toast raised while a sheet is open
  would never be announced: it lives in its own portal that the modal layer leaves alone.
- A spinner animation must not run at 1 ms under reduced motion (the motion tokens shrink to 1 ms):
  under `prefers-reduced-motion` the spinner stands still.
- A drag that starts on a button in the sheet header (Done) is not a drag: pointer capture would
  steal that button's click.
- Body scroll behind an open sheet: locked while any modal layer is open, restored after the last.
- React StrictMode runs effects twice in development: the layer stack and the inert marks must
  survive mount, unmount, mount.

Our design differences / decisions:
- Names are ours (`Button`, `IconButton`, `Card`, `Sheet`, `Dialog`, `ToastProvider`, `useToast`,
  `modalLayer`). The look is ours: solid token colours, no glass sheen or gradient border (D-16.1),
  radii from the tokens (`--radius-card` 18 for cards, `--radius-sheet` 24 for sheet tops and
  dialogs), our shadows. The dialog's primary action is a filled button (danger fill when
  destructive) next to a quiet Cancel, where the reference uses two text buttons.
- Every interactive element takes a required `data-ui` prop (typed, so a missing hook does not
  compile); derived hooks for built-in parts: `<ui>.done`, `<ui>.confirm`, `<ui>.cancel`.
- No native `<dialog>`: jsdom has no `showModal`, and a browser's close watcher may close a modal
  dialog on a second Escape even when we cancel the event, which would break `dismissable={false}`.
  We draw our own `role="dialog"` with `aria-modal`, make the rest of `<body>` inert, and trap Tab.
- The sheet's Done stays available on a non-dismissable sheet (an explicit button, not a gesture);
  callers can replace it with their own trailing action (`trailing`) and add a leading one.
- Dialog: role `alertdialog`, described by its message. Initial focus goes to Cancel when the
  action is destructive, to the primary action otherwise. One action per opening: after the primary
  fires, neither action fires again until the dialog is opened anew.
- Toast: one at a time (a new message replaces the current one and restarts the timer), default
  4 s, shown near the top edge so it never covers the tab bar or the "+" button. No action button
  in v1 (no flow needs undo: deletes are confirmed first).
- Sheets and dialogs mount on open and unmount on close (an entry animation only, from the motion
  tokens); there is no exit animation, so a closed sheet never lingers in the accessibility tree.

Tests we will write:
- `Button.test.tsx`: each variant is a button found by its name; a busy button ignores clicks and
  says it is busy; a button whose handler returns a promise ignores a second click until the
  promise settles and then accepts one; a busy submit button does not submit its form; a disabled
  button does not fire; `IconButton` is named by its label and hides its icon.
- `Card.test.tsx`: a card with a heading is a region named by it; without one it is a plain
  container holding its children.
- `Sheet.test.tsx`: an open sheet is a dialog named by its title with a Done button that closes it;
  Tab and Shift+Tab stay inside (wrap at both ends); Escape closes and focus returns to the opener;
  a non-dismissable sheet ignores Escape, the scrim and the drag but Done still closes it; a drag
  past the threshold closes a dismissable sheet, a short one does not; a dialog opened above a
  sheet takes Escape first; the background is inert while open and not after.
- `Dialog.test.tsx`: an alertdialog named by its title and described by its message; Escape and
  the scrim cancel; the destructive action fires once on a double click; Cancel has focus when
  destructive; confirm fires once even when the handler returns a promise.
- `Toast.test.tsx` (fake timers): a toast appears in a polite status region and is gone after its
  timeout; a new toast replaces the current one and restarts the timer; `dismiss` removes it;
  `useToast` outside the provider throws.

Compare checklist (filled after the rewrite; reopened `A/ui/components/FudGlass.kt`):
- [x] Dialog: title, message, a secondary and a primary action in a row at the end, destructive
      colour (`src/ui/Dialog.test.tsx > Dialog > is a modal alertdialog named by its title and
      described by its message`, `> fires the destructive action once on a double click`)
- [x] Dialog dismiss request (outside tap, back/Escape) = cancel (`> cancels on Escape and gives
      focus back to the opener`, `> cancels on a tap on the scrim`)
- [x] Primary action can be switched off (`> keeps the action off while confirmDisabled`)
- [x] The secondary action is optional: gap found on compare, closed with `cancelLabel={null}`
      (`> can show its action alone, still dismissed by Escape`)
- [x] Filled primary button and a text button, faded when disabled (`src/ui/Button.test.tsx >
      Button > draws every look as a button found by its name, with its data-ui hook`, `> does not
      fire while disabled`)
- [x] Surface: a rounded card holding a section (`src/ui/Card.test.tsx > Card > is a region named
      by its heading when it has one`, `> is a plain container without a heading`)
- [x] Row Verify cases: busy Button ignores a second click (`src/ui/Button.test.tsx > Button >
      ignores clicks while busy and tells assistive tech, keeping its name`, `> ignores a second
      click while the first one is in flight, then takes the next`); Sheet traps Tab and restores
      focus (`src/ui/Sheet.test.tsx > Sheet > keeps Tab inside the sheet, wrapping at both ends`,
      `> closes on Escape and gives focus back to the opener`); non-dismissable Sheet ignores
      Escape (`> ignores Escape, the scrim and a pull when not dismissable, but Done still closes
      it`); Dialog destructive action fires once (`src/ui/Dialog.test.tsx > Dialog > fires the
      destructive action once on a double click`); Toast disappears after its timeout with fake
      timers (`src/ui/Toast.test.tsx > Toast > shows a message in a polite live region and removes
      it after its timeout`); every control found by role and name (all twelve test files).
- [x] Stacked layers: a dialog above a sheet takes Escape first (`src/ui/Sheet.test.tsx > Sheet >
      lets a dialog opened above it take Escape first, then takes it back`); the page behind is
      inert (`> makes the page behind it inert while open, and lets it go after`); the toast region
      is not (`src/ui/Toast.test.tsx > Toast > stays announced while a sheet makes the rest of the
      page inert`).
- Deliberate differences: no glass sheen, gradient border or translucent fill (D-16.1: solid token
  colours); our radii (18 cards, 24 sheet tops and dialogs, 12 controls) and shadows; the dialog's
  primary action is a filled button (danger fill when destructive) beside a quiet Cancel, not two
  text buttons; first focus on Cancel for destructive dialogs; one answer per opening; sheets
  close by a downward pull of the header (the reference's sheets use the platform sheet); toasts
  near the top edge.
- Not taken: the icon bubble (icons are P04-03); the glass text field (the input primitive is
  `Field`, P04-02); a multi-line text field (no P04 screen needs one; Coach and the custom
  instructions page add a textarea when they come); a dialog of free content without actions
  (callers use `Sheet`).

## Decisions for the lead

- `data-ui` is a required prop on every interactive primitive (`Button`, `IconButton`, `Sheet`,
  `Dialog`, and all of P04-02), so a missing hook does not compile (two `@ts-expect-error` tests
  lock it). Built-in parts get derived hooks: `<ui>.done`, `<ui>.scrim`, `<ui>.handle`,
  `<ui>.cancel`, `<ui>.confirm`; toasts use `toast.region` / `toast.message`.
- Two extra files: `src/ui/modalLayer.ts` and `src/ui/classes.ts` (see Files).
- Toast API: `ToastProvider` (renders the one live region in a body portal) and `useToast()` →
  `{ show(message, { duration }), dismiss(id) }`; default 4 s; one toast at a time. **P04-07 must
  mount `<ToastProvider>` around the app** (in `App.tsx`), or `useToast` throws.
- Sheet and Dialog mount on open and unmount on close (entry animation only). The router's sheet
  stack (P04-04) drives `open` / `onClose`; nothing in the primitives touches history.
- While a sheet or dialog is open, every other child of `<body>` gets `inert` (except elements
  marked `data-layer-keep`) and `<html>` gets `overflow: hidden`. Anything else portalled into the
  body that must stay live while a sheet is open (none yet) needs `data-layer-keep`.
- The busy spinner stands still under reduced motion (an endless animation at the 1 ms token
  would flicker); every other animation uses the motion tokens.
- Follow-up: `src/test/setup.ts` does not call Testing Library's `cleanup` (no Vitest globals), so
  each test file here calls `afterEach(cleanup)`; drop those once the shared setup does it.

## Status

Done (2026-10-26). Button, IconButton, Card, Sheet, Dialog, ToastProvider/useToast with tests;
nothing outside `src/ui` and this note for this task. Handed on: mounting `ToastProvider` (P04-07),
using `Sheet`'s `dismissable={false}` for review and manual entry (P04-11, P06).
