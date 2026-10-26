/**
 * One time limit per user action (D-16.23). Everything an action sends (the primary, its
 * retries, the compact re-ask, the standby, the unit repair, every Coach round of one turn) runs
 * under the person's timeout setting together, and their Cancel button can stop it at any point.
 * Both end in one abort signal; the deadline remembers which one fired, so a stop reads as
 * `timeout` or as a silent `cancelled`, never as a network error (R03.6).
 */

/** What stopped an action: the person's Cancel or the time limit. */
export type StopCause = 'cancel' | 'deadline';

export interface Deadline {
  /** Aborts when the person cancels or the time is up, whichever comes first. */
  readonly signal: AbortSignal;
  /** Milliseconds left before the time limit; 0 once the action has stopped. */
  remainingMs(): number;
  /** What stopped the action; undefined while it may still run. */
  stoppedBy(): StopCause | undefined;
  /** The action is over: clears the timer and stops listening to Cancel. Safe to call again. */
  end(): void;
}

export interface DeadlineOptions {
  /** The person's timeout setting in seconds, already clamped by the settings (30–600). */
  readonly timeoutSeconds: number;
  /** The Cancel button's signal. */
  readonly cancel?: AbortSignal;
}

/** Starts the clock for one action. */
export function startDeadline({ timeoutSeconds, cancel }: DeadlineOptions): Deadline {
  if (!Number.isFinite(timeoutSeconds) || timeoutSeconds <= 0) {
    throw new RangeError(`startDeadline: timeout must be a positive number, got ${timeoutSeconds}`);
  }
  const limitMs = timeoutSeconds * 1000;
  const endsAt = Date.now() + limitMs;
  const controller = new AbortController();
  let cause: StopCause | undefined;

  function stop(why: StopCause, reason: unknown): void {
    if (cause !== undefined) return;
    cause = why;
    end();
    controller.abort(reason);
  }
  function onCancel(): void {
    stop('cancel', cancel?.reason);
  }
  function end(): void {
    clearTimeout(timer);
    cancel?.removeEventListener('abort', onCancel);
  }

  const timer = setTimeout(() => {
    stop('deadline', timeoutError('The time limit for this action has passed.'));
  }, limitMs);
  if (cancel?.aborted) onCancel();
  else cancel?.addEventListener('abort', onCancel, { once: true });

  return {
    signal: controller.signal,
    remainingMs: () => (cause === undefined ? Math.max(0, endsAt - Date.now()) : 0),
    stoppedBy: () => cause,
    end,
  };
}

/** The longest one request to a fixed cloud provider may take (D-16.60). */
export const CLOUD_ATTEMPT_CAP_MS = 75_000;

/**
 * How long the next attempt may take: at most 75 s for a fixed cloud provider, so one stuck
 * request cannot use the whole budget; whatever is left for a server the person runs themselves
 * (Ollama, Custom), where the timeout setting is the call limit (D-16.60).
 */
export function attemptCapMs(deadline: Deadline, selfHosted: boolean): number {
  const left = deadline.remainingMs();
  return selfHosted ? left : Math.min(CLOUD_ATTEMPT_CAP_MS, left);
}

/** An abort reason that reads as our own time limit (`fromNetwork` maps the name to timeout). */
export function timeoutError(message: string): DOMException {
  return new DOMException(message, 'TimeoutError');
}
