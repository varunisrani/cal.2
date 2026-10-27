// What the water screens share: an amount written with its unit word, the quick-add summary and
// the water service from the nearest provider.

import { formatNumber } from '../../domain/units/numbers';
import { formatWater, maxAmountShown, type WaterDisplayUnit } from '../../domain/units/water';
import { formatNameList } from '../../i18n/format';
import { currentLocale } from '../../i18n/locale';
import { t } from '../../i18n/t';
import { useServices } from '../../services/context';
import type { WaterService } from '../../services/water';

/** "1,000 ml" / "8.5 fl oz": an ml amount in the person's unit, with the unit word. */
export function waterAmount(ml: number, unit: WaterDisplayUnit): string {
  return t(`home.amount.${unit}`, { amount: formatWater(ml, unit, currentLocale()) });
}

/** "5,000 ml" / "169 fl oz": the most an amount field takes, in the person's unit. */
export function maxAmountText(unit: WaterDisplayUnit): string {
  return t(`home.amount.${unit}`, {
    amount: formatNumber(maxAmountShown(unit), currentLocale(), 1),
  });
}

/** "250, 500, 750 ml": the quick-add amounts as one list in the person's unit. */
export function quickAddSummary(amounts: readonly number[], unit: WaterDisplayUnit): string {
  const locale = currentLocale();
  const shown = amounts.map((ml) => formatWater(ml, unit, locale));
  return t(`trackers.water.settings.summary.${unit}`, {
    amounts: formatNameList(shown, locale),
  });
}

/** The water service; a screen that logs or changes water cannot work without it. */
export function useWaterService(): WaterService {
  const { water } = useServices();
  if (!water) throw new Error('No water service above this water screen');
  return water;
}
