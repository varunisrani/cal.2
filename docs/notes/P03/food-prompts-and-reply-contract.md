# Task: food prompts and reply contract (P03-15) · Phase: 03 · Owner: builder (wt-p03s5)

<!-- Save as platewise/docs/notes/P<nn>/<slug>.md. Write everything above "Compare checklist"
BEFORE writing code, in your own words. Never paste or paraphrase the reference line by line. -->

Read (reference @ `10e14b67`): nothing. The phase row lists no reference file for wording: the
reference's prompt files and prompt strings are AI prompt text, which the clean-room rule puts off
limits before and after writing. Behaviour only from research spec `03-ai-providers.md` §3.5 (what
each food request asks for), §3.6 (the reply the parsers accept), §3.7 (the unit repair request),
§3.8 (the compact re-ask), `01-profile-goals.md` §3.2 (the kJ line); decisions D-16.24 (the
person's notes for the AI go in the system channel, so prompts stay fixed), Proposed D-16.58
(kcal and macros required) and Proposed D-16.62 (Scan label uses the meal request with source
label); glossary 17 §1.4 (our reply keys); the landed reader `src/ai/parse/foodReply.ts` and the
domain lists (`NUTRIENT_KEYS`, `EXTRA_KEYS`, `NUTRIENT_UNITS`).

What it does (own words): the text we send a model for every food analysis, and the reply shape
it must use. `contract.ts` spells our reply schema with the key constants the readers already use
(`FOOD_REPLY_KEYS`, `UNIT_REPLY_KEYS`, `PART_REPLY_KEYS`), so prompt and parser cannot drift: one
JSON object with the name, whole kcal, decimal macros, the serving weight, one emoji, a
`nutrients` object under our nutrient keys (the 8 sports compounds sit in the same object, since
that is where `readFoodReply` looks), the `units` list with its rules, the `parts` list with its
rules and the `progressive` flag. `food.ts` builds the requests: photos of one meal (each photo is
another view or part of the same meal; count each food once; trust a readable scale or label over
a guess; a plate built in steps only when the person said so and there are at least two photos,
with weights taken as differences between reliable cumulative scale readings; the person's note
as context), a typed description (one specific food emoji), a label scan (the photo request with
a short hint that a nutrition label is shown; the entry's source is set by the caller), and the
unit repair request (only the `units` list for a named food of known weight). `shared.ts` holds
what several prompts share: the kJ line for people who read kJ, the nutrient unit list derived
from the domain catalogue, the compact re-ask note (cut off; the bare object or a short plain
reply; stay under N tokens) and the profile facts the planning prompts reuse.

Inputs → outputs:
- `photoMealPrompt({ photoCount, note?, progressive? })` → `PromptText { system, prompt }`.
- `textMealPrompt({ description })`, `labelScanPrompt({ photoCount, note? })`,
  `unitRepairPrompt({ name, grams, note?, withPhoto })` → `PromptText`.
- `compactRetryNote(maxTokens, 'json' | 'prose')` → the line the client appends on a re-ask.
- `kilojouleLine(energyUnit, { replyFieldsInKcal? })` → the kJ line, or `undefined` for kcal readers.
- `NUTRIENT_UNIT_LIST` → one line per storage unit naming every nutrient and extra key in it.
- `FOOD_REPLY_CONTRACT`, `UNIT_RULES`, `PART_RULES`, `MAX_UNITS` (4), `MAX_PARTS` (20) → contract
  text pieces; `profileFacts(profile, today, units)` → the profile lines P03-16 reuses.

Files: created `src/ai/prompts/{contract,food,shared}.ts` and their tests, this note.

Edge cases / failure modes:
- Progressive asked with one photo → plain multi-view text (a single photo cannot show steps); the
  reply's `progressive` is asked to be false. Progressive with two or more → the step rules.
- Blank or spaces-only note → no note paragraph; a note is trimmed and quoted as the person's own
  words, kept separate from our instructions.
- `photoCount` 0 or negative is a caller bug; the prompt still reads (it says "the photo") and the
  client refuses an image request without images (P03-17), so no throw here.
- A typed description is trimmed; blank text is the caller's to refuse (the Describe sheet does).
- Repair grams are written to one decimal (the spec's wording), a dot, no grouping.
- The compact note's budget is a whole number of at least 1 (the settings clamp the cap; we
  round and floor again so a stray 0 or fraction never reaches the text).
- Numbers in prompts never use locale marks: the model reads `1024`, not `1,024` or `1.024`.

Our design differences / decisions:
- Our own keys and prose. The reply keys are the glossary's (`kcal`, `servingGrams`, `units {unit,
  count, gramsEach}`, `parts`, `nutrients {<our keys>}`), read from the parser's constants.
- Every prompt returns `{ system, prompt }`: a short system part (role and answer discipline) the
  client extends with the person's notes for the AI (D-16.24), and the request itself.
- One food prompt family serves one and many photos; the "estimate what is visible, a whole cake
  counts as the whole cake" rule is always present, not only for one photo.
- The 8 sports compounds are asked for inside `nutrients` (where the parser reads them) and only
  when printed or named by the person, else 0. A nutrient the model cannot judge is `null`.
- Label scan (Proposed D-16.62) is the photo request plus one hint: read the printed values and
  report one labelled serving; units only when the label prints a serving unit; no parts. The
  per-100 g label request is v1.x (D29) and not written now.
- The compact re-ask note lives in `shared.ts` (the phase's file table), not `food.ts`: the client
  re-asks for every purpose, prose ones included. (Decision for the lead.)
- No amino-acid sentence: the domain has no keys for them yet (opt-in, later).
- No kJ line on food prompts: their answers are JSON in kcal and never talk to the person.

Tests we will write:
- `contract.test.ts`: the contract names every food, unit and part key and every nutrient and
  extra key; it puts the extras inside `nutrients`; the unit rules forbid gram units and ask for
  count × gramsEach to match the serving weight; the parts cap of 20.
- `food.test.ts`: the photo prompt mentions every key of the contract; progressive text only when
  the flag is set and there are at least two photos; the note appears trimmed and only when not
  blank; the typed prompt asks for one food emoji and carries the description; the label prompt
  is the photo prompt plus the label hint; the repair prompt asks only for `units`, with the name
  and grams to one decimal, and mentions the photo only when one is attached.
- `shared.test.ts`: the kJ line only for kJ readers, with 4.184; the unit list puts every
  nutrient key under its catalogue unit and the extras under grams; the compact note carries the
  token budget, differs for JSON and prose, and never prints a budget below 1.
- `PLATEWISE_REF=/root/reference/fud-ai pnpm check:similarity` green on these files.

Compare checklist (filled after the rewrite; reopened research spec 03 §3.5–3.8 and 01 §3.2
only, since the reference's prompt text stays closed; the rendered prompts were also run through
the similarity check once, in a temporary file, and passed):
- [x] Multi-view rules: one meal, count once, scale and label values first (`src/ai/prompts/food.test.ts
  > photoMealPrompt: several views of one meal > treats every photo as part of one meal and counts
  each food once`, `> prefers readable scale and label figures over a guess, in every mode`,
  `> estimates the amount shown: a whole cake counts as the whole cake`)
- [x] Progressive rules only with the flag and ≥ 2 photos (`food.test.ts > photoMealPrompt: a plate
  built in steps > uses the step rules only when the flag is set and there are at least two
  photos`, `> takes weights from cumulative scale differences and never subtracts doubtful
  readings`)
- [x] The note as context (`food.test.ts > photoMealPrompt: the note > adds the person's note as
  context, trimmed and on one line`, `> leaves the note paragraph out when the note is missing or
  blank`)
- [x] Every contract key in the photo prompt (`food.test.ts > photoMealPrompt: the contract >
  mentions every key of the contract, nutrients and sports compounds included`)
- [x] Output contract: one object, whole kcal, decimal macros, serving grams, units of nutrients,
  extras only when printed or named, null when unknown (`src/ai/prompts/contract.test.ts >
  FOOD_REPLY_CONTRACT: the keys > …` (5 tests), `FOOD_REPLY_CONTRACT: the amounts > …` (3 tests);
  `shared.test.ts > NUTRIENT_UNIT_LIST > …` (3 tests))
- [x] Unit rules and parts rules (`contract.test.ts > UNIT_RULES (R03.16) > …` (4 tests),
  `PART_RULES (R03.14) > …` (3 tests))
- [x] Text variant with one emoji (`food.test.ts > textMealPrompt > …` (2 tests)); label variant
  (`food.test.ts > labelScanPrompt (Proposed D-16.62) > …` (2 tests)); repair request
  (`food.test.ts > unitRepairPrompt (R03.17) > …` (3 tests))
- [x] Compact re-ask with the budget (`src/ai/prompts/shared.test.ts > compactRetryNote (03 §3.8) >
  says the answer was cut off and carries the token budget` and 3 more)
- [x] kJ line only for kJ readers (`shared.test.ts > kilojouleLine (01 §3.2) > gives kcal readers
  nothing, so their prompts stay exactly as they are` and 2 more)
- [x] The fake AI's food answer uses only contract keys (`contract.test.ts > FOOD_REPLY_CONTRACT:
  the keys > covers every key of the fake AI's food answer, so fixture and contract agree`)
- Mutation check: progressive rules with one photo fail 2 tests; a kJ line for kcal readers fails 3.
- Deliberate differences: our keys and prose; `{ system, prompt }` pairs with the notes for the AI
  added by the client (D-16.24); the visible-amount rule on every photo prompt, not only for one
  photo; label scan is the photo request plus a one-labelled-serving hint (Proposed D-16.62) that
  offers a "serving" unit; no kJ line on food prompts.
- Not taken: the per-100 g label request (v1.x, D29), the auto photo-or-label variant, the
  single-food photo variant (the meal prompt covers one photo), the opt-in amino-acid sentence
  (no domain keys yet), the iOS AR scale text and OCR text (out of scope).

## Decisions for the lead

- `compactRetryNote` is in `shared.ts`, not `food.ts`: the client (P03-17) re-asks for every
  purpose, including prose ones, and the phase's file table puts it there.
- Prompts return `{ system, prompt }`; the client appends the notes for the AI to `system`.
- Label scan = the photo request plus a one-paragraph label hint: one labelled serving, a
  "serving" unit at the printed size, other units only when printed, no parts.
- `MAX_UNITS` (4) and `MAX_PARTS` (20) are defined in `contract.ts`; when `parse/units.ts` and
  `parse/parts.ts` land with their own limits, point `contract.ts` at those constants.

## Status

Done (2026-10-27). Created `src/ai/prompts/{shared,contract,food}.ts` and their tests (50 tests),
this note. Nothing changed outside the task's files. The client (P03-17) appends
`compactRetryNote` on a re-ask; the tasks (P03-18) call the four food builders.
