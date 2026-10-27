# Task: the Coach chat that is easy to use (P13 S4, Goal item 2) · Phase: 13 · Owner: builder (wt-p13s4)

Read (reference @ `10e14b67`): `A/ui/coach/CoachScreen.kt` (how the list follows the newest
message and the sending state, the keyboard lift with the IME inset, the drag that hides the
keyboard, the chips row) and `I/Views/ChatView.swift` (`ScrollViewReader` anchoring on the message
count, on sending and on focus; the field's line limit). Behaviour only; nothing taken. The
reference always jumps to the end; it has no "jump to latest". Also read: the P13 phase file (Goal
item 2), `docs/notes/P08/{coach-page,composer-and-photo,markdown-and-copy,prompt-chips}.md`,
`src/features/coach/**` and its tests, `src/app/shell.module.css` (the floating tab bar's room),
`src/ui/{Button,Toast}.tsx`, `e2e/coach.spec.ts`, `e2e/a11y.spec.ts`.

What it does (own words): the Coach tab stays one fixed column: the heading at the top, the
conversation in the middle (the only part that scrolls), and the chips and the composer at the
bottom, above the floating tab bar, or just above the on-screen keyboard while it is open (the
visual viewport tells how much of the window the keyboard covers, as the Android WebView and
Chrome report it). Opening the chat shows the newest message. When a reply arrives (or the waiting
dots start, or something grows) the list follows it while the person is at the end or within
about 80 px of it; when they have scrolled up to read, the list stays where they are and a "Jump
to latest" button floats over the bottom of the list, just above the composer, saying how many
new messages came; a tap glides to the newest (at once with reduced motion). Sending a question
always brings the end back. The field grows with the text to about six lines, then scrolls; Send
is off while the draft is empty or a reply is coming; a physical keyboard's Enter sends and
Shift+Enter makes a new line, a touch keyboard's Enter makes a new line; after Send the focus stays
in the field. The person's bubbles sit on the right in the accent with accent ink, the Coach's on
the left on the card colour; a Copy button under each reply copies its text (the Clipboard API,
else a hidden text area and the copy command) and says "Copied". The chips stay one sideways row.
The list is a polite log: only whole replies are added to it.

Inputs → outputs:
- `followEnd.ts` (pure): `distanceToEnd(metrics)`, `isNearEnd(metrics, slack = 80)`,
  `unseenAfter(messages, seenId)` (how many messages came after the newest one the person saw),
  `scrollBehaviour(reducedMotion)`.
- `useFollowEnd(listRef, threadRef, messages, pending, keyboardInset)` → `{ away, unseen, jump }`:
  starts at the end, follows while near it, counts what arrives while away, jumps on request.
- `keyboard.ts`: `keyboardInset({innerHeight, height, offsetTop})` (pure) and
  `useKeyboardInset(viewport?)` (the page's hook, a fake viewport in tests).
- `clipboard.ts`: `copyText(text, env?)` → `'copied' | 'failed'` (Clipboard API, then the copy
  command on a hidden text area).
- `MessageList`: a frame holding the log and the Jump to latest button (`coach.jumpLatest`).
- `Composer`: six lines, focus kept after Send (`onMouseDown` on Send keeps it, and the field takes
  it back after a send).

Files: changed `src/features/coach/{CoachPage,MessageList,Bubble,Composer,CopyButton}.tsx`,
`src/features/coach/coach.module.css`, their tests, `src/i18n/en/coach.ts`; created
`src/features/coach/{followEnd,keyboard,clipboard}.ts` and tests for them.

Edge cases / failure modes:
- No `ResizeObserver` (old browsers, jsdom): following new messages still works (effects on the
  message count and pending); only growth inside a bubble is not followed.
- A smooth jump sends scroll events on its way down: only moving up (or ending away from the end)
  counts as leaving the end, so a glide in progress never shows the button.
- The newest message the person saw is gone (the 200-message cap dropped it): every message counts
  as unseen until they reach the end. A Reset empties the list: the empty chat shows, the count goes.
- The person's own question always brings the end back (they just sent it), even when scrolled up.
- Reduced motion: every jump is instant.
- No `visualViewport`: no keyboard inset (the page keeps its normal height). A difference under 120
  px is browser chrome, not a keyboard.
- Clipboard API missing (an insecure page, an old WebView) or refused: the copy command on a
  hidden text area; if that fails too, "Couldn't copy the reply".
- The field keeps the focus after Send; a chip or a card does not take it.

Our design differences / decisions:
- "Jump to latest" is ours (the owner asked); the reference always jumps to the end.
- The button shows whenever the person is more than 80 px from the end, with the count of new
  messages when there are any ("Jump to latest, 2 new").
- The live announcements stay the log's own (`role="log"`, polite, additions): replies arrive
  whole (no streaming), so each reply is announced once; the waiting dots keep their one status
  line.
- Six lines for the field (was five), as the owner's brief says.
- "Copied" as the toast (was "Reply copied").

Tests we will write:
- `followEnd.test.ts`: near the end within 80 px, not beyond; unseen counts (none, some, the seen
  one gone); the scroll behaviour with and without reduced motion.
- `MessageList.test.tsx`: starts at the end; follows a reply at the end; stays when scrolled up
  and shows Jump to latest with the count; the jump glides, instant with reduced motion; the
  person's own question brings the end back; the button goes at the end; a glide on its way down
  does not count as leaving; growth followed only at the end; announces whole replies only.
- `keyboard.test.ts` / `CoachPage.test.tsx`: the inset from a fake viewport (open, scrolled, closed,
  chrome).
- `Composer.test.tsx`: grows to six lines then scrolls; Send off while empty and while pending;
  Enter rules; the focus stays in the field after Send.
- `CopyButton.test.tsx` / `clipboard.test.ts`: the Clipboard API; the fallback when it is missing;
  the failure toast when both fail.
- e2e: the chat's layout stays as it was (`coach.spec.ts`), axe green in both themes
  (`a11y.spec.ts`, unchanged).

Compare checklist (filled after the rewrite; reopened `CoachScreen.kt` (the scroll effect on the
message count and sending, the IME padding, the drag that hides the keyboard, the chips row) and
`ChatView.swift` (`scrollTo` on count, sending and focus; `lineLimit(1...5)`)):
- [x] Opening the chat shows the newest message (`src/features/coach/MessageList.test.tsx >
  MessageList: following the end > opens at the newest message, at once`)
- [x] The list follows new messages and the waiting dots (the reference always does; ours while
  the person is at the end or within 80 px) (`MessageList.test.tsx > MessageList: following the end
  > follows a reply and the waiting dots while the person is at the end or within 80 px of it`;
  `src/features/coach/followEnd.test.ts > followEnd: where the reader is (P13) > *`)
- [x] Deliberate difference: scrolled up, nothing moves and Jump to latest shows with the count
  (`MessageList.test.tsx > MessageList: following the end > stays where the person scrolled up to
  and counts the new messages on Jump to latest`; `> takes Jump to latest away at the end, and
  counts afresh after the next scroll up`; `> does not take a glide on its way down for leaving the
  end`; `followEnd.test.ts > followEnd: what arrived meanwhile (P13) > *`)
- [x] Jump to latest glides, instant with reduced motion (`MessageList.test.tsx > MessageList:
  following the end > glides to the newest on Jump to latest, at once with reduced motion`;
  `followEnd.test.ts > followEnd: motion (P13) > *`), and keeps the keyboard up
  (`CoachPage.test.tsx > CoachPage: keyboard > keeps the field focused when the person taps Jump to
  latest (P13)`)
- [x] Sending brings the end back (`MessageList.test.tsx > MessageList: following the end > brings
  the end back for the person’s own question, even when scrolled up`)
- [x] The composer stays above the keyboard (the reference's IME padding): the page ends above the
  part of the window the visual viewport says is covered (`src/features/coach/keyboard.test.ts >
  keyboardInset (P13) > *`, `> useKeyboardInset (P13) > *`; unchanged: `CoachPage.test.tsx >
  CoachPage: keyboard > ends the page above the on-screen keyboard while it is open`)
- [x] A drag on the list closes the keyboard, a scroll the page makes does not (unchanged:
  `CoachPage.test.tsx > CoachPage: keyboard > lets go of the field when the person drags the
  conversation, not when it scrolls itself`)
- [x] The field grows to a few lines, then scrolls (the reference: five; ours: six)
  (`src/features/coach/Composer.test.tsx > Composer: growing with the text > grows with the text to
  six lines, then scrolls (P13)`; `> sizes the field to its text (the stylesheet stops it at six
  lines)`)
- [x] Send off while empty or pending; Enter sends on a physical keyboard, Shift+Enter is a new
  line, Enter is a new line on touch (unchanged: `Composer.test.tsx > Composer: Send (P08-11) >
  keeps Send off for an empty field and for spaces and line breaks only`, `Composer: while a reply
  is pending > turns the photo button and Send off, and typing goes on`, `Composer: keys > *`); the
  focus stays after Send (`Composer.test.tsx > Composer: Send (P08-11) > keeps the focus in the
  field after Send, so the keyboard stays up (P13)`; `> gives the focus back to the field after
  Send from the keyboard (P13)`)
- [x] Copy on every reply, with a fallback (`src/features/coach/CopyButton.test.tsx > CopyButton >
  *`, among them `> copies with the copy command and says Copied when there is no Clipboard API
  (P13)`; `src/features/coach/clipboard.test.ts > copyText (P13) > *`)
- [x] The chips are one row that scrolls sideways (`src/features/coach/ChipRow.test.tsx > ChipRow:
  one sideways row (P13) > keeps the chips in one row that scrolls sideways when they do not fit`)
- [x] A polite log (`MessageList.test.tsx > MessageList: following the end > is a polite log of
  what is added, so a whole reply is announced once`); axe green in both themes
  (`e2e/a11y.spec.ts`, unchanged)
- Gaps found on reopening: none beyond the deliberate ones.
- Deliberate differences: Jump to latest (owner's request; the reference always jumps); six lines;
  the copy fallback through the copy command; following only while the person is at the end.
- Not taken: the voice input; the reference's glass looks (P12's palette instead).

## Decisions for the lead

- Jump to latest shows whenever the person is more than 80 px from the end, and carries the count
  of messages that came since ("Jump to latest, 2 new messages"; "2 new" on the button).
- A smooth jump never counts as leaving the end: only moving up does, so the button cannot flash
  during a glide.
- The copy toast says "Copied" (was "Reply copied"); `coach.copy.done` keeps its key.
- No streaming exists (replies arrive whole), so the log's own polite announcements are enough;
  no extra live region.

## Status

Done (2026-10-28). Lines outside the task's files: none for this half (the stylesheet, the
catalogue's coach words and the coach tests are the task's own).
