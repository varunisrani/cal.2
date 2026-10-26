# 04 — AI Coach chat: behavioural specification (clean-room)

Scope: the Coach tab (message list, composer, photo attachments, copy, Reset, empty state, goal-aware
prompt chips, loading and error states), multi-turn memory and its persistence, the per-turn context
the model receives, the read-only data tools and their result limits, the tool-call loop on each
provider wire format, the "a missing meal log is never a fast" rule, how chat reuses provider
selection / fallback / retry, and (briefly) exercise proposals. Out of scope: provider catalogue, key
storage, error taxonomy and fallback settings UI (`03-ai-providers.md`); BMR/TDEE, goals and the
weight forecast maths (`01-*.md`); fasting tracking itself (fasting area); workouts, voice/STT,
on-device models, hosted AI and i18n (later phases).
Reference: `apoorvdarshan/fud-ai` @ `10e14b67116c52b515d2389621266e32b3a99840`; shipped build checked:
store screenshots (Play 07/08, iOS 07/08) and the REA marketing-site capture
`ev_fa243a1fe14ed63cc6252910410ee973c07740c25cc70484db1eab53b44d991a`.
Sources studied: Android Coach UI, view model, chat service, context builder, tools, proposal
applier, result limiter, chat repository and models; iOS chat view, chat service, tools, chat store
and models; Android and iOS unit tests for proposals, workout tools, the result limiter, retry
threading and Gemini function-response shape. No REA run was needed: source and tests settle the
behaviour; screenshots confirm the shipped layout.

Conventions:
- "Turn" = one user message plus everything until the assistant reply is stored.
- "Round" = one HTTP request to the model inside a turn (a turn has 1..6 rounds).
- "Context block" = the profile/formulas/forecast/data-available text rebuilt every turn.
- "Card" = an exercise proposal shown under an assistant reply (workouts phase).
- Tool names below are **our** neutral names; the reference names are in section 2.
- "MUST" marks an invariant the reference defends with code or a test.

---

## 1. Overview

Coach is a chat tab. The user asks a question (optionally with one photo); the app builds a fresh
system prompt from the user's own data, sends the last few turns of history plus the new message to
the user's configured AI provider, lets the model call local read-only "data tools" for up to six
rounds, and stores the final text reply. Replies are not streamed: a typing indicator shows until the
whole reply arrives [obs]. The conversation persists on the device across launches until the user
taps Reset [obs].

The design point is **slim prompt + tools**: the prompt carries only the profile, formulas, the
weight forecast and data counts; anything historical (a date's meals, a weight trend in March,
fasting consistency) is fetched by the model through tools on demand [obs].

```
 Coach tab                 Chat engine                         Provider (BYOK)
 ─────────                 ───────────                         ───────────────
 user taps Send ──► persist user msg ──► snapshot data (profile, weights, body fat,
                    busy = true          measurements, foods, fasting, [workouts])
                                         build system prompt (context block)
                                         history = last 19 stored msgs (text only)
                                         ┌──────── round 1..6 ────────────────┐
                                         │ request(system, history, user, tools) ──► model
                                         │ ◄── tool calls? ── run tools locally│
                                         │      append calls + results, loop   │
                                         │ ◄── text? ── done                   │
                                         └─────────────────────────────────────┘
                                         on error: same turn from scratch on the
                                         fallback provider (if configured)
 typing dots ◄──────────────────────────
 reply bubble ◄── persist assistant msg (+ cards) ── busy = false
 error banner ◄── (on failure; user msg stays, no reply stored)
```

What the system guarantees [obs]:
- The model only reads data; it never writes. Workout changes are proposals the user must confirm.
- The context is recomputed every turn, so new logs are visible on the next question.
- A day with no food logged is never presented to the model as a fast or as a zero-calorie day.
- Each turn is bounded: at most 6 rounds; each round retries transient HTTP failures 3 times.

## 2. Reference names (rename in rebuild)

| Kind | Names (reference only; they become banned identifiers) |
|---|---|
| Binary / CLI and flags | none |
| Env vars | none |
| Files and folders | `ui/coach/CoachScreen.kt`, `CoachViewModel.kt`, `CoachVoiceInput.kt`, `services/ai/ChatService.kt`, `CoachContext.kt`, `CoachTools.kt`, `CoachProposalApplier.kt`, `ToolResultLimiter.kt`, `data/ChatRepository.kt`, `models/ChatMessage.kt`, `CoachExerciseProposal.kt`; iOS `Views/ChatView.swift`, `Services/ChatService.swift`, `Services/CoachTools.swift`, `Stores/ChatStore.swift`, `Models/ChatMessage.swift`, `Models/CoachExerciseProposal.swift`, `Services/AIRequestErrorPolicy.swift` |
| HTTP routes / URL schemes | none of its own (calls vendor APIs; hosted path goes to the reference's own worker `/gemini`, later phase) |
| RPC methods / events / commands | Model-facing tool names: `get_data_summary`, `get_weight_history`, `get_body_fat_history`, `get_calorie_totals`, `get_food_entries`, `get_fasting_history`, `get_workout_history`, `get_workout_plans`, `get_workout_preferences`, `get_training_summary`, `get_exercise_lift_history`, `search_exercise_library`, `propose_custom_exercise`, `propose_add_exercise_to_day` |
| Settings and storage keys | `coachChatHistory` (whole conversation as one JSON string, both platforms); Android DataStore `userContext`, `maxResponseTokens`, `aiRequestTimeoutSeconds`, `separateTextProviderEnabled`; iOS `aiMaxResponseTokens`, `aiRequestTimeoutSeconds`, `heightUnit`, `weightUnit` |
| Persisted message fields | Android `id, role (user/assistant), content, attachmentImageBase64, timestamp, proposals`; iOS `id, role, content, timestamp, attachmentImageData, exerciseProposals` (different keys: the two platforms' stored chats are not interchangeable) |
| Proposal fields / enums | `id, kind (custom_exercise / add_to_day), status (pending / added / dismissed), name, itemId/itemID, category, equipment, primaryMuscles, secondaryMuscles, instructions, dateKey, sets, reps, durationMinutes, entryId/entryID` |
| Other (classes, tags) | `ChatService`, `CoachTools`, `CoachContext`, `ChatRepository`, `ChatStore`, `CoachProposalApplier`, `CoachExerciseProposalApplier`, `CoachProposalCollector`, `CoachExerciseProposalCollector`, `ToolResultLimiter`, `CoachViewModel`, `CoachUiState`, `ChatView`, log tag `FudAICoach`, OpenRouter attribution header values (the reference's repo URL and brand name) |

Our neutral tool names used in section 3 (map 1:1 to the reference tool names above, same order):
`data_overview`, `weight_log`, `body_fat_log`, `daily_energy_totals`, `food_log`, `fasting_log`,
`workout_log`, `workout_plan_days`, `training_profile`, `training_rollup`, `lift_log`,
`exercise_search`, `suggest_new_exercise`, `suggest_diary_exercise`.

Third-party protocol names used by this area (keep exact; verify against vendor docs):
- **OpenAI-compatible Chat Completions**: `POST {base}/chat/completions`; headers `Content-Type`,
  `Authorization: Bearer <key>` (omitted when no key); body `model`, `messages` (roles `system`,
  `user`, `assistant`, `tool`), `tools: [{type:"function", function:{name, description, parameters}}]`,
  `tool_choice: "auto"`, `max_tokens` or `max_completion_tokens`, `reasoning_effort`, OpenRouter
  `reasoning: {effort, exclude}`, Qwen `enable_thinking: false`; user content parts
  `{type:"text", text}` and `{type:"image_url", image_url:{url:"data:image/jpeg;base64,…"}}`;
  response `choices[0].message.{content, tool_calls[{id, function:{name, arguments}}], reasoning,
  reasoning_content, reasoning_details}`, `choices[0].finish_reason` (`length`, `error`), top-level
  `error.message`; tool result message `{role:"tool", tool_call_id, content}`. OpenRouter
  attribution headers `HTTP-Referer`, `X-Title`. Model ids that force `reasoning_effort:"none"`:
  `gpt-6-sol`, `gpt-6-luna` (and `-…` variants).
- **Anthropic Messages**: `POST {base}/messages`; headers `x-api-key`, `anthropic-version: 2023-06-01`;
  body `model`, `max_tokens`, `system`, `tools: [{name, description, input_schema}]`, `messages`;
  blocks `text`, `image {source:{type:"base64", media_type:"image/jpeg", data}}`,
  `tool_use {id, name, input}`, `tool_result {tool_use_id, content}`. Browser calls additionally need
  `anthropic-dangerous-direct-browser-access: true` [inf, vendor docs; owned by 03].
- **Gemini generateContent**: `POST {base}/models/{model}:generateContent`; header `X-goog-api-key`;
  body `systemInstruction.parts[].text`, `contents[{role:"user"|"model", parts}]`,
  `tools:[{functionDeclarations:[{name, description, parameters}]}]`; parts `text`,
  `inlineData{mimeType, data}`, `functionCall{name, args, id?}`,
  `functionResponse{name, response, id?}`; response `candidates[0].content.parts`.

## 3. Behaviour

### 3.1 Coach tab layout and states

- **Trigger / inputs:** the Coach bottom-nav tab [obs, screenshots Play 07/08].
- **Layout (top → bottom)** [obs]:
  1. Top bar: centred title "Coach"; a circular Reset button at the trailing edge (counter-clockwise
     arrow). Disabled and greyed when there are no messages.
  2. Body: **empty state** when there are no messages, otherwise the **message list**.
  3. Prompt-chip row (only when there is at least one message).
  4. Composer capsule (always), lifted above the on-screen keyboard.
- **Empty state** [obs]: a round hero icon (chat bubbles), a title ("Ask your Coach"), one sentence
  saying the coach can see the user's log and goals and what to ask, then up to **4** prompt cards in
  a 2-column grid (each card: small "↗" icon + up to 3 lines of text, min height 70). Tapping a card
  sends it immediately. Cards are disabled while a reply is pending. iOS words the sentence around
  nutrition, goals and workout diary; Android around weight history, calorie log and goals.
- **Message list** [obs]: vertical list, 14 spacing. User bubbles right-aligned (accent gradient, white
  text, max width ~320, 48 gutter on the left); assistant bubbles left-aligned with a small round
  sparkle badge before them (neutral glass surface, 48 gutter on the right). Below the last message:
  the typing indicator while pending, then the error banner if any.
- **Typing indicator** [obs]: inside an assistant-shaped bubble, 3 dots; every **350 ms** the active
  dot advances (0→1→2→0); the active dot is full opacity and scaled 1.15, others 0.3 opacity.
- **Error banner** [obs]: inline row at the end of the list, warning icon + red caption text on a
  faint red-tinted rounded card (radius 14). Not a toast; it stays until the next send, a proposal
  action, or (iOS) Reset.
- **Auto-scroll** [obs]: on message count change and on pending start (Android: to last message;
  iOS: to the typing row while pending, to last message otherwise, and again when the input gains
  focus or the keyboard finishes showing).
- **Keyboard** [obs]: dismissed when the user drags the list or taps the message area (Android only
  reacts to user drags, not programmatic scrolls, so auto-scroll after sending does not steal focus).
- **States:** `Empty → (send) → Pending → Replied | Failed`; `Replied/Failed → (send) → Pending`;
  any non-empty state → (Reset confirmed) → `Empty`.

### 3.2 Composer and photo attachments

- **Composer** [obs]: rounded capsule (radius 24) containing, left to right: attach control(s), a
  multi-line text field (placeholder "Ask Coach…", grows to **5** lines), and one trailing control.
  Android shows two round buttons (photo library, camera); iOS shows one "+" menu (Camera / Photo
  Library) whose icon switches to a photo glyph while an image is attached. Attach controls are
  disabled while pending.
- **Trailing control** [obs]: Send (up-arrow on accent gradient) when `canSend`; otherwise a mic
  button for voice input (later phase). `canSend = not pending AND (trimmed text ≠ "" OR image attached)`.
  Android also sends on the keyboard's Send action.
- **Attachment preview** [obs]: Android: 88×70 thumbnail inside the capsule with a small × to remove.
  iOS: a row above the capsule with a 62×62 thumbnail, "Image attached" + a hint line, and an ×.
  At most **one** image per message [obs].
- **Image pipeline** (numbers exact) [obs]:
  - On pick/capture (Android only): re-encode to JPEG, longest side ≤ **1800 px**, quality **86**.
  - On send, two copies: model copy longest side ≤ **1600 px**, quality **78**; stored thumbnail
    longest side ≤ **700 px**, quality **68**. Never upscaled. Always sent as `image/jpeg`.
  - Android falls back to the original bytes if a resize fails; iOS shows "failed to process the
    image" and sends nothing.
  - iOS shows "could not load that photo" if the picker data cannot be read and "camera not
    available" when there is no camera. Android asks for camera permission first; a denial does
    nothing visible [obs].
- **Image-only send** [obs]: if the text is empty but an image is attached, the stored and sent user
  text is a fixed short instruction to analyse the image.
- **Bubble with photo** [obs]: the thumbnail appears at the top of the user bubble (Android full
  bubble width × 150, iOS 196 × 140, radius 14), text below.

### 3.3 Goal-aware prompt chips

- **Inputs:** the profile goal and whether any completed workout exists [obs].
- **Chip sets** (described, not quoted; 4 chips each) [obs]:

| Goal | Chips, in order |
|---|---|
| Lose | 30-day weight projection · faster loss, safely · is my intake too high · dinner idea |
| Gain | 30-day weight projection · healthy gain · is my intake high enough · protein-rich foods to add |
| Maintain | is my weight stable · my average intake · macro advice · my trend |
| No profile (Android only) | how am I doing this week · 30-day weight projection · advice based on my log (3 chips) |

  When the user has ≥ 1 completed workout, a training-review chip is **prepended** (Android: recent
  training; iOS: last 4 weeks of training) [obs]. The empty-state grid shows only the first 4, so the
  training chip pushes the last goal chip out of the grid [obs].
- **Chip row** (non-empty conversation) [obs]: horizontally scrolling, starts with a small sparkle
  disc, then capsule chips (min height 44, accent text on tinted glass). Disabled while pending.
- **Tap behaviour** [obs]: sends the chip text immediately as a user message. The text sent is always
  the **English** chip text, even when the UI is localised (displayed text is localised). Android
  clears the draft **and drops any attached image**; iOS puts the chip text in the draft and sends
  it **together with any attached image**. (Platform difference; see R04.14.)
- Chips update live when the goal or workout history changes [obs].

### 3.4 Message rendering and copy

- **User text** is shown verbatim (no markdown) [obs].
- **Assistant text** goes through a small markdown renderer [obs]: block level — headings `#`..`###`
  (3 sizes), bullets (`- `, `* `, `+ `), numbered items (`<digits>. `), fenced code blocks (monospace
  on a tinted box), blank lines separate blocks; every other line is its own paragraph. Inline —
  bold `**…**`, italic `*…*`/`_…_`, inline code, links `[text](url)`. Android styles links (accent,
  underlined) but they are **not tappable** [obs]; iOS renders inline markdown with the platform
  renderer, where links are tappable [inf].
- **Copy** [obs]: iOS enables text selection on both user and assistant bubbles (long-press shows the
  system Copy/select menu). Android has **no** copy or selection on chat bubbles. The PWA needs an
  explicit affordance (see section 5).
- **Accessibility** [obs]: Reset has an accessible label; hero and badges are hidden from screen
  readers; proposal buttons announce which exercise they act on.

### 3.5 Reset

- **Trigger:** Reset button (only enabled when messages exist) [obs].
- **Flow:** confirmation dialog: title "Reset Chat", one-line warning that all messages are cleared
  and it cannot be undone, destructive "Reset" and "Cancel" [obs]. Confirm → stored conversation
  replaced by an empty list (persisted immediately); iOS also clears the error banner [obs].
- **Not guarded against an in-flight reply** [obs]: Reset is enabled while pending; the late reply is
  then appended to the fresh, empty conversation (R04.6).
- Reset also happens as part of "delete all data" (iOS) [obs].

### 3.6 Send flow, busy state and errors

- **Flow** [obs]:
  1. Guard: ignore if pending, or if text is blank and no image.
  2. Prepare images (3.2). Clear draft and attachment.
  3. **Persist the user message first** (with thumbnail), then set pending.
  4. Read history = the last **20** stored messages **minus the one just stored** → at most **19**
     earlier messages (3.7).
  5. Snapshot all data lists (profile, weights, body-fat readings, body measurements, food entries,
     fasting sessions, unit prefs; workouts/exercise library when that phase exists).
  6. Run the chat engine (3.8–3.12) with a fresh per-turn proposal collector.
  7. Success → persist an assistant message (trimmed text + any proposal cards); pending = false.
  8. Failure → pending = false, show the error banner. **The user message stays stored with no
     reply**; there is no retry button [obs].
- **Busy flag**: iOS sets it synchronously before any await. Android sets it only after the user
  message is persisted, so two very fast chip taps can start two turns [inf, R04.5].
- **Errors the user can see** (meaning, not copy) [obs]:
  - No profile yet (Android only): finish onboarding first.
  - No API key for the selected provider; invalid base URL.
  - Mapped HTTP/network failures from area 03 (offline, cannot connect, timed out, key rejected,
    out of credits, daily quota, quota, model/endpoint unavailable, rate limit, overloaded, generic).
  - Unreadable response (no candidates/choices/content, or empty final text).
  - Reply truncated twice (OpenAI-compatible only, 3.11).
  - Round limit reached (6 rounds without a final text).
  - Android classifies engine-raised messages by keyword, so "truncated twice" and "round limit"
    surface as the **generic** failure text; iOS shows them as "API error: <message>" [obs, R04.11].
  - Proposal apply failures (3.14): exercise no longer in library, name already taken, save failed.
- **Cancellation**: leaving the screen cancels the request on Android and is not shown as an error;
  iOS keeps the request running in a detached task [obs]. Cancellation never triggers fallback [obs].
- **Diagnostics** [obs]: Android logs only exception class names and top 3 frames (never messages,
  which can contain URLs, response text or keys). Tested.

### 3.7 Multi-turn memory

- **What is persisted** [obs]: the whole conversation as one JSON array under one key-value entry.
  `Message { id: uuid, role: user|assistant, text, photoThumb?: jpeg (base64 on Android), at: timestamp,
  cards?: Card[] }`. Every append rewrites the whole array [obs].
- **Retention:** unlimited — every message and every thumbnail is kept until Reset [obs]. No count,
  size or age cap (R04.8).
- **Survives launches** [obs]: yes; loaded at start. iOS reloads after a cloud-backup restore, and the
  iOS cloud backup includes the conversation (all app defaults are backed up except a deny list that
  does not name it) [obs/inf].
- **Context window sent to the model** [obs]:
  - Up to **19** earlier messages + the new user message (= 20 messages; Android on-device model 12,
    iOS on-device 8 — later phase).
  - Earlier messages are sent **as text only**: earlier photos are never re-sent (R04.2).
  - An assistant message with cards is sent as its text followed by one line per card stating what
    was proposed and its outcome (waiting / added / dismissed), so the model knows what the user did.
  - Roles map to `user`/`assistant` (OpenAI, Anthropic) or `user`/`model` (Gemini).
  - The system prompt is **not** stored; it is rebuilt every turn from current data.
- **Concurrency** [obs]: Android serialises read-modify-write of the stored array behind a mutex so a
  reply append and a card tap cannot overwrite each other.
- **Corruption** [obs]: an unreadable stored array decodes as empty; the next append then overwrites
  the unreadable blob (silent loss, R04.7). Conversations saved before cards existed still decode
  (tested).

### 3.8 Per-turn context (system prompt by intent)

The system prompt is **reference-owned prose**; only its intent, structure and constraints are
specified here. It is assembled fresh each turn, in this order [obs]:

1. **Persona and constraints.** Persona: the in-app coach for food, energy balance and body-weight
   goals (training is added to the remit only when workouts are enabled). Constraints: answers
   rest on the user's own numbers and stay factual; no medical advice, with a referral to a
   clinician when health questions come up; default length about 2–5 sentences, longer only on
   request. Reply language is fixed to English (see open question 1).
2. **Today.** Today's local date (ISO `yyyy-MM-dd`) and IANA time-zone id, so relative dates in the
   user's question resolve to concrete tool ranges.
3. **Tool-use policy.** Default: answer from the context block. A tool is warranted only when the
   question needs data the block lacks (a particular earlier day, a long span, single meals, a raw
   series). Followed by a few worked question → tool pairs (a month's weights → weight log; one
   day's meals → food log; fasting regularity → fasting log; span of the data → overview; workout
   pairs only when workouts exist). When cards are possible: look the exercise up first, then
   propose; the reply must not state that anything was saved. When cards are not possible
   (on-device models, no tools) that guidance is left out so the reply never refers to a card that
   cannot appear [obs].
4. **Context block** (shared with the later voice assistant so both describe the user identically):
   - *Profile*: gender, age, height (cm 0 dp, or inches 1 dp, per the height-unit preference),
     current weight (kg or lb, 1 dp, per the weight-unit preference; lb = kg × 2.20462), activity
     level, goal (lose / maintain / gain), goal weight?, body fat % (integer)?, goal body fat %?,
     and — only for kJ users — an energy-unit rule: all numbers given are kcal; state energy to the
     user in kJ (1 kcal = 4.184 kJ, whole numbers); convert user kJ amounts to kcal in tool arguments.
   - *Formulas*: which BMR formula is active (body-fat formula when the profile uses body fat;
     otherwise the standard formula, noting whether body fat is unset or the override is off), BMR
     and TDEE (kcal/day, integers; TDEE = BMR × activity multiplier), the effective calorie goal and
     macro targets (g). Values come from area 01.
   - *Forecast* (area 01's forecast over the last 90 complete days, today excluded): when it has
     enough data (≥ 2 days with food logged and ≥ 2 weights): days of food logged, weight entries
     used, average daily intake (over **logged days only**), signed daily energy balance, predicted
     weekly change from diet and observed weekly change from the scale (signed, 2 dp, kg/week or
     lb/week), expected weight at 30 / 60 / 90 days, days to goal at current pace (if any), and a
     possible-under-logging note when predicted and observed differ by > **0.3 kg/week**. Otherwise a
     line saying there is not enough data yet and to encourage logging.
   - *Data available*: total counts of weights, body-fat readings and food entries with a pointer to
     the overview tool; the count of **explicitly tracked** fasting sessions plus the
     missing-log rule (3.13); when workouts are enabled, workout/plan counts plus a firewall:
     training data may shape training advice only and is barred from feeding the energy targets,
     the forecast or any expenditure figure.
   - *Latest body measurements* (only if the newest record has any value): the sites in cm (1 dp),
     waist-to-hip and waist-to-height ratios, a circumference-based body-fat estimate and frame
     size, plus an interpretation hint: falling waist size while scale weight is flat or rising
     signals body recomposition rather than a stall; the circumference body-fat figure is
     approximate.
5. **Answer-shape rule.** Weight-change "how to" questions get a specific daily calorie number
   plus at least one concrete change; projection questions must quote the computed forecast.
6. **User's custom instructions** (free text from AI settings, trimmed; omitted when empty), under
   its own heading, last [obs].

Not in the context [obs]: today's intake so far, remaining calories/protein, water, recent daily
totals, and individual meals. Questions like "what should I eat for dinner" therefore need a tool
call for today's food (open question 2).

### 3.9 Data tools (retrieval layer)

- **Who:** the chat engine executes tools locally, synchronously, against the data snapshot taken
  at send time [obs]. Tools are pure reads.
- **Catalogue** [obs]: 6 nutrition tools (always offered), 6 workout tools (Android: always offered,
  even with no workouts; iOS: only when workout access is enabled — chat passes enabled = true), 2
  proposal tools (only offered by Coach chat, never by the voice assistant, because only chat can
  show a card; tested).
- **Shared semantics** [obs]:
  - Dates are ISO `yyyy-MM-dd` **local** days in the device time zone, Gregorian, inclusive at both
    ends (from 00:00 of `from` to the last instant of `to`).
  - Range defaults: `to` missing or unparseable → today; `from` missing or unparseable → `to` − 30
    days. Bad dates are **silently defaulted**, never rejected; the result echoes the effective
    `from`/`to` so the model can notice.
  - `limit` (optional integer): clamped to `[1, max]`; missing → tool default. Lists are sorted
    **oldest first** and the limit keeps the **first** (oldest) N (R04.10).
  - Every result is a JSON object string. Problems come back as `{ error: <message> }` results, not
    exceptions, so the model can correct itself. Unknown tool → error listing the available tools.
  - Android serialises nulls explicitly; iOS uses sorted keys and JSON null [obs].
- **Parameter schemas** [obs]: one JSON-Schema source of truth per tool, wrapped per provider (3.11).
  Range tools declare `from`, `to` as required strings and `limit` as an optional integer; the
  overview and training-profile tools take no parameters.

Nutrition tools (v1):

| Tool (ours) | Params | Default / max limit | Returns (conceptual) |
|---|---|---|---|
| `data_overview` | none | — | per dataset `{count, firstDate?, lastDate?}` for weights, body-fat readings, foods; fasting `{count, anyActive}`; (workouts `{count, first, last}`, plans `{count}` when enabled) |
| `weight_log` | from, to, limit? | 365 / 365 | `{from, to, count, items: [{date, kg (1 dp), lb (1 dp)}]}` |
| `body_fat_log` | from, to, limit? | 365 / 365 | `{from, to, count, items: [{date, percent}]}` — Android truncates the percent to an integer, iOS rounds |
| `daily_energy_totals` | from, to, (limit ignored) | — | `{from, to, daysWithData, items: [{date, kcal}]}` — one row per local day **that has at least one log**; days with no logs are absent, never 0 |
| `food_log` | from, to, limit? | 200 / 365 | `{from, to, count, items: [Food]}` |
| `fasting_log` | from, to, limit? | 200 / 365 | `{from, to, count, items: [Fast]}` |

- `Food { entryId, date (day only, no time), name, kcal, proteinG, carbsG, fatG, meal: breakfast|
  lunch|dinner|snack|other, source: photo|label|barcode|text|manual, servingG?, plus every optional
  nutrient that is present and finite: sugar, added sugar, fibre, saturated / mono / poly fat,
  cholesterol, caffeine, supplemental nutrients (g), sodium, potassium, trans fat, calcium, iron,
  magnesium, zinc, vitamins A, C, D, B12, E, K, folate, omega-3 — each with its unit in the key }` [obs].
- `Fast { status: active|completed, startedAt (ISO timestamp), endedAt? (null while active),
  durationMin (floor; active sessions measured to now), goalMin, goalReached (duration ≥ goal) }`.
  A session is included when it **overlaps** the range (active ones extend to now) [obs].

Workout tools (later phase; summary only) [obs]: `workout_log` (completed sessions in range, default
100 / max 200; one authoritative snapshot per day when duplicates exist), `workout_plan_days` (plans
with exercises, default window today − 14 … today + 90, max 120; timer state running/paused/saved;
running or paused time is unsaved), `training_profile` (target muscles, injuries, equipment,
schedule, split, RPE scale, strength baselines in kg), `training_rollup` (per-exercise sessions, sets,
reps, volume kg, best load, average RPE kept separate per RPE scale, plus burn and minutes),
`lift_log` (one lift by name or library id, default 60 / max 120 dated sessions over the last 365
days, newest first, best load kg, last session; completed sessions only), `exercise_search` (query
required; optional muscle and equipment filters with alias mapping; default 10 / max 20 results;
ranked by whole-name, all-words, prefix matches; filters ignored with a flag when they would hide
every match).

### 3.10 Tool-result size limit

- **Where applied** [obs]: Android hosted-Gemini chat path and the voice assistant, at **60,000**
  characters of JSON. **Not** applied to BYOK chat on either platform; iOS has no limiter at all.
- **Algorithm** [obs, tested]:
  1. If the result's length ≤ limit → unchanged.
  2. Parse as a JSON object. If it is not an object, or has no array field → replace the whole result
     with `{ error: "result too large", note }`.
  3. Pick the array field whose serialised text is longest.
  4. Binary-search the largest `k` in `[0, n − 1]` such that the object with that array cut to its
     first `k` items, plus `truncated: true`, `omittedItems: n − k` and a note asking for a narrower
     date range, serialises to ≤ limit. All other fields are kept **as they were**, so `count` still
     reports the untrimmed number (tested: count 2000, kept > 100).
  5. If even `k = 0` does not fit → the "too large" error object.
- The leading (oldest) items are the ones kept [obs].

### 3.11 Tool-call loop per provider format

Common to all three [obs]:
- At most **6 rounds** per turn. Every round is a full request carrying the system prompt, the
  history, the new user message and every tool call/result so far. If round 6 still returns tool
  calls, the turn fails with the round-limit error.
- Tool calls take precedence over any text in the same response: run every call, append, loop.
- The final answer is the trimmed text; empty text → unreadable-response error (Android; iOS
  OpenAI-compatible accepts an empty string).
- The tool definition list is the same three tool sets wrapped per format; descriptions are the
  reference's model-facing prose (rewrite ours by intent: what the tool returns, when to call it,
  and for the fasting tool, that only tracked sessions count and an unlogged day proves nothing).

**OpenAI-compatible** (most providers) [obs]:
- Messages: `system` (prompt) → history as plain `user`/`assistant` strings → new `user` message:
  a plain string, or with a photo `[text part, image_url part]` (Android: text first; iOS: image first).
- Body extras: `tool_choice: "auto"`; output cap under `max_completion_tokens` for OpenAI and for
  custom-OpenAI endpoints whose model id starts `gpt-5`, `gpt-6`, `o1`, `o3`, `o4`, else `max_tokens`
  (value = user setting, default **1024**); Qwen adds `enable_thinking: false`; OpenAI/custom
  `gpt-6-sol`/`gpt-6-luna` models add `reasoning_effort: "none"` (tool calls need non-reasoning
  mode); OpenRouter adds `reasoning` from the user's effort setting.
- Response checks: unparsable JSON → unreadable; no choice → provider error message if any, else
  unreadable; `finish_reason: "error"` → provider error.
- **Compact retry** (once per round): if `finish_reason` is `length`, or the message has no tool
  calls, no content but some reasoning text → resend the same round in compact mode (OpenRouter:
  `reasoning: {exclude: true, effort: "low"}`; other providers send an identical body). A second
  `length` → "truncated twice" error.
- Tool calls: append the assistant message **verbatim**, then one `{role: "tool", tool_call_id,
  content: <result string>}` per call. Malformed arguments parse as `{}`. Calls without an id or name
  are skipped (R04.12).

**Anthropic** [obs]:
- `system` = prompt string; history as plain `user`/`assistant` strings; new user content is a
  string, or `[text block, image block]` with a photo (Android order; iOS puts the image first).
  `max_tokens` = user setting.
- If any `tool_use` blocks: append `{role: "assistant", content: <the full returned content array>}`,
  then one `user` message holding a `tool_result` block per call (`tool_use_id`, string content).
- Else: the first non-empty `text` block is the answer. `stop_reason` is not inspected, so a
  `max_tokens` cut is shown as a complete reply (R04.15).

**Gemini** [obs]:
- `systemInstruction` = prompt; history as `user`/`model` text parts; new user parts
  `[inlineData{mimeType:"image/jpeg"}?, {text}]` (image first on both platforms).
- **No `generationConfig`** is sent: the output-token setting is not applied to Gemini chat [obs].
- If any part has `functionCall`: append `{role: "model", parts: <returned parts verbatim>}` (keeps
  any thought signatures), then `{role: "user", parts: [functionResponse…]}` where each response is
  `{name, response: {content: <result parsed back into a JSON object>}, id: <the call's id when it
  had one>}` (tested: id echoed when present, omitted otherwise, no part when the name is missing).
  A result that fails to parse becomes `{}`.
- Else: concatenate every text part, trim; empty → unreadable. Missing candidates/content/parts
  (e.g. a blocked prompt) → unreadable.

### 3.12 Reuse of area 03: provider choice, fallback, retry, timeouts

- **Primary choice** [obs]: no photo **and** "separate text provider" enabled → the text provider
  and its text model; otherwise the main (vision) provider and model. A per-provider custom base URL
  overrides the default. Missing key (when the provider needs one) → no-key error before any request.
- **Retry per request** [obs, tested on Android]: HTTP **429, 503, 529** are retried after **1 s, 2 s,
  4 s** (up to 4 attempts); any other non-2xx fails at once and is classified by status and body
  text (area 03). Network exceptions are not retried. Retries happen per round, inside the loop.
- **Fallback per turn** [obs]: on any failure except cancellation, if fallback is enabled for this
  kind of request (photo → image fallback settings; no photo → text fallback settings), the **whole
  turn is re-run from scratch** on the fallback provider (fresh tool loop, same history). The
  fallback is skipped when it equals the primary (same provider, model and base URL), lacks a needed
  key, or has no base URL. Proposal cards collected during the failed attempt are discarded
  (tested). Error surfaced when both fail: Android the fallback's error; iOS the fallback's error
  unless the primary was the on-device model (then the primary's).
- **Timeouts** [obs]: Android cloud requests connect 15 s, write 30 s, read 60 s, whole call 75 s
  (per round); local/custom-OpenAI endpoints use the user's timeout (30–600 s, default 180 s) for
  call/read/write. iOS cloud requests use the platform default; local/custom use the same setting.
- **Hosted mode** (later phase) [obs]: always the Gemini loop through the reference's proxy, every
  round metered, 60,000-char tool-result cap, no BYOK fallback; quota errors open a paywall.

### 3.13 A missing meal log never counts as fasting

- The rule appears in two model-facing places [obs]: the data-available section (the count is of
  *explicitly tracked* fasting sessions, and the model is told that an empty food day is not
  evidence of fasting) and the fasting tool's description (sessions the user started and stopped
  are the only fasting facts).
- The data layer supports it [obs]: fasting results come only from tracked sessions; daily totals
  omit unlogged days instead of reporting 0; the forecast averages intake over logged days only and
  excludes today's in-progress day.
- The rebuild MUST keep all three: prompt rule, tool description, and data shapes that never
  synthesise empty days (R04.16).

### 3.14 Exercise proposals (workouts phase; brief)

- **What** [obs]: two tools let the model *propose* (a) a new custom exercise for the library, or
  (b) adding one library exercise to the workout diary on a date. Nothing is written by the tool.
  The result tells the model the proposal is pending user confirmation and that it must not say it
  was saved (tested).
- **Validation at proposal time** [obs, tested]:
  - New exercise: name required, trimmed, ≤ **80** chars; refused if the library already has that
    name (case-insensitive) — the error names the existing id; category one of 7 library categories
    (default strength); equipment one of 12 library values; primary muscles ≥ 1 from 17 library
    muscles (list or comma string; case-insensitive; deduped); secondary muscles exclude primaries;
    instructions (string lines or list) ≤ **1500** chars joined. Values stored in library title case.
    A new library id is chosen **now**.
  - Diary add: library id required and must exist; date optional (default today), ISO, within
    **±365 days**; sets 1–**12**, reps 1–**999**, minutes 1–**1440**, whole numbers (numeric strings
    accepted; booleans and fractions refused); reps/minutes only for today or earlier (future = sets
    only); cardio exercises take minutes, not sets/reps. A new diary entry id is chosen **now**. The
    result flags when that exercise is already on that day.
- **Per reply** [obs]: a repeated identical proposal returns the earlier card (same name for new
  exercises; same id/date/sets/reps/minutes for diary adds); max **10** cards per reply, then an
  error result; the collector is cleared when fallback re-runs the turn.
- **Card UI** [obs]: under the assistant bubble: kind title, exercise name, detail lines (category,
  equipment, muscles / date, sets, reps, minutes), instructions clamped to 4 lines, then Add
  (primary) + Dismiss (outlined), min height 44, disabled while that card is being resolved.
  Resolved cards show "Added" (green check) or "Dismissed" (grey ×) instead of buttons.
- **Apply rules** [obs, tested]: Add runs only while the card is pending; the card is marked added
  only after the write succeeds (a failed write leaves it pending for retry); a resolved card never
  writes again and cannot change outcome; Dismiss writes nothing. Writes are idempotent through the
  pre-chosen ids (applying twice → one exercise / one diary entry). At apply time a new-exercise card
  is refused if the name was taken meanwhile (by another card, the user, or a catalogue update);
  a diary card fails if its exercise was deleted. Diary entries get N sets with the proposed reps,
  or a saved timer of minutes × 60 s for timed work. Proposal dates are ISO Gregorian whatever
  calendar the phone uses (tested on iOS).

### 3.15 Voice, on-device and hosted (later phases; boundaries only)

- Voice [obs]: hold-to-record mic in the composer (slide left past 90 pt to cancel; a quick tap
  < 0.35 s locks recording with explicit Send/Cancel); the transcript is sent like typed text.
- On-device models [obs]: no tools; history as a "User:/Assistant:" transcript (Android last 12,
  iOS last 8); the prompt drops the card line and adds a rule to answer only from the context block.

### 3.16 Platform differences (decide once for the PWA)

| Topic | Android | iOS |
|---|---|---|
| Copy text | none | long-press selection on all bubbles |
| Attach control | two buttons | "+" menu |
| Chip + attached photo | photo dropped | photo sent with chip |
| Training chip text | recent training | last 4 weeks of training |
| Missing profile | error, user msg kept | not possible |
| Busy flag | set after persisting | set synchronously |
| Workout tools | always offered | gated by a flag (chat: on) |
| Error text | keyword-classified, engine messages become generic | "API error: <message>" |
| Leaving tab mid-reply | request cancelled | request continues |
| Image part order (OpenAI/Anthropic) | text then image | image then text |
| Body-fat % in tool result | truncated | rounded |

## 4. File map (what to read in the Read step)

| Sub-area | Reference path | Lines | Read what | Docs / tests to read with it |
|---|---|---|---|---|
| Coach UI (Android) | `A/ui/coach/CoachScreen.kt` | 1407 | layout, chips row, composer, bubbles, proposal card, markdown renderer (bottom) | screenshots Play 07/08 |
| Coach state (Android) | `A/ui/coach/CoachViewModel.kt` | 259 | `chipsFor`, `send`, proposal add/dismiss, failure summary | `T/ui/coach/CoachFailureSummaryTest.kt` (29) |
| Voice composer | `A/ui/coach/CoachVoiceInput.kt` | 385 | header only (later phase) | — |
| Chat engine | `A/services/ai/ChatService.kt` | 679 | `sendMessage` (fallback), `runProvider`, three tool loops, user-content builders; prompt by intent only | `T/services/ai/OpenAITokenLimitParameterTest.kt`, `OpenRouterReasoningEffortTest.kt` |
| Context block | `A/services/ai/CoachContext.kt` | 123 | all (intent only) | — |
| Tools | `A/services/ai/CoachTools.kt` | 1261 | executors 104–708, proposals 710–899, schemas 1014–1097, search ranking 1108–1253 | `T/services/ai/CoachProposalToolsTest.kt` (220), `CoachWorkoutToolsTest.kt` (776) |
| Result limiter | `A/services/ai/ToolResultLimiter.kt` | 56 | all | `T/services/ai/ToolResultLimiterTest.kt` (50) |
| Proposal apply | `A/services/ai/CoachProposalApplier.kt` | 94 | all | `T/data/CoachProposalApplyTest.kt` (268) |
| Persistence | `A/data/ChatRepository.kt` | 65 | all | `A/data/PreferencesStore.kt` 1524–1533 (blob read/write) |
| Models | `A/models/ChatMessage.kt`, `CoachExerciseProposal.kt` | 29, 128 | all | — |
| Retry / errors | `A/services/ai/RetryPolicy.kt`, `AiError.kt` | 139, 91 | retry loop, kind classification | `T/services/ai/RetryPolicyThreadingTest.kt` (162) |
| Provider options | `A/services/ai/OpenAICompatibleClient.kt` | 239 | lines 157–196 | — |
| Forecast | `A/services/WeightAnalysisService.kt` | 267 | `compute` (owned by 01) | — |
| Coach UI (iOS) | `I/Views/ChatView.swift` | 1248 | `suggestedPrompts`, `send`, composer, `MessageBubble`, `CoachProposalCard` | screenshots iOS 07/08 |
| Chat engine (iOS) | `I/Services/ChatService.swift` | 1036 | fallback + error policy, loops, `send` retry, friendly messages | `IT/AIModelRegistryTests.swift` 355–382 (function-response id) |
| Tools (iOS) | `I/Services/CoachTools.swift` | 1262 | gating 60–65 and 214–259, defaults, `parseRange` | `IT/CoachWorkoutToolsTests.swift` (782) |
| Store (iOS) | `I/Stores/ChatStore.swift` | 103 | all | `IT/CoachExerciseProposalTests.swift` (436) |
| Models (iOS) | `I/Models/ChatMessage.swift`, `CoachExerciseProposal.swift` | 39, 202 | context lines, ISO calendar | — |

Giant files: `CoachScreen.kt` [1407] — search `EmptyState`, `InputBar`, `ProposalCard`,
`parseMarkdownBlocks`; `CoachTools.kt` [1261] — search `execute(name`, `propose(`,
`parameterSchemaFor`, `rankedLibraryMatches`; `ChatService.swift` [1036] — search `sendMessage`,
`callGemini`, `send(url`.

## 5. Minimum viable subset (for the PWA)

Maps directly (v1):
- Coach tab with empty state, message list, typing indicator, inline error banner, Reset with
  confirmation, goal-aware chips (12 goal chips; no training chip in v1), English chip text.
- Non-streaming reply with the 6-round tool loop on all three wire formats (Gemini,
  OpenAI-compatible, Anthropic) using the provider/fallback/retry/timeout machinery from area 03.
- Context block: profile, formulas, forecast (from 01), data-available counts, latest body
  measurements, kJ rule, user custom instructions.
- The **6 nutrition tools** only, with the iOS-style gate: workout and proposal tools are neither
  advertised nor mentioned in the prompt; a stray call gets a "not available" error result.
- Apply the 60,000-char result limiter to **every** provider (fixes R04.9).
- The missing-log ≠ fasting rule in prompt, tool description and data shapes.
- Markdown rendering for assistant bubbles (tappable links opening in a new tab, `rel=noopener`).

Needs a web equivalent:
- Photo: `<input type="file" accept="image/*" capture="environment">` (camera) and a plain
  file input (library); or `getUserMedia` for an in-app camera. Resize via canvas /
  `createImageBitmap` + `OffscreenCanvas.convertToBlob({type:'image/jpeg', quality})` to the same
  1600/0.78 (model) and 700/0.68 (thumbnail) targets.
- Copy: a long-press / context-menu "Copy" action plus a visible copy button on assistant bubbles
  (`navigator.clipboard.writeText`); allow normal text selection.
- Persistence: IndexedDB, one record per message with the thumbnail as a Blob, not one rewritten
  JSON blob; a write queue to serialise appends and card updates.
- Keyboard: `visualViewport` to keep the composer above the on-screen keyboard; Enter sends,
  Shift+Enter inserts a newline (desktop); blur on list scroll.
- Keep the in-flight turn in an app-level store so switching tabs does not cancel it.

Out of v1 (later phases): workout tools, exercise proposals and cards, training chip, voice input,
on-device models, hosted AI/paywall, localisation of chips and reply language, cloud backup of chat.

## 6. Hard parts / traps

1. **R04.1 Fallback must discard partial work.** A fallback re-runs the whole turn; anything the
   failed attempt produced (cards, partial tool transcript) must be dropped, or the reply shows cards
   the fallback never proposed. Reset the per-turn collector at the start of every attempt (tested).
2. **R04.2 Earlier photos are invisible on follow-ups.** History is sent as text only, so "and how
   much protein was in that photo?" relies on the earlier reply's wording. Either re-send the most
   recent photo when the follow-up refers to it, or say so in the prompt; do not silently assume the
   model can see it.
3. **R04.3 History window shape.** Trimming to 19 messages of an alternating chat makes the window
   start with an **assistant** turn; failed sends leave consecutive **user** turns. Some providers
   reject or merge these [unk per vendor]. The rebuild must normalise history: start on a user turn
   and merge or drop consecutive same-role turns before building any wire format.
4. **R04.4 Failed send leaves an orphan user message** with no retry control. Keep the message but
   offer "Retry" (resend that text, no duplicate user message), or mark it failed in the UI.
5. **R04.5 Busy flag must be set synchronously.** Android sets "pending" only after the persist
   completes, so two rapid chip taps can start two turns. Set busy (and disable chips/send) before
   the first await.
6. **R04.6 Reset during a pending reply** appends the late reply to the new empty conversation.
   Tag each turn with a conversation generation; on Reset abort the request (`AbortController`) and
   drop any reply whose generation is stale.
7. **R04.7 Corrupt history is silently overwritten.** An undecodable stored conversation reads as
   empty and the next append destroys it. On decode failure keep the raw record aside, show an empty
   chat, and never overwrite the bad record implicitly.
8. **R04.8 Unbounded storage.** Every message and 700-px thumbnail is kept forever and the whole
   array is rewritten per append (O(n) per message). In IndexedDB store per-message records and image
   Blobs, and set a retention cap (open question 4).
9. **R04.9 BYOK tool results are not size-limited.** The reference limits only the hosted path; a
   year of food entries with ~30 nutrient fields can be hundreds of KB per round, blowing context
   windows and costs. Apply the limiter (60,000 chars) to every provider; keep `count` as the
   untrimmed total and the `truncated`/`omitted` markers so the model can narrow the range (tested).
10. **R04.10 Limits keep the oldest items.** Range tools sort ascending and keep the first N; the
    limiter also keeps the leading items. For "recent" questions over long ranges the newest data is
    what gets dropped. Keep the behaviour only if deliberate; at minimum the truncation markers and
    echoed effective range must be present.
11. **R04.11 Distinct engine errors collapse to "generic".** Android classifies the round-limit and
    truncated-twice messages by keyword and shows the generic failure text. Give these their own
    error kinds (round limit → "try rephrasing"; truncated → "shorter question or another model").
12. **R04.12 Every tool call needs exactly one result.** OpenAI requires a `tool` message per
    `tool_call_id` after the assistant message is echoed verbatim; Anthropic needs a `tool_result`
    per `tool_use` id. The reference skips calls lacking a name; if the id is present, answer with an
    error result instead of skipping, or the next round is rejected.
13. **R04.13 Gemini function responses.** Echo the model's parts verbatim (thought signatures) and
    echo the call `id` when present; `response` must be an object, so wrap the result (the reference
    nests it under `content`); a non-JSON result becomes `{}` silently — make tool results always
    valid JSON objects (tested on iOS).
14. **R04.14 Chips with an attached photo** behave differently per platform (dropped vs sent).
    Pick one: recommended — a chip sends with the attached photo and clears it.
15. **R04.15 Truncated replies look complete.** No output cap is sent to Gemini chat, and Anthropic
    `stop_reason: "max_tokens"` is not checked; only OpenAI-compatible detects `length`. Send the
    cap on every format (Gemini `generationConfig.maxOutputTokens`) and detect truncation on all three.
16. **R04.16 Missing log ≠ fast ≠ zero.** Never synthesise empty days in tool output or context
    (no 0-kcal rows, no "fasted" inference); fasting facts come only from tracked sessions; forecast
    averages use logged days only and exclude today.
17. **R04.17 Dates are local, ISO, Gregorian, inclusive.** Inject today's local date and time zone
    each turn; bad dates default silently (to = today, from = to − 30) — echo the effective range.
    Never format tool dates with a locale calendar (iOS test with Buddhist/Japanese/Islamic phones).
18. **R04.18 Compact retry is provider-specific.** Only OpenRouter changes the request on a
    `length` / reasoning-only reply (exclude reasoning, low effort); other providers resend the same
    body. One compact retry per round; a second `length` fails the turn.
19. **R04.19 Round cap counts the answer round.** Six requests total, so a question that needs six
    tool rounds cannot be answered. Keep 6 but tell the model in the prompt to batch calls (parallel
    calls in one round are supported on all three formats).
20. **R04.20 v1 must not advertise tools it cannot honour.** Android always offers workout tools;
    in v1 the PWA has no workouts, so the tool list and the prompt must be nutrition-only (iOS-style
    gate), otherwise the model claims abilities or calls tools that only return errors.
21. **R04.21 Proposal integrity (workouts phase).** Add only while pending; mark added only after the
    write succeeds; ids fixed at proposal time make Add idempotent; re-check name collisions at apply
    time; dedupe identical proposals and cap at 10 per reply (all tested).
22. **R04.22 Data snapshot is per turn.** Tools read the snapshot taken at send time; data logged
    during a pending reply is not seen until the next turn. Acceptable, but do not re-read live
    stores mid-loop (results would disagree with the prompt's counts).

## 7. Open questions

1. Reply language: the reference prompt asks for English replies and chips are sent in English even
   in other UI languages. Follow the UI language, or English until i18n? Needed: product decision
   (i18n is a later phase).
2. Should the context block include today's intake, remaining calories/macros and water? The
   reference omits them, so "what should I eat for dinner" depends on the model calling the food
   tool. Needed: product decision (cheaper and more reliable if included).
3. Re-send the latest photo on follow-up turns (R04.2)? Needed: product decision on cost vs quality.
4. History retention: cap by count (e.g. last N messages) or age, and should thumbnails expire?
   Needed: product decision; reference keeps everything.
5. Is the Coach conversation part of backup/export? iOS cloud backup includes it implicitly; the
   PWA backup spec must decide explicitly. Needed: decision with the backup area.
6. Stream replies? The reference never streams; streaming with tool loops is more complex (stream only
   the final round). Needed: product decision.
7. Error wording: provider's raw message (iOS) or classified friendly text (Android)? Recommended:
   classified text with the raw message available in a details view. Needed: decision with area 03.
8. Should a failed send offer Retry (R04.4) and should the orphan user message be kept? Needed:
   product decision.
9. Limit semantics: keep oldest-first truncation (reference) or newest-first for long ranges
   (R04.10)? Needed: product decision.

## 8. What to read later

- Reference docs: none specific to Coach beyond in-code comments; marketing claim captured in
  `ev_fa243a1fe14ed63cc6252910410ee973c07740c25cc70484db1eab53b44d991a` (Coach answers from meals,
  weight trend and workouts).
- Reference tests that list the edge cases: `T/data/CoachProposalApplyTest.kt`,
  `T/services/ai/CoachProposalToolsTest.kt`, `T/services/ai/ToolResultLimiterTest.kt`,
  `T/services/ai/CoachWorkoutToolsTest.kt`, `T/services/ai/RetryPolicyThreadingTest.kt`,
  `T/services/ai/OpenAITokenLimitParameterTest.kt`, `T/ui/coach/CoachFailureSummaryTest.kt`,
  `IT/CoachExerciseProposalTests.swift`, `IT/CoachWorkoutToolsTests.swift`,
  `IT/AIModelRegistryTests.swift` (Gemini function-response id).
- REA Evidence (outside the repo): none produced for this area; site capture above only.
- Related specs: `01-*.md` (BMR/TDEE, goals, weight forecast), `03-ai-providers.md` (provider list,
  keys, fallback settings, error taxonomy, CORS headers), fasting area (tracked sessions), backup
  area (whether chat is exported), workouts phase spec (proposal tools, workout tools).
