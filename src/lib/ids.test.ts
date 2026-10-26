import { describe, expect, it } from 'vitest';
import { newId, withIdSequence } from './ids';

/** Five lowercase hex groups of 8-4-4-4-12, version nibble 4, variant nibble 8, 9, a or b. */
function shapeOf(id: string) {
  const groups = id.split('-');
  return {
    groupLengths: groups.map((g) => g.length),
    allHex: groups.every((g) => /^[0-9a-f]+$/.test(g)),
    version: groups[2]?.charAt(0),
    variantOk: '89ab'.includes(groups[3]?.charAt(0) || '?'),
  };
}

describe('newId', () => {
  it('returns a v4 UUID, different on each call', () => {
    const ids = [newId(), newId(), newId()];
    for (const id of ids) {
      expect(shapeOf(id)).toEqual({
        groupLengths: [8, 4, 4, 4, 12],
        allHex: true,
        version: '4',
        variantOk: true,
      });
    }
    expect(new Set(ids).size).toBe(3);
  });

  it('a non-UUID fails the shape check', () => {
    expect(shapeOf('a-1')).not.toMatchObject({ groupLengths: [8, 4, 4, 4, 12] });
    expect(shapeOf('00000000-0000-1000-8000-000000000000').version).toBe('1');
  });
});

describe('withIdSequence', () => {
  it('counts prefix-1, prefix-2, … from one', () => {
    const next = withIdSequence('a');
    expect([next(), next(), next()]).toEqual(['a-1', 'a-2', 'a-3']);
  });

  it('keeps each sequence on its own count', () => {
    const meals = withIdSequence('meal');
    const photos = withIdSequence('photo');
    expect(meals()).toBe('meal-1');
    expect(meals()).toBe('meal-2');
    expect(photos()).toBe('photo-1');
    expect(withIdSequence('meal')()).toBe('meal-1');
  });
});
