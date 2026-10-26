# Task: OpenAI-compatible adapter (P03-08) · Phase: 03 · Owner: builder (wt-p03s3)

<!-- Save as platewise/docs/notes/P<nn>/<slug>.md. Write everything above "Compare checklist"
BEFORE writing code, in your own words. Never paste or paraphrase the reference line by line. -->

Read (reference @ `10e14b67`): `A/services/ai/OpenAICompatibleClient.kt` (all: the request body
and headers, the provider extras, which token-limit name each provider gets, the reply parser and
when it asks for a compact re-ask), `A/models/OpenRouterReasoningEffort.kt` (the effort values and
how the `reasoning` object is formed), then `T/services/ai/OpenAITokenLimitParameterTest.kt`,
`OpenAIResponseParserTest.kt`, `OpenRouterReasoningEffortTest.kt` and
`IT/OpenAITokenLimitTests.swift` (model ids with gateways, casing and spaces, blank ids, every
provider against a GPT-6 id, reasoning next to content, reasoning-only replies, a `length` stop
with partial content, auto versus explicit effort). Research spec `03-ai-providers.md` §2 and
§3.2 O, §3.3 (effort), §3.8, §3.15 (OpenRouter attribution); traps R03.10, R03.11, R03.20;
decision D-16.24. Vendor check on 2026-10-26: OpenRouter documents `HTTP-Referer` and
`X-OpenRouter-Title` ("`X-Title` also accepted"), and `reasoning.effort` values max, xhigh, high,
medium, low, minimal, none, with `exclude`.

What it does (own words): one adapter serves the fourteen providers that speak the
`chat/completions` dialect (OpenAI, xAI, OpenRouter, Together, Groq, Hugging Face, Fireworks,
DeepInfra, Mistral, DeepSeek, Qwen, Cerebras, Ollama, Custom). The key goes in
`Authorization: Bearer` only when there is one (Ollama never has one, Custom may not). The
messages are a `system` message holding our system text with the person's notes (D-16.24) and
one user message: the photos as `data:image/jpeg;base64,…` image parts, then the prompt as a text
part. Providers disagree on the name of the answer limit: OpenAI insists on
`max_completion_tokens`; a Custom server gets it only when its model id looks like an OpenAI
reasoning-era model (gpt-5, gpt-6, o1, o3, o4 after trimming, lower-casing and keeping the last
`/` segment); everyone else gets `max_tokens`, and the wrong name is a 400 (R03.10). Two
providers need extras (R03.11): Qwen's hybrid models think by default, which is slow and refused
without streaming, so `enable_thinking: false`; OpenRouter gets a `reasoning` object that always
hides the reasoning text (`exclude: true`) and adds the person's effort unless it is auto, plus
attribution headers naming Platewise. Reading the reply: some providers return an error inside a
success reply (an `error` without `choices`, or `finish_reason: "error"`), which is classified like
an error status; the answer text is `content` as a string, or the trimmed non-empty texts of its
parts joined by newlines; a `length` stop, or no text while a reasoning field is filled (the model
spent its budget thinking), counts as cut off so the client re-asks once.

Inputs → outputs:
- `buildOpenAiCompat(input)` → `{ url, init }`: `POST {base}/chat/completions`.
- `readOpenAiCompat(status, bodyText, { secrets }?)` → `Result<string, SingleFailure>`.
- `tokenLimitField(provider, model)` → `'max_completion_tokens' | 'max_tokens'`.

Files: created `src/ai/adapters/openaiCompat.ts`, `src/ai/adapters/openaiCompat.test.ts`, this
note; shares `src/ai/adapters/request.ts` with P03-07 and P03-09.

Edge cases / failure modes:
- Custom `vendor/GPT-5.4-mini` → `max_completion_tokens`; `llama3`, blank or spaces → `max_tokens`.
- OpenAI with any model → `max_completion_tokens`; OpenRouter `openai/gpt-6-sol` → `max_tokens`.
- A key of only spaces counts as no key (R03.20: keys are trimmed); no `Authorization` header.
- OpenRouter effort auto → `{exclude: true}`; high → `{exclude: true, effort: "high"}`; the
  client passes `low` for the compact re-ask (03 §3.8).
- Text-only request: the user content is the prompt as a plain string, which every server of the
  family accepts; with photos it is the parts list (image parts first).
- Blank system text → no system message.
- `content: null` with `reasoning_details` → truncated; `content: "  "` with nothing else → unusable.
- Parts content: texts trimmed, blanks dropped, joined with `\n`.
- `error.message` with no `choices` in a 200 → classified with status 0 (e.g. a quota message →
  quota); `error` as a bare string likewise; `finish_reason: "error"` → classified.
- A body without `choices` or without a `message` → unusable; a non-JSON body → unusable.

Our design differences / decisions:
- System message on every request with the notes (D-16.24); the reference's Android client sent
  no system message for food calls.
- Attribution is Platewise's own: `HTTP-Referer` = our project address constant, `X-Title` =
  "Platewise". `X-Title` is kept over the newer `X-OpenRouter-Title` because the 2026-10-26 CORS
  probe saw `X-Title` in OpenRouter's allowed headers; an unlisted header would fail the preflight.
- A text-only request sends string content (see above).
- A reasoning-only reply reads as `truncated`, so after the one re-ask it ends as truncated (the
  reference ended it as an unusable reply).
- The `reasoning_effort: none` Coach extra for GPT-6 tool calls is Coach-only (P08), not here.
- Names are ours (`buildOpenAiCompat`, `readOpenAiCompat`, `tokenLimitField`).

Tests we will write (`openaiCompat.test.ts`):
- Token field per provider and Custom model ids (ACC-E2-2), the Verify vectors plus gateway ids.
- Qwen `enable_thinking: false`; OpenRouter effort auto/high/none with `exclude: true`, its
  attribution headers, absent on other providers.
- Ollama and a blank Custom key send no `Authorization`; OpenAI sends `Bearer`.
- Body: system message first, image parts before the text part.
- Reader: string content trimmed, parts joined, reasoning-only → truncated, `length` →
  truncated, in-body errors classified, unusable shapes → invalidResponse.

Compare checklist (filled after the rewrite; reopened `OpenAICompatibleClient.kt`,
`OpenRouterReasoningEffort.kt`, `OpenAITokenLimitParameterTest.kt`, `OpenAIResponseParserTest.kt`,
`OpenRouterReasoningEffortTest.kt`, `OpenAITokenLimitTests.swift`):
- [x] OpenAI always `max_completion_tokens`, in the sent body too (ACC-E2-2)
  (`src/ai/adapters/openaiCompat.test.ts > tokenLimitField (R03.10) > gives OpenAI
  max_completion_tokens for every model (ACC-E2-2)`)
- [x] Custom: gpt-5, gpt-6, o1, o3, o4 after trimming, lower-casing and the last `/` segment
  (`> gives a Custom server max_completion_tokens for %j`); other, blank and space-only ids
  (`> gives a Custom server max_tokens for %j`); the sent field (`> sends the field the Custom
  model needs`)
- [x] Every other provider `max_tokens`, even for OpenAI-looking ids (`> gives every other
  provider max_tokens, even for an OpenAI model id`)
- [x] Qwen `enable_thinking: false`, only Qwen (`provider extras (R03.11) > turns Qwen thinking
  off, and only for Qwen`)
- [x] OpenRouter `reasoning`: `exclude: true` always, effort unless auto, `low` for the re-ask
  (`> always excludes OpenRouter reasoning and names the effort unless it is auto`); none on
  other providers (`> sends no reasoning object to other providers`)
- [x] Attribution headers name Platewise, only on OpenRouter (`> names Platewise in the
  OpenRouter attribution headers, and only for OpenRouter`)
- [x] `Authorization: Bearer` only with a key; trimmed; none for Ollama or a blank Custom key
  (`buildOpenAiCompat: address and key > posts to {base}/chat/completions with the key as a Bearer
  token`, `> sends no Authorization header to Ollama, or to a Custom server with a blank key`);
  DeepSeek's base without `/v1` (`> keeps DeepSeek’s base without /v1 and drops a trailing
  slash`)
- [x] System message with the notes first, image parts before the text part
  (`buildOpenAiCompat: messages > sends the system message with the notes first, then the photos
  before the text`)
- [x] Reply: string content trimmed with reasoning beside it ignored (`readOpenAiCompat (R03.11) >
  reads string content, trimmed, and ignores reasoning next to it`); parts joined with newlines
  (`> joins the trimmed, non-empty texts of a parts list with newlines`)
- [x] Reasoning-only replies in each of the three fields → cut off (`> reads a reply with only %s
  as cut off`); a `length` stop with partial content → cut off (`> reads a length stop as cut
  off, even with part of an answer`)
- [x] In-body errors (error without choices, `finish_reason: "error"`) classified with status 0
  (`> classifies an error inside a success reply, with status 0`, `> keeps the key out of the
  detail of an in-body error`); unusable shapes (`> reads %s as unusable`)
- Mutation check: OpenAI rule removed (1 test fails), `o4` dropped (1), reasoning-only read as
  unusable (3), auto effort without `exclude` (1), no Qwen switch (1), Bearer without a key (1),
  in-body error ignored (2).
- Deliberate differences: a `system` message with the notes on every request (D-16.24);
  Platewise's own attribution; text-only requests send string content; a key is trimmed and a
  blank one sends no header (R03.20); an `error` given as a bare string, or an error object
  without a message, inside a success reply is classified (the reference read only
  `error.message`); a `length` stop is cut off even without a `message`; a reasoning-only reply
  stays `truncated` after the re-ask (the reference ended it as unusable).
- Not taken: the compact re-ask prompt and the low effort on it (the client passes `low`,
  P03-17); `reasoning_effort: none` for GPT-6 tool calls (Coach, P08); the effort setting's
  parsing and default (settings, P03-04); the Coach chat call (P08).

## Decisions for the lead

- OpenRouter attribution: `HTTP-Referer` = `ATTRIBUTION_URL` (`https://github.com/varunisrani/cal.2`,
  the project's repository, since Platewise has no site yet, 17 §1.1) and `X-Title` =
  `Platewise`. Change the constant in `src/ai/adapters/openaiCompat.ts` when a site exists.
- `X-Title` rather than OpenRouter's newer `X-OpenRouter-Title`: OpenRouter still documents
  `X-Title` as accepted (2026-10-26), and only `X-Title` was seen in its CORS allow-list by the
  probe of 03 §3.15. P03-19's probe can re-check the newer name.
- A text-only request sends `content` as a plain string: every server of the family takes that
  form, while the parts list is only needed for photos.
- No `response_format` is sent for JSON requests: the reference sends none, and several servers
  in the family refuse it; the prompt asks for JSON.

## Status

Done (2026-10-26). Created `src/ai/adapters/openaiCompat.ts`, `openaiCompat.test.ts` (45 tests),
this note; shares `src/ai/adapters/request.ts` (P03-07). Nothing changed outside the task's files.
