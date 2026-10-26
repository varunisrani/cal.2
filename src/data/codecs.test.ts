import { describe, expect, it } from 'vitest';
import { factories, testBlob } from '../test/factories';
import {
  decodeAnalysisDraft,
  decodeBodyFat,
  decodeCoachMessage,
  decodeDraft,
  decodeEntry,
  decodeFast,
  decodePhoto,
  decodeProfile,
  decodeSavedMeal,
  decodeWater,
  decodeWeighIn,
} from './codecs';

const make = factories();

/** A copy of `record` without `key`. */
function without(record: object, key: string): Record<string, unknown> {
  const copy: Record<string, unknown> = { ...record };
  delete copy[key];
  return copy;
}

describe('decodeEntry', () => {
  it('reads a stored entry unchanged and leaves unknown fields out', () => {
    const entry = make.entry();
    expect(decodeEntry(entry)).toEqual(entry);
    expect(decodeEntry({ ...entry, barcodeKey: '0123', addedBy: 'a newer build' })).toEqual(entry);
  });

  it('reads a missing or unknown meal as other and an unknown source as manual', () => {
    const entry = make.entry();
    expect(decodeEntry(without(entry, 'meal'))?.meal).toBe('other');
    expect(decodeEntry({ ...entry, meal: 'brunch' })?.meal).toBe('other');
    expect(decodeEntry({ ...entry, source: 'voice' })?.source).toBe('manual');
  });

  it('accepts whole and decimal numbers and keeps kcal whole', () => {
    const read = decodeEntry({ ...make.entry(), kcal: 270.6, protein: 12, fat: 2.25 });
    expect(read).toMatchObject({ kcal: 271, protein: 12, fat: 2.25 });
  });

  it('cannot read an entry without its id, instant, name, kcal or macros', () => {
    const entry = make.entry();
    for (const key of ['id', 'loggedAt', 'name', 'kcal', 'protein', 'carbs', 'fat']) {
      expect(decodeEntry(without(entry, key)), key).toBeNull();
    }
    expect(decodeEntry({ ...entry, kcal: '320' })).toBeNull();
    expect(decodeEntry({ ...entry, loggedAt: Number.NaN })).toBeNull();
    expect(decodeEntry({ ...entry, id: '  ' })).toBeNull();
    for (const raw of [null, undefined, 42, 'entry', [entry]]) expect(decodeEntry(raw)).toBeNull();
  });

  it('derives a missing or broken day key from the instant in the local zone', () => {
    // 22:00 on 26 October in New York is 02:00 on the 27th in UTC.
    const lateEvening = {
      ...make.entry(),
      loggedAt: Date.UTC(2026, 9, 27, 2),
      dayKey: '2026-13-01',
    };
    expect(decodeEntry(lateEvening)?.dayKey).toBe('2026-10-26');
  });

  it('keeps photo ids in order and drops what is not an id', () => {
    const read = decodeEntry({ ...make.entry(), photoIds: ['p-2', 7, 'p-1', null] });
    expect(read?.photoIds).toEqual(['p-2', 'p-1']);
    expect(decodeEntry({ ...make.entry(), photoIds: 'p-1' })?.photoIds).toEqual([]);
  });
});

describe('decodeDraft', () => {
  it('makes a grams basis only from finite grams above 0', () => {
    const basisOf = (basis: unknown) => decodeDraft({ ...make.draft(), basis })?.basis;
    expect(basisOf({ kind: 'grams', grams: 250 })).toEqual({ kind: 'grams', grams: 250 });
    for (const grams of [0, -5, Number.POSITIVE_INFINITY, Number.NaN, '250', undefined]) {
      expect(basisOf({ kind: 'grams', grams })).toEqual({ kind: 'servings', count: 1 });
    }
    expect(basisOf({ kind: 'servings', count: 2 })).toEqual({ kind: 'servings', count: 2 });
    expect(basisOf({ kind: 'servings', count: 0 })).toEqual({ kind: 'servings', count: 1 });
    expect(basisOf(undefined)).toEqual({ kind: 'servings', count: 1 });
  });

  it('keeps known nutrients, drops unknown keys and never fills a missing one with 0', () => {
    const read = decodeDraft({
      ...make.draft(),
      nutrients: { fibre: 4.5, sodium: 120, fiber: 9, protein: 3, sugar: 'lots', iron: null },
      extras: { creatine: 3, valine: 1 },
    });
    expect(read?.nutrients).toEqual({ fibre: 4.5, sodium: 120 });
    expect(read?.nutrients).not.toHaveProperty('sugar');
    expect(read?.extras).toEqual({ creatine: 3 });
    expect(decodeDraft({ ...make.draft(), nutrients: 'none' })?.nutrients).toEqual({});
  });

  it('keeps at most four readable units and the readable ingredient lines', () => {
    const units = [
      { unit: 'slice', gramsEach: 30 },
      { unit: '', gramsEach: 30 },
      { unit: 'cup', gramsEach: 0 },
      { unit: 'bowl', gramsEach: 400, count: 2 },
      { unit: 'piece', gramsEach: 50 },
      { unit: 'spoon', gramsEach: 15 },
      { unit: 'jar', gramsEach: 500 },
    ];
    const line = { name: 'Rice', grams: 150, kcal: 195.4, protein: 4, carbs: 42, fat: 0.4 };
    const read = decodeDraft({
      ...make.draft(),
      units,
      lines: [
        line,
        { name: 'Beans', grams: 80 },
        { ...line, name: 'Oil', grams: -3, photoIds: ['p-9'] },
      ],
    });
    expect(read?.units.map((unit) => unit.unit)).toEqual(['slice', 'bowl', 'piece', 'spoon']);
    expect(read?.units[1]).toEqual({ unit: 'bowl', gramsEach: 400, count: 2 });
    expect(read?.lines).toEqual([
      { ...line, kcal: 195, photoIds: [] },
      { ...line, name: 'Oil', grams: 0, kcal: 195, photoIds: ['p-9'] },
    ]);
  });

  it('reads product details only with a barcode', () => {
    const product = {
      barcode: '4006381333931',
      allergens: ['milk'],
      traces: [],
      labels: ['organic'],
      categories: ['yoghurts'],
      nova: 3,
      source: 'usda',
    };
    const read = decodeDraft({ ...make.draft(), product });
    expect(read?.product).toEqual({ ...without(product, 'source') });
    expect(
      decodeDraft({ ...make.draft(), product: { ...product, nova: 7 } })?.product,
    ).not.toHaveProperty('nova');
    expect(decodeDraft({ ...make.draft(), product: { allergens: [] } })).not.toHaveProperty(
      'product',
    );
  });
});

describe('decodeSavedMeal and decodeAnalysisDraft', () => {
  it('read saved meals with their own id and order', () => {
    const meal = make.savedMeal({ originEntryId: 'entry-4' });
    expect(decodeSavedMeal(meal)).toEqual(meal);
    expect(decodeSavedMeal(without(meal, 'order'))?.order).toBe(0);
    expect(decodeSavedMeal(without(meal, 'id'))).toBeNull();
  });

  it('reads an analysis draft only with readable food values', () => {
    const draft = make.analysisDraft({ photoIds: ['photo-1'] });
    expect(decodeAnalysisDraft(draft)).toEqual(draft);
    expect(decodeAnalysisDraft({ ...draft, draft: { name: 'Soup' } })).toBeNull();
    expect(decodeAnalysisDraft({ ...draft, source: 'voice' })).not.toHaveProperty('source');
  });
});

describe('tracker codecs', () => {
  it('read weigh-ins, body fat and water, refusing impossible amounts', () => {
    expect(decodeWeighIn({ ...make.weighIn(), kg: 0 })).toBeNull();
    expect(decodeBodyFat({ ...make.bodyFat(), fraction: 21 })).toBeNull();
    expect(decodeBodyFat({ ...make.bodyFat(), fraction: 0.2 })?.fraction).toBe(0.2);
    expect(decodeWater({ ...make.water(), ml: -250 })).toBeNull();
    expect(decodeWater(without(make.water(), 'dayKey'))?.dayKey).toBe('2026-10-26');
  });

  it('reads a fast without an end as running, but a damaged end as unreadable', () => {
    const fast = make.fast();
    expect(decodeFast({ ...fast, end: null })?.end).toBeNull();
    expect(decodeFast(without(fast, 'end'))?.end).toBeNull();
    // A broken end must not turn an old fast into a running one: that would block food logging.
    expect(decodeFast({ ...fast, end: 'yesterday' })).toBeNull();
    expect(decodeFast({ ...fast, goalMin: 960.4 })?.goalMin).toBe(960);
  });
});

describe('decodeCoachMessage', () => {
  it('keeps a failure state and a thumbnail, and reads an unknown role as assistant', () => {
    const thumb = testBlob('tiny', 'image/webp');
    const message = make.coachMessage({ thumb, state: { status: 'failed', kind: 'quota' } });
    expect(decodeCoachMessage(message)).toEqual(message);
    expect(decodeCoachMessage({ ...message, role: 'tool' })?.role).toBe('assistant');
    const odd = decodeCoachMessage({ ...message, thumb: 'data:', state: { status: 'pending' } });
    expect(odd).not.toHaveProperty('thumb');
    expect(odd).not.toHaveProperty('state');
    expect(decodeCoachMessage(without(message, 'text'))).toBeNull();
  });
});

describe('decodeProfile', () => {
  it('reads unknown choices as the wizard defaults', () => {
    const read = decodeProfile({ ...make.profile(), sex: 'x', activity: 'extreme', goal: 'bulk' });
    expect(read).toMatchObject({ sex: 'male', activity: 'moderate', goal: 'maintain' });
  });

  it('keeps at most two distinct macro locks and whole saved targets', () => {
    const read = decodeProfile({
      ...make.profile(),
      lockedMacros: ['fat', 'fat', 'kcal', 'protein', 'carbs'],
      saved: { kcal: 2100.4, protein: 'lots', fat: 70 },
    });
    expect(read?.lockedMacros).toEqual(['fat', 'protein']);
    expect(read?.saved).toEqual({ kcal: 2100, fat: 70 });
  });

  it('cannot read a profile without a real birth date, height or weight', () => {
    const profile = make.profile();
    expect(decodeProfile({ ...profile, birthDate: '1991-02-30' })).toBeNull();
    expect(decodeProfile(without(profile, 'heightCm'))).toBeNull();
    expect(decodeProfile({ ...profile, weightKg: 0 })).toBeNull();
    expect(decodeProfile({ ...make.profileRow() })).toEqual(profile);
  });
});

describe('decodePhoto', () => {
  it('needs an id and a blob, and sizes the row from its blobs when bytes are missing', () => {
    const photo = make.photo();
    expect(decodePhoto({ ...photo, blob: {} })).toBeNull();
    expect(decodePhoto(without(photo, 'bytes'))?.bytes).toBe(photo.bytes);
  });
});
