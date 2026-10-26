/**
 * Message syntax: a small subset of ICU MessageFormat.
 *
 * - `{name}` inserts a param (numbers are formatted with the locale).
 * - `{count, plural, one {…} other {…}}` picks a branch by plural category; `other` is required.
 *   Inside a branch, `#` prints the count. Branches may hold further placeholders.
 * - Everything else is plain text, apostrophes and `#` outside a branch included. There is no
 *   escape for a literal `{` or `}`.
 */

export type MessageParams = Readonly<Record<string, string | number>>;

export type PluralBranches = Partial<Record<Intl.LDMLPluralRule, MessagePart[]>> & {
  other: MessagePart[];
};

export type MessagePart =
  | { kind: 'text'; text: string }
  | { kind: 'arg'; name: string }
  | { kind: 'count' }
  | { kind: 'plural'; name: string; branches: PluralBranches };

export type ParsedMessage = readonly MessagePart[];

export class MessageSyntaxError extends Error {
  constructor(
    readonly reason: string,
    readonly offset: number,
  ) {
    super(`${reason} (at offset ${offset})`);
    this.name = 'MessageSyntaxError';
  }
}

const PLURAL_CATEGORIES: ReadonlySet<string> = new Set<Intl.LDMLPluralRule>([
  'zero',
  'one',
  'two',
  'few',
  'many',
  'other',
]);

const NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;
const NAME_CHAR = /[A-Za-z0-9_]/;
const SPACE = /\s/;

/** Parses a message; throws `MessageSyntaxError` naming the first problem and its offset. */
export function parseMessage(source: string): ParsedMessage {
  let pos = 0;

  // A function declaration, not an arrow: TypeScript narrows only after calls to declared
  // `never` functions.
  function fail(reason: string, at: number = pos): never {
    throw new MessageSyntaxError(reason, at);
  }
  const peek = (): string => source.charAt(pos);
  const atEnd = (): boolean => pos >= source.length;
  const skipSpaces = (): void => {
    while (!atEnd() && SPACE.test(peek())) pos += 1;
  };

  // Reads an identifier (with the spaces around it); `what` names it in errors.
  const word = (what: string): string => {
    skipSpaces();
    const start = pos;
    while (!atEnd() && NAME_CHAR.test(peek())) pos += 1;
    const found = source.slice(start, pos);
    if (found === '') {
      fail(atEnd() ? `unclosed "{", expected ${what}` : `expected ${what}, found "${peek()}"`);
    }
    if (!NAME.test(found)) fail(`"${found}" is not a valid ${what}`, start);
    skipSpaces();
    return found;
  };

  // Text and placeholders up to the `}` that closes the enclosing branch, or the end.
  const parts = (inBranch: boolean): MessagePart[] => {
    const out: MessagePart[] = [];
    let text = '';
    const flush = (): void => {
      if (text !== '') out.push({ kind: 'text', text });
      text = '';
    };
    while (!atEnd() && peek() !== '}') {
      const ch = peek();
      if (ch === '{') {
        flush();
        out.push(placeholder());
      } else if (ch === '#' && inBranch) {
        flush();
        out.push({ kind: 'count' });
        pos += 1;
      } else {
        text += ch;
        pos += 1;
      }
    }
    flush();
    return out;
  };

  const placeholder = (): MessagePart => {
    const open = pos;
    pos += 1;
    const name = word('a placeholder name');
    if (peek() === '}') {
      pos += 1;
      return { kind: 'arg', name };
    }
    if (atEnd()) fail('unclosed "{"', open);
    if (peek() !== ',') fail(`expected "}" or "," after "${name}", found "${peek()}"`);
    pos += 1;
    const type = word('a placeholder type');
    if (type !== 'plural') fail(`unsupported placeholder type "${type}" (only "plural")`);
    if (peek() !== ',') fail(atEnd() ? 'unclosed "{"' : 'expected "," after "plural"');
    pos += 1;

    const branches: Partial<Record<Intl.LDMLPluralRule, MessagePart[]>> = {};
    for (;;) {
      skipSpaces();
      if (atEnd()) fail('unclosed "{"', open);
      if (peek() === '}') {
        pos += 1;
        break;
      }
      const at = pos;
      const category = word('a plural category');
      if (!isPluralCategory(category)) fail(`unknown plural category "${category}"`, at);
      if (branches[category]) fail(`plural category "${category}" appears twice`, at);
      if (peek() !== '{') fail(`expected "{" after "${category}"`);
      const branchOpen = pos;
      pos += 1;
      const body = parts(true);
      if (atEnd()) fail('unclosed "{"', branchOpen);
      pos += 1;
      branches[category] = body;
    }
    const { other } = branches;
    if (!other) fail('a plural needs an "other" branch', open);
    return { kind: 'plural', name, branches: { ...branches, other } };
  };

  const message = parts(false);
  if (!atEnd()) fail('"}" without a matching "{"');
  return message;
}

export interface RenderOptions {
  readonly params: MessageParams | undefined;
  /** Chooses plural categories: the rules of the catalogue's language. */
  readonly plural: Intl.PluralRules;
  /** Formats number params and `#`: the person's locale. */
  readonly number: Intl.NumberFormat;
  /**
   * Called for a missing param or a plural value that is not a finite number. Throws, or
   * returns the text to show instead (`fallback` is the placeholder as written).
   */
  readonly onProblem: (problem: string, fallback: string) => string;
}

export function renderMessage(message: ParsedMessage, options: RenderOptions): string {
  return renderParts(message, options, undefined);
}

function renderParts(
  parts: ParsedMessage,
  options: RenderOptions,
  count: number | undefined,
): string {
  let out = '';
  for (const part of parts) {
    if (part.kind === 'text') {
      out += part.text;
    } else if (part.kind === 'count') {
      out += count === undefined ? '#' : options.number.format(count);
    } else {
      const value = options.params?.[part.name];
      if (part.kind === 'arg') {
        if (value === undefined) {
          out += options.onProblem(`missing param "${part.name}"`, `{${part.name}}`);
        } else {
          out += typeof value === 'number' ? options.number.format(value) : value;
        }
      } else if (typeof value === 'number' && Number.isFinite(value)) {
        const branch = part.branches[options.plural.select(value)] ?? part.branches.other;
        out += renderParts(branch, options, value);
      } else {
        const problem =
          value === undefined
            ? `missing param "${part.name}"`
            : `param "${part.name}" must be a finite number for a plural`;
        out += options.onProblem(problem, `{${part.name}}`);
      }
    }
  }
  return out;
}

function isPluralCategory(word: string): word is Intl.LDMLPluralRule {
  return PLURAL_CATEGORIES.has(word);
}
