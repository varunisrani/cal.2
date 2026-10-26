# Task: settings repository and schema (P02-04) · Phase: 02 · Owner: builder (wt-p02s1)

<!-- Save as platewise/docs/notes/P<nn>/<slug>.md. Write everything above "Compare checklist"
BEFORE writing code, in your own words. Never paste or paraphrase the reference line by line. -->

Read (reference @ `10e14b67`): `A/data/PreferencesStore.kt` (the private key list near the end of
the file only, lines 1588–1700, as an inventory of what the reference persists). Research spec
`06-settings-data.md` §2 (reference names), §3.2–3.10 (App Settings rows and defaults, display and
units, tracking and notifications, meal times, tab bar, add menu, quick actions, product
information, the notifications master switch, reminder types), §3.18 (single-value blobs), §6
R06.1, R06.2, R06.21, R06.22; `05-home-progress.md` §3.1.1 (tab visibility), the sort modes, §3.5.7
(include today), §6 R05.6, R05.13; `17-naming-and-glossary.md` §1.3 (our keys); decisions D-16.1,
D-16.5, D-16.10, D-16.40, D-16.41, D-16.61, D-16.65, D-16.23. No Evidence ids.

What it does (own words): every choice the person makes in Settings (and a few flags the app keeps
for itself: onboarding finished, terms accepted, the tune-up's bookkeeping, when a backup was last
made) is one row of the `settings` table, keyed by our dotted name and holding a plain JSON value.
The schema lists each v1 setting once with its default and a reader that checks a stored value and
tidies it (sorting quick-add amounts, dropping unknown tab names); a value the reader cannot use
reads as the default and is kept aside in `quarantine` exactly like an unreadable record, and it
stays in its row until a write replaces it, which copies it aside first in the same transaction.
The repository reads one setting or a whole snapshot (defaults filled in), writes one setting after
checking it, and changes one setting by reading, changing and writing in one transaction, so two
screens changing the same setting at once both keep their change. Hiding or showing one tab goes
through that path and touches only that tab, so a screen holding an older list cannot undo another
change (R05.13). Settings pages must not show switches at their defaults before the stored values
are known (R06.22): the repository starts reading a first snapshot when it is created and exposes
`loaded`, which resolves with it, and posts `settings-loaded` on the bus for this tab.

Inputs → outputs:
- `settingsSchema.ts`: `SETTING_SPECS` (key → `{fallback(env), read(stored)}`), `SettingKey`,
  `SettingValue<K>`, `Settings` (every key with a value), `SETTING_KEYS`, `isSettingKey`,
  `settingDefault(key, env)`, `readSetting(key, stored)` → tidy value or `undefined`,
  `defaultSettings(env)`; value lists `APPEARANCES`, `ACCENTS`, `WEEK_STARTS`, `HIDEABLE_TABS`,
  `PRODUCT_FIELDS`; `ReminderSetting {on, at: 'HH:MM'}`, `isClockTime`; `SettingsEnv {locale}`.
- `repos/settingsRepo.ts`: `createSettingsRepo(db, {locale?, clock?, bus?})` →
  `get(key)`, `set(key, value)` → the stored (tidied) value, `update(key, change)` → the new value,
  `toggleHiddenTab(tab, hidden)` → the new hidden list, `snapshot()`, `loaded: Promise<Settings>`;
  `InvalidSettingError` for a value the schema refuses.

Files: created `src/data/settingsSchema.ts`, `src/data/settingsSchema.test.ts`,
`src/data/repos/settingsRepo.ts`, `src/data/repos/settingsRepo.test.ts`, this note.

The v1 settings (key: value, default):
- `display.appearance`: `system | light | dark`, system. `display.accent`: `basil saffron lagoon
  beet ember ink`, basil (D-16.1). `display.weekStart`: `mon | sun`, mon.
- `units.energy`: `kcal | kJ`, kcal. `units.height`: `cm | ftIn` and `units.weight`: `kg | lb`,
  both from the locale through `defaultUnits` (D-16.10), so they always agree (R01.18).
- `log.gramsFirst`: boolean, off.
- `meals.times`: `{breakfast, lunch, dinner, lateSnack}` minutes, 05:00 / 12:00 / 18:00 / 23:00;
  checked with `isValidMealTimes`.
- `home.sort`: `byMeal | newestFirst`, byMeal. `home.pillars`: pillar keys as an array, protein,
  carbs, fat, fibre (`decodePillars`: unknown names and repeats dropped, at most four).
- `tabs.hidden`: hideable tabs (`progress`, `coach`) as an array in tab order, none; unknown names
  (Home, Settings, anything else) dropped.
- `menu.layout`: the add-menu record or null (null = the default layout). Only its shape is
  checked here; the sanitising rules belong to the add-menu domain module (P06).
- `product.show`: on. `product.hiddenFields`: product field keys as an array in display order,
  none; unknown keys dropped.
- `progress.countToday`: on.
- `water.on`: off; `water.goalMl`: whole ml in the goal wheel's range 50–10 000, 2 000;
  `water.unit`: `ml | flOz`, ml; `water.quickAddMl`: three amounts (`decodeQuickAdd`), 250/500/750.
- `fasting.on`: off (a plain boolean: the fasting repository writes this row itself);
  `fasting.defaultGoalMin`: minutes (`decodeFastGoal` clamps a number to 60–10 080), 960.
- `remind.master`: off. `remind.breakfast` 08:00, `remind.lunch` 12:00, `remind.dinner` 19:00,
  `remind.summary` 20:00, `remind.water` 14:00, each `{on: false, at}` (D-16.41, D-16.61).
  `remind.fastGoal`: off. `alerts.goalReached`: off.
- `goals.nutrients`: the optional nutrient goals (`decodeGoalValues`), their defaults.
  `goals.rebuildBaseline`: the plan-inputs key string or null (an old-format string is still a
  string: the signature module decides it is unusable and re-seeds).
- `tuneUp.on`: on when absent. `tuneUp.lastCheckDay`: a day key or null. `tuneUp.savedPlan`: saved
  targets or null; `null` (nothing kept) and `{}` (a plan that was all automatic) stay apart.
- `onboarding.done`, `onboarding.termsAccepted`: off.
- `ai.settings`: the AI settings record or null (null = the AI layer's defaults). Only its shape is
  checked here; the fields and their defaults belong to `src/ai/settings.ts` (P03-04).
- `storage.persistAsked`, `storage.nudgeDone`: off. `backup.lastAt`: epoch ms or null.

Edge cases / failure modes:
- A stored value of the wrong type or outside its range → the default, and the row is kept aside
  (once per value) and the unreadable flag set; the row itself is not touched by a read.
- `set` or `update` over such a row copies it aside first in the same transaction; if the copy
  fails, nothing is written (`WriteBlockedError`).
- Values that are null on purpose (`backup.lastAt`, `tuneUp.savedPlan`, …) must not look
  unreadable to the guard, whose codecs use null for "cannot read": the codec boxes the value.
- A row whose key is not a v1 setting (written by an older build) is ignored by the snapshot; it
  is not quarantined, so it raises no banner.
- `update`'s change function returning a value the schema refuses → the transaction rolls back and
  nothing changes (`InvalidSettingError`).
- Two `update` calls at the same time on one key: IndexedDB runs read-write transactions over the
  same table one after the other, so the second reads what the first wrote.
- `loaded` rejects if the first read fails (the boot screen shows the error); the repository marks
  the promise as handled so an unobserved failure is not an unhandled rejection.
- Lenient reads (unknown tab or field names dropped, quick-add amounts sorted, a fast goal clamped)
  are tidying, not damage: no quarantine. The tidy value replaces the stored one on the next write.

Our design differences / decisions:
- One row per setting in an IndexedDB table instead of one key/value store file; our names
  (17-naming §1.3). Records (meal times, reminders, add-menu layout, AI settings) are one row each,
  where the reference spreads them over several keys (`…Hour`, `…Minute`).
- Reminders are `{on, at: 'HH:MM'}` with D-16.61's times, all off (D-16.41); no streak, weight or
  body-fat reminder. `alerts.goalReached` (the goal-weight notification) is off too, as every
  notification asks for permission when first turned on (D-16.5): decision for the lead.
- Hidden tabs, pillars, product fields and quick-add amounts are arrays, not comma-joined text.
- The unit defaults depend on the locale, so defaults are computed from an environment
  (`{locale}`, `navigator.language` by default) rather than being constants.
- `loaded` resolves with the first snapshot itself, so a gate can render straight from it.
- The data layer imports only the domain: the accent and appearance value lists are repeated
  here from `src/ui/tokens.ts` and `src/ui/theme.ts`, held equal by a test.

Tests we will write:
- `settingsSchema.test.ts`: the key set equals 17-naming §1.3; every reminder off with the D-16.61
  times; tune-up on when absent; units follow the locale together; each reader's accept, tidy and
  refuse cases (accent, meal times, pillars, hidden tabs, product fields, quick-add, water goal,
  fast goal, reminders, saved plan null vs {}, baseline, last check day, records); defaults are
  fresh copies; the accent and appearance lists equal the theme's.
- `settingsRepo.test.ts`: defaults when empty; set/get round trip; set refuses an invalid value and
  writes nothing; an invalid stored accent reads as the default, is kept aside once and left in
  place; snapshot drops one bad row to its default and ignores unknown keys; set over a bad row
  copies it first, and refuses when the copy fails; two concurrent updates keep both changes;
  update over a bad row starts from the default; update refusing its own result changes nothing;
  toggleHiddenTab with a stale screen copy (R05.13) both ways; `loaded` waits for a write in flight
  and posts `settings-loaded` once (R06.22); the `fasting.on` row is a plain boolean; a live
  snapshot follows a write.

Compare checklist (filled after the rewrite; reopened `A/data/PreferencesStore.kt` lines 1588–1700
and walked every key against the schema):
- [x] Every reference setting that v1 keeps has one key here, named as in 17-naming §1.3
  (`src/data/settingsSchema.test.ts > SETTING_SPECS > has exactly the v1 keys of the naming
  table`): display (appearance, accent, week start), units (energy, height, weight; no legacy
  metric flag), grams first, the four meal starts as one record, Home sort and pillars, hidden tabs,
  add menu, product block and hidden fields, include today, water (on, goal, unit, quick-add),
  fasting (on, default goal), notifications master, daily summary, water reminder, fasting goal
  and goal-reached alerts, nutrient goals, the rebuild signature, the tune-up's switch, kept plan
  and last check day, onboarding done and terms, AI choices (one record), last backup time.
- [x] Missing values read as their defaults (`settingsRepo.test.ts > get and set > reads every
  default when nothing is stored, and writes nothing`); the reminder defaults follow D-16.41 and
  D-16.61, not either platform (`settingsSchema.test.ts > SETTING_SPECS > starts every reminder and
  alert off, at the decided times (D-16.41, D-16.61)`); the tune-up switch is on when absent
  (`> reads the tune-up switch as on when nothing is stored`); include today and the product block
  default on, grams first off (`> holds the remaining defaults from the specs and decisions`).
- [x] Units: one locale decision for height and weight (`> takes height and weight units together
  from the locale, energy always kcal (R01.18)`).
- [x] A stored value of the wrong type never reaches a screen and is never silently replaced
  (`settingsRepo.test.ts > unusable stored values > reads an invalid stored accent as the default
  and keeps it aside, untouched (R06.1)`, `> fills a snapshot around an unusable row and ignores
  keys it does not know`, `> keeps an unusable value aside before a set replaces it (R05.6)`,
  `> refuses a set over an unusable value that cannot be kept aside, leaving it in place`,
  `update > starts from the default over an unusable value and keeps that value aside`).
- [x] One-transaction read-modify-write (`update > keeps both changes when two updates run at once
  (R06.2)`, `> refuses a change the schema cannot use and leaves the stored value`).
- [x] Hidden tabs change one tab at a time against the stored set (`toggleHiddenTab > hides Coach
  without undoing Progress hidden since the screen last read (R05.13)`, `> shows Progress again
  without touching Coach hidden by a newer change (R05.13)`, `> keeps both tabs when both are
  hidden at once, and hides a tab only once`); unknown names, Home and Settings are dropped
  (`settingsSchema.test.ts > readSetting > drops unknown hidden tabs and keeps tab order, so
  ["home", "coach"] hides only Coach`).
- [x] The load gate (`settingsRepo.test.ts > loaded > resolves with the first snapshot only after a
  write in flight has landed (R06.22)`, `> never writes its first snapshot back, so an edit made
  while loading stays`, `> rejects when the first read fails, without an unhandled rejection`).
- [x] Readers reuse the domain rules: meal times (`readSetting > accepts only meal times that
  increase inside one day, keeping the four starts`), pillars (`> reads Home pillars from an array
  and refuses one with nothing usable in it`), quick-add (`> sorts quick-add amounts and refuses
  any other shape`), water goal (`> keeps the water goal whole and inside the goal wheel`), fast
  goal (`> clamps a stored default fast goal and refuses one that is not a number`), nutrient goals
  (`> reads optional nutrient goals through their own defaults`), kept plan (`> keeps a kept plan
  of nothing apart from an all-automatic plan`), baseline (`> keeps any rebuild baseline string,
  leaving its format to the signature rules`).
- [x] The fasting switch stays a plain boolean row (`get and set > reads and writes the fasting
  switch as a plain boolean row`); live readers follow writes from another tab (`snapshot > follows
  a write from another tab when read live`).
- Deliberate differences: one row per setting in IndexedDB with our dotted keys; reminders are
  `{on, at: 'HH:MM'}` records instead of hour and minute keys, all off (D-16.41, D-16.61); lists
  are arrays, not comma-joined text; a value of the wrong type is kept aside and flagged (the
  reference's typed store just falls back to the default); the goal-weight alert defaults off.
- Not taken: streak, weight and body-fat reminders (D-16.41); the app-update notice and its
  last-notified version, What's New, review, upsell, launch and developer prompts (D-16.43, N-8);
  health-store keys and deletion tombstones (N-5); cloud backup account, file id and hash (N-4:
  only the last backup time is kept); quick-action slots, share-link style, save-to-photos, last
  recents segment, amino-acid estimates, walk/run quick log, workout state, speech and voice
  settings (N-1, N-2, N-7, not carried per 17-naming); the legacy metric flag; migration markers
  (they belong in `meta`); the wizard's `planTouched` (wizard state, P05); onboarding seeding a
  sort order for new users (the onboarding service, P05).

## Decisions for the lead

- `alerts.goalReached` (the goal-weight notification) defaults off with the reminders: every
  notification asks for permission when first turned on (D-16.5, D-16.41). The in-app goal-reached
  dialog (D-16.13, P02-08's bus message) does not depend on it.
- `menu.layout` and `ai.settings` are stored records (or null for "the default menu" / "the AI
  layer's defaults") whose shape is only checked as a plain record here. Their field rules belong
  to the add-menu domain module (P06) and `src/ai/settings.ts` (P03-04), which should decode the
  stored record; the schema entry can then call those decoders.
- The accent and appearance value lists are repeated in `settingsSchema.ts` (`ACCENTS`,
  `APPEARANCES`) because `src/data` imports only the domain; a test holds them equal to
  `src/ui/tokens.ts` and `src/ui/theme.ts`. Moving both lists into the domain later would remove
  the copy. `HIDEABLE_TABS` (`progress`, `coach`) and `PRODUCT_FIELDS` (17-naming §1.4 keys, display
  order) are defined here for now; the shell (P04-05) and the product block (P06) can import them.
- Unit defaults depend on the locale: `createSettingsRepo` takes `locale` (default
  `navigator.language`) and the schema computes `units.height` / `units.weight` from it.
- `storage.nudgeDone` is included (17-naming §1.3) besides `storage.persistAsked`; both booleans.
- `water.goalMl` must be a whole number inside the goal wheel's ml range (50–10 000); a stored
  value outside it is unusable (default + quarantine) rather than clamped.
- `tuneUp.savedPlan`: a target that is present but not a number of 0 or more makes the whole kept
  plan unusable (read as null, nothing kept), so a damaged plan is never half restored; whole
  numbers are rounded.
- A settings row whose key this build does not know is ignored by `snapshot()`, never quarantined
  (it raises no banner).
- `loaded` resolves with the first snapshot and posts `settings-loaded` on this tab only.

## Status

Done (2026-10-26). `settingsSchema.ts`, `repos/settingsRepo.ts` and their tests are in place;
nothing outside the task's files changed. Unit tests: `settingsSchema.test.ts` 25,
`settingsRepo.test.ts` 18, all passing.
