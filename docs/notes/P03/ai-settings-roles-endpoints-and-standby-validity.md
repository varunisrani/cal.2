# Task: AI settings, roles, endpoints and standby validity (P03-04) · Phase: 03 · Owner: builder (wt-p03s2, wave B S2)

<!-- Save as platewise/docs/notes/P<nn>/<slug>.md. Write everything above "Compare checklist"
BEFORE writing code, in your own words. Never paste or paraphrase the reference line by line. -->

Read (reference @ `10e14b67`): `A/data/PreferencesStore.kt` (the per-request settings snapshot
`foodAiCallSettings` and its data class, the standby address split `migrateFallbackBaseUrls`, the
address, token-cap and timeout accessors next to them), `A/ui/settings/SettingsViewModel.kt`
(`selectFallbackProvider`, `selectTextFallbackProvider`, `selectProvider`, `selectTextProvider`,
`setCustomBaseUrl`, `setFallbackCustomBaseUrl` and the two reconcile helpers after an address
change), `I/Models/AIProvider.swift` (the settings struct: role selection, standby configs, address
slots, timeout and token cap), tests `IT/AIRequestConfigurationTests.swift`
(`imageAndTextFallbacksResolveIndependently`, `fallbackBaseURLIsStoredSeparatelyFromPrimary`, and
the neighbouring `separateTextProviderOnlyRoutesRequestsWithoutImages`,
`localRequestTimeoutDefaultsAndClamps`, `fallbackBaseURLMigrationSeedsSharedValueExactlyOnce`).
Research spec `03-ai-providers.md` §3.3, §3.4, §3.13, §3.15 items 2 and 6; traps R03.3, R03.5,
R03.20, R03.22; decisions D-16.23, D-16.25, D-16.26, D-16.65; naming table `17` §1.3 (the
`ai.settings` record shape). No Evidence ids.

What it does (own words): the AI settings are one typed record: the primary provider and model
(it must see photos), an optional "different model for text" role, an image standby and a text
standby (each with an on switch, provider and model), server addresses for the providers that run
on a person's own server (Ollama, Custom) in two slots, one used by the primary and the text role
and one used by both standbys, the notes for the AI, the answer length limit, the give-up-after
time and OpenRouter's reasoning effort. Reading a stored record never fails: anything unknown or
malformed reads as its default. From the record and a request, `roleFor` picks who answers
(photos always the primary; text the text role when it is on, else the primary), and
`standbyFor` says whether the matching standby may be tried: only when it is on, has a key if it
needs one, has a server address and a model, and is not the very same provider, model and
address as the role it backs (R03.5). `endpoint.ts` cleans a typed server address (trim, no
trailing slash, R03.22) and checks it: https anywhere, plain http only on this device
(`localhost`, `127.0.0.1`, `[::1]`), everything else refused with a reason (D-16.26, R03.3); an
Ollama address without `/v1` only gets a hint.

Inputs → outputs:
- `AiSettings` `{primary {provider, model}, textRole {on, provider, model}, imageStandby {on,
  provider, model}, textStandby {on, provider, model}, endpoints {<provider>: {main?, standby?}},
  instructions, maxTokens, timeoutSec, openRouterEffort}`; `DEFAULT_AI_SETTINGS`.
- `decodeAiSettings(raw)` → `AiSettings` (lenient); `loadAiSettings(raw, marker, steps?)` →
  `{settings, upgradeMarker}` (preset upgrades of P03-03 applied first, then the decode).
- `clampTimeoutSec(n)`, `clampMaxTokens(n)`, `OPENROUTER_EFFORTS`, `isOpenRouterEffort`.
- `serverUrlFor(settings, provider, slot)` → the effective address (`main` | `standby`).
- `roleFor(settings, request)` → `Role {source: 'primary' | 'textRole', standby: 'imageStandby' |
  'textStandby', provider, model, baseUrl}`.
- `keyFor(provider, keys)` → the trimmed key to send or `undefined`; `targetProblem(target, keys)`
  → `'noServer' | 'noModel' | 'noKey' | undefined`.
- `standbyProblem(role, settings, keys)` → `'off' | 'noVision' | 'noServer' | 'noModel' | 'noKey' |
  'sameAsRole' | undefined`; `standbyFor(role, settings, keys)` → `Standby | null`.
- `normaliseBaseUrl(text)`, `checkServerUrl(text, provider?)` → `{ok: true, url, hint?:
  'missingV1'} | {ok: false, reason: 'empty' | 'notUrl' | 'scheme' | 'credentials' |
  'plainHttp'}`, `sameServer(a, b)`.

Files: created `src/ai/settings.ts`, `src/ai/settings.test.ts`, `src/ai/endpoint.ts`,
`src/ai/endpoint.test.ts`, this note.

Edge cases / failure modes:
- A photo request goes to the primary even with the text role on; a text request goes to the
  text role only when it is on; the image standby backs photo requests only, the text standby
  backs every text request whichever role served it (ACC-E3-1).
- Standby identity (R03.5): same provider and model on the same address → not valid; same
  provider with another model → valid; same model on another Ollama server (the standby slot) →
  valid (ACC-E3-2). Addresses compare after cleaning, with scheme and host case ignored.
- A standby whose provider needs a key and has none (blank or white space only) → not valid;
  Ollama needs none; Custom works without one (R03.20). A Custom standby without an address or a
  model → not valid.
- Fixed cloud providers always use their own address; only Ollama and Custom read the slots, and
  a blank slot means the provider's default (Ollama's loopback address; Custom has none).
- Decode: non-object input, unknown provider ids, a photo role on a provider without vision, a
  model not in the list, a non-boolean switch, a stored address that fails the check, slots for
  providers without a user server, non-number limits, an unknown effort: each reads as its default
  and never throws. An unknown provider for the text role or a standby also switches it off, so a
  replaced provider is never tried by surprise.
- Limits: timeout default 180, rounded and clamped to 30–600 (10 → 30, 900 → 600); answer
  limit default 1 024, rounded, at least 1, no maximum (D-16.65).
- Addresses: `http://localhost:11434/v1/` → `http://localhost:11434/v1`; several trailing
  slashes; `http://192.168.1.5:11434/v1` refused (`plainHttp`); `http://127.0.0.1:4320/v1` (the
  e2e fake AI server, Custom) accepted; `http://[::1]:11434/v1` accepted; `https://` any host;
  `ftp:` and `javascript:` refused (`scheme`); `user:pass@` refused (`credentials`, fetch rejects
  such URLs); text that is not an address, has no host, or carries `?` or `#` refused (`notUrl`);
  Ollama without `/v1` → accepted with the `missingV1` hint; a look-alike host such as
  `localhost.example.com` over http refused.
- Keys are trimmed before use, so a pasted trailing newline cannot break the header (R03.20).

Our design differences / decisions:
- Names are ours (17 §1.3 shape; "standby", "text role", "notes for the AI"). No storage, fetch or
  React here: this is the typed model and its rules; storage comes with P02 and wave C.
- One rule for both standbys: valid needs on + key (if required) + address + model + not the same
  target. The reference does not check the model; a Custom standby without one would send an
  empty model, so we add it.
- Standby slots: one `standby` address per provider shared by both standbys (as the reference).
  No migration that seeds the standby slot from the main slot: no legacy users.
- Reasons are codes; the sentences come with the screens (P05-04, P09-07).
- Not taken: on-device providers and their reset rules, the hosted mode switch, the iOS rule that
  picks an unset standby provider from the saved keys (an unset standby reads as Gemini, switched
  off), the UI reconcile that moves a standby to another preset when an address change makes it
  identical (P09-07 owns the pickers).

Tests we will write:
- `endpoint.test.ts`: trimming and trailing slashes; https anywhere; http only for the three
  loopback hosts (and their URL-normalised spellings); LAN and public http refused with
  `plainHttp`; the e2e fake server address; scheme, credentials, not-an-address and blank
  refusals; the Ollama hint; `sameServer`.
- `settings.test.ts`: defaults; lenient decode of every field; `roleFor` photo vs text with the
  text role on and off; `standbyFor`: off, no key, blank key, Ollama and Custom without a key,
  same target invalid, same provider other model valid, two Ollama servers valid, a Custom standby
  without an address or model invalid, the text standby backing the text role, the image standby
  never used for text; `targetProblem` for a Custom primary without a model (incomplete) or an
  address; `loadAiSettings` applying an upgrade once and not again (R03.28).

Compare checklist (filled after the rewrite; reopened the files in "Read" and walked each branch
against `src/ai/settings.ts` and `src/ai/endpoint.ts`). Test names are in `src/ai/settings.test.ts`
(T) or `src/ai/endpoint.test.ts` (E).
- [x] Role choice: photos → primary, text → text role only when on, else primary (T `roleFor >
      sends a typed description to the text role when it is on, and photos always to the primary
      (ACC-E3-1)`, `roleFor > sends text to the primary while the text role is off, backed by the
      text standby`)
- [x] Primary must be a photo provider, else Gemini with its default; the text role may be any
      provider; models resolved against the photo or text list (T `decodeAiSettings > reads an
      unknown or photo-blind primary provider as the default primary`, `… reads a model the
      provider does not offer for that role as its default model`)
- [x] Address per role: the main slot for primary and text role, a separate standby slot for both
      standbys, blank → provider default (T `roleFor > uses the main address slot of a self-run
      provider, or its default`, `standbyFor > refuses a Custom standby without an address or a
      model`, `standbyFor > lets two Ollama servers be primary and standby at once (ACC-E3-2)`)
- [x] Standby valid only when on, keyed (or keyless provider), addressed, and not the same
      provider + model + address (T `standbyFor > offers nothing while the standby is off`,
      `… needs a saved key unless the provider takes none or only an optional one`, `… refuses a
      standby identical to the role it backs, and accepts the same provider with another model
      (R03.5)`, `… counts one Ollama server typed two ways as the same target`)
- [x] Image and text standbys resolve independently; the text standby is compared with whichever
      role served the text request (T `standbyFor > never offers the text standby to a photo
      request, nor the image standby to a text one`, `… compares the text standby with the role
      that served the text request`)
- [x] Token cap default 1 024, at least 1; timeout default 180, clamped 30–600 (T
      `decodeAiSettings > keeps the answer limit at 1 or more, without a maximum, and defaults it
      to 1 024`, `… clamps the timeout to 30–600 seconds and defaults it to 180`,
      `clampTimeoutSec and clampMaxTokens > apply the same limits when a value is typed`)
- [x] Reasoning effort unknown → auto; notes trimmed (T `decodeAiSettings > reads an unknown
      reasoning effort as auto and keeps the notes trimmed`)
- [x] Blank address clears the override (T `decodeAiSettings > keeps cleaned, allowed addresses
      for Ollama and Custom only (D-16.26)`)
- [x] Keys per provider, shared by every role, trimmed (T `keyFor and targetProblem > trims a
      saved key and treats a blank one as missing (R03.20)`, `… sends no key to Ollama even when
      one is saved`, `… needs a key for every cloud provider and none for Ollama`)
- [x] Custom: key optional, model and address required (T `keyFor and targetProblem > reports a
      Custom role without a model or an address as incomplete (R03.20)`)
- [x] Address rules (E `normaliseBaseUrl > trims the address and drops trailing slashes (R03.22)`,
      `checkServerUrl > accepts plain http only on this device: localhost, 127.0.0.1 and [::1]
      (D-16.26)`, `… refuses plain http to any host but this device (D-16.26, R03.3)`, `… accepts
      the e2e fake AI server as a Custom address`, `… hints, without refusing, that an Ollama
      address usually ends in /v1 (R03.22)`)
- Deliberate differences: http only for loopback (the reference allows any host on Android);
  cloud providers ignore stored address overrides (the reference lets any provider's override win;
  D-16.26 has no proxy feature); stored addresses that fail the check are dropped on read; a
  standby also needs a model; keys trimmed; an unknown text-role or standby provider reads as off
  rather than as Gemini; a stored timeout or token cap of 0 reads as 30 / 1 (the reference's iOS
  reads 0 as unset, 180 / 1 024; our setters never store 0); the stored record is read once and
  validated, not re-written on every read.
- Not taken: the standby address split migration and the preset spelling fix (no legacy users);
  picking an unset standby from the saved keys (iOS); the on-device reset rules; the pickers'
  "switch to the next preset" and the reconcile after an address change (P09-07 UI behaviour).

## Decisions for the lead

- **Shape** (17 §1.3): `{primary, textRole, imageStandby, textStandby, endpoints, instructions,
  maxTokens, timeoutSec, openRouterEffort}`; switchable roles are `{on, provider, model}`;
  `endpoints` keeps entries for Ollama and Custom only, `{main?, standby?}`, each already
  checked and cleaned.
- **Defaults**: primary Gemini `gemini-3.5-flash-lite`; text role and both standbys off on
  Gemini's default model (turning a standby on without changing it reads as `sameAsRole`, so
  P09-07 should move it to another preset when the person picks the primary's provider).
- **Loading** for wave C / P02: `loadAiSettings(storedRecord, meta.presetUpgradeVersion)` →
  `{settings, upgradeMarker}`; store both when the marker changed. `decodeAiSettings` is the same
  without upgrades.
- **API for P03-17**: `roleFor(settings, {images})` → `Role` (with `standby` naming the slot that
  backs it); `targetProblem(role, keys)` → `noServer` / `noModel` / `noKey` (the client turns
  `noKey` into the noKey failure, the other two into `invalidUrl`/`model` or a settings prompt as
  it decides); `standbyFor(role, settings, keys)` → `Standby | null`; `keyFor(provider, keys)` →
  the trimmed key to send. `KeyRing` is a plain `{<providerId>: key}` read from the secrets store.
- **Address refusals** are codes: `empty`, `notUrl` (no host, a query or a fragment, or not an
  address), `scheme` (also a missing `http(s)://`), `credentials`, `plainHttp`; the Ollama hint is
  `missingV1`. P05-04 and P09-07 write the sentences (`ACC-E13-1` shows the reason).
- **Loopback** is exactly `localhost`, `127.0.0.1` and `[::1]` as the URL parser writes them, so
  `http://127.1` and the long IPv6 form also pass (the same addresses); `127.0.0.2` and `0.0.0.0`
  do not.

## Status

Done (2026-10-26). `src/ai/settings.ts`, `src/ai/endpoint.ts` and their tests are in place; no
file outside the slice changed. Traps R03.3, R03.5, R03.20 and R03.22 and acceptance rows ACC-E3-1
and ACC-E3-2 now have tests. Handed on: storage of the record and the marker (P02-04, wave C), the
pickers' preset switching and the address copy (P05-04, P09-07).
