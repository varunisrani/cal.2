import { describe, expect, it } from 'vitest';
import { lookupMessage, type MessageTree } from '../i18n/catalogue';
import { enPartitions } from '../i18n/en';
import { ai } from '../i18n/en/ai';
import { lintCatalogue } from '../i18n/lint';
import { createTranslator, type MessageParams } from '../i18n/t';
import {
  FAILURE_KINDS,
  bothFailed,
  classify,
  deviceOnline,
  failureMessages,
  fromNetwork,
  fromReply,
  messageKey,
  readProviderMessage,
  type AiFailure,
  type AiMessage,
} from './errors';
import { anthropicError, detailError, geminiError, openAiError, stringError } from './testing/wire';

// Bodies are JSON text, as the transport reads them.
const body = (value: unknown): string => JSON.stringify(value);

const translate = createTranslator(ai, { strict: true, locale: () => 'en-US' }) as unknown as (
  key: string,
  params?: MessageParams,
) => string;

/** What the person would read for a failure. */
const shown = (failure: AiFailure): string =>
  failureMessages(failure)
    .map((message: AiMessage) => translate(message.key, message.params))
    .join(' ');

/** Every dotted key of a message tree. */
const keysOf = (tree: MessageTree, prefix = ''): string[] =>
  Object.entries(tree).flatMap(([segment, value]) => {
    const key = prefix === '' ? segment : `${prefix}.${segment}`;
    return typeof value === 'string' ? [key] : keysOf(value, key);
  });

describe('classify: rules in order (R03.19)', () => {
  it.each([
    ['401', 'keyRejected', 401, ''],
    ['403', 'keyRejected', 403, ''],
    [
      '400 "API key not valid"',
      'keyRejected',
      400,
      body(geminiError(400, 'INVALID_ARGUMENT', 'Refused: API key not valid.')),
    ],
    [
      '400 API_KEY_INVALID',
      'keyRejected',
      400,
      body(geminiError(400, 'INVALID_ARGUMENT', 'Refused: API_KEY_INVALID')),
    ],
    [
      '400 invalid_api_key',
      'keyRejected',
      400,
      body(openAiError('That key is wrong.', { code: 'invalid_api_key' })),
    ],
    ['400 "api key expired"', 'keyRejected', 400, 'The api key expired last week.'],
    ['400 API_KEY_EXPIRED', 'keyRejected', 400, body(stringError('Code API_KEY_EXPIRED.'))],
    ['402', 'credits', 402, ''],
    ['402 with any text', 'credits', 402, 'something private'],
    [
      '429 billing_hard_limit_reached',
      'credits',
      429,
      body(openAiError('Spending cap hit.', { code: 'billing_hard_limit_reached' })),
    ],
    [
      '400 "insufficient credits"',
      'credits',
      400,
      body(openAiError('Insufficient credits left on this plan.')),
    ],
    [
      '400 "credit balance is too low"',
      'credits',
      400,
      body(anthropicError('invalid_request_error', 'Your credit balance is too low for this.')),
    ],
    ['429 "out of credits"', 'credits', 429, 'The account is out of credits.'],
    ['429 "daily quota"', 'dailyQuota', 429, body(openAiError('Daily quota used up.'))],
    [
      '429 "limit per day"',
      'dailyQuota',
      429,
      body(openAiError('Request limit per day reached for this model.')),
    ],
    [
      '429 quota + per_day code',
      'dailyQuota',
      429,
      body(openAiError('Quota reached', { code: 'requests_per_day' })),
    ],
    ['429 "quota exceeded"', 'quota', 429, body(openAiError('Quota exceeded for this project.'))],
    [
      '429 insufficient_quota',
      'quota',
      429,
      body(openAiError('Your plan has no room left.', { code: 'insufficient_quota' })),
    ],
    ['404', 'model', 404, body(openAiError('No such model here.'))],
    [
      '429',
      'rateLimit',
      429,
      body(openAiError('Slow down a little.', { code: 'rate_limit_exceeded' })),
    ],
    ['503', 'overloaded', 503, ''],
    ['529', 'overloaded', 529, body(anthropicError('overloaded_error', 'Busy right now.'))],
    ['413', 'tooLarge', 413, ''],
    [
      '400 "payload size"',
      'tooLarge',
      400,
      body(geminiError(400, 'INVALID_ARGUMENT', 'Request payload size too big.')),
    ],
    [
      '400 "too many images"',
      'tooLarge',
      400,
      body(openAiError('Too many images in one request.')),
    ],
    ['500', 'generic', 500, 'private text from the provider'],
    ['418', 'generic', 418, 'private text from the provider'],
    ['an unknown 400', 'generic', 400, body(openAiError('Something about the request was odd.'))],
  ] as const)('%s → %s', (_label, kind, status, text) => {
    expect(classify(status, text)).toBe(kind);
  });

  it('calls a 429 that says the quota was exceeded quota, not rateLimit', () => {
    expect(classify(429, 'quota exceeded')).toBe('quota');
    expect(classify(429, 'too many requests')).toBe('rateLimit');
  });

  it('calls a 400 that says the credits are insufficient credits', () => {
    expect(classify(400, body(openAiError('insufficient credits')))).toBe('credits');
  });

  it("reads Gemini's daily quota from the quota id in the error details (R03.18)", () => {
    const daily = geminiError(429, 'RESOURCE_EXHAUSTED', 'You used up a quota.', {
      quotaId: 'GenerateRequestsPerDayPerProjectPerModel',
    });
    const perMinute = geminiError(429, 'RESOURCE_EXHAUSTED', 'Hold on for a moment.', {
      quotaId: 'GenerateRequestsPerMinutePerProjectPerModel',
    });
    expect(classify(429, body(daily))).toBe('dailyQuota');
    expect(classify(429, body(perMinute))).toBe('rateLimit');
  });

  it('keeps the order: key before credit, credit before daily quota, quota before status', () => {
    expect(classify(403, 'quota exceeded, daily')).toBe('keyRejected');
    expect(classify(401, 'insufficient credits')).toBe('keyRejected');
    expect(classify(400, 'insufficient credits for the daily quota')).toBe('credits');
    expect(classify(429, 'daily quota exceeded')).toBe('dailyQuota');
    expect(classify(404, 'quota exceeded')).toBe('quota');
    expect(classify(503, 'insufficient_quota')).toBe('quota');
    expect(classify(413, 'insufficient credits')).toBe('credits');
  });

  it('counts a daily request limit as the daily quota, even without the word quota', () => {
    expect(classify(429, 'Daily limit reached.')).toBe('dailyQuota');
  });

  it('needs a 400 for key phrases and size phrases, and a per-day word for a daily quota', () => {
    expect(classify(500, 'api key not valid')).toBe('generic');
    expect(classify(500, 'payload too large')).toBe('generic');
    expect(classify(400, 'Payload size exceeds the limit.')).toBe('tooLarge');
  });

  it('classifies an error found inside a success reply (status 0)', () => {
    expect(classify(0, body(openAiError('No room', { code: 'insufficient_quota' })))).toBe('quota');
    expect(classify(0, body(openAiError('Upstream trouble.')))).toBe('generic');
  });

  it('never throws on odd bodies', () => {
    for (const text of ['', 'null', '[]', '{"error":', '42', '"just a string"', '<html></html>']) {
      expect(classify(500, text)).toBe('generic');
    }
  });
});

describe('readProviderMessage: every body shape (R03.18)', () => {
  it.each([
    ['an error object', body(openAiError(' Key is not right. ')), 'Key is not right.'],
    ['a Gemini error', body(geminiError(429, 'RESOURCE_EXHAUSTED', 'Used up.')), 'Used up.'],
    ['an Anthropic error', body(anthropicError('api_error', 'Inside trouble.')), 'Inside trouble.'],
    ['error as a string (xAI, Hugging Face)', body(stringError('Bad token.')), 'Bad token.'],
    ['detail (Mistral)', body(detailError('Not allowed.')), 'Not allowed.'],
    ['a top-level message', body({ message: 'Server says no.' }), 'Server says no.'],
    [
      'plain text (DeepSeek)',
      '  Authentication failed for this user  ',
      'Authentication failed for this user',
    ],
    ['a JSON string', '"Over capacity"', 'Over capacity'],
    ['broken JSON, read as text', '{"error": "cut', '{"error": "cut'],
  ])('reads %s', (_shape, text, expected) => {
    expect(readProviderMessage(text)).toBe(expected);
  });

  it.each([
    ['an empty body', '   '],
    ['an HTML page', '<!doctype html><html><body>Unauthorized</body></html>'],
    ['JSON without a message', body({ error: { code: 7 } })],
    ['a JSON array', body([{ note: 'x' }])],
    ['a JSON number', '503'],
    ['a blank error string', body({ error: '  ' })],
  ])('gives nothing for %s', (_shape, text) => {
    expect(readProviderMessage(text)).toBeUndefined();
  });

  it('classifies xAI, Mistral and DeepSeek bodies by the text they carry', () => {
    expect(classify(400, body(stringError('Incorrect API key provided: xa***')))).toBe(
      'keyRejected',
    );
    expect(
      classify(429, body(detailError('Daily request limit reached for this workspace.'))),
    ).toBe('dailyQuota');
    expect(classify(400, 'Insufficient Balance on this account')).toBe('credits');
  });

  it('reads the message after JSON unescaping, not only the raw text', () => {
    const escaped = '{"detail":"insufficient\\u0020credits"}';
    expect(escaped).not.toContain('insufficient credits');
    expect(classify(400, escaped)).toBe('credits');
  });
});

describe('fromReply', () => {
  it('keeps the kind, the status and the provider message as a detail', () => {
    expect(fromReply(429, body(openAiError('Wait a little.')))).toEqual({
      kind: 'rateLimit',
      status: 429,
      detail: 'Wait a little.',
    });
    expect(fromReply(401, body(detailError('No entry.')))).toEqual({
      kind: 'keyRejected',
      status: 401,
      detail: 'No entry.',
    });
    expect(fromReply(500, '<html>error</html>')).toEqual({ kind: 'generic', status: 500 });
  });

  it('cuts every stored key out of the detail', () => {
    const key = 'sk-test-0123456789abcdef';
    const failure = fromReply(401, body(stringError(`The key ${key} is unknown (${key}).`)), {
      secrets: [key, '', '  '],
    });
    expect(failure.detail).toBe('The key ••• is unknown (•••).');
    expect(JSON.stringify(failure)).not.toContain(key);
  });

  it('cuts a key typed with spaces around it, and the longer of two overlapping keys', () => {
    const failure = fromReply(400, 'keys abcdef and abc', { secrets: [' abc ', 'abcdef'] });
    expect(failure).toMatchObject({ detail: 'keys ••• and •••' });
  });

  it('flattens white space and caps a long detail at 300 characters', () => {
    const long = `${'word '.repeat(100)}\n\nend`;
    const failure = fromReply(500, long);
    const detail = failure.detail ?? '';
    expect(detail).toHaveLength(300);
    expect(detail.endsWith('…')).toBe(true);
    expect(detail).not.toContain('\n');
  });
});

describe('fromNetwork (R03.2)', () => {
  const failed = new TypeError('Failed to fetch: private transport text');

  it('reports the person cancelling as cancelled, even while offline', () => {
    expect(fromNetwork(failed, { stoppedBy: 'cancel', online: false })).toEqual({
      kind: 'cancelled',
    });
  });

  it('reports our deadline as timeout', () => {
    expect(fromNetwork(failed, { stoppedBy: 'deadline', online: true })).toEqual({
      kind: 'timeout',
    });
  });

  it('reads an abort it was not told about from the error name', () => {
    const timeout = new DOMException('deadline passed', 'TimeoutError');
    const abort = new DOMException('stopped', 'AbortError');
    expect(fromNetwork(timeout, { online: true })).toEqual({ kind: 'timeout' });
    expect(fromNetwork(abort, { online: true })).toEqual({ kind: 'cancelled' });
  });

  it('reports an offline device as offline, and anything else as connection', () => {
    expect(fromNetwork(failed, { online: false })).toEqual({ kind: 'offline' });
    expect(fromNetwork(failed, { online: true })).toEqual({ kind: 'connection' });
    expect(fromNetwork('a thrown string', { online: true })).toEqual({ kind: 'connection' });
    expect(fromNetwork(null, { online: true })).toEqual({ kind: 'connection' });
  });

  it('adds the refused-key hint for providers that hide it behind CORS', () => {
    const hinted = { kind: 'connection', keyMayBeRefused: true };
    expect(fromNetwork(failed, { online: true, provider: 'cerebras', keySent: true })).toEqual(
      hinted,
    );
    expect(fromNetwork(failed, { online: true, provider: 'huggingface', keySent: false })).toEqual(
      hinted,
    );
    expect(fromNetwork(failed, { online: true, provider: 'huggingface' })).toEqual(hinted);
    expect(fromNetwork(failed, { online: true, provider: 'huggingface', keySent: true })).toEqual({
      kind: 'connection',
    });
    for (const provider of ['openai', 'gemini', 'anthropic', 'constructor', '']) {
      expect(fromNetwork(failed, { online: true, provider, keySent: true })).toEqual({
        kind: 'connection',
      });
    }
  });

  it('gives no hint when the device is offline', () => {
    expect(fromNetwork(failed, { online: false, provider: 'cerebras' })).toEqual({
      kind: 'offline',
    });
  });

  it('never keeps the error text', () => {
    for (const online of [true, false]) {
      const failure = fromNetwork(failed, { online, provider: 'cerebras' });
      expect(JSON.stringify(failure)).not.toContain('private');
      expect(shown(failure)).not.toContain('private');
    }
  });

  it('asks the browser when no online flag is given', () => {
    expect(deviceOnline()).toBe(navigator.onLine);
    expect(fromNetwork(failed)).toEqual({ kind: navigator.onLine ? 'connection' : 'offline' });
  });
});

describe('bothFailed', () => {
  it('names both providers and keeps the standby failure', () => {
    const standby = fromReply(402, body(openAiError('Pay up.')));
    const failure = bothFailed('Gemini', 'OpenRouter', standby);
    expect(failure).toEqual({
      kind: 'bothFailed',
      primary: 'Gemini',
      standby: 'OpenRouter',
      standbyFailure: { kind: 'credits', status: 402, detail: 'Pay up.' },
    });
  });

  it('shows the both-failed line, then the standby message', () => {
    const failure = bothFailed('Gemini', 'Groq', { kind: 'overloaded', status: 503 });
    expect(failureMessages(failure)).toEqual([
      { key: 'ai.failure.bothFailed', params: { primary: 'Gemini', standby: 'Groq' } },
      { key: 'ai.failure.overloaded' },
    ]);
    expect(shown(failure)).toBe(
      `${translate('ai.failure.bothFailed', { primary: 'Gemini', standby: 'Groq' })} ${translate(
        'ai.failure.overloaded',
      )}`,
    );
    expect(shown(failure)).toMatch(/^Gemini and the standby Groq both failed\. /);
  });

  it('stays a silent cancel when the standby was cancelled', () => {
    expect(bothFailed('Gemini', 'Groq', { kind: 'cancelled' })).toEqual({ kind: 'cancelled' });
  });
});

describe('messages (ACC-E10-1, ACC-E10-2)', () => {
  it('has exactly one catalogue key for every kind that is shown, and none for cancelled', () => {
    const shownKinds = FAILURE_KINDS.filter((kind) => kind !== 'cancelled');
    const keys = shownKinds.map((kind) => messageKey(kind));
    expect(new Set(keys).size).toBe(shownKinds.length);
    for (const key of keys) {
      expect(key).not.toBeNull();
      expect(lookupMessage(ai, key ?? '')).toEqual(expect.any(String));
    }
    expect(messageKey('cancelled')).toBeNull();
    expect(failureMessages({ kind: 'cancelled' })).toEqual([]);
  });

  it('has no key in the partition that no failure uses', () => {
    const used = FAILURE_KINDS.flatMap((kind) => messageKey(kind) ?? []);
    expect(keysOf(ai).sort()).toEqual([...used, 'ai.hint.keyMayBeRefused'].sort());
  });

  it('passes the catalogue lint, alone and next to the other partitions', () => {
    expect(lintCatalogue({ ai })).toEqual([]);
    expect(lintCatalogue({ ...enPartitions, ai })).toEqual([]);
  });

  it('shows the paste-a-valid-key message for a refused key (ACC-E10-1)', () => {
    for (const failure of [
      fromReply(401, body(openAiError('Nope.'))),
      fromReply(403, ''),
      fromReply(400, body(geminiError(400, 'INVALID_ARGUMENT', 'API key not valid here.'))),
    ]) {
      expect(failureMessages(failure)).toEqual([{ key: 'ai.failure.keyRejected' }]);
      expect(shown(failure)).toBe(translate('ai.failure.keyRejected'));
      expect(shown(failure)).toContain('Paste a valid key');
    }
  });

  it('never shows the provider body, whatever its shape (ACC-E10-2)', () => {
    const secret = 'PROVIDER-SECRET-TEXT';
    const bodies = [
      body(openAiError(`${secret} one`)),
      body(geminiError(429, 'RESOURCE_EXHAUSTED', `${secret} two`, { quotaId: 'PerDayQuota' })),
      body(anthropicError('overloaded_error', `${secret} three`)),
      body(stringError(`${secret} four`)),
      body(detailError(`${secret} five`)),
      `${secret} six as plain text`,
    ];
    for (const status of [400, 401, 402, 404, 413, 418, 429, 500, 503, 529]) {
      for (const text of bodies) {
        const failure = fromReply(status, text);
        expect(failure).toMatchObject({ detail: expect.stringContaining(secret) });
        expect(failureMessages(failure).length).toBeGreaterThan(0);
        expect(shown(failure)).not.toContain(secret);
        expect(shown(bothFailed('Gemini', 'Mistral', failure))).not.toContain(secret);
      }
    }
  });

  it('adds the key hint after the connection message only when asked', () => {
    expect(failureMessages({ kind: 'connection', keyMayBeRefused: true })).toEqual([
      { key: 'ai.failure.connection' },
      { key: 'ai.hint.keyMayBeRefused' },
    ]);
    expect(failureMessages({ kind: 'connection' })).toEqual([{ key: 'ai.failure.connection' }]);
  });
});
