import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useFakeTime } from '../../test/time';
import type { WireRequest } from '../adapters/request';
import { startDeadline } from '../deadline';
import { fakeFetch, type FakeFetch } from '../testing/fakeFetch';
import { geminiFunctionCalls } from '../testing/toolWire';
import { geminiAnswer, geminiBlocked, geminiError } from '../testing/wire';
import { geminiChat, responseOf } from './geminiChat';
import { askRound } from './round';
import type { ChatOpening, ChatSetup, ToolSchema, ToolsReply, Transcript } from './types';

const START = '2026-10-27T09:00:00Z';
const BASE = 'https://generativelanguage.googleapis.com/v1beta';
const KEY = 'gm-chat-2280';
const MODEL = 'gemini-3.5-flash';
const SYSTEM = 'You coach one person on food and weight.\n\nNotes: I am vegetarian.';
const PHOTO = '/9j/4AAQcoachBowl';

const TOOLS: readonly ToolSchema[] = [
  {
    name: 'food_log',
    description: 'Entries logged between two days.',
    parameters: { type: 'object', properties: { from: { type: 'string' } } },
  },
  {
    name: 'body_fat_log',
    description: 'Body-fat readings between two days.',
    parameters: { type: 'object', properties: {} },
  },
];

const OPENING: ChatOpening = {
  history: [
    { role: 'user', text: 'What is my target?' },
    { role: 'assistant', text: 'About 2 100 kcal a day.' },
  ],
  text: 'Did I hit it yesterday?',
};

const setup = (changes: Partial<ChatSetup> = {}): ChatSetup => ({
  provider: 'gemini',
  baseUrl: BASE,
  model: MODEL,
  key: KEY,
  system: SYSTEM,
  tools: TOOLS,
  maxTokens: 800,
  ...changes,
});

const ROUTE = `${BASE}/models/${MODEL}:generateContent`;

const bodyOf = (request: WireRequest): Record<string, unknown> =>
  JSON.parse(String(request.init.body)) as Record<string, unknown>;

const json = (value: unknown): string => JSON.stringify(value);

/** The parts of a reply body's first candidate. */
const partsOf = (body: unknown): unknown =>
  (body as { candidates: { content: { parts: unknown } }[] }).candidates[0]?.content.parts;

function toolsFrom(body: unknown): ToolsReply {
  const read = geminiChat.read(200, json(body));
  if (!read.ok || read.value.kind !== 'tools') throw new Error('expected a tools reply');
  return read.value;
}

async function round(fake: FakeFetch, chat: ChatSetup, transcript: Transcript) {
  const deadline = startDeadline({ timeoutSeconds: 180 });
  try {
    return await askRound(geminiChat, chat, transcript, {
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

describe('geminiChat.build', () => {
  it('sends the system text, user/model history, the tools and the cap (R04.15)', () => {
    const request = geminiChat.build(setup(), geminiChat.open(OPENING), false);
    expect(request.url).toBe(ROUTE);
    expect(request.init.headers).toEqual({
      'Content-Type': 'application/json',
      'x-goog-api-key': KEY,
    });
    expect(bodyOf(request)).toEqual({
      systemInstruction: { parts: [{ text: SYSTEM }] },
      contents: [
        { role: 'user', parts: [{ text: 'What is my target?' }] },
        { role: 'model', parts: [{ text: 'About 2 100 kcal a day.' }] },
        { role: 'user', parts: [{ text: 'Did I hit it yesterday?' }] },
      ],
      tools: [
        {
          functionDeclarations: TOOLS.map((tool) => ({
            name: tool.name,
            description: tool.description,
            parameters: tool.parameters,
          })),
        },
      ],
      generationConfig: { maxOutputTokens: 800, thinkingConfig: { thinkingLevel: 'minimal' } },
    });
  });

  it('sends the thinking level the food adapter picks, and none for models before 3', () => {
    const level = (model: string) =>
      (
        bodyOf(geminiChat.build(setup({ model }), [], false)).generationConfig as Record<
          string,
          unknown
        >
      ).thinkingConfig;
    expect(level('gemini-3.7-flash')).toEqual({ thinkingLevel: 'low' });
    expect(level('gemini-2.5-flash')).toBeUndefined();
  });

  it('sends the photo part before the text part, and reads a past model message as model', () => {
    expect(
      geminiChat.open({
        history: [{ role: 'model', text: 'Hello' }],
        text: 'What is in this bowl?',
        image: PHOTO,
      }),
    ).toEqual([
      { role: 'model', parts: [{ text: 'Hello' }] },
      {
        role: 'user',
        parts: [
          { inlineData: { mimeType: 'image/jpeg', data: PHOTO } },
          { text: 'What is in this bowl?' },
        ],
      },
    ]);
  });

  it('leaves out a blank system text and an empty tool list, and sends the same body on a re-ask', () => {
    const bare = bodyOf(geminiChat.build(setup({ system: '', tools: [] }), [], false));
    expect(bare).not.toHaveProperty('systemInstruction');
    expect(bare).not.toHaveProperty('tools');
    const transcript = geminiChat.open(OPENING);
    expect(geminiChat.build(setup(), transcript, true)).toEqual(
      geminiChat.build(setup(), transcript, false),
    );
  });
});

describe('geminiChat.read', () => {
  it('reads function calls with their ids and echoes the returned parts unchanged (R04.13)', () => {
    const body = geminiFunctionCalls(
      [
        { id: 'fc-1', name: 'food_log', args: { from: '2026-10-26' } },
        { name: 'body_fat_log', args: {} },
      ],
      { thought: 'Look up yesterday.', text: 'Checking.', signature: 'c2lnLW9uZQ==' },
    );
    const reply = toolsFrom(body);
    expect(reply.calls).toEqual([
      { id: 'fc-1', name: 'food_log', args: { from: '2026-10-26' } },
      { name: 'body_fat_log', args: {} },
    ]);
    expect(reply.echo).toEqual({ role: 'model', parts: partsOf(body) });
    expect(json(reply.echo)).toContain('"thoughtSignature":"c2lnLW9uZQ=="');
  });

  it('leaves out a call without a name, and finds nothing usable when every call lacks one', () => {
    const some = toolsFrom(
      geminiFunctionCalls([{ id: 'fc-2' }, { id: 'fc-3', name: 'food_log', args: {} }]),
    );
    expect(some.calls).toEqual([{ id: 'fc-3', name: 'food_log', args: {} }]);
    expect(geminiChat.read(200, json(geminiFunctionCalls([{ id: 'fc-4' }])))).toEqual({
      ok: false,
      error: { kind: 'invalidResponse' },
    });
  });

  it('joins the text parts that are not thoughts, trimmed', () => {
    const body = geminiAnswer([' Yes, ', 'you had 2 080 kcal. '], { thoughts: ['Sum it.'] });
    expect(geminiChat.read(200, json(body))).toEqual({
      ok: true,
      value: { kind: 'answer', text: 'Yes, you had 2 080 kcal.' },
    });
  });

  it('reads a MAX_TOKENS stop as cut off, with text or with calls (R04.15)', () => {
    const cut = { ok: false, error: { kind: 'truncated' } };
    const text = geminiAnswer('Yes, you', { finishReason: 'MAX_TOKENS' });
    expect(geminiChat.read(200, json(text))).toEqual(cut);
    const calls = geminiFunctionCalls([{ name: 'food_log' }], { finishReason: 'MAX_TOKENS' });
    expect(geminiChat.read(200, json(calls))).toEqual(cut);
  });

  it('finds nothing usable in a blocked prompt, missing parts, only thoughts or blank text', () => {
    const unusable = { ok: false, error: { kind: 'invalidResponse' } };
    expect(geminiChat.read(200, json(geminiBlocked()))).toEqual(unusable);
    expect(geminiChat.read(200, json(geminiAnswer([])))).toEqual(unusable);
    expect(geminiChat.read(200, json(geminiAnswer([], { thoughts: ['Hmm.'] })))).toEqual(unusable);
    expect(geminiChat.read(200, json(geminiAnswer('  ')))).toEqual(unusable);
    expect(geminiChat.read(200, 'not json')).toEqual(unusable);
  });

  it('classifies an error status without the key', () => {
    const body = json(geminiError(400, 'INVALID_ARGUMENT', `API key not valid: ${KEY}`));
    expect(geminiChat.read(400, body, { secrets: [KEY] })).toEqual({
      ok: false,
      error: { kind: 'keyRejected', status: 400, detail: 'API key not valid: •••' },
    });
  });
});

describe('geminiChat.continueWith (R04.13)', () => {
  it('appends the model turn, then one user turn of function responses, ids echoed when given', () => {
    const reply = toolsFrom(
      geminiFunctionCalls([
        { id: 'fc-1', name: 'food_log', args: {} },
        { name: 'body_fat_log', args: {} },
      ]),
    );
    const start = geminiChat.open(OPENING);
    const run = vi.fn((call: { name: string }) => json({ tool: call.name, count: 2 }));
    const next = geminiChat.continueWith(start, reply, run);
    expect(next).toEqual([
      ...start,
      reply.echo,
      {
        role: 'user',
        parts: [
          {
            functionResponse: {
              name: 'food_log',
              response: { content: { tool: 'food_log', count: 2 } },
              id: 'fc-1',
            },
          },
          {
            functionResponse: {
              name: 'body_fat_log',
              response: { content: { tool: 'body_fat_log', count: 2 } },
            },
          },
        ],
      },
    ]);
    const second = (next.at(-1) as { parts: { functionResponse: object }[] }).parts[1];
    expect(second?.functionResponse).not.toHaveProperty('id');
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('keeps a result that is not a JSON object inside an object response', () => {
    expect(responseOf('{"items":[1,2]}')).toEqual({ content: { items: [1, 2] } });
    expect(responseOf('[1,2]')).toEqual({ content: [1, 2] });
    expect(responseOf('result too large')).toEqual({ content: 'result too large' });
    expect(responseOf('')).toEqual({ content: '' });
  });
});

describe('askRound on the Gemini wire (R04.15)', () => {
  const answer = geminiAnswer('Yes, you had 2 080 kcal yesterday.');

  it('asks again once with the same body after a MAX_TOKENS stop', async () => {
    const fake = fakeFetch().on(
      ROUTE,
      { json: geminiAnswer('Yes, you', { finishReason: 'MAX_TOKENS' }) },
      { json: answer },
    );
    expect(await round(fake, setup(), geminiChat.open(OPENING))).toEqual({
      ok: true,
      value: { kind: 'answer', text: 'Yes, you had 2 080 kcal yesterday.' },
    });
    expect(fake.requests).toHaveLength(2);
    expect(fake.requests[1]?.body).toEqual(fake.requests[0]?.body);
  });

  it('gives truncated after a second MAX_TOKENS stop', async () => {
    const cut = { json: geminiAnswer('Yes', { finishReason: 'MAX_TOKENS' }) };
    const fake = fakeFetch().on(ROUTE, cut, cut);
    expect(await round(fake, setup(), geminiChat.open(OPENING))).toEqual({
      ok: false,
      error: { kind: 'truncated' },
    });
    expect(fake.requests).toHaveLength(2);
  });

  it('runs a tool round then an answer round, the second echoing the parts and the responses', async () => {
    const calls = geminiFunctionCalls([{ id: 'fc-9', name: 'food_log', args: {} }], {
      signature: 'c2lnLW5pbmU=',
    });
    const fake = fakeFetch().on(ROUTE, { json: calls }, { json: answer });
    const start = geminiChat.open(OPENING);
    const first = await round(fake, setup(), start);
    if (!first.ok || first.value.kind !== 'tools') throw new Error('expected tool calls');
    const next = geminiChat.continueWith(start, first.value, () => '{"entries":[]}');
    expect((await round(fake, setup(), next)).ok).toBe(true);

    const sent = fake.requests[1]?.body as { contents: unknown[] };
    expect(sent.contents.slice(-2)).toEqual([
      { role: 'model', parts: partsOf(calls) },
      {
        role: 'user',
        parts: [
          {
            functionResponse: {
              name: 'food_log',
              response: { content: { entries: [] } },
              id: 'fc-9',
            },
          },
        ],
      },
    ]);
  });
});
