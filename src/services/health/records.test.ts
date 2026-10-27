import { describe, expect, it } from 'vitest';
import { fingerprint } from '../../data/guard';
import { FACTORY_NOW, makeEntry, makeWeighIn } from '../../test/factories';
import type { DailyTotals, ExerciseSession } from './contract';
import {
  SYNC_DAYS,
  activityDays,
  importedReadings,
  nutritionRecord,
  syncWindow,
  weightRecord,
  writeBackPlan,
} from './records';

const DAY = 86_400_000;
const TODAY = '2026-10-26';
const WINDOW = syncWindow(TODAY);

function totals(day: string, overrides: Partial<DailyTotals> = {}): DailyTotals {
  return { day, steps: null, activeKcal: null, totalKcal: null, distanceM: null, ...overrides };
}

function session(overrides: Partial<ExerciseSession> = {}): ExerciseSession {
  return {
    id: 'run-1',
    day: TODAY,
    start: '2026-10-26T11:00:00.000Z',
    end: '2026-10-26T11:40:00.000Z',
    type: 'running',
    title: null,
    activeKcal: 320,
    source: 'org.example.watch',
    ...overrides,
  };
}

describe('syncWindow', () => {
  it('covers the last 30 days, today included', () => {
    expect(SYNC_DAYS).toBe(30);
    expect(WINDOW).toEqual({ first: '2026-09-27', last: TODAY });
  });
});

describe('activityDays', () => {
  it('makes one row per day of the window, oldest first, with the totals of each day', () => {
    const rows = activityDays(
      WINDOW,
      [totals(TODAY, { steps: 9_100, activeKcal: 412.4, totalKcal: 2_310, distanceM: 6_800 })],
      [],
      FACTORY_NOW,
    );
    expect(rows).toHaveLength(30);
    expect(rows[0]?.day).toBe('2026-09-27');
    expect(rows[29]).toEqual({
      day: TODAY,
      steps: 9_100,
      activeKcal: 412.4,
      totalKcal: 2_310,
      distanceM: 6_800,
      sessions: [],
      syncedAt: FACTORY_NOW,
    });
    expect(rows[28]).toMatchObject({ steps: null, activeKcal: null, sessions: [] });
  });

  it('drops days outside the window, bad day keys and unusable values', () => {
    const rows = activityDays(
      WINDOW,
      [
        totals('2026-10-27', { steps: 5 }),
        totals('2026-09-26', { steps: 5 }),
        totals('yesterday', { steps: 5 }),
        totals('2026-10-25', {
          steps: -1,
          activeKcal: Number.NaN,
          totalKcal: Infinity,
          distanceM: 0,
        }),
      ],
      [],
      FACTORY_NOW,
    );
    expect(rows.filter((row) => row.steps !== null)).toEqual([]);
    expect(rows.find((row) => row.day === '2026-10-25')).toMatchObject({
      steps: null,
      activeKcal: null,
      totalKcal: null,
      distanceM: 0,
    });
  });

  it('puts each workout on its day once, in start order, and drops unreadable ones', () => {
    const rows = activityDays(
      WINDOW,
      [],
      [
        session({ id: 'late', start: '2026-10-26T20:00:00Z', end: '2026-10-26T20:30:00Z' }),
        session({ id: 'early', title: 'Morning run', activeKcal: -5 }),
        session({ id: 'early' }),
        session({ id: 'backwards', start: '2026-10-26T10:00:00Z', end: '2026-10-26T09:00:00Z' }),
        session({ id: 'garbled', start: 'soon' }),
        session({ id: 'old', day: '2026-09-01' }),
      ],
      FACTORY_NOW,
    );
    const today = rows.find((row) => row.day === TODAY);
    expect(today?.sessions.map((s) => s.id)).toEqual(['early', 'late']);
    expect(today?.sessions[0]).toEqual({
      id: 'early',
      start: Date.parse('2026-10-26T11:00:00.000Z'),
      end: Date.parse('2026-10-26T11:40:00.000Z'),
      type: 'running',
      title: null,
      activeKcal: 320,
      source: 'org.example.watch',
    });
  });
});

describe('importedReadings', () => {
  it('names each reading after its Health Connect id and drops unusable ones', () => {
    expect(
      importedReadings([
        { id: 'abc', time: '2026-10-25T07:00:00Z', kg: 63.2, source: 'org.example.scale' },
        { id: '', time: '2026-10-25T07:00:00Z', kg: 63.2, source: 'x' },
        { id: 'zero', time: '2026-10-25T07:00:00Z', kg: 0, source: 'x' },
        { id: 'when', time: 'morning', kg: 63, source: 'x' },
      ]),
    ).toEqual([{ id: 'health-abc', at: Date.parse('2026-10-25T07:00:00Z'), kg: 63.2 }]);
  });
});

describe('records sent back', () => {
  it('sends an entry under its own id with its meal, energy and macros', () => {
    const entry = makeEntry({
      id: 'entry-a',
      name: 'Lentil soup',
      meal: 'dinner',
      kcal: 410,
      protein: 21,
      carbs: 52.5,
      fat: 9,
    });
    expect(nutritionRecord(entry)).toEqual({
      clientId: 'entry-a',
      time: new Date(entry.loggedAt).toISOString(),
      name: 'Lentil soup',
      mealType: 'dinner',
      kcal: 410,
      proteinG: 21,
      carbsG: 52.5,
      fatG: 9,
    });
    expect(nutritionRecord(makeEntry({ meal: 'other' })).mealType).toBeNull();
  });

  it('sends a weigh-in under its own id', () => {
    expect(weightRecord({ id: 'w1', at: FACTORY_NOW, kg: 63.5 })).toEqual({
      clientId: 'w1',
      time: new Date(FACTORY_NOW).toISOString(),
      kg: 63.5,
    });
  });
});

describe('writeBackPlan', () => {
  it('sends new entries and weigh-ins typed here, never imported ones', () => {
    const entry = makeEntry({ id: 'e1' });
    const typed = makeWeighIn({ id: 'w1' });
    const imported = makeWeighIn({ id: 'health-x' });
    const plan = writeBackPlan({
      entries: [entry],
      weighIns: [typed, imported],
      ledger: {},
      window: WINDOW,
    });
    expect(plan.nutrition).toEqual([nutritionRecord(entry)]);
    expect(plan.weights).toEqual([weightRecord(typed)]);
    expect(plan.sent).toEqual({
      e1: { kind: 'nutrition', day: TODAY, sig: fingerprint(nutritionRecord(entry)) },
      w1: { kind: 'weight', day: TODAY, sig: fingerprint(weightRecord(typed)) },
    });
    expect([plan.removeNutrition, plan.removeWeights, plan.forget]).toEqual([[], [], []]);
  });

  it('skips what was sent unchanged, sends what changed, removes what is gone and forgets old days', () => {
    const same = makeEntry({ id: 'same' });
    const edited = makeEntry({ id: 'edited', kcal: 500 });
    const plan = writeBackPlan({
      entries: [same, edited],
      weighIns: [],
      ledger: {
        same: { kind: 'nutrition', day: TODAY, sig: fingerprint(nutritionRecord(same)) },
        edited: { kind: 'nutrition', day: TODAY, sig: 'before the edit' },
        deleted: { kind: 'nutrition', day: '2026-10-20', sig: 's' },
        gone: { kind: 'weight', day: '2026-10-21', sig: 's' },
        old: { kind: 'nutrition', day: '2026-09-26', sig: 's' },
      },
      window: WINDOW,
    });
    expect(plan.nutrition.map((record) => record.clientId)).toEqual(['edited']);
    expect(plan.removeNutrition).toEqual(['deleted']);
    expect(plan.removeWeights).toEqual(['gone']);
    expect(plan.forget).toEqual(['old']);
  });

  it('removes an entry that moved out of the window, and leaves entries outside it alone', () => {
    const moved = makeEntry({ id: 'moved', loggedAt: FACTORY_NOW - 40 * DAY });
    const plan = writeBackPlan({
      entries: [moved],
      weighIns: [],
      ledger: { moved: { kind: 'nutrition', day: '2026-10-25', sig: 's' } },
      window: WINDOW,
    });
    expect(plan.nutrition).toEqual([]);
    expect(plan.removeNutrition).toEqual(['moved']);
  });
});
