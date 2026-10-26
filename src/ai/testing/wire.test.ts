import { describe, expect, it } from 'vitest';
import { classify } from '../errors';
import { createFakeFetch, jsonReply } from './fakeFetch';
import {
  anthropicBlock,
  anthropicError,
  anthropicReply,
  detailError,
  geminiError,
  geminiPart,
  geminiReply,
  openAiError,
  openAiPart,
  openAiReply,
  stringError,
} from './wire';

describe('geminiReply', () => {
  it('builds one candidate with text, thought and call parts and a finish reason', () => {
    const body = geminiReply(
      [
        geminiPart.thought('Wire test: weighing the plate.'),
        geminiPart.text('{"name":'),
        geminiPart.text('"toast"}'),
        geminiPart.call('food_log', { limit: 3 }),
      ],
      { finishReason: 'MAX_TOKENS' },
    );
    expect(body.candidates).toHaveLength(1);
    expect(body.candidates[0]).toMatchObject({
      finishReason: 'MAX_TOKENS',
      content: {
        role: 'model',
        parts: [
          { text: 'Wire test: weighing the plate.', thought: true },
          { text: '{"name":' },
          { text: '"toast"}' },
          { functionCall: { name: 'food_log', args: { limit: 3 } } },
        ],
      },
    });
    expect(body.usageMetadata).toHaveProperty('totalTokenCount');
  });

  it('defaults to one text part and STOP, and leaves parts out when there are none', () => {
    expect(geminiReply('plain').candidates[0]).toMatchObject({
      finishReason: 'STOP',
      content: { parts: [{ text: 'plain' }] },
    });
    expect(geminiReply([], { finishReason: 'MAX_TOKENS' }).candidates[0]?.content).toEqual({
      role: 'model',
    });
  });
});

describe('openAiReply', () => {
  it('carries string, parts or null content with a finish reason', () => {
    expect(openAiReply('Wire test: done.').choices[0]).toMatchObject({
      message: { role: 'assistant', content: 'Wire test: done.' },
      finish_reason: 'stop',
    });
    const parts = openAiReply([openAiPart.text(' one '), openAiPart.text('two')], {
      finishReason: 'length',
    });
    expect(parts.choices[0]).toMatchObject({
      message: {
        content: [
          { type: 'text', text: ' one ' },
          { type: 'text', text: 'two' },
        ],
      },
      finish_reason: 'length',
    });
    expect(openAiReply(null).choices[0]?.message.content).toBeNull();
    expect(parts.object).toBe('chat.completion');
  });

  it('puts reasoning in the field the provider uses', () => {
    const text = 'Wire test: thinking it over.';
    expect(
      openAiReply('', { reasoning: { field: 'reasoning', text } }).choices[0]?.message,
    ).toHaveProperty('reasoning', text);
    expect(
      openAiReply(null, { reasoning: { field: 'reasoning_content', text } }).choices[0]?.message,
    ).toHaveProperty('reasoning_content', text);
    expect(
      openAiReply(null, { reasoning: { field: 'reasoning_details', text } }).choices[0]?.message,
    ).toHaveProperty('reasoning_details', [{ type: 'reasoning.text', text }]);
  });

  it('carries tool calls with JSON-text arguments, and an error on the choice', () => {
    const calls = openAiReply(null, { toolCalls: [{ name: 'food_log', args: { limit: 2 } }] });
    expect(calls.choices[0]).toMatchObject({
      finish_reason: 'tool_calls',
      message: {
        tool_calls: [
          {
            id: 'call_wire_1',
            type: 'function',
            function: { name: 'food_log', arguments: '{"limit":2}' },
          },
        ],
      },
    });
    const failed = openAiReply('', {
      choiceError: { message: 'Wire test: upstream broke.', code: 502 },
    });
    expect(failed.choices[0]).toMatchObject({
      finish_reason: 'error',
      error: { message: 'Wire test: upstream broke.', code: 502 },
    });
  });
});

describe('anthropicReply', () => {
  it('builds content blocks with a stop reason', () => {
    const body = anthropicReply(
      [
        anthropicBlock.thinking('Wire test: hmm.'),
        anthropicBlock.text('first'),
        anthropicBlock.text('second'),
      ],
      { stopReason: 'max_tokens' },
    );
    expect(body).toMatchObject({ type: 'message', role: 'assistant', stop_reason: 'max_tokens' });
    expect(body.content.map((block) => block.type)).toEqual(['thinking', 'text', 'text']);
    expect(anthropicReply('only').stop_reason).toBe('end_turn');
    expect(anthropicReply([anthropicBlock.toolUse('food_log', { limit: 1 })]).stop_reason).toBe(
      'tool_use',
    );
  });
});

describe('error bodies', () => {
  it('have the shapes the classifier reads, and travel through the fake fetch', async () => {
    const net = createFakeFetch();
    net.on('/models/').reply(
      jsonReply(
        geminiError({
          code: 429,
          status: 'RESOURCE_EXHAUSTED',
          message: 'Wire test: come back later.',
          quotaId: 'GenerateRequestsPerDayPerProjectPerModel-FreeTier',
        }),
        { status: 429 },
      ),
    );
    const reply = await net.fetch('https://g.example.test/v1beta/models/m:generateContent');
    expect(classify(reply.status, await reply.text())).toEqual({
      kind: 'dailyQuota',
      status: 429,
      detail: 'Wire test: come back later.',
    });

    expect(openAiError('Wire test: no.', { code: 'invalid_api_key' })).toEqual({
      error: {
        message: 'Wire test: no.',
        type: 'invalid_request_error',
        param: null,
        code: 'invalid_api_key',
      },
    });
    expect(anthropicError('overloaded_error', 'Wire test: busy.')).toMatchObject({
      type: 'error',
      error: { type: 'overloaded_error', message: 'Wire test: busy.' },
    });
    expect(stringError('Wire test: nope.')).toEqual({ error: 'Wire test: nope.' });
    expect(detailError('Wire test: nope.')).toEqual({ detail: 'Wire test: nope.' });
    expect(
      geminiError({
        code: 400,
        status: 'INVALID_ARGUMENT',
        message: 'm',
        reason: 'API_KEY_INVALID',
      }),
    ).toMatchObject({
      error: {
        details: [
          { '@type': 'type.googleapis.com/google.rpc.ErrorInfo', reason: 'API_KEY_INVALID' },
        ],
      },
    });
  });
});
