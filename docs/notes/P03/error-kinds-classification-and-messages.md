# Task: error kinds, classification and messages (P03-01) · Phase: 03 · Owner: builder (wt-p03a, wave A)

Read (reference @ `10e14b67`): `A/services/ai/AiError.kt` (all), `I/Services/AIErrorMessages.swift`
(all), `I/Services/AIRequestErrorPolicy.swift` (all), `A/services/ai/RetryPolicy.kt` (only the
lines that build the text handed to the classifier and the error-body reader),
`I/Services/GeminiService.swift` (only the request loop's classification call and its error-body
reader, around lines 1385–1432, and the error description switch around line 170), tests
`T/services/ai/AiErrorTest.kt`, `T/services/ai/RetryPolicyErrorTest.kt`,
`IT/AIRequestErrorIntegrationTests.swift`. Research spec `03-ai-providers.md` §3.10, §3.15 items 1
and 4, traps R03.2, R03.18, R03.19, R03.29; decision D-16.31 (Coach Details) in
`16-what-we-change.md`; naming table `17` §1.4 and §1.6 (`AiFailure`, `classify`, `fromNetwork`;
reference string ids are banned). Vendor error shapes checked on 2026-10-26 against the Anthropic
error reference (`{type: "error", error: {type, message}}`, 402 billing, 413 `request_too_large`,
529 overloaded).

What it does (own words): every way an AI call can go wrong ends as one small value, an
`AiFailure` with a `kind`, and every kind but `cancelled` has exactly one fixed sentence of ours in
the catalogue that tells the person what happened and what to try. Nothing a provider writes in an
error reply is ever turned into screen text: the reply is only read to decide the kind (and, for
Coach's Details disclosure only, kept as `detail` so P08 can show it with stored keys masked).
`classify(status, bodyText)` decides the kind of a failed HTTP reply by walking a fixed list of
tests, first match wins, because many replies carry several signals at once (a 429 that talks
about quota, a 400 that talks about credit). `fromNetwork(error, ctx)` decides the kind when no
reply came back at all: in a browser every transport failure is the same opaque `TypeError`, so
the decision uses what we know ourselves (which of our signals fired, whether the device says it
is offline, and which provider was called).

Inputs → outputs:
- `classify(status, bodyText)` → `SingleFailure { kind, status, detail? }`. Status 0 means an
  error found inside a 200 body (an OpenAI-compatible in-body error).
- `fromNetwork(error, ctx)` → `SingleFailure`; ctx: `{ stoppedBy?: 'cancel' | 'deadline',
  online?: boolean, provider?: string, keySent?: boolean }`.
- `bothFailed(primaryName, standbyName, standbyFailure)` → the combined failure (or the
  cancellation unchanged).
- `failureMessage(failure)` → the catalogue text, or `null` for `cancelled` (shown nowhere).
- `providerDetail(bodyText)` → the provider's own message, trimmed and capped, for Details only.
- `redactKeys(text, keys)` → the text with every stored key replaced by a mask.
- `AiFailureError` (an `Error` carrying a failure, for layers that throw) and `isAiFailureError`.

Files: created `src/ai/errors.ts`, `src/ai/errors.test.ts`, `src/i18n/en/ai.ts`; changed
`src/i18n/en.ts` (shared: the import line and the `ai` entry in `enPartitions`).

Edge cases / failure modes:
- Order of the tests (R03.19): 401/403, or 400 with a refused-key marker → keyRejected; 402 or a
  credit marker (any status) → credits; a quota-ish word together with a per-day word →
  dailyQuota; a quota-exceeded marker → quota; 404 → model; 429 → rateLimit; 503/529 →
  overloaded; 413, or 400 with a payload-size marker → tooLarge (R03.29); anything else → generic.
- A 429 whose text says the quota is exceeded is quota, not rateLimit; a 400 that says the
  credits are insufficient is credits; Gemini's per-day limit is only visible in the body's
  `quotaId` (`…PerDay…`), so the whole body is searched, not only the parsed message (R03.18).
- The bare word "limit" next to "daily" also counts as a daily quota (kept on purpose, R03.19).
- Body shapes: `{error: {message}}` (Gemini, OpenAI, Anthropic), `{error: "<text>"}` (xAI,
  Hugging Face), `{detail: "<text>"}` (Mistral), a plain-text body (DeepSeek), an HTML page
  (Hugging Face without a key), an empty body, a JSON body of none of these shapes.
- Matching is case-insensitive (bodies shout: `RESOURCE_EXHAUSTED`, `INSUFFICIENT CREDITS`).
- Browser network failures: a `TypeError` for CORS, DNS, TLS and offline alike (R03.2). Abort
  errors carry the name `AbortError` or `TimeoutError`; in the test environment two
  `DOMException` classes exist (jsdom's and Node's), so names are compared, never `instanceof`.
- Cerebras (bad key) and Hugging Face (no key) send error replies without CORS headers, so a
  refused key arrives as a connection failure: the connection message then adds that the key may
  have been refused (03 §3.15 item 4). Anthropic would be a third such case without its browser
  header, but P03-09 always sends that header.
- Cancel must never surface: `cancelled` has no message, and a standby failing by cancellation
  stays `cancelled` rather than turning into bothFailed.
- Long or hostile bodies: `detail` is capped and never used outside Details; key redaction
  ignores empty or very short secrets so a one-letter value cannot blank the text.

Our design differences / decisions:
- Names are ours: `AiFailure` (a value, not an exception class hierarchy), kinds in camelCase,
  catalogue keys under `ai.failure.<kind>` (the reference's string ids are banned).
- Marker lists are our own data: grouped by meaning in our own constants and order. Markers that
  the reference has are kept for behaviour; a few refused-key spellings seen from vendors that
  answer a bad key with 400 (xAI's "incorrect API key", "invalid api key", `invalid_api_key`)
  are added on purpose, so those 400s read as keyRejected instead of generic. Recorded for the
  lead.
- New kinds the reference lacks: `tooLarge` (R03.29: 413 or a 400 naming payload size),
  `roundLimit` (Coach, R04.11), `cancelled` (a value instead of a thrown cancellation), and
  `bothFailed` carrying the whole standby failure (its kind, status and hint) plus both names.
- On-device and hosted kinds of the reference are out of scope (no on-device runtime, no hosted
  tier).
- `fromNetwork` follows the order in the row: our cancel → cancelled; our deadline → timeout;
  `navigator.onLine === false` → offline; else connection (with the key hint where it applies).
  An `AiFailureError` passed in keeps its own failure.
- The provider-hides-key-refusals list lives in `errors.ts` for now (Cerebras always, Hugging Face
  without a key); P03-03's catalogue may take it over as a provider property later.
- Messages: our own plain sentences; they point at "Settings › AI providers" (the P09-01 page
  name) and the "Give up after" row (P09-07) for the timeout.

Tests we will write (`src/ai/errors.test.ts`):
- Status rules: 401, 403 → keyRejected; 400 with each refused-key marker → keyRejected; 402 →
  credits; 404 → model; 429 → rateLimit; 503, 529 → overloaded; 413 → tooLarge; 500, 418 and an
  unknown 400 → generic.
- Order: 429 with "quota exceeded" → quota; 400 "insufficient credits" → credits; 403 that talks
  about credit stays keyRejected; Gemini body with `quotaId …PerDay…` → dailyQuota; "daily" plus
  "limit" → dailyQuota; per-minute Gemini quota → quota; 400 naming payload size → tooLarge while
  a 400 key marker wins over size.
- Body shapes: xAI string `error`, Mistral `detail`, DeepSeek plain text, HTML, empty body all
  classified and their `detail` read; in-body error with status 0.
- `fromNetwork`: offline flag → offline (ctx and `navigator.onLine`); our deadline → timeout;
  user abort → cancelled; `TimeoutError` / `AbortError` names without ctx; `TypeError` →
  connection; the Cerebras and key-less Hugging Face hint; an `AiFailureError` passes through.
- Messages: every kind except `cancelled` maps to a catalogue key and renders our text; the text
  never contains the provider body (ACC-E10-2); a refused key renders the paste-a-valid-key
  sentence (ACC-E10-1); `cancelled` renders nothing; `bothFailed` names both providers and ends
  with the standby kind's sentence; the connection hint sentence.
- `bothFailed()` keeps a cancellation as `cancelled`; `redactKeys` masks every stored key and
  ignores short ones; `providerDetail` caps long bodies; `AiFailureError.message` holds no body
  text.

Compare checklist (filled after the rewrite; reopened `A/services/ai/AiError.kt`,
`I/Services/AIErrorMessages.swift`, `I/Services/AIRequestErrorPolicy.swift`, the classification
lines of `A/services/ai/RetryPolicy.kt` and `I/Services/GeminiService.swift`, and the three test
files; every branch walked against `src/ai/errors.ts`). Test names are in `src/ai/errors.test.ts`
unless another file is named.
- [x] 401 and 403 → keyRejected whatever the body (`classify > reads 401 and 403 as a refused
      key, whatever the body says`)
- [x] 400 with each refused-key spelling, one per body, and the same words on a 500 not enough
      (`classify > reads a 400 as a refused key only when the body talks about the key`)
- [x] 402 and every credit sign, on 400 and on 429, ahead of the quota rules (`classify > reads
      402 and credit wording as credits, ahead of quota and status rules`); key refusal ahead of
      credit wording (`classify > keeps a refused key ahead of credit wording`)
- [x] Daily quota: Gemini `quotaId …PerDay…`, "per day", `per_day`, and "limit" with "daily"
      (`classify > reads a quota with a per-day sign as the daily quota, from the Gemini quotaId
      too`); case-insensitive (`classify > matches its signs whatever their case`)
- [x] Quota: "quota exceeded" on a 429, `insufficient_quota`, `quota_exceeded`, Gemini's
      per-minute "exceeded your current quota" (`classify > reads quota-exceeded wording as quota,
      not a rate limit, even on a 429`)
- [x] 404 → model, 429 → rateLimit, 503/529 → overloaded (`classify > maps 404, 429, 503 and 529
      by status when no wording applies`)
- [x] 500, 418, an unknown 400 and 502 → generic (`classify > falls back to generic for 500, 418
      and a 400 it does not recognise`)
- [x] 413 and 400 size wording → tooLarge, key wording wins, a large token setting does not count
      (`classify > reads 413 and a 400 naming the payload size as too large (R03.29)`)
- [x] Body shapes: `error.message`, xAI string `error`, Mistral `detail`, DeepSeek plain text,
      Anthropic envelope, blank and unknown JSON (`classify > reads the vendor body shapes:
      error.message, a string error, detail and plain text`); in-body error with status 0
      (`classify > classifies an error found inside a successful reply (status 0)`); a Gemini
      daily-quota body through the fake fetch (`src/ai/testing/wire.test.ts > error bodies > have
      the shapes the classifier reads, and travel through the fake fetch`)
- [x] Network: our cancel → cancelled (`fromNetwork > reports our own cancel as cancelled,
      whatever the error and the network`); our deadline → timeout (`fromNetwork > reports our
      deadline as a timeout`); abort and timeout names (`fromNetwork > tells an abort and a timeout
      apart by name when no context says which fired`); offline flag and `navigator.onLine`
      (`fromNetwork > reports offline when the device says so`); anything else → connection, its
      text not shown (`fromNetwork > reports any other failure as a connection failure, never
      showing its text`); the refused-key hint (`fromNetwork > adds the refused-key hint for
      providers whose errors look like lost connections (R03.2)`); our own failure passed through
      (`fromNetwork > passes a failure of ours through unchanged`)
- [x] Every shown kind has one catalogue key and our text (`failureMessage > gives every kind
      except cancelled one sentence of ours from the ai catalogue`); cancel shows nothing
      (`failureMessage > shows nothing for a cancel`)
- [x] Unknown bodies never become messages (`failureMessage > never shows the provider body,
      which is kept only as detail (R03.18)`); refused key → paste-a-valid-key sentence
      (`failureMessage > shows the paste-a-valid-key sentence for a refused key`)
- [x] Combined failure keeps both names and the standby's kind (`failureMessage > names both
      providers and gives the advice for the standby failure`); the standby's failure is the one
      surfaced (iOS policy for cloud primaries) and a cancel stays silent (`bothFailed > keeps a
      cancelled standby as a cancel, so nothing is shown`, `bothFailed > keeps only the standby
      failure of a nested combination`)
- [x] A thrown failure's message holds no provider text (`AiFailureError > carries the failure
      and names only its kind`); Details masking (`redactKeys > masks every stored key, longest
      first, and ignores blank or short values`, `providerDetail > keeps the provider message
      trimmed and caps a long one`)
- Deliberate differences: refused-key spellings for 400s added (xAI "incorrect API key",
  "invalid api key", `invalid_api_key`); `detail` and top-level `message` read as provider
  message shapes; new kinds `tooLarge` (R03.29), `roundLimit` (R04.11), `cancelled` (a value, not
  a thrown cancellation); `bothFailed` keeps the whole standby failure; network mapping by our own
  signals and the offline flag instead of exception classes (the browser has none); the
  connection message gains a refused-key hint for Cerebras and key-less Hugging Face; size
  wording that only says "too large" (e.g. a token setting) is not taken as a payload problem.
- Not taken: on-device kinds (local runtime unavailable, unsupported device, text only), hosted
  tier kinds, the on-device primary rule of the reference's error policy, the "HTTP <code>"
  placeholder message (the status is kept as a number instead), walking exception causes.

## Decisions for the lead

- **Shape.** `AiFailure = SingleFailure | BothFailed`. `SingleFailure { kind, status?, detail?,
  keyMayBeRefused? }`; `BothFailed { kind: 'bothFailed', primary, standby, standbyFailure }` with
  provider **display names** (the client fills them from the P03-03 catalogue). Code that throws
  wraps a failure in `AiFailureError` (message `AI request failed (<kind>)`, never provider
  text); `fromNetwork` passes such an error through unchanged.
- **Messages.** `failureMessage(failure)` returns our text or `null` for `cancelled`;
  `FAILURE_MESSAGE_KEYS` maps each other kind to `ai.failure.<kind>`; the connection hint is its
  own key `ai.failure.connectionOrKey`; `ai.failure.bothFailed` takes `{primary, standby,
  reason}`. No message needs a plural.
- **`fromNetwork` context.** `{ stoppedBy?: 'cancel' | 'deadline', online?, provider?, keySent? }`.
  P03-05 should pass `stoppedBy` from its `Deadline` (which signal fired); without it, an error
  named `TimeoutError` means timeout and `AbortError` means cancel, so the per-attempt cap must
  either pass `stoppedBy: 'deadline'` or abort with a `TimeoutError` reason.
- **Refused-key hint list** lives in `errors.ts` (`cerebras` always, `huggingface` when no key
  was sent), keyed by the glossary provider ids. P03-03 may move it to a catalogue property
  later.
- **Markers added** beyond the reference for 400 key refusals: "incorrect api key" (xAI),
  "invalid api key", `invalid_api_key`. Size wording for `tooLarge`: "payload size", "size
  exceeds", "image exceeds", `request_too_large`, "request too large", "too many images" (the
  last one covers per-request image caps, R03.29).
- **Details (D-16.31).** `detail` is the provider's message (or the body), trimmed, capped at
  600 characters; `redactKeys(text, keys)` masks stored keys of 8 characters or more with `••••`
  for P08-09.
- **Copy** points at "Settings › AI providers" (the P09-01 page name) and the "Give up after" row
  (P09-07). If those names change, update `src/i18n/en/ai.ts`.
- **`src/i18n/en.ts`** (shared): one import line and `ai` added to `enPartitions`.

## Status

Done (2026-10-26). `src/ai/errors.ts`, its tests and the `ai` catalogue partition are in place;
outside the task's files only `src/i18n/en.ts` changed (the import and the partition entry). Trap
rows R03.2, R03.18, R03.19 and R03.29 (classification part) and acceptance rows ACC-E10-1 and
ACC-E10-2 now have tests; the ladder-level part of R03.18 (daily-quota metadata surviving four
attempts) is P03-06's test.
