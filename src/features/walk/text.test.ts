import { describe, expect, it } from 'vitest';
import { cadenceText, clockText, paceText, speedText, walkDistance, walkEnergy } from './text';

describe('walk text (P15-03)', () => {
  it('writes the time as a clock', () => {
    expect(clockText(0)).toBe('0:00');
    expect(clockText(245.9)).toBe('4:05');
    expect(clockText(754)).toBe('12:34');
    expect(clockText(3_723)).toBe('1:02:03');
    expect(clockText(-5)).toBe('0:00');
  });

  it('writes the pace per km or per mile, and a dash without one or while standing', () => {
    expect(paceText(667, 'km')).toBe('11:07 /km');
    expect(paceText(667, 'mi')).toBe('17:53 /mi');
    expect(paceText(null, 'km')).toBe('–');
    expect(paceText(0, 'km')).toBe('–');
    expect(paceText(4_000, 'km')).toBe('–');
  });

  it('writes distances, speeds, cadence and energy in the person’s units', () => {
    expect(walkDistance(2_600, 'km')).toBe('2.6 km');
    expect(walkDistance(2_600, 'mi')).toBe('1.6 mi');
    expect(speedText(4.8, 'km')).toBe('4.8 km/h');
    expect(speedText(4.8, 'mi')).toBe('3.0 mph');
    expect(cadenceText(111.6)).toBe('112 steps/min');
    expect(cadenceText(null)).toBe('–');
    expect(walkEnergy(90, 'kcal')).toBe('90 kcal');
    expect(walkEnergy(90, 'kJ')).toBe('377 kJ');
  });
});
