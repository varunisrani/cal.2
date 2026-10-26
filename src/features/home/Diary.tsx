import { useId } from 'react';
import { groupDiary, type DiaryRow } from '../../domain/meals/diary';
import type { DiaryEntry, MealTimes } from '../../domain/model';
import type { EnergyDisplayUnit } from '../../domain/units/energy';
import { Card } from '../../ui/Card';
import { MEAL_NAME_KEYS } from '../log/meals';
import { energyText } from './energy';
import { EntryRow } from './EntryRow';
import styles from './home.module.css';
import { tx } from './text';

export interface DiaryProps {
  /** The day's entries, in any order. */
  readonly entries: readonly DiaryEntry[];
  readonly energyUnit: EnergyDisplayUnit;
  /** The person's meal times (they place water and fasts; food keeps its own meal). */
  readonly times: MealTimes;
  /** The day shown is today, which the heading says. */
  readonly isToday: boolean;
}

/**
 * The day's diary: one section per meal in the fixed meal order, rows newest first, each section
 * headed by its food totals (water and fasts never add to them, R05.4). A day with nothing in it
 * shows one card saying so.
 */
export function Diary({ entries, energyUnit, times, isToday }: DiaryProps) {
  const baseId = useId();
  const headingId = `${baseId}-heading`;
  const rows = entries.map((entry): DiaryRow => ({ kind: 'food', entry }));
  const sections = groupDiary(rows, 'byMeal', times);

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
        sections.map(({ meal, rows: mealRows, totals }) => {
          const titleId = `${baseId}-${meal}`;
          return (
            <section
              key={meal}
              className={styles.meal}
              aria-labelledby={titleId}
              data-ui={`home.meal.${meal}`}
            >
              <header className={styles.mealHeader}>
                <h3 id={titleId} className={styles.mealName}>
                  {tx(MEAL_NAME_KEYS[meal])}
                </h3>
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
                {mealRows.map((row) =>
                  row.kind === 'food' ? (
                    <li key={row.entry.id} className={styles.rowItem}>
                      <EntryRow entry={row.entry} energyUnit={energyUnit} />
                    </li>
                  ) : null,
                )}
              </ul>
            </section>
          );
        })
      )}
    </section>
  );
}
