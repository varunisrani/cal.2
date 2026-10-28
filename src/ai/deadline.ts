/**
 * One time limit per user action (D-16.23). Everything an action sends (the primary, its
 * retries, the compact re-ask, the standby, the unit repair, every Coach round of one turn) runs
 * under the person's timeout setting together, and their Cancel button can stop it at any point.
 * Both end in one abort signal; the deadline remembers which one fired, so a stop reads as
 * `timeout` or as a silent `cancelled`, never as a network error (R03.6). While a Coach reply
 * streams in, the limit is held (D-16.106): it counts the waiting, not a long answer that keeps
 * coming.
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
  /**
   * Stops the time limit from counting (a reply is streaming in) and gives the function that lets
   * it count on from where it stood; calling that again does nothing. Holds nest; Cancel works
   * throughout.
   */
  hold(): () => void;
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
  let endsAt = Date.now() + limitMs;
  const controller = new AbortController();
  let cause: StopCause | undefined;
  let ended = false;
  /** Holds in force, and the time that was left when the first of them began. */
  let holds = 0;
  let leftAtHold = 0;

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
    ended = true;
    clearTimeout(timer);
    cancel?.removeEventListener('abort', onCancel);
  }
  function arm(ms: number): ReturnType<typeof setTimeout> {
    return setTimeout(() => {
      stop('deadline', timeoutError('The time limit for this action has passed.'));
    }, ms);
  }
  function remainingMs(): number {
    if (cause !== undefined) return 0;
    return holds > 0 ? leftAtHold : Math.max(0, endsAt - Date.now());
  }
  function hold(): () => void {
    if (cause !== undefined || ended) return () => undefined;
    if (holds === 0) {
      leftAtHold = remainingMs();
      clearTimeout(timer);
    }
    holds += 1;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      holds -= 1;
      if (holds > 0 || cause !== undefined || ended) return;
      endsAt = Date.now() + leftAtHold;
      timer = arm(leftAtHold);
    };
  }

  let timer = arm(limitMs);
  if (cancel?.aborted) onCancel();
  else cancel?.addEventListener('abort', onCancel, { once: true });

  return {
    signal: controller.signal,
    remainingMs,
    stoppedBy: () => cause,
    hold,
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
