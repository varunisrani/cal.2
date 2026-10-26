# Task: AI settings, roles, endpoints and standby validity (P03-04) · Phase: 03 · Owner: builder (wt-p03s2)

<!-- Save as platewise/docs/notes/P<nn>/<slug>.md. Write everything above "Compare checklist"
BEFORE writing code, in your own words. Never paste or paraphrase the reference line by line. -->

Read (reference @ `10e14b67`): `A/data/PreferencesStore.kt` (`foodAiCallSettings`: the one
settings read per request and how it picks the text provider for photo-free requests;
`migrateFallbackBaseUrls`: why fallback addresses got their own slot; the token-cap and timeout
setters), `A/services/ai/FoodAnalysisService.kt` (the two fallback-config readers, for the
validity rules), `A/ui/settings/SettingsViewModel.kt` (`selectFallbackProvider`,
`setCustomBaseUrl` and the reconcile step after an address change), `I/Models/AIProvider.swift`
(the settings part: defaults, clamps, `currentConfig`, the fallback configs), then
`IT/AIRequestConfigurationTests.swift` (`imageAndTextFallbacksResolveIndependently`,
`fallbackBaseURLIsStoredSeparatelyFromPrimary`, and the routing and timeout cases next to them).
Research spec `03-ai-providers.md` §3.3–3.4, §3.13, §3.15 (mixed content and loopback), traps
R03.3, R03.5, R03.20, R03.22; decisions D-16.23, D-16.26, D-16.65 (`16-what-we-change.md`);
naming `17-naming-and-glossary.md` §1.3 (the `ai.settings` record).

What it does (own words): `AiSettings` is everything the person chose for AI in one record: the
photo (primary) provider and model, an optional separate provider for requests without photos,
a standby for photo requests and one for text requests (each can be switched on), server
addresses for Ollama and Custom with one slot for the main roles and one for the standbys, notes
for the AI, the answer token limit, the time limit and OpenRouter's reasoning effort.
`decodeAiSettings` reads whatever is stored (or nothing) into a complete, valid record, so the
rest of the app never sees a half-filled one. `roleFor` says who serves a request: photos always
go to the primary; a request without photos goes to the text provider when it is switched on,
else to the primary. `standbyFor` says whether the matching standby may be tried: it must be
switched on, have its key (or need none), a model id (Custom) and a server address, and it must
not be the very same provider, model and address as the role it backs (R03.5). The same model on
another Ollama server is a real backup, so two Ollama servers can be primary and standby at once
(ACC-E3-2). `endpoint.ts` tidies an address (trim, drop trailing slashes, R03.22) and checks it
before it is saved: https anywhere, plain http only for this device (`localhost`, `127.0.0.1`,
`[::1]`), anything else refused with a reason, because http sends the key in the clear and an
https page cannot reach a LAN http address anyway (D-16.26, R03.3). An Ollama address without
`/v1` is accepted with a hint to add it.

Inputs → outputs:
- `decodeAiSettings(raw: unknown)` → `AiSettings` (null or junk → `DEFAULT_AI_SETTINGS`; each field
  checked on its own, a bad field falls back to its default). `AiSettings = { primary: {provider,
  model}, textRole: {on, provider, model}, imageStandby: {on, provider, model}, textStandby: {on,
  provider, model}, endpoints: {<ollama|custom>: {main, standby}}, instructions, maxTokens,
  timeoutSec, openRouterEffort }`.
- `effectiveBaseUrl(settings, provider, slot)` → the slot's address for Ollama and Custom when
  set, else the provider's default ('' for Custom).
- `roleFor({ images }, settings)` → `RoleTarget { route: 'photo' | 'text', role, provider,
  model, baseUrl }`.
- `standbyFor(role, settings, keys)` → the standby's `RoleTarget`, or null.
- `missingFor(target, keys)` → what a role still lacks: `key`, `model`, `server`.
- `keyFor(provider, keys)` → the trimmed key, or undefined when blank.
- `upgradeAiSettings(raw, doneVersion, steps?)` → `{ settings, version, changed }`: the stored
  record's four picks through P03-03's `upgradeChoices`, then `decodeAiSettings` (the renames
  must see the stored ids before decoding turns a retired preset into the default).
- `normaliseBaseUrl(text)` → trimmed, no trailing slashes.
- `checkServerUrl(text, provider?)` → `Result<{ url, hint? }, UrlProblem>`; problems `empty`,
  `malformed`, `credentials`, `scheme`, `plainHttp`; hint `addV1` for Ollama.
- `sameServerUrl(a, b)` → whether two addresses name the same server path (as the URL parser
  writes them), used by the standby identity rule.

Files: created `src/ai/settings.ts`, `src/ai/settings.test.ts`, `src/ai/endpoint.ts`,
`src/ai/endpoint.test.ts`, this note.

Edge cases / failure modes:
- A photo request with the text provider on still uses the primary (ACC-E3-1).
- A photo-free request with the text provider off is backed by the text standby, not the photo
  standby; a photo request is never backed by the text standby.
- Standby equal to its role → invalid; same provider, other model → valid; same model, other
  Ollama server → valid; addresses that differ only by a trailing slash are the same server.
- Standby switched off, without a key, Custom without a model or without an address → invalid.
- Keys with spaces or a pasted newline are trimmed; a blank key is no key (R03.20).
- Timeout 10 → 30, 900 → 600, junk → 180; fractions round. Token limit: junk → 1 024, 0 or less
  → 1, fractions round down (D-16.65). Unknown effort → auto.
- A stored provider that cannot read photos in a photo role (DeepSeek as primary) or an unknown id
  → that role's default; a stored model no longer listed → the provider's default (P03-03).
- Addresses stored for a fixed cloud provider are ignored (no proxy feature, D-16.26).
- `http://192.168.1.5:11434/v1` refused (plainHttp); `http://localhost:11434/v1/` accepted as
  `http://localhost:11434/v1`; `http://127.1` and `http://[0:0:0:0:0:0:0:1]` are loopback too
  (the URL parser writes them as `127.0.0.1` and `[::1]`); `ftp:` refused (scheme); a user name
  or password in the address refused (credentials: `fetch` refuses such URLs); a query or
  fragment refused (malformed: the path is appended to the base).

Our design differences / decisions:
- Names are ours (`AiSettings` fields from `17` §1.3, `roleFor`, `standbyFor`, `RoleTarget`,
  `missingFor`, `checkServerUrl`, `UrlProblem`).
- One record instead of many keys; decoded defensively in one place (`decodeAiSettings`) that
  the data layer can plug into the `ai.settings` row later (the row stays a plain record today).
- Only Ollama and Custom keep addresses; a cloud provider always uses its own (D-16.26).
- The standby slot does not fall back to the main slot: an empty standby slot means the
  provider's default (spec §3.4). No migration (no legacy users).
- Plain http is allowed only for loopback and refused at save time with a reason (D-16.26,
  R03.3); the reference allowed any host on Android.
- Custom: key optional, model required (R03.20). The reference required a key and allowed a
  blank model.
- The time limit applies to every provider as the action's overall deadline (D-16.23), not only
  to Ollama and Custom.
- The answer token limit has no upper bound (as spec), is shown for every provider (D-16.25,
  P09), default 1 024 (D-16.65).
- The upgrade table runs over all four picks, the text role included.
- Picker conveniences of the reference (auto-switching a standby to another preset when it
  equals the primary) are UI behaviour for P05/P09; here the rule is only validated.

Tests we will write:
- `settings.test.ts`: defaults (Gemini primary with its default, text role and standbys off,
  1 024, 180, auto, empty notes); decode of null, junk, partial and full records; timeout clamps
  (10 → 30, 900 → 600, junk → 180); token limit (0 → 1, junk → 1 024); effort; notes trimmed;
  photo roles refuse text-only providers; unknown models fall back; endpoints only for Ollama and
  Custom, normalised, cloud ones dropped; `roleFor` (photo → primary even with the text role on;
  text → text role when on, else primary) (ACC-E3-1); `standbyFor` (off, no key, no-key
  provider, Custom without model or address, equal → invalid; other model → valid; other Ollama
  server → valid (ACC-E3-2); trailing-slash equal; photo standby only for photos; text standby
  backs the primary when the text role is off; standby slot read separately from the main slot)
  (R03.5); `missingFor` and `keyFor` (R03.20); `upgradeSettingsPresets` over all four picks.
- `endpoint.test.ts`: normalising (spaces, one and many trailing slashes, R03.22); https
  anywhere; http for `localhost`, `127.0.0.1`, `[::1]` only; LAN and public http refused with
  `plainHttp` (R03.3); other schemes, junk, credentials, query refused; Ollama without `/v1` →
  hint, with `/v1` → none, other providers → no hint.

Compare checklist (filled after the rewrite; reopened `PreferencesStore.kt` (`foodAiCallSettings`,
`migrateFallbackBaseUrls`), `FoodAnalysisService.kt` (fallback configs), `SettingsViewModel.kt`
(`selectFallbackProvider`, `setCustomBaseUrl`), `IT/AIRequestConfigurationTests.swift`):
- [x] Photo requests use the primary even with a text provider on; photo-free requests use the
  text provider when on, else the primary (`src/ai/settings.test.ts > roleFor: who serves a
  request (03 §3.3, ACC-E3-1) > sends a photo request to the primary even with a text provider
  switched on`, `> sends a typed description to the text provider when one is switched on`, `>
  sends a typed description to the primary when the text provider is off`)
- [x] Photo and text standbys resolve independently; a photo request never reaches the text
  standby; the text standby backs whichever role served (`standbyFor: when a standby may run
  (R03.5) > backs a photo request with the photo standby and never with the text standby`, `>
  backs a text request with the text standby, compared with the role that served it`)
- [x] Validity: on, key or none needed, non-empty address, not identical in provider, model and
  address (`> is invalid when it is the same provider, model and address as the primary`, `> is
  valid for the same provider with another model`, `> is invalid when switched off or without a
  key it requires; Ollama needs none`, `> is invalid for Custom without a model or an address,
  and valid with both and no key`)
- [x] The standby address comes from its own slot (`> lets two Ollama servers run the same model
  as primary and standby (ACC-E3-2)`, `> treats an empty standby slot as the default server, not
  as the main slot`); a blank slot is unset (`decodeAiSettings: each field on its own > keeps
  addresses only for Ollama and Custom, tidied (no proxy for cloud vendors)`)
- [x] Primary limited to photo providers, else the default; unlisted models → default
  (`decodeAiSettings … > keeps photo roles on providers that read photos`, `> replaces an
  unknown provider and a model the provider no longer lists`)
- [x] Token cap 1 024, at least 1; timeout 180 clamped to 30–600 (10 → 30, 900 → 600)
  (`decodeAiSettings … > keeps the answer token limit whole and at least 1, with no upper bound
  (D-16.65)`, `> clamps the time limit to 30–600 s and rounds it: 10 → 30, 900 → 600`); effort
  defaults to auto (`> reads the reasoning effort, auto for anything unknown`)
- [x] Keys trimmed, blank = none (`missingFor and keyFor: what a role still needs (R03.20) >
  trims keys, so a pasted newline or spaces never reach a header; blank is no key`); Custom key
  optional and model required (`> asks for a key where one is required, never for Ollama, and
  only optionally for Custom`, `> calls Custom without a model, or without an address,
  incomplete`)
- [x] Addresses: blank → unset, trailing slashes trimmed (`src/ai/endpoint.test.ts >
  normaliseBaseUrl (R03.22)`); plain http only for loopback (`checkServerUrl: which addresses
  can be saved (D-16.26, R03.3) > refuses plain http to the local network or the internet, with
  the reason`, `> accepts plain http to this device: localhost, 127.0.0.1 and [::1]`); Ollama
  `/v1` hint (`checkServerUrl: the Ollama /v1 hint (R03.22) > accepts an Ollama address without
  /v1 but suggests adding it`)
- [x] Retired presets in stored settings renamed once, all picks (`upgradeAiSettings: retired
  presets in stored settings (R03.28) > renames all four picks to the replacement, not to the
  default, once`)
- Mutation check: text requests always to the primary (2 tests fail), identity ignoring the
  address (2), any http allowed (1), keys not trimmed (2), no trailing-slash removal (9).
- Deliberate differences: http only for loopback, refused at save (D-16.26, R03.3); Custom key
  optional, model required (R03.20); standby identity compares addresses as the URL parser
  writes them (the reference compared raw text, so a trailing slash made a duplicate look
  different); addresses only for Ollama and Custom (no proxy, D-16.26); the time limit is the
  overall deadline for every provider (D-16.23); upgrades over all four picks.
- Not taken: the one-time seeding of the standby slot from the shared slot (no legacy users);
  auto-switching a standby to another preset when it equals the primary, and re-checking it when
  an address changes (picker behaviour for P05-04/P09); the iOS choice of the first keyed vision
  provider as an unset standby (we start at Gemini, switched off); amino-acid and access-mode
  fields (out of v1).

## Decisions for the lead

- `decodeAiSettings(raw)` is the reader the data layer can plug into the `ai.settings` row
  (`src/data/settingsSchema.ts` stores a plain record today; not edited). `null` gives the
  defaults. `upgradeAiSettings(raw, marker)` is the same read with the preset upgrades first; the
  caller stores the settings when `changed` and the returned version in
  `meta.presetUpgradeVersion`.
- Shape follows `17` §1.3: both standbys are `{on, provider, model}` like `textRole`. Addresses
  are kept only for Ollama and Custom; anything stored for a cloud vendor is dropped on read.
- An empty standby slot means the provider's default address, not the main slot's address
  (spec §3.4). So a Custom standby needs its own address.
- Notes for the AI are trimmed on read; the token limit is floored and has no upper bound; the
  timeout is rounded to whole seconds.
- `checkServerUrl` also refuses an address with a user name or password (`credentials`, since
  `fetch` refuses such URLs) and one with a query or fragment (`malformed`, since the adapter
  appends a path). Problems are codes; P05-04 owns the copy for each (and the `OLLAMA_ORIGINS`
  help). Only the three loopback spellings count (as the URL parser writes them): `127.0.0.2`
  and `*.localhost` are refused, per D-16.26's list.
- `standbyFor` does not re-run `checkServerUrl`: an address that fails it cannot be saved. The
  client (P03-17) may still check the effective address before sending (`invalidUrl`).
- `missingFor` returns what a role lacks (`key`, `model`, `server`) so the client can raise noKey
  and the forms can block Continue (P05-04: "Custom without a model blocks Continue").

## Status

Done (2026-10-26). Created `src/ai/settings.ts`, `settings.test.ts` (30 tests),
`src/ai/endpoint.ts`, `endpoint.test.ts` (13 tests), this note. Nothing changed outside the
task's files.
