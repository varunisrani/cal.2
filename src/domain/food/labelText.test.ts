import { describe, expect, it } from 'vitest';
import {
  decodeEntities,
  labelPieces,
  labelWords,
  markAllergens,
  productLabel,
  type LabelPiece,
} from './labelText';

const span = (text: string): string => `<span class="allergen">${text}</span>`;

describe('markAllergens (D23)', () => {
  it('turns allergen spans into markers on the plain words, entities decoded', () => {
    expect(
      markAllergens(
        'Wheat flour, milk & eggs, salt',
        `${span('Wheat')} flour, ${span('milk')} &amp; ${span('eggs')}, salt`,
      ),
    ).toBe('_Wheat_ flour, _milk_ & _eggs_, salt');
  });

  it('keeps spaces and punctuation at the edges of a span outside its marker', () => {
    expect(
      markAllergens('Contains: milk, soy.', `Contains${span(': milk, ')}${span('soy.')}`),
    ).toBe('Contains: _milk_, _soy_.');
    expect(markAllergens('Rice、大豆。', `Rice${span('、大豆。')}`)).toBe('Rice、_大豆_。');
    // A span of nothing but punctuation is left as it is.
    expect(markAllergens('Oats, salt', `Oats${span(', ')}salt`)).toBe('Oats, salt');
  });

  it('drops other span tags, and underscores inside an allergen span', () => {
    expect(
      markAllergens(
        'Oat flakes, hazelnuts',
        `<span class="organic">Oat</span> flakes, <SPAN CLASS='allergen'>hazel_nuts</SPAN >`,
      ),
    ).toBe('Oat flakes, _hazelnuts_');
  });

  it('ignores white space and entities when it compares the words', () => {
    expect(markAllergens('  Salt,  pepper &amp; milk ', `Salt, pepper &amp; ${span('milk')}`)).toBe(
      'Salt, pepper & _milk_',
    );
  });

  it('keeps the plain text when the marked-up text says other words', () => {
    expect(markAllergens('Sugar, cocoa butter', `${span('Milk')} chocolate`)).toBe(
      'Sugar, cocoa butter',
    );
  });

  it('keeps the plain text when there is no markup, or it leaves nothing', () => {
    expect(markAllergens(' Oats, salt ', undefined)).toBe('Oats, salt');
    expect(markAllergens('Oats, salt', '  ')).toBe('Oats, salt');
    expect(markAllergens('Oats, salt', '<span class="x"></span>')).toBe('Oats, salt');
    expect(markAllergens(undefined, undefined)).toBeUndefined();
    expect(markAllergens('   ', '')).toBeUndefined();
  });

  it('uses the marked-up text alone when there is no plain text', () => {
    expect(markAllergens(undefined, `${span('Soy')} sauce`)).toBe('_Soy_ sauce');
    expect(markAllergens('', `${span('Soy')} sauce`)).toBe('_Soy_ sauce');
  });
});

describe('decodeEntities', () => {
  it('decodes the named, decimal and hex entities and leaves those naming no character', () => {
    expect(decodeEntities('a&nbsp;b &lt;c&gt; &quot;d&quot; &apos;e&apos; &amp;')).toBe(
      'a b <c> "d" \'e\' &',
    );
    expect(decodeEntities('Caf&#233; &#xE9;&#XE8; &#128512;')).toBe('Café éè 😀');
    expect(decodeEntities('&#55296; &#9999999; &copy; & ;')).toBe('&#55296; &#9999999; &copy; & ;');
  });
});

describe('labelPieces', () => {
  const bold = (text: string): LabelPiece => ({ text, allergen: true });
  const plain = (text: string): LabelPiece => ({ text, allergen: false });

  it('splits the markers into bold pieces between plain ones', () => {
    expect(labelPieces('Oat flakes, _barley_ malt, _sesame_.')).toEqual([
      plain('Oat flakes, '),
      bold('barley'),
      plain(' malt, '),
      bold('sesame'),
      plain('.'),
    ]);
    expect(labelPieces('_Soy_')).toEqual([bold('Soy')]);
  });

  it('drops an unpaired underscore and keeps an empty or blank pair plain', () => {
    expect(labelPieces('Rice __ water _ salt')).toEqual([plain('Rice  water  salt')]);
    expect(labelPieces('Rice _ _ water')).toEqual([plain('Rice   water')]);
    expect(labelPieces('')).toEqual([]);
  });

  it('gives the words without markers', () => {
    expect(labelWords('_Soy_ sauce, water_')).toBe('Soy sauce, water');
  });
});

describe('productLabel', () => {
  it('prefers the marked list, falls back to the plain one, and has none when blank', () => {
    expect(productLabel({ ingredients: 'Soy sauce', markedIngredients: '_Soy_ sauce' })).toBe(
      '_Soy_ sauce',
    );
    expect(productLabel({ ingredients: ' Oats ' })).toBe('Oats');
    expect(productLabel({ ingredients: '  ' })).toBeUndefined();
    expect(productLabel({})).toBeUndefined();
  });
});
