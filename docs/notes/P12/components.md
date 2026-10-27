# Task: shared components (P12-02) · Phase: 12 · Owner: builder (wt-p12s1)

<!-- Save as platewise/docs/notes/P<nn>/<slug>.md. Write everything above "Compare checklist"
BEFORE writing code, in your own words. Never paste or paraphrase the reference line by line. -->

Read (reference @ `10e14b67`): none. The refresh is ours (D-16.90); the reference's components
stay closed. Sources: phase file P12 (row P12-02), `palette-and-themes.md`, the P04 primitive notes,
`src/ui/{primitives,display,inputs}.module.css`, `src/ui/charts/charts.module.css`,
`src/app/{shell,notices}.module.css`, `src/app/TabBar.tsx`, `src/features/home/home.module.css`
(the + button), the before screenshots of `screen-review.md`.

What it does (own words): the shared building blocks get a modern, friendly look on the new
palette, with orange as the hero and calm surfaces around it. Buttons become pills: primary ones a
solid orange pill with white (light) or dark (dark) words, secondary ones a white or charcoal pill
with a hairline, quiet ones orange words. Cards, sheets, dialogs and menus get larger radii and a
soft shadow over a warm hairline, with a little more room inside. The tab bar stays a floating
pill; the selected tab shows an orange capsule behind its icon (a tinted wash, so it reads as a
selection rather than a button) with the icon and the name in orange, and the capsule still slides
from tab to tab. The + button is a solid orange circle. Segmented controls are pill tracks with a
white (or raised charcoal) thumb and the chosen word in orange; switches have a clear grey track
when off and an orange one when on, with a white knob in both. Fields keep their box and focus ring
with the new radius. The gauge's arc and the pillars' fill are orange on an orange wash, while the
numbers inside are in the text colour so the page does not shout; charts stay in the accent. Every
data-ui hook, role, accessible name and element stays as it is: this is CSS only, except where
noted.

Inputs → outputs: tokens.css → the CSS modules above. No props, hooks or markup change.

Files: `src/ui/primitives.module.css`, `src/ui/display.module.css`, `src/ui/inputs.module.css`,
`src/app/shell.module.css`; new tokens `--well` (the segmented control's track), `--track` and
`--knob` (the switch) in tokens.css, with their floors in `contrast.test.ts`. The charts, the
notices and the + button needed no CSS change: they draw from the tokens.

Edge cases / failure modes:
- The light orange is 4.5:1 on white and less on its own wash: orange words never sit on the wash.
  The tab bar's capsule is behind the icon only (an icon needs 3:1, which the wash keeps), and the
  name sits below it on the bar's own surface.
- Focus rings: every control keeps its outline on `:focus-visible` (the a11y spec walks them all).
- Reduced motion: the capsule's slide and every transition use the motion tokens, which drop to
  1 ms.
- Large text: sizes stay in rem and tokens; the tab bar keeps its height, and its icon row is
  anchored at the top so the capsule stays behind the icon whatever the label's size.
- Right-to-left: logical properties only, as before.
- The switch knob is the same colour on and off, so the state reads from the track (orange vs a
  grey that is at least 3:1 on the card) and the knob's side.

Our design differences / decisions:
- Buttons are pills in every variant (one shape language with the tab bar, chips and steppers).
- Big numbers (gauge, pillar values) use the text colour; orange is kept for the marks, the status
  line, links, selections and actions.
- Three new colour tokens: `--well` (a recessed fill under a segmented control: a warm light grey
  on light, a charcoal below the page on dark, so the raised thumb reads as raised in both),
  `--track`
  (an off switch's track, ≥ 3:1 on the card) and `--knob` (the switch's knob).

Tests we will write:
- Unit tests of `src/ui` and the shell stay as they are (no markup change); run them.
- `contrast.test.ts`: text ≥ 7 and muted text ≥ 4.5 on `--well`; `--track` on `--card` ≥ 3 and
  `--knob` on `--track` ≥ 3, every theme × preset; `--knob` on `--accent` is not a floor (the on
  state reads from the track).
- The a11y spec (axe, focus rings, reduced motion) in both themes.

Compare checklist (filled after the rewrite; no reference files):
- [x] Unit tests of `src/ui` and `src/app` unchanged and green (one default-accent line in
      `src/app/ThemeProvider.test.tsx`, see `palette-and-themes.md`)
- [x] No colour literal outside tokens.css (`grep -rnE '#[0-9a-f]{3,8}|rgba?\(|hsla?\(' src
      --include=*.css` finds tokens.css only)
- [x] New floors (`src/ui/contrast.test.ts > token contrast sweep > meets every floor`)
- [x] Axe, focus rings and reduced motion in both themes (`e2e/a11y.spec.ts`, see Status)
- Deliberate differences: our own component look (D-16.90).
- Not taken: tinted shadows per accent; a solid orange tab indicator (too loud next to the +).

## Per component

- Buttons (`primitives.module.css`): every variant is a pill with 20 px sides. Primary: solid
  accent, accent ink, a soft card shadow. Secondary: raised surface and hairline. Quiet: accent
  words, no shadow. Danger: as before, now a pill. A full-width (block) button is 48 px tall.
- Cards: radius 22 (token), the hairline and the new soft shadow; padding unchanged.
- Sheets: radius 28 (token); the grabber is 40 × 4 in the track grey at 45 % opacity (it was a
  barely visible hairline on white); the title is bold. The bar's two sides keep their full width
  (`minmax(max-content, 1fr)`), so a pair of actions (Fit check and Log) no longer breaks a word;
  the title stays centred whenever both sides fit.
- Dialogs, menus, toasts: new radii and shadows through the tokens; a menu row's icon is orange.
- Gauge: the arc is orange on its wash; the big number is in the text colour, the status line
  ("… left") stays orange.
- Pillars: the value above each tube is in the text colour; the tube is orange on its wash.
- Progress bar: 6 px instead of 4.
- Segmented control: a pill well (`--well`, outlined by an inset hairline so it shows on any
  surface) with a raised pill thumb; the chosen word is orange (it sits on the raised surface,
  never on the wash).
- Switch: 52 × 32 track, grey (`--track`) when off and orange when on; a 26 px knob (`--knob`)
  with a soft shadow travels 20 px.
- Tab bar (`shell.module.css`): 68 px tall; the selected tab has a 56 × 32 orange-wash capsule
  behind its icon, sliding between tabs; icon and name orange, the name on the bar's surface;
  the icon row is anchored to the top of the tab and the update dot to the icon.
- Screen titles: a touch tighter letter spacing.
- + button, charts, notices: no CSS change; they take the new orange, radii and shadows from the
  tokens.

## Status

Done (2026-10-27). CSS only: no markup, hook, role or accessible name changed. Two notes for
the lead: the button's transition list stays `background-color, transform` (the a11y spec reads
the Get started button's transition durations), so the primary's shadow does not animate; the
tab bar grew from 64 to 68 px, and everything that clears it (content padding, the + button)
reads the same variable.
