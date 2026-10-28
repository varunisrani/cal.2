// Walk figures as the walk screens write them (P15-03): the time as a clock, the pace per km or
// per mile, the distance in the person's length unit (km beside centimetres, miles beside feet and
// inches, as Home's activity card), speeds for the brisk rule, and energy in the person's unit.

import type { HeightDisplayUnit } from '../../domain/units/body';
import type { EnergyDisplayUnit } from '../../domain/units/energy';
import { formatNumber } from '../../domain/units/numbers';
import { currentLocale } from '../../i18n/locale';
import { t } from '../../i18n/t';
import { distanceIn, distanceText, distanceUnitOf, type DistanceUnit } from '../home/distance';
import { energyText } from '../home/energy';

export { distanceUnitOf, type DistanceUnit };

const METRES_PER_MILE = 1_609.344;

function two(value: number): string {
  return String(value).padStart(2, '0');
}

/** Seconds as a clock: "4:05", "12:34", "1:02:03". */
export function clockText(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const rest = total % 60;
  return hours > 0 ? `${hours}:${two(minutes)}:${two(rest)}` : `${minutes}:${two(rest)}`;
}

/** Seconds per km as "11:07 /km", or per mile as "17:53 /mi"; a dash when there is none. */
export function paceText(secPerKm: number | null, unit: DistanceUnit): string {
  if (secPerKm === null || !Number.isFinite(secPerKm) || secPerKm <= 0) {
    return t('walk.figure.none');
  }
  // Slower than an hour a km is standing, not walking.
  if (secPerKm >= 3600) return t('walk.figure.none');
  const perUnit = unit === 'mi' ? (secPerKm * METRES_PER_MILE) / 1000 : secPerKm;
  const time = clockText(Math.round(perUnit));
  return unit === 'mi' ? t('walk.figure.paceMi', { time }) : t('walk.figure.paceKm', { time });
}

/** Metres in the person's unit with the unit: "2.6 km", "1.6 mi". */
export function walkDistance(metres: number, unit: DistanceUnit): string {
  return distanceText(distanceIn(metres, unit), unit);
}

/** A speed in km/h as the person reads it: "4.8 km/h", "3.0 mph". */
export function speedText(kmh: number, unit: DistanceUnit): string {
  const amount = formatNumber(
    unit === 'mi' ? (kmh * 1000) / METRES_PER_MILE : kmh,
    currentLocale(),
    1,
    1,
  );
  return unit === 'mi'
    ? t('walk.figure.speedMi', { amount })
    : t('walk.figure.speedKm', { amount });
}

/** Steps a minute: "112 steps/min"; a dash when there is none. */
export function cadenceText(cadence: number | null): string {
  return cadence === null
    ? t('walk.figure.none')
    : t('walk.figure.cadence', { count: Math.round(cadence) });
}

/** Energy in the person's unit: "90 kcal", "377 kJ". */
export function walkEnergy(kcal: number, unit: EnergyDisplayUnit): string {
  return energyText(kcal, unit);
}

/** The distance unit for a person's length unit. */
export function walkDistanceUnit(lengthUnit: HeightDisplayUnit): DistanceUnit {
  return distanceUnitOf(lengthUnit);
}
