# Parity report, v1.0

The REA parity pass of P10-01..04: every flow of `parity/` driven through the real REA against a
fresh build, each capture compared with the reference's observed behaviour, and every difference
classified. Run on 2026-10-27 on the P10 slice S1 worktree (base `e370445`, the slice uncommitted on
top), `rea-agents@6.8.0` on Node 24.22.1, Chromium 153.0.8010.12.

**Result: 14/14 flows pass** (every step completed, no uncaught page error), **74
claims** in `parity/ledger/obligations.json`: 70 verified, 4 blocked, **no
unclassified divergence**. One bug found and fixed with a test that failed first; one more
reported with a proposal. Two intended differences had no id yet and are recorded as D-16.86 and D-16.87 in
`16-what-we-change.md` §2.7. REA's own ledger: ledger `ev_4de887ea064fc4748a639c91bd4754a05b2a9bf8b10c21f2a7f0f9844bb4da0f`, status open, closure digest `ef67b5477b1fb86f4b87738a6739f04048d34bc393d0438bee0b292e30b31ca3`: 74 obligations, all blocked on the reference side, 4 without a verifier (the four blocked claims).

## How the pass works

- **Product side.** `pnpm parity` (`scripts/parity.ts`, P10-03) builds the app, serves `dist/`
  with `vite preview` on a fixed loopback port, starts the fake AI (`e2e/fake-ai`) on its own port
  and runs each `parity/*.platewise.json` through `~/rea-lab/rea capture-browser-scenario`, one
  browser at a time. REA's launch mode takes no browser flags and has no file or routing action,
  so REA launches a wrapper the runner writes: the same Chromium with a DevTools port of its own.
  Through it the runner's fixture desk picks files in the browser's file chooser (our meal photo,
  a backup made for the run by our own backup writer) and answers Open Food Facts and FoodData
  Central from `e2e/fixtures`; every other host off loopback is refused. Every step is REA's; the
  desk never clicks or reads the page.
- **Reference side.** The reference is two native apps that cannot run here (no APK or IPA, no
  emulator: `02-rea-workflow.md` §2). For each flow a reference observation in
  `~/rea-lab/parity/fud-ai/<flow>.md` (outside the repo) names the reference files and tests at the
  pin, the store screenshots that show the screen and the spec section, and states the observed
  behaviour in our words. The comparison is one-sided: our capture (accessibility tree, screenshot
  and URL after each step) against an observation made from source.
- **Classification** (`02-rea-workflow.md` §4.4): intended (a D-id), bug (fixed with a test that
  failed first), reference gap (the reference cannot show it here, and why), unknown (the lead
  decides). A claim is verified when its steps complete and every difference is classified; a claim
  no run here can show is blocked, with the reason.
- **No clock.** REA cannot set the time, so the flows run on the real date: no step names a date,
  weekday or meal. Days are reached with the week bar's arrow keys from today's tile and rows are
  found in any meal section. The fake AI answers from its scripts; nothing needs a key or the
  internet.

## Flows

| Flow | Steps | Time | Result | Evidence |
|---|---|---|---|---|
| `walking-skeleton` | 51/51 | 25.8 s | pass | `ev_87899425ae9ab2cb1ddafc9787327b40b66333063baf7b753c4b30cb74830b42` |
| `onboarding` | 68/68 | 26.8 s | pass | `ev_4761f9f9502a706b16c1d1eab3643541ebf6984b84ff2551079661ff16bb807b` |
| `log-manual` | 86/86 | 39.7 s | pass | `ev_fafe28bc287b9795e008e7b65032385463c563af9f1f2622846d7978785dc2fc` |
| `log-photo` | 56/56 | 30.8 s | pass | `ev_3156624e83764a9e5d043cf5493575645d3096630eaea431483ad7580ac6ea57` |
| `log-describe` | 49/49 | 26.4 s | pass | `ev_8f87aa1cf1c7b6afe65a147062405e95e27191b5c0a1a59b01915acc4942f905` |
| `log-barcode` | 78/78 | 50.3 s | pass | `ev_86fb42f2f7f740ed08b170488d9810770ce2ebc5386fb51c024f779dcc958651` |
| `reuse` | 92/92 | 43.0 s | pass | `ev_d4091d737712c98f3dc57e6798073b22446fe18bb2d9268bab38a4baa46839d3` |
| `edit-combine-copy` | 95/95 | 52.0 s | pass | `ev_74bcd9de439d97864fde9185d33a67ae09d59eaadd20d81cb3205d0ffb077e1e` |
| `water-fasting` | 128/128 | 58.1 s | pass | `ev_eca19ad47fbbc374789a3941bc851366ac6826a05d717007461aaa0057b5e699` |
| `home-days` | 98/98 | 61.4 s | pass | `ev_6452686bb1157417fca5542d934d78f81209ad933294d9c0a24be0d6ddef2fc3` |
| `progress` | 101/101 | 43.9 s | pass | `ev_a3f456956b662fc475468323eea45cf57fc58aef73c09dbaedf560c85931e700` |
| `coach` | 64/64 | 29.8 s | pass | `ev_256354494c32a79a0d57951c1c6af1f822d0210bc17e61fe4ac64592c7fa5892` |
| `settings` | 79/79 | 36.3 s | pass | `ev_704c78e4d1b44d90e8f3ef33bbf2d628b82e52c2c734b4800862a8ca2c166360` |
| `data` | 15/15 | 9.1 s | pass | `ev_4ed22e1f88ef5fd17a67c62464edc35f9c4ac739778e3cf34368b45fbfac6fa1` |

Captures are in `~/rea-lab/parity/platewise/<flow>.result.json` (REA Evidence, outside the repo),
each beside the input REA ran (`<flow>.scenario.json`). After the run the runner found every
process it had started gone (29 PIDs: the preview, then one REA run and one browser per flow).

## Claims and divergences by flow

One line per claim: the ACC row, its status and spec section, what our capture shows, and every
difference from the reference observation with its class ("same": the observation agrees). The
steps of each claim are in `obligations.json`; its owner module and tests in `manifest.json`.

### Walking skeleton (Demo 1) (`walking-skeleton`)

- **ACC-D12-3** (verified; spec 05 §3.3). Deleting an entry asks first; Cancel keeps it and Delete removes it. Differences: intended, D-16.75: Driven through the row's keyboard delete button; the swipe is proven by e2e.

### Onboarding with the fake provider (`onboarding`)

- **ACC-B1-1** (verified; spec 01 §3.4). A fresh browser opens on Welcome with no Back button, and Get started opens the first question. Differences: intended, D-16.30: Welcome links to restoring a backup file instead of the returning-user screen.
- **ACC-B2-1** (verified; spec 01 §3.4). Each question starts on its default and Continue moves to the next one. Differences: intended, D-16.15: No health-store question; an optional Reminders question takes its place; intended, D-16.63: Thirteen steps in a fixed order.
- **ACC-B11-2** (verified; spec 01 §3.2; 06 §3.3). In an en-US browser the height-and-weight question opens in pounds, 70 kg showing as 154.3 lb. Differences: intended, D-16.10: Unit defaults follow the browser locale; the reference fixes them per platform.
- **ACC-B3-1** (verified; spec 01 §3.2, §3.4). Switching metric to imperial and back keeps the weight at 70.0 kg. Compared with the reference: same.
- **ACC-B4-1** (verified; spec 01 §3.4 (R01.6)). With "lose weight", a target above the current weight shows why it cannot be used and holds Continue. Differences: intended, D-16.11: The reference accepts a target on the wrong side of the current weight.
- **ACC-B6-1** (verified; spec 01 §3.4; 03 §3.3). On the AI question Continue stays off until the provider, its address, a model and the terms are all given, and says what is missing. Differences: intended, D-16.82: The reference enables Continue with the terms and reports a missing key when it is tapped; here Continue opens only once the choice is complete and stored.
- **ACC-B7-2** (verified; spec 01 §3.4, §3.6). After the building animation the plan from the AI shows (2,400 kcal), with no fallback note and no Back while it builds. Differences: intended, D-16.14: An overall 60 s limit falls back to the formula plan; not reached here.
- **ACC-B8-1** (verified; spec 01 §3.4 (R01.7)). Raising protein to 150 g on the plan works carbs out again (315 g) and keeps the calories. Differences: intended, D-16.12: Edits keep the plan energy-consistent as the reference iOS app does (inventory B8, R01.7); its Android app lets the numbers drift apart.
- **ACC-B9-1** (verified; spec 01 §3.4 (completion)). After Start tracking, Home counts against the plan and Progress shows the first weigh-in. Compared with the reference: same.

### Manual entry (`log-manual`)

- **ACC-B6-2** (verified; spec 01 §3.4, §3.6). Set up later skips the AI and the plan comes from the formulas (2,452 kcal for the defaults), with a note saying so. Differences: intended, D-16.82: Set up later stores no provider; the reference chooses between its own access paths here; intended, D-16.49: Onboarding finishes without an AI key.
- **ACC-F4-1** (verified; spec 05 §3.2). Home opens with protein, carbs, fat and fibre pillars. Compared with the reference: same.
- **ACC-D3-2** (verified; spec 02 §3.18). The + menu opens on three groups: snap and scan, describe, reuse. Compared with the reference: same.
- **ACC-D3-1** (verified; spec 02 §3.18, §3.8). Enter manually is offered in the describe group of the + menu and opens the manual form. Compared with the reference: same.
- **ACC-D2-1** (verified; spec 02 §3.8; 05 §3.3). A food typed by hand is logged at once under the meal picked, the gauge and pillars count it, Cancel logs nothing, and it is still there after a reload. Differences: intended, D-16.79: Unreadable macro text blocks Save with a field error; the reference saves it as 0.
- **ACC-F7-1** (verified; spec 05 §3.3). An entry sits under its meal, whose header shows that meal's total. Compared with the reference: same.

### Photo logging (`log-photo`)

- **ACC-D8-1** (verified; spec 02 §3.3, §3.5, §3.9). A meal photo is analysed into a review with its photo; an amount typed as 1+0.5 becomes 1.5 and every value follows (410 to 615 kcal) before it is logged. Differences: intended, D-16.72: The unit word turns plural (bowls) for 1.5.

### Describe (`log-describe`)

- **ACC-D6-1** (verified; spec 02 §3.11). Describing a meal in words opens the review with the AI's estimate and no photo. Compared with the reference: same.
- **ACC-D25-1** (verified; spec 02 §3.10). A reload while the review is open brings it back with the same values, without asking the AI again; once logged it is gone. Differences: intended, D-16.46: Drafts survive a reload on every platform; in the reference only Android keeps them.

### Barcode by typed digits (`log-barcode`)

- **ACC-D19-1** (verified; spec 02 §3.12). Typing the barcode digits under the camera looks the product up. Differences: intended, D-16.18: The reference scans with the camera only.
- **ACC-D20-1** (verified; spec 02 §3.12). A product Open Food Facts knows opens in the review at one serving, with its photo, and logs. Compared with the reference: same.
- **ACC-D22-1** (verified; spec 02 §3.13). The product block lists only the fields that have data (barcode, package, scores, allergens, categories). Compared with the reference: same.
- **ACC-D23-1** (verified; spec 02 §3.13). Allergens marked in the product's ingredient text are shown in bold. Compared with the reference: same.
- **ACC-D20-2** (verified; spec 02 §3.12). A product found nowhere offers Scan label, which takes a photo of the label to the AI and ties the result to the barcode. Compared with the reference: same.
- **ACC-D21-1** (verified; spec 02 §3.12). The same unknown barcode again opens the label saved for it, with a note saying where the values come from. Compared with the reference: same.

### Reuse from Recent, Saved, Often eaten (`reuse`)

- **ACC-D16-1** (verified; spec 02 §3.16). Searching "cafe" finds "Café latte" and leaves the other foods out. Differences: intended, D-16.86: Search ignores accents and case on every platform, as the reference iOS app does; its Android app matches accents exactly (spec 02 §3.16). Proposed to the lead for an id.
- **ACC-D16-2** (verified; spec 02 §3.16). Picking yesterday's food from Recent opens the review instead of logging it, and logging it leaves yesterday's entry as it was. Differences: bug found by the pass, fixed: The Saved sheet and each saved row shared the hook "reuse.saved", so a step on the sheet matched every row too (REA strict-mode refusal). Rows now carry "reuse.saved.row". Test: `src/features/log/reuse/ReuseSheet.test.tsx > ReuseSheet: Saved > keeps the sheet hook for the sheet alone: each saved row has its own (P10-04 parity)`.

### Edit, combine, copy a day (`edit-combine-copy`)

- **ACC-D12-2** (verified; spec 02 §3.7). Opening a logged entry and unlocking its nutrition lets its calories be changed; the row and gauge follow. Differences: intended, D-16.19: The reference does not let nutrition change after logging.
- **ACC-F12-1** (verified; spec 05 §3.4; 02 §3.15). Picking a row for a combine shows the combine bar in place of the + button. Differences: intended, D-16.87: A Select button, shown when a row has keyboard focus, starts the picking as the long-press does; the reference has the long-press only. Proposed to the lead for an id. The scenario uses it because REA has no long-press; the press itself is proven by e2e.
- **ACC-D15-1** (verified; spec 02 §3.15). Combining two picked entries leaves one entry named after both, with their summed calories. Differences: intended, D-16.20: Every nutrient both rows have is summed; the reference drops micronutrients and extras.
- **ACC-D18-1** (verified; spec 02 §3.17). Copy a day copies yesterday's food onto today and leaves yesterday unchanged. Differences: intended, D-16.50: Copies keep their meal (lunch); the reference files them under the current-time meal.

### Water and fasting (`water-fasting`)

- **ACC-H1-1** (verified; spec 05 §3.6). Water tracking is off at first; switching it on adds the water pillar and a Water page to the + menu. Compared with the reference: same.
- **ACC-F11-1** (verified; spec 05 §3.4, §3.6). A preset on the Water page logs at once, and water never counts as food. Compared with the reference: same.
- **ACC-H4-1** (verified; spec 05 §3.6). The water pillar shows the day's water against the goal. Compared with the reference: same.
- **ACC-H3-1** (verified; spec 05 §3.6). A custom amount of 6 000 ml is refused; 330 ml is added. Differences: intended, D-16.39: Custom water is capped at 5 000 ml; the reference allows up to 99 999 ml.
- **ACC-F9-1** (verified; spec 05 §3.3). Deleting a water row asks first; Cancel keeps it and Delete removes it. Differences: intended, D-16.75: Driven through the row's keyboard delete button; REA has no drag. The swipe is proven by e2e.
- **ACC-H6-1** (verified; spec 05 §3.7). Switching fasting on offers Start fast in the + menu. Compared with the reference: same.
- **ACC-H7-1** (verified; spec 05 §3.7). Start fast on the 16 h default shows a running fast; Cancel fast removes it. Compared with the reference: same.
- **ACC-F11-2** (verified; spec 05 §3.4). While a fast runs the + menu holds only water and fasting entries. Compared with the reference: same.
- **ACC-D27-1** (verified; spec 02 §3.20; 05 §3.7). Combining food during a fast shows the paused dialog: Cancel keeps fasting, End fast and log ends the fast and combines. Differences: intended, D-16.35: The reference only refuses; "End fast and log" is ours.

### Week bar and days (`home-days`)

- **ACC-F1-2** (verified; spec 05 §3.2.1). No day after today can be picked in the week bar. Differences: intended, D-16.36: The reference lets later days of the current week be picked.
- **ACC-F1-1** (verified; spec 05 §3.2.1). Picking an earlier day, last week included, shows that day's diary; food typed there stays on that day. Compared with the reference: same.
- **ACC-F10-1** (verified; spec 05 §3.3). A day with nothing logged shows the empty-day message. Compared with the reference: same.
- **ACC-F6-1** (verified; spec 05 §3.2.4). All nutrients lists the day's nutrients against their goals. Compared with the reference: same.
- **ACC-F5-1** (verified; spec 05 §3.2.4). Choosing sodium as a fifth pillar replaces the latest choice (fibre), and the choice is kept after a reload. Compared with the reference: same.
- **ACC-F2-1** (blocked; spec 05 §3.2.2). Swiping the day summary moves to the day before or after, never past today. Differences: reference gap: REA has no drag action, so no parity run can swipe; the e2e spec drives the gesture.

### Progress (`progress`)

- **ACC-G4-2** (verified; spec 05 §3.5). Choosing kg in the Log weight sheet switches the whole app to kg. Compared with the reference: same.
- **ACC-G4-1** (verified; spec 05 §3.5). A weight logged for an earlier day lands on that day without replacing today's as Current. Compared with the reference: same.
- **ACC-G1-1** (verified; spec 05 §3.5). The back arrow moves to the earlier period; the forward arrow returns and stops at the current one. Compared with the reference: same.
- **ACC-G6-1** (verified; spec 05 §3.5). Deleting a weigh-in from the history asks first, and Delete takes it out of the list at once. Differences: intended, D-16.38: The reference Android app deletes on one tap.
- **ACC-G7-1** (verified; spec 05 §3.5). Deleting the latest weigh-in makes the previous one Current. Compared with the reference: same.
- **ACC-G8-1** (verified; spec 05 §3.5.6). The weekly recap shows last week's logged days against the week before, and an empty week says so. Differences: intended, D-16.84: Four tiles, days counted by their stored day; intended, D-16.44: No workout or burn tiles.
- **ACC-G9-1** (verified; spec 05 §3.5.7). Count today can be switched off on the nutrition cards. Compared with the reference: same.
- **ACC-G2-1** (verified; spec 05 §3.5). With a body fat given in setup, Progress offers Body fat beside Weight. Compared with the reference: same.
- **ACC-G5-1** (verified; spec 05 §3.5). Logging 18.5 % shows on the body-fat card. Differences: intended, D-16.37: Body fat in 0.5 % steps on every platform.

### Coach (`coach`)

- **ACC-I1-1** (verified; spec 04 §3.1, §3.3). An empty chat shows four suggested questions; tapping one sends it and the answer follows. Compared with the reference: same.
- **ACC-I7-1** (verified; spec 04 §3.9, §3.11). A question about past meals runs the food log tool and answers from it. Compared with the reference: same.
- **ACC-I10-2** (verified; spec 04 §3.7). The chat is still there after a reload. Compared with the reference: same.
- **ACC-I1-2** (verified; spec 04 §3.6). While a reply is pending the typing dots show and the suggested questions wait. Compared with the reference: same.
- **ACC-I5-1** (verified; spec 04 §3.5). Clear chat asks first; clearing while a reply is pending leaves an empty chat, and the late reply never lands. Differences: intended, D-16.34: In the reference a reply that arrives after Reset lands in the new chat.

### Settings: units, look, AI providers (`settings`)

- **ACC-C12-1** (verified; spec 06 §3.3; 01 §3.2). With kJ chosen, the gauge shows the goal in kJ (10,259 kJ for 2,452 kcal) without changing it. Compared with the reference: same.
- **ACC-D2-2** (verified; spec 06 §3.3; 02 §3.8). Energy typed in kJ comes back as the same kJ after a reload (it is stored as kcal). Compared with the reference: same.
- **ACC-J3-1** (verified; spec 06 §3.3). Weight in kg can be chosen while height stays in feet and inches. Compared with the reference: same.
- **ACC-A9-1** (verified; spec 06 §3.2). Picking the Ember accent takes effect and is kept. Differences: intended, D-16.1: Six solid accents of our own instead of eighteen named presets with gradients.
- **ACC-A8-1** (verified; spec 06 §3.3). A chosen appearance holds against the device's own (Dark on a light device) and is kept. Compared with the reference: same.
- **ACC-J8-2** (verified; spec 03 §3.12). The AI providers page says plainly that keys stay in this browser. Differences: intended, D-16.7: Keys sit in IndexedDB with a warning instead of the platform keystore.
- **ACC-J8-1** (verified; spec 03 §3.3, §3.4). An image standby set on the AI providers page is stored and comes back after a reload (the fallback itself is proven by the unit tests). Compared with the reference: same.
- **ACC-E14-1** (verified; spec 03 §3.12). A saved key shows only as its first four and last four characters. Differences: intended, D-16.78: Keys of eight characters or fewer show as dots only (not exercised here).

### Data: restore on Welcome (`data`)

- **ACC-K4-2** (verified; spec 06 §3.17; 01 §3.5). A file that is not a backup is refused with the reason, and nothing changes. Compared with the reference: same.
- **ACC-K4-1** (verified; spec 06 §3.17). Restore first shows what the file holds and asks before replacing anything. Differences: intended, D-16.42: The reference restores at once.
- **ACC-B10-1** (verified; spec 01 §3.5; 06 §3.17). A backup with a finished setup, restored from Welcome, opens the app on Home with its entries and weigh-in. Differences: intended, D-16.30: A local backup file instead of a cloud backup.
- **ACC-K1-1** (blocked; spec 06 §3.13). Exporting this week as CSV gives a file with food and water rows. Not compared: the Your data page (P09-15) is not on this base; the lead extends data.platewise.json when it lands.
- **ACC-K3-1** (blocked; spec 06 §3.17). Back up now produces one file with the diary, photos and chat. Not compared: the Your data page (P09-15) is not on this base; the lead extends data.platewise.json when it lands.
- **ACC-K6-1** (blocked; spec 06 §3.15). Erase everything empties the app and shows Welcome. Not compared: the Your data page (P09-15) is not on this base; the lead extends data.platewise.json when it lands.

## Bugs

| Found in | Bug | Fix | Test (failed first) |
|---|---|---|---|
| `reuse` | The Saved sheet and every saved row (its swipe box) carried the same hook, `reuse.saved`, so a step aimed at the sheet matched every row too and REA refused it (strict locator). | Rows carry `reuse.saved.row` (one attribute in `src/features/log/reuse/ReuseSheet.tsx`); the sheet keeps `reuse.saved`. | `src/features/log/reuse/ReuseSheet.test.tsx > ReuseSheet: Saved > keeps the sheet hook for the sheet alone: each saved row has its own (P10-04 parity)` |

Reported, not fixed (it is a choice between two controls, not a local fix):

- **Two "Remove" controls per saved meal.** A saved row has a visible trash button
  (`reuse.row.remove`) and, being a swipe row, the swipe's keyboard twin
  (`reuse.saved.row.delete`), both named "Remove <name>": a keyboard or screen-reader user meets
  the same action twice in a row (seen in the `reuse` capture at `saved.sheet`). Proposal for the
  accessibility pass (P10-07): let `SwipeRow` leave out its keyboard twin where the row already
  shows a remove button, which keeps the visible control that ACC-D17-2's test relies on.

## Blocked claims

| Claim | Why no run here shows it | Where it is proven instead |
|---|---|---|
| ACC-F2-1 | REA cannot drag; covered by e2e/home-progress.spec.ts | `src/features/home/DaySwipe.test.tsx > DaySwipe > shows yesterday after a swipe of 100 px toward the right (ACC-F2-1)`; `src/features/home/DaySwipe.test.tsx > DaySwipe > never moves past today: a swipe toward the left on today does nothing (ACC-F2-1)`; `src/features/home/HomePage.test.tsx > HomePage: the selected day (P07-01, P07-02) > shows yesterday after a swipe toward the right on the summary; toward the left on today does nothing (ACC-F2-1)`; `e2e/home-progress.spec.ts > Home: days, pillars and the diary (Demo 4) > swipes the summary to yesterday and back, never past today (ACC-F2-1)` |
| ACC-K1-1 | the Your data page (P09-15) is not on this base; the lead extends data.platewise.json when it lands | Review: P09-19 |
| ACC-K3-1 | the Your data page (P09-15) is not on this base; the lead extends data.platewise.json when it lands | `src/services/backup/backup.test.ts > makeBackup > makes one file with the diary, its photos and the Coach chat (ACC-K3-1)`; `src/features/settings/data/BackupSection.test.tsx > BackupSection > says there is no backup yet, then hands one file over and shows its time (ACC-K3-1)` |
| ACC-K6-1 | the Your data page (P09-15) is not on this base; the lead extends data.platewise.json when it lands | Review: P09-15 |

## Notes for later passes

- The `data` flow covers what this base has: the restore on Welcome (a refused file, then a backup
  made for the run by our own backup writer). Export, Back up now, Clear diary and Erase everything
  live on the Your data page (P09-15), which lands after this slice's base: the lead adds their
  steps to `parity/data.platewise.json` and moves ACC-K1-1, ACC-K3-1 and ACC-K6-1 from blocked to
  verified.
- REA's accessibility snapshot writes the value of a password field into the capture (the
  `settings` flow types a made-up key). Captures never enter the repo; a flow must never type a
  real key.
- REA's ledger needs reference-side runtime Evidence for each claim, which cannot exist here, so it
  keeps every claim blocked (diagnostics: no original case, runtime authority unavailable, browser
  captures not counted as fixture proof); our ledger is the progress bar (`02-rea-workflow.md`
  §4.6). Its input is generated by `pnpm parity --ledger` from the two ledger files and the newest
  capture of each flow (about 220 MB, as REA authenticates whole records, screenshots included).
