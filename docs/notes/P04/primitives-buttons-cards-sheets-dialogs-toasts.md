# Task: primitives: buttons, cards, sheets, dialogs, toasts (P04-01) · Phase: 04 · Owner: builder (wt-p04s1, slice S1)

Read (reference @ `10e14b67`): `A/ui/components/FudGlass.kt` [339] (the surface and the dialog,
for structure only: which blocks a dialog has, how its action row is ordered, how a surface wraps
its content; none of its colours, sheens or borders). Research spec `05-home-progress.md` §3.1.4
(layout language: dialogs, sheets), `16-what-we-change.md` §2.5 (our own surface), the
accessibility row of `phases/00-layout-and-conventions.md`. The phase row lists no reference test.

What it does (own words): the building blocks every later screen is made of. `Button` is the
one push button of the app in four looks (primary filled with the accent, secondary outlined,
quiet text-only, danger for destructive acts); while busy it keeps its place and focus, shows a
small spinner, says `aria-busy`, and swallows further presses, so a double tap on Save cannot
log twice. A press handler that returns a promise makes the button busy by itself until the
promise settles. `IconButton` is a button with only a drawing in it, so its label is required
and becomes its accessible name. `Card` is the rounded surface sections sit on, optionally
titled (then it is a named region). `Sheet` is the bottom sheet: a title row with Done at its
trailing end, content that scrolls, focus moved into it on open, Tab kept inside, Escape and a
tap on the dim backdrop and a downward drag on the title row close it, and focus goes back to
what opened it. A sheet that must not be lost by accident (`dismissable={false}`, e.g. review)
ignores Escape, the backdrop and the drag; only its own buttons close it. `Dialog` asks one
question: a title, a message, a secondary action (Cancel) and a primary one, which can be
destructive; it answers once, Escape cancels. `Toast` is a short message at the bottom that
leaves by itself after a few seconds, read out politely by screen readers.

Inputs → outputs:
- `Button({ variant, busy, onClick, data-ui, … })` → `<button>`; `IconButton({ label, icon, … })`.
- `Card({ as, heading, data-ui, children })` → a section surface.
- `Sheet({ open, title, onClose, dismissable, hideDone, initialFocusRef, footer, data-ui })` → a
  modal dialog portalled into `<body>`; `onClose` on Done / Escape / backdrop / drag.
- `Dialog({ open, title, message, confirmLabel, cancelLabel, confirmDisabled, destructive,
  onConfirm, onCancel, data-ui })` → an `alertdialog` portalled into `<body>`; `cancelLabel={null}`
  leaves the secondary action out (Escape and the backdrop still cancel).
- `ToastProvider` + `useToast().show({ message, durationMs })`; `Toast({ message, onDismiss,
  durationMs })` for a single controlled toast. Both keep one polite live region mounted.

Files: created `src/ui/Button.tsx`, `src/ui/Card.tsx`, `src/ui/Sheet.tsx`, `src/ui/Dialog.tsx`,
`src/ui/Toast.tsx`, `src/ui/modal.ts` (focus trap, focus return and Escape for Sheet and Dialog),
`src/ui/primitives.ts` (`cx`, `partHook`, `isThenable`, `clamp`, shared with P04-02), their
`*.test.tsx`, `src/ui/primitives.module.css`, `src/ui/stylesheets.test.ts` (a source guard on both
primitive stylesheets, shared with P04-02). No catalogue change for this task: Done, Cancel and
Close were already in `common`.

Edge cases / failure modes:
- Two presses in the same tick, before React re-renders: a ref, not state, holds "in flight".
- A rejected press handler: the busy state ends and the button works again; the handler
  reports its own error (the button does not rethrow it, which would only be unhandled).
- Busy buttons stay focusable (`aria-disabled`, not `disabled`) so focus is not dropped to the
  page mid-save.
- Sheets inside sheets (a picker opened from a form sheet): Escape closes the top one only; the
  React tree bubbles events through portals, so a handled key stops there.
- The opener is gone when the sheet closes: focus is restored only to an element still in the
  document.
- A sheet with nothing focusable in its body: the panel itself takes focus (it is the named
  dialog), Tab stays on Done.
- Dialog confirm double-tapped while the caller's async delete runs: one call.
- StrictMode mounts effects twice: the focus memory survives the remount.
- Toasts arriving back to back: the newest replaces the current one and restarts the timer.
- Reduced motion: the slide-in, the spinner and the drag spring-back stop animating (the
  tokens' durations are 0 ms; the spinner is hidden by our own media query).

Our design differences / decisions:
- Our look (16 §2.5): solid token colours only, no translucency, sheen, gradient borders or
  glass; radii, spacing and shadows from `tokens.css`. The primary button is a solid accent fill;
  destructive actions use `--danger`.
- Dialog actions are buttons in our Button looks (quiet secondary, primary or danger), at the
  end of the row; the reference draws both as tinted text buttons.
- Dialog answers once per opening; a tap on the backdrop counts as Cancel (like Escape).
- `dismissable={false}` blocks Escape too (phase row Verify), not just swipe and backdrop. Done
  stays unless `hideDone` (a form sheet with its own Save / Cancel hides it).
- No native `<dialog>`: jsdom has no `showModal`, and our own trap behaves the same in tests and
  browsers.
- Toast: one at a time, newest wins, default 4 s, no action button yet.
- Hooks: the root of a composite gets the caller's `data-ui`; its parts get `<hook>.<part>`
  (`.done`, `.backdrop`, `.confirm`, `.cancel`).

Tests we will write:
- Button: busy prop ignores presses and is `aria-busy`; an async handler makes a second click a
  no-op until it settles, then presses work again; IconButton is found by its label; variants
  keep role and name.
- Card: a heading makes it a named region; without one it is not a region.
- Sheet: open moves focus in; Tab and Shift+Tab wrap inside; closing returns focus to the
  opener; Escape and backdrop and Done call `onClose`; a non-dismissable sheet ignores Escape,
  the backdrop and a drag; a nested sheet's Escape closes only itself; drag past the threshold
  closes, a short drag does not.
- Dialog: named alertdialog with its message; destructive confirm fires once on a double click;
  Escape calls cancel; an async confirm shows busy and ignores repeats.
- Toast: polite status region present before any message; message shown, gone after its
  timeout with fake timers; a newer toast replaces the old one and restarts the timer.

Compare checklist (filled after the rewrite; reopened `A/ui/components/FudGlass.kt`):
- [x] Surface: rounded, padded, elevated container (tested in `src/ui/Card.test.tsx > Card > is a
      region named by its heading when it has one`, `> is a plain surface without a heading`,
      `> can be drawn as a list item`)
- [x] Dialog blocks: title, muted message, an action row ending in the primary action
      (tested in `src/ui/Dialog.test.tsx > Dialog > shows a named alert dialog with its message
      and both actions`)
- [x] Dialog dismiss request (back / outside tap) cancels (tested in `src/ui/Dialog.test.tsx >
      Dialog > cancels on Escape and gives focus back to the opener`, `> cancels on Cancel and on
      a tap on the backdrop`)
- [x] Destructive primary in the danger colour, fires once (tested in `src/ui/Dialog.test.tsx >
      Dialog > fires its destructive action once on a double click`, `> answers once: Cancel and
      Escape do nothing after the action`)
- [x] Gap closed: the action row may have no secondary action (tested in
      `src/ui/Dialog.test.tsx > Dialog > can leave the secondary action out; Escape still cancels`)
- [x] Gap closed: the primary action can be held back (tested in `src/ui/Dialog.test.tsx >
      Dialog > holds the primary action back while confirmDisabled is set`)
- [x] Primary / text buttons with an enabled flag (tested in `src/ui/Button.test.tsx > Button >
      ignores presses while aria-disabled but keeps focus`, `> runs a plain handler on every
      press`); busy blocks repeats (`> ignores presses while busy and says so`, `> ignores a second
      click while its async handler runs, then works again`, `> ignores two clicks dispatched in the
      same tick before any re-render`, `> comes back after its async handler fails`)
- [x] Icon-only control named for screen readers (tested in `src/ui/Button.test.tsx > IconButton
      > is named by its label and hides its drawing from screen readers`)
- [x] Sheet (05 §3.1.4: title row with a trailing Done; Material bottom sheet behaviour: drag
      down and outside tap dismiss) (tested in `src/ui/Sheet.test.tsx > Sheet > opens as a named
      modal dialog with Done, and takes focus`, `> closes on Done and gives focus back to the
      opener`, `> closes on Escape and gives focus back to the opener`, `> closes on a tap on the
      backdrop`, `> closes when the title row is dragged down past the threshold`, `> springs back
      after a short drag`)
- [x] Focus trap and return (tested in `src/ui/Sheet.test.tsx > Sheet > traps Tab and Shift+Tab
      inside the sheet`, `> closes only the top sheet on Escape when one is opened from another`,
      `> focuses the element the caller names on open`; `src/ui/Dialog.test.tsx > Dialog > keeps
      Tab inside the dialog`)
- [x] Non-dismissable sheet (tested in `src/ui/Sheet.test.tsx > Sheet > when not dismissable >
      ignores Escape, the backdrop and a drag`, `> still closes through Done, and can leave Done
      out`)
- [x] Toast: polite region, auto-dismiss under fake timers (tested in `src/ui/Toast.test.tsx >
      Toast > keeps an empty polite live region on the page before any toast`, `> shows a message
      in the live region and takes it away after its timeout`, `> uses the duration it is given`,
      `> replaces the toast on show with a newer one and restarts the timer`, `> can be taken away
      at once`, `> calls onDismiss once the time is up when used on its own`, `> needs a provider
      for useToast`)
- [x] Our look, tokens only, reduced motion (tested in `src/ui/stylesheets.test.ts >
      src/ui/primitives.module.css > takes every colour from the tokens`, `> draws no gradients,
      blur or glass`, `> reads only custom properties that exist`, `> turns its motion off under
      reduced motion`)
- [x] By hand in Chromium (Pixel 7 size, dark and light, a throwaway harness page since deleted):
      the dialog sits 24 px in from the edges, the sheet slides up with Done in the accent, a
      drag on the title row closes it, the toast shows above the sheet layer; with reduced motion
      emulated the spinner and the slide-in have no animation. No console errors.
- Deliberate differences: solid surfaces and our own radii, spacing and shadows from the tokens
  instead of the translucent sheen, gradient border and gradient primary fill; dialog actions are
  our Button looks (quiet secondary, filled primary or danger) rather than two tinted text
  buttons; Escape also counts as a dismiss request (web); `dismissable={false}` blocks Escape too.
- Not taken: the glass text field (multi-line, placeholder styling) belongs to P04-02's `Field`
  (single line; see that note); the icon bubble (P04-03 icons).

## Decisions for the lead

- **`data-ui` on composites.** The caller's hook goes on the root; parts get `<hook>.<part>`
  (`partHook()` in `src/ui/primitives.ts`): Sheet `.done`, `.backdrop`; Dialog `.confirm`,
  `.cancel`, `.backdrop`. `data-ui` is a required prop on every interactive primitive (typed).
- **Busy buttons stay focusable**: busy and `aria-disabled` buttons ignore presses but keep
  focus (no `disabled`), so focus is never dropped mid-save. A press handler that returns a
  promise makes the button busy by itself; the handler reports its own errors (the button only
  recovers).
- **Dialog answers once per opening**; a rejected async confirm re-arms it. A backdrop tap is
  Cancel, like Escape. Focus starts on the secondary action (the primary when there is none).
- **Sheet**: `dismissable={false}` blocks Escape, the backdrop and the drag (the phase row's
  Verify asks for Escape); Done stays unless `hideDone`, so a form sheet with its own Save /
  Cancel (P04-11) passes `dismissable={false} hideDone`. Focus starts on the sheet itself (its
  title is read) unless `initialFocusRef`. Drag-to-close threshold 96 px (`SHEET_DRAG_CLOSE_PX`).
  No native `<dialog>` (jsdom has no `showModal`); our trap lives in `src/ui/modal.ts`. Body
  scroll is not locked (the backdrop covers the page; `overscroll-behavior: contain` on the
  sheet body).
- **Toast**: `ToastProvider` + `useToast().show(message, { durationMs })`, one toast at a time,
  newest wins, 4 s default (`TOAST_DEFAULT_MS`). The shell (P04-07 `App.tsx`) should mount
  `ToastProvider` once around the app. No action button yet.
- **Extra files** beyond the phase table: `src/ui/modal.ts`, `src/ui/primitives.ts`,
  `src/ui/stylesheets.test.ts`.

## Status

Done (2026-10-26). Button, IconButton, Card, Sheet, Dialog and Toast with tests; no lines changed
outside this slice's files for this task. Handed on: P04-07 mounts `ToastProvider`; P04-11 and
P04-12 use Sheet and Dialog.
