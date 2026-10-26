# 16 · Same product, our own build: what stays and what changes

This page pins down what "same" and "different" mean, so nobody guesses during the build.
Product: **Platewise** (confirmed by the user at intake, 2026-10-26).

D-ids are `D-<doc>.<n>`: D-16.n here, D-04.n in the architecture doc, D-0.n in the intake
decisions. Every difference found while building or in the parity pass gets an id here. A
difference without an id is a bug or an open question. The research spec question it answers is
cited as `01-Q3` (spec 01, open question 3).

---

## 1. What stays the same (we deliberately match the reference)

| Area | Stays the same |
|---|---|
| **Product idea** | A privacy-first calorie and nutrition tracker: you snap, scan, type or enter food; your own AI key estimates it; you check every number before it is logged; a Coach answers from your own log |
| **Architecture idea** | Local-first: the diary lives on the device; AI calls go straight from the device to the provider the person chose; no account and no first-party server in the core loop (`04-architecture.md`) |
| **Information architecture** | A bottom tab bar (Home, Progress, Coach, Settings). Home: a week strip, a calorie ring, nutrient pillars and meal sections; a "+" add menu; review sheets |
| **Core flows** | Onboarding → profile → AI-built plan; log by photo, text, barcode or manual entry → review → log; Home shows what's left; Progress shows trends; Coach answers with retrieval tools |
| **Numbers** | Formulas, constants, limits, clamps and rounding as recorded in the research specs (BMR/TDEE, plan validation, adaptive cadence, fasting limits, water limits, scaling) |
| **Feel** | Phone-first, one-handed, dark by default, large numbers, sheets over pages, nothing logged without review |

## 2. What changes (on purpose)

### 2.1 Identity (required)

| Reference | Platewise |
|---|---|
| Name, package ids, storage keys, file names | Our own (`17-naming-and-glossary.md`); banned in code by `pnpm check:banned` |
| Logo, icons, illustrations, screenshots | Our own; none taken from the reference |
| Palette: a pink default with 18 named accent presets and gradients | **D-16.1** Our own palette: a deep green-black neutral base and **six** solid accent presets of our own (Basil default, Saffron, Lagoon, Beet, Ember, Ink). No gradients (05-Q9, 06-Q8) |
| UI copy, AI prompts, help and error text | Written in our own voice |

### 2.2 Protocol and storage: own names, not compatible

**D-16.2** Platewise is not data-compatible with the reference: our own IndexedDB tables, keys,
export format and backup format. It imports neither the reference's diary exports nor its backups
(06-Q1). This avoids carrying the reference's key names and format ids into our code.

### 2.3 Platform: a web app (D-0.1)

| Reference (native) | Platewise (PWA) |
|---|---|
| iOS + Android apps, iPad, Watch, widgets, Siri, share extension | **D-16.3** One installable web app for phone and desktop browsers. No watch, widgets, Siri or share extension in v1 |
| Apple Health / Health Connect sync and restore-from-health | **D-16.4** None (no browser API). Backups are files (D-16.30) |
| Exact local notifications | **D-16.5** = D-04.2. Reminders fire while the app is open or in the background; one that was due while it was closed is shown on the next open. Every reminder is off by default and asks for notification permission when first turned on (05-Q2, 06-Q3, 06-Q6) |
| Apple Intelligence / on-device Gemma fallbacks | **D-16.6** None in v1 |
| Keychain / encrypted key file | **D-16.7** Keys are stored in a separate IndexedDB table. Settings says plainly that a browser cannot protect them from code on the same site. Keys never leave the device except to their own provider; backups and exports never contain them (03-Q6, 06-Q4). An optional passphrase lock is a later item (§2.8) |
| Storage the OS keeps | **D-16.8** The app asks for persistent storage (`navigator.storage.persist()`) after the first logged entry, and Settings shows whether it was granted, with a nudge to install the app and make regular backups (R06.19) |

### 2.4 Scope: a focused v1, then growth

| Feature | Reference | Platewise v1 | Later |
|---|---|---|---|
| AI providers | 16 BYOK + hosted Plus/Pro + on-device | **16 BYOK** | Hosted: not planned |
| Speech-to-text, Live Voice | 6 STT providers, a voice assistant | **None** | Phase L2 (voice input), L5 (live voice) |
| Workouts and the exercise library | Diary, routines, library of ~870 exercises, burn | **None** (Coach workout tools off) | Phase L1 |
| Weekly Challenge, meal share links, Discord bot | Server features | **None** | Not planned for now |
| Languages | 19 | **English** (all copy in one catalogue, ready for i18n) | Phase L3 |
| Body measurements | Yes | **None** | Phase L4 |
| Amino-acid estimates | Yes | **None** (02-Q9) | Later |
| Cloud backup (iCloud / Google Drive) | Yes | **Local backup file** (export/import) | Phase L4: Google Drive |
| Telemetry, ads, accounts | None | **None** | — |

### 2.5 Visual differences: siblings, not twins

Keep the regions and interaction model: the tab bar order, a ring on Home, pillars under it, meal
sections, review as a sheet. Change the surface: our palette, radius and elevation, our own icon
set (inline SVG drawn by us), our empty states, typography from the system font stack, and our
wording for every label longer than a few words.

### 2.6 Improvements we take (lead decisions, 2026-10-26)

Each fixes a trap the research found, or fills a gap the web platform creates.

| ID | Area | Reference | Platewise |
|---|---|---|---|
| D-16.10 | Units (01-Q2, 05-Q6, 06-Q5) | Android defaults to metric; iOS to imperial | Defaults come from the browser locale: `en-US`, `en-LR` and `my-MM` get lb + ft/in, everyone else kg + cm. kcal by default. Changeable in onboarding and Settings |
| D-16.11 | Onboarding target weight (01-Q3) | Onboarding accepts a target on the wrong side of the current weight | Rejected, as Settings already does: lose needs target < current, gain needs target > current |
| D-16.12 | Plan edit ranges (01-Q4) | iOS narrower than Android | Android's ranges everywhere: calories 800–6 000 in steps of 50, macros in steps of 5 |
| D-16.13 | Goal reached (01-Q5) | Dismiss only | The dialog offers "Set a new goal", which opens the goal editor, and Dismiss |
| D-16.14 | Plan build wait (01-Q6) | No overall timeout on Android | 60 s overall, then the formula plan, with a note that the AI was unavailable |
| D-16.15 | Onboarding steps (01-Q7) | A health-store step | Dropped; the notifications step becomes an optional "Reminders" step using web notifications |
| D-16.16 | Review meal type (02-Q1) | The meal type follows the current clock | It follows the date and time picked on the review screen, using the meal-time boundaries |
| D-16.17 | Favourites (02-Q3) | Keyed by lower-case name + calories, stored as copies | Saved meals have their own ids. "Frequent" groups diary rows by normalised name + calories |
| D-16.18 | Barcode entry (02-Q5) | Camera only | Camera (native `BarcodeDetector`, else a lazy-loaded WASM decoder) **plus** typed digits |
| D-16.19 | Edit after logging (02-Q6) | Nutrition is editable only before logging | Logged entries can be edited, nutrition included, with the same lock/unlock scaling |
| D-16.20 | Combine (02-Q7) | Micronutrients and extras are dropped | Combine sums every nutrient both rows have |
| D-16.21 | HEIC photos (02-Q8) | Native decode | Decoded through the browser; if it can't decode, the photo is refused with a clear message |
| D-16.22 | Fallback on unusable answers (03-Q1, R03.4) | Fallback only on transport errors | A primary answer that fails validation also triggers the fallback provider, on every AI entry point |
| D-16.23 | Overall AI deadline (03-Q3, R03.6) | No overall bound; retry rules differ by format | One retry policy for every format (429/503/529: waits of 1, 2, 4 s) and one overall deadline per user action: the person's timeout setting (default 180 s, range 30–600 s) covers primary, retries, re-ask and fallback together. Cancel works at any point |
| D-16.24 | Custom instructions (03-Q4) | Prompt text on Android, system message on iOS | Sent as part of the system message on every format |
| D-16.25 | Model presets (03-Q5) | Long dated lists, migration code | Our own short curated catalogue per provider (data file); any model id can be typed. The output-token cap is shown for every provider |
| D-16.26 | Plain HTTP (03-Q2, 03-Q7, R03.3) | Android allows HTTP to any host | HTTP base URLs are accepted only for loopback (`localhost`, `127.0.0.1`, `[::1]`); anything else must be HTTPS. The Ollama guide says "same device, or behind HTTPS". No proxy feature: the Custom provider covers a person's own relay |
| D-16.27 | Coach context (04-Q2) | Today's intake, calories left and water are not in the context | They are included in every turn's context |
| D-16.28 | Coach language (04-Q1) | Fixed to English | The Coach answers in the language the person writes in |
| D-16.29 | Coach history (04-Q4, 04-Q5) | Kept forever, every thumbnail | The newest 200 messages are kept. Photo attachments are stored as small thumbnails. The chat is part of the backup file |
| D-16.30 | Backup (06-Q2, 06-Q10) | iCloud / Google Drive auto-backup | A local backup file (export all, import all) with integrity checks and an all-or-nothing restore. Google Drive comes later (L4) |
| D-16.31 | Coach errors and retry (04-Q7, 04-Q8, R04.4) | Raw provider text (iOS) or generic text (Android); no Retry | Friendly classified text with "Details" showing the provider's message, and a Retry button on the failed turn |
| D-16.32 | Coach tool limits (04-Q9, R04.9) | The size limit only on the hosted path, keeping the oldest rows | The 60 000-character limit applies on every provider and keeps the **newest** rows |
| D-16.33 | Coach chip with a photo (04-Q10) | Android drops the photo | The chip is sent with the photo |
| D-16.34 | Coach history shape (R04.3, R04.6) | It can start with an assistant turn or repeat roles; a late reply after Reset lands in the new chat | The history sent always starts with a user turn and merges same-role neighbours. A reply that arrives after Reset is dropped |
| D-16.35 | Fasting blocks logging (05-Q1, R05.1) | Food logging is refused during a fast | Kept, and the dialog also offers "End fast and log" |
| D-16.36 | Week strip (05-Q5) | Future days in the current week can be picked | Future days are shown but cannot be selected |
| D-16.37 | Weight and body-fat pickers (05-Q7) | Ranges and steps differ by platform | 20–250 kg / 50–500 lb; body fat in 0.5 % steps |
| D-16.38 | History delete (05-Q8) | Android deletes on one tap | Deleting a weight or body-fat entry asks first |
| D-16.39 | Water custom amount (05-Q10) | Up to 99 999 ml | Capped at 5 000 ml, the same as quick-add amounts |
| D-16.40 | Water reminder (05-Q12) | Fixed 14:00 on Android | A time picker (default 14:00) |
| D-16.41 | Reminder model (06-Q3, 06-Q6) | The platforms differ | Per-meal reminders with their own times (breakfast, lunch, dinner), a daily summary, water and the fasting goal. All off by default |
| D-16.42 | Restore confirmation (R06.9) | "Restore now" runs without asking | Restore shows what the file holds and asks before replacing anything |
| D-16.43 | What's New (06-Q9) | A dialog per release | None in v1; About shows the version and a link to the changelog |
| D-16.44 | Weekly Recap tiles (05-Q3, 05-Q4) | Workout and active-burn tiles; a challenge switch | The workout and burn tiles are hidden and the challenge switch is dropped until those features exist |
| D-16.45 | Adaptive Goals (01-Q1, R01.1) | An AI re-run every 7 days, with an unused trend-correction routine | Same AI re-run and cadence. The unused routine is not taken. Without a working key the week is still marked as checked and nothing changes |
| D-16.46 | Analysis drafts (02 platform note) | Only Android keeps drafts across app restarts | Drafts survive a reload (stored in IndexedDB) |
| D-16.47 | Coach streaming (04-Q6) | No streaming | No streaming in v1 (a later item) |
| D-16.48 | Coach photo resend (04-Q3) | Earlier photos are not re-sent | Same |

### 2.7 Intended differences settled during the build

Found in task notes and by the parity pass. The parity ledger cites these ids.

| ID | Area | Reference | Platewise 1.0 |
|---|---|---|---|
| D-16.67 | Water goal wheel in fl oz (P01-05) | Saving converts the rounded wheel value, so an untouched 2 000 ml goal becomes 2 011 ml | An untouched wheel keeps the exact stored ml, as the kJ wheel keeps kcal (R06.20) |
| D-16.68 | Water amount fields (P01-05) | Always write a dot | Show and accept the locale's decimal mark ("8,5" in de-DE); a typed comma or dot becomes that mark |
| D-16.69 | Meal-time editor (P01-08) | Choices counted in 15-minute steps from the lower bound; a current value inside the 15-minute margin is dropped | Choices on the quarter hours; the current value is always offered. Same choices whenever the neighbours sit on quarter hours |
| D-16.70 | Rebuild nudge after a dropped manual rebuild (P01-15) | The nudge is forced on | The nudge shows only when the plan inputs differ from the baseline |
| D-16.71 | Plan Ready "edited" mark (P01-13) | Saving marks the plan edited | Edited only when a value changes, so a wheel saved unmoved does not turn the tune-up off; edits are clamped, never snapped (keeps R06.20) |
| D-16.72 | Serving-count labels (P01-09) | The serving word stays singular ("2 serving") | Plural when the count is not 1 ("2 servings"), for the serving count and a recipe serving unit alike |
| D-16.73 | Ingredient change with no known weights (P01-10) | Unit choices are cleared | The serving stays as it was: basis, unit choices and the chosen unit are kept |
| D-16.74 | Evidence pack and forecast days (P01-17, P01-18) | Entries are placed by their timestamp | Entries are placed by their stored day key; a day with no entries has its own shape with no numbers (R01.16) |

### 2.8 Not in 1.0

| ID | Feature | Platewise 1.0 | Why not |
|---|---|---|---|
| N-1 | Workouts, exercise library, burn estimates | Absent | Size; v1 scope chosen at intake |
| N-2 | Voice input, live voice assistant | Absent | Scope; needs STT providers and audio capture work |
| N-3 | 18 more languages | English only | Scope; copy lives in one catalogue to make this cheap later |
| N-4 | Cloud backup | Local file only | Needs OAuth set-up and verification |
| N-5 | Health-store sync and steps | Absent | No browser API |
| N-6 | API-key passphrase lock | Plain IndexedDB with a warning | Scope; a later item |
| N-7 | Body measurements, amino acids | Absent | Scope |
| N-8 | Hosted AI, weekly challenge, meal shares | Absent | They need a server; not planned |

## 3. Decisions log

| ID | Decision | Status |
|---|---|---|
| D-0.1 | Installable web app (React + TypeScript + Vite) instead of native apps | Decided by the user, 2026-10-26 |
| D-04.1 | Browser CORS per provider: measured in research 03 (all 14 cloud vendors allowed it on 2026-10-26; Anthropic needs its direct-browser header) | Lead, 2026-10-26; recheck in P02 with real keys |
| D-04.2 | Reminders without a server | Lead, 2026-10-26 (= D-16.5) |
| D-16.1 … D-16.48 | As above | Lead decisions, 2026-10-26. The user may override any of them |
| D-16.49 … D-16.66 | The planner's proposals in `18-phase-wise-build-plan.md` §"Proposed decisions", confirmed as written: onboarding can finish without an AI key (49); a copied day keeps meal kinds (50); keys wrapped with a non-extractable AES-GCM device key (51); backup is a stored ZIP written by our own codec (52); later phases L1 i18n, L2 workouts, L3 AI workouts and Coach workout tools, L4 speech-to-text and direct share links, L5 live-voice spike (53); one CI workflow at the repo root, `.github/workflows/platewise.yml`, filtered to `platewise/**`, the only file outside `platewise/` (54); one English catalogue built from per-area partitions (55); one weight range 20–250 kg / 50–500 lb and body fat 3–60 % in 0.5 steps everywhere (56); Android ranges for optional nutrient goals (57); kcal, protein, carbs and fat are required numbers in a food reply (58); Coach tool limits keep the newest rows (59); the overall AI deadline also covers the repair request and every Coach round (60); reminder defaults 08:00 / 12:00 / 19:00 / 20:00 / 14:00, all off (61); "Scan label" uses the meal request with source label (62); a 13-step wizard (63); body fat rounded to one decimal in Coach output (64); a 1 024-token default answer limit (65); our own privacy and terms pages, other links hidden until supplied (66) | Lead, 2026-10-26 |
