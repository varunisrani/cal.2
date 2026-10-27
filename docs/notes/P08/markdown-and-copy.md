# Task: Markdown rendering and copy (P08-13) · Phase: 08 · Owner: builder (wt-p08s3, slice S3)

Read (reference @ `10e14b67`): `A/ui/coach/CoachScreen.kt` (the Markdown part at the end of the
file: the block kinds it recognises, how fences, headings, bullets and numbered lines are told
apart, the inline styles and what happens to links). Research spec `04-coach.md` §3.4 (rendering,
copy, accessibility) and §5 (links open in a new tab, a visible copy button, selection allowed).
No reference tests cover the renderer.

What it does (own words): the Coach's replies are short Markdown. We turn a reply into React
elements ourselves, never into an HTML string, so nothing in a reply can run or inject markup.
Blocks: `#` to `###` headings in three sizes, bullet lists (`-`, `*`, `+`), numbered lists
(`1.` and so on, numbers kept as written), fenced code blocks shown in monospace on a tinted box,
and paragraphs separated by blank lines (a single line break inside a paragraph is kept). Inline:
bold, italic, inline code, and links `[text](url)` only when the address is http or https; those
open in a new tab with `rel="noopener noreferrer"`. Anything else is shown as the text it is.
The person's own messages are shown verbatim by the bubble (P08-10), not through this renderer.
A copy button on each reply puts the reply's raw text on the clipboard and confirms with a short
toast; normal text selection keeps working.

Inputs → outputs:
- `readBlocks(text)` → `ReplyBlock[]`: `heading {level 1–3, text}`, `list {ordered, items:
  {number?, text}[]}`, `code {text}`, `paragraph {lines}`.
- `readInline(text)` → `InlineNode[]`: `text`, `strong`, `em`, `code`, `link {href}`.
- `<MarkdownReply text />` → elements: `h3`–`h5`, `ul`/`ol` with `li` (`value` keeps a number),
  `pre > code`, `p` with `br`; `strong`, `em`, `code`, `a`.
- `<CopyButton text />` → an icon button; click → `navigator.clipboard.writeText(text)` → toast.

Files: created `src/features/coach/markdown.tsx`, `src/features/coach/markdown.test.tsx`,
`src/features/coach/markdown.module.css`, `src/features/coach/CopyButton.tsx`,
`src/features/coach/CopyButton.test.tsx`; words in `src/i18n/en/coach.ts` (shared with P08-12).

Edge cases / failure modes:
- `<script>`, `<img onerror>` and entities in a reply: plain text (React text nodes).
- `[x](javascript:alert(1))`, `data:`, `mailto:`, relative or spaced addresses: the whole span is
  shown as written, no element.
- An address with parentheses (`…/Food_(disambiguation)`): balanced parentheses stay in the link.
- `**` or `*` or `` ` `` without a closer: literal characters.
- `2 * 3 * 4` and `snake_case_name`: no italics (a marker next to a space, or `_` inside a word).
- Bold inside a bullet, italic inside bold, a link inside bold: nested.
- Code (inline or fenced) is literal: no styling inside it.
- A fence that never closes: the rest of the reply is code. The fence's language tag is ignored.
- `####` or `#nospace`: text. A bullet marker with nothing after it: text.
- Windows line endings: treated as plain line breaks.
- Clipboard missing (insecure context) or refused: a short "couldn't copy" toast, nothing thrown.

Our design differences / decisions:
- Names and structure are ours: a block reader, an inline reader that builds a node tree, and a
  renderer; no third-party Markdown library and no `innerHTML`.
- Links are real links on the web (the reference's Android draws them but they are not tappable);
  http and https only (§5).
- Neighbouring list lines form one list, and neighbouring text lines one paragraph with their line
  breaks kept (the reference makes every line its own block); blank lines end both.
- Headings render as `h3`–`h5` so a reply's headings sit under the page's own headings.
- Numbered items keep the model's numbers (`li value`), as the reference prints them.
- An unsafe link stays fully visible as text instead of showing only its label, so the address is
  never hidden.
- A visible copy button on assistant replies (the reference has none on Android; iOS relies on
  selection); the toast says it worked or did not.

Tests we will write:
- `markdown.test.tsx`: `<script>` text renders as text and no script element exists;
  `[x](javascript:alert(1))` renders as plain text; a numbered list and a code block render (the
  code is literal); bold inside a bullet; a bullet list is a `ul` and an http link opens in a new
  tab with `rel="noopener noreferrer"` (ACC-I4-1); headings 1–3 and `####` as text; italic with
  `*` and `_`, no italic in `snake_case` or `2 * 3`; unclosed markers literal; unclosed fence;
  paragraphs and line breaks; parentheses inside an address; `readBlocks` and `readInline` shapes.
- `CopyButton.test.tsx`: copy writes the raw reply text (Markdown included) and shows the
  confirmation (ACC-I4-2); a refused clipboard shows the failure toast.

Compare checklist (filled after the rewrite; reopened the Markdown part of `CoachScreen.kt`):
- [x] Every block kind of the reference: headings 1–3, `-`/`*`/`+` bullets, numbered items with
  their numbers, fenced code to the closing fence or the end, blank lines (tested in
  `src/features/coach/markdown.test.tsx` > MarkdownReply: blocks and > readBlocks)
- [x] Every inline style of the reference: bold, italic with `*` and `_`, inline code, links
  (tested in `src/features/coach/markdown.test.tsx` > readInline)
- [x] Unsafe content stays text (tested in `src/features/coach/markdown.test.tsx` > MarkdownReply:
  safety)
- [x] Copy (no reference equivalent on Android; tested in `src/features/coach/CopyButton.test.tsx`)
- Deliberate differences: links are real and http/https only, opening in a new tab with
  `rel="noopener noreferrer"` (the reference draws links that cannot be tapped); an unsafe link
  shows its whole source (the reference shows only the label); neighbouring list lines form one
  list and text lines one paragraph with line breaks kept (the reference makes each line a block);
  styles nest (the reference styles each span flat); no italics for `_` inside a word or a marker
  next to a space; balanced parentheses stay in an address; closing hashes leave a heading's
  text; a marker with nothing after it is text; numbers are read as numbers (`01.` shows as 1).
- Not taken: the reference's typographic sizes and bullet glyph (ours come from the tokens and the
  list marker).

## Status

Done (2026-10-27). P08-10's `Bubble.tsx` mounts `<MarkdownReply text>` and `<CopyButton text>` on
assistant replies and shows the person's text verbatim (`white-space: pre-wrap`); the Coach page
sits inside the app's `ToastProvider`, which the copy button needs.
