import { beforeEach, describe, expect, it, vi } from 'vitest';
import { advanceAsync, useFakeTime } from '../../test/time';
import { startDeadline } from '../deadline';
import { fakeFetch, type FakeStep } from '../testing/fakeFetch';
import { openAiTextStream, sseEvent, streamOf } from '../testing/streamWire';
import { openAiAnswer } from '../testing/wire';
import type { SseEvent } from './sse';
import { isEventStream, sendStreamed } from './stream';

const START = '2026-10-29T09:00:00Z';
const CHAT = 'https://chat.example.test/v1/chat/completions';
const REQUEST = { method: 'POST', body: '{"stream":true}' };

/** Tracks whether a promise has settled, without waiting for it. */
function watch<T>(promise: Promise<T>): { settled: () => boolean } {
  let done = false;
  promise.then(
    () => (done = true),
    () => (done = true),
  );
  return { settled: () => done };
}

/** One event per piece, `gapMs` apart. */
function pieces(count: number, gapMs: number): FakeStep {
  return {
    chunks: Array.from({ length: count }, (_, n) => ({
      text: sseEvent({ n }),
      delayMs: gapMs,
    })),
  };
}

function setup(step: FakeStep, timeoutSeconds = 180) {
  const cancel = new AbortController();
  const deadline = startDeadline({ timeoutSeconds, cancel: cancel.signal });
  const fake = fakeFetch().on(CHAT, step);
  const events: SseEvent[] = [];
  const sink = (event: SseEvent): boolean => {
    events.push(event);
    return true;
  };
  return { fake, deadline, cancel, events, sink };
}

beforeEach(() => {
  useFakeTime(START);
});

describe('sendStreamed: a streamed answer (D-16.106)', () => {
  it('hands each event over as it arrives and ends with an empty, streamed reply', async () => {
    const { fake, deadline, events, sink } = setup(pieces(3, 1_000));
    const sending = sendStreamed(CHAT, REQUEST, deadline, 75_000, sink, { fetch: fake.fetch });

    await advanceAsync(1_000);
    expect(events.map((event) => event.data)).toEqual(['{"n":0}']);
    await advanceAsync(1_000);
    expect(events).toHaveLength(2);
    await advanceAsync(1_000);
    expect(await sending).toEqual({
      ok: true,
      value: { status: 200, ok: true, body: '', streamed: true },
    });
    expect(events).toHaveLength(3);
    expect(fake.requests[0]?.body).toEqual({ stream: true });
    deadline.end();
  });

  it('is not cut by the time limit while pieces keep coming, which then counts on', async () => {
    // A 30 s limit; ten pieces 20 s apart: 200 s of reply.
    const { fake, deadline, events, sink } = setup(pieces(10, 20_000), 30);
    const sending = sendStreamed(CHAT, REQUEST, deadline, 75_000, sink, { fetch: fake.fetch });

    await advanceAsync(20_000);
    expect(deadline.remainingMs()).toBe(10_000);
    await advanceAsync(180_000);
    expect((await sending).ok).toBe(true);
    expect(events).toHaveLength(10);
    expect(deadline.remainingMs()).toBe(10_000);
    await advanceAsync(4_000);
    expect(deadline.remainingMs()).toBe(6_000);
    deadline.end();
  });

  it('stops as timeout when the stream goes quiet for longer than the cap', async () => {
    const step: FakeStep = {
      chunks: [{ text: sseEvent('one') }, { text: sseEvent('two'), delayMs: 75_001 }],
    };
    const { fake, deadline, events, sink } = setup(step);
    const sending = watch(
      sendStreamed(CHAT, REQUEST, deadline, 75_000, sink, { fetch: fake.fetch }),
    );

    await advanceAsync(74_999);
    expect(sending.settled()).toBe(false);
    await advanceAsync(1);
    expect(sending.settled()).toBe(true);
    expect(events.map((event) => event.data)).toEqual(['one']);
    expect(fake.requests[0]?.signal?.aborted).toBe(true);
    deadline.end();
  });

  it('lets each silence last as long as the attempt’s cap, not what was left at the first piece', async () => {
    // A 30 s limit, so a 30 s cap: the first piece at 20 s, then silences of 29 s and 31 s.
    const step: FakeStep = {
      chunks: [
        { text: sseEvent('one'), delayMs: 20_000 },
        { text: sseEvent('two'), delayMs: 29_000 },
        { text: sseEvent('three'), delayMs: 31_000 },
      ],
    };
    const { fake, deadline, events, sink } = setup(step, 30);
    const result = sendStreamed(CHAT, REQUEST, deadline, 30_000, sink, { fetch: fake.fetch });
    await advanceAsync(80_000);
    expect(await result).toEqual({ ok: false, error: { kind: 'timeout' } });
    expect(events.map((event) => event.data)).toEqual(['one', 'two']);
    expect(deadline.stoppedBy()).toBeUndefined();
    deadline.end();
  });

  it('counts the wait for the first piece under the time limit, as before', async () => {
    const { fake, deadline, sink } = setup(
      { chunks: [{ text: sseEvent('late'), delayMs: 31_000 }] },
      30,
    );
    const result = sendStreamed(CHAT, REQUEST, deadline, 75_000, sink, { fetch: fake.fetch });
    await advanceAsync(30_000);
    expect(await result).toEqual({ ok: false, error: { kind: 'timeout' } });
    expect(deadline.stoppedBy()).toBe('deadline');
  });

  it('stops silently on Cancel in the middle of a stream', async () => {
    const { fake, deadline, cancel, events, sink } = setup(pieces(5, 1_000));
    const result = sendStreamed(CHAT, REQUEST, deadline, 75_000, sink, { fetch: fake.fetch });
    await advanceAsync(2_000);
    cancel.abort();
    expect(await result).toEqual({ ok: false, error: { kind: 'cancelled' } });
    expect(events).toHaveLength(2);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('fails as a broken connection when the network drops mid-stream', async () => {
    const { fake, deadline, events, sink } = setup({
      chunks: [{ text: sseEvent('one') }, { fail: 'network' }],
    });
    expect(
      await sendStreamed(CHAT, REQUEST, deadline, 75_000, sink, { fetch: fake.fetch }),
    ).toEqual({ ok: false, error: { kind: 'connection' } });
    expect(events).toHaveLength(1);
    deadline.end();
  });

  it('reads no further once the reader needs no more', async () => {
    const { fake, deadline } = setup(pieces(5, 1_000));
    const seen: string[] = [];
    const result = sendStreamed(
      CHAT,
      REQUEST,
      deadline,
      75_000,
      (event) => {
        seen.push(event.data);
        return seen.length < 2;
      },
      { fetch: fake.fetch },
    );
    await advanceAsync(2_000);
    expect((await result).ok).toBe(true);
    expect(seen).toHaveLength(2);
    expect(vi.getTimerCount()).toBe(1); // only the deadline's own timer is left
    deadline.end();
  });
});

describe('sendStreamed: answers that are not a stream', () => {
  it('reads a JSON answer whole, as transport.send does', async () => {
    const answer = openAiAnswer('Two eggs.');
    const { fake, deadline, events, sink } = setup({ json: answer });
    expect(
      await sendStreamed(CHAT, REQUEST, deadline, 75_000, sink, { fetch: fake.fetch }),
    ).toEqual({ ok: true, value: { status: 200, ok: true, body: JSON.stringify(answer) } });
    expect(events).toEqual([]);
    deadline.end();
  });

  it('reads an error status whole, even when it says it is a stream', async () => {
    const body = '{"error":{"message":"Too many requests"}}';
    const { fake, deadline, events, sink } = setup({
      status: 429,
      text: body,
      headers: { 'content-type': 'text/event-stream' },
    });
    expect(
      await sendStreamed(CHAT, REQUEST, deadline, 75_000, sink, { fetch: fake.fetch }),
    ).toEqual({ ok: true, value: { status: 429, ok: false, body } });
    expect(events).toEqual([]);
    deadline.end();
  });

  it('keeps the cap on a whole answer’s body, as before', async () => {
    const { fake, deadline, sink } = setup({ json: openAiAnswer('Late'), bodyDelayMs: 76_000 });
    const result = sendStreamed(CHAT, REQUEST, deadline, 75_000, sink, { fetch: fake.fetch });
    await advanceAsync(75_000);
    expect(await result).toEqual({ ok: false, error: { kind: 'timeout' } });
    deadline.end();
  });

  it('knows a stream by its content type, whatever its case and parameters', () => {
    const answer = (type: string) => new Response('', { headers: { 'content-type': type } });
    expect(isEventStream(answer('text/event-stream; charset=utf-8'))).toBe(true);
    expect(isEventStream(answer('Text/Event-Stream'))).toBe(true);
    expect(isEventStream(answer('application/json'))).toBe(false);
    expect(isEventStream(new Response(streamOf(openAiTextStream(['x']))))).toBe(false);
  });
});
