/**
 * A small reader of src/ui/tokens.css for tests. It resolves the properties the root element
 * gets for a given set of attributes the way the browser's cascade does (specificity first, then
 * order in the file) for the selector forms the token file uses: `:root`, `html`, attribute
 * selectors and compounds of them. Anything else that declares a custom property is refused, so a
 * token can never hide on a selector the contrast sweep would not see.
 */

// Tests run in Node, but the app's tsconfig has no Node types: this is all we use of node:fs.
interface FileSystem {
  readFileSync(path: string, encoding: 'utf8'): string;
}
// A variable specifier keeps the compiler from looking for Node's type declarations.
const NODE_FS = 'node:fs';

/** The text of src/ui/tokens.css, read from disk: Vitest blanks CSS imports, `?raw` ones too. */
export async function readTokensCss(): Promise<string> {
  const fs = (await import(/* @vite-ignore */ NODE_FS)) as FileSystem;
  // A plain path: Node's fs refuses jsdom's URL objects, and Vite rewrites the
  // `new URL(relative, import.meta.url)` form into a served address.
  const here = decodeURIComponent(new URL(import.meta.url).pathname);
  return fs.readFileSync(here.replace(/\/test\/[^/]+$/, '/ui/tokens.css'), 'utf8');
}

export interface TokenRule {
  /** The selector list, one entry per comma-separated selector. */
  selectors: string[];
  /** Declarations in file order, whitespace collapsed. */
  declarations: Array<[name: string, value: string]>;
  /** The condition of the enclosing `@media` block, when there is one. */
  media?: string;
  /** Position of the rule in the file. */
  order: number;
}

export interface ResolveOptions {
  /** Whether a `@media` condition holds; by default none does. */
  media?: (condition: string) => boolean;
}

/** Specificity as [ids, classes/attributes/pseudo-classes, types]. */
type Specificity = [number, number, number];

interface RootSelector {
  attributes: Array<[name: string, value: string | undefined]>;
  specificity: Specificity;
}

const collapse = (text: string): string => text.replace(/\s+/g, ' ').trim();

/** The index just after the `}` that closes the block whose `{` is at `open`. */
function blockEnd(css: string, open: number): number {
  let depth = 0;
  for (let i = open; i < css.length; i++) {
    if (css[i] === '{') depth++;
    else if (css[i] === '}' && --depth === 0) return i + 1;
  }
  throw new Error(`unclosed block at offset ${open}`);
}

/** Splits on `separator` outside parentheses and quotes. */
function splitTopLevel(text: string, separator: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let quote = '';
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (quote) {
      if (c === quote) quote = '';
    } else if (c === '"' || c === "'") quote = c;
    else if (c === '(') depth++;
    else if (c === ')') depth--;
    else if (c === separator && depth === 0) {
      parts.push(text.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(text.slice(start));
  return parts;
}

function parseDeclarations(body: string, where: string): Array<[string, string]> {
  if (body.includes('{')) throw new Error(`nested rules are not supported (in ${where})`);
  const declarations: Array<[string, string]> = [];
  for (const part of splitTopLevel(body, ';')) {
    if (!part.trim()) continue;
    const colon = part.indexOf(':');
    if (colon < 0) throw new Error(`"${collapse(part)}" is not a declaration (in ${where})`);
    declarations.push([part.slice(0, colon).trim(), collapse(part.slice(colon + 1))]);
  }
  return declarations;
}

/** Reads a stylesheet's rules; comments are dropped, `@media` blocks keep their condition. */
export function parseTokenSheet(css: string): TokenRule[] {
  const rules: TokenRule[] = [];
  const read = (text: string, media: string | undefined): void => {
    let at = 0;
    while (at < text.length) {
      const open = text.indexOf('{', at);
      if (open < 0) {
        if (text.slice(at).trim()) throw new Error(`stray text "${collapse(text.slice(at))}"`);
        return;
      }
      const prelude = collapse(text.slice(at, open));
      const end = blockEnd(text, open);
      const body = text.slice(open + 1, end - 1);
      if (prelude.startsWith('@')) {
        const condition = /^@media\s+(.+)$/.exec(prelude)?.[1];
        if (!condition || media) throw new Error(`unsupported at-rule "${prelude}"`);
        read(body, condition);
      } else {
        const selectors = splitTopLevel(prelude, ',').map(collapse);
        if (selectors.some((s) => !s)) throw new Error(`empty selector in "${prelude}"`);
        rules.push({
          selectors,
          declarations: parseDeclarations(body, prelude),
          ...(media === undefined ? {} : { media }),
          order: rules.length,
        });
      }
      at = end;
    }
  };
  read(css.replace(/\/\*[\s\S]*?\*\//g, ''), undefined);
  return rules;
}

const SIMPLE_SELECTOR = /^(?::root|html|\[([a-z-]+)(?:=(?:'([^']*)'|"([^"]*)"|([\w-]+)))?\])/;

/** The selector as a match on the root element, or undefined when it can match something else. */
function rootSelector(selector: string): RootSelector | undefined {
  const attributes: RootSelector['attributes'] = [];
  const specificity: Specificity = [0, 0, 0];
  let rest = selector;
  while (rest) {
    const m = SIMPLE_SELECTOR.exec(rest);
    if (!m) return undefined;
    if (m[0] === 'html') specificity[2]++;
    else specificity[1]++;
    if (m[1] !== undefined) attributes.push([m[1], m[2] ?? m[3] ?? m[4]]);
    rest = rest.slice(m[0].length);
  }
  return { attributes, specificity };
}

const compareSpecificity = (a: Specificity, b: Specificity): number =>
  a[0] - b[0] || a[1] - b[1] || a[2] - b[2];

/** Replaces `var(--x)` and `var(--x, fallback)` with resolved values. */
function substitute(
  value: string,
  lookup: (name: string, trail: string[]) => string,
  trail: string[],
): string {
  let out = '';
  let at = 0;
  for (let start = value.indexOf('var(', at); start >= 0; start = value.indexOf('var(', at)) {
    let depth = 0;
    let end = start + 3;
    for (; end < value.length; end++) {
      if (value[end] === '(') depth++;
      else if (value[end] === ')' && --depth === 0) break;
    }
    const [name = '', ...fallback] = splitTopLevel(value.slice(start + 4, end), ',');
    let resolved: string;
    try {
      resolved = lookup(name.trim(), trail);
    } catch (error) {
      if (fallback.length === 0) throw error;
      resolved = substitute(collapse(fallback.join(',')), lookup, trail);
    }
    out += value.slice(at, start) + resolved;
    at = end + 1;
  }
  return out + value.slice(at);
}

/**
 * The properties the root element gets when it carries `attributes` (e.g.
 * `{ 'data-theme': 'light', 'data-accent': 'ember' }`), with `var()` references resolved.
 * Throws when a custom property is declared on a selector that is not about the root.
 */
export function resolveRootTokens(
  rules: readonly TokenRule[],
  attributes: Readonly<Record<string, string>>,
  options: ResolveOptions = {},
): Map<string, string> {
  const applies = options.media ?? (() => false);
  const matched: Array<{ specificity: Specificity; order: number; rule: TokenRule }> = [];
  for (const rule of rules) {
    const declaresTokens = rule.declarations.some(([name]) => name.startsWith('--'));
    let best: Specificity | undefined;
    for (const selector of rule.selectors) {
      const root = rootSelector(selector);
      if (!root) {
        if (declaresTokens) {
          throw new Error(`"${selector}" declares tokens but is not a root selector`);
        }
        continue;
      }
      const hit = root.attributes.every(([name, value]) =>
        value === undefined ? name in attributes : attributes[name] === value,
      );
      if (hit && (!best || compareSpecificity(root.specificity, best) > 0)) {
        best = root.specificity;
      }
    }
    if (best && (rule.media === undefined || applies(rule.media))) {
      matched.push({ specificity: best, order: rule.order, rule });
    }
  }
  matched.sort((a, b) => compareSpecificity(a.specificity, b.specificity) || a.order - b.order);

  const raw = new Map<string, string>();
  for (const { rule } of matched)
    for (const [name, value] of rule.declarations) raw.set(name, value);

  const lookup = (name: string, trail: string[]): string => {
    if (trail.includes(name)) throw new Error(`var() cycle: ${[...trail, name].join(' → ')}`);
    const value = raw.get(name);
    if (value === undefined) throw new Error(`${name} is not defined`);
    return substitute(value, lookup, [...trail, name]);
  };
  const resolved = new Map<string, string>();
  for (const name of raw.keys()) resolved.set(name, lookup(name, []));
  return resolved;
}
