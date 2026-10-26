import { describe, expect, it } from 'vitest';
import { advance, advanceAsync, useFakeTime } from '../../test/time';
import { createFakeFetch, jsonReply, networkFailure, textReply } from './fakeFetch';

const CHAT = 'https://chat.example.test/v1/chat/completions';
const OTHER = 'https://other.example.test/v1/messages';

/** Lets pending promise callbacks run. */
const flush = () => advanceAsync(0);

describe('createFakeFetch', () => {
  it('gives queued replies back in order, with their status, headers and body', async () => {
    const net = createFakeFetch();
    net
      .on('/chat/completions')
      .reply(
        jsonReply({ note: 'first' }, { status: 503, headers: { 'x-trace': 'a1' } }),
        textReply('plain words, not json', { status: 400 }),
        jsonReply({ note: 'third' }),
      );

    const first = await net.fetch(CHAT, { method: 'POST' });
    expect(first.status).toBe(503);
    expect(first.headers.get('x-trace')).toBe('a1');
    expect(first.headers.get('content-type')).toBe('application/json');
    expect(await first.json()).toEqual({ note: 'first' });

    const second = await net.fetch(CHAT, { method: 'POST' });
    expect(second.status).toBe(400);
    expect(await second.text()).toBe('plain words, not json');

    const third = await net.fetch(CHAT, { method: 'POST' });
    expect(third.ok).toBe(true);
    expect(await third.json()).toEqual({ note: 'third' });
    expect(net.remaining()).toBe(0);
  });

  it('keeps one queue per route and matches a URL part or a RegExp', async () => {
    const net = createFakeFetch();
    net.on('chat.example.test').reply(jsonReply({ from: 'chat' }));
    net.on(/\/v1\/messages$/).reply(jsonReply({ from: 'messages' }));

    expect(await (await net.fetch(OTHER)).json()).toEqual({ from: 'messages' });
    expect(await (await net.fetch(CHAT)).json()).toEqual({ from: 'chat' });
  });

  it('moves on to the next matching route once the first is used up', async () => {
    const net = createFakeFetch();
    net.on('/chat/').reply(jsonReply({ n: 1 }));
    net.on('example.test').reply(jsonReply({ n: 2 }));

    expect(await (await net.fetch(CHAT)).json()).toEqual({ n: 1 });
    expect(await (await net.fetch(CHAT)).json()).toEqual({ n: 2 });
  });

  it('records every request: URL, method, lower-cased headers, parsed body and arrival time', async () => {
    const start = useFakeTime('2026-10-26T09:00:00Z');
    const net = createFakeFetch();
    net.on(CHAT).reply(jsonReply({}), jsonReply({}));

    await net.fetch(new URL(CHAT), {
      method: 'post',
      headers: { Authorization: 'Bearer test-key-1', 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'm', messages: [] }),
    });
    advance(2000);
    await net.fetch(CHAT, { method: 'POST', body: 'not json at all' });

    expect(net.requests).toHaveLength(2);
    expect(net.requests[0]).toMatchObject({
      url: CHAT,
      method: 'POST',
      headers: { authorization: 'Bearer test-key-1', 'content-type': 'application/json' },
      body: { model: 'm', messages: [] },
      at: start,
    });
    expect(net.requests[1]).toMatchObject({ body: 'not json at all', at: start + 2000 });
  });

  it('resolves a reply with a 5 s delay only after advance(5000)', async () => {
    useFakeTime(0);
    const net = createFakeFetch();
    net.on(CHAT).reply(jsonReply({ late: true }, { delayMs: 5000 }));

    let settled = false;
    const pending = net.fetch(CHAT).then((reply) => {
      settled = true;
      return reply;
    });
    advance(4999);
    await flush();
    expect(settled).toBe(false);

    advance(1);
    const reply = await pending;
    expect(settled).toBe(true);
    expect(await reply.json()).toEqual({ late: true });
  });

  it('rejects with an AbortError when the signal is already aborted, sending nothing', async () => {
    const net = createFakeFetch();
    net.on(CHAT).reply(jsonReply({}));
    const controller = new AbortController();
    controller.abort();

    await expect(net.fetch(CHAT, { signal: controller.signal })).rejects.toMatchObject({
      name: 'AbortError',
    });
    expect(net.requests).toHaveLength(0);
    expect(net.remaining()).toBe(1);
  });

  it('rejects with an AbortError when the signal aborts during the delay', async () => {
    useFakeTime(0);
    const net = createFakeFetch();
    net.on(CHAT).reply(jsonReply({}, { delayMs: 10_000 }));
    const controller = new AbortController();

    const pending = net.fetch(CHAT, { signal: controller.signal });
    advance(3000);
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(net.requests).toHaveLength(1);
  });

  it('rejects with the reason the signal was aborted with', async () => {
    useFakeTime(0);
    const net = createFakeFetch();
    net.on(CHAT).reply(jsonReply({}, { delayMs: 1000 }));
    const controller = new AbortController();
    const reason = new DOMException('our deadline passed', 'TimeoutError');

    const pending = net.fetch(CHAT, { signal: controller.signal });
    controller.abort(reason);
    await expect(pending).rejects.toBe(reason);
  });

  it('delivers a slow body after its own delay, and an abort meanwhile fails the body read', async () => {
    useFakeTime(0);
    const net = createFakeFetch();
    net
      .on(CHAT)
      .reply(
        textReply('arrived', { bodyDelayMs: 4000 }),
        textReply('never read', { bodyDelayMs: 4000 }),
      );

    const slow = await net.fetch(CHAT);
    const text = slow.text();
    await advanceAsync(4000);
    expect(await text).toBe('arrived');

    const controller = new AbortController();
    const cut = await net.fetch(CHAT, { signal: controller.signal });
    const reading = cut.text();
    advance(1000);
    controller.abort();
    await expect(reading).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('fails like a browser network error with a TypeError', async () => {
    useFakeTime(0);
    const net = createFakeFetch();
    net.on(CHAT).reply(networkFailure(), networkFailure({ delayMs: 500 }));

    await expect(net.fetch(CHAT)).rejects.toBeInstanceOf(TypeError);
    const later = net.fetch(CHAT);
    advance(500);
    await expect(later).rejects.toBeInstanceOf(TypeError);
  });

  it('sends no body for 204 and accepts any status from 200 to 599', async () => {
    const net = createFakeFetch();
    net
      .on(CHAT)
      .reply(jsonReply({ ignored: true }, { status: 204 }), jsonReply({}, { status: 299 }));

    const empty = await net.fetch(CHAT);
    expect(empty.status).toBe(204);
    expect(await empty.text()).toBe('');
    expect((await net.fetch(CHAT)).status).toBe(299);
    expect(() => jsonReply({}, { status: 0 })).toThrow(RangeError);
    expect(() => textReply('', { delayMs: -1 })).toThrow(RangeError);
  });

  it('rejects a request with no queued reply and names it', async () => {
    const net = createFakeFetch();
    net.on(OTHER).reply(jsonReply({}));

    await expect(net.fetch(CHAT, { method: 'POST' })).rejects.toThrow(
      `fakeFetch: no reply queued for POST ${CHAT}`,
    );
    expect(net.requests.map((request) => request.url)).toEqual([CHAT]);
    expect(net.takeProblems()).toEqual([`no reply queued for POST ${CHAT}`]);
  });

  it('rejects a request whose route is used up, and a Request object', async () => {
    const net = createFakeFetch();
    net.on(CHAT).reply(jsonReply({}));
    await net.fetch(CHAT);

    await expect(net.fetch(CHAT)).rejects.toThrow('is used up');
    await expect(net.fetch(new Request(CHAT))).rejects.toThrow('not a Request');
    expect(net.takeProblems()).toHaveLength(2);
  });

  it.fails(
    'fails the test loudly for an unmatched URL even when the caller swallows the error',
    async () => {
      const net = createFakeFetch();
      await net.fetch('https://unexpected.example.test/v1/chat/completions').catch(() => undefined);
    },
  );
});
