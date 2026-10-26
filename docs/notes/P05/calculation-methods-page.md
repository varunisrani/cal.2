# Task: calculation methods page (P05-13) · Phase: 05 · Owner: builder (wt-p05s3a, slice S3a)

Read (reference @ `10e14b67`): `I/Views/CalculationMethodsView.swift` (the list of topics and the
sources it names only; no sentence taken). Research spec `01-profile-goals.md` §3.3 (formulas
and the "Calculation-methods page" item), §3.4 (reachable from Plan ready), §3.6 (what a plan
request carries); `src/domain/forecast/evidence.ts` header (what the pack never reads, R01.16).

What it does (own words): one page that explains where the plan's numbers come from, written by
us: how resting burn is estimated (Mifflin-St Jeor normally, Katch-McArdle when body fat is
known), how the activity level scales it to a daily burn (the six multipliers, with each level's
protein rate), how a weekly pace becomes a daily kcal change (7 700 kcal per kg, about 3 500 per
lb; the three paces and what they cost a day), how protein, fat and carbs are set (protein by
activity on full body weight, a little more while losing; fat per kg; carbs fill what is left at
4 kcal a gram), that the nutrient values of meals are estimates from the person's AI, what the AI
gets when it builds or tunes the plan (numbers and dates only) and what it never gets (food
names, notes, photos, ingredients), the sources, and a not-medical-advice note (the equations are
typically within about 10 %; ask a professional when pregnant or breastfeeding, under 18, or
living with a medical condition or an eating disorder). Every number on the page is read from
the domain, so the page cannot drift from the maths the app runs.

Inputs → outputs: none (static page) → a section list; `headingLevel` 2 under the Settings
category title, 3 inside a sheet whose title is the h2.

Files: created `src/features/about/MethodsPage.tsx`, `MethodsPage.test.tsx`,
`src/features/about/methodsFigures.ts` (the numbers, read from the domain),
`src/features/about/about.module.css`, `src/i18n/en/about.ts`; changed
`src/features/settings/registry.ts` (the `methods` record in the `info` group), `src/i18n/en.ts`
(the `about` line).

Edge cases / failure modes:
- The BMR coefficients are not exported constants in `formulas.ts` (they sit inside `bmr`); the
  page reads them by evaluating `bmr` at probe inputs (zero weight and height, age 0 and 1, body
  fat 0) and rounds away float noise, and a test checks the shown equation reproduces `bmr` for
  real profiles. So a change to the formula changes the page.
- Numbers in copy go through `t()` params, so they follow the person's locale (1,465 vs 1.465 in
  de-DE is the locale's decimal mark, not ours).
- External links open in a new tab with `noopener`; the page works offline except for them.

Our design differences / decisions:
- Our own sections, headings, sentences and order; the multiplier table shows our level names
  (from the onboarding catalogue) with protein next to each multiplier.
- Sources cited as author, year, title and venue with a DOI link where one exists, in our own
  format: Mifflin et al. 1990; McArdle, Katch and Katch (textbook); FAO/WHO/UNU 2004; Wishnofsky
  1958; Hall et al. 2011; Morton et al. 2018; the Institute of Medicine DRI report (2005).
- A line for kJ readers: the maths runs in kcal, 1 kcal = 4.184 kJ (from `KJ_PER_KCAL`).
- No measured-energy (Energy Burn) or workout wording: those features are not in v1.

Tests we will write (`MethodsPage.test.tsx`):
- every activity multiplier and protein rate on the page equals `ACTIVITY_FACTORS` (looked up,
  not typed); 7 700 kcal per kg, about 3 500 per lb, the pace examples from `paceAdjustment`.
- the equation coefficients read from the domain reproduce `bmr` for several profiles.
- what the AI gets and never gets is listed; the not-medical-advice note is there.
- the sources link out with `noopener`.
- reachable from Settings: the registry's `methods` record shows the page under `#/settings/methods`
  (heading levels 1 then 2), and from Plan ready (sheet; tested in `PlanReady.test.tsx`).
- `pnpm check:similarity` green on the copy.

Compare checklist (filled after the rewrite; reopened `CalculationMethodsView.swift`):
- [x] Two BMR equations and when each is used (tested in `MethodsPage.test.tsx` > MethodsPage >
  writes both resting-burn equations with coefficients that reproduce the domain’s bmr)
- [x] Multiplier table (`MethodsPage.test.tsx` > MethodsPage > lists every activity multiplier and
  protein rate from the domain table)
- [x] No number copied into the page (`MethodsPage.test.tsx` > MethodsPage > follows the domain
  when its numbers change, so none is copied into the page)
- [x] 7 700 kcal/kg, ≈3 500 kcal/lb, pace ÷ 7 (`MethodsPage.test.tsx` > MethodsPage > explains the
  pace maths with the domain’s energy per kg and each pace’s daily change)
- [x] Protein 0.8–2.2 g/kg, fat 0.6 g/kg, carbs the rest (`MethodsPage.test.tsx` > MethodsPage >
  explains protein, fat and carbs with the domain’s rates)
- [x] Meal values are AI estimates; what the AI receives and never receives (`MethodsPage.test.tsx`
  > MethodsPage > says what the AI gets for the plan and what it never gets)
- [x] Citations (`MethodsPage.test.tsx` > MethodsPage > cites its sources with links that open
  safely in a new tab)
- [x] Not-medical-advice note (`MethodsPage.test.tsx` > MethodsPage > ends with the
  not-medical-advice note)
- [x] Reachable from Plan ready and Settings (`PlanReady.test.tsx` > PlanReady > opens the
  calculation methods in a sheet and closes it with Done; `MethodsPage.test.tsx` > MethodsPage >
  is registered as an About page in Settings at #/settings/methods; > puts its headings one level
  under a sheet title when asked)
- Deliberate differences: our own text and order; protein rates beside the multipliers; a kJ
  line; DOI links; no Energy Burn / workout / exercise-name wording (not in v1); no "Source"
  sub-cards per formula (one sources list).
- Not taken: the store-guideline framing, the per-meal source link to a food database.

## Decisions for the lead

- The domain keeps the BMR coefficients inline in `bmr()`; exporting them as named constants from
  `src/domain/goals/formulas.ts` would let `methodsFigures.ts` read them directly instead of
  probing `bmr`.

## Status

Done (2026-10-26). Page, figures, partition and Settings record with tests. The lead adds
`about` to `src/i18n/en.ts` at landing (done in this worktree: the import and the entry).
