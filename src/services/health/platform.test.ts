import { afterEach, describe, expect, it, vi } from 'vitest';
import { isHealthAvailable } from './platform';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('isHealthAvailable', () => {
  it('is false in a browser, which has no Capacitor bridge', () => {
    expect(isHealthAvailable()).toBe(false);
  });

  it('is true only inside the Android shell', () => {
    vi.stubGlobal('Capacitor', { getPlatform: () => 'android' });
    expect(isHealthAvailable()).toBe(true);
    vi.stubGlobal('Capacitor', { getPlatform: () => 'ios' });
    expect(isHealthAvailable()).toBe(false);
    vi.stubGlobal('Capacitor', { getPlatform: () => 'web' });
    expect(isHealthAvailable()).toBe(false);
  });

  it('is false for a bridge without a platform, or one that throws', () => {
    vi.stubGlobal('Capacitor', {});
    expect(isHealthAvailable()).toBe(false);
    vi.stubGlobal('Capacitor', {
      getPlatform: () => {
        throw new Error('not ready');
      },
    });
    expect(isHealthAvailable()).toBe(false);
  });
});
