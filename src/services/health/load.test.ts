import { afterEach, describe, expect, it, vi } from 'vitest';
import { live } from '../../data/live';
import { createDiaryRepo } from '../../data/repos/diaryRepo';
import { createSettingsRepo } from '../../data/repos/settingsRepo';
import { createWeightRepo } from '../../data/repos/weightRepo';
import { fixedClock } from '../../lib/clock';
import { openTestDb } from '../../test/db';
import { FACTORY_NOW } from '../../test/factories';
import { loadHealth, type HealthBase, type HealthSetupModule } from './load';
import { setUpHealth } from './setup';
import { fakeHealthPlugin } from './testing/fakeHealthPlugin';

afterEach(() => {
  vi.unstubAllGlobals();
});

async function base(): Promise<HealthBase> {
  const { db, bus } = await openTestDb();
  return {
    db,
    settingsRepo: createSettingsRepo(db, { locale: 'en-US', bus }),
    diaryRepo: createDiaryRepo(db),
    weightRepo: createWeightRepo(db, { bus }),
    clock: fixedClock(FACTORY_NOW, 'America/New_York'),
    visibility: { isVisible: () => true, subscribe: () => () => undefined },
    live,
  };
}

describe('loadHealth', () => {
  it('fetches nothing and builds nothing on the web, where there is no Capacitor bridge', async () => {
    const parts = await base();
    const setup = vi.fn<HealthSetupModule>();
    expect(await loadHealth(parts, setup)).toBeUndefined();
    expect(setup).not.toHaveBeenCalled();
    parts.db.close();
  });

  it('fetches the setup module and builds the service and activity copy inside the Android app', async () => {
    vi.stubGlobal('Capacitor', { getPlatform: () => 'android' });
    const parts = await base();
    const plugin = fakeHealthPlugin();
    const setup = vi.fn<HealthSetupModule>(async () => ({
      setUpHealth: (given: HealthBase) => setUpHealth(given, plugin),
    }));

    const health = await loadHealth(parts, setup);

    expect(setup).toHaveBeenCalledTimes(1);
    expect(health?.service.getSnapshot()).toMatchObject({ availability: null, syncing: false });
    expect(await health?.activityRepo.between('2026-10-01', '2026-10-26')).toEqual([]);
    parts.db.close();
  });
});
