import { beforeEach, describe, expect, it } from 'vitest';
import { useFakeTime } from '../../test/time';
import { startDeadline } from '../deadline';
import { fakeFetch, type FakeStep } from '../testing/fakeFetch';
import { detailError, openAiAnswer, openAiError, stringError } from '../testing/wire';
import { send } from '../transport';
import {
  ATTRIBUTION_NAME,
  ATTRIBUTION_URL,
  buildOpenAiCompat,
  openRouterReasoning,
  readOpenAiCompat,
  tokenLimitField,
} from './openaiCompat';
import type { AdapterInput, ProviderId, WireRequest } from './request';

const START = '2026-10-26T12:00:00Z';
const OPENAI = 'https://api.openai.com/v1';
const KEY = 'sk-test-90d1aa';
const PHOTO_1 = '/9j/2wBDAAEBphotoOne';
const PHOTO_2 = '/9j/2wBDAAICphotoTwo';
const SYSTEM = 'You estimate nutrition from meal photos.\n\nThe person adds: portions are small.';

const ALL_PROVIDERS: readonly ProviderId[] = [
  'gemini',
  'openai',
  'anthropic',
  'xai',
  'openrouter',
  'together',
  'groq',
  'huggingface',
  'fireworks',
  'deepinfra',
  'mistral',
  'deepseek',
  'qwen',
  'cerebras',
  'ollama',
  'custom',
];

const input = (changes: Partial<AdapterInput> = {}): AdapterInput => ({
  provider: 'openai',
  baseUrl: OPENAI,
  model: 'gpt-5.4-mini',
  key: KEY,
  system: SYSTEM,
  prompt: 'Estimate this plate.',
  images: [],
  json: true,
  maxTokens: 1_024,
  ...changes,
});

/** Sends a built request through the transport to a fake that answers with `step`. */
async function sendBuilt(request: WireRequest, step: FakeStep = { json: openAiAnswer('{}') }) {
  const fake = fakeFetch().on(request.url, step);
  const deadline = startDeadline({ timeoutSeconds: 180 });
  const result = await send(request.url, request.init, deadline, 75_000, { fetch: fake.fetch });
  deadline.end();
  const sent = fake.requests[0];
  if (!result.ok || sent === undefined) throw new Error('the fake did not answer');
  return { sent, reply: result.value };
}

/** The JSON body a built request would send. */
const sentBody = (request: WireRequest): Record<string, unknown> =>
  JSON.parse(String(request.init.body)) as Record<string, unknown>;

const body = (value: unknown): string => JSON.stringify(value);

// The transport's timers run on fake time; nothing here waits.
beforeEach(() => {
  useFakeTime(START);
});

describe('tokenLimitField (R03.10)', () => {
  it('gives OpenAI max_completion_tokens for every model (ACC-E2-2)', async () => {
    for (const model of ['gpt-5.4-mini', 'gpt-4.1', 'gpt-4o-mini']) {
      expect(tokenLimitField('openai', model)).toBe('max_completion_tokens');
    }
    const { sent } = await sendBuilt(buildOpenAiCompat(input({ model: 'gpt-4.1' })));
    expect(sent.body).toMatchObject({ max_completion_tokens: 1_024 });
    expect(sent.body).not.toHaveProperty('max_tokens');
  });

  it.each([
    'vendor/GPT-5.4-mini',
    'gpt-6',
    'gpt-6-sol',
    '  Gateway/OpenAI/GPT-6.1-Luna  ',
    'o1-mini',
    'openai/o3',
    'o4-mini',
  ])('gives a Custom server max_completion_tokens for %j', (model) => {
    expect(tokenLimitField('custom', model)).toBe('max_completion_tokens');
  });

  it.each(['llama3', 'gpt-4.1', 'openai/gpt-4o-mini', 'qwen/qwen3.8', 'mistral-small', '', '   '])(
    'gives a Custom server max_tokens for %j',
    (model) => {
      expect(tokenLimitField('custom', model)).toBe('max_tokens');
    },
  );

  it('gives every other provider max_tokens, even for an OpenAI model id', () => {
    const others = ALL_PROVIDERS.filter((id) => id !== 'openai' && id !== 'custom');
    for (const provider of others) {
      for (const model of ['openai/gpt-6-sol', 'gpt-5.4-mini', 'o3']) {
        expect(tokenLimitField(provider, model), `${provider} ${model}`).toBe('max_tokens');
      }
    }
    const groq = sentBody(
      buildOpenAiCompat(input({ provider: 'groq', model: 'openai/gpt-oss-20b' })),
    );
    expect(groq).toMatchObject({ max_tokens: 1_024 });
    expect(groq).not.toHaveProperty('max_completion_tokens');
  });

  it('sends the field the Custom model needs', () => {
    const custom = (model: string) =>
      sentBody(buildOpenAiCompat(input({ provider: 'custom', model, maxTokens: 700 })));
    expect(custom('vendor/GPT-5.4-mini')).toMatchObject({ max_completion_tokens: 700 });
    expect(custom('llama3')).toMatchObject({ max_tokens: 700 });
  });
});

describe('provider extras (R03.11)', () => {
  it('turns Qwen thinking off, and only for Qwen', () => {
    const qwen = buildOpenAiCompat(input({ provider: 'qwen', model: 'qwen3.7-plus' }));
    expect(sentBody(qwen)).toMatchObject({ enable_thinking: false });
    for (const provider of ['deepseek', 'openrouter', 'openai'] as const) {
      expect(sentBody(buildOpenAiCompat(input({ provider })))).not.toHaveProperty(
        'enable_thinking',
      );
    }
  });

  it('always excludes OpenRouter reasoning and names the effort unless it is auto', () => {
    const openRouter = (changes: Partial<AdapterInput>) =>
      sentBody(
        buildOpenAiCompat(input({ provider: 'openrouter', model: 'openrouter/free', ...changes })),
      );

    expect(openRouter({}).reasoning).toEqual({ exclude: true });
    expect(openRouter({ openRouterEffort: 'auto' }).reasoning).toEqual({ exclude: true });
    expect(openRouter({ openRouterEffort: 'high' }).reasoning).toEqual({
      exclude: true,
      effort: 'high',
    });
    expect(openRouter({ openRouterEffort: 'none' }).reasoning).toEqual({
      exclude: true,
      effort: 'none',
    });
    // The client asks for low effort on the compact re-ask (03 §3.8).
    expect(openRouter({ openRouterEffort: 'low' }).reasoning).toEqual({
      exclude: true,
      effort: 'low',
    });
    expect(openRouterReasoning('xhigh')).toEqual({ exclude: true, effort: 'xhigh' });
  });

  it('sends no reasoning object to other providers', () => {
    const together = input({ provider: 'together', openRouterEffort: 'high' });
    expect(sentBody(buildOpenAiCompat(together))).not.toHaveProperty('reasoning');
  });

  it('names Platewise in the OpenRouter attribution headers, and only for OpenRouter', async () => {
    const { sent } = await sendBuilt(
      buildOpenAiCompat(input({ provider: 'openrouter', baseUrl: 'https://openrouter.ai/api/v1' })),
    );
    expect(sent.headers['http-referer']).toBe(ATTRIBUTION_URL);
    expect(sent.headers['x-title']).toBe(ATTRIBUTION_NAME);
    expect(ATTRIBUTION_NAME).toBe('Platewise');
    expect(ATTRIBUTION_URL).toMatch(/^https:\/\//);

    const xai = await sendBuilt(
      buildOpenAiCompat(input({ provider: 'xai', baseUrl: 'https://api.x.ai/v1' })),
    );
    expect(xai.sent.headers).not.toHaveProperty('http-referer');
    expect(xai.sent.headers).not.toHaveProperty('x-title');
  });
});

describe('buildOpenAiCompat: address and key', () => {
  it('posts to {base}/chat/completions with the key as a Bearer token', async () => {
    const { sent } = await sendBuilt(buildOpenAiCompat(input({ key: ` ${KEY}\n` })));
    expect(sent.method).toBe('POST');
    expect(sent.url).toBe(`${OPENAI}/chat/completions`);
    expect(sent.url).not.toContain(KEY);
    expect(sent.headers.authorization).toBe(`Bearer ${KEY}`);
    expect(sent.headers['content-type']).toBe('application/json');
  });

  it('sends no Authorization header to Ollama, or to a Custom server with a blank key', async () => {
    const ollama = await sendBuilt(
      buildOpenAiCompat(
        input({
          provider: 'ollama',
          baseUrl: 'http://localhost:11434/v1',
          model: 'qwen3-vl',
          key: undefined,
        }),
      ),
    );
    expect(ollama.sent.url).toBe('http://localhost:11434/v1/chat/completions');
    expect(ollama.sent.headers).not.toHaveProperty('authorization');

    const custom = buildOpenAiCompat(input({ provider: 'custom', key: '   ' }));
    expect(new Headers(custom.init.headers).has('authorization')).toBe(false);
  });

  it('keeps DeepSeek’s base without /v1 and drops a trailing slash', () => {
    const deepseek = buildOpenAiCompat(
      input({ provider: 'deepseek', baseUrl: 'https://api.deepseek.com' }),
    );
    expect(deepseek.url).toBe('https://api.deepseek.com/chat/completions');
    const slashed = buildOpenAiCompat(
      input({ provider: 'mistral', baseUrl: 'https://api.mistral.ai/v1/' }),
    );
    expect(slashed.url).toBe('https://api.mistral.ai/v1/chat/completions');
  });
});

describe('buildOpenAiCompat: messages', () => {
  it('sends the system message with the notes first, then the photos before the text', async () => {
    const { sent } = await sendBuilt(buildOpenAiCompat(input({ images: [PHOTO_1, PHOTO_2] })));
    expect(sent.body).toMatchObject({
      model: 'gpt-5.4-mini',
      messages: [
        { role: 'system', content: SYSTEM },
        {
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${PHOTO_1}` } },
            { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${PHOTO_2}` } },
            { type: 'text', text: 'Estimate this plate.' },
          ],
        },
      ],
    });
  });

  it('sends a text-only request as plain string content', () => {
    const request = buildOpenAiCompat(
      input({ provider: 'cerebras', prompt: 'A cup of black tea.' }),
    );
    expect(sentBody(request).messages).toEqual([
      { role: 'system', content: SYSTEM },
      { role: 'user', content: 'A cup of black tea.' },
    ]);
  });

  it('sends no system message for a blank system text', () => {
    const request = buildOpenAiCompat(input({ system: '' }));
    expect(sentBody(request).messages).toEqual([{ role: 'user', content: 'Estimate this plate.' }]);
  });

  it('sends the model id trimmed', () => {
    const request = buildOpenAiCompat(input({ provider: 'custom', model: '  my-model:8b ' }));
    expect(sentBody(request)).toMatchObject({ model: 'my-model:8b' });
  });
});

describe('readOpenAiCompat (R03.11)', () => {
  it('reads string content, trimmed, and ignores reasoning next to it', () => {
    const reply = openAiAnswer('  {"dish":"granola"}  ', { reasoning: 'Weighing the bowl.' });
    expect(readOpenAiCompat(200, body(reply))).toEqual({ ok: true, value: '{"dish":"granola"}' });
  });

  it('joins the trimmed, non-empty texts of a parts list with newlines', () => {
    const reply = openAiAnswer([' {"dish": ', '  ', '"miso soup"} ']);
    expect(readOpenAiCompat(200, body(reply))).toEqual({
      ok: true,
      value: '{"dish":\n"miso soup"}',
    });
  });

  it('reads the reply the transport brought back', async () => {
    const { reply } = await sendBuilt(buildOpenAiCompat(input()), {
      json: openAiAnswer('{"dish":"pasta"}'),
    });
    expect(readOpenAiCompat(reply.status, reply.body)).toEqual({
      ok: true,
      value: '{"dish":"pasta"}',
    });
  });

  it.each([
    ['reasoning', openAiAnswer(null, { reasoning: 'Counting the slices.' })],
    ['reasoning_content', openAiAnswer('', { reasoningContent: 'Counting the slices.' })],
    ['reasoning_details', openAiAnswer(null, { reasoningDetails: ['Counting the slices.'] })],
  ])('reads a reply with only %s as cut off', (_, reply) => {
    expect(readOpenAiCompat(200, body(reply))).toEqual({ ok: false, error: { kind: 'truncated' } });
  });

  it('reads a length stop as cut off, even with part of an answer', () => {
    const reply = openAiAnswer('{"dish":"pas', { finishReason: 'length' });
    expect(readOpenAiCompat(200, body(reply))).toEqual({ ok: false, error: { kind: 'truncated' } });
  });

  it('classifies an error inside a success reply, with status 0', () => {
    const quota = openAiError('You exceeded your current quota for this month.', {
      type: 'insufficient_quota',
    });
    const inBody = readOpenAiCompat(200, body(quota));
    expect(inBody).toMatchObject({ ok: false, error: { kind: 'quota', status: 0 } });

    const credit = readOpenAiCompat(
      200,
      body(stringError('Insufficient credits on this account.')),
    );
    expect(credit).toMatchObject({ ok: false, error: { kind: 'credits', status: 0 } });

    const failedChoice = openAiAnswer(null, { finishReason: 'error' });
    expect(readOpenAiCompat(200, body(failedChoice))).toMatchObject({
      ok: false,
      error: { kind: 'generic', status: 0 },
    });
  });

  it('keeps the key out of the detail of an in-body error', () => {
    const reply = openAiError(`Key ${KEY} has no quota left; quota exceeded.`);
    const result = readOpenAiCompat(200, body(reply), { secrets: [KEY] });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe('quota');
    expect(result.error.detail).not.toContain(KEY);
  });

  it.each([
    ['a body that is not JSON', 'Service temporarily unavailable'],
    ['no choices', body({ id: 'chat-reply-1', object: 'chat.completion' })],
    ['an empty choice list', body({ choices: [] })],
    ['a choice without a message', body({ choices: [{ index: 0, finish_reason: 'stop' }] })],
    ['null content and no reasoning', body(openAiAnswer(null))],
    ['blank content', body(openAiAnswer('  \n'))],
    ['a parts list without text', body(openAiAnswer(['', '  ']))],
  ])('reads %s as unusable', (_, text) => {
    expect(readOpenAiCompat(200, text)).toEqual({ ok: false, error: { kind: 'invalidResponse' } });
  });

  it('classifies an error status from the body shapes vendors use', () => {
    expect(readOpenAiCompat(401, body(openAiError('Incorrect API key provided.')))).toMatchObject({
      error: { kind: 'keyRejected', status: 401 },
    });
    expect(readOpenAiCompat(429, body(detailError('Too many requests, slow down.')))).toMatchObject(
      {
        error: { kind: 'rateLimit' },
      },
    );
    expect(readOpenAiCompat(402, 'Insufficient Balance')).toMatchObject({
      error: { kind: 'credits' },
    });
  });
});
