import type { DayKey } from '../../domain/dates/dayKey';
import type { DiaryEntry, Targets } from '../../domain/model';
import { unitOf } from '../../domain/nutrients/catalogue';
import type { GoalValues } from '../../domain/nutrients/goalDefaults';
import { sourceGoal, sourcesOfDay, type SourceNutrient } from '../../domain/nutrients/sources';
import type { EnergyDisplayUnit } from '../../domain/units/energy';
import { formatDay, formatPercent, formatTime } from '../../i18n/format';
import { Icon } from '../../ui/icons';
import { Sheet } from '../../ui/Sheet';
import { MEAL_NAME_KEYS } from '../log/meals';
import { amountWithUnit, nutrientName, shownTotal, statusLine } from './dayNutrients';
import { energyText } from './energy';
import { SOURCE_ICONS } from './entryIcons';
import styles from './sources.module.css';
import { tx } from './text';

export interface SourcesSheetProps {
  /** Done, Escape, the scrim or a pull down. */
  readonly onClose: () => void;
  /** The nutrient whose sources are shown: energy or any id of the catalogue. */
  readonly nutrient: SourceNutrient;
  /** The day shown on Home. */
  readonly day: DayKey;
  readonly isToday: boolean;
  /** That day's food entries. */
  readonly entries: readonly DiaryEntry[];
  /** The targets in effect, or null without a readable profile (then no energy or macro goal). */
  readonly targets: Targets | null;
  /** The optional nutrient goals (setting `goals.nutrients`). */
  readonly goals: Readonly<GoalValues>;
  readonly energyUnit: EnergyDisplayUnit;
  /** A food's row: opens its entry in the editor. */
  readonly onOpenEntry: (entry: DiaryEntry) => void;
}

/**
 * A name inside a sentence: "Vitamin C" → "vitamin C", "Calories" → "calories"; a name whose
 * second letter is not lower case keeps its capital ("HMB", "L-arginine"). English only (N-3).
 */
export function inSentence(name: string): string {
  const second = name.slice(1, 2);
  const lowerLetter = second !== second.toUpperCase() && second === second.toLowerCase();
  return lowerLetter ? name.slice(0, 1).toLowerCase() + name.slice(1) : name;
}

/**
 * Which foods gave the shown day one nutrient (D-16.105): its name and the day, the total against
 * the goal ("of 112 g goal") or the limit ("of 50 g limit", and "8 g over" in the warning colour
 * past it) when one is set, then the foods that gave some, largest first, each a button with its
 * emoji, name, amount, meal and time and share of the total (the bar is drawing only). A food
 * without a figure for the nutrient is never counted as 0: the foods without one are counted
 * under the list. A row opens that food's entry, whose editor lists all its nutrients.
 */
export function SourcesSheet({
  onClose,
  nutrient,
  day,
  isToday,
  entries,
  targets,
  goals,
  energyUnit,
  onOpenEntry,
}: SourcesSheetProps) {
  const name =
    nutrient === 'kcal' ? tx(`home.nutrients.energy.${energyUnit}`) : nutrientName(nutrient);
  const sources = sourcesOfDay(entries, nutrient);
  const goal = sourceGoal(nutrient, targets, goals);
  const amountOf = (amount: number): string =>
    nutrient === 'kcal'
      ? energyText(amount, energyUnit)
      : amountWithUnit(shownTotal(amount), unitOf(nutrient));

  let total: string | null = null;
  let over: string | null = null;
  if (sources.total !== null) {
    const amount = amountOf(sources.total);
    total = amount;
    if (goal?.kind === 'limit') {
      total = tx('sources.ofLimit', { amount, limit: amountOf(goal.amount) });
      // Compared as shown, like the pillars, so the words agree with the numbers.
      const shown = shownTotal(sources.total);
      if (nutrient !== 'kcal' && shown > goal.amount) {
        over = statusLine(shown, goal.amount, unitOf(nutrient));
      }
    } else if (goal) {
      total = tx('sources.ofGoal', { amount, goal: amountOf(goal.amount) });
    }
  }

  return (
    <Sheet open title={tx('sources.title', { name })} onClose={onClose} data-ui="sources">
      <div className={styles.body} data-ui="sources.body" data-nutrient={nutrient}>
        <p className={styles.day} data-ui="sources.day">
          {isToday ? tx('home.nutrients.today') : formatDay(day, 'long')}
        </p>
        {total === null ? null : (
          <p className={styles.total} data-ui="sources.total" data-over={over ? true : undefined}>
            <span>{total}</span>
            {over ? (
              <>
                {' '}
                <span data-ui="sources.over">{over}</span>
              </>
            ) : null}
          </p>
        )}
        {sources.sources.length > 0 ? (
          <ul className={styles.list} data-ui="sources.list">
            {sources.sources.map(({ entry, amount, share }) => (
              <li key={entry.id}>
                <button
                  type="button"
                  className={styles.row}
                  onClick={() => onOpenEntry(entry)}
                  data-ui="sources.row"
                  data-entry={entry.id}
                >
                  <span className={styles.tile} aria-hidden="true">
                    {entry.emoji ? (
                      <span className={styles.emoji}>{entry.emoji}</span>
                    ) : (
                      <Icon name={SOURCE_ICONS[entry.source]} size={20} />
                    )}
                  </span>
                  <span className={styles.name}>{entry.name}</span>{' '}
                  <span className={styles.amount}>{amountOf(amount)}</span>{' '}
                  <span className={styles.when}>
                    {tx('sources.when', {
                      meal: tx(MEAL_NAME_KEYS[entry.meal]),
                      time: formatTime(entry.loggedAt),
                    })}
                  </span>{' '}
                  <span className={styles.share}>{formatPercent(share)}</span>
                  <span className={styles.bar} aria-hidden="true" data-ui="sources.row.bar">
                    <span style={{ inlineSize: `${share * 100}%` }} />
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className={styles.note} data-ui="sources.empty">
            {tx('sources.empty', { name: inSentence(name) })}
          </p>
        )}
        {sources.withoutFigure > 0 ? (
          <p className={styles.note} data-ui="sources.noFigure">
            {tx('sources.noFigure', { count: sources.withoutFigure, name: inSentence(name) })}
          </p>
        ) : null}
      </div>
    </Sheet>
  );
}
