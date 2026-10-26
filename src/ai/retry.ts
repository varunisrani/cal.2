/**
 * The retry ladder (03 §3.9, D-16.23). A provider that is busy for a moment (429 rate limited,
 * 503 unavailable, 529 overloaded) is asked again after 1 s, 2 s and 4 s: at most four requests,
 * on every wire format and every entry point. Nothing else is repeated: another error status
 * would fail the same way, and a request that got no reply (offline, our time limit, Cancel) is
 * not resent. `Retry-After` is ignored. The ladder stays inside the action's deadline, and the
 * last error reply is classified from its own status and body, so a daily quota that only the
 * body names survives the retries (R03.18).
 */
import type { Deadline } from './deadline';
import { fromNetwork, fromReply, type ReplyContext, type SingleFailure } from './errors';
import type { Reply } from './transport';
import { err, type Result } from '../lib/result';

/** The waits before the second, third and fourth request. */
export const RETRY_WAITS_MS: readonly number[] = [1_000, 2_000, 4_000];

const RETRY_STATUSES: ReadonlySet<number> = new Set([429, 503, 529]);

/** Whether an error status is worth asking again: 429, 503 or 529. */
export function isRetryStatus(status: number): boolean {
  return RETRY_STATUSES.has(status);
}

/**
 * Runs `attempt` (one `send`) until it gives a 2xx reply, which is returned. A failure without a
 * reply is returned as it is. An error reply is retried only for 429, 503 and 529, and only
 * while the next wait ends before the deadline; otherwise it becomes a failure classified from
 * that reply, its detail redacted with `context.secrets`. Cancel during a wait stops at once.
 */
export async function withRetries(
  attempt: () => Promise<Result<Reply, SingleFailure>>,
  deadline: Deadline,
  context: ReplyContext = {},
): Promise<Result<Reply, SingleFailure>> {
  for (let tried = 0; ; tried += 1) {
    if (deadline.signal.aborted) return err(stopFailure(deadline));
    const result = await attempt();
    if (!result.ok || result.value.ok) return result;

    const { status, body } = result.value;
    const waitMs = RETRY_WAITS_MS[tried];
    if (!isRetryStatus(status) || waitMs === undefined || waitMs >= deadline.remainingMs()) {
      return err(fromReply(status, body, context));
    }
    if (!(await wait(waitMs, deadline.signal))) return err(stopFailure(deadline));
  }
}

/** The failure for an action the deadline stopped: cancelled for Cancel, else timeout. */
function stopFailure(deadline: Deadline): SingleFailure {
  return fromNetwork(deadline.signal.reason, { stoppedBy: deadline.stoppedBy() ?? 'deadline' });
}

/** Resolves true after `ms`, or false at once when `signal` aborts first. */
function wait(ms: number, signal: AbortSignal): Promise<boolean> {
  return new Promise((resolve) => {
    const onAbort = (): void => {
      clearTimeout(timer);
      resolve(false);
    };
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve(true);
    }, ms);
    signal.addEventListener('abort', onAbort, { once: true });
  });
}
