# 07 — Later-phase features survey and the web side: behavioural specification (clean-room)

Scope: a planning-grade survey of every reference feature that is **not** in Platewise v1 (workouts,
speech-to-text, live voice, weekly challenge, hosted AI, meal-share links, and the "others": community
bot, widgets and watch, health-store sync, on-device models, i18n, marketing site), plus what the
reference's web worker and site actually ship (Part B), and a recommended phase order (Part C, §5.2).
Out of scope: everything in v1 (food logging, BYOK AI providers, Coach, goals, Progress, weight, water,
fasting, backup) — covered by the other area specs (`01`–`06`). Where a later feature touches a v1 area
(Coach tools, Home summary, backup), the touch point is named here and the details stay in that spec.

Reference: `apoorvdarshan/fud-ai` @ `10e14b67116c52b515d2389621266e32b3a99840`; shipped build checked:
the live marketing site and worker APIs (captured 2026-10-26 with REA `capture-browser-scenario` in
connect mode), plus REA `analyze-javascript-application` over a copy of `web/`.
Sources studied: Android (A) workouts, speech, voice, challenge, hosted, ondevice, health, share and
widget code; iOS (I) equivalents by size and spot checks; `shared/voice-assistant/*`,
`shared/workout-vectors/README.md`, `local-models/*`, `services/*/README.md`, `web/*` (worker, APIs,
pages, migrations, tests by name), `docs/HOSTED_AI_REVENUECAT.md`, `ASSET_CREDITS.md`,
`THIRD_PARTY_NOTICES.md`, the bundled Free Exercise DB `README.md`/`LICENSE.md`/`exercises.json`.

Conventions: "the worker" = the reference's single edge worker that serves the marketing site and all
server APIs. "Share" = a meal-share link. "Burn" = estimated workout energy. "Hosted" = the paid,
reference-operated AI proxy (as opposed to BYOK). Sizes: reference line counts (Android / iOS / web) and a
Platewise estimate in T-shirt sizes — **S** ≤ 1 builder-week, **M** 1–3, **L** 3–6, **XL** > 6.
"MUST" marks an invariant the reference defends (defensive code or a test shows a past bug).

---

## 1. Overview

The reference is a local-first native tracker. Almost every later-phase feature is client-side; four
of them need a server, and the reference runs all four inside one edge worker:

```
 phone app (iOS / Android)                         edge worker (one deployment)          third parties
 ──────────────────────────                        ─────────────────────────────         ─────────────
 Workouts  ── burn ──► health store ─► Home        static site + 404 + app-link files
 STT (8 providers) ────────────────────────────────────────────────────────────────────► STT vendors (BYOK)
 Live Voice (6 providers) ── BYOK WebSocket ────────────────────────────────────────────► realtime vendors
            └─ hosted ── WebSocket relay ────────► hosted live relay ──────────────────► Gemini Live
 Hosted AI (Plus/Pro) ── HTTPS ──────────────────► hosted generate/gemini/transcribe ───► Gemini, Deepgram
                                                     └─ entitlement check ─────────────► RevenueCat
                                                     └─ usage ledger (SQL DB)
 Weekly Challenge ── HTTPS, bearer token ────────► challenge API (same SQL DB)
 Meal share ── short link ───────────────────────► share create / preview (KV, 7 days)
           └─ direct link ──► static add-meal page (no server state)
                                                    Discord bot + GitHub webhook (KV)   ─► Discord, GitHub
                                                    hourly cron: cleanup, star history, store announcements
 Workout illustrations ── per-frame HTTPS ──────► object-storage CDN (not via the worker)
```

What the user sees, feature by feature, is in §3 Part A. The worker's route inventory, storage and
crons are in §3 Part B, with what the live site actually served. For Platewise (an installable PWA with
BYOK calls from the browser and no backend in v1), the decisive split is:

- **Client-only, PWA-feasible:** workouts (minus health sync and background rest alerts), BYOK
  speech-to-text (subject to vendor CORS), direct meal-share links, i18n, a web-side version of widgets
  (manifest shortcuts, badging only).
- **Client-only but browser-hard:** BYOK live voice (WebSocket auth headers are not settable from a
  browser), on-device Whisper (feasible via WASM/WebGPU), on-device Gemma (2.59 GB, not practical).
- **Needs a backend Platewise does not have:** short meal-share links, weekly challenge, hosted AI
  (plus web billing and an identity scheme), the community bot.
- **No web equivalent:** Apple Health / Health Connect, home-screen widgets, watch app, OS voice
  shortcuts and control-centre tiles.

## 2. Reference names (rename in rebuild)

| Kind | Names (reference only; they become banned identifiers) |
|---|---|
| Binary / CLI and flags | worker name `fud-ai`; Wrangler flags `-PworkoutVectors=sample\|all\|none`, `WORKOUT_VECTORS=…`, launch arg `-WorkoutVectorsBaseURL`; scripts `publish_workout_vectors.py`, `sync_workout_visual_assets.py`, `check_voice_assistant_tools.py`, `hosted_ai_smoke.sh`, `register-ask.mjs`/`register-bug.mjs`/`register-feature.mjs` |
| Env vars / worker secrets and vars | `REVENUECAT_API_KEY`, `GEMINI_API_KEY`, `DEEPGRAM_API_KEY`, `HOSTED_AI_LIVE_MODEL`, `DISCORD_GEMINI_API_KEY`, `GITHUB_TOKEN`, `DISCORD_BOT_TOKEN`, `DISCORD_PUBLIC_KEY`, `DISCORD_APPLICATION_ID`, `DISCORD_GITHUB_WEBHOOK_SECRET`, `PLAY_SERVICE_ACCOUNT_JSON`, `ASC_KEY_ID`/`ASC_ISSUER_ID`/`ASC_PRIVATE_KEY`, legacy `FUD_HOSTED_AI_APP_SECRET`; Android `BuildConfig.WORKOUT_VECTORS_BASE_URL`, `BuildConfig.REVENUECAT_API_KEY` |
| Storage bindings | KV `MEAL_SHARES`, `DISCORD_STATE` (namespace `FUDDY_DISCORD_STATE`), `STAR_HISTORY`; D1 `CHALLENGE_DB` (database `fud-ai-challenge`); rate limiters `CHALLENGE_API_RATE_LIMITER`, `CHALLENGE_CREATE_RATE_LIMITER`, `MEAL_SHARE_CREATE_RATE_LIMITER`, `MEAL_SHARE_READ_RATE_LIMITER`, `HOSTED_AI_USER_RATE_LIMITER`, `HOSTED_AI_ADDRESS_RATE_LIMITER`; assets binding `ASSETS`; R2 bucket `fud-ai-assets` |
| SQL tables | `challenge_participants`, `challenge_weekly_scores`, `challenge_reports`, `hosted_ai_ledger`, `hosted_ai_refunds`, `hosted_ai_voice_spends` |
| Files and folders | `web/`, `shared/voice-assistant/tools.json`, `shared/workout-vectors/`, `exercise-visual-manifest.json`, `sample-pack.txt`, `local-models/catalog.v1.json`, `services/discord-bot/`, `services/hosted-ai/`, `workers/NNN/result.json`; app files `voice_assistant_tools.json`, `VoiceAssistantTools.json`, `ExerciseVisualManifest` |
| Hosts / URL schemes | `fud-ai.app`, `www.fud-ai.app` (canonical), `assets.fud-ai.app` (frame CDN), custom scheme `fudai://add-meal?d=…`, store ids `id6758935726`, package `com.apoorvdarshan.calorietracker`, team `23RV7FYH36` |
| HTTP routes (IDs used in §3 Part B) | **W01** static pages `/`, `/privacy`, `/terms`, `/free-ai-calorie-tracker`, `/open-source-calorie-tracker`, `/ai-food-scanner`, `/vs-cal-ai`, `/add-meal`, `/404`; **W02** Android file `/.well-known/assetlinks.json` and its iOS counterpart `/.well-known/apple-app-site-association`; **W03** `POST /api/meal-shares`; **W04** `GET\|HEAD /m/:id`; **W05** `POST /api/challenge/v1/profile`; **W06** `PATCH /api/challenge/v1/profile`; **W07** `DELETE /api/challenge/v1/profile`; **W08** `PUT /api/challenge/v1/weekly-score`; **W09** `GET /api/challenge/v1/leaderboard`; **W10** `POST /api/challenge/v1/reports`; **W11** `OPTIONS /api/challenge/v1/*`; **W12** `POST /api/hosted-ai/v1/generate`; **W13** `POST /api/hosted-ai/v1/gemini`; **W14** `POST /api/hosted-ai/v1/transcribe`; **W15** `GET /api/hosted-ai/v1/quota[?refresh=1]`; **W16** `GET(WebSocket) /api/hosted-ai/v1/live`; **W17** `POST /api/discord/interactions`; **W18** `POST /api/discord/github-issues`; **W19** `GET /star-history.json`; **W20** `GET /star-history.svg?theme=light\|dark` |
| Headers and wire keys (reference-owned) | `X-Fud-User-Id`, `X-Fud-Platform`, `X-Fud-Quota-Plan`, `X-Fud-Quota-Day`, `X-Fud-Quota-Daily-Used`, `X-Fud-Quota-Daily-Limit`, `X-Fud-Quota-Credits`, relay message key `fudVoice` (`secondsRemaining`, `error`), close codes 4402 / 4408; share UA `FudAI/1.0 (Android\|iOS; MealShare)`; resumption purpose string `fud-ai/hosted-voice/resumption/v1` |
| Settings and storage keys | `mealShareLinkStyle` (`short`/`direct`), `aiAccessMode` (`byok`/`hosted`), workout state `WorkoutPersistedState` v1 fields (`dayPlans`, `completedSessions`, `savedExerciseIds`, `healthDeletionTombstones`, `pendingHealthDeleteIds`, `pendingHealthUpsertIds`, `routines`), user exercise id prefix `user_exercise_`, photo names `exercise_<uuid>.jpg`, custom activity ids `custom_activity_<id>`; frame names `<exerciseId>_<male\|female>_v2_<n>` |
| Store / billing ids | entitlements `plus`, `pro`; offerings `plus`, `pro`; App Store `…calorietracker.plus.monthly\|yearly`, `…pro.monthly\|yearly`, `…credits.50\|150\|400`, `…tip.snack\|proteinshake\|lunch\|feast`; Play `plus:monthly`, `pro:yearly`, `credits_50/150/400`, `tip_*` |
| Other (classes, tool names, commands) | Discord commands `/ask`, `/bug`, `/feature`; bot persona "Fuddy"; voice tool names in `tools.json` (25, e.g. `get_app_state`, `log_food`, `describe_workout`, `end_conversation`); Coach workout tools `get_workout_history`, `get_workout_plans`, `get_workout_preferences`, `get_exercise_lift_history`, `search_exercise_library`, `propose_add_exercise_to_day`, `propose_custom_exercise`; orb view `LiveOrbView` |

Third-party protocol names used by this area (keep exact; check against vendor docs before building):

- **STT REST:** OpenAI `https://api.openai.com/v1/audio/transcriptions` (multipart `model`, `file`,
  optional `language`; `Authorization: Bearer`), model `gpt-transcribe`; Groq
  `https://api.groq.com/openai/v1/audio/transcriptions`, `whisper-large-v3`; Mistral
  `https://api.mistral.ai/v1/audio/transcriptions`, `voxtral-mini-2602`; Deepgram
  `https://api.deepgram.com/v1/listen?model=nova-3&punctuate=true&smart_format=true[&language=xx]`
  (raw audio body, `Authorization: Token <key>`, transcript at `results.channels[0].alternatives[0].transcript`);
  AssemblyAI `https://api.assemblyai.com/v2/upload` → `POST /v2/transcript` (`audio_url`,
  `speech_models: ["universal-3-pro","universal-2"]`, `language_code` or `language_detection: true`,
  header `authorization: <key>`) → poll `GET /v2/transcript/{id}` until `status` is `completed`/`error`;
  Gemini resumable upload `https://generativelanguage.googleapis.com/upload/v1beta/files`
  (`X-Goog-Upload-Protocol: resumable`, `X-Goog-Upload-Command: start` then `upload, finalize`,
  `X-Goog-Upload-URL` response header), then `POST https://generativelanguage.googleapis.com/v1beta/interactions`
  (model `gemini-3.5-transcribe`, input audio by file `uri`, `generation_config.transcription_config`
  with `language_codes` and `mode.type: "smart"`; text from `output_text`, `outputs[].text` or
  `steps[].content[].text`), then `DELETE /v1beta/{file name}`; key header `x-goog-api-key`.
- **Realtime voice:** Gemini Live
  `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent`
  (default model `gemini-3.8-live`, alternative `gemini-3.1-flash-live-preview`; messages `setup`, `setupComplete`,
  `realtimeInput`, `clientContent`, `toolCall.functionCalls`, `toolResponse.functionResponses`,
  `toolCallCancellation.ids`, `sessionResumption`, `contextWindowCompression`); OpenAI Realtime
  `wss://api.openai.com/v1/realtime` (default `gpt-realtime-2.1-mini`, larger `gpt-realtime-2.1`; `session.update`,
  `response.function_call_arguments.done`, `conversation.item.create` with `function_call_output`,
  `response.create`, `conversation.item.truncate`); xAI `wss://api.x.ai/v1/realtime`
  (`grok-voice-latest`, `grok-voice-3.0`); Qwen Omni `wss://dashscope-intl.aliyuncs.com/api-ws/v1/realtime`
  (`qwen3.8-omni-flash-realtime`, transcription `qwen3-asr-flash-realtime`,
  `input_image_buffer.append`); OpenAI GPT-Live `wss://api.openai.com/v1/live/sessions` (`gpt-live-1`,
  `session.start`/`session.started`, `session.input_audio.append`, `session.output_audio.delta`,
  `session.input_transcript.delta`, `session.output_transcript.delta`, `response.event`,
  `response.item.create`; Responses delegation model `gpt-6-luna`).
- **Hosted upstreams:** `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent`;
  Deepgram `/v1/listen`; RevenueCat `GET https://api.revenuecat.com/v1/subscribers/{app_user_id}`
  (entitlements, `non_subscriptions`); anonymous id format `$RCAnonymousID:` + 32 lowercase hex.
- **Community:** Discord interactions (Ed25519 over `X-Signature-Ed25519`/`X-Signature-Timestamp`,
  PING → type 1), `https://discord.com/api/v10/channels/{id}/messages`; GitHub webhooks
  (`x-hub-signature-256: sha256=<hex>` HMAC, `x-github-event: issues`, `action: closed`,
  `state_reason`), GitHub REST `api.github.com/repos/{owner}/{repo}` (`X-GitHub-Api-Version`).
- **Data / models:** Free Exercise DB (`yuhonas/free-exercise-db`, Unlicense; record fields `id`,
  `name`, `force`, `level`, `mechanic`, `equipment`, `primaryMuscles`, `secondaryMuscles`,
  `instructions`, `category`, `images`; image paths are relative to the upstream repository's
  `exercises/` folder and can be fetched from GitHub's raw-file host); 2024 Adult
  Compendium of Physical Activities (`pacompendium.com`) METs; Gemma 4 E2B LiteRT-LM
  `litert-community/gemma-4-E2B-it-litert-lm` rev `6b78abd019e61a1ca4cbe3b212d2c9ce8ff38a94`, file
  `gemma-4-E2B-it.litertlm`, 2,588,147,712 bytes, SHA-256
  `181938105e0eefd105961417e8da75903eacda102c4fce9ce90f50b97139a63c`, Apache-2.0; Whisper base
  `ggerganov/whisper.cpp` rev `5359861c739e955e79d9a303bcbc70fb988958b1` `ggml-base.bin`,
  147,951,465 bytes, SHA-256 `60ed5bc3dd14eea856493d334349b405782ddcaf0028d4b5df4088345fba2efe`.
- **Health stores:** Health Connect record types `NutritionRecord`, `WeightRecord`, `BodyFatRecord`,
  `ActiveCaloriesBurnedRecord` (read+write), `TotalCaloriesBurnedRecord`, `StepsRecord`,
  `ExerciseSessionRecord` (read); HealthKit dietary quantity types (energy, macros, fibre, sugar,
  fat subtypes, cholesterol, sodium, potassium, caffeine, calcium, iron, magnesium, zinc, folate,
  vitamins A/C/D/E/K), `bodyMass`, `bodyFatPercentage`, `height`, `activeEnergyBurned`,
  `basalEnergyBurned`, `stepCount`, workouts.

## 3. Behaviour

### Part A — later-phase features

#### 3.1 Workouts (diary, planner, routines, rest timer, sets/reps/RPE, burn, library, user exercises)

- **Trigger / inputs:** a Workouts tab with two modes, **Log** (default for new users) and **Library**;
  the last-used mode is restored [obs]. A date strip selects the diary day. Inputs: exercises picked from
  the library, sets (weight, unit, reps, optional RPE), per-exercise timers for timed/cardio work, quick
  cardio entries, AI text ("describe your workout"), routines, the voice assistant and Coach proposals.
- **Diary / planner model [obs]:** one *day plan* per local date key (`YYYY-MM-DD`); a plan is an
  ordered list of planned exercises; each planned exercise snapshots the library fields (name, level,
  force, mechanic, category, equipment, muscles, instructions, image paths) plus its sets and an
  optional timer. Plans exist for any date (past, today, future → the "planner") [inf: future dates are
  allowed for planning; AI text logging refuses future dates, see below]. Operations: add/toggle an
  exercise for a day, remove, reorder (move by offset, clamped at ends; does not clear the burn), set
  the set count (adds blank sets), update a set, add a blank set, copy a previous day's plan **with** or
  **without** set details (the picker lists earlier dates that have a plan), save/rename/delete/apply
  routines, mark library items as saved, per-exercise lift history (matched by catalogue id only when
  one exists).
- **Sets / reps / RPE [obs]:** reps keep digits only, max 4 characters; weight keeps digits and one
  decimal separator (comma becomes dot), max 7 characters; weight unit per set (kg | lbs; the stored
  default when unknown is **lbs**). Three RPE scales: a strength scale running from 1 to 10, the CR10 scale from 0 to 10, and the Borg
  scale from 6 to 20. Input
  sanitising keeps in-progress text (e.g. "7."), allows one fractional digit except on Borg (integers
  only), clamps values above the maximum to the maximum, and rejects values below the minimum unless
  they can still become valid by typing more digits. Display converts kg↔lbs without mutating the
  stored value. A set counts as performed when it has reps.
- **Exercise timer [obs]:** per planned exercise; actions start, pause, resume, stop (= save),
  restart, discard; it persists a running anchor so time survives restarts and excludes paused time;
  intensity light | moderate | vigorous; timers are independent across exercises and days.
- **Calculated burn [obs]:** a "Burn" action snapshots the day into **one** stable, versioned daily
  session (`WorkoutSession { id, dateKey, startedAt, completedAt, durationSeconds: 0, exercises:
  CompletedExercise[], caloriesBurned: 1…5000, syncVersion }`); recalculating replaces the day's
  previous burn (same id, version + 1) and removes duplicates. Estimation (net active energy, i.e. gross
  MET minus 1 resting MET):
  - Energy (kcal) = minutes × body kg × 3.5 × max(0, MET − 1) ÷ 200; body weight is clamped to
    35–300 kg and defaults to 70 kg.
  - Strength sets: reps capped at 100 per set; active minutes per set = clamp(reps · 2.75 / 60, 0.30,
    1.50); recovery 1.60 min per set minus one (no recovery after the last); transitions 0.75 min per
    exercise with work; total ≥ 4 min. Effort per set = normalised RPE (Strength (v−1)/9, CR10 v/10,
    Borg (v−6)/14, clamped 0–1; missing RPE = 0.60). Relative load = kg / body kg clamped 0–2.
    `MET = clamp(3.8 + 2.4·avgEffort + 0.5·avgRelativeLoad, 3.5, 8.0)`.
  - Timed exercises (saved timer or cardio category): MET from a per-activity triple
    (light/moderate/vigorous), e.g. walking 2.8/3.8/4.8, running 6.5/8.5/10.5, rope jumping
    8.3/11.8/12.3, rowing 5.0/7.3/11.0, cycling 4.3/7.0/9.0, stationary bike 3.5/6.0/10.8, stair
    machine 4.5/6.8/9.3, elliptical 5.0/5.0/9.0, skating 7.5/9.8/12.3, trail run/walk 3.8/6.0/9.3, other
    cardio 3.5/5.0/7.5; non-cardio stretching 2.3 flat, plyometrics 3.5/5.0/7.5, other 3.5/5.0/6.0.
    Intensity comes from the average normalised RPE of the exercise's sets when any (< 0.4 light,
    ≥ 0.75 vigorous, else moderate), otherwise the timer's chosen intensity. A timed exercise's reps
    still count as statistics but never add strength calories (no double count).
  - Total = strength + timed, rounded, clamped 1–5000. No sets with reps and no timed work → no burn.
- **Where the burn goes [obs]:** written to the health store as active calories (with tombstones and
  pending-upsert/delete queues so deletions are never resurrected by a stale read), read by the weekly
  challenge and Coach. Home's "burned" figure comes from the **health store** (measured total energy,
  else BMR + external active energy), not directly from the diary [obs]. The daily calorie goal is not
  increased by burn [inf: no "eat back" setting found].
- **Routines [obs]:** `Routine { id, name ≤ 60 chars (trimmed, whitespace collapsed), exercises,
  createdAt }`. Saving a routine from a day keeps planned loads and reps but drops RPE, timers and
  identities; cardio entries keep one blank set. Applying to a day: exercises already on the day are
  matched by catalogue id in order (repeats match in order); a matched entry receives the routine's
  sets **only if** it has no logged values and no started timer; unmatched routine entries are
  appended as fresh copies. Logged sets are never overwritten.
- **Rest timer [obs]:** either off or a duration between 30 s and 5 min (default 1.5 min); the picker
  offers off, 30 s, 45 s, 1 min, 1.5 min, 2 min, 2.5 min, 3 min, 4 min and 5 min; a stored value outside
  the range is clamped. Rest begins only on **today's** diary, in two cases: the reps field of a set
  is filled for the first time, or the user raises the set count with the stepper, which counts as
  completing the last set if it already has reps. A given set triggers rest once at most. Countdown rounds up to whole seconds; "+15 s" extends a
  running rest or restarts a finished one from now; skip cancels. The running rest survives process
  restart. Alerting: in foreground, a haptic/in-app alert only if the rest finished < 3 s ago; in
  background, a scheduled OS notification; a rest that ran out while the phone slept ends on return
  without a haptic; a clock moved backwards delays the end rather than stranding it.
- **Library [obs]:** 877 bundled records = the Free Exercise DB catalogue (upstream ~873 [inf]) plus 2
  reference-local strength additions (with AI-generated photos) plus 2 reference-local quick-log
  activities (outdoor running, outdoor walking) [obs for the 4 ids; inf for the upstream count].
  Facets: 7 categories (strength 583, stretching 123, plyometrics 61, powerlifting 38, olympic
  weightlifting 35, strongman 21, cardio 16), 12 equipment values + none (79 records have none), 3
  levels (beginner 527, intermediate 293, expert 57), force push/pull/static/none, mechanic
  compound/isolation/none, 17 primary muscle groups; instructions median 4 lines; JSON ~1.0 MB.
  Filters: source (dataset | saved | mine), muscle, equipment, category, level; split presets group
  muscles (push/pull/legs/core, upper/lower/core, body part, Arnold, push/pull, antagonist, hybrid, full
  body, custom). Muscle-filter glyphs are rasterised from an MIT library (`react-muscle-highlighter`).
- **Search [obs]:** tokenised AND search on names only; words keep letters, combining marks and
  digits (so Devanagari vowel signs don't split words); the name's word suffixes are joined so
  "pushup", "push up" and "push-up" match; whole-query aliases map gym shorthand to metadata (abs/core →
  abdominals, pecs → chest, delts → shoulders, quads, hams, calf, traps, back → lats/middle/lower back,
  bodyweight → body only) and a few phrases to a specific exercise. Ranking: exact name > name prefix >
  phrase inside name > all words in name > query names a muscle/equipment/category. Instructions and
  secondary muscles are never searched.
- **Illustrations [obs]:** 875 exercises × 4 frames × 2 genders = 7,000 transparent PNGs (~175 KB each,
  ~1.2 GB), reference-authored artwork, **never** bundled in store builds; a ~0.75 MB manifest
  (frame names + 16-hex SHA-256 prefixes, representative frame index) ships instead. Frames download on
  demand per frame (`<base>/<name>.png?v=<digest>`), verified (≤ 4 MB, PNG signature, digest) before an
  atomic cache write; failures remembered for 60 s; the device cache has a 256 MB high-water mark and
  is pruned back to about 192 MB; one exercise costs about 0.7 MB (four frames of one sex). "Other" sex uses the male set. Upstream JPEG photos are not shipped.
  The CDN is live: a frame request returned 200 (`ev_e8bc98472fe4e22e27e4f3ee9d6b6f15442e937ce8a0d7b211dc21ca166a0297`),
  although the README still says shipping builds show placeholders "until the bucket is provisioned".
- **User exercises [obs]:** create/edit/delete own exercises (`UserExercise { id: prefixed uuid, name,
  instructions (one per line), level (default Beginner), force, mechanic, category (default Strength),
  equipment, primary/secondary muscles, photo? }`), photo from camera or picker stored as a local JPEG;
  **Fill with AI** sends the photo to the user's AI provider and proposes the fields for review. The
  photo file is deleted only when no exercise, custom activity, routine or day plan still references it.
- **AI text workouts [obs]:** the user describes a workout in words; the AI returns either a
  clarifying question with 3–4 short options, or a draft (date + exercises). The prompt (reference
  prose, not to be copied) asks the model to map each activity to a library id when it can, to
  give sets/reps/weight/RPE or minutes + intensity, and to ask instead of guessing. The draft is
  validated before review: date not in the future; 1–30 exercises; name 1–120 chars; minutes 0–1440;
  ≤ 12 sets per exercise; reps 1–999; weight 0–1500; RPE 1–10 (Strength scale); unit kg|lbs; intensity
  light|moderate|vigorous; missing details become a clarifying question (cardio asks minutes with
  10/20/30/45; strength asks sets×reps with 3×10/3×8/3×12; an unknown strength exercise asks which
  variation: barbell/dumbbells/machine). Accepted drafts append atomically; retries do not duplicate.
- **Coach integration [obs]:** read tools (history, day plans, preferences, lift history, library
  search) and two *proposal* tools (add an exercise to a day, create a custom exercise) that need the
  user's confirmation (see `05`/Coach spec). Workout preferences feed them: target muscles, issues/
  injuries, frequency days (default 3), session minutes (default 60), split (default full body),
  equipment, RPE scale, strength numbers (bench/squat/deadlift/OHP kg), rest seconds.
- **Health import [obs]:** workouts recorded by other apps are read from the health store and shown
  as imported sessions (read-only) next to the diary.
- **Data shapes:** `DayPlan { date, exercises: PlannedExercise[] }`; `PlannedExercise { id, itemId,
  snapshot fields…, sets: PlannedSet[], timer?: ExerciseTimer }`; `PlannedSet { id, weight, unit?, reps,
  rpe, rpeScale? }`; `ExerciseTimer { accumulatedSeconds, runningSince?, savedSeconds?, intensity }`;
  `WorkoutState { version: 1, dayPlans, sessions, savedIds, preferences, userExercises,
  customActivities, routines, healthSync queues }` — an unknown version resets to empty [obs].
- **Size:** Android ~10.1k lines (UI 6.4k), iOS ~11.7k; Platewise **L** (diary + library + burn +
  routines + rest timer + user exercises + AI text) — **XL** if illustrations are produced.
- **Licensing:** see §3.1a.
- **PWA feasibility:** high for diary/library/burn/routines/AI text (IndexedDB; camera via
  `getUserMedia`/file input). Rest-timer background alerts: weak (no reliable scheduled notifications
  in a PWA; see R07.4). Health import/export: none.

#### 3.1a Exercise data provenance and licensing (decision input)

- **Data [obs]:** the bundled catalogue is the Free Exercise DB (`yuhonas/free-exercise-db`), declared
  public domain under **the Unlicense**; the reference keeps its `LICENSE.md`/`README.md` next to the
  JSON. The upstream README credits an earlier source (`wrkout/exercises.json`) for the restructured
  data [obs]; the provenance of the underlying text and photos is not documented further [unk].
- **Can Platewise use the same open dataset from its original upstream?** Yes for the data, as far as
  the Unlicense dedication goes: Platewise should fetch `dist/exercises.json` (and, if wanted, the
  2 JPEGs per exercise) **from the upstream repository at a pinned commit**, never from the reference's
  copy, and record the commit and licence in its own notices. It must **exclude** the 4 reference-local
  records (2 with AI-generated images, 2 quick-log activities) or recreate equivalents itself [obs that
  they are local additions]. Recommend a legal sanity check on photo provenance before shipping photos
  (open question 2).
- **Illustrations [obs]:** the 7,000 frames are reference-authored artwork hosted on the reference's
  CDN. The repository's MIT licence technically covers committed files, but Platewise's intake decision
  forbids using the reference's illustrations, and hot-linking the reference CDN would make Platewise
  depend on (and leak usage to) a third party. **Do not use them.** Options: upstream photos
  (Unlicense), commissioned/own artwork, or text-only cards.
- **Muscle glyphs [obs]:** derived from `react-muscle-highlighter` 1.2.0 (MIT). Platewise may use that
  library directly from its upstream under MIT with notice.

#### 3.2 Speech-to-text (food voice logging and Coach voice input)

- **Trigger / inputs:** a microphone action on Home ("voice" food entry → transcript → text food
  analysis) and in Coach. Settings: provider, fallback on/off + fallback provider, per-provider
  language, per-provider key.
- **Providers [obs]:** 8 choices. Two are free and keyless: the OS recogniser (streams partial
  text) and on-device Whisper Base. The other **6 are remote BYOK** providers; their default models
  (identical on iOS [obs]) and transport, with wire details in §2:

  | Remote provider | Transport | Default model |
  |---|---|---|
  | Deepgram | raw audio body, token auth | `nova-3` |
  | Groq | OpenAI-style multipart transcription | `whisper-large-v3` |
  | OpenAI | multipart transcription | `gpt-transcribe` |
  | Gemini | file upload, then an interactions call, then file delete | `gemini-3.5-transcribe` |
  | AssemblyAI | upload, submit job, poll | `universal-3-pro`, then `universal-2` as second choice |
  | Mistral | OpenAI-style multipart transcription | `voxtral-mini-2602` |

- **Flow [obs]:** remote and local providers transcribe a **recorded file**: 16 kHz, mono, 16-bit PCM
  WAV. If the access mode is hosted and the provider is not on-device Whisper, the recording goes to the
  hosted transcribe route instead (entitlement required). Otherwise: primary provider → on failure (not
  cancellation), if fallback is on and the fallback is a different, usable recorded provider (Whisper
  installed, or a key saved; Native is never a fallback) → fallback provider. The audio file is deleted
  afterwards in every case. Gemini uploads the file, transcribes, then deletes the uploaded file even on
  failure. AssemblyAI polls once per second up to 60 times, then times out.
- **Languages [obs]:** "provider auto" (no language sent), "device" (device language), or one of 12
  explicit codes: en, de, es, fr, it, pt, nl, hi, ja, zh, ko, cs. Defaults: Native and Deepgram →
  device; all others → provider auto.
- **Migration [obs]:** when a user still on Native upgrades, the speech provider switches to the STT
  route matching their primary AI provider (Gemini/OpenAI/Groq/Mistral) if one exists.
- **Errors:** no key, timeout ("Transcription timed out"), invalid response, API error text; native
  recogniser errors map to readable strings.
- **Size:** Android ~1.8k (incl. voice input sheets), iOS ~1.0k; Platewise **M**.
- **External services:** the 6 vendors; licensing: none beyond vendor ToS.
- **PWA feasibility:** Native → Web Speech API (`SpeechRecognition`; Chrome/Android and Safari; not
  Firefox; Chrome sends audio to Google). Recording → `MediaRecorder` (WebM/Opus on Chrome, MP4/AAC on
  Safari) or an AudioWorklet WAV encoder for vendors that need WAV. Every BYOK vendor must allow
  browser CORS with the key; this is unverified per vendor (open question 3).

#### 3.3 Live Voice (the assistant "orb")

- **Behaviour [obs]:** a spoken conversation that drives the app on the user's behalf. Anything the
  user could do by hand is reachable: analysing food held up to the live camera, barcode scanning,
  choosing library photos, finding and logging saved foods, changing or removing diary entries,
  recording water, fasts, weight, body-fat and workouts, changing settings and switching screens; it
  also answers questions the way Coach does. Its actions are visible because the real screens change
  as it works; during navigation its overlay collapses into a small floating bubble. States: idle, listening, thinking (model or tool), speaking; overlay expanded
  (dimmed, large orb, live captions, camera panel, cards) or compact (bubble + caption pill).
- **Providers [obs]:** Automatic (default: own-key provider when its key is saved, else hosted when
  subscribed, else an explanation), hosted relay (Gemini Live via the worker), Gemini, OpenAI Realtime,
  xAI, OpenAI GPT-Live, Qwen (international region). Models and voices per provider are listed in the
  shared contract (e.g. Gemini voice default Kore; OpenAI marin; xAI ara; Qwen Tina; GPT-Live quartz).
  Keys are reused from AI provider settings; nothing new is stored.
- **Session [obs]:** audio is always signed 16-bit mono PCM, with the platform's echo canceller
  enabled; when the user talks over a reply, playback stops (and the OpenAI item is truncated).

  | Provider | Mic sample rate | Reply sample rate | Camera frames to the model |
  |---|---|---|---|
  | Gemini own key, hosted relay | 16 kHz | 24 kHz | continuous: 1 JPEG/s, long side ≤ 768 px |
  | Qwen | 16 kHz | 24 kHz | continuous, but frames > 256 KB dropped and none before audio |
  | OpenAI Realtime | 24 kHz | 24 kHz | latest frame per user turn |
  | xAI, GPT-Live | 24 kHz | 24 kHz | none; instead the model requests a spoken cue once the food is visible |

  Lifetime: the session closes after 45 s in which neither side speaks (the clock pauses while a tool
  is waiting on the user), at 15 minutes, when the user closes it, when the model calls its end tool,
  or when the app leaves the foreground. Setup must complete within 20 s [obs Android]; audio queued while
  (re)connecting is capped at 6 s (24 kHz × 2 bytes × 6), oldest dropped.
- **Tools [obs]:** 25 declared tools plus Coach's data tools; each has an effect (read | navigate |
  write | destructive) and a confirmation policy (never | always | setting). Writes with "confirm
  before saving" on (default) return a pending card and a `confirmation_required` result until the
  user agrees; destructive tools always confirm; writes show an **Undo** card for 8 s; tools waiting for
  the user (photo picker, scanner) time out after 90 s; workout tools are hidden when the workout diary
  is off; hidden tabs return `unsupported`. Results are `{ok: true, …}` or `{ok: false, error: code,
  message}` with 11 error codes. Photo picking takes up to 4 photos [obs Android].
- **Instructions [obs, described not copied]:** assembled per session from five parts — a persona
  (friendly, concise, replying in whatever language the user speaks); the Coach context block
  (profile, goals, forecast); the day's running totals; behaviour rules (say briefly what it will do
  and then do it, act through tools instead of directing the user to tap, take every number from data
  tools, ask one thing at a time, recap a draft's items and total before saving, and only pass a
  confirmed flag after an explicit yes); and flags for this session's abilities (camera, auto-capture,
  confirmation).
- **Extras [obs]:** finished turns are saved into Coach history (default on); "Preview Voice" plays a
  short sample with no microphone, no profile and no tools, bounded by 30 s; entry points: Home orb,
  iOS Siri/App Shortcut/Action Button/Control Center, Android Quick Settings tile, launcher shortcut,
  home-screen widget.
- **Size:** Android ~8.7k, iOS ~8.1k, worker relay ~1.1k, contract ~0.6k; Platewise **XL**.
- **PWA feasibility:** audio via `getUserMedia` (`echoCancellation: true`) + AudioWorklet resampling;
  camera frames via `<video>` + canvas. Blocker: browsers cannot set `Authorization`/`x-goog-api-key`
  headers on a WebSocket; see R07.12. Background → session ends (same as reference).

#### 3.4 Weekly Challenge (client + server)

- **Behaviour [obs]:** opt-in, pseudonymous weekly leaderboard under Progress. Join with a display
  name (2–40 code points after Unicode/whitespace normalisation; letters, marks, numbers, spaces, basic
  punctuation; no links, emails, reserved staff words or impersonation of the product name; a small
  unsafe-term list), optional social link (X handle 1–15 `[A-Za-z0-9_]`; Instagram 1–30 letters,
  digits, periods, underscores, no consecutive or trailing period), and two consents (community rules;
  **18 or older**, date of birth never uploaded). The server returns a one-time bearer token stored in
  secure storage. Leave = delete remote profile, scores and reports (idempotent); if offline, the
  profile is hidden locally and deletion retried. Users can report (impersonation, inappropriate name,
  spam, unsafe content, other; details ≤ 300 chars; no self-reports, no duplicates) and block locally
  (blocked rows hidden on this device only). "Delete everything" in settings also deletes the remote
  profile. A 401/404 clears a stale local session.
- **Scoring — computed on device [obs]:** for the current Monday-start week, only elapsed days:
  consistency = days with any food logged; nutrition = days whose calories are within ±15 % of the
  goal (0 if no goal); hydration = days meeting the water goal (0 if water tracking is off); activity =
  days with a positive workout burn; activity kcal = Σ per-day burn capped at 2,000/day, ≤ 14,000/week;
  overall = sum of the four day counts (0–28). Only these aggregates are uploaded.
- **Server [obs]:** validates every field (unknown fields rejected; body ≤ 4 KiB; week start must be a
  Monday within one week of the current UTC Monday; day counts 0–7; overall must equal their sum),
  upserts one row per participant-week, ranks by category with documented tie-breaks (category metric →
  other day counts → workout calories; activity uses calories second; equal results → earlier time
  first; re-saving identical totals keeps the original time), returns ≤ `limit` rows (default 50, max
  100; the app asks 100) plus the viewer's own full row always. CORS only for the two site origins;
  rate limits 120/min API, 10/min joins; tokens and IPs only stored hashed. Retention: inactive profiles
  deleted after 90 days, 13 weeks of scores kept, reports deleted after 180 days (hourly job).
- **Data shapes:** `Profile { participantId, displayName, social?: {platform: x|instagram, handle},
  createdAt, updatedAt }`; `WeekScore { weekStart, overall, activityDays, nutritionDays,
  consistencyDays, hydrationDays, activityKcal }`; `LeaderRow = Profile + WeekScore + { rank, score,
  isViewer }`; `Report { reportedId, reason, details? }`.
- **Size:** Android ~3.2k, iOS ~2.8k, worker ~1.2k + schema; Platewise **M** client + **M** server.
- **PWA feasibility:** client trivially; needs a Platewise-run backend + moderation; bearer token in a
  browser has no hardware-backed secure store (IndexedDB only).

#### 3.5 Hosted AI (Plus/Pro, worker API, credits, ledger)

- **Behaviour [obs]:** an optional paid mode that routes food, Coach, workout and goal AI through
  the reference's worker instead of BYOK. Free users stay BYOK; there is no free hosted quota. Plans:
  **Plus** 30 actions/day, 20 voice min/month; **Pro** 60 actions/day, 100 voice min/month (Pro includes
  Plus). Credit packs 50/150/400 (consumable) spend only while a plan is active. Prices (US, suggested):
  Plus $8.99/mo, $69.99/yr; Pro $19.99/mo, $179.99/yr (raised October 2026 for new subscribers);
  credits $1.99/$4.99/$9.99. Tips: 4 consumables $0.99–$9.99. iOS from app 7.0, Android from 7.2.
- **Metering [obs]:** one shared daily pool per subscriber, reset at **midnight UTC**; every model call
  the server makes costs 1 action — food analysis from a photo or from text, re-runs and
  recalculations, the what-if preview, allergen and ingredient helpers, and workout AI alike; a voice
  food log costs 2 (transcription plus analysis); Coach costs 1 per model round, so tool rounds add up. Not counted:
  adaptive goals, onboarding goal calculation, barcode, health, widgets, BYOK. Spend order: daily pool →
  credit bank → `402 quota_exceeded` → soft paywall. Voice: 15-s blocks charged at block start from the
  monthly allowance (UTC calendar month), then 1 credit per block (4/min).
- **Server guarantees [obs]:** identity = the store-SDK anonymous app-user id in a header (format
  enforced; custom ids rejected); plan verified server-side with RevenueCat and cached 15 min (2 min for
  "none"), stale plan served up to 24 h if RevenueCat is down; 8 s RevenueCat timeout; per-user 40/min
  and per-address 120/min limits before any lookup; **charge only after** method, identity, rate limit,
  entitlement, provider config and full body validation; refund only when the provider did not bill
  (HTTP error or never reached) — timeouts and empty 200s keep the charge; refunds are receipt-keyed and
  transactional, retried in background; plan cache upserts are monotonic (an older verification never
  overwrites a newer one); compare-and-swap with retry on concurrent writers (3 attempts); credits
  granted are reconciled from RevenueCat purchases by transaction id across both stores; idle ledger
  rows pruned after 180 days **unless** they ever spent purchased credits; refund markers kept 30 days.
- **Request limits [obs]:** generate: prompt ≤ 120,000 chars, system instruction ≤ 32,000, ≤ 3 images,
  response MIME `application/json`|`text/plain`, output-token cap injected; Gemini passthrough: body
  rebuilt from an allow-list (roles user/model; text, inline image ≤ 3, function call/response, thought
  signatures), ≤ 8 MiB; transcribe: base64 WAV or MPEG-4/AAC, ≤ 12 MiB and ≤ 120 s measured, language
  ≤ 16 chars; overall body ≤ 16 MiB; upstream timeout 30 s. Upstream error bodies are never returned or
  logged verbatim.
- **Live relay [obs]:** checks (method, upgrade, identity, limits, plan, config, voice balance ≥ 1
  block, upstream handshake ≤ 10 s) before answering 101; first client message must be `setup`; the server
  reconstructs it keeping only permitted fields and forces its own model id; later messages only `realtimeInput`/`clientContent`/
  `toolResponse`, ≤ 1 MiB; system instruction ≤ 60,000 chars; ≤ 64 tools, ≤ 64 KiB; JSON depth ≤ 12;
  setup within 10 s, `setupComplete` within 15 s; input held (≤ 2 MiB each way) until the first block
  is paid; abuse guards 1 MiB/s input (4 MiB burst), 2 video frames/s (burst 10); remaining-seconds
  status after setup and every 60 s; closes 4402 (out of minutes), 4408 (15-min limit), 1011 (upstream
  failure); a charge not confirmed within 5 s closes the session; resumption handles wrapped in an
  HMAC token bound to the subscriber, 2 h expiry, ≤ 8,192 chars.
- **Client [obs]:** access mode BYOK | hosted (default BYOK); the app caches only the quota headers
  for display and forces `refresh=1` after a purchase/restore; hosted uses ≤ 3 images and keeps Coach
  tool results under 60,000 chars.
- **Size:** Android ~1.6k, iOS ~1.8k, worker ~3.0k + 5 migrations + ~2k tests; Platewise **XL**
  (backend, billing, identity, abuse controls, legal pages).
- **PWA feasibility:** technically possible with a web backend, but app-store billing is gone: needs
  web billing (Stripe or a store-SDK web product) and a stronger identity than a random id in
  `localStorage` (see R07.15). Product decision (open question 7).

#### 3.6 Meal share links (short, direct, add-meal page)

- **Behaviour [obs]:** share one or more diary entries from the app. First share asks once which link
  style to use (**Short Link** preselected); Settings changes it later.
  - **Direct link:** `https://<site>/add-meal?d=<base64url(JSON)>` carrying the whole payload
    `{ v: 1, meals: Meal[] }`; never expires; opens the app directly where app links are verified
    (only `/add-meal*` is associated with the app) and otherwise shows the add-meal page.
  - **Short link:** the app POSTs the same payload (5-s timeout, JSON content type, a dedicated
    User-Agent) and gets `{ url: <site>/m/<22-char id>, expiresAt }`; on offline, 429, service error or
    an invalid response it silently falls back to the direct link; it does **not** retry a 429.
  - **Meal fields [obs]:** name, calories, protein, carbs, fat, meal type, optional emoji, every
    optional nutrient (sugar, added sugar, fibre, fat subtypes, cholesterol, caffeine, sodium,
    potassium, trans fat, minerals, vitamins, omega-3, supplemental map), serving size and unit options,
    custom note, progressive-meal flag, ingredient list, barcode product metadata (package quantity,
    ingredients text, allergens, traces, Nutri-Score, NOVA, eco-score, labels). Never photos, account
    data or keys. The share text lists `emoji name — kcal` lines plus the link.
  - **Import [obs]:** the app decodes the payload and shows an import sheet; imported entries get new
    ids and are logged "now".
- **Server [obs]:** creation: POST only, JSON content type only, body ≤ 64 KiB (actual and declared),
  1–100 meals, name non-empty ≤ 500 chars, non-negative finite macros, calories rounded to integers;
  browser origins other than the two site hosts → 403; id = 128 random bits as 22 base64url chars;
  stored with a 604,800-s TTL and an explicit expiry check; 10 creates/min/IP, 120 reads/min/IP
  (per-location, not global); 429 carries `Retry-After: 60`; errors 400/403/405/413/415/503; responses
  no-store, noindex, no-referrer, CSP `default-src 'none'`; payloads, ids and IPs are not logged.
  Preview (`GET`/`HEAD`): server-rendered, escaped meal summary (`name — kcal`, macros), social preview
  metadata, an "open in app" button with the custom scheme, an add-meal web button, store links; **no
  automatic redirect** so the recipient can review first; missing/expired → 404 page asking the sender
  to share again. KV is eventually consistent: a new link may be briefly missing at another location.
- **Add-meal page [obs + ev]:** static page; reads `d` from the query, base64url-decodes, UTF-8 JSON
  parses, escapes, renders one card per meal (emoji or a default plate emoji, name, `P · C · F`
  macros, kcal; a total line when > 1 meal), headline "A meal was shared with you" / "N meals were
  shared…", a primary "Add to …" button (custom scheme), store links, and a note that the details live
  in the URL; **after 350 ms it tries to open the custom scheme automatically**. No `d` → "Nothing to
  add"; undecodable → "Couldn't read this meal". `noindex`, `no-referrer`. Live capture confirmed all of
  this (`ev_cd4bdcebe910357e2243d839104316019e0bbc4efce323d789edbdacfa7ee4d4`,
  `ev_a1882e4dcb83688cd802324c84730757a50bb98d5f555047110a979c786d5cdf`); in desktop Chromium the
  automatic scheme navigation was aborted (`net::ERR_ABORTED`).
- **Size:** Android ~0.6k, iOS ~0.5k, worker ~0.1k + page 164 lines; Platewise **S** (direct) + **S**
  server (short links).
- **PWA feasibility:** direct links need no server — the PWA itself can be the add-meal page (route
  inside the app's scope) and import into IndexedDB. Short links need KV + a function. See R07.16–17.

#### 3.7 Others

- **Community bot [obs]:** slash commands in the reference's Discord, handled by the worker: `ask`
  (AI answer from a free-tier Gemini key; 1 question/min/user), `bug` and `feature` (AI drafts a GitHub
  issue title/body, falls back to a clipped excerpt; escalating per-user cooldown shared by both: 10
  min, doubling per report in a streak up to 24 h; streak ends after 2 days without a report);
  replay markers 15 min; KV stores only hashed ids and reservations. A GitHub "issue closed" webhook
  (HMAC-verified) notifies the original reporter in Discord (retried every 5 min). The hourly cron
  posts new store releases (Play production track once the public listing shows it; App Store
  "ready for sale" with notes), first run records without announcing. Size: worker ~1.8k + scripts.
  Platewise: **not product scope** (community tooling); skip.
- **Widgets and watch [obs]:** Android home-screen widgets: calories, protein, water, all-metrics,
  voice-assistant launcher (+ a Glance variant), refreshed by a worker and on every data change from a
  snapshot `{ date, dayStart, calories/goal, protein/carbs/fat + goals, 4 chosen Home nutrients,
  theme colours, water current/goal (default 2,000 ml), water enabled }`. iOS: calorie, protein, water,
  log-food widgets, a Control Center voice control, an Apple Watch app + complications fed by the same
  snapshot, App Shortcuts/Siri intents and a share extension (share a food photo into the app). Size:
  Android ~1.5k; iOS extensions ~3.1k. PWA: **no widgets or watch**; partial substitutes: Web App
  Manifest `shortcuts` (long-press launcher menu), Badging API (number on icon, Chromium), Web Share
  Target (Android Chrome only) for "share a photo in". Size **S** for substitutes.
- **Apple Health / Health Connect sync [obs]:** optional; writes nutrition per entry (all macros and
  micronutrients), weight, body fat, workout active energy; reads steps, active and total/basal energy,
  weight, body fat, height (iOS), nutrition from other apps (import), exercise sessions from other apps;
  retries failed writes in a background worker; tombstones prevent resurrecting deleted samples; the
  nightly summary and Home "burned" read energy from it. Size: Android ~1.6k, iOS ~2.0k. PWA: **none**
  (no web API). Possible later substitute: export/import files; out of plan.
- **Local on-device models [obs]:** exactly two families: Whisper Base for STT (every RAM tier; Android
  whisper.cpp wrapper arm64 only, 16 kHz mono WAV; iOS WhisperKit Core ML) and Gemma 4 E2B (text +
  image) for phones in the **8 GB RAM class** (memory class = total RAM rounded **up** to whole GiB).
  Download rules: check free space first (Android keeps max(256 MiB, 10 %) headroom; iOS 1 GiB), write a
  sibling partial file, verify exact length + streaming SHA-256, atomic move; partial/unverified/
  deleted models never selectable; deleting an active model first re-points every primary/fallback
  selection, closes the runtime, removes only model files. Notices are bundled and shown offline; the
  LiteRT-LM notice bundle contains GPLv2/MPL text under an ambiguous entry flagged for legal review.
  Size: Android ~0.7k, iOS ~2.0k. PWA: Whisper via WASM/WebGPU (ONNX/ggml ports) is feasible (≈150 MB,
  cached in Cache Storage/OPFS) — **M**; Gemma 2.59 GB in a browser is impractical (storage quota,
  memory, iOS limits) — skip.
- **i18n [obs]:** 19 UI locales: English as the source plus 18 translations — Arabic (right-to-left);
  Spanish, French, German, Italian, Dutch, Brazilian Portuguese; Czech, Polish, Romanian, Russian,
  Ukrainian; Turkish, Azerbaijani; Hindi; Japanese, Korean, Simplified Chinese (zh-CN on Android,
  zh-Hans on iOS); in-app language picker or follow device. Android ≈ 1.9k strings
  per locale across 19 resource files (1,340 in the main file, 12 plurals); iOS 1,714 keys in the main
  catalogue plus feature catalogues (~6.4 MB of catalogues). The marketing site claims "18 languages"
  (translations excluding English) [obs]. STT language and voice-response language are separate
  settings. Size: infrastructure **S** (if strings are externalised from v1), translations **M** per
  wave; Platewise must decide which languages.
- **Marketing site [obs + ev]:** static pages served by the worker: home (hero with demo, features,
  screenshots, BYOK/privacy section, FAQ with 12 questions, store CTAs, star count fetched from the star
  history JSON), 4 SEO guide pages, privacy (~370 lines), terms (~260), 404, add-meal; one shared
  stylesheet (~1.2k lines), Geist font from Google Fonts, strict CSP, `noindex` on add-meal; sitemap of
  7 URLs; JSON-LD software version "iOS 7.1.2 / Android 7.2". Size: ~4.5k lines HTML/CSS. Platewise:
  a separate static site, **S–M**, own copy and design; never reuse the reference's text.

### Part B — what the web side ships (REA)

#### 3.8 REA static analysis of the worker

- `analyze-javascript-application` over a copy of `web/`
  (`ev_9c2ecdc594fd34e4da8a45d833e14cd0f2783a3ddcd904cef49e1afcb32c06da`): 50 relevant files, 37
  JavaScript/TypeScript sources parsed with 0 failures, 69,678 AST nodes, 586 findings; graph of 375
  nodes (295 module references, 37 assets, **20 endpoint candidates**, 14 artifacts) and 604 edges.
- **Route inventory: 0 route patterns, 0 occurrences** ("application routes: unknown"). The worker
  dispatches by comparing the URL path in plain conditionals, which the inventory (built for router
  libraries) does not recognise. The endpoint candidates are mostly from the hosted-AI test harness
  (`/generate`, `/gemini`, `/transcribe`, `/quota`, `?refresh=1`, `Upgrade`, `x-goog-api-key`), the
  share e2e script (`${origin}/api/meal-shares`), the Discord channel-message URL, the GitHub repository
  URL and `svg?theme=dark`. Inline scripts in 8 HTML pages were **not** analysed (REA limitation),
  including the add-meal decoder and the home page's star-count fetch.
- Consequence: the route table below is reconstructed from source and then **confirmed by live
  probes** (each row cites the probe where one exists). The REA graph corroborates the hosted-AI
  sub-routes and the share-create URL only.

#### 3.9 HTTP routes the worker serves (IDs from §2)

Order of evaluation [obs]: canonical redirect → shares → challenge → hosted → GitHub webhook → Discord
→ star history → static assets (404 page for unknown paths). The worker runs before static assets.

| ID | Method | Purpose (behaviour) | Storage / upstream | Live evidence |
|---|---|---|---|---|
| — | GET/HEAD any | **Canonical redirect**: apex host or http, `.html` suffix, `/index.html`, trailing slash → 301 to the canonical https www URL (query kept). Skipped for the API prefix, share preview paths, `.well-known`, and star history | — | apex `/privacy` → 301 → www (`ev_574f8c3d8352e1395c1bc4a4f66da108377329592dd0dd66f7165d63018c4f15`); apex `/add-meal.html?d=…` → 301 → www `/add-meal?d=…` (`ev_659b1d4c6774ad30013644967739831c980baa14d65b5c132b494f3512e00d23`) |
| W01 | GET/HEAD | Marketing pages, legal pages, add-meal page; unknown path → branded 404 page with status 404 | static assets | home `ev_fa243a1fe14ed63cc6252910410ee973c07740c25cc70484db1eab53b44d991a`; 404 `ev_0d73376816986e46f3c1862f8527a3a3b109efcbf12bd614a4578abafa2af4c4` |
| W02 | GET | App-link association files (iOS + Android); only `/add-meal` and `/add-meal*` open the app; 1 h cache | static | — (source only) |
| W03 | POST | Create short share link (201 `{url, expiresAt}`) | KV shares, TTL 7 d; limiter 10/60 s | GET → 405 JSON "Method not allowed." (`ev_54bb1730e761358e7656d386f4b6e2040e442a894229f2fcb35aba212df33793`) |
| W04 | GET/HEAD | Share preview page (or 404 page) | KV shares; limiter 120/60 s | unknown id → 404 "expired or could not be found" (`ev_7806df0ff69b011c49d48ba454af0b0022362fc5239a0ef88f7334845f5b018d`) |
| W05 | POST | Join challenge (201, one-time bearer) | SQL DB; limiter 10/60 s | — |
| W06 | PATCH | Update challenge profile | SQL DB | — |
| W07 | DELETE | Delete challenge profile (cascade; idempotent) | SQL DB | — |
| W08 | PUT | Upsert weekly aggregate | SQL DB | — |
| W09 | GET | Leaderboard (category, week, limit) | SQL DB | no token → 401 `unauthorized` (`ev_60d7c3da9bc3130aa3f9ab30d9f7a75480890a6ad28a3b2547e0dbf1d9829eb6`) |
| W10 | POST | Report a participant | SQL DB | — |
| W11 | OPTIONS | CORS preflight for the two site origins (max-age 86,400) | — | — |
| W12 | POST | Hosted text/vision generation (1 action) | SQL ledger; Gemini; RevenueCat | apex GET → 405 before identity (`ev_f85164c1f3b6c75f3edfc9d87b3f19469f62940555a77b9f2a5f4402b721453f`) |
| W13 | POST | Hosted allow-listed Gemini body for Coach tool rounds (1 action per call) | same | — |
| W14 | POST | Hosted transcription (1 action) | SQL ledger; Deepgram | — |
| W15 | GET | Quota snapshot + voice balance; `refresh=1` re-verifies | SQL ledger; RevenueCat | no id → 401 `invalid_user_id` on www and apex, no redirect (`ev_7cdd6ff0edf1ae83d67889fdab4a9443474100115b849104aa4bb7c903022fea`, `ev_ae5cdbdd3631168b354bcfc3dded1f9ee8083ee19441814abf23b424a40601e4`) |
| W16 | GET + Upgrade | Hosted live-voice WebSocket relay (15-s blocks) | SQL ledger (voice spends); Gemini Live | — (not probed: would need a subscriber id) |
| W17 | POST | Discord interactions (Ed25519 verified) | KV bot state; Gemini (free key); GitHub | — |
| W18 | POST | GitHub issue-closed webhook (HMAC verified) | KV bot state; Discord | — |
| W19 | GET | Star history JSON (public, CORS `*`, 300 s cache; refreshed if older than 1 h; last good copy kept on GitHub outage) | KV star history; GitHub API | 200, total 494, generated 11:17 UTC (`ev_f65356a83662add4e7f1ddc07b4bc9f07198e78d9bf977643ec02d55270f82fd`) |
| W20 | GET | Star history SVG chart (light/dark) | same | — |

- **Scheduled work [obs]:** cron at minute 17 every hour: refresh star history, challenge retention,
  hosted-ledger retention, Play and App Store release announcements — run with all-settled semantics,
  each failure logged separately. Cron every 5 min: retry Discord issue-closure notices.
- **Storage bindings as behaviour [obs]:**
  - *SQL database (D1), one shared database* holding both the challenge tables (participants with
    hashed tokens and consent timestamps/versions, weekly scores with indexes per category, reports)
    and the hosted-AI tables (per-subscriber ledger row: hashed id, plan, credits granted/spent, UTC
    usage day + count, verification time, version for compare-and-swap; refund receipts; voice-spend
    receipts). Applied through 5 ordered migrations.
  - *KV namespaces:* shares (7-day TTL entries), bot state (cooldowns, replay markers, issue↔reporter
    links, closure queue), star history (one cached document).
  - *Object storage (R2):* the workout-frame bucket, exposed on its own asset subdomain; **not bound to
    the worker**; frames immutable for a year, manifest 5 min.
  - *Rate limiters:* six native per-location limiters (see §3.4–3.6).
  - *Static assets:* the site directory; worker source, tests, scripts, migrations and docs are
    excluded from publication.
- **Response headers [obs + ev]:** static pages carry the site-wide CSP, Permissions-Policy (camera,
  microphone, geolocation disabled), Referrer-Policy, nosniff and frame denial; the add-meal page adds
  `no-referrer`. Worker-generated responses do **not** inherit these: share and challenge responses set
  their own (`no-store`, CSP `default-src 'none'`, `no-referrer`, `X-Robots-Tag`), hosted responses set
  only `no-store` (observed header sets match the source in every probe).

#### 3.10 Source vs live: differences recorded

1. **Frame CDN is live** — README says builds show placeholders until the bucket is provisioned; the
   CDN returned a frame with 200 (`ev_e8bc98472fe4e22e27e4f3ee9d6b6f15442e937ce8a0d7b211dc21ca166a0297`).
2. **"18 languages" claim vs 19 shipped locales** — source and live agree on the claim; the apps ship
   English + 18 translations.
3. **Share-404 page links to the `.html` privacy alias**, which itself 301-redirects (extra hop);
   harmless.
4. **Live star count (494) is runtime data** fetched by an inline script; not in source.
5. **Method check precedes identity on hosted routes** (405 before 401) — consistent with source; the
   app must not treat 405 as an auth failure.
6. No other differences: page texts, status codes, redirect rules and header sets matched the source
   in all 13 probes. Not probed (would write to production or need credentials): share creation, a
   live share preview, challenge writes, hosted generation, the live relay, Discord/GitHub hooks.

## 4. File map (what to read in the Read step)

| Sub-area | Reference path | Lines | Read what | Docs / tests to read with it |
|---|---|---|---|---|
| Workouts model + burn | `A/models/WorkoutModels.kt` | 784 | RPE scales, timer, burn estimator, split groups | `T/models/WorkoutModelsTest.kt` (253) |
| Routines / rest / inputs | `A/models/{WorkoutRoutine,WorkoutRestTimer,WorkoutSetInput,WorkoutTextDraft,UserExercise}.kt` | 74/116/21/186/87 | all | `T/models/WorkoutRoutineTest.kt`, `WorkoutRestTimerTest.kt`, `WorkoutTextDraftTest.kt` |
| Workout repository | `A/data/WorkoutRepository.kt` | 1,038 | public operations; calculated-burn save; health queues | `T/data/WorkoutRepositoryTest.kt` (635) |
| Library + search + visuals | `A/data/{ExerciseRepository,ExerciseModels,ExerciseSearch,ExerciseVisuals}.kt` | 198/103/110/224 | search ranking, aliases | `T/data/ExerciseSearchTest.kt` (252), `ExerciseVisualResolverTest.kt` (277) |
| Rest alerts + frames | `A/services/{WorkoutRestTimerController,WorkoutFrameStore,WorkoutFrameLocator}.kt` | 197/308/57 | alert rules; cache/verify | `T/services/WorkoutRestTimerControllerTest.kt` (300); `shared/workout-vectors/README.md` |
| Workout UI | `A/ui/workouts/*` | 6,449 | skim: diary (1,848), picker (957), screens | store screenshots (workouts) |
| User exercise AI fill | `A/services/ai/UserExerciseAiFill.kt` | — | skim (prompt is reference prose) | `T/services/ai/UserExerciseAiFillTest.kt` (213) |
| Exercise data | `I/Resources/FreeExerciseDB/{README.md,LICENSE.md,dist/exercises.json}` | 1 MB JSON | licence, local additions | `ASSET_CREDITS.md` |
| STT | `A/services/speech/*`, `A/models/{SpeechProvider,SpeechLanguage}.kt` | 749 + 174 | provider routing, wire calls | `I/Services/SpeechService.swift` |
| Live voice contract | `shared/voice-assistant/{README.md,tools.json}` | 228 / 348 | all (contract) | `T/services/voice/*` (LiveWire 512, ToolExecutor 842) |
| Live voice client | `A/services/voice/*`, `A/ui/voice/*` | 6,119 + ~2.0k | skim wire + controller | `I/VoiceAssistant/*` (8,084) |
| Challenge client | `A/services/challenge/*`, `A/models/WeeklyChallengeModels.kt`, `A/data/WeeklyChallengeRepository.kt`, `A/ui/progress/WeeklyChallenge*.kt` | 333 + 278 + 308 + 2,258 | aggregator, validation, repository | `T/services/challenge/*` |
| Challenge server | `web/challenge-api.ts`, `web/challenge-validation.ts`, `web/CHALLENGE_API.md`, migration 0001 | 765 / 426 / 171 / 80 | doc first, then validation | `web/tests/challenge-api.test.ts`, `challenge-fuzz.test.ts` |
| Hosted client | `A/services/hosted/*`, `A/ui/hosted/HostedScreens.kt` | 864 + 705 | constants, quota store | `T/services/hosted/*` |
| Hosted server | `web/hosted-ai-{api,ledger,live,gemini-request,audio,live-resumption}.ts`, migrations 0002–0005 | 798/626/1,077/359/116/69 | `services/hosted-ai/README.md` first | `web/tests/hosted-ai-*.test.ts`; `docs/HOSTED_AI_REVENUECAT.md` |
| Meal share | `A/services/MealShare.kt`, `A/models/MealShareLinkStyle.kt`, `web/meal-shares.ts`, `web/MEAL_SHARES.md`, `web/add-meal.html` | 317/28/131/61/164 | all | `web/tests/meal-shares.test.ts`, `web/scripts/e2e-meal-shares.mjs` |
| Worker entry + site | `web/worker.ts`, `web/wrangler.toml`, `web/_headers`, `web/*.html` | 410 / — / — / ~3.3k | routing order, crons, redirects | `web/tests/canonical-redirect.test.ts` |
| Community bot | `web/discord-*.ts`, `web/*-announcements.ts`, `services/discord-bot/README.md` | ~1.8k | skip unless needed | `web/tests/discord-*.test.*` |
| Health | `A/services/health/*` | 1,566 | skim record types, retry | `T/services/health/*`, `T/data/NutritionHealthRetryTest.kt` |
| Widgets | `A/widget/*`, `A/models/WidgetSnapshot.kt` | ~1.5k | snapshot shape only | `I/../FudAIWidgets/*` |
| Local models | `A/services/ondevice/*`, `local-models/{README.md,catalog.v1.json}` | 703 / 90 | download/verify rules | `T/services/ondevice/LocalModelEligibilityTest.kt` |
| i18n | `A/res/values*/`, `A/models/AppLanguage.kt`, `I/*.xcstrings` | 67 + catalogues | locale list | — |

Giant files: `A/ui/workouts/WorkoutDiaryScreen.kt` [1,848] (search "Copy from day", "Burn"),
`A/services/voice/VoiceToolExecutor.kt` [1,484] (one handler per tool name),
`A/services/health/HealthConnectManager.kt` [1,261] (permissions list near the top),
`web/hosted-ai-live.ts` [1,077] (limits object near the top), `web/discord-interactions.ts` [1,112],
`I/Views/WorkoutLogView.swift` [2,841].

## 5. Minimum viable subset

### 5.1 For v1

Nothing in this area is in v1. v1 must still **prepare** for it, cheaply:

- Externalise every UI string and format numbers/dates with `Intl` from the first commit (i18n retrofit
  is the costliest later change; R07.20).
- Keep the day-summary model able to accept a "burned" figure from a non-health source (workouts later;
  R07.1).
- Keep backup/export versioned so a later workout state can be added without a migration break.
- Reserve a route in the PWA for importing a shared meal (direct-link format of its own, R07.16).
- Do **not** ship a backend in v1; every server feature below is gated by a product decision.

### 5.2 Recommended phase order (Part C)

| Phase | Feature | PWA mapping | Platewise size | Depends on | Why here |
|---|---|---|---|---|---|
| P2 | i18n wave 1 (infrastructure + 2–4 languages, RTL check) | `Intl`, message catalogues, `dir="rtl"` | S + M | v1 strings externalised | cheapest when the UI is small; every later feature then ships localised |
| P2 | Workouts core: diary/planner, library (upstream dataset, text-only or upstream photos), sets/reps/RPE, timers, burn, routines, user exercises (photo via file input) | IndexedDB; on-demand image cache | L | — | biggest user-visible gap; client-only; feeds challenge and Coach |
| P2 | Rest timer (in-app alert + best-effort notification while open) | `Notification` + wall-clock `endsAt` | S | workouts | small; background alert explicitly limited (R07.4) |
| P3 | AI text workouts + Coach workout tools + AI fill for user exercises | existing BYOK AI layer | M | workouts, Coach (v1) | reuses v1 AI plumbing |
| P3 | Speech-to-text: Web Speech + BYOK recorded STT (vendors that pass a CORS spike) + fallback | `SpeechRecognition`, `MediaRecorder`/AudioWorklet | M | v1 text logging | unlocks voice food logging and Coach voice input |
| P3 | Meal share — direct links (send + import route) | Web Share API, in-app route | S | v1 diary | no server; social feature at near-zero cost |
| P4 | On-device Whisper (optional) | WASM/WebGPU, OPFS cache, SHA-256 verify | M | STT | privacy/offline STT; skip Gemma |
| P4 | Workout illustrations (own art) | CDN + SW cache budget | XL (art) | workouts | only if product wants visuals beyond photos |
| P5 | Live Voice (BYOK) — start with the one vendor that supports browser-safe auth | WebSocket/WebRTC + ephemeral token | XL | STT, all write paths + undo | highest complexity; needs a token minting story (R07.12) |
| P6 | Backend phase (only if approved): short share links, weekly challenge | edge function + KV + SQL | S + M (+ ops, moderation) | P2/P3 | first server; needs privacy policy, abuse controls |
| P7 | Hosted AI (only if approved): web billing, identity, ledger, hosted live relay | backend + payments | XL | P6 backend, P5 for hosted voice | business decision; largest risk surface |
| — | Widgets/watch, health-store sync, Gemma on-device, community bot | manifest shortcuts/badging only | S (substitutes) | — | no web platform support or not product scope |

Rough total for P2–P5 (client-only): ~L + L + XL ≈ 4–6 builder-months; P6–P7 add a backend
programme of similar size.

## 6. Hard parts / traps

1. **R07.1 Burn reaches Home only through the health store.** The reference writes the workout burn to
   Health and Home reads "burned" back from Health (measured total, else BMR + active). A PWA has no
   health store, so a straight port shows no burn anywhere. Platewise must feed the diary burn into the
   day summary directly and decide whether burn changes the calorie budget (the reference does not
   adjust the goal).
2. **R07.2 One versioned burn snapshot per day.** The burn is not a sum of sessions: "Burn" replaces
   the day's single snapshot (same id, version + 1) and deletes duplicates; discarding a saved timer or
   editing a timed exercise's RPE invalidates that day's burn; reordering does not. Undo must not
   restore old calories over a later plan edit (test `voiceUndoDoesNotRestoreOldCaloriesOverALaterPlanEdit`).
3. **R07.3 Burn formula is net of resting energy.** Using gross METs double-counts BMR in any total.
   Keep `max(MET−1,0)`, the 35–300 kg clamp (default 70), reps ≤ 100/set, the 4-min floor, the 1–5000
   result clamp, and never add strength calories for a timed exercise's reps (tests
   `burnEstimatesAreNetActiveEnergyAboveRest`, `savedCardioTimerCalculatesWithoutRepsAndDoesNotCountRepsTwice`).
4. **R07.4 Rest alerts when backgrounded.** Native apps schedule an exact alarm; a PWA cannot reliably
   fire a notification after the page is frozen or closed (no scheduled-notification API; service
   worker timers die). Store a wall-clock `endsAt`, recompute on resume, alert in-app only if it ended
   < 3 s ago, never alert for a rest that ran out while asleep, tolerate a clock moved backwards, and
   tell the user background alerts are best-effort. A server push would need a backend.
5. **R07.5 Do not use the reference's illustrations or CDN.** 7,000 reference-authored frames on the
   reference's own CDN; intake decision forbids its illustrations and hot-linking leaks usage. Use the
   upstream dataset from its own repository (pinned commit), drop the 4 reference-local records, and
   choose photos (Unlicense, provenance check), own art, or text-only.
6. **R07.6 Large image sets in a service worker.** Precaching hundreds of MB fails quotas (iOS
   especially). Fetch per exercise on demand, verify digest/size, remember failures for 60 s, and cap
   the cache (the reference trims to ~192 MB after 256 MB). Keep the placeholder path working offline.
7. **R07.7 Exercise search subtleties.** Name-only AND search with word-suffix joining ("pushup" =
   "push-up"), whole-query metadata aliases, Unicode marks kept inside words (Devanagari), and a ranking
   order. Searching instructions or secondary muscles floods results — the reference deliberately
   excludes them (`ExerciseSearchTest`).
8. **R07.8 RPE input per scale.** Borg is integer-only 6–20; others allow one decimal; values above max
   clamp to max; below-min input is kept only while it can still become valid ("1" on Borg → "1x").
   Comma decimals must be accepted. A naive numeric input breaks typing mid-value.
9. **R07.9 Routines must never overwrite logged work.** Apply matches by catalogue id in order (repeats
   too), fills only entries with no logged values and no started timer, appends the rest; templates drop
   RPE, timers and identities.
10. **R07.10 STT pipeline guarantees.** Delete the recording in every outcome; delete the vendor-side
    uploaded file even on failure (Gemini); fallback only to a *different, usable* recorded provider and
    never on user cancellation; AssemblyAI polling is bounded (60 × 1 s). Hosted mode reroutes all
    remote STT except on-device Whisper.
11. **R07.11 Browser audio formats.** The reference always sends 16 kHz mono WAV. Browsers record
    WebM/Opus (Chromium) or MP4/AAC (Safari); some vendors or the hosted route accept only listed types.
    Encode WAV in an AudioWorklet or verify each vendor's accepted MIME types; resample to 16 kHz for
    on-device Whisper.
12. **R07.12 Live voice auth from a browser.** Every provider authenticates with a header
    (`Authorization: Bearer` / `x-goog-api-key`), and the reference forbids putting keys in URLs. Browser
    WebSockets cannot set headers. Options per vendor: ephemeral client tokens (need a minting server or
    a vendor flow the browser can call with the BYOK key), WebRTC with a client secret, or vendor
    subprotocol auth; each needs verification. Without one, BYOK live voice is not shippable in a PWA.
13. **R07.13 Voice tool safety model.** Writes with confirm-before-saving on must return a pending
    result and change nothing until the user agrees; destructive tools always confirm; every write has an
    8-s undo that restores prior state; waiting tools time out at 90 s; workout tools disappear when the
    diary is off; hidden tabs return "unsupported". Porting tools without this lets a model mutate data
    on a misheard sentence.
14. **R07.14 Challenge aggregates are strict.** Only elapsed days of the Monday week; nutrition window
    ±15 %; hydration 0 when water tracking is off; activity kcal capped 2,000/day and 14,000/week;
    overall must equal the four day counts or the server rejects it; week start must be within one week
    of the current **UTC** Monday (local-week edge). Merge the viewer row with the ranking list by id.
    "Delete everything" must also delete the remote profile, with an offline retry queue.
15. **R07.15 Hosted identity is a bearer secret.** The reference's only credential is an unguessable
    anonymous id; anyone holding it spends that subscriber's quota. In a browser, `localStorage` is
    readable by any script on the origin and by extensions; Platewise would need real accounts or
    device-bound proofs, web billing, and the same charge-after-validation / refund-only-if-unbilled /
    monotonic-entitlement / keep-rows-with-spent-credits rules (`hosted-ai-api.test.ts`).
16. **R07.16 Share payload and link size.** The direct link carries the full JSON (all nutrients,
    ingredients, product metadata) as uncompressed base64url; multi-meal shares can exceed what
    messengers or QR codes handle. Short links exist for that and expire in 7 days. If Platewise defines
    its own format, version it, cap it (the reference caps 100 meals, 64 KiB, names ≤ 500), round
    calories, strip photos/keys, and give imports new ids logged "now".
17. **R07.17 PWA link capture and storage partitions.** On iOS, links never open an installed
    home-screen PWA, and the home-screen app has **separate storage** from Safari — a share opened in
    Safari cannot write into the installed app's IndexedDB. On Android, capture needs the link to be in
    the manifest scope and link handling enabled. The import page must therefore work standalone in a
    browser tab, explain "open in the app" limits, and offer copy/paste of the link as a fallback. Do not
    auto-redirect (the reference shows a preview first and only *tries* its custom scheme after 350 ms).
18. **R07.18 Canonical redirects must spare APIs.** Redirecting apex→www for API or share paths turns
    POSTs into GETs after a 301 and breaks apps that call the apex host. The reference exempts the API
    prefix, share preview paths, `.well-known` and star history, and checks the method before identity
    (405 before 401, observed live). Any Platewise backend must keep these exemptions.
19. **R07.19 Worker responses skip static security headers.** Site-wide headers apply to static assets
    only; dynamic responses must set their own CSP, `no-store`, `noindex`, `no-referrer` (observed).
20. **R07.20 i18n retrofit cost and RTL.** 19 locales including Arabic (RTL), ~1.9k strings per locale,
    separate STT and voice-response language settings, and locale-aware search (marks inside words).
    Hard-coded strings in v1 multiply the later cost; plan RTL layout mirroring from the start.
21. **R07.21 Local model downloads.** Never select a partial or unverified model; check space first;
    verify exact length + SHA-256; delete only model files and re-point selections before deleting an
    active model. In a browser, storage can be evicted (request `navigator.storage.persist()`), quota is
    origin-wide, and iOS limits are tight — Gemma's 2.59 GB is not viable; Whisper base (~148 MB) is.
22. **R07.22 Health deletions resurrect without tombstones.** If Platewise ever adds an export/sync
    path, keep tombstones and pending queues so a stale read cannot re-create a deleted burn
    (`reconcileCannotResurrectARecordDeletedDuringStaleHealthRead`).

## 7. Open questions

1. Does Platewise run **any** backend (short links, weekly challenge, hosted AI, voice-token minting)?
   Needed: product decision; it gates P6–P7 and BYOK live voice (R07.12).
2. Exercise visuals: upstream Free Exercise DB photos (Unlicense; provenance of the original photos not
   documented), own illustrations, or text-only? Needed: product decision + a short legal check of the
   upstream photo provenance.
3. Which STT vendors accept browser (CORS) requests with a BYOK key, and which audio MIME types each
   accepts? Needed: a spike calling each of the 6 endpoints from a browser origin.
4. Which realtime voice vendors offer browser-safe auth without a server (ephemeral tokens creatable
   with the user's own key, WebRTC client secrets, subprotocol keys)? Needed: vendor-doc check + spike.
5. Default workout weight unit: the reference falls back to lbs; Platewise could follow locale/profile
   units. Needed: product decision.
6. Weekly challenge: keep the 18+ consent, moderation (reports, blocks) and retention rules? Who
   reviews reports? Needed: product/legal decision before P6.
7. Hosted AI on the web: payments provider, identity (accounts vs anonymous), pricing, and whether to
   offer it at all. Needed: business decision.
8. Meal-share link format and domain: keep a static preview/import page outside the PWA scope or make
   the PWA route the landing page? Needed: product decision after an iOS storage-partition test (R07.17).
9. Which languages ship first, and is RTL (Arabic) in the first wave? Needed: product decision.
10. Is an in-app-only rest alert acceptable, or must background alerts work (which implies push and a
    backend)? Needed: product decision.
11. Should workout burn adjust the daily calorie budget ("eat back")? The reference does not. Needed:
    product decision (touches v1 Home spec).

## 8. What to read later

- Reference docs: `shared/voice-assistant/README.md`, `shared/workout-vectors/README.md`,
  `services/hosted-ai/README.md`, `docs/HOSTED_AI_REVENUECAT.md`, `web/CHALLENGE_API.md`,
  `web/MEAL_SHARES.md`, `services/discord-bot/README.md`, `local-models/README.md`, `ASSET_CREDITS.md`,
  `THIRD_PARTY_NOTICES.md`, `I/Resources/FreeExerciseDB/{README.md,LICENSE.md}`.
- Reference tests that list the edge cases: `T/data/WorkoutRepositoryTest.kt`,
  `T/models/{WorkoutModelsTest,WorkoutRestTimerTest,WorkoutRoutineTest,WorkoutTextDraftTest}.kt`,
  `T/services/WorkoutRestTimerControllerTest.kt`, `T/data/ExerciseSearchTest.kt`,
  `T/services/challenge/WeeklyChallengeAggregatorTest.kt`, `T/services/voice/{LiveWireTest,VoiceToolExecutorTest,LiveSessionTest}.kt`,
  `T/services/hosted/*`, `web/tests/{meal-shares,canonical-redirect,challenge-api,challenge-fuzz,hosted-ai-api,hosted-ai-live,hosted-ai-ledger-sqlite}.test.ts`.
- REA Evidence (outside the repo; files under `~/rea-lab/evidence/` and `~/rea-lab/captures/site/`):
  static worker analysis `ev_9c2ecdc594fd34e4da8a45d833e14cd0f2783a3ddcd904cef49e1afcb32c06da`; live
  captures — home `ev_fa243a1fe14ed63cc6252910410ee973c07740c25cc70484db1eab53b44d991a`, privacy/apex
  redirect `ev_574f8c3d8352e1395c1bc4a4f66da108377329592dd0dd66f7165d63018c4f15`, add-meal with
  payload `ev_cd4bdcebe910357e2243d839104316019e0bbc4efce323d789edbdacfa7ee4d4`, add-meal empty
  `ev_a1882e4dcb83688cd802324c84730757a50bb98d5f555047110a979c786d5cdf`, add-meal `.html` alias
  `ev_659b1d4c6774ad30013644967739831c980baa14d65b5c132b494f3512e00d23`, missing share
  `ev_7806df0ff69b011c49d48ba454af0b0022362fc5239a0ef88f7334845f5b018d`, share-create GET
  `ev_54bb1730e761358e7656d386f4b6e2040e442a894229f2fcb35aba212df33793`, hosted quota (www)
  `ev_7cdd6ff0edf1ae83d67889fdab4a9443474100115b849104aa4bb7c903022fea`, hosted quota (apex)
  `ev_ae5cdbdd3631168b354bcfc3dded1f9ee8083ee19441814abf23b424a40601e4`, hosted generate GET
  `ev_f85164c1f3b6c75f3edfc9d87b3f19469f62940555a77b9f2a5f4402b721453f`, challenge leaderboard
  `ev_60d7c3da9bc3130aa3f9ab30d9f7a75480890a6ad28a3b2547e0dbf1d9829eb6`, star history
  `ev_f65356a83662add4e7f1ddc07b4bc9f07198e78d9bf977643ec02d55270f82fd`, 404
  `ev_0d73376816986e46f3c1862f8527a3a3b109efcbf12bd614a4578abafa2af4c4`, frame CDN
  `ev_e8bc98472fe4e22e27e4f3ee9d6b6f15442e937ce8a0d7b211dc21ca166a0297`.
- Related specs: Coach (tool contract and proposals) for §3.1 Coach integration and §3.3 tools; Home /
  day summary for R07.1; AI providers for STT key reuse and hosted access mode; backup/export for the
  workout state version; settings for language and share-link style.
