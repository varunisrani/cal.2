# Task: add-menu layout and menu (P06-01) · Phase: 06 · Owner: builder (wt-p06s4a, slice S4a)

<!-- Save as platewise/docs/notes/P<nn>/<slug>.md. Write everything above "Compare checklist"
BEFORE writing code, in your own words. Never paste or paraphrase the reference line by line. -->

Read (reference @ `10e14b67`): `A/models/AddMenuConfig.kt` (all: the stored menu, its tidy-up on
save and for the editor, what each method list resolves to, restoring a hidden method, decoding,
the default), `I/Models/AddMenuConfig.swift` (all: the same model, its upward default order, the
raw-JSON check that tells an unavailable menu from an empty one), `T/models/AddMenuConfigTest.kt`
and `IT/AddMenuConfigTests.swift` (all). The method enum `A/models/FoodLogMethod.kt` only for the
list of ids. Research spec `02-food-logging.md` §3.18 and trap R02.23; `06-settings-data.md` §3.6
(the editor's rules, P09-05) and R06.21; naming `17-naming-and-glossary.md` (method ids, default
group names, UI words). Acceptance ACC-D3-1 (kept), ACC-D3-2.

What it does (own words): the "+" button on Home opens the add menu: up to three named groups,
each a page of logging methods with a Back row, and below them any methods placed directly on the
menu ("loose"). The stored layout says which methods sit where. Out of the box there are three
groups: Snap & scan (camera, photo library, barcode), Describe (describe, enter manually) and
Reuse (recent, often eaten, saved, copy a day). Whatever is stored is tidied before it is used or
saved: at most three groups, unknown method ids gone, a method listed twice kept only at its first
place (groups before loose), groups left without methods gone, a blank group name shown as the
generic "Group". Nothing stored, or something we cannot read, gives the default menu; a stored menu
that only became empty because every id in it is unknown (a newer app's methods, say) also gives
the default, while a menu the person emptied on purpose stays empty. The settings editor (P09-05)
puts a hidden method back where the person asks: a group, the loose list, or with no group at all
the loose list, else the last group, or the first group that has methods when the last is empty.
Choosing a method first clears an armed label scan (a barcode miss can arm the next photo to be
that product's label, P06-17; any other method must disarm it so a stale code never links an
unrelated meal, R02.20), then opens that method's sheet.

Inputs → outputs:
- `src/domain/food/addMenu.ts`: `decodeLayout(stored: unknown)` → `AddMenuLayout`;
  `sanitiseLayout(input)` → `AddMenuLayout` (input may carry unknown ids, blanks, duplicates);
  `restoreMethod(layout, method, target?)` → `AddMenuLayout`; `layoutMethods(layout)` → every
  method on the menu, groups first; `withoutMethods(layout, hidden)` → the layout without those
  methods and without groups left empty; `DEFAULT_MENU_LAYOUT`.
- `src/features/log/AddMenu.tsx`: props `layout`, `onChoose(method)`, `clearArmedLabelScan()`,
  the trigger's class → the "+" button (hook `home.add`) and its menu.
- Home: `menu.layout` read with the other settings → AddMenu; camera / library → the capture sheet
  with that picker; describe → the describe sheet; manual → the manual sheet; Analyse on the
  capture sheet → `analysis.start('photo', {photoIds, note, progressive})`.

Files: created `src/domain/food/addMenu.ts` (+ test), `src/features/log/AddMenu.tsx` (+ test),
`src/i18n/en/menu.ts`, this note. Changed: `src/features/home/HomePage.tsx` (+ its test). Shared, additive: the `menu` line in
`src/i18n/en.ts`; `<AnalysisOverlay />` in the tab frame of `src/app/App.tsx` (+ a test).

Edge cases / failure modes:
- Stored value missing (`null`) or not a record, `groups` / `loose` missing or not arrays, a group
  that is not a record or whose methods are not an array → the default menu.
- Method ids that are not strings count as unknown ids.
- `{groups: [{methods: ['teleport']}], loose: []}` → default; `{groups: [], loose: []}` → stays
  empty; `{groups: [{methods: []}], loose: []}` (only empty groups) → stays empty.
- Four groups stored: the fourth is dropped with its methods, before empty groups are dropped.
- Group ids: a blank or repeated id gets a fresh one, so pages never clash (the Back row and keys
  depend on it).
- Group names are trimmed; a blank one shows the generic label; the default groups' names are the
  ids of our labels (`snapScan`, `describe`, `reuse`), put into words on screen.
- `voice` is a known id (kept in a stored layout, never dropped as unknown) but never shown in v1
  and not in the default.
- Restore to a group id that does not exist → the rule for no target; restoring a method already
  on the menu moves it (it is never listed twice).
- A group whose methods are all hidden on screen is not drawn; a menu with nothing to show draws
  no "+" button.
- Capture draft with photos when Home opens (after a reload) → the capture sheet opens again,
  unless an analysis is already running or waiting for review.

Our design differences / decisions:
- Names are ours: `AddMenuLayout`, `loose`, `library`, `describe`, `often`, `saved`, `copyDay`,
  `snapScan`; the stored record is `{version: 1, groups, loose}`.
- One version only: our version 1 always shows the loose list under the groups. The reference's
  older format, whose loose list was ignored once a group had methods, never existed here, so that
  rule is not carried (no data of ours can be in it).
- A stored record needs both `groups` and `loose` arrays; the reference reads missing lists as
  empty (an empty menu). Only our own tidy-up writes this setting, so a record without them is not
  ours: default.
- Group ids are made deterministic (`g1`, `g2`, …) instead of random, so tidying is pure.
- Methods whose sheets do not exist yet (barcode P06-14; recent, often, saved P06-12; copy a day
  P06-13) stay in the layout and the default but are left off the drawn menu through one list in
  `AddMenu.tsx` that those slices delete from.
- The menu's "Camera" opens the capture sheet with the camera as its picker; the sheet's "Add
  photo" then opens the camera (one tap more than the reference, which goes to the camera at once;
  the landed sheet has no way to open its picker on open). A draft already holding photos is kept,
  not cleared, when Camera or Photo library opens the sheet.
- The label-scan clearing is a prop (`clearArmedLabelScan`), a no-op on Home until P06-17 passes
  its disarm.
- Water and fasting rows arrive in P07-08; voice in L4.

Tests we will write:
- `addMenu.test.ts`: default has 3 groups and 9 methods in order; null / not a record / bad lists →
  default; only unknown ids (in a group, in loose) → default; deliberately empty stays empty (also
  with only empty groups); unknown ids dropped, known kept; a method in two groups kept in the
  first, in a group and loose kept in the group; more than 3 groups → first 3; empty groups dropped;
  blank name → blank (generic label), names trimmed; ids made unique; voice kept; the sanitised
  default round-trips; restore to a named group, to loose, to the flat list, to the last group, to
  the first non-empty group when the last is empty, and with an unknown group id; `withoutMethods`.
- `AddMenu.test.tsx`: the default menu draws Snap & scan and Describe pages (Reuse and barcode
  hidden until their sheets exist), each page with its methods and Back; loose methods under the
  groups; a flat layout; each method clears an armed label scan before it is handed on; an empty
  menu draws no button; a blank group name shows the generic label; copy from the catalogue.
- `HomePage.test.tsx` (wiring): Camera and Photo library open the capture sheet with that picker;
  Describe opens the describe sheet; Enter manually still opens the manual sheet (ACC-D3-1);
  Analyse starts a photo analysis with the photos, note and switch; a capture draft with photos
  opens the sheet when Home opens; a stored layout from settings is drawn.
- `App.test.tsx`: the analysis overlay shows over a tab screen.

Compare checklist (filled after the rewrite; reopened `A/models/AddMenuConfig.kt`,
`I/Models/AddMenuConfig.swift`, `T/models/AddMenuConfigTest.kt`, `IT/AddMenuConfigTests.swift`):
- [x] Default: three groups in top-down order, voice left out (it is reserved), nothing loose
  (`src/domain/food/addMenu.test.ts > DEFAULT_MENU_LAYOUT > has three groups and 9 methods: Snap &
  scan, Describe and Reuse, nothing loose`, `> holds every method v1 offers, and never the reserved
  voice`); drawn as pages with Back (`src/features/log/AddMenu.test.tsx > AddMenu > draws the default
  menu's three groups as pages with their methods and Back (ACC-D3-2)`)
- [x] Tidy-up: first three groups, one seen-set across groups then loose, unknown ids dropped,
  empty groups dropped, names trimmed, blank name → generic label (`addMenu.test.ts > sanitiseLayout >
  keeps a method listed in two groups only in the first`, `> keeps a method that is in a group and
  loose only in the group`, `> keeps at most 3 groups, and the methods of the others go with them`,
  `> drops groups that end up without methods`, `> trims names, and a blank name stays blank for the
  generic label`; `AddMenu.test.tsx > AddMenu > names groups by the person's text, a preset's label, or
  the generic label when blank`)
- [x] Blank ids get a fresh id (the reference only replaces blank ones; ours repeated ones too)
  (`> gives every group its own id: a blank or repeated one takes a free g-number`, `> keeps ids that
  were asked for, even after a group that needed a fresh one`)
- [x] Decode: nothing stored or unreadable → default; empty only through unknown ids (in a group, in
  loose, or past the third group) → default; emptied on purpose stays empty (R02.23)
  (`addMenu.test.ts > decodeLayout (R02.23) > gives the default when nothing is stored`, `> gives the
  default for anything it cannot read`, `> gives the default when a stored menu is empty only because
  its ids are unknown`, `> keeps a menu that was emptied on purpose empty, with or without empty
  groups`, `> drops unknown ids and keeps the known ones in their order`)
- [x] Groups first, then loose; a flat menu is the loose list (`AddMenu.test.tsx > AddMenu > draws
  loose methods under the groups, after a hairline`, `> draws a flat menu when there are no groups`;
  `addMenu.test.ts > decodeLayout (R02.23) > reads the loose list beside groups, under them, whatever
  the stored version says`)
- [x] Display drops a group with nothing to show (`AddMenu.test.tsx > AddMenu > leaves off the methods
  whose sheets are not built yet, and a group they leave empty`; `addMenu.test.ts > withoutMethods >
  leaves out the hidden methods and the groups that leaves empty`)
- [x] Restore: named group, loose, flat list, last group, first non-empty when the last is empty (empty
  groups kept for the editor), unknown group → the no-target rule, a method on the menu moves; the
  last-group check is made before the method leaves its old place — a gap found here and closed
  (`addMenu.test.ts > restoreMethod > puts a method into the group the target names`, `> puts a method
  straight on the menu, under the groups, when asked to`, `> adds to the flat list when the menu has
  no groups`, `> adds to the last group without a target, and keeps the group ids`, `> adds to the
  first group with methods when the last one is empty, keeping the empty one`, `> adds to the last
  group when every group is empty`, `> leaves a method that is the last group's only one where it
  is`, `> treats a target group that is gone as no target`, `> moves a method that is already on the
  menu instead of listing it twice`)
- [x] Every method first clears an armed label scan (`AddMenu.test.tsx > AddMenu > clears an armed
  label scan before every method it hands on (R02.20)`)
- [x] Each method opens its sheet (`src/features/home/HomePage.test.tsx > HomePage: the add menu opens
  its sheets (P06-01) > opens the meal-photos sheet from Camera, its Add photo taking one photo with
  the camera`, `> opens the meal-photos sheet from Photo library, its Add photos picking several`, `>
  opens the describe sheet from Describe`; `HomePage > offers Enter manually in the + menu, which opens
  the manual sheet over Home (ACC-D3-1)`); Analyse starts the photo analysis (`> starts a photo
  analysis with the photos, the note and the switch on Analyse, and closes the sheet`); the capture
  draft reopens (`> brings the meal-photos sheet back when Home opens with photos in the capture draft
  (D-16.46)`, `> leaves the sheet closed when the capture draft holds no photo`, `> leaves the sheet
  closed when an analysis has already taken over`); the stored layout is drawn (`> draws the stored
  layout`); the overlay in the tab frame (`src/app/App.test.tsx > App > shows the analysis overlay
  once over a tab screen, and never on onboarding (P06-01)`)
- Mutation check: returning the tidied empty layout instead of the default fails 1 test, dropping the
  seen-set 2, not clearing the label scan 3, reopening the capture sheet while an analysis runs 1.
- Deliberate differences: one format version whose loose list always shows (the reference's version-1
  rule that hid it is not carried: none of our data can be in that format); a record without `groups`
  and `loose` arrays reads as the default (the reference reads it as an empty menu); group ids are made
  deterministic and unique (`g1`, …), not random; group names are the person's text, a preset name
  (`snapScan`, `describe`, `reuse`) or blank, and blank shows "Group"; the restore target is a group id,
  not an index; voice is a known id kept in storage but never shown (iOS drops its platform-only
  method instead); the default is stored top-down (iOS stores it reversed for its upward menu; ours
  draws the rows top-down in the menu that opens above the button); Camera opens the meal-photos
  sheet, whose Add photo then opens the camera (one tap more).
- Not taken: the editor's own tidy-up that keeps empty groups and typed names, and the start-up
  snapshot race (both P09-05, R06.21); quick actions (not in v1); Siri phrases (platform-only).

## Decisions for the lead

- Stored setting: reuses `menu.layout` (`src/data/settingsSchema.ts`, `StoredRecord | null`, default
  `null`); no change to `src/data`. P09-05 saves `sanitiseLayout(editedLayout)` there.
- Domain API (`src/domain/food/addMenu.ts`): `ADD_METHODS`, `RESERVED_METHODS` (`voice`),
  `OfferedMethod`, `MAX_MENU_GROUPS`, `PRESET_GROUP_NAMES`, `AddMenuLayout {version: 1, groups:
  {id, name, methods}[], loose}`, `DEFAULT_MENU_LAYOUT`, `decodeLayout`, `sanitiseLayout(LayoutDraft)`,
  `restoreMethod(layout, method, {group: id} | 'loose')`, `layoutMethods`, `withoutMethods`.
- `METHODS_NOT_BUILT_YET` in `src/features/log/AddMenu.tsx` (`barcode`, `recent`, `often`, `saved`,
  `copyDay`): P06-14, P06-12 and P06-13 each delete theirs and add their case in `choose` in
  `HomePage.tsx` (the cases are there, returning nothing). `AddMenu` also takes `withheld` (defaults
  to that list) so a test can draw the full default.
- Label scan: `AddMenu` calls its `clearArmedLabelScan` prop before every method; Home passes the
  no-op `clearArmedLabelScan` in `HomePage.tsx` until P06-17 passes its disarm. When P06-17 opens the
  camera for "Scan label", it must pass `armedLabel` in `analysePhotos` (comment there).
- Sheets: `CAPTURE_SHEET = 'capture'` and `DESCRIBE_SHEET = 'describe'` join `MANUAL_SHEET` on the
  router stack (Back closes them; the capture draft is kept). The capture draft is not cleared when
  Camera or Photo library opens the sheet. When Home opens with photos in the capture draft and no
  analysis running or waiting, the sheet opens again with the library as its picker (the draft does not
  record the picker).
- A layout with nothing to show (emptied on purpose, or only reserved / withheld methods) draws no
  "+" button. P07-08's water and fasting rows will make it show again.
- Follow-up (landed file): the capture sheet cannot open its picker when it opens, so "Camera" takes
  one more tap than the reference. A prop on `CaptureSheet` that clicks its input on open (within the
  menu tap's user activation) would close the gap.
- Follow-up (e2e, not mine): `e2e/walking-skeleton.spec.ts` step '"+" → Enter manually' clicks the
  manual row at the top of the menu; it now sits in the Describe page, so the step needs a click on
  `home.add.group.describe` first (or `menu.group.describe` by name). `home.add.manual` stays in
  `src/i18n/en/home.ts` only because that spec names it (typechecked); the menu's word is
  `menu.method.manual`. Drop `home.add.manual` when the spec changes.
- Data-ui: the button `home.add`; group rows `home.add.group.<id>`; method rows `home.add.<method>`.

## Status

Done (2026-10-27). Created `src/domain/food/addMenu.ts` (+ 30 tests), `src/features/log/AddMenu.tsx`
(+ 9 tests), `src/i18n/en/menu.ts`, this note. Changed `src/features/home/HomePage.tsx` (the add menu,
the capture and describe sheets, the capture draft reopening) and its test (2 tests updated for the
nested menu, 8 added). Shared, additive: the `menu` line in `src/i18n/en.ts`; `<AnalysisOverlay />` in
the tab frame of `src/app/App.tsx` (+ 1 test in `App.test.tsx`). Trap R02.23 and ACC-D3-2 are now
tested; ACC-D3-1 keeps its test (updated). Needs the e2e change above before `pnpm e2e` passes.
