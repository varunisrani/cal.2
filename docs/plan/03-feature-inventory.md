# 03 · Feature inventory (what "same features" means)

Every user-visible feature of the reference that matters for v1, and the later ones, described in our own words and given a tier. Sources: research specs 01–07 (`research/`), the decisions in `16-what-we-change.md` and the reference's store screenshots as the specs cite them. Ids never change: the acceptance map, the traps ledger, task notes and decisions cite them; a later feature takes the next free number in its section.

- **P0**, walking skeleton: without it the product is not usable at all. Target: milestones M2–M3.
- **P1**, core parity: what a daily user of the reference would miss within a day, plus the features the decisions add. Target: v1.0 (M8).
- **P2**, power features: loved by heavy users, not needed to be useful. Target: v1.x.
- **P3**, later phases (L1–L5) or not in v1 by decision (N-ids, D-ids). Target: after v1.0, or not planned.

Tiers are binding: P2 and P3 work waits until after v1.0 unless the user moves it.

Surfaces: **M** = phone browser or installed app, **D** = desktop browser, — = none in v1. Spec: research spec and section (`01 §3.4` = `research/01-profile-goals.md` §3.4), trap ids (`R02.1`) and decision ids (`D-16.17`). A mixed tier ("P0 (…) → P1 (…)") counts as its first tier; only the P0/P1 part is gated by acceptance. Rows marked "Added by Platewise" are not reference features.

## A. Shell and navigation

| # | Feature | Tier | Surfaces | Spec |
|---|---|---|---|---|
| A1 | Bottom tab bar in a fixed order: Home, Progress, Coach, Settings; each tab keeps its scroll and local state when you switch | P0 | M D | 05 §3.1.1 |
| A2 | Hash routes for tabs and nested Settings pages; sheets stack above the tab and Back closes the top sheet first | P0 | M D | 04-architecture §4; 05 §3.1.1 |
| A3 | Progress and Coach can be hidden; Home and Settings never; a hidden tab on screen falls back to Home; the bar is not drawn until the setting is read | P1 | M D | 05 §3.1.1, R05.13; 06 §3.5 |
| A4 | Tapping Settings while inside a Settings page returns to the Settings hub | P1 | M D | 05 §3.1.1 |
| A5 | The tab bar hides while a food analysis overlay is showing | P1 | M D | 05 §3.1.1 |
| A6 | Floating capsule tab bar with a selected pill that slides to the chosen tab | P1 | M D | 05 §3.1.2 |
| A7 | Press and slide across the tab bar to switch tabs, with a tick per tab crossed | P2 | M | 05 §3.1.2 |
| A8 | Appearance: System, Light or Dark; System follows the device live | P1 | M D | 05 §3.1.3; 06 §3.2 |
| A9 | Six solid accent presets of our own (Basil default, Saffron, Lagoon, Beet, Ember, Ink), no gradients. Added by Platewise in place of the reference palette (D-16.1) | P1 | M D | 16 §2.1 D-16.1 |
| A10 | Start-up skeleton until the profile and settings are read, so fallback goals and default switches never flash | P0 | M D | 05 R05.12; 06 R06.22 |
| A11 | "Today" moves to the new day at local midnight and when the app returns to the foreground | P1 | M D | 05 R05.14 |
| A12 | Light haptic ticks where the browser supports vibration | P2 | M | 05 §5 |

## B. Onboarding and profile

| # | Feature | Tier | Surfaces | Spec |
|---|---|---|---|---|
| B1 | Welcome screen with a short tour and Get Started | P0 | M D | 01 §3.4 |
| B2 | Wizard steps: sex, birthday, height and weight with one unit toggle, body fat with an optional goal, activity, goal, target weight and pace with an estimated-days card | P0 | M D | 01 §3.4 |
| B3 | Switching metric and imperial in the wizard keeps the value already entered | P1 | M D | 01 R01.3 |
| B4 | Target weight must be below the current weight to lose and above it to gain (D-16.11) | P1 | M D | 16 D-16.11 |
| B5 | Optional Reminders step using web notifications, replacing the reference's notification and health-store steps (D-16.15) | P1 | M D | 16 D-16.15 |
| B6 | AI access step: provider, model, key, server URL where needed, acceptance of our terms, and Set up later (Proposed D-16.49) | P1 | M D | 01 §3.4; 03 §3.3 |
| B7 | Building the plan: animated progress, the AI plan with a 60 s cap, then the formula plan with a note (D-16.14); Back disabled meanwhile | P1 | M D | 01 §3.4, R01.8; 16 D-16.14 |
| B8 | Plan Ready: calories and macro cards editable with the Settings ranges and kept energy-consistent; warning under 1 200 kcal; methods link (D-16.12) | P1 | M D | 01 §3.4, R01.7; 16 D-16.12 |
| B9 | Finishing onboarding saves the profile and plan, seeds the first weigh-in (and body fat if entered) and turns the weekly tune-up on unless the plan was edited | P0 | M D | 01 §3.4 |
| B10 | Restore from a backup file on Welcome: a complete restored setup opens the app, otherwise the wizard continues over the restored data | P1 | M D | 01 §3.5 (web form); 16 D-16.30 |
| B11 | Unit defaults from the browser locale: en-US, en-LR and my-MM use lb and ft-in, others kg and cm (D-16.10) | P1 | M D | 16 D-16.10 |
| B12 | Personal info in Settings: sex, birthday and age, height, weight (adds a weigh-in), body fat and its goal, activity, goal, pace, goal weight (checked), allergen sensitivities | P1 | M D | 01 §3.9 |
| B13 | Calculation methods page in our words with sources and a not-medical-advice note | P1 | M D | 01 §3.3 |

## C. Goals and formulas

| # | Feature | Tier | Surfaces | Spec |
|---|---|---|---|---|
| C1 | BMR (Mifflin-St Jeor, or Katch-McArdle with body fat), TDEE with six activity multipliers, formula calories and macros with the exact truncation rules | P0 | M D | 01 §3.3 |
| C2 | Effective targets: saved values pinned, missing macros auto-balanced from the remaining energy | P0 | M D | 01 §3.7 |
| C3 | AI plan calculation with strict validation and exact 4/4/9 normalisation; a bad answer never changes targets | P1 | M D | 01 §3.6, R01.2 |
| C4 | Rebuild plan: applies only if the profile did not change meanwhile, clears locks, shows the new target and the reason, then refreshes optional nutrient goals | P1 | M D | 01 §3.6, R01.4 |
| C5 | "Inputs changed" nudge on Rebuild when goal inputs changed since the last rebuild; edits never recompute by themselves | P1 | M D | 01 §3.9, R01.12 |
| C6 | Target editing with a calorie lock and up to two macro locks, rebalancing the free macros, and reset to auto | P1 | M D | 01 §3.7, R01.13 |
| C7 | Maintenance estimate row: deficit, surplus or close to maintenance (±50 kcal) | P1 | M D | 01 §3.3 |
| C8 | Weekly tune-up (Adaptive Goals): AI re-run at most every 7 days on open, single-flight, failures still mark the week, turning off restores the earlier plan, targets read-only while on (D-16.45) | P1 | M D | 01 §3.10; 16 D-16.45 |
| C9 | The evidence sent with a plan request holds only numbers and dates, excludes today and treats missing days as unknown | P1 | M D | 01 §3.8, R01.16 |
| C10 | Optional nutrient goals for 29 nutrients with defaults, ranges, typed custom values and upper-limit hints; the AI refresh keeps values it did not return | P1 | M D | 01 §3.11, R01.10 |
| C11 | Goal-reached dialog when a new latest weigh-in crosses the goal, from every weigh-in path, offering Set a new goal or Dismiss (D-16.13) | P1 | M D | 01 §3.13, R01.11; 16 D-16.13 |
| C12 | Energy unit kcal or kJ for every display and input, stored as kcal; an untouched kJ goal wheel keeps the exact goal; AI prompts get the kJ line | P1 | M D | 01 §3.2; 06 §3.3 |
| C13 | Weight forecast (30/60/90-day weights, days to goal, under-logging hint) used in the Coach context | P1 | M D | 01 §3.12 |

## D. Food logging

| # | Feature | Tier | Surfaces | Spec |
|---|---|---|---|---|
| D1 | Diary entry with energy, macros, 23 optional nutrients and 8 sports extras; unknown stays unknown, never 0 | P0 | M D | 02 §3.1 |
| D2 | Manual entry (name, energy in your unit, protein, carbs, fat, fibre, meal) logged directly | P0 | M D | 02 §3.8 |
| D3 | "+" menu with three default groups (Snap & scan, Describe, Reuse) and nested pages; voice hidden | P0 (manual only) → P1 (all methods) | M D | 02 §3.18 |
| D4 | Photo capture: camera or library, up to 10 photos, a note and the plate-built-in-steps switch; a batch with an unreadable or > 25 MiB file is refused whole | P1 | M D | 02 §3.9, R02.17 |
| D5 | Analysing overlay with Cancel; a failure dialog with Retry and Cancel | P1 | M D | 02 §3.4 |
| D6 | Typed meal description with rotating examples | P1 | M D | 02 §3.11 |
| D7 | Review before logging: photos, name, amount and unit with approximate grams, nutrition, ingredients, micronutrients, meal from the picked date and time (D-16.16), date and time, Log | P1 | M D | 02 §3.5; 16 D-16.16 |
| D8 | The amount field accepts arithmetic (+ − × ÷) with a calculator row | P1 | M D | 02 §3.3, R02.22 |
| D9 | Serving units: grams first when the weight is known, up to 4 named units; an unknown weight is logged as a serving count | P1 | M D | 02 §3.3, R02.1, R02.2 |
| D10 | Nutrition unlock on review: type values at the shown amount; they are stored at the base amount | P1 | M D | 02 §3.5, R02.3 |
| D11 | Fit check (what-if): day totals with the meal added and a short AI suggestion with Retry | P1 | M D | 02 §3.6; 03 §3.11 |
| D12 | Edit a logged entry: amount, nutrition with unlock (D-16.19), meal, time kept unless changed, reprocess with a note, remove photos, save it, delete with confirmation | P1 | M D | 02 §3.7; 16 D-16.19 |
| D13 | Ingredient lines added by camera, photo, barcode, text, manual or a saved meal; a line editor; totals from lines; micronutrients stretched by weight | P1 | M D | 02 §3.15, R02.4 |
| D14 | Split into servings (1–50), hidden for portions that were already split | P1 | M D | 02 §3.15, R02.6 |
| D15 | Combine selected entries into one meal that sums every nutrient they all know (D-16.20) | P1 | M D | 02 §3.15; 16 D-16.20 |
| D16 | Recent (30 days) and Often eaten (90 days, grouped by name and energy) lists with search; tapping opens the review | P1 | M D | 02 §3.16 |
| D17 | Saved meals with their own ids, toggled from the editor and Home rows, swipe or button to remove, reorder (D-16.17) | P1 | M D | 02 §3.16; 16 D-16.17 |
| D18 | Copy a day: whole day, one meal or one entry | P1 | M D | 02 §3.17 |
| D19 | Barcode scanning by camera, plus typing the digits (D-16.18) | P1 | M D | 02 §3.12; 16 D-16.18 |
| D20 | Barcode lookup: Open Food Facts, then the saved label, then FoodData Central with a key; a distinct message for each failure | P1 | M D | 02 §3.12, R02.15 |
| D21 | Saved-label memory: after a miss, Scan label links the next photo analysis to the barcode; later scans reuse it | P1 | M D | 02 §3.12, R02.20 |
| D22 | Product information block (barcode, source, package, Nutri-Score, NOVA, Eco-Score, allergens, may contain, labels, categories, ingredient label) | P1 | M D | 02 §3.13 |
| D23 | Ingredient label shown with allergen emphasis | P1 (paragraph) → P2 (sentence and list split) | M D | 02 §3.13 |
| D24 | Allergen line for the profile's sensitivities: declared, may contain, possible, or unable to assess | P1 | M D | 02 §3.14 |
| D25 | Analysis drafts survive a reload and reopen the review (D-16.46) | P1 | M D | 02 §3.10; 16 D-16.46 |
| D26 | One tap logs exactly one entry | P0 | M D | 02 §3.4, R02.11 |
| D27 | Food logging is paused during a fast, with End fast and log (D-16.35) | P1 | M D | 05 §3.7.5, R05.1; 16 D-16.35 |
| D28 | Stored photos upright, capped at 2 048 px when that saves space, with 320 px thumbnails; HEIC refused when the browser cannot decode it (D-16.21); a photo is deleted only when nothing uses it | P1 | M D | 02 §3.19, R02.8; 16 D-16.21 |
| D29 | Dedicated nutrition-label analysis (per 100 g, scaled to a serving) | P2 | M D | 03 §3.5 |
| D30 | Save meal photos to the device gallery | P3 (no web equivalent; 06 §5; D-16.3) | — | 02 §3.19 |
| D31 | AR portion scale, on-device label OCR, Siri phrases and app-icon quick actions per slot | P3 (D-16.3, D-16.6) | — | 02 §3.9, §3.18 |

## E. AI providers and analysis

| # | Feature | Tier | Surfaces | Spec |
|---|---|---|---|---|
| E1 | 16 bring-your-own-key providers with their wire formats; our curated presets; any model id can be typed where allowed (D-16.25) | P1 | M D | 03 §3.1; 16 D-16.25 |
| E2 | Gemini, OpenAI-compatible and Anthropic adapters with each vendor's request extras | P1 | M D | 03 §3.2 |
| E3 | Vision primary, optional text provider, image standby and text standby; keys per provider; separate server-URL slots | P1 | M D | 03 §3.3–3.4, R03.5 |
| E4 | Retry 429/503/529 at 1, 2 and 4 s on every format; one overall deadline from the timeout setting (default 180 s, 30–600 s); Cancel works at any point (D-16.23) | P1 | M D | 03 §3.9; 16 D-16.23 |
| E5 | The standby also runs when the primary's answer fails validation, on every AI entry point (D-16.22) | P1 | M D | 16 D-16.22, R03.4 |
| E6 | Cut-off answers are detected and re-asked once in a compact form | P1 | M D | 03 §3.8 |
| E7 | Photos prepared upright, at most 1 600 px, JPEG 0.8, never upscaled, before sending | P1 | M D | 03 §3.5, R03.12 |
| E8 | Food answers parsed tolerantly: JSON found inside prose, unknown serving kept unknown, strict unit choices, all-or-nothing ingredient breakdown | P1 | M D | 03 §3.6 |
| E9 | A second request for serving units only for zero-energy foods with a known weight | P1 | M D | 03 §3.7, R03.17 |
| E10 | Every AI failure shown as one friendly message per kind, never the provider's text | P1 | M D | 03 §3.10, R03.18 |
| E11 | Notes for the AI sent in the system message of every request (D-16.24) | P1 | M D | 16 D-16.24 |
| E12 | Answer length limit for every provider (default 1 024 tokens) and OpenRouter reasoning effort | P1 | M D | 03 §3.3, R03.9; 16 D-16.25 |
| E13 | Server URLs: HTTPS anywhere, HTTP only for loopback (D-16.26); trailing slashes trimmed; free-form models for OpenRouter, Hugging Face, Ollama and Custom; Custom key optional | P1 | M D | 03 §3.13, R03.3, R03.20–R03.22; 16 D-16.26 |
| E14 | Keys kept in a separate local store, trimmed, shown masked, never exported or backed up, with a plain warning about browser storage (D-16.7) | P1 | M D | 03 §3.12; 16 D-16.7 |
| E15 | Versioned preset upgrade when a vendor retires a model | P2 | M D | 03 R03.28 |
| E16 | Request-size estimate and a "too many or too large photos" message | P2 | M D | 03 R03.29 |
| E17 | On-device models (Apple Intelligence, Gemma) | P3 (D-16.6) | — | 03 §3.14 |

## F. Home and day view

| # | Feature | Tier | Surfaces | Spec |
|---|---|---|---|---|
| F1 | Week bar of 53 weeks starting on the chosen weekday; future days shown but not selectable (D-16.36) | P1 | M D | 05 §3.2.1; 16 D-16.36 |
| F2 | Swipe the day summary to change day, never past today | P1 | M | 05 §3.2.1 |
| F3 | Energy gauge with the eaten amount and left, over, goal reached or no goal in the display unit | P0 | M D | 05 §3.2.2 |
| F4 | Nutrient pillars: macros by default, then 1–4 chosen nutrients plus water | P0 (macros) → P1 (chosen nutrients and water) | M D | 05 §3.2.3 |
| F5 | Pillar picker: 1–4 nutrients, a fifth replaces the most recent pick, reset to default | P1 | M D | 05 §3.2.3 |
| F6 | All-nutrients sheet for the selected day | P1 | M D | 05 §3.2.4 |
| F7 | Diary grouped by meal with food-only section totals; sort by meal or newest first | P0 (by meal) → P1 (newest first) | M D | 05 §3.3.1, R05.4 |
| F8 | Water and fast rows in the diary; a fast shows on the day it ends; the active fast only on today with a live timer | P1 | M D | 05 §3.3, R05.21 |
| F9 | Swipe to delete diary rows, always with a confirmation | P1 | M D | 05 §3.3.4 |
| F10 | Empty-day message | P0 | M D | 05 §3.3.5 |
| F11 | "+" button opening food methods, Water and fasting entries | P0 (food) → P1 (water and fasting) | M D | 05 §3.4 |
| F12 | Long-press multi-select with a combine bar | P1 | M D | 02 §3.15; 05 §3.4 |
| F13 | Gauge and pillars fill from zero on launch and real returns to the app | P2 | M D | 05 §3.2.2, R05.18 |
| F14 | Sugar on Home against the sugar limit | P1 (P16, D-16.98) | M D | 16 D-16.98 |

## G. Progress, weight and body fat

| # | Feature | Tier | Surfaces | Spec |
|---|---|---|---|---|
| G1 | Ranges 1W, 1M, 3M, 6M, 1Y and All with period arrows and labels | P1 | M D | 05 §3.5.2 |
| G2 | Metric switch between Weight and Body Fat; Body Fat appears when there is data or a goal | P1 | M D | 05 §3.5.2 |
| G3 | Weight card: current, goal, net change and average badges; smooth chart with a goal line and press-to-inspect | P1 | M D | 05 §3.5.3 |
| G4 | Log weight: kg or lb toggle for the whole app, 20–250 kg or 50–500 lb, any past day (D-16.37) | P1 | M D | 05 §3.5.3; 16 D-16.37 |
| G5 | Body-fat card and Log body fat (3–60 % in 0.5 steps) | P1 | M D | 05 §3.5.4 |
| G6 | Weight and body-fat histories, newest first, delete with confirmation (D-16.38) | P1 | M D | 05 §3.5.5; 16 D-16.38 |
| G7 | The profile's weight and body fat follow the latest reading | P1 | M D | 05 R05.8 |
| G8 | Weekly recap of the last completed week against the one before, with highlights; workout and burn tiles left out (D-16.44) | P1 | M D | 05 §3.5.6; 16 D-16.44 |
| G9 | Count-today switch for the nutrition charts | P1 | M D | 05 §3.5.7 |
| G10 | Calorie history bars with a goal line and inspector; the whole range always fits | P1 | M D | 05 §3.5.7, R05.15 |
| G11 | Macro and nutrient averages per logged day | P1 | M D | 05 §3.5.7, R05.17 |

## H. Water and fasting

| # | Feature | Tier | Surfaces | Spec |
|---|---|---|---|---|
| H1 | Water tracking switch (off by default), daily goal, ml or fl oz | P1 | M D | 05 §3.6.1 |
| H2 | Three quick-add amounts (1–5 000 ml) that keep exact values through unit changes | P1 | M D | 05 §3.6.2, R05.10 |
| H3 | Log water by quick amount or a custom amount up to 5 000 ml on the selected day (D-16.39) | P1 | M D | 05 §3.6.3; 16 D-16.39 |
| H4 | Water pillar and water section in the all-nutrients sheet | P1 | M D | 05 §3.6.3 |
| H5 | Water reminder with a time picker, default 14:00 (D-16.40) | P1 | M D | 05 §3.6.4; 16 D-16.40 |
| H6 | Fasting tracking switch (off by default) and a default goal of 1–168 hours | P1 | M D | 05 §3.7.1 |
| H7 | Start, end and cancel a fast from the + menu | P1 | M D | 05 §3.7.2 |
| H8 | Fast editor: start, end and goal; End fast now; Cancel; Delete | P1 | M D | 05 §3.7.4 |
| H9 | One active fast, no overlaps, an end never before the start; refused edits explain why | P1 | M D | 05 §3.7.3, R05.3 |
| H10 | Turning fasting off ends the active fast; a restored active fast with tracking off is ended | P1 | M D | 05 §3.7.2, R05.2 |
| H11 | Fasting goal-reached alert | P1 | M D | 05 §3.7.6, R05.20 |

## I. Coach

| # | Feature | Tier | Surfaces | Spec |
|---|---|---|---|---|
| I1 | Coach tab: empty state with four goal-aware prompts, message list, typing indicator, inline error | P1 | M D | 04 §3.1 |
| I2 | Composer: growing text field, one photo per message, Enter sends on desktop | P1 | M D | 04 §3.2 |
| I3 | Goal-aware prompt chips; a chip sends with the attached photo (D-16.33) | P1 | M D | 04 §3.3; 16 D-16.33 |
| I4 | Replies rendered as simple Markdown with safe links; copy button | P1 | M D | 04 §3.4 |
| I5 | Delete chat (was Reset) with confirmation; a reply arriving after its chat was deleted is dropped (D-16.34, D-16.99) | P1 | M D | 04 §3.5, R04.6; 16 D-16.34 |
| I6 | Fresh context each turn: profile, formulas, forecast, data counts, today's intake, calories left and water (D-16.27); replies in the language you write (D-16.28) | P1 | M D | 04 §3.8; 16 D-16.27, D-16.28 |
| I7 | Six read-only nutrition tools; an unlogged day is never a fast or zero | P1 | M D | 04 §3.9, R04.16 |
| I8 | Tool loop of up to six rounds on all three formats, with the answer cap and cut-off detection | P1 | M D | 04 §3.11, R04.15, R04.19 |
| I9 | Tool results capped at 60 000 characters on every provider, keeping the newest rows (D-16.32) | P1 | M D | 04 §3.10; 16 D-16.32 |
| I10 | Conversations kept locally: newest 200 messages per chat, small thumbnails, included in backups (D-16.29, D-16.99) | P1 | M D | 04 §3.7; 16 D-16.29 |
| I11 | Friendly errors with Details and Retry on the failed turn (D-16.31) | P1 | M D | 04 §3.6; 16 D-16.31 |
| I12 | The standby provider re-runs the whole turn when the primary fails | P1 | M D | 04 §3.12, R04.1 |
| I13 | Streaming replies | P3 (D-16.47) | — | 04 Q6 |
| I14 | Several Coach chats: New chat and chat history | P1 (P16, D-16.99) | M D | 16 D-16.99 |

## J. Settings and configuration

| # | Feature | Tier | Surfaces | Spec |
|---|---|---|---|---|
| J1 | Settings hub with categories in a fixed order, back link, pages that wait for stored values | P0 (hub) → P1 (all categories) | M D | 06 §3.1 |
| J2 | App settings: appearance, accent, grams first, week starts on | P1 | M D | 06 §3.2 |
| J3 | Height, weight and energy units as separate settings | P1 | M D | 01 §3.9; 06 §3.3 |
| J4 | Meal times editor: 15-minute steps, at least 15 minutes apart, restore defaults | P1 | M D | 06 §3.4.1 |
| J5 | Add-menu editor: up to 3 groups, rename, reorder, hide and restore methods, reset | P1 | M D | 06 §3.6 |
| J6 | Product information settings: block on or off and 11 field switches | P1 | M D | 06 §3.8 |
| J7 | Tab bar settings page | P1 | M D | 06 §3.5 |
| J8 | AI providers page: primary, text provider, image and text standbys, timeout, answer limit, reasoning effort, notes for the AI, key warning | P1 | M D | 03 §3.3 |
| J9 | FoodData Central key setting | P1 | M D | 02 §3.12; 06 §3.19 |
| J10 | Tracking & reminders page: meal times, water and fasting settings, notifications | P1 | M D | 06 §3.4 |
| J11 | Reminders: the master switch turns on only after permission; breakfast, lunch, dinner, daily summary, water and fasting goal; all off by default; shown while open or on the next open (D-16.5, D-16.41) | P1 | M D | 06 §3.9–3.12; 16 D-16.5, D-16.41 |
| J12 | Quick-action slot settings | P3 (static manifest shortcuts instead, L8) | — | 06 §3.7 |
| J13 | What's New dialog | P3 (D-16.43) | — | 06 §3.21 |

## K. Data management, backup and privacy

| # | Feature | Tier | Surfaces | Spec |
|---|---|---|---|---|
| K1 | Export the diary as JSON, Markdown or CSV for today, this week (by the week-start setting), this month, all time or a custom range; energy always kcal | P1 | M D | 06 §3.13, R06.14, R06.17 |
| K2 | Import our own diary JSON: whole-file validation, preview, replace a date range keeping photos, or add as new (D-16.2) | P1 | M D | 06 §3.14, R06.16; 16 D-16.2 |
| K3 | Back up to a file: settings, diary, photos, saved meals, weights, body fat, water, fasts and the Coach chat; never keys (D-16.30) | P1 | M D | 06 §3.17; 16 D-16.30 |
| K4 | Restore from a file: full validation, newer formats refused, space check, preview and confirmation, all or nothing (D-16.42) | P1 | M D | 06 §3.17, R06.6, R06.8; 16 D-16.42 |
| K5 | Clear the diary | P1 | M D | 06 §3.15 |
| K6 | Erase everything and return to onboarding | P1 | M D | 06 §3.15, R06.5 |
| K7 | Storage card: photo and cache sizes, total use, persistence status, Clear cache | P1 | M D | 06 §3.16; 16 D-16.8 |
| K8 | Compress existing photos | P2 | M D | 06 §3.16, R06.24 |
| K9 | Unreadable stored data is kept aside, never overwritten, and a banner says so | P1 | M D | 06 §3.18, R06.1; 01 R01.17 |
| K10 | Import the reference's diary exports or backups | P3 (D-16.2) | — | 06 Q1 |

## L. Platform

| # | Feature | Tier | Surfaces | Spec |
|---|---|---|---|---|
| L1 | Installable app: manifest, our icons, install prompt or instructions | P1 | M D | 06 §5 |
| L2 | Works offline except AI and food-database lookups | P1 | M D | 04-architecture §1 |
| L3 | Update-ready banner and Settings dot; the app reloads only when asked | P1 | M D | 05 §3.1.1; 06 §5 |
| L4 | Persistent storage requested after the first logged entry, with its status and a backup nudge (D-16.8) | P1 | M D | 16 D-16.8, R06.19 |
| L5 | Notifications through the browser when permitted, otherwise in-app banners (D-16.5) | P1 | M D | 16 D-16.5 |
| L6 | Privacy: no analytics, no third-party scripts or fonts, strict CSP; only the chosen AI provider and the food databases are contacted | P1 | M D | 04-architecture §6 |
| L7 | Every open tab sees every saved change | P1 | D | 06 R06.3 |
| L8 | Static home-screen shortcuts for Camera, Describe and Scan | P2 | M | 06 §3.7, §5 |
| L9 | Accessible names on every control; gauge, pillars and charts expose values as text; contrast checked in both themes | P1 | M D | 04-architecture §6 |
| L10 | Initial JavaScript at most 250 KB gzip; barcode decoder and charts load on demand | P1 | M D | 04-architecture §6 |

## M. Later-phase features (not v1)

| # | Feature | Tier | Surfaces | Spec |
|---|---|---|---|---|
| M1 | Workouts: diary and planner, exercise library from the upstream open dataset, sets/reps/RPE, timers, burn estimate, routines, own exercises | P3 (N-1; L2) | M D | 07 §3.1 |
| M2 | Rest timer with best-effort alerts | P3 (N-1; L2) | M D | 07 §3.1 |
| M3 | AI text workouts and AI fill for own exercises | P3 (N-1; L3) | M D | 07 §3.1 |
| M4 | Coach workout tools, exercise proposals and the training chip | P3 (N-1; L3) | M D | 04 §3.14; 07 §3.1 |
| M5 | Speech-to-text for food logging and Coach input | P3 (N-2; L4) | M D | 07 §3.2 |
| M6 | Direct meal-share links and an import route | P3 (L4) | M D | 07 §3.6 |
| M7 | Live voice assistant | P3 (N-2; L5 spike) | M | 07 §3.3 |
| M8 | More UI languages, RTL and an in-app language picker | P3 (N-3; L1) | M D | 06 §3.22; 07 §3.7 |
| M9 | Body measurements | P3 (N-7) | M D | 05 §3.8 |
| M10 | Amino-acid estimates | P3 (N-7) | M D | 02 §3.1 |
| M11 | Health-store sync, steps, burn line and the measured-energy anchor | P1 on Android (P11, D-16.89); the measured-energy anchor stays P3 | M | 01 §3.10; 05 §3.2.2; 07 §3.7 |
| M12 | Short share links, weekly challenge, hosted AI plans, community bot | P3 (N-8) | — | 07 §3.4–3.7 |
| M13 | Widgets, watch app, Siri and share extension | P3 (D-16.3) | — | 07 §3.7 |
| M14 | On-device speech model | P3 (optional with L4) | M D | 07 §3.7 |
| M15 | Workout illustrations of our own | P3 | M D | 07 §3.1a |
| M16 | Cloud backup (Google Drive) and the welcome-back cloud restore | P1 on Android (P15, D-16.97) | M D | 06 §3.17; 01 §3.5 |
| M17 | Passphrase lock for API keys | P3 (N-6) | M D | 03 Q7; 06 Q4 |
| M18 | Walk recorder and walk score: a live walk (route, steps, pace), its score and the week's moderate minutes | P1 on Android (P15, D-16.96) | M | ours (the reference logs a walk by hand, N-1) |

## Counting it up

| Tier | Features |
|---|---|
| Tier P0 | 18 |
| Tier P1 | 139 |
| Tier P2 | 8 |
| Tier P3 | 22 |
| All tiers | 187 |

Mixed rows count once under their first tier (D3, F4, F7, F11 and J1 under P0; D23 and M11 under P1; M11, M16 and M18 are P1 in the Android app only). The roadmap (`15-roadmap.md`) turns these tiers into milestones; the acceptance map (`../internals/acceptance-map.md`) maps every P0/P1 row to tests.
