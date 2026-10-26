import { describe, expect, it } from 'vitest';
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
} from '../data/codecs';
import { FACTORY_NOW, factories, testBlob } from './factories';

describe('factories', () => {
  it('build records that read back unchanged through their codecs', () => {
    const make = factories();
    const pairs: [unknown, (raw: unknown) => unknown][] = [
      [make.draft(), decodeDraft],
      [make.entry(), decodeEntry],
      [make.savedMeal(), decodeSavedMeal],
      [make.analysisDraft(), decodeAnalysisDraft],
      [make.weighIn(), decodeWeighIn],
      [make.bodyFat(), decodeBodyFat],
      [make.water(), decodeWater],
      [make.fast(), decodeFast],
      [make.fast({ end: null }), decodeFast],
      [make.coachMessage(), decodeCoachMessage],
      [make.profile(), decodeProfile],
      [make.photo(), decodePhoto],
    ];
    for (const [record, decode] of pairs) expect(decode(record)).toEqual(record);
  });

  it('count ids per kind and start again for a new set', () => {
    const make = factories();
    expect([make.entry().id, make.entry().id, make.water().id]).toEqual([
      'entry-1',
      'entry-2',
      'water-1',
    ]);
    expect(factories().entry().id).toBe('entry-1');
  });

  it('take times from the fixed clock and derive the day key in New York', () => {
    const make = factories();
    expect(make.clock.now()).toBe(FACTORY_NOW);
    expect(make.entry()).toMatchObject({ loggedAt: FACTORY_NOW, dayKey: '2026-10-26' });
    // 23:30 in New York is already the next day in UTC.
    const late = Date.UTC(2026, 9, 27, 3, 30);
    expect(make.entry({ loggedAt: late }).dayKey).toBe('2026-10-26');
    expect(make.water({ at: late }).dayKey).toBe('2026-10-26');
  });

  it('let overrides win and keep saved meals in the order they were made', () => {
    const make = factories();
    expect(make.entry({ name: 'Toast', meal: 'breakfast' })).toMatchObject({
      name: 'Toast',
      meal: 'breakfast',
    });
    expect([make.savedMeal().order, make.savedMeal().order]).toEqual([0, 1]);
    expect(make.profileRow({ weightKg: 80 })).toMatchObject({ id: 'me', weightKg: 80 });
  });

  it('size photo rows from their blobs and allow one without a thumbnail', () => {
    const make = factories();
    const blob = testBlob('12345');
    expect(make.photo({ blob, thumb: undefined })).toMatchObject({ bytes: 5 });
    expect(make.photo().bytes).toBe(testBlob('photo bytes').size + testBlob('thumb').size);
  });
});
