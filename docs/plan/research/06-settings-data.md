# 06 — Settings, data management, notifications, About and platform plumbing: behavioural specification (clean-room)

Scope: the Settings screen as a whole (hub, categories, every row in the sections this area owns), display and
units, meal times, the configuration screens (tab bar, add menu, quick actions, product info), reminders and
notification scheduling, diary export and import, clear/delete data, storage maintenance, cloud backup and
restore, local persistence and its corruption guards, secret storage, About, What's New and post-update prompts,
and languages.
Out of scope (named and pointed to, not detailed): profile fields, units of height/weight, goals and nutrient
targets (`01`), AI access, providers, fallbacks and custom instructions (`03`), speech-to-text, voice assistant and
hosted AI plans/tips (`07`), water and fasting tracking themselves (the water/fasting area spec), workouts (the
workouts spec, later phase), health-store sync (later phase), meal share links (later phase).

Reference: `apoorvdarshan/fud-ai` @ `10e14b67116c52b515d2389621266e32b3a99840`; shipped build checked: none (no
APK/IPA available); marketing site capture `ev_fa243a1fe14ed63cc6252910410ee973c07740c25cc70484db1eab53b44d991a`.
Sources studied: `docs/cloud-backup.md`; Android `ui/settings/*`, `ui/about/AboutScreen.kt`, `data/*` (store,
guards, key store), `export/*`, `backup/*`, notification/policy/storage/update/icon services, What's New and
post-update components, settings models; iOS diary export/import, cloud backup, blob guard, post-update prompts,
notification manager, settings views and the settings part of the main content view; Android unit tests for
export, backup, data guards, policies, models; iOS tests for persistence safety, backup, export/import,
reminders, What's New. REA: only the existing site capture (no new runs; the source settles everything else).

Conventions: "A" = Android behaviour, "I" = iOS behaviour; "both" when they agree. "Store" = the app's single
persisted key/value + JSON-blob store. "Blob" = one persisted JSON value (a list or an object) under one key.
"Diary" = food entries plus water entries. "MUST" marks an invariant the reference defends with defensive code
or a test (a past bug). All energy values are stored as kcal; "display unit" means kcal or kJ.

---

## 1. Overview

Settings is one tab. It opens on a **hub**: two cards of category rows plus a small footer. Tapping a row
replaces the hub with that category's page (back returns to the hub; re-tapping the Settings tab also returns to
the hub). Four configuration screens (Quick Actions, + Menu, Product Information, Tab Bar) are separate routes
pushed from the App Settings page.

This area also owns the plumbing every other area leans on:

```
 UI pages ──► Settings view-model ──► Store (key/value + JSON blobs, one transaction per mutation)
    │                 │                    │  ├─ guard: lenient list decode, quarantine unreadable bytes
    │                 │                    │  └─ consistency: every subscriber sees every completed write
    │                 ├──► Secret store (API keys, backup token)  — never in backups or exports
    │                 ├──► Reminder scheduler ──► OS alarms/notifications ──► dispatch policy at fire time
    │                 ├──► Photo store (files + thumbnails) ◄── storage maintenance (usage, compress, clear cache)
    │                 └──► Backup coordinator ──► archive (JSON payload + photos/) ──► cloud (Drive / iCloud)
    └──► Export (JSON/MD/CSV) / Import (JSON preview → replace range | add as new)
 Launch ──► update check ──► one-shot "update available" notice;  post-update prompt chain (What's New …)
```

What the system guarantees: settings changes persist immediately (no Save button except in sheets); unreadable
stored data is never silently replaced by an empty list; a restore either fully applies or leaves the device
unchanged; Delete All Data never lets a later auto-backup overwrite the cloud copy with an empty phone; API keys
never leave the device through backup or export; energy in exports stays kcal regardless of display unit.

## 2. Reference names (rename in rebuild)

| Kind | Names (reference only; they become banned identifiers) |
|---|---|
| Binary / CLI and flags | iOS launch argument `-fudai.cloudBackup.smokeTest`; smoke-test log tags `CloudBackupSmoke`, `FudAICloudBackupSmokeTest` |
| Env vars | Android build property `cloud.backup.web.client.id` (from `android/oauth.properties`), build field `CLOUD_BACKUP_WEB_CLIENT_ID` |
| Files and folders | Android store file `fudai_prefs` (corrupt copy `fudai_prefs.preferences_pb.corrupt-<ms>`); encrypted key file `fudai_keychain`; quarantine dir `corrupt-backups` (A) / `CorruptDataBackups` (I), file pattern `<key>.json.corrupt-<ms>[-n]`; photo dirs `fudai-food-images`, `fudai-food-thumbnails-v2` (legacy `fudai-food-thumbnails`), staging `fudai-food-images-compressing`, `fudai-food-images-restore`, `fudai-food-thumbnails-restore`; backup temp dir `cloud-backup`, temp prefix `fudai-backup-`; Drive file name `fudai-backup.zip`; archive entries `backup.json`, `photos/`; export file name `Fud-Food-Diary-<yyyy-MM-dd>_to_<yyyy-MM-dd>.<json|md|csv>`; export cache dir `capture`; notice assets `THIRD_PARTY_NOTICES_LiteRTLM_v0.16.0.txt`, `THIRD_PARTY_NOTICES_WhisperBase.txt` |
| HTTP routes / URL schemes | settings routes `QUICK_ACTIONS`, `ADD_MENU`, `PRODUCT_INFO`, `TAB_BAR`; intent action `…action.OPEN_PLAY_STORE`; store URLs `market://details?id=…`, Play web listing, App Store id `6758935726`; author links (X, Instagram, Discord, LinkedIn, GitHub repo + issue templates `bug_report.yml`, `feature_request.yml`), privacy/terms pages on the reference domain, contact mailbox on the reference domain, launch-vote page |
| RPC methods / events / commands | `ACTION_MY_PACKAGE_REPLACED` / `BOOT_COMPLETED` receivers; iOS notification name `ai.fud.cloudBackupDidRestore`; voice-assistant settings sections (`PROFILE`, `GOALS`, `REMINDERS`, `NOTIFICATIONS`, `AI_PROVIDERS`, `SPEECH`, `VOICE_ASSISTANT`, `APPEARANCE`, `WORKOUTS`, `HEALTH`, `DATA`, `ABOUT`) |
| Settings and storage keys | Display: `appearanceMode`, `appThemeColor` (default `fudPink`), `weekStartsOnMonday`, `energyUnit` (`kcal`/`kj`), `useMetric`, `heightUnit` (`cm`/`ftin`), `weightUnit` (`kg`/`lbs`), `foodMeasurementPreferGramsByDefault`, `saveMealPhotosToGallery`, `mealShareLinkStyle`. Meal times: `mealBreakfastStartMinutes`, `mealLunchStartMinutes`, `mealDinnerStartMinutes`, `mealSnackStartMinutes`. Config: `hiddenTabs`, `addMenu.config`, `quickAction.slot1..3`, `productInfoShown`, `productInfoHiddenFields`. Reminders: `notificationsEnabled`, `streakReminderEnabled/Hour/Minute`, `dailySummaryEnabled/Hour/Minute`, `weightReminderEnabled` (A) / `weightLogReminderEnabled/Hour/Minute` (I), `bodyFatReminderEnabled` (A) / `bodyFatLogReminderEnabled/Hour/Minute` (I), `breakfast|lunch|dinnerReminderEnabled/Hour/Minute` (I), `goalReachedNotificationsEnabled`, `appUpdateNotificationsEnabled`, `waterReminderEnabled/Hour/Minute`, `fastingGoalNotificationEnabled`, `lastNotifiedUpdateVersion` (A) / `lastNotifiedAppUpdateVersion` (I). Backup: `cloudBackupEnabled`, `cloudBackupLastAt`, `cloudBackupLastHash`, `cloudBackupAccountEmail`, `cloudBackupFileId`. Prompts: `hasCompletedOnboarding`, `hasSeenWhatsNew.liveVoice`, `hasNotifiedWhatsNew.liveVoice`, `hasCompletedMeetDeveloperPrompt`, `hasSeenHostedUpsellPrompt` (+ `.android-7.2`, `.2026-09-28`), `hasSeenProductHuntLaunchPrompt.2026-09-29`, `productHuntLaunchNotificationScheduled.2026-09-29` (and `.2026-09-27` variants), `reviewPromptedAfterFirstLog`. Data blobs: `userProfile`, `foodEntries`, `favorites`, `favoriteFoodEntries`, `pendingFoodAnalysisDraft`, `weightEntries`, `bodyFatEntries`, `bodyMeasurements`, `waterEntries`, `fastingSessions`, `coachChatHistory`, `workoutDiaryStateV1`, `widget_snapshot_v1`, `importedHealthWorkoutsV1`, `deletedWeightEntryIds`, `deletedBodyFatEntryIds`, `healthNutritionImportedKeys`. Migration markers: `geminiModelMigrationVersion`, `aiModelRegistryMigrationVersion`, `fallbackBaseURLMigrationVersion`, `matchingSpeechProviderMigrationVersion`. Secret keys: `apikey_<PROVIDER>`, `speechApiKey_<PROVIDER>`, `usdaFoodDataCentralApiKey`, `weekly_challenge_bearer_token_v1`, `cloud_backup_access_token_v1`. |
| Other (scopes, error tags, IPC channels) | Notification channels `streak_reminder`, `daily_summary`, `weight_goal`, `weight_log_reminder`, `body_fat_log_reminder`, `app_update`, `water_reminder`, `fasting_goal`, `announcements`, `workout_rest`; request codes 1001–1010; notification ids 4242, 5555, 6666, 7777, 8888; iOS request ids `meal.breakfast|lunch|dinner`, `water.reminder`, `fasting.goal`, `smart.streak`, `smart.summary`, `smart.weight`, `smart.bodyfat`, `app.update`, `producthunt.launch`. Backup format id `fudai-cloud-backup`, version `1`, platform `android`/`ios`, value tags `b`/`i`/`s`/`ss`/`d`. Diary export app id `Fud AI`, `format_version` `1.5` (import accepts major `1`), legacy example `1.3`; source labels `manually_edited`/`ai_estimated`. CloudKit container `iCloud.com.apoorvdarshan.calorietracker`, record type `FudAIBackup`, fields `backupAsset`/`contentSha256`, records `current`/`smoke-test`. Theme names: Fud Pink (default), Red, Orange, Green, Mint, Teal, Blue, Purple, Yellow, Coral, Rose Gold, Mocha Brown, Indigo, Lavender, Sky Cyan, Graphite, Baby Pink, Lime; per-colour launcher aliases `<Name>LauncherActivity`. Feature names: "Live Voice", "Plus"/"Pro", "Support Fud AI", "Meet the developer", Product Hunt launch (2026-09-29 00:01 America/Los_Angeles). Test tags `settings.category.<NAME>`, `settings.cloudBackup.toggle|lastBackup|backupNow|restoreNow|delete`, `settings.notifications.enabled`, `settings.water.enabled`, `settings.tabBar.<route>`, `settings.water.quickAdd.<i>`. Upstream bug id AndroidX DataStore b/431787506. |

Third-party protocol names used by this area (keep exact; check against vendor docs before use):
- Google Drive v3 (appData backup): list `GET https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=…&fields=files(id,modifiedTime,name)&pageSize=1`;
  create `POST https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart` (metadata part `{name, parents:["appDataFolder"]}` + `application/zip` part, `multipart/related`);
  update `PATCH https://www.googleapis.com/upload/drive/v3/files/{id}?uploadType=media`;
  download `GET https://www.googleapis.com/drive/v3/files/{id}?alt=media`; delete `DELETE https://www.googleapis.com/drive/v3/files/{id}` (404 tolerated);
  header `Authorization: Bearer <token>`. Scopes `https://www.googleapis.com/auth/drive.appdata` and `https://www.googleapis.com/auth/userinfo.email` only (never full Drive).
  Email: `GET https://www.googleapis.com/oauth2/v2/userinfo` (`email`). Revoke: `POST https://oauth2.googleapis.com/revoke` with form field `token` (400 tolerated; token in body, never URL).
- Apple iTunes lookup (I update check): `https://itunes.apple.com/lookup?id=<id>&country=us`, fields `results[].version`, `results[].trackViewUrl`.
- Google Play In-App Updates API (A update check), CloudKit private DB (I backup) — native-only, no PWA equivalent.
- Web platform for the PWA: Notifications API, Push API + VAPID, Service Worker `registration.update()`, `navigator.storage.persist()` / `estimate()`, Web Share API (files), BroadcastChannel, Web Locks, IndexedDB, WebCrypto, Google Identity Services token client (if Drive is kept).

## 3. Behaviour

### 3.1 Settings hub and navigation

- **Trigger / inputs:** Settings tab; voice assistant can open a category (`07`).
- **Flow:** hub shows card 1 "preferences" rows, card 2 "app info" rows, then a footer (made-by line + a
  small tagline). Each row = accent-tinted icon bubble, title, chevron. Tap → category page with a back link
  labelled "Settings" and a 28 pt bold title. [obs both, same order]
- **Order (both):** Preferences: Personal Info → Goals & Nutrition → Tracking & Notifications → AI Access →
  AI Providers & Fallbacks → Speech-to-Text → Voice Assistant → App Settings → Workout → Health & Data → Data
  Management. App info: App & Updates → Support (brand-named) → Help & Feedback → Community → Legal. [obs]
- **States:** hub ↔ category (system back or back link or re-tapping the tab returns to hub). A category page
  whose values come from the stored settings snapshot shows a spinner until the snapshot has loaded, instead of
  briefly showing every switch at its default (MUST — a fresh process would otherwise flash defaults). The voice,
  AI-access and About pages fetch their own state and skip this gate. [obs A]
- **Owned elsewhere:** Personal Info and Goals & Nutrition → `01`; AI Access, AI Providers & Fallbacks
  (primary/text/image providers, fallbacks, timeouts, reasoning effort, max tokens, on-device models, custom AI
  instructions) → `03`; Speech-to-Text and Voice Assistant → `07`; Workout (training split, RPE scale, rest
  timer, walk/run quick log) → workouts spec; Health & Data (health-store sync, permissions) → later phase.
- **Evidence:** [obs] settings category enum and hub composable (A), settings category enum (I).

### 3.2 App Settings page (rows in order, defaults)

| # | Row | Control | Default | Behaviour |
|---|---|---|---|---|
| 1 | Appearance | list sheet | System | System / Light / Dark; applies immediately app-wide. [obs both] |
| 2 | App Language | list sheet | System | A only: "System" + 19 languages (see 3.23). I has no in-app picker (uses the OS per-app language). [obs] |
| 3 | Theme Color | inline menu with swatches | pink accent | 18 presets, each a two-stop gradient (start colour = accent; gradient used on primary buttons). A also swaps the launcher icon to the matching colour variant; I swaps the alternate app icon. [obs] |
| 4 | Default to Grams | switch + info | off | New food review sheets open with grams as the unit; the user can still switch unit. [obs] |
| 5 | Save to Photos | switch + subtitle | off | Also save meal photos to the device gallery when logging; old Android asks storage permission and denial leaves it off. [obs] |
| 6 | Week Starts On | list sheet | Monday | Sunday / Monday; drives week strips and weekly views. [obs both default Monday] |
| 7 | Energy Unit | list sheet | kcal | kcal / kJ (3.3). |
| 8 | Share Links | list sheet | unset | Meal share link style (short preview link vs direct link); unset until first share asks once → meal-share spec, later phase. [obs] |
| 9 | Quick Actions | push screen | — | 3.7 |
| 10 | + Menu | push screen | — | 3.6 |
| 11 | Product Information | push screen | — | 3.8 |
| 12 | Tab Bar | push screen | — | 3.5 |

All rows write through immediately; the view state updates after the write completes. [obs A]

### 3.3 Display and units

- **Energy unit:** stored values (entries, goals, burns, AI requests/replies, exports) stay canonical kcal; only
  display and typed input convert. 1 kcal = 4.184 kJ (thermochemical). kJ display rounds to whole numbers.
  Parsing typed amounts accepts locale-grouped or decimal input; empty, non-numeric, non-finite or negative →
  invalid. Goal picker bounds: kcal mode min 800, max 6,000, step 50; kJ mode min 3,400, max 25,100, step 100.
  Initial picker position = current goal in display units, rounded down to the step grid, then
  limited to the bounds; saving an untouched kJ wheel keeps the exact
  stored kcal goal (MUST, otherwise every open/save nudges the goal). When kJ is chosen, AI prompts gain one line
  telling the model the user reads kJ while every number given to it and every tool argument stays kcal (prompt
  wording owned by `03`). Notification texts use separate kJ sentences so plural agreement holds. [obs both]
- **Metric/imperial:** height unit cm | ft-in and weight unit kg | lb are separate settings edited inside the
  height/weight sheets (`01`). Defaults differ: A metric (falls back to a legacy single metric flag, default
  metric); I ft-in and lb. [obs] → open question Q5.
- **Water unit:** ml | fl oz (1 fl oz = 29.5735295625 ml), shown in Tracking (3.4) → water/fasting spec.
- **Appearance:** system/light/dark. Background/card colours are the reference's; Platewise defines its own
  tokens.
- **Week start:** Monday default (both). Note the diary export's "This week" ignores it (R06.17).

### 3.4 Tracking & Notifications page

Card 1 (tracking), in order: **Meal Times** (sheet, 3.4.1) → **Water Tracking** switch (default off); when on:
Daily Water Goal (wheel 50–10,000 ml step 50, or 2–338 fl oz step 1; default 2,000 ml), Water Unit (ml/fl oz),
Quick Add Amounts (3 presets, default 250/500/750 ml, each 1–5,000 ml) → **Fasting Tracking** switch (default
off); when on: Default Fasting Goal (wheel 1–168 h, default 16 h; stored as minutes clamped 60–10,080). Card 2
(notifications): master **Notifications** switch, then (when on) the notification-type rows (3.10) and, on A, a
battery-optimisation shortcut row that opens the OS exemption screen. [obs A; I equivalent with per-reminder
time pickers]

- Turning water tracking off also turns the water reminder off and cancels it. Turning fasting tracking off
  **ends** (not deletes) an active fast and removes the fasting channel; turning it on creates the channel.
  [obs A] Details of water/fasting logging → water/fasting spec.
- Quick-add editing: fields untouched by the user keep their exact stored ml (no ml→fl oz→ml round trip); Save is
  disabled while any field is invalid; Reset restores the defaults; saved presets are sorted. [obs A]

#### 3.4.1 Meal times

- `MealSchedule { breakfastStart, lunchStart, dinnerStart, lateSnackStart }` in minutes after midnight.
  Defaults 05:00, 12:00, 18:00, 23:00. Valid iff 0 ≤ breakfast < lunch < dinner < snack < 1,440; an invalid
  stored schedule reads as the default. [obs both; tests]
- Classification of a time t: t ≥ snack or t < breakfast → snack; else ≥ dinner → dinner; ≥ lunch → lunch;
  else breakfast (late snack wraps overnight). Used to pre-select the meal when logging; the user can still
  change it.
- Editor: list of the four boundaries with formatted times; tapping one opens a 15-minute-step wheel restricted
  to keep at least 15 min from neighbours (breakfast 0…lunch−15; lunch breakfast+15…dinner−15; dinner
  lunch+15…snack−15; snack dinner+15…1,439), the current value always included even if off-step. Save, "Restore
  default times", Cancel. [obs A]

### 3.5 Tab bar settings

- Hideable tabs: Progress, Coach, Workouts (Home and Settings always shown). Stored as a comma-joined list of
  hidden route names in fixed tab order; unknown values (including Home/Settings) ignored, so a missing value
  shows every tab. [obs both; tests]
- Toggling one tab reads the stored set inside the same write and changes only that tab (MUST — a screen
  holding an older set must not undo another change). The switch flips immediately; the stored value then wins.
- If the tab on screen becomes hidden (here or by a restored backup), the app navigates to Home; navigation
  requests to a hidden tab are ignored. [obs A]

### 3.6 Add-menu ("+ Menu") settings

- `AddMenu { version: 2, groups: Group[≤3], standalone: Method[] }`, `Group { id, name, methods: Method[] }`.
  Methods (10): camera+note, photos, barcode, text, voice, manual, recent, frequent, favorites, copy from day.
  Default: three groups — photo/scan (camera, photos, barcode), describe (text, voice, manual), reuse (recent,
  frequent, favorites, copy from day); no standalone. Default group names are stable identifiers resolved to
  localised labels at display time. [obs both]
- Sanitising on save: keep at most 3 groups; drop unknown methods; each method at most once across the whole
  menu (first occurrence wins); empty groups dropped; blank names → a "New Group" identifier; names trimmed.
  The editor keeps empty groups and names as typed until saved elsewhere. Version-1 data: when any group has
  methods, its standalone list is ignored. Decode failure → default; a stored menu that sanitises to empty but
  had configured content → default; an empty menu that was empty on purpose stays empty. [obs; tests]
- Editor: group count stepper 0–3 (0 = flat layout: all visible methods become standalone; going from 0 to ≥1
  rebuilds the default groups if nothing is standalone, else one group holding the standalone methods; extra
  groups added empty; removing drops the last). Per group: rename, move group up/down, move method up/down,
  remove method, "Add Method" (from hidden methods). Standalone section (when it has items or hidden methods
  exist). Hidden Methods section: tap to restore — to the explicit target, else flat layout → standalone, else
  last group, or first non-empty group when the last is empty. "Reset to Default". Footer: water and fasting
  entries stay separate; this does not change OS quick actions. [obs A]
- Edits are refused until the stored menu has loaded, and a startup snapshot must not overwrite an edit made
  during the load gap (MUST, test). [obs]

### 3.7 Quick actions (app-icon shortcuts)

- Three slots, each one of 10 actions (camera+note, photos, voice, text, barcode, favorites, frequent, recent,
  manual, fasting). Defaults: camera, voice, barcode. Duplicates allowed; unknown stored value → that slot's
  default. Each slot opens its action directly from the OS app-icon long-press menu. [obs both]
- I also lets slots be bound to OS automation (Action Button/Back Tap) — out of scope.

### 3.8 Product information settings

- "Show product information" switch (default on) plus per-field visibility for 11 barcode-product fields, in
  display order: barcode, data source, package quantity, Nutri-Score, NOVA group, Eco-Score, allergens, traces
  ("may contain"), labels, categories, ingredient label. Hidden fields stored as a comma-joined list of stable
  field keys; unknown keys ignored. A field renders only if shown, not hidden, and it has a value; when nothing
  renders the whole block (and its header) is skipped. Allergen warnings are deliberately absent from this list:
  they appear whenever the profile has sensitivities set, so this screen cannot switch them off. [obs both; tests] Product data itself → logging spec.

### 3.9 Notifications master switch and permission

- Off by default. Turning on requests OS permission (A: runtime permission on API 33+; I: authorization
  request). Only a grant turns the stored switch on; denial leaves it off and shows a message (A dialog; I footer
  link to system settings when status is denied). Invariant: the switch never claims notifications can fire
  when they cannot. [obs both]
- When on, A lists the notification types (3.10) and shows a note when none is selected (notifications allowed
  but every reminder off is legitimate). Turning the master off cancels every scheduled reminder (A via a
  schedule sync; I removes all pending requests). [obs]
- Onboarding: A stores the user's onboarding choice; I asks for permission there and, if granted, schedules the
  three meal reminders at 08:00/12:00/19:00. [obs]

### 3.10 Reminder types and schedule logic

| Reminder | A default (time) | I default (time) | A schedule | I schedule | Skip rule |
|---|---|---|---|---|---|
| Food log reminder ("streak") | off (19:00) | on (21:00) | daily alarm, re-armed | one-shot for today, re-added on foreground and on every diary change | A: skip if any food logged today (fail open on read error). I: only scheduled if nothing logged today **and** current streak > 0 (see R06.12) |
| Meal reminders (breakfast/lunch/dinner) | — (not on A) | on (08:00 / 12:00 / 19:00) | — | repeating daily calendar triggers, re-added on every foreground so text follows the current language | none |
| Daily summary | off (21:00) | on (20:00) | daily alarm | one-shot for today, content computed at schedule time | none (3.11) |
| Weight log reminder | on (08:00, fixed) | on (08:00) | daily alarm | one-shot | A none; I skip if a weight was logged today |
| Body-fat log reminder | on (08:00, fixed) but only scheduled when the profile has a body-fat value | off (08:00) | daily alarm | one-shot | A none; I skip if logged today |
| Water reminder | off (14:00) | off (14:00) | daily alarm | repeating daily | needs water tracking + its switch + master |
| Fasting goal reached | on | on | one-shot at the active fast's goal time; re-armed after reboot/app replace | one-shot time-interval trigger measured when the request is actually added | needs fasting tracking + switch + master; none if goal time already passed (I: ≤ 1 s) |
| Goal weight reached | on | — | posted immediately when the goal weight is reached (weight area) | — | toggle |
| App update available | on | on | one-shot when the launch update check finds a newer version | same | at most once per version (last-notified version stored, excluded from backup) |
| What's new | — | — | one-shot after an app update, existing users only | — | 3.22 |
| Launch-day reminder | — | — | one-shot at a fixed instant | same | 3.22 |

- A times other than the food-log/summary/water ones are fixed in code; A has no time pickers. I shows a
  per-reminder switch + time picker for meal, water, streak, summary, weight and body-fat reminders. [obs]
- A schedule computation: next occurrence of HH:MM today, else tomorrow (seconds zeroed); inexact
  allow-while-idle alarm. On fire: re-arm first at **now + 24 h** (so suppressing today's nudge or a transient
  storage error never disables tomorrow), then decide whether to post. Startup re-runs the full schedule sync.
  Alarms do not survive reboot except the fasting goal and the launch reminder, which a boot receiver re-arms.
  [obs A] (R06.10, R06.11)
- A notification tap opens the app (update notice opens the store listing). [obs]

### 3.11 Daily summary policy

- `burned = measuredTotal` if > 0; else `BMR + externalActive` when both > 0; else unknown → the summary posts a
  static fallback line. `balance(eaten, burned)`: both clamped ≥ 0; `d = burned − eaten`; d > 0 → deficit, d < 0
  → surplus, 0 → balanced; difference = |d|. Balance is decided in kcal; only shown numbers convert to kJ.
  [obs A, both tests]
- A builds the measured text at fire time only when health sync and background energy reads are permitted;
  otherwise static text. I instead shows "eaten X of goal Y, Z remaining" (remaining = max(0, goal − eaten);
  for kJ the conversion is applied to eaten and goal first, then subtracted). [obs]
- PWA: no health store → the I-style "eaten of goal, remaining" text is the only option.

### 3.12 Reminder dispatch policy

- `shouldPost(isFoodLogReminder, hasLoggedToday) = !isFoodLogReminder || !hasLoggedToday`. Non-food
  reminders are never suppressed by food logs. [obs A + test]
- A posts only if the OS permission is granted at fire time (re-checked; a revocation between check and post is
  swallowed). It does **not** re-check the in-app master/type switches at fire time (R06.10).

### 3.13 Export diary

- **Trigger / inputs:** Data Management → Export Food Diary sheet: range chips Today / This week / This month /
  All time / Custom (default This week; custom From/To date pickers default today−7 … today), format chips JSON /
  Markdown / CSV (default JSON), Export button. [obs both]
- **Range resolution:** Today = today..today; This week = A Monday of this week..today (ignores week-start
  setting), I locale-calendar week start..today; This month = 1st..today; All time = earliest food or water
  date..today (today when empty); Custom = picked days; start > end is swapped. [obs]
- **Content:** days in range that have food **or** water (water-only days included). Nothing in range → error
  "nothing to export", no file. Targets = profile effective calories/protein/carbs/fat (0 without a profile).
  Within a day, meals in fixed order (breakfast, lunch, dinner, snack…); A sorts items by time ascending, I by
  time descending. Numbers rounded to 1 decimal; calories integer. Source label: manual edits vs AI estimated
  (every non-manual source collapses to "AI estimated"). [obs]
- **JSON:** `Doc { export: { appId, formatVersion "1.5", dateRange{start,end} }, days: Day[] }`,
  `Day { date yyyy-MM-dd, totals, targets, remaining (each {calories, protein, carbs, fat}; remaining clamped ≥
  0), meals: { type (lower-case), items: Item[] }[], waterEntries: {id, time HH:mm, ml}[], waterTotalMl }`,
  `Item { entryId (uuid), name, quantityG?, calories, protein, carbs, fat, 23 optional nutrients (sugar, added
  sugar, fiber, saturated/mono/poly-unsaturated/trans fat, cholesterol, caffeine, sodium, potassium, calcium,
  iron, magnesium, zinc, vitamins A/C/D/B12/E/K, folate, omega-3; unit-suffixed g/mg/mcg), supplementalNutrients
  (name → grams map; small amino-acid values keep milligram precision, e.g. 0.011), time HH:mm, source, note?,
  ingredients: {name, quantityG, calories, protein, carbs, fat}[] }`. A writes absent optionals as explicit
  nulls, I omits them. [obs; tests]
- **Markdown:** title, range line, generator line, a kcal notice line for kJ users; per day: totals vs targets
  (calories, protein, carbs, fat, water ml), a water table (time, ml) when present, then one table per meal with
  32 columns (time, food, weight, calories, P/C/F, the 23 nutrients, source, ingredients); missing values "-";
  `|` in names replaced with `/`; ingredients rendered as "name (g · kcal · P · C · F)" joined by "; ". [obs]
- **CSV:** one header row with 38 columns: date, meal, time, food, weight_g, calories, protein/carbs/fat, the 23
  nutrients, source, note, ingredients, entry type, water ml, water total ml. Food rows have entry type "food";
  one "water" row per water entry (food name "Water", only date/time/ml filled); one "water_total" summary row
  per day (always, even with 0 ml). For kJ users the energy column header gains an explicit kcal suffix; values
  stay kcal. RFC-4180-style quoting when a field contains comma, quote or newline. [obs both; tests]
- **Output:** file name = brand prefix + `<start>_to_<end>.<ext>`; MIME application/json, text/markdown,
  text/csv; handed to the OS share sheet; failure shows the error under the button. [obs]

### 3.14 Import diary

- **Trigger:** Data Management → Import Food Diary opens a file picker (A: JSON or plain text; I: JSON). Files
  > 20 MiB (20 × 1,024 × 1,024 bytes) are rejected before parsing. [obs both]
- **Format detection / validation (whole file rejected on the first error, nothing partially applied):**
  must decode as the export JSON shape (unknown fields ignored); app id must equal the reference id
  (case-insensitive) else "not a valid diary"; `formatVersion` major must be 1 else "format not supported";
  range dates must parse; every day date must parse and fall inside the declared range; meal type must be a
  known one (case-insensitive); item name non-blank; calories ≥ 0; every numeric field finite and ≥ 0
  (including supplemental values); time must parse (HH:mm); entry id optional but if present must be a UUID
  (missing → new random id, legacy files); ingredient name non-blank and numbers finite ≥ 0; water amount > 0
  (I also ≤ 2³¹−1), id must be a UUID, time HH:mm; I additionally rejects a water time that does not exist on
  that day (DST gap) by round-tripping. No food and no water → "no entries". [obs both; tests]
- **Preview:** counts of food entries and water entries, date range (medium date format), two actions:
  "Replace This Date Range" (primary) and "Add as New Entries"; busy spinner; dismiss blocked while importing.
  Success shows "imported N entries" (food + water). [obs]
- **Replace date range (de-duplication):** existing entries outside the range are kept untouched. For each
  imported item, match an existing in-range entry first by id, else by key (local day, time truncated to the
  minute, meal type, trimmed lower-cased name), each existing entry matched at most once. A match keeps its id
  and **its media** (photos, other metadata) and takes all nutrition/name/time/meal/note/ingredient fields from
  the file. No match → keep the file's id unless an entry outside the range already uses it (then a fresh id).
  Existing in-range entries that match nothing are removed. Duplicate ids already in the diary must not crash
  (later row wins). [obs both; tests]
- **Add as new:** existing diary + every imported item with a fresh id. [obs]
- **Water:** only when the file carries water arrays at all (legacy food-only files leave water untouched, MUST,
  test). Replace: drop existing water in range, add imported water keeping ids unless taken; Add: append with
  fresh ids. [obs]
- Imported entries get source "manual" or "text input" from the label; photos are not in the file.
- After import the photo GC runs; health-store sync side effects → later phase.

### 3.15 Clear Food Log and Delete All Data

- **Clear Food Log** (warning colour, confirm dialog, destructive "Clear"): empties the food log and prunes
  photos no longer referenced; profile, weights, saved meals/favourites and settings stay. [obs A]
- **Delete All Data** (destructive colour, confirm): in this order — prepare remote weekly-challenge deletion
  (later phase); stop the workout rest timer; **turn backup off and forget the backup session, waiting for any
  running backup** (MUST); clear the whole store; clear the secret store (keeping a challenge token only if the
  remote deletion still needs to retry); delete all photos; then restart into onboarding. Health-store data is
  left alone. I additionally cancels all pending notifications, clears widgets and the coach chat explicitly.
  The cloud backup file itself is kept. [obs both] (R06.5, R06.10)

### 3.16 Storage usage card and maintenance

- Card under Data Management: rows Saved Photos (bytes of stored photos), On-device Models (bytes; `03`/`07`),
  Cache (thumbnails + downloaded workout frames, both regenerable), then actions Compress Photos and Clear Cache,
  and a footer. Sizes show "…" until measured; measured on open and after each action. Nothing runs
  automatically. [obs both]
- **Compress Photos** (confirm dialog, destructive style): for each stored photo whose longest side exceeds
  2,048 px, re-encode as JPEG quality 80 at ≤ 2,048 px, one photo at a time; replace the original only if the
  copy is smaller **and** the original is unchanged (same size and mtime) since it was read, via staged file +
  atomic rename; undecodable photos are left byte-identical and counted; a restore in progress blocks
  replacement (counted as failed). Progress "n/total" in the row label. Result dialog: "freed X" if anything
  shrank, "nothing to compress" if nothing needed it, plus notes for unreadable/failed counts; an unexpected stop
  reports the unreached photos as failed (never as "nothing to do"). Only plain photo names directly inside the
  photo folder are examined. Work continues if the user leaves Settings. [obs; tests]
- **Clear Cache:** deletes thumbnails and workout frames only, never photos; both are rebuilt on demand.
- Only one action at a time (busy gate).

### 3.17 Cloud backup and restore

- **Opt-in only.** Off by default; sign-in happens only when the user turns the switch on (or picks Restore on
  the onboarding "welcome back" screen, `01`). The app never probes the cloud at install. A: Google Drive
  appData folder (account picker always shown; scopes appdata + email only). I: iCloud private database, single
  record, phone's iCloud account (no separate sign-in). [obs; doc]
- **UI (A order):** switch "Google Drive Backup" → "Signed in as <email>" → "Last backup: <yyyy-MM-dd HH:mm>" →
  footer (off until turned on; sign-in only for backup; API keys stay on the phone) → when enabled: Back up now,
  Restore now, Delete cloud backup (red, confirm); when signed in: Sign out, Switch account; spinner while busy;
  errors in a dialog. I: same minus sign-out/switch account. [obs]
- **Enable flow:** confirm dialog → sign-in → look up an existing backup. If one exists: "Restore backup?" with
  Restore / Keep this phone. Keep → backup turned on and this phone uploaded. Restore → download and apply;
  backup turns on **only when the restore succeeds** (MUST: a failed restore with backup on would let the next
  auto-backup overwrite the cloud copy). No existing backup → upload. A failed lookup is a failure, never "no
  backup" (MUST, test). [obs]
- **Archive format (behaviour):** a ZIP containing `payload` (a JSON document) first, then one entry per photo
  under a photos folder. A deflates entries; I writes store-only (no compression), no ZIP64 (fails beyond 65,535
  entries or 4 GiB instead of overflowing). Document: `{ formatId, formatVersion: 1, exportedAt (ISO-8601),
  appVersion, platform, contentHash (SHA-256 hex), payload: { values: map key → typedValue } }`, typedValue
  tagged bool | int | string | string-set (I also raw-bytes as base64). [obs both]
- **What is included:** every stored setting and data blob (profile, food entries with their original UUIDs,
  favourites, weights, body fat, measurements, water, fasting, coach chat, workouts, all preferences) except
  device-local keys: health-store sync tokens/flags, imported other-app workouts, widget snapshot,
  last-notified update version, the backup file id, one-shot alarm/launch flags, the "already notified What's
  New" flag, and (I) every OS-owned or health-prefixed key except the health-enabled switch, plus the
  challenge bearer token. API keys and the backup access token live in the secret store and are **never**
  included. Photos: every stored photo whose name passes the safe-name rule. [obs; tests]
- **How IDs are preserved:** entries keep their UUIDs (they live inside the restored blobs verbatim); photo
  files keep their names, so entry→photo references stay valid; after restore the app marks "health food
  restore done" and clears health change tokens so a later health-store import (which upserts by the same IDs)
  creates no duplicates. [obs; doc]
- **Content hash:** SHA-256 over a canonical text: values sorted by key as `key=type:value` lines (string sets
  sorted and comma-joined) followed by `photo:<name>:<byteSize>` lines sorted by name — photos count by name and
  size, never bytes. Used to skip unchanged auto-backups (see R06.7). [obs]
- **Safe photo names:** ASCII letters, digits, `.`, `_`, `-` only; extension jpg/jpeg/png/webp
  (case-insensitive); ≤ 128 characters; no leading dot; no `..`; no directory part. Restore only accepts entries
  under the photos folder with such names; everything else is skipped. (I also refuses staging names that
  resolve through symlinks.) [obs; tests]
- **Backup:** snapshot values and photo list → hash → (auto: skip if equal to last hash) → pack to a temp file
  (photos streamed one at a time; if a photo listed in the snapshot is gone or unreadable when packing, the
  whole backup errors out — MUST, because its name and size are already in the hash, so a silently shortened
  archive would later look "unchanged" and never be redone) → upload (create, or overwrite the known file id) → store file id, hash, last-at
  and enabled. Temp archives from killed processes are deleted before each operation. [obs]
- **Auto-backup:** on app going to background (A onStop, I scene background) when enabled, ≥ 15 min since last
  backup, on an unmetered network (A checks; I always true), and (I) only after onboarding is complete; failures
  are silent. All backup operations are serialised by one lock; auto-backup re-checks "enabled" inside the lock.
  [obs]
- **Restore:** download to a temp file → inspect: read every entry to the end (CRC checked) and validate the
  document before touching anything; wrong format id → "not a backup"; newer version → "needs a newer app"
  (fail closed) → free-space check: photo bytes + 64 KiB per photo + payload bytes + 16 MiB reserve, else "not
  enough storage" before anything changes → stage every photo (any read/write failure aborts with photos and
  values untouched) → move staged photos in → write values (A: clear the store, then write every non-excluded
  value; I: remove allowed keys missing from the backup, then write) → re-set backup bookkeeping (enabled,
  email, file id, last hash = document hash, last-at = document export time) → prune photos the restored diary
  does not reference (A via the reference-checked GC; I deletes photos not in the archive) → reschedule
  reminders from the restored settings. Once staging starts the restore runs to completion even if the screen
  closes. "Restore now" runs **without** a confirmation on both platforms (R06.8). [obs; tests]
- **Sign out / disable:** revoke the token (best effort), clear token, enabled, email, file id, last-at, last
  hash; the cloud file stays. **Delete cloud backup:** delete the file (404 ok), clear the same state, revoke,
  backup off. [obs A]
- **Errors:** VM/out-of-memory and blank messages show a generic "error" text; no-space has its own message;
  photo write failure → generic. Drive HTTP timeouts: connect 30 s, read 120 s, write 120 s. [obs A + tests]

### 3.18 Local persistence

- **What is stored where (reference):**
  - A: one key/value store file holding every setting plus JSON blobs for each entity list (profile, food,
    favourites, pending analysis draft, weights, body fat, measurements, water, fasting, coach chat, workout
    state, widget snapshot, deletion tombstones for weight/body-fat ids, health import ledger). Unknown enum
    values in rows coerce to the field default instead of failing the row; unknown fields are ignored. Photos
    and thumbnails are files. API keys and tokens are in a separate encrypted store. [obs]
  - I: OS user defaults with JSON data blobs (guarded for food, favourites, weight, profile, workouts),
    Keychain for API keys, photo files, a quarantine folder in Application Support. [obs]
- **List guard (A PersistedJsonGuard / I PersistedBlobGuard):** decoding distinguishes **Missing** (never
  written → empty), **Decoded(items, dropped, raw)** (whole decode or element-wise lenient decode that drops
  unreadable rows), and **Corrupt(raw)** (not an array / nothing decodable). Reads of Corrupt show empty but the
  raw bytes are preserved before any overwrite: the next mutation copies the raw text to
  `<key>.json.corrupt-<ms>` (unique suffix `-1`, `-2`… never overwriting an earlier copy) in a quarantine
  folder via temp file + rename; if the file copy fails, A stores the raw text under a backup key in the same
  transaction; I refuses every write (write-blocked) until a copy exists. Partially decoded lists (dropped > 0)
  are also preserved before overwrite. I re-reads the live value before every write and quarantines externally
  written garbage; a write before any load also backs up undecoded bytes first; repeated loads of the same
  corrupt bytes create one copy per process; a newer persisted schema version is treated as unreadable and
  stays write-blocked after backup. Single-value blobs (profile) back up undecodable bytes before replacement;
  an atomic profile update refuses to run on an unreadable profile. [obs; tests]
- **Transactions:** every list mutation is decode + transform + encode inside one store transaction (MUST:
  "read list, append, save" outside a transaction turned one decode failure into "diary replaced by one
  entry"). Tombstone-aware merges read the tombstones in the same transaction. [obs A]
- **Consistency (A ConsistentDataStore):** wraps the store so that after every completed write (also failed
  ones) all subscribers re-subscribe and therefore observe the latest value; equal consecutive values are
  de-duplicated. Reason: an upstream library defect let a reader that subscribed mid-write stay on the old
  value indefinitely (observed as a stale water total on a freshly opened screen). [obs + a test that starts
  failing once upstream ships the fix]
- **Whole-store corruption (A):** an unreadable store file is copied aside (sibling first, quarantine folder
  as fallback; the copy must match the original length) and the app starts from empty settings; if no copy can
  be made the error is rethrown and the original file is left untouched (no crash-loop fix at the cost of the
  only copy). [obs + tests]
- **Secret store corruption (A):** if the encrypted key file cannot be opened (keystore alias survived a
  reinstall), delete the file and the master key alias and rebuild — only cached API keys are lost. [obs]
- **Photo GC:** removes photo files not referenced by any persisted record (food, favourites, pending draft,
  workout user photos, routines). If any referencing blob is unreadable the reference set is "unknown" and
  nothing is deleted (MUST). Runs at startup and after imports/restores. [obs A]
- **Migrations (pattern):** one-shot migrations keyed by integer version markers in the store (AI model ids,
  fallback base URLs, speech provider — `03`/`07`); legacy unit flag fallback; favourites moved from a key set to
  full entry copies before any favourites mutation; add-menu v1→v2; thumbnail folder v2; onboarding completion
  seeds a sort-order preference for new users only and marks all post-update prompts seen. [obs]

### 3.19 Secret storage

- A: encrypted shared preferences (AES-256 SIV key names, AES-256-GCM values) under a hardware-backed master
  key; keys per provider (AI and speech; speech falls back to the matching AI provider's key), user's food-DB key
  (trimmed; blank deletes), challenge bearer token, Drive access token. Saving an empty value deletes the key.
  I: Keychain. Both: never in backups or exports; Delete All Data wipes them. [obs]
- Settings show keys masked (`03`).

### 3.20 About (App & Updates, Support, Help & Feedback, Community, Legal)

- **App & Updates:** header (logo, app name, "Version x"), update row, open-source licence link, two
  security-practice badge links. Update row states: Idle "Check for updates" (+version) → Checking (spinner) →
  Up to date ("App version" + version; tap re-checks) | Available (dot, "current → latest", action "Update"
  opens the store) | Failed ("Check for updates" + version; tap retries). A uses the Play update API (only for
  the release package; "latest" shown as a build number); I queries the store lookup and compares dotted
  numeric versions component-wise (missing parts = 0). The same check runs once per launch and posts the
  update notification (3.10). [obs both]
- **Support:** tip jar (A Play billing, only when available; `07`), Rate (opens store listing), Share (OS share
  sheet with a short promotional text + site URL), Star on the code host, Vote on a launch site. [obs]
- **Help & Feedback:** Report an issue (code-host issue form, opened in an in-app browser so the template
  parameter survives), Report on community chat, Request a feature (form), Request on chat, Contact (email).
  A also lists two third-party notice viewers here (on-device model and speech model licences), loaded from
  bundled text in 8 KiB chunks with an error fallback. [obs A]
- **Community:** chat server, X, LinkedIn, Instagram. **Legal:** Privacy Policy, Terms, a business
  registration record, a professional credential. [obs A]
- Footer on the hub: "made by" line and a tagline.

### 3.21 What's New and post-update prompts

- Purpose: show a few once-only screens to people who already used the app, on their first launch after an
  update. Fresh installs
  never qualify: completing onboarding marks every prompt seen. [obs both]
- Chain (A), starting 2.5 s after the first frame, only if onboarding is complete: (1) What's New pop-up if not
  finished; (2) else a hosted-plan upsell if eligible (`07`); (3) else "Meet the developer" (marked done only on
  Done, so visiting a social link and returning keeps it); (4) a launch-day vote sheet only during the launch
  day; (5) arm the launch reminder (asks notification permission once; denial stops retries). [obs]
- What's New pop-up: full-height card, pager with dots, Previous/Next, Close on the last page. Pages: feature
  video (starts muted when the ringer is silent; muted when leaving page 1) → access page (only when the plan
  check succeeded and the user either can buy plans or cannot start the feature yet) → support page → developer
  page. The access check gives up after 6 s (then the page is omitted). Back and outside taps are ignored; it is
  marked seen only when finished (Close on last page, or leaving early to add a key), so a killed app shows it
  again. If the voice assistant is active it waits for the next launch. On app update a single notification
  about it is posted (existing users, notifications on, not yet shown), and cancelled when the pop-up opens.
  [obs A, I parity]
- Seen-keys are versioned/dated so a prompt can be deliberately re-armed; the plan upsell's seen-flag is set
  only on the launch where it really appeared (R06.15). Rate prompt uses the native review prompt only if not asked recently. [obs]
- Launch reminder plan: before the launch instant → schedule at it; within 24 h after → fire now; later → skip
  and mark done. Respects the master switch; leaves the flag clear while notifications are off. [obs + tests]

### 3.22 Languages

- 19 UI languages, grouped by script. Latin: English `en` (base), Azerbaijani `az`, Czech `cs`, German `de`,
  Spanish `es`, French `fr`, Italian `it`, Dutch `nl`, Polish `pl`, Brazilian Portuguese `pt-BR`, Romanian `ro`,
  Turkish `tr`. Cyrillic: Russian `ru`, Ukrainian `uk`. Right-to-left: Arabic `ar`. Other scripts: Hindi `hi`,
  Japanese `ja`, Korean `ko`, Simplified Chinese (A tag `zh-CN`, I tag `zh-Hans`). The site says "18 languages" = 18 translations + English, and that the app follows the phone's
  language (`ev_fa243a1fe14ed63cc6252910410ee973c07740c25cc70484db1eab53b44d991a`). [obs]
- A picker: "System" + each language shown by its own native name with an initial capital. Matching a stored
  or device tag: exact (case-insensitive) first, else same language with region matching or unspecified
  (`en-US` → en, `tr-TR` → tr, `pt-BR` exact). Shown language = in-app choice, else the first device language
  that is translated, else English. [obs + test]
- Translation rules defended by tests: translated strings keep the English format arguments exactly; text shown
  without formatting must not escape percent signs; plural forms may spell numbers out. Ukrainian has its own
  test. Speech languages are separate (`07`). [obs]
- Repeating notifications freeze their text at scheduling time, so I re-adds them on every foreground to pick up
  a language change. [obs]

## 4. File map (what to read in the Read step)

| Sub-area | Reference path | Lines | Read what | Docs / tests to read with it |
|---|---|---|---|---|
| Settings screen | `A/ui/settings/SettingsScreen.kt` | 5141 | map with grep; read 255–760 (categories, launchers, toggles), 950–1160 (App Settings, Tracking), 1585–1990 (Data Management, dialogs), 2185–2365 (hub, notification rows), 3290–3400 & 3786–4020 (sheets, meal times, water, fasting) | — |
| Settings VM | `A/ui/settings/SettingsViewModel.kt` | 1727 | setters 660–760, 1040–1260 (notification sync), 1469–1500 (delete all, clear log) | — |
| Config screens | `A/ui/settings/{TabBarSettingsScreen,AddMenuSettingsScreen,ProductInfoSettingsScreen}.kt`, QuickActionsScreen in SettingsScreen 2505–2607 | 119 / 621 / 200 | all | `T/models/{AddMenuConfigTest,QuickActionTest,ProductInfoFieldTest}.kt`, `IT/{TabBarSettingsTests,QuickActionTests,AddMenuConfigTests,ProductInfoSettingsTests}.swift` |
| Config models | `A/models/{AddMenuConfig,TabBarSettings,QuickAction,ProductInfoField,FoodLogMethod,MealSchedule,EnergyUnit,WaterUnit,WaterQuickAddPresets,AppLanguage}.kt` | 221/26/26/64/72/44/108/38/50/67 | all | `T/models/{MealScheduleTest,EnergyUnitTest,AppLanguageTest,WaterQuickAddPresetsTest}.kt`, `T/TranslationFormatTest.kt` |
| Theme / icon | `A/ui/theme/Color.kt`, `A/services/AndroidAppIconManager.kt` | 86 / 102 | presets list, icon swap | — |
| Export / import | `A/export/{DiaryExporter,DiaryImporter}.kt`, `A/ui/settings/{ExportDiarySheet,ImportDiarySheet}.kt`; `I/Services/{DiaryExporter,DiaryImporter}.swift`, `I/Views/{ExportDiaryView,ImportDiaryView}.swift` | 342/336/220/151; 358/437/110/136 | all | `T/export/*`, `IT/{DiaryExporterTests,DiaryImporterTests}.swift` |
| Notifications | `A/services/{NotificationService,ReminderDispatchPolicy,DailySummaryPolicy}.kt`; `I/Stores/NotificationManager.swift`; `I/Views/ProfileComponents.swift` 1100–1330 | 856/7/45; 602; 1429 | all of the A service; I scheduling 89–450 | `T/services/{DailySummaryPolicyTest,ReminderDispatchPolicyTest,ProductHuntLaunchReminderTest}.kt`, `IT/{DailySummaryPolicyTests,RepeatingReminderSettingsTests}.swift` |
| Startup sync | `A/FudAIApp.kt` (rescheduleReminders ~380–430), `A/MainActivity.kt` (onStop auto-backup), `A/ui/navigation/FudAINavHost.kt` (update check 158–172, hidden tabs 194–240) | 795/–/392 | named functions | — |
| Persistence | `A/data/{PreferencesStore,ConsistentDataStore,FudaiDataStore,PersistedJsonGuard,KeyStore}.kt`; `I/Services/PersistedBlobGuard.swift` | 1739/43/62/131/129; 302 | store: 140–260 (guarded lists), Keys object 1588–1700, units 640–700, cloud values 480–540; others all | `T/data/{ConsistentDataStoreTest,PersistedJsonGuardTest}.kt`, `IT/DiaryPersistenceSafetyTests.swift` |
| Storage | `A/services/StorageMaintenance.kt`, `A/ui/settings/StorageSettingsCard.kt`, `A/services/FoodImageStore.kt` 295–430; `I/Views/StorageSettingsSection.swift`, `I/Services/StoredPhotoCompressor.swift` | 114/182/576; 232/255 | all / compression part | `T/services/{StorageMaintenanceTest,FoodImageStoreRestoreTest}.kt` |
| Backup | `A/backup/{CloudBackupArchive,CloudBackupCoordinator,CloudBackupRestore,DriveCloudBackupClient}.kt`; `I/Services/{CloudBackupArchive,CloudBackupService}.swift`, `I/Views/CloudBackupSettingsView.swift` | 289/322/106/247; 413/466/109 | all | `docs/cloud-backup.md`, `T/backup/*`, `IT/CloudBackupArchiveTests.swift` |
| About / update | `A/ui/about/AboutScreen.kt`, `A/services/update/AndroidUpdateChecker.kt`; `I/ContentView.swift` 20–114 (update check), 544–1028 (About sections) | 683/122 | all | — |
| Prompts | `A/ui/components/{WhatsNewDialog,PostUpdatePrompts}.kt`; `I/Services/PostUpdatePrompts.swift` | 799/342; 192 | 100–260 of the dialog; prompts all | `IT/WhatsNewTests.swift` |

Giant files: `A/ui/settings/SettingsScreen.kt` [5141] — grep `selectedCategory ==` for each page and
`SettingsSheet.<NAME> ->` for sheets; `A/data/PreferencesStore.kt` [1739] — grep `private object Keys` and
`updateJsonList`; `I/ContentView.swift` [7966] — grep `ProfileSettingsCategory`, `NotificationSettingsSections`,
`Delete Everything`, `AppUpdateChecker`; `I/Views/ProfileComponents.swift` [1429] — `NotificationSettingsSections`.

## 5. Minimum viable subset (for the PWA)

**Maps directly (v1):**
- Settings hub + categories in the same order, minus categories with no v1 content (Speech-to-Text, Voice
  Assistant, Workout, Health & Data hidden in v1; AI Access per `03`). Snapshot-loaded gate before rendering
  toggles.
- App Settings: Appearance (system/light/dark via `prefers-color-scheme` + override), accent colour presets
  (CSS custom properties; Platewise's own palette and names), Default to Grams, Week Starts On, Energy Unit
  (all kJ rules in 3.3), Quick-add/Meal Times, + Menu editor (methods available in v1 only: camera, photos,
  barcode, text, manual, recent, frequent, favourites, copy from day; voice hidden until the voice phase),
  Product Information, Tab Bar (hideable: Progress, Coach).
- Tracking: Meal Times, water and fasting switches/goals/presets (logic per the water/fasting spec).
- Export (JSON/Markdown/CSV) and Import (JSON) with the exact validation, merge and water rules; file via
  `<input type=file>` with a 20 MiB size check before reading; output via Web Share API with files when
  available, else a download link (Blob + object URL).
- Clear Food Log, Delete All Data (delete the IndexedDB database(s), Cache Storage entries the app owns,
  `localStorage`, cancel in-app reminder timers, turn any backup off, then route to onboarding). Handle the
  IndexedDB `blocked` event by telling other open tabs to close their connections (BroadcastChannel).
- Storage card: per-category sizes by summing stored photo/thumbnail Blob sizes; total via
  `navigator.storage.estimate()`; Compress Photos with `createImageBitmap` + canvas/OffscreenCanvas JPEG 0.8 at
  2,048 px, same "only if smaller and unchanged" rule; Clear Cache drops thumbnails. Show persistence status and
  request `navigator.storage.persist()` (see R06.19).
- Persistence guards re-designed for IndexedDB (one object store per entity, schema version + upgrade
  migrations, per-record validation with quarantine store, read-modify-write inside one IDB transaction, cross-tab
  change broadcast so every view sees every committed write).
- Backup (local file): "Back up now" produces an archive file (same behaviour as 3.17: JSON payload first, then
  photos/, safe names, content hash, format id/version, fail-closed on newer version) via share/download;
  "Restore from file" with confirm, full validation and free-space estimate (`storage.estimate()` quota − usage)
  before writing, staging in a separate store then one commit. API keys never included.
- About: version (build constant), update check = service-worker update flow (check `registration.update()` on
  launch; when a new worker is waiting show "Update available — Reload"; never auto-reload mid-edit), share app
  (`navigator.share({url})`, fallback copy link), licences/credits page (including the MIT notice of the
  reference as credit, per `00-decisions`), help/feedback/contact links as Platewise's own URLs.
- What's New: a versioned one-time dialog for existing users after a service-worker update; fresh installs
  marked seen at onboarding completion.
- i18n-ready, English only: every string through a message catalog with ICU plurals; numbers/dates through
  `Intl`; logical CSS properties for future RTL (Arabic); language picker hidden in v1; language tag list kept
  as data for later.

**Needs a web equivalent (and honest limits):**
- **Secret storage:** the browser has no Keychain. Options: plain IndexedDB, or encrypt keys with a
  non-extractable WebCrypto AES-GCM key kept in IndexedDB (protects only copies of raw storage files, not
  script on the origin), or an optional user passphrase (PBKDF2 → AES-GCM) that must be typed per session. No
  option protects against XSS, a malicious browser extension, or anyone using the unlocked browser profile.
  Mitigate with a strict CSP, no third-party scripts, masked display, a "forget key" control, and never putting
  keys in exports or backups. Say so in the UI. → Q4.
- **Notifications:** the Notifications API needs permission from a user gesture. There is no cross-browser way
  to schedule a local notification for a future time (notification triggers never shipped); periodic
  background sync is Chromium-only, installed-only and browser-throttled (≥ ~12 h). Real timed reminders need
  Web Push from a server (iOS Safari only for home-screen-installed apps, 16.4+). v1 (no server): reminders are
  evaluated in-app — when the app is open or next opened, overdue reminders show as in-app banners (and a
  system notification if the page is open and permission granted). The master switch must still reflect
  real permission. → Q3.
- **Quick actions:** web-app-manifest `shortcuts` are fixed at install time and unsupported on iOS → ship a
  static set (e.g. camera, text, barcode) and drop the per-slot setting in v1.
- **Theme colour → launcher icon:** manifest icons are static; only `theme-color` can change at runtime. Drop
  icon swapping.
- **Save to Photos:** the web cannot write to the gallery silently; offer "download photo" per entry or drop.
- **Battery optimisation row:** no equivalent; drop.

**Out of v1 (later phases):** cloud backup to Google Drive (feasible from a browser with the Google Identity
token client and the same appData scope, but needs an OAuth client, verification, and 1-hour tokens that cannot
refresh silently, so no background auto-backup) or iCloud (no web API); health-store rows; voice/speech
settings; workout settings; meal share link style; tip jar/hosted plans; launch-day/developer prompts;
language picker and translations; per-meal OS reminders at exact times (needs push).

## 6. Hard parts / traps

1. **R06.1 Unreadable data treated as empty.** A decode failure that returns an empty list lets the next
   "append" persist `[entry]` over the whole history. Rebuild: keep Missing / Decoded(dropped) / Corrupt apart;
   drop only unreadable rows; quarantine raw bytes before any overwrite; refuse writes to that entity if the
   quarantine copy cannot be made; surface a "some data could not be read" banner. Tests: `T/data/PersistedJsonGuardTest`, `IT/DiaryPersistenceSafetyTests`.
2. **R06.2 Read-modify-write outside one transaction.** "Read list, transform, save" in separate steps loses
   concurrent writes and amplifies R06.1. Every mutation runs read + transform + write in one IndexedDB
   readwrite transaction; cross-entity rules (tombstones, "only if sync still enabled") read inside it. The
   reference's own diary import computes the merge from a snapshot outside the write (A) — do the merge inside
   the transaction.
3. **R06.3 Late subscriber misses a write.** A view that subscribes while a write is in flight kept the stale
   value (upstream store bug; screen showed the old water total). Rebuild: after every committed write
   (including failed ones) notify all live queries and other tabs (BroadcastChannel) to re-read; de-duplicate
   equal values. Test the race. `T/data/ConsistentDataStoreTest`.
4. **R06.4 Whole-store corruption crash loop.** A corrupt store file threw into every reader on launch. Copy the
   bytes aside (verify the copy) and start empty; if the copy fails, keep the original and fail visibly rather
   than discarding the only copy. For IndexedDB: an `open` failure or failed upgrade must not delete the
   database; offer export-raw/repair instead.
5. **R06.5 Delete All Data vs backup.** An upload in flight finishes by turning backup back on; with an
   in-memory token the next auto-backup would overwrite the cloud copy with an emptied phone. Turn backup off
   and forget the session **before** wiping, wait for (or invalidate via a generation counter) any running
   backup, and never record success for a backup that started before the wipe. Same for a failed restore
   (backup turns on only after a successful restore).
6. **R06.6 Restore must be all-or-nothing.** Validate the entire archive (read every entry, CRC, format, version)
   and check free space (photos + 64 KiB/photo + payload + 16 MiB) before changing anything; stage photos, then
   move in, then write values; any staging failure leaves photos and values untouched; once committing starts it
   must finish even if the user navigates away. `T/backup/CloudBackupRestoreTest`.
7. **R06.7 Self-referential backup hash.** The content hash covers the backup's own bookkeeping keys (last-at,
   last-hash, enabled, account), which change on every successful upload, so "skip if unchanged" can never
   skip and every eligible auto-backup re-uploads everything [inf from key lists + snapshot code, both
   platforms]. Exclude backup bookkeeping (and any other volatile device state) from both the payload hash and
   the archive.
8. **R06.8 Restore without confirmation.** "Restore now" overwrites the local diary immediately on both
   platforms. Add a confirm that states what will be replaced and the backup's date; consider making a local
   safety archive first.
9. **R06.9 Archive path traversal.** Restored entry names must be plain photo names (charset, extension list,
   ≤ 128 chars, no leading dot, no `..`, no directory part) under the photos folder only; anything else is
   skipped, never "cleaned up". Apply the same rule when packing. `T/backup/CloudBackupArchiveTest`.
10. **R06.10 Reminders outliving their switches.** A's startup sync returns early when notifications are off or
    permission is missing without cancelling armed alarms, the reminder receiver checks only OS permission,
    and Delete All Data does not cancel alarms — so reminders keep firing after the user turned them off or
    wiped the app [inf from code]. Rebuild: re-check master switch, type switch and tracking-feature switch at
    fire time; cancel everything on wipe, on master-off and on permission loss.
11. **R06.11 Daily re-arm drift.** Re-arming at now + 24 h with inexact alarms drifts later every day and never
    follows DST. Compute the next wall-clock occurrence of HH:MM each time.
12. **R06.12 Streak reminder that can never fire (I).** It is scheduled only if nothing is logged today and the
    current streak > 0, but the streak is counted starting from today, which is empty → always 0. Count the
    streak from yesterday when today is empty (or drop the streak condition).
13. **R06.13 Notification switch must not lie.** Only a permission grant turns the master switch on; denial
    leaves it off with a pointer to the browser/OS setting; re-check permission on every app focus and show the
    real state.
14. **R06.14 Export energy unit.** Every export writes the canonical kcal numbers, whatever the display unit,
    so two exports always compare and an import never double-converts. For kJ users the Markdown adds a one-line
    unit notice and the CSV energy header names kcal explicitly. Never convert numbers in exports.
    `T/export/DiaryExporterTest`.
15. **R06.15 One-time prompts consumed too early.** An upsell key was marked seen for every user while plans
    were unavailable on that platform, so it had to be re-armed with a versioned key. Mark a prompt seen only
    when it was actually shown and finished; version the keys; fresh installs mark all seen at onboarding
    completion; exclude "already notified" flags from backups so a new device re-arms correctly.
16. **R06.16 Import merge must keep media and identity.** Replace-range must match by id, then by
    (day, minute, meal, normalised name), each existing entry once; matched entries keep their photos; ids that
    collide with entries outside the range get fresh ids; Add-as-new always mints ids; legacy food-only files
    must not erase water; duplicate ids already present must not crash; reject the whole file on any invalid
    value (no partial import); reject nonexistent local times (DST gaps). `T/export/DiaryImporterTest`,
    `IT/DiaryImporterTests`, `IT/DiaryPersistenceSafetyTests` (duplicate ids).
17. **R06.17 Export "This week" ignores the week-start setting** (A always Monday, I locale week). Use the app's
    Week Starts On setting.
18. **R06.18 Photo GC with unknown references.** Deleting "unreferenced" photos while any referencing record set
    is unreadable deletes real photos. GC must abort when any source is unreadable, and must not run while a
    restore is staging.
19. **R06.19 Browser storage eviction (PWA-specific).** Safari deletes all script-writable storage of a site
    that was not used for 7 days unless it is installed to the home screen; other browsers may evict
    "best-effort" storage under pressure. Request `navigator.storage.persist()`, show whether storage is
    persistent, nudge users to install the app and to make regular local backups, and remind when the last
    backup is old.
20. **R06.20 kJ goal wheel round-trip.** Opening and saving an untouched kJ calorie wheel must keep the exact kcal
    goal (snap-to-step would otherwise nudge it). `T/models/EnergyUnitTest`.
21. **R06.21 Add-menu sanitising and load races.** Dedupe methods across groups, cap 3 groups, drop empty groups
    only on save, honour v1→v2 rules, fall back to default when a configured menu sanitises to empty, and never
    let the startup snapshot overwrite an edit made during loading. `T/models/AddMenuConfigTest`.
22. **R06.22 Settings flashing defaults.** Rendering switches before the stored snapshot loads shows (and can
    persist, if the user taps) default values. Gate pages on "settings loaded".
23. **R06.23 Translations break format arguments.** Translated strings must keep every placeholder of the
    English source; untranslated percent signs must not be escaped. Add a catalog lint before shipping any
    language. `T/TranslationFormatTest`.
24. **R06.24 Compressing photos safely.** Replace only if the new file is smaller and the original is unchanged
    since it was read; never during a restore; report an interrupted run as failed, not "nothing to do".
    `T/services/StorageMaintenanceTest`.

## 7. Open questions

1. Should Platewise import diary files exported by the reference (different app-id string, same shape), or only
   its own? Needed: product decision (accept a list of known app ids vs own id only).
2. Backup in v1: local archive file only, or also Google Drive appData from the browser (needs a Google OAuth
   client, consent-screen verification, and no background auto-backup)? Needed: product decision.
3. Reminders without a server: accept in-app-only reminders in v1, or add a small push service (VAPID) in a
   later phase? Which reminder model — I's per-meal reminders with times, or A's single food-log reminder?
   Needed: product decision.
4. API-key protection level: plain IndexedDB, device-bound WebCrypto key, or optional passphrase? Should a local
   backup optionally carry keys encrypted with a passphrase? (Reference never backs up keys.) Needed: product
   decision.
5. Default units: A defaults metric, I defaults ft-in/lb. Derive from locale (e.g. `en-US` → imperial)?
   Needed: decision with `01`.
6. Which reminder defaults (on/off and times) should Platewise use, given the platforms disagree (food reminder
   off 19:00 vs on 21:00; summary 21:00 off vs 20:00 on; body fat on vs off)? Needed: product decision.
7. About content: Platewise's own repository, privacy, terms, contact, community links — none exist yet.
   Needed: URLs from the owner.
8. Accent palette: how many presets and their names/colours (the reference's 18 are not reused). Needed:
   design decision.
9. What's New for v1: a generic release-notes dialog or nothing until there are existing users? Needed:
   product decision.
10. Should Delete All Data also offer to delete the cloud/local backup? (Reference keeps the backup.) Needed:
    product decision.

## 8. What to read later

- Reference docs: `docs/cloud-backup.md` (opt-in rules, restore/health interplay, Drive scopes).
- Reference tests that list the edge cases: `T/data/{PersistedJsonGuardTest,ConsistentDataStoreTest}.kt`,
  `IT/DiaryPersistenceSafetyTests.swift`; `T/backup/{CloudBackupArchiveTest,CloudBackupRestoreTest,
  CloudBackupErrorMessageTest,DriveCloudBackupClientTest}.kt`, `IT/CloudBackupArchiveTests.swift`;
  `T/export/{DiaryExporterTest,DiaryImporterTest}.kt`, `IT/{DiaryExporterTests,DiaryImporterTests}.swift`;
  `T/services/{DailySummaryPolicyTest,ReminderDispatchPolicyTest,ProductHuntLaunchReminderTest,
  StorageMaintenanceTest}.kt`, `IT/{RepeatingReminderSettingsTests,WhatsNewTests}.swift`;
  `T/models/{AddMenuConfigTest,MealScheduleTest,EnergyUnitTest,AppLanguageTest,QuickActionTest,
  ProductInfoFieldTest}.kt`, `T/TranslationFormatTest.kt`.
- REA Evidence (outside the repo): site capture `ev_fa243a1fe14ed63cc6252910410ee973c07740c25cc70484db1eab53b44d991a`
  (language count, "follows your phone's language"). No new REA runs for this area.
- Related specs: `01` (profile fields, height/weight units, goals, onboarding "welcome back" restore), `03`
  (AI access/providers, key masking, kJ prompt line, AI migrations), `07` (voice, speech, hosted plans, tips),
  the water/fasting spec (tracking logic behind 3.4), the logging spec (photo store limits, product info data,
  favourites), the workouts spec (Workout settings, rest-timer notifications).
