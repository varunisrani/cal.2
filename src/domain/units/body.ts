// Body weight and height. Storage is kilograms and centimetres; kg/lb and cm/feet-and-inches are
// two separate reading choices. One pound factor is used in both directions, so a value converted
// there and back is unchanged, and wheels round to the nearest tenth rather than truncating, so a
// round trip never shows one tenth less (R05.10).

import { clamp, formatNumber, plainText } from './numbers';

export const WEIGHT_DISPLAY_UNITS = ['kg', 'lb'] as const;
/** How a person reads weight (setting `units.weight`). Storage is always kg. */
export type WeightDisplayUnit = (typeof WEIGHT_DISPLAY_UNITS)[number];

export function isWeightDisplayUnit(value: unknown): value is WeightDisplayUnit {
  return value === 'kg' || value === 'lb';
}

export const HEIGHT_DISPLAY_UNITS = ['cm', 'ftIn'] as const;
/** How a person reads height (setting `units.height`). Storage is always cm. */
export type HeightDisplayUnit = (typeof HEIGHT_DISPLAY_UNITS)[number];

export function isHeightDisplayUnit(value: unknown): value is HeightDisplayUnit {
  return value === 'cm' || value === 'ftIn';
}

export const LB_PER_KG = 2.20462;
export const CM_PER_INCH = 2.54;
const INCHES_PER_FOOT = 12;

// ---- Weight -------------------------------------------------------------------------------

/** A kg amount in the display unit, unrounded. */
export function weightToDisplay(kg: number, unit: WeightDisplayUnit): number {
  return unit === 'lb' ? kg * LB_PER_KG : kg;
}

/** An amount in the display unit as kg, unrounded (store it at full precision). */
export function weightFromDisplay(value: number, unit: WeightDisplayUnit): number {
  return unit === 'lb' ? value / LB_PER_KG : value;
}

/** The weight a screen shows: the display value rounded to the nearest tenth. */
export function weightShown(kg: number, unit: WeightDisplayUnit): number {
  return Math.round(weightToDisplay(kg, unit) * 10) / 10;
}

/** Weight as text with exactly one decimal and no unit word: 70 kg → "70.0", in lb "154.3". */
export function formatWeight(kg: number, unit: WeightDisplayUnit, locale: string): string {
  return formatNumber(weightShown(kg, unit), locale, 1, 1);
}

/**
 * A weekly pace as a short number with a dot whatever the locale: two decimals at most, trailing
 * zeros dropped (0.25 kg → "0.25", in lb "0.55"; 0.5 → "0.5" / "1.1"; 1 → "1" / "2.2").
 */
export function formatPace(kgPerWeek: number, unit: WeightDisplayUnit): string {
  return plainText(weightToDisplay(kgPerWeek, unit), 2);
}

/** Every weight wheel's range in its unit (D-16.37, Proposed D-16.56). */
export const WEIGHT_WHEEL: Readonly<Record<WeightDisplayUnit, { min: number; max: number }>> = {
  kg: { min: 20, max: 250 },
  lb: { min: 50, max: 500 },
};

/** A weight wheel's two columns: whole units and tenths (0–9). */
export interface WeightWheel {
  whole: number;
  tenth: number;
}

/**
 * The wheel position for a stored weight: the display value rounded to the nearest tenth first,
 * then held to the unit's range, then split. So 159.96 lb opens on 160.0, and 19.9 kg on 20.0.
 */
export function weightWheel(kg: number, unit: WeightDisplayUnit): WeightWheel {
  const { min, max } = WEIGHT_WHEEL[unit];
  const tenths = clamp(Math.round(weightToDisplay(kg, unit) * 10), min * 10, max * 10);
  return { whole: Math.floor(tenths / 10), tenth: tenths % 10 };
}

/** The kg to store for a wheel position, held to the unit's range (250.9 kg stores 250). */
export function weightFromWheel(wheel: WeightWheel, unit: WeightDisplayUnit): number {
  const { min, max } = WEIGHT_WHEEL[unit];
  const value = clamp(wheel.whole + wheel.tenth / 10, min, max);
  return weightFromDisplay(value, unit);
}

// ---- Height -------------------------------------------------------------------------------

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

/** Height shown in cm: whole centimetres, truncated (170.9 → 170). */
export function heightCmShown(cm: number): number {
  return Math.trunc(cm);
}

/**
 * Height shown in feet and inches, from the nearest whole inch: 170 cm is 66.9 in, so 5′7″
 * (truncating would say 5′6″); 180 cm is 5′11″.
 */
export function feetInches(cm: number): FeetInches {
  return splitInches(Math.round(cm / CM_PER_INCH));
}

/** Height wheel ranges: 100–250 cm, or 3′0″–8′11″ counted in inches. */
export const HEIGHT_WHEEL = {
  cm: { min: 100, max: 250 },
  inches: { min: 36, max: 107 },
} as const;

/** Where the cm wheel opens: the nearest whole cm, held to 100–250. */
export function cmWheel(cm: number): number {
  return clamp(Math.round(cm), HEIGHT_WHEEL.cm.min, HEIGHT_WHEEL.cm.max);
}

/** Where the feet and inches wheels open: the nearest inch, held to 3′0″–8′11″. */
export function ftInWheel(cm: number): FeetInches {
  const { min, max } = HEIGHT_WHEEL.inches;
  return splitInches(clamp(Math.round(cm / CM_PER_INCH), min, max));
}

/** The cm to store for a feet and inches pick, not rounded (5′7″ → 170.18). */
export function cmFromFeetInches(feet: number, inches: number): number {
  return (feet * INCHES_PER_FOOT + inches) * CM_PER_INCH;
}
