import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useFakeTime } from '../../test/time';
import type { WireRequest } from '../adapters/request';
import type { ProviderId } from '../catalog/providers';
import { startDeadline } from '../deadline';
import { fakeFetch, type FakeFetch } from '../testing/fakeFetch';
import { openAiToolCalls } from '../testing/toolWire';
import { openAiAnswer, openAiError } from '../testing/wire';
import { chatReasoning, openAiChat, toolReasoningEffort } from './openaiChat';
import { askRound } from './round';
import {
  NAMELESS_CALL_RESULT,
  type ChatOpening,
  type ChatSetup,
  type RoundReply,
  type ToolSchema,
  type ToolsReply,
  type Transcript,
} from './types';

const START = '2026-10-27T09:00:00Z';
const OPENAI = 'https://api.openai.com/v1';
const OPENROUTER = 'https://openrouter.ai/api/v1';
const KEY = 'oa-chat-4417';
const SYSTEM = 'You coach one person on food and weight.\n\nNotes: I train in the mornings.';
const PHOTO = '/9j/4AAQcoachPhoto';

const TOOLS: readonly ToolSchema[] = [
  {
    name: 'food_log',
    description: 'Entries logged between two days.',
    parameters: {
      type: 'object',
      properties: { from: { type: 'string' }, to: { type: 'string' } },
    },
  },
  {
    name: 'weight_log',
    description: 'Weigh-ins between two days.',
    parameters: { type: 'object', properties: { limit: { type: 'integer' } } },
  },
];

const OPENING: ChatOpening = {
  history: [
    { role: 'user', text: 'How was last week?' },
    { role: 'assistant', text: 'You averaged 1 850 kcal a day.' },
  ],
  text: 'What did I eat yesterday?',
};

const setup = (changes: Partial<ChatSetup> = {}): ChatSetup => ({
  provider: 'openai',
  baseUrl: OPENAI,
  model: 'gpt-5.6-terra',
  key: KEY,
  system: SYSTEM,
  tools: TOOLS,
  maxTokens: 900,
  ...changes,
});

const bodyOf = (request: WireRequest): Record<string, unknown> =>
  JSON.parse(String(request.init.body)) as Record<string, unknown>;

const json = (value: unknown): string => JSON.stringify(value);

/** The first choice's message of a reply body. */
const messageOf = (body: unknown): unknown =>
  (body as { choices: { message: unknown }[] }).choices[0]?.message;

/** Reads a reply that must ask for tools. */
function toolsFrom(body: unknown): ToolsReply {
  const read = openAiChat.read(200, json(body));
  if (!read.ok || read.value.kind !== 'tools') throw new Error('expected a tools reply');
  return read.value;
}

/** One round through the fake fetch, under a deadline of its own. */
async function round(fake: FakeFetch, chat: ChatSetup, transcript: Transcript) {
  const deadline = startDeadline({ timeoutSeconds: 180 });
  try {
    return await askRound(openAiChat, chat, transcript, {
      fetch: fake.fetch,
      deadline,
      secrets: [KEY],
    });
  } finally {
    deadline.end();
  }
}

const sentBodies = (fake: FakeFetch) => fake.requests.map((request) => request.body);

beforeEach(() => {
  useFakeTime(START);
});

describe('openAiChat.build: body', () => {
  it('sends the system text, the history as strings, the question, the tools and auto choice', () => {
    const body = bodyOf(openAiChat.build(setup(), openAiChat.open(OPENING), false));
    expect(body).toEqual({
      model: 'gpt-5.6-terra',
      messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: 'How was last week?' },
        { role: 'assistant', content: 'You averaged 1 850 kcal a day.' },
        { role: 'user', content: 'What did I eat yesterday?' },
      ],
      tools: TOOLS.map((tool) => ({
        type: 'function',
        function: { name: tool.name, description: tool.description, parameters: tool.parameters },
      })),
      tool_choice: 'auto',
      max_completion_tokens: 900,
    });
  });

  it('sends a photo as an image part before the text part', () => {
    const transcript = openAiChat.open({
      history: [],
      text: 'Is this a good lunch?',
      image: PHOTO,
    });
    expect(transcript).toEqual([
      {
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${PHOTO}` } },
          { type: 'text', text: 'Is this a good lunch?' },
        ],
      },
    ]);
  });

  it('reads a past model message as the assistant', () => {
    const transcript = openAiChat.open({
      history: [
        { role: 'user', text: 'Hi' },
        { role: 'model', text: 'Hello' },
      ],
      text: 'Thanks',
    });
    expect(transcript.map((message) => message.role)).toEqual(['user', 'assistant', 'user']);
  });

  it.each<[ProviderId, string, string]>([
    ['openai', 'gpt-4.1-mini', 'max_completion_tokens'],
    ['custom', 'Vendor/GPT-5.4-mini', 'max_completion_tokens'],
    ['custom', 'llama3.3', 'max_tokens'],
    ['mistral', 'mistral-large-latest', 'max_tokens'],
  ])('names the token cap as P03-08 does: %s %s → %s (R03.10)', (provider, model, field) => {
    const body = bodyOf(openAiChat.build(setup({ provider, model }), [], false));
    expect(body[field]).toBe(900);
    expect(Object.keys(body).filter((key) => key.startsWith('max_'))).toEqual([field]);
  });

  it('turns Qwen thinking off', () => {
    const body = bodyOf(
      openAiChat.build(setup({ provider: 'qwen', model: 'qwen3-plus' }), [], false),
    );
    expect(body.enable_thinking).toBe(false);
    expect(bodyOf(openAiChat.build(setup(), [], false))).not.toHaveProperty('enable_thinking');
  });

  it('leaves out the system message when the system text is blank, and the tools when none', () => {
    const body = bodyOf(openAiChat.build(setup({ system: '  ', tools: [] }), [], false));
    expect(body.messages).toEqual([]);
    expect(body).not.toHaveProperty('tools');
    expect(body).not.toHaveProperty('tool_choice');
  });

  it('sends the key as a Bearer token, OpenRouter attribution, and no key for Ollama', () => {
    const openai = openAiChat.build(setup(), [], false);
    expect(openai.url).toBe(`${OPENAI}/chat/completions`);
    expect(openai.init.headers).toEqual({
      'Content-Type': 'application/json',
      Authorization: `Bearer ${KEY}`,
    });
    const router = openAiChat.build(
      setup({ provider: 'openrouter', baseUrl: OPENROUTER }),
      [],
      false,
    );
    expect(router.init.headers).toMatchObject({
      'HTTP-Referer': expect.any(String),
      'X-Title': 'Platewise',
    });
    const ollama = openAiChat.build(
      setup({ provider: 'ollama', baseUrl: 'http://localhost:11434/v1/', key: undefined }),
      [],
      false,
    );
    expect(ollama.url).toBe('http://localhost:11434/v1/chat/completions');
    expect(ollama.init.headers).toEqual({ 'Content-Type': 'application/json' });
  });
});

describe('openAiChat.build: reasoning switches', () => {
  it.each<[ProviderId, string]>([
    ['openai', 'gpt-6-luna'],
    ['openai', 'gpt-6-sol'],
    ['custom', '  OpenAI/GPT-6-LUNA  '],
    ['custom', 'gateway/gpt-6-sol-2026-08-01'],
  ])('sends reasoning_effort none to %s %j so it can call tools', (provider, model) => {
    expect(toolReasoningEffort({ provider, model })).toBe('none');
    const body = bodyOf(openAiChat.build(setup({ provider, model }), [], false));
    expect(body.reasoning_effort).toBe('none');
  });

  it.each<[ProviderId, string]>([
    ['openai', 'gpt-6-solar'],
    ['openai', 'gpt-6.1-sol'],
    ['openai', 'gpt-6'],
    ['openrouter', 'openai/gpt-6-luna'],
    ['deepinfra', 'gpt-6-sol'],
  ])('sends no reasoning_effort to %s %j', (provider, model) => {
    expect(toolReasoningEffort({ provider, model })).toBeNull();
    const body = bodyOf(openAiChat.build(setup({ provider, model }), [], false));
    expect(body).not.toHaveProperty('reasoning_effort');
  });

  it('names the OpenRouter effort on a normal round and leaves the reasoning in the reply', () => {
    const router = setup({ provider: 'openrouter', baseUrl: OPENROUTER, model: 'openai/gpt-5.6' });
    expect(chatReasoning({ ...router, openRouterEffort: 'high' }, false)).toEqual({
      effort: 'high',
    });
    expect(chatReasoning({ ...router, openRouterEffort: 'auto' }, false)).toBeUndefined();
    expect(chatReasoning(router, false)).toBeUndefined();
    const body = bodyOf(openAiChat.build({ ...router, openRouterEffort: 'high' }, [], false));
    expect(body.reasoning).toEqual({ effort: 'high' });
    expect(bodyOf(openAiChat.build(router, [], false))).not.toHaveProperty('reasoning');
  });

  it('hides OpenRouter reasoning and asks for low effort on the compact re-ask (R04.18)', () => {
    const router = setup({
      provider: 'openrouter',
      baseUrl: OPENROUTER,
      openRouterEffort: 'xhigh',
    });
    const body = bodyOf(openAiChat.build(router, [], true));
    expect(body.reasoning).toEqual({ exclude: true, effort: 'low' });
  });

  it('sends the same body on the re-ask to every provider but OpenRouter (R04.18)', () => {
    for (const provider of ['openai', 'mistral', 'qwen', 'groq'] as const) {
      const chat = setup({ provider });
      const transcript = openAiChat.open(OPENING);
      expect(openAiChat.build(chat, transcript, true)).toEqual(
        openAiChat.build(chat, transcript, false),
      );
    }
  });
});

describe('openAiChat.read', () => {
  it('reads two tool calls in order, with the assistant message as it came', () => {
    const body = openAiToolCalls([
      { id: 'call_a1', name: 'food_log', args: { from: '2026-10-26', to: '2026-10-26' } },
      { id: 'call_b2', name: 'weight_log', args: { limit: 5 } },
    ]);
    const reply = toolsFrom(body);
    expect(reply.calls).toEqual([
      { id: 'call_a1', name: 'food_log', args: { from: '2026-10-26', to: '2026-10-26' } },
      { id: 'call_b2', name: 'weight_log', args: { limit: 5 } },
    ]);
    expect(reply.echo).toEqual(messageOf(body));
  });

  it('lets tool calls win over text in the same reply', () => {
    const reply = toolsFrom(
      openAiToolCalls([{ id: 'call_c3', name: 'food_log', args: {} }], {
        content: 'Let me look at your log.',
      }),
    );
    expect(reply.calls.map((call) => call.name)).toEqual(['food_log']);
  });

  it.each([
    ['text that is not JSON', '{"from": "2026-10-'],
    ['a JSON array', '["2026-10-26"]'],
    ['an empty string', ''],
  ])('reads arguments given as %s as {}', (_label, args) => {
    const reply = toolsFrom(openAiToolCalls([{ id: 'call_d4', name: 'food_log', args }]));
    expect(reply.calls[0]?.args).toEqual({});
  });

  it('reads missing arguments as {}', () => {
    const reply = toolsFrom(openAiToolCalls([{ id: 'call_e5', name: 'data_overview' }]));
    expect(reply.calls).toEqual([{ id: 'call_e5', name: 'data_overview', args: {} }]);
  });

  it('keeps a call that has an id but no name, so its id can be answered (R04.12)', () => {
    const reply = toolsFrom(
      openAiToolCalls([
        { id: 'call_f6', args: { from: '2026-10-01' } },
        { id: 'call_g7', name: '  ', args: {} },
      ]),
    );
    expect(reply.calls.map((call) => [call.id, call.name])).toEqual([
      ['call_f6', ''],
      ['call_g7', ''],
    ]);
  });

  it('leaves out a call without an id, and finds nothing usable when no call has one', () => {
    const some = toolsFrom(
      openAiToolCalls([
        { name: 'food_log', args: {} },
        { id: 'call_h8', name: 'weight_log', args: {} },
      ]),
    );
    expect(some.calls.map((call) => call.id)).toEqual(['call_h8']);
    const none = openAiChat.read(200, json(openAiToolCalls([{ name: 'food_log', args: {} }])));
    expect(none).toEqual({ ok: false, error: { kind: 'invalidResponse' } });
  });

  it('reads a length stop as cut off, even with tool calls', () => {
    const withCalls = openAiToolCalls([{ id: 'call_i9', name: 'food_log', args: {} }], {
      finishReason: 'length',
    });
    expect(openAiChat.read(200, json(withCalls))).toEqual({
      ok: false,
      error: { kind: 'truncated' },
    });
    const withText = openAiAnswer('You ate', { finishReason: 'length' });
    expect(openAiChat.read(200, json(withText))).toEqual({
      ok: false,
      error: { kind: 'truncated' },
    });
  });

  it('reads a reply that only reasoned as cut off', () => {
    const body = openAiAnswer(null, { reasoningContent: 'The person asks about yesterday…' });
    expect(openAiChat.read(200, json(body))).toEqual({ ok: false, error: { kind: 'truncated' } });
  });

  it('reads the answer as trimmed text, from a string or from parts', () => {
    const expected: RoundReply = { kind: 'answer', text: 'Yesterday you had oats and a curry.' };
    expect(
      openAiChat.read(200, json(openAiAnswer('  Yesterday you had oats and a curry.\n'))),
    ).toEqual({ ok: true, value: expected });
    expect(openAiChat.read(200, json(openAiAnswer(['Yesterday you had', 'oats.'])))).toEqual({
      ok: true,
      value: { kind: 'answer', text: 'Yesterday you had\noats.' },
    });
  });

  it('finds nothing usable in blank content, a missing message or a body that is not JSON', () => {
    const unusable = { ok: false, error: { kind: 'invalidResponse' } };
    expect(openAiChat.read(200, json(openAiAnswer('   ')))).toEqual(unusable);
    expect(openAiChat.read(200, json({ choices: [{ finish_reason: 'stop' }] }))).toEqual(unusable);
    expect(openAiChat.read(200, 'Bad gateway')).toEqual(unusable);
  });

  it('classifies an error inside a success reply and an error status, without the key', () => {
    const inBody = openAiChat.read(200, json(openAiError(`Quota exceeded for ${KEY}`)), {
      secrets: [KEY],
    });
    expect(inBody).toEqual({
      ok: false,
      error: { kind: 'quota', status: 0, detail: 'Quota exceeded for •••' },
    });
    const failed = json({ choices: [{ finish_reason: 'error', message: { content: null } }] });
    expect(openAiChat.read(200, failed)).toMatchObject({ ok: false, error: { kind: 'generic' } });
    expect(openAiChat.read(401, json(openAiError('Incorrect API key')))).toMatchObject({
      ok: false,
      error: { kind: 'keyRejected', status: 401 },
    });
  });
});

describe('openAiChat.continueWith (R04.12)', () => {
  it('appends the assistant message as it came, then one tool message per call, in order', () => {
    const reply = toolsFrom(
      openAiToolCalls([
        { id: 'call_a1', name: 'food_log', args: { from: '2026-10-26' } },
        { id: 'call_b2', name: 'weight_log', args: {} },
      ]),
    );
    const start = openAiChat.open(OPENING);
    const run = vi.fn((call: { name: string }) => json({ tool: call.name, count: 0 }));
    const next = openAiChat.continueWith(start, reply, run);
    expect(next).toEqual([
      ...start,
      reply.echo,
      { role: 'tool', tool_call_id: 'call_a1', content: '{"tool":"food_log","count":0}' },
      { role: 'tool', tool_call_id: 'call_b2', content: '{"tool":"weight_log","count":0}' },
    ]);
    expect(run.mock.calls.map(([call]) => call.name)).toEqual(['food_log', 'weight_log']);
  });

  it('answers a call with an id but no name with an error result, without running it', () => {
    const reply = toolsFrom(
      openAiToolCalls([
        { id: 'call_c3', args: {} },
        { id: 'call_d4', name: 'food_log', args: {} },
      ]),
    );
    const run = vi.fn(() => '{"entries":[]}');
    const next = openAiChat.continueWith([], reply, run);
    expect(next.slice(1)).toEqual([
      { role: 'tool', tool_call_id: 'call_c3', content: NAMELESS_CALL_RESULT },
      { role: 'tool', tool_call_id: 'call_d4', content: '{"entries":[]}' },
    ]);
    expect(run).toHaveBeenCalledTimes(1);
    expect(JSON.parse(NAMELESS_CALL_RESULT)).toEqual({ error: expect.any(String) });
  });

  it('fills in the role of an assistant message that came without one', () => {
    const body = {
      choices: [
        {
          finish_reason: 'tool_calls',
          message: {
            tool_calls: [{ id: 'call_e5', type: 'function', function: { name: 'food_log' } }],
          },
        },
      ],
    };
    expect(toolsFrom(body).echo).toEqual({ role: 'assistant', ...body.choices[0]?.message });
  });
});

describe('askRound on the OpenAI-compatible wire (R04.18)', () => {
  const answer = openAiAnswer('You had porridge, a lentil soup and an apple.');

  it('asks again once after a length stop and takes the second reply', async () => {
    const fake = fakeFetch().on(
      `${OPENAI}/chat/completions`,
      { json: openAiAnswer('You had', { finishReason: 'length' }) },
      { json: answer },
    );
    const result = await round(fake, setup(), openAiChat.open(OPENING));
    expect(result).toEqual({
      ok: true,
      value: { kind: 'answer', text: 'You had porridge, a lentil soup and an apple.' },
    });
    expect(fake.requests).toHaveLength(2);
    expect(sentBodies(fake)[1]).toEqual(sentBodies(fake)[0]);
  });

  it('asks again once after a reply that only reasoned', async () => {
    const fake = fakeFetch().on(
      `${OPENAI}/chat/completions`,
      { json: openAiAnswer(null, { reasoning: 'Thinking about yesterday…' }) },
      { json: answer },
    );
    const result = await round(fake, setup(), openAiChat.open(OPENING));
    expect(result.ok).toBe(true);
    expect(fake.requests).toHaveLength(2);
  });

  it('gives truncated after a second cut, with no third request', async () => {
    const cut = { json: openAiAnswer('You', { finishReason: 'length' }) };
    const fake = fakeFetch().on(`${OPENAI}/chat/completions`, cut, cut);
    const result = await round(fake, setup(), openAiChat.open(OPENING));
    expect(result).toEqual({ ok: false, error: { kind: 'truncated' } });
    expect(fake.requests).toHaveLength(2);
  });

  it('changes only OpenRouter’s reasoning on the re-ask: hidden, low effort', async () => {
    const router = setup({
      provider: 'openrouter',
      baseUrl: OPENROUTER,
      model: 'deepseek/deepseek-v4',
      openRouterEffort: 'medium',
    });
    const fake = fakeFetch().on(
      `${OPENROUTER}/chat/completions`,
      { json: openAiAnswer('You', { finishReason: 'length' }) },
      { json: answer },
    );
    await round(fake, router, openAiChat.open(OPENING));
    const [first, retry] = sentBodies(fake) as Record<string, unknown>[];
    expect(first?.reasoning).toEqual({ effort: 'medium' });
    expect(retry?.reasoning).toEqual({ exclude: true, effort: 'low' });
    expect({ ...retry, reasoning: undefined }).toEqual({ ...first, reasoning: undefined });
  });

  it('runs a tool round then an answer round, the second carrying the echo and the results', async () => {
    const calls = openAiToolCalls([
      { id: 'call_a1', name: 'food_log', args: { from: '2026-10-26', to: '2026-10-26' } },
      { id: 'call_b2', name: 'data_overview', args: {} },
    ]);
    const fake = fakeFetch().on(`${OPENAI}/chat/completions`, { json: calls }, { json: answer });
    const start = openAiChat.open(OPENING);

    const first = await round(fake, setup(), start);
    if (!first.ok || first.value.kind !== 'tools') throw new Error('expected tool calls');
    const next = openAiChat.continueWith(start, first.value, (call) =>
      json({ tool: call.name, items: [] }),
    );
    const second = await round(fake, setup(), next);

    expect(second).toEqual({
      ok: true,
      value: { kind: 'answer', text: 'You had porridge, a lentil soup and an apple.' },
    });
    const sent = sentBodies(fake)[1] as { messages: unknown[] };
    expect(sent.messages.slice(-3)).toEqual([
      messageOf(calls),
      { role: 'tool', tool_call_id: 'call_a1', content: '{"tool":"food_log","items":[]}' },
      { role: 'tool', tool_call_id: 'call_b2', content: '{"tool":"data_overview","items":[]}' },
    ]);
    expect(sent.messages[0]).toEqual({ role: 'system', content: SYSTEM });
  });
});
