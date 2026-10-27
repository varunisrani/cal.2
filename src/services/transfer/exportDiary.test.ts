import { describe, expect, it, vi } from 'vitest';
import { createDiaryRepo } from '../../data/repos/diaryRepo';
import { createTransferRepo } from '../../data/repos/transferRepo';
import { NUTRIENT_KEYS, type DiaryEntry, type NutrientValues } from '../../domain/model';
import { openTestDb } from '../../test/db';
import { FACTORY_NOW, makeEntry, makeLine, makeWater } from '../../test/factories';
import {
  buildDocument,
  diaryFileName,
  handOver,
  resolveRange,
  toJson,
  type DiaryFile,
  type FileHandOver,
} from './exportDiary';
import { createTransferService, type ExportRequest } from './transfer';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
/** Monday 26 October 2026, 12:30 in New York (the test zone). */
const MON = '2026-10-26';
const SUN = '2026-10-25';
const at = (day: string, time: string) => Date.parse(`${day}T${time}:00-04:00`);
const TARGETS = { kcal: 2000, protein: 120, carbs: 200, fat: 60 };

/** Every one of the 23 nutrients, 1.04 … 23.04 in catalogue order. */
const ALL_NUTRIENTS = Object.fromEntries(
  NUTRIENT_KEYS.map((key, index) => [key, index + 1.04]),
) as NutrientValues;

describe('resolveRange', () => {
  /** Wednesday 28 October 2026. */
  const WED = '2026-10-28';

  it('starts This week on the app week start: Sunday for a Sunday start (R06.17)', () => {
    expect(resolveRange({ kind: 'week' }, WED, 'sun', null)).toEqual({
      start: '2026-10-25',
      end: WED,
    });
    expect(resolveRange({ kind: 'week' }, WED, 'mon', null)).toEqual({
      start: '2026-10-26',
      end: WED,
    });
    // On the week's first day the week is that day alone.
    expect(resolveRange({ kind: 'week' }, SUN, 'sun', null)).toEqual({ start: SUN, end: SUN });
  });

  it('covers today alone, and this month from its first day', () => {
    expect(resolveRange({ kind: 'today' }, WED, 'mon', null)).toEqual({ start: WED, end: WED });
    expect(resolveRange({ kind: 'month' }, WED, 'mon', null)).toEqual({
      start: '2026-10-01',
      end: WED,
    });
  });

  it('runs All time from the earliest day with food or water, or today when there is none', () => {
    expect(resolveRange({ kind: 'all' }, WED, 'mon', '2025-02-03')).toEqual({
      start: '2025-02-03',
      end: WED,
    });
    expect(resolveRange({ kind: 'all' }, WED, 'mon', null)).toEqual({ start: WED, end: WED });
  });

  it('swaps a custom pair given end first', () => {
    expect(resolveRange({ kind: 'custom', from: WED, to: SUN }, WED, 'mon', null)).toEqual({
      start: SUN,
      end: WED,
    });
  });
});

describe('diaryFileName', () => {
  it('names the file after its days and format', () => {
    const range = { start: SUN, end: MON };
    expect(diaryFileName(range, 'json')).toBe('platewise-diary-2026-10-25_to_2026-10-26.json');
    expect(diaryFileName(range, 'markdown')).toBe('platewise-diary-2026-10-25_to_2026-10-26.md');
    expect(diaryFileName(range, 'csv')).toBe('platewise-diary-2026-10-25_to_2026-10-26.csv');
  });
});

describe('buildDocument', () => {
  const range = { start: '2026-10-24', end: MON };

  it('writes our own format: id, version, range and the days with food or water only', () => {
    const document = buildDocument({
      range,
      entries: [makeEntry({ loggedAt: at(MON, '12:30') })],
      water: [makeWater({ at: at(SUN, '09:15'), ml: 300 })],
      targets: TARGETS,
    });

    expect(document.format).toBe('platewise-diary');
    expect(document.version).toBe('1.0');
    expect(document.range).toEqual(range);
    // Saturday has nothing and is left out; Sunday has only water and is a day of the file.
    expect(document.days.map((day) => day.date)).toEqual([SUN, MON]);
    const sunday = document.days[0];
    expect(sunday?.meals).toEqual([]);
    expect(sunday?.totals).toEqual({ kcal: 0, protein: 0, carbs: 0, fat: 0 });
    expect(sunday?.water).toEqual([{ id: expect.any(String), time: '09:15', ml: 300 }]);
    expect(sunday?.waterTotalMl).toBe(300);
  });

  it('leaves out what falls outside the range', () => {
    const document = buildDocument({
      range: { start: MON, end: MON },
      entries: [makeEntry({ loggedAt: at(SUN, '20:00') })],
      water: [makeWater({ at: at(SUN, '20:00') })],
      targets: TARGETS,
    });
    expect(document.days).toEqual([]);
  });

  it('lists meals in the fixed order and each meal oldest first', () => {
    const entry = (name: string, meal: DiaryEntry['meal'], time: string) =>
      makeEntry({ name, meal, loggedAt: at(MON, time) });
    const document = buildDocument({
      range: { start: MON, end: MON },
      entries: [
        entry('Tea', 'other', '21:00'),
        entry('Apple', 'snack', '16:00'),
        entry('Soup', 'lunch', '13:30'),
        entry('Toast', 'breakfast', '08:30'),
        entry('Bread', 'lunch', '12:15'),
        entry('Eggs', 'breakfast', '07:45'),
        entry('Pasta', 'dinner', '19:00'),
      ],
      water: [],
      targets: TARGETS,
    });

    expect(
      document.days[0]?.meals.map(({ meal, items }) => [meal, items.map((item) => item.name)]),
    ).toEqual([
      ['breakfast', ['Eggs', 'Toast']],
      ['lunch', ['Bread', 'Soup']],
      ['dinner', ['Pasta']],
      ['snack', ['Apple']],
      ['other', ['Tea']],
    ]);
  });

  it('writes every value of an item: nutrients and extras keyed with their unit, parts, note', () => {
    const entry = makeEntry({
      id: '7f0c7c9e-6a55-4c8e-9e43-7d3e8c1f2a10',
      name: 'Rice bowl',
      kcal: 512.4,
      protein: 20.44,
      carbs: 70.06,
      fat: 12.25,
      nutrients: ALL_NUTRIENTS,
      extras: { creatine: 5.04, arginine: 0.011 },
      basis: { kind: 'grams', grams: 250.04 },
      lines: [makeLine({ name: 'Rice', grams: 150.04, kcal: 168, protein: 3.46 })],
      note: 'Extra chilli',
      source: 'manual',
      loggedAt: at(MON, '12:07'),
      meal: 'lunch',
    });
    const [item] =
      buildDocument({
        range: { start: MON, end: MON },
        entries: [entry],
        water: [],
        targets: TARGETS,
      }).days[0]?.meals[0]?.items ?? [];

    expect(item).toEqual({
      id: '7f0c7c9e-6a55-4c8e-9e43-7d3e8c1f2a10',
      name: 'Rice bowl',
      grams: 250,
      kcal: 512,
      protein: 20.4,
      carbs: 70.1,
      fat: 12.3,
      nutrients: expect.any(Object),
      extras: { arginineG: 0.011, creatineG: 5.04 },
      time: '12:07',
      source: 'manual',
      note: 'Extra chilli',
      lines: [{ name: 'Rice', grams: 150, kcal: 168, protein: 3.5, carbs: 35, fat: 1.4 }],
    });
    // All 23, each with its unit in the key, to one decimal.
    expect(Object.keys(item?.nutrients ?? {})).toHaveLength(23);
    expect(item?.nutrients).toMatchObject({
      addedSugarG: 1,
      fibreG: 2,
      caffeineMg: 9,
      sodiumMg: 15,
      vitaminB12Mcg: 21,
      vitaminKMcg: 23,
    });
  });

  it('leaves out what is unknown: no weight for a servings basis, no blank note, no nutrient', () => {
    const [item] =
      buildDocument({
        range: { start: MON, end: MON },
        entries: [
          makeEntry({
            basis: { kind: 'servings', count: 2 },
            note: '   ',
            nutrients: {},
            source: 'photo',
          }),
        ],
        water: [],
        targets: TARGETS,
      }).days[0]?.meals[0]?.items ?? [];

    expect(item).not.toHaveProperty('grams');
    expect(item).not.toHaveProperty('note');
    expect(item?.nutrients).toEqual({});
    // Every source but manual is an estimate.
    expect(item?.source).toBe('ai');
  });

  it('adds up the day, compares it with the targets and never leaves less than 0', () => {
    const document = buildDocument({
      range: { start: MON, end: MON },
      entries: [
        makeEntry({ kcal: 1800, protein: 100.04, carbs: 150.02, fat: 70 }),
        makeEntry({ kcal: 450, protein: 30, carbs: 20, fat: 5.07 }),
      ],
      water: [makeWater({ ml: 250 }), makeWater({ ml: 500 })],
      targets: TARGETS,
    });
    const day = document.days[0];

    expect(day?.totals).toEqual({ kcal: 2250, protein: 130, carbs: 170, fat: 75.1 });
    expect(day?.targets).toEqual(TARGETS);
    expect(day?.left).toEqual({ kcal: 0, protein: 0, carbs: 30, fat: 0 });
    expect(day?.waterTotalMl).toBe(750);
  });

  it('writes targets of 0 without a profile', () => {
    const document = buildDocument({
      range: { start: MON, end: MON },
      entries: [makeEntry()],
      water: [],
      targets: null,
    });
    expect(document.days[0]?.targets).toEqual({ kcal: 0, protein: 0, carbs: 0, fat: 0 });
    expect(document.days[0]?.left).toEqual({ kcal: 0, protein: 0, carbs: 0, fat: 0 });
  });

  it('round-trips through JSON text unchanged', () => {
    const document = buildDocument({
      range: { start: MON, end: MON },
      entries: [makeEntry()],
      water: [makeWater()],
      targets: TARGETS,
    });
    expect(JSON.parse(toJson(document))).toEqual(document);
  });
});

describe('exporting from the diary (the transfer service)', () => {
  async function setUp() {
    const { db } = await openTestDb();
    const diary = createDiaryRepo(db);
    const service = createTransferService({
      transferRepo: createTransferRepo(db),
      photoRepo: { releaseIfUnused: async () => [] },
    });
    return { db, diary, service };
  }

  const request = (overrides: Partial<ExportRequest> = {}): ExportRequest => ({
    range: { kind: 'week' },
    format: 'json',
    today: MON,
    weekStart: 'sun',
    energyUnit: 'kcal',
    targets: TARGETS,
    ...overrides,
  });

  it('says empty, and makes no file, when no day of the range has food or water', async () => {
    const { db, diary, service } = await setUp();
    await diary.add(makeEntry({ loggedAt: FACTORY_NOW - 10 * DAY }));

    expect(await service.exportDiary(request())).toEqual({ kind: 'empty' });
    db.close();
  });

  it('exports This week from a Sunday start with a water-only day (R06.17)', async () => {
    const { db, diary, service } = await setUp();
    await diary.add(makeEntry({ loggedAt: at('2026-10-24', '12:00') }));
    await db.water.put(makeWater({ at: at(SUN, '09:00') }));
    await diary.add(makeEntry({ loggedAt: at(MON, '12:00') }));

    const result = await service.exportDiary(request());

    expect(result.kind).toBe('file');
    const file = result.kind === 'file' ? result.file : null;
    expect(file?.name).toBe('platewise-diary-2026-10-25_to_2026-10-26.json');
    expect(file?.type).toBe('application/json');
    const days = JSON.parse(file?.text ?? '{}').days as { date: string }[];
    expect(days.map((day) => day.date)).toEqual([SUN, MON]);
    db.close();
  });

  it('starts All time on the first day with water when water came first', async () => {
    const { db, diary, service } = await setUp();
    await db.water.put(makeWater({ at: at('2026-09-02', '08:00') }));
    await diary.add(makeEntry({ loggedAt: at(MON, '12:00') }));

    const result = await service.exportDiary(request({ range: { kind: 'all' }, format: 'csv' }));

    expect(result.kind === 'file' && result.file.name).toBe(
      'platewise-diary-2026-09-02_to_2026-10-26.csv',
    );
    db.close();
  });

  it("keeps kcal in a kJ reader's file (R06.14, ACC-K1-2)", async () => {
    const { db, diary, service } = await setUp();
    await diary.add(makeEntry({ kcal: 410, loggedAt: at(MON, '12:00') }));

    const result = await service.exportDiary(request({ energyUnit: 'kJ' }));

    const document = JSON.parse(result.kind === 'file' ? result.file.text : '{}');
    expect(document.days[0].totals.kcal).toBe(410);
    expect(document.days[0].targets.kcal).toBe(2000);
    expect(document.days[0].meals[0].items[0].kcal).toBe(410);
    db.close();
  });
});

describe('handOver', () => {
  const file: DiaryFile = {
    name: 'platewise-diary-2026-10-26_to_2026-10-26.csv',
    type: 'text/csv',
    text: 'date\r\n',
  };

  function browser(overrides: Partial<FileHandOver> = {}) {
    return {
      canShare: vi.fn(() => true),
      share: vi.fn(async () => undefined),
      download: vi.fn(),
      ...overrides,
    };
  }

  it('offers the file to the share sheet when the browser can share it', async () => {
    const share = vi.fn(async (_data: ShareData) => undefined);
    const shell = browser({ share });

    expect(await handOver(file, shell)).toBe('shared');

    const [sent] = share.mock.calls[0]?.[0].files ?? [];
    expect(sent?.name).toBe(file.name);
    expect(sent?.type).toBe('text/csv');
    expect(await sent?.text()).toBe('date\r\n');
    expect(shell.download).not.toHaveBeenCalled();
  });

  it('downloads when the browser cannot share files, or that file', async () => {
    const noApi = browser({ canShare: undefined, share: undefined });
    expect(await handOver(file, noApi)).toBe('downloaded');
    expect(noApi.download).toHaveBeenCalledWith(expect.objectContaining({ name: file.name }));

    const refused = browser({ canShare: vi.fn(() => false) });
    expect(await handOver(file, refused)).toBe('downloaded');
    expect(refused.share).not.toHaveBeenCalled();
  });

  it('does nothing more when the person closes the share sheet', async () => {
    const shell = browser({
      share: vi.fn(async () => {
        throw new DOMException('Share canceled', 'AbortError');
      }),
    });
    expect(await handOver(file, shell)).toBe('cancelled');
    expect(shell.download).not.toHaveBeenCalled();
  });

  it('downloads when sharing fails for another reason', async () => {
    const shell = browser({
      share: vi.fn(async () => {
        throw new DOMException('No user gesture', 'NotAllowedError');
      }),
    });
    expect(await handOver(file, shell)).toBe('downloaded');
    expect(shell.download).toHaveBeenCalledOnce();
  });
});
