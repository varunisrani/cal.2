# Task: Settings, data and offline e2e (P09-19) · Phase: 09 · Owner: builder (wt-p09s19, wave C)

Read (reference @ `10e14b67`): none. The phase row lists no reference file: the flows are ours, and
the spec strings together screens and services that already landed (P09-01..18) and proves them
end to end in a browser. Our own docs read: the P09-19 row and "Goal" of
`docs/plan/phases/P09-settings-data-platform.md`; D-16.1 (accents), D-16.2 (our diary file),
D-16.5 (reminders while open), D-16.7 (keys on the device), D-16.8 (persistence), D-16.30 and
D-16.42 (local backup, restore asks first); the acceptance rows whose Review line names P09-19
(ACC-K1-1, ACC-L2-1; no trap row names it); the P09 notes this e2e drives (`app-settings-and-units`,
`export-diary`, `import-diary`, `backup-and-restore`, `restore-on-welcome`, `your-data-page`,
`notifications-and-notifier`, `ai-providers-page`, `service-worker-and-updates`) and the logging
note's hand-on (`docs/notes/P06/logging-e2e.md`: the keyed FoodData Central path); the landed
specs `e2e/logging.spec.ts`, `e2e/coach.spec.ts`, `e2e/home-progress.spec.ts` and their helpers in
`e2e/support.ts`; the landed code for hooks, words and behaviour (`AppPage.tsx`,
`UnitsSection.tsx`, `DataPage.tsx`, `ExportSheet.tsx`, `ImportSheet.tsx`, `BackupSection.tsx`,
`RestoreSheet.tsx`, `RestoreFromFile.tsx`, `OnboardingRoute.tsx`, `Welcome.tsx`,
`RemindersSection.tsx`, `FoodDbSection.tsx`, `EntryEditor.tsx`, `PhotoStrip.tsx`,
`AnalysisOverlay.tsx`), the services behind them (`transfer.ts`, `exportDiary.ts`,
`exportFormats.ts`, `importDiary.ts`, `backup.ts`, `restore.ts`, `yourData.ts`, `notifier.ts`,
`trackingSettings.ts`, `barcode/lookup.ts`, `barcode/fdc.ts`, `ai/errors.ts`), the worker and its
registration (`src/sw/sw.ts`, `src/app/swRegistration.ts`) and `playwright.config.ts`. A probe in
the browser (a throwaway spec, deleted) settled three facts the tests lean on: headless Chromium
has no `navigator.share` (so files are downloaded), it reports `Notification.permission` as
`denied` before anything is asked and answers a request with `default` (so the browser's own
answer is not a clean "no"), and `context.setOffline(true)` reaches the service worker too (its
navigation fetch fails with `ERR_INTERNET_DISCONNECTED`).

What it does (own words): seven browser tests on the Pixel 7 profile, each from an empty browser,
walk the wizard (on its defaults; with the AI as the Custom provider at the fake's loopback
address where the test needs the AI, else "set up later") and land on Home on Tuesday 2026-10-27
at 08:30 UTC. Then:
1. App settings: the Ember accent is chosen and `<html data-accent>` follows at once; energy goes
   to kJ, weight to kg and height to cm; Home writes a 250 kcal entry as 1,046 kJ, a reload keeps
   every choice, and switching back to kcal reads 250 again (nothing stored was converted).
2. Export (ACC-K1-1): water tracking on, a 250 ml glass and a food whose name has a comma and
   quotes; Your data › Export › This week › CSV › Export downloads
   `platewise-diary-2026-10-26_to_2026-10-27.csv`; its header names every column (energy in
   kcal), the food row carries the time, meal, quoted name and values, there is a water row and a
   day-water row.
3. Import (ACC-K2-2, R06.16): a meal photo analysed and logged at 08:15 (picked in the review), a
   coffee entered by hand today and a porridge yesterday; Your data › Import picks our fixture
   `e2e/fixtures/diary-import.json` (today only: the bowl at 08:15 with new values, and a lentil
   salad at lunch); the preview counts 2 foods, 0 water logs, today; Replace these dates: the bowl
   keeps its photo (the entry editor shows it, decoded) with the file's 480 kcal, the coffee is
   gone, the salad is new under lunch, yesterday's porridge is untouched.
4. Backup, erase, restore (ACC-K3-1, ACC-K4-1, ACC-K6-1, ACC-B10-1): a photo meal, a Coach
   question with its answer, the Lagoon accent and kJ; Your data › Back up now downloads
   `platewise-backup-2026-10-27.zip` and the card shows the time; Erase everything (asked first)
   restarts on Welcome with the default accent; Welcome › Restore from a backup file picks that
   zip; the sheet shows when it was made and counts 1 entry, 1 photo, 2 messages, and nothing
   changes before Restore; Restore → Open Platewise → Home has the same entry in kJ, the accent is
   Lagoon, the entry's photo shows, and the Coach has the same two messages; the fake was asked
   nothing during the restore.
5. Notifications (ACC-J11-1, R06.13): the browser is made to answer "no" (an init script stands
   in for the permission prompt: `default` until asked, then `denied`); Settings › Tracking &
   reminders › Reminders pressed: the browser is asked once, the switch stays off, the pointer to
   the site settings shows, no reminder row appears; after a reload it is still off.
6. FoodData Central with a key (R02.18, R02.15): Settings › AI providers › Food databases stores a
   key (shown masked); typed digits Open Food Facts does not know → exactly one FoodData Central
   search, a POST whose `X-Api-Key` header is the key, and neither its address nor its body nor
   any other request carries it; the lookup then says not found and offers Scan label.
7. Offline (ACC-L2-1), in a second project with service workers allowed: after onboarding and a
   food entered by hand the page waits until the worker controls it; with the network off a reload
   is answered by the worker (the worker's own fetch failed offline), Home shows the entry, and
   Describe › Analyse fails with the offline message without reaching the fake.
Every test routes all non-loopback traffic (the logging spec's routes: Open Food Facts, its image
host and FoodData Central from our fixtures; any other host aborted and recorded); a stray host
or an uncaught page error fails the test.

Inputs → outputs:
- `e2e/settings-data.spec.ts` → seven Playwright tests over the built app (`vite preview`), one
  worker, Pixel 7, `en-US`, UTC, reduced motion, the page clock installed at 2026-10-27 08:30 UTC.
- `playwright.config.ts` (additive) → a project `offline-chromium`: Pixel 7 with
  `serviceWorkers: 'allow'`, only this spec, only tests tagged `@offline`. The default project
  runs the rest and skips the offline test (service workers blocked there).
- `e2e/fixtures/diary-import.json` → our own small diary in our format (`platewise-diary` 1.0, one
  day, two foods, no water list).
- `e2e/support.ts` (additive) → the FoodData Central searches with their key header and body in
  the route log; a stand-in for the notification prompt that says no; the download of a file a
  page hands over, read as text or saved for a later pick.

Files: created `e2e/settings-data.spec.ts`, `e2e/fixtures/diary-import.json`, this note; changed
`playwright.config.ts` (one project added), `e2e/support.ts` (additions only). No component
change is planned: every locator found a role or an existing `data-ui` hook.

Edge cases / failure modes:
- Files leave through the browser's download (no Web Share in headless Chromium): each test waits
  for Playwright's `download` event and reads the saved file; a browser that could share would
  fail the wait, not pass silently.
- The import matches the stored bowl by day, minute, meal and name: the review's time is set to
  08:15 so the minute does not depend on how long the test took to get there.
- Erase everything reloads the page on `#/onboarding`; the page clock is re-installed by
  Playwright on the new document, and the test waits for Welcome before going on.
- The restore holds onboarding on screen until Open Platewise; the test checks the screen's
  restored phase before pressing it, then Home.
- A backup never carries keys and the Custom provider at loopback has none, so the Coach works
  again after the restore without typing anything.
- The notification permission is the browser's: headless Chromium starts at `denied` and answers
  `default`. The stand-in makes the run say what a person pressing "Block" would see, and counts
  the requests, so "asked once" is real.
- FoodData Central's POST with a key header needs a preflight; the route answers it, and the log
  keeps only the searches (POST) for the "one request" check.
- Offline: the worker installs after the page's `load` and claims the page when it activates;
  the test polls the controller (no fixed wait). The offline reload must come from the worker
  (`response.fromServiceWorker()`), and the worker's own network attempt must have failed, so a
  worker that silently reached the server would fail the test. The network goes back on before
  the test ends.
- The offline AI call: `navigator.onLine` is false, so a failed fetch is the offline failure; the
  fake must have recorded nothing new.

Our design differences / decisions:
- Copy comes from the catalogue through `words()`; locators are roles, names and `data-ui` hooks.
- One spec for the row's scenarios; the offline test is tagged `@offline` and runs only in the
  service-worker project (the default project blocks workers, as every other spec needs).
- The FoodData Central search answers with no match (the route as landed): the test is about
  where the key travels, not about reading FDC's reply (unit-tested in `fdc.test.ts`).
- Decisions for the lead: (1) the second project is named `offline-chromium` and selects tests by
  the `@offline` tag; (2) the notification "no" is an init-script stand-in for the permission
  prompt, because Playwright can grant permissions but not deny one and headless Chromium's own
  answer (`default`) is not a denial; (3) `diary-import.json` keeps the fields our export writes
  (totals, targets, left, water total) but no water list, so it is a food-only file.

Tests we will write (`e2e/settings-data.spec.ts`):
- `settings and data (Demo 6)`:
  - `changes the accent and the units: the page and Home follow at once, a reload keeps them, and no stored kcal changes (P09-02)`
  - `exports this week as CSV with its header, the food row and the water rows (ACC-K1-1)`
  - `imports our diary file with Replace: the matched entry keeps its photo and takes the file's values (ACC-K2-2, R06.16)`
  - `backs up, erases everything and restores from Welcome to the same diary, chat and settings (ACC-K3-1, ACC-K4-1, ACC-K6-1, ACC-B10-1)`
  - `keeps the notification switch off when the browser says no, and points to its settings (ACC-J11-1, R06.13)`
  - `sends a stored FoodData Central key in its header only, once, after an Open Food Facts miss (R02.18, R02.15)`
- `offline (service workers allowed)`:
  - `reloads with the network off from the service worker, and an AI request offline says so (ACC-L2-1)`
Every test three times in a row (`--repeat-each=3`), one worker; then the whole e2e folder once.

Compare checklist (filled after the rewrite; no reference file applies: the flows are ours, so
each tick names the test of `e2e/settings-data.spec.ts` that proves it; T1..T7 are the seven tests
above, in order, with the ids their final titles carry):
- [x] Ember is drawn at once (`<html data-accent="ember">`, the swatch checked), from Basil; kJ, kg
      and cm replace en-US's kcal, lb and ft-in, each choice checked at once; Home reads the 250
      kcal toast as 1,046 kJ under the kJ gauge heading; Progress reads the wizard's weigh-in as
      154.3 lb before and 70.0 kg after, Personal info its height as 5 ft 9 in before and 175 cm
      after; a reload keeps the accent and the three units; back to kcal the toast reads 250 kcal
      (T1, ACC-A9-1, ACC-C12-1, D-16.1)
- [x] This week as CSV: `platewise-diary-2026-10-26_to_2026-10-27.csv` downloaded, the toast says
      so; one header whose first ten and last five columns are the fixed ids (energy in kcal), with
      the nutrient columns between; every row as wide as the header; rows food, water, day water;
      the food row's date, time (the row's own minute), meal, name with its comma and quotes back
      whole, 250 kcal and source; the water row's time and 250 ml; the day's 250 ml total (T2,
      ACC-K1-1)
- [x] Import with Replace: the preview counts 2 foods, 0 water logs and "Oct 27" (today); the
      sheet closes and the toast counts 2 foods and 0 water logs; the photo bowl logged at 08:15 is
      matched by day, minute, meal and name (its id in the file is unknown here), keeps its photo
      (an `<img>` from a `blob:` URL, decoded) and takes the file's 480 kcal and note; the coffee
      nothing matched is gone; the salad is new under lunch; yesterday's porridge, outside the
      file's dates, is untouched (T3, ACC-K2-2, R06.16)
- [x] Back up now: the card said "No backup yet", one `platewise-backup-2026-10-27.zip` downloads
      and the card shows today; Erase everything asks in its dialog, then the app starts again on
      Welcome at `#/onboarding` with the default accent; Restore from a backup file → the screen's
      asking phase, the sheet with the backup's day, 1 diary entry, 1 photo, 2 Coach messages and
      what it replaces; Restore → the restored phase → Open Platewise → Home with the one entry in
      kJ and Lagoon; the entry's photo decoded; the Coach's question and answer in order; the fake
      asked nothing after the erase (T4, ACC-K3-1, ACC-K4-1, ACC-K6-1, ACC-B10-1, R06.8)
- [x] Notifications refused: before asking, the switch is off with no pointer; pressed, the browser
      is asked once, the switch stays off and enabled, the pointer says where to allow them, no
      reminder rows; after a reload it is still off with the pointer and nothing asked again (T5,
      ACC-J11-1, R06.13)
- [x] FoodData Central key: saved through Settings › AI providers, shown as `fdc-…0042`, the field
      emptied; typed digits Open Food Facts lacks → the not-found failure with Scan label; one OFF
      request, then exactly one FDC search whose `X-Api-Key` is the key; neither its address nor its
      body (which carries the code) nor any other database or AI request holds the key (T6,
      R02.18, R02.15)
- [x] Offline, service workers allowed: the worker controls the page after onboarding; with the
      network off the reload's response comes from the worker with 200 while the worker's own
      fetch of `/` failed offline; Home shows the entry; Describe › Analyse → the failure dialog
      with the offline message, the fake asked nothing; Cancel leaves Home as it was (T7,
      ACC-L2-1, R03.2)
- [x] Network guard and page errors: every test ends with no stray host and no uncaught page error
      (the `afterEach` checks), in both projects
- [x] Mutation checks, each on a rebuilt app, then restored (`git status` clean under `src/`):
      the import dropping a matched entry's photos failed T3 at the photo; the FDC key also in the
      URL failed T6 on the address; CSV fields never quoted failed T2 on the row width; the worker
      without its offline shell failed T7 at the reload (`net::ERR_FAILED`); a restore dropping
      the `display.` and `units.` settings failed T4 at Home in kJ; a switch that ignores the
      permission (and a master stored on without a grant) failed T5 at "stays off"
- Gaps found while writing: the wizard's default height is 175 cm (not 170), and headless
  Chromium's own permission answers are `denied` before any request and `default` after one, which
  is why T5 uses the stand-in. Progress and Personal info were added to T1 so that kg and cm are
  seen to change only the display, as kJ is on Home.
- Deliberate differences: none against the reference (no reference flow).
- Not taken: a Sunday week start for the export range (R06.17, unit-tested in
  `exportDiary.test.ts`); a kJ reader's export (ACC-K1-2, unit-tested); Add as new; FoodData
  Central answering with a product (the route answers no match; `fdc.test.ts` reads replies);
  the update banner in the browser (unit-tested in `swRegistration.test.ts`).

## Status

Done (2026-10-27). Seven tests in `e2e/settings-data.spec.ts` (final titles):
`settings and data (Demo 6)` > `changes the accent and the units: the page and Home follow at
once, a reload keeps them, and no stored value changes (ACC-A9-1, ACC-C12-1, D-16.1)`, `exports this
week as CSV with its header, the food row and the water rows (ACC-K1-1)`, `imports our diary file
with Replace: the matched entry keeps its photo and takes the file's values (ACC-K2-2, R06.16)`,
`backs up, erases everything and restores from Welcome to the same diary, chat and settings
(ACC-K3-1, ACC-K4-1, ACC-K6-1, ACC-B10-1, R06.8)`, `keeps the notification switch off when the
browser says no, and points to the browser's settings (ACC-J11-1, R06.13)`, `sends a stored
FoodData Central key in its header only, once, after an Open Food Facts miss (R02.18, R02.15)`;
`offline (service workers allowed)` > `reloads with the network off from the service worker, and
an AI request offline says so (ACC-L2-1, R03.2)` (tag `@offline`). Three times in a row in both
projects, one worker: 21/21 passed, 3 skipped (the offline test in `mobile-chromium`, by design);
the whole e2e folder once: 37 passed, 1 skipped. Outside the spec: `playwright.config.ts` (one
project added), `e2e/support.ts` (additions only: `fdcSearches` in the route log,
`refuseNotifications`, `notificationRequests`), `e2e/fixtures/diary-import.json`. No component
changed: every locator found a role or an existing `data-ui` hook. Handed on: the lead replaces
the `Review: P09-19` lines of ACC-K1-1 and ACC-L2-1 with the `Test:` lines above.
