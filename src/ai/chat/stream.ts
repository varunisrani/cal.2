/**
 * Sending a Coach round that may come back as a stream (D-16.106). It is `transport.send` for
 * replies that arrive in pieces, kept with the chat code so it loads with the Coach and not at
 * start-up; it calls only the `fetch` it is given (the browser's by default, from the transport).
 *
 * Until the first byte of a successful `text/event-stream` answer arrives, the request runs under
 * the action's deadline and its attempt cap exactly as `send` does. From then on the deadline is
 * held, so a long reply that keeps coming is never cut for its length, and the attempt cap
 * measures silence instead: every piece read starts it again, and a stream that goes quiet for
 * longer fails as `timeout`. The cap is the one the attempt started with: at most 75 s for a cloud
 * provider, what was left of the time limit for a server the person runs (D-16.60). Cancel stops it at any point, silently. Any other answer (an error
 * status, JSON, a body without a stream) is read whole, as `send` would. The events go to
 * `onEvent` as they arrive; it returns false when it needs no more, and the rest is not read. A
 * stream broken off by the network fails like any request that got no reply.
 */
import { fromNetwork, type SingleFailure } from '../errors';
import { timeoutError, type Deadline, type StopCause } from '../deadline';
import { browserFetch, isSuccess, type Reply, type SendInit, type SendOptions } from '../transport';
import { err, ok, type Result } from '../../lib/result';
import { readEvents, type SseEvent } from './sse';

/** Takes one event; false when the reply needs no more. */
export type EventSink = (event: SseEvent) => boolean;

/** Whether an answer says it is a stream of server-sent events. */
export function isEventStream(response: Pick<Response, 'headers'>): boolean {
  return (response.headers.get('content-type') ?? '').toLowerCase().includes('text/event-stream');
}

/**
 * Sends one request; a streamed answer's events go to `onEvent` and the reply comes back with
 * `streamed` set and an empty body. Everything else is as `transport.send`.
 */
export async function sendStreamed(
  url: string,
  init: SendInit,
  deadline: Deadline,
  attemptCapMs: number,
  onEvent: EventSink,
  options: SendOptions = {},
): Promise<Result<Reply, SingleFailure>> {
  const { provider, keySent } = options;
  const fetchImpl = options.fetch ?? browserFetch;
  const attempt = new AbortController();
  let cause: StopCause | undefined;
  let release: (() => void) | undefined;

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
  // Before the first byte: the deadline covers a cap that is not shorter than the time left.
  let timer =
    attemptCapMs < deadline.remainingMs()
      ? setTimeout(() => stop('deadline', timeoutError('The attempt took too long.')), attemptCapMs)
      : undefined;

  /**
   * A piece arrived: the deadline is held from the first one, and the silence starts over; each
   * silence may last as long as the attempt could wait for its first byte.
   */
  const onBytes = (): void => {
    release ??= deadline.hold();
    clearTimeout(timer);
    timer = setTimeout(
      () => stop('deadline', timeoutError('The reply went quiet for too long.')),
      attemptCapMs,
    );
  };

  try {
    // No Referer: a provider has no need to learn which page sent the request (S-12).
    const response = await fetchImpl(url, {
      ...init,
      referrerPolicy: 'no-referrer',
      signal: attempt.signal,
    });
    if (!isSuccess(response.status) || response.body === null || !isEventStream(response)) {
      const body = await response.text();
      return ok({ status: response.status, ok: isSuccess(response.status), body });
    }
    for await (const event of readEvents(response.body, onBytes)) {
      if (!onEvent(event)) break;
    }
    return ok({ status: response.status, ok: true, body: '', streamed: true });
  } catch (error) {
    return err(fromNetwork(error, { stoppedBy: cause, provider, keySent }));
  } finally {
    clearTimeout(timer);
    release?.();
    deadline.signal.removeEventListener('abort', onDeadline);
  }
}
