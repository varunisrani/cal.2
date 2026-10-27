import type { WheelRange } from '../../../domain/units/numbers';
import { formatInt } from '../../../i18n/format';
import type { WheelOption } from '../../../ui/Wheel';

/** The rows of a wheel from its `min` to its `max` in `step`s, grouped the locale's way. */
export function wheelOptions(
  { min, max, step }: WheelRange,
  locale: string,
): WheelOption<number>[] {
  const options: WheelOption<number>[] = [];
  for (let value = min; value <= max; value += step) {
    options.push({ value, label: formatInt(value, locale) });
  }
  return options;
}
