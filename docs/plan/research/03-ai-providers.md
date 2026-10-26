# 03 — AI providers and the food-analysis engine: behavioural specification (clean-room)

Scope: the bring-your-own-key (BYOK) AI layer. That covers the 16 remote LLM providers and their
wire formats, provider, model and fallback settings, custom instructions, the food-analysis
requests (photos, text, labels), image preprocessing, the response contract and its repair rules,
truncation handling, retries, timeouts, the error taxonomy, key storage, transport trust, and the
browser constraints the PWA adds.
Out of scope: speech-to-text providers (`07`); AI Coach chat and its tools (Coach area); the goal
calculator's formulas and validation (goals area, only referenced here); the food-logging UI
(capture, review sheet, saving) (food-logging area); hosted AI subscriptions (later phase); the
on-device models (only described).
Reference: `apoorvdarshan/fud-ai` @ `10e14b67116c52b515d2389621266e32b3a99840`; shipped build checked: marketing
site capture only (`ev_fa243a1fe14ed63cc6252910410ee973c07740c25cc70484db1eab53b44d991a`). No APK/IPA.
Sources studied: Android `A/models/AIProvider.kt`, `A/services/ai/*`, `A/data/{KeyStore,PreferencesStore}.kt`,
settings UI and view-model; iOS `I/Models/AIProvider.swift`, `I/Services/{GeminiService,GeminiRequestConfiguration,AIErrorMessages,AIRequestErrorPolicy,AIGate,ServingUnitRepairPolicy,KeychainHelper,OnDeviceFoodService}.swift`;
the tests listed in §4. Live CORS probes of all 14 cloud endpoints (curl `OPTIONS` and `POST` with
an `Origin` header, no keys, 2026-10-26) for §3.15. Ollama CORS from the vendor FAQ (docs.ollama.com/faq).

Conventions:
- "Format family" means one of three wire protocols: **G** (Gemini `generateContent`), **O** (OpenAI-compatible
  `chat/completions`) and **M** (Anthropic Messages).
- "Role" means one of four slots a provider can fill: *primary* (vision; handles every request with images),
  *text* (optional; handles requests without images), *image fallback* and *text fallback*.
- "Food result" means the structured nutrition answer defined in §3.6.
- A, I, T and IT abbreviate the reference paths (see §4).
- "MUST" marks an invariant the reference defends; the defensive code or a test shows a past bug.

---

## 1. Overview

The app never runs its own AI backend in BYOK mode. Every AI feature (meal photos, typed food,
labels, "What if?", goal estimation, and the Coach in another area) goes through one **call
pipeline** that:

1. reads one settings snapshot (provider, model, base URL, key, token cap, timeout, custom
   instructions, OpenRouter reasoning effort);
2. picks the role: requests **with images** go to the primary (vision) provider, requests
   **without images** go to the text provider when "Use Separate Text Provider" is on, else to the primary;
3. preprocesses images (downscale, re-encode JPEG) in parallel with the settings read;
4. dispatches to one of three format adapters (G, O, M), each with retry, truncation detection
   and one "compact" re-ask;
5. on failure, tries the role's fallback once (image fallback or text fallback) if it is
   enabled, has a key, and is not identical to the primary;
6. returns raw text, which the caller parses into a typed result (food result, label result,
   goals, plain sentence) with tolerant, validating parsers;
7. optionally makes a second "repair" call to recover serving units (§3.7).

```
 UI action ─► entry point (meal photos | auto photo | text | label | what-if | nutrient goals | …)
                 │ builds prompt (+ note, + opt-in amino acids)
                 ▼
          call pipeline ──settings snapshot──► role = images ? primary : (separateText ? text : primary)
                 │  images ─► preprocess (≤1600 px, JPEG q0.8)        custom instructions attached
                 ▼
          dispatch(provider) ─► adapter G | O | M ─► HTTP (retry 429/503/529) ─► parse envelope
                 │                         └─ truncated? ─► one compact re-ask ─► still truncated ⇒ TRUNCATED
                 │ error
                 ▼
          fallback config for the role? ──no──► surface error kind
                 │ yes
                 ▼
          dispatch(fallback) ──error──► "both failed" (names both providers + fallback's error kind)
                 │ text
                 ▼
          caller parser ─► food result ─► serving-unit repair? (only zero-macro results) ─► review sheet
```

What the user sees: an analyzing overlay with Cancel, then either the review sheet or one
actionable error message that never contains raw provider text. What the system guarantees:
cancellation aborts the network call and shows no error; the API key goes only in a header (never
in the URL); a breakdown that does not add up is dropped rather than shown; a model answer can
never set a serving unit that contradicts its own gram weight.

## 2. Reference names (rename in rebuild)

| Kind | Names (reference only; they become banned identifiers) |
|---|---|
| Binary / CLI and flags | none in this area |
| Env vars | none |
| Files and folders | Android encrypted prefs file `fudai_keychain`; iOS Keychain service `com.apoorvdarshan.calorietracker`; `network_security_config.xml` |
| HTTP routes / URL schemes | none of the reference's own (all endpoints are vendors', see below) |
| RPC methods / events / commands | none |
| Settings and storage keys | `selectedAIProvider`, `selectedAIModel`, `separateTextProviderEnabled`, `selectedTextAIProvider`, `selectedTextAIModel`, `aiFallbackEnabled`, `selectedFallbackAIProvider`, `selectedFallbackAIModel`, `textAIFallbackEnabled`, `selectedTextFallbackAIProvider`, `selectedTextFallbackAIModel`, `customBaseURL_<provider>`, `fallbackCustomBaseURL_<provider>`, `fallbackBaseURLMigrationVersion`, `geminiModelMigrationVersion`, `aiModelRegistryMigrationVersion` (current 2), `userContext` (Android) / `aiUserContext` (iOS), `maxResponseTokens` (Android) / `aiMaxResponseTokens` (iOS), `aiRequestTimeoutSeconds`, `openRouterReasoningEffort`, `aiAccessMode`, `aminoAcidEstimatesEnabled`; key-store entries `apikey_<provider>` and `speechApiKey_<provider>`. Provider ids: Android enum names (`GEMINI`, `OPENAI`, `ANTHROPIC`, `XAI`, `OPENROUTER`, `TOGETHER_AI`, `GROQ`, `HUGGING_FACE`, `FIREWORKS`, `DEEP_INFRA`, `MISTRAL`, `DEEPSEEK`, `QWEN`, `CEREBRAS`, `LOCAL_GEMMA`, `OLLAMA`, `CUSTOM_OPENAI`); iOS raw strings (`"Google Gemini"`, `"Anthropic Claude"`, `"xAI Grok"`, `"Alibaba Qwen"`, `"Ollama (Local)"`, `"Custom (OpenAI-compatible)"`, `"Gemma 4 E2B (On-Device)"`, `"Apple Intelligence (On-Device)"`, …) |
| Other (scopes, error tags, IPC channels) | Error-kind string ids `ai.error.no_key`, `ai.error.image_conversion`, `ai.error.invalid_response`, `ai.error.invalid_url`, `ai.error.offline`, `ai.error.connection`, `ai.error.timeout`, `ai.error.credits`, `ai.error.daily_quota`, `ai.error.quota`, `ai.error.model`, `ai.error.rate_limit`, `ai.error.key_rejected`, `ai.error.overloaded`, `ai.error.generic`, `ai.error.local_unavailable`, `ai.error.unsupported_device`, `ai.error.truncated`, `ai.error.text_only`, `ai.error.both_failed`; strings table `AIErrorMessages`. Type names `GeminiService`, `FoodAnalysisService`, `FoodJsonParser`, `AiErrorKind`, `AIProviderSettings`, `ServingUnitRepairPolicy`, `FoodImagePreprocessor`, `SecureHttpClient`, `KeyStore`, `KeychainHelper`. OpenRouter attribution header values: `HTTP-Referer: https://github.com/apoorvdarshan/fud-ai` and `X-Title: Fud AI` |
| Model-response JSON keys (the reference's own prompt schema; the rebuild may keep or rename them) | food: `name`, `calories`, `protein`, `carbs`, `fat`, `serving_size_grams`, `emoji` (text path only), `sugar`, `added_sugar`, `fiber`, `saturated_fat`, `monounsaturated_fat`, `polyunsaturated_fat`, `trans_fat`, `cholesterol`, `caffeine`, `creatine`, `beta_alanine`, `l_citrulline`, `l_carnitine`, `l_arginine`, `taurine`, `betaine`, `hmb`, `sodium`, `potassium`, `calcium`, `iron`, `magnesium`, `zinc`, `vitamin_a`, `vitamin_c`, `vitamin_d`, `vitamin_b12`, `vitamin_e`, `vitamin_k`, `folate`, `omega_3`, `ingredients[] {name, grams, calories, protein, carbs, fat}`, `unit_options[] {unit, quantity, grams_per_unit}` (accepted aliases `serving_unit_options`, `gramsPerUnit`); label: same nutrient keys with suffix `_per_100g`; amino acids (opt-in): `histidine`, `isoleucine`, `leucine`, `lysine`, `methionine`, `phenylalanine`, `threonine`, `tryptophan`, `valine` (+`_per_100g`); nutrient goals: the 29 non-macro keys (Android also accepts `_g`/`_mg`/`_mcg` suffixed and camelCase aliases) |

Third-party protocol names used by this area (keep them exact; endpoints checked live on 2026-10-26, §3.15):

- Base URLs: `https://generativelanguage.googleapis.com/v1beta`, `https://api.openai.com/v1`,
  `https://api.anthropic.com/v1`, `https://api.x.ai/v1`, `https://openrouter.ai/api/v1`,
  `https://api.together.xyz/v1`, `https://api.groq.com/openai/v1`, `https://router.huggingface.co/v1`,
  `https://api.fireworks.ai/inference/v1`, `https://api.deepinfra.com/v1/openai`, `https://api.mistral.ai/v1`,
  `https://api.deepseek.com`, `https://dashscope-intl.aliyuncs.com/compatible-mode/v1`,
  `https://api.cerebras.ai/v1`, `http://localhost:11434/v1` (Ollama default).
- Paths: G `POST {base}/models/{model}:generateContent`; O `POST {base}/chat/completions`; M `POST {base}/messages`.
- Headers: G `X-goog-api-key`; O `Authorization: Bearer <key>`; M `x-api-key`, `anthropic-version: 2023-06-01`,
  and in a browser `anthropic-dangerous-direct-browser-access: true`; OpenRouter optional `HTTP-Referer`, `X-Title`.
- G body fields: `contents[].parts[]`, `inlineData {mimeType, data}`, `text`, `systemInstruction.parts[]`,
  `generationConfig {maxOutputTokens, responseMimeType, thinkingConfig {thinkingLevel}}`; response
  `candidates[0].content.parts[] {text, thought}`, `candidates[0].finishReason` (`MAX_TOKENS`).
- O body fields: `model`, `messages[] {role, content}`, content parts `{type:"image_url", image_url:{url:"data:image/jpeg;base64,…"}}`
  and `{type:"text", text}`, `max_tokens` / `max_completion_tokens`, Qwen `enable_thinking`, OpenRouter
  `reasoning {effort, exclude}`; response `choices[0].message.content` (string or parts array),
  `choices[0].finish_reason` (`length`, `error`), `message.reasoning`, `message.reasoning_content`,
  `message.reasoning_details`, top-level `error.message`.
- M body fields: `model`, `max_tokens`, `system`, `messages[] {role, content[]}`, image block
  `{type:"image", source:{type:"base64", media_type:"image/jpeg", data}}`; response `content[] {type:"text", text}`, `stop_reason` (`max_tokens`).
- Error envelopes: `error.message` (object) or `error` (string); Gemini quota metadata `quotaId` containing `PerDay`.
- Ollama server setting: `OLLAMA_ORIGINS` env var.

## 3. Behaviour

### 3.1 Provider registry (16 remote providers)

- **Data shape:** `Provider { id, displayName, keyHint, baseUrl, format: G|O|M, needsKey, needsEndpoint, freeFormModel, configurableTimeout, vision, imageModels[], textModels[] }`.
  `defaultImageModel = imageModels[0]`; `defaultTextModel = textModels[0] ?? defaultImageModel`. [obs]
- **Registry (order as in the Android picker; iOS lists its two on-device entries first):**

| # | Provider | Base URL | Fmt | Auth | Key | Vision | Free-form model id |
|---|---|---|---|---|---|---|---|
| 1 | Google Gemini | `https://generativelanguage.googleapis.com/v1beta` | G | `X-goog-api-key` | required | yes | no |
| 2 | OpenAI | `https://api.openai.com/v1` | O | Bearer | required | yes | no |
| 3 | Anthropic Claude | `https://api.anthropic.com/v1` | M | `x-api-key` + `anthropic-version` | required | yes | no |
| 4 | xAI Grok | `https://api.x.ai/v1` | O | Bearer | required | yes | no |
| 5 | OpenRouter | `https://openrouter.ai/api/v1` | O | Bearer (+ attribution headers) | required | yes | **yes** |
| 6 | Together AI | `https://api.together.xyz/v1` | O | Bearer | required | yes | no |
| 7 | Groq | `https://api.groq.com/openai/v1` | O | Bearer | required | yes | no |
| 8 | Hugging Face | `https://router.huggingface.co/v1` | O | Bearer | required | yes | **yes** |
| 9 | Fireworks AI | `https://api.fireworks.ai/inference/v1` | O | Bearer | required | yes | no |
| 10 | DeepInfra | `https://api.deepinfra.com/v1/openai` | O | Bearer | required | yes | no |
| 11 | Mistral | `https://api.mistral.ai/v1` | O | Bearer | required | yes | no |
| 12 | DeepSeek | `https://api.deepseek.com` (no `/v1`) | O | Bearer | required | **no (text only)** | no |
| 13 | Alibaba Qwen | `https://dashscope-intl.aliyuncs.com/compatible-mode/v1` (international/Singapore) | O | Bearer | required | yes | no |
| 14 | Cerebras | `https://api.cerebras.ai/v1` | O | Bearer | required | **no (text only)** | no |
| 15 | Ollama (local) | `http://localhost:11434/v1`, user-editable "Server URL" | O | none sent | **none** (no key row) | yes | no (preset list only) |
| 16 | Custom (OpenAI-compatible) | none; user must enter "Base URL" | O | Bearer if a key is set | "required", but any string is accepted (hint says so) | yes | **yes, mandatory** (no presets) |

  [obs] (identical on both platforms)
- **Image (vision) model presets, first = default** [obs]:
  - Gemini: `gemini-3.5-flash-lite`, `gemini-3.8-flash`, `gemini-3.7-flash`, `gemini-3.6-flash`, `gemini-3.5-flash`, `gemini-flash-latest`, `gemini-flash-lite-latest`, `gemini-3.1-pro-preview`.
  - OpenAI: `gpt-5.4-mini`, `gpt-6-luna`, `gpt-6-sol`, `gpt-5.6-sol`, `gpt-5.6-terra`, `gpt-5.6-luna`, `gpt-5.5`, `gpt-5.4-nano`, `gpt-4.1`, `gpt-4.1-mini`, `gpt-4o-mini`.
  - Anthropic: `claude-sonnet-5`, `claude-opus-5`, `claude-fable-5`, `claude-opus-4-8`, `claude-haiku-4-5`.
  - xAI: `grok-4.6`, `grok-4.3`.
  - OpenRouter: `openrouter/free`, `google/gemini-3.5-flash-lite`, `google/gemini-3.8-flash`, `google/gemini-3.7-flash`, `openai/gpt-5.6-luna`, `qwen/qwen3.8-27b`, `openai/gpt-5-mini`, `anthropic/claude-sonnet-5`, `qwen/qwen3-vl-8b-instruct`.
  - Together AI: `Qwen/Qwen3.5-9B`, `moonshotai/Kimi-K3`, `Qwen/Qwen3.8-2.4T-A95B`, `google/gemma-4-31B-it`, `MiniMaxAI/MiniMax-M3`.
  - Groq: `qwen/qwen3.6-27b`.
  - Hugging Face: `google/gemma-4-31B-it`, `Qwen/Qwen3.8-27B`, `moonshotai/Kimi-K3`, `google/gemma-3-27b-it`, `Qwen/Qwen3.5-9B`.
  - Fireworks: `accounts/fireworks/models/qwen3p7-plus`, `accounts/fireworks/models/kimi-k3`, `accounts/fireworks/models/muse-glimmer-30b`, `accounts/fireworks/models/minimax-m3`, `accounts/fireworks/models/kimi-k2p6`.
  - DeepInfra: `google/gemma-3-27b-it`, `Qwen/Qwen3.8-27B`, `MiniMaxAI/MiniMax-M3`, `google/gemma-4-31B-it`, `google/gemma-4-26B-A4B-it`.
  - Mistral: `mistral-small-2603`, `mistral-medium-3-5`, `mistral-large-2512`, `ministral-14b-2512`.
  - Qwen: `qwen3.7-plus`, `qwen3.8-max`, `qwen3-vl-plus`.
  - Ollama: `qwen3-vl`, `qwen3.8`, `gemma4`, `llama3.2-vision`, `llava`, `moondream`.
  - DeepSeek, Cerebras, Custom: none.
- **Text model presets** (used only by the text role and text fallback) [obs]:
  - Groq: `openai/gpt-oss-20b`, `openai/gpt-oss-120b`, `llama-3.3-70b-versatile`, `llama-3.1-8b-instant`, `qwen/qwen3.6-27b`, `qwen/qwen3.8-27b`.
  - Together AI: `MiniMaxAI/MiniMax-M2.7`, `Qwen/Qwen3.7-Max`, `Qwen/Qwen3.5-397B-A17B`, `Qwen/Qwen3.6-Plus`, `Qwen/Qwen3.5-9B`, `moonshotai/Kimi-K2.6`, `zai-org/GLM-5.1`, `zai-org/GLM-5`, `openai/gpt-oss-120b`, `openai/gpt-oss-20b`, `deepseek-ai/DeepSeek-V4-Pro`.
  - DeepSeek: `deepseek-v4-flash`, `deepseek-v4-pro`.
  - Qwen: `qwen3.8-flash`, `qwen3.7-plus`, `qwen3.8-max`.
  - Cerebras: `gpt-oss-120b`, `gemma-4-31b`.
  - Ollama: `qwen3.8`, `gemma4`, `llama3.2`, `qwen3`, `mistral-small3.2`, then the six vision presets.
  - Custom: none (free-form). Every other provider: same list as its image presets.
- **Who appears where:** the image pickers (primary, image fallback) list every provider with vision
  (14 remote). The text pickers (text, text fallback) list every provider with at least one text preset or a free-form model (all 16). [obs]
- **Model id hygiene** [obs]:
  - On save, trim and map `gemini-3.1-flash-lite-preview` to `gemini-3.1-flash-lite`.
  - On read, a fixed-list provider whose saved model is not in its list falls back to that provider's default. Free-form providers keep the saved string as is, never validated.
  - One-time, versioned upgrades rewrite removed presets for both the primary and the fallback, each by its own provider:
    - Gemini: `gemini-2.5-flash`, `gemini-2.5-pro` and `gemini-3.1-flash-lite` become `gemini-3.5-flash-lite`.
    - OpenRouter: `google/gemini-3.1-flash-lite` becomes `google/gemini-3.5-flash-lite`.
    - Hugging Face: `Qwen/Qwen2.5-VL-72B-Instruct` becomes `Qwen/Qwen3.8-27B`.
    - Mistral: `mistral-medium-2604` becomes `mistral-medium-3-5`.
    - Anthropic: `claude-sonnet-4-6` becomes `claude-sonnet-5`, and `claude-opus-4-7` becomes `claude-opus-5`.
    - A version marker stops the upgrade from re-running, so a user who deliberately picks an older, still-listed model is not overwritten on every launch.
- **No discovery, no key test:** the reference has no "test key" action and no model listing call
  (no `/models` or Ollama `/api/tags` request). [obs: grep found none]

### 3.2 Wire formats (one adapter per family)

All adapters send a single user turn: **image parts first, then one text part** carrying the prompt.
Images are always declared as `image/jpeg` (§3.5). Request body is JSON. [obs]

**G — Gemini** [obs]
- URL `{base}/models/{model}:generateContent`. Authentication travels as the `X-goog-api-key` request header; the URL carries no `key=` parameter, so the secret stays out of server and proxy logs.
- `contents: [{ parts: [inlineData…, text] }]` (no `role` on the single-shot call).
- `generationConfig` is sent only when non-empty:
  - `maxOutputTokens` = the user's token cap (default 1024) when > 0.
  - `responseMimeType: "application/json"` for JSON prompts (omitted for plain-prose prompts such as "What if?").
  - `thinkingConfig.thinkingLevel` is chosen from the model id (lower-cased, any `vendor/` prefix stripped):
    - `gemini-flash-lite-latest` gets `minimal`, and `gemini-flash-latest` gets `low`.
    - The id is parsed as `gemini-<major>[.<minor>]-<variant>`. Major below 3, or an id that does not parse, sends no thinking level.
    - A variant starting `flash-lite` gets `minimal`.
    - A variant starting `flash` gets `low` when major > 3 or minor ≥ 7, and `minimal` otherwise.
    - Everything else (Pro and other variants) gets `low`.
- Response:
  - Concatenate (no separator) the `text` of every part of `candidates[0]` except parts with `thought: true`, then trim.
  - Empty text with a finish reason other than `MAX_TOKENS` means an invalid response.
  - Finish reason `MAX_TOKENS` means truncated (§3.8).
- iOS also puts the custom instructions in `systemInstruction` (see §3.3 for the platform difference).

**O — OpenAI-compatible** (14 providers) [obs]
- URL `{base}/chat/completions`. Send `Authorization: Bearer <key>` only when a key is present; Ollama never sends one.
- `messages: [{role:"user", content:[image_url parts…, text part]}]`; images as `data:image/jpeg;base64,<…>` URLs.
  iOS prepends a `system` message carrying the custom instructions.
- Token-cap parameter name:
  - OpenAI always uses `max_completion_tokens`.
  - Custom uses `max_completion_tokens` when the model id is normalized (trimmed, lower-cased, last `/`-segment) and starts with `gpt-5`, `gpt-6`, `o1`, `o3` or `o4`.
  - Every other provider and model uses `max_tokens`.
- Provider extras:
  - Qwen adds `enable_thinking: false`. Its hybrid models otherwise think by default, which is slow and refused for non-streaming calls.
  - OpenRouter adds a `reasoning` object on every food call (§3.3) and the attribution headers `HTTP-Referer` (a project URL) and `X-Title` (the app name).
  - GPT-6 Sol/Luna tool calls need `reasoning_effort: none`. That is Coach-only and is not sent here.
- Response:
  - If the top-level `error.message` is present and there are no `choices`, raise an API error. Do the same when `finish_reason == "error"`.
  - The text is `choices[0].message.content`: either a string, or an array of parts whose `text` values are trimmed, filtered non-empty and joined with `\n`.
  - `hasReasoning` is true when `reasoning`, `reasoning_content` or `reasoning_details` is non-empty.
  - The answer is truncated when `finish_reason == "length"`. It needs a compact re-ask when it is truncated or when the text is empty while reasoning is present.

**M — Anthropic Messages** [obs]
- URL `{base}/messages`; headers `x-api-key` and `anthropic-version: 2023-06-01`.
- Body `{model, max_tokens, messages:[{role:"user", content:[image blocks…, text block]}]}`; iOS adds `system`.
- Response: join the trimmed, non-empty `text` of `content[]` blocks with `type == "text"` using `\n`.
  `stop_reason == "max_tokens"` means truncated.

**HTTP success:** Android accepts any 2xx; iOS accepts only 200 (other 2xx would be treated as failures). [obs] The rebuild should accept 2xx.

### 3.3 AI settings (what the user configures)

- **Data shape:** `AiSettings { primary: {provider, model}, separateText: bool, text: {provider, model},
  imageFallback: {enabled, provider, model}, textFallback: {enabled, provider, model},
  baseUrl[provider][primary|fallback], key[provider], customInstructions, maxTokens, timeoutSec, openRouterEffort }`.
- **Defaults** [obs]:
  - Primary is Gemini with `gemini-3.5-flash-lite`; the separate text provider is off; both fallbacks are off.
  - The token cap is 1024 (minimum 1, no maximum).
  - The timeout is 180 s, clamped to 30–600 s.
  - OpenRouter effort is `auto`, and custom instructions are empty.
  - Unset fallback provider: Android falls back to Gemini. iOS picks the first vision provider, other than the primary, that has a saved key (or needs none), and Gemini otherwise.
- **Primary provider and model:**
  - Choosing a provider resets its model to that provider's default image model.
  - The model sheet lists the presets. OpenRouter, Hugging Face and Custom also offer a "type any model id" field. Custom has only that field. [obs]
- **Rows shown per provider** (Android and iOS agree) [obs]:
  - "API Key" appears only when the provider needs a key (not for Ollama).
  - "Server URL" (Ollama) or "Base URL" (Custom) appears with a "Request Timeout" (seconds) row.
  - "Reasoning Effort" appears when OpenRouter fills any of the four roles.
  - "Max Response Tokens" is hidden when the primary is Gemini, although Gemini requests still send the cap (R03.9).
- **Use Separate Text Provider:**
  - When on, every request without images goes to the text provider and model (typed food, "What if?", goals, nutrient goals, Coach, voice transcripts).
  - Requests with images always go to the primary. [obs; test `separateTextProviderOnlyRoutesRequestsWithoutImages`]
- **Fallbacks:**
  - The image fallback serves only calls that carry at least one photo; a photo-free call never reaches it.
  - The text fallback backs up text-only requests and backs up whichever provider served them (text role if enabled, else primary). It never receives images.
  - Each fallback has its own provider, model and base-URL slot.
  - Valid backups include one provider paired with a second model of its own, or an identical model hosted at another address.
  - The fallback model picker hides the primary's model when provider and server are the same. Choosing a fallback provider equal to the primary auto-switches to that provider's first other preset. [obs]
- **Keys and URLs per role:**
  - API keys are stored **per provider**, so all roles using one provider share its key. Editing the fallback's key also updates the primary's key display when they are the same provider.
  - Base URLs are stored per provider in two slots: a primary slot (used by the primary and text roles) and a fallback slot (used by both fallbacks).
  - The slot split was a past bug fix: a one-time migration seeded the fallback slot from the shared value so existing setups kept working. [obs; test `fallbackBaseURLIsStoredSeparatelyFromPrimary`, `…MigrationSeedsSharedValueExactlyOnce`]
- **Custom AI Instructions** (free text, saved with a Save button; blank disables):
  - The text is attached to **every** AI request. Placement differs by platform [obs]:
    - Android prefixes the prompt with a short "user context, apply to every analysis" lead-in and the text.
    - iOS sends it through each format's system channel (G `systemInstruction`, O first `system` message, M `system`).
  - The on-device models receive it as their instruction.
  - Android trims the text on save. iOS stores it untrimmed but trims it on read.
- **OpenRouter reasoning effort** (`auto`, `none`, `minimal`, `low`, `medium`, `high`, `xhigh`, `max`):
  - Applies to every OpenRouter request in any role.
  - The `reasoning` object always carries `exclude: true`, so reasoning text is not returned.
  - It adds `effort: <value>` unless the effort is `auto`.
  - On the compact re-ask, `effort` is forced to `low` (still with `exclude: true`).
  - The help text explains that support varies by model and that higher effort costs more time and money. [obs]
- **Delete all data:** clears every key, both URL slots for every provider, all selections, the instructions, the fallbacks, the timeout and the migration marker. [obs]
- **Speech keys:** a speech provider with no dedicated key reuses the key of its matching AI provider (see `07`). [obs]

### 3.4 Routing and fallback (state machine)

```
Idle ─start(prompt, images)─► Preparing (settings ∥ image preprocess)
Preparing ─image decode fails─► Failed(IMAGE_CONVERSION)        [no fallback]
Preparing ─primary needs key & none─► Failed(NO_KEY)              [no fallback]
Preparing ─ok─► Primary
Primary ─text─► Done
Primary ─cancel─► Cancelled (silent)
Primary ─any other error─► (fallback config for role?) ─no─► Failed(primary kind)
                                                       └yes─► Fallback
Fallback ─text─► Done
Fallback ─cancel─► Cancelled
Fallback ─error─► Failed(BOTH: primaryName, fallbackName, detail)
Done ─► caller parses ─parse error─► Failed(INVALID_RESPONSE)    [fallback NOT tried, see R03.4]
```

- **Fallback config is valid only when** [obs]:
  - the fallback is enabled;
  - its provider has a non-empty key (or needs none);
  - its effective base URL is non-empty;
  - (provider, model, effective base URL) differs from the primary's.
  - Effective base URL = the role-slot override, or else the provider's default.
- **Errors inside the adapter** (transport, HTTP status, empty or truncated answer) trigger the fallback.
  Parsing into a food result happens **after** the pipeline returns, so a primary that answers with
  unusable JSON is not retried on the fallback. iOS's typed-text path is the exception: there parsing
  sits inside the fallback scope. Android's typed-text path parses outside it. [obs]
- **"Both failed" message:**
  - It names the primary and the fallback, then appends the fallback error's actionable message.
  - iOS uses the generic message when the fallback error is not a typed AI error.
  - iOS shows the primary's error instead when the primary is the on-device Gemma model. [obs; test `AIRequestErrorPolicyTests`]
- The error kind attached to "both failed" is the fallback's kind (Android test `combinedFailureRetainsProviderIdentityAndActionableKind`). [obs]

### 3.5 Food-analysis requests (inputs, preprocessing, prompts)

**Entry points** (all funnel into the pipeline) [obs]:

| Entry | Inputs | Prompt family | Result |
|---|---|---|---|
| Meal photos (main path; also used for one photo) | 1–10 images in capture or pick order, optional note, "progressive meal" flag (meaningful only with ≥ 2 images) | multi-image meal | food result (+ `progressiveMeal` echoed) |
| Auto photo (single image from share/import flows) | 1 image | food photo or label, model decides | food result |
| Single food photo (iOS ingredient add, Android legacy) | 1 image, optional note | single-image meal | food result |
| Typed description | free text | text meal | food result with emoji |
| Nutrition label | 1 image (+ serving grams on Android) | label per-100 g | label result, scaled to a serving |
| Serving-unit repair | name, grams, optional note, same image | repair | unit options only (§3.7) |

- **Image count:** the pickers allow at most 10 (in order), the camera stops adding at 10, and the
  analysis call takes the first 10 non-empty images. Empty buffers are dropped. Zero images means an
  invalid-response error on Android and an image-conversion error on iOS. [obs]
- **Note:** optional; no length limit found. It is appended after the instructions as user
  context for the whole image set, and asks the model to use it for identification, portion and
  nutrition. The original note is also stored on the result. [obs]
- **Image preprocessing** (each image, parallel with the settings read) [obs; test `foodPhotosAreDownscaledWithoutUpscaling`]:
  1. Decode the pixels and apply the EXIF orientation. Android first tries a fast decoder, then a platform decoder for HEIC/HEIF/WebP.
  2. Scale so the longest side is ≤ **1600 px**; never upscale. A 3200×1200 image becomes 1600×600; 800×400 stays as it is.
  3. Always re-encode as **JPEG quality 0.8** (80), opaque, scale 1. The stored original is untouched.
  4. A failure to decode or encode raises IMAGE_CONVERSION. Raw bytes are never uploaded as they are: mislabelled HEIC made Gemini stall until the timeout.
  5. The image is base64-encoded inline in the request body. There is no byte-size cap, no per-provider image-count cap in BYOK mode, and no file upload API.
- **What the meal prompt asks for** (described, not copied; rule 2):
  - **Framing:** the whole photo set describes a single meal to log. Individual photos can be extra viewpoints, parts of the meal, a scale display, a wrapper or a printed label.
  - **Default ("multiple views") mode:**
    - Count each food once across angles.
    - Sum clearly separate foods into one meal.
    - Prefer readable scale weights and label values over visual estimates.
    - Assume several views of one item unless the foods are clearly different.
  - **Progressive mode** (user toggle; only with ≥ 2 images):
    - The images are in order and show one plate being built up; each later image adds one or more items.
    - Report each item once and add newly visible items as their own components.
    - With a reliable cumulative scale (same plate and tare): the first component's weight is the first reading, and each later component's weight is the difference from the previous reading.
    - After a visible tare or reset, use that reading directly.
    - Never subtract unreadable, mismatched or decreasing readings; estimate those items from the visual change and the note instead.
    - The final weight should match the last reliable reading, and components should sum to the totals.
  - **Output contract:**
    - Return exactly one JSON object and nothing else, with the fields in §3.6.
    - Calories are integers. Macros are decimal grams. Serving weight is the grams of the amount analysed.
    - Nutrient units are fixed:
      - grams: sugars, fibre, the fats, omega-3 and the sports compounds;
      - milligrams: vitamins C and E, cholesterol, caffeine, and the minerals (zinc, iron, magnesium, calcium, potassium, sodium);
      - micrograms: folate plus vitamins A, B12, D and K.
    - The eight sports compounds (HMB, taurine, betaine, creatine, beta-alanine, plus the L-forms of arginine, carnitine and citrulline) get a value only if printed or named by the user; zero otherwise.
    - Any nutrient the model cannot estimate is null.
  - **Unit options (always required):**
    - The value is an empty list or a list of complete objects (unit name, how many of them, grams per unit), never bare strings.
    - Count × grams-per-unit must ≈ the serving grams. Gram units are excluded.
    - A count is allowed only when visible, stated, or unambiguous from a single-item portion; never infer one from the food name or the weight alone.
    - Which unit fits: countable items take slices or pieces; drinks take ml, cups or fluid ounces; spooned foods take tablespoons or teaspoons; containers (can, packet, bar) need visible packaging.
    - iOS adds: for a whole divisible food, count only the visible pieces and derive grams per unit from the total.
  - **Components (always required):**
    - Each clearly separate food appears once with name, grams, kcal and macros. Components must add up approximately to the totals.
    - Return an empty list when no reliable breakdown exists, for a single simple food, or for a label.
    - Every component gets a positive gram estimate.
    - Screenshots of menus, recipes, plans or other food apps list each dish with its stated values.
    - At most 20 components, merging minor ones. Never a total or subtotal row.
  - **Single-image variant:** estimate the amount actually visible. A whole or mostly-whole cake, pizza, pie or loaf is estimated as the visible item, not one slice.
  - **Text variant:**
    - Estimate the described foods. Parse quantities, brands and multiple items; use the brand's known data; sum the items.
    - Same contract, plus one specific food emoji, with a generic plate emoji only as a last resort.
    - Unit counts only from stated quantities.
  - **Auto variant:** first decide between food photo and nutrition label. For a label, report one labelled serving.
  - **Label variant:**
    - Read the label and return values **per 100 g** (iOS also accepts per 100 ml), converting per-serving values with the printed serving size.
    - Name the product or brand, or give a generic food type when no name is visible.
    - Unit options only when printed on the label. Missing values are null.
  - **Opt-in amino acids** (setting off by default): one extra sentence asks for gram estimates of the nine essential amino acids (per 100 g for labels). Users who never opt in get the exact same prompt.
  - **iOS-only, out of scope:** an AR portion-scale description and on-device label OCR text (OCR is added only for on-device providers).

### 3.6 Response contract and parsing

- **Food result shape:** `FoodResult { name, kcal: int, protein, carbs, fat, servingGrams, servingKnown: bool,
  emoji?, nutrients: {29 optional numbers}, extras: {sports compounds, amino acids}, unitOptions: UnitOption[≤4],
  selectedUnit?, selectedQty?, components: Component[≤20], progressive: bool, note? }`;
  `UnitOption { unit, gramsPerUnit > 0, qty? }`; `Component { name, grams > 0, kcal: int, protein, carbs, fat }`. [obs]
- **JSON extraction** (every parser) [obs]:
  1. Trim the reply. If it contains a `json` code fence (case-insensitive) or any triple-backtick fence, cut everything up to it and everything after the last closing fence.
  2. Take the first balanced `{…}` object, scanning with awareness of strings and escapes so that braces inside strings are ignored.
  3. If no `{` exists, parse the text as it is.
- **Required fields:**
  - A non-empty `name` is required; without it the parse fails as invalid.
  - Macros differ by platform:
    - Android: missing kcal or macros default to 0, and numeric strings are accepted.
    - iOS: kcal, protein, carbs and fat must all be JSON numbers, or the parse fails as invalid.
  - Non-finite numbers are treated as missing. [obs]
- **Serving weight:**
  - If it is missing, do not invent 100 g: mark the serving unknown, use an internal weight of 1, and pre-select unit "serving" with quantity 1.
  - An unknown serving can never be repaired. [obs; test `missingServingWeightRemainsUnknownInsteadOfBecomingOneHundredGrams`]
- **Unit options** (initial parse) [obs; tests `ServingUnitFallback*`]:
  - Read `unit_options`, or the legacy `serving_unit_options`. A missing key or a non-array value flags "needs repair".
  - An empty array is valid, complete and flags nothing.
  - Each element must be an object with a non-empty string unit and positive finite **JSON numbers** for quantity and grams per unit. Strings and booleans are rejected; legacy `gramsPerUnit` is accepted.
  - Gram units (`g`, `gram`, `grams`, case-insensitive) are rejected.
  - Each element must satisfy |qty × gpu − serving| ≤ max(**5 g**, **15 %** of serving), checked only when the serving is known.
  - **Any** bad element empties the whole list and flags repair.
  - Remove duplicates by lower-cased unit and keep the first **4**.
  - The first option becomes the pre-selected unit and quantity.
- **Component breakdown** (all-or-nothing; past bug #343) [obs; tests `IngredientBreakdownParserTest`]:
  1. A missing, empty or > **20**-entry list is dropped, never truncated.
  2. Each entry needs a non-empty name and numeric kcal, protein, carbs and fat in [0, **100 000**]. Numeric strings are accepted on both platforms. Grams must be absent, 0 (meaning unknown) or within (0, 100 000]. Any bad entry drops the list.
  3. An entry with unknown grams and kcal ≤ 0 drops the list.
  4. Unknown grams are filled in from the room left in the meal: remaining = meal grams − listed grams, then grams = kcal × remaining ÷ (sum of the unknown entries' kcal), rounded to 0.1 g. This requires a known meal weight, remaining > 0, and an implied density ≤ **9 kcal/g**; otherwise drop the list.
  5. Coverage check: when meal kcal > 0, the components' kcal sum ÷ meal kcal must lie within [**0.5**, **1.5**], or the list is dropped.
  6. If kept, the result's kcal and macros are **replaced by the component sums**. The serving grams stay as reported.
- **Other nutrients:** optional numbers. Sports compounds are stored under their own keys. Amino acids are kept only when 0 ≤ value ≤ min(serving grams, **1000 g**) (100 g for labels); invalid values are dropped silently. [obs]
- **Label result:**
  - Name and per-100 g kcal, protein, carbs and fat are required (iOS requires JSON numbers); other values are optional.
  - Scaling to a serving of G grams: factor G/100. Nutrients round to 0.1. Kcal is **truncated** on Android but **rounded** on iOS (R03.24).
  - The first unit option is pre-selected, with its quantity derived from G. [obs]

### 3.7 Serving-unit repair (second call)

- **When:** the parse flagged "needs repair", **and** the serving is known, **and** the result has no usable
  macros (kcal, protein, carbs and fat all ≤ 0; for example water or black coffee). Otherwise the review
  sheet opens at once with gram portions. The repair call roughly doubled the wait, and some models
  (Flash-Lite) often drop the field. [obs; tests `ServingUnitRepairPolicyTest`, `servingUnitRepairSkipsWhenMacrosAreUsable`]
- **What it asks** (described):
  - The previous answer lacked or mangled the unit list.
  - The call sends the food name, the total grams (one decimal) and the user note, and re-attaches the first image.
  - It asks for only the unit list under the same rules.
  - iOS adds vocabulary hints: count units only with evidence; ml for pourable foods; tbsp/tsp for spooned foods; can/packet/bar/scoop/bowl only when visible; never assume the whole amount is one unit.
- **Result:** the reply is parsed with the same validator. Any error, or an invalid list, is ignored and the
  first analysis is kept. A non-empty list replaces the options and pre-selects the first. The repair goes
  through the full pipeline, including retry and fallback. [obs]

### 3.8 Truncation and the compact re-ask

- **Detection:** G finish reason `MAX_TOKENS`; M `stop_reason` `max_tokens`; O `finish_reason` `length`,
  or (O only) empty text while reasoning is present. [obs]
- **Action:** re-send once with a short appended note (described):
  - The note says the previous answer was cut off or incomplete.
  - It demands the bare structured object alone: no thinking aloud, no commentary, no code fences. When the original call wanted prose (G only), it demands a brief plain reply without JSON.
  - It sets a budget: stay under N tokens, with N = the token cap.
  - On OpenRouter the re-ask also forces reasoning effort `low`.
- If the re-ask is still truncated, raise TRUNCATED ("cut off twice; shorten the input or switch model").
  If it is not truncated but still empty, raise INVALID_RESPONSE. [obs; tests `analyzeRetriesOnceCompactlyWhenTruncated`, `compactRetryPromptMentionsBudget`]

### 3.9 Retries and timeouts

- **Retryable statuses:** **429, 503, 529** only. Network exceptions are never retried. 5xx other than 503/529 are not retried. `Retry-After` is ignored. [obs]
- **Ladders:**
  - Default: wait **1 s, 2 s, 4 s**, so up to 4 attempts.
  - Interactive: one retry after **1.5 s** (2 attempts). Only G food-analysis calls use it; the goal is to show a busy-provider message within seconds rather than keep the user waiting through the full ladder.
  - O and M food calls, and every Coach and background call, use the default ladder. [obs; test `interactiveRetryProfileStopsAfterOneRetry`, `dailyQuotaRetriesFourTimesAndReadsMetadata`]
- After the last retry, the error kind comes from the last response, so daily-quota metadata in the body
  survives (4 requests seen in the test). [obs]
- **Timeouts** [obs]:
  - Android cloud calls: connect **15 s**, write **30 s**, read **60 s**, and a hard per-call cap of **75 s**, added after a first-scan hang (#357).
  - iOS cloud calls: the system default request timeout ([inf] 60 s idle).
  - Ollama and Custom: the user's timeout, **30–600 s, default 180 s**, used as the call, read and write timeout. On Android it replaces the 75 s cap.
  - Each attempt has its own timer.
- **Cancellation:** cancelling the caller (the overlay's Cancel) aborts the in-flight request, including while
  the body is streaming. It is reported as cancellation, never as a network error. [obs; tests
  `cancellingWhileTheBodyIsStreamingCancelsTheCall`, `cancellationIsNotShownAsNetworkFailure`]
- **Worst case** [inf]: primary attempts + backoff + compact re-ask + fallback attempts + repair call
  (another full pipeline). With 75 s per attempt this can exceed several minutes; only Cancel bounds it.

### 3.10 Error taxonomy and user messages

Provider text is **never** shown to the user. Every failure maps to one stable kind, and each kind
has one localized message that says what happened and what to do. The messages below are paraphrased. [obs; tests `unknownProviderBodiesNeverBecomeUserMessages`, `presentationHidesUnknownErrorDetails`]

| Kind | Raised when | Message (paraphrased) |
|---|---|---|
| NO_KEY | provider needs a key and none is stored | No key yet; add one in AI provider settings. |
| IMAGE_CONVERSION | decode/encode failed, or no images | The photo could not be prepared; try another one. |
| INVALID_RESPONSE | envelope or JSON unusable, required field missing, empty answer | The AI answer could not be read; try again. |
| INVALID_URL | empty or unparsable base URL | The API address is invalid; check provider settings. |
| OFFLINE | host lookup failed / no internet | You seem offline; check the connection. |
| CONNECTION | other transport failure (refused, TLS, reset) | Couldn't reach the provider; check the connection and the provider URL. |
| TIMEOUT | socket/request timeout | The AI took too long; retry or raise the request timeout. |
| CREDITS | 402, or body says credits are insufficient/too low/out, or a hard billing limit | The AI account has no credit left; top up or switch provider. |
| DAILY_QUOTA | body mentions quota/limit/resource-exhausted **and** a per-day marker | Today's quota on that account is used; try tomorrow or switch provider. |
| QUOTA | body says the quota was exceeded or insufficient | The account's usage quota is exceeded; check the provider's limits or switch. |
| MODEL | 404 | The model or endpoint does not exist; check model and URL. |
| RATE_LIMIT | 429 (without the markers above) | Rate-limited; wait a minute or switch provider (free tiers: check the daily quota). |
| KEY_REJECTED | 401, 403, or 400 with "API key not valid/expired" markers | The key was refused; paste a valid key. |
| OVERLOADED | 503 or 529 after retries | The provider is overloaded; we retried; try later or switch provider/model. |
| GENERIC | anything else (500, 418, unknown 400) | The AI request failed; retry or switch provider. |
| TRUNCATED | still truncated after the compact re-ask | The answer was cut off twice; shorten the input or change model. |
| LOCAL_UNAVAILABLE / UNSUPPORTED_DEVICE / TEXT_ONLY | on-device providers only (out of scope) | (on-device runtime messages) |
| BOTH_FAILED | primary and fallback both failed | "<Primary> and fallback <Fallback> both failed." + the fallback kind's message |

- **Classification order** (first match wins; input = HTTP status + parsed `error.message`, or `error` as a string, + the whole body, lower-cased):
  1. 401 or 403, or 400 with a key-invalid marker, gives KEY_REJECTED.
  2. 402, or a credit marker, gives CREDITS.
  3. A quota marker plus a daily marker gives DAILY_QUOTA. Daily markers are "daily", "per day", "per_day", "perday" and "requestsperday".
  4. A quota-exceeded marker gives QUOTA.
  5. 404 gives MODEL; 429 gives RATE_LIMIT; 503 or 529 gives OVERLOADED.
  6. Anything else gives GENERIC.
  - The same table classifies an in-body O error (status 0). [obs; tests `statusAndProviderMarkersHaveActionableKinds`, `quotasAreNotAutomaticallyBillingFailures`]
- **Network mapping:**
  - Android walks up to 8 causes: a timeout gives TIMEOUT, an unknown host gives OFFLINE, anything else gives CONNECTION.
  - iOS maps timed-out to TIMEOUT; not-connected, cannot-find-host and DNS failure to OFFLINE; everything else to CONNECTION.
  - A body cut off mid-read is a network error. [obs]
- **UI:** the food overlay shows the message with Retry, which repeats the same request with the same images and note.
  "What if?" shows the message inline. Goal and nutrient-goal recalculation keep the old values (§3.11). [obs; UI in food-logging area]

### 3.11 Other AI calls in this area

**"What if?" (before logging a meal)** [obs, both platforms]
- **Trigger:** a "What if?" button on the review sheet. It is a text-only call (text role and text fallback) with JSON mode off (no `responseMimeType`).
- **Inputs:** the profile (sex, age, weight in the preferred unit, activity, weight goal, body fat or "not set"), the daily
  kcal and macro targets, today's totals before the meal, the meal's kcal and macros, and the totals if the meal is logged.
  iOS also sends the remaining amounts (negative means over) and up to **12** of today's meals (name, kcal, macros).
  Users who chose kJ get one extra instruction to reply in kJ.
- **Prompt asks** (described):
  - Answer in 2–4 short plain sentences, with no markdown (Android also: under 90 words; iOS also: no bullets).
  - Say whether this meal fits today's targets.
  - Give one practical next step: log as is, eat less, swap part, add protein/fibre, or balance the next meal.
  - Be concrete with the numbers, and stay non-medical.
  - iOS also forbids claiming the meal is logged or changing goals.
- **Output:** the trimmed text. On iOS an empty reply becomes a neutral "no suggestion" line. Errors show inline as the mapped message.
  If no profile exists yet, Android returns a "finish onboarding" hint without calling the AI.

**Optional (non-macro) nutrient goals** [obs, both platforms]
- **Trigger:** automatically after a successful "Recalculate goals" (goals area). It is a text-only call.
  A failure is swallowed and the existing nutrient goals are kept.
- **Inputs:** age, sex, height, weight, activity, goal, and current kcal/macro targets.
  iOS also sends goal weight, body fat, both canonical and preferred units, and the user's current value for each nutrient goal.
- **Prompt asks** (described):
  - Return integers for the 29 non-macro nutrients and nothing else.
  - Never return kcal or macros.
  - Units are grams, milligrams or micrograms as in §3.5.
  - Ceilings (stay below): both sugar figures, saturated and trans fat, cholesterol, caffeine, sodium. Floors (reach at least): fibre, omega-3, vitamins and minerals other than sodium.
  - The sports compounds stay 0 unless requested.
  - Use realistic general-adult targets adjusted by the profile. Android adds: added sugar and saturated fat about ≤ 10 % of kcal, fibre about 14 g per 1000 kcal, a conservative caffeine limit, and sodium near general guidance.
- **Parsing:**
  - Android accepts numbers or numeric strings, alias keys (camelCase, `_g`/`_mg`/`_mcg`), rounds and clamps to ≥ 0. Each missing key falls back to the app's **default** goal (defaults live in the goals area).
  - iOS accepts only JSON numbers, falls back per key to the **current** goal, and fails if no key parsed.
  - Platform difference: R03.25.

**Other consumers of the same pipeline (specified elsewhere)** [obs]:
- AI goal calculation (goals area). Its parser rejects out-of-range plans: kcal 800–6000, protein 10–500, carbs 0–1500, fat 10–400, and |4P+4C+9F − kcal| ≤ max(100, 15 %).
- Health-energy kcal suggestion, which is clamped to 800–6000.
- Allergy lab-report extraction, which returns `{allergens: []}` with duplicates removed case-insensitively.
- Workout text drafting and exercise photo fill (later phases).
- iOS weight-trend analysis.
- Coach chat (Coach area). Its adapters add multi-turn `history` and `system`, and it uses the default retry ladder.

### 3.12 Key storage

- **Android:** an encrypted key-value store (AES-256-SIV key names, AES-256-GCM values) under a hardware-backed master key.
  Entries are named by provider. Saving blank deletes the entry; keys are **not** trimmed on save (R03.20).
  If the store cannot be decrypted (the master key survived a reinstall but the file did not), the app deletes
  the file and the master key and starts empty instead of crashing at launch. The user re-enters keys. [obs]
- **iOS:** generic-password Keychain items, one per provider, readable after first unlock. Saving deletes, then adds. Values are trimmed in
  the main settings rows; the image- and text-fallback key fields store the raw value without trimming. [obs]
- **Display:** a saved key shows masked as its first 4 characters, "...", then its last 4. [obs Android]
- **Backups:** AI keys are not part of the backup or export archives. [inf: no key reads in the backup code]
- **Transmission:** only in request headers (G header, not query; O Bearer; M `x-api-key`). [obs]

### 3.13 Transport trust (HTTP vs HTTPS)

- **Built-in endpoints** are all hard-coded HTTPS, except Ollama's default `http://localhost:11434/v1`. [obs]
- **Android:**
  - Cleartext HTTP is allowed app-wide, so that Ollama on a private LAN works. The comment states the intent.
  - **No check** limits HTTP to private or loopback hosts. A Custom `http://` URL to a public host sends the Bearer key in clear text. [obs; R03.3]
  - HTTPS uses a restricted TLS profile and, before any header or body is sent, checks every peer certificate:
    RSA ≥ 2048 bits, EC ≥ 256 bits, or Ed25519/Ed448. MD2, MD5 and SHA-1 signatures are rejected, and hostname verification stays on.
    [obs; tests `rejectsWeakKeyBeforeSendingCredentials`, `preservesHostnameVerification`, `retainsExplicitLocalHttpSupport`]
- **iOS:** App Transport Security allows HTTP only for local networking, so remote HTTP is blocked.
  The local-network permission text names connecting to an Ollama server on the LAN. [obs; [inf] exact host classes per Apple's ATS rules]
- **Ollama on a phone:** `localhost` is the phone itself, so in practice the user types the LAN address of the machine
  running Ollama, including `/v1`. [inf]

### 3.14 On-device and hosted modes (out of scope; what they are)

- **Apple Intelligence (iOS only):**
  - A system language model on device: text for iOS 26+ and images for iOS 27+.
  - Needs no key. It is offered first in the iOS pickers.
  - When it fails on images, the call falls back to the configured image fallback. [obs]
- **Gemma 4 E2B on device (both platforms):**
  - A downloaded local model (`gemma-4-E2B-it`) run through a local runtime, with images supported.
  - It is selectable only on capable devices.
  - Deleting it resets every role that used it to Gemini and disables that role's fallback. [obs]
- **Hosted AI mode (Plus/Pro subscription):**
  - A server picks the model and meters usage. It caps requests at 3 images and recordings at 2 minutes.
  - It has its own error kinds (subscription required, quota exceeded, busy, too large, and so on).
  - In hosted mode, no BYOK key, fallback or on-device model is used. [obs]
  - Later phase for Platewise.

### 3.15 PWA: browser constraints per provider

The PWA calls vendors with `fetch` straight from the device, so every provider must allow CORS for
the page's origin, and every response (including errors) must carry `Access-Control-Allow-Origin`, or
the page cannot read it. Probes on 2026-10-26 (curl preflight `OPTIONS` with `Origin`,
`Access-Control-Request-Method: POST` and the provider's headers, plus a key-less or bogus-key `POST`) found the following. [obs]

| Provider | Preflight (headers needed) | ACAO on error reply | Browser verdict |
|---|---|---|---|
| Gemini | 200; allows `content-type,x-goog-api-key`; echoes origin | yes (400 bad key, 403 no key) | direct |
| OpenAI | 200; allows `authorization,content-type` | yes (401) | direct |
| Anthropic | 200; allows the four headers incl. `anthropic-dangerous-direct-browser-access` | **only when that header = `true`**; without it the 401 has **no** ACAO | direct **with the extra header** |
| xAI | 200; `*` methods and headers | yes (400; `error` is a **string**) | direct |
| OpenRouter | 204; allows `HTTP-Referer`, `X-Title` and more | yes (401) | direct |
| Together AI | 200 | yes (401) | direct |
| Groq | 204 | yes (401) | direct |
| Hugging Face | 200 | no-auth 401 (HTML) **lacks** ACAO; bad-token 401 has it (`error` string) | direct (blank key: opaque error) |
| Fireworks | 200 | yes (400) | direct |
| DeepInfra | 200 | yes (401) | direct |
| Mistral | 200 | yes (401; body `{detail}`, no `error`) | direct |
| DeepSeek | 200; echoes origin; credentials allowed | yes (401, plain-text body) | direct |
| Qwen (intl) | 200; echoes origin | yes (400) | direct |
| Cerebras | 200 | **no** (401 bad key lacks ACAO) | direct for success; a **bad key looks like a network error** |
| Ollama | server default allows only `127.0.0.1`/`0.0.0.0`/`localhost` origins (vendor FAQ; [unk] exact list per version) | n/a | needs `OLLAMA_ORIGINS` to include the PWA origin, **and** mixed-content rules (below) |
| Custom | depends on the server | depends | [unk] per server |

Vendor policies can change without notice. These are point-in-time observations from one network,
and success responses carrying a real key were **not** probed ([unk]: whether a vendor strips ACAO on 200).

**Mixed content and local network** [inf unless stated]:
- An HTTPS-served PWA may fetch `http://localhost`, `http://127.0.0.1` and `http://[::1]` in Chromium and Firefox, because loopback counts as potentially trustworthy. Safari's behaviour is [unk].
- `http://192.168.x.x` (an Ollama server on the LAN) is blocked as mixed content from an HTTPS page, so a phone PWA cannot reach a LAN Ollama over HTTP.
- Chromium's local-network-access permission prompt for public-to-private requests is [unk] for the current version.

**Proposed handling for the PWA:**
1. Give each provider a `browserAccess` property: `direct` (13 cloud vendors), `directWithHeader` (Anthropic: always send
   `anthropic-dangerous-direct-browser-access: true`), `userServer` (Ollama, Custom) and `unsupported` (reserved for vendors that start blocking CORS).
   Ship all 16 entries; none needs to be hidden today.
2. For `userServer`:
   - Accept `https://` anywhere. Accept `http://` **only** for loopback hosts.
   - Refuse to save `http://` to any other host, with an explanation: use HTTPS (for example a reverse proxy with a trusted certificate) or run the PWA on the same machine.
   - Show setup help for `OLLAMA_ORIGINS`.
3. Add an optional per-provider **proxy base URL** (advanced). The PWA then sends the same request to the
   proxy instead of the vendor. Warn that the proxy sees the key and the photos. Never ship a default proxy (BYOK promise).
4. **Opaque failures:** a `fetch` `TypeError` cannot tell CORS, DNS, TLS and offline apart.
   - Map `navigator.onLine === false` to OFFLINE.
   - Map an abort raised by our own deadline to TIMEOUT.
   - Map a user abort to cancelled.
   - Map everything else to CONNECTION. For providers known to strip CORS on errors (Cerebras; Hugging Face with a blank key; Anthropic without the header), the message adds "or the key was rejected".
5. Send OpenRouter attribution as Platewise's own URL and title. The browser also sends `Referer` itself.
6. **Timeouts:** the browser has no separate connect, read or write timeouts. Use one `AbortSignal` deadline per attempt: 75 s for cloud providers, and the user value (30–600 s, default 180 s) for Ollama and Custom.
7. **Image preprocessing in the browser:**
   - Decode with `createImageBitmap(blob, {imageOrientation: "from-image"})`.
   - Draw onto an (Offscreen)Canvas with the longest side ≤ 1600 px, never upscaling.
   - Export with `toBlob("image/jpeg", 0.8)`, then base64-encode.
   - HEIC decodes in Safari only [inf]; elsewhere a HEIC file must fail cleanly as IMAGE_CONVERSION.
8. **Keys at rest:**
   - Store keys in IndexedDB, encrypted with AES-GCM under a non-extractable WebCrypto key that is also kept in IndexedDB. This protects against casual disk reads, **not** against XSS on the origin.
   - Hence a strict CSP and no third-party scripts.
   - An optional passphrase lock is a product choice (§7).
   - If the wrapping key is missing (storage was cleared), treat every key as unset.

## 4. File map (what to read in the Read step)

A = `/root/reference/fud-ai/android/app/src/main/java/com/apoorvdarshan/calorietracker`,
I = `/root/reference/fud-ai/ios/calorietracker`, T/IT = the matching test roots.

| Sub-area | Reference path | Lines | Read what | Docs / tests to read with it |
|---|---|---|---|---|
| Registry | `A/models/AIProvider.kt` | 339 | all | `T/services/ai/AIRequestConfigurationTest.kt` (331), `T/services/ai/OpenAITokenLimitParameterTest.kt` (87) |
| Registry + settings (iOS) | `I/Models/AIProvider.swift` | 979 | all (settings, fallbacks, migrations) | `IT/AIModelRegistryTests.swift` (383), `IT/AIRequestConfigurationTests.swift` (324), `IT/OpenAITokenLimitTests.swift` (44) |
| OpenRouter effort | `A/models/OpenRouterReasoningEffort.kt` | 27 | all | `T/services/ai/OpenRouterReasoningEffortTest.kt` (30), `IT/OpenRouterReasoningEffortTests.swift` (31) |
| Errors | `A/services/ai/AiError.kt` | 91 | all | `T/services/ai/AiErrorTest.kt` (55), `T/services/ai/RetryPolicyErrorTest.kt` (50) |
| Errors (iOS) | `I/Services/AIErrorMessages.swift`, `I/Services/AIRequestErrorPolicy.swift` | 86, 13 | all | `IT/AIErrorMessagesTests.swift` (47), `IT/AIRequestErrorIntegrationTests.swift` (112), `IT/AIRequestErrorPolicyTests.swift` (30) |
| Retry, cancel | `A/services/ai/RetryPolicy.kt` | 139 | all | `T/services/ai/RetryPolicyThreadingTest.kt` (162) |
| G adapter | `A/services/ai/GeminiClient.kt`, `I/Services/GeminiRequestConfiguration.swift` | 248, 101 | all | `T/services/ai/GeminiClientTest.kt` (233), `IT/GeminiRequestConfigurationTests.swift` (167) |
| O adapter | `A/services/ai/OpenAICompatibleClient.kt` | 239 | all (analyze + parser) | token-limit tests above |
| M adapter | `A/services/ai/AnthropicClient.kt` | 154 | all | `IT/AnthropicResponseParsingTests.swift` (53) |
| Pipeline + prompts | `A/services/ai/FoodAnalysisService.kt` | 806 | `callAi`, `dispatch`, fallback configs, client timeouts; skim prompts for intent only | `T/services/ai/ServingUnitRepairPolicyTest.kt` (66) |
| Pipeline + prompts (iOS) | `I/Services/GeminiService.swift` | 1989 | §"Unified AI Call Router" (~L820–1105), adapters (~L1105–1435), parsing (~L1436–1989); skim prompts for intent only | `IT/ServingUnitFallbackTests.swift` (420) |
| Parsing | `A/services/ai/FoodAnalysis.kt` | 666 | `extractJson`, `parseFoodResponse`, `parseIngredients`, `parseLabelResponse`, `parseServingUnitOptionsResult`, `parseOptionalNutrientGoals` | `T/services/ai/IngredientBreakdownParserTest.kt` (230), `T/services/ai/ServingUnitFallbackDecisionTest.kt` (87), `T/services/ai/GoalCalculationParserTest.kt` (72) |
| Unit option model | `A/models/ServingUnitOption.kt` | 132 | all | — |
| Repair policy | `A/services/ai/ServingUnitRepairPolicy.kt`, `I/Services/ServingUnitRepairPolicy.swift` | 47, 47 | all | tests above |
| Image prep | `A/services/ai/FoodImagePreprocessor.kt`, `A/services/FoodImageDecoder.kt` | 36, 151 | all | `IT/AIRequestConfigurationTests.swift` `foodPhotosAreDownscaledWithoutUpscaling` |
| Amino acids (opt-in) | `A/models/AminoAcid.kt` | 134 | `AminoAcidEstimates` | `IT/AminoAcidTests.swift` (224) |
| Settings snapshot | `A/data/PreferencesStore.kt` | 1739 | search `foodAiCallSettings`, `migrateFallbackBaseUrls`, `Keys` | — |
| Settings UI logic | `A/ui/settings/SettingsViewModel.kt` | 1727 | search `selectProvider`, `selectFallbackProvider`, `setApiKey`, `setCustomBaseUrl`, `maskKey`, `recalculateGoals` | — |
| Key storage | `A/data/KeyStore.kt`, `I/Services/KeychainHelper.swift` | 129, 42 | all | — |
| TLS | `A/services/SecureHttpClient.kt`, `android/app/src/main/res/xml/network_security_config.xml`, `I/Info.plist` | 43, 6, — | all | `T/services/SecureHttpClientTest.kt` (88) |
| Hosted / BYOK switch | `A/ui/settings/AiAccessSettings.kt`, `I/Services/AIGate.swift` | 208, 48 | skim (later phase) | `T/services/hosted/HostedAiClientTest.kt` (202) |
| On-device | `I/Services/OnDeviceFoodService.swift` | 371 | skim (out of scope) | `IT/LocalModelSelectionSanitizationTests.swift` (49) |
| What-if caller | `A/ui/home/HomeViewModel.kt`, `I/Views/FoodResultView.swift` | 1255, 1750 | search `suggestMealWhatIf` / `loadSuggestion` | — |

Giant files:
- `A/ui/settings/SettingsScreen.kt` [5141]: the AI section is around L1225–1520 (provider, model, key, URL, timeout, reasoning effort, max tokens, text AI, both fallbacks, custom instructions). The sheets are around L2855–3140. Search `SettingsSheet.AI_PROVIDER`.
- `I/ContentView.swift` [7966]: the AI settings rows are around L5740–5850 (key, URL, timeout, OpenRouter effort, max tokens). Custom instructions are around L6360. Fallback rows are around L6190 and L6880. Recalculate and nutrient goals are around L7360. The photo-analysis call is around L2560. Photo-picker limits are at L2244 and L3528.

## 5. Minimum viable subset (for the PWA)

**v1 needs:**
- **Registry of all 16 remote providers** with the exact base URLs, formats, headers and model presets of §3.1.
  This maps directly. Mark per-provider `browserAccess` (§3.15). Ship the presets as data (JSON) so they can be refreshed without code changes.
- **Three adapters (G, O, M)** with the provider extras:
  - Qwen `enable_thinking:false`;
  - OpenRouter `reasoning` and attribution headers;
  - the `max_completion_tokens` rule;
  - the Gemini `generationConfig` and thinking-level table;
  - the Anthropic browser header.
- **Roles:** primary (vision), optional separate text provider, image fallback, text fallback; per-role base-URL slots; per-provider keys.
- **Settings:** model presets plus free-form ids (OpenRouter, Hugging Face, Custom; recommended also for Ollama, R03.21),
  custom instructions, OpenRouter effort, max tokens (default 1024), timeout for Ollama and Custom (30–600 s, default 180 s).
- **Pipeline:** settings snapshot, image preprocessing (canvas, ≤1600 px, JPEG 0.8), retry on 429/503/529 (interactive
  1.5 s for every format on food calls, 1/2/4 s elsewhere), compact re-ask on truncation, fallback, cancellation via `AbortController`.
- **Food entry points:** meal photos (1–10, note, progressive), typed text, nutrition label (later in v1 if barcode-miss flows need it), auto photo.
- **Parsers:** JSON extraction, food result, unit options, component breakdown, label scaling, serving-unit repair.
- **Error taxonomy + messages** (own copy), with the browser mapping of §3.15 item 4.
- **"What if?"** and **optional nutrient-goal estimation** (after goal recalculation).
- **Key storage:** IndexedDB + WebCrypto wrapping; masked display; cleared by "delete all data".

**Needs a web equivalent:**
- Keychain or encrypted prefs become a WebCrypto-wrapped IndexedDB store.
- OkHttp/URLSession timeouts become `AbortSignal` deadlines.
- Native image decoders become `createImageBitmap` + canvas.
- Cleartext config becomes the loopback-only HTTP rule.
- OS network errors become `TypeError` heuristics.

**Out of v1:**
- Apple Intelligence and on-device Gemma (no browser equivalent; WebGPU models are a possible later phase).
- Hosted AI mode.
- AR portion scale and on-device label OCR.
- Amino-acid opt-in (optional; cheap to add later because it only appends to prompts).
- Workout AI, exercise photo fill, allergy lab reports (later phases or other areas).
- Model migrations (no legacy users), but keep a versioned "preset upgrade" hook for future registry changes (R03.28).

## 6. Hard parts / traps

1. **R03.1 Anthropic needs an opt-in header in the browser.** Without `anthropic-dangerous-direct-browser-access: true`
   the reply carries no `Access-Control-Allow-Origin`, so `fetch` fails as if offline. Always send it from the PWA. [obs probe 2026-10-26]
2. **R03.2 Opaque browser failures hide key errors.** CORS, DNS, TLS and offline all surface as the same `TypeError`.
   Some vendors omit CORS headers on error replies (Cerebras bad-key 401; Hugging Face 401 with no auth), so a wrong
   key looks like a connection error. Use `navigator.onLine`, abort reasons and per-provider hints (§3.15 item 4).
   Never show the raw exception. [obs probe]
3. **R03.3 HTTP sends keys in clear.** Android permits cleartext to any host, so a Custom `http://` public URL leaks the Bearer key. iOS limits HTTP to the LAN.
   In the PWA, mixed-content rules block LAN HTTP anyway. Allow `http://` only for loopback and refuse other HTTP URLs at save time. [obs]
4. **R03.4 The fallback does not cover parse failures.** The fallback runs only for errors inside the adapter.
   A primary that returns unusable JSON fails with INVALID_RESPONSE without trying the fallback (image path on both platforms; the text path differs between them).
   A missing primary key and image conversion errors also skip the fallback. Decide the rule (§7 Q1), make it the same for every entry point, and test it. [obs]
5. **R03.5 Fallback identity and URL slots.** "Same as primary" means the same provider, model **and** effective base URL.
   The same provider with another model, or the same model on another server, is valid.
   Fallback base URLs need their own slot per provider. A shared slot was a past bug: two Ollama servers could not be primary and fallback. [obs; tests `imageAndTextFallbacksResolveIndependently`, `fallbackBaseURLIsStoredSeparatelyFromPrimary`]
6. **R03.6 Unbounded waits.** Only G food calls use the single 1.5 s retry; O and M food calls still use 1/2/4 s (4 attempts).
   Add the 75 s per-attempt cap, the compact re-ask, the fallback, and a repair call that goes through the whole pipeline again, and Cancel is the only bound.
   Use the interactive ladder for every format on food calls and consider an overall deadline. Cancel MUST abort the request and show nothing. [obs; tests `interactiveRetryProfileStopsAfterOneRetry`, `cancellingWhileTheBodyIsStreamingCancelsTheCall`]
7. **R03.7 Gemini thinking output.** Gemini 3 replies can contain several parts, including `thought: true` summaries.
   Reading only the first part produced false INVALID_RESPONSE errors. Join every non-thought part, and treat `MAX_TOKENS` as truncation, not as invalid. [obs; test `parserJoinsEveryTextPartAndSkipsThoughtParts`]
8. **R03.8 Thinking-level table.** Without `generationConfig`, Gemini 3 Flash-Lite thought for so long that the overlay hit the timeout (#357).
   `minimal` is rejected (HTTP 400) by Flash ≥ 3.7 and by Pro, and pre-3 models must get no level at all. Implement the table in §3.2 exactly, including the `-latest` aliases. [obs; tests `minimalThinkingOnlyGoesToModelsThatAcceptIt`, `latestAliasesKeepAFastThinkingLevel`]
9. **R03.9 Hidden token cap.** "Max Response Tokens" is hidden for Gemini, yet Gemini food calls still send `maxOutputTokens` = the cap (default 1024).
   Long multi-dish JSON can truncate with no visible setting to raise. Show the setting for every format, or give G a separate, larger default. [obs]
10. **R03.10 Token-limit parameter name.** OpenAI requires `max_completion_tokens`. Custom needs it only for `gpt-5*`, `gpt-6*`, `o1*`, `o3*` and `o4*` after lower-casing and stripping a `vendor/` prefix.
    Every other provider takes `max_tokens`. A wrong name gives a 400. [obs; tests `OpenAITokenLimit*`]
11. **R03.11 Qwen and OpenRouter request extras.** Qwen needs `enable_thinking: false` on non-streaming calls.
    OpenRouter needs `reasoning.exclude: true` so reasoning text does not crowd out the answer, and its compact re-ask forces `effort: "low"`.
    A reply holding only reasoning counts as truncated. [obs; test `OpenRouterReasoningEffortTest`]
12. **R03.12 Always re-encode images as JPEG.** Every adapter declares `image/jpeg`. Uploading HEIC or other raw bytes under that label made Gemini stall until the timeout.
    Re-encode every image: EXIF upright, longest side ≤ 1600 px, never upscale, quality 0.8. Fail as IMAGE_CONVERSION when decoding fails (HEIC outside Safari). [obs]
13. **R03.13 JSON extraction.** Models wrap JSON in fences or prose. Strip fences, then take the first balanced object while tracking strings and escapes so `}` inside names is ignored.
    Do not use a greedy first-to-last-brace match. [obs]
14. **R03.14 The component breakdown is all or nothing (#343).** The breakdown replaces the meal macros, so a partial or padded list corrupts totals.
    Drop it (never truncate) when: there are more than 20 entries; any entry is malformed or negative; a gram estimate cannot fit the meal at ≤ 9 kcal/g; or calorie coverage falls outside 0.5–1.5.
    Repair missing grams from the meal's remaining weight. [obs; tests `IngredientBreakdownParserTest`]
15. **R03.15 Missing serving weight.** When the model omits the weight, do not invent 100 g. Mark it unknown, use "1 serving", and never run the unit repair on it. [obs; test `missingServingWeightRemainsUnknownInsteadOfBecomingOneHundredGrams`]
16. **R03.16 Strict unit-option validation.**
    - Quantity and grams-per-unit must be real positive JSON numbers; booleans and strings are rejected.
    - The represented total must be within max(5 g, 15 %) of the serving.
    - One bad element voids the list and flags repair. An empty array is a valid answer and must **not** trigger repair.
    - Accept the legacy aliases, drop gram units, de-duplicate case-insensitively, and keep 4.
    [obs; tests `ServingUnitFallback*`, `booleanQuantityRequiresFallback`]
17. **R03.17 Repair only zero-macro results.** The repair call roughly doubles latency.
    Run it only when units are missing or malformed **and** the serving is known **and** kcal, protein, carbs and fat are all ≤ 0 (water, black coffee). Ignore repair failures. [obs; tests `usableMacrosSkipTheRepairRoundTrip`, `zeroCalorieFoodsWithKnownWeightStillGetUnits`]
18. **R03.18 Never show provider text.**
    - Error bodies can echo keys, prompts or internal details; map them to fixed kinds and fixed copy.
    - Classification still needs the **body**: Gemini's daily quota is visible only in `details[].quotaId` (`…PerDay…`), and that metadata must survive retries.
    - Error bodies differ by vendor: an `error` object, an `error` string (xAI, Hugging Face), `detail` (Mistral) or plain text (DeepSeek).
    [obs; tests `dailyQuotaMetadataSurvivesAllExistingRetries`, `unknownProviderBodiesNeverBecomeUserMessages`; probe]
19. **R03.19 Classification order matters.** Check 401/403 first, then credits, then daily quota, quota, 404, 429, 503/529 and generic.
    A 429 saying "quota exceeded" is QUOTA, not RATE_LIMIT. "Insufficient credits" in a 400 is CREDITS. A quota with "per day" is DAILY_QUOTA.
    Note that the bare word "limit" plus "daily" also matches DAILY_QUOTA. Keep the order and the tests. [obs; tests `statusAndProviderMarkersHaveActionableKinds`, `quotasAreNotAutomaticallyBillingFailures`]
20. **R03.20 Custom endpoint keys and models.**
    - The reference *requires* a key for Custom, while its hint says any text works; Ollama gets no key field at all.
    - The Custom model may be blank, which sends `"model": ""`.
    - Keys are not trimmed on Android or in the iOS fallback-key fields; a pasted trailing newline breaks auth.
    - Rebuild: Custom key optional (omit `Authorization` when blank), model required, always trim keys.
    [obs]
21. **R03.21 Ollama has no free-form model.** Ollama accepts only the six preset names, so users cannot pick tags such as `qwen3-vl:8b`.
    Allow free-form ids for Ollama (and Custom). [obs]
22. **R03.22 Base URL shape.** URLs are joined as `{base}/chat/completions`, so a trailing `/` gives `//chat/completions`, and a missing `/v1` on Ollama gives 404 (MODEL).
    Normalise: trim, remove trailing slashes, and offer an "add /v1" hint for Ollama. DeepSeek's default base intentionally has no `/v1`. [inf]
23. **R03.23 Custom instructions placement.** Android puts them in the prompt; iOS sends them on the system channel.
    Pick one: the system channel, which keeps prompts stable and lets G use `systemInstruction`. Test that every role, including fallback and repair, receives them. [obs]
24. **R03.24 Label kcal rounding.** Scaling a label to a serving truncates kcal on Android and rounds on iOS. Choose rounding and test it. [obs]
25. **R03.25 Nutrient-goal fallback differs.** Android falls back per key to the app defaults (accepting strings and aliases); iOS falls back to the user's current goals and needs at least one key.
    Use the iOS behaviour (keep the user's values) with Android's tolerant parsing. A failure must never clear goals. [obs]
26. **R03.26 HTTP success range.** iOS treats only 200 as success. Accept any 2xx. [obs]
27. **R03.27 Key-store recovery.** If the wrapping key or the encrypted store is unreadable, the app must start with "no keys" and never crash.
    Android had a launch crash after reinstall until it wiped and rebuilt the store. [obs]
28. **R03.28 Model presets go stale.** Vendors retire models (Groq's Llama 4 Scout shut down 2026-07-17, per a reference comment). A saved preset that disappears must map to a provider-scoped replacement **once**, under a version marker, for the primary and the fallback, and also for free-form providers.
    Otherwise removed presets stay forever, or user choices are overwritten on every launch. [obs; tests `modelRegistryMigrationUpgradesPrimaryAndFallbackExactlyOnce`, `appLaunchMigrationPreservesSupportedModels…`]
29. **R03.29 Request size and image count.** Ten 1600-px JPEGs sent inline as base64 can reach several MB in one body.
    Vendors have per-image and per-request caps ([unk] current values: about 5 MB per image on Anthropic, about 20 MB of inline data per Gemini request, a historical 5-image cap on some Groq models).
    Estimate the payload before sending, and turn a 400/413 into a "too many or too large photos" message rather than GENERIC. [unk]

## 7. Open questions

1. Should a primary reply that parses badly (INVALID_RESPONSE) trigger the fallback on every entry point?
   The reference does not, except iOS typed text. Needed: product decision. Recommendation: yes, the fallback exists to rescue an analysis.
2. Should the PWA offer a user-supplied proxy URL per provider (§3.15 item 3), and with what warning?
   All 14 cloud vendors allowed CORS on 2026-10-26, so a proxy is needed only for Ollama/Custom over HTTP or future CORS changes.
   Needed: product and security decision.
3. One interactive retry (1.5 s) for every format on food calls, and an overall deadline (for example 120 s including the fallback)?
   Needed: product decision on maximum spinner time.
4. Where do custom instructions go (system channel vs prompt prefix)? Needed: decision, then an A/B check that answers do not regress on G, O and M.
5. Which model presets ship in v1, and who refreshes them? The reference ids are dated 2026-09-07 and 2026-10-17. Needed: a live check against each vendor's model list at build time, and a refresh owner.
6. The max-token default for Gemini (R03.9): keep 1024 shared, or set a larger G default? Needed: measurement of typical multi-dish JSON size per model.
7. Key at-rest protection: is WebCrypto wrapping without a user secret enough, or is an optional passphrase lock wanted? Needed: product/security decision.
8. Browser behaviour that the probes could not settle: Safari and `http://localhost` from an HTTPS page; Chromium's local-network permission prompt; whether any vendor strips CORS on **200** replies with a real key.
   Needed: a browser test matrix with real keys (an REA runtime capture or manual test).
9. Vendor image limits for 10-photo meals (Anthropic, Gemini, Groq, Mistral, Together and others). Needed: vendor docs check, plus a live 10-image request per vendor.
10. Should Ollama on a phone be documented as "same-machine or HTTPS only"? Needed: product decision on support scope.

## 8. What to read later

- **Reference docs:** none dedicated. The marketing-site capture lists the advertised providers and the "phone goes straight to your provider" promise (`ev_fa243a1fe14ed63cc6252910410ee973c07740c25cc70484db1eab53b44d991a`, REA `capture-browser-scenario`, site `home.a11y.txt` around L90–L167).
- **Reference tests that list the edge cases:**
  - Android: `T/services/ai/{AIRequestConfigurationTest,GeminiClientTest,RetryPolicyErrorTest,RetryPolicyThreadingTest,AiErrorTest,OpenAITokenLimitParameterTest,ServingUnitFallbackDecisionTest,ServingUnitRepairPolicyTest,IngredientBreakdownParserTest,GoalCalculationParserTest,OpenRouterReasoningEffortTest}.kt` and `T/services/SecureHttpClientTest.kt`.
  - iOS: `IT/{AIModelRegistryTests,AIRequestConfigurationTests,AIRequestErrorIntegrationTests,AIErrorMessagesTests,AIRequestErrorPolicyTests,GeminiRequestConfigurationTests,ServingUnitFallbackTests,AnthropicResponseParsingTests,OpenAITokenLimitTests,OpenRouterReasoningEffortTests,AminoAcidTests}.swift`.
- **REA Evidence (outside the repo):** `ev_fa243a1fe14ed63cc6252910410ee973c07740c25cc70484db1eab53b44d991a` (site). The CORS probes were plain curl runs, not REA. Re-run them, or capture a browser scenario with real keys, before release.
- **Vendor docs to verify at build time:**
  - Anthropic: browser access header, image limits.
  - Gemini: `thinkingLevel` values, inline-data size.
  - OpenAI: `max_completion_tokens`.
  - OpenRouter: `reasoning` object, attribution headers.
  - Qwen: `enable_thinking`.
  - Ollama: FAQ on `OLLAMA_ORIGINS` (docs.ollama.com/faq).
- **Related specs:**
  - `07` speech providers (shared keys, §3.3).
  - The goals area (AI goal calculation, optional nutrient defaults).
  - The food-logging area (capture flow, analyzing overlay, review sheet, saving).
  - The Coach area (chat adapters, tools, reasoning-effort rules for GPT-6).
  - The settings and backup areas ("delete all data", export excludes keys).
