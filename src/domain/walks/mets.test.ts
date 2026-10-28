import { describe, expect, it } from 'vitest';
import { metForSpeed, walkingBand, WALKING_METS } from './mets';

describe('metForSpeed (2024 Adult Compendium walking codes)', () => {
  it('lists the eight level-walking codes, slowest first, with their values', () => {
    expect(WALKING_METS.map((band) => [band.code, band.met])).toEqual([
      ['17151', 2.3],
      ['17152', 2.8],
      ['17170', 3.0],
      ['17190', 3.8],
      ['17200', 4.8],
      ['17220', 5.5],
      ['17230', 7.0],
      ['17231', 8.5],
    ]);
    const bounds = WALKING_METS.map((band) => band.fromKmh);
    expect([...bounds].sort((a, b) => a - b)).toEqual(bounds);
  });

  it('reads each band from its lower speed in km/h', () => {
    expect(metForSpeed(2)).toBe(2.3);
    expect(metForSpeed(3.2)).toBe(2.3);
    expect(metForSpeed(3.25)).toBe(2.8);
    expect(metForSpeed(4.1)).toBe(3.0);
    expect(metForSpeed(5)).toBe(3.8);
    // 3.5 mph is 5.63 km/h: brisk.
    expect(metForSpeed(5.6)).toBe(3.8);
    expect(metForSpeed(5.65)).toBe(4.8);
    expect(metForSpeed(6.5)).toBe(5.5);
    expect(metForSpeed(7.5)).toBe(7.0);
    expect(metForSpeed(8.1)).toBe(8.5);
    expect(metForSpeed(20)).toBe(8.5);
  });

  it('reads the slowest band for no speed', () => {
    expect(metForSpeed(0)).toBe(2.3);
    expect(metForSpeed(Number.NaN)).toBe(2.3);
    expect(walkingBand(-1).code).toBe('17151');
  });
});
