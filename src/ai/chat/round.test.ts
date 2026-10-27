import { beforeEach, describe, expect, it } from 'vitest';
import { advanceAsync, useFakeTime } from '../../test/time';
import { PROVIDER_IDS } from '../catalog/providers';
import { startDeadline } from '../deadline';
import { fakeFetch } from '../testing/fakeFetch';
import { openAiAnswer, openAiError } from '../testing/wire';
import { anthropicChat } from './anthropicChat';
import { geminiChat } from './geminiChat';
import { openAiChat } from './openaiChat';
import { askRound, chatWireFor } from './round';
import type { ChatSetup } from './types';

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
});

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
