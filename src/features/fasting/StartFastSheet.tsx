import { useState } from 'react';
import { useSettings } from '../../data/hooks';
import type { Fast } from '../../domain/model';
import { t, type TKey } from '../../i18n/t';
import type { FastRefusal } from '../../services/fasting';
import { Button } from '../../ui/Button';
import { Sheet } from '../../ui/Sheet';
import { Stepper } from '../../ui/Stepper';
import { useToast } from '../../ui/Toast';
import styles from './fasting.module.css';
import { GOAL_HOURS, goalHoursOf, hoursText, useFasting } from './hours';

const SETTINGS = ['fasting.defaultGoalMin'] as const;

/** Why a start was refused, in words. */
const REFUSED: Readonly<Record<FastRefusal, TKey>> = {
  active: 'fasting.start.running',
  overlap: 'fasting.start.overlap',
  missing: 'fasting.start.failed',
  notActive: 'fasting.start.failed',
};

export interface StartFastSheetProps {
  readonly open: boolean;
  /** Cancel, Escape, the scrim; also right after a start. */
  readonly onClose: () => void;
  /** The fast is stored and running. */
  readonly onStarted?: (fast: Fast) => void;
}

/**
 * Start a fast (05 §3.7.2): a goal in whole hours with − and + (1 to 168), opening on the default
 * goal from the settings; Start starts the fast now. A start the fasting rules refuse (one is
 * already running, or a logged fast ends after now) is said here and nothing is stored. Renders
 * nothing while closed, so every opening starts on the default.
 */
export function StartFastSheet(props: StartFastSheetProps) {
  return props.open ? <OpenSheet {...props} /> : null;
}

function OpenSheet({ onClose, onStarted }: StartFastSheetProps) {
  const fasting = useFasting();
  const toast = useToast();
  const settings = useSettings(SETTINGS);
  const [picked, setPicked] = useState<number | null>(null);
  const [refusal, setRefusal] = useState<FastRefusal | null>(null);

  const seeded =
    settings.status === 'ready' ? goalHoursOf(settings.value['fasting.defaultGoalMin']) : null;
  const hours = picked ?? seeded;

  const start = async (): Promise<void> => {
    if (hours === null) return;
    try {
      const result = await fasting().start(hours * 60);
      if (!result.ok) {
        setRefusal(result.error);
        return;
      }
      onStarted?.(result.value);
      onClose();
    } catch (error) {
      console.error('Starting a fast failed', error);
      toast.show(t('fasting.start.failed'));
    }
  };

  return (
    <Sheet
      open
      title={t('fasting.start.title')}
      onClose={onClose}
      data-ui="fast.start"
      leading={
        <Button variant="quiet" data-ui="fast.start.cancel" onClick={onClose}>
          {t('common.cancel')}
        </Button>
      }
      trailing={
        <Button variant="primary" disabled={hours === null} data-ui="fast.start.go" onClick={start}>
          {t('fasting.start.start')}
        </Button>
      }
    >
      <div className={styles.body}>
        <p className={styles.prompt}>{t('fasting.start.prompt')}</p>
        {hours === null ? null : (
          <div className={styles.goal}>
            <Stepper
              label={t('fasting.start.goal')}
              value={hours}
              min={GOAL_HOURS.min}
              max={GOAL_HOURS.max}
              step={GOAL_HOURS.step}
              format={hoursText}
              onChange={(next) => {
                setPicked(next);
                setRefusal(null);
              }}
              data-ui="fast.start.goal"
            />
          </div>
        )}
        <p className={styles.note}>{t('fasting.start.note')}</p>
        {refusal === null ? null : (
          <p className={styles.refusal} role="alert" data-ui="fast.start.refused">
            {t(REFUSED[refusal])}
          </p>
        )}
      </div>
    </Sheet>
  );
}
