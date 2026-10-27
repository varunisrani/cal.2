import { useRef, useState } from 'react';
import type { Fast } from '../../domain/model';
import { t } from '../../i18n/t';
import { useServices } from '../../services/context';
import type { FastChanges, FastEdits, FastResult, FastingService } from '../../services/fasting';
import { Button } from '../../ui/Button';
import { DateTimeField, type DateTimeValue } from '../../ui/DateTimeField';
import { Dialog } from '../../ui/Dialog';
import { Sheet } from '../../ui/Sheet';
import { Stepper } from '../../ui/Stepper';
import { useToast } from '../../ui/Toast';
import { dateTimeOf, instantOf } from '../log/review/ReviewSheet';
import styles from './fasting.module.css';
import { GOAL_HOURS, goalHoursOf, hoursText, useFasting } from './hours';

export interface FastEditorProps {
  readonly open: boolean;
  /** The fast as stored when it was tapped. */
  readonly fast: Fast | null;
  /** Cancel, Escape, the scrim; also after a change is stored. */
  readonly onClose: () => void;
}

/**
 * The fast editor (05 §3.7.4): Started, Ended (finished fasts only, never before Started) and the
 * goal in whole hours, 1 to 168; neither time may be after now. A running fast offers "End fast
 * now", which stores the edited start and goal with the end in one write (R05.3), and "Cancel
 * fast", which deletes it; a finished fast offers "Delete fast". Save stores the edits and keeps a
 * running fast running; Cancel drops them. A field left alone keeps its stored value exactly. A
 * change that would share time with another fast is refused with a message and changes nothing.
 * Renders nothing while closed or without a fast.
 */
export function FastEditor({ open, fast, onClose }: FastEditorProps) {
  return open && fast ? <OpenEditor key={fast.id} fast={fast} onClose={onClose} /> : null;
}

interface OpenEditorProps {
  readonly fast: Fast;
  readonly onClose: () => void;
}

function OpenEditor({ fast, onClose }: OpenEditorProps) {
  const { clock } = useServices();
  const fasting = useFasting();
  const toast = useToast();
  const acting = useRef(false);
  // Null while the person has not touched the field: the stored value then stands as it is.
  const [startPick, setStartPick] = useState<DateTimeValue | null>(null);
  const [endPick, setEndPick] = useState<DateTimeValue | null>(null);
  const [hoursPick, setHoursPick] = useState<number | null>(null);
  const [overlap, setOverlap] = useState(false);

  const running = fast.end === null;
  const latest = dateTimeOf(clock.now());
  const start = startPick === null ? fast.start : instantOf(startPick);
  // A finished fast's end follows a start moved past it.
  const end = Math.max(endPick === null ? (fast.end ?? start) : instantOf(endPick), start);
  const hours = hoursPick ?? goalHoursOf(fast.goalMin);

  const edits: FastEdits = {
    ...(startPick === null ? {} : { start }),
    ...(hoursPick === null ? {} : { goalMin: hoursPick * 60 }),
  };
  const changes: FastChanges = {
    ...edits,
    ...(!running && (startPick !== null || endPick !== null) ? { end } : {}),
  };

  const answer = (result: FastResult): void => {
    if (result.ok) {
      onClose();
      return;
    }
    if (result.error === 'overlap' || result.error === 'active') {
      // Two running fasts would overlap too: one message for both.
      setOverlap(true);
      return;
    }
    // Deleted or ended somewhere else meanwhile.
    toast.show(t('fasting.editor.gone'));
    onClose();
  };

  const act = async (work: (service: FastingService) => Promise<FastResult>): Promise<void> => {
    if (acting.current) return;
    acting.current = true;
    try {
      answer(await work(fasting()));
    } catch (error) {
      console.error('Changing a fast failed', error);
      toast.show(t('fasting.editor.failed'));
    } finally {
      acting.current = false;
    }
  };

  return (
    <Sheet
      open
      title={t(running ? 'fasting.editor.titleActive' : 'fasting.editor.titleDone')}
      onClose={onClose}
      data-ui="fast.editor"
      leading={
        <Button variant="quiet" data-ui="fast.editor.cancel" onClick={onClose}>
          {t('common.cancel')}
        </Button>
      }
      trailing={
        <Button
          variant="primary"
          data-ui="fast.editor.save"
          onClick={() => act((service) => service.edit(fast.id, changes))}
        >
          {t('common.save')}
        </Button>
      }
    >
      <div className={styles.body}>
        <DateTimeField
          kind="datetime"
          label={t('fasting.editor.started')}
          value={startPick ?? dateTimeOf(fast.start)}
          max={latest}
          onChange={setStartPick}
          data-ui="fast.editor.started"
        />
        {running ? null : (
          <DateTimeField
            kind="datetime"
            label={t('fasting.editor.ended')}
            value={dateTimeOf(end)}
            min={dateTimeOf(start)}
            max={latest}
            onChange={setEndPick}
            data-ui="fast.editor.ended"
          />
        )}
        <div className={styles.goalRow}>
          <span className={styles.goalLabel} aria-hidden="true">
            {t('fasting.editor.goal')}
          </span>
          <Stepper
            label={t('fasting.editor.goal')}
            value={hours}
            min={GOAL_HOURS.min}
            max={GOAL_HOURS.max}
            step={GOAL_HOURS.step}
            format={hoursText}
            onChange={setHoursPick}
            data-ui="fast.editor.goal"
          />
        </div>
        <div className={styles.actions}>
          {running ? (
            <>
              <Button
                variant="primary"
                block
                data-ui="fast.editor.endNow"
                onClick={() => act((service) => service.endNow(fast.id, edits))}
              >
                {t('fasting.editor.endNow')}
              </Button>
              <Button
                variant="danger"
                block
                data-ui="fast.editor.cancelFast"
                onClick={() => act((service) => service.cancel(fast.id))}
              >
                {t('fasting.editor.cancelFast')}
              </Button>
            </>
          ) : (
            <Button
              variant="danger"
              block
              data-ui="fast.editor.delete"
              onClick={() => act((service) => service.remove(fast.id))}
            >
              {t('fasting.editor.deleteFast')}
            </Button>
          )}
        </div>
      </div>
      <Dialog
        open={overlap}
        title={t('fasting.editor.overlap.title')}
        message={t('fasting.editor.overlap.message')}
        confirmLabel={t('fasting.editor.overlap.ok')}
        cancelLabel={null}
        onConfirm={() => setOverlap(false)}
        onCancel={() => setOverlap(false)}
        data-ui="fast.editor.overlap"
      />
    </Sheet>
  );
}
