/**
 * The one place that calls `fetch` for AI (the P00-07 lint allows only this file). A request
 * runs under the action's deadline plus its own attempt cap (D-16.60), any 2xx is a success
 * (R03.26), the body is read as text for the adapters and the classifier, and a request that got
 * no reply becomes one failure kind (R03.2, R03.6). Requests carry no Referer (S-12). Headers and
 * bodies are never logged: they carry keys and the person's food.
 */
import { timeoutError, type Deadline, type StopCause } from './deadline';
import { fromNetwork, type SingleFailure } from './errors';
import { err, ok, type Result } from '../lib/result';

/** A provider's reply, read to the end. */
export interface Reply {
  readonly status: number;
  /** True for every 2xx status, 204 and 299 included (R03.26). */
  readonly ok: boolean;
  /** The body as text; empty when there is none, or when it came as a stream. */
  readonly body: string;
  /** The body came as server-sent events and went to the reader as it arrived (D-16.106). */
  readonly streamed?: boolean;
}

/** A request without a signal: `send` owns it. */
export type SendInit = Omit<RequestInit, 'signal'>;

export interface SendOptions {
  /** The `fetch` to call; the browser's by default. Tests pass `fakeFetch().fetch`. */
  readonly fetch?: typeof fetch;
  /** The provider id and whether a key went along, for the refused-key hint (R03.2). */
  readonly provider?: string;
  readonly keySent?: boolean;
}

/** Whether a status is a success: any 2xx (R03.26). */
export function isSuccess(status: number): boolean {
  return status >= 200 && status <= 299;
}

/**
 * Sends one request and reads its reply. It stops when the deadline stops or after
 * `attemptCapMs` (from `attemptCapMs()` in deadline.ts), whichever is first; a stop or a failure
 * before the whole body arrived is returned as a failure: `cancelled` for Cancel, `timeout` for
 * either limit, else `offline` or `connection`. An error status is a reply, not a failure: the
 * retry ladder and the classifier read it.
 */
export async function send(
  url: string,
  init: SendInit,
  deadline: Deadline,
  attemptCapMs: number,
  options: SendOptions = {},
): Promise<Result<Reply, SingleFailure>> {
  const { provider, keySent } = options;
  const fetchImpl = options.fetch ?? browserFetch;
  const attempt = new AbortController();
  let cause: StopCause | undefined;

  const stop = (why: StopCause, reason: unknown): void => {
    if (cause !== undefined) return;
    cause = why;
    attempt.abort(reason);
  };
  const onDeadline = (): void => stop(deadline.stoppedBy() ?? 'deadline', deadline.signal.reason);

  if (deadline.signal.aborted) {
    return err(fromNetwork(deadline.signal.reason, { stoppedBy: deadline.stoppedBy() }));
  }
  deadline.signal.addEventListener('abort', onDeadline, { once: true });
  // The deadline covers a cap that is not shorter than the time left.
  const timer =
    attemptCapMs < deadline.remainingMs()
      ? setTimeout(() => stop('deadline', timeoutError('The attempt took too long.')), attemptCapMs)
      : undefined;

  try {
    // No Referer: a provider has no need to learn which page sent the request (S-12).
    const response = await fetchImpl(url, {
      ...init,
      referrerPolicy: 'no-referrer',
      signal: attempt.signal,
    });
    const body = await response.text();
    return ok({ status: response.status, ok: isSuccess(response.status), body });
  } catch (error) {
    return err(fromNetwork(error, { stoppedBy: cause, provider, keySent }));
  } finally {
    clearTimeout(timer);
    deadline.signal.removeEventListener('abort', onDeadline);
  }
}

/**
 * The browser's `fetch`, called as a plain function so it never gets the wrong `this`. The
 * composition root hands it to the services that take a `fetch` (they never use the global).
 */
export function browserFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  return fetch(input, init);
}
