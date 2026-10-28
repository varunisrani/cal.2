/**
 * A scripted `fetch` for unit tests. The test injects `fake.fetch` into the code under test (the
 * global `fetch` is never read, replaced or stubbed), lists the replies per URL pattern in the
 * order they should come, then reads back what was sent. Delays run on the test's timers, so
 * fake time drives them. A request the script does not cover fails the test, even when the code
 * under test catches the rejection.
 */
import { onTestFinished } from 'vitest';

export interface FakeReply {
  /** HTTP status, 200 to 599 (default 200). */
  readonly status?: number;
  readonly headers?: Readonly<Record<string, string>>;
  /** A body sent as JSON text (content type application/json unless `headers` set one). */
  readonly json?: unknown;
  /** A body sent as it is (content type text/plain unless `headers` set one). */
  readonly text?: string;
  /** Wait this long before the reply's headers arrive. */
  readonly delayMs?: number;
  /** Then wait this long before its body arrives (an abort meanwhile fails the body read). */
  readonly bodyDelayMs?: number;
  /**
   * A body sent in pieces, each after its own wait (a stream; content type text/event-stream
   * unless `headers` set one). An abort meanwhile fails the read; a `fail` piece breaks the
   * connection there, as a network failure mid-body does.
   */
  readonly chunks?: readonly FakeChunk[];
}

/** One piece of a body sent in pieces. */
export interface FakeChunk {
  /** Wait this long after the headers or the piece before. */
  readonly delayMs?: number;
  /** The piece's text. */
  readonly text?: string;
  /** The connection breaks here: the read fails with a TypeError. */
  readonly fail?: 'network';
}

/** No reply at all: rejects with a TypeError, as a browser does for network and CORS failures. */
export interface FakeNetworkFailure {
  readonly fail: 'network';
  readonly delayMs?: number;
}

export type FakeStep = FakeReply | FakeNetworkFailure;

/** A string matches a URL equal to it or starting with it; a RegExp is tested on the URL. */
export type UrlPattern = string | RegExp;

export interface RecordedRequest {
  readonly url: string;
  readonly method: string;
  /** Header names in lower case. */
  readonly headers: Readonly<Record<string, string>>;
  /** The body parsed as JSON when it is JSON text, else as sent; undefined without a body. */
  readonly body: unknown;
  readonly signal: AbortSignal | undefined;
}

export interface FakeFetch {
  /** The function to inject wherever the code under test takes a `fetch`. */
  readonly fetch: typeof fetch;
  /** Queues replies for URLs matching `pattern`; the first route that matches takes a request. */
  on(pattern: UrlPattern, ...steps: readonly FakeStep[]): FakeFetch;
  /** Every request made, oldest first, including ones that were aborted or unscripted. */
  readonly requests: readonly RecordedRequest[];
  /** How many queued steps have not been used yet. */
  pending(): number;
  /**
   * The messages of unscripted requests so far, which are then forgotten: a test that expects
   * one takes it here instead of failing.
   */
  takeUnscripted(): readonly string[];
}

interface Route {
  readonly pattern: UrlPattern;
  readonly steps: FakeStep[];
}

type MutableRequest = { -readonly [K in keyof RecordedRequest]: RecordedRequest[K] };

const NO_BODY_STATUSES: ReadonlySet<number> = new Set([204, 205, 304]);

export function fakeFetch(): FakeFetch {
  const routes: Route[] = [];
  const requests: RecordedRequest[] = [];
  const unscriptedMessages: string[] = [];

  const unscripted = (problem: string): never => {
    const message = `fakeFetch: ${problem}. Scripted patterns: ${
      routes.map((route) => String(route.pattern)).join(', ') || 'none'
    }.`;
    unscriptedMessages.push(message);
    try {
      // Fails the test once it ends, whatever the code under test did with the rejection.
      onTestFinished(() => {
        const left = unscriptedMessages.splice(0);
        if (left.length > 0) throw new Error(left.join('\n'));
      });
    } catch {
      // Not inside a running test: the rejection below is all we can do.
    }
    throw new Error(message);
  };

  const fetchImpl = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const request = typeof input === 'string' || 'href' in input ? undefined : input;
    const url = typeof input === 'string' ? input : 'href' in input ? input.href : input.url;
    const method = (init?.method ?? request?.method ?? 'GET').toUpperCase();
    const signal = init?.signal ?? request?.signal ?? undefined;
    const record: MutableRequest = {
      url,
      method,
      headers: headerRecord(init?.headers ?? request?.headers),
      body: init?.body === undefined || init.body === null ? undefined : readBody(init.body),
      signal,
    };
    requests.push(record);
    if (init?.body === undefined && request && request.body !== null) {
      record.body = readBody(await request.clone().text());
    }

    // A browser never sends a request whose signal is already aborted.
    if (signal?.aborted) throw signal.reason;
    const route = routes.find((candidate) => matches(candidate.pattern, url));
    if (!route) return unscripted(`no route matches ${method} ${url}`);
    const step = route.steps.shift();
    if (!step) {
      return unscripted(`no reply left for ${method} ${url} (route ${String(route.pattern)})`);
    }

    await pause(step.delayMs ?? 0, signal);
    if ('fail' in step) throw new TypeError('fakeFetch: scripted network failure');
    return buildResponse(step, signal);
  };

  const fake: FakeFetch = {
    fetch: fetchImpl,
    on(pattern, ...steps) {
      steps.forEach(checkStep);
      const existing = routes.find((route) => samePattern(route.pattern, pattern));
      if (existing) existing.steps.push(...steps);
      else routes.push({ pattern, steps: [...steps] });
      return fake;
    },
    requests,
    pending: () => routes.reduce((sum, route) => sum + route.steps.length, 0),
    takeUnscripted: () => unscriptedMessages.splice(0),
  };
  return fake;
}

function matches(pattern: UrlPattern, url: string): boolean {
  if (typeof pattern === 'string') return url.startsWith(pattern);
  pattern.lastIndex = 0;
  return pattern.test(url);
}

function samePattern(a: UrlPattern, b: UrlPattern): boolean {
  if (typeof a === 'string' || typeof b === 'string') return a === b;
  return String(a) === String(b);
}

function checkStep(step: FakeStep): void {
  const pieceDelays = 'chunks' in step ? (step.chunks ?? []).map((chunk) => chunk.delayMs) : [];
  for (const ms of [step.delayMs, 'fail' in step ? undefined : step.bodyDelayMs, ...pieceDelays]) {
    if (ms !== undefined && !(Number.isFinite(ms) && ms >= 0)) {
      throw new RangeError(`fakeFetch: a delay must be a finite number ≥ 0, got ${ms}`);
    }
  }
  if ('fail' in step) return;
  const status = step.status ?? 200;
  if (!Number.isInteger(status) || status < 200 || status > 599) {
    throw new RangeError(`fakeFetch: status must be 200 to 599, got ${status}`);
  }
  if ('json' in step && step.text !== undefined) {
    throw new TypeError('fakeFetch: a reply has either json or text, not both');
  }
  if ('json' in step && step.json === undefined) {
    throw new TypeError('fakeFetch: json: undefined is not JSON (leave json out for no body)');
  }
  if (
    step.chunks !== undefined &&
    ('json' in step || step.text !== undefined || step.bodyDelayMs)
  ) {
    throw new TypeError('fakeFetch: a reply sent in chunks has no json, text or bodyDelayMs');
  }
}

function headerRecord(headers: HeadersInit | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  new Headers(headers).forEach((value, name) => {
    out[name] = value;
  });
  return out;
}

function readBody(body: BodyInit): unknown {
  if (typeof body !== 'string') return body;
  try {
    return JSON.parse(body) as unknown;
  } catch {
    return body;
  }
}

/** Waits `ms` on the timers (fake ones in tests); an abort rejects at once with its reason. */
function pause(ms: number, signal: AbortSignal | undefined): Promise<void> {
  if (signal?.aborted) return Promise.reject(signal.reason);
  if (ms === 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const onAbort = (): void => {
      clearTimeout(timer);
      reject(signal?.reason);
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

function buildResponse(reply: FakeReply, signal: AbortSignal | undefined): Response {
  const status = reply.status ?? 200;
  const headers = new Headers(reply.headers);
  let text: string | undefined;
  if ('json' in reply) {
    text = JSON.stringify(reply.json);
    if (!headers.has('content-type')) headers.set('content-type', 'application/json');
  } else if (reply.text !== undefined) {
    text = reply.text;
    if (!headers.has('content-type')) headers.set('content-type', 'text/plain;charset=UTF-8');
  }
  if (NO_BODY_STATUSES.has(status)) return new Response(null, { status, headers });
  if (reply.chunks !== undefined) {
    if (!headers.has('content-type')) headers.set('content-type', 'text/event-stream');
    return new Response(chunkedBody(reply.chunks, signal), { status, headers });
  }
  const body = reply.bodyDelayMs ? slowBody(text ?? '', reply.bodyDelayMs, signal) : (text ?? '');
  return new Response(body, { status, headers });
}

/**
 * A body that arrives in pieces, each after its wait once the reader asks for it (as a network
 * hands over bytes); an abort fails the read with the abort reason, a `fail` piece with a
 * TypeError once the pieces before it were read. The reader cancelling it stops the pieces.
 */
function chunkedBody(
  chunks: readonly FakeChunk[],
  signal: AbortSignal | undefined,
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let next = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let onAbort: (() => void) | undefined;
  const stopListening = (): void => {
    clearTimeout(timer);
    if (onAbort) signal?.removeEventListener('abort', onAbort);
  };
  return new ReadableStream<Uint8Array>(
    {
      start(controller) {
        if (signal?.aborted) {
          controller.error(signal.reason);
          return;
        }
        onAbort = (): void => {
          stopListening();
          controller.error(signal?.reason);
        };
        signal?.addEventListener('abort', onAbort, { once: true });
      },
      pull(controller) {
        const chunk = chunks[next];
        if (chunk === undefined) {
          stopListening();
          controller.close();
          return undefined;
        }
        next += 1;
        const deliver = (): void => {
          if (chunk.fail === 'network') {
            stopListening();
            controller.error(new TypeError('fakeFetch: scripted network failure mid-body'));
          } else if (chunk.text !== undefined && chunk.text !== '') {
            controller.enqueue(encoder.encode(chunk.text));
          }
        };
        // A piece without a wait goes at once: fake timers need no advance for it.
        if (!chunk.delayMs) {
          deliver();
          return undefined;
        }
        return new Promise<void>((resolve) => {
          timer = setTimeout(() => {
            deliver();
            resolve();
          }, chunk.delayMs);
        });
      },
      cancel() {
        stopListening();
      },
    },
    { highWaterMark: 0 },
  );
}

/** A body that arrives after `ms`; an abort before then fails the read with the abort reason. */
function slowBody(
  text: string,
  ms: number,
  signal: AbortSignal | undefined,
): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      const onAbort = (): void => {
        clearTimeout(timer);
        controller.error(signal?.reason);
      };
      const timer = setTimeout(() => {
        signal?.removeEventListener('abort', onAbort);
        controller.enqueue(new TextEncoder().encode(text));
        controller.close();
      }, ms);
      signal?.addEventListener('abort', onAbort, { once: true });
    },
  });
}
