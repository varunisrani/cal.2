import { afterEach, describe, expect, it, vi } from 'vitest';
import { currentLocale } from './locale';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('currentLocale', () => {
  it('returns the browser language', () => {
    vi.spyOn(navigator, 'language', 'get').mockReturnValue('de-DE');
    expect(currentLocale()).toBe('de-DE');
  });

  it('returns the language as a canonical tag', () => {
    vi.spyOn(navigator, 'language', 'get').mockReturnValue('en-gb');
    expect(currentLocale()).toBe('en-GB');
  });

  it('falls back to en without a navigator', () => {
    vi.stubGlobal('navigator', undefined);
    expect(currentLocale()).toBe('en');
  });

  it('falls back to en for an empty or invalid language', () => {
    const language = vi.spyOn(navigator, 'language', 'get');
    language.mockReturnValue('');
    expect(currentLocale()).toBe('en');
    language.mockReturnValue('en_US');
    expect(currentLocale()).toBe('en');
  });
});
