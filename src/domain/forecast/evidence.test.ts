import { describe, expect, it } from 'vitest';
import { inTimeZone } from '../../test/time';
import { addDays, startOfDay, type DayKey } from '../dates/dayKey';
import { FIXTURE_TODAY, defaultProfile } from '../goals/__fixtures__/profiles';
import type { BodyFatReading, DiaryEntry, Profile, WeighIn } from '../model';
import {
  buildEvidence,
  confidenceLabel,
  dayCoverage,
  finishedDays,
  nutritionPoints,
  weightPoints,
  type EvidenceInput,
  type LoggedDay,
} from './evidence';

const HOUR = 3_600_000;
const TODAY = FIXTURE_TODAY; // 2026-10-26; the window is 2026-07-28 … 2026-10-25
const ago = (days: number): DayKey => addDays(TODAY, -days);

/** A plan with a saved 2 000 kcal goal, so coverage thresholds are 1 700 and 1 300. */
const goal2000: Profile = { ...defaultProfile, saved: { kcal: 2_000 } };

let serial = 0;
/** A diary entry at noon on `dayKey`; macros scale with kcal, no fibre unless given. */
function entry(dayKey: DayKey, kcal: number, more: Partial<DiaryEntry> = {}): DiaryEntry {
  serial += 1;
  return {
    id: `entry-${serial}`,
    name: 'Plain meal',
    kcal,
    protein: kcal / 20,
    carbs: kcal / 10,
    fat: kcal / 50,
    nutrients: {},
    extras: {},
    basis: { kind: 'grams', grams: 300 },
    units: [],
    lines: [],
    progressive: false,
    loggedAt: startOfDay(dayKey) + 12 * HOUR,
    dayKey,
    meal: 'lunch',
    source: 'manual',
    photoIds: [],
    ...more,
  };
}

function weighIn(dayKey: DayKey, hour: number, kg: number): WeighIn {
  serial += 1;
  return { id: `w-${serial}`, at: startOfDay(dayKey) + hour * HOUR, kg };
}

function bodyFat(dayKey: DayKey, hour: number, fraction: number): BodyFatReading {
  serial += 1;
  return { id: `bf-${serial}`, at: startOfDay(dayKey) + hour * HOUR, fraction };
}

function build(input: Partial<EvidenceInput>) {
  return buildEvidence({
    profile: goal2000,
    entries: [],
    weighIns: [],
    bodyFat: [],
    today: TODAY,
    ...input,
  });
}

function loggedRow(rows: readonly { day: DayKey }[], day: DayKey): LoggedDay {
  const row = rows.find((candidate) => candidate.day === day);
  if (!row || !('kcal' in row)) throw new Error(`no logged row for ${day}`);
  return row as LoggedDay;
}

/** Every key of every object inside `value`, at any depth. */
function allKeys(value: unknown, into: string[] = []): string[] {
  if (Array.isArray(value)) value.forEach((item) => allKeys(item, into));
  else if (value !== null && typeof value === 'object') {
    for (const [key, inner] of Object.entries(value)) {
      into.push(key);
      allKeys(inner, into);
    }
  }
  return into;
}

describe('buildEvidence: the food window', () => {
  it('covers the 90 finished days ending yesterday, oldest first', () => {
    const pack = build({});
    expect(finishedDays(TODAY)).toEqual({ first: '2026-07-28', last: '2026-10-25' });
    expect(pack.first).toBe('2026-07-28');
    expect(pack.last).toBe('2026-10-25');
    expect(pack.days).toHaveLength(90);
    expect(pack.days[0]?.day).toBe('2026-07-28');
    expect(pack.days[89]?.day).toBe('2026-10-25');
  });

  it("never counts today's entries (R01.16)", () => {
    const history = [entry(ago(1), 400), entry(ago(2), 1_000), entry(ago(2), 900)];
    const withToday = build({ entries: [...history, entry(TODAY, 1_900), entry(TODAY, 700)] });
    expect(withToday).toEqual(build({ entries: history }));
    expect(withToday.days.some((day) => day.day === TODAY)).toBe(false);
    const week = withToday.periods[0];
    expect([week?.loggedDays, week?.fullDays, week?.logs]).toEqual([2, 1, 3]);
  });

  it('ignores entries from before the window and after today', () => {
    const pack = build({ entries: [entry('2026-07-27', 2_000), entry(ago(-1), 2_000)] });
    expect(pack.days.every((day) => day.coverage === 'none')).toBe(true);
  });

  it('reads a day with no entries as none, with no kcal at all (R01.16)', () => {
    const pack = build({ entries: [entry(ago(1), 1_800)] });
    const empty = pack.days.find((day) => day.day === ago(2));
    expect(empty).toEqual({ day: ago(2), coverage: 'none' });
    expect(empty && 'kcal' in empty).toBe(false);
  });
});

describe('dayCoverage', () => {
  it('marks a day full at 85 % of a 2 000 kcal goal, or at 65 % with two entries', () => {
    expect(dayCoverage(1_700, 1, 2_000)).toBe('full');
    expect(dayCoverage(1_699, 1, 2_000)).toBe('partial');
    expect(dayCoverage(1_300, 2, 2_000)).toBe('full');
    expect(dayCoverage(1_299, 2, 2_000)).toBe('partial');
    expect(dayCoverage(1_300, 1, 2_000)).toBe('partial');
  });

  it('marks a logged 0 kcal day partial and a day without entries none', () => {
    expect(dayCoverage(0, 1, 2_000)).toBe('partial');
    expect(dayCoverage(0, 0, 2_000)).toBe('none');
  });

  it('needs 800 kcal on a busy day even when 65 % of the goal is less', () => {
    expect(dayCoverage(799, 3, 1_000)).toBe('partial');
    expect(dayCoverage(800, 3, 1_000)).toBe('full');
  });

  it('measures pack days against max(800, effective kcal)', () => {
    expect(build({}).kcalGoal).toBe(2_000);
    expect(build({ profile: defaultProfile }).kcalGoal).toBe(2_452);
    const low = build({
      profile: { ...defaultProfile, saved: { kcal: 600 } },
      entries: [entry(ago(1), 680), entry(ago(2), 679)],
    });
    expect(low.kcalGoal).toBe(800);
    expect(loggedRow(low.days, ago(1)).coverage).toBe('full');
    expect(loggedRow(low.days, ago(2)).coverage).toBe('partial');
  });

  it('applies the thresholds to the summed day in the pack', () => {
    const pack = build({
      entries: [entry(ago(1), 700), entry(ago(1), 600), entry(ago(2), 1_300)],
    });
    expect(loggedRow(pack.days, ago(1)).coverage).toBe('full');
    expect(loggedRow(pack.days, ago(2)).coverage).toBe('partial');
  });
});

describe('buildEvidence: daily rows', () => {
  it('sums energy and macros and counts fibre only where an entry recorded it', () => {
    const pack = build({
      entries: [
        entry(ago(1), 600, { nutrients: { fibre: 8 } }),
        entry(ago(1), 400),
        entry(ago(1), 1_000, { nutrients: { fibre: 4.5 } }),
      ],
    });
    expect(loggedRow(pack.days, ago(1))).toEqual({
      day: ago(1),
      coverage: 'full',
      kcal: 2_000,
      protein: 100,
      carbs: 200,
      fat: 40,
      fibre: 12.5,
      fibreLogs: 2,
      logs: 3,
    });
  });

  it('gives fibre null when no entry of the day recorded it', () => {
    const row = loggedRow(build({ entries: [entry(ago(3), 900)] }).days, ago(3));
    expect([row.fibre, row.fibreLogs, row.logs]).toEqual([null, 0, 1]);
  });
});

describe('buildEvidence: period summaries', () => {
  const entries = [
    entry(ago(1), 2_000, { nutrients: { fibre: 20 } }), // full
    entry(ago(3), 900), // partial
    entry(ago(10), 1_800, { nutrients: { fibre: 10 } }), // full
    entry(ago(20), 700), // two entries: 1 400 ≥ 1 300 → full
    entry(ago(20), 700),
    entry(ago(60), 500), // partial
  ];
  const pack = build({ entries });

  it('summarises 7, 14, 28 and 90 days', () => {
    const rows = pack.periods.map((p) => [
      p.days,
      p.loggedDays,
      p.fullDays,
      p.coveragePct,
      p.logs,
      p.avgKcal,
      p.avgFullKcal,
    ]);
    expect(rows).toEqual([
      [7, 2, 1, 14, 2, 1_450, 2_000],
      [14, 3, 2, 14, 3, 1_567, 1_900],
      [28, 4, 3, 10, 5, 1_525, 1_733],
      [90, 5, 3, 3, 6, 1_320, 1_733],
    ]);
  });

  it('averages grams over logged days and fibre over days where it is known', () => {
    const week = pack.periods[0];
    expect(week?.avgProtein).toBeCloseTo((100 + 45) / 2, 10);
    expect(week?.avgCarbs).toBeCloseTo((200 + 90) / 2, 10);
    expect(week?.avgFat).toBeCloseTo((40 + 18) / 2, 10);
    expect(week?.avgFibre).toBe(20);
    expect(pack.periods[1]?.avgFibre).toBe(15);
  });

  it('rounds kcal averages to the nearest whole kcal', () => {
    const halves = build({ entries: [entry(ago(1), 1_000), entry(ago(2), 1_001)] });
    expect(halves.periods[0]?.avgKcal).toBe(1_001);
  });

  it('gives null averages when nothing was logged', () => {
    const empty = build({}).periods[3];
    expect(empty).toEqual({
      days: 90,
      loggedDays: 0,
      fullDays: 0,
      coveragePct: 0,
      logs: 0,
      avgKcal: null,
      avgFullKcal: null,
      avgProtein: null,
      avgCarbs: null,
      avgFat: null,
      avgFibre: null,
    });
  });
});

describe('buildEvidence: confidence', () => {
  const fullDays = (count: number, from = 1): DiaryEntry[] =>
    Array.from({ length: count }, (_, i) => entry(ago(from + i), 1_800));

  it('gives 39 nutrition points for 20 full days in the last 28', () => {
    const pack = build({ entries: fullDays(20) });
    expect(pack.confidence).toMatchObject({ nutrition: 39, weight: 0, energy: 0, score: 39 });
    expect(pack.confidence.label).toBe('low');
    expect(pack.confidence.fullDays28).toBe(20);
  });

  it('only counts full days of the last 28', () => {
    const pack = build({ entries: [...fullDays(10), ...fullDays(30, 29)] });
    expect(pack.confidence.fullDays28).toBe(10);
    expect(pack.confidence.nutrition).toBe(20);
  });

  it('caps nutrition at 55', () => {
    expect([nutritionPoints(0), nutritionPoints(14), nutritionPoints(28)]).toEqual([0, 28, 55]);
    expect(nutritionPoints(40)).toBe(55);
  });

  it('gives 25, 18, 10 or 0 weight points by weigh-in days and span', () => {
    expect(weightPoints(6, 28)).toBe(25);
    expect(weightPoints(6, 27)).toBe(18);
    expect(weightPoints(5, 40)).toBe(18);
    expect(weightPoints(3, 14)).toBe(18);
    expect(weightPoints(3, 13)).toBe(10);
    expect(weightPoints(2, 0)).toBe(10);
    expect(weightPoints(1, 0)).toBe(0);
    expect(weightPoints(0, 0)).toBe(0);
  });

  it('counts weigh-in days (today included) and their span for the weight points', () => {
    const scale = [0, 7, 14, 21, 28, 28].map((days, i) => weighIn(ago(days), 7 + i, 80));
    const pack = build({ weighIns: scale });
    expect(pack.confidence).toMatchObject({ weighIns: 5, weighInSpanDays: 28, weight: 18 });
    const sixDays = build({ weighIns: [...scale, weighIn(ago(3), 7, 80)] });
    expect(sixDays.confidence).toMatchObject({ weighIns: 6, weighInSpanDays: 28, weight: 25 });
  });

  it('labels 70 and above high, 40 and above medium, else low', () => {
    expect([confidenceLabel(70), confidenceLabel(69), confidenceLabel(40)]).toEqual([
      'high',
      'medium',
      'medium',
    ]);
    expect(confidenceLabel(39)).toBe('low');
    const scale = [0, 6, 12, 18, 24, 30].map((days) => weighIn(ago(days), 7, 80));
    const pack = build({ entries: fullDays(28), weighIns: scale });
    expect(pack.confidence).toMatchObject({ nutrition: 55, weight: 25, score: 80, label: 'high' });
  });
});

describe('buildEvidence: weigh-ins and body fat', () => {
  it('keeps the latest reading of each day, today included', () => {
    const pack = build({
      weighIns: [weighIn(ago(1), 21, 80.9), weighIn(ago(1), 7, 80.4), weighIn(TODAY, 7, 80.2)],
      bodyFat: [bodyFat(ago(2), 8, 0.21), bodyFat(ago(2), 6, 0.22)],
    });
    expect(pack.weights).toEqual({
      rows: [
        { day: ago(1), kg: 80.9 },
        { day: TODAY, kg: 80.2 },
      ],
      older: 0,
    });
    expect(pack.bodyFat.rows).toEqual([{ day: ago(2), fraction: 0.21 }]);
  });

  it('leaves out readings from before the window start and after today', () => {
    const pack = build({
      weighIns: [
        { id: 'early', at: startOfDay('2026-07-28') - 1, kg: 90 },
        { id: 'first', at: startOfDay('2026-07-28'), kg: 85 },
        weighIn(ago(-1), 7, 70),
      ],
    });
    expect(pack.weights.rows).toEqual([{ day: '2026-07-28', kg: 85 }]);
  });

  it('counts exactly N finished days in the signal periods, leaving today out', () => {
    const pack = build({
      weighIns: [
        weighIn(TODAY, 7, 80.5),
        weighIn(ago(1), 7, 81),
        weighIn(ago(6), 7, 82),
        weighIn(ago(7), 7, 82.5),
        weighIn(ago(8), 7, 83),
      ],
      bodyFat: [bodyFat(TODAY, 7, 0.2), bodyFat(ago(7), 7, 0.21), bodyFat(ago(9), 7, 0.22)],
    });
    const [week, fortnight] = pack.signals;
    expect(week).toMatchObject({ days: 7, weighIns: 3, weightSpanDays: 6, bodyFatReadings: 1 });
    expect(week?.weightChangeKg).toBeCloseTo(-1.5, 10);
    expect(fortnight).toMatchObject({ weighIns: 4, weightSpanDays: 7, bodyFatReadings: 2 });
    expect(fortnight?.weightChangeKg).toBeCloseTo(-2, 10);
  });

  it('gives no span or change with fewer than two weigh-ins', () => {
    const week = build({ weighIns: [weighIn(ago(2), 7, 80)] }).signals[0];
    expect(week).toEqual({
      days: 7,
      weighIns: 1,
      weightSpanDays: null,
      weightChangeKg: null,
      bodyFatReadings: 0,
    });
  });

  it('keeps the newest 30 days of readings and counts the older ones', () => {
    const daily = Array.from({ length: 40 }, (_, i) => weighIn(ago(i), 7, 80 + i / 10));
    const pack = build({ weighIns: daily });
    expect(pack.weights.rows).toHaveLength(30);
    expect(pack.weights.older).toBe(10);
    expect(pack.weights.rows[0]?.day).toBe(ago(29));
    expect(pack.weights.rows[29]?.day).toBe(TODAY);
    expect(pack.confidence.weighIns).toBe(40);
  });
});

describe('buildEvidence: nutrition detail', () => {
  it('keeps the last 45 logged days, oldest first, and counts the older ones', () => {
    const entries = Array.from({ length: 50 }, (_, i) => entry(ago(1 + i), 1_500));
    const pack = build({ entries });
    expect(pack.nutrition.rows).toHaveLength(45);
    expect(pack.nutrition.older).toBe(5);
    expect(pack.nutrition.rows[0]?.day).toBe(ago(45));
    expect(pack.nutrition.rows[44]?.day).toBe(ago(1));
  });
});

describe('buildEvidence: privacy (R01.16)', () => {
  it('holds none of the names, notes, ingredients, photos or product text of the entries', () => {
    const secretLine = {
      name: 'secret saffron',
      grams: 2,
      kcal: 6,
      protein: 0.2,
      carbs: 1.3,
      fat: 0.1,
      photoIds: ['photo-of-line'],
    };
    const entries = [
      entry(ago(1), 1_900, {
        id: 'entry-id-private',
        name: "Grandma's secret stew",
        note: 'private medication note',
        emoji: '🍲',
        photoIds: ['photo-private-1'],
        lines: [secretLine],
        nutrients: { fibre: 9, sodium: 1_234 },
        product: {
          barcode: '4006381333931',
          ingredients: 'secret ingredient list',
          allergens: ['secret-allergen'],
          traces: [],
          labels: ['secret label'],
          categories: ['secret category'],
        },
      }),
    ];
    const pack = build({ entries, weighIns: [weighIn(ago(1), 7, 71.2)] });
    const json = JSON.stringify(pack);
    for (const secret of [
      "Grandma's secret stew",
      'private medication',
      'secret saffron',
      'photo-private-1',
      'photo-of-line',
      'entry-id-private',
      '4006381333931',
      'secret ingredient list',
      'secret-allergen',
      'secret label',
      'secret category',
      '🍲',
    ]) {
      expect(json).not.toContain(secret);
    }
    expect(loggedRow(pack.days, ago(1)).kcal).toBe(1_900);
  });

  it('has no workout or burn field anywhere in the pack', () => {
    const pack = build({ entries: [entry(ago(1), 1_900)], weighIns: [weighIn(ago(1), 7, 70)] });
    expect(allKeys(pack).filter((key) => /workout|burn|exercise/i.test(key))).toEqual([]);
  });
});

describe('buildEvidence: day boundaries', () => {
  for (const zone of ['America/New_York', 'Asia/Tokyo']) {
    it(`puts weigh-ins on their local day around midnight in ${zone}`, () => {
      inTimeZone(zone, () => {
        const lateYesterday = startOfDay(TODAY) - HOUR / 2;
        const earlyToday = startOfDay(TODAY) + HOUR / 2;
        const pack = build({
          weighIns: [
            { at: lateYesterday, kg: 80 },
            { at: earlyToday, kg: 79.8 },
          ],
        });
        expect(pack.weights.rows).toEqual([
          { day: ago(1), kg: 80 },
          { day: TODAY, kg: 79.8 },
        ]);
        expect(pack.signals[0]?.weighIns).toBe(1);
      });
    });
  }

  it('reads food days from the stored day key, so the pack is the same in Tokyo', () => {
    const entries = [entry(ago(1), 1_800), entry(ago(2), 900), entry(TODAY, 500)];
    const newYork = build({ entries });
    const tokyo = inTimeZone('Asia/Tokyo', () => build({ entries }));
    expect(tokyo).toEqual(newYork);
  });
});
