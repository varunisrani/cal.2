// The charts' words and the dates on their axes.

import { splitDayKey, type DayKey } from '../../domain/dates/dayKey';
import type { AxisDateStyle } from '../../domain/progress/chartMath';
import { dateFormat, formatDay } from '../../i18n/format';
import { currentLocale } from '../../i18n/locale';

/** The charts' words come from the app catalogue. */
export { t as chartT } from '../../i18n/t';

const MONTH_YEAR: Intl.DateTimeFormatOptions = { month: 'short', year: 'numeric', timeZone: 'UTC' };

/** A date under a time axis: "Apr 8" for the day style, "Apr 2026" for month and year. */
export function formatAxisDate(day: DayKey, style: AxisDateStyle): string {
  if (style === 'day') return formatDay(day, 'short');
  const { year, month } = splitDayKey(day);
  const instant = new Date(0);
  instant.setUTCFullYear(year, month - 1, 1);
  return dateFormat(currentLocale(), MONTH_YEAR).format(instant);
}
