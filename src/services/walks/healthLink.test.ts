import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSettingsRepo } from '../../data/repos/settingsRepo';
import { openTestDb } from '../../test/db';
import { FACTORY_NOW, makeWalk } from '../../test/factories';
import { fakeHealthPlugin } from '../health/testing/fakeHealthPlugin';
import { healthWalkLink } from './healthLink';

const closers: Array<() => void> = [];

afterEach(() => {
  for (const close of closers.splice(0)) close();
  vi.restoreAllMocks();
});

async function setup(settings: { connected?: boolean; writeBack?: boolean } = {}) {
  const { db } = await openTestDb();
  closers.push(() => db.close());
  const settingsRepo = createSettingsRepo(db, { locale: 'en-US' });
  await settingsRepo.set('health.connected', settings.connected ?? true);
  await settingsRepo.set('health.writeBack', settings.writeBack ?? true);
  const plugin = fakeHealthPlugin();
  return { plugin, link: healthWalkLink({ plugin, settingsRepo }) };
}

describe('healthWalkLink (P15-02)', () => {
  it('writes only while connected with writing on', async () => {
    expect(await (await setup()).link.canWrite()).toBe(true);
    expect(await (await setup({ writeBack: false })).link.canWrite()).toBe(false);
    expect(await (await setup({ connected: false })).link.canWrite()).toBe(false);
  });

  it('writes a walk under its id, 0 m when it had no route', async () => {
    const { plugin, link } = await setup();
    const walk = makeWalk({ distanceM: null, steps: null });
    expect(await link.writeWalk(walk)).toBe(true);
    expect(plugin.walks.get(walk.id)).toMatchObject({ distanceM: 0, steps: null, activeKcal: 90 });
  });

  it('reads heart rate as instants, none while not connected or when refused', async () => {
    const { plugin, link } = await setup();
    const t = new Date(FACTORY_NOW + 1000).toISOString();
    plugin.set({ heartRate: [{ t, bpm: 110 }] });
    expect(await link.heartRate(FACTORY_NOW, FACTORY_NOW + 60_000)).toEqual([
      { at: FACTORY_NOW + 1000, bpm: 110 },
    ]);

    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    plugin.failNext('readHeartRate', 'permissionDenied');
    expect(await link.heartRate(FACTORY_NOW, FACTORY_NOW + 60_000)).toEqual([]);

    const off = await setup({ connected: false });
    expect(await off.link.heartRate(FACTORY_NOW, FACTORY_NOW + 60_000)).toEqual([]);
    expect(off.plugin.callsOf('readHeartRate')).toEqual([]);
  });

  it('reads at most the first 24 h of a longer walk, as Health Connect answers no more', async () => {
    const { plugin, link } = await setup();
    await link.heartRate(FACTORY_NOW, FACTORY_NOW + 30 * 3_600_000);
    expect(plugin.callsOf('readHeartRate')).toEqual([
      {
        start: new Date(FACTORY_NOW).toISOString(),
        end: new Date(FACTORY_NOW + 24 * 3_600_000).toISOString(),
      },
    ]);
  });

  it('reports a write Health Connect refused as not written, never throwing', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { plugin, link } = await setup();
    plugin.failNext('writeWalk', 'unknown');
    expect(await link.writeWalk(makeWalk())).toBe(false);
  });
});
