# Privacy and storage

Platewise has no account and no server of its own. Everything you enter is kept in your browser,
on the device you use. This page says what is kept, what is sent, to whom, and how to keep your
data from being lost.

## What stays on your device

Platewise keeps its data in the browser's own database for the site, in the browser profile you
use. That includes:

- your profile and plan: body data, goal, targets, nutrient goals, allergen sensitivities;
- your diary: every food entry with its nutrients, notes and photos;
- saved meals, weigh-ins, body-fat readings, water logs and fasts;
- the Coach chat: the newest 200 messages, with any photo you attached kept as a small copy;
- an analysis that is waiting for your review, so it survives a reload;
- your settings and your API keys.

A stored meal photo may keep its own file details, such as where it was taken. Those details stay
on your device and go into your backups, never to an AI provider (see below).

Data in one browser is not shared with another browser, another browser profile or another
device. To move it, use a backup file: see [Backup and restore](backup.md).

## What leaves your device, and when

Platewise sends data only when you use a feature that needs it, and only to the service that
feature names. It has no analytics, no ads and no third-party scripts.

**To your AI provider**, the one you chose in Settings › AI providers, straight from your
browser:

- **Photos of meals, ingredients and labels:** a fresh JPEG copy of each photo, at most 1 600
  pixels on its longest side. The copy is redrawn, so the photo's file details are not sent. Your
  note goes with them.
- **Typed meals and ingredients:** the words you typed.
- **"Reprocess" on an entry:** the entry's name, its amount, your note and its photos.
- **Plans, rebuilds and the weekly tune-up:** your profile facts (sex, age, height, weight, body
  fat if set, activity, goal, pace, goal weight) and your current targets. With them go day totals
  from your recent logging (calories, macros and fibre per day), your weigh-ins and your body-fat
  readings. Food names, notes and photos are not part of it.
- **Nutrient goals:** your profile facts, your current targets and your current nutrient goals.
- **Fit check:** your profile facts, your targets, today's totals, the meal you are reviewing and
  up to 12 of today's meals by name and numbers.
- **The Coach:** see [What the Coach sees](coach.md#what-the-coach-sees).
- **Your notes for the AI**, if you wrote any, go with every request.

What you send falls under your provider's terms, including how long it keeps requests and whether
it may learn from them. Read them before you choose.

**To Open Food Facts**, when you scan or type a barcode: the barcode number. A product's front
photo may be loaded from Open Food Facts too.

**To FoodData Central (USDA)**, only if you saved its key and Open Food Facts did not know the
product: the barcode number and your FoodData Central key.

**Nothing else.** Platewise's own files come from the address you open it at. After the first
visit a copy is kept in the browser so the app also starts offline.

## Your API keys

- Keys are kept apart from the rest of your data, encrypted with a device key that the browser
  holds and will not hand out. This protects a copy of the browser's storage files, for example
  from a backup of your computer.
- It does not protect a key from code running on the Platewise site itself, or from someone who
  can use your unlocked browser. No website can fully do that. Use keys with a spending limit, and
  forget a key in Settings › AI providers once you no longer need it.
- A key is sent only to its own provider, in the request header, never in a web address.
- Keys are never part of a backup or a diary export. After a restore on a new device, paste your
  keys again.
- Once saved, a key shows only as its first and last four characters (a short key as dots).

## Why browser data can disappear

A browser may delete a site's data:

- when you clear browsing data, site data or cookies for the site;
- when you close a private or incognito window;
- when the device runs low on space;
- Safari may clear the data of a site you have not opened for about a week, unless it was added to
  the Home Screen.

Uninstalling the app from your home screen can also delete its data, depending on the browser.

### What Platewise does about it

- **Persistent storage.** After you log your first entry, Platewise asks the browser once to keep
  its data even when space runs low. Some browsers answer at once, some ask you, some decide on
  their own. Settings › Your data shows whether the browser agreed.
- **Install it.** Installed apps are less likely to be cleared. See
  [Getting started](getting-started.md#open-and-install).
- **Back up.** A backup file is the only copy that does not depend on the browser. Make one often,
  and keep it somewhere safe. See [Backup and restore](backup.md).

## Removing your data

In **Settings › Your data**:

- **Clear diary** removes every food entry and the photos nothing else uses. Your profile, weights,
  saved meals and settings stay.
- **Erase everything** deletes all of Platewise's data in this browser: the whole database with
  your keys, the app's stored files and its own small settings in the browser. Platewise then
  starts again at setup. Backup and export files you saved elsewhere are not touched; delete them
  yourself if you want them gone.

You can also clear the site's data in your browser's settings, which has the same effect as Erase
everything.

Requests you already sent to an AI provider, Open Food Facts or FoodData Central are kept by those
services under their own rules. Platewise cannot delete them for you.
