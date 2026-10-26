# Task: error kinds, classification and messages (P03-01) · Phase: 03 · Owner: builder (wt-p03a)

<!-- Save as platewise/docs/notes/P<nn>/<slug>.md. Write everything above "Compare checklist"
BEFORE writing code, in your own words. Never paste or paraphrase the reference line by line. -->

Read (reference @ `10e14b67`): `A/services/ai/AiError.kt` (all), `I/Services/AIErrorMessages.swift`
(all), `I/Services/AIRequestErrorPolicy.swift` (all), then the tests `T/services/ai/AiErrorTest.kt`,
`T/services/ai/RetryPolicyErrorTest.kt`, `IT/AIRequestErrorIntegrationTests.swift`. Research spec
`03-ai-providers.md` §3.10 (taxonomy, order, network mapping), §3.4 (both-failed rule), §3.15
item 4 (opaque browser failures, per-provider hint), traps R03.2, R03.18, R03.19, R03.29.
Decision D-16.31 (Coach Details may show the provider's text). Naming: 17 §1.4 and §1.6
(`AiFailure`, `classify`, `fromNetwork`; reference error ids `ai.error.*` are banned). No
Evidence ids. The reference's message wording was read only to know what each kind covers; every
message below is written fresh.

What it does (own words): every AI request that goes wrong ends in exactly one failure kind, and
each kind has one fixed, plain message that says what happened and what the person can do. The
text a provider sends back is never shown: it can echo the key, the prompt or server internals,
and it is in the vendor's words. Classification still has to read that text, because some causes
are only visible in the body (Gemini's daily quota sits in a `quotaId` deep inside the error
details), and vendors wrap the message differently (an `error` object, a bare `error` string, a
`detail` field, or plain text). In the browser, a failed `fetch` is an opaque `TypeError`, so the
network side uses what we do know: whether the person cancelled, whether our own deadline fired,
whether the device says it is offline, and which provider was called (two vendors hide a refused
key behind a missing CORS header, so for them the connection message adds "check the key too").

Inputs → outputs:
- `classify(status, bodyText)` → one of keyRejected, credits, dailyQuota, quota, model, rateLimit,
  overloaded, tooLarge, generic. First match wins, in this order: (1) 401 or 403, or 400 with an
  invalid-key phrase → keyRejected; (2) 402, or a credit phrase → credits; (3) a quota word
  (quota, limit, resource exhausted) together with a per-day word (daily, per day, per_day,
  per-day, perday; `requestsPerDay` and a `quotaId` with `PerDay` contain "perday") → dailyQuota;
  (4) "quota" together with "exceed" or "insufficient" → quota; (5) 404 → model; 429 → rateLimit;
  503 or 529 → overloaded; (6) 413, or 400 with a size phrase → tooLarge; (7) generic. The
  phrases are searched, lower-cased, in the whole body plus the message read from it. Status 0
  stands for an error found inside a success reply (OpenAI-compatible in-body errors).
- `readProviderMessage(bodyText)` → the vendor's message text or undefined: `error.message`, else
  `error` as a string, else `detail` as a string, else a top-level `message` string; a body that is
  not JSON is the message itself unless it looks like markup (HTML error pages are dropped).
- `fromReply(status, bodyText, {secrets})` → `AiFailure` with the classified kind, the status and a
  `detail` (the provider message, every stored key replaced by `•••`, cut to 300 characters) for
  the Coach Details view (D-16.31) and for debugging; never part of a message.
- `fromNetwork(error, {stoppedBy, online, provider, keySent})` → cancelled when the person's
  Cancel fired; timeout when our deadline or attempt cap fired; with no `stoppedBy`, an error named
  `TimeoutError` → timeout and one named `AbortError` → cancelled; then `online === false` →
  offline; anything else → connection, with `keyMayBeRefused` for Cerebras (always) and Hugging
  Face when no key was sent. `online` defaults to `navigator.onLine` through a tiny reader, so
  tests pass it in and need no global stubs. The error's own text is never kept.
- `bothFailed(primary, standby, standbyFailure)` → kind bothFailed naming both providers (display
  names) and carrying the standby's failure (its kind is the one to act on); a cancelled standby
  stays cancelled.
- `failureMessages(failure)` → the catalogue keys (with params) to show, in order: none for
  cancelled; for bothFailed the "both failed" line then the standby's lines; for a connection
  failure with the hint, the connection line then the hint line; else the kind's one key.
- `src/i18n/en/ai.ts`: partition `{ ai: { failure: { <kind>: … }, hint: { keyMayBeRefused } } }`.

Files: created `src/ai/errors.ts`, `src/ai/errors.test.ts`, `src/i18n/en/ai.ts`, this note.
`src/i18n/en.ts` is the lead's (adds the partition at land time).

Edge cases / failure modes:
- 429 saying "quota exceeded" → quota (not rateLimit); 429 with "insufficient_quota" → quota.
- 400 "insufficient credits" → credits; 402 with any body → credits.
- A credit phrase plus a daily phrase → credits (credits is checked first).
- Gemini 429 whose only daily hint is the `quotaId` inside `details[].violations[]` → dailyQuota.
- "limit" + "daily" with no "quota" → dailyQuota (R03.19 notes it; kept on purpose: a per-day
  request limit is a daily quota).
- 403 with a quota phrase → keyRejected (status rules for keys come first).
- xAI `{"error": "<text>"}`, Mistral `{"detail": "<text>"}`, DeepSeek plain text: all classified
  and all give a detail.
- 500 and 418 with any text → generic; unknown 400 → generic.
- Body that is not valid JSON, an empty body, `null`, an array: no crash, phrases still searched.
- 413 → tooLarge; 400 "payload size exceeds the limit" → tooLarge (not dailyQuota: no per-day word).
- Key text inside a body: never in a message; replaced in the detail.
- `fromNetwork` with a `TypeError` while offline → offline; while online → connection; a user
  cancel while offline → cancelled (cancel comes first).

Our design differences / decisions:
- Kinds are camelCase string literals in one `FAILURE_KINDS` list; `AiFailure` is plain data
  (no Error subclass), so it fits `Result` and can be stored and compared.
- Message keys live under `ai.failure.<kind>` (the reference's `ai.error.*` ids are banned). There
  is no key for cancelled: it is never shown, so it has no copy (the row says "never shown").
- One key per shown kind plus two extra lines: `ai.hint.keyMayBeRefused` (appended to connection
  for the two CORS-hiding vendors, R03.2) and the bothFailed line takes `{primary}` and
  `{standby}` params; the standby's own message follows it as a second line.
- New kinds beyond the reference: tooLarge (R03.29), roundLimit (Coach step cap), cancelled
  (silent). On-device kinds dropped (out of scope).
- Wider phrase lists than the reference where vendors are known to word things differently:
  invalid-key also matches "incorrect api key", "invalid api key" and "invalid_api_key" (xAI and
  Qwen answer a bad key with 400); credits also matches "insufficient balance" and "not enough
  credit"; quota-exceeded is "quota" with "exceed" or "insufficient" rather than a fixed list.
- Network mapping uses browser signals (abort source, `navigator.onLine`) instead of exception
  classes, which the browser does not expose (§3.15 item 4).
- `detail` is kept only on failures built from a reply (`fromReply`), redacted and capped; no
  network failure keeps the exception's text.

Tests we will write (`src/ai/errors.test.ts`):
- Each classification rule with a status and a body, including the order cases above (R03.19).
- Body shapes: Gemini error object with `quotaId` in details, OpenAI error object, xAI string
  `error`, Mistral `detail`, DeepSeek plain text, HTML page (R03.18).
- 500 and 418 → generic; tooLarge for 413 and a 400 size phrase.
- `fromNetwork`: user cancel, our deadline, a bare AbortError, a TimeoutError, offline flag,
  connection, the hint for Cerebras and for Hugging Face without a key, not for others (R03.2).
- `fromReply`: detail read from each shape, key redacted, capped; detail never in any message.
- Messages: every kind except cancelled has exactly one key in the partition; every key the
  helpers produce exists; the partition passes the catalogue lint; no message text contains the
  provider body (ACC-E10-2); 401 → keyRejected → the paste-a-valid-key key (ACC-E10-1);
  bothFailed shows both names then the standby's message.

Compare checklist (filled after the rewrite; reopened `A/services/ai/AiError.kt`,
`I/Services/AIErrorMessages.swift`, `I/Services/AIRequestErrorPolicy.swift`,
`T/services/ai/AiErrorTest.kt`, `T/services/ai/RetryPolicyErrorTest.kt`,
`IT/AIRequestErrorIntegrationTests.swift`):
- [x] 401/403, and 400 with an invalid-key phrase → keyRejected, first of all rules (tested in
  `src/ai/errors.test.ts > classify: rules in order (R03.19) > 401 → keyRejected`, `> 403 →
  keyRejected`, `> 400 "API key not valid" → keyRejected`, `> 400 API_KEY_INVALID →
  keyRejected`, `> 400 "api key expired" → keyRejected`, `> 400 API_KEY_EXPIRED → keyRejected`,
  `> 400 invalid_api_key → keyRejected`)
- [x] 402 or a credit phrase → credits, billing hard limit included (`> 402 → credits`, `> 402
  with any text → credits`, `> 400 "insufficient credits" → credits`, `> 400 "credit balance is
  too low" → credits`, `> 429 "out of credits" → credits`, `> 429 billing_hard_limit_reached →
  credits`, `> calls a 400 that says the credits are insufficient credits`)
- [x] Quota word + per-day word → dailyQuota, Gemini's `quotaId` in the details included, and the
  bare "limit" + "daily" case (`> 429 "daily quota" → dailyQuota`, `> 429 "limit per day" →
  dailyQuota`, `> 429 quota + per_day code → dailyQuota`, `> reads Gemini's daily quota from the
  quota id in the error details (R03.18)`, `> counts a daily request limit as the daily quota,
  even without the word quota`)
- [x] Quota exceeded / insufficient_quota → quota, before the status rules (`> 429 "quota
  exceeded" → quota`, `> 429 insufficient_quota → quota`, `> calls a 429 that says the quota was
  exceeded quota, not rateLimit`)
- [x] 404 → model, 429 → rateLimit, 503/529 → overloaded, else generic; 418 and 500 generic
  (`> 404 → model`, `> 429 → rateLimit`, `> 503 → overloaded`, `> 529 → overloaded`, `> 500 →
  generic`, `> 418 → generic`, `> an unknown 400 → generic`)
- [x] The whole order (`> keeps the order: key before credit, credit before daily quota, quota
  before status`); a mutation that checks 429 before credits fails 11 tests
- [x] In-body errors with status 0 (`> classifies an error found inside a success reply
  (status 0)`)
- [x] Network: timeout / offline / connection, cancel never shown as a network failure, the
  error's text never kept (`src/ai/errors.test.ts > fromNetwork (R03.2) > reports the person
  cancelling as cancelled, even while offline`, `> reports our deadline as timeout`, `> reads an
  abort it was not told about from the error name`, `> reports an offline device as offline, and
  anything else as connection`, `> never keeps the error text`)
- [x] Unknown provider text never becomes a message (`> messages (ACC-E10-1, ACC-E10-2) > never
  shows the provider body, whatever its shape (ACC-E10-2)`, 10 statuses × 6 body shapes, plain
  and inside bothFailed)
- [x] Both failed: both names, the standby's kind and message after the both-failed line
  (`> bothFailed > names both providers and keeps the standby failure`, `> shows the both-failed
  line, then the standby message`)
- Deliberate differences: kinds tooLarge (413, or 400 naming the size, R03.29), roundLimit and
  cancelled are new; wider invalid-key and credit phrase lists (xAI/Qwen "incorrect api key",
  "invalid api key", "insufficient balance", "not enough credit"); quota-exceeded is "quota" with
  "exceed" or "insufficient" anywhere in the body (covers the reference's four phrases and more
  wordings); phrases are searched in the parsed provider message as well as the raw body (JSON
  escapes); the browser network mapping (abort source, `navigator.onLine`, per-provider CORS hint)
  replaces exception classes; a redacted, capped `detail` is kept for a Details view (D-16.31);
  the both-failed message is two catalogue lines instead of one formatted string.
- Not taken: on-device kinds and the rule that shows an on-device primary's error instead of the
  standby's (on-device is out of scope); hosted-AI kinds (later phase); walking exception causes
  (the browser has none). The iOS rule "an error that is not an AI or network error shows the
  generic message" belongs to the client (P03-17): see Decisions.

## Decisions for the lead

- Catalogue keys are `ai.failure.<kind>` (17 §1.4 bans `ai.error.*`) plus
  `ai.hint.keyMayBeRefused`. **No key for `cancelled`**: it is never shown, so
  `messageKey('cancelled')` is null and `failureMessages` returns `[]`. If you want a key per kind
  literally, add one under `ai.failure.cancelled` and drop the null.
- The partition is `ai` in `src/i18n/en/ai.ts`; add `import { ai } from './en/ai';` and `ai` to
  `enPartitions` in `src/i18n/en.ts` when this lands. A test already lints it next to the other
  partitions. `TKey` will then cover the `ai` keys; until then `errors.ts` types them as
  `MessageKey<typeof ai>`.
- Messages refer to the settings page as "AI settings" and to the timeout as "Give up after" and
  the token cap as "answer length limit" (17 §2). Rename in the copy if the P05 page title differs.
- `failureMessages(failure)` returns a list of `{key, params?}` lines to render in order (one for
  most kinds; two for bothFailed and for a hinted connection failure; none for cancelled).
- `bothFailed(primary, standby, standbyFailure)` takes provider **display names** and the
  standby's `SingleFailure`; a cancelled standby returns the cancel itself. The primary's own
  failure is not kept (the reference keeps only the standby's); P08 can add it if Details wants it.
- `fromReply(status, body, {secrets})` keeps a `detail` (provider message, every given key
  replaced by `•••`, whitespace flattened, max 300 characters; none for HTML pages). Only a
  Details view may show it (D-16.31). Callers pass the key(s) they sent as `secrets`.
- `fromNetwork(error, {stoppedBy, online, provider, keySent})`: P03-05's deadline reports which
  signal fired as `stoppedBy`; without it, a `TimeoutError` name means timeout and an
  `AbortError` name means cancelled. Use it only for rejections of `fetch` and of the body read;
  an unexpected exception elsewhere in the pipeline should become `generic` (as the reference's
  presentation does), not `connection` (follow-up for P03-17).
- The CORS-hint providers (`cerebras` always, `huggingface` without a key) are a small map in
  `errors.ts` keyed by our provider ids (17 §1.4). P03-03 may move this to a catalogue property
  (e.g. next to `browserAccess`) and pass it in.
- tooLarge phrases for a 400: payload, too large, too_large, too many images, image exceeds,
  size exceeds, request size. Kept narrow on purpose ("exceeds the maximum" also appears in
  token-cap errors, which are not about photos).

## Status

Done (2026-10-26). Created `src/ai/errors.ts`, `src/ai/errors.test.ts` (74 tests),
`src/i18n/en/ai.ts`. Nothing changed outside the task's files; `src/i18n/en.ts` is left for the
lead (one import, one `enPartitions` entry).
