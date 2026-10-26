# Research: behavioural specs of the reference

Seven area specs, written by research sub-agents in their own words from the reference at
`apoorvdarshan/fud-ai@10e14b67` (MIT), read outside this repo. They describe behaviour, not code:
inputs, outputs, states, limits, failure modes and numbered traps. The plan docs, phase files
and ledgers are built from them.

| # | Spec | Covers | Lines | Traps |
|---|---|---|---|---|
| 01 | [Profile, onboarding, goals](01-profile-goals.md) | profile fields, onboarding wizard, BMR/TDEE, AI-built plan and its validation, Adaptive Goals, nutrient goals, forecast, units | 789 | R01.x |
| 02 | [Food logging](02-food-logging.md) | entry model and nutrients, meal times, servings and scaling, review/unlock, What-if, edit, manual, photos, text, barcode, ingredients, saved meals, images | 939 | R02.1–R02.25 |
| 03 | [AI providers](03-ai-providers.md) | 16 BYOK providers, roles and fallback, prompts by intent, response contract and parsers, retries, errors, keys, browser CORS table | 842 | R03.x |
| 04 | [Coach](04-coach.md) | chat UI, memory, per-turn context, 14 retrieval tools, tool loop per wire format, fasting rule | 712 | R04.x |
| 05 | [Home and Progress](05-home-progress.md) | tab shell, Home ring and pillars, week strip, Progress charts and recap, weight, body fat, water, fasting | 890 | R05.x |
| 06 | [Settings and data](06-settings-data.md) | settings hub, units, meal times, configuration screens, reminders, export/import, backup/restore, persistence guards, About | 754 | R06.x |
| 07 | [Later phases and the web side](07-later-phases-and-web.md) | workouts, voice, challenge, hosted AI, meal shares, i18n; the reference's worker routes verified against the live site with REA | 854 | R07.x |

## How they were made and checked

- Each researcher read the Android source first, cross-checked iOS and the reference's tests, and
  looked at the store screenshots. Claims are marked `[obs]`, `[inf]` or `[unk]`.
- REA (`rea-agents@6.8.0`, CLI) supplied the shipped-web Evidence: a static analysis of the worker
  code (`ev_9c2ecdc5…`) and 14 live-site captures (`ev_fa243a1f…` and those listed in spec 07).
  Evidence stays in `~/rea-lab/`, outside the repo.
- Every spec passed a 9-word overlap check against the whole reference tree. The runs left are
  vendor wire facts (URLs, headers, model ids) and labelled identifier lists in §2. Prose matches
  were rewritten, eight of them by the lead.
- Open questions from §7 of each spec are settled in `../16-what-we-change.md` (D-16.10–D-16.48).
