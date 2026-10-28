# Task: the chat box above the keyboard (P14 keyboard fix) · Phase: 14 · Owner: builder (wt-p14s2)

Read (reference @ `10e14b67`): `android/app/src/main/AndroidManifest.xml` (the main activity's
soft input mode) and `A/ui/coach/CoachScreen.kt` (how the chat column is lifted: the bottom inset
is the larger of the keyboard and the room kept for the floating bar). Behaviour only; nothing
taken. Also read: Capacitor 7.6.9's own edge-to-edge code
(`node_modules/@capacitor/android/capacitor/src/main/java/com/getcapacitor/CapacitorWebView.java`
`edgeToEdgeHandler`, `Bridge.java` where it is called, `CapConfig.java` for the setting, the
`capacitor_bridge_layout_main.xml` layout), our `MainActivity.kt`, `AndroidManifest.xml`,
`capacitor.config.json`, `src/features/coach/{keyboard.ts,CoachPage.tsx,coach.module.css,followEnd.ts}`,
`src/app/{App.tsx,TabBar.tsx,shell.module.css}`, `src/ui/{Sheet.tsx,primitives.module.css}`, the
four sheets (`ManualSheet`, `DescribeSheet`, `CustomReminders`, `ReviewSheet`: all on the shared
`Sheet`), `e2e/coach.spec.ts`, `e2e/reminders.spec.ts`, `docs/notes/P13/coach-chat-ui.md`.

What it does (own words): the owner, 2026-10-28: when the person chats, the keyboard hides the
chat box; it must sit on top of the keyboard. Cause: the app targets API 35, so from Android 15
its window is edge to edge and is no longer resized for the keyboard; the main activity also had
no soft input mode, and Capacitor's edge-to-edge handler (`"auto"`) gives the WebView margins for
the system bars only. The WebView kept its full height under the keyboard, the visual viewport did
not shrink, and the Coach's keyboard inset (P13) read 0. Now the WebView ends at the top of the
keyboard on every Android version the app runs on (8 to 16), so the page is simply shorter while
the keyboard is up. On top of that, while the keyboard is open the tab bar and Home's + button
step aside, so the composer sits right on the keyboard, and a field that gets covered when the
view shrinks is scrolled back into sight. The same holds in Chrome on a phone, where the keyboard
shrinks only the visual viewport.

Inputs → outputs:
- Native: the window insets (system bars, display cutout, keyboard) → the WebView's four margins:
  top and sides from the bars and cutout, bottom the larger of the keyboard and the bars.
- `src/app/useKeyboardOpen.ts`: `isTextField(element)` (pure: a field that takes typing),
  `keyboardOpen(focused, sample)` (pure: a text field has focus and either the layout viewport is
  more than 150 px shorter than the tallest it has been at this width, or the visual viewport is
  more than 150 px shorter than the layout viewport), `useKeyboardOpen(viewport?, layout?)` →
  `boolean`, which also scrolls the focused field into sight (nearest edge) when the keyboard opens
  or the view's height changes under it.
- The shell: `data-keyboard="open"` on `.shell` → CSS hides the tab bar and Home's + button and
  stops keeping room for the bar; the Coach's page then runs down to the keyboard.

Files: changed `android/app/src/main/java/app/platewise/android/MainActivity.kt`,
`android/app/src/main/AndroidManifest.xml` (the main activity's `windowSoftInputMode` only),
`capacitor.config.json` (`adjustMarginsForEdgeToEdge`), `src/features/coach/keyboard.ts` (header
comment), `src/app/App.tsx` (the attribute), `src/app/shell.module.css`,
`src/features/home/home.module.css` (the + button's hiding rule),
`src/features/coach/coach.module.css` (the page's height with the bar gone); created
`src/app/useKeyboardOpen.ts`, `src/app/useKeyboardOpen.test.ts`, `e2e/keyboard.spec.ts`, this note.

Edge cases / failure modes:
- Android 8 to 14 (not edge to edge): `adjustResize` makes the window's own content frame take
  the keyboard as padding and consume the insets, so our listener sees zeros and changes nothing;
  the WebView is resized by the system as before.
- Android 15 and 16 (edge to edge, enforced on 16): the insets reach the WebView unconsumed; the
  listener applies them and consumes them, so the page's `env(safe-area-inset-*)` stays 0 and
  nothing is padded twice.
- A rotation changes the width and drops the height a lot: the tallest height is kept per width, so
  turning the phone is never taken for a keyboard.
- Mobile Chrome's address bar coming and going changes the height by about 56 px: under 150 px.
- Pinch zoom shrinks the visual viewport's CSS height: the visible height is measured as
  `height × scale`, so zooming is not a keyboard.
- The keyboard closed with the back button while the field keeps the focus: the height comes back,
  so it reads closed. The focus left (a tap elsewhere): closed at once.
- Focus moving from one field to the next: `focusout`'s `relatedTarget` is the next field, so the
  bar does not flash back in between.
- Checkboxes, switches, buttons, range, colour, file and the date and time pickers do not open a
  keyboard: not text fields. A read-only or disabled field neither.
- No `visualViewport`: only the layout-height rule applies.
- The keyboard's slide is not followed frame by frame: the WebView jumps to its new height once
  (resizing a WebView on every frame of the slide would be costly).

Our design differences / decisions:
- We take over Capacitor's edge-to-edge handling (`adjustMarginsForEdgeToEdge: "disable"` and one
  listener of our own) instead of adding a second listener next to Capacitor's: its listener sits
  on the WebView itself, takes the bars only and consumes the insets, so a listener on the
  container would have to subtract the navigation bar Capacitor already applied, two places doing
  arithmetic on the same edge. Ours does the same top and sides and adds the keyboard.
- The listener sets margins on the WebView (as Capacitor's did) rather than padding on its
  container: the same view, the same layout, only the bottom number changes.
- While the keyboard is open the tab bar and Home's + button hide (owner's request); the reference
  keeps its bar under the keyboard.
- One shared hook in the shell (not per sheet) keeps the focused field in sight: every sheet and
  page with a field gets it, and the sheets need no change.
- 150 px for "keyboard open" (the task's figure); the Coach's own inset keeps its 120 px.

Tests we will write:
- `src/app/useKeyboardOpen.test.ts`: `isTextField` (text, textarea, number, search; not checkbox,
  button, range, date, time, read-only, disabled); `keyboardOpen` (no focus; layout drop over and
  at 150; visual drop over and at 150; nothing without a visual viewport); the hook: opens when the
  layout height drops with a field focused and closes when it comes back; the same through the
  visual viewport; nothing without focus; pinch zoom is not a keyboard; a rotation is not a
  keyboard; closes when the focus leaves, stays open when it moves to the next field; scrolls the
  focused field into sight when it opens and when the height changes under it, not on every
  focus; stops listening when unmounted.
- `e2e/keyboard.spec.ts`: Coach: the composer focused, the page 300 px shorter → the composer's box
  is inside the viewport and the tab bar is hidden; the size back → the bar is back. The same for
  the manual entry sheet's name field, and Home's + button.
- Android: `pnpm android:apk` compiles; the behaviour itself needs the owner's phone.

Compare checklist (filled after the rewrite; reopened the reference's
`android/app/src/main/AndroidManifest.xml` (the main activity), `A/ui/coach/CoachScreen.kt` (the
column's bottom inset) and `A/ui/home/ContextNoteSheet.kt` (a sheet lifted by the keyboard), and
Capacitor's `CapacitorWebView.edgeToEdgeHandler`):
- [x] The main activity resizes for the keyboard (the reference: `adjustResize`; ours the same, and
  the insets handled in `MainActivity.kt` because from Android 15 that alone no longer resizes an
  edge-to-edge window) (`pnpm android:apk` builds; `aapt dump xmltree` of the APK shows
  `windowSoftInputMode` = adjustResize (0x10); the behaviour itself: the owner's phone)
- [x] The chat's bottom edge is the larger of the keyboard and the room kept for the bar (the
  reference's `max(ime, rest clearance)`): natively the WebView's bottom margin is
  `max(keyboard, navigation bar)`; on the page the composer sits on the keyboard with the bar away
  and above the bar without the keyboard (`e2e/keyboard.spec.ts > the on-screen keyboard (P14) >
  puts the Coach composer right on the keyboard, with the tab bar away until it closes`)
- [x] A sheet's field stays above the keyboard (the reference lifts its sheets with the keyboard):
  the sheet ends at the keyboard and the focused field is scrolled into sight
  (`e2e/keyboard.spec.ts > … > keeps the manual entry fields in view over the keyboard, with the
  tab bar and + away`, whose small-phone step fails without the scroll; `src/app/useKeyboardOpen.test.ts
  > useKeyboardOpen (P14) > brings the focused field into sight when the keyboard opens and when the
  view changes under it, not on every focus`)
- [x] "Keyboard open" is told apart from browser chrome, zoom, a turn of the phone and a window
  resized by hand, and needs a field that takes typing (`src/app/useKeyboardOpen.test.ts >
  isTextField (P14) > *`, `> keyboardOpen (P14) > *`, `> useKeyboardOpen (P14) > *`)
- [x] Capacitor's handler and ours do not both run: the config turns Capacitor's off
  (`capacitor.config.json`), ours covers the same top and sides (read against
  `CapacitorWebView.java`; on a device: the owner's phone)
- Gaps found on reopening: the reference animates the inset with the keyboard's slide (its
  inset padding follows the animation); ours jumps once (not taken, below).
- Deliberate differences: the tab bar and Home's + button hide while the keyboard is open (the
  owner's request; the reference's bar stays under the keyboard); one shared hook keeps the
  focused field in sight for every sheet and page instead of a per-sheet lift.
- Not taken: following the keyboard's slide frame by frame (`WindowInsetsAnimationCompat`):
  resizing the WebView on every frame is costly, and the page re-lays out once anyway.

## Decisions for the lead

- Edge to edge is ours now: `adjustMarginsForEdgeToEdge` is `"disable"` and `MainActivity` sets
  the WebView's margins from the insets on every Android version (zeros up to Android 14, where the
  window's content frame already took them). Why not keep Capacitor's: its listener sits on the
  WebView itself, knows only the bars and consumes the insets, so a second listener on the
  container would have to subtract the navigation bar Capacitor already applied; one listener
  with the whole rule is simpler to follow and to change.
- "Keyboard open" needs a focused field that takes typing and more than 150 px less height than
  the view's full height (or than the layout viewport, for the visual viewport); the full height
  is taken afresh when the width changes or the view changes size with no field focused.
- The shell's content area keeps `--space-2` at its bottom while the keyboard is open (instead
  of the bar's room), so a page ends right on the keyboard and the Coach's page fits exactly.
- Follow-up, not made (outside this task's files): `interactive-widget=resizes-content` in
  `index.html`'s viewport meta would make Chrome on a phone resize the page for the keyboard as
  the app's WebView now does, one model for both, and the sheets would end at the keyboard in
  Chrome too. Today Chrome draws the keyboard over the page; the hook reads that from the visual
  viewport and the Coach keeps its P13 inset. Worth a check on a phone first: whether `dvh`
  follows the resize there decides whether the Coach page needs its inset at all.
- Only the owner's phone can show: that the WebView now ends at the top of the keyboard on
  Android 15/16 (and still on 8 to 14 with `adjustResize`), that the status and navigation bar
  areas keep the charcoal page colour, that the composer sits right on the keyboard with the tab
  bar gone, and how the jump (no slide animation) feels. Also untested without a device: a
  rotation with the keyboard up (the new width is taken as a new full height, so the bar may show
  above the keyboard until it is closed and opened again).

## Status

Done (2026-10-28). Lines outside the task's named files: `src/app/App.tsx` (the attribute on the
shell, three lines), `src/features/home/home.module.css` (the + button's hiding rule),
`src/features/coach/coach.module.css` (the page's height with the bar gone). Handed on: the
on-device check above, to the owner.
