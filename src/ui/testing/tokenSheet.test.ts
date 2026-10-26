import { describe, expect, it } from 'vitest';
import { parseTokenSheet, resolveTokens } from './tokenSheet';

const resolve = (css: string, attributes: Record<string, string> = {}) =>
  Object.fromEntries(resolveTokens(parseTokenSheet(css), attributes));

describe('resolveTokens', () => {
  it('lets the later rule win at equal specificity', () => {
    const css = `:root { --a: #111111; } [data-x='1'] { --a: #222222; }`;
    expect(resolve(css, { 'data-x': '1' })).toEqual({ '--a': '#222222' });
    expect(resolve(css)).toEqual({ '--a': '#111111' });
  });

  it('lets the more specific rule win wherever it sits', () => {
    const css = `[data-x='1'][data-y="2"] { --a: #333333; } [data-y=2] { --a: #444444; }`;
    expect(resolve(css, { 'data-x': '1', 'data-y': '2' })).toEqual({ '--a': '#333333' });
    expect(resolve(css, { 'data-y': '2' })).toEqual({ '--a': '#444444' });
  });

  it('matches :not() only when the attribute is absent', () => {
    const css = `:root:not([data-x]) { --a: #555555; }`;
    expect(resolve(css)).toEqual({ '--a': '#555555' });
    expect(resolve(css, { 'data-x': 'any' })).toEqual({});
  });

  it('skips at-rules and rules without custom properties', () => {
    const css = `@media (min-width: 1px) { :root { --a: #666666; } } html body { color: red; }`;
    expect(resolve(css)).toEqual({});
  });

  it('refuses a custom-property rule whose selector it cannot evaluate', () => {
    expect(() => resolve(`html .card { --a: #777777; }`)).toThrow('cannot evaluate');
  });
});
