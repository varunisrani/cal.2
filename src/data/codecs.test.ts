import { describe, expect, it } from 'vitest';
import {
  FACTORY_NOW,
  makeCoachMessage,
  makeEntry,
  makeFast,
  makePhoto,
  makeProfile,
  makeWalk,
  makeWater,
} from '../test/factories';
import {
  DEFAULT_FAST_GOAL_MIN,
  decodeAnalysisDraft,
  decodeBodyFat,
  decodeCoachMessage,
  decodeEntry,
  decodeFast,
  decodeNutritionDraft,
  decodePhoto,
  decodeProfile,
  decodeSavedMeal,
  decodeWalk,
  decodeWater,
  decodeWeighIn,
  isBlobLike,
} from './codecs';

describe('decodeEntry', () => {
  it('drops fields it does not know', () => {
    const entry = makeEntry();
    const stored = { ...entry, barcodeKey: '04006381333931', healthRecordId: 'x', future: [1] };
    expect(decodeEntry(stored)).toEqual(entry);
  });

  it('reads a missing or unknown meal as other and an unknown source as manual', () => {
    const { meal: _meal, ...withoutMeal } = makeEntry();
    expect(decodeEntry(withoutMeal)?.meal).toBe('other');
    expect(decodeEntry({ ...makeEntry(), meal: 'brunch' })?.meal).toBe('other');
    expect(decodeEntry({ ...makeEntry(), meal: 'Lunch' })?.meal).toBe('other');
    expect(decodeEntry({ ...makeEntry(), source: 'snapFood' })?.source).toBe('manual');
  });

  it('accepts whole and decimal numbers, rounding kcal to whole kcal', () => {
    const decoded = decodeEntry({ ...makeEntry(), kcal: 270.6, protein: 12, carbs: 52.25, fat: 2 });
    expect(decoded).toMatchObject({ kcal: 271, protein: 12, carbs: 52.25, fat: 2 });
  });

  it('makes a grams basis only when the grams are finite and above 0', () => {
    const basis = (value: unknown) => decodeEntry({ ...makeEntry(), basis: value })?.basis;
    expect(basis({ kind: 'grams', grams: 120.5 })).toEqual({ kind: 'grams', grams: 120.5 });
    expect(basis({ kind: 'grams', grams: 0 })).toEqual({ kind: 'servings', count: 1 });
    expect(basis({ kind: 'grams', grams: Number.NaN })).toEqual({ kind: 'servings', count: 1 });
    expect(basis({ kind: 'grams' })).toEqual({ kind: 'servings', count: 1 });
    expect(basis({ kind: 'servings', count: 2 })).toEqual({ kind: 'servings', count: 2 });
    expect(basis(undefined)).toEqual({ kind: 'servings', count: 1 });
  });

  it('leaves out optional parts that do not parse instead of failing the row', () => {
    const decoded = decodeEntry({
      ...makeEntry(),
      nutrients: { fibre: 3, sodium: -1, vitaminC: 'lots', fiber: 9 },
      extras: { creatine: 5, 'beta-alanine': 2 },
      units: [{ unit: 'slice', gramsEach: 30 }, { unit: 'cup', gramsEach: 0 }, 'bowl'],
      lines: [{ name: 'Rice', grams: 150, kcal: 168.4 }, { grams: 10 }],
      product: { package: '500 g' },
      chosenCount: -2,
      emoji: 7,
      photoIds: ['photo-1', 3, ''],
    });
    expect(decoded).toMatchObject({
      nutrients: { fibre: 3 },
      extras: { creatine: 5 },
      units: [{ unit: 'slice', gramsEach: 30 }],
      lines: [{ name: 'Rice', grams: 150, kcal: 168, protein: 0, carbs: 0, fat: 0, photoIds: [] }],
      photoIds: ['photo-1'],
    });
    expect(decoded).not.toHaveProperty('product');
    expect(decoded).not.toHaveProperty('chosenCount');
    expect(decoded).not.toHaveProperty('emoji');
  });

  it('derives a missing or malformed day key from the logged instant', () => {
    const loggedAt = Date.parse('2026-10-26T23:30:00-04:00');
    expect(decodeEntry({ ...makeEntry({ loggedAt }), dayKey: undefined })?.dayKey).toBe(
      '2026-10-26',
    );
    expect(decodeEntry({ ...makeEntry({ loggedAt }), dayKey: '2026-02-30' })?.dayKey).toBe(
      '2026-10-26',
    );
  });

  it('cannot read a row without id, instant, name or core numbers', () => {
    const entry = makeEntry();
    expect(decodeEntry({ name: 'no id or macros' })).toBeNull();
    expect(decodeEntry({ ...entry, id: '' })).toBeNull();
    expect(decodeEntry({ ...entry, loggedAt: '2026-10-26' })).toBeNull();
    expect(decodeEntry({ ...entry, name: undefined })).toBeNull();
    expect(decodeEntry({ ...entry, kcal: Number.POSITIVE_INFINITY })).toBeNull();
    expect(decodeEntry({ ...entry, protein: -1 })).toBeNull();
    expect(decodeEntry('{"id": "broken"')).toBeNull();
    expect(decodeEntry([entry])).toBeNull();
    expect(decodeEntry(null)).toBeNull();
  });
});

describe('other food codecs', () => {
  it('read saved meals with a default order and source', () => {
    const { id: _id, loggedAt: _at, dayKey: _day, meal: _meal, ...food } = makeEntry();
    expect(decodeSavedMeal({ ...food, id: 'saved-9', source: 'voice' })).toMatchObject({
      id: 'saved-9',
      order: 0,
      source: 'manual',
    });
    expect(decodeSavedMeal(food)).toBeNull();
  });

  it('read an analysis draft only around a readable draft', () => {
    expect(
      decodeAnalysisDraft({ draft: { name: 'Toast' }, photoIds: [], createdAt: FACTORY_NOW }),
    ).toBeNull();
    const decoded = decodeAnalysisDraft({
      draft: { name: 'Toast', kcal: 250, protein: 8, carbs: 40, fat: 6 },
      source: 'telepathy',
    });
    expect(decoded).toEqual({
      draft: expect.objectContaining({ name: 'Toast', basis: { kind: 'servings', count: 1 } }),
      photoIds: [],
      createdAt: 0,
      fromSavedLabel: false,
    });
  });

  it('keep the marked ingredient list of a product through a stored analysis draft (ACC-D23-1)', () => {
    const product = {
      barcode: '4012345678901',
      ingredients: 'Wheat flour, milk, salt',
      markedIngredients: 'Wheat flour, _milk_, salt',
    };
    const decoded = decodeAnalysisDraft({
      draft: { name: 'Crackers', kcal: 120, protein: 3, carbs: 20, fat: 4, product },
      photoIds: [],
      createdAt: FACTORY_NOW,
    });
    expect(decoded?.draft.product).toMatchObject(product);
  });

  it('give a bare draft empty collections', () => {
    expect(decodeNutritionDraft({ name: 'Tea', kcal: 2, protein: 0, carbs: 0, fat: 0 })).toEqual({
      name: 'Tea',
      kcal: 2,
      protein: 0,
      carbs: 0,
      fat: 0,
      nutrients: {},
      extras: {},
      basis: { kind: 'servings', count: 1 },
      units: [],
      lines: [],
      progressive: false,
    });
  });
});

describe('decodeProfile', () => {
  it('coerces unknown enum values to their defaults and drops the row key', () => {
    const decoded = decodeProfile({
      ...makeProfile(),
      id: 'me',
      sex: 'nonbinary',
      activity: 'very active',
      goal: 'maintenance',
    });
    expect(decoded).toMatchObject({ sex: 'male', activity: 'moderate', goal: 'maintain' });
    expect(decoded).not.toHaveProperty('id');
  });

  it('keeps at most two distinct known macro locks and whole saved targets', () => {
    const decoded = decodeProfile({
      ...makeProfile(),
      lockedMacros: ['fat', 'fat', 'sugar', 'protein', 'carbs'],
      saved: { kcal: 1800.4, protein: 'x', fibre: 30 },
    });
    expect(decoded?.lockedMacros).toEqual(['fat', 'protein']);
    expect(decoded?.saved).toEqual({ kcal: 1800 });
  });

  it('cannot read a profile without a birth date, height or weight', () => {
    expect(decodeProfile({ ...makeProfile(), birthDate: 791_164_800_000 })).toBeNull();
    expect(decodeProfile({ ...makeProfile(), heightCm: 0 })).toBeNull();
    expect(decodeProfile({ ...makeProfile(), weightKg: '64' })).toBeNull();
  });
});

describe('tracker codecs', () => {
  it('read weigh-ins, body fat and water, and refuse missing values', () => {
    expect(decodeWeighIn({ id: 'w', at: 1, kg: 70.25, unit: 'kg' })).toEqual({
      id: 'w',
      at: 1,
      kg: 70.25,
    });
    expect(decodeWeighIn({ id: 'w', at: 1 })).toBeNull();
    expect(decodeBodyFat({ id: 'b', at: 1, fraction: 0.2 })).toEqual({
      id: 'b',
      at: 1,
      fraction: 0.2,
    });
    expect(decodeBodyFat({ id: 'b', at: 1, fraction: 0 })).toBeNull();
    const water = makeWater();
    expect(decodeWater({ ...water, dayKey: undefined })).toEqual(water);
    expect(decodeWater({ ...water, ml: 0 })).toBeNull();
  });

  it('reads a running fast only from a missing or null end', () => {
    const running = makeFast({ end: null });
    expect(decodeFast(running)).toEqual(running);
    const { end: _end, ...noEnd } = running;
    expect(decodeFast(noEnd)).toEqual(running);
    expect(decodeFast({ ...running, end: 'soon' })).toBeNull();
    expect(decodeFast({ ...running, end: running.start - 1 })).toBeNull();
  });

  it('fills a missing fasting goal with 16 hours', () => {
    expect(decodeFast({ ...makeFast(), goalMin: undefined })?.goalMin).toBe(DEFAULT_FAST_GOAL_MIN);
    expect(DEFAULT_FAST_GOAL_MIN).toBe(960);
  });
});

describe('coach and photo codecs', () => {
  it('cannot read a message with an unknown role, and drops a bad failure state', () => {
    const message = makeCoachMessage();
    expect(decodeCoachMessage({ ...message, role: 'model' })).toBeNull();
    expect(decodeCoachMessage({ ...message, state: { status: 'pending' } })).toEqual(message);
    expect(
      decodeCoachMessage({ ...message, state: { status: 'failed', kind: 'quota', extra: 1 } }),
    ).toEqual({ ...message, state: { status: 'failed', kind: 'quota' } });
  });

  it('reads the reminder cards of a reply and leaves out a card it cannot read in full (P13)', () => {
    const message = makeCoachMessage({ role: 'assistant' });
    const daily = { text: 'Drink water', time: '10:00', days: ['sun', 'mon'], status: 'proposed' };
    const once = {
      text: 'Call the dietitian',
      time: '17:30',
      date: '2026-10-28',
      status: 'added',
      reminderId: 'r1',
    };
    expect(decodeCoachMessage({ ...message, reminders: [daily, once] })).toEqual({
      ...message,
      // The days come back Monday first.
      reminders: [{ ...daily, days: ['mon', 'sun'] }, once],
    });
    const unreadable = [
      { ...daily, status: 'maybe' },
      { ...daily, time: '25:00' },
      { ...daily, text: '  ' },
      { ...daily, days: [] },
      { ...daily, days: ['someday'] },
      { ...daily, date: '2026-10-28' },
      { text: 'No timing', time: '10:00', status: 'proposed' },
      'not a card',
    ];
    expect(decodeCoachMessage({ ...message, reminders: [...unreadable, once] })).toEqual({
      ...message,
      reminders: [once],
    });
    expect(decodeCoachMessage({ ...message, reminders: unreadable })).toEqual(message);
    expect(decodeCoachMessage({ ...message, reminders: 'cards' })).toEqual(message);
  });

  it('needs a blob to read a photo', () => {
    const photo = makePhoto();
    expect(decodePhoto(photo)).toEqual(photo);
    expect(decodePhoto({ ...photo, blob: {} })).toBeNull();
    expect(decodePhoto({ ...photo, thumb: 'x', bytes: undefined })).toEqual({
      ...photo,
      thumb: undefined,
      bytes: photo.blob.size,
    });
  });

  it('recognises blobs by shape', () => {
    expect(isBlobLike(new Blob(['a']))).toBe(true);
    expect(isBlobLike({ size: 1, type: '', arrayBuffer: () => undefined })).toBe(true);
    expect(isBlobLike({ size: 1, type: '' })).toBe(false);
    expect(isBlobLike(null)).toBe(false);
  });
});

describe('decodeWalk (P15-02)', () => {
  it('reads a stored walk as it was written, unknown fields left behind', () => {
    const walk = makeWalk({
      heartRate: { avgBpm: 118, maxBpm: 141, maxHr: 186, zoneSeconds: [60, 900, 600, 30, 0] },
    });
    expect(decodeWalk({ ...walk, extra: 'x' })).toEqual(walk);
  });

  it('cannot read a walk without its id, start and end in order, or its active time', () => {
    const walk = makeWalk();
    expect(decodeWalk({ ...walk, id: '' })).toBeNull();
    expect(decodeWalk({ ...walk, startedAt: 'today' })).toBeNull();
    expect(decodeWalk({ ...walk, endedAt: walk.startedAt - 1 })).toBeNull();
    expect(decodeWalk({ ...walk, activeSeconds: -5 })).toBeNull();
    expect(decodeWalk(null)).toBeNull();
  });

  it('reads damaged figures leniently: unknown, default or left out', () => {
    const read = decodeWalk({
      ...makeWalk(),
      distanceM: 'far',
      steps: -1,
      speedFrom: 'teleport',
      speedKmh: 5,
      score: 140,
      parts: { duration: 'x', brisk: 12 },
      splits: { metres: [1, 'a'], steps: [3, 4] },
      route: 42,
      heartRate: { avgBpm: 120, maxBpm: 150, maxHr: 180, zoneSeconds: [1, 2] },
      writtenToHealth: 'yes',
      met: 0,
    });
    expect(read).toMatchObject({
      distanceM: null,
      steps: null,
      speedFrom: 'none',
      speedKmh: null,
      score: null,
      parts: { brisk: 12, duration: 0, intensity: null, pace: null },
      splits: { metres: null, steps: [3, 4] },
      route: '',
      heartRate: null,
      writtenToHealth: false,
      met: 3,
      briskKnown: true,
    });
  });
});
