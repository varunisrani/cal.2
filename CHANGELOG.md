# Changelog

What changed in each release of Platewise, newest first. Version numbers follow
[Semantic Versioning](https://semver.org/).

## Unreleased (1.5.0)

### Smart notifications in the Android app

- Platewise now nudges you when it helps. A meal check comes about an hour after your usual meal time if nothing is
  logged. A water-pace nudge comes at 13:00, 16:00 and 19:00 while you are behind, an empty-day nudge at 20:30, and a
  weigh-in nudge a week after your last one. Each is taken back once it no longer applies.
- Notices when the day passes your sugar limit or your calorie target by 10 %, or reaches its protein goal; when the
  week reaches 150 active minutes; when a photo analysis finishes while you are in another app; and when backups fail
  twice in a row.
- Settings › Tracking & reminders › Smart notifications has a switch per kind and Quiet hours (22:00–07:00). Meal
  reminders gain "Only if I haven't logged it". Each kind has its own Android notification channel.
- A bell on Home opens a notification panel with what Platewise sent in the last 30 days (mark read, delete, Clear
  all). A one-time card asks for notification permission.

## 1.4.0 (2026-10-28)

Platewise 1.4 shows your sugar on Home and gives the Coach several chats with a history.

### Sugar on Home

- Home: a Sugar line under the pillars shows the day's sugar against your Sugar limit ("32 g of 50 g"), how far over
  you are and any added sugar. Foods without a sugar figure are never counted as 0 g ("from 4 of 6 foods", "No sugar
  figures"). Tap it for All nutrients.
- All nutrients: a new Sugar on Home switch (on by default). The line also stays hidden while Sugar is one of your
  pillars.
- Coach: it now knows today's sugar and your Sugar limit, and how many of today's foods had a sugar figure.

### Coach chats

- **New chat** at the top of the Coach starts an empty chat with the suggested questions for your goal; it is kept once
  you send its first question. The Coach tab opens the chat you used last.
- **Chats** lists every chat, most recently used first, with its name, when you last used it, the start of its last
  message and "Replying…" while an answer is on its way. Tap to open; **Rename** and **Delete** (asks first) on each.
- A reply keeps going when you open another chat or start a new one, and lands in the chat you asked in; several chats
  can wait at once. Each chat sends only its own messages; what the Coach knows about you is the same in every chat.
- **Delete chat** replaces Clear chat at the top. Each chat keeps its newest 200 messages.
- Your conversation so far becomes your first chat. Chats are in your backups; a 1.3 backup restores as one chat, and
  1.3 restores a 1.4 backup with every message in one conversation. Erase everything deletes all chats.

## 1.3.0 (2026-10-28)

Platewise 1.3 records your walks and tells you how effective they were, and copies your backups to
your own Google Drive.

### Walks in the Android app

- **Record a walk** from + › Walk or Home's activity card: time, distance, pace, steps, cadence
  and active calories as you go, and a line of your route. It keeps recording with the screen off
  and in the background, with a "Walk in progress" notification (Pause, Resume, Stop); if Android
  closes Platewise the walk carries on, and opening the app brings you back to it. Platewise
  explains the location and physical-activity permissions before Android asks; a walk works
  without either.
- **How effective was your walk:** a walk score out of 100 from brisk minutes (100 steps a minute
  or more, or 4.8 km/h without steps), duration toward 30 minutes, intensity (METs from your speed,
  2024 Adult Compendium) and pace against your usual walks, each part explained; your week's
  moderate minutes against the WHO's 150; heart-rate zones when Health Connect has heart rate for
  the walk; and how it compares with your earlier walks.
- Saved walks are in Progress › Walks and in your backups, and the Coach can look them up. With
  Health Connect connected and sending on, a walk is written to Health Connect as a walking
  workout and the day's burn stays Health Connect's; without Health Connect, the walk's active
  calories count in "goal + burned". Burn is never counted twice.
- Health Connect: Platewise can now also read heart rate (for walks) and write walks; the sending
  switch is now **Send meals, weigh-ins and walks**.

### Google Drive backup in the Android app

- Connect your Google Drive in Settings › Your data › Google Drive, through Google's own sign-in
  screens: every backup the app makes (each automatic backup and each Back up now) is then also
  copied into a "Platewise backups" folder in your Drive. Each phone keeps its own newest 7
  copies and never deletes another phone's, so a lost phone's backups stay. Platewise can see only
  the files it made there (Google's `drive.file` access), never the rest of your Drive.
- The card shows the account, when the last copy went up and why the last one failed, Upload now,
  the copies in Drive with their date, size, "This phone" on this phone's own, and Restore
  (checked and confirmed like Restore from a file), and Disconnect (the copies stay in Drive). A failed upload (no connection, a full Drive,
  Google asking to connect again) never stops the app or the backup on the phone; it is tried
  again the next time you open Platewise.
- The first screen of a new install offers **Restore from Google Drive** next to Restore from a
  backup file.
- Whoever builds the app registers it once in Google Cloud (the Drive API, a consent screen with
  the `drive.file` scope, an Android OAuth client with the package name and the signing key's
  SHA-1, which `pnpm android:apk` now prints). Until then, Connect says that this copy is not
  registered. Steps: [docs/user/backup.md](docs/user/backup.md#google-drive-android-app). The web
  app has no Google Drive backup.

## 1.2.0 (2026-10-28)

Platewise 1.2 backs itself up in the Android app, and the keyboard no longer covers what you
type.

### The keyboard

- In the Android app the screen now ends at the top of the keyboard, so the Coach's text box, the
  food entry sheets and the reminder form stay in view while you type; the tab bar and the +
  button step aside while the keyboard is open, so the Coach's text box sits right on the
  keyboard. (On Android 15 and newer the app was drawn under the keyboard.)

### Automatic backup in the Android app

- The Android app saves a full backup by itself: when you open it or come back to it and the
  newest backup is a day old (Daily, the default) or a week old (Weekly). It is the same file as
  Back up now, saved in Documents › Platewise on the phone, where the Files app and Google Drive
  can reach it and where it stays if you uninstall Platewise. The newest 7 are kept; Platewise
  never deletes a file it did not write.
- Settings › Your data › Automatic backup: the switch, Daily or Weekly, the last automatic
  backup, the files with their date, size and Restore (checked and confirmed like Restore from a
  file), and why the last one failed with what to do. "Last backup" and the 14-day reminder count
  automatic backups.
- Android 8 to 10 ask once for access to your files; Android 11 and newer need no permission.
  The web app keeps backups by hand. How it works:
  [docs/user/backup.md](docs/user/backup.md#automatic-backup-android-app).

## 1.1.0 (2026-10-28)

Platewise 1.1 has a new orange look in a light and a dark theme, shows weight in kilograms only,
and comes to Android as an app that reads your steps, burned calories, workouts and weigh-ins
from Health Connect and can count the calories you burn in the day's target. The Coach sees that
activity, has an easier chat and can set reminders for you; reminders, including your own, come as
Android notifications. The health features exist only in the Android app. How to install the app
and what each setting does: [docs/user/android.md](docs/user/android.md).

### A new look

- Orange is Platewise's colour: buttons, the + button, the selected tab, the calorie gauge,
  links, selected items and charts. The light theme is white with warm grey lines; the dark theme
  is a neutral charcoal. Both keep every text and control at WCAG AA contrast.
- Pill buttons, rounder cards and sheets with soft shadows, a floating tab bar with an orange
  capsule on the selected tab, refreshed switches and segmented controls.
- A new app icon and splash screen: the plate and leaf on an orange tile.
- System, Light and Dark stay in Settings › App; the other accent colours (Basil, Saffron, Lagoon,
  Beet, Ember, Ink) remain as choices after Orange. A colour you chose before is kept.

### Weight in kilograms

- Weight is shown and entered in kg everywhere: onboarding, Settings, weigh-ins, goals, pace (kg
  per week), Progress, exports and the Coach. The kg/lb choice is gone. If you used lb, your
  weights now show in kg; no saved number changes. Height and energy keep their choices.

### The Coach

- The chat scrolls on its own and stays on the newest message; scroll up to read and a "Jump to
  latest" button shows how many messages are new. The text box stays above the keyboard and grows
  to six lines; Copy works on every reply.
- Ask it to remind you ("remind me to drink water at 4 pm every day"): it shows a reminder card,
  and the reminder is set only when you tap Add.
- In the Android app with Health Connect connected, it reads your steps, calories burned,
  distance and workouts, knows today's activity and your "goal + burned" target, and never counts
  active calories twice.

### Reminders and notifications

- In the Android app every reminder is a real Android notification that comes with the app
  closed: breakfast, lunch, dinner, the daily summary, water and the end of a fast. Android 13 and
  newer ask for permission when you turn reminders on.
- Your own reminders: Settings › Tracking & reminders › Your reminders, up to 20, each with your
  words, a time, and every day, chosen weekdays or one date. On the web they show while the app is
  open.

### The Android app

- The same Platewise in an Android shell (Capacitor 7), with the application id
  `app.platewise.android`, for Android 8.0 and newer. It keeps its own diary on the phone; a
  backup file moves a diary between the web app and the Android app.
- `pnpm android:apk` builds a debug APK to install by hand. A release APK is signed only when the
  owner's signing key is passed in four environment variables; no key is ever stored in the
  repository. The version follows `package.json`.
- Platewise's own launcher icon and splash screen, drawn from its web icons. The camera works for
  meal photos and barcodes.
- Android's cloud backup is off for Platewise, so the diary and the AI keys are not copied to a
  Google account. Platewise's own backup files stay the way to keep and move data.
- In the app, Licences and credits also lists the libraries the app carries (Capacitor, the
  Cordova framework, AndroidX with the Health Connect client, Kotlin, Guava and others), each with
  its licence text.

### Health Connect: reading

- Settings › Health Connect, in the Android app only: whether Health Connect is on the phone,
  Connect, which kinds of data are allowed, Open Health Connect, the last sync and Sync now.
- Platewise reads steps, active and total calories burned, distance, workouts and weigh-ins for
  the last 30 days: when the app opens, each time you come back to it, and on Sync now. A kind
  you did not allow is left out; access removed in Health Connect shows as such, with Grant
  access.
- Weigh-ins from other apps join your weight history once each, and one you delete in Platewise
  does not come back. "Import weigh-ins" (on by default) turns this off.
- Records Platewise wrote itself are left out of what it reads.
- A failed sync is shown on the page and tried again later; it never blocks the diary.

### Health Connect: counting burned calories

- "Count active calories" (on by default once connected): the day's calorie target on Home is
  your goal plus that day's active calories, with the line "goal + N burned" under the gauge. The
  day's nutrient sheet uses the same target. Your stored goal and your macro targets never change.
- Only active calories are counted. Total calories and steps are never added to the target.

### Health Connect: writing back

- "Send meals and weigh-ins" (off by default) asks for write access, then sends each meal you log
  (calories, protein, carbs and fat) and each weigh-in you enter to Health Connect, starting with
  the last 30 days. Editing a meal replaces its record and deleting it removes the record.
- Turning it off stops sending and leaves what was sent in Health Connect. Weigh-ins that came
  from Health Connect are never sent back.
- Disconnect stops reading, counting and sending; removing Platewise's access is done in Health
  Connect, which the page opens.

### Settings, Home and Progress

- Settings: the Health Connect page, after Tracking & reminders.
- Home: an Activity card for the day on show, with steps, active calories and workouts, then the
  total calories burned and the distance (km or miles), or a note that Health Connect has nothing
  for that day.
- Progress: steps, active calories, total calories burned and distance for the last 7 or 30 days,
  as charts with their averages.

### Known issues

- The Android app has not been run on a real phone in this project yet: there is no emulator in
  the build machine, so the native code is tested on a computer and the web side against a
  stand-in for Health Connect. The first device tests, including Health Connect's permission
  screens on Android 13 and on Android 14 and newer, are the owner's.
- Reminders as Android notifications, their permission dialog and their delivery while the
  phone sleeps or after a restart have not been tried on a real phone yet.
- In the light theme the Android status and navigation bars stay charcoal.
- The app targets Android 15 (API level 35), as Capacitor 7 does. Google Play's yearly rule very
  likely asks new apps and updates for API level 36 since 31 August 2026: check it before a Play
  upload, which would first need Capacitor 8. Installing the APK directly is not affected.
- Health data is read only while the app is open, and only for the last 30 days. A meal older
  than 30 days that was sent before is no longer updated or removed in Health Connect.

## 1.0.0 (2026-10-27)

The first release. Platewise is a food diary that runs in the browser and can be installed like an
app. You log a meal by photo, a few typed words, a barcode or by hand; an AI provider you choose,
with your own key, estimates the numbers; you check them before anything is logged. There is no
account and no Platewise server: the diary stays on your device.

Platewise's features and flows are inspired by an open-source nutrition app for iOS and Android,
which `THIRD_PARTY_NOTICES.md` and the app's Licences and credits page name and credit, with its
licence notice. Platewise is a separate product, written from scratch for the web: none of that
app's code, words, prompts or artwork is in it.

### Onboarding and goals

- A short setup, one question per screen: sex, birthday, height and weight, an optional body fat
  reading and goal, activity, goal, target weight and pace, optional reminders, and your AI
  provider. Back returns to the previous answer.
- Units start from the browser's language and region (pounds and feet for United States English
  and two other regions, kilograms and centimetres elsewhere) and can be changed during setup or
  later.
- A target weight on the wrong side of your current weight is refused, as it is in Settings.
- With a working key your AI builds the daily plan; if it fails or takes longer than 60 seconds,
  the standard formulas take over and the screen says so. "Set up later" goes straight to the
  formulas.
- Plan ready shows calories, protein, carbs and fat; tap a number to change it. "How is this
  calculated?" explains the formulas and their sources.
- A weekly tune-up lets your AI look at your logs and weigh-ins and adjust the plan. It starts off
  when you changed a number by hand, and can be switched on or off in Settings at any time.
- Settings › Goals and nutrition: daily targets with locks, rebuilding the plan with your AI,
  nutrient goals, and the goal-reached alert. Reaching your goal weight offers "Set a new goal".
- A new device can start from a backup file instead of the setup.

### Logging: photo, description, barcode, manual and reuse

- **Photo:** up to 10 photos per meal from the camera or the photo library, with a note for what a
  photo cannot show. "Plate built in steps" works out each food from what changed between photos
  of the same plate. HEIC photos are opened where the browser can decode them, and refused with a
  clear message where it cannot.
- **Describe:** type what you ate and roughly how much.
- **Barcode:** scan with the camera (the browser's own reader where there is one, otherwise a
  reader that loads on first use) or type the digits. Products are looked up in Open Food Facts,
  then in FoodData Central with your free key. A product without numbers can be filled in by
  photographing its nutrition label, and Platewise remembers that label for the next scan.
- **Manual entry:** name, calories, protein, carbs, fat, an optional fibre value and the meal, with
  no AI involved. Unreadable or negative numbers block saving with a message on the field.
- **Reuse:** Recent (30 days), Often eaten (90 days, with counts) and Saved, each searchable
  without regard to accents or case; Copy a day copies a whole day or one meal to the day you
  picked.
- **The review** opens after every method: name, allergen warnings from your sensitivities,
  serving and unit (with sums such as `2 × 150` in the amount field, and grams first if you weigh
  food), nutrition that scales with the amount and can be edited by hand, micronutrients, meal,
  date and time (the meal follows the time you pick), ingredient parts and recipe servings, a fit
  check of your day with the meal added, and product details for scanned items.
- An analysis can be cancelled, retried after a failure, and survives a page reload while it waits
  for review.
- After logging: tap an entry to edit anything, nutrition included, or reprocess it with a note;
  swipe to delete (Platewise asks first); press and hold, or use Select from the keyboard, to pick
  entries and combine them, adding up every nutrient they share; the heart keeps a copy in Saved.
- The methods of the + menu can be renamed, reordered, regrouped and hidden in Settings.

### The diary and Home

- A week bar with about a year of earlier weeks; swipe across the gauge to move one day. Future
  days are shown but cannot be picked.
- A calorie gauge, one to four nutrient bars of your choice (plus water when you track it), and
  the day's nutrients in full on demand.
- The diary grouped by meal or sorted newest first, with water logs and fasts alongside the food.
- When stored data could not be read and was set aside, a notice above the page says so; it can
  be dismissed.

### Water and fasting

- Water tracking with quick-add amounts you set, a custom amount up to 5 000 ml, a daily goal in
  ml or fl oz (written with your locale's decimal mark), and a water bar on Home.
- A fasting timer with a goal in hours (16 by default). While a fast runs, logging food pauses and
  offers "End fast and log"; a fast's start and end can be edited afterwards.
- A fast left running while fasting tracking is off (after a restore or an import) is ended when
  the app opens, so it never blocks logging.

### Progress and weight

- Weight over a time range you pick, with a chart and a history you can delete from (Platewise
  asks first). Weigh-ins can be back-dated.
- Body fat readings and an optional body fat goal.
- Calories over time with daily averages.
- A weekly recap: days logged, days on your calorie target, days on your protein target, and
  average energy.
- Every chart has a table of its values for keyboard and screen-reader use.

### The Coach

- A chat about your own diary, answered by your AI provider. It sees a summary of your profile,
  plan and today's intake, and looks up weigh-ins, body fat, daily calories, single entries and
  fasts when a question needs them. It reads; it never changes your data.
- It answers in the language you write in. Suggested questions follow your goal; a photo can be
  attached to a question.
- Replies show headings, lists, bold text and safe links, and can be copied.
- A failed question stays in the chat with a plain message, the provider's own error under
  Details (keys removed), and Retry.
- The newest 200 messages are kept, with photos as small copies; the chat is part of backups.
  Clear chat removes it all, and a reply that arrives afterwards is dropped.

### AI providers and keys

- Sixteen choices: fourteen hosted providers used with your own key, your own Ollama, or any
  server that speaks the OpenAI-style chat format. All but two text-only providers can read
  photos. Plain http is accepted only for a server on the same device (`localhost` or
  `127.0.0.1`); anything else needs https.
- A short list of models per provider, and any model id where the provider allows it.
- A separate model for text requests, and a standby for photos and for text, tried once when a
  request fails or its answer cannot be used.
- One time limit covers a whole request, retries and standby included (30 to 600 seconds, 180 by
  default); busy servers are retried after 1, 2 and 4 seconds. Cancel works at any point.
- An answer length limit, OpenRouter's reasoning effort, and notes for the AI sent with every
  request.
- Keys are stored apart from the rest of your data, encrypted with a device key the browser will
  not hand out, shown only by their first and last four characters, and sent only to their own
  provider.

### Settings, data, backup and restore

- Personal info (body data, goal, allergen sensitivities), Goals and nutrition, Tracking and
  reminders, AI providers, App settings and Your data, plus About and Licences and credits.
- App settings: light, dark or system look, six accent colours, grams first, the first day of the
  week, units, the + menu, which product details to show, and which tabs to show (Home and
  Settings always stay).
- Tracking and reminders: water and fasting tracking, your meal times, and reminders for
  breakfast, lunch and dinner at their own times, a daily summary, water and a reached fasting
  goal, all off until you turn them on. Reminders fire while the app is open or in the background;
  one that came due while it was closed shows on the next open.
- Diary export as JSON, Markdown or CSV for the days you pick, and import of a Platewise JSON
  export, either replacing those days or adding to them; a file with any bad value is refused
  whole.
- A backup file (ZIP) with everything, photos and Coach chat included, handed to the share sheet
  or downloaded. Settings shows the last backup and reminds you after 14 days.
- Restore checks the whole file first, shows what it holds, asks before replacing anything, and
  either restores everything or changes nothing.
- A storage card that shows whether the browser agreed to keep the data, with a nudge to install
  and back up; Clear diary; and Erase everything.

### Offline and install

- Installable from Chromium browsers, and from Safari on iPhone and iPad (the install card shows
  the steps). The card shows at most once a week, and never inside the installed app.
- After the first visit the app starts without a connection; only AI requests and barcode
  lookups need one.
- A new version is fetched in the background and offered with a Reload button.
- Shortcuts on the installed icon: Camera, Describe and Scan.
- After the first logged entry Platewise asks the browser to keep its data even when space runs
  low.

### Accessibility

- Swipe-to-delete has a keyboard button, and picking entries to combine has a Select button.
- Charts come with a table of their values; the gauge and the nutrient bars give their numbers to
  screen readers.
- Colour pairs in both themes are checked for contrast; focus is always visible; animations follow
  the system's reduced-motion setting.
- An automated check (axe, WCAG A and AA) runs over the setup, Home, the review, Progress, the
  Coach and every Settings page in both themes, and a keyboard-only walk logs a meal and a weight.

### Privacy and security

- No account, no analytics, no ads, and no third-party scripts or fonts. A strict content security
  policy ships in the page.
- Data leaves the device only for the feature you use: to your AI provider (photos are sent as
  fresh, smaller copies without their file details), to Open Food Facts (the barcode number) and,
  with your key, to FoodData Central. The browser sends no Referer with these requests.
- Keys never appear in exports, backups, error details or the console; tests plant a key in every
  slot and search every output for it.
- Exports cannot hand a spreadsheet a formula or a Markdown viewer a link or an image hidden in a
  food name. Restores refuse oversized files and keep only image types for Coach photos.

### Known issues

- Tapping a reminder notification does not yet open or focus Platewise.
- The browser's Back button does not close the review of an analysed meal; use its own buttons.
  Changes made in that review are lost if the page reloads, although the analysis itself is kept.
- If part of the app fails to download (for example, the connection drops before it was ever
  loaded), that screen shows an error until the page is reloaded.
- While a fast runs, new food is paused, but entries already in the diary can still be edited.
- In Copy a day, "End fast and log" ends the fast and copies the food in two steps; if the copy
  then fails, the fast stays ended.
- The gauge says "No goal set" where the nutrient bars say "No goal".
- An open tab is not yet told to reload when another tab upgrades the stored data. Version 1.0
  has a single data format, so this matters only from the first upgrade.
- A small photo is stored as it was picked, so its file details (such as where it was taken) stay
  in the stored copy and in backups. They are never sent to an AI provider.
- Models that reason before answering can run out of answer length, also on the second try; raise
  "Answer length limit" in Settings › AI providers if answers come back cut off.
- The "Get a key" links and the model lists were not checked against the live providers for this
  release: no keys were available for the live check.
- About shows the version but no links to help, contact, the source or these notes yet; each
  appears once Platewise has an address for it.
- Platewise was tested in Chromium for this release. Safari and Firefox, and installs on real
  phones and computers, have not been checked yet.
- Headings inside a Coach reply skip heading levels, which a screen reader's list of headings
  shows as a gap.
- Accent-coloured text on an accent-tinted background is not yet part of the contrast check.
- Licences and credits lists zxing-cpp and zint, which the barcode reader package bundles, with
  their licences and project pages but without their licence texts: the package does not include
  them.

### Differences from the app that inspired Platewise

Platewise keeps that app's idea and its main flows, and changes the rest on purpose: its own name,
look and words; one web app instead of native apps; a smaller first release; and a set of
behaviour changes that fix traps or suit the browser. Each difference has an id and a reason in
[docs/plan/16-what-we-change.md](docs/plan/16-what-we-change.md); features left out of 1.0 are
listed in its section 2.8.
