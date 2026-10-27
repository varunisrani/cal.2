import { useEffect, useId, useState } from 'react';
import type { Fast } from '../../domain/model';
import { fastDuration } from '../../domain/trackers/fasting';
import { formatDuration, formatTime } from '../../i18n/format';
import type { Clock } from '../../lib/clock';
import { useServices } from '../../services/context';
import { cx } from '../../ui/classes';
import { Dialog } from '../../ui/Dialog';
import { Icon } from '../../ui/icons';
import { ProgressBar } from '../../ui/ProgressBar';
import { SwipeRow } from '../../ui/SwipeRow';
import { useToast } from '../../ui/Toast';
import styles from './diaryRows.module.css';
import { tx } from './text';

const MS_PER_MINUTE = 60_000;
/** How often a running fast's time is redrawn. */
const TICK_MS = 1_000;

export interface FastRowProps {
  readonly fast: Fast;
  /** A tap on the row: the fast editor. */
  readonly onOpen: (fast: Fast) => void;
}

/** "16h 30m": a span of milliseconds in whole minutes (the rest dropped). */
function lengthText(ms: number): string {
  return formatDuration(ms / MS_PER_MINUTE);
}

/**
 * The clock's time, read again every second while the page is visible. While the page is hidden
 * nothing runs; it is read at once when the page shows again.
 */
function useEverySecond(clock: Clock): number {
  const [now, setNow] = useState(() => clock.now());
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | undefined;
    const stop = (): void => {
      clearInterval(timer);
      timer = undefined;
    };
    const run = (): void => {
      stop();
      setNow(clock.now());
      timer = setInterval(() => setNow(clock.now()), TICK_MS);
    };
    const onVisibility = (): void => {
      if (document.visibilityState === 'hidden') stop();
      else run();
    };
    if (document.visibilityState !== 'hidden') run();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [clock]);
  return now;
}

/**
 * A fast in the diary (05 §3.3.3). Running: an hourglass tile, "Fasting now" with its start time,
 * the time so far (redrawn every second while visible) and the goal, and a thin bar of the time so
 * far over the goal, full at most. Finished: its length, its start and end times and its goal.
 * Tapping either opens the fast editor: its button holds only the row's title, so its name is all
 * the text it shows (WCAG 2.5.3), and its hit area and focus ring cover the whole card. A finished
 * fast also slides toward the leading edge (or uses its delete button) to be deleted after a
 * confirmation; a running one is ended or cancelled from its editor or the + menu instead. Shown
 * whether or not fasting is tracked (R05.9).
 */
export function FastRow({ fast, onOpen }: FastRowProps) {
  return fast.end === null ? (
    <RunningFast fast={fast} onOpen={onOpen} />
  ) : (
    <FinishedFast fast={fast} end={fast.end} onOpen={onOpen} />
  );
}

function RunningFast({ fast, onOpen }: FastRowProps) {
  const { clock } = useServices();
  const now = useEverySecond(clock);
  const id = useId();
  const elapsedMs = fastDuration(fast, now);
  const goalMs = fast.goalMin * MS_PER_MINUTE;
  const elapsed = lengthText(elapsedMs);
  const goal = lengthText(goalMs);

  return (
    <div className={styles.fast} data-ui="fast.row" data-running="">
      <div className={styles.open}>
        <span className={styles.tile} aria-hidden="true">
          <Icon name="hourglass" size={22} />
        </span>
        <span className={styles.text}>
          <button
            type="button"
            className={cx(styles.openButton, styles.title)}
            aria-labelledby={`${id}-title ${id}-elapsed`}
            aria-describedby={`${id}-started ${id}-goal`}
            onClick={() => onOpen(fast)}
          >
            <span id={`${id}-title`}>{tx('home.fast.running')}</span>
          </button>
          <span id={`${id}-started`} className={styles.detail}>
            {tx('home.fast.started', { time: formatTime(fast.start) })}
          </span>
        </span>
        <span className={styles.trailing}>
          <span id={`${id}-elapsed`} className={styles.figure} data-ui="fast.row.elapsed">
            {elapsed}
          </span>
          <span id={`${id}-goal`} className={styles.goal}>
            {tx('home.fast.goal', { length: goal })}
          </span>
        </span>
        <Icon name="chevronRight" size={18} className={styles.chevron} />
      </div>
      <div className={styles.bar}>
        <ProgressBar
          value={elapsedMs}
          max={goalMs}
          label={tx('home.fast.progress')}
          valueText={tx('home.fast.progressValue', { elapsed, goal })}
          data-ui="fast.row.progress"
        />
      </div>
    </div>
  );
}

interface FinishedFastProps extends FastRowProps {
  readonly end: number;
}

function FinishedFast({ fast, end, onOpen }: FinishedFastProps) {
  const { fasting } = useServices();
  const toast = useToast();
  const [asking, setAsking] = useState(false);
  const id = useId();
  const length = lengthText(end - fast.start);

  const remove = async (): Promise<void> => {
    try {
      if (!fasting) throw new Error('No fasting service above this row');
      // A fast already deleted elsewhere is refused as missing: it is gone either way.
      await fasting.remove(fast.id);
    } catch (error) {
      console.error('Deleting a fast failed', error);
      toast.show(tx('home.fast.deleteFailed'));
    }
    setAsking(false);
  };

  return (
    <>
      <SwipeRow
        onRequestDelete={() => setAsking(true)}
        deleteLabel={tx('home.fast.deleteLabel', { length })}
        data-ui="fast.row"
      >
        <div className={styles.fast}>
          <div className={styles.open}>
            <span className={styles.tile} aria-hidden="true">
              <Icon name="hourglass" size={22} />
            </span>
            <span className={styles.text}>
              <button
                id={`${id}-title`}
                type="button"
                className={cx(styles.openButton, styles.title)}
                aria-describedby={`${id}-times ${id}-goal`}
                onClick={() => onOpen(fast)}
              >
                {tx('home.fast.done', { length })}
              </button>
              <span id={`${id}-times`} className={styles.detail}>
                {tx('home.fast.times', { start: formatTime(fast.start), end: formatTime(end) })}
              </span>
            </span>
            <span id={`${id}-goal`} className={styles.goal}>
              {tx('home.fast.goal', { length: lengthText(fast.goalMin * MS_PER_MINUTE) })}
            </span>
            <Icon name="chevronRight" size={18} className={styles.chevron} />
          </div>
        </div>
      </SwipeRow>
      <Dialog
        open={asking}
        title={tx('home.fast.deleteTitle')}
        message={tx('home.fast.deleteMessage', { length })}
        confirmLabel={tx('common.delete')}
        destructive
        onConfirm={remove}
        onCancel={() => setAsking(false)}
        data-ui="fast.delete"
      />
    </>
  );
}
