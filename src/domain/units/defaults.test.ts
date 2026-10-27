import { describe, expect, it } from 'vitest';
import { defaultUnits } from './defaults';

const FEET_AND_INCHES = { energy: 'kcal', height: 'ftIn', weight: 'kg' };
const METRIC = { energy: 'kcal', height: 'cm', weight: 'kg' };

describe('defaultUnits', () => {
  it('starts en-US, en-LR and my-MM in kg and feet and inches (D-16.91)', () => {
    expect(defaultUnits('en-US')).toEqual(FEET_AND_INCHES);
    expect(defaultUnits('en-LR')).toEqual(FEET_AND_INCHES);
    expect(defaultUnits('my-MM')).toEqual(FEET_AND_INCHES);
  });

  it('starts every other tag in kg and cm', () => {
    for (const tag of ['en-GB', 'de-DE', 'en', 'my', 'es-US', 'en-CA', 'fr-FR', 'en-AU']) {
      expect(defaultUnits(tag), tag).toEqual(METRIC);
    }
  });

  it('ignores case, scripts, extensions and underscores in the tag', () => {
    for (const tag of ['en-us', 'EN-US', 'en_US', 'en-Latn-US', 'en-US-u-ca-gregory', ' en-US ']) {
      expect(defaultUnits(tag), tag).toEqual(FEET_AND_INCHES);
    }
  });

  it('starts metric for a tag that cannot be read', () => {
    for (const tag of ['', 'not a tag', '123', '-']) {
      expect(defaultUnits(tag), tag).toEqual(METRIC);
    }
  });

  it('seeds height from the locale and weight in kg for every tag (R01.18, D-16.91)', () => {
    const tags = ['en-US', 'en-LR', 'my-MM', 'en-GB', 'de-DE', 'en', 'ja-JP', 'my', 'xx', ''];
    for (const tag of tags) expect(defaultUnits(tag).weight, tag).toBe('kg');
    expect(defaultUnits('en-US').height).toBe('ftIn');
    expect(defaultUnits('en-GB').height).toBe('cm');
  });

  it('always starts energy in kcal', () => {
    expect(defaultUnits('en-US').energy).toBe('kcal');
    expect(defaultUnits('en-AU').energy).toBe('kcal');
  });
});
