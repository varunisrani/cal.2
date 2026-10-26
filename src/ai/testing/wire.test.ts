import { describe, expect, it } from 'vitest';
import { fakeFetch } from './fakeFetch';
import {
  anthropicAnswer,
  anthropicError,
  detailError,
  geminiAnswer,
  geminiBlocked,
  geminiError,
  openAiAnswer,
  openAiError,
  stringError,
} from './wire';

describe('wire: Gemini', () => {
  it('puts thought parts first, flagged, then one part per text, with STOP by default', () => {
    const reply = geminiAnswer(['{"kcal":', '410}'], { thoughts: ['Weighing the bowl.'] });
    expect(reply).toMatchObject({
      candidates: [
        {
          content: {
            role: 'model',
            parts: [
              { text: 'Weighing the bowl.', thought: true },
              { text: '{"kcal":' },
              { text: '410}' },
            ],
          },
          finishReason: 'STOP',
          index: 0,
        },
      ],
    });
  });

  it('marks a cut-off answer and leaves out parts when there are none', () => {
    expect(geminiAnswer('{"kcal": 4', { finishReason: 'MAX_TOKENS' })).toMatchObject({
      candidates: [{ finishReason: 'MAX_TOKENS', content: { parts: [{ text: '{"kcal": 4' }] } }],
    });
    const empty = geminiAnswer([], { finishReason: 'MAX_TOKENS' });
    expect(empty).toMatchObject({ candidates: [{ content: { role: 'model' } }] });
    expect(JSON.stringify(empty)).not.toContain('parts');
  });

  it('builds a blocked prompt without candidates', () => {
    const blocked = geminiBlocked();
    expect(blocked).toMatchObject({ promptFeedback: { blockReason: 'SAFETY' } });
    expect(blocked).not.toHaveProperty('candidates');
  });

  it('builds the error body, with the quota id in the details when given', () => {
    expect(geminiError(400, 'INVALID_ARGUMENT', 'Bad input.')).toEqual({
      error: { code: 400, message: 'Bad input.', status: 'INVALID_ARGUMENT' },
    });
    expect(
      geminiError(429, 'RESOURCE_EXHAUSTED', 'Used up.', { quotaId: 'RequestsPerDayQuota' }),
    ).toMatchObject({
      error: {
        code: 429,
        status: 'RESOURCE_EXHAUSTED',
        details: [{ violations: [{ quotaId: 'RequestsPerDayQuota' }] }],
      },
    });
  });
});

describe('wire: OpenAI-compatible', () => {
  it('builds a string answer with finish_reason stop', () => {
    expect(openAiAnswer('{"kcal": 410}')).toMatchObject({
      object: 'chat.completion',
      choices: [
        {
          index: 0,
          message: { role: 'assistant', content: '{"kcal": 410}' },
          finish_reason: 'stop',
        },
      ],
    });
  });

  it('builds content as text parts', () => {
    expect(openAiAnswer(['First line.', 'Second line.'])).toMatchObject({
      choices: [
        {
          message: {
            content: [
              { type: 'text', text: 'First line.' },
              { type: 'text', text: 'Second line.' },
            ],
          },
        },
      ],
    });
  });

  it('adds each reasoning field only when asked, for a reply cut off while thinking', () => {
    const reply = openAiAnswer(null, {
      finishReason: 'length',
      reasoning: 'Thinking about portions.',
      reasoningContent: 'Still thinking.',
      reasoningDetails: ['Step one.'],
    });
    expect(reply).toMatchObject({
      choices: [
        {
          message: {
            content: null,
            reasoning: 'Thinking about portions.',
            reasoning_content: 'Still thinking.',
            reasoning_details: [{ type: 'reasoning.text', text: 'Step one.' }],
          },
          finish_reason: 'length',
        },
      ],
    });
    const plain = JSON.stringify(openAiAnswer('ok'));
    expect(plain).not.toContain('reasoning');
  });

  it('builds the error shapes of the family', () => {
    expect(
      openAiError('No access.', { type: 'authentication_error', code: 'invalid_api_key' }),
    ).toEqual({
      error: {
        message: 'No access.',
        type: 'authentication_error',
        param: null,
        code: 'invalid_api_key',
      },
    });
    expect(openAiError('Odd request.')).toMatchObject({
      error: { type: 'invalid_request_error', code: null },
    });
    expect(stringError('Bad token.')).toEqual({ error: 'Bad token.' });
    expect(detailError('Not allowed.')).toEqual({ detail: 'Not allowed.' });
  });
});

describe('wire: Anthropic', () => {
  it('puts a thinking block first, then text blocks, then other blocks', () => {
    const toolUse = { type: 'tool_use', id: 'tool-1', name: 'food_log', input: {} };
    const reply = anthropicAnswer(['Part one.', 'Part two.'], {
      thinking: 'Counting the slices.',
      extraBlocks: [toolUse],
    });
    expect(reply).toMatchObject({
      type: 'message',
      role: 'assistant',
      content: [
        { type: 'thinking', thinking: 'Counting the slices.' },
        { type: 'text', text: 'Part one.' },
        { type: 'text', text: 'Part two.' },
        toolUse,
      ],
      stop_reason: 'end_turn',
    });
  });

  it('marks a cut-off answer with stop_reason max_tokens', () => {
    expect(anthropicAnswer('{"kcal":', { stopReason: 'max_tokens' })).toMatchObject({
      content: [{ type: 'text', text: '{"kcal":' }],
      stop_reason: 'max_tokens',
    });
  });

  it('builds the error body', () => {
    expect(anthropicError('authentication_error', 'Key not accepted.')).toEqual({
      type: 'error',
      error: { type: 'authentication_error', message: 'Key not accepted.' },
    });
  });
});

describe('wire: through fakeFetch', () => {
  it('comes back unchanged as a JSON reply', async () => {
    const url = 'https://api.example.test/v1/messages';
    const answer = anthropicAnswer('Fine.');
    const error = anthropicError('overloaded_error', 'Busy.');
    const fake = fakeFetch().on(url, { status: 529, json: error }, { json: answer });

    const busy = await fake.fetch(url, { method: 'POST' });
    expect(busy.status).toBe(529);
    expect(await busy.json()).toEqual(error);
    expect(await (await fake.fetch(url, { method: 'POST' })).json()).toEqual(answer);
  });
});
