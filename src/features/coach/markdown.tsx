// Coach replies as safe Markdown (P08-13, 04 §3.4). A reply is read into blocks and inline nodes
// and drawn as React elements, so its text always lands in text nodes: nothing in a reply can add
// markup or run code, and no HTML string is ever built. Blocks: `#` to `###` headings, bullet
// lists (`-`, `*`, `+`), numbered lists, fenced code and paragraphs (blank lines between them).
// Inline: bold, italic, code and links whose address is http or https; those open in a new tab.
// Everything else is shown as the text it is.

import { Fragment, type ReactNode } from 'react';
import styles from './markdown.module.css';

export type ReplyBlock =
  | { readonly kind: 'heading'; readonly level: 1 | 2 | 3; readonly text: string }
  | { readonly kind: 'list'; readonly ordered: boolean; readonly items: readonly ListItem[] }
  | { readonly kind: 'code'; readonly text: string }
  | { readonly kind: 'paragraph'; readonly lines: readonly string[] };

export interface ListItem {
  /** The number the reply gave a numbered item; none on a bullet. */
  readonly number?: number;
  readonly text: string;
}

export type InlineNode =
  | { readonly kind: 'text'; readonly text: string }
  | { readonly kind: 'code'; readonly text: string }
  | { readonly kind: 'strong' | 'em'; readonly children: readonly InlineNode[] }
  | { readonly kind: 'link'; readonly href: string; readonly children: readonly InlineNode[] };

// ---- Blocks ------------------------------------------------------------------------------------

const FENCE = '```';
const HEADING = /^(#{1,3})\s+(\S.*?)(?:\s+#+)?$/;
const BULLET = /^[-*+]\s+(\S.*)$/;
const NUMBERED = /^(\d{1,9})\.\s+(\S.*)$/;

/** A line read on its own; neighbouring lines of one kind are gathered afterwards. */
type Line =
  | { kind: 'blank' }
  | { kind: 'fence' }
  | { kind: 'heading'; level: 1 | 2 | 3; text: string }
  | { kind: 'item'; ordered: boolean; item: ListItem }
  | { kind: 'text'; text: string };

function readLine(raw: string): Line {
  const line = raw.trim();
  if (line === '') return { kind: 'blank' };
  if (line.startsWith(FENCE)) return { kind: 'fence' };
  const heading = HEADING.exec(line);
  if (heading) {
    return { kind: 'heading', level: heading[1]!.length as 1 | 2 | 3, text: heading[2]! };
  }
  const bullet = BULLET.exec(line);
  if (bullet) return { kind: 'item', ordered: false, item: { text: bullet[1]! } };
  const numbered = NUMBERED.exec(line);
  if (numbered) {
    return {
      kind: 'item',
      ordered: true,
      item: { number: Number(numbered[1]), text: numbered[2]! },
    };
  }
  return { kind: 'text', text: line };
}

/** The blocks of a reply, in order. */
export function readBlocks(reply: string): ReplyBlock[] {
  const rows = reply.split(/\r\n?|\n/);
  const blocks: ReplyBlock[] = [];
  // The block still taking lines: a list takes items of its own kind, a paragraph text lines.
  let open:
    | { kind: 'list'; ordered: boolean; items: ListItem[] }
    | { kind: 'paragraph'; lines: string[] }
    | null = null;
  const close = (): void => {
    if (open) blocks.push(open);
    open = null;
  };

  for (let index = 0; index < rows.length; index++) {
    const line = readLine(rows[index]!);
    switch (line.kind) {
      case 'blank':
        close();
        break;
      case 'fence': {
        close();
        // Code runs to the closing fence, or to the end of a reply that never closes it.
        const code: string[] = [];
        while (index + 1 < rows.length && !rows[index + 1]!.trim().startsWith(FENCE)) {
          code.push(rows[++index]!);
        }
        index++;
        blocks.push({ kind: 'code', text: code.join('\n') });
        break;
      }
      case 'heading':
        close();
        blocks.push({ kind: 'heading', level: line.level, text: line.text });
        break;
      case 'item':
        if (open?.kind !== 'list' || open.ordered !== line.ordered) {
          close();
          open = { kind: 'list', ordered: line.ordered, items: [] };
        }
        open.items.push(line.item);
        break;
      case 'text':
        if (open?.kind !== 'paragraph') {
          close();
          open = { kind: 'paragraph', lines: [] };
        }
        open.lines.push(line.text);
        break;
    }
  }
  close();
  return blocks;
}

// ---- Inline ------------------------------------------------------------------------------------

const SPACE = /\s/;
const WORD = /[\p{L}\p{N}]/u;

/** A link's address when it is a well-formed http or https URL; otherwise undefined. */
function safeHref(address: string): string | undefined {
  if (address === '' || SPACE.test(address)) return undefined;
  try {
    const url = new URL(address);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Where an emphasis span that opens at `from` with `marker` closes: the next marker that follows
 * a non-space character. A single `*` or `_` skips doubled markers, and a closing `_` may not sit
 * inside a word. -1 when there is none.
 */
function closerOf(text: string, from: number, marker: string): number {
  for (let at = text.indexOf(marker, from); at !== -1; at = text.indexOf(marker, at + 1)) {
    if (at === from || SPACE.test(text[at - 1]!)) continue;
    if (marker.length === 1 && (text[at + 1] === marker || text[at - 1] === marker)) continue;
    if (marker === '_' && WORD.test(text[at + 1] ?? '')) continue;
    return at;
  }
  return -1;
}

/** The index of the `)` that closes the `(` at `open`, counting nested parentheses; -1 if none. */
function closingParen(text: string, open: number): number {
  let depth = 0;
  for (let at = open; at < text.length; at++) {
    if (text[at] === '(') depth++;
    else if (text[at] === ')' && --depth === 0) return at;
  }
  return -1;
}

/** The inline nodes of one block's text. Links inside a link's own label stay text. */
export function readInline(text: string, inLink = false): InlineNode[] {
  const nodes: InlineNode[] = [];
  let plain = '';
  const flush = (): void => {
    if (plain !== '') nodes.push({ kind: 'text', text: plain });
    plain = '';
  };
  const push = (node: InlineNode): void => {
    flush();
    nodes.push(node);
  };

  let at = 0;
  while (at < text.length) {
    const char = text[at]!;
    const next = text[at + 1];

    if (char === '`') {
      const end = text.indexOf('`', at + 1);
      if (end > at + 1) {
        push({ kind: 'code', text: text.slice(at + 1, end) });
        at = end + 1;
        continue;
      }
    } else if (char === '*' && next === '*') {
      const end = closerOf(text, at + 2, '**');
      if (end !== -1 && !SPACE.test(text[at + 2]!)) {
        push({ kind: 'strong', children: readInline(text.slice(at + 2, end), inLink) });
        at = end + 2;
        continue;
      }
      // An unmatched pair stays text as a pair, so its second star opens nothing.
      plain += '**';
      at += 2;
      continue;
    } else if (char === '*' || char === '_') {
      const opensWord = char === '*' || !WORD.test(text[at - 1] ?? '');
      const end =
        opensWord && next !== undefined && !SPACE.test(next) ? closerOf(text, at + 1, char) : -1;
      if (end !== -1) {
        push({ kind: 'em', children: readInline(text.slice(at + 1, end), inLink) });
        at = end + 1;
        continue;
      }
    } else if (char === '[' && !inLink) {
      const labelEnd = text.indexOf(']', at + 1);
      if (labelEnd > at + 1 && text[labelEnd + 1] === '(') {
        const addressEnd = closingParen(text, labelEnd + 1);
        if (addressEnd !== -1) {
          const href = safeHref(text.slice(labelEnd + 2, addressEnd).trim());
          if (href) {
            push({ kind: 'link', href, children: readInline(text.slice(at + 1, labelEnd), true) });
          } else {
            // Not a web address: the whole span stays visible as written.
            plain += text.slice(at, addressEnd + 1);
          }
          at = addressEnd + 1;
          continue;
        }
      }
    }
    plain += char;
    at++;
  }
  flush();
  return nodes;
}

// ---- Rendering ---------------------------------------------------------------------------------

function renderInline(nodes: readonly InlineNode[]): ReactNode[] {
  return nodes.map((node, index) => {
    switch (node.kind) {
      case 'text':
        return <Fragment key={index}>{node.text}</Fragment>;
      case 'code':
        return (
          <code key={index} className={styles.inlineCode}>
            {node.text}
          </code>
        );
      case 'strong':
        return <strong key={index}>{renderInline(node.children)}</strong>;
      case 'em':
        return <em key={index}>{renderInline(node.children)}</em>;
      case 'link':
        return (
          <a
            key={index}
            className={styles.link}
            href={node.href}
            target="_blank"
            rel="noopener noreferrer"
          >
            {renderInline(node.children)}
          </a>
        );
    }
  });
}

const inline = (text: string): ReactNode[] => renderInline(readInline(text));

/** Reply headings sit under the page's own: `#` draws as h3, `###` as h5. */
const HEADING_TAGS = { 1: 'h3', 2: 'h4', 3: 'h5' } as const;

function renderBlock(block: ReplyBlock, index: number): ReactNode {
  switch (block.kind) {
    case 'heading': {
      const Tag = HEADING_TAGS[block.level];
      return (
        <Tag key={index} className={styles[`heading${block.level}`]}>
          {inline(block.text)}
        </Tag>
      );
    }
    case 'list': {
      const items = block.items.map((item, at) => (
        <li key={at} value={item.number}>
          {inline(item.text)}
        </li>
      ));
      return block.ordered ? (
        <ol key={index} className={styles.list}>
          {items}
        </ol>
      ) : (
        <ul key={index} className={styles.list}>
          {items}
        </ul>
      );
    }
    case 'code':
      return (
        <pre key={index} className={styles.code}>
          <code>{block.text}</code>
        </pre>
      );
    case 'paragraph':
      return (
        <p key={index} className={styles.paragraph}>
          {block.lines.map((line, at) => (
            <Fragment key={at}>
              {at > 0 ? <br /> : null}
              {inline(line)}
            </Fragment>
          ))}
        </p>
      );
  }
}

export interface MarkdownReplyProps {
  /** The reply as the model wrote it. */
  readonly text: string;
}

/** A Coach reply drawn from its Markdown; its text stays selectable. */
export function MarkdownReply({ text }: MarkdownReplyProps) {
  return (
    <div className={styles.reply} data-ui="coach.reply">
      {readBlocks(text).map(renderBlock)}
    </div>
  );
}
