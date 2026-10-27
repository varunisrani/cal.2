# Task: Add-menu editor (P09-05) · Phase: 09 · Owner: builder (wt-p09s05, slice S05)

<!-- Save as platewise/docs/notes/P<nn>/<slug>.md. Write everything above "Compare checklist"
BEFORE writing code, in your own words. Never paste or paraphrase the reference line by line. -->

Read (reference @ `10e14b67`): `A/ui/settings/AddMenuSettingsScreen.kt` (all: the editor's local
copy of the menu and when it takes the stored one, the refusal before load, the group stepper and
its count rule, the group cards, the loose card, the hidden card, the add-method dialog, reset, the
footer), `T/ui/settings/AddMenuGroupCountTest.kt` (all: adding a group, going flat, the first group
wrapping a flat menu). Research spec `06-settings-data.md` §3.6 and trap R06.21; the landed P06-01
rules in `src/domain/food/addMenu.ts` and their note `docs/notes/P06/add-menu-layout-and-menu.md`;
acceptance ACC-J5-1 (`docs/internals/acceptance-map.md`, J5).

What it does (own words): Settings › Add menu (`#/settings/menu`, linked from App settings) lets a
person shape the "+" menu. A stepper sets how many groups the menu has, 0 to 3: 0 puts every method
that is on the menu straight on it; going up from 0 makes the default groups again when nothing
sits straight on the menu, or one group holding what does; any further group starts empty; going
down drops the last group, and its methods become hidden. Each group card has a name field, moves
up and down among the groups, lists its methods (each moves up or down, or is removed, which hides
it) and has Add method, which picks from the hidden methods. A card for the methods straight on
the menu works the same way. Hidden methods are listed last: tapping one puts it back by the P06-01
rule (no groups → straight on the menu, else the last group, or the first group with methods when
the last is empty). Reset to default brings back the three default groups. A closing line says
water and fasting keep their own rows. Every change is stored at once, tidied; the page keeps its
own untidy copy (empty groups, names as typed) so a person can build a group up. Nothing is drawn
until the stored menu is read, so no edit can be made before it (R06.21, R06.22), and a read that
lands late never replaces a newer edit (R06.21).

Inputs → outputs: `menu.layout` (`useSettings`, `decodeLayout`) → the editor's copy (an
`AddMenuLayout` that may hold empty groups and untrimmed names) → each change:
`appSettings.setMenuLayout(copy)` (stores `sanitiseLayout(copy)`), Reset:
`appSettings.resetMenuLayout()` (stores `null`, the default) → Home's `+` menu reads it (landed).

Files: created `src/features/settings/app/MenuEditorPage.tsx` (+ test),
`src/features/settings/app/menuEdits.ts` (the editor's pure changes, + test),
`src/features/settings/app/menuEditor.module.css`, this note. Shared, additive: the `menu` entry in
`src/features/settings/registry.ts`; `settings.menuEditor` words in `src/i18n/en/settings.ts`;
`setMenuLayout` and `resetMenuLayout` in `src/services/appSettings.ts` (+ tests).

Edge cases / failure modes:
- Settings not read yet → nothing drawn; read failed → the App settings "can't be read" note.
- An empty group or a blank or padded name is kept on the page; what is stored drops the empty
  group and trims the name; a blank name shows the generic "Group" label, on the page and the menu.
- A preset group name (`snapScan`, `describe`, `reuse`) shows as an empty field with the preset's
  words as placeholder; typing replaces it with the person's text.
- Removing every method stores an empty menu (empty on purpose stays empty, P06-01).
- `voice` (reserved) may sit in a stored layout: it is never drawn, never offered as hidden, kept
  where it is, and a move skips over it.
- A method is in one place only: Add method or restore on a method already on the menu moves it.
- Read races (R06.21): the page takes a newly read menu only when it is not its own copy tidied, no
  write of its own is still running (that write lands later and replaces it), and it is not an older
  write of its own read late (a newer one is still to come back). Anything else (another tab, a
  restore) replaces the copy.
- A failed write → a toast, and the page goes back to the menu as last read.

Our design differences / decisions:
- Names are ours (`MenuEditorPage`, `menuEdits`, "Straight on the menu" for the loose list).
- The stepper rebuilds the default groups and keeps as many as asked: 0 → 1 with nothing loose
  gives the first default group (Snap & scan), as the reference does; Reset gives all three.
- Reset stores `null` (the setting's own default) rather than a copy of the default menu, so a
  later default reaches people who reset.
- Moves are up/down buttons (no drag), at the ends disabled rather than left out, so rows line up.
- The add-method picker is our list sheet (`ListPicker`) instead of a dialog.
- The footer's line about OS quick actions is not carried: v1 has no quick actions (06 §5).
- No confirmation on Reset (the reference has none; the layout is one tap to rebuild anyway).

Tests we will write:
- `menuEdits.test.ts`: group count 0 (groups first, then loose), 0 → 1 with nothing loose (first
  default group) and with loose methods (one generic group), extra groups empty, going down drops the
  last; moving a group; renaming keeps the text as typed; removing a method; moving a method within
  its list and over a reserved one; hidden methods in the default order, never `voice`.
- `MenuEditorPage.test.tsx`: reached from App settings; the default menu drawn; nothing drawn before
  the read (R06.21, R06.22); a late read of an older edit does not replace a newer one (R06.21);
  a change made elsewhere is taken; 0 → 1 with nothing loose rebuilds defaults; renaming to blank
  stores the generic label; empty groups and typed names kept, tidied on save; moving a method
  between groups keeps it once; move up/down; restore from Hidden; hiding Copy a day takes it off
  the + menu and restoring it brings it back (ACC-J5-1); Reset restores three groups; a failed save.
- `appSettings.test.ts`: `setMenuLayout` stores the tidied menu; `resetMenuLayout` stores the default.

Compare checklist (filled after the rewrite; reopened `A/ui/settings/AddMenuSettingsScreen.kt`,
`T/ui/settings/AddMenuGroupCountTest.kt`, and `A/models/AddMenuConfig.kt` for what the screen calls):
- [x] Edits refused until the stored menu is read: nothing is drawn before it, so nothing can be
  pressed; what is shown is read after the wait, a change made meanwhile included
  (`src/features/settings/app/MenuEditorPage.test.tsx > MenuEditorPage > draws nothing until the
  stored menu is read, then shows it with a change made meanwhile (R06.21, R06.22)`)
- [x] The page keeps its own copy and takes a read only when it is news: a late read of an older
  edit (`> keeps a newer edit when the read of an earlier one lands after it (R06.21)`), a read while
  the page's write still runs (`> keeps an edit whose write is still on its way when a change from
  elsewhere is read (R06.21)`); a change from elsewhere is taken (`> takes a change made elsewhere,
  such as in another tab or by a restore`). The reference only compares with the copy tidied; the
  two race rules are ours (a gap closed our way).
- [x] Group count 0–3 with the stepper's ends switched off (`> shows the default menu as three
  groups, with nothing hidden, Reset and the note`); 0 → 1 with nothing loose rebuilds the default
  groups (`> rebuilds the default groups going from 0 to 1 when nothing is on the menu`;
  `src/features/settings/app/menuEdits.test.ts > withGroupCount > rebuilds the default groups going
  up from 0 with nothing loose, keeping as many as asked`); 0 → 1 with loose methods wraps them,
  extra groups start empty and are kept on the page but not stored (`MenuEditorPage.test.tsx >
  MenuEditorPage > wraps the loose methods in one group going from 0 to 1, and adds empty groups
  after it`; `menuEdits.test.ts > withGroupCount > wraps the loose methods in one unnamed group going
  up from 0`, `> adds empty unnamed groups with ids no group has, and keeps the loose list`); 0 puts
  the groups' methods first, then the loose ones, and going down drops the last group
  (`MenuEditorPage.test.tsx > MenuEditorPage > puts every method straight on the menu at 0, and going
  down drops the last group`; `menuEdits.test.ts > withGroupCount > puts every method straight on the
  menu at 0, the groups first, then the loose ones`, `> drops the last groups going down, and their
  methods become hidden`)
- [x] Group name: a preset name is an empty field with the preset as hint; typed text kept as typed,
  stored trimmed; blank stores the generic label (`MenuEditorPage.test.tsx > MenuEditorPage > stores a
  name renamed to blank as the generic label, and the typed text trimmed`, `> keeps an empty group
  and its typed name while editing, and stores them once it has a method`;
  `src/services/appSettings.test.ts > setMenuLayout (P09-05) > stores the menu tidied: empty groups
  gone, names trimmed, each method once (R06.21)`, `> keeps a blank name blank, for the generic label`)
- [x] Group moves only with more than one group; method moves within a list; remove hides
  (`MenuEditorPage.test.tsx > MenuEditorPage > moves methods and groups up and down`;
  `menuEdits.test.ts > moveGroup > swaps a group with the one before or after it, and leaves the ends
  alone`, `moveMethod > moves a method one row within its group or the loose list`, `> steps over a
  reserved method, which is never drawn`, `removeMethod > takes the method off the menu, where it was,
  and keeps a group it leaves empty`)
- [x] Add method offers the hidden methods; picking one puts it in that group or straight on the
  menu, once (`MenuEditorPage.test.tsx > MenuEditorPage > moves a method from one group to another,
  keeping it once`, `> puts a hidden method back straight on the menu when there are no groups, or by
  Add method`)
- [x] The loose card shows when it has methods or something is hidden; the hidden card lists hidden
  methods in the default order and a tap restores by the P06-01 rule (`menuEdits.test.ts >
  hiddenMethods > lists the offered methods not on the menu in the default menu's order, never
  voice`; `MenuEditorPage.test.tsx > MenuEditorPage > takes Copy a day off the + menu when hidden and
  brings it back when put back (ACC-J5-1)`)
- [x] Reset to default (`MenuEditorPage.test.tsx > MenuEditorPage > brings back the three default
  groups on Reset`; `appSettings.test.ts > resetMenuLayout (P09-05) > clears the stored menu, which
  reads as the default three groups`)
- [x] Footer about water and fasting (`MenuEditorPage.test.tsx > MenuEditorPage > shows the default
  menu as three groups, with nothing hidden, Reset and the note`)
- [x] A failed save says so and goes back to the menu as stored (`MenuEditorPage.test.tsx >
  MenuEditorPage > says so when a change is not stored, and goes back to the stored menu`)
- [x] Reached from App settings (`MenuEditorPage.test.tsx > MenuEditorPage > is reached from App
  settings at #/settings/menu, under its title`)
- Mutation check: taking every new read fails the late-read test; dropping the running-write rule
  fails the write-on-its-way test; dropping the "already the copy tidied" check fails the two typed-name
  tests.
- Deliberate differences: our copy and names; Reset stores `null` (the setting's default) instead of
  a copy of the default; ends of the move buttons are disabled rather than left out; the add-method
  picker is a list sheet; no line about OS quick actions (none in v1); a failed write shows a toast;
  the page draws nothing (not a spinner) until the stored menu is read, like the other Settings
  pages; the two read-race rules above.
- Not taken: the reference's editor-side tidy-up (dedupe, cap, unknown ids): every change here keeps
  a method in one place and the store's copy is tidied already; drag to reorder (neither app has it).

## Decisions for the lead

- Service: `setMenuLayout(draft)` (stores `sanitiseLayout(draft)`) and `resetMenuLayout()` (stores
  `null`) added to the `appSettings` service (`src/services/appSettings.ts`), no new wiring.
- Shared test edit: `src/features/settings/app/AppPage.test.tsx` assumed `menu` was not registered;
  its row list now expects Add menu first, and the stand-in test filters the real `menu` entry out
  before adding its own (2 small hunks).
- Method pictures: `METHOD_ICONS` in `MenuEditorPage.tsx` repeats the + menu's choice of icons
  (`METHOD_LOOKS` in `src/features/log/AddMenu.tsx` is not exported). Follow-up: export the looks
  from `AddMenu.tsx` and use them here.
- Data-ui: page `menuEditor`; stepper `menuEditor.groups`; group card `menuEditor.group.<id>` with
  `.name`, `.up`, `.down`, `.add`; method row `menuEditor.method.<method>` with `.up`, `.down`,
  `.remove`; `menuEditor.loose` (+ `.add`), `menuEditor.hidden`, `menuEditor.hidden.<method>`,
  `menuEditor.addSheet` (options `menuEditor.addSheet.<method>`), `menuEditor.reset`,
  `menuEditor.footer`.

## Status

Done (2026-10-27). Created `MenuEditorPage.tsx` (+ 17 tests), `menuEdits.ts` (+ 15 tests),
`menuEditor.module.css`, this note. Shared, additive: the `menu` entry in
`src/features/settings/registry.ts`, `settings.menuEditor` in `src/i18n/en/settings.ts`, two
methods in `src/services/appSettings.ts` (+ 4 tests). Changed outside the set: 2 hunks of
`src/features/settings/app/AppPage.test.tsx` (above). R06.21 and ACC-J5-1 are now tested.
Looked at in the built app at 360 px, light and dark: no sideways scroll (a name input's default
width had widened the cards; the field now fills what is left).
