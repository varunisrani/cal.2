# The Android app

Platewise also comes as an Android app. It is the same Platewise you use in the browser, packed in
an Android shell, with one thing the browser cannot do: it reads your steps, burned calories,
workouts and weigh-ins from **Health Connect**, Android's shared store for health data, and can
count the calories you burn in the day's target.

Everything else works as described in the other pages: logging, the Coach, Progress, settings,
backups. The app keeps its own diary on the phone, apart from any browser on the same phone. To
move your diary between the web app and the Android app, use a backup file (see
[Backup and restore](backup.md)).

The app runs on Android 8.0 and newer. Health Connect needs Android 9 or newer.

## Install the APK

Platewise is not in a store yet. You install it from an APK file.

1. Get the file. Someone who builds Platewise runs `pnpm android:apk`, which writes
   `android/app/build/outputs/apk/debug/app-debug.apk`.
2. Copy it to the phone (a cable, a cloud drive or a message to yourself), or install it from a
   computer with `adb install app-debug.apk`.
3. Open the file on the phone, for example from the Files app. Android asks whether that app may
   install unknown apps: allow it for that app. You can switch the permission off again
   afterwards.
4. Google Play Protect may warn that it does not know the app or its developer, or offer to scan
   it. Install it only if you trust where the file came from.

About the signature:

- A debug APK is signed with the Android debug key of the computer that built it. An update must
  be signed with the same key. Android refuses to put an APK with another signature over the
  installed app, and uninstalling the app erases its data on the phone. Make a backup in
  Settings › Your data before you switch to an APK from another computer.
- A release APK (`pnpm android:apk --release`) needs the owner's signing key, passed in four
  environment variables. The header of `scripts/android/build-apk.sh` lists them and what the build
  needs (the Android SDK and JDK 21). Keys are never stored in the repository.

## Health Connect

Health Connect keeps health data from your apps and devices in one place on the phone, and asks
you which app may read or write what. On Android 14 and newer it is part of the system (look for
Health Connect in the phone's Settings). On Android 9 to 13 it is an app from Google Play.

Platewise only reads and writes through Health Connect. It does not talk to your watch or to
other fitness apps directly.

### Connect

Open **Settings › Health Connect** in Platewise. The page shows up only in the Android app. It
says whether Health Connect is on the phone, needs an update or is not supported, and whether
Platewise is connected.

Press **Connect**. Health Connect shows its own screen, with a switch for each kind of data
Platewise asks to read. You can allow some and leave others off. Platewise is connected as soon
as one kind is allowed; the **Data** card then lists each kind as Allowed or Not allowed.

What each kind is for:

- **Steps:** the day's steps on Home and the steps chart on Progress.
- **Active calories:** the calories you burned by moving, on Home and on Progress, and the ones
  counted in your target (see below).
- **Total calories:** what you burned in all, resting included, on Home's activity card under
  your steps and active calories, and on Progress. It is never added to your target.
- **Distance:** the day's distance on Home's activity card and on Progress, in kilometres or miles
  following your height unit (centimetres or feet and inches).
- **Workouts:** the day's workouts on Home, with their length and, when known, their calories.
- **Weight:** weigh-ins from other apps and scales, added to your weight history.

Two more kinds, **Meals sent** and **Weigh-ins sent**, are write access. Platewise asks for them
only when you turn on sending (below).

### The three switches

The **Options** card holds three switches:

- **Count active calories** (on): adds the day's active calories to that day's calorie target on
  Home.
- **Import weigh-ins** (on): adds weigh-ins from Health Connect to your weight history.
- **Send meals and weigh-ins** (off): writes what you log in Platewise to Health Connect.

### Sync

Platewise reads the last 30 days from Health Connect when the app opens, each time you come back
to it, and when you press **Sync now**. The **Sync** card shows when the last sync finished. If a
sync fails, the card says so; your diary is not affected, and the next sync tries again.

Platewise reads nothing while it is closed.

### What "goal + 350 burned" means

With **Count active calories** on, Home's calorie target for a day is your goal plus the active
calories Health Connect has for that day. A line under the gauge shows the sum, for example
"2,000 goal + 350 burned". The day's nutrient sheet uses the same raised target.

- Only active calories count. Total calories already include your resting burn, which your goal
  allows for, so adding them would count it twice. Steps are shown and never added: the active
  calories already hold that movement.
- Your stored goal never changes. Your protein, carbs and fat targets stay as they are.
- A day without active calories keeps the goal as it is.

Turn the switch off to track against the goal alone.

### Send meals and weigh-ins

Turning on **Send meals and weigh-ins** asks Health Connect for write access. If you allow
nothing, the switch stays off.

Once it is on:

- Each meal you log goes to Health Connect as a nutrition record: its name, calories, protein,
  carbs and fat, and the meal (breakfast, lunch, dinner or snack). Each weigh-in you enter in
  Platewise goes as a weight record.
- When you turn it on, the meals and weigh-ins of the last 30 days are sent.
- Edits and deletes follow: editing a meal replaces its record in Health Connect, and deleting it
  removes the record. This works for the last 30 days; after that, Platewise stops tracking what
  it sent, and the record stays in Health Connect as it was.
- Weigh-ins that came from Health Connect are never sent back.
- Platewise leaves its own records out when it reads, so nothing comes back as a copy.

Turning it off stops sending. What was already sent stays in Health Connect; delete it there if
you want it gone.

### Disconnect, or remove access

These are two different things:

- **Disconnect** in Platewise stops reading, counting and sending. Home and Progress show no
  activity, and the target is your goal again. The access you gave stays in Health Connect, and
  what Platewise already read stays on the phone. Press Connect to start again.
- **Removing access** happens in Health Connect. Press **Open Health Connect** on the page, then
  turn off Platewise's permissions. Platewise then says the access was removed, keeps what it has
  already read, and offers **Grant access**. Records Platewise wrote stay in Health Connect until
  you delete them there.

## Privacy

- What Platewise reads from Health Connect stays on the phone, in Platewise's own storage.
  Platewise has no server, so it is never sent to us.
- Steps, burned calories and workouts are not sent anywhere. Weigh-ins you import become part of
  your weight history. Like any weigh-in, they go to your AI provider when you use a feature that
  sends weigh-ins, such as rebuilding your plan (see [Privacy and storage](privacy-and-storage.md)).
- Android's cloud backup is off for Platewise: your diary and your AI keys are not copied to your
  Google account. A phone-to-phone transfer when you set up a new phone may still move them.
- Platewise's backup files leave out the daily activity read from Health Connect, because Health
  Connect keeps it; after a restore, connect again and it is read back. Imported weigh-ins are in
  your weight history, so backups keep them. The connection itself is not in a backup.
- Health Connect's permission screen links to a short note from Platewise about what it reads
  and writes.

## Limits

- Reminders cannot be turned on in the Android app. Its built-in browser view has no
  notifications, so Settings › Tracking & reminders and the onboarding step say reminders are not
  available in the Android app yet, and the onboarding step offers no Turn on reminders button.
- Platewise has not yet been run on a real phone in this project. The app is built and its code is
  tested on a computer, against a stand-in for Health Connect; the first tests on a device are the
  owner's. Expect rough edges until then.
- Health data is read for the last 30 days only, and only while the app is open.
