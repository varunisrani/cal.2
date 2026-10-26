/**
 * The one place that calls `fetch` for AI (lint rule 3). `send` makes a single attempt inside the
 * action's deadline, with its own time cap on top, reads the whole reply as text and hands back
 * the status with it; judging the status is left to the retry ladder and the adapters. Anything
 * thrown on the way becomes an `AiFailure` (spec 03 §3.9, §3.15 items 4 and 6). Nothing here is
 * ever logged: headers carry keys, bodies carry photos and provider text.
 */
import type { Deadline } from './deadline';
import { AiFailureError, fromNetwork } from './errors';

/** The `fetch` the transport uses; the browser's own fits, and tests pass a scripted one. */
export type Fetcher = (url: string, init: RequestInit) => Promise<Response>;

/** One HTTP reply, read to the end. */
export interface WireReply {
  readonly status: number;
  /** Any 2xx (R03.26): 204 and 299 count as much as 200. */
  readonly ok: boolean;
  /** The body as text; empty when there was none. */
  readonly text: string;
}

export interface SendOptions {
  /** The action's deadline; the attempt stops when it does. */
  readonly deadline: Deadline;
  /** Longest one attempt may take; leave it out to give the attempt all the budget left. */
  readonly attemptCapMs?: number;
  /** The provider called (catalogue id), for the refused-key hint of a lost connection (R03.2). */
  readonly provider?: string;
  /** Whether the request carries a key, for the same hint. */
  readonly keySent?: boolean;
  /** Defaults to the browser's `fetch`. */
  readonly fetch?: Fetcher;
}

/** The cap of one attempt at a cloud provider (D-16.60). */
export const CLOUD_ATTEMPT_CAP_MS = 75_000;

/**
 * The attempt cap for a provider's kind of endpoint: fixed cloud providers get 75 s; a server the
 * person runs (Ollama, Custom) may be slow on purpose and gets the remaining budget (D-16.60).
 */
export function attemptCapFor(endpoint: 'fixed' | 'userServer'): number | undefined {
  return endpoint === 'fixed' ? CLOUD_ATTEMPT_CAP_MS : undefined;
}

/**
 * A wrapper rather than the global itself: a browser `fetch` called as a method of another object
 * fails with "Illegal invocation".
 */
const browserFetch: Fetcher = (url, init) => fetch(url, init);

/**
 * Sends one request and reads its reply. Resolves with any HTTP reply, success or not; rejects
 * with an `AiFailureError` (cancelled, timeout, offline or connection) when no whole reply came.
 */
export async function send(
  url: string,
  init: Omit<RequestInit, 'signal'>,
  options: SendOptions,
): Promise<WireReply> {
  const { deadline, attemptCapMs, provider, keySent } = options;
  const fetcher = options.fetch ?? browserFetch;
  deadline.throwIfStopped();

  const attempt = new AbortController();
  let capped = false;
  const onStop = () => attempt.abort(deadline.signal.reason);
  deadline.signal.addEventListener('abort', onStop, { once: true });
  const cap =
    attemptCapMs === undefined
      ? undefined
      : setTimeout(() => {
          capped = true;
          attempt.abort(new DOMException('One AI attempt took too long.', 'TimeoutError'));
        }, attemptCapMs);

  try {
    const response = await fetcher(url, { ...init, signal: attempt.signal });
    // Read inside the attempt, so a cancel or a cap during a slow body still ends the call.
    const text = await response.text();
    return { status: response.status, ok: isSuccess(response.status), text };
  } catch (error) {
    const stoppedBy = deadline.stoppedBy ?? (capped ? 'deadline' : undefined);
    throw new AiFailureError(fromNetwork(error, { stoppedBy, provider, keySent }));
  } finally {
    clearTimeout(cap);
    deadline.signal.removeEventListener('abort', onStop);
  }
}

function isSuccess(status: number): boolean {
  return status >= 200 && status <= 299;
}
