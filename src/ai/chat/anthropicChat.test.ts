import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useFakeTime } from '../../test/time';
import { ANTHROPIC_VERSION } from '../adapters/anthropic';
import type { WireRequest } from '../adapters/request';
import { startDeadline } from '../deadline';
import { fakeFetch, type FakeFetch } from '../testing/fakeFetch';
import { anthropicToolUse } from '../testing/toolWire';
import { anthropicAnswer, anthropicError } from '../testing/wire';
import { anthropicChat } from './anthropicChat';
import { askRound } from './round';
import {
  NAMELESS_CALL_RESULT,
  type ChatOpening,
  type ChatSetup,
  type ToolSchema,
  type ToolsReply,
  type Transcript,
} from './types';

const START = '2026-10-27T09:00:00Z';
const BASE = 'https://api.anthropic.com/v1';
const KEY = 'an-chat-3391';
const SYSTEM = 'You coach one person on food and weight.\n\nNotes: answer in short lines.';
const PHOTO = '/9j/4AAQcoachPlate';

const TOOLS: readonly ToolSchema[] = [
  {
    name: 'daily_energy_totals',
    description: 'Energy per logged day between two days.',
    parameters: { type: 'object', properties: { from: { type: 'string' } } },
  },
  {
    name: 'fasting_log',
    description: 'Tracked fasts between two days.',
    parameters: { type: 'object', properties: {} },
  },
];

const OPENING: ChatOpening = {
  history: [
    { role: 'user', text: 'Am I on track?' },
    { role: 'assistant', text: 'Yes, 0.4 kg a week down.' },
  ],
  text: 'How many days did I log this month?',
};

const setup = (changes: Partial<ChatSetup> = {}): ChatSetup => ({
  provider: 'anthropic',
  baseUrl: BASE,
  model: 'claude-sonnet-5',
  key: KEY,
  system: SYSTEM,
  tools: TOOLS,
  maxTokens: 700,
  ...changes,
});

const bodyOf = (request: WireRequest): Record<string, unknown> =>
  JSON.parse(String(request.init.body)) as Record<string, unknown>;

const json = (value: unknown): string => JSON.stringify(value);

function toolsFrom(body: unknown): ToolsReply {
  const read = anthropicChat.read(200, json(body));
  if (!read.ok || read.value.kind !== 'tools') throw new Error('expected a tools reply');
  return read.value;
}

async function round(fake: FakeFetch, chat: ChatSetup, transcript: Transcript) {
  const deadline = startDeadline({ timeoutSeconds: 180 });
  try {
    return await askRound(anthropicChat, chat, transcript, {
      fetch: fake.fetch,
      deadline,
      secrets: [KEY],
    });
  } finally {
    deadline.end();
  }
}

beforeEach(() => {
  useFakeTime(START);
});

describe('anthropicChat.build', () => {
  it('sends the browser-access header, the key and the version on every round (R03.1)', () => {
    const shapes: readonly [ChatSetup, Transcript, boolean][] = [
      [setup(), anthropicChat.open(OPENING), false],
      [setup(), anthropicChat.open(OPENING), true],
      [setup({ system: '', tools: [] }), [], false],
      [
        setup({ baseUrl: `${BASE}/` }),
        anthropicChat.open({ history: [], text: 'Hi', image: PHOTO }),
        false,
      ],
    ];
    for (const [chat, transcript, compact] of shapes) {
      const request = anthropicChat.build(chat, transcript, compact);
      expect(request.url).toBe(`${BASE}/messages`);
      expect(request.init.headers).toEqual({
        'Content-Type': 'application/json',
        'x-api-key': KEY,
        'anthropic-version': ANTHROPIC_VERSION,
        'anthropic-dangerous-direct-browser-access': 'true',
      });
    }
  });

  it('sends the model, the cap as max_tokens, the system text, the tools and the conversation', () => {
    const body = bodyOf(anthropicChat.build(setup(), anthropicChat.open(OPENING), false));
    expect(body).toEqual({
      model: 'claude-sonnet-5',
      max_tokens: 700,
      system: SYSTEM,
      tools: TOOLS.map((tool) => ({
        name: tool.name,
        description: tool.description,
        input_schema: tool.parameters,
      })),
      messages: [
        { role: 'user', content: 'Am I on track?' },
        { role: 'assistant', content: 'Yes, 0.4 kg a week down.' },
        { role: 'user', content: 'How many days did I log this month?' },
      ],
    });
  });

  it('sends a photo as an image block before the text block', () => {
    expect(
      anthropicChat.open({ history: [], text: 'Is this enough protein?', image: PHOTO }),
    ).toEqual([
      {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: PHOTO } },
          { type: 'text', text: 'Is this enough protein?' },
        ],
      },
    ]);
  });

  it('leaves out a blank system text and an empty tool list, and sends the same body on a re-ask', () => {
    const bare = bodyOf(anthropicChat.build(setup({ system: ' ', tools: [] }), [], false));
    expect(bare).not.toHaveProperty('system');
    expect(bare).not.toHaveProperty('tools');
    const transcript = anthropicChat.open(OPENING);
    expect(anthropicChat.build(setup(), transcript, true)).toEqual(
      anthropicChat.build(setup(), transcript, false),
    );
  });
});

describe('anthropicChat.read', () => {
  it('reads two tool_use blocks in order, with the content array as it came', () => {
    const body = anthropicToolUse(
      [
        { id: 'toolu_01', name: 'daily_energy_totals', args: { from: '2026-10-01' } },
        { id: 'toolu_02', name: 'fasting_log', args: {} },
      ],
      { thinking: 'Two lookups will do.', text: 'Let me check your log.' },
    );
    const reply = toolsFrom(body);
    expect(reply.calls).toEqual([
      { id: 'toolu_01', name: 'daily_energy_totals', args: { from: '2026-10-01' } },
      { id: 'toolu_02', name: 'fasting_log', args: {} },
    ]);
    expect(reply.echo).toEqual({ role: 'assistant', content: body.content });
  });

  it('reads input that is missing or not an object as {}', () => {
    const body = {
      content: [{ type: 'tool_use', id: 'toolu_03', name: 'fasting_log', input: 'today' }],
      stop_reason: 'tool_use',
    };
    expect(toolsFrom(body).calls).toEqual([{ id: 'toolu_03', name: 'fasting_log', args: {} }]);
  });

  it('keeps a tool_use with an id but no name; finds nothing usable when no block has an id', () => {
    expect(toolsFrom(anthropicToolUse([{ id: 'toolu_04' }])).calls).toEqual([
      { id: 'toolu_04', name: '', args: {} },
    ]);
    expect(anthropicChat.read(200, json(anthropicToolUse([{ name: 'fasting_log' }])))).toEqual({
      ok: false,
      error: { kind: 'invalidResponse' },
    });
  });

  it('takes the first text block that is not blank as the answer, trimmed', () => {
    const body = anthropicAnswer(['  ', ' You logged 21 days this month. ', 'More text.'], {
      thinking: 'Count the days.',
    });
    expect(anthropicChat.read(200, json(body))).toEqual({
      ok: true,
      value: { kind: 'answer', text: 'You logged 21 days this month.' },
    });
  });

  it('reads a max_tokens stop as cut off, with text or with a tool_use (R04.15)', () => {
    const cut = { ok: false, error: { kind: 'truncated' } };
    const text = anthropicAnswer('You logged', { stopReason: 'max_tokens' });
    expect(anthropicChat.read(200, json(text))).toEqual(cut);
    const tool = anthropicToolUse([{ id: 'toolu_05', name: 'fasting_log' }], {
      stopReason: 'max_tokens',
    });
    expect(anthropicChat.read(200, json(tool))).toEqual(cut);
  });

  it('finds nothing usable in blank text, missing content or a body that is not JSON', () => {
    const unusable = { ok: false, error: { kind: 'invalidResponse' } };
    expect(anthropicChat.read(200, json(anthropicAnswer('   ')))).toEqual(unusable);
    expect(anthropicChat.read(200, json({ stop_reason: 'end_turn' }))).toEqual(unusable);
    expect(anthropicChat.read(200, '<html>')).toEqual(unusable);
  });

  it('classifies an error status without the key', () => {
    const body = json(anthropicError('authentication_error', `invalid x-api-key ${KEY}`));
    expect(anthropicChat.read(401, body, { secrets: [KEY] })).toEqual({
      ok: false,
      error: { kind: 'keyRejected', status: 401, detail: 'invalid x-api-key •••' },
    });
  });
});

describe('anthropicChat.continueWith (R04.12)', () => {
  it('appends the assistant turn, then one user message with a result per id, in order', () => {
    const reply = toolsFrom(
      anthropicToolUse([
        { id: 'toolu_01', name: 'daily_energy_totals', args: {} },
        { id: 'toolu_02', name: 'fasting_log', args: {} },
      ]),
    );
    const start = anthropicChat.open(OPENING);
    const run = vi.fn((call: { name: string }) => json({ tool: call.name }));
    expect(anthropicChat.continueWith(start, reply, run)).toEqual([
      ...start,
      reply.echo,
      {
        role: 'user',
        content: [
          {
            type: 'tool_result',
            tool_use_id: 'toolu_01',
            content: '{"tool":"daily_energy_totals"}',
          },
          { type: 'tool_result', tool_use_id: 'toolu_02', content: '{"tool":"fasting_log"}' },
        ],
      },
    ]);
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('answers a tool_use without a name with an error result, without running it', () => {
    const reply = toolsFrom(
      anthropicToolUse([{ id: 'toolu_06' }, { id: 'toolu_07', name: 'fasting_log' }]),
    );
    const run = vi.fn(() => '{"fasts":[]}');
    const [, results] = anthropicChat.continueWith([], reply, run);
    expect(results).toEqual({
      role: 'user',
      content: [
        {
          type: 'tool_result',
          tool_use_id: 'toolu_06',
          content: NAMELESS_CALL_RESULT,
          is_error: true,
        },
        { type: 'tool_result', tool_use_id: 'toolu_07', content: '{"fasts":[]}' },
      ],
    });
    expect(run).toHaveBeenCalledTimes(1);
  });
});

describe('askRound on the Anthropic wire (R04.15)', () => {
  const ROUTE = `${BASE}/messages`;
  const answer = anthropicAnswer('You logged 21 days this month.');

  it('asks again once with the same body after a max_tokens stop', async () => {
    const fake = fakeFetch().on(
      ROUTE,
      { json: anthropicAnswer('You logged', { stopReason: 'max_tokens' }) },
      { json: answer },
    );
    const result = await round(fake, setup(), anthropicChat.open(OPENING));
    expect(result).toEqual({
      ok: true,
      value: { kind: 'answer', text: 'You logged 21 days this month.' },
    });
    expect(fake.requests).toHaveLength(2);
    expect(fake.requests[1]?.body).toEqual(fake.requests[0]?.body);
    expect(fake.requests[1]?.headers['anthropic-dangerous-direct-browser-access']).toBe('true');
  });

  it('gives truncated after a second max_tokens stop', async () => {
    const cut = { json: anthropicAnswer('You', { stopReason: 'max_tokens' }) };
    const fake = fakeFetch().on(ROUTE, cut, cut);
    expect(await round(fake, setup(), anthropicChat.open(OPENING))).toEqual({
      ok: false,
      error: { kind: 'truncated' },
    });
    expect(fake.requests).toHaveLength(2);
  });

  it('runs a tool round then an answer round, the second carrying the turn and the results', async () => {
    const calls = anthropicToolUse([{ id: 'toolu_01', name: 'daily_energy_totals', args: {} }], {
      text: 'Checking.',
    });
    const fake = fakeFetch().on(ROUTE, { json: calls }, { json: answer });
    const start = anthropicChat.open(OPENING);
    const first = await round(fake, setup(), start);
    if (!first.ok || first.value.kind !== 'tools') throw new Error('expected tool calls');
    const next = anthropicChat.continueWith(start, first.value, () => '{"days":[]}');
    expect((await round(fake, setup(), next)).ok).toBe(true);

    const sent = fake.requests[1]?.body as { messages: unknown[] };
    expect(sent.messages.slice(-2)).toEqual([
      { role: 'assistant', content: calls.content },
      {
        role: 'user',
        content: [{ type: 'tool_result', tool_use_id: 'toolu_01', content: '{"days":[]}' }],
      },
    ]);
  });
});
