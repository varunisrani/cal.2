# Task: AI access step and the shared provider form (P05-04) · Phase: 05 · Owner: builder (wt-p05s2a, slice S2a)

Read (reference @ `10e14b67`): `A/ui/settings/AiAccessSettings.kt` (the BYOK part: the
"bring your own key" access mode and how it is chosen; the hosted plan, purchases and usage are out
of v1), `A/ui/settings/SettingsScreen.kt` lines 1225–1520 (the AI section: which rows a provider
shows, behaviour only). Research spec `01-profile-goals.md` §3.4 (step 11 and the navigation
notes), `03-ai-providers.md` §3.1 (registry), §3.3 (what the person configures), §3.12 (key
display), §3.13 and §3.15 (http, CORS, Ollama origins); decisions D-16.7 (keys on this device,
said plainly), D-16.26 (http only for loopback), Proposed D-16.49 ("Set up later"). Landed code
reused, not re-derived: `src/ai/catalog/{providers,presets}.ts`, `src/ai/settings.ts`,
`src/ai/endpoint.ts`, `mask` in `src/data/repos/secretsRepo.ts`. No reference tests cover these
screens.

What it does (own words):
- `ProviderForm` (shared with the P09 AI page) shows one role's provider settings from values and
  callbacks, with no storage of its own: a provider picker grouped into cloud services and "your
  own server"; a model picker; a server address for Ollama and Custom, checked as typed (https
  anywhere, plain http only for this device, with the reason when refused, and the "/v1" hint for
  Ollama); a key field for providers that take a key.
- `ModelPicker`: the provider's presets (default first); providers that accept any id also offer
  "another model", which opens a text field; Custom has only the text field.
- `KeyField`: a hidden-text key input, a line with the saved key masked (first four … last four),
  a link naming where that provider's keys are made, the "paste your key" message when a key is
  needed and missing, and one plain line that the key stays in this browser on this device and
  goes only to that provider (D-16.7).
- `AiAccess` (wizard step 10): the form for the primary role, our short terms with a checkbox,
  and "Set up later". Whenever the setup is complete (terms ticked and `missingFor` finds nothing,
  the address accepted), the choice is saved (settings row + key), and only once the save is
  stored does the step tell the wizard it may continue (`aiReady`). Any change first takes
  readiness back. "Set up later" forgets any saved choice and moves on; the plan then uses the
  formulas (Proposed D-16.49).
- `aiSetup` service: saves the choice (the `ai.settings` row through `decodeAiSettings`, the key
  trimmed into the provider's slot of the secrets table), reads a saved key masked, records the
  terms box, and clears everything for "Set up later".

Inputs → outputs:
- `ProviderForm({value: AiChoice, onChange, savedKeyMask, savedServers?, use?, data-ui})` → a
  new `AiChoice` on every edit; `checkChoice(choice, savedKeyMask)` → `{missing, urlProblem,
  urlHint, ready}`; `withProvider(id, use, savedServers)` → the choice after a provider switch.
- `aiSetup.saveChoice(choice)` → `{keyMask, missing}` read back from storage;
  `aiSetup.setUpLater()`, `aiSetup.savedKeyMask(provider)`, `aiSetup.setTermsAccepted(on)`.
- `AiAccess({state, dispatch})` → `aiReady` true/false, `next` after "Set up later".

Files: created `src/features/ai-setup/{ProviderForm,ModelPicker,KeyField,SelectField}.tsx`,
tests for the first three, `src/features/ai-setup/{choice,keyPages}.ts` (+ `choice.test.ts`),
`src/features/ai-setup/aiSetup.module.css`, `src/features/onboarding/steps/AiAccess.tsx` (+ test),
`src/i18n/en/aiSetup.ts`, `src/services/aiSetup.ts` (+ test); changed `src/i18n/en.ts` (the
partition), `src/data/settingsSchema.ts` (+ test: the `ai.settings` row reads through
`decodeAiSettings`), `src/services/context.tsx` (`aiSetup` in `Services`), `src/main.tsx` (the
secrets repository and the service).

Edge cases / failure modes:
- A key typed with spaces or a newline is stored trimmed; a blank field keeps the saved key.
- A provider switch resets the model to its default and the address to the one saved for that
  provider (or its default); the key field starts empty and shows that provider's saved key.
- `http://10.0.0.2:11434/v1` → refused with the reason (plain http only for this device);
  `http://localhost:11434` → accepted with the "/v1" hint; an empty address is asked for.
- Custom: key optional, model required (R03.20); Ollama: no key field, any tag (R03.21).
- Saves are serialised, so an older save can never land after a newer one; a save that finishes
  after a further edit is ignored (readiness stays off until the newest values are stored).
- The saved key is read in the same queue, so a read started before a save never lands after it;
  the "paste your key" line waits until that read is done, so it never flashes over a saved key.
- A save fails (no WebCrypto on a plain-http page, storage error): a message and Retry; Continue
  stays off.
- Coming back from Plan ready: the step reopens on what was saved (provider, model, address, the
  terms box) with the key shown masked, and re-saves before Continue opens again.
- "Set up later" while a save is still running: it waits for that save and then clears it; edits
  made meanwhile are not saved.

Our design differences / decisions:
- Names, layout and words are ours. No hosted path (N-8), so no access-mode choice: the step is
  the BYOK form directly, with "Set up later" in place of the hosted path (Proposed D-16.49).
- The step sets the primary role, which serves photo requests, so it lists the 14 providers that
  read photos (12 cloud, 2 own server); the form lists all 16 for a text role (`use="text"`, P09).
- Readiness is shown inline (the "paste your key" line, the address reason, the model line)
  instead of an alert after tapping Continue.
- "Set up later" stores `ai.settings` = null and removes the AI keys stored so far (during
  onboarding only this step can have stored them; backups never carry keys, D-16.7), so "no
  provider saved" holds however Building plan checks it.
- The terms box is stored as `onboarding.termsAccepted` each time it changes, so the step reopens
  with it.
- Key pages are vendor facts (addresses), kept as data next to the form; the link text names the
  place in our words. Provider names come from the provider catalogue (no logos).
- Native `<select>` pickers (provider with two `<optgroup>`s, model presets) so a phone shows its
  own list.

Tests we will write:
- `ProviderForm.test.tsx`: Gemini shows a key field and its presets; Ollama shows a server
  address and no key; `http://10.0.0.2:11434/v1` is refused with the reason (ACC-E13-1, R03.3);
  the "/v1" hint for Ollama (R03.22); providers grouped; switching provider resets the model.
- `ModelPicker.test.tsx`: presets with the default first; "another model" opens a text field for a
  free-form provider (R03.21); Custom shows only the field and a blank model is reported.
- `KeyField.test.tsx`: a saved key shows masked; the "paste your key" line when missing; the link
  names where keys are made; the one device line (D-16.7); Custom's key optional.
- `choice.test.ts`: `checkChoice` (Custom without a model is not ready, R03.20; Ollama needs no
  key; a saved key counts).
- `AiAccess.test.tsx`: Continue disabled until a needed key is typed and the terms ticked, then
  the choice is stored (ACC-B6-1); Custom without a model blocks Continue; terms unchecked blocks
  Continue; "Set up later" continues with no provider saved (ACC-B6-2); a saved key shows masked
  when the step reopens; the key is stored trimmed (R03.20); a late save never opens Continue.
- `aiSetup.test.ts`: saves the primary and the trimmed key; keeps other settings; refuses a
  plain-http LAN address; "Set up later" clears the row and the AI keys but not the food-database
  key; the mask.
- `settingsSchema.test.ts`: the `ai.settings` row reads through `decodeAiSettings`.

Compare checklist (filled after the rewrite; reopened `AiAccessSettings.kt` (BYOK part),
`SettingsScreen.kt` 1225–1520):
- [x] Provider, then model; a key row only for providers that take a key; a server row for
  Ollama and Custom (`ProviderForm.test.tsx` > ProviderForm > shows Gemini with a key field and
  its presets, and asks for the key; > shows Ollama with a server address and no key; > asks
  Custom for its address and model, and makes its key optional (R03.20))
- [x] The saved key shown masked, never whole (`KeyField.test.tsx` > KeyField > shows a saved key
  masked, never whole, and offers to replace it (ACC-E14-1); `AiAccess.test.tsx` > AiAccess >
  reopens on the saved choice with the key masked, and lets the person go on (back from Plan
  ready))
- [x] Choosing a provider resets its model to the default (`ProviderForm.test.tsx` >
  ProviderForm > resets the model to the new provider's default and drops a typed key;
  `choice.test.ts` > withProvider and primaryChoice > resets the model to the provider's default
  and starts its server from the saved one)
- [x] The terms gate and the missing-key gate on the AI step; the choice stored before Building
  plan runs (`AiAccess.test.tsx` > AiAccess > keeps Continue disabled until a needed key is
  entered and the terms are accepted, then stores the choice (ACC-B6-1); > holds Continue while
  the terms are unticked, even when nothing else is missing)
- [x] Presets per provider; free-form ids where allowed (`ModelPicker.test.tsx` > ModelPicker >
  lists a fixed-list provider's presets, default first, and nothing to type; > lets a free-form
  provider type any model id, such as an Ollama tag (R03.21))
- Deliberate differences: no access-mode choice and no hosted plan (N-8), "Set up later" instead
  (Proposed D-16.49); plain http only for this device, refused with the reason as typed and again
  when saved (D-16.26, R03.3; the reference allows any http); Custom key optional, model required,
  keys trimmed (R03.20); Ollama takes any tag (R03.21); inline "paste your key" line instead of an
  alert; one line that the key stays on this device (D-16.7); a link naming where each provider's
  keys are made; no brand icons; the step offers the 14 providers that read photos.
- Not taken: the request timeout, reasoning effort and answer-length rows, the separate text
  provider and both standbys (P09-07); the hosted plan, purchases, usage and restore (N-8); the
  on-device models (out of v1).

## Decisions for the lead

- `Services.aiSetup` is optional for now: the stand-in services in `src/app/App.test.tsx`,
  `src/features/home/{EntryRow,Diary}.test.tsx`, `src/features/onboarding/QuickStart.test.tsx`,
  `src/services/context.test.tsx` and `src/test/screenHarness.tsx` would otherwise stop
  typechecking, and two of those folders are outside this slice. Once they carry a stub, make it
  required and drop the throw in `useAiSetup` (`AiAccess.tsx`).
- The `ai.settings` row is now `AiSettings | null`: null until the person sets AI up (and again
  after "Set up later"); a reader that needs settings uses `?? DEFAULT_AI_SETTINGS`
  (`decodeAiSettings(null)` gives the same). For P05-05: "no AI setup" can be read either as the
  row being null or as `missingFor` on the stored primary finding something; after "Set up later"
  both hold.
- The choice is saved whenever it is complete (each edit, serialised), not when Continue is
  pressed, because the wizard page owns Continue. A pasted key is stored at once (trimmed). If
  saving on Continue is preferred, `WizardPage` needs a "before next" hook from the step.
- "Set up later" removes every stored AI key (provider slots; the `fdc` slot stays).
- The key-page addresses are vendor facts written on the build date, not probed live; the live
  provider check before a release (P10-12) should open them.
- Note slug: the task prompt named this note `ai-access-and-provider-form.md`; the phase file's
  list says `ai-access-step-and-the-shared-provider-form.md`.
- Acceptance map: ACC-B6-1, ACC-B6-2 and ACC-E13-1 can move from `Review: P05-04` to the tests
  listed above (ACC-E13-1: `ProviderForm.test.tsx` > ProviderForm > refuses
  http://10.0.0.2:11434/v1 and says why (ACC-E13-1, D-16.26, R03.3), and `AiAccess.test.tsx` >
  AiAccess > refuses a plain-http server on the local network with the reason and holds Continue
  (ACC-E13-1)).

## Status

Done (2026-10-26). Form, picker, key field, step, service and row reader with 47 tests in this
slice's files (plus one new `settingsSchema` test). Lines outside the task's own files: the
`ai.settings` row and its comment in `src/data/settingsSchema.ts` (+ one test), the partition in
`src/i18n/en.ts`, `aiSetup` in `src/services/context.tsx`, four lines of wiring in `src/main.tsx`.
Handed on: P05-05 reads the saved choice (row + key) for Building plan; P09-07 reuses
`ProviderForm` (`use="text"` for text roles) and `aiSetup`.
