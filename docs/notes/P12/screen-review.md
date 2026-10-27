# Task: screen review (P12-04) · Phase: 12 · Owner: builder (wt-p12s1)

<!-- Save as platewise/docs/notes/P<nn>/<slug>.md. Write everything above "Compare checklist"
BEFORE writing code, in your own words. Never paste or paraphrase the reference line by line. -->

Read (reference @ `10e14b67`): none. The review looks at our own screens on the new palette.
Sources: phase file P12 (row P12-04), `e2e/a11y.spec.ts` (how it onboards, logs water and a fast),
`e2e/logging.spec.ts` (Describe → review → Log), `e2e/support.ts`, `playwright.config.ts` and
`e2e/fake-ai/` (how the fake AI and the preview server start).

What it does (own words): a small Playwright script outside the repo takes the same phone-size
screenshots before and after the redesign, so the change can be judged screen by screen in both
themes, and what the after set shows wrong is fixed in the feature CSS modules with tokens only.
The script builds nothing: it serves the worktree's `dist/` with `vite preview` on port 4186,
starts the e2e fake AI on 4336, and drives a Pixel 7 profile with reduced motion and a fixed clock
(Tuesday 2026-10-27 08:30 UTC, as the a11y spec). It onboards on the defaults with the Custom
provider, turns water and fasting on, describes "two eggs and toast" and logs the review, logs a
glass of water, starts a fast, asks the Coach one question, and photographs each screen in light
and in dark (appearance System; the device scheme is switched, as the a11y spec does).

Inputs → outputs: a built `dist/` → PNGs in
`/tmp/claude-0/-home-user-cal-2/82b7eac2-eae5-54f3-b6f6-4c688abdda05/scratchpad/p12-shots/before/`
(from a build of 109c5b3: `git archive 109c5b3` into the scratchpad, the worktree's
`node_modules` linked, `pnpm build`, the script run there) and `…/after/` (this worktree after
the change, the same script).

Files: the script `…/scratchpad/p12-shots/shots.mts` (outside the repo); feature
`*.module.css` files for the fixes (listed below).

Edge cases / failure modes:
- A full-page screenshot draws the fixed tab bar in the middle of the page and lets the week bar
  scroll to another week while the viewport grows; the script takes viewport shots instead, one
  at the top and one scrolled to the end.
- A toast or an animation caught mid-way: reduced motion, `animations: 'disabled'`, and waiting for
  the toast to leave before Home is taken.
- The review sheet is photographed once its name field holds the AI's answer.
- Layout faults a picture can hide: after each screen the script also lists sideways overflow
  (the page wider than the screen, or a vertical scroller such as a sheet body whose content is
  wider than it).

Our design differences / decisions:
- Fixes use tokens only and stay in feature CSS modules; no markup or hook changes.

Tests we will write: none new; the e2e and a11y suites must stay green.

Compare checklist (filled after the review; no reference files):
- [x] Before and after sets taken: 18 screens × 2 themes each (paths below)
- [x] Findings fixed or listed as follow-ups (below)
- [x] `pnpm e2e` green, a11y spec included, both themes (see Status)

## Screens

Folder:
`/tmp/claude-0/-home-user-cal-2/82b7eac2-eae5-54f3-b6f6-4c688abdda05/scratchpad/p12-shots/`,
script `shots.mts` there. Each screen is `<name>-light.png` and `<name>-dark.png` in `before/`
and in `after/` (Pixel 7, 1082 × 2202):

| Name | Screen |
|---|---|
| `01-welcome` | Welcome |
| `02-wizard-activity` | a wizard step: activity (a list of choices) |
| `02b-wizard-body` | a wizard step: height and weight (segmented control, wheels) |
| `02c-wizard-plan-ready` | Plan ready |
| `03-home` | Home with a food, water and a running fast (top) |
| `03b-home-diary` | the same, scrolled to the diary |
| `04-add-menu` | the + menu |
| `05-food-review` | the food review sheet (Describe "two eggs and toast") |
| `05b-manual-sheet` | Enter manually (extra) |
| `05c-start-fast` | Start fast (extra) |
| `06-progress` | Progress (top) |
| `06b-progress-lower` | Progress, scrolled to the end |
| `06c-log-weight` | Log weight (extra) |
| `07a-coach-empty` | the Coach, empty |
| `07-coach-answer` | the Coach with an answer in Markdown |
| `08-settings` | the Settings hub |
| `09-settings-app` | Settings › App settings: appearance and accent |
| `09b-settings-app-lower` | the same, scrolled: switch, segmented units, links |

Findings on the after set, and what was done (fixes in feature CSS modules with tokens only,
except the sheet bar, which is the shared `src/ui` sheet):

1. The food review sheet was wider than the screen (before and after): the name field, the cards
   and the values ran off the right edge and the sheet scrolled sideways (the overflow probe:
   sheet body 484 px in 412). The amount field's text input asked for its default width of about
   20 characters, and the review's single grid column grew to fit it. Fixed in
   `src/features/log/review/review.module.css`: the body is one `minmax(0, 1fr)` column and the
   amount input has no width of its own (it fills what is left).
2. The review's toolbar broke "Log" into "Lo g" beside Fit check (before and after; the wider pill
   made it a little worse). Fixed in the sheet bar (`src/ui/primitives.module.css`): each side
   keeps its whole width and the title gives way.
3. Seven accents in three columns left Ink alone on a third row: four columns on a phone (four,
   then three), seven in a row from 30rem (`appSettings.module.css`).
4. The dark theme's orange wash read a muddy brown at 18 %: 15 % for Orange (token).
5. Orange words on the orange wash are below 4.5:1 on light (3.81): the tab bar's name moved off
   the wash (`components.md`); the pillar picker's order numbers became solid orange with the
   accent's ink (`home/nutrients.module.css`). Export's chosen chips drew the accent's ink on the
   wash (white on pale orange on light, nearly invisible; true for every light preset before):
   now a solid accent pill (`settings/data/data.module.css`).
6. Empty radio rings (onboarding choices, diary selection) used the hairline colour, 1.3:1 on a
   white card: they use the switch's track grey now, 3.78:1 (`onboarding/onboarding.module.css`,
   `home/selection.module.css`).
7. The first dark well equalled the page colour, so Progress's range control (on the page, not
   in a card) lost its track: the dark well is now a recess below the page (`#0c0c0c`) and every
   well has an inset hairline (`src/ui/inputs.module.css`).
8. The e2e run caught one change of the refresh itself: a third transition on buttons (the
   shadow) changed the Get started button's transition list that the reduced-motion test reads;
   the shadow transition was dropped (`components.md`).

Seen and left:
- The Coach's suggestion chips scroll sideways on purpose; the overflow probe lists them.
- Light sheets show a 1 px grey edge at the right in the screenshots, before and after (most
  likely the sheet body's scroll bar in Chromium's headless shell); left for a device check.
- Dark washes stay warm by nature (orange at 15 % over charcoal); lower would lose the tracks.
- Health Connect's page exists only in the Android app; it was not photographed (the web build
  hides it).

## Status

Done (2026-10-27). Both sets taken (36 PNGs each); the after set was taken last, from the final
build. Checks on this worktree: see the builder's report (unit, lint, format, types, clean-room,
build, bundle, e2e with the a11y spec in both themes).
