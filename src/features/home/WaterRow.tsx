import { useId, useState } from 'react';
import type { WaterLog } from '../../domain/model';
import type { WaterDisplayUnit } from '../../domain/units/water';
import { formatTime } from '../../i18n/format';
import { useServices } from '../../services/context';
import { Dialog } from '../../ui/Dialog';
import { Icon } from '../../ui/icons';
import { SwipeRow } from '../../ui/SwipeRow';
import { useToast } from '../../ui/Toast';
import { waterAmount } from '../water/amounts';
import styles from './diaryRows.module.css';
import { tx } from './text';

export interface WaterRowProps {
  readonly log: WaterLog;
  /** The water unit the amount is written in. */
  readonly unit: WaterDisplayUnit;
}

/**
 * One water log in the diary (05 §3.3.3): a drop tile, "Water", the time it was logged and the
 * amount in the person's unit. Swiping it toward the leading edge, or its delete button, asks
 * before the log is deleted. It shows whether or not water is tracked: the switch hides the ways
 * to log, never what was logged (R05.9).
 */
export function WaterRow({ log, unit }: WaterRowProps) {
  const { water } = useServices();
  const toast = useToast();
  const [asking, setAsking] = useState(false);
  const id = useId();
  const titleId = `${id}-title`;
  const amountId = `${id}-amount`;
  const amount = waterAmount(log.ml, unit);

  const remove = async (): Promise<void> => {
    try {
      if (!water) throw new Error('No water service above this row');
      await water.deleteLog(log.id);
    } catch (error) {
      console.error('Deleting a water log failed', error);
      toast.show(tx('home.water.deleteFailed'));
    }
    // Once deleted, the row usually leaves with its dialog before this runs.
    setAsking(false);
  };

  return (
    <>
      <SwipeRow
        onRequestDelete={() => setAsking(true)}
        deleteLabel={tx('home.water.deleteLabel', { amount })}
        data-ui="water.row"
      >
        <div role="group" aria-labelledby={`${titleId} ${amountId}`} className={styles.row}>
          <span className={styles.tile} aria-hidden="true">
            <Icon name="drop" size={22} />
          </span>
          <span className={styles.text}>
            <span id={titleId} className={styles.title}>
              {tx('home.water.title')}
            </span>
            <time className={styles.detail} dateTime={new Date(log.at).toISOString()}>
              {formatTime(log.at)}
            </time>
          </span>
          <span id={amountId} className={styles.figure}>
            {amount}
          </span>
        </div>
      </SwipeRow>
      <Dialog
        open={asking}
        title={tx('home.water.deleteTitle')}
        message={tx('home.water.deleteMessage', { amount })}
        confirmLabel={tx('common.delete')}
        destructive
        onConfirm={remove}
        onCancel={() => setAsking(false)}
        data-ui="water.delete"
      />
    </>
  );
}
