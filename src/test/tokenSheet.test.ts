import { describe, expect, it } from 'vitest';
import { parseTokenSheet, resolveRootTokens } from './tokenSheet';

const sheet = `
/* A comment { with braces } that must vanish. */
:root {
  --a: #111111;
  --b: one;
  --gap: 4px;
}
[data-theme='light'] { --a: #eeeeee; --b: two }
[data-theme='light'][data-accent="x"] { --b: three; }
/* One attribute, but later in the file: must lose to the two-attribute rule above. */
[data-accent=x] { --b: four; --c: var(--gap); }
html { color: var(--a); }
@media (prefers-reduced-motion: reduce) {
  :root { --gap: 1px; }
}
body { margin: 0; }
`;

describe('parseTokenSheet', () => {
  it('reads rules in file order with their selectors and declarations', () => {
    const rules = parseTokenSheet(sheet);
    expect(rules.map((r) => r.selectors)).toEqual([
      [':root'],
      ["[data-theme='light']"],
      [`[data-theme='light'][data-accent="x"]`],
      ['[data-accent=x]'],
      ['html'],
      [':root'],
      ['body'],
    ]);
    expect(rules[1]!.declarations).toEqual([
      ['--a', '#eeeeee'],
      ['--b', 'two'],
    ]);
    expect(rules[5]!.media).toBe('(prefers-reduced-motion: reduce)');
    expect(rules[0]!.media).toBeUndefined();
  });

  it('collapses whitespace in multi-line values', () => {
    const [rule] = parseTokenSheet(':root {\n  --font:\n    a, b,\n    c;\n}');
    expect(rule!.declarations).toEqual([['--font', 'a, b, c']]);
  });

  it('refuses nested rules and at-rules other than @media', () => {
    expect(() => parseTokenSheet(':root { .x { --a: 1; } }')).toThrow(/nested/);
    expect(() => parseTokenSheet('@font-face { font-family: x; }')).toThrow(/unsupported/);
    expect(() => parseTokenSheet(':root { --a: 1;')).toThrow(/unclosed/);
  });
});

describe('resolveRootTokens', () => {
  const rules = parseTokenSheet(sheet);

  it('gives the bare root the :root values', () => {
    const tokens = resolveRootTokens(rules, {});
    expect(tokens.get('--a')).toBe('#111111');
    expect(tokens.get('--b')).toBe('one');
    expect(tokens.has('--c')).toBe(false);
  });

  it('applies specificity before file order', () => {
    const tokens = resolveRootTokens(rules, { 'data-theme': 'light', 'data-accent': 'x' });
    expect(tokens.get('--a')).toBe('#eeeeee');
    expect(tokens.get('--b')).toBe('three');
  });

  it('lets a later rule of equal specificity win', () => {
    expect(resolveRootTokens(rules, { 'data-accent': 'x' }).get('--b')).toBe('four');
  });

  it('resolves var() references, with fallbacks', () => {
    const tokens = resolveRootTokens(rules, { 'data-theme': 'light' });
    expect(tokens.get('color')).toBe('#eeeeee');
    const withFallback = parseTokenSheet(':root { --x: var(--missing, var(--y)); --y: 2px; }');
    expect(resolveRootTokens(withFallback, {}).get('--x')).toBe('2px');
    const missing = parseTokenSheet(':root { --x: var(--missing); }');
    expect(() => resolveRootTokens(missing, {})).toThrow(/--missing is not defined/);
    const cycle = parseTokenSheet(':root { --x: var(--y); --y: var(--x); }');
    expect(() => resolveRootTokens(cycle, {})).toThrow(/cycle/);
  });

  it('ignores @media blocks unless their condition is said to hold', () => {
    expect(resolveRootTokens(rules, { 'data-accent': 'x' }).get('--c')).toBe('4px');
    const reduced = resolveRootTokens(
      rules,
      { 'data-accent': 'x' },
      { media: (condition) => condition === '(prefers-reduced-motion: reduce)' },
    );
    expect(reduced.get('--c')).toBe('1px');
  });

  it('refuses a token declared on a selector that is not about the root', () => {
    const hidden = parseTokenSheet(':root { --a: 1; } .card { --a: 2; }');
    expect(() => resolveRootTokens(hidden, {})).toThrow(/not a root selector/);
    const descendant = parseTokenSheet("[data-theme='light'] .x { --a: 2; }");
    expect(() => resolveRootTokens(descendant, {})).toThrow(/not a root selector/);
  });
});
