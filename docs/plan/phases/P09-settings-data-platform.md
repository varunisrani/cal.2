# P09 · Settings, data and platform

**Weeks:** 2–3 · **Tracks:** UI (settings pages, About); data (export, import, backup, reminders); platform (service worker, manifest, CSP) · **Depends on:** P02–P08 · **Status:** ✅ done: all 19 tasks landed (2026-10-27)

Reference paths are relative to `$PLATEWISE_REF` (`/root/reference/fud-ai`, pinned at `10e14b67`). Prefixes: `A/` = `android/app/src/main/java/com/apoorvdarshan/calorietracker/`, `I/` = `ios/calorietracker/`, `T/` = `android/app/src/test/java/com/apoorvdarshan/calorietracker/`, `IT/` = `ios/calorietrackerTests/`. A number in brackets is the file's length in lines; read only the named part of a big file. Read the research spec section first, then the reference, then its tests.

## Goal

Settings is complete for v1 (hub, App Settings and units, meal times, tab bar, add-menu editor, product fields, AI providers and standbys, reminders and notifications, your data, About). Data leaves and returns safely: diary export (JSON, Markdown, CSV; kcal always), import of our own diary format with a preview and a safe merge, a local backup file with photos and the Coach chat but never keys, and an all-or-nothing restore that asks first (D-16.42). The app installs, works offline apart from AI and food databases, offers updates without surprise reloads, asks for persistent storage (D-16.8), and runs under a strict CSP.

Interop note: web platform APIs (Service Worker, Cache Storage, Notifications, `navigator.storage`, Web Share with files, `beforeinstallprompt`, Web App Manifest) differ by browser: check MDN compatibility on the build date and keep a working fallback for each (download link for share, instructions for install, in-app banner for notifications).

## Slices and waves

Each slice owns its files; no two slices in a wave touch the same path. A builder takes one slice, runs Read → note → Rewrite → Compare for each task, then the loop until green. The lead lands one commit per slice and writes any deviation back into this file.

- **Wave A:** S1a = P09-01..04 (`src/features/settings/{SettingsHub,registry}*`, `src/features/settings/app/{AppPage,UnitsSection,TabsPage}.tsx`, `src/features/settings/tracking/MealTimesSheet.tsx`) · S1b = P09-05..07 (`src/features/settings/app/{MenuEditorPage,ProductFieldsPage}.tsx`, `src/features/settings/ai/**`) · S2 = P09-08, P09-09 (`src/services/reminders/**`, `src/features/settings/tracking/RemindersSection.tsx`) · S3a = P09-10, P09-11 (`src/services/transfer/**`, `src/features/settings/data/{ExportSheet,ImportSheet}.tsx`) · S4 = P09-16..18 (`src/features/about/{AboutPage,CreditsPage}.tsx`, `src/sw/**`, `src/app/{swRegistration,InstallPrompt,UpdateBanner}.tsx`, `public/manifest.webmanifest`, `index.html`, `vite.config.ts`, `scripts/notices.ts`).
- **Wave B:** S3b = P09-12..15 (`src/services/backup/**`, `src/services/storageNudge.ts`, `src/features/settings/data/{DataPage,BackupSection,RestoreSheet,StorageCard}.tsx`, `src/features/onboarding/RestoreFromFile.tsx`).
- **Wave C:** P09-19 (`e2e/settings-data.spec.ts`, `playwright.config.ts` project with service workers allowed).

## Tasks (19)

| ID | Task | Read in reference | New files | Verify |
|---|---|---|---|---|
| P09-01 | **Settings hub and load gate.** Update `SettingsHub.tsx` and `registry.ts` (06 §3.1, §5): two cards. Preferences: Personal info → Goals & nutrition → Tracking & reminders → AI providers → App settings → Your data. About: About Platewise → Help & feedback → Privacy & terms (own pages or links; Proposed D-16.66). Categories without v1 content (speech, voice, workouts, health) are absent. Every category page shows a spinner until the settings snapshot is loaded, never default switches (R06.22); back link "Settings"; re-tapping the tab returns here (P04-05). A dot on the About row and on the Settings tab when an update is waiting (P09-17). | `A/ui/settings/SettingsScreen.kt` [5 141: lines 255–760 categories]; `T/ui/settings/SettingsCategoryTest.kt` [41] | `src/features/settings/CategoryPage.tsx`, `src/features/settings/CategoryPage.test.tsx` | hub order matches the list; with settings not loaded a category shows the spinner, not switches; update flag shows the dot; unknown category route → hub. |
| P09-02 | **App settings and units pages.** `src/features/settings/app/AppPage.tsx` (06 §3.2–3.3): Appearance (System / Light / Dark), Accent (six swatches with names, D-16.1), Grams first (switch with info), Week starts on (Monday default / Sunday), and links to Add menu, Product fields and Tab bar. `UnitsSection.tsx`: energy (kcal / kJ), height (cm / ft-in), weight (kg / lb) as three separate settings (01 §3.9); changing a unit never changes stored values. All rows write immediately; Save to Photos, app-icon colours, quick-action slots and the language picker are not offered (06 §5). | `A/ui/settings/SettingsScreen.kt` [5 141: lines 950–1160]; spec 06 §3.2 | `src/features/settings/app/AppPage.tsx`, `src/features/settings/app/AppPage.test.tsx`, `src/features/settings/app/UnitsSection.tsx`, `src/features/settings/app/UnitsSection.test.tsx` | choosing Ember updates `data-accent` at once; Sunday start re-anchors the week bar; switching to kJ changes the gauge heading but no stored kcal; height unit change keeps 175 cm. |
| P09-03 | **Meal times editor.** `src/features/settings/tracking/MealTimesSheet.tsx` (06 §3.4.1): the four boundaries with formatted times; each opens a 15-minute wheel limited by its neighbours ±15 minutes (P01-08 bounds), the current value always offered even when off-step; Save, Restore default times, Cancel. Added to the Tracking page. | `A/ui/settings/SettingsScreen.kt` [5 141: lines 3290–3400 meal times] | `src/features/settings/tracking/MealTimesSheet.tsx`, `src/features/settings/tracking/MealTimesSheet.test.tsx` | lunch wheel runs breakfast+15 … dinner−15; a stored 07:07 is offered; Restore defaults sets 05:00/12:00/18:00/23:00; Cancel leaves settings unchanged. |
| P09-04 | **Tab bar page.** `src/features/settings/app/TabsPage.tsx` (06 §3.5): switches for Progress and Coach (Home and Settings are always shown, said in a footer); each switch calls `toggleHiddenTab` (one-tab read-modify-write, R05.13); the switch flips at once and the stored value then wins. | `A/ui/settings/TabBarSettingsScreen.kt` [119]; `IT/TabBarSettingsTests.swift` [35] | `src/features/settings/app/TabsPage.tsx`, `src/features/settings/app/TabsPage.test.tsx` | hiding Coach leaves Progress unchanged even when the page was opened before Progress was hidden elsewhere; the hidden tab disappears from the bar. |
| P09-05 | **Add-menu editor.** `src/features/settings/app/MenuEditorPage.tsx` (06 §3.6, R06.21): group count 0–3 (0 = flat: every visible method loose; going from 0 to ≥ 1 rebuilds the default groups when nothing is loose, else one group with the loose methods; extra groups start empty; reducing drops the last); per group rename, move up/down, move methods up/down, remove a method, "Add method" from hidden ones; a loose section; Hidden methods with restore per P06-01 rules; Reset to default; footer: water and fasting entries stay separate. Edits are refused until the stored layout has loaded, and a late load never overwrites an edit; empty groups and names are kept while editing and sanitised on save. | `A/ui/settings/AddMenuSettingsScreen.kt` [621: all]; `T/ui/settings/AddMenuGroupCountTest.kt` [37] | `src/features/settings/app/MenuEditorPage.tsx`, `src/features/settings/app/MenuEditorPage.test.tsx` | 0 → 1 group with nothing loose rebuilds defaults; renaming to blank saves the generic label; moving a method between groups keeps it once; a slow load does not overwrite an edit made meanwhile (deferred fake repo); Reset restores three groups. |
| P09-06 | **Product fields page.** `src/features/settings/app/ProductFieldsPage.tsx` (06 §3.8): "Show product information" (default on) and 11 field switches in display order (barcode, data source, package, Nutri-Score, NOVA, Eco-Score, allergens, may contain, labels, categories, ingredient label); hidden fields stored as keys, unknown keys ignored; a note that allergen warnings follow the profile's sensitivities and are not switched here. | `A/ui/settings/ProductInfoSettingsScreen.kt` [200]; `IT/ProductInfoSettingsTests.swift` [96] | `src/features/settings/app/ProductFieldsPage.tsx`, `src/features/settings/app/ProductFieldsPage.test.tsx` | hiding NOVA hides it in the review block; block off hides all; unknown stored key ignored. |
| P09-07 | **AI providers page and food-database key.** `src/features/settings/ai/AiPage.tsx` (03 §3.3, D-16.23–D-16.26, R03.9): `RoleCard.tsx` for the primary provider (the P05-04 form), "Different model for text" switch with its own card, image standby and text standby cards (each: on/off, provider, model, key shared per provider, its own server-URL slot; the model list hides the backed role's model when provider and server are the same; picking the same provider switches to its next preset); "Give up after" seconds (30–600, default 180) shown for every provider; answer length limit in tokens (default 1 024, min 1) shown for every provider (D-16.25); reasoning effort when OpenRouter fills any role; "Notes for the AI" (`InstructionsField.tsx`, trimmed, saved with a button, blank turns them off); the plain storage warning (D-16.7); forget-key buttons. A Food databases section with the FoodData Central key (`fdc` slot), a sign-up link and a short explanation. | `A/ui/settings/SettingsScreen.kt` [5 141: lines 1225–1520 and 2855–3140]; `I/ContentView.swift` [7 966: lines 5740–5850, 6190, 6360, 6880] | `src/features/settings/ai/AiPage.tsx`, `src/features/settings/ai/AiPage.test.tsx`, `src/features/settings/ai/RoleCard.tsx`, `src/features/settings/ai/RoleCard.test.tsx`, `src/features/settings/ai/InstructionsField.tsx`, `src/features/settings/ai/InstructionsField.test.tsx`, `src/features/settings/ai/FoodDbSection.tsx` | token limit row visible with Gemini selected; standby equal to the primary is not offered; same provider, other model is offered; timeout clamps 10 → 30; OpenRouter as text standby shows reasoning effort; forgetting a key removes it from storage; notes saved trimmed. |
| P09-08 | **Reminder engine.** `src/services/reminders/schedule.ts` (pure, D-16.41, R06.11): reminders breakfast, lunch, dinner, daily summary, water and fasting goal; `nextAt(HH:MM, now)` = the next wall-clock occurrence in the local zone (DST-safe, recomputed every time); defaults 08:00 / 12:00 / 19:00 / summary 20:00 / water 14:00 (D-16.40), every one off (Proposed D-16.61); no streak or food-log reminder (so R06.12 cannot occur); `due(reminders, lastShown, now)` lists reminders whose time passed since they were last shown. `src/services/reminders/engine.ts` (D-16.5, R06.10, R05.20): evaluates on open, on `visibilitychange` → visible and on a timer to the next due time while the page lives; at fire time re-checks the master switch, the reminder's switch, the tracking switch it depends on and the permission; a reminder due while the app was closed shows once on the next open as a banner; the fasting goal fires at start + goal only for a future goal time, is dropped when the fast ends, is cancelled or deleted, and is re-evaluated after an edit; the summary text is "eaten X of Y, Z left" in the display unit (06 §3.11, kJ converted before subtracting); erase-everything and master-off cancel everything. | `A/services/{NotificationService,ReminderDispatchPolicy,DailySummaryPolicy}.kt` [856, 7, 45]; `I/Stores/NotificationManager.swift` [602: lines 89–450]; `T/services/{ReminderDispatchPolicyTest,DailySummaryPolicyTest}.kt` [37, 63]; `IT/{DailySummaryPolicyTests,RepeatingReminderSettingsTests}.swift` [46, 56] | `src/services/reminders/schedule.ts`, `src/services/reminders/schedule.test.ts`, `src/services/reminders/engine.ts`, `src/services/reminders/engine.test.ts` | next 08:00 across the March DST change in New York; a reminder switched off between scheduling and fire time is not shown; a missed lunch reminder appears once on the next open; fasting goal after the fast ended → nothing; summary in kJ: eaten 6 276, goal 8 368, 2 092 left; master off cancels the pending timer. |
| P09-09 | **Notifications settings and notifier.** `src/features/settings/tracking/RemindersSection.tsx` (06 §3.9–3.10, R06.13): the master switch asks for permission and turns on only on a grant; denial leaves it off with a pointer to the browser's site settings; the real permission is re-read on every focus and shown; when on, rows for breakfast, lunch, dinner, daily summary (each with a switch and a time), water (only when water tracking is on), fasting goal (only when fasting is on), goal reached; a note that reminders show while the app is open or on the next open, and best when installed (D-16.5). `src/services/reminders/notifier.ts`: shows through `ServiceWorkerRegistration.showNotification` when permitted and the page is alive, else an in-app banner; the goal-reached event (P05-14) also notifies when its switch and the master are on. | `I/Views/ProfileComponents.swift` [1 429: lines 1100–1330 notification sections]; `A/ui/settings/SettingsScreen.kt` [5 141: lines 2185–2365 notification rows] | `src/features/settings/tracking/RemindersSection.tsx`, `src/features/settings/tracking/RemindersSection.test.tsx`, `src/services/reminders/notifier.ts`, `src/services/reminders/notifier.test.ts` | permission denied → switch stays off and the pointer shows; revoking permission (mocked) on focus turns the shown state off; water row hidden while water tracking is off; notifier uses the banner when permission is default. |
| P09-10 | **Export diary.** `src/services/transfer/exportDiary.ts` (06 §3.13, D-16.2, R06.14, R06.17): ranges Today, This week (from the app's week start), This month, All time (earliest food or water day to today), Custom (swapped when reversed); days with food or water only; nothing → "nothing to export". Our JSON: `{format: 'platewise-diary', version: '1.0', range, days: [{date, totals, targets, left (≥ 0), meals: [{meal, items}], water, waterTotalMl}]}` with items carrying id, name, grams, kcal, macros, the 23 nutrients (unit in the key), extras, time `HH:mm`, source (`manual` or `ai`), note and lines; numbers to 1 decimal, kcal integers, kcal always. `exportFormats.ts`: Markdown (title, range, a kcal note for kJ users, per day totals vs targets and water, one table per meal, `\|` in names replaced) and CSV (one header, food rows, one row per water log, one water-total row per day, RFC 4180 quoting, the energy column header naming kcal for kJ users). File name `platewise-diary-<start>_to_<end>.<ext>`. `ExportSheet.tsx`: range and format chips (defaults This week, JSON), Export via Web Share with a file when supported, else a download. | `A/export/DiaryExporter.kt` [342: all]; `I/Services/DiaryExporter.swift` [358]; `A/ui/settings/ExportDiarySheet.kt` [220]; `T/export/DiaryExporterTest.kt` [207]; `IT/DiaryExporterTests.swift` [240] | `src/services/transfer/exportDiary.ts`, `src/services/transfer/exportDiary.test.ts`, `src/services/transfer/exportFormats.ts`, `src/services/transfer/exportFormats.test.ts`, `src/features/settings/data/ExportSheet.tsx`, `src/i18n/en/data.ts` | This week with a Sunday start begins on Sunday; a water-only day is included; kJ person's CSV header names kcal and values stay kcal; a name with a comma and a quote is quoted; Markdown replaces `\|`; empty range → error and no file. |
| P09-11 | **Import diary.** `src/services/transfer/importDiary.ts` (06 §3.14, D-16.2, R06.16): files over 20 MiB are refused before reading; the whole file is validated before anything changes: our format id and major version 1 only; range and day dates parse and days fall inside the range; known meals; names non-blank; every number finite and ≥ 0; times `HH:mm` that exist on that day (a DST gap is refused); ids optional but UUIDs when present; water > 0 with UUID ids. A preview shows food and water counts and the range, with "Replace these dates" and "Add as new". Replace runs in one transaction: entries outside the range untouched; each imported item matches an in-range entry by id, else by (day, minute, meal, normalised name), each existing entry at most once; a match keeps its id and photos and takes the file's values; unmatched imported items keep their id unless used outside the range (then a new id); unmatched in-range entries are removed; duplicate stored ids do not crash. Add as new mints every id. Water is touched only when the file has water arrays. Photo cleanup runs afterwards. `ImportSheet.tsx` blocks dismissal while importing. | `A/export/DiaryImporter.kt` [336: all]; `I/Services/DiaryImporter.swift` [437]; `A/ui/settings/ImportDiarySheet.kt` [151]; `T/export/DiaryImporterTest.kt` [107]; `IT/DiaryImporterTests.swift` [116] | `src/services/transfer/importDiary.ts`, `src/services/transfer/importDiary.test.ts`, `src/features/settings/data/ImportSheet.tsx` | a file with one negative value changes nothing; another app's format id is refused; replace keeps a matched entry's photos; an id used outside the range gets a new id; a food-only file leaves water untouched; 02:30 on the spring-forward day is refused; add-as-new doubles the count. |
| P09-12 | **Backup archive codec and content hash.** `src/services/backup/zip.ts` (Proposed D-16.52): our own minimal ZIP writer and reader for stored (uncompressed) entries with CRC-32, local headers and a central directory; the reader rejects compressed entries, ZIP64, encrypted entries and a CRC mismatch. `archive.ts`: `payload.json` first, then `photos/<name>` entries; safe names only (ASCII letters, digits, `.`, `_`, `-`; extension jpg/jpeg/png/webp; ≤ 128 characters; no leading dot, no `..`, no folder part) on both write and read, other entries skipped (R06.9). `hash.ts`: SHA-256 (WebCrypto) over a canonical text of values sorted by key and photo `name:size` lines sorted by name, leaving out backup bookkeeping and device-local state (R06.7). | `A/backup/CloudBackupArchive.kt` [289: all]; `I/Services/CloudBackupArchive.swift` [413]; `T/backup/CloudBackupArchiveTest.kt` [498]; `IT/CloudBackupArchiveTests.swift` [597] | `src/services/backup/zip.ts`, `src/services/backup/zip.test.ts`, `src/services/backup/archive.ts`, `src/services/backup/archive.test.ts`, `src/services/backup/hash.ts`, `src/services/backup/hash.test.ts` | write then read round trip with three photos; a flipped byte fails the CRC; `../x.jpg`, `.hidden.jpg`, `a/b.jpg`, a 129-character name and `x.exe` are refused on write and skipped on read; changing `backup.lastAt` does not change the hash; changing an entry does. |
| P09-13 | **Backup and restore.** `src/services/backup/backup.ts` (D-16.30, D-16.29): snapshot every table except `secrets` and `quarantine`, plus settings without device-local keys (persistence asked, last-shown reminder times, backup bookkeeping); the Coach messages with thumbnails; every photo; document `{format: 'platewise-backup', version: 1, exportedAt, appVersion, contentHash, payload}`; a photo that vanished between snapshot and packing fails the whole backup; result offered through Web Share or a download named `platewise-backup-<yyyy-MM-dd>.zip`; record `backup.lastAt`. `restore.ts` (R06.6, R06.8, D-16.42): read and validate the whole file (every entry, CRC, format id; newer version → "needs a newer Platewise"; payload shape) and check free space (quota − usage ≥ photo bytes + 64 KiB per photo + payload + 16 MiB) before changing anything; show what the file holds (date, entry, photo and message counts) and what will be replaced, and ask; then set `restoring` (photo cleanup and other writes pause), stage photos into a staging table, and commit everything in one transaction; afterwards prune unreferenced photos, settle an active fast with tracking off (R05.2), re-evaluate reminders and leave a now-hidden tab. Once committing starts it finishes even if the person navigates away. `BackupSection.tsx` and `RestoreSheet.tsx` on the Your data page. | `A/backup/{CloudBackupCoordinator,CloudBackupRestore}.kt` [322, 106: local parts only]; `I/Services/CloudBackupService.swift` [466: restore order]; `T/backup/CloudBackupRestoreTest.kt` [282]; `docs/cloud-backup.md` (reference doc, behaviour only) | `src/services/backup/backup.ts`, `src/services/backup/backup.test.ts`, `src/services/backup/restore.ts`, `src/services/backup/restore.test.ts`, `src/features/settings/data/BackupSection.tsx`, `src/features/settings/data/RestoreSheet.tsx`, `src/features/settings/data/RestoreSheet.test.tsx` | backup → erase → restore gives identical tables (ids, photos, chat) and no secrets; the backup never contains a key (search the bytes for a known key); a newer version is refused with nothing changed; insufficient quota refused before staging; a staging failure leaves everything as it was; the preview shows counts and needs confirmation; an active fast restored with tracking off is ended. |
| P09-14 | **Restore from file on Welcome.** `src/features/onboarding/RestoreFromFile.tsx` (01 §3.5 as a web form, D-16.30): the Welcome link opens a file picker and runs the P09-13 restore with its preview and confirmation; a restored profile with onboarding done → "Open Platewise" to Home without seeding anything; data restored but no finished setup → continue the wizard over the restored data; failure → the message with "Try again" or "Start fresh". Leaving is impossible while it runs. | `A/ui/onboarding/{ReturningUser,ReturningUserStep}.kt` [224, 695: state machine only]; `T/ui/onboarding/ReturningUserStateTest.kt` [258] | `src/features/onboarding/RestoreFromFile.tsx`, `src/features/onboarding/RestoreFromFile.test.tsx` | a complete backup lands on Home with its entries; a backup without a profile continues to the Sex step with restored entries kept; a bad file shows Try again; Back is disabled while restoring. |
| P09-15 | **Your data page, storage card and persistence.** `src/features/settings/data/DataPage.tsx` (06 §3.15–3.16, R06.5, R06.15, R06.19, D-16.8): Export, Import, Backup section, Restore; Clear diary (confirm; entries removed, photos pruned; profile, weights, saved meals and settings kept); Erase everything (confirm; invalidates any running backup through a generation, stops reminder timers, then `eraseEverything`, then onboarding). `StorageCard.tsx`: photo bytes, thumbnail bytes, total usage and quota, persistence status, Clear cache (thumbnails only, rebuilt on demand), "…" until measured, one action at a time. `src/services/storageNudge.ts`: after the first logged entry ask for persistent storage once; when not granted or not installed, a dismissible nudge to install and back up; a reminder when the last backup is older than 14 days. A nudge is marked done only after it was actually shown and dismissed. | `A/ui/settings/StorageSettingsCard.kt` [182]; `A/services/StorageMaintenance.kt` [114: clear-cache part]; `A/ui/settings/SettingsViewModel.kt` [1 727: lines 1469–1500] | `src/features/settings/data/DataPage.tsx`, `src/features/settings/data/StorageCard.tsx`, `src/features/settings/data/StorageCard.test.tsx`, `src/services/storageNudge.ts`, `src/services/storageNudge.test.ts` | Clear diary keeps saved meals and their photos; Erase during a backup → that backup never records success; first log calls persist once; a nudge that never rendered is not marked done; Clear cache keeps photos. |
| P09-16 | **About, licences and credits.** `src/features/about/AboutPage.tsx` (06 §3.20, D-16.43): our mark, version (a build constant), update status from P09-17 ("up to date" / "update ready — reload"), a link to the changelog, share Platewise (`navigator.share`, else copy the link), help and contact links from a config file of Platewise's own URLs (placeholders until the owner supplies them, Proposed D-16.66), the calculation methods page. `CreditsPage.tsx`: third-party licences generated by `scripts/notices.ts` into `src/generated/notices.json` at build time, plus the reference's MIT notice as credit and the "inspired by" line (00-decisions, 01-clean-room §7). No What's New dialog. | `A/ui/about/AboutScreen.kt` [683: section list only; write our own copy] | `src/features/about/AboutPage.tsx`, `src/features/about/AboutPage.test.tsx`, `src/features/about/CreditsPage.tsx`, `src/features/about/CreditsPage.test.tsx`, `src/config/links.ts`, `scripts/notices.ts`, `scripts/notices.test.ts` | version shown; share falls back to copy; credits list every production dependency with its licence and the reference credit; notices script output is stable across runs. |
| P09-17 | **Service worker and update flow.** `src/sw/sw.ts` (architecture §4 row 14): precache the app shell from the build manifest (a small Vite plugin of our own in `vite.config.ts` writes the list and a version), serve same-origin static assets cache-first, navigation requests network-first with the cached `index.html` as the offline fallback, and never touch cross-origin requests (AI providers, Open Food Facts, FoodData Central stay network-only); delete old `platewise-` caches on activate; wait for the page to ask before `skipWaiting`. `src/app/swRegistration.ts`: register in production, call `registration.update()` on launch and on visibility; a waiting worker sets the update flag; `UpdateBanner.tsx`: "Update ready — Reload", never reloading by itself (no reload mid-edit). | none (web platform; spec 06 §5 About/update and 05 §3.1.1 update dot) | `src/sw/sw.ts`, `src/sw/sw.test.ts`, `src/app/swRegistration.ts`, `src/app/swRegistration.test.ts`, `src/app/UpdateBanner.tsx` | `sw.test.ts` with a fake `self`/caches: precache on install, old caches removed on activate, a request to `generativelanguage.googleapis.com` is not intercepted, navigation offline returns the cached shell; `swRegistration.test.ts`: waiting worker → flag set, no reload until the banner is pressed. |
| P09-18 | **Manifest, install and CSP.** `public/manifest.webmanifest`: name Platewise, short name, our icons (P00-04, maskable included), theme and background colours from the dark tokens, `display: standalone`, `start_url` and `scope` `./`, `id`, static shortcuts for Camera, Describe and Scan (`#/log/camera` etc., P2 L8 but cheap). `src/app/InstallPrompt.tsx`: uses `beforeinstallprompt` where offered; on iOS Safari explains Add to Home Screen; never nags twice in a week. `index.html`: manifest link, theme-color, and a CSP meta: `default-src 'self'`; `script-src 'self' 'wasm-unsafe-eval'`; `style-src 'self'`; `img-src 'self' blob: data: https://images.openfoodfacts.org`; `connect-src 'self' https: http://localhost:* http://127.0.0.1:* http://[::1]:*`; `worker-src 'self'`; `object-src 'none'`; `base-uri 'none'`; no third-party scripts or fonts (L6). | none | `public/manifest.webmanifest`, `src/app/InstallPrompt.tsx`, `src/app/InstallPrompt.test.tsx` | `InstallPrompt.test.tsx`: deferred prompt shown once and not again within 7 days; iOS user agent shows instructions; a test parses `index.html` and asserts every CSP directive above; the manifest parses and every icon path exists. |
| P09-19 | **Settings, data and offline e2e.** `e2e/settings-data.spec.ts`: change the accent and units; export CSV and check its header and a row; import our JSON with Replace and see a matched entry keep its photo; back up, erase everything, restore from Welcome and see the same diary, chat and settings; notifications with permission denied keep the switch off; a second Playwright project with service workers allowed loads the built app, goes offline and reloads successfully, and an AI call offline shows the offline message. | none | `e2e/settings-data.spec.ts` | passes three times in a row in both projects. |

## Files to create (74)

| Path (under `platewise/`) | What it holds | Task |
|---|---|---|
| `src/features/settings/CategoryPage.tsx` | Shared category page frame with the load gate | P09-01 |
| `src/features/settings/CategoryPage.test.tsx` | Tests for `CategoryPage.tsx`: the Verify cases of P09-01 | P09-01 |
| `src/features/settings/app/AppPage.tsx` | Appearance, accent, grams first, week start, links | P09-02 |
| `src/features/settings/app/AppPage.test.tsx` | Tests for `AppPage.tsx`: the Verify cases of P09-02 | P09-02 |
| `src/features/settings/app/UnitsSection.tsx` | Energy, height and weight units | P09-02 |
| `src/features/settings/app/UnitsSection.test.tsx` | Tests for `UnitsSection.tsx`: the Verify cases of P09-02 | P09-02 |
| `src/features/settings/tracking/MealTimesSheet.tsx` | Meal times editor | P09-03 |
| `src/features/settings/tracking/MealTimesSheet.test.tsx` | Tests for `MealTimesSheet.tsx`: the Verify cases of P09-03 | P09-03 |
| `src/features/settings/app/TabsPage.tsx` | Hide Progress or Coach | P09-04 |
| `src/features/settings/app/TabsPage.test.tsx` | Tests for `TabsPage.tsx`: the Verify cases of P09-04 | P09-04 |
| `src/features/settings/app/MenuEditorPage.tsx` | Add-menu editor | P09-05 |
| `src/features/settings/app/MenuEditorPage.test.tsx` | Tests for `MenuEditorPage.tsx`: the Verify cases of P09-05 | P09-05 |
| `src/features/settings/app/ProductFieldsPage.tsx` | Product block settings | P09-06 |
| `src/features/settings/app/ProductFieldsPage.test.tsx` | Tests for `ProductFieldsPage.tsx`: the Verify cases of P09-06 | P09-06 |
| `src/features/settings/ai/AiPage.tsx` | AI providers and standbys | P09-07 |
| `src/features/settings/ai/AiPage.test.tsx` | Tests for `AiPage.tsx`: the Verify cases of P09-07 | P09-07 |
| `src/features/settings/ai/RoleCard.tsx` | One role's provider settings | P09-07 |
| `src/features/settings/ai/RoleCard.test.tsx` | Tests for `RoleCard.tsx`: the Verify cases of P09-07 | P09-07 |
| `src/features/settings/ai/InstructionsField.tsx` | Notes for the AI | P09-07 |
| `src/features/settings/ai/InstructionsField.test.tsx` | Tests for `InstructionsField.tsx`: the Verify cases of P09-07 | P09-07 |
| `src/features/settings/ai/FoodDbSection.tsx` | FoodData Central key | P09-07 |
| `src/services/reminders/schedule.ts` | Reminder times, due list, summary text | P09-08 |
| `src/services/reminders/schedule.test.ts` | Tests for `schedule.ts`: the Verify cases of P09-08 | P09-08 |
| `src/services/reminders/engine.ts` | In-app evaluation and dispatch | P09-08 |
| `src/services/reminders/engine.test.ts` | Tests for `engine.ts`: the Verify cases of P09-08 | P09-08 |
| `src/features/settings/tracking/RemindersSection.tsx` | Notification settings | P09-09 |
| `src/features/settings/tracking/RemindersSection.test.tsx` | Tests for `RemindersSection.tsx`: the Verify cases of P09-09 | P09-09 |
| `src/services/reminders/notifier.ts` | System notification or banner | P09-09 |
| `src/services/reminders/notifier.test.ts` | Tests for `notifier.ts`: the Verify cases of P09-09 | P09-09 |
| `src/services/transfer/exportDiary.ts` | Range resolution and JSON export | P09-10 |
| `src/services/transfer/exportDiary.test.ts` | Tests for `exportDiary.ts`: the Verify cases of P09-10 | P09-10 |
| `src/services/transfer/exportFormats.ts` | Markdown and CSV | P09-10 |
| `src/services/transfer/exportFormats.test.ts` | Tests for `exportFormats.ts`: the Verify cases of P09-10 | P09-10 |
| `src/features/settings/data/ExportSheet.tsx` | Export sheet | P09-10 |
| `src/i18n/en/data.ts` | Your-data copy partition | P09-10 |
| `src/services/transfer/importDiary.ts` | Validation and merge | P09-11 |
| `src/services/transfer/importDiary.test.ts` | Tests for `importDiary.ts`: the Verify cases of P09-11 | P09-11 |
| `src/features/settings/data/ImportSheet.tsx` | Import preview and actions | P09-11 |
| `src/services/backup/zip.ts` | Stored-ZIP writer and reader | P09-12 |
| `src/services/backup/zip.test.ts` | Tests for `zip.ts`: the Verify cases of P09-12 | P09-12 |
| `src/services/backup/archive.ts` | Backup layout and safe names | P09-12 |
| `src/services/backup/archive.test.ts` | Tests for `archive.ts`: the Verify cases of P09-12 | P09-12 |
| `src/services/backup/hash.ts` | Canonical content hash | P09-12 |
| `src/services/backup/hash.test.ts` | Tests for `hash.ts`: the Verify cases of P09-12 | P09-12 |
| `src/services/backup/backup.ts` | Create a backup file | P09-13 |
| `src/services/backup/backup.test.ts` | Tests for `backup.ts`: the Verify cases of P09-13 | P09-13 |
| `src/services/backup/restore.ts` | Validate, confirm and restore | P09-13 |
| `src/services/backup/restore.test.ts` | Tests for `restore.ts`: the Verify cases of P09-13 | P09-13 |
| `src/features/settings/data/BackupSection.tsx` | Back up now and last backup | P09-13 |
| `src/features/settings/data/RestoreSheet.tsx` | Restore preview and confirm | P09-13 |
| `src/features/settings/data/RestoreSheet.test.tsx` | Tests for `RestoreSheet.tsx`: the Verify cases of P09-13 | P09-13 |
| `src/features/onboarding/RestoreFromFile.tsx` | Restore entry on Welcome | P09-14 |
| `src/features/onboarding/RestoreFromFile.test.tsx` | Tests for `RestoreFromFile.tsx`: the Verify cases of P09-14 | P09-14 |
| `src/features/settings/data/DataPage.tsx` | Your data page | P09-15 |
| `src/features/settings/data/StorageCard.tsx` | Storage usage and persistence | P09-15 |
| `src/features/settings/data/StorageCard.test.tsx` | Tests for `StorageCard.tsx`: the Verify cases of P09-15 | P09-15 |
| `src/services/storageNudge.ts` | Persistence request and nudges | P09-15 |
| `src/services/storageNudge.test.ts` | Tests for `storageNudge.ts`: the Verify cases of P09-15 | P09-15 |
| `src/features/about/AboutPage.tsx` | About Platewise | P09-16 |
| `src/features/about/AboutPage.test.tsx` | Tests for `AboutPage.tsx`: the Verify cases of P09-16 | P09-16 |
| `src/features/about/CreditsPage.tsx` | Licences and credits | P09-16 |
| `src/features/about/CreditsPage.test.tsx` | Tests for `CreditsPage.tsx`: the Verify cases of P09-16 | P09-16 |
| `src/config/links.ts` | Platewise's own URLs | P09-16 |
| `scripts/notices.ts` | Generates the notices list | P09-16 |
| `scripts/notices.test.ts` | Tests for `notices.ts`: the Verify cases of P09-16 | P09-16 |
| `src/sw/sw.ts` | Service worker | P09-17 |
| `src/sw/sw.test.ts` | Tests for `sw.ts`: the Verify cases of P09-17 | P09-17 |
| `src/app/swRegistration.ts` | Registration and update detection | P09-17 |
| `src/app/swRegistration.test.ts` | Tests for `swRegistration.ts`: the Verify cases of P09-17 | P09-17 |
| `src/app/UpdateBanner.tsx` | Update banner | P09-17 |
| `public/manifest.webmanifest` | Web app manifest | P09-18 |
| `src/app/InstallPrompt.tsx` | Install prompt or instructions | P09-18 |
| `src/app/InstallPrompt.test.tsx` | Tests for `InstallPrompt.tsx`: the Verify cases of P09-18 | P09-18 |
| `e2e/settings-data.spec.ts` | Settings, data and offline end to end | P09-19 |

## Files to update (11)

| Path (under `platewise/`) | Change | Task |
|---|---|---|
| `src/features/settings/SettingsHub.tsx` | Final hub layout and update dot | P09-01 |
| `src/features/settings/registry.ts` | Register every v1 category | P09-01 |
| `src/features/settings/tracking/TrackingPage.tsx` | Add meal times and reminders | P09-03 |
| `src/features/onboarding/steps/Welcome.tsx` | Wire the restore link | P09-14 |
| `src/services/diary.ts` | Call the storage nudge after the first log | P09-15 |
| `vite.config.ts` | Service-worker build and precache-list plugin | P09-17 |
| `index.html` | Manifest link, theme colour, CSP | P09-18 |
| `playwright.config.ts` | Project with service workers allowed | P09-19 |
| `package.json` | `notices` script run before build | P09-16 |
| `.gitignore` | Ignore `src/generated/` | P09-16 |
| `src/i18n/en.ts` | Import the data partition (lead) | P09-10 |

## Migrations and fixtures (2)

| Path (under `platewise/`) | What it holds | Task |
|---|---|---|
| `e2e/fixtures/diary-import.json` | A small diary in our format | P09-19 |
| `src/services/backup/__fixtures__/*.zip` | Tiny archives: valid, bad CRC, traversal names, newer version | P09-12 |

## Task notes (19)

`docs/notes/P09/<slug>.md`, one per task, from `docs/notes/_template.md`, written before the code:

- `docs/notes/P09/settings-hub-and-load-gate.md` (P09-01)
- `docs/notes/P09/app-settings-and-units-pages.md` (P09-02)
- `docs/notes/P09/meal-times-editor.md` (P09-03)
- `docs/notes/P09/tab-bar-page.md` (P09-04)
- `docs/notes/P09/add-menu-editor.md` (P09-05)
- `docs/notes/P09/product-fields-page.md` (P09-06)
- `docs/notes/P09/ai-providers-page-and-food-database-key.md` (P09-07)
- `docs/notes/P09/reminder-engine.md` (P09-08)
- `docs/notes/P09/notifications-settings-and-notifier.md` (P09-09)
- `docs/notes/P09/export-diary.md` (P09-10)
- `docs/notes/P09/import-diary.md` (P09-11)
- `docs/notes/P09/backup-archive-codec-and-content-hash.md` (P09-12)
- `docs/notes/P09/backup-and-restore.md` (P09-13)
- `docs/notes/P09/restore-from-file-on-welcome.md` (P09-14)
- `docs/notes/P09/your-data-page-storage-card-and-persistence.md` (P09-15)
- `docs/notes/P09/about-licences-and-credits.md` (P09-16)
- `docs/notes/P09/service-worker-and-update-flow.md` (P09-17)
- `docs/notes/P09/manifest-install-and-csp.md` (P09-18)
- `docs/notes/P09/settings-data-and-offline-e2e.md` (P09-19)

## Run until green

```bash
cd platewise
pnpm install --frozen-lockfile
pnpm lint && pnpm fmt:check && pnpm typecheck && pnpm test   # fix and re-run until all pass
pnpm build && pnpm e2e                                        # browser tests, mobile viewport
PLATEWISE_REF=/root/reference/fud-ai pnpm check --require-ref # similarity, banned, assets, licences, traps, acceptance
```

Phase additions, inside the same loop:

```bash
pnpm build && pnpm exec playwright test e2e/settings-data.spec.ts
pnpm check:bundle
```

On any failure, fix the cause and run the whole loop again from `pnpm install`. Never skip a test, widen an allow-list without a written reason, or edit a recorded fixture to make a test pass. Real waits are banned in tests: use fake timers (`vi.useFakeTimers()`) and the clock helpers in `src/test/time.ts`.

## Compare checklist (reopen the reference after writing)

- [ ] Settings hub order and page contents against 06 §3.1–3.10; record every reference row as kept, dropped (cite D-id or 06 §5) or later.
- [ ] Export: ranges, content rules, number rounding, CSV/Markdown layout behaviour; deliberate: our own format and names (D-16.2), week start honoured (R06.17).
- [ ] Import: every validation branch and the replace-range merge (R06.16).
- [ ] Backup/restore: inclusion and exclusion lists, safe names, hash exclusions (R06.7, R06.9), validate-then-commit order (R06.6); deliberate: local file (D-16.30), confirm (D-16.42), chat included (D-16.29).
- [ ] Reminders: re-check at fire time, cancel paths (R06.10, R05.20); deliberate model (D-16.41) and web limits (D-16.5).
- [ ] Erase everything: order of steps; backup invalidated first (R06.5).
- [ ] Every task note's compare section is ticked, each tick naming its test.
- [ ] Trap rows owned by this phase in `docs/internals/traps-ledger.md` now carry `Test:` lines (the lead updates the ledger at land time).
- [ ] Acceptance rows owned by this phase in `docs/internals/acceptance-map.md` now carry `Test:` lines.

## Done when

All P09 tests pass; `e2e/settings-data.spec.ts` passes in both projects; the bundle stays under budget. **Demo 6 (M7):** install the built app, turn the network off and reopen it; export this week as CSV; back up, erase everything, restore the file from Welcome and find the same diary, photos, saved meals and Coach chat; keys are not in the file.
