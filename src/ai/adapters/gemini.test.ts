import { beforeEach, describe, expect, it } from 'vitest';
import { useFakeTime } from '../../test/time';
import { startDeadline } from '../deadline';
import { fakeFetch, type FakeStep } from '../testing/fakeFetch';
import { geminiAnswer, geminiBlocked, geminiError } from '../testing/wire';
import { send } from '../transport';
import { buildGemini, geminiThinkingLevel, readGemini } from './gemini';
import type { AdapterInput, WireRequest } from './request';

const START = '2026-10-26T12:00:00Z';
const BASE = 'https://generativelanguage.googleapis.com/v1beta';
const KEY = 'gk-test-41c9e2';
const PHOTO_1 = '/9j/2wBDAAEBphotoOne';
const PHOTO_2 = '/9j/2wBDAAICphotoTwo';
const SYSTEM =
  'You estimate nutrition from meal photos.\n\nThe person adds: I cook with little oil.';

const input = (changes: Partial<AdapterInput> = {}): AdapterInput => ({
  provider: 'gemini',
  baseUrl: BASE,
  model: 'gemini-3.5-flash-lite',
  key: KEY,
  system: SYSTEM,
  prompt: 'Estimate this plate.',
  images: [],
  json: true,
  maxTokens: 1_024,
  ...changes,
});

/** Sends a built request through the transport to a fake that answers with `step`. */
async function sendBuilt(request: WireRequest, step: FakeStep = { json: geminiAnswer('{}') }) {
  const fake = fakeFetch().on(request.url, step);
  const deadline = startDeadline({ timeoutSeconds: 180 });
  const result = await send(request.url, request.init, deadline, 75_000, { fetch: fake.fetch });
  deadline.end();
  const sent = fake.requests[0];
  if (!result.ok || sent === undefined) throw new Error('the fake did not answer');
  return { sent, reply: result.value };
}

const body = (value: unknown): string => JSON.stringify(value);

// The transport's timers run on fake time; nothing here waits.
beforeEach(() => {
  useFakeTime(START);
});

describe('geminiThinkingLevel (R03.8)', () => {
  it.each([
    ['gemini-3.5-flash-lite', 'minimal'],
    ['gemini-3.6-flash', 'minimal'],
    ['gemini-3-flash', 'minimal'],
    ['gemini-3-flash-preview', 'minimal'],
    ['gemini-3.5-flash', 'minimal'],
    ['gemini-3.7-flash', 'low'],
    ['gemini-3.8-flash', 'low'],
    ['gemini-3.10-flash', 'low'],
    ['gemini-4-flash', 'low'],
    ['gemini-4-flash-lite', 'minimal'],
    ['gemini-3.1-pro-preview', 'low'],
    ['gemini-3-pro', 'low'],
  ] as const)('gives %s the level %s', (model, level) => {
    expect(geminiThinkingLevel(model)).toBe(level);
  });

  it('gives the -latest aliases a level every Gemini 3 model accepts', () => {
    expect(geminiThinkingLevel('gemini-flash-lite-latest')).toBe('minimal');
    expect(geminiThinkingLevel('gemini-flash-latest')).toBe('low');
    expect(geminiThinkingLevel('google/gemini-flash-latest')).toBe('low');
    expect(geminiThinkingLevel(' Gemini-Flash-Latest ')).toBe('low');
  });

  it('reads the id lower-cased, trimmed and without a vendor/ prefix', () => {
    expect(geminiThinkingLevel('models/gemini-3.5-flash-lite')).toBe('minimal');
    expect(geminiThinkingLevel('  Google/GEMINI-3.6-Flash ')).toBe('minimal');
    expect(geminiThinkingLevel('google/gemini-3.7-flash')).toBe('low');
  });

  it.each(['gemini-2.5-flash', 'gemini-2.0-flash-lite', 'gemini-2.5-pro'])(
    'sends no level to %s, a model before Gemini 3',
    (model) => {
      expect(geminiThinkingLevel(model)).toBeUndefined();
    },
  );

  it.each(['gemma-4-31b-it', 'my-proxy-model', 'gemini-', 'gemini-3', 'gemini-exp-1206', ''])(
    'sends no level to %j, an id that does not parse',
    (model) => {
      expect(geminiThinkingLevel(model)).toBeUndefined();
    },
  );
});

describe('buildGemini: address and key', () => {
  it('puts the key in the x-goog-api-key header and never in the address', async () => {
    const { sent } = await sendBuilt(buildGemini(input()));

    expect(sent.method).toBe('POST');
    expect(sent.url).toBe(`${BASE}/models/gemini-3.5-flash-lite:generateContent`);
    expect(sent.url).not.toContain('key=');
    expect(sent.url).not.toContain(KEY);
    expect(sent.headers['x-goog-api-key']).toBe(KEY);
    expect(sent.headers['content-type']).toBe('application/json');
  });

  it('ignores trailing slashes on the base address and spaces around the model', () => {
    const request = buildGemini(input({ baseUrl: `${BASE}//`, model: ' gemini-3.6-flash ' }));
    expect(request.url).toBe(`${BASE}/models/gemini-3.6-flash:generateContent`);
  });
});

describe('buildGemini: body', () => {
  it('sends the photos first, as JPEG inline data, then the prompt in one user turn', async () => {
    const { sent } = await sendBuilt(buildGemini(input({ images: [PHOTO_1, PHOTO_2] })));

    expect(sent.body).toMatchObject({
      contents: [
        {
          role: 'user',
          parts: [
            { inlineData: { mimeType: 'image/jpeg', data: PHOTO_1 } },
            { inlineData: { mimeType: 'image/jpeg', data: PHOTO_2 } },
            { text: 'Estimate this plate.' },
          ],
        },
      ],
    });
  });

  it('sends a text-only request as one text part', () => {
    const request = buildGemini(input({ prompt: 'Two boiled eggs and toast.' }));
    expect(JSON.parse(String(request.init.body))).toMatchObject({
      contents: [{ role: 'user', parts: [{ text: 'Two boiled eggs and toast.' }] }],
    });
  });

  it('carries the system text with the notes for the AI in systemInstruction (D-16.24)', async () => {
    const { sent } = await sendBuilt(buildGemini(input()));
    expect(sent.body).toMatchObject({ systemInstruction: { parts: [{ text: SYSTEM }] } });
  });

  it('sends no systemInstruction for a blank system text', () => {
    const request = buildGemini(input({ system: '  \n' }));
    expect(JSON.parse(String(request.init.body))).not.toHaveProperty('systemInstruction');
  });

  it('sends the answer limit even at the default, with JSON and the thinking level', async () => {
    const { sent } = await sendBuilt(buildGemini(input({ maxTokens: 1_024 })));
    expect(sent.body).toMatchObject({
      generationConfig: {
        maxOutputTokens: 1_024,
        responseMimeType: 'application/json',
        thinkingConfig: { thinkingLevel: 'minimal' },
      },
    });
  });

  it('leaves out responseMimeType for a prose request but keeps the limit and level', () => {
    const request = buildGemini(input({ json: false, model: 'gemini-3.8-flash', maxTokens: 300 }));
    const sentBody = JSON.parse(String(request.init.body)) as Record<string, unknown>;
    expect(sentBody.generationConfig).toEqual({
      maxOutputTokens: 300,
      thinkingConfig: { thinkingLevel: 'low' },
    });
  });

  it('sends no thinkingConfig to a model before Gemini 3', () => {
    const request = buildGemini(input({ model: 'gemini-2.5-flash' }));
    const sentBody = JSON.parse(String(request.init.body)) as Record<string, unknown>;
    expect(sentBody.generationConfig).toEqual({
      maxOutputTokens: 1_024,
      responseMimeType: 'application/json',
    });
  });
});

describe('readGemini (R03.7)', () => {
  it('joins every text part and skips the thought part', () => {
    const reply = geminiAnswer(['{"dish":"lentil soup",', '"kcal":310}'], {
      thoughts: ['Looking at the bowl and the spoon for scale.'],
    });
    expect(readGemini(200, body(reply))).toEqual({
      ok: true,
      value: '{"dish":"lentil soup","kcal":310}',
    });
  });

  it('trims the joined answer', () => {
    expect(readGemini(200, body(geminiAnswer(['\n  {"dish":', '"toast"}  \n'])))).toEqual({
      ok: true,
      value: '{"dish":"toast"}',
    });
  });

  it('reads the reply the transport brought back', async () => {
    const { reply } = await sendBuilt(buildGemini(input()), {
      json: geminiAnswer('{"dish":"rice bowl"}'),
    });
    expect(readGemini(reply.status, reply.body)).toEqual({
      ok: true,
      value: '{"dish":"rice bowl"}',
    });
  });

  it('reads MAX_TOKENS as cut off, with part of an answer or with thoughts only', () => {
    const partial = geminiAnswer('{"dish":"len', { finishReason: 'MAX_TOKENS' });
    const thoughtsOnly = geminiAnswer([], {
      thoughts: ['Still weighing'],
      finishReason: 'MAX_TOKENS',
    });
    expect(readGemini(200, body(partial))).toEqual({ ok: false, error: { kind: 'truncated' } });
    expect(readGemini(200, body(thoughtsOnly))).toEqual({
      ok: false,
      error: { kind: 'truncated' },
    });
  });

  it.each([
    ['a body that is not JSON', 'upstream said no'],
    ['a blocked prompt (no candidates)', body(geminiBlocked())],
    ['an empty candidate list', body({ candidates: [] })],
    ['a candidate without parts', body(geminiAnswer([]))],
    [
      'an empty part list',
      body({ candidates: [{ content: { parts: [] }, finishReason: 'STOP' }] }),
    ],
    ['thoughts only, finished normally', body(geminiAnswer([], { thoughts: ['Hmm.'] }))],
    ['blank text', body(geminiAnswer('   '))],
    ['a JSON list', body([geminiAnswer('{}')])],
  ])('reads %s as unusable', (_, text) => {
    expect(readGemini(200, text)).toEqual({ ok: false, error: { kind: 'invalidResponse' } });
  });

  it('classifies an error status from its body and keeps the key out of the detail', () => {
    const quota = geminiError(429, 'RESOURCE_EXHAUSTED', `Quota used up for ${KEY}.`, {
      quotaId: 'GenerateRequestsPerDayPerProjectPerModel-FreeTier',
    });
    const result = readGemini(429, body(quota), { secrets: [KEY] });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatchObject({ kind: 'dailyQuota', status: 429 });
    expect(result.error.detail).not.toContain(KEY);
    const refused = geminiError(400, 'INVALID_ARGUMENT', 'API key not valid. Pass a valid one.');
    expect(readGemini(400, body(refused))).toMatchObject({ error: { kind: 'keyRejected' } });
  });
});
