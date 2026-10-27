# Task: Composer and photo attachment (P08-11) · Phase: 08 · Owner: builder (wt-p08s5, slice S5)

Read (reference @ `10e14b67`): `A/ui/coach/CoachScreen.kt` (`InputBar`, `CoachMediaActions`,
`SendButton`, the photo picker and camera launchers, `sendCurrentDraft`), `I/Views/ChatView.swift`
(`inputArea`, `attachmentPreview`, `inputBar`, `attachMenu`, `sendButton`, `canSend`, `send`, the
photo picker's error path). Research spec `04-coach.md` §3.2 (composer and photo pipeline), §3.6
(send guard), §5 (web photo inputs, Enter and Shift+Enter, `visualViewport`); decisions D-16.33,
D-16.85. The reference has no tests for the composer.

What it does (own words): the bar at the bottom of the Coach tab where the person writes. A
rounded field holds the question and grows with it up to five lines, then scrolls. An attach
button opens a small menu: Camera (the device camera, rear-facing) or Photo library. One photo can
go with a message: it shows as a small thumbnail with a remove button; picking another replaces
it. Send is on when no reply is pending and there is text (not just spaces) or a photo. With a
physical keyboard Enter sends and Shift+Enter starts a new line; on a touch keyboard Enter is a new
line and the round Send button sends. While a reply is pending the attach button and Send are off
(typing stays possible). Sending clears the field and the photo; when the photo turns out to be
unreadable nothing is sent, a short message says so, and the draft comes back.

Inputs → outputs:
- `Composer({ draft, onDraftChange, pending, onSend, photoProblem, fieldRef })`: `draft` is
  `{ text, photo }` held by the page; `onSend(text, photo?)` is called with the draft as typed.
- The page clears the draft, calls `coachSession.send(text, photo)` and, on `photoUnreadable` (or
  `ignored`), puts the draft back and sets `photoProblem`.

Files: created `src/features/coach/Composer.tsx`, `src/features/coach/Composer.test.tsx`; styles in
`src/features/coach/coach.module.css`; words in `src/i18n/en/coach.ts`. Shared: `src/ui/Menu.tsx`
gains an optional `disabled` (the trigger cannot open the menu while it is set).

Edge cases / failure modes:
- Whitespace only: Send off; Enter does nothing (no new line on a physical keyboard either).
- A photo alone: Send on; the session stores its fixed short question (P08-09).
- The same file picked twice: the input is cleared after each pick, so it still registers.
- A pick that is cancelled (no file): the draft is unchanged.
- Enter while an IME composition is open: left to the IME.
- Pending starts with the menu open (a chip tap outside closes it): the trigger turns off.
- `photoUnreadable` after a chip send: the photo comes back, the typed text was never taken.
- Something typed while the unreadable photo was being checked: that text stays; the old text comes
  back only into an empty field, and the photo only when no other photo was attached meanwhile.

Our design differences / decisions:
- One attach button with a menu (as iOS) using our shared `Menu` (placement above), the two
  hidden file inputs as in the capture sheet: `accept="image/*"`, the camera one with
  `capture="environment"`.
- The photo is kept as picked; no re-encode on pick (Android made an 1800 px copy). The session
  makes the model copy and the thumbnail when it sends (P08-09, P03-10).
- The thumbnail sits in a row inside the capsule above the field with a round remove button.
- "Physical keyboard" is read as `(any-pointer: fine)` at the time of the key press (a mouse or
  trackpad is present); touch-only devices keep Enter as a new line.
- An unreadable photo shows our short message in the composer (`role="alert"`); it goes away on
  the next pick, remove or send.
- The trailing control is always Send (the mic is a later phase); our `chevronUp` glyph on the
  accent fill.
- Placeholder and labels in our words.

Decisions for the lead:
- `src/ui/Menu.tsx`: optional `disabled` prop (shared, additive, 10 lines: the trigger is off and an
  open menu closes).
- Physical keyboard = `(any-pointer: fine)`; change in one place if the lead prefers another test.

Tests we will write (`Composer.test.tsx`):
- Send off for empty and whitespace-only text; on for text; off while pending.
- A photo alone turns Send on and sends with empty text (ACC-I2-1).
- Enter sends with a fine pointer; Shift+Enter inserts a new line and does not send (ACC-I2-2);
  Enter on a touch-only device inserts a new line.
- A second photo replaces the first; remove clears it; the thumbnail shows the picked photo.
- Camera input has `capture="environment"`, the library input has none; both accept images.
- Pending turns the attach button and Send off.
- The unreadable-photo message shows when asked; the page restores the draft (in
  `CoachPage.test.tsx`).

Compare checklist (filled after the rewrite; reopened `CoachScreen.kt` `InputBar`,
`CoachMediaActions`, `SendButton`, `sendCurrentDraft`; `ChatView.swift` `inputArea`,
`attachmentPreview`, `inputBar`, `attachMenu`, `sendButton`, `canSend`, `send`):
- [x] Rounded field that grows to five lines, with a placeholder (the sizing tested in
  `src/features/coach/Composer.test.tsx` > Composer: growing with the text; the five-line cap is
  the stylesheet's `max-block-size: 5lh`, seen in a real browser at 134 px for seven lines)
- [x] Camera (`capture="environment"`) and Photo library from one attach control (tested in
  `src/features/coach/Composer.test.tsx` > Composer: the photo > offers Camera and Photo library…)
- [x] One photo with a thumbnail and a remove button; a new pick replaces it; the attach glyph
  changes while a photo waits (tested in `src/features/coach/Composer.test.tsx` > Composer: the
  photo)
- [x] `canSend`: not pending and words or a photo (tested in `src/features/coach/Composer.test.tsx`
  > canSend and > Composer: Send (P08-11), ACC-I2-1)
- [x] Enter sends, Shift+Enter adds a line with a physical keyboard; Enter is a new line on touch
  (tested in `src/features/coach/Composer.test.tsx` > Composer: keys, ACC-I2-2)
- [x] Attach off while pending (tested in `src/features/coach/Composer.test.tsx` > Composer: while
  a reply is pending)
- [x] Sending clears the field; an unreadable photo sends nothing, says so and keeps the draft (as
  iOS) (tested in `src/features/coach/CoachPage.test.tsx` > CoachPage: conversation > sends the
  typed words… and > puts the draft back and says so when the photo could not be read)
- Deliberate differences: one menu-style attach control on every device (iOS), with our glyphs;
  the photo kept as picked (no 1800 px re-encode on pick, the session makes both copies on send);
  the thumbnail inside the capsule (as Android) with our size; Send is always the trailing control
  (the mic is a later phase) and is greyed when it cannot send; the keyboard stays up after a send
  (as iOS; Android hides it); "physical keyboard" read as `(any-pointer: fine)`.
- Not taken: voice input and the recording indicator (later phase); the in-app camera dialog and
  the camera permission prompt (the browser's file input with `capture` asks for itself); iOS's
  "camera not available" message (a browser without a camera opens the file picker instead).

## Status

Done (2026-10-27). Files: `src/features/coach/Composer.tsx`, `src/features/coach/Composer.test.tsx`;
styles in `coach.module.css`, words in `src/i18n/en/coach.ts`. Shared: `src/ui/Menu.tsx` gains an
optional `disabled` (the trigger is off and an open menu closes; 10 lines). Hooks for P08-14:
`coach.input`, `coach.send`, `coach.attach` (rows `coach.attach.camera`, `coach.attach.library`),
the hidden inputs `coach.camera` and `coach.library` (for `setInputFiles`), `coach.preview`,
`coach.preview.remove`, `coach.photoProblem`.
