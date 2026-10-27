import { useState } from 'react';
import { useToday } from '../../../app/TodayProvider';
import { useEntriesBetween, useSavedMeals, useSettings } from '../../../data/hooks';
import { dayKeyOf } from '../../../domain/dates/dayKey';
import {
  OFTEN_DAYS,
  RECENT_DAYS,
  oftenEaten,
  recentEntries,
  reuseDraft,
  searchFoods,
  windowStart,
} from '../../../domain/food/reuse';
import type { DiaryEntry, SavedMeal } from '../../../domain/model';
import type { EnergyDisplayUnit } from '../../../domain/units/energy';
import { t, type TKey } from '../../../i18n/t';
import { useServices } from '../../../services/context';
import { IconButton } from '../../../ui/Button';
import { Field } from '../../../ui/Field';
import { Icon } from '../../../ui/icons';
import { Sheet } from '../../../ui/Sheet';
import { SwipeRow } from '../../../ui/SwipeRow';
import { useToast } from '../../../ui/Toast';
import { ReuseRow, type ReusableFood } from './ReuseRow';
import styles from './reuse.module.css';

/** The three reuse lists of the add menu. */
export type ReuseList = 'recent' | 'often' | 'saved';

const TITLES: Readonly<Record<ReuseList, TKey>> = {
  recent: 'reuse.title.recent',
  often: 'reuse.title.often',
  saved: 'reuse.title.saved',
};

const EMPTY: Readonly<Record<ReuseList, TKey>> = {
  recent: 'reuse.empty.recent',
  often: 'reuse.empty.often',
  saved: 'reuse.empty.saved',
};

const SETTINGS = ['units.energy'] as const;

export interface ReuseSheetProps {
  readonly list: ReuseList;
  readonly open: boolean;
  /** Done, and after a pick (the review takes over). */
  readonly onClose: () => void;
  /**
   * Pick mode: a tap closes the sheet and hands the food here instead of opening its review (the
   * add-ingredient menu adds it as one part).
   */
  readonly onPick?: (food: ReusableFood) => void;
}

/**
 * A reuse list as its own sheet (02 §3.16, D-16.17): Recent (every entry of the last 30 days,
 * newest first), Often eaten (the last 90 days by food, most eaten first) or Saved (the saved
 * meals in the person's order), with a search that ignores case and accents. A tap never logs:
 * the sheet closes and the food opens in the review as a draft, its photos reused and its source
 * kept, on the day Home shows. Saved meals can be removed (a button, or a swipe) and moved up or
 * down; the moves are hidden while searching, since a filtered position is not a stored one
 * (R02.7). Renders nothing while closed, so every opening starts with an empty search.
 */
export function ReuseSheet(props: ReuseSheetProps) {
  return props.open ? <OpenReuseSheet {...props} /> : null;
}

function OpenReuseSheet({ list, onClose, onPick }: ReuseSheetProps) {
  const { analysis, clock } = useServices();
  const toast = useToast();
  const settings = useSettings(SETTINGS);
  const saved = useSavedMeals();
  // The windows end now; they are worked out once per opening.
  const [openedAt] = useState(() => clock.now());
  const [query, setQuery] = useState('');

  const pick = (food: ReusableFood): void => {
    onClose();
    if (onPick) {
      onPick(food);
      return;
    }
    const opening = analysis?.openForReview?.(reuseDraft(food), {
      photoIds: food.photoIds,
      source: food.source,
    });
    if (!opening) {
      toast.show(t('reuse.openFailed'));
      return;
    }
    opening.catch((error: unknown) => {
      console.error('A food could not be opened for review', error);
      toast.show(t('reuse.openFailed'));
    });
  };

  let body;
  if (settings.status === 'error' || saved.status === 'error') {
    body = <p className={styles.empty}>{t('reuse.loadFailed')}</p>;
  } else if (settings.status === 'ready' && saved.status === 'ready') {
    const shared = {
      query,
      energyUnit: settings.value['units.energy'],
      onPick: pick,
    };
    body =
      list === 'saved' ? (
        <SavedFoods {...shared} meals={saved.value} />
      ) : (
        <LoggedFoods {...shared} list={list} now={openedAt} saved={saved.value} />
      );
  }

  return (
    <Sheet open title={t(TITLES[list])} onClose={onClose} data-ui={`reuse.${list}`}>
      <div className={styles.body} aria-busy={body === undefined || undefined}>
        <Field
          type="search"
          label={t('reuse.search')}
          value={query}
          onChange={setQuery}
          autoComplete="off"
          enterKeyHint="search"
          data-ui="reuse.search"
        />
        {body}
      </div>
    </Sheet>
  );
}

interface ListProps {
  readonly query: string;
  readonly energyUnit: EnergyDisplayUnit;
  readonly onPick: (food: ReusableFood) => void;
}

/** The list's empty state: nothing in it at all, or nothing matching the search. */
function Empty({ list, query }: { readonly list: ReuseList; readonly query: string | null }) {
  return (
    <p className={styles.empty} data-ui="reuse.empty">
      {query === null ? t(EMPTY[list]) : t('reuse.empty.noMatch', { query: query.trim() })}
    </p>
  );
}

interface LoggedFoodsProps extends ListProps {
  readonly list: 'recent' | 'often';
  readonly now: number;
  readonly saved: readonly SavedMeal[];
}

/** Recent or Often eaten, read from the diary days the window touches. */
function LoggedFoods({ list, now, saved, query, energyUnit, onPick }: LoggedFoodsProps) {
  const today = useToday();
  const days = list === 'recent' ? RECENT_DAYS : OFTEN_DAYS;
  const entries = useEntriesBetween(dayKeyOf(windowStart(now, days)), today);
  if (entries.status === 'loading') return null;
  if (entries.status === 'error') return <p className={styles.empty}>{t('reuse.loadFailed')}</p>;

  const savedFrom = new Set(saved.map((meal) => meal.originEntryId));
  const rows: readonly { food: DiaryEntry; count: number | undefined }[] =
    list === 'recent'
      ? recentEntries(entries.value, now).map((entry) => ({ food: entry, count: undefined }))
      : oftenEaten(entries.value, now).map((group) => ({
          food: group.template,
          count: group.count,
        }));
  if (rows.length === 0) return <Empty list={list} query={null} />;
  const shown = searchFoods(rows, query, (row) => row.food.name);
  if (shown.length === 0) return <Empty list={list} query={query} />;

  return (
    <ul className={styles.list} data-ui="reuse.list">
      {shown.map(({ food, count }) => (
        <li key={food.id}>
          <ReuseRow
            food={food}
            saved={savedFrom.has(food.id)}
            eatenCount={count}
            energyUnit={energyUnit}
            onPick={() => onPick(food)}
            data-ui="reuse.row"
          />
        </li>
      ))}
    </ul>
  );
}

interface SavedFoodsProps extends ListProps {
  readonly meals: readonly SavedMeal[];
}

/** The saved meals in the person's order, each removable and, outside a search, movable. */
function SavedFoods({ meals, query, energyUnit, onPick }: SavedFoodsProps) {
  const { savedMeals } = useServices();
  const toast = useToast();
  if (meals.length === 0) return <Empty list="saved" query={null} />;
  const searching = query.trim() !== '';
  const shown = searchFoods(meals, query, (meal) => meal.name);
  if (shown.length === 0) return <Empty list="saved" query={query} />;

  /** Runs a change of the saved list; the list follows the database, so a failure only says so. */
  const change = (work: Promise<void> | undefined): Promise<void> | undefined =>
    work?.catch((error: unknown) => {
      console.error('Changing the saved meals failed', error);
      toast.show(t('reuse.changeFailed'));
    });
  const remove = (meal: SavedMeal) => change(savedMeals?.remove(meal.id));
  const move = (from: number, to: number) => change(savedMeals?.move(from, to));

  return (
    <ul className={styles.list} data-ui="reuse.list">
      {shown.map((meal) => {
        // Its place in the whole list: moves are offered only when nothing is filtered out.
        const index = meals.indexOf(meal);
        const name = meal.name;
        return (
          <li key={meal.id}>
            <SwipeRow
              onRequestDelete={() => void remove(meal)}
              deleteLabel={t('reuse.row.remove', { name })}
              data-ui="reuse.saved"
            >
              <ReuseRow
                food={meal}
                saved
                energyUnit={energyUnit}
                onPick={() => onPick(meal)}
                data-ui="reuse.row"
                controls={
                  <>
                    {searching ? null : (
                      <span className={styles.moves}>
                        <IconButton
                          icon={<Icon name="chevronUp" size={20} />}
                          label={t('reuse.row.moveUp', { name })}
                          disabled={index === 0}
                          onClick={() => move(index, index - 1)}
                          data-ui="reuse.row.up"
                        />
                        <IconButton
                          icon={<Icon name="chevronDown" size={20} />}
                          label={t('reuse.row.moveDown', { name })}
                          disabled={index === meals.length - 1}
                          onClick={() => move(index, index + 1)}
                          data-ui="reuse.row.down"
                        />
                      </span>
                    )}
                    <IconButton
                      icon={<Icon name="trash" size={20} />}
                      label={t('reuse.row.remove', { name })}
                      onClick={() => remove(meal)}
                      data-ui="reuse.row.remove"
                    />
                  </>
                }
              />
            </SwipeRow>
          </li>
        );
      })}
    </ul>
  );
}
