# Task: App settings and units pages (P09-02) · Phase: 09 · Owner: builder (wt-p09s02)

<!-- Save as platewise/docs/notes/P<nn>/<slug>.md. Write everything above "Compare checklist"
BEFORE writing code, in your own words. Never paste or paraphrase the reference line by line. -->

Read (reference @ `10e14b67`): `android/.../ui/settings/SettingsScreen.kt` lines 950–1160 (the App
Settings card: which rows, in which order, what each row opens, that every row writes through the
view model at once). Research spec `06-settings-data.md` §3.2 (rows, order, defaults), §3.3 (display
and units: canonical kcal, separate height and weight units, week start), §5 (what the web keeps and
drops); `01-profile-goals.md` §3.9 (the three units are separate settings); D-16.1 (our six solid
accents, no gradients). No reference tests cover this card (its unit rules are tested with the
domain, P01).

What it does (own words): Settings › App settings is where the person sets how the app looks and
reads. It shows, in order: Appearance (System, Light, Dark), Accent (our six presets as coloured
swatches with their names), Grams first (a switch, with a line saying what it changes), Week starts
on (Monday by default, or Sunday), then the Units section (energy kcal or kJ, height cm or ft and
in, weight kg or lb, each its own setting), then links to the Add menu, Product details and Tab bar
pages. Each control writes its one setting the moment it is used; the control shows the new choice
at once and then follows the stored value. Changing a unit changes only how numbers are shown and
typed: no stored entry, goal, weight or height is touched. Nothing is drawn until the settings are
read, so a control never shows a default in place of a stored value (R06.22). Save to Photos,
app-icon colours, quick-action slots, the language picker and share links are not offered (06 §5).

Inputs → outputs: the settings `display.appearance`, `display.accent`, `log.gramsFirst`,
`display.weekStart`, `units.energy`, `units.height`, `units.weight` (read with `useSettings`) → one
`settingsRepo.set` per change through a new `appSettings` service; the theme provider, the week bar,
the gauge and every unit display then follow through their own live reads.

Files: created `src/features/settings/app/{AppPage,UnitsSection}.tsx` with tests,
`src/features/settings/app/appSettings.module.css`, `src/features/settings/app/writes.ts` (the
service hook and the "show at once, then the stored value" helper, shared with P09-04 and P09-06)
with its test, `src/features/settings/app/testing/openAppSettings.tsx`, `src/services/appSettings.ts`
with its test, `src/i18n/en/appSettings.ts`. Shared, additive: `src/features/settings/registry.ts`
(the `app` entry), `src/services/context.tsx` (`appSettings?`), `src/main.tsx` (builds it),
`src/i18n/en.ts` (the partition).

Edge cases / failure modes:
- Settings not read yet → nothing drawn; read failed → a short note instead of controls.
- A write that fails → the control goes back to the stored value and a toast says it was not saved.
- A choice changed elsewhere while a write runs (another tab) → the stored value wins once it moves.
- The swatches must show each accent as it looks in the current theme (the light theme has deeper
  accents): each swatch carries `data-accent` and, on a light page, `data-theme="light"`, so the
  token file colours it; no colour literal in our CSS.
- A link row whose page is not registered yet (Add menu, P09-05) is left out rather than drawn as a
  dead link; it appears by itself once `menu` is registered.

Our design differences / decisions:
- Names are ours (Accent, Grams first, Week starts on, Units, Product details); copy in our words.
- Appearance, week start and the three units are segmented controls on the page (one tap, writes
  at once) rather than list sheets; the accent is an inline radio group of swatches rather than a
  drop-down menu.
- The three units sit on this page (the reference edits height and weight units only inside the
  Personal info sheets); Personal info keeps its own toggles too.
- Grams first explains itself in the switch's description line instead of an info button.
- The Add menu link targets id `menu` and shows only once that page is registered (P09-05).

Tests we will write:
- Rows in order with stored values; nothing drawn before the settings are read.
- Choosing Ember sets `data-accent` on the theme root at once (ACC-A9-1); Light sets `data-theme`.
- Sunday re-anchors Home's week bar (ACC-J2-1).
- kJ turns the gauge into Kilojoules with 8 368 kJ for a 2 000 kcal goal, stored kcal unchanged
  (ACC-C12-1).
- Height unit to ft-in keeps 175 cm; lb weight with cm height combine (ACC-J3-1).
- A failed write returns the control and shows the toast.
- Link rows open Product details and Tab bar; Add menu appears once `menu` is registered.

Compare checklist (filled after the rewrite; reopened `SettingsScreen.kt` 950–1160 and the
reference's English strings for the rows' meaning only):
- [x] rows in order: Appearance, accent, grams first, week start, energy unit, then the pushed
      pages, with stored values shown (`AppPage.test.tsx > AppPage > shows the stored choices in
      order: look, grams first and week start, units, then the pages`)
- [x] nothing drawn before the stored settings are read (`AppPage.test.tsx > AppPage > draws
      nothing until the settings are read (R06.22)`)
- [x] appearance applies at once app-wide (`AppPage.test.tsx > AppPage > turns the page light at
      once when Light is chosen`)
- [x] accent applies at once, the chosen swatch is marked (`AppPage.test.tsx > AppPage > recolours
      every accent element at once when Ember is chosen (ACC-A9-1)`, `> shows each swatch as the page
      theme draws its preset`, `> moves the accent with the arrow keys, choosing as it goes`)
- [x] week start drives the week strip (`AppPage.test.tsx > AppPage > starts the week bar on Sunday
      once Sunday is chosen (ACC-J2-1)`)
- [x] grams first written at once (`AppPage.test.tsx > AppPage > stores grams first the moment it
      is switched`; its effect on reviews is `ReviewSheet.test.tsx > ReviewSheet > opens in grams
      when grams come first, else in the unit the draft chose (ACC-J2-2)`, P06)
- [x] kJ changes only the display: gauge heading and numbers, stored kcal untouched
      (`UnitsSection.test.tsx > UnitsSection > shows Kilojoules and 8,368 kJ for a 2,000 kcal goal
      once kJ is chosen, and keeps every stored kcal (ACC-C12-1)`; `src/services/appSettings.test.ts
      > set > changes only the unit: the stored height, weight and targets stay as they were`)
- [x] height and weight units are separate settings and never convert stored values
      (`UnitsSection.test.tsx > UnitsSection > keeps 175 cm when the height unit changes, and
      Personal info shows it in feet and inches`, `> combines weight in lb with height in cm
      (ACC-J3-1)`, `> shows energy, height and weight as three settings with the stored units and
      the note`)
- [x] every row writes at once; a failed write shows the stored value again and says so
      (`AppPage.test.tsx > AppPage > goes back to the stored choice and says so when a change cannot
      be saved`; `UnitsSection.test.tsx > UnitsSection > goes back to the stored unit and says so when
      the change cannot be saved`; `writes.test.tsx > usePendingWrites > …` five cases)
- [x] links to Add menu, Product details and Tab bar (`AppPage.test.tsx > AppPage > opens the pages
      under it, with Add menu first once that page is registered`)
- Deliberate differences: segmented controls on the page instead of list sheets; the accent as an
  inline swatch group (six solid presets, D-16.1) instead of a menu of 18 gradients; Grams first
  explains itself in a description line instead of an info dialog; the three units live here (the
  reference keeps height and weight units inside the Personal info sheets, which still have their
  own toggles); a control shows the new choice at once and the stored value wins once it moves
  (the reference waits for the write); a failed write says so in a toast. Our own copy and hooks.
- Not taken: App Language (v1 is English only), Save to Photos, Share Links, Quick Actions and the
  launcher-icon colour (06 §5); the Add menu row appears only once P09-05 registers `menu`.

## Decisions for the lead

- **Sub-pages are hub rows for now.** App settings links to `product-fields` and `tab-bar`, which
  are registered as ordinary `prefs` categories (as the prompt asked: entries only, hub not
  restyled), so the hub now lists App settings, Product details and Tab bar after Tracking. P09-01
  can give the registry a way to keep a page off the hub (for example a `parent: 'app'` field that
  `groupsOf` skips and the frame's back link follows).
- **Add menu link.** The row targets id `menu` and is drawn only while a category with that id is
  registered (`APP_SUBPAGES` in `AppPage.tsx`), so there is no dead link before P09-05 lands and
  P09-05 needs no edit to `AppPage.tsx`.
- **One failing test outside my files.** `src/features/settings/tracking/TrackingPage.test.tsx >
  TrackingPage > is listed with the preferences, after Goals` expects the preferences card to hold
  exactly Personal info, Goals and Tracking; it now also holds App settings, Product details and
  Tab bar. I did not touch it (the prompt keeps other settings files off limits; the AI page slice
  will hit the same line). Fix at merge: extend the expected list, or check only that Tracking
  follows Goals.
- **Note slug.** This note uses the slug from the task prompt (`app-settings-and-units`); the phase
  file lists `app-settings-and-units-pages`. Rename if the phase file's name should win.

## Status

Done (2026-10-27). Files: see "Files" above. Shared, additive lines: `src/features/settings/
registry.ts` (three entries), `src/services/context.tsx` (`appSettings?`), `src/main.tsx` (builds
the service), `src/i18n/en.ts` (the `appSettings` partition). The helper `writes.ts` and
`testing/openAppSettings.tsx` serve P09-04 and P09-06 too.
