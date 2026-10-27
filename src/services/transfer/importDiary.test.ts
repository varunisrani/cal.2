import { describe, expect, it, vi } from 'vitest';
import { createDiaryRepo } from '../../data/repos/diaryRepo';
import { createPhotoRepo } from '../../data/repos/photoRepo';
import { createTransferRepo, type StoredDays } from '../../data/repos/transferRepo';
import type { DiaryEntry, WaterLog } from '../../domain/model';
import type { IdSource } from '../../lib/ids';
import { storableBlob } from '../../test/blobs';
import { openTestDb } from '../../test/db';
import { makeEntry, makeLine, makeProduct, makeWater } from '../../test/factories';
import { buildDocument, toJson } from './exportDiary';
import {
  MAX_IMPORT_BYTES,
  planImport,
  previewOf,
  readDiaryFile,
  readPickedFile,
  type DiaryImport,
  type ImportProblem,
} from './importDiary';
import { createTransferService } from './transfer';

const MON = '2026-10-26';
const SUN = '2026-10-25';
const SAT = '2026-10-24';
/** An instant at a New York wall-clock time (the test zone, EDT in October). */
const at = (day: string, time: string) => Date.parse(`${day}T${time}:00-04:00`);
const TARGETS = { kcal: 2000, protein: 120, carbs: 200, fat: 60 };

/** UUIDs counting up: …-000000000001, …-000000000002, … */
function uuids(prefix = '0'): IdSource {
  let next = 0;
  return () => `${prefix.repeat(8)}-0000-4000-8000-${String(++next).padStart(12, '0')}`;
}
const uuid = (n: number) => `aaaaaaaa-0000-4000-8000-${String(n).padStart(12, '0')}`;

/** A file's food item, valid as it stands. */
function food(overrides: Record<string, unknown> = {}) {
  return {
    name: 'Rice bowl',
    grams: 250,
    kcal: 500,
    protein: 20,
    carbs: 70,
    fat: 12,
    nutrients: { fibreG: 2 },
    extras: {},
    time: '12:30',
    source: 'ai',
    lines: [],
    ...overrides,
  };
}

/** A whole file of one day (or the days given), as text. */
function file(
  days: unknown[] = [{ date: MON, meals: [{ meal: 'lunch', items: [food()] }] }],
  root: Record<string, unknown> = {},
): string {
  return JSON.stringify({
    format: 'platewise-diary',
    version: '1.0',
    range: { start: days.length > 1 ? SAT : MON, end: MON },
    days,
    ...root,
  });
}

function read(text: string): DiaryImport {
  const result = readDiaryFile(text);
  if (!result.ok) throw new Error(`refused: ${JSON.stringify(result.problem)}`);
  return result.file;
}

function problemOf(text: string): ImportProblem | null {
  const result = readDiaryFile(text);
  return result.ok ? null : result.problem;
}

describe('readDiaryFile', () => {
  it('reads our own export back, every value', () => {
    const entry = makeEntry({
      id: uuid(1),
      name: 'Rice bowl',
      kcal: 512,
      protein: 20.4,
      carbs: 70.1,
      fat: 12.3,
      nutrients: { fibre: 3.3, sodium: 8.8, vitaminB12: 18.8 },
      extras: { creatine: 5, arginine: 0.011 },
      basis: { kind: 'grams', grams: 250 },
      lines: [makeLine({ name: 'Rice', grams: 150, kcal: 168, protein: 3.5, carbs: 35, fat: 1.4 })],
      note: 'Extra chilli',
      source: 'manual',
      meal: 'lunch',
      loggedAt: at(MON, '12:07'),
    });
    const water = makeWater({ id: uuid(2), at: at(SUN, '09:15'), ml: 300 });
    const text = toJson(
      buildDocument({
        range: { start: SUN, end: MON },
        entries: [entry],
        water: [water],
        targets: TARGETS,
      }),
    );

    expect(read(text)).toEqual({
      range: { start: SUN, end: MON },
      foods: [
        {
          id: uuid(1),
          name: 'Rice bowl',
          date: MON,
          time: '12:07',
          loggedAt: at(MON, '12:07'),
          meal: 'lunch',
          kcal: 512,
          protein: 20.4,
          carbs: 70.1,
          fat: 12.3,
          grams: 250,
          nutrients: { fibre: 3.3, sodium: 8.8, vitaminB12: 18.8 },
          extras: { creatine: 5, arginine: 0.011 },
          source: 'manual',
          note: 'Extra chilli',
          lines: [{ name: 'Rice', grams: 150, kcal: 168, protein: 3.5, carbs: 35, fat: 1.4 }],
        },
      ],
      water: [{ id: uuid(2), date: SUN, at: at(SUN, '09:15'), ml: 300 }],
    });
  });

  it('takes any 1.x version, a meal in capitals, a range given end first and no ids', () => {
    const text = JSON.stringify({
      format: 'platewise-diary',
      version: '1.7',
      range: { start: MON, end: SUN },
      days: [{ date: SUN, meals: [{ meal: 'Lunch', items: [food()] }], extra: true }],
      exportedBy: 'a later 1.x',
    });
    const read1 = read(text);
    expect(read1.range).toEqual({ start: SUN, end: MON });
    expect(read1.foods[0]).toMatchObject({ id: null, meal: 'lunch', date: SUN });
    // No day has a water list: water is not touched by this file.
    expect(read1.water).toBeNull();
  });

  it('reads ids in lower case', () => {
    const id = 'AAAAAAAA-0000-4000-8000-00000000000A';
    expect(
      read(file([{ date: MON, meals: [{ meal: 'lunch', items: [food({ id })] }] }])).foods[0]?.id,
    ).toBe(id.toLowerCase());
  });

  const day = (item: unknown, extra: Record<string, unknown> = {}) => [
    { date: MON, meals: [{ meal: 'lunch', items: [item] }], ...extra },
  ];

  it.each<[string, string, ImportProblem]>([
    [
      'one negative value',
      file(day(food({ protein: -1 }))),
      { kind: 'food', detail: 'Rice bowl, 2026-10-26' },
    ],
    [
      'a value that is not a number',
      file(day(food({ kcal: '500' }))),
      { kind: 'food', detail: 'Rice bowl, 2026-10-26' },
    ],
    [
      'a missing required value',
      file(day(food({ fat: undefined }))),
      { kind: 'food', detail: 'Rice bowl, 2026-10-26' },
    ],
    [
      'a negative nutrient',
      file(day(food({ nutrients: { sodiumMg: -5 } }))),
      { kind: 'food', detail: 'Rice bowl, 2026-10-26' },
    ],
    [
      'a negative extra',
      file(day(food({ extras: { creatineG: -1 } }))),
      { kind: 'food', detail: 'Rice bowl, 2026-10-26' },
    ],
    [
      'a part with a negative value',
      file(
        day(food({ lines: [{ name: 'Rice', grams: 1, kcal: -1, protein: 0, carbs: 0, fat: 0 }] })),
      ),
      { kind: 'food', detail: 'Rice bowl, 2026-10-26' },
    ],
    [
      'a part without a name',
      file(day(food({ lines: [{ name: ' ', grams: 1, kcal: 1, protein: 0, carbs: 0, fat: 0 }] }))),
      { kind: 'food', detail: 'Rice bowl, 2026-10-26' },
    ],
    ['a blank name', file(day(food({ name: '   ' }))), { kind: 'food', detail: '2026-10-26' }],
    [
      'an id that is not a UUID',
      file(day(food({ id: 'entry-1' }))),
      { kind: 'food', detail: 'Rice bowl, 2026-10-26' },
    ],
    [
      'a note that is not text',
      file(day(food({ note: 5 }))),
      { kind: 'food', detail: 'Rice bowl, 2026-10-26' },
    ],
    [
      'an unknown meal',
      file([{ date: MON, meals: [{ meal: 'brunch', items: [food()] }] }]),
      { kind: 'meal', detail: 'brunch' },
    ],
    [
      'a time that is not HH:mm',
      file(day(food({ time: '25:15' }))),
      { kind: 'time', detail: '2026-10-26 25:15' },
    ],
    [
      'a day that is not a date',
      file([{ date: '2026-02-30', meals: [] }]),
      { kind: 'date', detail: '2026-02-30' },
    ],
    [
      'a day outside the range',
      file([{ date: SUN, meals: [{ meal: 'lunch', items: [food()] }] }]),
      { kind: 'date', detail: SUN },
    ],
    [
      'a range that is not dates',
      file(day(food()), { range: { start: 'monday', end: MON } }),
      { kind: 'date', detail: 'monday' },
    ],
    [
      'a water log of 0 ml',
      file(day(food(), { water: [{ id: uuid(9), time: '08:00', ml: 0 }] })),
      { kind: 'water', detail: MON },
    ],
    [
      'a water log without an id',
      file(day(food(), { water: [{ time: '08:00', ml: 250 }] })),
      { kind: 'water', detail: MON },
    ],
    [
      'a water log with a time that is not HH:mm',
      file(day(food(), { water: [{ id: uuid(9), time: '8am', ml: 250 }] })),
      { kind: 'time', detail: '2026-10-26 8am' },
    ],
    ['another format id', file(day(food()), { format: 'other-diary' }), { kind: 'notDiary' }],
    [
      'a file without our format id',
      JSON.stringify({ export: { app: 'Another app' }, days: [] }),
      { kind: 'notDiary' },
    ],
    ['text that is not JSON', 'date,meal,name\n', { kind: 'notDiary' }],
    ['a list instead of a file', '[]', { kind: 'notDiary' }],
    ['a newer major version', file(day(food()), { version: '2.0' }), { kind: 'version' }],
    ['a version that is not one', file(day(food()), { version: 'latest' }), { kind: 'version' }],
    ['a file with nothing in it', file([{ date: MON, meals: [], water: [] }]), { kind: 'empty' }],
  ])('refuses the whole file for %s (R06.16)', (_label, text, problem) => {
    expect(problemOf(text)).toEqual(problem);
  });

  it('refuses 02:30 on the spring-forward day, food or water, and takes 03:30 (R06.16)', () => {
    // New York skips 02:00–03:00 on Sunday 8 March 2026.
    const DST = '2026-03-08';
    const doc = (item: unknown, water: unknown[] = []) =>
      JSON.stringify({
        format: 'platewise-diary',
        version: '1.0',
        range: { start: DST, end: DST },
        days: [{ date: DST, meals: [{ meal: 'snack', items: [item] }], water }],
      });

    expect(problemOf(doc(food({ time: '02:30' })))).toEqual({
      kind: 'time',
      detail: '2026-03-08 02:30',
    });
    expect(problemOf(doc(food(), [{ id: uuid(3), time: '02:30', ml: 250 }]))).toEqual({
      kind: 'time',
      detail: '2026-03-08 02:30',
    });
    expect(read(doc(food({ time: '03:30' }))).foods[0]?.loggedAt).toBe(
      Date.parse('2026-03-08T03:30:00-04:00'),
    );
  });
});

describe('readPickedFile', () => {
  it('refuses a file over 20 MiB without reading it', async () => {
    const text = vi.fn(async () => file());
    expect(MAX_IMPORT_BYTES).toBe(20 * 1024 * 1024);

    expect(await readPickedFile({ size: MAX_IMPORT_BYTES + 1, text })).toEqual({
      ok: false,
      problem: { kind: 'tooLarge' },
    });
    expect(text).not.toHaveBeenCalled();
    expect((await readPickedFile({ size: MAX_IMPORT_BYTES, text })).ok).toBe(true);
  });

  it('says so when the file cannot be read', async () => {
    const text = async () => {
      throw new DOMException('gone', 'NotReadableError');
    };
    expect(await readPickedFile({ size: 10, text })).toEqual({
      ok: false,
      problem: { kind: 'unreadable' },
    });
  });
});

describe('previewOf', () => {
  it('counts the foods and water logs and gives the range', () => {
    const text = file([
      { date: SAT, meals: [{ meal: 'lunch', items: [food(), food({ name: 'Soup' })] }] },
      { date: MON, meals: [], water: [{ id: uuid(1), time: '08:00', ml: 250 }] },
    ]);
    expect(previewOf(read(text))).toEqual({
      foods: 2,
      water: 1,
      range: { start: SAT, end: MON },
    });
  });
});

describe('planImport', () => {
  const stored = (entries: DiaryEntry[], water: WaterLog[] = []): StoredDays => ({
    entries,
    water,
    takenEntryIds: new Set(),
    takenWaterIds: new Set(),
  });

  it('matches every food by id before any by key, each stored entry once', () => {
    // The first food matches the entry by key, the second names it by id: the id wins.
    const entry = makeEntry({
      id: uuid(1),
      name: 'Rice bowl',
      meal: 'lunch',
      loggedAt: at(MON, '12:30'),
    });
    const text = file([
      {
        date: MON,
        meals: [
          {
            meal: 'lunch',
            items: [food({ id: uuid(7) }), food({ id: uuid(1), name: 'Noodles', time: '13:00' })],
          },
        ],
      },
    ]);

    const write = planImport(read(text), 'replace', stored([entry]), uuids('b'));

    expect(write.putEntries.map((e) => [e.id, e.name])).toEqual([
      [uuid(7), 'Rice bowl'],
      [uuid(1), 'Noodles'],
    ]);
    expect(write.removeEntryIds).toEqual([]);
  });

  it('matches by day, minute, meal and a name in other case and spacing', () => {
    const entry = makeEntry({
      id: 'stored',
      name: '  rice   BOWL ',
      meal: 'lunch',
      loggedAt: at(MON, '12:30') + 42_000,
    });
    const write = planImport(read(file()), 'replace', stored([entry]), uuids('b'));
    expect(write.putEntries.map((e) => e.id)).toEqual(['stored']);
    expect(write.removeEntryIds).toEqual([]);
  });

  it('gives a second food with the same id a new one, without trouble', () => {
    const text = file([
      {
        date: MON,
        meals: [
          { meal: 'lunch', items: [food({ id: uuid(5) }), food({ id: uuid(5), name: 'Soup' })] },
        ],
      },
    ]);
    const write = planImport(read(text), 'replace', stored([]), uuids('b'));
    expect(write.putEntries.map((e) => e.id)).toEqual([
      uuid(5),
      'bbbbbbbb-0000-4000-8000-000000000001',
    ]);
  });
});

describe('importing into the diary (the transfer service)', () => {
  async function setUp() {
    const { db } = await openTestDb();
    const diary = createDiaryRepo(db);
    const photoRepo = createPhotoRepo(db);
    const service = createTransferService({
      transferRepo: createTransferRepo(db),
      photoRepo,
      newId: uuids('f'),
    });
    const entries = async () =>
      (await db.entries.toArray()).sort(
        (a, b) => a.loggedAt - b.loggedAt || a.id.localeCompare(b.id),
      );
    return { db, diary, photoRepo, service, entries };
  }

  /** The file our own export makes of these entries and logs on Monday. */
  function exported(entries: DiaryEntry[], water: WaterLog[] = []): DiaryImport {
    return read(
      toJson(buildDocument({ range: { start: MON, end: MON }, entries, water, targets: TARGETS })),
    );
  }

  it('changes nothing when one value of the file is invalid (ACC-K2-1)', async () => {
    const { db, diary, service, entries } = await setUp();
    await diary.add(makeEntry({ id: uuid(1), loggedAt: at(MON, '12:30') }));
    const before = await entries();
    const text = file([
      {
        date: MON,
        meals: [{ meal: 'lunch', items: [food(), food({ name: 'Soup', carbs: -0.5 })] }],
      },
    ]);

    const result = await service.readImport({ size: text.length, text: async () => text });

    expect(result).toEqual({ ok: false, problem: { kind: 'food', detail: 'Soup, 2026-10-26' } });
    expect(await entries()).toEqual(before);
    db.close();
  });

  it("keeps a matched entry's id and photos and takes the file's values (ACC-K2-2, R06.16)", async () => {
    const { db, diary, photoRepo, service, entries } = await setUp();
    const photo = await photoRepo.put(await storableBlob(16), { width: 4, height: 3 });
    const stored = makeEntry({
      id: uuid(1),
      name: 'Rice bowl',
      photoIds: [photo],
      emoji: '🍚',
      product: makeProduct(),
      source: 'photo',
      loggedAt: at(MON, '12:30'),
    });
    await diary.add(stored);
    const document = JSON.parse(
      toJson(
        buildDocument({
          range: { start: MON, end: MON },
          entries: [stored],
          water: [],
          targets: TARGETS,
        }),
      ),
    );
    document.days[0].meals[0].items[0].nutrients.fibreG = 8.5;
    document.days[0].meals[0].items[0].kcal = 450;

    const counts = await service.importDiary(read(JSON.stringify(document)), 'replace');

    expect(counts).toEqual({ foods: 1, water: 0 });
    const [after] = await entries();
    expect(after).toMatchObject({
      id: uuid(1),
      photoIds: [photo],
      emoji: '🍚',
      product: makeProduct(),
      source: 'photo',
      kcal: 450,
      nutrients: { fibre: 8.5, sodium: 820 },
    });
    expect(await photoRepo.get(photo)).not.toBeNull();
    db.close();
  });

  it('matches by day, minute, meal and name when the file brings another id', async () => {
    const { db, diary, service, entries } = await setUp();
    await diary.add(
      makeEntry({ id: uuid(1), name: 'Rice bowl', photoIds: ['p'], loggedAt: at(MON, '12:30') }),
    );

    await service.importDiary(
      read(
        file([
          { date: MON, meals: [{ meal: 'lunch', items: [food({ id: uuid(9), kcal: 480 })] }] },
        ]),
      ),
      'replace',
    );

    expect((await entries()).map((e) => [e.id, e.kcal, e.photoIds])).toEqual([
      [uuid(1), 480, ['p']],
    ]);
    db.close();
  });

  it('matches each stored entry once; a second food with the same key is added', async () => {
    const { db, diary, service, entries } = await setUp();
    await diary.add(makeEntry({ id: uuid(1), name: 'Rice bowl', loggedAt: at(MON, '12:30') }));

    await service.importDiary(
      read(file([{ date: MON, meals: [{ meal: 'lunch', items: [food(), food({ kcal: 300 })] }] }])),
      'replace',
    );

    expect((await entries()).map((e) => [e.id, e.kcal])).toEqual([
      [uuid(1), 500],
      ['ffffffff-0000-4000-8000-000000000001', 300],
    ]);
    db.close();
  });

  it('removes what matches nothing on those dates, cleans up its photos and leaves other dates alone', async () => {
    const { db, diary, photoRepo, service, entries } = await setUp();
    const photo = await photoRepo.put(await storableBlob(16), { width: 4, height: 3 });
    const gone = makeEntry({
      id: uuid(1),
      name: 'Cake',
      photoIds: [photo],
      loggedAt: at(MON, '16:00'),
    });
    const otherDay = makeEntry({ id: uuid(2), name: 'Cake', loggedAt: at(SUN, '16:00') });
    await diary.addMany([gone, otherDay]);

    await service.importDiary(read(file()), 'replace');

    expect((await entries()).map((e) => e.name)).toEqual(['Cake', 'Rice bowl']);
    expect(await db.entries.get(uuid(2))).toMatchObject({ name: 'Cake', dayKey: SUN });
    expect(await db.entries.get(uuid(1))).toBeUndefined();
    expect(await photoRepo.get(photo)).toBeNull();
    db.close();
  });

  it('gives a food a new id when an entry on another date already has it (R06.16)', async () => {
    const { db, diary, service } = await setUp();
    await diary.add(makeEntry({ id: uuid(1), name: 'Pasta', loggedAt: at(SAT, '19:00') }));

    await service.importDiary(
      read(file([{ date: MON, meals: [{ meal: 'lunch', items: [food({ id: uuid(1) })] }] }])),
      'replace',
    );

    expect(await db.entries.get(uuid(1))).toMatchObject({ name: 'Pasta', dayKey: SAT });
    const monday = await db.entries.where('dayKey').equals(MON).toArray();
    expect(monday.map((e) => [e.id, e.name])).toEqual([
      ['ffffffff-0000-4000-8000-000000000001', 'Rice bowl'],
    ]);
    db.close();
  });

  it('adds every food and water log as new with Add as new, doubling the day (R06.16)', async () => {
    const { db, diary, service, entries } = await setUp();
    const lunch = makeEntry({ id: uuid(1), loggedAt: at(MON, '12:30') });
    const dinner = makeEntry({
      id: uuid(2),
      name: 'Pasta',
      meal: 'dinner',
      loggedAt: at(MON, '19:00'),
    });
    await diary.addMany([lunch, dinner]);
    const water = makeWater({ id: uuid(3), at: at(MON, '09:00') });
    await db.water.put(water);

    const counts = await service.importDiary(exported([lunch, dinner], [water]), 'add');

    expect(counts).toEqual({ foods: 2, water: 1 });
    const all = await entries();
    expect(all).toHaveLength(4);
    expect(new Set(all.map((e) => e.id)).size).toBe(4);
    expect(all.filter((e) => e.id === uuid(1) || e.id === uuid(2))).toHaveLength(2);
    expect(await db.water.count()).toBe(2);
    db.close();
  });

  it('leaves water alone for a food-only file (R06.16)', async () => {
    const { db, service } = await setUp();
    const water = makeWater({ id: uuid(3), at: at(MON, '09:00') });
    await db.water.put(water);

    await service.importDiary(read(file()), 'replace');

    expect(await db.water.toArray()).toEqual([water]);
    db.close();
  });

  it("replaces the dates' water with the file's and keeps other dates' water", async () => {
    const { db, service } = await setUp();
    const monday = makeWater({ id: uuid(3), at: at(MON, '09:00') });
    const sunday = makeWater({ id: uuid(4), at: at(SUN, '09:00') });
    await db.water.bulkPut([monday, sunday]);
    const text = file([
      {
        date: MON,
        meals: [],
        water: [
          { id: uuid(5), time: '10:15', ml: 400 },
          { id: uuid(4), time: '18:00', ml: 200 },
        ],
      },
    ]);

    await service.importDiary(read(text), 'replace');

    const logs = (await db.water.toArray()).sort((a, b) => a.at - b.at);
    expect(logs.map((log) => [log.id, log.dayKey, log.ml])).toEqual([
      [uuid(4), SUN, 250],
      [uuid(5), MON, 400],
      // Its id is Sunday's log's, so it takes a new one.
      ['ffffffff-0000-4000-8000-000000000001', MON, 200],
    ]);
    db.close();
  });

  it('keeps the unit choice while the weight is the same, and part photos by name', async () => {
    const { db, diary, service } = await setUp();
    const stored = makeEntry({
      id: uuid(1),
      basis: { kind: 'grams', grams: 420.04 },
      units: [{ unit: 'bowl', gramsEach: 420.04, count: 1 }],
      chosenUnit: 'bowl',
      chosenCount: 1,
      lines: [
        makeLine({ name: 'Rice', photoIds: ['p-rice'] }),
        makeLine({ name: 'Egg', photoIds: ['p-egg'] }),
      ],
      loggedAt: at(MON, '12:30'),
    });
    await diary.add(stored);
    const document = JSON.parse(
      toJson(
        buildDocument({
          range: { start: MON, end: MON },
          entries: [stored],
          water: [],
          targets: TARGETS,
        }),
      ),
    );
    const item = document.days[0].meals[0].items[0];
    item.lines = [item.lines[1]];

    await service.importDiary(read(JSON.stringify(document)), 'replace');
    expect(await db.entries.get(uuid(1))).toMatchObject({
      basis: { kind: 'grams', grams: 420.04 },
      chosenUnit: 'bowl',
      lines: [expect.objectContaining({ name: 'Egg', photoIds: ['p-egg'] })],
    });

    item.grams = 300;
    await service.importDiary(read(JSON.stringify(document)), 'replace');
    const changed = await db.entries.get(uuid(1));
    expect(changed?.basis).toEqual({ kind: 'grams', grams: 300 });
    expect(changed).not.toHaveProperty('chosenUnit');
    expect(changed?.units).toEqual(stored.units);
    db.close();
  });

  it('files a new estimated food as text and a manual one as manual', async () => {
    const { db, service, entries } = await setUp();
    const text = file([
      {
        date: MON,
        meals: [
          {
            meal: 'lunch',
            items: [food(), food({ name: 'Tea', source: 'manual', time: '15:00' })],
          },
        ],
      },
    ]);

    await service.importDiary(read(text), 'add');

    expect((await entries()).map((e) => [e.name, e.source, e.basis, e.photoIds])).toEqual([
      ['Rice bowl', 'text', { kind: 'grams', grams: 250 }, []],
      ['Tea', 'manual', { kind: 'grams', grams: 250 }, []],
    ]);
    db.close();
  });
});
