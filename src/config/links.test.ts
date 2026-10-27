import { describe, expect, it } from 'vitest';
import { isLinkAddress, isMailAddress, LINKS } from './links';

describe('LINKS', () => {
  it('holds only secure pages, email addresses or null placeholders', () => {
    for (const [name, address] of Object.entries(LINKS)) {
      if (address !== null) expect(isLinkAddress(address), name).toBe(true);
    }
  });

  it('names the addresses the About pages and the Settings hub use', () => {
    expect(Object.keys(LINKS).sort()).toEqual(
      ['changelog', 'contact', 'help', 'privacy', 'site', 'source', 'terms'].sort(),
    );
  });
});

describe('isLinkAddress', () => {
  it.each([
    ['https://platewise.example/help', true],
    ['mailto:hello@platewise.example', true],
    ['http://platewise.example', false],
    ['mailto:nobody', false],
    ['javascript:alert(1)', false],
    ['/help', false],
    ['', false],
  ])('%j → %s', (address, expected) => {
    expect(isLinkAddress(address)).toBe(expected);
  });
});

describe('isMailAddress', () => {
  it('tells an email from a page', () => {
    expect(isMailAddress('MAILTO:hello@platewise.example')).toBe(true);
    expect(isMailAddress('https://platewise.example')).toBe(false);
  });
});
