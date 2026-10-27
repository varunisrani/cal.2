# Task: Add menu: water and fasting entries (P07-08) · Phase: 07 · Owner: builder (wt-p07s2c, slice S2c)

Read (reference @ `10e14b67`): `A/ui/home/HomeScreen.kt` lines 226–600 (the screen's state: the
add menu's open page, the custom water and start-fast sheets, which fasts the diary lists) and the
menu parts at lines 720–895 (the + button, the drop-down's top page with the food groups, standalone
methods, the hairline, Water › and Start fast / Fasting ›; the food group, water and fasting pages;
the custom water sheet and the start-fast chooser opened after the menu closes). Research spec
`05-home-progress.md` §3.4, §3.6.3, §3.7.2, §3.7.5; traps R05.1 (store-level block; the menu only
hides), R05.2 (a running fast must stay endable). Acceptance ids reviewed by P07-08: ACC-F11-1,
ACC-F11-2, ACC-H1-1, ACC-H6-1. Already in place: `AddMenu` (P06-01), `Menu` (P04-03), the water
page `WaterMenuPage` and `CustomWaterSheet` (P07-06), `StartFastSheet` and the fasting service
(P07-07).

What it does (own words): the + menu lists the food groups and loose methods of the stored layout
as before; then a hairline; then Water › while water tracking is on, which opens the water page
(the three quick amounts, Custom amount, Back) inside the menu; then, while fasting tracking is on,
Start fast (no fast running: the menu closes and the start sheet opens over Home) or Fasting › (a
fast running: End fast, Cancel fast, Back). End fast and Cancel fast act at once through the
fasting service, without a confirmation, and close the menu. While a fast runs every food group and
method is left off the menu, so it holds only Water and Fasting; the store refuses food anyway
(R05.1). Custom amount closes the menu and Home shows the custom sheet, since the menu closes on
any press outside it.

Inputs → outputs:
- `AddMenu` gains `trackers?: {day, waterOn, fastingOn, activeFast, onCustomWater, onStartFast}`;
  without it the menu is food only (as before).
- `Menu` (shared, additive) gains an entry kind `panel`: a row with a chevron that opens a page
  its owner draws (`render({close, back})`), inside the menu, so a press on it never closes it.
- Water › → the panel draws `WaterMenuPage` (fetched on demand) with `day`, `onDone` = close,
  `onBack` = back, `onCustom` = close and `onCustomWater()`.
- Start fast → close, `onStartFast()` (Home opens `StartFastSheet` on its sheet stack).
- Fasting › End fast → `fasting.end(id)`; Cancel fast → `fasting.cancel(id)`; a refusal (ended or
  deleted elsewhere) or a failure → a toast.
- `HomePage` reads `water.on`, `fasting.on` and `useActiveFast()`, and hosts `CustomWaterSheet` and
  `StartFastSheet` (both on demand) on its sheet stack.

Files: changed `src/features/log/AddMenu.tsx` (+ test), `src/i18n/en/menu.ts` (additive),
`src/features/home/HomePage.tsx` (+ test, the sheets and the menu's props). Shared, additive:
`src/ui/Menu.tsx` (+ test), the `panel` kind.

Edge cases / failure modes:
- Water off and fasting off: the menu is as before, with no hairline at the end.
- No food methods in the layout (or a fast running) but a tracker on: the button still shows,
  with tracker rows only and no hairline above them.
- Nothing at all to offer: no button (as before).
- A fast running while fasting is off (a restore in another tab before the start-up settle): the
  Fasting page still shows, so the fast can be ended (R05.2); Start fast does not.
- End fast or Cancel fast after the fast was ended elsewhere: the service refuses (`notActive` /
  `missing`), nothing changes, a toast says so.
- A water log fails: the water page says so and stays open (its own behaviour).
- The water page's settings still loading: the page draws nothing for a moment, the menu stays.
- Keyboard: on the water page the arrow keys move between its buttons, Left or Escape go back,
  Tab closes, as on row pages.

Our design differences / decisions:
- The water page is the landed `WaterMenuPage` drawn inside the menu (a `panel` entry), not menu
  rows built here; its words, toast and failure handling are its own.
- End fast and Cancel fast close the menu; failures and refusals are said in a toast (the
  reference says nothing).
- The Fasting page shows whenever a fast runs, even with fasting switched off (R05.2's "keep a way
  to end it visible"); the reference shows it only while tracking is on.
- Icons are ours: drop for Water, hourglass for Start fast and Fasting, check for End fast, close
  for Cancel fast.

Tests we will write:
- `AddMenu.test.tsx` (extended): water off and fasting off → no hairline and no tracker rows; water
  on → Water after a hairline, opening the water page that logs a preset on the day at once and
  closes (ACC-F11-1, ACC-H1-1); Custom amount closes the menu and calls `onCustomWater`; fasting
  on, none running → Start fast, which closes and calls `onStartFast` (ACC-H6-1); a fast running →
  only Water and Fasting, no food row (ACC-F11-2); End fast ends it at once and Cancel fast deletes
  it; a refused end says so; Fasting shows with fasting off while a fast runs.
- `src/ui/Menu.test.tsx`: a panel row opens its page inside the menu, a press on it keeps the menu
  open, its `back` and `close` work, the arrow keys move between its buttons, Escape goes back.
- `HomePage.test.tsx`: Start fast from the menu opens the start sheet and the running fast appears
  in the diary; Custom amount opens the custom sheet over Home and the log appears as a row.

Compare checklist (filled after the rewrite; reopened `A/ui/home/HomeScreen.kt` 218–222 (the
menu's pages), 720–860 (the + button, the top page, the food group, water and fasting pages) and
870–895 (the custom water sheet and the start chooser opened after the menu closes)):
- [x] food first; a hairline only when food came before; Water while water is tracked; Start fast
      while fasting is tracked and none runs (`AddMenu.test.tsx > AddMenu: water and fasting
      (P07-08) > adds no hairline and no tracker row while water and fasting are off`, `> offers
      Water, then Start fast, under a hairline while each is tracked (ACC-H1-1, ACC-H6-1)`, `> shows
      the tracker rows alone, without a hairline, when the layout offers no food`)
- [x] while a fast runs no food at all; Fasting › End fast, Cancel fast, Back (`AddMenu.test.tsx >
      AddMenu: water and fasting (P07-08) > shows only Water and Fasting while a fast runs: no food
      group or method (ACC-F11-2)`; `HomePage.test.tsx > HomePage: water and fasts (P07-05, P07-08)
      > starts a fast from the + menu; while it runs the menu holds only Fasting, which ends it
      (ACC-H6-1, ACC-F11-2)`)
- [x] End fast and Cancel fast act at once, no confirmation, and close the menu (`AddMenu.test.tsx >
      AddMenu: water and fasting (P07-08) > ends the running fast at once from Fasting, End fast`,
      `> cancels the running fast at once from Fasting, Cancel fast: it leaves no history`)
- [x] Water page: presets log at once on the day shown and close the menu; Custom amount closes the
      menu and the sheet opens over Home; Back (`AddMenu.test.tsx > AddMenu: water and fasting
      (P07-08) > opens the water page inside the menu, where a preset logs on the day shown at once
      (ACC-F11-1, ACC-H1-1)`, `> closes on Custom amount and hands it to Home; Back on the page
      returns to the top`; `HomePage.test.tsx > HomePage: water and fasts (P07-05, P07-08) > logs a
      custom amount from the + menu's water page on the sheet over Home (ACC-H1-1)`)
- [x] Start fast closes the menu and the start sheet opens (`AddMenu.test.tsx > AddMenu: water and
      fasting (P07-08) > offers Water, then Start fast, under a hairline while each is tracked
      (ACC-H1-1, ACC-H6-1)`; `HomePage.test.tsx > … > starts a fast from the + menu; while it runs
      the menu holds only Fasting, which ends it (ACC-H6-1, ACC-F11-2)`)
- [x] a page drawn by its owner sits inside the menu (`src/ui/Menu.test.tsx > Menu: a panel drawn by
      its owner > opens the panel inside the menu from a row with a chevron; a press on it keeps
      the menu open`, `> goes back to the opening page with the panel's back, and closes with its
      close`, `> moves over the panel's buttons with the arrow keys, and goes back with Escape or
      Left`, `> closes from a panel on a press outside`)
- Deliberate differences: the Fasting page shows whenever a fast runs, even with fasting switched
  off (`AddMenu.test.tsx > AddMenu: water and fasting (P07-08) > keeps Fasting while a fast runs
  with fasting switched off, and never offers Start fast then (R05.2)`); a refused or failed End /
  Cancel is said in a toast (`> says so and changes nothing when the fast had already ended
  elsewhere`, `> says so when the fast cannot be changed`); our icons; the water page is P07-06's
  own (a toast instead of a haptic).
- Not taken: the voice button beside + (later phase); the home-screen fasting shortcut and its
  "tracking off" dialog (later phase); hairlines between the food groups themselves (P06-01's menu
  draws none; unchanged here).

## Decisions for the lead

- **`src/ui/Menu.tsx` gains a `panel` entry kind** (shared, additive): a row with a chevron that
  opens a page its owner draws inside the menu, with `close` and `back`. Needed because the + menu
  closes on any press outside it and `WaterMenuPage` is a component of its own. On a panel the
  arrow keys, Home and End move over the panel's buttons; Left / Escape go back; Tab closes.
- **`AddMenu` now needs a `ToastProvider` above it** (End / Cancel failures). Home has one; the
  AddMenu tests now render inside one.
- **AddMenu acts on the fast itself** through `useOptionalServices().fasting` (`end`, `cancel`); Home
  only says which fast runs. The water page is fetched on first open (`onDemand`).
- **Fasting page while tracking is off**: shown whenever a fast runs (R05.2's "keep a way to end it
  visible"); the start-up settle normally ends such a fast first. Start fast needs tracking on.
- data-ui hooks for P07-17: `home.add.water`, `home.add.startFast`, `home.add.fasting`,
  `home.add.endFast`, `home.add.cancelFast`; the water page keeps P07-06's `water.menu.*`.

## Status

Done (2026-10-27). The + menu's Water page (inside the menu), Start fast, and the Fasting page with
End fast and Cancel fast; food hidden while a fast runs; Home hosts the custom water and start
sheets. Lines outside the task's own files: `src/ui/Menu.tsx` (the `panel` kind) and its test.
Handed on: the e2e walk (P07-17).
