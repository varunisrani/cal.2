/**
 * A scripted stand-in for the browser's `fetch`, for unit tests of the AI layer and Coach
 * (P03-02). A test queues replies per URL pattern, passes `fake.fetch` to the code under test in
 * place of the real one, and reads back what was sent from `fake.requests`. Delays run on fake
 * timers (`src/test/time.ts`), an `AbortSignal` stops a request at any point with the signal's
 * reason, and a request nobody queued a reply for fails the running test.
 */
import { onTestFinished } from 'vitest';

/** The shape of `fetch` the AI layer takes (the browser's own fits it). */
export type FetchFunction = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export interface ReplyTiming {
  /** Milliseconds (of fake time) before the reply arrives. */
  readonly delayMs?: number;
}

export interface ReplyInit extends ReplyTiming {
  /** 200 by default; any status from 200 to 599. */
  readonly status?: number;
  readonly headers?: Readonly<Record<string, string>>;
  /** Milliseconds between the response arriving and its body arriving. */
  readonly bodyDelayMs?: number;
}

/** One scripted outcome of a request: a response, or the browser's opaque network failure. */
export type FakeReply =
  | {
      readonly type: 'response';
      readonly status: number;
      readonly headers: Readonly<Record<string, string>>;
      readonly body: string;
      readonly delayMs: number;
      readonly bodyDelayMs: number;
    }
  | { readonly type: 'networkFailure'; readonly delayMs: number };

/** A reply whose body is `body` as JSON. */
export function jsonReply(body: unknown, init: ReplyInit = {}): FakeReply {
  return response(JSON.stringify(body), 'application/json', init);
}

/** A reply whose body is `text` as it is (plain-text and HTML error pages, broken JSON). */
export function textReply(text: string, init: ReplyInit = {}): FakeReply {
  return response(text, 'text/plain; charset=utf-8', init);
}

/** The request fails without a reply: a `TypeError`, as a browser reports CORS, DNS or offline. */
export function networkFailure(timing: ReplyTiming = {}): FakeReply {
  return { type: 'networkFailure', delayMs: checkedDelay(timing.delayMs) };
}

function response(body: string, contentType: string, init: ReplyInit): FakeReply {
  const status = init.status ?? 200;
  if (!Number.isInteger(status) || status < 200 || status > 599) {
    throw new RangeError(`fakeFetch: a reply status must be 200–599, not ${status}`);
  }
  return {
    type: 'response',
    status,
    headers: { 'content-type': contentType, ...init.headers },
    body,
    delayMs: checkedDelay(init.delayMs),
    bodyDelayMs: checkedDelay(init.bodyDelayMs),
  };
}

function checkedDelay(ms: number | undefined): number {
  if (ms === undefined) return 0;
  if (!Number.isFinite(ms) || ms < 0) throw new RangeError(`fakeFetch: bad delay ${ms}`);
  return ms;
}

/** What the fake saw of one request. */
export interface RecordedRequest {
  readonly url: string;
  readonly method: string;
  /** Header names lower-cased. */
  readonly headers: Readonly<Record<string, string>>;
  /** The body parsed as JSON, else the text as sent; `undefined` when there was none. */
  readonly body: unknown;
  /** `Date.now()` when the request arrived (fake time under fake timers). */
  readonly at: number;
  readonly signal: AbortSignal | undefined;
}

export interface FakeRoute {
  /** Queues replies; requests matching this route take them in order. */
  reply(...replies: FakeReply[]): FakeRoute;
}

export interface FakeFetch {
  /** The function to hand to the code under test. */
  readonly fetch: FetchFunction;
  /** Every request that reached the fake, in order (not the ones aborted before sending). */
  readonly requests: readonly RecordedRequest[];
  /**
   * A route for URLs containing `pattern` (or matching it, for a RegExp). A request takes the
   * next reply of the first matching route that still has one.
   */
  on(pattern: string | RegExp): FakeRoute;
  /** How many queued replies were never used. */
  remaining(): number;
  /** The problems so far (unmatched or used-up requests); taking them keeps the test passing. */
  takeProblems(): string[];
}

interface Route {
  readonly matches: (url: string) => boolean;
  readonly queue: FakeReply[];
}

/** Statuses whose responses never have a body. */
const BODYLESS_STATUSES = new Set([204, 205, 304]);

export function createFakeFetch(): FakeFetch {
  const routes: Route[] = [];
  const requests: RecordedRequest[] = [];
  let problems: string[] = [];
  let failsCurrentTest = false;

  /** Keeps the problem and makes the running test fail at its end, even if the error is caught. */
  const problem = (text: string): Error => {
    problems.push(text);
    if (!failsCurrentTest) {
      try {
        onTestFinished(() => {
          failsCurrentTest = false;
          const left = problems;
          problems = [];
          if (left.length > 0) throw new Error(`fakeFetch: ${left.join('; ')}`);
        });
        failsCurrentTest = true;
      } catch {
        // Not inside a running test: the rejection below is all that can be done.
      }
    }
    return new Error(`fakeFetch: ${text}`);
  };

  const nextReply = (method: string, url: string): FakeReply | Error => {
    const matching = routes.filter((route) => route.matches(url));
    const route = matching.find((candidate) => candidate.queue.length > 0);
    if (route) return route.queue.shift()!;
    return problem(
      matching.length === 0
        ? `no reply queued for ${method} ${url}`
        : `every reply queued for ${method} ${url} is used up`,
    );
  };

  const fakeFetch: FetchFunction = (input, init = {}) => {
    const url = typeof input === 'string' ? input : 'href' in input ? input.href : undefined;
    if (url === undefined) {
      return Promise.reject(problem('pass the URL and an init object, not a Request'));
    }
    const signal = init.signal ?? undefined;
    if (signal?.aborted) return Promise.reject(abortReason(signal));
    const method = (init.method ?? 'GET').toUpperCase();
    requests.push({
      url,
      method,
      headers: headerRecord(init.headers),
      body: readBody(init.body),
      at: Date.now(),
      signal,
    });
    const reply = nextReply(method, url);
    if (reply instanceof Error) return Promise.reject(reply);
    return deliver(reply, signal);
  };

  return {
    fetch: fakeFetch,
    requests,
    on(pattern) {
      const route: Route = {
        matches: (url) => (typeof pattern === 'string' ? url.includes(pattern) : pattern.test(url)),
        queue: [],
      };
      routes.push(route);
      const handle: FakeRoute = {
        reply(...replies) {
          route.queue.push(...replies);
          return handle;
        },
      };
      return handle;
    },
    remaining: () => routes.reduce((sum, route) => sum + route.queue.length, 0),
    takeProblems() {
      const taken = problems;
      problems = [];
      return taken;
    },
  };
}

/**
 * Settles after the reply's delay, or at once without one. The timer is set before this returns,
 * so a test may move fake time right after calling `fetch`.
 */
function deliver(reply: FakeReply, signal: AbortSignal | undefined): Promise<Response> {
  return new Promise<Response>((resolve, reject) => {
    const settle = () => {
      if (reply.type === 'networkFailure') {
        reject(new TypeError('fakeFetch: scripted network failure'));
      } else {
        resolve(buildResponse(reply, signal));
      }
    };
    if (reply.delayMs === 0) {
      settle();
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      reject(abortReason(signal!));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      settle();
    }, reply.delayMs);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

function buildResponse(
  reply: Extract<FakeReply, { type: 'response' }>,
  signal: AbortSignal | undefined,
): Response {
  const init = { status: reply.status, headers: reply.headers };
  if (BODYLESS_STATUSES.has(reply.status)) return new Response(null, init);
  if (reply.bodyDelayMs === 0) return new Response(reply.body, init);
  return new Response(slowBody(reply.body, reply.bodyDelayMs, signal), init);
}

/** A body that arrives `delayMs` after the response, or errors with the abort reason first. */
function slowBody(
  text: string,
  delayMs: number,
  signal: AbortSignal | undefined,
): ReadableStream<Uint8Array> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let onAbort: (() => void) | undefined;
  return new ReadableStream<Uint8Array>({
    start(controller) {
      if (signal?.aborted) {
        controller.error(abortReason(signal));
        return;
      }
      onAbort = () => {
        clearTimeout(timer);
        controller.error(abortReason(signal!));
      };
      signal?.addEventListener('abort', onAbort, { once: true });
      timer = setTimeout(() => {
        if (onAbort) signal?.removeEventListener('abort', onAbort);
        controller.enqueue(new TextEncoder().encode(text));
        controller.close();
      }, delayMs);
    },
    cancel() {
      clearTimeout(timer);
      if (onAbort) signal?.removeEventListener('abort', onAbort);
    },
  });
}

/** What `fetch` rejects with on abort: the signal's reason (an `AbortError` by default). */
function abortReason(signal: AbortSignal): unknown {
  return signal.reason ?? new DOMException('fakeFetch: aborted', 'AbortError');
}

function headerRecord(headers: HeadersInit | undefined): Record<string, string> {
  const record: Record<string, string> = {};
  new Headers(headers).forEach((value, name) => {
    record[name] = value;
  });
  return record;
}

function readBody(body: BodyInit | null | undefined): unknown {
  if (body === undefined || body === null) return undefined;
  if (typeof body !== 'string') return body;
  try {
    return JSON.parse(body) as unknown;
  } catch {
    return body;
  }
}
