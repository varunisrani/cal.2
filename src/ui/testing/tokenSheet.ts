/**
 * Reads tokens.css for tests: a parser for its flat style rules and a resolver that applies the
 * cascade (specificity, then source order) to the root element for a given set of attributes.
 *
 * It knows only the selector shapes tokens.css uses on its custom-property rules: compounds of
 * `:root`, `[name]`, `[name=value]` and `:not(<attribute>)`, with no combinators. A rule that
 * declares custom properties under any other selector makes the resolver throw, so a new shape
 * cannot slip past the contrast sweep unchecked. At-rules (`@media`) are skipped.
 */

// Tests run in Node, but the app's tsconfig has no Node types: this is all we use of Node.
declare const process: {
  getBuiltinModule(id: 'node:fs'): { readFileSync(path: string, encoding: 'utf8'): string };
};

/**
 * A file of the product, by its path from the product root (`src/ui/tokens.css`), read from
 * disk: Vitest empties every CSS import, `?raw` included. (The URL is built in two steps because
 * Vite rewrites a literal `new URL(path, import.meta.url)` into an asset URL.)
 */
export function readProductFile(path: string): string {
  const here = import.meta.url;
  const file = decodeURIComponent(new URL(`../../../${path}`, here).pathname);
  return process.getBuiltinModule('node:fs').readFileSync(file, 'utf8');
}

/** The text of src/ui/tokens.css. */
export function readTokensCss(): string {
  return readProductFile('src/ui/tokens.css');
}

export interface TokenRule {
  /** The selector list, each one canonical: attribute values in single quotes, no spaces. */
  readonly selectors: readonly string[];
  /** Declarations in source order; a repeated property keeps its last value. */
  readonly declarations: ReadonlyMap<string, string>;
}

/** Attributes on the root element, e.g. `{ 'data-theme': 'light', 'data-accent': 'ink' }`. */
export type RootAttributes = Readonly<Record<string, string | undefined>>;

export function parseTokenSheet(css: string): TokenRule[] {
  const text = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const rules: TokenRule[] = [];
  let at = 0;
  while (at < text.length) {
    const open = text.indexOf('{', at);
    if (open === -1) {
      if (text.slice(at).trim() !== '') throw new Error('tokens.css: text after the last rule');
      break;
    }
    const prelude = text.slice(at, open).trim();
    const close = matchingBrace(text, open);
    if (!prelude.startsWith('@')) {
      rules.push({
        selectors: prelude.split(',').map(canonicalSelector),
        declarations: parseDeclarations(text.slice(open + 1, close)),
      });
    }
    at = close + 1;
  }
  return rules;
}

/** The custom properties that apply to the root element with these attributes. */
export function resolveTokens(
  rules: readonly TokenRule[],
  attributes: RootAttributes,
): Map<string, string> {
  const winners = new Map<string, { specificity: number; value: string }>();
  for (const rule of rules) {
    const custom = [...rule.declarations].filter(([property]) => property.startsWith('--'));
    if (custom.length === 0) continue;
    let specificity = -1;
    for (const selector of rule.selectors) {
      const matched = matchSelector(selector, attributes);
      if (matched !== null) specificity = Math.max(specificity, matched);
    }
    if (specificity < 0) continue;
    for (const [property, value] of custom) {
      const earlier = winners.get(property);
      // Equal specificity: the later rule wins.
      if (!earlier || specificity >= earlier.specificity) {
        winners.set(property, { specificity, value });
      }
    }
  }
  return new Map([...winners].map(([property, { value }]) => [property, value]));
}

/** The selector's specificity (class-level parts) when it matches the root, else null. */
export function matchSelector(selector: string, attributes: RootAttributes): number | null {
  let rest = selector;
  let specificity = 0;
  let matches = true;
  while (rest !== '') {
    const part = /^(:root|:not\((\[[^\]]+\])\)|\[[^\]]+\])/.exec(rest);
    if (!part) throw new Error(`tokens.css: selector the sweep cannot evaluate: ${selector}`);
    const [whole, , negated] = part;
    if (whole === ':root') {
      // The resolver always evaluates the root element.
    } else if (negated !== undefined) {
      if (attributeMatches(negated, attributes)) matches = false;
    } else if (!attributeMatches(whole, attributes)) {
      matches = false;
    }
    specificity += 1;
    rest = rest.slice(whole.length);
  }
  return matches ? specificity : null;
}

function attributeMatches(selector: string, attributes: RootAttributes): boolean {
  const { name, value } = parseAttribute(selector);
  const actual = attributes[name];
  return value === undefined ? actual !== undefined : actual === value;
}

function parseAttribute(selector: string): { name: string; value: string | undefined } {
  const parts = /^\[([\w-]+)(?:=(?:'([^']*)'|"([^"]*)"|([\w-]+)))?\]$/.exec(selector);
  if (!parts) throw new Error(`tokens.css: attribute selector not understood: ${selector}`);
  const [, name = '', single, double, bare] = parts;
  return { name, value: single ?? double ?? bare };
}

function canonicalSelector(raw: string): string {
  return raw.replace(/\s+/g, '').replace(/\[[^\]]+\]/g, (attribute) => {
    const { name, value } = parseAttribute(attribute);
    return value === undefined ? `[${name}]` : `[${name}='${value}']`;
  });
}

function parseDeclarations(body: string): Map<string, string> {
  const declarations = new Map<string, string>();
  for (const declaration of body.split(';')) {
    if (declaration.trim() === '') continue;
    const colon = declaration.indexOf(':');
    if (colon === -1) throw new Error(`tokens.css: declaration without a colon: ${declaration}`);
    const property = declaration.slice(0, colon).trim();
    const value = declaration
      .slice(colon + 1)
      .trim()
      .replace(/\s+/g, ' ');
    declarations.set(property, value);
  }
  return declarations;
}

function matchingBrace(text: string, open: number): number {
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    if (text[i] === '{') depth += 1;
    else if (text[i] === '}') {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  throw new Error('tokens.css: unbalanced braces');
}
