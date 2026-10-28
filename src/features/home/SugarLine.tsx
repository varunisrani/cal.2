import { Fragment } from 'react';
import type { DaySugar } from '../../domain/nutrients/sugar';
import { Icon } from '../../ui/icons';
import { amountText, shownTotal } from './dayNutrients';
import styles from './home.module.css';
import { tx } from './text';

export interface SugarLineProps {
  /** The shown day's sugar, as far as its foods know it (`sugarOfDay`). */
  readonly sugar: DaySugar;
  /** The Sugar limit from Nutrient goals, in g; 0 when it is turned off. */
  readonly limit: number;
  /** A tap: opens All nutrients. */
  readonly onOpen: () => void;
}

/**
 * The Sugar line under the pillars (D-16.98): "Sugar", the day's grams against the Sugar limit
 * with a thin bar (full, and in the warning colour with "8 g over", past it), or the grams alone
 * while the limit is off. Grams are summed only over the foods that carry a figure: when some do
 * not, it says from how many foods; when none does, "No sugar figures" stands in for the grams, so
 * an unknown amount never reads as 0 g. Added sugar follows when any food carries it. Nothing on a
 * day without food. The button is named by its words, spaced, in reading order (no label of its
 * own, so the name is always the visible text); the bar is drawing only.
 */
export function SugarLine({ sugar, limit, onOpen }: SugarLineProps) {
  if (sugar.foods === 0) return null;

  const shown = sugar.grams === null ? null : shownTotal(sugar.grams);
  const bar = shown !== null && limit > 0;
  // Compared as shown, like the pillars, so the words and the bar agree.
  const over = bar && shown > limit ? shown - limit : 0;
  let amount = tx('home.sugar.noFigures');
  if (shown !== null) {
    amount = bar
      ? tx('home.sugar.ofLimit', { amount: amountText(shown), limit: amountText(limit) })
      : tx('home.amount.g', { amount: amountText(shown) });
  }
  // The words after the bar, in reading order, by hook; "over" always first (it takes the colour).
  const notes: [string, string][] = [];
  if (over > 0) notes.push(['over', tx('home.pillar.over', { amount: amountText(over) })]);
  if (sugar.withFigure > 0 && sugar.withFigure < sugar.foods) {
    notes.push([
      'coverage',
      tx('home.sugar.coverage', { count: sugar.withFigure, total: sugar.foods }),
    ]);
  }
  if (sugar.addedGrams !== null) {
    notes.push([
      'added',
      tx('home.sugar.added', { amount: amountText(shownTotal(sugar.addedGrams)) }),
    ]);
  }

  return (
    <button
      type="button"
      className={styles.sugar}
      data-ui="home.sugar"
      data-over={over > 0 || undefined}
      onClick={onOpen}
    >
      <span className={styles.sugarHead}>
        <span>{tx('home.pillar.sugar')}</span>{' '}
        <span data-ui="home.sugar.amount" data-none={shown === null || undefined}>
          {amount}
        </span>
        <Icon name="chevronRight" size={16} />
      </span>{' '}
      {bar ? (
        <span className={styles.sugarBar} aria-hidden="true" data-ui="home.sugar.bar">
          <span data-part="fill" style={{ inlineSize: `${Math.min(shown / limit, 1) * 100}%` }} />
        </span>
      ) : null}
      {notes.length > 0 ? (
        <span className={styles.sugarNotes}>
          {notes.map(([key, text]) => (
            <Fragment key={key}>
              {' '}
              <span data-ui={`home.sugar.${key}`}>{text}</span>
            </Fragment>
          ))}
        </span>
      ) : null}
    </button>
  );
}
