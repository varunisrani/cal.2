import { describe, expect, it } from 'vitest';
import { AMOUNT_OPERATORS, evalAmount, hasOperation, pushOperator } from './expression';

const US = 'en-US';
const DE = 'de-DE';

describe('evalAmount', () => {
  it('adds, subtracts, multiplies and divides with the shown symbols', () => {
    expect(evalAmount('50+20', US)).toBe(70);
    expect(evalAmount('200−35', US)).toBe(165);
    expect(evalAmount('80×2', US)).toBe(160);
    expect(evalAmount('300÷3', US)).toBe(100);
  });

  it('accepts the ASCII forms of the operators', () => {
    expect(evalAmount('200-35', US)).toBe(165);
    expect(evalAmount('80*2', US)).toBe(160);
    expect(evalAmount('300/3', US)).toBe(100);
  });

  it('multiplies and divides before adding and subtracting', () => {
    expect(evalAmount('50+20×2', US)).toBe(90);
    expect(evalAmount('10−2×3', US)).toBe(4);
    expect(evalAmount('100÷4+5×2−1', US)).toBe(34);
    expect(evalAmount('2×3×4÷6', US)).toBe(4);
    expect(evalAmount('20−5−5', US)).toBe(10);
  });

  it('reads unary signs where a number is expected', () => {
    expect(evalAmount('-3+5', US)).toBe(2);
    expect(evalAmount('−3+5', US)).toBe(2);
    expect(evalAmount('+4', US)).toBe(4);
    expect(evalAmount('5×−2', US)).toBe(-10);
    expect(evalAmount('5−−2', US)).toBe(7);
    expect(evalAmount('--5', US)).toBe(5);
  });

  it('reads decimals with a dot or the locale decimal mark', () => {
    expect(evalAmount('1,5+0,5', DE)).toBe(2);
    expect(evalAmount('1.5+0.25', US)).toBe(1.75);
    expect(evalAmount('1.5+0,5', DE)).toBe(2);
    expect(evalAmount('.5+5.', US)).toBe(5.5);
    expect(evalAmount('2,5', 'fr-FR')).toBe(2.5);
  });

  it('ignores spaces anywhere in the text', () => {
    expect(evalAmount(' 50 + 20 ', US)).toBe(70);
    expect(evalAmount('1 000', US)).toBe(1000);
    expect(evalAmount('2\t×\n3', US)).toBe(6);
  });

  it('gives a plain number its own value', () => {
    expect(evalAmount('150', US)).toBe(150);
    expect(evalAmount('0', US)).toBe(0);
    expect(Object.is(evalAmount('0×−1', US), 0)).toBe(true);
  });

  it('has no value for a trailing operator, letters or division by about zero (R02.22)', () => {
    for (const text of [
      '50+',
      '50×',
      '5−',
      'abc',
      'food+20',
      '20g',
      '5/0',
      '50÷0',
      '5÷0.0',
      '5÷-0',
    ]) {
      expect(evalAmount(text, US), text).toBeNull();
    }
    expect(evalAmount('1÷0.0000000000000001', US)).toBeNull();
    expect(evalAmount('1÷0.000001', US)).toBe(1_000_000);
  });

  it('has no value for empty or incomplete text', () => {
    for (const text of ['', '   ', '+', '−', '×5', '5××2', '.', '1.2.3', '(1+2)', '2^3', '5%']) {
      expect(evalAmount(text, US), text).toBeNull();
    }
  });

  it('does not take a comma as a decimal mark where the locale uses a dot', () => {
    expect(evalAmount('1,5+0,5', US)).toBeNull();
    expect(evalAmount('1,000', US)).toBeNull();
  });

  it('has no value when the result is not finite', () => {
    const huge = '9'.repeat(400);
    expect(evalAmount(huge, US)).toBeNull();
    expect(evalAmount(`${huge}−${huge}`, US)).toBeNull();
    expect(evalAmount(`0×${huge}`, US)).toBeNull();
  });
});

describe('pushOperator', () => {
  it('appends an operator after a number', () => {
    expect(pushOperator('50', '+')).toBe('50+');
    expect(pushOperator('1.5', '×')).toBe('1.5×');
  });

  it('replaces a trailing operator instead of stacking a second one (R02.22)', () => {
    expect(pushOperator('50+', '×')).toBe('50×');
    expect(pushOperator('50×', '÷')).toBe('50÷');
    expect(pushOperator('50*', '−')).toBe('50−');
    expect(pushOperator('50 + ', '÷')).toBe('50 ÷');
    expect(evalAmount(pushOperator('50+', '×'), US)).toBeNull();
  });

  it('leaves an empty field empty', () => {
    expect(pushOperator('', '+')).toBe('');
    expect(pushOperator('  ', '×')).toBe('  ');
  });

  it('offers the four calculator keys', () => {
    expect(AMOUNT_OPERATORS).toEqual(['+', '−', '×', '÷']);
  });
});

describe('hasOperation', () => {
  it('is true once an operator follows the first character', () => {
    expect(hasOperation('50+20')).toBe(true);
    expect(hasOperation('50+')).toBe(true);
    expect(hasOperation('2*3')).toBe(true);
    expect(hasOperation(' -5+1')).toBe(true);
  });

  it('is false for a plain number or a leading sign', () => {
    expect(hasOperation('50')).toBe(false);
    expect(hasOperation('-5')).toBe(false);
    expect(hasOperation('−5')).toBe(false);
    expect(hasOperation('')).toBe(false);
  });
});
