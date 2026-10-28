import { afterEach, describe, expect, it, vi } from 'vitest';
import { fixedClock } from '../../lib/clock';
import { FACTORY_NOW } from '../../test/factories';
import type { AutoBackupBase } from './autoSetup';
import { loadAutoBackup, type AutoBackupModule } from './autoLoad';
import { setUpAutoBackup } from './autoSetup';
import { fakeFolder } from './testing/fakeFolder';

afterEach(() => {
  vi.unstubAllGlobals();
});

function base(): AutoBackupBase {
  return {
    backup: {
      make: vi.fn(),
      restoring: () => false,
      isCurrent: () => true,
    },
    settingsRepo: { get: vi.fn(), set: vi.fn(), update: vi.fn() },
    clock: fixedClock(FACTORY_NOW, 'America/New_York'),
    visibility: { isVisible: () => true, subscribe: () => () => undefined },
    fetch: vi.fn(),
  };
}

describe('loadAutoBackup (P14-01, D-16.95)', () => {
  it('fetches nothing and builds nothing on the web, where there is no Capacitor bridge', async () => {
    const setup = vi.fn<AutoBackupModule>();

    expect(await loadAutoBackup(base(), setup)).toBeUndefined();
    expect(setup).not.toHaveBeenCalled();
  });

  it('fetches the module and builds the service inside the Android app', async () => {
    vi.stubGlobal('Capacitor', { getPlatform: () => 'android' });
    const folder = fakeFolder({ now: () => FACTORY_NOW });
    const setup = vi.fn<AutoBackupModule>(async () => ({
      setUpAutoBackup: (given: AutoBackupBase) => setUpAutoBackup(given, folder),
    }));

    const service = await loadAutoBackup(base(), setup);

    expect(setup).toHaveBeenCalledTimes(1);
    expect(service?.getSnapshot()).toEqual({ running: false, files: null });
  });
});
