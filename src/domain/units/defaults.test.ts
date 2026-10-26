import { describe, expect, it } from 'vitest';
import { defaultUnits } from './defaults';

const IMPERIAL = { energy: 'kcal', height: 'ftIn', weight: 'lb' };
const METRIC = { energy: 'kcal', height: 'cm', weight: 'kg' };

describe('defaultUnits', () => {
  it('starts the United States, Liberia and Myanmar in lb and feet and inches', () => {
    expect(defaultUnits('en-US')).toEqual(IMPERIAL);
    expect(defaultUnits('en-LR')).toEqual(IMPERIAL);
    expect(defaultUnits('my-MM')).toEqual(IMPERIAL);
  });

  it('starts every other locale in kg and cm', () => {
    for (const tag of ['en-GB', 'de-DE', 'en', 'my', 'en-CA', 'fr-FR', 'es-US', 'en-IN', 'ja-JP']) {
      expect(defaultUnits(tag), tag).toEqual(METRIC);
    }
  });

  it('reads any spelling of the three imperial locales', () => {
    for (const tag of [
      'en-us',
      'EN-US',
      'en_US',
      'en-Latn-US',
      'en-US-u-nu-latn',
      'en-lr',
      'my-mm',
    ]) {
      expect(defaultUnits(tag), tag).toEqual(IMPERIAL);
    }
  });

  it('starts metric for a tag Intl cannot read', () => {
    for (const tag of ['', 'not a locale', '123', 'en--US']) {
      expect(defaultUnits(tag), tag).toEqual(METRIC);
    }
  });

  it('always seeds height and weight together, with energy in kcal (R01.18)', () => {
    const tags = ['en-US', 'en-LR', 'my-MM', 'en-GB', 'de-DE', 'en', 'es-US', 'en_US', 'xx', ''];
    for (const tag of tags) {
      const units = defaultUnits(tag);
      expect(units.height === 'ftIn', tag).toBe(units.weight === 'lb');
      expect(units.energy, tag).toBe('kcal');
    }
  });
});
