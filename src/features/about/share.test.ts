import { describe, expect, it, vi } from 'vitest';
import { appAddress, browserShareTarget, shareLink, type SharedLink } from './share';

const LINK: SharedLink = {
  title: 'Platewise',
  text: 'A line about the app.',
  url: 'https://platewise.example/',
};

const failing = (name: string) => () => Promise.reject(new DOMException('no', name));

describe('shareLink', () => {
  it('hands title, text and address to the share sheet when there is one, copying nothing', async () => {
    const share = vi.fn(() => Promise.resolve());
    const copy = vi.fn(() => Promise.resolve());
    await expect(shareLink(LINK, { share, copy })).resolves.toBe('shared');
    expect(share).toHaveBeenCalledWith({
      title: 'Platewise',
      text: 'A line about the app.',
      url: 'https://platewise.example/',
    });
    expect(copy).not.toHaveBeenCalled();
  });

  it('copies the address when the browser has no share sheet', async () => {
    const copy = vi.fn(() => Promise.resolve());
    await expect(shareLink(LINK, { copy })).resolves.toBe('copied');
    expect(copy).toHaveBeenCalledWith('https://platewise.example/');
  });

  it('does nothing more when the person closes the share sheet', async () => {
    const copy = vi.fn(() => Promise.resolve());
    await expect(shareLink(LINK, { share: failing('AbortError'), copy })).resolves.toBe(
      'cancelled',
    );
    expect(copy).not.toHaveBeenCalled();
  });

  it('copies the address when sharing fails for another reason', async () => {
    const copy = vi.fn(() => Promise.resolve());
    await expect(shareLink(LINK, { share: failing('NotAllowedError'), copy })).resolves.toBe(
      'copied',
    );
    expect(copy).toHaveBeenCalledWith('https://platewise.example/');
  });

  it('reports failure, without throwing, when neither works', async () => {
    await expect(shareLink(LINK, {})).resolves.toBe('failed');
    await expect(
      shareLink(LINK, { share: failing('NotAllowedError'), copy: failing('NotAllowedError') }),
    ).resolves.toBe('failed');
  });
});

describe('browserShareTarget', () => {
  it('offers only what the browser has', () => {
    vi.stubGlobal('navigator', { clipboard: { writeText: vi.fn() } });
    try {
      const target = browserShareTarget();
      expect(target.share).toBeUndefined();
      expect(target.copy).toBeTypeOf('function');
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('appAddress', () => {
  it('prefers the public address the owner supplied', () => {
    expect(appAddress('https://platewise.example/', 'https://copy.example/#/home', '/')).toBe(
      'https://platewise.example/',
    );
  });

  it('else gives where this copy runs from, without the screen it is on', () => {
    expect(appAddress(null, 'https://copy.example/app/#/settings/about', '/app/')).toBe(
      'https://copy.example/app/',
    );
    expect(appAddress(null, 'https://copy.example/app/index.html#/home', './')).toBe(
      'https://copy.example/app/',
    );
  });
});
