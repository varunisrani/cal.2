# P08 · Coach

**Weeks:** 2 · **Tracks:** domain/data/AI (context, tools, wires, engine); UI (Coach tab) · **Depends on:** P01 (forecast), P02 (coach repo), P03 (client parts), P04 · **Status:** 🔨 in progress: P08-04, P08-12, P08-13 landed (3/14, 2026-10-27)

Reference paths are relative to `$PLATEWISE_REF` (`/root/reference/fud-ai`, pinned at `10e14b67`). Prefixes: `A/` = `android/app/src/main/java/com/apoorvdarshan/calorietracker/`, `I/` = `ios/calorietracker/`, `T/` = `android/app/src/test/java/com/apoorvdarshan/calorietracker/`, `IT/` = `ios/calorietrackerTests/`. A number in brackets is the file's length in lines; read only the named part of a big file. Read the research spec section first, then the reference, then its tests.

## Goal

The Coach tab answers questions from the person's own log. Each turn rebuilds a short context (profile, formulas, forecast, data counts, today's intake, calories left and water, D-16.27) and lets the model call six read-only nutrition tools for up to six rounds on all three wire formats; results are capped at 60 000 characters keeping the newest rows (D-16.32). Replies follow the person's language (D-16.28), render as safe Markdown and can be copied. Errors are friendly with Details and Retry (D-16.31); Reset drops late replies (D-16.34); the newest 200 messages are kept (D-16.29).

Interop note: tool calling on Gemini (`functionDeclarations`, `functionCall`, `functionResponse`), OpenAI-compatible (`tools`, `tool_choice`, `tool_calls`, `role: tool`, `tool_call_id`) and Anthropic (`tools` with `input_schema`, `tool_use`, `tool_result`) is a third-party protocol (04 §2): check each field against the vendor's current docs. The tool names are ours (`data_overview`, `weight_log`, `body_fat_log`, `daily_energy_totals`, `food_log`, `fasting_log`); the reference's tool names are banned in product code.

## Slices and waves

Each slice owns its files; no two slices in a wave touch the same path. A builder takes one slice, runs Read → note → Rewrite → Compare for each task, then the loop until green. The lead lands one commit per slice and writes any deviation back into this file.

- **Wave A:** S1 = P08-01..04 (`src/services/coach/{context,tools,toolSchemas,limiter,history}.ts`, `src/ai/prompts/coach.ts`) · S2 = P08-05..07 (`src/ai/chat/**`) · S3 = P08-10..13 (`src/features/coach/**`) on a fake session.
- **Wave B:** P08-08, P08-09 (`src/services/coach/{engine,session}.ts`).
- **Wave C:** P08-14 (`e2e/coach.spec.ts`, fake-AI scripts).

## Tasks (14)

| ID | Task | Read in reference | New files | Verify |
|---|---|---|---|---|
| P08-01 | **Coach context and system prompt.** `src/services/coach/context.ts` builds the per-turn context from a data snapshot (04 §3.8): today's local date and IANA zone; profile (sex, age, height and weight in the person's units, activity, goal, goal weight, body fat and goal body fat when set); formulas (which BMR formula and why, BMR, TDEE, effective targets); the P01-18 forecast block or a not-enough-data line naming the minimum (2 food days and 2 weigh-ins); data counts (weigh-ins, body-fat readings, entries, explicitly tracked fasts) with the rule that a day without entries is not a fast and not zero (R04.16); today's intake so far, calories left and water (D-16.27); the kJ rule for kJ users (tool arguments stay kcal). `src/ai/prompts/coach.ts` (our own prose): persona for food, energy balance and weight goals; answers rest on the person's numbers, no medical advice with a pointer to a clinician; 2–5 sentences unless asked; reply in the language of the person's message (D-16.28); answer from the context first and call tools only for data it lacks, batching calls in one round (R04.19); earlier photos are not visible again (R04.2, D-16.48); how-to questions get a daily calorie number and one concrete change, projection questions quote the forecast; the notes for the AI last. Only the six nutrition tools are mentioned (R04.20). | `A/services/ai/CoachContext.kt` [123: all, intent only]; `A/services/ai/ChatService.kt` [679: prompt assembly, intent only] | `src/services/coach/context.ts`, `src/services/coach/context.test.ts`, `src/ai/prompts/coach.ts`, `src/ai/prompts/coach.test.ts` | context for a kJ person contains the kJ rule; with one weigh-in it says not enough data; today's intake, left and water appear; no workout words; the prompt never contains a food name from the fixture diary; similarity check green on the prompt. |
| P08-02 | **Nutrition data tools.** `src/services/coach/tools.ts` and `toolSchemas.ts` (04 §3.9, R04.10, R04.16, R04.17, R04.20): six read-only tools over the turn's snapshot, one JSON-Schema each. Shared rules: dates are local ISO days (Gregorian, inclusive); a missing or unparseable `to` → today, `from` → `to` − 30 days, never rejected, and the effective range is echoed; `limit` clamped to [1, max]; items listed oldest first, and when over the limit the oldest are dropped so the newest N remain (Proposed D-16.59, same direction as D-16.32); every result is a JSON object string; problems return `{error}`; an unknown name lists the available tools; any workout or proposal tool name returns "not available". Tools: `data_overview` (counts and first/last dates of weigh-ins, body fat, entries; fasts count and whether one is active); `weight_log` (default/max 365; kg and lb at 1 dp); `body_fat_log` (365; percent at 1 dp, Proposed D-16.64); `daily_energy_totals` (one row per day that has entries; days without entries are absent, never 0); `food_log` (default 200, max 365; date only, name, kcal, macros, meal, source, grams when known, every known nutrient with its unit in the key); `fasting_log` (200/365; fasts overlapping the range, active ones measured to now). | `A/services/ai/CoachTools.kt` [1 261: executors 104–708 nutrition part, schemas 1014–1097]; `I/Services/CoachTools.swift` [1 262: gating 60–65, `parseRange`] | `src/services/coach/tools.ts`, `src/services/coach/tools.test.ts`, `src/services/coach/toolSchemas.ts`, `src/services/coach/toolSchemas.test.ts` | bad `from` → defaults and echoes the range; 400 entries with limit 365 → the newest 365, oldest first; a day without entries is absent from energy totals; a fast from 21:00 yesterday to 13:00 today overlaps today's range; our later-phase name `workout_log` → not available; unknown name lists the six; dates stay Gregorian under a non-Gregorian locale. |
| P08-03 | **Tool-result limiter.** `src/services/coach/limiter.ts` (04 §3.10, D-16.32, R04.9): applied to every tool result on every provider. At or under 60 000 characters → unchanged; otherwise parse the object; no object or no array field → `{error: result too large, note}`; take the array field whose serialised text is longest; binary-search the largest k in [0, n − 1] such that the object with that array cut to its **newest** k items (the last k of an oldest-first list) plus `truncated: true`, `omittedItems: n − k` and a note asking for a narrower range fits; other fields untouched, so `count` keeps the untrimmed total; k = 0 not fitting → the too-large error. | `A/services/ai/ToolResultLimiter.kt` [56: all]; `T/services/ai/ToolResultLimiterTest.kt` [50] | `src/services/coach/limiter.ts`, `src/services/coach/limiter.test.ts` | 2 000 items → fits under 60 000, `count` still 2 000, kept items are the last ones, markers present; a string result over the cap → error object; small results unchanged. |
| P08-04 | **History normaliser.** `src/services/coach/history.ts` (04 §3.7, D-16.34, D-16.48, R04.3): take the last 20 stored messages minus the one just stored (≤ 19), as text only (earlier photos are never re-sent); drop leading assistant turns so the history starts with a user turn; merge neighbouring turns of the same role (joined with a blank line); map roles per format (user/assistant or user/model). Messages that failed (no reply) stay as user text. | `A/services/ai/ChatService.kt` [679: history part] | `src/services/coach/history.ts`, `src/services/coach/history.test.ts` | a window starting with an assistant message drops it; two failed user messages in a row merge into one; 30 stored → 19 sent; thumbnails never included; Gemini roles user/model. |
| P08-05 | **Chat wire: OpenAI-compatible with tools.** `src/ai/chat/openaiChat.ts` (04 §3.11): `system` message (prompt + notes), history as plain strings, the new user message (string, or text and image parts with a photo); `tools` as functions with our schemas and `tool_choice: auto`; the token cap per P03-08 (OpenAI and Custom gpt-5/6, o1/o3/o4 → `max_completion_tokens`); Qwen `enable_thinking: false`; OpenRouter `reasoning`; `reasoning_effort: none` for models whose id starts gpt-6-sol or gpt-6-luna. A round's reply: tool calls take precedence over text: append the assistant message verbatim and one `tool` message per call id; malformed arguments read as `{}`; a call with an id but no name gets an error result so every id is answered (R04.12). One compact retry per round on `finish_reason: length` or a reasoning-only reply; only OpenRouter changes the body (exclude, effort low) (R04.18); a second cut → truncated. | `A/services/ai/ChatService.kt` [679: OpenAI loop]; `A/services/ai/OpenAICompatibleClient.kt` [239: lines 157–196] | `src/ai/chat/openaiChat.ts`, `src/ai/chat/openaiChat.test.ts` | a reply with two tool calls produces two `tool` messages in order; a nameless call with an id gets an error result; `length` → one compact retry; OpenRouter retry body has `effort: low`; gpt-6-luna gets `reasoning_effort: none`. |
| P08-06 | **Chat wire: Anthropic with tools.** `src/ai/chat/anthropicChat.ts` (04 §3.11): `system` string, history as plain strings, the new user content (text, or image and text blocks), `tools` with `input_schema`, `max_tokens` = the cap, the browser header. `tool_use` blocks → append the assistant content array as returned and one user message with a `tool_result` per id; otherwise the first non-empty text block is the answer; `stop_reason: max_tokens` is detected as a cut-off reply and re-asked once (R04.15). | `A/services/ai/ChatService.kt` [679: Anthropic loop]; `I/Services/ChatService.swift` [1 036: search `callAnthropic`-style loop] | `src/ai/chat/anthropicChat.ts`, `src/ai/chat/anthropicChat.test.ts` | tool_use with two ids → one user message with two results; `max_tokens` stop → one re-ask, second → truncated; browser header present. |
| P08-07 | **Chat wire: Gemini with tools.** `src/ai/chat/geminiChat.ts` (04 §3.11, R04.13, R04.15): `systemInstruction`, history as user/model text parts, the new user parts (image first, then text), `tools.functionDeclarations`, and `generationConfig.maxOutputTokens` = the cap (the reference sent none for chat). A `functionCall` part → append the model's parts verbatim (keeps thought signatures) and one user turn of `functionResponse {name, response: {content: <result object>}, id when the call had one}`; tool results are always valid JSON objects. Otherwise join the text parts; empty, blocked or missing candidates → invalidResponse; `MAX_TOKENS` → one re-ask, then truncated. | `A/services/ai/ChatService.kt` [679: Gemini loop]; `IT/AIModelRegistryTests.swift` [383: lines 355–382 function-response id] | `src/ai/chat/geminiChat.ts`, `src/ai/chat/geminiChat.test.ts` | call with id → response echoes it; without id → no id field; returned parts echoed unchanged; cap sent; blocked prompt → invalidResponse; MAX_TOKENS twice → truncated. |
| P08-08 | **Chat engine.** `src/services/coach/engine.ts` (04 §3.11–3.12): `runTurn(input, deps)` resolves the role (photo → primary; text with a text role → that role), checks the key, then loops at most 6 requests per turn (the answer round counts, R04.19), running tools locally against the snapshot taken at send time (never live stores mid-loop, R04.22) and passing every result through the limiter; each request uses the shared retry ladder and the turn's deadline (D-16.23); a sixth round that still asks for tools → `roundLimit` (its own message, R04.11); cut twice → `truncated`. On any failure except cancel, when a valid standby exists for this kind of request, the whole turn re-runs from scratch on the standby and everything the failed attempt produced is discarded (R04.1). Returns the trimmed text or a failure with kind and the provider's message for Details. | `A/services/ai/ChatService.kt` [679: `sendMessage`, `runProvider`]; `I/Services/ChatService.swift` [1 036: fallback and error policy]; `T/services/ai/RetryPolicyThreadingTest.kt` [162] | `src/services/coach/engine.ts`, `src/services/coach/engine.test.ts` | fake fetch: two tool rounds then text → answer; six tool rounds → roundLimit; primary 401 → standby re-runs from round 1 with no leftovers from the first attempt; data written mid-turn is not seen by tools; cancel → cancelled with no standby. |
| P08-09 | **Coach session service.** `src/services/coach/session.ts` (04 §3.6, R04.4–R04.6, D-16.31, D-16.34): an app-level store so a pending turn survives tab switches. `send(text, image?)`: ignore when pending or empty; set pending synchronously before any await; prepare the image (P03-10: 1 600 px at 0.78 for the model, 700 px at 0.68 thumbnail); an image without text stores a fixed short request to look at the photo; persist the user message first, tagged with the conversation generation; snapshot data; run the engine; on success store the assistant message unless the generation changed (then drop it); on failure mark the user message failed with the kind and Details text (provider message with any stored key redacted). `retry(id)` re-sends a failed message without storing a duplicate. `reset()` aborts the in-flight request and bumps the generation. | `A/ui/coach/CoachViewModel.kt` [259: `send`, failure summary]; `T/ui/coach/CoachFailureSummaryTest.kt` [29] | `src/services/coach/session.ts`, `src/services/coach/session.test.ts` | two sends in the same tick start one turn; reset during a pending turn aborts it and a late reply is not stored; failure marks the message with kind and redacted details; retry stores no second user message; image-only send stores the fixed text and a thumbnail. |
| P08-10 | **Coach page.** Replace `src/features/coach/CoachPage.tsx` (04 §3.1): top bar with the title and a Reset button (disabled when empty; confirm dialog, destructive "Clear"); empty state (icon, "Ask about your log"-style title in our words, one sentence on what the Coach can see, up to 4 prompt cards in two columns that send at once and are disabled while pending); otherwise `MessageList.tsx` with `Bubble.tsx` (user right-aligned with a thumbnail when attached; assistant left-aligned with a small badge), `TypingDots.tsx` (three dots, the active one moves every 350 ms), and `ErrorBanner.tsx` (inline at the end, warning icon, our message, Details disclosure and Retry). Auto-scroll on new messages and while pending; the composer stays above the on-screen keyboard (`visualViewport`); dragging the list blurs the field. | `A/ui/coach/CoachScreen.kt` [1 407: `EmptyState`, list, bubbles]; `I/Views/ChatView.swift` [1 248: `MessageBubble`, layout] | `src/features/coach/MessageList.tsx`, `src/features/coach/MessageList.test.tsx`, `src/features/coach/Bubble.tsx`, `src/features/coach/TypingDots.tsx`, `src/features/coach/TypingDots.test.tsx`, `src/features/coach/ErrorBanner.tsx`, `src/features/coach/ErrorBanner.test.tsx`, `src/features/coach/EmptyCoach.tsx`, `src/features/coach/coach.module.css`, `src/i18n/en/coach.ts` | `CoachPage.test.tsx` with a fake session: empty → four cards; tapping a card sends it; Reset disabled when empty, asks when not; typing dots cycle with fake timers; error banner shows Details and Retry calls `retry`. |
| P08-11 | **Composer and photo attachment.** `src/features/coach/Composer.tsx` (04 §3.2): a rounded field growing to 5 lines with the placeholder in our words; an attach control offering Camera (`capture=environment`) and Photo library; one image per message with a thumbnail preview and a remove button; Send enabled when not pending and the text is non-blank or an image is attached; Enter sends and Shift+Enter adds a line on devices with a physical keyboard; attach disabled while pending; an unreadable photo shows a short message and sends nothing. | `A/ui/coach/CoachScreen.kt` [1 407: `InputBar`]; `I/Views/ChatView.swift` [1 248: composer] | `src/features/coach/Composer.tsx`, `src/features/coach/Composer.test.tsx` | Send disabled for whitespace; image alone enables Send; Enter sends, Shift+Enter inserts a newline; a second image replaces the first; pending disables attach and Send. |
| P08-12 | **Prompt chips.** `src/features/coach/chips.ts` and `ChipRow.tsx` (04 §3.3, D-16.33, R04.14): four chips per goal in our wording covering the same intents (lose: 30-day projection, faster loss safely, is my intake too high, a dinner idea; gain: 30-day projection, healthy gain, is my intake high enough, protein-rich foods; maintain: is my weight stable, my average intake, macro advice, my trend); no training chip in v1; the empty state shows the first four; with messages a horizontal row; a chip sends at once together with any attached photo and clears it; disabled while pending; chips follow goal changes live. | `A/ui/coach/CoachViewModel.kt` [259: `chipsFor`]; `I/Views/ChatView.swift` [1 248: `suggestedPrompts`] | `src/features/coach/chips.ts`, `src/features/coach/chips.test.ts`, `src/features/coach/ChipRow.tsx` | lose → four lose chips; switching the goal to gain updates them; a chip with an attached photo sends both and clears the attachment; disabled while pending. |
| P08-13 | **Markdown rendering and copy.** `src/features/coach/markdown.tsx` (04 §3.4): a small renderer to React elements (never `innerHTML`): headings `#`–`###`, bullets (`-`, `*`, `+`), numbered items, fenced code blocks, blank-line paragraphs; inline bold, italic, inline code and links `[text](url)` limited to http and https, opened in a new tab with `rel="noopener noreferrer"`; everything else is text. User messages are shown verbatim. `CopyButton.tsx` on assistant bubbles uses `navigator.clipboard.writeText` with a short confirmation; normal text selection stays possible. | `A/ui/coach/CoachScreen.kt` [1 407: search `parseMarkdownBlocks`] | `src/features/coach/markdown.tsx`, `src/features/coach/markdown.test.tsx`, `src/features/coach/CopyButton.tsx` | `<script>` text renders as text; `[x](javascript:alert(1))` renders as plain text; a numbered list and a code block render; bold inside a bullet; copy writes the raw reply text. |
| P08-14 | **Coach e2e.** `e2e/coach.spec.ts` with the fake AI: script `coach-tool` (a `food_log` call then a text answer) → the answer appears and the fake server saw one tool message; a chip send; a failing script → error banner, Details, Retry → answer without a duplicate question; Reset while a delayed reply is pending → the reply never appears; 205 short exchanges seeded through the repository keep 200 messages. | none | `e2e/coach.spec.ts`, `e2e/fake-ai/scripts/coach-fail-then-ok.json`, `e2e/fake-ai/scripts/coach-slow.json` | passes three times in a row in the mobile viewport. |

## Files to create (43)

| Path (under `platewise/`) | What it holds | Task |
|---|---|---|
| `src/services/coach/context.ts` | Per-turn context block | P08-01 |
| `src/services/coach/context.test.ts` | Tests for `context.ts`: the Verify cases of P08-01 | P08-01 |
| `src/ai/prompts/coach.ts` | Coach system prompt (our prose) | P08-01 |
| `src/ai/prompts/coach.test.ts` | Tests for `coach.ts`: the Verify cases of P08-01 | P08-01 |
| `src/services/coach/tools.ts` | Tool executors over the snapshot | P08-02 |
| `src/services/coach/tools.test.ts` | Tests for `tools.ts`: the Verify cases of P08-02 | P08-02 |
| `src/services/coach/toolSchemas.ts` | JSON-Schema per tool | P08-02 |
| `src/services/coach/toolSchemas.test.ts` | Tests for `toolSchemas.ts`: the Verify cases of P08-02 | P08-02 |
| `src/services/coach/limiter.ts` | 60 000-character cap keeping the newest rows | P08-03 |
| `src/services/coach/limiter.test.ts` | Tests for `limiter.ts`: the Verify cases of P08-03 | P08-03 |
| `src/services/coach/history.ts` | History window and shape | P08-04 |
| `src/services/coach/history.test.ts` | Tests for `history.ts`: the Verify cases of P08-04 | P08-04 |
| `src/ai/chat/openaiChat.ts` | OpenAI-compatible tool rounds | P08-05 |
| `src/ai/chat/openaiChat.test.ts` | Tests for `openaiChat.ts`: the Verify cases of P08-05 | P08-05 |
| `src/ai/chat/anthropicChat.ts` | Anthropic tool rounds | P08-06 |
| `src/ai/chat/anthropicChat.test.ts` | Tests for `anthropicChat.ts`: the Verify cases of P08-06 | P08-06 |
| `src/ai/chat/geminiChat.ts` | Gemini tool rounds | P08-07 |
| `src/ai/chat/geminiChat.test.ts` | Tests for `geminiChat.ts`: the Verify cases of P08-07 | P08-07 |
| `src/services/coach/engine.ts` | Tool loop, limits, standby | P08-08 |
| `src/services/coach/engine.test.ts` | Tests for `engine.ts`: the Verify cases of P08-08 | P08-08 |
| `src/services/coach/session.ts` | Send, retry, reset, pending state | P08-09 |
| `src/services/coach/session.test.ts` | Tests for `session.ts`: the Verify cases of P08-09 | P08-09 |
| `src/features/coach/MessageList.tsx` | Messages, typing dots, error banner | P08-10 |
| `src/features/coach/MessageList.test.tsx` | Tests for `MessageList.tsx`: the Verify cases of P08-10 | P08-10 |
| `src/features/coach/Bubble.tsx` | One message bubble | P08-10 |
| `src/features/coach/TypingDots.tsx` | Typing indicator | P08-10 |
| `src/features/coach/TypingDots.test.tsx` | Tests for `TypingDots.tsx`: the Verify cases of P08-10 | P08-10 |
| `src/features/coach/ErrorBanner.tsx` | Error with Details and Retry | P08-10 |
| `src/features/coach/ErrorBanner.test.tsx` | Tests for `ErrorBanner.tsx`: the Verify cases of P08-10 | P08-10 |
| `src/features/coach/EmptyCoach.tsx` | Empty state with prompt cards | P08-10 |
| `src/features/coach/coach.module.css` | Coach styles | P08-10 |
| `src/i18n/en/coach.ts` | Coach copy partition | P08-10 |
| `src/features/coach/Composer.tsx` | Message composer | P08-11 |
| `src/features/coach/Composer.test.tsx` | Tests for `Composer.tsx`: the Verify cases of P08-11 | P08-11 |
| `src/features/coach/chips.ts` | Chip sets by goal | P08-12 |
| `src/features/coach/chips.test.ts` | Tests for `chips.ts`: the Verify cases of P08-12 | P08-12 |
| `src/features/coach/ChipRow.tsx` | Chip row | P08-12 |
| `src/features/coach/markdown.tsx` | Safe Markdown to React | P08-13 |
| `src/features/coach/markdown.test.tsx` | Tests for `markdown.tsx`: the Verify cases of P08-13 | P08-13 |
| `src/features/coach/CopyButton.tsx` | Copy an answer | P08-13 |
| `e2e/coach.spec.ts` | Coach end to end | P08-14 |
| `e2e/fake-ai/scripts/coach-fail-then-ok.json` | A failing turn then a good one | P08-14 |
| `e2e/fake-ai/scripts/coach-slow.json` | A delayed reply for the Reset case | P08-14 |

## Files to update (2)

| Path (under `platewise/`) | Change | Task |
|---|---|---|
| `src/features/coach/CoachPage.tsx` | Full Coach page replaces the placeholder | P08-10 |
| `src/i18n/en.ts` | Import the coach partition (lead) | P08-10 |

## Migrations and fixtures (1)

| Path (under `platewise/`) | What it holds | Task |
|---|---|---|
| `e2e/fake-ai/scripts/coach-*.json` | Coach scripts (our text) | P08-14 |

## Task notes (14)

`docs/notes/P08/<slug>.md`, one per task, from `docs/notes/_template.md`, written before the code:

- `docs/notes/P08/coach-context-and-system-prompt.md` (P08-01)
- `docs/notes/P08/nutrition-data-tools.md` (P08-02)
- `docs/notes/P08/tool-result-limiter.md` (P08-03)
- `docs/notes/P08/history-normaliser.md` (P08-04)
- `docs/notes/P08/chat-wire-openai-compatible-with-tools.md` (P08-05)
- `docs/notes/P08/chat-wire-anthropic-with-tools.md` (P08-06)
- `docs/notes/P08/chat-wire-gemini-with-tools.md` (P08-07)
- `docs/notes/P08/chat-engine.md` (P08-08)
- `docs/notes/P08/coach-session-service.md` (P08-09)
- `docs/notes/P08/coach-page.md` (P08-10)
- `docs/notes/P08/composer-and-photo-attachment.md` (P08-11)
- `docs/notes/P08/prompt-chips.md` (P08-12)
- `docs/notes/P08/markdown-rendering-and-copy.md` (P08-13)
- `docs/notes/P08/coach-e2e.md` (P08-14)

## Run until green

```bash
cd platewise
pnpm install --frozen-lockfile
pnpm lint && pnpm fmt:check && pnpm typecheck && pnpm test   # fix and re-run until all pass
pnpm build && pnpm e2e                                        # browser tests, mobile viewport
PLATEWISE_REF=/root/reference/fud-ai pnpm check --require-ref # similarity, banned, assets, licences, traps, acceptance
```

Phase additions, inside the same loop:

```bash
pnpm build && pnpm exec playwright test e2e/coach.spec.ts
```

On any failure, fix the cause and run the whole loop again from `pnpm install`. Never skip a test, widen an allow-list without a written reason, or edit a recorded fixture to make a test pass. Real waits are banned in tests: use fake timers (`vi.useFakeTimers()`) and the clock helpers in `src/test/time.ts`.

## Compare checklist (reopen the reference after writing)

- [ ] Walk every branch of the reference's three tool loops: tool calls first, verbatim echo, one result per id, compact retry, round limit (R04.12, R04.18, R04.19).
- [ ] Context: every block of 04 §3.8 present or deliberately changed (today's intake, left and water added, D-16.27; no body measurements, N-7).
- [ ] Tools: date defaults, echo, oldest-first lists; deliberate: limits keep the newest rows (D-16.32, Proposed D-16.59); workout tools absent (R04.20).
- [ ] Persistence: per message, 200 cap, generations (D-16.29, D-16.34).
- [ ] Errors: friendly with Details and Retry (D-16.31); distinct round-limit and cut-off kinds (R04.11).
- [ ] Chips: same intents in our words; chip sends with the photo (D-16.33).
- [ ] Every task note's compare section is ticked, each tick naming its test.
- [ ] Trap rows owned by this phase in `docs/internals/traps-ledger.md` now carry `Test:` lines (the lead updates the ledger at land time).
- [ ] Acceptance rows owned by this phase in `docs/internals/acceptance-map.md` now carry `Test:` lines.

## Done when

All Coach tests pass; `e2e/coach.spec.ts` passes. **Demo 5 (M6):** with the fake provider, ask "what did I eat yesterday?" and see an answer built from a `food_log` call; send a chip; force a failure and retry it; press Reset during a slow reply and see nothing arrive afterwards.
