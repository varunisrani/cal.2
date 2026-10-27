import { useMemo, useState } from 'react';
import { dayKeyOf } from '../../domain/dates/dayKey';
import type { BodyMetric } from '../../domain/progress/ranges';
import { formatDay } from '../../i18n/format';
import { t } from '../../i18n/t';
import { IconButton } from '../../ui/Button';
import { Dialog } from '../../ui/Dialog';
import { Icon } from '../../ui/icons';
import { Sheet } from '../../ui/Sheet';
import { useToast } from '../../ui/Toast';
import { HISTORY_WORDS } from './HistoryLink';
import { useProgress } from './LogWeightSheet';
import styles from './readings.module.css';

/** The history sheet's place on the sheet stack. */
export const HISTORY_SHEET = 'history';

/** One reading as the history lists it. */
export interface HistoryReading {
  readonly id: string;
  /** When it was taken (epoch ms). */
  readonly at: number;
  /** The value as the cards write it: "70.4 kg", "18.5%". */
  readonly value: string;
}

export interface HistorySheetProps {
  readonly open: boolean;
  /** Whose readings these are: weigh-ins or body-fat readings. */
  readonly metric: BodyMetric;
  /** Every stored reading of the metric, in any order; the sheet lists them newest first. */
  readonly readings: readonly HistoryReading[];
  readonly onClose: () => void;
}

/** The day of a reading as the list and the question write it: "Oct 20, 2026". */
function dayOf(reading: HistoryReading): string {
  return formatDay(dayKeyOf(reading.at), 'medium');
}

/**
 * Every reading of one metric, newest first: the value over its date, and a delete button on
 * each row (D-16.38). Delete asks first, naming the date and the value; once confirmed the row
 * leaves the list at once while the repository removes it and moves the profile to the newest
 * reading left (R05.8, R05.22). A delete that fails puts the row back. Renders nothing while
 * closed.
 */
export function HistorySheet(props: HistorySheetProps) {
  return props.open ? <OpenHistorySheet {...props} /> : null;
}

function OpenHistorySheet({ metric, readings, onClose }: HistorySheetProps) {
  const progress = useProgress();
  const toast = useToast();
  // Rows deleted from this sheet: hidden at once, before the live read catches up.
  const [gone, setGone] = useState<ReadonlySet<string>>(() => new Set());
  const [asking, setAsking] = useState<HistoryReading | null>(null);
  const words = HISTORY_WORDS[metric];
  const shown = useMemo(
    () => readings.filter((reading) => !gone.has(reading.id)).sort((a, b) => b.at - a.at),
    [readings, gone],
  );

  const remove = (reading: HistoryReading): void => {
    setAsking(null);
    setGone((current) => new Set(current).add(reading.id));
    const work =
      metric === 'weight'
        ? progress.deleteWeighIn(reading.id)
        : progress.deleteBodyFatReading(reading.id);
    work.catch((error: unknown) => {
      console.error('Deleting a reading failed', error);
      setGone((current) => {
        const back = new Set(current);
        back.delete(reading.id);
        return back;
      });
      toast.show(t('progress.history.deleteFailed'));
    });
  };

  return (
    <Sheet open title={t(words.title)} onClose={onClose} data-ui="progress.history.sheet">
      {shown.length === 0 ? (
        <p className={styles.emptyList}>{t('progress.history.empty')}</p>
      ) : (
        <ul className={styles.list} data-ui="progress.history.list">
          {shown.map((reading) => {
            const date = dayOf(reading);
            return (
              <li key={reading.id} className={styles.row} data-ui="progress.history.row">
                <span className={styles.rowText}>
                  <span className={styles.rowValue}>{reading.value}</span>
                  <time className={styles.rowDate} dateTime={dayKeyOf(reading.at)}>
                    {date}
                  </time>
                </span>
                <IconButton
                  icon={<Icon name="trash" size={20} />}
                  label={t('progress.history.delete', { value: reading.value, date })}
                  onClick={() => setAsking(reading)}
                  data-ui="progress.history.delete"
                />
              </li>
            );
          })}
        </ul>
      )}
      <Dialog
        open={asking !== null}
        title={t(words.deleteTitle)}
        message={
          asking
            ? t('progress.history.deleteMessage', { value: asking.value, date: dayOf(asking) })
            : undefined
        }
        confirmLabel={t('common.delete')}
        destructive
        onConfirm={() => {
          if (asking) remove(asking);
        }}
        onCancel={() => setAsking(null)}
        data-ui="progress.history.confirm"
      />
    </Sheet>
  );
}
