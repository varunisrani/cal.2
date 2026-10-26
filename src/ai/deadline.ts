/**
 * The time limit of one user action (D-16.23): analysing a meal, asking Coach, building a plan.
 * The person's "Give up after" setting and their Cancel button become one abort signal, and the
 * deadline remembers which of the two stopped the action, so a stop is reported as a timeout or
 * as a silent cancel, never as a lost connection. Every request of the action shares it: tries,
 * the re-ask, the standby, the unit repair and every Coach round (D-16.60).
 */
import { AiFailureError, fromNetwork } from './errors';

/** What stopped an action: the person's Cancel, or the end of the time budget. */
export type StopReason = 'cancel' | 'deadline';

export interface DeadlineOptions {
  /** The whole budget of the action in milliseconds (the setting, already clamped, × 1000). */
  readonly timeoutMs: number;
  /** The person's Cancel. */
  readonly cancel?: AbortSignal;
}

export interface Deadline {
  /** Aborts when the budget runs out or the person cancels, whichever comes first. */
  readonly signal: AbortSignal;
  /** Which one stopped the action; `undefined` while it runs. Never changes once set. */
  readonly stoppedBy: StopReason | undefined;
  /** Milliseconds of budget left; 0 once stopped. */
  remainingMs(): number;
  /** Waits `ms`: resolves `undefined` when the time passed, or the stop reason once it stops. */
  pause(ms: number): Promise<StopReason | undefined>;
  /** Throws the failure for a stop (cancelled or timeout); does nothing while it runs. */
  throwIfStopped(): void;
  /** Lets go of the timer and the Cancel signal once the action is over. */
  dispose(): void;
}

/** Starts the clock of one action. */
export function startDeadline({ timeoutMs, cancel }: DeadlineOptions): Deadline {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new RangeError(
      `startDeadline: the budget must be a positive number of ms, not ${timeoutMs}`,
    );
  }
  const controller = new AbortController();
  const { signal } = controller;
  const endsAt = Date.now() + timeoutMs;
  let stoppedBy: StopReason | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;

  function stop(reason: StopReason) {
    if (stoppedBy !== undefined) return;
    stoppedBy = reason;
    release();
    controller.abort(stopError(reason));
  }
  function onCancel() {
    stop('cancel');
  }
  function release() {
    clearTimeout(timer);
    cancel?.removeEventListener('abort', onCancel);
  }

  if (cancel?.aborted) {
    stop('cancel');
  } else {
    timer = setTimeout(() => stop('deadline'), timeoutMs);
    cancel?.addEventListener('abort', onCancel, { once: true });
  }

  return {
    signal,
    get stoppedBy() {
      return stoppedBy;
    },
    remainingMs: () => (stoppedBy === undefined ? Math.max(0, endsAt - Date.now()) : 0),
    pause: (ms) =>
      new Promise((resolve) => {
        if (stoppedBy !== undefined) {
          resolve(stoppedBy);
          return;
        }
        const onStop = () => {
          clearTimeout(wait);
          resolve(stoppedBy);
        };
        const wait = setTimeout(() => {
          signal.removeEventListener('abort', onStop);
          resolve(undefined);
        }, ms);
        signal.addEventListener('abort', onStop, { once: true });
      }),
    throwIfStopped() {
      if (stoppedBy !== undefined) {
        throw new AiFailureError(fromNetwork(signal.reason, { stoppedBy }));
      }
    },
    dispose: release,
  };
}

/** The abort reason for each stop, named so code that sees only the error can still tell. */
function stopError(reason: StopReason): DOMException {
  return reason === 'cancel'
    ? new DOMException('The person cancelled the AI request.', 'AbortError')
    : new DOMException('The AI request ran out of time.', 'TimeoutError');
}
