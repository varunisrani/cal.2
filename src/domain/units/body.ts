// Height and weight in the units a person reads them in. The profile stores cm and kg at full
// precision; only display, wheels and typed input convert. One factor serves both directions
// (1 kg = 2.20462 lb), so a value converted there and back lands where it started, and every
// weight wheel uses one range: 20–250 kg or 50–500 lb (D-16.56).

import { clamp, formatFixed, formatTrimmed } from './numbers';

/** The values of the `units.weight` setting. */
export const WEIGHT_MEASURES = ['kg', 'lb'] as const;
export type WeightMeasure = (typeof WEIGHT_MEASURES)[number];

export function isWeightMeasure(value: unknown): value is WeightMeasure {
  return value === 'kg' || value === 'lb';
}

/** The values of the `units.height` setting. */
export const HEIGHT_MEASURES = ['cm', 'ftIn'] as const;
export type HeightMeasure = (typeof HEIGHT_MEASURES)[number];

export function isHeightMeasure(value: unknown): value is HeightMeasure {
  return value === 'cm' || value === 'ftIn';
}

export const LB_PER_KG = 2.20462;
export const CM_PER_INCH = 2.54;
const INCHES_PER_FOOT = 12;

/** The weight in `unit`, unrounded. */
export function weightToDisplay(kg: number, unit: WeightMeasure): number {
  return unit === 'lb' ? kg * LB_PER_KG : kg;
}

/** kg for a weight given in `unit`, unrounded. */
export function weightFromDisplay(value: number, unit: WeightMeasure): number {
  return unit === 'lb' ? value / LB_PER_KG : value;
}

/** A weight with one decimal in the locale's marks: "70.0", "154.3". */
export function formatWeight(kg: number, unit: WeightMeasure, locale: string): string {
  return formatFixed(weightToDisplay(kg, unit), 1, locale);
}

/**
 * Weekly pace as short text: two decimals at most, trailing zeros dropped, always a dot
 * (0.25 kg → "0.25", in lb "0.55"; 1 kg → "1", in lb "2.2").
 */
export function formatPace(kgPerWeek: number, unit: WeightMeasure): string {
  return formatTrimmed(weightToDisplay(kgPerWeek, unit), 2);
}

/** The whole cm shown for a height: cut, not rounded. */
export function heightCmShown(cm: number): number {
  return Math.trunc(cm);
}

export interface FeetInches {
  feet: number;
  /** 0–11 */
  inches: number;
}

function splitInches(totalInches: number): FeetInches {
  return {
    feet: Math.floor(totalInches / INCHES_PER_FOOT),
    inches: totalInches % INCHES_PER_FOOT,
  };
}

/** Feet and inches from the nearest whole inch, so 170 cm is 5′7″ (not 5′6″). */
export function toFeetInches(cm: number): FeetInches {
  return splitInches(Math.round(cm / CM_PER_INCH));
}

/** cm for a height in feet and inches, unrounded (5′7″ → 170.18). */
export function fromFeetInches({ feet, inches }: FeetInches): number {
  return (feet * INCHES_PER_FOOT + inches) * CM_PER_INCH;
}

// ---- Wheels --------------------------------------------------------------------------------

/** Lowest and highest weight a wheel offers, in the wheel's unit (D-16.37, D-16.56). */
export const WEIGHT_LIMITS: Readonly<Record<WeightMeasure, { min: number; max: number }>> = {
  kg: { min: 20, max: 250 },
  lb: { min: 50, max: 500 },
};

/** Height wheel ends: whole cm, or total inches for feet and inches (3′0″–8′11″). */
export const HEIGHT_LIMITS: Readonly<Record<HeightMeasure, { min: number; max: number }>> = {
  cm: { min: 100, max: 250 },
  ftIn: { min: 36, max: 107 },
};

/** A weight wheel's two columns: 72.6 is `{whole: 72, tenth: 6}`. */
export interface WeightWheel {
  whole: number;
  /** 0–9 */
  tenth: number;
}

/**
 * The wheel position for a stored weight: the weight in `unit` rounded to the nearest tenth
 * (truncating would show 159.9 for a 160.0 lb value that went through kg, R05.10), then kept
 * inside the unit's limits.
 */
export function weightWheel(kg: number, unit: WeightMeasure): WeightWheel {
  const { min, max } = WEIGHT_LIMITS[unit];
  const tenths = clamp(Math.round(weightToDisplay(kg, unit) * 10), min * 10, max * 10);
  return { whole: Math.floor(tenths / 10), tenth: tenths % 10 };
}

/** kg for a wheel position in `unit`, kept inside the unit's limits; never rounded. */
export function weightFromWheel({ whole, tenth }: WeightWheel, unit: WeightMeasure): number {
  const { min, max } = WEIGHT_LIMITS[unit];
  return weightFromDisplay(clamp((whole * 10 + tenth) / 10, min, max), unit);
}

/** The cm wheel row for a stored height: the nearest whole cm inside 100–250. */
export function heightWheelCm(cm: number): number {
  const { min, max } = HEIGHT_LIMITS.cm;
  return clamp(Math.round(cm), min, max);
}

/** The feet and inches wheel rows for a stored height, inside 3′0″–8′11″. */
export function heightWheelFeetInches(cm: number): FeetInches {
  const { min, max } = HEIGHT_LIMITS.ftIn;
  return splitInches(clamp(Math.round(cm / CM_PER_INCH), min, max));
}
