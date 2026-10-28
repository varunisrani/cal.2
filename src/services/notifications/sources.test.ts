import { afterEach, describe, expect, it, vi } from 'vitest';
import { live } from '../../data/live';
import { createDiaryRepo } from '../../data/repos/diaryRepo';
import { createWaterRepo } from '../../data/repos/waterRepo';
import { createWeightRepo } from '../../data/repos/weightRepo';
import type { PlatewiseDb } from '../../data/schema';
import { fixedClock } from '../../lib/clock';
import { openTestDb } from '../../test/db';
import { FACTORY_NOW, makeEntry } from '../../test/factories';
import { readNudgeFacts, watchNudgeFacts } from './sources';

// Tests run in Node, but the app's tsconfig has no Node types: the fake IndexedDB runs on this.
declare const setImmediate: (run: () => void) => unknown;

// Monday 26 October 2026, 12:30 in New York.
const NOW = FACTORY_NOW;
const local = (text: string) => new Date(text).getTime();

const opened: PlatewiseDb[] = [];
afterEach(() => {
  for (const db of opened.splice(0)) db.close();
});

async function until(ready: () => boolean): Promise<void> {
  for (let turn = 0; turn < 500 && !ready(); turn += 1) {
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
  if (!ready()) throw new Error('until: the condition never held');
}

async function repos() {
  const { db } = await openTestDb();
  opened.push(db);
  return {
    diaryRepo: createDiaryRepo(db),
    waterRepo: createWaterRepo(db),
    weightRepo: createWeightRepo(db),
  };
}

describe('the nudges’ facts (P17-01)', () => {
  it('reads the meals and water of the next 7 days, the usual times and the newest weigh-in', async () => {
    const r = await repos();
    for (const day of [19, 20, 21, 22, 23]) {
      await r.diaryRepo.add(
        makeEntry({ meal: 'lunch', loggedAt: local(`2026-10-${day}T13:15:00`) }),
      );
    }
    await r.diaryRepo.add(makeEntry({ meal: 'breakfast', loggedAt: local('2026-10-26T08:10:00') }));
    await r.waterRepo.add({ at: local('2026-10-26T09:00:00'), ml: 300 });
    await r.weightRepo.addWeighIn({ at: local('2026-10-20T07:00:00'), kg: 64 });

    const facts = await readNudgeFacts(r, NOW);

    expect([...facts.days.keys()]).toEqual([
      '2026-10-26',
      '2026-10-27',
      '2026-10-28',
      '2026-10-29',
      '2026-10-30',
      '2026-10-31',
      '2026-11-01',
    ]);
    expect(facts.days.get('2026-10-26')).toEqual({ meals: ['breakfast'], waterMl: 300, any: true });
    expect(facts.days.get('2026-10-27')).toEqual({ meals: [], waterMl: 0, any: false });
    expect(facts.usual).toEqual({ lunch: '13:15' });
    expect(facts.lastWeighIn).toBe(local('2026-10-20T07:00:00'));
  });

  it('reports a change to the diary, the water or the weigh-ins, and not a change that alters nothing', async () => {
    const r = await repos();
    const onChange = vi.fn();
    const stop = watchNudgeFacts(r, fixedClock(NOW, 'America/New_York'), live)(onChange);
    await until(() => onChange.mock.calls.length === 1);

    await r.waterRepo.add({ at: NOW, ml: 250 });
    await until(() => onChange.mock.calls.length === 2);
    await r.weightRepo.addWeighIn({ at: NOW - 3_600_000, kg: 63 });
    await until(() => onChange.mock.calls.length === 3);
    await r.diaryRepo.add(makeEntry({ meal: 'dinner', loggedAt: NOW }));
    await until(() => onChange.mock.calls.length === 4);

    // Three weeks back says nothing about the usual times or the days ahead.
    await r.diaryRepo.add(makeEntry({ meal: 'dinner', loggedAt: NOW - 21 * 24 * 3_600_000 }));
    for (let turn = 0; turn < 60; turn += 1) {
      await new Promise<void>((resolve) => setImmediate(resolve));
    }
    expect(onChange).toHaveBeenCalledTimes(4);
    stop();
  });
});
