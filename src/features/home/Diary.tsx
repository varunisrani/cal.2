import { useId } from 'react';
import {
  DEFAULT_DIARY_SORT,
  groupDiary,
  type DiaryRow,
  type DiarySortMode,
} from '../../domain/meals/diary';
import type { DiaryEntry, Fast, MealTimes, WaterLog } from '../../domain/model';
import type { EnergyDisplayUnit } from '../../domain/units/energy';
import type { WaterDisplayUnit } from '../../domain/units/water';
import { Card } from '../../ui/Card';
import { MEAL_NAME_KEYS } from '../log/meals';
import rowStyles from './diaryRows.module.css';
import { energyText } from './energy';
import { EntryRow } from './EntryRow';
import { FastRow } from './FastRow';
import styles from './home.module.css';
import { SortMenu } from './SortMenu';
import { tx } from './text';
import { WaterRow } from './WaterRow';

const NO_WATER: readonly WaterLog[] = [];
const NO_FASTS: readonly Fast[] = [];
const openNothing = (): void => undefined;

export interface DiaryProps {
  /** The day's entries, in any order. */
  readonly entries: readonly DiaryEntry[];
  readonly energyUnit: EnergyDisplayUnit;
  /** The person's meal times (they place water and fasts; food keeps its own meal). */
  readonly times: MealTimes;
  /** The day shown is today, which the heading says. */
  readonly isToday: boolean;
  /** The day's water logs, shown whether or not water is tracked (R05.9). */
  readonly water?: readonly WaterLog[];
  /** The unit water amounts are written in (ml by default). */
  readonly waterUnit?: WaterDisplayUnit;
  /** The day's fasts (`fastsOnDay`), shown whether or not fasting is tracked (R05.9). */
  readonly fasts?: readonly Fast[];
  /** How sections form (setting `home.sort`); by meal by default. */
  readonly sort?: DiarySortMode;
  /** Stores another sort mode; without it the first header has no Sort control. */
  readonly onSortChange?: (mode: DiarySortMode) => void;
  /** A tap on a fast: its editor. */
  readonly onOpenFast?: (fast: Fast) => void;
}

/** A row's key: ids are unique within a kind only. */
function rowKey(row: DiaryRow): string {
  switch (row.kind) {
    case 'food':
      return row.entry.id;
    case 'water':
      return `water-${row.log.id}`;
    case 'fast':
      return `fast-${row.fast.id}`;
  }
}

/**
 * The day's diary (05 §3.3): food entries, water logs and fasts in meal sections, formed by meal
 * (one section per meal in the fixed order) or newest first (a new section whenever the meal
 * changes, so a meal can come back), rows newest first either way. Water sits in the meal of its
 * time, a fast in the meal of its end (its start while it runs). Each section is headed by its
 * food totals (water and fasts never add to them, R05.4); the first header also holds the Sort
 * control. A day with nothing in it shows one card saying so.
 */
export function Diary({
  entries,
  energyUnit,
  times,
  isToday,
  water = NO_WATER,
  waterUnit = 'ml',
  fasts = NO_FASTS,
  sort = DEFAULT_DIARY_SORT,
  onSortChange,
  onOpenFast = openNothing,
}: DiaryProps) {
  const baseId = useId();
  const headingId = `${baseId}-heading`;
  const rows: DiaryRow[] = [
    ...entries.map((entry): DiaryRow => ({ kind: 'food', entry })),
    ...water.map((log): DiaryRow => ({ kind: 'water', log })),
    ...fasts.map((fast): DiaryRow => ({ kind: 'fast', fast })),
  ];
  const sections = groupDiary(rows, sort, times);

  return (
    <section className={styles.diary} aria-labelledby={headingId} data-ui="home.diary">
      <h2 id={headingId} className={styles.diaryHeading}>
        {tx(isToday ? 'home.diary.today' : 'home.diary.day')}
      </h2>
      {sections.length === 0 ? (
        <Card data-ui="home.diary.empty">
          <p className={styles.empty}>{tx('home.diary.empty')}</p>
        </Card>
      ) : (
        sections.map(({ meal, rows: mealRows, totals }, index) => {
          // Newest first can show a meal twice, so a section is known by its place.
          const titleId = `${baseId}-${index}`;
          return (
            <section
              key={`${index}-${meal}`}
              className={styles.meal}
              aria-labelledby={titleId}
              data-ui={`home.meal.${meal}`}
            >
              <header className={styles.mealHeader}>
                <div className={rowStyles.titleLine}>
                  <h3 id={titleId} className={styles.mealName}>
                    {tx(MEAL_NAME_KEYS[meal])}
                  </h3>
                  {index === 0 && onSortChange ? (
                    <SortMenu mode={sort} onChange={onSortChange} />
                  ) : null}
                </div>
                {totals ? (
                  <p className={styles.mealTotals} data-ui={`home.meal.${meal}.totals`}>
                    <span className={styles.mealEnergy}>{energyText(totals.kcal, energyUnit)}</span>
                    <span className={styles.mealMacros}>
                      {tx('home.diary.totals', {
                        protein: totals.protein,
                        carbs: totals.carbs,
                        fat: totals.fat,
                      })}
                    </span>
                  </p>
                ) : null}
              </header>
              <ul className={styles.rows}>
                {mealRows.map((row) => (
                  <li key={rowKey(row)} className={styles.rowItem}>
                    {row.kind === 'food' ? (
                      <EntryRow entry={row.entry} energyUnit={energyUnit} />
                    ) : row.kind === 'water' ? (
                      <WaterRow log={row.log} unit={waterUnit} />
                    ) : (
                      <FastRow fast={row.fast} onOpen={onOpenFast} />
                    )}
                  </li>
                ))}
              </ul>
            </section>
          );
        })
      )}
    </section>
  );
}
