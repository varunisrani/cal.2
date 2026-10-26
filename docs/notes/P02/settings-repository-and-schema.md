# Task: settings repository and schema (P02-04) · Phase: 02 · Owner: builder (wt-p02s1)

Read (reference @ `10e14b67`): `A/data/PreferencesStore.kt` (the `private object Keys` inventory,
lines 1588–1700, plus the hidden-tab setter it points to, lines 744–749),
`IT/TabBarSettingsTests.swift` (for the data part of R05.13 only); research spec
`06-settings-data.md` §2 (reference key names, for translation only), §3.1–3.10 (rows, defaults,
reminders), §3.18 (guard and transactions), §6 R06.21, R06.22; `05-home-progress.md` §3.6–3.7
(water and fasting settings), §6 R05.13; `17-naming-and-glossary.md` §1.2–1.4 (our keys and
values); decisions D-16.1, D-16.10, D-16.40, D-16.41, Proposed D-16.61 (`16-what-we-change.md`).
No Evidence ids.

What it does (own words): every preference the person sets lives as one row per key in the
`settings` table. The schema is the list of every v1 key: what it reads as while nothing (valid) is
stored, and a reader that turns a stored value into ours or says it cannot. Readers are lenient
like the codecs: whole and decimal numbers both work, unknown items of a list are dropped, a list
is put in its fixed order. A stored value a reader cannot read shows as the default and its raw
value is kept aside in the quarantine (with the banner flag), and it is never replaced without that
copy. The repository reads and writes those rows: `get`, `set` (refuses a value its reader cannot
read), `update(key, fn)` as one read-change-write transaction so two callers never lose each
other's change, and `toggleHiddenTab` which reads the stored hidden set inside the write and
changes only the one tab (a page holding an older set cannot undo another change, R05.13). Screens
must not show switches at their defaults before the stored values are known (R06.22): the
repository keeps one live snapshot in memory, `snapshot()` is null until the first read has
finished, and `loaded` resolves with that first snapshot (and `settings-loaded` is posted on the
bus once).

Inputs → outputs:
- `settingsSchema.ts`: `SETTINGS` (key → `{default, read, deviceOnly?}`), `SettingKey`,
  `SettingValue<K>`, `Settings` (every key with its value), `defaultSettings()`, `defaultOf(key)`,
  `readSetting(key, raw)` → value or undefined, `isSettingKey`, `isDeviceOnly`,
  `TIMED_REMINDER_KEYS`, and the closed lists the keys use (`HIDEABLE_TABS`, `PRODUCT_FIELDS`,
  `APPEARANCE_VALUES`, `ACCENT_VALUES`, `WEEK_START_VALUES`, `isClockTime`).
- `settingsRepo.ts`: `createSettingsRepo(db, {bus?, clock?})` →
  `{get, set, update, toggleHiddenTab, snapshot, loaded, feed, close}`; `readSettings(db)` for a
  one-off read of the whole snapshot.

Files: created `src/data/settingsSchema.ts`, `src/data/settingsSchema.test.ts`,
`src/data/repos/settingsRepo.ts`, `src/data/repos/settingsRepo.test.ts`, this note.

Keys and defaults (17-naming §1.3; defaults from the specs and decisions):
- display: `display.appearance` system; `display.accent` basil (D-16.1); `display.weekStart` mon.
- units: `units.energy` kcal, `units.height` cm, `units.weight` kg (onboarding seeds height and
  weight from the browser locale, D-16.10; before that, metric).
- logging and Home: `log.gramsFirst` off; `meals.times` 05:00/12:00/18:00/23:00 (P01-08 reader);
  `home.pillars` protein, carbs, fat, fibre (P01-07 reader, stored as a list); `home.sort` byMeal
  (onboarding seeds newestFirst for new people; not here).
- tabs and menus: `tabs.hidden` none; `menu.layout` null = the default menu (the layout reader is
  P06-01's, not landed: any plain object is kept as is and checked later); `product.show` on;
  `product.hiddenFields` none.
- Progress: `progress.countToday` on.
- water: `water.on` off, `water.goalMl` 2 000 (50–10 000 whole ml, the goal wheel's range),
  `water.unit` ml, `water.quickAddMl` 250/500/750 (P01-05 reader).
- fasting: `fasting.on` off, `fasting.defaultGoalMin` 960 (clamped 60–10 080 by P01-19).
- reminders (D-16.41, D-16.61, every one off): `remind.master` off; `remind.breakfast` 08:00,
  `remind.lunch` 12:00, `remind.dinner` 19:00, `remind.summary` 20:00, `remind.water` 14:00
  (D-16.40), each `{on, at: 'HH:MM'}`; `remind.fastGoal` off; `alerts.goalReached` on (an alert
  when the goal weight is reached, not a reminder; still silent while the master switch is off).
- AI: `ai.settings` null = defaults (opaque record; `src/ai/settings.ts` has not landed, P03
  checks it later).
- goals: `goals.nutrients` the P01-07 starting goals; `goals.rebuildBaseline` none;
  `tuneUp.on` on when absent (P01-16 rule); `tuneUp.lastCheckDay` none; `tuneUp.savedPlan` none.
- onboarding: `onboarding.done` off, `onboarding.termsAccepted` off.
- device only (left out of backups and their hash later, R06.7): `storage.persistAsked` off,
  `storage.nudgeDone` off, `backup.lastAt` none.

Edge cases / failure modes:
- Nothing stored → every key reads its default; nothing is written by reading.
- An invalid stored value (an accent we do not have, a meal-time order that is not increasing, a
  string where a number belongs) → the default, the raw value kept aside once, the flag set; the
  row stays until a write replaces it, and that write copies it first (or is refused).
- A row whose key this build does not know (a newer build, a removed setting) is ignored, never
  quarantined, never deleted.
- `set` with a value the reader cannot read → TypeError, nothing written. Values are stored in the
  reader's normal form (sorted, deduplicated, rounded), so what is stored is what every reader sees.
- `update` with a function that throws, or returns an invalid value → nothing written.
- Two `update` calls at once on the same key → both changes kept (IndexedDB runs the two
  read-write transactions one after the other, each reading inside its own).
- `toggleHiddenTab` with Home or Settings (or anything else) → refused; unknown names in the
  stored list are dropped on read.
- `loaded` never resolves with defaults standing in for unread values: the first snapshot comes
  from a finished read of the table.

Our design differences / decisions:
- One row per key in an IndexedDB table instead of one preferences file; the reference's separate
  hour and minute keys become one `{on, at}` record per reminder; meal times become one record;
  lists (hidden tabs, product fields, pillars, quick-add amounts) are arrays, not comma-joined text.
- Only the reminders D-16.41 keeps (no streak, weight or body-fat reminders); no quick-action slots,
  save-to-gallery, share-link style, language or What's New keys (06 §5, D-16.43).
- Device-only keys are marked in the schema so backup (P09-13) can leave them out.
- The accent and appearance lists are repeated in the schema (the data layer imports only the
  domain); a test checks they equal `src/ui/tokens.ts` and `src/ui/theme.ts`.

Tests we will write:
- Schema: every key reads its default when nothing is stored; every reminder defaults off
  (D-16.41); the tune-up reads on when absent; each reader's normal form (lists ordered and
  deduplicated, unknown tab or field names dropped, meal times via P01-08, quick-add via P01-05,
  fasting goal clamped, water goal rounded and range-checked, reminder times `HH:MM`); the accent
  and appearance lists match the UI's.
- Repository: defaults when empty; an invalid stored accent reads as basil and is quarantined, and
  a later `set` writes over it after the copy; `set` refuses an invalid value; `update` from two
  concurrent callers keeps both; hiding Coach while a stale copy shows Progress visible keeps both
  hidden (R05.13); `toggleHiddenTab` refuses Home; `loaded` resolves after the first read with the
  stored values, never a default first (R06.22), and `settings-loaded` is posted once; the
  snapshot follows later writes; an unknown key is ignored.

Compare checklist (filled after the rewrite; reopened `A/data/PreferencesStore.kt` Keys and the
hidden-tab setter, `A/models/TabBarSettings.kt` (signatures only), `IT/TabBarSettingsTests.swift`):
- [x] Every reference key that v1 keeps has one of ours; the rest are dropped on purpose (list
  below) (`src/data/settingsSchema.test.ts > settings defaults > lists every v1 setting with the
  value it shows while nothing is stored`).
- [x] Defaults match the specs and decisions: system appearance, Monday week start, kcal, grams
  first off, product block on, count today on, water off at 2 000 ml in ml with 250/500/750, fasting
  off at 16 h, notifications off (`settingsSchema.test.ts > settings defaults > lists every v1
  setting …`); every reminder off at 08:00, 12:00, 19:00, 20:00, 14:00 (`> defaults every reminder
  to off, at 08:00, 12:00, 19:00, 20:00 and 14:00 (D-16.41)`); tune-up on when absent (`> reads the
  tune-up switch as on when it is absent or unusable, like the tune-up rules`).
- [x] Missing or empty hidden tabs show every tab; stored in tab order; Home, Settings and unknown
  names never hidden (`settingsSchema.test.ts > readSetting > keeps hidden tabs in tab order,
  without repeats, Home, Settings or unknown names (R05.13)`, `src/data/repos/settingsRepo.test.ts >
  settings: hidden tabs > refuses to hide Home or Settings (R05.13)`).
- [x] Toggling one tab reads the stored set inside the same write and changes only that tab
  (`settingsRepo.test.ts > settings: hidden tabs > hiding Coach while a stale copy shows Progress
  visible keeps both hidden (R05.13)`, `> keeps both tabs hidden when two tabs hide one each at the
  same time (R05.13)`, `> shows one tab again without touching the other, and repeats change
  nothing`).
- [x] Every change that depends on the stored value is read + change + write in one transaction
  (`settingsRepo.test.ts > settings: writing > keeps both changes when two callers update one
  setting at the same time (R06.2)`, `> writes nothing when the change throws`).
- [x] An unreadable stored value is never replaced unseen: shown as the default, kept aside, the
  write refused when the copy fails (`settingsRepo.test.ts > settings: reading > reads an invalid
  stored accent as the default and keeps it aside, never deleting it (R06.1)`, `> settings:
  writing > keeps an invalid stored value aside before writing over it (R06.1)`, `> refuses an
  update and changes nothing when the invalid stored value cannot be kept aside`, `> starts an
  update from the default when the stored value is unusable, after keeping it aside`).
- [x] Pages can wait for stored values instead of flashing defaults (`settingsRepo.test.ts >
  settings: the loaded snapshot > has no snapshot until the first read, then resolves loaded with
  stored values, never defaults first (R06.22)`, `> follows later writes from this tab and another,
  and says loaded only once`).
- [x] Meal times, pillars, quick-add amounts and the fasting goal use the landed domain readers
  (`settingsSchema.test.ts > readSetting > reads meal times with the meal-time rules …`, `> reads
  Home pillars with the pillar rules, from a list`, `> reads quick-add amounts as three whole ml of
  1–5 000, smallest first`, `> clamps the default fasting goal to 1 hour – 7 days, like every fast
  goal`).
- Deliberate differences: one row per key in IndexedDB instead of a preferences file; reminder hour
  and minute become one `{on, at}` record, the four meal-time keys one record, comma-joined lists
  become arrays; device-only keys are marked in the schema; settings changes go through the same
  quarantine as records (the reference only guarded its JSON blobs).
- Not taken (dropped on purpose): the legacy metric flag; streak, weight and body-fat reminders
  (D-16.41); the app-update notification switch and last-notified version (updates show as an
  in-app banner, P09-17); quick-action slots, save-to-gallery, share-link style (06 §5, N-8);
  health, workout, walk/run, amino-acid, speech and voice keys (N-1, N-2, N-5, N-7); cloud backup
  except the last backup time (D-16.30); What's New, review and launch prompts (D-16.43, N-8); the
  last saved-meals segment (17-naming: not carried); migration markers (no migrations yet).

## Decisions for the lead

- `alerts.goalReached` defaults **on** (the reference's default): it is the alert when a weigh-in
  reaches the goal weight, not one of the D-16.41 reminders, and it stays silent while
  `remind.master` (off) is off. Flip the default in `SETTINGS` if D-16.41 should cover it.
- `remind.fastGoal` defaults **off** (D-16.41 lists the fasting goal among the reminders that are
  all off; the reference had it on).
- `ai.settings` and `menu.layout` are opaque records (any plain object, or null for the defaults):
  `src/ai/settings.ts` (P03) and `src/domain/food/addMenu.ts` (P06-01) have not landed. When they
  land, swap `orNone(plainRecord)` for their readers in `SETTINGS` (one line each).
- The accent and appearance lists are repeated in `settingsSchema.ts`, because the data layer
  imports only the domain; `settingsSchema.test.ts` fails if they drift from `src/ui/tokens.ts`
  and `src/ui/theme.ts`. Moving both lists into `src/domain` would remove the copy.
- `HIDEABLE_TABS` and `PRODUCT_FIELDS` (with `isHideableTab`, `isProductField`) live in
  `settingsSchema.ts` for now; P04-05 (tab bar) and P06 (product block) can import them or move
  them into the domain.
- `storage.nudgeDone` is included (17-naming lists it) and marked device-only with
  `storage.persistAsked` and `backup.lastAt` (`isDeviceOnly`), for P09-13's backup and hash (R06.7).
- Units start metric (`cm`, `kg`) until onboarding seeds them from the locale (D-16.10, P04-09 /
  P05); `home.sort` starts `byMeal`; seeding `newestFirst` for people finishing onboarding stays
  with P05 (HANDOFF follow-up).
- `set` and `update` store the reader's normal form (sorted, deduplicated, rounded) and refuse a
  value the reader cannot use (TypeError). `update`'s change function must be synchronous.
- TypeScript widens string literals returned from the `update` callback (a limit of generic calls),
  so callers pass typed values (`const field: ProductField = 'eco'`) or `as const`.
- The repository posts `settings-loaded` on the bus once, when the first snapshot is in memory.
- The task prompt names R05.13 for "no fallback goals before the profile is read"; in the ledger
  that is R05.12 (R05.13 is the hidden-tab rule). This task covers the data part of R05.13 (one
  tab at a time, Home and Settings never hidden) and R06.22 (the loaded gate); P02-05 covers the
  data part of R05.12.

## Status

Done (2026-10-27). Schema, repository and tests in place; no file outside the slice was changed.
The UI parts of R05.13 (P04-05, P09-04) and R06.22 (P09-01) remain with their owners.
