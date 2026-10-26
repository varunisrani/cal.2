import { beforeEach, describe, expect, it } from 'vitest';
import { useFakeTime } from '../../test/time';
import { startDeadline } from '../deadline';
import { fakeFetch, type FakeStep } from '../testing/fakeFetch';
import { anthropicAnswer, anthropicError } from '../testing/wire';
import { send } from '../transport';
import { ANTHROPIC_VERSION, buildAnthropic, readAnthropic } from './anthropic';
import type { AdapterInput, WireRequest } from './request';

const START = '2026-10-26T12:00:00Z';
const BASE = 'https://api.anthropic.com/v1';
const KEY = 'ak-test-5be07d';
const PHOTO_1 = '/9j/2wBDAAEBphotoOne';
const PHOTO_2 = '/9j/2wBDAAICphotoTwo';
const SYSTEM = 'You estimate nutrition from meal photos.\n\nThe person adds: no added sugar.';

const input = (changes: Partial<AdapterInput> = {}): AdapterInput => ({
  provider: 'anthropic',
  baseUrl: BASE,
  model: 'claude-sonnet-5',
  key: KEY,
  system: SYSTEM,
  prompt: 'Estimate this plate.',
  images: [],
  json: true,
  maxTokens: 1_024,
  ...changes,
});

/** Sends a built request through the transport to a fake that answers with `step`. */
async function sendBuilt(request: WireRequest, step: FakeStep = { json: anthropicAnswer('{}') }) {
  const fake = fakeFetch().on(request.url, step);
  const deadline = startDeadline({ timeoutSeconds: 180 });
  const result = await send(request.url, request.init, deadline, 75_000, { fetch: fake.fetch });
  deadline.end();
  const sent = fake.requests[0];
  if (!result.ok || sent === undefined) throw new Error('the fake did not answer');
  return { sent, reply: result.value };
}

const sentBody = (request: WireRequest): Record<string, unknown> =>
  JSON.parse(String(request.init.body)) as Record<string, unknown>;

const body = (value: unknown): string => JSON.stringify(value);

// The transport's timers run on fake time; nothing here waits.
beforeEach(() => {
  useFakeTime(START);
});

describe('buildAnthropic: headers (R03.1)', () => {
  it('sends the browser-access header, the key and the version on every request (ACC-E2-1)', async () => {
    const shapes: readonly Partial<AdapterInput>[] = [
      { images: [PHOTO_1, PHOTO_2] },
      { images: [] },
      { system: '' },
      { json: false, prompt: 'Does this snack fit my day?' },
      { model: 'claude-haiku-4-5', maxTokens: 300 },
      { baseUrl: `${BASE}/` },
    ];
    for (const shape of shapes) {
      const { sent } = await sendBuilt(buildAnthropic(input(shape)));
      expect(sent.headers['anthropic-dangerous-direct-browser-access'], JSON.stringify(shape)).toBe(
        'true',
      );
      expect(sent.headers['x-api-key']).toBe(KEY);
      expect(sent.headers['anthropic-version']).toBe(ANTHROPIC_VERSION);
      expect(sent.headers['content-type']).toBe('application/json');
    }
    expect(ANTHROPIC_VERSION).toBe('2023-06-01');
  });

  it('posts to {base}/messages and keeps the key out of the address', async () => {
    const { sent } = await sendBuilt(
      buildAnthropic(input({ baseUrl: `${BASE}//`, key: ` ${KEY} ` })),
    );
    expect(sent.method).toBe('POST');
    expect(sent.url).toBe(`${BASE}/messages`);
    expect(sent.url).not.toContain(KEY);
    expect(sent.headers['x-api-key']).toBe(KEY);
  });
});

describe('buildAnthropic: body', () => {
  it('sends the model, the limit, the system text and the photos before the text', async () => {
    const { sent } = await sendBuilt(buildAnthropic(input({ images: [PHOTO_1, PHOTO_2] })));
    expect(sent.body).toEqual({
      model: 'claude-sonnet-5',
      max_tokens: 1_024,
      system: SYSTEM,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: PHOTO_1 } },
            { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: PHOTO_2 } },
            { type: 'text', text: 'Estimate this plate.' },
          ],
        },
      ],
    });
  });

  it('carries the notes for the AI in system (D-16.24), and no system for a blank text', () => {
    expect(sentBody(buildAnthropic(input()))).toMatchObject({ system: SYSTEM });
    expect(sentBody(buildAnthropic(input({ system: ' ' })))).not.toHaveProperty('system');
  });

  it('sends a text-only request as one text block', () => {
    const request = buildAnthropic(input({ prompt: 'Half an avocado.' }));
    expect(sentBody(request).messages).toEqual([
      { role: 'user', content: [{ type: 'text', text: 'Half an avocado.' }] },
    ]);
  });
});

describe('readAnthropic', () => {
  it('joins two text blocks with a newline, each trimmed', () => {
    const reply = anthropicAnswer(['  {"dish":"falafel wrap",', '"kcal":540}  ']);
    expect(readAnthropic(200, body(reply))).toEqual({
      ok: true,
      value: '{"dish":"falafel wrap",\n"kcal":540}',
    });
  });

  it('ignores thinking and other non-text blocks, even one holding text', () => {
    const reply = anthropicAnswer('{"dish":"apple"}', {
      thinking: 'One medium apple on a plate.',
      extraBlocks: [
        { type: 'tool_use', id: 'tool-1', name: 'lookup', input: {} },
        { type: 'note', text: 'Not part of the answer.' },
      ],
    });
    expect(readAnthropic(200, body(reply))).toEqual({ ok: true, value: '{"dish":"apple"}' });
  });

  it('reads the reply the transport brought back', async () => {
    const { reply } = await sendBuilt(buildAnthropic(input()), {
      json: anthropicAnswer('{"dish":"porridge"}'),
    });
    expect(readAnthropic(reply.status, reply.body)).toEqual({
      ok: true,
      value: '{"dish":"porridge"}',
    });
  });

  it('reads a max_tokens stop as cut off, with part of an answer or with no text block', () => {
    const partial = anthropicAnswer('{"dish":"fal', { stopReason: 'max_tokens' });
    const thinkingOnly = anthropicAnswer([], {
      thinking: 'Still counting',
      stopReason: 'max_tokens',
    });
    expect(readAnthropic(200, body(partial))).toEqual({ ok: false, error: { kind: 'truncated' } });
    expect(readAnthropic(200, body(thinkingOnly))).toEqual({
      ok: false,
      error: { kind: 'truncated' },
    });
  });

  it.each([
    ['a body that is not JSON', 'gateway timeout'],
    ['no content list', body({ type: 'message', stop_reason: 'end_turn' })],
    ['no blocks', body(anthropicAnswer([]))],
    ['blank text blocks', body(anthropicAnswer(['', '  \n']))],
    ['only a thinking block', body(anthropicAnswer([], { thinking: 'Looking closely.' }))],
  ])('reads %s as unusable', (_, text) => {
    expect(readAnthropic(200, text)).toEqual({ ok: false, error: { kind: 'invalidResponse' } });
  });

  it('classifies an error status and keeps the key out of the detail', () => {
    const refused = anthropicError('authentication_error', `invalid x-api-key ${KEY}`);
    const result = readAnthropic(401, body(refused), { secrets: [KEY] });
    expect(result).toMatchObject({ ok: false, error: { kind: 'keyRejected', status: 401 } });
    if (result.ok) return;
    expect(result.error.detail).not.toContain(KEY);

    const busy = anthropicError('overloaded_error', 'Overloaded');
    expect(readAnthropic(529, body(busy))).toMatchObject({ error: { kind: 'overloaded' } });
  });
});
