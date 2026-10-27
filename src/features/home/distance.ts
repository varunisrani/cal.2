// Distances as the activity cards write them (P11-04): Health Connect gives metres, and the person
// reads km beside centimetres and miles beside feet and inches (`units.height`, the app's only
// length setting), to one decimal in the locale's marks. Home's card and Progress's card share it.

import type { HeightDisplayUnit } from '../../domain/units/body';
import { formatNumber } from '../../domain/units/numbers';
import { currentLocale } from '../../i18n/locale';
import { t } from '../../i18n/t';

export type DistanceUnit = 'km' | 'mi';

const METRES_PER: Readonly<Record<DistanceUnit, number>> = { km: 1_000, mi: 1_609.344 };

/** Distances follow the person's length unit (`units.height`): km beside cm, miles beside ft/in. */
export function distanceUnitOf(lengthUnit: HeightDisplayUnit): DistanceUnit {
  return lengthUnit === 'ftIn' ? 'mi' : 'km';
}

/** Metres in `unit`, unrounded. */
export function distanceIn(metres: number, unit: DistanceUnit): number {
  return metres / METRES_PER[unit];
}

/** An amount already in its unit, to one decimal in the locale's marks: "7.1", "4.4". */
export function distanceAmount(amount: number): string {
  return formatNumber(amount, currentLocale(), 1, 1);
}

/** An amount already in `unit`, with the unit: "7.1 km", "4.4 mi". */
export function distanceText(amount: number, unit: DistanceUnit): string {
  return t(`health.home.distance.${unit}`, { amount: distanceAmount(amount) });
}
