# Backup and restore

Your Platewise data lives only in this browser on this device (see
[Privacy and storage](privacy-and-storage.md)). If the browser's data is cleared, or the device is
lost, the diary goes with it. A backup file is a copy you keep yourself.

Platewise has two kinds of files:

- A **backup** holds everything, photos and Coach chat included, and a restore puts it all back.
  Use it to stay safe and to move to another device.
- A **diary export** holds the foods and water logs of the days you pick, as JSON, Markdown or CSV.
  Use it to read your diary elsewhere, or to bring days back into Platewise with an import.

Both are found in **Settings › Your data**.

## Make a backup

1. Open Settings › Your data.
2. Under Backup, press **Back up now**.
3. Your browser's share sheet opens, where it can share files: save the file to your files, a
   cloud drive or a message to yourself. Elsewhere the file is downloaded, named
   `platewise-backup-YYYY-MM-DD.zip`.

If too much time passed for the share sheet to open, a **Save backup file** button appears: press
it to hand over the same file.

"Last backup" shows the date and time of your latest backup. It changes only when the file was
actually shared or downloaded, not when you closed the share sheet.

Backups need Platewise to be opened over a secure (https) address.

### What is in a backup

- your profile, plan, targets and nutrient goals;
- every diary entry with its photos;
- saved meals, weigh-ins, body-fat readings, water logs and fasts;
- the Coach chat with its photo copies;
- your settings, and an analysis still waiting for review.

### What is not in it

- **Your API keys.** You paste them again after a restore on another device.
- A few things that belong to the device, such as when the last backup was made and whether the
  browser was already asked to keep the data.

### Keep it safe

A backup is a plain ZIP file. It is not encrypted. It holds your diary, your body data and your
photos, and a photo may keep its own file details, such as where it was taken. Store it where you
would store other private files.

Make a backup regularly, for example once a week, and keep at least one copy off the device.
Platewise reminds you in Settings › Your data when your last backup is more than 14 days old.

## Restore a backup

A restore **replaces** everything Platewise holds on this device with the contents of the file.
Only your API keys and a few settings of the device itself stay as they are.

1. Open Settings › Your data and press **Restore from a file**. On a new device, choose **Restore
   from a backup file** on the first screen instead of Get started.
2. Pick the backup file.
3. Platewise checks the whole file first. Nothing changes during the check.
4. It shows when the backup was made and how many diary entries, photos and Coach messages it
   holds.
5. Press **Restore** to replace your data, or close the sheet to keep things as they are.

The restore happens in one step. If anything goes wrong on the way, nothing on the device has
changed. Once it has started it finishes even if you move to another part of Platewise, and the
sheet cannot be closed until it is done. It never leaves half of your data replaced.

After a restore:

- "Last backup" shows the time of the backup you restored.
- This device's own settings, such as whether the browser was already asked to keep the data,
  stay as they were.
- If a fast was running in the backup but fasting tracking is off in it, that fast is ended, so
  food logging is not blocked.
- Photos that nothing restored uses are removed.

On the first screen of a new device: if the backup holds a finished setup, Platewise opens Home
with your data. If it does not, the setup continues with what the backup holds.

### When a restore is refused

| Message says                              | What it means                                                                                            |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| This file isn't a Platewise backup        | The file is not one Platewise made, or it was repacked (for example, unzipped and zipped again).         |
| This backup file is damaged               | Part of the file is missing or changed. Try another copy.                                                |
| This backup needs a newer Platewise       | The file was made by a newer version. Update Platewise (reload it when it offers an update), then retry. |
| There isn't enough storage on this device | Free some space on the device, or remove other site data, then try again.                                |
| Restoring needs a secure (https) address  | Open Platewise at its https address.                                                                     |

In every case, nothing on the device was changed.

## Move to another device or browser

1. On the old device, make a backup and save the file somewhere the new device can reach.
2. On the new device, open Platewise. On the first screen, choose **Restore from a backup file**
   and pick the file.
3. Add your AI key again in Settings › AI providers. Keys never travel in a backup.

If the new device already has Platewise data, use Settings › Your data › Restore from a file. It
replaces what is there.

## Export and import your diary

### Export

In Settings › Your data, choose **Export diary**:

- **Days:** Today, This week, This month, All time, or Custom (From and To).
- **File type:**
  - **JSON** to import back into Platewise later;
  - **Markdown** to read, with a table for each meal;
  - **CSV** for spreadsheets, one row per food and water log.

Energy is always written in kcal, whatever unit you read in Platewise. An export holds the foods
and water logs of those days (the Markdown file adds each day's totals). It has no photos, weights,
fasts, saved meals, Coach chat, settings or keys: it is not a backup.

### Import

In Settings › Your data, choose **Import diary** and pick a JSON diary file exported from
Platewise (up to 20 MB). Platewise reads the whole file first and shows how many foods, water logs
and days it holds. Then choose:

- **Replace these dates:** the days in the file end up matching the file. Foods already there that
  match one in the file keep their photos; the rest of those days is cleared. Other days are not
  touched.
- **Add as new:** your diary stays as it is, and everything in the file is added.

A file with any bad value is refused as a whole, and nothing is imported.

## Files from other apps

Platewise reads only its own backup and diary files. It cannot import files made by other
calorie-tracking apps.
