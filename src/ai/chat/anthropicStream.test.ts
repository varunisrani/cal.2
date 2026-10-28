import { describe, expect, it } from 'vitest';
import {
  ANTHROPIC_PING,
  anthropicEnd,
  anthropicErrorEvent,
  anthropicStart,
  anthropicTextBlock,
  anthropicTextStream,
  anthropicThinkingBlock,
  anthropicToolBlock,
  streamOf,
} from '../testing/streamWire';
import { anthropicChat } from './anthropicChat';
import { anthropicStream } from './anthropicStream';
import { parseEvents } from './sse';
import type { ToolsReply } from './types';

const KEY = 'an-stream-8812';

/** Feeds a recorded stream's events in order; gives the texts shown and the reply. */
function read(events: readonly string[], secrets: readonly string[] = []) {
  const stream = anthropicStream({ secrets });
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

describe('anthropicStream: text (D-16.106)', () => {
  it('grows the answer with each text delta, through pings, and ends at message_stop', () => {
    const { shown, reply, done } = read(
      anthropicTextStream(['Yesterday ', 'you logged ', '2 080 kcal.\n']),
    );
    expect(shown).toEqual([
      '',
      'Yesterday',
      'Yesterday you logged',
      'Yesterday you logged 2 080 kcal.',
    ]);
    expect(done).toBe(true);
    expect(reply).toEqual({
      ok: true,
      value: { kind: 'answer', text: 'Yesterday you logged 2 080 kcal.' },
    });
  });

  it('never shows thinking', () => {
    const { shown, reply } = read(
      anthropicTextStream(['Fine.'], { thinking: ['The person ', 'asks about…'] }),
    );
    expect(shown).toEqual(['', 'Fine.']);
    expect(reply).toEqual({ ok: true, value: { kind: 'answer', text: 'Fine.' } });
  });

  it('is cut off at a max_tokens stop (R04.15)', () => {
    expect(read(anthropicTextStream(['You had'], { stopReason: 'max_tokens' })).reply).toEqual({
      ok: false,
      error: { kind: 'truncated' },
    });
  });

  it('is unusable when the text is blank', () => {
    expect(read(anthropicTextStream([' ', '\n'])).reply).toEqual({
      ok: false,
      error: { kind: 'invalidResponse' },
    });
  });

  it('takes a stream that ends after its stop reason without message_stop', () => {
    const events = anthropicTextStream(['Two eggs.']).slice(0, -1);
    expect(read(events).reply).toEqual({ ok: true, value: { kind: 'answer', text: 'Two eggs.' } });
  });
});

describe('anthropicStream: failures', () => {
  it('fails as a broken connection when the stream stops before its stop reason', () => {
    const cut = anthropicTextStream(['Yesterday ', 'you']).slice(0, 5);
    const { shown, reply } = read(cut);
    expect(shown.at(-1)).toBe('Yesterday you');
    expect(reply).toEqual({ ok: false, error: { kind: 'connection' } });
  });

  it('classifies an error event by its type, status 0, key cut out, and reads no further', () => {
    const events = [
      anthropicStart(),
      ...anthropicTextBlock(0, ['Your protein']).slice(0, 2),
      anthropicErrorEvent('overloaded_error', `Busy right now (${KEY})`),
      ...anthropicEnd('end_turn'),
    ];
    const { reply, done } = read(events, [KEY]);
    expect(done).toBe(true);
    expect(reply).toEqual({
      ok: false,
      error: { kind: 'overloaded', status: 0, detail: 'Busy right now (•••)' },
    });
  });

  it('reads the other error types as their statuses would', () => {
    const kindOf = (type: string) => {
      const { reply } = read([anthropicStart(), anthropicErrorEvent(type, 'Stopped.')]);
      return reply.ok ? null : reply.error.kind;
    };
    expect(kindOf('rate_limit_error')).toBe('rateLimit');
    expect(kindOf('authentication_error')).toBe('keyRejected');
    expect(kindOf('api_error')).toBe('generic');
    expect(kindOf('something_new')).toBe('generic');
  });
});

describe('anthropicStream: tool rounds', () => {
  const events = [
    anthropicStart(),
    ...anthropicThinkingBlock(0, ['Need yesterday’s ', 'meals.']),
    ...anthropicTextBlock(1, ['Let me check ', 'your log.']),
    ...anthropicToolBlock(2, {
      id: 'toolu_s1',
      name: 'food_log',
      argPieces: ['{"from": "2026-', '10-24", "to": "2026-10-24"}'],
    }),
    ANTHROPIC_PING,
    ...anthropicToolBlock(3, { id: 'toolu_s2', name: 'data_overview', argPieces: [] }),
    ...anthropicEnd('tool_use'),
  ];

  it('shows the text before the calls, then gives the calls with their joined input', () => {
    const { shown } = read(events);
    expect(shown.at(-1)).toBe('Let me check your log.');
    expect(toolsOf(events).calls).toEqual([
      { id: 'toolu_s1', name: 'food_log', args: { from: '2026-10-24', to: '2026-10-24' } },
      { id: 'toolu_s2', name: 'data_overview', args: {} },
    ]);
  });

  it('echoes every block as the whole reply would hold it, thinking with its signature', () => {
    expect(toolsOf(events).echo).toEqual({
      role: 'assistant',
      content: [
        { type: 'thinking', thinking: 'Need yesterday’s meals.', signature: 'c2lnLXN0cmVhbQ==' },
        { type: 'text', text: 'Let me check your log.' },
        {
          type: 'tool_use',
          id: 'toolu_s1',
          name: 'food_log',
          input: { from: '2026-10-24', to: '2026-10-24' },
        },
        { type: 'tool_use', id: 'toolu_s2', name: 'data_overview', input: {} },
      ],
    });
  });

  it('continues the transcript with one tool_result per call (R04.12)', () => {
    const next = anthropicChat.continueWith(
      [{ role: 'user', content: 'Q' }],
      toolsOf(events),
      (call) => JSON.stringify({ tool: call.name }),
    );
    expect(next.at(-1)).toEqual({
      role: 'user',
      content: [
        { type: 'tool_result', tool_use_id: 'toolu_s1', content: '{"tool":"food_log"}' },
        { type: 'tool_result', tool_use_id: 'toolu_s2', content: '{"tool":"data_overview"}' },
      ],
    });
  });

  it('reads malformed input as {}, and is unusable when no block has an id', () => {
    const broken = [
      anthropicStart(),
      ...anthropicToolBlock(0, { id: 'toolu_b', name: 'food_log', argPieces: ['{"from":'] }),
      ...anthropicEnd('tool_use'),
    ];
    expect(toolsOf(broken).calls).toEqual([{ id: 'toolu_b', name: 'food_log', args: {} }]);
    const nameless = [
      anthropicStart(),
      ...anthropicToolBlock(0, { name: 'food_log', argPieces: ['{}'] }),
      ...anthropicEnd('tool_use'),
    ];
    expect(read(nameless).reply).toEqual({ ok: false, error: { kind: 'invalidResponse' } });
  });

  it('is cut off when a tool’s input stops at max_tokens', () => {
    const cut = [
      anthropicStart(),
      ...anthropicToolBlock(0, { id: 'toolu_c', name: 'food_log', argPieces: ['{"fr'] }),
      ...anthropicEnd('max_tokens'),
    ];
    expect(read(cut).reply).toEqual({ ok: false, error: { kind: 'truncated' } });
  });
});

describe('anthropicChat.build with a stream', () => {
  it('adds stream: true to the same request', () => {
    const setup = {
      provider: 'anthropic' as const,
      baseUrl: 'https://api.anthropic.com/v1',
      model: 'claude-sonnet-5',
      key: KEY,
      system: 'Coach.',
      tools: [],
      maxTokens: 800,
    };
    const transcript = anthropicChat.open({ history: [], text: 'Hi' });
    const whole = anthropicChat.build(setup, transcript, false);
    const streamed = anthropicChat.build(setup, transcript, false, true);
    expect(streamed.url).toBe(whole.url);
    expect(streamed.init.headers).toEqual(whole.init.headers);
    expect(JSON.parse(String(streamed.init.body))).toEqual({
      ...JSON.parse(String(whole.init.body)),
      stream: true,
    });
  });
});
