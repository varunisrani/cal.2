import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { useToday } from '../../app/TodayProvider';
import { useDayEntries, useSettings, useTargets } from '../../data/hooks';
import { dayKeyOf } from '../../domain/dates/dayKey';
import type { DiaryEntry, Targets } from '../../domain/model';
import { toDisplay, type EnergyDisplayUnit } from '../../domain/units/energy';
import { formatNumber } from '../../domain/units/numbers';
import { currentLocale } from '../../i18n/locale';
import { t } from '../../i18n/t';
import { useServices } from '../../services/context';
import type {
  FitCheckInput,
  FitCheckOutcome,
  FitCheckService,
  MealFigures,
} from '../../services/fitCheck';
import { Button } from '../../ui/Button';
import { cx } from '../../ui/classes';
import { Sheet } from '../../ui/Sheet';
import styles from './fitCheck.module.css';
import { macroText } from './review/NutritionRows';
import type { FitCheckSlot } from './review/ReviewSheet';

/** How long the inputs must stay unchanged before the suggestion is asked for again. */
export const FIT_CHECK_DEBOUNCE_MS = 600;

const SETTINGS = ['units.energy', 'units.weight', 'units.height'] as const;

/** Energy (kcal) and the three macros (g) of a meal or a day. */
interface Figures {
  readonly kcal: number;
  readonly protein: number;
  readonly carbs: number;
  readonly fat: number;
}

const NOTHING: Figures = { kcal: 0, protein: 0, carbs: 0, fat: 0 };

function figuresOf({ kcal, protein, carbs, fat }: Figures): Figures {
  return { kcal, protein, carbs, fat };
}

function plus(a: Figures, b: Figures): Figures {
  return {
    kcal: a.kcal + b.kcal,
    protein: a.protein + b.protein,
    carbs: a.carbs + b.carbs,
    fat: a.fat + b.fat,
  };
}

/** A macro as a screen shows it, to 0.1 g, so "over" agrees with the figures. */
function tenth(grams: number): number {
  return Math.round(grams * 10) / 10;
}

export type RowKey = 'energy' | 'protein' | 'carbs' | 'fat';

/** One value's row, in words. */
export interface FitRow {
  readonly key: RowKey;
  readonly added: string;
  /** The day after the meal, against the goal when there is one. */
  readonly after: string;
  /** "N left" or "N over"; null without a goal. */
  readonly remaining: string | null;
  /** Above its goal and not protein: drawn as a warning. */
  readonly highlighted: boolean;
}

/** Protein above its target is no warning; energy, carbs and fat above theirs are. */
const WARNS_WHEN_OVER: Readonly<Record<RowKey, boolean>> = {
  energy: true,
  protein: false,
  carbs: true,
  fat: true,
};

function row(
  key: RowKey,
  shown: { readonly added: number; readonly after: number; readonly goal: number | null },
  unit: string,
  write: (n: number) => string,
): FitRow {
  const { added, after, goal } = shown;
  const left = goal === null ? null : goal - after;
  return {
    key,
    added: t('fitCheck.added', { amount: write(added), unit }),
    after:
      goal === null
        ? t('fitCheck.after', { after: write(after), unit })
        : t('fitCheck.afterGoal', { after: write(after), goal: write(goal), unit }),
    remaining:
      left === null
        ? null
        : t(left < 0 ? 'fitCheck.over' : 'fitCheck.left', { amount: write(Math.abs(left)), unit }),
    highlighted: left !== null && left < 0 && WARNS_WHEN_OVER[key],
  };
}

/**
 * The four rows (02 §3.6): what the meal adds, the day after it against the goal and what is
 * left or over. Energy works in the person's unit on the shown whole numbers, macros on the
 * shown tenths, so the words always agree with the figures. Without goals, the day after only.
 */
export function fitRows(
  meal: Figures,
  eaten: Figures,
  goals: Targets | null,
  energyUnit: EnergyDisplayUnit,
  locale: string = currentLocale(),
): FitRow[] {
  const after = plus(eaten, meal);
  const energyWord = t(energyUnit === 'kJ' ? 'review.unit.kJ' : 'review.unit.kcal');
  const gramWord = t('review.unit.g');
  const rows: FitRow[] = [
    row(
      'energy',
      {
        added: toDisplay(meal.kcal, energyUnit),
        after: toDisplay(after.kcal, energyUnit),
        goal: goals === null ? null : toDisplay(goals.kcal, energyUnit),
      },
      energyWord,
      (n) => formatNumber(n, locale),
    ),
  ];
  for (const key of ['protein', 'carbs', 'fat'] as const) {
    rows.push(
      row(
        key,
        { added: tenth(meal[key]), after: tenth(after[key]), goal: goals?.[key] ?? null },
        gramWord,
        (n) => macroText(n, locale),
      ),
    );
  }
  return rows;
}

/** The request for one fit check: the day's entries in the order they were eaten. */
function inputFor(
  base: Omit<FitCheckInput, 'eaten' | 'meal' | 'todaysMeals'>,
  name: string,
  meal: Figures,
  entries: readonly DiaryEntry[],
): FitCheckInput {
  const eaten = [...entries].sort((a, b) => a.loggedAt - b.loggedAt);
  const todaysMeals: MealFigures[] = eaten.map((entry) => ({
    name: entry.name,
    ...figuresOf(entry),
  }));
  return {
    ...base,
    eaten: eaten.reduce<Figures>((sum, entry) => plus(sum, figuresOf(entry)), NOTHING),
    meal: { name, ...meal },
    todaysMeals,
  };
}

/** What the suggestion area shows. A cancelled request shows nothing new. */
type SuggestionView =
  { readonly kind: 'loading' } | Exclude<FitCheckOutcome, { kind: 'cancelled' }>;

const LOADING: SuggestionView = { kind: 'loading' };

/**
 * The suggestion for `input`, asked again whenever `key` changes: at once the first time, for a
 * Retry and for the same inputs again; after `FIT_CHECK_DEBOUNCE_MS` without further changes
 * otherwise. A request still running when the inputs change, or when the sheet goes, is stopped.
 */
function useSuggestion(
  service: FitCheckService | null,
  input: FitCheckInput | null,
  key: string | null,
): { readonly view: SuggestionView; readonly retry: () => void } {
  const [view, setView] = useState<SuggestionView>(LOADING);
  const [attempt, setAttempt] = useState(0);
  const latestInput = useRef(input);
  const startedKey = useRef<string | null>(null);
  useLayoutEffect(() => {
    latestInput.current = input;
  });

  useEffect(() => {
    if (!service || key === null) return undefined;
    const controller = new AbortController();
    const start = (): void => {
      const current = latestInput.current;
      if (!current) return;
      startedKey.current = key;
      void service.suggest(current, controller.signal).then((outcome) => {
        if (controller.signal.aborted || outcome.kind === 'cancelled') return;
        setView(outcome);
      });
    };
    setView(LOADING);
    if (startedKey.current === null || startedKey.current === key) {
      start();
      return () => controller.abort();
    }
    const timer = setTimeout(start, FIT_CHECK_DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [service, key, attempt]);

  return { view, retry: () => setAttempt((count) => count + 1) };
}

/**
 * The fit check (02 §3.6, 03 §3.11): the day of the picked date with this meal added, against
 * the targets in effect, for energy, protein, carbs and fat; over-goal energy, carbs and fat are
 * highlighted, protein never. Below, the AI's suggestion, asked for on open and again (debounced)
 * when the meal's numbers, the day's entry count or the goals change: busy, then the text (which
 * can be selected), the failure with Retry, or a neutral line for an empty answer. Without an AI
 * set up it says where to add a key. Nothing is logged; Done closes.
 */
export function FitCheckSheet({ food, onClose }: FitCheckSlot) {
  const dayId = useId();
  const suggestionId = useId();
  const today = useToday();
  const entries = useDayEntries(dayKeyOf(food.loggedAt));
  const targets = useTargets(today);
  const settings = useSettings(SETTINGS);
  const { fitCheck } = useServices();

  const meal = figuresOf(food.draft);
  const dayEntries = entries.status === 'ready' ? entries.value : null;
  const read = targets.status === 'ready' ? targets.value : null;
  const units = settings.status === 'ready' ? settings.value : null;
  const goals = read?.kind === 'ok' ? read.targets : null;
  const noProfile = targets.status === 'error' || (read !== null && read.kind !== 'ok');

  const eaten = dayEntries?.reduce<Figures>((sum, entry) => plus(sum, figuresOf(entry)), NOTHING);
  const rows =
    eaten && units && targets.status !== 'loading'
      ? fitRows(meal, eaten, goals, units['units.energy'])
      : null;

  const input =
    dayEntries && units && read?.kind === 'ok'
      ? inputFor(
          {
            profile: read.profile,
            today,
            units: {
              energy: units['units.energy'],
              weight: units['units.weight'],
              height: units['units.height'],
            },
            targets: read.targets,
          },
          food.draft.name,
          meal,
          dayEntries,
        )
      : null;
  const key =
    input === null
      ? null
      : JSON.stringify([
          meal.kcal,
          tenth(meal.protein),
          tenth(meal.carbs),
          tenth(meal.fat),
          input.todaysMeals.length,
          input.targets,
        ]);
  const { view, retry } = useSuggestion(fitCheck ?? null, input, key);

  return (
    <Sheet open title={t('fitCheck.title')} onClose={onClose} data-ui="fitCheck">
      <div className={styles.body}>
        <section aria-labelledby={dayId} className={styles.section}>
          <h3 id={dayId} className={styles.heading}>
            {t('fitCheck.heading')}
          </h3>
          {rows ? (
            <ul className={styles.rows}>
              {rows.map((fit) => (
                <li key={fit.key} className={styles.row} data-ui={`fitCheck.row.${fit.key}`}>
                  <span className={styles.label}>{t(`fitCheck.row.${fit.key}`)}</span>
                  <span className={styles.added} data-ui={`fitCheck.row.${fit.key}.added`}>
                    {fit.added}
                  </span>
                  <span className={styles.after} data-ui={`fitCheck.row.${fit.key}.after`}>
                    {fit.after}
                  </span>
                  {fit.remaining ? (
                    <span
                      className={cx(styles.remaining, fit.highlighted && styles.over)}
                      data-over={fit.highlighted ? 'true' : undefined}
                      data-ui={`fitCheck.row.${fit.key}.remaining`}
                    >
                      {fit.remaining}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}
          {rows && goals === null ? <p className={styles.note}>{t('fitCheck.noGoals')}</p> : null}
          <p className={styles.note}>{t('fitCheck.note')}</p>
        </section>
        {fitCheck ? (
          <section
            aria-labelledby={suggestionId}
            className={styles.section}
            data-ui="fitCheck.suggestion"
          >
            <h3 id={suggestionId} className={styles.heading}>
              {t('fitCheck.suggestion.heading')}
            </h3>
            {noProfile ? (
              <p className={styles.note} data-ui="fitCheck.suggestion.noProfile">
                {t('fitCheck.suggestion.noProfile')}
              </p>
            ) : (
              <Suggestion view={view} onRetry={retry} />
            )}
          </section>
        ) : null}
      </div>
    </Sheet>
  );
}

function Suggestion({
  view,
  onRetry,
}: {
  readonly view: SuggestionView;
  readonly onRetry: () => void;
}) {
  switch (view.kind) {
    case 'loading':
      return (
        <p className={styles.status} role="status" data-ui="fitCheck.suggestion.loading">
          <span className={styles.spinner} aria-hidden="true" />
          {t('fitCheck.suggestion.loading')}
        </p>
      );
    case 'text':
      return (
        <p className={styles.answer} data-ui="fitCheck.suggestion.text">
          {view.text}
        </p>
      );
    case 'empty':
      return (
        <p className={styles.note} data-ui="fitCheck.suggestion.empty">
          {t('fitCheck.suggestion.empty')}
        </p>
      );
    case 'noKey':
      return (
        <p className={styles.note} data-ui="fitCheck.suggestion.noKey">
          {t('fitCheck.suggestion.noKey')}
        </p>
      );
    case 'failed':
      return (
        <div className={styles.failure}>
          <div role="alert" data-ui="fitCheck.suggestion.error">
            {view.messages.map(({ key, params }) => (
              <p key={key}>{t(key, params)}</p>
            ))}
          </div>
          <Button variant="secondary" onClick={onRetry} data-ui="fitCheck.retry">
            {t('common.retry')}
          </Button>
        </div>
      );
  }
}
