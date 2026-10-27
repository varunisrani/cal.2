import { useId, useState } from 'react';
import { useToday } from '../../app/TodayProvider';
import { useDayEntries, useSettings } from '../../data/hooks';
import { addDays, splitDayKey, type DayKey } from '../../domain/dates/dayKey';
import { groupDiary, type DiaryRow } from '../../domain/meals/diary';
import { DEFAULT_MEAL_TIMES } from '../../domain/meals/times';
import type { DiaryEntry, MealKind } from '../../domain/model';
import type { EnergyDisplayUnit } from '../../domain/units/energy';
import { formatDay, formatTime } from '../../i18n/format';
import { t } from '../../i18n/t';
import { useServices } from '../../services/context';
import { Button } from '../../ui/Button';
import { DateTimeField } from '../../ui/DateTimeField';
import { Icon } from '../../ui/icons';
import { Sheet } from '../../ui/Sheet';
import { useToast } from '../../ui/Toast';
import { useFasting } from '../fasting/hours';
import { PausedDialog } from '../fasting/PausedDialog';
import { energyText } from '../home/energy';
import { MEAL_NAME_KEYS } from './meals';
import styles from './reuse/reuse.module.css';

const SETTINGS = ['units.energy'] as const;

/** How far back the source day may go: the first of January ten years ago. */
const YEARS_BACK = 10;

/** A copy a running fast refused: what was chosen, and the fast. */
interface Paused {
  readonly chosen: readonly DiaryEntry[];
  readonly fastId: string;
}

export interface CopyDaySheetProps {
  readonly open: boolean;
  /** Done, and after a copy. */
  readonly onClose: () => void;
  /** The day the copies go to: the day Home shows. */
  readonly targetDay: DayKey;
}

/**
 * Copy a day (02 §3.17): pick a source day (the day before the target at first), see its foods
 * under their meals, and copy all of them, one meal or one food onto the target day. The copies
 * keep their meals (Proposed D-16.50) and share their photos; the originals stay as they are. A
 * running fast refuses the copy before anything is written: the paused dialog says so and the
 * sheet stays, and its "End fast and log" ends the fast and copies them (D-16.35). After a copy
 * the sheet closes. Renders nothing while closed.
 */
export function CopyDaySheet(props: CopyDaySheetProps) {
  return props.open ? <OpenCopyDaySheet {...props} /> : null;
}

function OpenCopyDaySheet({ onClose, targetDay }: CopyDaySheetProps) {
  const { copyDay } = useServices();
  const fasting = useFasting();
  const toast = useToast();
  const today = useToday();
  const [sourceDay, setSourceDay] = useState(() => addDays(targetDay, -1));
  const [paused, setPaused] = useState<Paused | null>(null);
  const entries = useDayEntries(sourceDay);
  const settings = useSettings(SETTINGS);

  const copy = async (chosen: readonly DiaryEntry[]): Promise<void> => {
    try {
      if (!copyDay) throw new Error('No copy service');
      const result = await copyDay.copy(chosen, targetDay);
      if (result.kind === 'copied') onClose();
      else if (result.kind === 'fastActive') setPaused({ chosen, fastId: result.fast.id });
    } catch (error) {
      console.error('Copying a day failed', error);
      toast.show(t('reuse.copyDay.failed'));
    }
  };

  // "End fast and log": ends the fast, then copies again (a fast already ended elsewhere is fine).
  const endFastAndCopy = async (): Promise<void> => {
    if (!paused) return;
    try {
      if (!copyDay) throw new Error('No copy service');
      await fasting().end(paused.fastId);
      const result = await copyDay.copy(paused.chosen, targetDay);
      if (result.kind === 'copied') {
        onClose();
        return;
      }
      if (result.kind === 'fastActive') toast.show(t('fasting.paused.failed'));
    } catch (error) {
      console.error('Ending the fast and copying failed', error);
      toast.show(t('reuse.copyDay.failed'));
    }
    setPaused(null);
  };

  let body;
  if (entries.status === 'error' || settings.status === 'error') {
    body = <p className={styles.empty}>{t('reuse.copyDay.loadFailed')}</p>;
  } else if (entries.status === 'ready' && settings.status === 'ready') {
    body =
      entries.value.length === 0 ? (
        <p className={styles.empty} data-ui="copyDay.empty">
          {t('reuse.copyDay.empty')}
        </p>
      ) : (
        <DayFoods
          entries={entries.value}
          energyUnit={settings.value['units.energy']}
          onCopy={copy}
        />
      );
  }

  return (
    <Sheet open title={t('reuse.copyDay.title')} onClose={onClose} data-ui="copyDay">
      <div className={styles.body} aria-busy={body === undefined || undefined}>
        <DateTimeField
          kind="date"
          label={t('reuse.copyDay.from')}
          value={sourceDay}
          onChange={setSourceDay}
          min={`${splitDayKey(today).year - YEARS_BACK}-01-01`}
          max={today}
          data-ui="copyDay.from"
        />
        <p className={styles.note} data-ui="copyDay.note">
          {targetDay === today
            ? t('reuse.copyDay.toToday')
            : t('reuse.copyDay.toDay', { day: formatDay(targetDay, 'medium') })}
        </p>
        {body}
      </div>
      <PausedDialog
        open={paused !== null}
        onEndAndLog={endFastAndCopy}
        onCancel={() => setPaused(null)}
      />
    </Sheet>
  );
}

interface DayFoodsProps {
  /** The source day's entries (at least one). */
  readonly entries: readonly DiaryEntry[];
  readonly energyUnit: EnergyDisplayUnit;
  readonly onCopy: (chosen: readonly DiaryEntry[]) => Promise<void>;
}

/** Copy all, then each meal in the fixed order with its own copy button and its foods. */
function DayFoods({ entries, energyUnit, onCopy }: DayFoodsProps) {
  const baseId = useId();
  const rows = entries.map((entry): DiaryRow => ({ kind: 'food', entry }));
  // Food keeps its own meal; the meal times only place water and fasts, which are not here.
  const sections = groupDiary(rows, 'byMeal', DEFAULT_MEAL_TIMES);

  return (
    <>
      <Button variant="primary" block onClick={() => onCopy(entries)} data-ui="copyDay.all">
        {t('reuse.copyDay.all', { count: entries.length })}
      </Button>
      {sections.map(({ meal, rows: mealRows }) => {
        const foods = mealRows.flatMap((row) => (row.kind === 'food' ? [row.entry] : []));
        const titleId = `${baseId}-${meal}`;
        return (
          <section
            key={meal}
            className={styles.meal}
            aria-labelledby={titleId}
            data-ui={`copyDay.meal.${meal}`}
          >
            <header className={styles.mealHeader}>
              <h3 id={titleId} className={styles.mealName}>
                {t(MEAL_NAME_KEYS[meal])}
              </h3>
              <Button
                variant="quiet"
                onClick={() => onCopy(foods)}
                data-ui={`copyDay.meal.${meal}.copy`}
              >
                {t('reuse.copyDay.meal', { meal: mealName(meal) })}
              </Button>
            </header>
            <ul className={styles.entries}>
              {foods.map((entry) => (
                <li key={entry.id}>
                  <button
                    type="button"
                    className={styles.entry}
                    onClick={() => void onCopy([entry])}
                    data-ui="copyDay.entry"
                  >
                    <span className={styles.entryText}>
                      <span className={styles.name}>{entry.name}</span>
                      <span className={styles.entryMeta}>
                        <time dateTime={new Date(entry.loggedAt).toISOString()}>
                          {formatTime(entry.loggedAt)}
                        </time>
                        <span>{energyText(entry.kcal, energyUnit)}</span>
                      </span>
                    </span>
                    <span className={styles.log} aria-hidden="true">
                      <Icon name="copy" size={20} />
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </>
  );
}

function mealName(meal: MealKind): string {
  return t(MEAL_NAME_KEYS[meal]);
}
