import { describe, expect, it } from 'vitest';
import { defaultUnits } from './defaults';

const IMPERIAL = { energy: 'kcal', height: 'ftIn', weight: 'lb' };
const METRIC = { energy: 'kcal', height: 'cm', weight: 'kg' };

describe('defaultUnits', () => {
  it('starts en-US, en-LR and my-MM in lb and feet and inches', () => {
    expect(defaultUnits('en-US')).toEqual(IMPERIAL);
    expect(defaultUnits('en-LR')).toEqual(IMPERIAL);
    expect(defaultUnits('my-MM')).toEqual(IMPERIAL);
  });

  it('starts every other tag in kg and cm', () => {
    for (const tag of ['en-GB', 'de-DE', 'en', 'my', 'es-US', 'en-CA', 'fr-FR', 'en-AU']) {
      expect(defaultUnits(tag), tag).toEqual(METRIC);
    }
  });

  it('ignores case, scripts, extensions and underscores in the tag', () => {
    for (const tag of ['en-us', 'EN-US', 'en_US', 'en-Latn-US', 'en-US-u-ca-gregory', ' en-US ']) {
      expect(defaultUnits(tag), tag).toEqual(IMPERIAL);
    }
  });

  it('starts metric for a tag that cannot be read', () => {
    for (const tag of ['', 'not a tag', '123', '-']) {
      expect(defaultUnits(tag), tag).toEqual(METRIC);
    }
  });

  it('seeds height and weight together from the locale (R01.18)', () => {
    const tags = ['en-US', 'en-LR', 'my-MM', 'en-GB', 'de-DE', 'en', 'ja-JP', 'my', 'xx'];
    for (const tag of tags) {
      const { height, weight } = defaultUnits(tag);
      expect(height === 'ftIn', tag).toBe(weight === 'lb');
    }
  });

  it('always starts energy in kcal', () => {
    expect(defaultUnits('en-US').energy).toBe('kcal');
    expect(defaultUnits('en-AU').energy).toBe('kcal');
  });
});
