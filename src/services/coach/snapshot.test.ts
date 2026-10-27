import { afterEach, describe, expect, it } from 'vitest';
import type { PlatewiseDb } from '../../data/schema';
import { makeProfile } from '../../test/factories';
import { SNAPSHOT_NOW, SNAPSHOT_TODAY, at, entryOn, fixtureDiary } from './__fixtures__/snapshot';
import { STORES_ZONE, closeAll, openCoachStores } from './__fixtures__/stores';
import { takeSnapshot } from './snapshot';

const opened: PlatewiseDb[] = [];
afterEach(() => closeAll(opened));

async function stores() {
  const opening = await openCoachStores();
  opened.push(opening.db);
  return opening;
}

describe('takeSnapshot (R04.22)', () => {
  it('copies every entry, weigh-in, reading and fast, today’s water and the settings it needs', async () => {
    const s = await stores();
    await s.profileRepo.save(makeProfile());
    const old = entryOn('2019-03-02', '09:00', { name: 'Porridge from long ago' });
    await s.diaryRepo.addMany([old, ...fixtureDiary()]);
    await s.weightRepo.addWeighIn({ at: at('2026-10-20', '07:30'), kg: 81.2 });
    await s.weightRepo.addWeighIn({ at: at('2026-10-26', '07:30'), kg: 80.6 });
    await s.bodyFatRepo.addReading({ at: at('2026-10-21', '07:35'), fraction: 0.24 });
    const fast = await s.fastRepo.start(960, at('2026-10-24', '20:00'));
    if (!fast.ok) throw new Error('the fixture fast did not start');
    await s.fastRepo.end(fast.value.id, at('2026-10-25', '12:00'));
    await s.waterRepo.add({ at: at('2026-10-25', '18:00'), ml: 900 });
    await s.waterRepo.add({ at: at('2026-10-26', '09:00'), ml: 500 });
    await s.settingsRepo.set('units.energy', 'kJ');
    await s.settingsRepo.set('units.weight', 'lb');
    await s.settingsRepo.set('units.height', 'ftIn');
    await s.settingsRepo.set('water.on', true);
    await s.settingsRepo.set('water.goalMl', 2_500);
    await s.settingsRepo.set('water.unit', 'flOz');

    const snapshot = await takeSnapshot(s.sources);

    expect(snapshot).not.toBeNull();
    expect(snapshot?.now).toBe(SNAPSHOT_NOW);
    expect(snapshot?.timeZone).toBe(STORES_ZONE);
    expect(snapshot?.units).toEqual({ energy: 'kJ', weight: 'lb', height: 'ftIn' });
    expect(snapshot?.entries.map((entry) => entry.name).sort()).toEqual(
      [old, ...fixtureDiary()].map((entry) => entry.name).sort(),
    );
    expect(snapshot?.weighIns.map((weighIn) => weighIn.kg).sort()).toEqual([80.6, 81.2]);
    expect(snapshot?.bodyFat.map((reading) => reading.fraction)).toEqual([0.24]);
    expect(snapshot?.fasts).toEqual([
      {
        id: fast.value.id,
        start: at('2026-10-24', '20:00'),
        end: at('2026-10-25', '12:00'),
        goalMin: 960,
      },
    ]);
    expect(snapshot?.water).toMatchObject({ on: true, goalMl: 2_500, unit: 'flOz' });
    expect(snapshot?.water.logs.map((log) => [log.dayKey, log.ml])).toEqual([
      [SNAPSHOT_TODAY, 500],
    ]);
  });

  it('is a copy: data stored after it was taken is not in it', async () => {
    const s = await stores();
    await s.profileRepo.save(makeProfile());
    const snapshot = await takeSnapshot(s.sources);
    await s.diaryRepo.add(entryOn(SNAPSHOT_TODAY, '12:10', { name: 'Late snack' }));

    expect(snapshot?.entries).toEqual([]);
  });

  it('gives null without a readable profile', async () => {
    const s = await stores();
    expect(await takeSnapshot(s.sources)).toBeNull();
  });
});
