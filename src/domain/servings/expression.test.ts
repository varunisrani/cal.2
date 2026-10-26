import { describe, expect, it } from 'vitest';
import { formatQuantity } from '../units/numbers';
import { AMOUNT_OPERATORS, evalAmount, hasOperation, pushOperator } from './expression';

describe('evalAmount', () => {
  it('adds, subtracts, multiplies and divides with the calculator glyphs', () => {
    expect(evalAmount('50+20', 'en-US')).toBe(70);
    expect(evalAmount('200−35', 'en-US')).toBe(165);
    expect(evalAmount('80×2', 'en-US')).toBe(160);
    expect(evalAmount('300÷3', 'en-US')).toBe(100);
  });

  it('accepts the ASCII operators too', () => {
    expect(evalAmount('200-35', 'en-US')).toBe(165);
    expect(evalAmount('80*2', 'en-US')).toBe(160);
    expect(evalAmount('300/3', 'en-US')).toBe(100);
  });

  it('multiplies and divides before adding and subtracting, left to right', () => {
    expect(evalAmount('50+20×2', 'en-US')).toBe(90);
    expect(evalAmount('10-2*3-1', 'en-US')).toBe(3);
    expect(evalAmount('100-60/3', 'en-US')).toBe(80);
    expect(evalAmount('8/2/2', 'en-US')).toBe(2);
    expect(evalAmount('2-3-4', 'en-US')).toBe(-5);
  });

  it('reads unary signs', () => {
    expect(evalAmount('-3+5', 'en-US')).toBe(2);
    expect(evalAmount('+4', 'en-US')).toBe(4);
    expect(evalAmount('--5', 'en-US')).toBe(5);
    expect(evalAmount('5×-3', 'en-US')).toBe(-15);
    expect(evalAmount('5−−3', 'en-US')).toBe(8);
  });

  it('reads decimals with a dot or the locale mark', () => {
    expect(evalAmount('1,5+0,5', 'de-DE')).toBe(2);
    expect(evalAmount('1.5+0.25', 'en-US')).toBe(1.75);
    expect(evalAmount('1.5+0,5', 'de-DE')).toBe(2);
    expect(evalAmount('.5+5.', 'en-US')).toBe(5.5);
    expect(evalAmount('2,5×2', 'fr-FR')).toBe(5);
  });

  it('ignores spaces between tokens', () => {
    expect(evalAmount('  50 + 20 × 2 ', 'en-US')).toBe(90);
    expect(evalAmount('7', 'en-US')).toBe(7);
  });

  it('rejects a trailing operator, letters and division by about zero (R02.22)', () => {
    expect(evalAmount('50+', 'en-US')).toBeNull();
    expect(evalAmount('50×', 'en-US')).toBeNull();
    expect(evalAmount('abc', 'en-US')).toBeNull();
    expect(evalAmount('food+20', 'en-US')).toBeNull();
    expect(evalAmount('20g', 'en-US')).toBeNull();
    expect(evalAmount('5/0', 'en-US')).toBeNull();
    expect(evalAmount('50÷0', 'en-US')).toBeNull();
    expect(evalAmount('5÷0.0', 'en-US')).toBeNull();
    expect(evalAmount('5/-0', 'en-US')).toBeNull();
  });

  it('divides by a small number that is still above machine epsilon', () => {
    expect(evalAmount('1/0.001', 'en-US')).toBe(1000);
  });

  it('rejects empty and malformed text', () => {
    for (const text of ['', '   ', '+', '-', '×5', '5×÷3', '1 5', '1.2.3', '(1+2)', '1e3', '=5']) {
      expect(evalAmount(text, 'en-US'), text).toBeNull();
    }
    // A comma is not a decimal mark in en-US, and grouping marks are never read.
    expect(evalAmount('1,5', 'en-US')).toBeNull();
    expect(evalAmount('1,000+1', 'en-US')).toBeNull();
  });

  it('rejects a result that is not finite', () => {
    const huge = '9'.repeat(200);
    expect(evalAmount(`${huge}×${huge}`, 'en-US')).toBeNull();
    expect(evalAmount('9'.repeat(400), 'en-US')).toBeNull();
  });

  it('gives a result that formatQuantity writes for the field', () => {
    const result = evalAmount('100÷3', 'en-US');
    expect(result).not.toBeNull();
    expect(formatQuantity(result ?? 0)).toBe('33.3');
  });
});

describe('pushOperator', () => {
  it('appends an operator to a number', () => {
    expect(pushOperator('50', '+')).toBe('50+');
    expect(pushOperator('50+20', '×')).toBe('50+20×');
  });

  it('replaces a trailing operator instead of stacking one (R02.22)', () => {
    expect(pushOperator('50+', '×')).toBe('50×');
    expect(pushOperator('50-', '÷')).toBe('50÷');
    expect(pushOperator('50×', '−')).toBe('50−');
    expect(pushOperator('50+ ', '×')).toBe('50×');
  });

  it('leaves empty text alone', () => {
    expect(pushOperator('', '+')).toBe('');
    expect(pushOperator('  ', '−')).toBe('  ');
  });

  it('offers the four calculator keys', () => {
    expect(AMOUNT_OPERATORS).toEqual(['+', '−', '×', '÷']);
  });
});

describe('hasOperation', () => {
  it('is true once an operator follows the first character', () => {
    expect(hasOperation('50+20')).toBe(true);
    expect(hasOperation('50+')).toBe(true);
    expect(hasOperation('80*2')).toBe(true);
    expect(hasOperation('-3+5')).toBe(true);
  });

  it('is false for a plain number, even with a leading sign', () => {
    expect(hasOperation('50')).toBe(false);
    expect(hasOperation('1.5')).toBe(false);
    expect(hasOperation('-5')).toBe(false);
    expect(hasOperation(' -5')).toBe(false);
    expect(hasOperation('')).toBe(false);
  });
});
