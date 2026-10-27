# Task: Water flows and settings (P07-06) · Phase: 07 · Owner: builder (wt-p07s2a, slice S2a)

Read (reference @ `10e14b67`): `A/ui/home/WaterViews.kt` (all: the custom amount sheet, its field
filter, the unit suffix, when Add is enabled); `A/data/WaterRepository.kt` (all: add refuses 0 ml,
delete by id); `A/ui/settings/SettingsScreen.kt` lines 3786–4020 (the water goal sheet and the
quick-add sheet; the meal-times and fasting sheets around them only for context), plus the rows
that open them (lines 1070–1120) and `setWaterTrackingEnabled` in the settings view model (the
reminder goes off with tracking). Tests: `T/models/WaterQuickAddPresetsTest.kt`,
`IT/WaterQuickAddPresetsTests.swift`. Research spec `05-home-progress.md` §3.6 (and §3.2.1 for the
selected-day stamp, §3.4 for the + menu's water page); `06-settings-data.md` §3.4 (the Tracking
page); trap R05.10; decision D-16.39 (custom amount capped at 5 000 ml). Acceptance ids reviewed by
P07-06: ACC-F11-1, ACC-H1-1, ACC-H3-1, ACC-J10-1. The P01-05 water rules (`src/domain/units/
water.ts`: display, goal wheel, field filter, the untouched-field rule) and the P02-09 water
repository are already in place.

What it does (own words): water is an optional tracker, off until the person turns it on in
Settings › Tracking & reminders. While it is on, that page also shows the daily goal (a wheel: 50 to
10 000 ml in 50s, or 2 to 338 fl oz in whole ounces, opening on the stored goal), the unit (ml or
fl oz) and the three quick-add amounts. The amounts are edited in the person's unit in three fields
that take only what an amount can hold; a field that is empty, zero or above 5 000 ml shows an error
naming the largest amount and Save stays disabled; a field the person never changed keeps its exact
stored ml, so 250 ml survives a save in fl oz; Reset puts 250 / 500 / 750 back; amounts are stored
smallest first. Turning water off also switches its reminder off (the reminder itself is P09).
The + menu's Water page lists the three amounts (each logs at once, with a short confirmation),
"Custom amount" and Back. The custom sheet has one amount field with the unit after it; Add is
enabled once the amount is above zero, and anything over 5 000 ml is refused with a message. Every
log lands on the day Home shows: now when that is today, else that day at the current clock time.

Inputs → outputs:
- `src/services/water.ts` `createWaterService({waterRepo, settingsRepo, clock})`:
  `logWater(ml, day)` → a `WaterLog` stamped by `stampForDay` (a later day is taken as today);
  refuses an amount that is not a whole 1–5 000 ml. `setTracking(on)` → `water.on`, and when off
  `remind.water.on = false` (time kept). `setGoal(ml)`, `setUnit(unit)`, `setQuickAdd(amounts)`.
- `WaterMenuPage` {day, onDone, onBack, onCustom?} → reads `water.unit` and `water.quickAddMl`; a
  preset calls `logWater` then a toast and `onDone`; Custom amount calls `onCustom` when the host
  shows the sheet itself, else opens `CustomWaterSheet` and calls `onDone` once it logs; Back →
  `onBack`.
- `CustomWaterSheet` {open, day, unit, onClose, onAdded} → `logWater(ml, day)`.
- `WaterSettings` (no props) → the Water card: the switch, then (when on) goal, unit and quick-add
  rows, each opening a sheet on the router's sheet stack.
- `PresetsEditor` {open, saved, unit, onSave, onClose} → `onSave(amounts)` (sorted, exact ml for
  untouched fields).
- `TrackingPage` → `WaterSettings`, then a marked place for `FastingSettings` (P07-07, mounted by
  the lead) and for P09's meal times and reminders. Registered as `#/settings/tracking`.

Files: created `src/services/water.ts` (+ test), `src/features/water/{WaterMenuPage,
CustomWaterSheet,WaterSettings,PresetsEditor}.tsx` (+ tests), `src/features/water/amounts.ts`,
`src/features/water/water.module.css`, `src/features/water/testing/openWater.tsx`, `src/features/settings/tracking/TrackingPage.tsx`
(+ test, `tracking.module.css`), `src/i18n/en/trackers.ts`. Shared, additive: `src/services/
context.tsx` (`water?`), `src/main.tsx` (builds the service), `src/i18n/en.ts` (the partition),
`src/features/settings/registry.ts` (the Tracking record).

Edge cases / failure modes:
- Custom field: letters dropped; ml keeps 5 digits; fl oz takes one decimal with a comma or dot.
  "0" or empty → Add disabled, no message; 6 000 ml or 170 fl oz → message, Add disabled.
- 0.4 ml is not typeable (ml takes digits only); 0.1 fl oz becomes 3 ml.
- Preset field edited back to its seeded text keeps the exact ml again (same text = untouched).
- Reset in fl oz: the fields show the defaults' text and save exact 250 / 500 / 750.
- Goal wheel in fl oz left where it opened keeps the stored ml (2 000 ml opens on 68 fl oz, which
  would be 2 011 ml).
- A stored goal off the wheel's steps (2 020 ml) opens on the nearest step; Save unmoved keeps 2 020.
- Settings not yet read: the Water card draws nothing (never a switch at its default, R06.22).
- A failed write: a toast; the sheet stays open with what was typed.
- A day after today (stale selected day past midnight): logged as today.
- Turning water off keeps every water log (they still show in the diary, R05.9, P07-05).
- The menu page is drawn while the settings are unreadable: a short note and Back only.

Our design differences / decisions:
- Names, copy, layout and hooks are ours; sheets sit on the router's sheet stack so Back closes
  them; the unit is a list sheet like Personal info's pickers.
- Custom amount capped at 5 000 ml (D-16.39); the reference has no cap beyond 5 digits.
- The goal wheel keeps the exact stored goal when it is not moved, in either unit (the reference
  converts the fl oz wheel back on every save, so 2 000 ml becomes 2 011).
- A preset log confirms with a toast (the reference uses a light haptic); a failed log says so and
  leaves the page open.
- Water and the Tracking page get their own card each; the fasting card goes under water (the
  reference has one card for meal times, water and fasting).
- The quick-add summary is a list in the person's locale ("250, 500, and 750 ml").
- The service refuses an amount outside 1–5 000 whole ml, so no path can store more than a sheet
  allows.
- `WaterMenuPage` owns its custom sheet: whatever hosts the page (the + menu, P07-08) keeps it
  mounted until `onDone` or `onBack`.

Tests we will write:
- `src/services/water.test.ts`: today → now; yesterday → yesterday at the current clock time; a
  later day → today; 6 000 / 0 / 2.5 ml refused with nothing stored (ACC-H3-1, D-16.39); turning
  water off turns the reminder off, keeps its time and the logs; turning it on leaves the reminder;
  goal, unit, quick-add writes (sorted; a list of two refused).
- `WaterMenuPage.test.tsx`: the amounts in the unit, then Custom and Back; tapping 500 ml logs 500
  on the selected day with a confirmation, then `onDone` (ACC-F11-1); Back logs nothing; Custom
  opens the sheet and `onDone` follows its Add; a failed log says so and stays.
- `CustomWaterSheet.test.tsx`: Add disabled empty/0, enabled above 0; 6 000 ml refused with the
  message and nothing stored (ACC-H3-1, R05.10); the field filter in ml and fl oz; 8,5 fl oz →
  251 ml; logs on the selected day; Cancel stores nothing.
- `PresetsEditor.test.tsx`: fl oz editor saved untouched keeps 250 / 500 / 750 (R05.10); one edited
  field converts, the others stay exact; empty, 0 and too-large fields show the error and disable
  Save; Reset restores the defaults; Cancel discards.
- `WaterSettings.test.tsx`: off by default with only the switch; on → goal, unit and quick-add rows;
  off again turns the reminder off; the goal wheel in fl oz (2–338, opens on 68, unmoved keeps
  2 000, 70 stores 2 070); the ml wheel; the unit choice changes the rows; quick-add saved from the
  row.
- `TrackingPage.test.tsx`: registered under preferences and fetched on first open; water rows only
  while water is on (ACC-J10-1); turning water on adds the water pillar on Home (ACC-H1-1, the + menu
  half is P07-08).

Compare checklist (filled after the rewrite; reopened `A/ui/home/WaterViews.kt`,
`A/data/WaterRepository.kt`, `A/ui/settings/SettingsScreen.kt` 1070–1120 and 3907–4005, the
settings view model's `setWaterTrackingEnabled`, the + menu's water page in `A/ui/home/
HomeScreen.kt` 839–880, `T/models/WaterQuickAddPresetsTest.kt`, `IT/WaterQuickAddPresetsTests.swift`):
- [x] custom amount: one field with the unit after it, digits (ml) or one decimal (fl oz), Add
      enabled above 0, converted to whole ml, at least 1 (`CustomWaterSheet.test.tsx >
      CustomWaterSheet > opens empty with the unit after the field, and enables Add only above 0`,
      `> takes digits only in ml, five at most`, `> takes one decimal in fl oz, with a comma or a
      dot, and stores whole ml`)
- [x] custom amount capped at 5 000 ml (D-16.39) (`CustomWaterSheet.test.tsx > CustomWaterSheet >
      refuses 6 000 ml with a message naming 5,000 ml and stores nothing (ACC-H3-1, R05.10,
      D-16.39)`; `src/services/water.test.ts > logWater > refuses more than 5 000 ml, nothing, and
      part of a ml, storing nothing (ACC-H3-1, D-16.39)`)
- [x] a log lands on the selected day: now for today, else that day at the current clock time
      (`src/services/water.test.ts > logWater > stamps a log for today now`, `> puts a log for an
      earlier day on that day at the current clock time`, `> takes a day after today as today`;
      `WaterMenuPage.test.tsx > WaterMenuPage > logs 500 ml on the selected day at once, confirms
      it and is done (ACC-F11-1)`; `CustomWaterSheet.test.tsx > CustomWaterSheet > logs on the day
      it was opened for at the current clock time, confirms and closes`)
- [x] the water page: the three amounts in the unit, then Custom amount, then Back; a preset logs
      at once (`WaterMenuPage.test.tsx > WaterMenuPage > lists the three amounts smallest first,
      then Custom amount and Back`, `> writes the amounts in fl oz when that is the unit`, `> logs a
      stored amount exactly, not as rounded for show`, `> goes back without logging anything`,
      `> opens the custom amount on the sheet stack and is done once it logs on the selected day`)
- [x] the switch is off by default; goal, unit and quick-add rows only while it is on
      (`WaterSettings.test.tsx > WaterSettings > is off by default and then shows only its switch`,
      `> shows the goal, the unit and the quick-add amounts once water is on (ACC-J10-1)`;
      `TrackingPage.test.tsx > TrackingPage > shows water's own rows only while water is switched
      on (ACC-J10-1)`)
- [x] turning water off turns its reminder off; the logs stay (`WaterSettings.test.tsx >
      WaterSettings > turns the water reminder off with tracking, keeping its time and the logs`;
      `src/services/water.test.ts > settings > turns the water reminder off with tracking, keeping
      its time and the logs`, `> leaves the reminder alone when tracking goes on`)
- [x] goal wheel 50–10 000 ml in 50s or 2–338 fl oz, opening on the nearest step (`WaterSettings.test.tsx
      > WaterSettings > opens the goal wheel in fl oz on 68, keeps 2 000 ml unmoved, and stores 70
      fl oz as 2 070 ml (R05.10)`, `> offers 50 to 10,000 ml in 50s and stores the goal it shows`)
- [x] unit ml | fl oz, every amount follows (`WaterSettings.test.tsx > WaterSettings > switches the
      unit, and every row follows`)
- [x] quick-add editor: untouched fields keep their exact ml, an edited one converts, errors name the
      largest amount and disable Save, Reset to 250 / 500 / 750, stored smallest first
      (`PresetsEditor.test.tsx > PresetsEditor > keeps 250 ml exactly through a save in fl oz when no
      field is touched (R05.10, ACC-H2-1)`, `> converts an edited fl oz field to whole ml and keeps the
      others exact`, `> keeps a field exact when it is typed back to the text it opened with`,
      `> disables Save and names the largest amount while a field is empty, zero or too large`,
      `> refuses 170 fl oz, naming 169 fl oz`, `> stores the amounts smallest first`, `> resets to
      250, 500 and 750 ml, which then save exactly in fl oz`, `> stores nothing on Cancel`;
      `WaterSettings.test.tsx > WaterSettings > saves edited quick-add amounts from their row`;
      `src/services/water.test.ts > settings > stores three quick-add amounts smallest first and
      refuses any other list`)
- [x] turning water on brings the water pillar to Home (`TrackingPage.test.tsx > TrackingPage > adds
      the water pillar on Home once water is turned on, and a log from the water page fills it
      (ACC-H1-1)`)
- [x] the Tracking page sits with the preferences after Goals and is fetched on first open
      (`TrackingPage.test.tsx > TrackingPage > is listed with the preferences, after Goals`, `> is
      fetched on first open and shows the water card under its title`)
- Deliberate differences: custom amount capped at 5 000 ml (D-16.39); the goal wheel keeps the
  stored goal when saved unmoved in fl oz (the reference converts it back, 2 000 → 2 011 ml); the
  quick-add summary is a plain locale list ("250, 500, 750 ml"); a preset log confirms with a toast
  instead of a haptic; a failed log says so and keeps the page; water and fasting get a card each.
- Not taken: haptics; the line of help under the goal wheel; the red Reset; cancelling the
  scheduled reminder (P09-08 owns the reminder; only its setting changes here).

## Decisions for the lead

- `WaterMenuPage` takes an optional `onCustom`: the + menu (`src/ui/Menu.tsx`) closes on any press
  outside it, and the custom sheet is a portal outside it, so a menu that renders the page inside
  its popup should pass `onCustom`, close itself, and show `CustomWaterSheet` (`open`, `day`,
  `unit`, `onClose`) from Home, as the reference does. Without `onCustom` the page opens the sheet
  itself and must stay mounted until `onDone` or the sheet's Cancel (P07-08).
- The service has no delete yet: P07-05's swipe delete adds `deleteLog(id)` (`waterRepo.remove`).
- The two settings writes behind "water off" (`water.on`, then `remind.water`) are two
  transactions: the settings repository has no multi-key update. If the second fails the reminder
  stays on while water is off, which the P09-08 engine ignores (it checks the tracking switch at
  fire time).
- Tests that wait for a plain state update made after an IndexedDB write (a toast, a sheet that
  closes itself through its own state) use `settle` (`src/features/water/testing/openWater.tsx`,
  the ReviewSheet test's pattern) rather than `until`: an update scheduled while `until`'s act is
  open is held until that act ends, so `until` can wait forever under load (seen once in a full
  run). A shared helper in `src/test/` would serve every screen test.
- Amounts with their unit word reuse `home.amount.*` and `home.unit.*`; the goal wheel reuses
  `src/features/settings/goals/wheelOptions.ts`.

## Status

Done (2026-10-27). Water service, the + menu's water page, the custom amount sheet, the water card
with its goal, unit and quick-add editors, and the Tracking & reminders page are in, with tests.
Lines outside the task's files: `src/services/context.tsx` (the `water` service),
`src/main.tsx` (builds it), `src/i18n/en.ts` (the `trackers` partition),
`src/features/settings/registry.ts` (the Tracking record). Handed on: the fasting card on the
Tracking page (P07-07, mounted by the lead at landing), the + menu's Water row (P07-08), meal
times and reminders on the page (P09-03, P09-09).
