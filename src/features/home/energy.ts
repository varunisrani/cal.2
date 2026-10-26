// Energy as Home writes it: a kcal amount in the person's unit, grouped the browser's way.

import type { EnergyDisplayUnit } from '../../domain/units/energy';
import { formatEnergy } from '../../domain/units/energy';
import { currentLocale } from '../../i18n/locale';
import { tx } from './text';

/** The amount alone, in the display unit: "1,046" for 250 kcal read in kJ (en-US). */
export function energyAmount(kcal: number, unit: EnergyDisplayUnit): string {
  return formatEnergy(kcal, unit, currentLocale());
}

/** The amount with its unit: "250 kcal", "1,046 kJ". */
export function energyText(kcal: number, unit: EnergyDisplayUnit): string {
  const amount = energyAmount(kcal, unit);
  return unit === 'kJ' ? tx('home.energy.kJ', { amount }) : tx('home.energy.kcal', { amount });
}
