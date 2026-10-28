// When a proposed reminder comes, in the words Settings › Tracking & reminders uses for the
// person's own reminders: "Every day at 9:00 AM", "Mon, Wed, Fri at 7:30 AM", "Once, Oct 28,
// 2026 at 6:00 PM". The time and the date follow the person's locale.

import type { CoachReminderCard } from '../../domain/model';
import { WEEKDAYS, type Weekday } from '../../domain/reminders/custom';
import { dateFormat, formatDay, formatNameList } from '../../i18n/format';
import { currentLocale } from '../../i18n/locale';
import { t } from '../../i18n/t';
import { clockText } from '../settings/tracking/clockText';

/** A short weekday name in the locale: 2024-01-01 was a Monday. */
function shortWeekday(day: Weekday, locale: string): string {
  return dateFormat(locale, { weekday: 'short', timeZone: 'UTC' }).format(
    new Date(Date.UTC(2024, 0, 1 + WEEKDAYS.indexOf(day))),
  );
}

/** Minutes after midnight of an `HH:MM` time. */
function minutesOf(time: string): number {
  return Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
}

/** The line under a card's words saying when the reminder comes. */
export function reminderTiming(
  card: Pick<CoachReminderCard, 'time' | 'date'> & { readonly days?: readonly Weekday[] },
  locale: string = currentLocale(),
): string {
  const time = clockText(minutesOf(card.time), locale);
  if (card.date !== undefined) {
    return t('reminders.yours.once', { date: formatDay(card.date, 'medium', locale), time });
  }
  const days = card.days ?? [];
  if (days.length === WEEKDAYS.length) return t('reminders.yours.everyDay', { time });
  const names = formatNameList(
    days.map((day) => shortWeekday(day, locale)),
    locale,
  );
  return t('reminders.yours.onDays', { days: names, time });
}
