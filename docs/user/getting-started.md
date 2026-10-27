# Getting started with Platewise

Platewise is a food diary that runs in your web browser. You log what you eat by photo, barcode,
a few typed words or by hand. An AI service you pick works out the calories and nutrients, using
your own key. You check every number before anything is logged.

There is no account and no Platewise server. Your diary is kept in the browser on the device you
use. See [Privacy and storage](privacy-and-storage.md) for what that means.

## What you need

- A recent browser on a phone, tablet or computer.
- An AI key from one of the supported providers, for photos, typed meals and the Coach. You can
  start without one and add it later. See [AI keys](ai-keys.md).
- A connection for AI requests and barcode lookups. The diary itself opens offline once the app has
  loaded on that device.

## Open and install

Open the Platewise address in your browser. You can use it in a browser tab as it is, but
installing it works better:

- it opens from your home screen or app list in its own window;
- it starts without a connection once it has been loaded;
- browsers are less likely to clear the data of an installed app.

How to install:

- **Chrome, Edge and other Chromium browsers (Android and desktop):** Platewise shows an "Install
  Platewise" card. Press Install. If you pressed "Not now", use the browser menu instead (Install
  app, or Add to Home screen).
- **Safari on iPhone and iPad:** the card shows the steps: press Share, then Add to Home Screen.
  Other browsers on iPhone have their own steps; Safari is the simplest.
- **Firefox and others:** use the browser's own menu if it offers to install or add to the home
  screen. Platewise also works in a normal tab.

The install card shows at most once a week, and never inside the installed app.

Where the system supports app shortcuts (Android, for one), a long press on the installed icon
offers three: Camera, Describe and Scan.

## Set up your plan

The first time you open Platewise, a short setup builds your daily plan. Press **Get started** and
answer one question per screen. Back takes you to the previous screen.

1. **Sex.** Resting energy use differs a little between bodies.
2. **Birthday.** Energy needs change with age.
3. **Height and weight.** Pick Metric or Imperial here. The first choice follows your browser's
   language and region: United States English (and two other regions) starts in pounds and feet,
   everyone else in kilograms and centimetres. You can change units later in Settings.
4. **Body fat.** Optional. If you know it, the plan starts from your lean mass. You can also add a
   body fat goal, which shows on Progress and does not change the plan.
5. **Activity.** How active a normal week is, counting work, getting around and exercise.
6. **Goal.** Lose weight, keep your weight, or gain weight.
7. **Target weight.** To lose, it must be below your current weight; to gain, above it. When you
   keep your weight, nothing is checked here and no target is kept.
8. **Pace.** Slow, Steady or Fast, with an estimate of the days to your target. There is no pace to
   pick when you keep your weight.
9. **Reminders.** Optional. "Turn on reminders" asks the browser for permission to show
   notifications. You can skip this and decide later in Settings.
10. **Connect your AI.** Pick a provider, a model and paste your key, or point Platewise at your
    own server. Accept the short terms to go on. Or press **Set up later**: your plan then comes
    from standard formulas, and you can add a key in Settings at any time.
11. **Building your plan.** With a working key your AI works out the plan. If it fails, or has not
    answered within 60 seconds, Platewise uses the standard formulas and says so.
12. **Your daily plan.** Calories, protein, carbs and fat for each day. Tap a number to change it.
    "How is this calculated?" explains the formulas and their sources.
13. Press **Start tracking** to open Home.

The plan comes with a weekly tune-up: once a week, when you open Platewise, your AI looks at your
logs and weigh-ins and may adjust the numbers. If you change a number on the plan screen, the
tune-up starts switched off so your numbers stay as you set them. Either way you can switch it on
or off in Settings › Goals and nutrition.

Moving from another device? On the first screen, choose **Restore from a backup file** instead of
Get started. See [Backup and restore](backup.md).

## Log your first meal

1. On Home, press **+**.
2. Pick a way to log: a photo, a barcode, a few words, or the numbers by hand.
3. Platewise opens a review. Check the name, the amount and the numbers, and fix anything that
   looks wrong.
4. Press **Log**.

Nothing reaches your diary until you press Log. [Logging tips](logging-tips.md) covers every
method and the review in detail.

## Find your way around

The bar at the bottom has four tabs:

- **Home:** the week, a calorie gauge, one to four nutrient bars ("pillars", plus water when you
  track it) and the day's diary. Pick a day in the week bar (slide it sideways for earlier weeks,
  up to about a year back), or swipe across the gauge to move one day. Future days are shown but
  cannot be picked.
- **Progress:** weight and body fat with their history, calories over time, and a weekly recap.
  Log a weigh-in here.
- **Coach:** a chat about your own diary. See [The Coach](coach.md).
- **Settings:** your details, goals, tracking and reminders, AI providers, how the app looks, and
  your data.

You can hide Progress or Coach in Settings › App settings, under More, in Tab bar. Home and
Settings always stay.

## Settings at a glance

- **Personal info:** body data, your goal and allergen sensitivities.
- **Goals and nutrition:** daily targets and locks, rebuilding the plan with your AI, the weekly
  tune-up, nutrient goals and the goal-reached alert.
- **Tracking & reminders:** water and fasting tracking, and reminders.
- **AI providers:** your provider, model and key, standbys, time and length limits, notes for the
  AI, and the food database key. See [AI keys](ai-keys.md).
- **App settings:** a light, dark or system look, accent colour, grams first, the first day of the
  week and units. Under More: the Add menu editor, Product details and Tab bar.
- **Your data:** export and import your diary, back up and restore, see storage, and erase data.
  See [Backup and restore](backup.md) and [Privacy and storage](privacy-and-storage.md).

## More help

- [AI keys](ai-keys.md): which providers work, where to get a key, costs, and running your own
  model with Ollama.
- [Logging tips](logging-tips.md): getting good numbers from photos, barcodes and words.
- [The Coach](coach.md): what it can see and how to ask.
- [Privacy and storage](privacy-and-storage.md): what stays on your device and what is sent where.
- [Backup and restore](backup.md): keeping your diary safe and moving it to another device.
- [The Android app](android.md): installing it, and steps and burned calories from Health Connect.

Platewise gives estimates, not medical advice. If you have a health condition or a very low
calorie target, talk to a doctor or dietitian.
