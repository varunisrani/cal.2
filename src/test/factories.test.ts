import { describe, expect, it } from 'vitest';
import {
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
  type Codec,
} from '../data/codecs';
import {
  FACTORY_NOW,
  makeAnalysisDraft,
  makeBodyFat,
  makeCoachMessage,
  makeDraft,
  makeEntry,
  makeFast,
  makeLine,
  makePhoto,
  makeProduct,
  makeProfile,
  makeProfileRow,
  makeSavedMeal,
  makeWalk,
  makeWater,
  makeWeighIn,
  nextId,
  resetFactories,
} from './factories';

const builders: Array<[string, () => unknown, Codec<unknown>]> = [
  ['makeDraft', () => makeDraft(), decodeNutritionDraft],
  [
    'makeDraft with lines and a product',
    () => makeDraft({ lines: [makeLine(), makeLine({ emoji: '🥕' })], product: makeProduct() }),
    decodeNutritionDraft,
  ],
  ['makeEntry', () => makeEntry(), decodeEntry],
  ['makeSavedMeal', () => makeSavedMeal({ originEntryId: 'entry-9' }), decodeSavedMeal],
  ['makeAnalysisDraft', () => makeAnalysisDraft(), decodeAnalysisDraft],
  ['makeProfile', () => makeProfile({ bodyFat: 0.28, lockedMacros: ['protein'] }), decodeProfile],
  ['makeWeighIn', () => makeWeighIn(), decodeWeighIn],
  ['makeBodyFat', () => makeBodyFat(), decodeBodyFat],
  ['makeWater', () => makeWater(), decodeWater],
  ['makeFast', () => makeFast(), decodeFast],
  ['makeWalk', () => makeWalk(), decodeWalk],
  ['makeFast running', () => makeFast({ end: null }), decodeFast],
  [
    'makeCoachMessage',
    () => makeCoachMessage({ role: 'user', state: { status: 'failed', kind: 'quota' } }),
    decodeCoachMessage,
  ],
  ['makePhoto', () => makePhoto(), decodePhoto],
];

describe('factories', () => {
  it.each(builders)('%s builds a record its codec reads back unchanged', (_name, make, codec) => {
    const record = make();
    expect(codec(record)).toEqual(record);
  });

  it('builds the stored profile row under the key me', () => {
    const row = makeProfileRow({ weightKg: 80 });
    expect(row.id).toBe('me');
    const { id: _id, ...profile } = row;
    expect(decodeProfile(row)).toEqual(profile);
    expect(profile.weightKg).toBe(80);
  });

  it('applies overrides', () => {
    expect(makeEntry({ name: 'Toast', kcal: 250, meal: 'breakfast' })).toMatchObject({
      name: 'Toast',
      kcal: 250,
      meal: 'breakfast',
    });
    expect(makeWeighIn({ kg: 81.2 }).kg).toBe(81.2);
  });

  it('derives day keys from an overridden instant unless the day key is given too', () => {
    const lateEvening = Date.parse('2026-10-26T23:30:00-04:00');
    expect(makeEntry().dayKey).toBe('2026-10-26');
    expect(makeEntry({ loggedAt: lateEvening + 3_600_000 }).dayKey).toBe('2026-10-27');
    expect(makeWater({ at: lateEvening + 3_600_000 }).dayKey).toBe('2026-10-27');
    expect(makeEntry({ loggedAt: lateEvening, dayKey: '2026-10-25' }).dayKey).toBe('2026-10-25');
    expect(makeFast().end).toBe(FACTORY_NOW);
  });

  it('gives every record its own id and starts again after a reset', () => {
    resetFactories();
    const ids = [makeEntry().id, makeEntry().id, makeWater().id, nextId('entry')];
    expect(ids).toEqual(['entry-1', 'entry-2', 'water-1', 'entry-3']);
    resetFactories();
    expect(makeEntry().id).toBe('entry-1');
  });
});
