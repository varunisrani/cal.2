# Acceptance map

v1.0 is done when every P0 and P1 feature of the inventory (`docs/plan/03-feature-inventory.md`) passes its acceptance tests. This page names those tests. Each P0/P1 feature has one or more acceptance ids (`ACC-<feature>-<n>`), each one a behaviour a person can see, mapped to the tests that prove it.

`pnpm check:acceptance` (`tooling/checks/acceptance.ts`, row formats in `checks.md`) reads the inventory and this page without running any test. It fails when a P0/P1 feature has no acceptance id, an id names a test that does not exist or is skipped, or an id has neither a test nor a review line. `pnpm check:acceptance --strict` also fails on review-only ids; it is the v1.0 gate (P10-05).

**Rules for rows.** A test reference is `file > describe > test` relative to `platewise/`. Until its task lands, an id carries only a `Review:` line naming the owning task. When the task lands, the lead replaces the `Review:` line with `Test:` lines. A feature changed on purpose is mapped to our version and cites its decision in the inventory row. Missing behaviour with no planned task goes under Known gaps, never as an id.

## A · Shell and navigation

### A1 · Bottom tab bar in a fixed order (P0)

- **ACC-A1-1** The four tabs appear in that order and switching back to Home returns to where you were
  - Review: P04-05

### A2 · Hash routes for tabs and nested Settings pages (P0)

- **ACC-A2-1** Pressing Back with two sheets open closes only the top one
  - Review: P04-04
- **ACC-A2-2** An unknown address opens Home
  - Review: P04-04

### A3 · Progress and Coach can be hidden (P1)

- **ACC-A3-1** Hiding Coach while viewing it moves you to Home and the tab disappears
  - Review: P04-05
- **ACC-A3-2** A hidden tab never flashes into the bar while the app starts
  - Review: P04-05

### A4 · Tapping Settings while inside a Settings page returns to the … (P1)

- **ACC-A4-1** From a nested Settings page, tapping the Settings tab shows the hub
  - Review: P04-05

### A5 · The tab bar hides while a food analysis overlay is showing (P1)

- **ACC-A5-1** During an analysis the tab bar is not visible and it returns afterwards
  - Review: P06-04

### A6 · Floating capsule tab bar with a selected pill that slides to the … (P1)

- **ACC-A6-1** The selected tab is marked visually and for screen readers (`aria-current`)
  - Review: P04-05

### A8 · Appearance (P1)

- **ACC-A8-1** Choosing Light keeps the light theme even when the device is dark
  - Review: P04-06
- **ACC-A8-2** In System mode a device theme change applies without a reload
  - Review: P00-03

### A9 · Six solid accent presets of our own (Basil default, Saffron, … (P1)

- **ACC-A9-1** Picking Ember recolours every accent element at once
  - Review: P09-02
- **ACC-A9-2** Every accent passes the contrast sweep in both themes
  - Review: P00-03

### A10 · Start-up skeleton until the profile and settings are read, so … (P0)

- **ACC-A10-1** No calorie numbers appear before the stored profile has been read
  - Review: P04-07
- **ACC-A10-2** A Settings page shows a spinner, not default switches, until settings are loaded
  - Review: P09-01

### A11 · "Today" moves to the new day at local midnight and when the app … (P1)

- **ACC-A11-1** Leaving the app open past midnight switches Home to the new day
  - Review: P04-07

## B · Onboarding and profile

### B1 · Welcome screen with a short tour and Get Started (P0)

- **ACC-B1-1** A fresh install opens on Welcome and Get Started begins the wizard
  - Review: P05-02

### B2 · Wizard steps (P0)

- **ACC-B2-1** Each step accepts its value and Continue moves on
  - Review: P05-02
- **ACC-B2-2** Pace 0.5 kg/week from 70 to 65 kg shows 70 days
  - Review: P05-03

### B3 · Switching metric and imperial in the wizard keeps the value … (P1)

- **ACC-B3-1** 70.0 kg toggled to lb and back still reads 70.0 kg
  - Review: P05-01

### B4 · Target weight must be below the current weight to lose and above … (P1)

- **ACC-B4-1** A lose target above the current weight blocks Continue with an explanation
  - Review: P05-01

### B5 · Optional Reminders step using web notifications, replacing the … (P1)

- **ACC-B5-1** Denying permission leaves reminders off and the wizard continues
  - Review: P05-03

### B6 · AI access step (P1)

- **ACC-B6-1** Continue stays disabled until a needed key is entered and the terms are accepted
  - Review: P05-04
- **ACC-B6-2** Set up later continues and the plan uses the formulas
  - Review: P05-04

### B7 · Building the plan (P1)

- **ACC-B7-1** With the AI unreachable the formula plan appears after 60 s with a note
  - Review: P05-05
- **ACC-B7-2** A valid AI plan is shown after the animation
  - Review: P05-05

### B8 · Plan Ready (P1)

- **ACC-B8-1** Changing protein re-derives carbs so the plan still adds up
  - Review: P05-06
- **ACC-B8-2** A plan under 1 200 kcal shows the warning
  - Review: P05-06

### B9 · Finishing onboarding saves the profile and plan, seeds the first … (P0)

- **ACC-B9-1** After finishing, Home shows the plan's targets and Progress shows the first weigh-in
  - Review: P05-07
- **ACC-B9-2** An edited plan leaves the weekly tune-up off
  - Review: P05-07

### B10 · Restore from a backup file on Welcome (P1)

- **ACC-B10-1** Restoring a complete backup from Welcome lands on Home with its entries
  - Review: P09-14
- **ACC-B10-2** Restoring a backup without a profile continues the wizard and keeps the entries
  - Review: P09-14

### B11 · Unit defaults from the browser locale (P1)

- **ACC-B11-1** With an en-US browser the wizard starts in lb and ft-in
  - Review: P01-04

### B12 · Personal info in Settings (P1)

- **ACC-B12-1** Saving a weight in Settings adds a weigh-in and updates the profile
  - Review: P05-10
- **ACC-B12-2** A goal weight on the wrong side is refused with a reason
  - Review: P05-10

### B13 · Calculation methods page in our words with sources and a … (P1)

- **ACC-B13-1** The methods page opens from Plan Ready and from Settings
  - Review: P05-13

## C · Goals and formulas

### C1 · BMR (Mifflin-St Jeor, or Katch-McArdle with body fat), TDEE with … (P0)

- **ACC-C1-1** The default profile gets 2 452 kcal, 112 g protein, 406 g carbs, 42 g fat
  - Review: P01-12

### C2 · Effective targets (P0)

- **ACC-C2-1** Saving 2 000 kcal and 150 g protein auto-balances carbs 283 g and fat 29 g
  - Review: P01-13

### C3 · AI plan calculation with strict validation and exact 4/4/9 … (P1)

- **ACC-C3-1** A plan reply of 2 000 / 150 / 215 / 61 is stored as 2 000 / 150 / 215 / 60
  - Review: P01-14
- **ACC-C3-2** An implausible reply leaves the targets unchanged
  - Review: P05-08

### C4 · Rebuild plan (P1)

- **ACC-C4-1** Rebuild shows the new calorie target and the AI's reason
  - Review: P05-08
- **ACC-C4-2** Editing the profile while a rebuild runs discards its result
  - Review: P05-08

### C5 · "Inputs changed" nudge on Rebuild when goal inputs changed since … (P1)

- **ACC-C5-1** After a new weigh-in the Rebuild row shows the nudge; on first open it does not
  - Review: P05-11

### C6 · Target editing with a calorie lock and up to two macro locks, … (P1)

- **ACC-C6-1** With calories locked, raising protein lowers carbs and fat and keeps calories
  - Review: P05-11
- **ACC-C6-2** A third macro lock is not added
  - Review: P01-13

### C7 · Maintenance estimate row (P1)

- **ACC-C7-1** A target 40 kcal under maintenance reads close to maintenance
  - Review: P05-11

### C8 · Weekly tune-up (Adaptive Goals) (P1)

- **ACC-C8-1** Opening the app 7 days after the last check rebuilds the plan once
  - Review: P05-09
- **ACC-C8-2** Turning the tune-up off restores the plan from before its first change
  - Review: P05-09
- **ACC-C8-3** While it is on, tapping a target explains why it cannot be edited
  - Review: P05-11

### C9 · The evidence sent with a plan request holds only numbers and … (P1)

- **ACC-C9-1** No food name, note or ingredient appears in a plan request
  - Review: P03-16

### C10 · Optional nutrient goals for 29 nutrients with defaults, ranges, … (P1)

- **ACC-C10-1** A typed sodium goal of 2 345 mg is kept exactly
  - Review: P05-12
- **ACC-C10-2** An AI refresh that returns only sodium leaves the other goals unchanged
  - Review: P03-14

### C11 · Goal-reached dialog when a new latest weigh-in crosses the goal, … (P1)

- **ACC-C11-1** Logging 79.4 kg with a 79.5 kg lose target shows the dialog once
  - Review: P05-14
- **ACC-C11-2** A back-dated weigh-in below the target shows nothing
  - Review: P02-08

### C12 · Energy unit kcal or kJ for every display and input, stored as kcal (P1)

- **ACC-C12-1** Switching to kJ shows 8 368 kJ for a 2 000 kcal goal without changing it
  - Review: P09-02
- **ACC-C12-2** Opening and saving the kJ goal wheel unchanged keeps 2 000 kcal
  - Review: P01-03

### C13 · Weight forecast (30/60/90-day weights, days to goal, under-logging … (P1)

- **ACC-C13-1** With two food days and two weigh-ins the Coach context lists the forecast
  - Review: P08-01

## D · Food logging

### D1 · Diary entry with energy, macros, 23 optional nutrients and 8 … (P0)

- **ACC-D1-1** An entry without sodium shows a dash for sodium, not 0
  - Review: P06-08

### D2 · Manual entry (name, energy in your unit, protein, carbs, fat, … (P0)

- **ACC-D2-1** A manual entry appears under its meal and the gauge updates
  - Review: P04-14
- **ACC-D2-2** Energy typed in kJ is stored as kcal
  - Review: P04-11

### D3 · "+" menu with three default groups (Snap & scan, Describe, Reuse) … (P0)

- **ACC-D3-1** The + menu offers Enter manually
  - Review: P04-10
- **ACC-D3-2** The default menu shows the three groups and their methods
  - Review: P06-01

### D4 · Photo capture (P1)

- **ACC-D4-1** Picking 12 photos keeps 10 and says so
  - Review: P06-03
- **ACC-D4-2** One oversized photo refuses the whole batch
  - Review: P06-03

### D5 · Analysing overlay with Cancel (P1)

- **ACC-D5-1** Cancel stops the analysis with no error message
  - Review: P06-04
- **ACC-D5-2** Retry repeats the same request after a failure
  - Review: P06-04

### D6 · Typed meal description with rotating examples (P1)

- **ACC-D6-1** Describing "two eggs and toast" opens the review with the AI's estimate
  - Review: P06-20

### D7 · Review before logging (P1)

- **ACC-D7-1** Changing the time to the evening switches the suggested meal to dinner
  - Review: P06-06
- **ACC-D7-2** Log writes exactly one entry even when tapped twice
  - Review: P06-06

### D8 · The amount field accepts arithmetic (+ − × ÷) with a calculator row (P1)

- **ACC-D8-1** Typing 50+20 sets the amount to 70 g
  - Review: P06-07
- **ACC-D8-2** An unfinished expression reverts on leaving the field
  - Review: P06-07

### D9 · Serving units (P1)

- **ACC-D9-1** An entry with an unknown weight reopens at its serving count and never shows grams
  - Review: P01-09
- **ACC-D9-2** Switching from slices to grams keeps the amount
  - Review: P06-07

### D10 · Nutrition unlock on review (P1)

- **ACC-D10-1** Typing 40 g protein at double amount stores 20 g per base amount
  - Review: P06-08

### D11 · Fit check (what-if) (P1)

- **ACC-D11-1** The fit check shows the day's total with the meal added and how far over or under the goal it is
  - Review: P06-10
- **ACC-D11-2** A failed suggestion offers Retry
  - Review: P06-10

### D12 · Edit a logged entry (P1)

- **ACC-D12-1** Saving an untouched entry keeps its exact time
  - Review: P06-11
- **ACC-D12-2** Editing calories of a logged entry saves the new value
  - Review: P06-11
- **ACC-D12-3** Delete asks before removing the entry
  - Review: P06-11

### D13 · Ingredient lines added by camera, photo, barcode, text, manual or … (P1)

- **ACC-D13-1** Adding a 100 kcal line raises the meal total by 100
  - Review: P06-09
- **ACC-D13-2** Removing a line scales sodium by the remaining weight
  - Review: P01-10

### D14 · Split into servings (1–50), hidden for portions that were already … (P1)

- **ACC-D14-1** Splitting a 2 kg pot into 8 offers a 250 g serving
  - Review: P01-11
- **ACC-D14-2** A re-logged portion offers no split
  - Review: P06-09

### D15 · Combine selected entries into one meal that sums every nutrient … (P1)

- **ACC-D15-1** Combining three entries leaves one entry named after them at the latest time
  - Review: P06-19

### D16 · Recent (30 days) and Often eaten (90 days, grouped by name and … (P1)

- **ACC-D16-1** Searching "cafe" finds "Café latte"
  - Review: P06-12
- **ACC-D16-2** Tapping a recent item opens the review instead of logging at once
  - Review: P06-12

### D17 · Saved meals with their own ids, toggled from the editor and Home … (P1)

- **ACC-D17-1** Two different foods with the same name and calories can both be saved
  - Review: P02-10
- **ACC-D17-2** Reorder buttons are hidden while searching
  - Review: P06-12

### D18 · Copy a day (P1)

- **ACC-D18-1** Copying yesterday adds new entries today and leaves yesterday unchanged
  - Review: P06-13

### D19 · Barcode scanning by camera, plus typing the digits (D-16.18) (P1)

- **ACC-D19-1** Typing a barcode looks up the product
  - Review: P06-20
- **ACC-D19-2** Without native barcode support the scanner still works
  - Review: P06-14

### D20 · Barcode lookup (P1)

- **ACC-D20-1** A product found by Open Food Facts opens its review
  - Review: P06-17
- **ACC-D20-2** A product missing everywhere offers Scan label
  - Review: P06-17

### D21 · Saved-label memory (P1)

- **ACC-D21-1** Scanning the same unknown barcode again reopens the saved label with a notice
  - Review: P06-17

### D22 · Product information block (barcode, source, package, Nutri-Score, … (P1)

- **ACC-D22-1** A barcode product shows only the fields that have data and are not hidden
  - Review: P06-18

### D23 · Ingredient label shown with allergen emphasis (P1)

- **ACC-D23-1** Allergens marked by Open Food Facts are shown in bold in the label text
  - Review: P06-18

### D24 · Allergen line for the profile's sensitivities (P1)

- **ACC-D24-1** With "dairy" listed, a product containing whey shows a possible-allergen line
  - Review: P06-18

### D25 · Analysis drafts survive a reload and reopen the review (D-16.46) (P1)

- **ACC-D25-1** Reloading during the review reopens it with the same values
  - Review: P06-20

### D26 · One tap logs exactly one entry (P0)

- **ACC-D26-1** Double-tapping Save on manual entry creates one entry
  - Review: P04-08

### D27 · Food logging is paused during a fast, with End fast and log (D-16.35) (P1)

- **ACC-D27-1** During a fast, Log shows the paused dialog and End fast and log does both
  - Review: P07-07
- **ACC-D27-2** No path writes food during an active fast
  - Review: P02-06

### D28 · Stored photos upright, capped at 2 048 px when that saves space, … (P1)

- **ACC-D28-1** Deleting an entry keeps a photo still used by a saved meal
  - Review: P02-07
- **ACC-D28-2** An undecodable HEIC photo is refused with a message
  - Review: P06-02

## E · AI providers and analysis

### E1 · 16 bring-your-own-key providers with their wire formats (P1)

- **ACC-E1-1** The provider list shows 16 providers and each offers its presets
  - Review: P03-03

### E2 · Gemini, OpenAI-compatible and Anthropic adapters with each … (P1)

- **ACC-E2-1** Every Anthropic request carries the browser-access header
  - Review: P03-09
- **ACC-E2-2** OpenAI requests use the newer token-limit parameter
  - Review: P03-08

### E3 · Vision primary, optional text provider, image standby and text standby (P1)

- **ACC-E3-1** A typed description goes to the text provider when one is set; photos always go to the primary
  - Review: P03-04
- **ACC-E3-2** Two Ollama servers can be primary and standby at once
  - Review: P03-04

### E4 · Retry 429/503/529 at 1, 2 and 4 s on every format (P1)

- **ACC-E4-1** A busy provider is retried three times before the busy message
  - Review: P03-06
- **ACC-E4-2** No analysis waits longer than the timeout setting
  - Review: P03-05

### E5 · The standby also runs when the primary's answer fails validation, … (P1)

- **ACC-E5-1** An unreadable answer from the primary is rescued by the standby
  - Review: P03-17

### E6 · Cut-off answers are detected and re-asked once in a compact form (P1)

- **ACC-E6-1** A cut-off answer is re-asked once and then succeeds
  - Review: P03-17

### E7 · Photos prepared upright, at most 1 600 px, JPEG 0.8, never … (P1)

- **ACC-E7-1** A 3 200 × 1 200 photo is sent at 1 600 × 600
  - Review: P03-10

### E8 · Food answers parsed tolerantly (P1)

- **ACC-E8-1** An answer wrapped in prose and a code fence is still read
  - Review: P03-11
- **ACC-E8-2** A breakdown that does not add up is dropped and the totals kept
  - Review: P03-13

### E9 · A second request for serving units only for zero-energy foods with … (P1)

- **ACC-E9-1** Black coffee without units gets a unit list from one extra request; pizza does not trigger one
  - Review: P03-18

### E10 · Every AI failure shown as one friendly message per kind, never the … (P1)

- **ACC-E10-1** A refused key shows the paste-a-valid-key message
  - Review: P03-01
- **ACC-E10-2** A provider error body never appears on screen
  - Review: P03-01

### E11 · Notes for the AI sent in the system message of every request (D-16.24) (P1)

- **ACC-E11-1** Notes reach the primary, the standby and the compact re-ask
  - Review: P03-17

### E12 · Answer length limit for every provider (default 1 024 tokens) and … (P1)

- **ACC-E12-1** The token limit setting is visible with Gemini selected
  - Review: P09-07

### E13 · Server URLs (P1)

- **ACC-E13-1** An http address on the local network is refused with the reason
  - Review: P05-04
- **ACC-E13-2** An Ollama model tag can be typed freely
  - Review: P03-03

### E14 · Keys kept in a separate local store, trimmed, shown masked, never … (P1)

- **ACC-E14-1** A saved key shows only its first and last four characters
  - Review: P02-12
- **ACC-E14-2** A backup file never contains a key
  - Review: P09-13

## F · Home and day view

### F1 · Week bar of 53 weeks starting on the chosen weekday (P1)

- **ACC-F1-1** Selecting last Monday shows that day's diary
  - Review: P07-01
- **ACC-F1-2** Tomorrow cannot be selected
  - Review: P07-01

### F2 · Swipe the day summary to change day, never past today (P1)

- **ACC-F2-1** Swiping right shows yesterday; swiping left on today does nothing
  - Review: P07-02

### F3 · Energy gauge with the eaten amount and left, over, goal reached or … (P0)

- **ACC-F3-1** With 1 200 of 2 000 kcal eaten the gauge reads 800 left
  - Review: P04-10
- **ACC-F3-2** Over the goal the gauge stays full and reads the excess
  - Review: P04-10

### F4 · Nutrient pillars (P0)

- **ACC-F4-1** Home shows protein, carbs, fat and fibre pillars by default
  - Review: P04-10
- **ACC-F4-2** A sodium pillar shows how far over its limit the day is
  - Review: P07-03

### F5 · Pillar picker (P1)

- **ACC-F5-1** Choosing a fifth nutrient replaces the most recent choice
  - Review: P07-04

### F6 · All-nutrients sheet for the selected day (P1)

- **ACC-F6-1** The sheet lists every nutrient for the selected day with its goal
  - Review: P07-04

### F7 · Diary grouped by meal with food-only section totals (P0)

- **ACC-F7-1** Entries appear under their meal with that meal's total
  - Review: P04-10
- **ACC-F7-2** Newest first shows repeated meal sections in time order
  - Review: P07-05

### F8 · Water and fast rows in the diary (P1)

- **ACC-F8-1** A fast from 20:00 to 12:00 shows on the second day only
  - Review: P01-08
- **ACC-F8-2** The active fast row counts up every second
  - Review: P07-05

### F9 · Swipe to delete diary rows, always with a confirmation (P1)

- **ACC-F9-1** Swiping a water row asks before deleting it
  - Review: P07-05

### F10 · Empty-day message (P0)

- **ACC-F10-1** A day without entries shows the empty message
  - Review: P04-10

### F11 · "+" button opening food methods, Water and fasting entries (P0)

- **ACC-F11-1** With water tracking on, the + menu has a Water page that logs a preset at once
  - Review: P07-06
- **ACC-F11-2** During a fast the + menu shows only water and fasting entries
  - Review: P07-08

### F12 · Long-press multi-select with a combine bar (P1)

- **ACC-F12-1** Long-pressing a row enters selection mode and shows the combine bar
  - Review: P06-19

## G · Progress, weight and body fat

### G1 · Ranges 1W, 1M, 3M, 6M, 1Y and All with period arrows and labels (P1)

- **ACC-G1-1** The back arrow on 1M shows the previous 30 days with its label
  - Review: P07-09

### G2 · Metric switch between Weight and Body Fat (P1)

- **ACC-G2-1** Body Fat is offered only after a reading or a body-fat goal exists
  - Review: P07-09

### G3 · Weight card (P1)

- **ACC-G3-1** The weight chart shows the goal line and a tooltip when pressed
  - Review: P07-10
- **ACC-G3-2** A change under 0.05 kg reads 0.0 without a sign
  - Review: P07-12

### G4 · Log weight (P1)

- **ACC-G4-1** A weight logged for last week lands on that day without changing the current weight
  - Review: P07-12
- **ACC-G4-2** Toggling lb in the log sheet changes the app's weight unit
  - Review: P07-12

### G5 · Body-fat card and Log body fat (3–60 % in 0.5 steps) (P1)

- **ACC-G5-1** Logging 18.5 % updates the body-fat card and the profile
  - Review: P07-13

### G6 · Weight and body-fat histories, newest first, delete with … (P1)

- **ACC-G6-1** Deleting a weigh-in asks first and removes it from the list at once
  - Review: P07-14

### G7 · The profile's weight and body fat follow the latest reading (P1)

- **ACC-G7-1** Deleting the latest weigh-in sets the profile weight to the previous one
  - Review: P02-08

### G8 · Weekly recap of the last completed week against the one before, … (P1)

- **ACC-G8-1** The recap shows days logged out of 7 and the change from the week before
  - Review: P07-15
- **ACC-G8-2** At most three highlights appear, improvements only
  - Review: P07-15

### G9 · Count-today switch for the nutrition charts (P1)

- **ACC-G9-1** Turning off Count today removes today's partial day from the averages
  - Review: P07-16

### G10 · Calorie history bars with a goal line and inspector (P1)

- **ACC-G10-1** A full year of bars fits the chart and the last day can be inspected
  - Review: P07-11

### G11 · Macro and nutrient averages per logged day (P1)

- **ACC-G11-1** Averages divide by days with entries, not by every day in the range
  - Review: P07-16

## H · Water and fasting

### H1 · Water tracking switch (off by default), daily goal, ml or fl oz (P1)

- **ACC-H1-1** Turning water tracking on adds the water pillar and the Water page in the + menu
  - Review: P07-06

### H2 · Three quick-add amounts (1–5 000 ml) that keep exact values … (P1)

- **ACC-H2-1** 250 ml stays 250 ml after editing in fl oz without touching it
  - Review: P01-05

### H3 · Log water by quick amount or a custom amount up to 5 000 ml on the … (P1)

- **ACC-H3-1** A custom amount of 6 000 ml is refused
  - Review: P07-06
- **ACC-H3-2** Water logged while yesterday is selected lands on yesterday
  - Review: P07-17

### H4 · Water pillar and water section in the all-nutrients sheet (P1)

- **ACC-H4-1** The water pillar shows today's amount against the goal
  - Review: P07-03

### H5 · Water reminder with a time picker, default 14 (P1)

- **ACC-H5-1** A water reminder set for 15:00 shows at 15:00 while the app is open
  - Review: P09-08

### H6 · Fasting tracking switch (off by default) and a default goal of … (P1)

- **ACC-H6-1** Turning fasting on offers Start fast in the + menu
  - Review: P07-07

### H7 · Start, end and cancel a fast from the + menu (P1)

- **ACC-H7-1** Starting a 16 h fast shows it as active; cancelling removes it from history
  - Review: P07-07

### H8 · Fast editor (P1)

- **ACC-H8-1** End fast now applies the edited start and ends the fast in one step
  - Review: P02-09

### H9 · One active fast, no overlaps, an end never before the start (P1)

- **ACC-H9-1** Editing a fast to overlap another shows the overlap message and changes nothing
  - Review: P07-07

### H10 · Turning fasting off ends the active fast (P1)

- **ACC-H10-1** Switching fasting off ends the active fast and food logging works again
  - Review: P02-09

### H11 · Fasting goal-reached alert (P1)

- **ACC-H11-1** A fast reaching its goal while the app is open shows the alert; an ended fast never does
  - Review: P09-08

## I · Coach

### I1 · Coach tab (P1)

- **ACC-I1-1** An empty chat shows four prompts that send when tapped
  - Review: P08-10
- **ACC-I1-2** While a reply is pending three animated dots show
  - Review: P08-10

### I2 · Composer (P1)

- **ACC-I2-1** A photo alone can be sent
  - Review: P08-11
- **ACC-I2-2** Shift+Enter adds a new line instead of sending
  - Review: P08-11

### I3 · Goal-aware prompt chips (P1)

- **ACC-I3-1** Chips change when the goal changes
  - Review: P08-12
- **ACC-I3-2** A chip sends together with the attached photo
  - Review: P08-12

### I4 · Replies rendered as simple Markdown with safe links (P1)

- **ACC-I4-1** A list in a reply renders as a list and links open in a new tab
  - Review: P08-13
- **ACC-I4-2** Copy puts the reply text on the clipboard
  - Review: P08-13

### I5 · Reset with confirmation (P1)

- **ACC-I5-1** Reset during a pending reply leaves the chat empty
  - Review: P08-09

### I6 · Fresh context each turn (P1)

- **ACC-I6-1** The context sent with a question includes today's calories left and water
  - Review: P08-01

### I7 · Six read-only nutrition tools (P1)

- **ACC-I7-1** Asking about yesterday's meals uses the food log tool and answers from it
  - Review: P08-14
- **ACC-I7-2** Daily totals leave out days without entries
  - Review: P08-02

### I8 · Tool loop of up to six rounds on all three formats, with the … (P1)

- **ACC-I8-1** A question needing two tool rounds is answered
  - Review: P08-08
- **ACC-I8-2** A seventh round is never sent; the round-limit message shows
  - Review: P08-08

### I9 · Tool results capped at 60 000 characters on every provider, … (P1)

- **ACC-I9-1** A year of entries is trimmed to fit and the newest rows are kept
  - Review: P08-03

### I10 · Conversation kept locally (P1)

- **ACC-I10-1** After 205 messages the oldest 5 are gone
  - Review: P02-11
- **ACC-I10-2** The chat survives a reload
  - Review: P08-14

### I11 · Friendly errors with Details and Retry on the failed turn (D-16.31) (P1)

- **ACC-I11-1** A failed turn shows a friendly message, Details and Retry; Retry does not repeat the question
  - Review: P08-09

### I12 · The standby provider re-runs the whole turn when the primary fails (P1)

- **ACC-I12-1** With the primary failing, the standby answers and nothing from the failed attempt remains
  - Review: P08-08

## J · Settings and configuration

### J1 · Settings hub with categories in a fixed order, back link, pages … (P0)

- **ACC-J1-1** The hub lists its categories and each opens with a back link
  - Review: P04-13
- **ACC-J1-2** The hub shows every v1 category in order
  - Review: P09-01

### J2 · App settings (P1)

- **ACC-J2-1** Choosing Sunday as the first weekday changes the week bar
  - Review: P09-02
- **ACC-J2-2** Grams first opens reviews in grams
  - Review: P06-07

### J3 · Height, weight and energy units as separate settings (P1)

- **ACC-J3-1** Weight in lb and height in cm can be combined
  - Review: P09-02

### J4 · Meal times editor (P1)

- **ACC-J4-1** Moving lunch to 11:30 files a 11:45 entry under lunch
  - Review: P09-03

### J5 · Add-menu editor (P1)

- **ACC-J5-1** Hiding Copy a day removes it from the + menu and restoring it brings it back
  - Review: P09-05

### J6 · Product information settings (P1)

- **ACC-J6-1** Hiding the NOVA field removes it from product reviews
  - Review: P09-06

### J7 · Tab bar settings page (P1)

- **ACC-J7-1** Hiding Progress removes it from the bar and keeps Coach as it was
  - Review: P09-04

### J8 · AI providers page (P1)

- **ACC-J8-1** Setting an image standby makes photo analyses fall back to it
  - Review: P09-07
- **ACC-J8-2** The page states that keys stay in this browser
  - Review: P09-07

### J9 · FoodData Central key setting (P1)

- **ACC-J9-1** With a key stored, a barcode missing from Open Food Facts is looked up in FoodData Central
  - Review: P06-17

### J10 · Tracking & reminders page (P1)

- **ACC-J10-1** The tracking page shows water and fasting rows only when each is switched on
  - Review: P07-06

### J11 · Reminders (P1)

- **ACC-J11-1** Denying notification permission leaves the switch off with a pointer to browser settings
  - Review: P09-09
- **ACC-J11-2** A reminder missed while the app was closed shows once on the next open
  - Review: P09-08

## K · Data management, backup and privacy

### K1 · Export the diary as JSON, Markdown or CSV for today, this week (by … (P1)

- **ACC-K1-1** Exporting this week as CSV gives a file with food and water rows
  - Review: P09-19
- **ACC-K1-2** A kJ user's export still holds kcal and says so
  - Review: P09-10

### K2 · Import our own diary JSON (P1)

- **ACC-K2-1** A file with one invalid value is refused and nothing changes
  - Review: P09-11
- **ACC-K2-2** Replacing a range keeps the photos of matched entries
  - Review: P09-11

### K3 · Back up to a file (P1)

- **ACC-K3-1** Back up now produces one file with the diary, photos and chat
  - Review: P09-13

### K4 · Restore from a file (P1)

- **ACC-K4-1** Restore shows what the file holds and asks before replacing anything
  - Review: P09-13
- **ACC-K4-2** A damaged file changes nothing
  - Review: P09-13

### K5 · Clear the diary (P1)

- **ACC-K5-1** Clear diary removes entries but keeps saved meals, weights and settings
  - Review: P09-15

### K6 · Erase everything and return to onboarding (P1)

- **ACC-K6-1** Erase everything empties the app, other open tabs included, and shows Welcome
  - Review: P09-15

### K7 · Storage card (P1)

- **ACC-K7-1** The storage card shows photo bytes and whether storage is persistent
  - Review: P09-15

### K9 · Unreadable stored data is kept aside, never overwritten, and a … (P1)

- **ACC-K9-1** A damaged entry is skipped, kept aside, and the other entries still show
  - Review: P02-02

## L · Platform

### L1 · Installable app (P1)

- **ACC-L1-1** The manifest lists our icons and the app can be installed
  - Review: P09-18
- **ACC-L1-2** iOS Safari shows Add-to-Home-Screen instructions
  - Review: P09-18

### L2 · Works offline except AI and food-database lookups (P1)

- **ACC-L2-1** The installed app reloads with the network off
  - Review: P09-19
- **ACC-L2-2** AI requests are never cached by the service worker
  - Review: P09-17

### L3 · Update-ready banner and Settings dot (P1)

- **ACC-L3-1** A new version shows Update ready and waits for the tap
  - Review: P09-17

### L4 · Persistent storage requested after the first logged entry, with … (P1)

- **ACC-L4-1** Logging the first entry asks for persistent storage once
  - Review: P09-15

### L5 · Notifications through the browser when permitted, otherwise in-app … (P1)

- **ACC-L5-1** Without permission a due reminder shows as an in-app banner
  - Review: P09-09

### L6 · Privacy (P1)

- **ACC-L6-1** The page's CSP allows only our own scripts
  - Review: P09-18
- **ACC-L6-2** The built app contacts no host outside the providers and food databases
  - Review: P10-08

### L7 · Every open tab sees every saved change (P1)

- **ACC-L7-1** An entry added in one tab appears in another open tab
  - Review: P02-03

### L9 · Accessible names on every control (P1)

- **ACC-L9-1** Automated accessibility checks find no serious problems on the main screens
  - Review: P10-07
- **ACC-L9-2** The gauge's value is readable by a screen reader
  - Review: P04-03

### L10 · Initial JavaScript at most 250 KB gzip (P1)

- **ACC-L10-1** The production build stays within the bundle budget
  - Review: P00-10

## Known gaps

Behaviour of the reference that v1.0 ships without, decided on 2026-10-26 and recorded in `docs/plan/16-what-we-change.md` §2.8 (N-ids) or §2.6 (D-ids). None of these is a P0/P1 row.

- **Workouts, exercise library, burn (N-1).** No workout tab, no burn line on Home, no workout tiles in the recap (D-16.44); Coach offers nutrition tools only. Later: L2–L3.
- **Voice input and live voice (N-2).** No microphone in the + menu or the Coach composer. Later: L4 (speech-to-text), L5 (live voice spike).
- **Other languages (N-3).** English only; every string is in the catalogue and numbers and dates follow the browser locale. Later: L1.
- **Cloud backup (N-4).** A local backup file instead (K3, K4; D-16.30); the welcome-back cloud restore becomes a file restore (B10).
- **Health-store sync and steps (N-5).** No steps, no measured energy anchor, no health import. Not planned (no browser API).
- **Key passphrase lock (N-6).** Keys are wrapped by a device key and the Settings page states the browser's limits (E14, D-16.7).
- **Body measurements, amino acids (N-7).** Not recorded; the Coach context has no measurement block.
- **Hosted AI, weekly challenge, short share links (N-8).** Not planned; every server-side trap (R07.14, R07.15, R07.18, R07.19) is recorded as not planned in the traps ledger.
- **What's New dialog (D-16.43), streaming Coach replies (D-16.47), on-device models (D-16.6), watch, widgets and Siri (D-16.3).** Not in v1.
