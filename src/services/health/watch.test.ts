import type { PromiseExtended } from 'dexie';
import { describe, expect, it, vi } from 'vitest';
import { live } from '../../data/live';
import { createDiaryRepo } from '../../data/repos/diaryRepo';
import { createWeightRepo } from '../../data/repos/weightRepo';
import { startOfDay } from '../../domain/dates/dayKey';
import type { DiaryEntry } from '../../domain/model';
import { fixedClock } from '../../lib/clock';
import { countRuns, openTestDb } from '../../test/db';
import { FACTORY_NOW, makeEntry } from '../../test/factories';
import { storedHealthWatch } from './watch';

describe('storedHealthWatch', () => {
  it('calls back after each change to the entries or the weigh-ins, not for the first read', async () => {
    const { db, bus } = await openTestDb();
    const diaryRepo = createDiaryRepo(db);
    const weightRepo = createWeightRepo(db, { bus });
    const since: number[] = [];
    const entries = countRuns((ms: number) => {
      since.push(ms);
      return diaryRepo.since(ms) as PromiseExtended<DiaryEntry[]>;
    });
    const weighIns = countRuns(() => weightRepo.history());
    const watch = storedHealthWatch({
      diaryRepo: { since: entries.query },
      weightRepo: { history: weighIns.query },
      clock: fixedClock(FACTORY_NOW, 'America/New_York'),
      live,
    });
    const onChange = vi.fn();

    const stop = watch(onChange);
    await entries.untilRuns(1);
    await weighIns.untilRuns(1);
    expect(onChange).not.toHaveBeenCalled();
    // From the start of the write-back window: 30 days, today included.
    expect(since[0]).toBe(startOfDay('2026-09-27'));

    await diaryRepo.add(makeEntry());
    await entries.untilRuns(2);
    expect(onChange).toHaveBeenCalledTimes(1);

    await weightRepo.addWeighIn({ at: FACTORY_NOW, kg: 63 });
    await weighIns.untilRuns(2);
    expect(onChange).toHaveBeenCalledTimes(2);

    stop();
    entries.close();
    weighIns.close();
    db.close();
  });
});
