# Changelog

What changed in each release of Platewise, newest first. Version numbers follow
[Semantic Versioning](https://semver.org/).

## Unreleased (1.1.0)

Platewise comes to Android as an app that reads your steps, burned calories, workouts and
weigh-ins from Health Connect, and can count the calories you burn in the day's target. The web
app and the installable web app are unchanged and show none of it. How to install the app and
what each setting does: [docs/user/android.md](docs/user/android.md).

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
- Progress: steps and active calories for the last 7 or 30 days, as charts with their averages.

### Known issues

- The Android app has not been run on a real phone in this project yet: there is no emulator in
  the build machine, so the native code is tested on a computer and the web side against a
  stand-in for Health Connect. The first device tests, including Health Connect's permission
  screens on Android 13 and on Android 14 and newer, are the owner's.
- Reminders cannot be turned on in the Android app: its built-in browser view has no
  notifications.
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
