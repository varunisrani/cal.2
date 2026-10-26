# Task: provider catalogue and model presets (P03-03) · Phase: 03 · Owner: builder (wt-p03s2)

<!-- Save as platewise/docs/notes/P<nn>/<slug>.md. Write everything above "Compare checklist"
BEFORE writing code, in your own words. Never paste or paraphrase the reference line by line. -->

Read (reference @ `10e14b67`): `A/models/AIProvider.kt` (all: the provider enum, base URLs,
which providers need a key, take free-form ids or see images, the model lists, the fallback to a
default for an unknown saved model, the provider-scoped replacement table), `I/Models/AIProvider.swift`
(the registry part and the two migrations: the one-time Gemini upgrade and the versioned registry
upgrade of the primary and fallback picks), then `T/services/ai/AIRequestConfigurationTest.kt`
(preset order and defaults, text-only providers, replacements, free-form ids kept, timeout clamp)
and `IT/AIModelRegistryTests.swift` (the same, plus the migration running once, keeping custom
ids, and not guessing a provider). Research spec `03-ai-providers.md` §3.1, §3.15 (browser
access per provider, CORS probes of 2026-10-26, D-04.1), §5, traps R03.21 and R03.28; decision
D-16.25 (`16-what-we-change.md`); naming `17-naming-and-glossary.md` §1.4 (provider ids).
Vendor model lists read on 2026-10-26 (the build date) for the presets: the Gemini API models
page, OpenAI's models page, Anthropic's models overview, xAI's models page, OpenRouter's public
`/api/v1/models`, Together's serverless models, Groq's supported models, the Hugging Face
router's `/v1/models`, Fireworks' model library, DeepInfra's model list, Mistral's model pages,
DeepSeek's first-call page, Alibaba Model Studio's recommended models, Cerebras' model catalogue
and the Ollama library (vision filter).

What it does (own words): the catalogue is the one list of AI providers the app knows: sixteen
of them, always in the same order, each with a stable id, the name people see, its default
server address, which of our three wire formats it speaks, how its key travels (Google's key
header, a Bearer token, Anthropic's key header, or nothing), whether a key is required, optional
(Custom) or never asked (Ollama), whether the person supplies the server (Ollama, Custom), whether
it can read photos (all but DeepSeek and Cerebras), whether any model id may be typed
(OpenRouter, Hugging Face, Ollama, Custom), how a browser reaches it (directly, directly with
Anthropic's opt-in header, or a server the person runs) and whether it is self-hosted (the
per-attempt time cap of D-16.60 depends on that). Next to it is our own short preset list: at
most three photo models and three text models per provider, the first being the default, chosen
on the build date from each vendor's public list. Photo pickers list the 14 providers that read
photos; text pickers list all 16. A saved model id that a fixed-list provider no longer offers
falls back to its default; a typed id on a free-form provider is kept as typed (trimmed). Because
vendors retire models, a versioned upgrade table can rename a saved pick once (primary and
standbys alike, free-form providers too) and records the version it reached, so a person who
later picks the old model again on purpose is left alone. The table is empty in v1.

Inputs → outputs:
- `PROVIDER_IDS` (16 ids in picker order), `ProviderId`, `PROVIDERS` / `provider(id)` →
  `Provider { id, name, baseUrl, format, auth, key, endpoint, vision, freeFormModel,
  browserAccess, selfHosted }`; `isProviderId(value)`.
- `imageProviders()` (14) and `textProviders()` (16), in catalogue order.
- `presetsFor(id, use)` with `use` = `image` or `text` (a provider without its own text list
  uses its photo list), `defaultModel(id, use)` (first preset, or '' for Custom),
  `PRESETS_CHECKED_ON`.
- `resolveModel(id, saved, use)` → the id to use: trimmed; a free-form provider keeps any
  non-blank id; a fixed-list provider keeps only a listed id; anything else is the default.
- `PRESET_UPGRADES` (empty), `upgradeVersion(steps)`, `upgradeChoices(choices, doneVersion,
  steps)` → `{ choices, version }`: every step newer than `doneVersion`, in order, renames each
  pick by its own provider's table; the version returned is the newest step's (or `doneVersion`).

Files: created `src/ai/catalog/providers.ts`, `providers.test.ts`, `src/ai/catalog/presets.ts`,
`presets.test.ts`, this note.

Edge cases / failure modes:
- DeepSeek's default address has no `/v1` (the vendor's base); joining `/chat/completions`
  onto it is right.
- Custom has no default address and no presets: its default model is '' (the settings call that
  incomplete, R03.20, P03-04).
- A saved id with spaces around it; an empty or non-string saved id → the default.
- A free-form id that is blank → the default (Custom: '').
- An upgrade step for one provider never touches another provider's pick with the same id.
- Two steps (a → b, then b → c) take a pick from before both to c in one run.
- Running the upgrade again with the version it returned changes nothing; nor does it touch a
  pick made after the marker was written.
- An unknown provider id in stored data is the settings decoder's job (P03-04); here ids are typed.

Our design differences / decisions:
- Names are ours: provider ids from `17` §1.4; `Provider`, `format`, `auth`, `key`, `endpoint`,
  `freeFormModel`, `browserAccess`, `selfHosted`, `resolveModel`, `upgradeChoices`.
- Display names are vendor brand names, never the reference's composite labels; Custom is
  "Custom server".
- Our own presets (D-16.25): at most three per list, chosen on 2026-10-26 from the vendors'
  current public lists (fast, low-cost photo models first), recorded in the data file's header.
  Several reference presets are gone or renamed at the vendors by now (DeepSeek's
  `deepseek-v4-flash` is retired in favour of `deepseek-flash`; Groq and Cerebras dropped models).
- Ollama takes free-form ids (R03.21), so a tag such as `qwen3.5:9b` works (ACC-E13-2).
- Custom's key is optional (omit `Authorization` when blank, R03.20); Ollama never asks for one.
- The on-device providers of the reference are not in the catalogue (out of v1, §3.14).
- No "on save" alias mapping of one old Gemini preview id and no one-time Gemini migration: we
  have no legacy users; the general versioned table (R03.28) covers future renames.
- The upgrade works on a record of picks, not on settings, so `presets.ts` does not import
  `settings.ts`; P03-04 applies it to all four roles (the reference only to primary and image
  fallback). The marker lives in the data layer (`meta.presetUpgradeVersion`, `17` §1.2).
- `browserAccess` has an `unsupported` value reserved for a vendor that stops allowing CORS
  (15-roadmap risk 1); no entry uses it today (D-04.1).

Tests we will write:
- `providers.test.ts`: 16 entries in order with unique ids; 14 read photos (not DeepSeek or
  Cerebras); formats (Gemini, Anthropic, 14 OpenAI-compatible); auth per format, none for
  Ollama, Bearer for Custom; keys required except Ollama (none) and Custom (optional); DeepSeek's
  base has no `/v1`; Ollama's default is the loopback `/v1` address; Custom has none; every fixed
  address is https; free-form set; browser access per provider; selfHosted only for Ollama and
  Custom; `isProviderId`.
- `presets.test.ts`: every provider but Custom offers presets in each picker it appears in
  (ACC-E1-1); at most three per list, no duplicates, first = default; photo pickers 14, text 16;
  text list falls back to the photo list; the build date is recorded; unknown saved model on
  Gemini → default; listed model kept; trimmed; free-form ids kept (Ollama tag, R03.21,
  ACC-E13-2); blank free-form → default; Custom blank → ''; v1 table empty; an upgrade step
  rewrites primary and standby once and not on the second run; re-picking the old model later is
  not rewritten; provider-scoped; chained steps (R03.28).

Compare checklist (filled after the rewrite; reopened `A/models/AIProvider.kt`,
`I/Models/AIProvider.swift` registry and migration parts, `AIRequestConfigurationTest.kt`,
`AIModelRegistryTests.swift`):
- [x] Sixteen remote providers in the Android picker order, each with its vendor address
  (`src/ai/catalog/providers.test.ts > the provider list (03 §3.1) > holds 16 providers in picker
  order, each under its own id`; `addresses > uses https for every vendor address and no trailing
  slash anywhere`)
- [x] DeepSeek's base has no `/v1`; Ollama defaults to the loopback `/v1`; Custom has none
  (`addresses > keeps DeepSeek's default base without a /v1 segment`, `> lets the person run
  Ollama and Custom: …`)
- [x] Photo providers are all but DeepSeek and Cerebras; text pickers list all 16
  (`the provider list (03 §3.1) > lets 14 providers read photos: all but DeepSeek and
  Cerebras`; `presets.test.ts > presets per provider (D-16.25, ACC-E1-1) > offers presets for
  every provider in each picker it appears in, except Custom`)
- [x] Format per provider and where the key goes (`> speaks Gemini to Gemini, Messages to
  Anthropic and the OpenAI format to the other 14`, `> sends the key in each format's own header,
  and none to Ollama`)
- [x] Key rule: Ollama never; Custom optional, a deliberate change (`> requires a key everywhere
  except Ollama (never asked) and Custom (optional, R03.20)`)
- [x] Default = first preset; a text picker without its own list uses the photo list
  (`presets.test.ts > presets per provider … > keeps each list short and free of repeats, with
  its first entry as the default`, `> falls back to the photo list in a text picker when a
  provider has no text list`)
- [x] An unlisted saved model on a fixed-list provider becomes the default, per picker
  (`resolveModel: a saved pick > turns a model Gemini no longer lists into its default`, `>
  checks the list of the picker it is for`); typed ids kept on free-form providers (`> keeps any
  typed id on OpenRouter, Hugging Face and Custom`); blank → default (`> gives the default for a
  blank or missing id, which for Custom is nothing`)
- [x] Ollama free-form, a deliberate change (`> keeps an Ollama tag typed freely (R03.21,
  ACC-E13-2)`; `providers.test.ts > models and browser access > takes typed model ids for
  OpenRouter, Hugging Face, Ollama (R03.21) and Custom only`)
- [x] Provider-scoped replacements run once under a marker for primary and standby, free-form
  providers too, and a later deliberate pick of the old id survives (`upgradeChoices: retired
  presets (R03.28) > rewrites the primary and the standby once, and not on the second run`, `>
  does not rewrite a model the person picks again after the upgrade ran`, `> renames each pick
  only by its own provider, typed ids on free-form providers too`); a pick stored without a
  provider is not guessed (`src/ai/settings.test.ts > upgradeAiSettings: retired presets in
  stored settings (R03.28) > does not guess the provider of a pick stored without one`)
- [x] Browser access per provider and self-hosted flag (`> reaches Anthropic only with its opt-in
  header, …`, `addresses > marks only Ollama and Custom as self-hosted, …`)
- Mutation check: Ollama not free-form (3 tests fail), upgrade ignoring the marker (4).
- Deliberate differences: our own presets (D-16.25); Custom key optional (R03.20); Ollama
  free-form (R03.21); upgrades also cover the text role (P03-04); `browserAccess` and
  `selfHosted` are new (PWA, D-16.60).
- Not taken: the on-device providers (out of v1); the Gemini preview-id alias on save and the
  separate one-time Gemini migration (no legacy users; the versioned table covers renames); key
  placeholder texts and brand short names (UI copy, P05-04); the timeout clamp lives in
  `settings.ts` (P03-04).

## Decisions for the lead

- Display names are plain vendor brand names (`Gemini`, `Anthropic`, `xAI`, `Mistral AI`,
  `Qwen`, `Ollama`, …) and `Custom server` for Custom, kept in the catalogue (not the i18n
  catalogue) because they are names, not copy. P05-04 may move `Custom server` into its
  partition if it wants it translated.
- `key: 'required' | 'optional' | 'none'` instead of a boolean, so Custom can be optional. A
  noKey failure (P03-17) applies only to `required`.
- The upgrade marker is the data layer's `meta.presetUpgradeVersion` (`17` §1.2); this module
  only computes the new version. `PRESET_UPGRADES` is empty in v1.
- Presets checked live on 2026-10-26. Vendors moved on since the reference's lists: notably
  DeepSeek now names `deepseek-flash` (V4.1 Flash, which its docs and OpenRouter say also takes
  images); Cerebras lists "image inputs (preview)". Both stay text-only here as the spec says
  (14 photo providers); worth a look at the P10-12 live check.
- Follow-up for P03-08/P03-09 (not mine): several current defaults reason by default (OpenAI's
  GPT-6 family, xAI `grok-4.3` at `low`, Anthropic 5.5 models with adaptive thinking). With the
  1 024-token cap the adapters may need the vendor's "no or low reasoning" switch so answers are
  not cut off; the truncation re-ask catches it otherwise.
- Fireworks has two presets (only the vision models I could confirm as serverless on the build
  date); Groq has one photo preset (its only vision model) and Qwen two.

## Status

Done (2026-10-26). Created `src/ai/catalog/providers.ts`, `providers.test.ts` (13 tests),
`src/ai/catalog/presets.ts`, `presets.test.ts` (17 tests), this note. Nothing changed outside the
task's files. The settings side (decoding, roles, applying upgrades to stored settings) is in
P03-04's note.
