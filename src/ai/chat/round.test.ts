import { beforeEach, describe, expect, it } from 'vitest';
import { advanceAsync, useFakeTime } from '../../test/time';
import { PROVIDER_IDS } from '../catalog/providers';
import { startDeadline } from '../deadline';
import { fakeFetch, type FakeFetch } from '../testing/fakeFetch';
import {
  anthropicErrorEvent,
  anthropicStart,
  anthropicTextStream,
  geminiTextStream,
  openAiTextStream,
  streamOf,
  streamReply,
} from '../testing/streamWire';
import { openAiAnswer, openAiError } from '../testing/wire';
import { anthropicChat } from './anthropicChat';
import { geminiChat } from './geminiChat';
import { openAiChat } from './openaiChat';
import { askRound, asksForStream, chatWireFor, forgetRefusedStreams } from './round';
import type { ChatSetup, ChatWire, Transcript } from './types';

const START = '2026-10-27T09:00:00Z';
const BASE = 'https://api.mistral.ai/v1';
const ROUTE = `${BASE}/chat/completions`;
const KEY = 'mi-chat-7702';

const setup: ChatSetup = {
  provider: 'mistral',
  baseUrl: BASE,
  model: 'mistral-large-latest',
  key: KEY,
  system: 'You coach one person on food and weight.',
  tools: [],
  maxTokens: 1_024,
};

const transcript = openAiChat.open({ history: [], text: 'How much water today?' });

beforeEach(() => {
  useFakeTime(START);
  forgetRefusedStreams();
});

/** One round with a fresh 180 s deadline; the texts handed up as the reply grew. */
async function streamedRound(
  fake: FakeFetch,
  chat: ChatSetup = setup,
  wire: ChatWire = openAiChat,
  start: Transcript = transcript,
) {
  const deadline = startDeadline({ timeoutSeconds: 180 });
  const shown: string[] = [];
  try {
    const result = await askRound(wire, chat, start, {
      fetch: fake.fetch,
      deadline,
      secrets: [KEY],
      onText: (text) => shown.push(text),
    });
    return { result, shown };
  } finally {
    deadline.end();
  }
}

const sentStream = (fake: FakeFetch): unknown[] =>
  fake.requests.map((request) => (request.body as Record<string, unknown>).stream);

describe('chatWireFor', () => {
  it('gives each provider the wire of its format', () => {
    for (const provider of PROVIDER_IDS) {
      const expected =
        provider === 'gemini' ? geminiChat : provider === 'anthropic' ? anthropicChat : openAiChat;
      expect(chatWireFor(provider)).toBe(expected);
    }
  });
});

describe('askRound', () => {
  it('retries a busy provider inside the round on the shared ladder (D-16.23)', async () => {
    const fake = fakeFetch().on(
      ROUTE,
      { status: 503, json: openAiError('Service unavailable') },
      { json: openAiAnswer('1.2 litres so far.') },
    );
    const deadline = startDeadline({ timeoutSeconds: 180 });
    const pending = askRound(openAiChat, setup, transcript, { fetch: fake.fetch, deadline });
    await advanceAsync(1_000);
    expect(await pending).toEqual({
      ok: true,
      value: { kind: 'answer', text: '1.2 litres so far.' },
    });
    expect(fake.requests).toHaveLength(2);
    deadline.end();
  });

  it('classifies a refused key with the key cut out of the detail, and does not re-ask', async () => {
    const fake = fakeFetch().on(ROUTE, { status: 401, json: openAiError(`Bad key ${KEY}`) });
    const deadline = startDeadline({ timeoutSeconds: 180 });
    const result = await askRound(openAiChat, setup, transcript, {
      fetch: fake.fetch,
      deadline,
      secrets: [KEY],
    });
    deadline.end();
    expect(result).toEqual({
      ok: false,
      error: { kind: 'keyRejected', status: 401, detail: 'Bad key •••' },
    });
    expect(fake.requests).toHaveLength(1);
  });

  it('stops silently on Cancel, with no re-ask', async () => {
    const cancel = new AbortController();
    const fake = fakeFetch().on(ROUTE, { json: openAiAnswer('Late'), delayMs: 5_000 });
    const deadline = startDeadline({ timeoutSeconds: 180, cancel: cancel.signal });
    const pending = askRound(openAiChat, setup, transcript, { fetch: fake.fetch, deadline });
    await advanceAsync(1_000);
    cancel.abort();
    expect(await pending).toEqual({ ok: false, error: { kind: 'cancelled' } });
    expect(fake.requests).toHaveLength(1);
    deadline.end();
  });

  it('tells the transport whether a key went along, for the refused-key hint (R03.2)', async () => {
    const hub = 'https://router.huggingface.co/v1';
    const chat: ChatSetup = { ...setup, provider: 'huggingface', baseUrl: hub, model: 'org/model' };
    const outcomes = [];
    for (const key of ['  ', KEY]) {
      const fake = fakeFetch().on(`${hub}/chat/completions`, { fail: 'network' });
      const deadline = startDeadline({ timeoutSeconds: 180 });
      outcomes.push(
        await askRound(openAiChat, { ...chat, key }, transcript, { fetch: fake.fetch, deadline }),
      );
      deadline.end();
    }
    expect(outcomes).toEqual([
      { ok: false, error: { kind: 'connection', keyMayBeRefused: true } },
      { ok: false, error: { kind: 'connection' } },
    ]);
  });
});

describe('askRound: streamed replies (D-16.106)', () => {
  it('asks for a stream and hands the text up as it grows, then gives the answer', async () => {
    const fake = fakeFetch().on(
      ROUTE,
      streamReply(openAiTextStream(['1.2 ', 'litres ', 'so far.']), { pieceSize: 37 }),
    );
    const { result, shown } = await streamedRound(fake);
    expect(result).toEqual({ ok: true, value: { kind: 'answer', text: '1.2 litres so far.' } });
    expect(shown).toEqual(['1.2', '1.2 litres', '1.2 litres so far.']);
    expect(sentStream(fake)).toEqual([true]);
  });

  it('reads an answer that comes whole, as before, and hands nothing up', async () => {
    const fake = fakeFetch().on(ROUTE, { json: openAiAnswer('1.2 litres so far.') });
    const { result, shown } = await streamedRound(fake);
    expect(result).toEqual({ ok: true, value: { kind: 'answer', text: '1.2 litres so far.' } });
    expect(shown).toEqual([]);
  });

  it('reads a body that is plainly a stream under another content type as one', async () => {
    const fake = fakeFetch().on(ROUTE, {
      text: streamOf(openAiTextStream(['Two ', 'eggs.'])),
    });
    expect((await streamedRound(fake)).result).toEqual({
      ok: true,
      value: { kind: 'answer', text: 'Two eggs.' },
    });
  });

  it('asks once more without a stream when the server refuses one, and remembers it', async () => {
    const refusal = openAiError('Your organization must be verified to stream this model.');
    const fake = fakeFetch().on(
      ROUTE,
      { status: 400, json: refusal },
      { json: openAiAnswer('1.2 litres so far.') },
      { json: openAiAnswer('And 300 ml more.') },
    );
    expect((await streamedRound(fake)).result).toEqual({
      ok: true,
      value: { kind: 'answer', text: '1.2 litres so far.' },
    });
    expect(asksForStream(setup)).toBe(false);
    expect(asksForStream({ ...setup, model: 'mistral-small-latest' })).toBe(true);
    await streamedRound(fake);
    expect(sentStream(fake)).toEqual([true, undefined, undefined]);
  });

  it('takes a refused key or an unknown model that names streaming for what it is', async () => {
    const fake = fakeFetch().on(
      ROUTE,
      { status: 401, json: openAiError('This key may not use streaming') },
      { status: 404, json: openAiError('No streaming model by that name') },
    );
    expect((await streamedRound(fake)).result).toMatchObject({
      ok: false,
      error: { kind: 'keyRejected' },
    });
    expect((await streamedRound(fake)).result).toMatchObject({
      ok: false,
      error: { kind: 'model' },
    });
    expect(sentStream(fake)).toEqual([true, true]);
    expect(asksForStream(setup)).toBe(true);
  });

  it('never asks Cerebras for a stream (its errors hide behind CORS)', async () => {
    const base = 'https://api.cerebras.ai/v1';
    const fake = fakeFetch().on(`${base}/chat/completions`, { json: openAiAnswer('Fine.') });
    const chat: ChatSetup = { ...setup, provider: 'cerebras', baseUrl: base, model: 'qwen-3' };
    expect(asksForStream(chat)).toBe(false);
    expect((await streamedRound(fake, chat)).result.ok).toBe(true);
    expect(sentStream(fake)).toEqual([undefined]);
  });

  it('streams the re-ask after a cut reply, whose text replaces the cut one (R04.18)', async () => {
    const fake = fakeFetch().on(
      ROUTE,
      streamReply(openAiTextStream(['You drank ', 'about'], { finishReason: 'length' })),
      streamReply(openAiTextStream(['1.2 litres.'])),
    );
    const { result, shown } = await streamedRound(fake);
    expect(result).toEqual({ ok: true, value: { kind: 'answer', text: '1.2 litres.' } });
    expect(shown).toEqual(['You drank', 'You drank about', '1.2 litres.']);
    expect(fake.requests).toHaveLength(2);
  });

  it('retries a busy provider before its stream, but never a stream that failed midway', async () => {
    const fake = fakeFetch().on(
      ANTHROPIC_ROUTE,
      {
        status: 529,
        json: { type: 'error', error: { type: 'overloaded_error', message: 'Busy' } },
      },
      streamReply([
        ...anthropicTextStream(['Your protein ']).slice(0, 4),
        anthropicErrorEvent('overloaded_error', 'Busy again'),
      ]),
    );
    const pending = streamedRound(fake, ANTHROPIC_SETUP, anthropicChat, ANTHROPIC_START);
    await advanceAsync(1_000);
    const { result, shown } = await pending;
    expect(result).toEqual({
      ok: false,
      error: { kind: 'overloaded', status: 0, detail: 'Busy again' },
    });
    expect(shown).toEqual(['Your protein']);
    expect(fake.requests).toHaveLength(2);
  });

  it('fails a stream cut before its end as a broken connection, keeping nothing', async () => {
    const fake = fakeFetch().on(
      ANTHROPIC_ROUTE,
      streamReply([anthropicStart(), ...anthropicTextStream(['Half a ']).slice(2, 4)]),
    );
    const { result } = await streamedRound(fake, ANTHROPIC_SETUP, anthropicChat, ANTHROPIC_START);
    expect(result).toEqual({ ok: false, error: { kind: 'connection' } });
  });

  it('streams Gemini from streamGenerateContent with alt=sse', async () => {
    const base = 'https://generativelanguage.googleapis.com/v1beta';
    const route = `${base}/models/gemini-3-flash:streamGenerateContent?alt=sse`;
    const fake = fakeFetch().on(route, streamReply(geminiTextStream(['On ', 'track.'])));
    const chat: ChatSetup = {
      ...setup,
      provider: 'gemini',
      baseUrl: base,
      model: 'gemini-3-flash',
    };
    const start = geminiChat.open({ history: [], text: 'How am I doing?' });
    const { result, shown } = await streamedRound(fake, chat, geminiChat, start);
    expect(result).toEqual({ ok: true, value: { kind: 'answer', text: 'On track.' } });
    expect(shown).toEqual(['On', 'On track.']);
  });
});

const ANTHROPIC_ROUTE = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_SETUP: ChatSetup = {
  ...setup,
  provider: 'anthropic',
  baseUrl: 'https://api.anthropic.com/v1',
  model: 'claude-haiku-5-5',
};
const ANTHROPIC_START = anthropicChat.open({ history: [], text: 'How is my protein?' });
