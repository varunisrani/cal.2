# Task: client pipeline (P03-17) · Phase: 03 · Owner: builder (wt-p03s6)

<!-- Save as platewise/docs/notes/P<nn>/<slug>.md. Write everything above "Compare checklist"
BEFORE writing code, in your own words. Never paste or paraphrase the reference line by line. -->

Read (reference @ `10e14b67`): `A/services/ai/FoodAnalysisService.kt` (the call entry with its
settings snapshot, image preparation and key check; `dispatch`; the two standby-config readers),
`I/Services/GeminiService.swift` lines 820–1105 (the router: key check, image encoding, the
standby branch, the typed-text path that parses inside the standby scope, the "both failed"
error), then `IT/AIRequestErrorPolicyTests.swift` (which error is surfaced when both fail) and
`T/services/ai/AiErrorTest.kt > combinedFailureRetainsProviderIdentityAndActionableKind` (the
combined failure keeps both providers and the standby's kind; the phase row names the wrong test
file, the case lives in `AiErrorTest.kt`). Research spec `03-ai-providers.md` §3.4 (routing state
machine), §3.6 (where parsing happens), §3.8 (compact re-ask), §3.9 (retries, timeouts, cancel),
§3.11 (other callers); traps R03.4, R03.6, R03.11, R03.23; decisions D-16.22, D-16.23, D-16.24,
Proposed D-16.60.

What it does (own words): every model call in the app goes through one function. It works out
who serves the request (photos → the primary; no photos → the text provider when it is on, else
the primary), refuses at once when that provider is not set up (no key where one is needed),
turns the photos into fresh JPEGs, and sends the request with the person's notes for the AI in
the system part. A busy provider is retried on the shared ladder, all inside one time limit for
the whole action. An answer cut off at the token limit is asked for once more, in a compact form;
cut off twice is a "truncated" failure. The answer text is then checked by the caller's
`validate` (for example "is this a food reply with kcal and macros?"). Any failure at all, an
unusable answer included, gives the matching standby one try (D-16.22). If the standby fails too,
the person sees one "both failed" message naming both providers, with the standby's reason. A
Cancel is silent everywhere: no standby, no re-ask, just `cancelled`.

Inputs → outputs: `complete(request, deps)`; request = `{ purpose, images: Blob[], system,
prompt, json, validate? }` (the prompt builders' `{ system, prompt }` without notes); deps =
`{ settings, keys, fetch, deadline?, cancel?, imageBackend? }` → `Result<T, AiFailure>` where T
is what `validate` returns (the trimmed answer text without one). Also exported for the tasks:
`withDeadline(deps, run)` (one deadline per user action: use the one handed in, else start one
from `timeoutSec` and the Cancel signal, and end it afterwards) and `withNotes(system, notes)`.

Files: created `src/ai/client.ts`, `src/ai/client.test.ts`, this note.

Edge cases / failure modes:
- The role is missing a key it needs → `noKey`, no request, no standby (spec state machine). A
  role missing its server address (Custom without an address) → `invalidUrl`; a Custom role
  without a model → `model`; both without a request and without the standby.
- A photo that cannot be prepared (HEIC outside Safari, a broken file) → `imageConversion`, no
  request, no standby: another provider cannot read it either.
- Primary 503 ×4 (the whole ladder) → the standby → its answer.
- Primary answers text that `validate` refuses → the standby (D-16.22, R03.4).
- Primary cut off → one re-ask (notes still in the system part, compact note added, OpenRouter
  effort `low`) → ok; cut off again → `truncated` → the standby when there is one.
- Both fail → `bothFailed` with both display names and the standby's failure (its kind decides
  the advice shown).
- A photo request never goes to the text standby; a text request never to the photo standby
  (`standbyFor` picks by route).
- Cancel during a retry wait, during a request, during image preparation or between the primary
  and the standby → `cancelled`, nothing more sent.
- The overall time limit runs out → `timeout`, and the standby is not tried (it would start with
  no time left). A single attempt hitting its 75 s cap is an ordinary failure: the standby runs.
- Something throws outside `fetch` (a `validate` with a bug, an adapter build error) →
  `generic`, which counts like any failure; an exception named `AbortError` reads as a cancel.

Our design differences / decisions:
- One pipeline for every purpose: same ladder, same deadline, same standby rule (D-16.22,
  D-16.23); `purpose` is a label for the caller and tests, the pipeline never branches on it.
- Validation runs inside the standby scope on every entry point (D-16.22); the reference parses
  after the router on most paths (R03.4).
- Notes for the AI go in the system part of every request, re-ask and standby included (D-16.24,
  R03.23), under our own lead-in line; the reference's Android build prefixes the prompt.
- The compact note is appended to the end of the prompt (the user turn) on the re-ask, as spec
  §3.8 describes ("re-send once with a short appended note"); the system part keeps the notes.
  (Decision for the lead: the lead's wording could also mean the system part; it is one line to
  move.)
- One deadline per action: the client starts it only when the caller did not hand one in, so a
  food analysis can share one deadline between the analysis and its unit repair (D-16.60).
- Failures are values (`Result`), never throws; `fetch` comes from deps (only `transport.ts` calls
  it).
- Missing model and missing server address fail before any request, like a missing key (the
  reference sends `"model": ""` or fails as invalid URL inside the standby scope).
- When the deadline itself has stopped (Cancel or time up), the standby is not tried.
- Names are ours: `complete`, `AiRequest`, `AiDeps`, `withDeadline`, `withNotes`.

Tests we will write (`client.test.ts`, fake fetch, fake image backend, fake timers):
- Primary 503 ×4 then the standby answers → ok with the standby's text; 4 + 1 requests.
- Primary answers JSON `validate` refuses → the standby is tried and its value returned (ACC-E5-1).
- Both fail → `bothFailed` naming both providers, kind of the standby (credits), message keys.
- Cut off → one compact re-ask carrying the budget and the notes → ok (ACC-E6-1); cut twice →
  `truncated` with two requests; OpenRouter re-ask sends effort `low`, the first request the
  person's effort.
- A photo request with only the text standby on never calls it; a text request uses the text
  role and the text standby.
- Notes in the system channel of the primary, the standby and the re-ask, on all three formats
  (ACC-E11-1, R03.23); none when blank.
- Cancel during a retry wait → `cancelled`, no standby request; Cancel during the standby →
  `cancelled`, not `bothFailed`.
- No key → `noKey` with no request; image conversion failure → `imageConversion`, no request.
- Images prepared once and sent to the primary and the standby in order.
- The deadline: one started from `timeoutSec` covers primary and standby; a handed-in deadline
  is used and not ended; time up → `timeout` without the standby.
- A `validate` that throws → generic → standby.

Compare checklist (filled after the rewrite; reopened `FoodAnalysisService.kt`,
`GeminiService.swift` 820–1105, `AIRequestErrorPolicyTests.swift`, `AiErrorTest.kt`):
- [x] Busy primary through the whole ladder, then the standby answers (`src/ai/client.test.ts >
  complete: the standby (D-16.22, R03.4) > answers with the standby after the primary stays busy
  through the whole ladder`)
- [x] An unusable answer sends the standby in (D-16.22, R03.4, ACC-E5-1) (`> tries the standby when
  the primary answer fails validation, and returns its value (ACC-E5-1)`); without a standby it
  is `invalidResponse` (`> gives an unusable primary answer as invalidResponse when there is no
  standby`)
- [x] Both failing keep both providers and the standby's kind, as the reference's combined failure
  does (`> names both providers with the standby kind when both fail`); no standby → the
  primary's failure as it is (`> returns the primary failure as it is when no standby is on`)
- [x] The role picks the standby: photos never reach the text standby, text uses the text role
  and text standby (`> never sends a photo request to the text standby`, `> serves a text request
  with the text role and backs it with the text standby`)
- [x] Cancel never falls through to the standby (the reference rethrows its cancellation)
  (`complete: Cancel is silent (R03.6) > stops at once when Cancel comes during a retry wait, and
  never calls the standby`, `> reports Cancel during the standby request as cancelled, not as
  both failed`, `> sends nothing when the action was cancelled before the call`); an `AbortError`
  thrown outside fetch is read by name (`complete: an AbortError thrown outside fetch > reads as a
  silent cancel by its name, and the standby is not tried`)
- [x] Missing key → no request and no standby (`complete: what fails before any request > refuses
  with noKey and sends nothing, even with a standby on (03 §3.4)`); image conversion → no standby,
  as iOS does (`> fails a photo it cannot prepare as imageConversion, with no request and no
  standby`); photos prepared once and re-used by the standby (`> prepares the photos once and
  sends the same JPEGs, in order, to the primary and the standby`)
- [x] Compact re-ask once, then truncated (`complete: a cut-off answer is asked for once more (03
  §3.8) > asks once more with the compact note and returns that answer (ACC-E6-1)`, `> gives
  truncated when the answer is cut off twice, after two requests`, `> tries the standby after two
  cut-off answers`); prose form (`> asks a prose request again for a short plain answer, without
  JSON mode`); OpenRouter effort `low` on the re-ask only (`> asks OpenRouter for low effort on the
  re-ask only (R03.11)`)
- [x] Notes in the system channel of the primary, re-ask and standby (R03.23, ACC-E11-1)
  (`complete: notes for the AI in the system channel (D-16.24, R03.23) > sends the notes to the
  primary, the re-ask and the standby (ACC-E11-1)`, `> sends the notes in the system message of
  the OpenAI-compatible format`, `> sends the system text alone when the notes are blank`)
- [x] Per-provider call timeout: a stuck cloud attempt stops at 75 s and the standby still runs;
  the action's own limit stops everything (`complete: one time limit for the action (D-16.23,
  D-16.60) > gives the standby its try when one attempt hits the 75 s cap`, `> stops at the
  timeout setting and does not start the standby with no time left`, `> uses a deadline handed
  in and leaves it running for its owner`, `> withDeadline ends the deadline it started and only
  that one`)
- [x] A throwing reader is a generic failure the standby can rescue (`complete: the standby … >
  treats a reader that throws as a generic failure, which the standby can rescue`)
- Mutation check: no notes on the re-ask (1 test fails), no OpenRouter `low` (1), no re-ask (6),
  standby after a deadline stop (1), standby after a cancel read by name (1), no standby for an
  invalid answer (1), key check after image preparation (2), every throw generic (1).
- Deliberate differences: validation inside the standby scope on every entry point (D-16.22); one
  ladder and one deadline for the whole action, standby included (D-16.23); notes in the system
  part (D-16.24); a missing model or address fails before any request, like a missing key; the key
  check comes before image preparation (the Android build prepares photos first); with the
  deadline stopped the standby is not started.
- Not taken: hosted mode and the on-device providers (out of scope, 03 §3.14), including iOS's
  rule that a local primary's error wins over the standby's; the opt-in amino-acid sentence (not
  in our settings); the "interactive" 1.5 s ladder for Gemini food calls (D-16.23).

## Decisions for the lead

- The compact re-ask note goes at the end of the prompt (the user turn), as spec §3.8 describes;
  the notes for the AI stay in the system part. One line in `exchange()` moves it if the lead
  meant the system part.
- A role missing its model (Custom) fails as `model` and one missing its address as `invalidUrl`,
  before any request and without the standby, like `noKey`. `missingFor` reports them; there is
  no dedicated failure kind for "not set up".
- `purpose` is a label (`AiPurpose`); the pipeline never branches on it. Photos are always
  prepared at the food size (1 600 px, 0.8); the Coach (P08) can add a size to the request when it
  needs its own.
- When the deadline has stopped (Cancel or time up) after the primary failed, the standby is not
  started and the stop is returned (`cancelled` or `timeout`). A single attempt cut at its 75 s
  cap is an ordinary failure and the standby runs.
- `complete` returns the validated value only, not which provider served it; nothing needs it yet.

## Status

Done (2026-10-27). Created `src/ai/client.ts`, `src/ai/client.test.ts` (28 tests), this note.
Nothing changed outside the task's files.
