import { afterEach, describe, expect, it, vi } from 'vitest';
import { fixedClock } from '../../lib/clock';
import { FACTORY_NOW } from '../../test/factories';
import { loadDriveBackup, type DriveBackupModule } from './driveLoad';
import { setUpDriveBackup, type DriveBackupBase } from './driveSetup';
import { fakeDrivePlugin } from './testing/fakeDrive';

afterEach(() => {
  vi.unstubAllGlobals();
});

function base(): DriveBackupBase {
  return {
    backup: { make: vi.fn(), restoring: () => false, isCurrent: () => true },
    settingsRepo: { get: vi.fn(), set: vi.fn(), update: vi.fn() },
    clock: fixedClock(FACTORY_NOW, 'America/New_York'),
    fetch: vi.fn(),
  };
}

describe('loadDriveBackup (P15-04, D-16.97)', () => {
  it('fetches nothing and builds nothing on the web, where there is no Capacitor bridge (ACC-M16-5)', async () => {
    const setup = vi.fn<DriveBackupModule>();

    expect(await loadDriveBackup(base(), setup)).toBeUndefined();
    expect(setup).not.toHaveBeenCalled();
  });

  it('fetches the module and builds the service inside the Android app', async () => {
    vi.stubGlobal('Capacitor', { getPlatform: () => 'android' });
    const plugin = fakeDrivePlugin();
    const setup = vi.fn<DriveBackupModule>(async () => ({
      setUpDriveBackup: (given: DriveBackupBase) => setUpDriveBackup(given, plugin),
    }));

    const service = await loadDriveBackup(base(), setup);

    expect(setup).toHaveBeenCalledTimes(1);
    expect(service?.getSnapshot()).toEqual({ uploading: false, files: null, listProblem: null });
    expect(plugin.calls).toEqual([]);
  });
});
