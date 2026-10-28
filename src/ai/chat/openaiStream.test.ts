import { describe, expect, it } from 'vitest';
import {
  OPENAI_DONE,
  openAiChunk,
  openAiTextStream,
  openAiToolStream,
  sseEvent,
  streamOf,
} from '../testing/streamWire';
import { openAiError } from '../testing/wire';
import { openAiChat } from './openaiChat';
import { openAiStream } from './openaiStream';
import { parseEvents } from './sse';
import type { ToolsReply } from './types';

const KEY = 'oa-stream-4410';

/** Feeds a recorded stream's events in order; gives the texts shown and the reply. */
function read(events: readonly string[], secrets: readonly string[] = []) {
  const stream = openAiStream({ secrets });
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

describe('openAiStream: text (D-16.106)', () => {
  it('grows the answer piece by piece and gives it trimmed at the end', () => {
    const { shown, reply, done } = read(
      openAiTextStream(['\n', 'About ', '1 650 kcal', ' so far today. ', '\n']),
    );
    expect(shown).toEqual(['', 'About', 'About 1 650 kcal', 'About 1 650 kcal so far today.']);
    expect(done).toBe(true);
    expect(reply).toEqual({
      ok: true,
      value: { kind: 'answer', text: 'About 1 650 kcal so far today.' },
    });
  });

  it('takes a reply whose stream ends at its finish reason, without [DONE]', () => {
    const events = openAiTextStream(['Two eggs.']).slice(0, -1);
    expect(read(events).reply).toEqual({ ok: true, value: { kind: 'answer', text: 'Two eggs.' } });
  });

  it('never shows reasoning, and a reply that only reasoned is cut off (R04.18)', () => {
    const { shown, reply } = read(openAiTextStream([], { reasoning: ['Weighing the ', 'log…'] }));
    expect(shown).toEqual(['']);
    expect(reply).toEqual({ ok: false, error: { kind: 'truncated' } });
  });

  it('is cut off at a length stop, text or not', () => {
    expect(read(openAiTextStream(['You had'], { finishReason: 'length' })).reply).toEqual({
      ok: false,
      error: { kind: 'truncated' },
    });
  });

  it('is unusable when it ends with nothing to say', () => {
    expect(read(openAiTextStream(['  '])).reply).toEqual({
      ok: false,
      error: { kind: 'invalidResponse' },
    });
  });

  it('skips lines that are not JSON, and chunks without a choice', () => {
    const events = [
      sseEvent('not json'),
      sseEvent({ object: 'chat.completion.chunk', choices: [] }),
      ...openAiTextStream(['Fine.']),
    ];
    expect(read(events).reply).toEqual({ ok: true, value: { kind: 'answer', text: 'Fine.' } });
  });
});

describe('openAiStream: failures', () => {
  it('fails as a broken connection when the stream stops before its end', () => {
    const cut = openAiTextStream(['About ', '1 650']).slice(0, 3);
    const { shown, reply } = read(cut);
    expect(shown.at(-1)).toBe('About 1 650');
    expect(reply).toEqual({ ok: false, error: { kind: 'connection' } });
  });

  it('classifies an error object in the stream like an error reply, status 0, key cut out', () => {
    const events = [
      openAiChunk({ role: 'assistant', content: '' }),
      openAiChunk({ content: 'Your' }),
      sseEvent(openAiError(`Quota exceeded for key ${KEY}`, { type: 'insufficient_quota' })),
      ...openAiTextStream(['never read']),
    ];
    const { reply, done } = read(events, [KEY]);
    expect(done).toBe(true);
    expect(reply).toEqual({
      ok: false,
      error: { kind: 'quota', status: 0, detail: 'Quota exceeded for key •••' },
    });
  });

  it('classifies a finish_reason of error, status 0', () => {
    const events = [
      openAiChunk({ content: 'Your' }),
      sseEvent({
        choices: [{ index: 0, delta: {}, finish_reason: 'error' }],
        error: { message: 'Upstream provider is overloaded' },
      }),
    ];
    expect(read(events).reply).toEqual({
      ok: false,
      error: { kind: 'generic', status: 0, detail: 'Upstream provider is overloaded' },
    });
  });
});

describe('openAiStream: tool calls', () => {
  it('assembles each call from its pieces and echoes the message as it came (R04.12)', () => {
    const events = openAiToolStream([
      {
        id: 'call_a',
        name: 'food_log',
        argPieces: ['{"from":"2026-', '10-24","to":', '"2026-10-25"}'],
      },
      { id: 'call_b', name: 'data_overview', argPieces: [] },
    ]);
    const tools = toolsOf(events);
    expect(tools.calls).toEqual([
      { id: 'call_a', name: 'food_log', args: { from: '2026-10-24', to: '2026-10-25' } },
      { id: 'call_b', name: 'data_overview', args: {} },
    ]);
    expect(tools.echo).toEqual({
      role: 'assistant',
      content: null,
      tool_calls: [
        {
          id: 'call_a',
          type: 'function',
          function: { name: 'food_log', arguments: '{"from":"2026-10-24","to":"2026-10-25"}' },
        },
        { id: 'call_b', type: 'function', function: { name: 'data_overview', arguments: '' } },
      ],
    });

    const next = openAiChat.continueWith([{ role: 'user', content: 'Q' }], tools, (call) =>
      JSON.stringify({ tool: call.name }),
    );
    expect(next.slice(-2)).toEqual([
      { role: 'tool', tool_call_id: 'call_a', content: '{"tool":"food_log"}' },
      { role: 'tool', tool_call_id: 'call_b', content: '{"tool":"data_overview"}' },
    ]);
  });

  it('shows the text a tool round writes first, and keeps it in the echo', () => {
    const events = openAiToolStream([{ id: 'call_w', name: 'weight_log', argPieces: ['{}'] }], {
      text: ['Let me look ', 'at your weigh-ins.'],
    });
    const { shown } = read(events);
    expect(shown.at(-1)).toBe('Let me look at your weigh-ins.');
    expect(toolsOf(events).echo.content).toBe('Let me look at your weigh-ins.');
  });

  it('reads malformed arguments as {} and answers a call without a name with an error', () => {
    const tools = toolsOf(
      openAiToolStream([
        { id: 'call_x', name: '', argPieces: ['{"from":'] },
        { id: 'call_y', name: 'fasting_log', argPieces: ['{"from":"2026-10-01"'] },
      ]),
    );
    expect(tools.calls).toEqual([
      { id: 'call_x', name: '', args: {} },
      { id: 'call_y', name: 'fasting_log', args: {} },
    ]);
  });

  it('is cut off when the arguments stop at the length limit', () => {
    const events = openAiToolStream([{ id: 'call_l', name: 'food_log', argPieces: ['{"fr'] }], {
      finishReason: 'length',
    });
    expect(read(events).reply).toEqual({ ok: false, error: { kind: 'truncated' } });
  });

  it('is unusable when no call has an id to answer', () => {
    expect(read(openAiToolStream([{ name: 'food_log', argPieces: ['{}'] }])).reply).toEqual({
      ok: false,
      error: { kind: 'invalidResponse' },
    });
  });

  it('follows pieces without an index by their id, and keeps the first name of a repeated one', () => {
    const piece = (call: Record<string, unknown>) =>
      openAiChunk({ tool_calls: [{ type: 'function', ...call }] });
    const events = [
      piece({ id: 'c1', function: { name: 'weight_log', arguments: '{"from":' } }),
      piece({ id: 'c1', function: { name: 'weight_log', arguments: '"2026-10-01"}' } }),
      piece({ id: 'c2', function: { name: 'body_fat_log', arguments: '{}' } }),
      openAiChunk({}, 'tool_calls'),
      OPENAI_DONE,
    ];
    expect(toolsOf(events).calls).toEqual([
      { id: 'c1', name: 'weight_log', args: { from: '2026-10-01' } },
      { id: 'c2', name: 'body_fat_log', args: {} },
    ]);
  });

  it('rebuilds the reasoning in the echo, its detail pieces joined by index', () => {
    const events = [
      openAiChunk({ role: 'assistant', content: null }),
      openAiChunk({ reasoning: 'Need the ' }),
      openAiChunk({ reasoning: 'log.' }),
      openAiChunk({
        reasoning_details: [{ type: 'reasoning.text', text: 'Need the ', index: 0, format: 'f1' }],
      }),
      openAiChunk({ reasoning_details: [{ type: 'reasoning.text', text: 'log.', index: 0 }] }),
      openAiChunk({
        reasoning_details: [{ type: 'reasoning.encrypted', data: 'ZW5j', index: 1 }],
      }),
      ...openAiToolStream([{ id: 'c9', name: 'food_log', argPieces: ['{}'] }]).slice(1),
    ];
    expect(toolsOf(events).echo).toMatchObject({
      reasoning: 'Need the log.',
      reasoning_details: [
        { type: 'reasoning.text', text: 'Need the log.', index: 0, format: 'f1' },
        { type: 'reasoning.encrypted', data: 'ZW5j', index: 1 },
      ],
    });
  });
});

describe('openAiChat.build with a stream', () => {
  it('adds stream: true and nothing else', () => {
    const setup = {
      provider: 'mistral' as const,
      baseUrl: 'https://api.mistral.ai/v1',
      model: 'mistral-large-latest',
      key: KEY,
      system: 'Coach.',
      tools: [],
      maxTokens: 800,
    };
    const transcript = openAiChat.open({ history: [], text: 'Hi' });
    const whole = openAiChat.build(setup, transcript, false);
    const streamed = openAiChat.build(setup, transcript, false, true);
    expect(streamed.url).toBe(whole.url);
    expect(JSON.parse(String(streamed.init.body))).toEqual({
      ...JSON.parse(String(whole.init.body)),
      stream: true,
    });
    expect(JSON.parse(String(whole.init.body))).not.toHaveProperty('stream');
  });
});
