import { memo, useLayoutEffect, useMemo, useRef, type KeyboardEvent } from 'react';
import { addDays, splitDayKey, type DayKey } from '../../domain/dates/dayKey';
import {
  WEEK_PAGE_COUNT,
  weekPageIndex,
  weekPages,
  weekStart as firstDayOfWeek,
  type WeekStart,
} from '../../domain/dates/week';
import { dateFormat, formatDay, formatInt } from '../../i18n/format';
import { currentLocale } from '../../i18n/locale';
import { tx } from './text';
import styles from './week.module.css';

/** The first day of the bar's oldest page: Home never shows a day before it. */
export function oldestDay(today: DayKey, start: WeekStart): DayKey {
  return addDays(firstDayOfWeek(today, start), -7 * (WEEK_PAGE_COUNT - 1));
}

const NARROW_WEEKDAY: Intl.DateTimeFormatOptions = { weekday: 'narrow', timeZone: 'UTC' };

/** The locale's one-letter weekday of a day key ("M" for a Monday in English). */
function weekdayLetter(day: DayKey, locale: string): string {
  const { year, month, day: date } = splitDayKey(day);
  return dateFormat(locale, NARROW_WEEKDAY).format(Date.UTC(year, month - 1, date));
}

/** Days moved by an arrow key: down and the reading direction's "forward" go to the next day. */
function arrowStep(key: string, rtl: boolean): -1 | 0 | 1 {
  switch (key) {
    case 'ArrowDown':
      return 1;
    case 'ArrowUp':
      return -1;
    case 'ArrowRight':
      return rtl ? -1 : 1;
    case 'ArrowLeft':
      return rtl ? 1 : -1;
    default:
      return 0;
  }
}

const isRtl = (element: Element): boolean => getComputedStyle(element).direction === 'rtl';

/**
 * Scrolls the strip to page `index` (0 = the oldest week). Nothing happens before the strip has
 * a width, or when it is already there.
 */
function showPage(strip: HTMLElement, index: number, behavior: ScrollBehavior): void {
  const width = strip.clientWidth;
  if (!(width > 0)) return;
  // Right-to-left strips start at the right and scroll to negative offsets.
  const left = (isRtl(strip) ? -index : index) * width;
  if (Math.abs(strip.scrollLeft - left) < 1) return;
  if (typeof strip.scrollTo === 'function') strip.scrollTo({ left, behavior });
  else strip.scrollLeft = left;
}

export interface WeekBarProps {
  /** Today, from the today clock: the last day that can be chosen. */
  readonly today: DayKey;
  /** The day Home shows. */
  readonly selected: DayKey;
  /** The first day of the week (setting `display.weekStart`). */
  readonly weekStart: WeekStart;
  readonly onSelect: (day: DayKey) => void;
}

/**
 * The week bar at the top of Home (05 §3.2.1, D-16.36): a sideways strip of 53 week pages, the
 * current week last, each with seven tiles (a one-letter weekday over the day of the month). The
 * day shown is filled with the accent; today, when another day is shown, is ringed; days after
 * today are drawn but cannot be chosen. The strip follows the shown day into its week (smoothly,
 * unless reduced motion is asked for) and goes back to the current week when the first weekday
 * changes. One radio group for the keyboard: the arrow keys move a day at a time across weeks.
 */
export const WeekBar = memo(function WeekBar({
  today,
  selected,
  weekStart,
  onSelect,
}: WeekBarProps) {
  const strip = useRef<HTMLDivElement>(null);
  // The week start the strip was last placed for; null before the first placement.
  const placedFor = useRef<WeekStart | null>(null);
  // A day chosen with the keys: its tile takes the focus once it is drawn as selected.
  const focusNext = useRef<DayKey | null>(null);
  const pages = useMemo(() => weekPages(today, weekStart), [today, weekStart]);
  const oldest = oldestDay(today, weekStart);
  const selectedPage = weekPageIndex(selected, today, weekStart);
  // The tile Tab reaches: the selected one, or today's when the selection is off the bar.
  const tabStop = selected >= oldest && selected <= today ? selected : today;
  const locale = currentLocale();

  useLayoutEffect(() => {
    const element = strip.current;
    if (!element) return;
    const first = placedFor.current === null;
    const startChanged = !first && placedFor.current !== weekStart;
    placedFor.current = weekStart;
    // A new first weekday shows the current week again; the selection stays as it is.
    const page = startChanged ? WEEK_PAGE_COUNT - 1 : selectedPage;
    showPage(element, page, first ? 'instant' : 'auto');
  }, [selected, selectedPage, weekStart]);

  useLayoutEffect(() => {
    if (focusNext.current !== selected) return;
    focusNext.current = null;
    strip.current
      ?.querySelector<HTMLElement>(`[data-day="${selected}"]`)
      ?.focus({ preventScroll: true });
  }, [selected]);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    const step = arrowStep(event.key, isRtl(event.currentTarget));
    if (step === 0) return;
    event.preventDefault();
    const tile = (event.target as HTMLElement).closest<HTMLElement>('[data-day]');
    const next = addDays(tile?.dataset.day ?? selected, step);
    if (next > today || next < oldest) return;
    focusNext.current = next;
    onSelect(next);
  };

  return (
    <div
      ref={strip}
      className={styles.strip}
      role="radiogroup"
      aria-label={tx('home.week.label')}
      onKeyDown={onKeyDown}
      data-ui="home.week"
    >
      {pages.map((page) => (
        <div key={page.start} className={styles.page} data-ui="home.week.page">
          {page.days.map((day) => (
            <button
              key={day}
              type="button"
              role="radio"
              className={styles.tile}
              aria-checked={day === selected}
              aria-current={day === today ? 'date' : undefined}
              aria-label={formatDay(day, 'long', locale)}
              disabled={day > today}
              tabIndex={day === tabStop ? 0 : -1}
              onClick={() => onSelect(day)}
              data-day={day}
              data-ui="home.week.day"
            >
              <span className={styles.weekday} aria-hidden="true">
                {weekdayLetter(day, locale)}
              </span>
              <span className={styles.date} aria-hidden="true">
                {formatInt(splitDayKey(day).day, locale)}
              </span>
            </button>
          ))}
        </div>
      ))}
    </div>
  );
});
