import { describe, expect, it } from 'vitest';
import { readProductFile, readTokensCss } from './testing/tokenSheet';

// Vitest empties CSS imports, so the primitives' stylesheets are checked as text.
const SHEETS = [
  'src/ui/primitives.module.css',
  'src/ui/inputs.module.css',
  'src/ui/display.module.css',
] as const;

/** Custom properties a stylesheet defines (`--name:`). */
const definedIn = (css: string) => new Set([...css.matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]));

const withoutComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '');

describe.each(SHEETS)('%s', (path) => {
  const css = withoutComments(readProductFile(path));

  it('takes every colour from the tokens', () => {
    expect(css).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    expect(css).not.toMatch(/\b(rgba?|hsla?|hwb|lab|lch|oklab|oklch|color-mix)\(/i);
    expect(css).not.toMatch(/(?<![\w-])(white|black)(?![\w-])/i);
  });

  it('draws no gradients, blur or glass', () => {
    expect(css).not.toMatch(/gradient\(|backdrop-filter|blur\(/i);
  });

  it('reads only custom properties that exist', () => {
    const known = new Set([...definedIn(readTokensCss()), ...definedIn(css)]);
    const used = [...css.matchAll(/var\((--[\w-]+)/g)].map((m) => m[1]);
    expect(used.length).toBeGreaterThan(0);
    expect(used.filter((name) => !known.has(name))).toEqual([]);
  });

  it('turns its motion off under reduced motion', () => {
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)/);
  });
});
