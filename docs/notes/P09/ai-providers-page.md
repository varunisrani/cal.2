# Task: AI providers page and food-database key (P09-07) · Phase: 09 · Owner: builder (wt-p09s07, slice S07)

Read (reference @ `10e14b67`): `A/ui/settings/SettingsScreen.kt` lines 1225–1520 (which rows the
AI category shows per role and when) and 2855–3140 (what each row's sheet offers, the standby model
lists), `I/ContentView.swift` lines 5740–5850 (primary key, server, timeout, reasoning effort and
token rows), around 6190 (image standby key row), 6360 (custom instructions block) and 6880 (text
standby model list and key row); behaviour only. To understand "same provider picks another
model" I also read the two standby provider-selection helpers next to them (`ContentView.swift`
7139–7181). Research spec `03-ai-providers.md` §3.3 (what the person configures), §3.4 (when a
standby may run), §3.12 (key display); `02-food-logging.md` §2 and R02.18 (FoodData Central key:
sign-up page, header-safe characters). Decisions D-16.7, D-16.22, D-16.23–D-16.26; trap R03.9.
Landed code reused, not re-derived: `src/features/ai-setup/*` (P05-04 form), `src/ai/settings.ts`
(`effectiveBaseUrl`, `readTimeoutSec`, `readMaxTokens`, `OPENROUTER_EFFORTS`), `src/ai/endpoint.ts`
(`sameServerUrl`), `src/ai/catalog/*`, `src/services/aiSetup.ts`, `FDC_SLOT` and `mask`. No
reference tests cover these screens.

What it does (own words):
- Settings › AI providers, a page fetched on first open. At the top, one plain paragraph that
  keys live in this browser and a browser cannot fully shield them from code on this site
  (D-16.7).
- Four role cards built on the P05-04 provider form (`RoleCard`): the main provider (photo
  providers only); "Different model for text" (a switch, then the form over all 16 providers);
  a photo standby and a text standby (each a switch, then the form). Keys are per provider, so
  every card using a provider shows the same saved key, masked; each card can forget it. Ollama
  and Custom addresses: the main provider and the text model share the main slot, both standbys
  use the standby slot (R03.5).
- A standby on the same provider and the same server as the role it backs never lists that role's
  model (the photo standby backs the main provider; the text standby backs the text model when it
  is on, else the main provider); picking that provider, or switching the standby on, moves it to
  the provider's next preset. A standby still equal to the role it backs (the backed role changed
  later, or the same id typed) says it would never be tried.
- A role's choice is saved whenever it is complete (nothing missing: key, model, accepted address),
  one save at a time in the order made; while something is missing the card says changes wait.
- "Requests": Give up after (whole seconds, 30–600, default 180, clamped when the field is left)
  and the answer length limit (whole tokens, at least 1, default 1 024), both for every provider
  (D-16.23, D-16.25, R03.9); OpenRouter reasoning effort only while OpenRouter fills a role that is
  shown (the main provider, or a switched-on role).
- "Notes for the AI" (`InstructionsField`): a text box saved with a button, stored trimmed; blank
  sends none (D-16.24).
- "Food databases" (`FoodDbSection`): the FoodData Central key in the `fdc` slot, a short
  explanation, the sign-up link, save and forget.

Inputs → outputs:
- `AiPage()` reads `ai.settings` (`useSettings`) and acts through the `aiSetup` service.
- `aiSetup` gains (additively): `saveRole(role, choice)` → `{keyMask, missing}`;
  `setRoleOn(role, on)`; `setTimeoutSec(n)` / `setMaxTokens(n)` → the stored, clamped value;
  `setOpenRouterEffort(effort)`; `setInstructions(text)` → the stored, trimmed text;
  `forgetKey(provider)`; `foodDbKeyMask()`; `saveFoodDbKey(key)` → mask or a problem;
  `forgetFoodDbKey()`.
- `roles.ts` (pure): `roleChoice(settings, role)`, `serversFor(settings, role)`,
  `backedRole(settings, standby)`, `hiddenModel(choice, backed)`, `isDuplicate(choice, backed)`,
  `avoidDuplicate(choice, backed, use)`, `usesOpenRouter(drafts, ons)`, `wholeNumber(text)`.

Files: created `src/features/settings/ai/{AiPage,RoleCard,InstructionsField,FoodDbSection}.tsx`
with tests (`FoodDbSection.test.tsx` too), `src/features/settings/ai/roles.ts` (+ `roles.test.ts`),
`src/features/settings/ai/useAiEdits.ts`, `src/features/settings/ai/testing/openAiPage.tsx`,
`src/features/settings/ai/ai.module.css`; changed (additive) `src/features/settings/registry.ts`
(the entry), `src/services/aiSetup.ts` (+ tests), `src/i18n/en/aiSetup.ts` (`aiSetup.page.*`),
`src/features/ai-setup/{ProviderForm,ModelPicker}.tsx` (an optional `hiddenModel` prop, + one
ModelPicker test).

Edge cases / failure modes:
- Nothing is drawn until the settings are read, so no default flashes over a stored value
  (R06.22). `ai.settings` null (never set up, or "Set up later") shows the defaults; the first
  saved change stores a whole record.
- A key typed with spaces is stored trimmed; a blank key field keeps the saved key. The "paste
  your key" line waits until the saved key has been read.
- Forgetting a key also empties any typed copy of it in other cards, so no card claims a key that
  is gone; the role then shows the key as missing.
- Turning a standby on while it equals the backed role moves it to the next preset first; a
  provider with one preset (or a typed id) cannot move, and the card says it would never be tried.
- The timeout field: `10` → 30, `9000` → 600, letters or blank → back to the stored value.
  The token field: `0` → 1, `2048` kept, no upper bound.
- A save that fails (no WebCrypto on a plain-http page, a storage error) says so with Retry; the
  form keeps what was typed.
- FoodData Central key: blank cannot be saved (the button is off); a key holding a character a
  request header cannot carry (a pasted zero-width space) is refused with the reason (R02.18).

Our design differences / decisions:
- Names, layout and words are ours; no brand icons; native pickers (the P05-04 form).
- One page for every role with inline forms instead of a row per setting opening a sheet.
- Rows shown for every provider: the token limit (D-16.25, R03.9, where the reference hides it for
  Gemini) and the time limit (the reference shows it only for Ollama and Custom); one time limit
  for the whole action (D-16.23).
- Saved when complete, not on every keystroke regardless: a half-made switch never breaks AI.
- "Forget key" buttons instead of saving a blank key (keys are never echoed back, so a blank field
  cannot mean "remove").
- The FoodData Central key is checked for header-safe characters when saved, not only when used.
- No on-device models, speech or hosted access on this page (out of v1).

Tests we will write:
- `AiPage.test.tsx`: listed with the preferences after Tracking and fetched on first open; the
  storage paragraph (ACC-J8-2); the token limit shown with Gemini (ACC-E12-1, R03.9); timeout
  10 → 30; reasoning effort appears for OpenRouter as the text standby and is stored; a photo
  standby set on the page serves a photo request the main provider fails (ACC-J8-1); forgetting
  a key removes it from storage.
- `RoleCard.test.tsx`: the standby equal to the main provider is not offered; the same provider's
  other model is; another server lists every model; saving a complete choice; the duplicate note.
- `InstructionsField.test.tsx`: notes saved trimmed; Save off until changed; blank turns them off.
- `FoodDbSection.test.tsx`: key saved trimmed into `fdc`; a zero-width space refused; forget; the
  sign-up link.
- `roles.test.ts`, `aiSetup.test.ts` (new methods), `ModelPicker.test.tsx` (`hiddenModel`).

Compare checklist (filled after the rewrite; reopened `SettingsScreen.kt` 1225–1520 and
2855–3140, `ContentView.swift` 5740–5850, 6080–6215, 6340–6400, 6860–6900, 7139–7181):
- [x] Primary: provider, model, key only for providers that take one, server address for Ollama
  and Custom (the P05-04 form; `RoleCard.test.tsx` > RoleCard > saves a change only once it is
  complete, and waits for a needed key)
- [x] A separate text model behind a switch, listing every provider (`RoleCard.test.tsx` >
  RoleCard > shows a switched-off role as its switch alone, and its form once switched on;
  `AiPage.test.tsx` > AiPage > stores Different model for text as on only once its choice is
  complete)
- [x] Photo and text standbys, each with a switch, provider, model, key and its own address slot
  (`AiPage.test.tsx` > AiPage > makes photo requests fall back to the photo standby set here
  (ACC-J8-1); `aiSetup.test.ts` > saveRole > keeps a standby address in the standby slot and the
  main address as it was (R03.5); `roles.test.ts` > roleChoice and serversFor > starts each card
  from its own address slot)
- [x] The standby model list hides the backed role's model on the same provider and server; the
  text standby backs the text model when it is on, else the primary (`RoleCard.test.tsx` >
  RoleCard > does not offer a photo standby the main provider’s own model on the same server;
  > lists every model when the standby reaches the same provider at another server;
  `roles.test.ts` > backedRole > has the photo standby back the primary, and the text standby
  the role serving text)
- [x] Picking the backed role's provider moves the standby to another preset (`RoleCard.test.tsx`
  > RoleCard > offers the same provider’s other model: picking it moves the standby to the next
  preset; `roles.test.ts` > a standby that repeats the role it backs (R03.5) > moves a duplicate
  to the provider’s next preset, and leaves one with no other preset)
- [x] One key per provider, shown in every role that uses it (`AiPage.test.tsx` > AiPage > shares
  a key per provider: one pasted in a standby card is the main provider’s too)
- [x] Reasoning effort while OpenRouter fills any role (`AiPage.test.tsx` > AiPage > shows the
  reasoning effort while OpenRouter is the text standby, and stores the effort; `roles.test.ts` >
  usesOpenRouter > counts a role only while it is on (the primary always is))
- [x] Timeout clamped to 30–600 (`AiPage.test.tsx` > AiPage > clamps Give up after to 30–600
  seconds: 10 becomes 30, and letters change nothing (D-16.23))
- [x] Token limit, minimum 1 (`AiPage.test.tsx` > AiPage > shows the answer length limit with
  Gemini as the main provider, and stores a new one (ACC-E12-1, R03.9); `aiSetup.test.ts` >
  limits and notes > keeps the answer token limit whole and at least 1, with no upper bound
  (D-16.25))
- [x] Custom instructions saved with a button, only when changed, stored trimmed
  (`InstructionsField.test.tsx` > InstructionsField > saves the notes trimmed with the button,
  then shows them as stored (D-16.24); > offers Save only when the trimmed text differs from what
  is stored; `AiPage.test.tsx` > AiPage > stores the notes for the AI trimmed)
- Deliberate differences: the token limit and the time limit are shown for every provider
  (D-16.25, R03.9, D-16.23; the reference hides the cap for Gemini and shows the timeout only for
  Ollama and Custom); a role is stored when complete, and a switch is stored on only once its role
  is complete (the reference stores each pick at once, so a text provider without a key stops text
  requests); a standby that becomes a duplicate later (the backed role changed) is flagged in its
  card instead of being changed silently (the reference re-picks its model when the primary's
  address changes); keys are trimmed in every role (the reference keeps standby keys raw, R03.20);
  forget-key buttons instead of saving a blank key; the plain storage paragraph (D-16.7); the
  FoodData Central key on this page, checked for header-safe characters when saved (R02.18);
  inline forms instead of a row per setting opening a sheet; no brand icons, no show-key eye
  button (the field is hidden text; the saved key shows masked).
- Not taken: on-device models, speech-to-text and its standby, hosted access (out of v1); the
  instructions placeholder example (our hint says what to write); free-form ids kept across a
  provider switch (our form resets to the provider's default, as P05-04 does).

## Decisions for the lead

- `AiSetupService` gains the page's writes as `AiSettingsEdits`, optional on the interface
  (`extends Partial<AiSettingsEdits>`) because thirteen test files outside this slice build
  stand-in `aiSetup` objects with the four P05-04 methods only; `createAiSetupService` always
  returns them and the page checks with `hasSettingsEdits` (it throws otherwise, like
  `useGoalServices`). Once the stand-ins carry them, make them required. No change was needed in
  `context.tsx` or `main.tsx`.
- `saveChoice` now delegates to `saveRole('primary', …)` (same behaviour; its tests pass
  unchanged).
- `src/features/settings/tracking/TrackingPage.test.tsx` > TrackingPage > is listed with the
  preferences, after Goals lists the preference rows exactly, so the AI page's row makes it fail
  (it now sees a fourth row, "AI providers"). The file is outside this slice: add
  `aiSetup.aiSetup.page.title` to its expected list (one line) when merging, or let P09-01's hub
  rework own it.
- Saved when complete: a role's change is stored each time the card is complete (keystrokes in a
  key field included, like the onboarding step); a switch flipped on is stored on at once only
  when its role is complete, else with the first complete save. A switch flipped off is stored at
  once.
- After "Set up later" (`ai.settings` null) the page shows the defaults; the first change it stores
  writes a whole record, so `configured` (P05-05's `createAiAccess`) becomes true while the primary
  may still lack its key (`missingFor` then still reports it).
- The time-limit and token fields store when left (or on Enter); the field then shows the stored,
  clamped value; anything but digits goes back to the stored value.
- The FoodData Central key keeps its own copy of the header-safe rule (`/^[\x21-\x7E]+$/`, as in
  `src/services/barcode/fdc.ts`, which does not export it).
- The page icon is `chat` (no AI-specific icon exists in `src/ui/icons`).
- Note slug: the prompt named this note `ai-providers-page.md`; the phase file's list says
  `ai-providers-page-and-food-database-key.md`.
- Trap and acceptance rows that can move from `Review: P09-07` to tests:
  - R03.9 and ACC-E12-1: `src/features/settings/ai/AiPage.test.tsx > AiPage > shows the answer
    length limit with Gemini as the main provider, and stores a new one (ACC-E12-1, R03.9)`.
  - ACC-J8-1: `src/features/settings/ai/AiPage.test.tsx > AiPage > makes photo requests fall back
    to the photo standby set here (ACC-J8-1)`.
  - ACC-J8-2: `src/features/settings/ai/AiPage.test.tsx > AiPage > says plainly that keys stay in
    this browser, which cannot fully shield them (ACC-J8-2, D-16.7)`.

## Status

Done (2026-10-27). The page, its cards, notes, food-database section, pure role rules and a test
helper (`testing/openAiPage.tsx`), with 32 tests in `src/features/settings/ai` plus 14 new service
tests and one ModelPicker test. Lines outside the task's own files: the registry entry, the
`aiSetup.page` words, the optional `hiddenModel` prop in `ProviderForm`/`ModelPicker` (+ one
test), the service's new methods (+ tests). Handed on: the TrackingPage hub-list expectation (see
above) to the lead or P09-01.
