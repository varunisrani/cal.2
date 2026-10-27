/**
 * One request to a food database, shared by the Open Food Facts and FoodData Central clients. The
 * request and the reading of its reply run under our own time limit and the person's Cancel; a
 * failure on the way is one of four kinds. Headers and bodies are never logged: the FoodData
 * Central key travels in a header.
 */
import { deviceOnline } from '../../ai/errors';
import { err, ok, type Result } from '../../lib/result';

/** Why a request got no usable reply. `cancelled` is the person's own Cancel and is never shown. */
export type NetworkFailure = 'offline' | 'timeout' | 'network' | 'cancelled';

export interface RequestDeps {
  /** The `fetch` to call; tests pass `fakeFetch().fetch`. */
  readonly fetch: typeof fetch;
  /** The person's Cancel for this lookup. */
  readonly signal?: AbortSignal;
}

/** A request without a signal: `fetchWithin` owns it. */
export type RequestSetup = Omit<RequestInit, 'signal'>;

/**
 * Sends one request and hands the response to `read`, all within `limitMs`. The time limit gives
 * `timeout`, the person's Cancel `cancelled` (also when it came first), any other failure
 * `offline` when the device says so and `network` otherwise. An error status is a reply, not a
 * failure: `read` sees it.
 */
export async function fetchWithin<T>(
  url: string,
  setup: RequestSetup,
  deps: RequestDeps,
  limitMs: number,
  read: (response: Response) => Promise<T>,
): Promise<Result<T, NetworkFailure>> {
  const cancel = deps.signal;
  if (cancel?.aborted) return err('cancelled');

  const controller = new AbortController();
  let stoppedBy: 'cancel' | 'limit' | undefined;
  const stop = (cause: 'cancel' | 'limit', reason: unknown): void => {
    if (stoppedBy !== undefined) return;
    stoppedBy = cause;
    controller.abort(reason);
  };
  const onCancel = (): void => stop('cancel', cancel?.reason);
  cancel?.addEventListener('abort', onCancel, { once: true });
  const timer = setTimeout(
    () => stop('limit', new DOMException('The food database took too long.', 'TimeoutError')),
    limitMs,
  );

  try {
    // No Referer: the database has no need to learn which page sent the request (S-12).
    const response = await deps.fetch(url, {
      ...setup,
      referrerPolicy: 'no-referrer',
      signal: controller.signal,
    });
    return ok(await read(response));
  } catch (error) {
    return err(failureOf(error, stoppedBy));
  } finally {
    clearTimeout(timer);
    cancel?.removeEventListener('abort', onCancel);
  }
}

function failureOf(error: unknown, stoppedBy: 'cancel' | 'limit' | undefined): NetworkFailure {
  if (stoppedBy === 'cancel') return 'cancelled';
  if (stoppedBy === 'limit') return 'timeout';
  const name = typeof error === 'object' && error !== null && 'name' in error ? error.name : '';
  if (name === 'TimeoutError') return 'timeout';
  if (name === 'AbortError') return 'cancelled';
  return deviceOnline() ? 'network' : 'offline';
}

/** A response's status and its body as text. */
export interface TextReply {
  readonly status: number;
  readonly body: string;
}

/** The `read` for a JSON API: the status and the whole body as text. */
export async function readTextReply(response: Response): Promise<TextReply> {
  return { status: response.status, body: await response.text() };
}

/** True for every 2xx status. */
export function isSuccess(status: number): boolean {
  return status >= 200 && status <= 299;
}
