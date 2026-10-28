import { describe, expect, it } from 'vitest';
import { geminiChunk, geminiTextStream, sseEvent, streamOf } from '../testing/streamWire';
import { geminiError } from '../testing/wire';
import { geminiChat } from './geminiChat';
import { geminiStream } from './geminiStream';
import { parseEvents } from './sse';
import type { ToolsReply } from './types';

const KEY = 'gm-stream-2207';

/** Feeds a recorded stream's events in order; gives the texts shown and the reply. */
function read(events: readonly string[], secrets: readonly string[] = []) {
  const stream = geminiStream({ secrets });
  const shown: string[] = [];
  for (const event of parseEvents(streamOf(events))) {
    stream.take(event);
    if (shown.at(-1) !== stream.text()) shown.push(stream.text());
    if (stream.done()) break;
  }
  return { shown, reply: stream.finish(), done: stream.done() };
}

function toolsOf(events: readonly string[]): ToolsReply {
  const { reply } = read(events);
  if (!reply.ok || reply.value.kind !== 'tools') throw new Error('expected a tools reply');
  return reply.value;
}

describe('geminiStream: text (D-16.106)', () => {
  it('grows the answer with each response and gives it at the finish', () => {
    const { shown, reply } = read(geminiTextStream(['On average ', '2 210 kcal', ' a day.']));
    expect(shown).toEqual(['On average', 'On average 2 210 kcal', 'On average 2 210 kcal a day.']);
    expect(reply).toEqual({
      ok: true,
      value: { kind: 'answer', text: 'On average 2 210 kcal a day.' },
    });
  });

  it('never shows thought parts', () => {
    const { shown, reply } = read(geminiTextStream(['Fine.'], { thoughts: ['Checking the log'] }));
    expect(shown).toEqual(['', 'Fine.']);
    expect(reply).toEqual({ ok: true, value: { kind: 'answer', text: 'Fine.' } });
  });

  it('is cut off at a MAX_TOKENS finish (R04.15)', () => {
    expect(read(geminiTextStream(['On average'], { finishReason: 'MAX_TOKENS' })).reply).toEqual({
      ok: false,
      error: { kind: 'truncated' },
    });
  });

  it('is unusable for a blocked prompt and for a finish with no text', () => {
    const blocked = [sseEvent({ promptFeedback: { blockReason: 'SAFETY' }, modelVersion: 'm' })];
    expect(read(blocked).reply).toEqual({ ok: false, error: { kind: 'invalidResponse' } });
    expect(read([geminiChunk([], 'SAFETY')]).reply).toEqual({
      ok: false,
      error: { kind: 'invalidResponse' },
    });
  });
});

describe('geminiStream: failures', () => {
  it('fails as a broken connection when the stream ends before a finish reason', () => {
    const cut = geminiTextStream(['On average ', '2 210 kcal', ' a day.']).slice(0, 2);
    const { shown, reply } = read(cut);
    expect(shown.at(-1)).toBe('On average 2 210 kcal');
    expect(reply).toEqual({ ok: false, error: { kind: 'connection' } });
  });

  it('classifies an error object in the stream by its code, status 0, key cut out', () => {
    const events = [
      geminiChunk([{ text: 'On average' }]),
      sseEvent(geminiError(503, 'UNAVAILABLE', `The model is overloaded (${KEY}).`)),
      geminiChunk([{ text: ' never read' }], 'STOP'),
    ];
    const { reply, done } = read(events, [KEY]);
    expect(done).toBe(true);
    expect(reply).toEqual({
      ok: false,
      error: { kind: 'overloaded', status: 0, detail: 'The model is overloaded (•••).' },
    });
  });
});

describe('geminiStream: tool rounds', () => {
  const events = [
    geminiChunk([{ text: 'Let me check.' }]),
    geminiChunk([
      {
        functionCall: { name: 'food_log', args: { from: '2026-10-24' }, id: 'fc-s1' },
        thoughtSignature: 'c2lnLWdlbWluaQ==',
      },
      { functionCall: { name: 'weight_log', args: {} } },
    ]),
    geminiChunk([{ text: '' }], 'STOP'),
  ];

  it('gives the whole function calls, with their ids when they have one', () => {
    expect(toolsOf(events).calls).toEqual([
      { id: 'fc-s1', name: 'food_log', args: { from: '2026-10-24' } },
      { name: 'weight_log', args: {} },
    ]);
    expect(read(events).shown.at(-1)).toBe('Let me check.');
  });

  it('echoes every part exactly as it came, so the signature survives (R04.13)', () => {
    const tools = toolsOf(events);
    expect(tools.echo).toEqual({
      role: 'model',
      parts: [
        { text: 'Let me check.' },
        {
          functionCall: { name: 'food_log', args: { from: '2026-10-24' }, id: 'fc-s1' },
          thoughtSignature: 'c2lnLWdlbWluaQ==',
        },
        { functionCall: { name: 'weight_log', args: {} } },
        { text: '' },
      ],
    });
    const next = geminiChat.continueWith([], tools, () => '{"items":[]}');
    expect(next.at(-1)).toEqual({
      role: 'user',
      parts: [
        {
          functionResponse: {
            name: 'food_log',
            response: { content: { items: [] } },
            id: 'fc-s1',
          },
        },
        { functionResponse: { name: 'weight_log', response: { content: { items: [] } } } },
      ],
    });
  });

  it('is unusable when no call names a tool', () => {
    expect(read([geminiChunk([{ functionCall: { name: ' ', args: {} } }], 'STOP')]).reply).toEqual({
      ok: false,
      error: { kind: 'invalidResponse' },
    });
  });
});

describe('geminiChat.build with a stream', () => {
  it('asks streamGenerateContent for server-sent events, with the same body', () => {
    const setup = {
      provider: 'gemini' as const,
      baseUrl: 'https://generativelanguage.googleapis.com/v1beta/',
      model: 'gemini-3-flash',
      key: KEY,
      system: 'Coach.',
      tools: [],
      maxTokens: 800,
    };
    const transcript = geminiChat.open({ history: [], text: 'Hi' });
    const whole = geminiChat.build(setup, transcript, false);
    const streamed = geminiChat.build(setup, transcript, false, true);
    expect(whole.url).toBe(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash:generateContent',
    );
    expect(streamed.url).toBe(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash:streamGenerateContent?alt=sse',
    );
    expect(streamed.init).toEqual(whole.init);
  });
});
