import { describe, expect, it } from 'vitest';
import { EXTRA_KEYS, NUTRIENT_KEYS } from '../../domain/model';
import { FOOD_REPLY_KEYS, PART_REPLY_KEYS, UNIT_REPLY_KEYS } from '../parse/foodReply';
import { FOOD_REPLY_CONTRACT, UNIT_RULES } from './contract';
import {
  labelScanPrompt,
  photoMealPrompt,
  textMealPrompt,
  unitRepairPrompt,
  usesProgressive,
} from './food';

const STEPS = 'built up in steps';
const PROGRESSIVE_ON = 'Set "progressive" to true.';
const PROGRESSIVE_OFF = 'Set "progressive" to false.';

describe('photoMealPrompt: the contract', () => {
  it('mentions every key of the contract, nutrients and sports compounds included', () => {
    const { prompt } = photoMealPrompt({ photoCount: 2 });
    for (const key of [
      ...Object.values(FOOD_REPLY_KEYS),
      ...Object.values(UNIT_REPLY_KEYS),
      ...Object.values(PART_REPLY_KEYS),
    ]) {
      expect(prompt).toContain(`"${key}"`);
    }
    for (const key of [...NUTRIENT_KEYS, ...EXTRA_KEYS]) {
      expect(prompt).toMatch(new RegExp(`\\b${key}\\b`));
    }
  });

  it('ends with the whole reply contract, for one photo and for many', () => {
    expect(photoMealPrompt({ photoCount: 1 }).prompt.endsWith(FOOD_REPLY_CONTRACT)).toBe(true);
    expect(photoMealPrompt({ photoCount: 10 }).prompt.endsWith(FOOD_REPLY_CONTRACT)).toBe(true);
  });

  it('asks for JSON only in the system part and never carries the kJ line', () => {
    const { system, prompt } = photoMealPrompt({ photoCount: 3, progressive: true });
    expect(system).toContain('one JSON object');
    expect(`${system}\n${prompt}`).not.toContain('kilojoules');
  });
});

describe('photoMealPrompt: several views of one meal', () => {
  it('treats every photo as part of one meal and counts each food once', () => {
    const { prompt } = photoMealPrompt({ photoCount: 3 });
    expect(prompt).toContain('These 3 photos, in the order they were taken, show one meal to log');
    expect(prompt).toContain('count each food once however many photos show it');
    expect(prompt).toContain('add up to one meal total');
  });

  it('prefers readable scale and label figures over a guess, in every mode', () => {
    for (const input of [
      { photoCount: 1 },
      { photoCount: 4 },
      { photoCount: 4, progressive: true },
    ]) {
      expect(photoMealPrompt(input).prompt).toContain(
        'Where a scale display or a label can be read, use its figures rather than judging by eye.',
      );
    }
  });

  it('estimates the amount shown: a whole cake counts as the whole cake', () => {
    const { prompt } = photoMealPrompt({ photoCount: 1 });
    expect(prompt).toContain('The photo shows one meal to log');
    expect(prompt).toContain('counts as the whole item, not as one slice');
  });
});

describe('photoMealPrompt: a plate built in steps', () => {
  it('uses the step rules only when the flag is set and there are at least two photos', () => {
    const cases = [
      { input: { photoCount: 2, progressive: true }, steps: true },
      { input: { photoCount: 10, progressive: true }, steps: true },
      { input: { photoCount: 1, progressive: true }, steps: false },
      { input: { photoCount: 0, progressive: true }, steps: false },
      { input: { photoCount: 3, progressive: false }, steps: false },
      { input: { photoCount: 3 }, steps: false },
    ];
    for (const { input, steps } of cases) {
      const { prompt } = photoMealPrompt(input);
      expect(usesProgressive(input), JSON.stringify(input)).toBe(steps);
      expect(prompt.includes(STEPS), JSON.stringify(input)).toBe(steps);
      expect(prompt.includes('difference from the reading before it'), JSON.stringify(input)).toBe(
        steps,
      );
      expect(prompt).toContain(steps ? PROGRESSIVE_ON : PROGRESSIVE_OFF);
    }
  });

  it('takes weights from cumulative scale differences and never subtracts doubtful readings', () => {
    const { prompt } = photoMealPrompt({ photoCount: 3, progressive: true });
    expect(prompt).toContain('the first food weighs the first reading');
    expect(prompt).toContain(
      'After a tare or reset that can be seen, take that reading as it stands.',
    );
    expect(prompt).toContain(
      'Never subtract readings that cannot be read, do not belong together or go down',
    );
    expect(prompt).toContain('servingGrams should match the last reliable reading');
    expect(prompt).not.toContain('count each food once however many photos show it');
  });
});

describe('photoMealPrompt: the note', () => {
  it("adds the person's note as context, trimmed and on one line", () => {
    const { prompt } = photoMealPrompt({ photoCount: 2, note: '  oat milk,\n no sugar  ' });
    expect(prompt).toContain('The person added a note about these photos');
    expect(prompt).toContain('"oat milk, no sugar"');
    expect(prompt.indexOf('"oat milk, no sugar"')).toBeLessThan(
      prompt.indexOf(FOOD_REPLY_CONTRACT),
    );
  });

  it('leaves the note paragraph out when the note is missing or blank', () => {
    for (const note of [undefined, '', '   \n ']) {
      expect(photoMealPrompt({ photoCount: 2, note }).prompt).not.toContain('added a note');
    }
  });
});

describe('textMealPrompt', () => {
  it('carries the description and the contract, and asks for one fitting food emoji', () => {
    const { prompt } = textMealPrompt({ description: ' Two boiled eggs\nand a slice of rye ' });
    expect(prompt).toContain('"Two boiled eggs and a slice of rye"');
    expect(prompt).toContain('For "emoji", pick one emoji that fits this particular food');
    expect(prompt.endsWith(FOOD_REPLY_CONTRACT)).toBe(true);
    expect(prompt).toContain(PROGRESSIVE_OFF);
  });

  it('reads amounts, brands and several items into one total, with counts only as stated', () => {
    const { prompt } = textMealPrompt({ description: '2 bananas' });
    expect(prompt).toContain('amounts, brands and every item mentioned');
    expect(prompt).toContain('one total for the whole description');
    expect(prompt).toContain('Give a unit count only for an amount the person stated');
  });
});

describe('labelScanPrompt (Proposed D-16.62)', () => {
  it('is the photo request with a hint to read one labelled serving', () => {
    const label = labelScanPrompt({ photoCount: 2, note: 'family pack' }).prompt;
    const photos = photoMealPrompt({ photoCount: 2 }).prompt;
    expect(label).toContain(photos.slice(0, photos.indexOf('\n\n')));
    expect(label).toContain('These photos are of a packaged food and its printed nutrition label');
    expect(label).toContain('report one serving as the label defines it');
    expect(label).toContain('servingGrams the printed serving size');
    expect(label).toContain('Leave "parts" empty');
    expect(label).toContain('"family pack"');
    expect(label).toContain(PROGRESSIVE_OFF);
    expect(label.endsWith(FOOD_REPLY_CONTRACT)).toBe(true);
  });

  it('speaks of one photo when there is one', () => {
    expect(labelScanPrompt({ photoCount: 1 }).prompt).toContain('This photo is of a packaged food');
  });
});

describe('unitRepairPrompt (R03.17)', () => {
  const input = { name: 'Black coffee', grams: 236.58, note: 'large mug', withPhoto: true };

  it('asks only for the units list of the named food at its weight, to one decimal', () => {
    const { prompt } = unitRepairPrompt(input);
    expect(prompt).toContain('Food: "Black coffee"');
    expect(prompt).toContain('Total weight (servingGrams): 236.6 g');
    expect(prompt).toContain('holding only the key "units"');
    expect(prompt).toContain(UNIT_RULES);
    expect(prompt).toContain('"large mug"');
    for (const other of ['"kcal"', '"parts"', '"nutrients"', '"name"']) {
      expect(prompt).not.toContain(other);
    }
  });

  it('mentions the photo only when one goes with the request', () => {
    expect(unitRepairPrompt(input).prompt).toContain('The photo of the food is attached again.');
    expect(unitRepairPrompt({ ...input, withPhoto: false }).prompt).not.toContain('photo');
  });

  it('adds the repair vocabulary: no single-unit guess, real numbers, visible containers', () => {
    const { prompt } = unitRepairPrompt(input);
    expect(prompt).toContain('Never assume the whole amount is a single unit.');
    expect(prompt).toContain('Every count and gramsEach is a JSON number above 0.');
    expect(prompt).toContain('Scoop or bowl');
  });
});
