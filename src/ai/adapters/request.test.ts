import { describe, expect, it } from 'vitest';
import { bareModelId, endpoint, joinTexts, keyOf, openReply, tokenCap } from './request';
import type { AdapterInput } from './request';

const input = (key: string | undefined): AdapterInput => ({
  provider: 'custom',
  baseUrl: 'https://llm.example.test/v1',
  model: 'house-model',
  key,
  system: '',
  prompt: 'Hello',
  images: [],
  json: false,
  maxTokens: 64,
});

describe('shared adapter helpers', () => {
  it('joins the base and the path without a double slash (R03.22)', () => {
    expect(endpoint('https://llm.example.test/v1', '/messages')).toBe(
      'https://llm.example.test/v1/messages',
    );
    expect(endpoint(' https://llm.example.test/v1/// ', '/messages')).toBe(
      'https://llm.example.test/v1/messages',
    );
  });

  it('trims the key and treats a blank one as none (R03.20)', () => {
    expect(keyOf(input(' key-123\n'))).toBe('key-123');
    expect(keyOf(input('   '))).toBeUndefined();
    expect(keyOf(input(''))).toBeUndefined();
    expect(keyOf(input(undefined))).toBeUndefined();
  });

  it('sends the token limit as a whole number, falling back to 8 192 (D-16.65, D-16.104)', () => {
    expect(tokenCap(1)).toBe(1);
    expect(tokenCap(4_096)).toBe(4_096);
    expect(tokenCap(512.7)).toBe(512);
    expect(tokenCap(0)).toBe(8_192);
    expect(tokenCap(-5)).toBe(8_192);
    expect(tokenCap(Number.NaN)).toBe(8_192);
  });

  it('cuts a model id to its last segment, lower-cased and trimmed', () => {
    expect(bareModelId('  Gateway/OpenAI/GPT-6-Sol ')).toBe('gpt-6-sol');
    expect(bareModelId('gemini-3.6-flash')).toBe('gemini-3.6-flash');
    expect(bareModelId('')).toBe('');
  });

  it('joins only the non-blank texts of a list, trimmed, with newlines', () => {
    expect(joinTexts([{ text: ' a ' }, { text: '' }, { other: 1 }, 'b', null, { text: 'c' }])).toBe(
      'a\nc',
    );
  });

  it('classifies an error status and refuses a success that is not a JSON object', () => {
    expect(openReply(503, '{"error":{"message":"Busy"}}', {})).toMatchObject({
      ok: false,
      error: { kind: 'overloaded', status: 503 },
    });
    expect(openReply(204, '', {})).toEqual({ ok: false, error: { kind: 'invalidResponse' } });
    expect(openReply(200, '"text"', {})).toEqual({ ok: false, error: { kind: 'invalidResponse' } });
    expect(openReply(200, '{"a":1}', {})).toEqual({ ok: true, value: { a: 1 } });
  });
});
