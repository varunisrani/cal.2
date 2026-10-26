import { describe, expect, it } from 'vitest';
import { inTimeZone } from '../../test/time';
import { addDays, startOfDay, type DayKey } from '../dates/dayKey';
import { FIXTURE_TODAY, defaultProfile, profileWith } from '../goals/__fixtures__/profiles';
import type { BodyFatReading, DiaryEntry, WeighIn } from '../model';
import {
  buildEvidence,
  completedWindow,
  confidenceLevel,
  dayCoverage,
  inWindow,
  weightPoints,
  EVIDENCE_DAYS,
  EVIDENCE_PERIODS,
  type EvidenceInput,
  type EvidencePack,
  type EvidencePeriod,
  type LoggedDay,
} from './evidence';

const HOUR = 3_600_000;
const today = FIXTURE_TODAY;
const daysAgo = (n: number): DayKey => addDays(today, -n);
/** An instant on `day` at `hours` local time. */
const on = (day: DayKey, hours = 12): number => startOfDay(day) + hours * HOUR;

/** Effective kcal 2 000, so the coverage bars are 1 700 (one log) and 1 300 (two logs). */
const target2000 = profileWith({ saved: { kcal: 2000 } });

let counter = 0;
/** An entry on `day` whose macros follow its energy (protein kcal÷20, carbs ÷10, fat ÷50). */
function entry(day: DayKey, kcal: number, changes: Partial<DiaryEntry> = {}): DiaryEntry {
  counter += 1;
  return {
    id: `entry-${counter}`,
    name: 'Porridge',
    kcal,
    protein: kcal / 20,
    carbs: kcal / 10,
    fat: kcal / 50,
    nutrients: {},
    extras: {},
    basis: { kind: 'grams', grams: 100 },
    units: [],
    lines: [],
    progressive: false,
    loggedAt: on(day),
    dayKey: day,
    meal: 'lunch',
    source: 'manual',
    photoIds: [],
    ...changes,
  };
}

function weighIn(at: number, kg: number): WeighIn {
  counter += 1;
  return { id: `weigh-${counter}`, at, kg };
}

function bodyFatAt(at: number, fraction: number): BodyFatReading {
  counter += 1;
  return { id: `fat-${counter}`, at, fraction };
}

function build(changes: Partial<EvidenceInput> = {}): EvidencePack {
  return buildEvidence({
    profile: target2000,
    entries: [],
    weighIns: [],
    bodyFat: [],
    today,
    ...changes,
  });
}

function rowOn(pack: EvidencePack, day: DayKey) {
  return pack.days.find((row) => row.day === day);
}

function loggedOn(pack: EvidencePack, day: DayKey): LoggedDay {
  const row = rowOn(pack, day);
  if (row === undefined || row.coverage === 'none') throw new Error(`no logged row for ${day}`);
  return row;
}

function period(pack: EvidencePack, days: number): EvidencePeriod {
  const found = pack.periods.find((summary) => summary.days === days);
  if (!found) throw new Error(`no ${days}-day period`);
  return found;
}

/** `count` full days (one 1 800 kcal entry each), ending yesterday. */
function fullDays(count: number): DiaryEntry[] {
  return Array.from({ length: count }, (_, index) => entry(daysAgo(index + 1), 1800));
}

describe('completedWindow', () => {
  it('is the 90 finished days ending yesterday', () => {
    expect(completedWindow('2026-10-26')).toEqual({ first: '2026-07-28', last: '2026-10-25' });
    expect(EVIDENCE_DAYS).toBe(90);
  });

  it('holds real day keys from its first through its last day only', () => {
    const range = completedWindow(today);
    expect(inWindow(range.first, range)).toBe(true);
    expect(inWindow(range.last, range)).toBe(true);
    expect(inWindow(today, range)).toBe(false);
    expect(inWindow(addDays(range.first, -1), range)).toBe(false);
    expect(inWindow('2026-10-32', range)).toBe(false);
  });
});

describe('buildEvidence: the food window', () => {
  it('has one row per finished day, oldest first, ending yesterday', () => {
    const pack = build();
    expect(pack.days).toHaveLength(90);
    expect(pack.first).toBe(daysAgo(90));
    expect(pack.last).toBe(daysAgo(1));
    expect(pack.days[0]?.day).toBe(daysAgo(90));
    expect(pack.days[89]?.day).toBe(daysAgo(1));
  });

  it("never counts today's entries (R01.16)", () => {
    const pack = build({ entries: [entry(today, 2100), entry(daysAgo(1), 640)] });
    expect(rowOn(pack, today)).toBeUndefined();
    expect(loggedOn(pack, daysAgo(1))).toMatchObject({ kcal: 640, logs: 1 });
    expect(period(pack, 7)).toMatchObject({ loggedDays: 1, logs: 1, avgKcal: 640 });
    expect(period(pack, 90).logs).toBe(1);
  });

  it('leaves out an entry 91 days back and one dated after today', () => {
    const pack = build({ entries: [entry(daysAgo(91), 1250), entry(addDays(today, 1), 1250)] });
    expect(pack.days.every((row) => row.coverage === 'none')).toBe(true);
    expect(period(pack, 90).loggedDays).toBe(0);
  });

  it('reads a day with no entries as none, holding no kcal at all (R01.16)', () => {
    const pack = build({ entries: [entry(daysAgo(1), 1800)] });
    const empty = rowOn(pack, daysAgo(2));
    expect(empty).toEqual({ day: daysAgo(2), coverage: 'none' });
    expect(empty && 'kcal' in empty).toBe(false);
  });

  it('places entries by their stored day', () => {
    // Logged late in the evening of two days ago but filed on yesterday's diary page.
    const filed = entry(daysAgo(1), 600, { loggedAt: on(daysAgo(2), 23) });
    const pack = build({ entries: [filed] });
    expect(loggedOn(pack, daysAgo(1)).kcal).toBe(600);
    expect(rowOn(pack, daysAgo(2))?.coverage).toBe('none');
  });

  it('sums energy and macros of a day without rounding them', () => {
    const pack = build({
      entries: [
        entry(daysAgo(1), 410, { protein: 20.25, carbs: 30.5, fat: 9.1 }),
        entry(daysAgo(1), 395, { protein: 10.5, carbs: 12.25, fat: 3.3 }),
      ],
    });
    const day = loggedOn(pack, daysAgo(1));
    expect(day.kcal).toBe(805);
    expect(day.logs).toBe(2);
    expect(day.protein).toBeCloseTo(30.75, 10);
    expect(day.carbs).toBeCloseTo(42.75, 10);
    expect(day.fat).toBeCloseTo(12.4, 10);
  });
});

describe('dayCoverage', () => {
  it.each([
    // goal 2 000: full from 1 700 alone, or from 1 300 with two logs
    [2000, 1700, 1, 'full'],
    [2000, 1699, 1, 'partial'],
    [2000, 1300, 2, 'full'],
    [2000, 1299, 2, 'partial'],
    [2000, 1300, 1, 'partial'],
    [2000, 1699, 3, 'full'],
    [2000, 0, 0, 'none'],
    // goal 1 000: 0.65 × goal is 650, so two logs still need 800
    [1000, 850, 1, 'full'],
    [1000, 849, 1, 'partial'],
    [1000, 800, 2, 'full'],
    [1000, 799, 2, 'partial'],
    // a goal below 800 is judged as 800: full from 680
    [600, 680, 1, 'full'],
    [600, 679, 1, 'partial'],
  ] as const)('goal %i, %i kcal over %i logs → %s', (goal, kcal, logs, expected) => {
    expect(dayCoverage(kcal, logs, goal)).toBe(expected);
  });

  it('judges days against a saved kcal target of 2 000 at 0.85 and 0.65', () => {
    const pack = build({
      entries: [
        entry(daysAgo(1), 1699),
        entry(daysAgo(2), 650),
        entry(daysAgo(2), 650),
        entry(daysAgo(3), 1700),
        entry(daysAgo(4), 1300),
      ],
    });
    expect(pack.goalKcal).toBe(2000);
    expect(loggedOn(pack, daysAgo(1)).coverage).toBe('partial');
    expect(loggedOn(pack, daysAgo(2)).coverage).toBe('full');
    expect(loggedOn(pack, daysAgo(3)).coverage).toBe('full');
    expect(loggedOn(pack, daysAgo(4)).coverage).toBe('partial');
  });

  it('uses the formula kcal when nothing is saved, and never a goal below 800', () => {
    expect(build({ profile: defaultProfile }).goalKcal).toBe(2452);
    expect(build({ profile: profileWith({ saved: { kcal: 600 } }) }).goalKcal).toBe(800);
  });
});

describe('buildEvidence: fibre', () => {
  it('sums fibre only over entries that recorded it, known in 2 of 3 logs', () => {
    const pack = build({
      entries: [
        entry(daysAgo(1), 500, { nutrients: { fibre: 7.5 } }),
        entry(daysAgo(1), 500, { nutrients: { fibre: 4.5, sodium: 300 } }),
        entry(daysAgo(1), 500, { nutrients: { sodium: 200 } }),
      ],
    });
    expect(loggedOn(pack, daysAgo(1))).toMatchObject({ fibre: 12, fibreLogs: 2, logs: 3 });
  });

  it('gives no fibre value, rather than 0, when no entry of the day recorded it', () => {
    const pack = build({ entries: [entry(daysAgo(1), 500), entry(daysAgo(1), 500)] });
    expect(loggedOn(pack, daysAgo(1))).toMatchObject({ fibre: null, fibreLogs: 0, logs: 2 });
  });

  it('averages fibre over the logged days that know it', () => {
    const pack = build({
      entries: [
        entry(daysAgo(1), 900, { nutrients: { fibre: 10 } }),
        entry(daysAgo(2), 900, { nutrients: { fibre: 21 } }),
        entry(daysAgo(3), 900),
      ],
    });
    expect(period(pack, 7).avgFibre).toBe(15.5);
  });
});

describe('buildEvidence: period summaries', () => {
  // yesterday: two logs, 1 850 kcal (full); 3 days ago: 520 (partial); 10 days ago: 2 050 (full)
  const pack = build({
    entries: [
      entry(daysAgo(1), 1100),
      entry(daysAgo(1), 750),
      entry(daysAgo(3), 520),
      entry(daysAgo(10), 2050),
    ],
  });

  it('summarises the spans 7, 14, 28 and 90 in that order', () => {
    expect(pack.periods.map((summary) => summary.days)).toEqual([...EVIDENCE_PERIODS]);
    expect(pack.signals.map((summary) => summary.days)).toEqual([...EVIDENCE_PERIODS]);
  });

  it('counts logged days, full days, logs and coverage per span', () => {
    expect(period(pack, 7)).toMatchObject({
      loggedDays: 2,
      fullDays: 1,
      logs: 3,
      coveragePercent: 14,
    });
    expect(period(pack, 14)).toMatchObject({
      loggedDays: 3,
      fullDays: 2,
      logs: 4,
      coveragePercent: 14,
    });
    expect(period(pack, 90)).toMatchObject({ loggedDays: 3, fullDays: 2, coveragePercent: 2 });
  });

  it('averages over logged days and over full days', () => {
    expect(period(pack, 7)).toMatchObject({
      avgKcal: 1185,
      avgFullKcal: 1850,
      avgProtein: 59.3,
      avgCarbs: 118.5,
      avgFat: 23.7,
      avgFibre: null,
    });
    expect(period(pack, 14)).toMatchObject({ avgKcal: 1473, avgFullKcal: 1950 });
  });

  it('rounds kcal averages to whole kcal and gram averages to one decimal', () => {
    const rounded = build({
      entries: [
        entry(daysAgo(1), 1001, { protein: 10.04, carbs: 5, fat: 2.26 }),
        entry(daysAgo(2), 1002, { protein: 10.08, carbs: 6, fat: 2.3 }),
      ],
    });
    expect(period(rounded, 7)).toMatchObject({ avgKcal: 1002, avgProtein: 10.1, avgFat: 2.3 });
  });

  it('leaves every average empty, not 0, for a span with nothing logged', () => {
    expect(period(build(), 28)).toEqual({
      days: 28,
      loggedDays: 0,
      fullDays: 0,
      coveragePercent: 0,
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

describe('buildEvidence: signal summaries', () => {
  const pack = build({
    weighIns: [
      weighIn(on(today, 7), 79.0),
      weighIn(on(daysAgo(1)), 80.0),
      weighIn(on(daysAgo(5)), 80.6),
      weighIn(on(daysAgo(20)), 81.5),
    ],
    bodyFat: [bodyFatAt(on(daysAgo(3)), 0.21), bodyFatAt(on(today), 0.2)],
  });

  it("covers exactly N finished days, leaving today's readings out", () => {
    const week = pack.signals[0];
    expect(week).toMatchObject({ days: 7, weighIns: 2, weightSpanDays: 4, bodyFatReadings: 1 });
    expect(week?.weightChangeKg).toBeCloseTo(-0.6, 10);
    const month = pack.signals[2];
    expect(month).toMatchObject({ days: 28, weighIns: 3, weightSpanDays: 19 });
    expect(month?.weightChangeKg).toBeCloseTo(-1.5, 10);
  });

  it('gives no span or change below two weigh-ins', () => {
    const one = build({ weighIns: [weighIn(on(daysAgo(2)), 80)] });
    expect(one.signals[0]).toEqual({
      days: 7,
      weighIns: 1,
      weightSpanDays: null,
      weightChangeKg: null,
      bodyFatReadings: 0,
    });
  });
});

describe('buildEvidence: dated readings', () => {
  it('keeps the latest weigh-in of each day, today included', () => {
    const pack = build({
      weighIns: [
        weighIn(on(daysAgo(1), 21), 80.1),
        weighIn(on(daysAgo(1), 8), 80.4),
        weighIn(on(today, 7), 79.9),
      ],
    });
    expect(pack.weights).toEqual({
      rows: [
        { day: daysAgo(1), kg: 80.1 },
        { day: today, kg: 79.9 },
      ],
      older: 0,
    });
  });

  it('keeps the later of two readings at the same instant', () => {
    const at = on(daysAgo(2));
    const pack = build({ weighIns: [weighIn(at, 80), weighIn(at, 81)] });
    expect(pack.weights.rows).toEqual([{ day: daysAgo(2), kg: 81 }]);
  });

  it('leaves out readings before the window and after today', () => {
    const pack = build({
      weighIns: [weighIn(on(daysAgo(91)), 82), weighIn(on(addDays(today, 1)), 78)],
      bodyFat: [bodyFatAt(on(daysAgo(91)), 0.25)],
    });
    expect(pack.weights.rows).toEqual([]);
    expect(pack.bodyFat.rows).toEqual([]);
  });

  it('keeps the latest 30 reading days and counts the older ones', () => {
    const readings = Array.from({ length: 40 }, (_, index) =>
      weighIn(on(daysAgo(index)), 80 - index / 10),
    );
    const pack = build({ weighIns: readings });
    expect(pack.weights.rows).toHaveLength(30);
    expect(pack.weights.older).toBe(10);
    expect(pack.weights.rows[0]?.day).toBe(daysAgo(29));
    expect(pack.weights.rows[29]?.day).toBe(today);
  });

  it('gives body fat in percent, latest of each day', () => {
    const pack = build({
      bodyFat: [bodyFatAt(on(daysAgo(1), 7), 0.265), bodyFatAt(on(daysAgo(1), 20), 0.27)],
    });
    expect(pack.bodyFat.rows).toHaveLength(1);
    expect(pack.bodyFat.rows[0]?.day).toBe(daysAgo(1));
    expect(pack.bodyFat.rows[0]?.percent).toBeCloseTo(27, 10);
  });

  it('keeps the last 45 logged days as detail and counts the older ones', () => {
    const pack = build({ entries: fullDays(50) });
    expect(pack.loggedDays.rows).toHaveLength(45);
    expect(pack.loggedDays.older).toBe(5);
    expect(pack.loggedDays.rows[0]?.day).toBe(daysAgo(45));
    expect(pack.loggedDays.rows[44]?.day).toBe(daysAgo(1));
    expect(period(pack, 90).loggedDays).toBe(50);
  });
});

describe('buildEvidence: confidence', () => {
  it('gives 39 nutrition points for 20 full days in the latest 28', () => {
    const confidence = build({ entries: fullDays(20) }).confidence;
    expect(confidence).toMatchObject({
      nutritionPoints: 39,
      fullDaysInSpan: 20,
      weightPoints: 0,
      energyPoints: 0,
      score: 39,
      level: 'low',
    });
  });

  it('counts only the latest 28 days and caps nutrition at 55', () => {
    expect(build({ entries: fullDays(28) }).confidence.nutritionPoints).toBe(55);
    expect(build({ entries: fullDays(60) }).confidence).toMatchObject({
      nutritionPoints: 55,
      fullDaysInSpan: 28,
    });
    // partial days earn nothing
    const partial = Array.from({ length: 28 }, (_, index) => entry(daysAgo(index + 1), 900));
    expect(build({ entries: partial }).confidence.nutritionPoints).toBe(0);
  });

  it.each([
    [6, 28, 25],
    [6, 27, 18],
    [5, 28, 18],
    [3, 14, 18],
    [3, 13, 10],
    [2, 0, 10],
    [1, 0, 0],
    [0, 0, 0],
  ])('weight tier: %i weigh-in days over %i days → %i points', (count, span, points) => {
    expect(weightPoints(count, span)).toBe(points);
  });

  it('counts weigh-in days over the window through today for the weight points', () => {
    const six = [0, 6, 12, 18, 24, 28].map((ago) => weighIn(on(daysAgo(ago)), 80));
    expect(build({ weighIns: six }).confidence).toMatchObject({
      weightPoints: 25,
      weighInDays: 6,
      weighInSpanDays: 28,
    });
    // two readings on one day are one weigh-in day
    const sameDay = [weighIn(on(daysAgo(1), 7), 80), weighIn(on(daysAgo(1), 19), 80.2)];
    expect(build({ weighIns: sameDay }).confidence).toMatchObject({
      weightPoints: 0,
      weighInDays: 1,
      weighInSpanDays: 0,
    });
  });

  it('adds the parts and labels the score at 70 and 40', () => {
    const six = [0, 6, 12, 18, 24, 28].map((ago) => weighIn(on(daysAgo(ago)), 80));
    expect(build({ entries: fullDays(28), weighIns: six }).confidence).toMatchObject({
      score: 80,
      level: 'high',
    });
    expect(confidenceLevel(70)).toBe('high');
    expect(confidenceLevel(69)).toBe('medium');
    expect(confidenceLevel(40)).toBe('medium');
    expect(confidenceLevel(39)).toBe('low');
  });
});

describe('buildEvidence: privacy', () => {
  it('holds none of the names, notes, ingredients, photos, product text or ids of the fixture (R01.16)', () => {
    const secretEntry = entry(daysAgo(1), 1840, {
      id: 'entry-id-5f3a',
      name: 'Grandma Rosa lasagne',
      note: 'eaten after my clinic visit',
      emoji: '🍝',
      photoIds: ['photo-id-9c21'],
      nutrients: { fibre: 6 },
      lines: [
        {
          name: 'Truffle butter',
          grams: 20,
          kcal: 140,
          protein: 0,
          carbs: 0,
          fat: 15,
          photoIds: ['photo-id-line-77'],
        },
      ],
      product: {
        barcode: '4006381333931',
        package: '450 g tray',
        ingredients: 'Durum wheat semolina, ricotta',
        allergens: ['gluten'],
        traces: ['sesame'],
        labels: ['family-size'],
        categories: ['ready meals'],
        imageUrl: 'https://images.example/lasagne.jpg',
      },
    });
    const pack = buildEvidence({
      profile: profileWith({ saved: { kcal: 2000 }, allergens: ['peanut-allergy-note'] }),
      entries: [secretEntry, entry(today, 300, { name: 'Midnight cereal' })],
      weighIns: [{ id: 'weigh-id-8d10', at: on(daysAgo(1)), kg: 68.7 }],
      bodyFat: [{ id: 'fat-id-2b44', at: on(daysAgo(1)), fraction: 0.23 }],
      today,
    });

    const text = JSON.stringify(pack);
    for (const secret of [
      'Grandma Rosa lasagne',
      'clinic visit',
      '🍝',
      'photo-id-9c21',
      'Truffle butter',
      'photo-id-line-77',
      '4006381333931',
      '450 g tray',
      'Durum wheat',
      'gluten',
      'sesame',
      'family-size',
      'ready meals',
      'images.example',
      'entry-id-5f3a',
      'weigh-id-8d10',
      'fat-id-2b44',
      'peanut-allergy-note',
      'Midnight cereal',
    ]) {
      expect(text).not.toContain(secret);
    }
    // The numbers are there.
    expect(loggedOn(pack, daysAgo(1))).toMatchObject({ kcal: 1840, fibre: 6 });
    expect(pack.weights.rows).toEqual([{ day: daysAgo(1), kg: 68.7 }]);
  });

  it('has no workout or measured-energy rows and adds no energy points in v1 (R01.16)', () => {
    const pack = build({ entries: fullDays(28) });
    expect(Object.keys(pack).sort()).toEqual(
      [
        'bodyFat',
        'confidence',
        'days',
        'first',
        'goalKcal',
        'last',
        'loggedDays',
        'periods',
        'signals',
        'weights',
      ].sort(),
    );
    expect(Object.keys(pack.signals[0] ?? {}).sort()).toEqual(
      ['bodyFatReadings', 'days', 'weighIns', 'weightChangeKg', 'weightSpanDays'].sort(),
    );
    expect(pack.confidence).toMatchObject({ energyPoints: 0, energyDays: 0 });
  });
});

describe('buildEvidence: time zones', () => {
  it('counts readings on the 25-hour day once, by local day (New York)', () => {
    // 2026-11-01 is 25 hours long in New York.
    const later = '2026-11-10';
    const pack = buildEvidence({
      profile: target2000,
      entries: [],
      weighIns: [
        weighIn(new Date(2026, 10, 1, 0, 30).getTime(), 80.4),
        weighIn(new Date(2026, 10, 1, 23, 30).getTime(), 80.1),
        weighIn(new Date(2026, 10, 2, 0, 10).getTime(), 80.0),
      ],
      bodyFat: [],
      today: later,
    });
    expect(pack.weights.rows).toEqual([
      { day: '2026-11-01', kg: 80.1 },
      { day: '2026-11-02', kg: 80.0 },
    ]);
  });

  it('files a late-evening weigh-in on its local day in Tokyo', () => {
    inTimeZone('Asia/Tokyo', () => {
      const pack = build({ weighIns: [weighIn(new Date(2026, 9, 25, 23, 30).getTime(), 64.2)] });
      expect(pack.weights.rows).toEqual([{ day: '2026-10-25', kg: 64.2 }]);
      expect(pack.signals[0]?.weighIns).toBe(1);
    });
  });
});
