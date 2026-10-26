/**
 * The retry ladder (spec 03 §3.9, D-16.23): one for every wire format and every entry point.
 * Only a provider that says it is busy is asked again, after 1 s, 2 s and 4 s, so four tries at
 * most; its `Retry-After` hint is ignored. Any other status fails at once, and a try that got no
 * reply (offline, our cap, our deadline, Cancel) is never repeated. Every wait sits inside the
 * action's deadline. When the tries run out, the failure is read from the last reply, so details
 * that only its body carries, such as Gemini's per-day quota, decide the kind (R03.18).
 */
import { AiFailureError, classify } from './errors';
import { send, type SendOptions, type WireReply } from './transport';

/** The waits before the second, third and fourth try. */
export const RETRY_WAITS_MS: readonly number[] = [1_000, 2_000, 4_000];

/** Too many requests, unavailable, overloaded. */
const BUSY_STATUSES: ReadonlySet<number> = new Set([429, 503, 529]);

/**
 * Sends through the transport until a 2xx reply comes back, retrying busy replies. Rejects with an
 * `AiFailureError`: the kind of the last reply, or the transport's failure as it was.
 */
export async function sendWithRetry(
  url: string,
  init: Omit<RequestInit, 'signal'>,
  options: SendOptions,
): Promise<WireReply> {
  const { deadline } = options;
  for (let tries = 0; ; tries += 1) {
    const reply = await send(url, init, options);
    if (reply.ok) return reply;

    const wait = RETRY_WAITS_MS[tries];
    const busy = BUSY_STATUSES.has(reply.status);
    // A wait that would reach the end of the budget leaves no time for the next try.
    if (!busy || wait === undefined || wait >= deadline.remainingMs()) throw lastFailure(reply);

    const stoppedBy = await deadline.pause(wait);
    if (stoppedBy === 'cancel') throw new AiFailureError({ kind: 'cancelled' });
    if (stoppedBy === 'deadline') throw lastFailure(reply);
  }
}

function lastFailure(reply: WireReply): AiFailureError {
  return new AiFailureError(classify(reply.status, reply.text));
}
