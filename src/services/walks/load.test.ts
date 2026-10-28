import { afterEach, describe, expect, it, vi } from 'vitest';
import { createProfileRepo } from '../../data/repos/profileRepo';
import { createSettingsRepo } from '../../data/repos/settingsRepo';
import { fixedClock } from '../../lib/clock';
import { openTestDb } from '../../test/db';
import { FACTORY_NOW } from '../../test/factories';
import {
  loadWalks,
  pageTestTracker,
  TEST_TRACKER_GLOBAL,
  type WalksBase,
  type WalksSetupModule,
} from './load';
import { setUpWalks } from './setup';
import { fakeWalkTracker } from './testing/fakeWalkTracker';

afterEach(() => {
  vi.unstubAllGlobals();
});

async function base(): Promise<WalksBase> {
  const { db } = await openTestDb();
  return {
    db,
    profileRepo: createProfileRepo(db),
    settingsRepo: createSettingsRepo(db, { locale: 'en-US' }),
    clock: fixedClock(FACTORY_NOW, 'America/New_York'),
    visibility: { isVisible: () => true, subscribe: () => () => undefined },
  };
}

const tracker = () => fakeWalkTracker({ now: () => FACTORY_NOW });

describe('loadWalks (P15-02)', () => {
  it('fetches nothing and builds nothing on the web, where there is no Capacitor bridge', async () => {
    const parts = await base();
    const setup = vi.fn<WalksSetupModule>();
    expect(await loadWalks(parts, setup)).toBeUndefined();
    expect(setup).not.toHaveBeenCalled();
    parts.db.close();
  });

  it('builds the parts over the native tracker inside the Android app', async () => {
    vi.stubGlobal('Capacitor', { getPlatform: () => 'android' });
    const parts = await base();
    const native = tracker();
    const setUpNativeWalks = vi.fn(async (given: WalksBase) => setUpWalks(given, native));
    const setup = vi.fn<WalksSetupModule>(async () => ({ setUpWalks, setUpNativeWalks }));

    const walks = await loadWalks(parts, setup);

    expect(setUpNativeWalks).toHaveBeenCalledTimes(1);
    expect(walks?.service.getSnapshot()).toEqual({ kind: 'idle' });
    expect(await walks?.walkRepo.list()).toEqual([]);
    parts.db.close();
  });

  it('builds the parts over a stand-in a browser test put on the page, on any platform', async () => {
    const standIn = tracker();
    vi.stubGlobal(TEST_TRACKER_GLOBAL, standIn);
    expect(pageTestTracker()).toBe(standIn);
    const parts = await base();
    const setUpNativeWalks = vi.fn();
    const walks = await loadWalks(parts, async () => ({ setUpWalks, setUpNativeWalks }));
    expect(setUpNativeWalks).not.toHaveBeenCalled();
    await walks?.service.start();
    expect(standIn.calls).toContain('start');
    walks?.service.close();
    parts.db.close();
  });

  it('ignores anything else under the stand-in name', () => {
    vi.stubGlobal(TEST_TRACKER_GLOBAL, { start: 'no' });
    expect(pageTestTracker()).toBeUndefined();
  });
});
