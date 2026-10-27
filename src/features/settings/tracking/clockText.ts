// A time of day stored as minutes after midnight (the meal starts), written the locale's way.

import { dateFormat } from '../../../i18n/format';
import { currentLocale } from '../../../i18n/locale';

// Read in UTC from the epoch, so no time zone or DST change can move the minute.
const CLOCK: Intl.DateTimeFormatOptions = { timeStyle: 'short', timeZone: 'UTC' };

/** "7:07 AM" (en-US), "07:07" (en-GB) for minute 427 of the day. */
export function clockText(minute: number, locale: string = currentLocale()): string {
  return dateFormat(locale, CLOCK).format(new Date(minute * 60_000));
}
