# Task: provider catalogue and model presets (P03-03) · Phase: 03 · Owner: builder (wt-p03s2, wave B S2)

<!-- Save as platewise/docs/notes/P<nn>/<slug>.md. Write everything above "Compare checklist"
BEFORE writing code, in your own words. Never paste or paraphrase the reference line by line. -->

Read (reference @ `10e14b67`): `A/models/AIProvider.kt` (all), `I/Models/AIProvider.swift`
(registry, model helpers, the two upgrade passes and the settings accessors that call them),
tests `T/services/ai/AIRequestConfigurationTest.kt` and `IT/AIModelRegistryTests.swift`. Research
spec `03-ai-providers.md` §3.1 (registry), §3.3 (where the presets show), §3.15 (browser access per
provider) and §5; traps R03.21, R03.28; decision D-16.25 in `16-what-we-change.md`; naming table
`17` §1.2 (`presetUpgradeVersion` marker) and §1.4 (provider ids). Vendor model lists checked live
on 2026-10-26 (see "Presets" below). No Evidence ids.

What it does (own words): one place lists the sixteen AI providers a person can bring a key for,
in the order the provider picker shows them, with everything other modules need to know about each
one: its id and the name we show, the address it answers on by default, which of the three wire
formats it speaks, how the key travels, whether it needs a key at all, whether the person must give
a server address (Ollama and Custom), whether it can look at photos, whether any model id may be
typed, and how a browser can reach it. Next to it sits our own short list of model presets per
provider (at most three for photo requests and three for text requests, the first being the
default), the rule that turns a saved model id into the one actually used, the two provider lists
the pickers show, and a versioned table of preset upgrades that retires an old id for a new one
exactly once, so a model that disappears from our list does not linger and a person who later
picks an old id on purpose is left alone.

Inputs → outputs:
- `PROVIDER_IDS`, `ProviderId`, `isProviderId(value)`; `PROVIDERS` (ordered entries),
  `providerById(id)`.
- Entry fields: `id`, `name`, `baseUrl`, `format` (`gemini` | `openai` | `anthropic`), `auth`
  (`googleHeader` | `bearer` | `anthropicHeader` | `none`), `key` (`required` | `optional` |
  `none`), `endpoint` (`fixed` | `userServer`), `vision`, `freeFormModel`, `browserAccess`
  (`direct` | `directWithHeader` | `userServer` | `unsupported`), `hidesKeyRefusal` (`always` |
  `withoutKey` | `never`, spec 03 §3.15 item 4).
- `presetsFor(provider, use)` with `use` = `image` | `text`; `defaultModel(provider, use)` (`''`
  for Custom); `resolveModel(provider, saved, use)` → the model id used.
- `imagePickerProviders()` (the 14 with vision), `textPickerProviders()` (every provider with a
  text preset or a typed id: all 16).
- `PRESET_UPGRADES` (empty in v1), `PresetUpgradeStep { version, renames }`,
  `upgradedModel(provider, model, doneVersion, steps)`, `upgradeVersion(doneVersion, steps)`,
  `readUpgradeMarker(value)`.

Files: created `src/ai/catalog/providers.ts`, `providers.test.ts`, `presets.ts`,
`presets.test.ts`, this note.

Edge cases / failure modes:
- DeepSeek's default address has no `/v1` on purpose; Custom has no default address at all.
- Ollama's default is plain `http://localhost:11434/v1` (loopback, allowed by D-16.26).
- DeepSeek and Cerebras have no photo presets and are absent from the photo pickers; they still
  serve the text role and the text standby.
- A saved id for a fixed-list provider that is not in our list for that use reads as that
  provider's default for the use (photo list for the primary and the image standby, text list for
  the text role and the text standby). A blank or non-string saved id reads as the default too.
- Typed ids (OpenRouter, Hugging Face, Ollama, Custom) are kept as typed, trimmed, never checked
  against the list: an Ollama tag such as `qwen3-vl:8b` stays (R03.21, ACC-E13-2).
- Custom has no presets and no default: a blank Custom model stays blank, and P03-04 reports the
  role as incomplete (R03.20).
- Upgrades are scoped by provider: a rename for Gemini never touches the same string saved under
  OpenRouter. They also apply to typed-id providers (R03.28), chain in version order, and a step
  at or below the stored marker never runs again.
- Model ids are case-sensitive (`Qwen/Qwen3.5-9B`); only surrounding white space is removed.

Our design differences / decisions:
- Names and shape are ours: one entry per provider built by a small helper with the common
  values, rather than one big switch per property. Provider ids are the glossary's lower-case ids.
- Display names are our data (short vendor names: Gemini, Anthropic, Mistral AI, Qwen (Alibaba
  Cloud), Custom server, …), not the reference's picker labels; key hints and help sentences are
  copy and come later with the screens (P05-04, P09-07).
- Presets (D-16.25) are our own short list, checked against each vendor's public model page on
  2026-10-26. Several of the reference's ids are no longer listed there (OpenAI `gpt-5.4-mini`,
  Groq `qwen/qwen3.6-27b`, Together `MiniMaxAI/MiniMax-M2.7`, Cerebras `gemma-4-31b`, DeepSeek
  `deepseek-v4-flash` now a retired alias), so the list differs on purpose. Where a vendor page did
  not say a model takes images, the model is not offered for photos.
- Ollama gets typed ids (R03.21; the reference offers its six presets only). Custom key is
  optional (`key: 'optional'`), Ollama sends none (`auth: 'none'`, `key: 'none'`).
- `browserAccess` per spec 03 §3.15: Anthropic `directWithHeader`, Ollama and Custom `userServer`,
  the other thirteen `direct`; `unsupported` is reserved.
- `hidesKeyRefusal` mirrors the hint list that `src/ai/errors.ts` keeps today (Cerebras always,
  Hugging Face without a key). errors.ts is not edited here: follow-up for the lead.
- Upgrades: a versioned list of steps (`version`, per-provider renames), empty in v1. The marker is
  the `meta.presetUpgradeVersion` value (17 §1.2); P03-04's `loadAiSettings` applies the pending
  renames to the raw saved choices before they are checked against the lists, so a retired preset
  can still be mapped to its replacement instead of falling to the default first. Applied to all
  four role slots (the reference does the primary and the image fallback only).
- Not taken: the reference's one-off id spelling fix on save (`…-preview` → plain) and its two
  legacy upgrade tables (no legacy users, spec 03 §5); on-device providers (out of scope).

Presets (first = default; text list shown only where it differs from the photo list), checked
2026-10-26 on the vendor pages named in `presets.ts`:
- Gemini `gemini-3.5-flash-lite`, `gemini-3.8-flash`, `gemini-3.1-pro-preview`.
- OpenAI `gpt-6-luna`, `gpt-6.1-terra`, `gpt-6.1-sol`.
- Anthropic `claude-sonnet-5-5`, `claude-haiku-5-5`, `claude-opus-5-5`.
- xAI `grok-4.6`, `grok-4.3`.
- OpenRouter `google/gemini-3.5-flash-lite`, `openrouter/free`.
- Together AI photos `Qwen/Qwen3.5-9B`, `moonshotai/Kimi-K3`; text `openai/gpt-oss-120b`,
  `Qwen/Qwen3.8-Flash`, `moonshotai/Kimi-K3`.
- Groq photos `qwen/qwen3.8-27b`; text `openai/gpt-oss-20b`, `openai/gpt-oss-120b`,
  `llama-3.3-70b-versatile`.
- Hugging Face `google/gemma-4-31B-it`, `Qwen/Qwen3.8-27B`, `moonshotai/Kimi-K3`.
- Fireworks AI `accounts/fireworks/models/kimi-k3`.
- DeepInfra `google/gemma-4-31B-it`, `Qwen/Qwen3.8-27B`.
- Mistral AI photos `mistral-medium-3-5`, `mistral-large-2512`; text `mistral-small-2603`,
  `mistral-medium-3-5`, `mistral-large-2512`.
- DeepSeek text `deepseek-flash`, `deepseek-v4-pro`.
- Qwen photos `qwen3.7-plus`, `qwen3.8-max`; text `qwen3.8-flash`, `qwen3.7-plus`, `qwen3.8-max`.
- Cerebras text `gpt-oss-120b`, `qwen-3.8-27b`.
- Ollama `qwen3-vl`, `gemma4`, `qwen3.8`.
- Custom none.

Tests we will write:
- `providers.test.ts`: 16 entries in the fixed order with unique ids; 14 with vision (not DeepSeek,
  Cerebras); formats and auth per provider; DeepSeek's base has no `/v1`; every fixed address is
  https, Ollama's is loopback http, Custom's is empty; key needs (Ollama none, Custom optional,
  the rest required); `userServer` for Ollama and Custom only; typed ids for OpenRouter, Hugging
  Face, Ollama, Custom; browser access per §3.15; refused-key hint per §3.15 matches errors.ts
  today; `isProviderId` and `providerById`.
- `presets.test.ts`: at most three per list, no duplicates, defaults are the first; every
  provider in each picker offers a preset except Custom (ACC-E1-1); photo pickers list 14, text
  pickers 16; text list falls back to the photo list; `resolveModel`: unknown saved model on Gemini
  → default, a text-only id on the photo list → photo default, blank and non-string → default,
  typed ids kept and trimmed (Ollama tag, OpenRouter id; ACC-E13-2, R03.21), Custom blank stays
  blank; upgrades: empty in v1, renames once per marker, chained in version order, provider-scoped,
  typed-id providers included, marker read leniently (R03.28).

Compare checklist (filled after the rewrite; reopened `A/models/AIProvider.kt`,
`I/Models/AIProvider.swift` registry and upgrade parts, `T/services/ai/AIRequestConfigurationTest.kt`,
`IT/AIModelRegistryTests.swift`; every property walked against `src/ai/catalog/*.ts`). Test names
are in `src/ai/catalog/providers.test.ts` (P) or `presets.test.ts` (S).
- [x] Sixteen remote providers in picker order, on-device ones left out (P `PROVIDERS > lists the
      16 providers once each, in picker order`)
- [x] Default addresses per provider, DeepSeek without `/v1`, the international Qwen endpoint,
      Ollama on loopback, Custom empty (P `PROVIDERS > keeps the vendor addresses, DeepSeek at its
      root without /v1`)
- [x] Formats: Gemini, Anthropic, the other fourteen OpenAI-compatible; Ollama sends no key
      (P `PROVIDERS > names the wire format and the way the key travels for each provider`)
- [x] Photo support: all but DeepSeek and Cerebras (P `PROVIDERS > marks 14 providers as seeing
      photos: every one but DeepSeek and Cerebras`); photo pickers 14, text pickers 16, text
      pickers = a text preset or a typed id (S `pickers > lists 14 providers for photos and all 16
      for text, each offering its presets (ACC-E1-1)`)
- [x] Key needed by all but Ollama; Custom optional on purpose (P `PROVIDERS > asks for a key
      everywhere but Ollama, and only optionally for Custom (R03.20)`)
- [x] User-supplied endpoint for Custom (and Ollama's editable server) and the longer timeout
      those two get (P `PROVIDERS > takes the server address from the person for Ollama and Custom
      only`; the attempt-cap rule itself is P03-05's)
- [x] Typed ids: OpenRouter, Hugging Face, Custom, plus Ollama on purpose (P `PROVIDERS > accepts
      typed model ids for OpenRouter, Hugging Face, Ollama and Custom (R03.21)`; S `resolveModel >
      keeps a typed Ollama model tag such as qwen3-vl:8b (R03.21, ACC-E13-2)`)
- [x] Default = first preset, default text model = first text preset else the photo default
      (S `defaultModel > is the first preset of the list, nothing for Custom`); text list falls
      back to the photo list (S `presetsFor > uses the photo presets for text unless the provider
      keeps its own text list`)
- [x] Saved-model rule: blank → default, typed-id provider → kept, listed → kept, else default,
      for the photo and the text list (S `resolveModel > reads an unknown saved model on Gemini as
      its default` (also a retired DeepSeek text id), `… reads a model from the other list as the
      default of the list in use`, `… reads a blank, missing or non-text saved model as the
      default`, `… keeps typed ids for OpenRouter, Hugging Face and Custom as typed, trimmed`)
- [x] Custom has no presets and needs a typed model (S `presetsFor > offers no photo presets for
      DeepSeek and Cerebras, and none at all for Custom`, `resolveModel > leaves a blank Custom
      model blank, since Custom has no default (R03.20)`)
- [x] Provider-scoped one-time upgrades for the primary and the standby, free-form providers
      included, not re-run after the marker (S `preset upgrades > renames a retired id once, and
      not again after the marker has moved (R03.28)`, `… renames only under the provider the round
      names, typed-id providers included`; settings-level in `src/ai/settings.test.ts >
      loadAiSettings > renames retired presets in every role once, then leaves a re-picked old id
      alone (R03.28)`)
- [x] Browser reachability per spec 03 §3.15 (P `PROVIDERS > records how a browser reaches each
      provider (spec 03 §3.15)`) and the refused-key hint list agreeing with errors.ts (P
      `PROVIDERS > marks the providers whose refused keys look like lost connections, as errors.ts
      does`)
- Deliberate differences: our own preset lists (D-16.25), checked live on 2026-10-26, so several
  reference defaults changed (OpenAI `gpt-6-luna`, Anthropic `claude-sonnet-5-5`, OpenRouter
  `google/gemini-3.5-flash-lite`, Mistral `mistral-medium-3-5`, Ollama `qwen3-vl`, DeepSeek text
  `deepseek-flash`, Groq photos `qwen/qwen3.8-27b`); at most three per list; Ollama typed ids;
  Custom key optional; saved ids are trimmed before the list check (the reference compares the
  untrimmed value, so a pasted space fell to the default); upgrades cover all four roles; our
  display names; `browserAccess` and `hidesKeyRefusal` are new properties for the browser.
- Not taken: on-device providers; the id spelling fix on save; the reference's legacy upgrade
  tables (no legacy users); key hint brand names and placeholders (copy, P05-04); the reference's
  per-provider extra request fields (adapters, P03-08).

## Decisions for the lead

- **Presets differ from the research spec's lists on purpose.** D-16.25 asks for our own short
  list checked against the vendors on the build date. On 2026-10-26 several of the spec's ids were
  gone from the vendor pages (OpenAI `gpt-5.4-mini`/`gpt-5.4-nano`/`gpt-6-sol`/`gpt-5.5`, Groq
  `qwen/qwen3.6-27b`, Together `MiniMaxAI/MiniMax-M2.7` and `google/gemma-4-31B-it`, Cerebras
  `gemma-4-31b`, Alibaba `qwen3-vl-plus`, Ollama search did not show `llama3.2-vision`, DeepSeek
  `deepseek-v4-flash` is now a retired alias of `deepseek-flash`, Anthropic's current line is
  5.5). Where the vendor page did not say a model takes images it is not offered for photos, except
  xAI's `grok-4.6` and `grok-4.3` (listed, image support not stated, kept from the spec). Fireworks
  offers only `kimi-k3` (the spec's `qwen3p7-plus` is not serverless, so a key alone cannot call
  it). Checks were made through the vendors' public pages, which are summaries; a real call per
  preset is P03-19's probe and P10's refresh.
- **Display names** are ours and live in `providers.ts`: the short vendor name for most entries,
  with `Qwen (Alibaba Cloud)` and `Custom server` as the two descriptive ones. They feed the
  both-failed message (`{primary} and the standby, {standby}, both failed.`).
- **Follow-up (errors.ts):** the catalogue now has `hidesKeyRefusal` (`always` Cerebras,
  `withoutKey` Hugging Face, else `never`), equal to `HIDES_REFUSED_KEY` in `src/ai/errors.ts`; a
  test keeps the two in step. errors.ts was not edited; the lead may switch it to the catalogue.
- **Upgrade marker:** `readUpgradeMarker` reads `meta.presetUpgradeVersion` (missing → 0);
  `loadAiSettings` (P03-04) returns the marker to store. `PRESET_UPGRADES` is empty in v1.
- **Picker helpers return ids** (`imagePickerProviders()`, `textPickerProviders()`), in picker
  order; screens map them to entries with `providerById`.

## Status

Done (2026-10-26). `src/ai/catalog/providers.ts`, `presets.ts` and their tests are in place; no
file outside the slice changed. Traps R03.21 and R03.28 and acceptance rows ACC-E1-1 and ACC-E13-2
now have tests. Handed on: the errors.ts hint list (lead), key hints and help copy (P05-04,
P09-07), the live per-preset probe (P03-19).
