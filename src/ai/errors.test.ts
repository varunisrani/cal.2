import { describe, expect, it, vi } from 'vitest';
import { t } from '../i18n/t';
import {
  AI_FAILURE_KINDS,
  AiFailureError,
  FAILURE_MESSAGE_KEYS,
  bothFailed,
  classify,
  failureMessage,
  fromNetwork,
  isAiFailureError,
  providerDetail,
  redactKeys,
  type AiFailure,
  type SingleFailureKind,
} from './errors';
import { anthropicError, detailError, geminiError, openAiError, stringError } from './testing/wire';

/** A body as the wire would carry it. */
const json = (value: unknown) => JSON.stringify(value);
const kindOf = (status: number, body: unknown) =>
  classify(status, typeof body === 'string' ? body : json(body)).kind;

describe('classify', () => {
  it('reads 401 and 403 as a refused key, whatever the body says', () => {
    expect(kindOf(401, '')).toBe('keyRejected');
    expect(kindOf(403, '')).toBe('keyRejected');
    expect(
      kindOf(401, anthropicError('authentication_error', 'That key is not one of ours.')),
    ).toBe('keyRejected');
    expect(kindOf(403, detailError('Wire test: no access to this model.'))).toBe('keyRejected');
  });

  it('reads a 400 as a refused key only when the body talks about the key', () => {
    // One spelling per body, so every sign is proven on its own.
    const bodies = [
      geminiError({
        code: 400,
        status: 'INVALID_ARGUMENT',
        message: 'Wire test: refused.',
        reason: 'API_KEY_INVALID',
      }),
      geminiError({ code: 400, status: 'INVALID_ARGUMENT', message: 'Wire test: renewal due.' }),
      openAiError('Wire test: the API key not valid for this call.'),
      { error: { message: 'Wire test: renewal due.', details: [{ reason: 'API_KEY_EXPIRED' }] } },
      openAiError('Wire test: this API key expired last week.'),
      stringError('Wire test: incorrect API key given (xk-****).', 'invalid argument'),
      openAiError('Wire test: refused.', { code: 'invalid_api_key' }),
      openAiError('Wire test: Invalid API Key supplied.'),
    ];
    const kinds = bodies.map((body) => kindOf(400, body));
    expect(kinds).toEqual([
      'keyRejected',
      'generic',
      'keyRejected',
      'keyRejected',
      'keyRejected',
      'keyRejected',
      'keyRejected',
      'keyRejected',
    ]);
    // The same words on another status are not a key refusal on their own.
    expect(kindOf(500, openAiError('Wire test: invalid api key cache.'))).toBe('generic');
  });

  it('reads 402 and credit wording as credits, ahead of quota and status rules', () => {
    expect(kindOf(402, '')).toBe('credits');
    expect(kindOf(400, openAiError('Wire test: Insufficient credits on this account.'))).toBe(
      'credits',
    );
    expect(
      kindOf(400, anthropicError('invalid_request_error', 'Wire test: credit balance is too low.')),
    ).toBe('credits');
    expect(kindOf(429, stringError('Wire test: account is out of credits; daily quota too.'))).toBe(
      'credits',
    );
    expect(
      kindOf(400, openAiError('Wire test: billing.', { code: 'billing_hard_limit_reached' })),
    ).toBe('credits');
  });

  it('keeps a refused key ahead of credit wording', () => {
    expect(kindOf(403, openAiError('Wire test: insufficient credit for this key.'))).toBe(
      'keyRejected',
    );
  });

  it('reads a quota with a per-day sign as the daily quota, from the Gemini quotaId too', () => {
    const geminiPerDay = geminiError({
      code: 429,
      status: 'RESOURCE_EXHAUSTED',
      message: 'Wire test: slow down, please.',
      quotaId: 'GenerateRequestsPerDayPerProjectPerModel-FreeTier',
    });
    expect(kindOf(429, geminiPerDay)).toBe('dailyQuota');
    expect(kindOf(429, openAiError('Wire test: quota of 50 per day reached.'))).toBe('dailyQuota');
    expect(
      kindOf(429, { error: { message: 'Wire test: rate_limit reached.', code: 'tokens_per_day' } }),
    ).toBe('dailyQuota');
    // The bare word "limit" next to "daily" counts as well (R03.19).
    expect(kindOf(429, stringError('Wire test: daily limit hit for this model.'))).toBe(
      'dailyQuota',
    );
  });

  it('reads quota-exceeded wording as quota, not a rate limit, even on a 429', () => {
    expect(kindOf(429, openAiError('Wire test: quota exceeded for the month.'))).toBe('quota');
    expect(kindOf(429, openAiError('Wire test.', { type: 'insufficient_quota' }))).toBe('quota');
    expect(kindOf(400, openAiError('Wire test: stop.', { code: 'quota_exceeded' }))).toBe('quota');
    const geminiPerMinute = geminiError({
      code: 429,
      status: 'RESOURCE_EXHAUSTED',
      message: 'Wire test: You exceeded your current quota for now.',
      quotaId: 'GenerateRequestsPerMinutePerProjectPerModel-FreeTier',
    });
    expect(kindOf(429, geminiPerMinute)).toBe('quota');
  });

  it('maps 404, 429, 503 and 529 by status when no wording applies', () => {
    expect(kindOf(404, openAiError('Wire test: no such model here.'))).toBe('model');
    expect(kindOf(429, stringError('Wire test: please wait a moment.'))).toBe('rateLimit');
    expect(kindOf(503, '')).toBe('overloaded');
    expect(kindOf(529, anthropicError('overloaded_error', 'Wire test: busy.'))).toBe('overloaded');
  });

  it('reads 413 and a 400 naming the payload size as too large (R03.29)', () => {
    expect(kindOf(413, '<html><body>Wire test: entity too big</body></html>')).toBe('tooLarge');
    expect(kindOf(413, anthropicError('request_too_large', 'Wire test: too big.'))).toBe(
      'tooLarge',
    );
    const geminiSize = geminiError({
      code: 400,
      status: 'INVALID_ARGUMENT',
      message: 'Wire test: request payload size exceeds the limit: 20971520 bytes.',
    });
    expect(kindOf(400, geminiSize)).toBe('tooLarge');
    expect(
      kindOf(400, anthropicError('invalid_request_error', 'Wire test: image exceeds 5 MB maximum')),
    ).toBe('tooLarge');
    expect(kindOf(400, openAiError('Wire test: too many images in this request.'))).toBe(
      'tooLarge',
    );
    // A refused key wins over size wording, and a large token setting is not a large payload.
    expect(kindOf(400, openAiError('Wire test: payload size fine, API key not valid.'))).toBe(
      'keyRejected',
    );
    expect(kindOf(400, openAiError('Wire test: max_tokens is too large: 900000.'))).toBe('generic');
  });

  it('falls back to generic for 500, 418 and a 400 it does not recognise', () => {
    for (const status of [500, 418, 400]) {
      expect(kindOf(status, openAiError('Wire test: something odd happened upstream.'))).toBe(
        'generic',
      );
    }
    expect(kindOf(502, '')).toBe('generic');
  });

  it('reads the vendor body shapes: error.message, a string error, detail and plain text', () => {
    expect(classify(400, json(stringError('Wire test: incorrect API key given.')))).toEqual({
      kind: 'keyRejected',
      status: 400,
      detail: 'Wire test: incorrect API key given.',
    });
    expect(classify(401, json(detailError('Wire test: Unauthorized')))).toEqual({
      kind: 'keyRejected',
      status: 401,
      detail: 'Wire test: Unauthorized',
    });
    expect(classify(429, json(detailError('Wire test: quota exceeded today.'))).kind).toBe('quota');
    expect(classify(402, 'Wire test: Insufficient Balance')).toEqual({
      kind: 'credits',
      status: 402,
      detail: 'Wire test: Insufficient Balance',
    });
    expect(classify(429, 'Wire test: plain text says quota exceeded').kind).toBe('quota');
    expect(classify(503, json(anthropicError('overloaded_error', 'Wire test: busy')))).toEqual({
      kind: 'overloaded',
      status: 503,
      detail: 'Wire test: busy',
    });
    expect(classify(500, '   ')).toEqual({ kind: 'generic', status: 500 });
    expect(classify(500, json({ unexpected: ['shape'] })).detail).toBe('{"unexpected":["shape"]}');
  });

  it('classifies an error found inside a successful reply (status 0)', () => {
    expect(kindOf(0, openAiError('Wire test: quota exceeded mid-answer.'))).toBe('quota');
    expect(kindOf(0, openAiError('Wire test: the upstream model crashed.'))).toBe('generic');
  });

  it('matches its signs whatever their case', () => {
    expect(kindOf(400, 'WIRE TEST: INSUFFICIENT CREDIT')).toBe('credits');
    expect(kindOf(429, '{"error":{"status":"RESOURCE_EXHAUSTED","note":"PER DAY"}}')).toBe(
      'dailyQuota',
    );
  });
});

describe('providerDetail', () => {
  it('keeps the provider message trimmed and caps a long one', () => {
    expect(providerDetail(json(openAiError('  Wire test: spaced out.  ')))).toBe(
      'Wire test: spaced out.',
    );
    const long = 'x'.repeat(2000);
    const detail = providerDetail(long);
    expect(detail).toHaveLength(601);
    expect(detail?.endsWith('…')).toBe(true);
    expect(providerDetail('')).toBeUndefined();
  });
});

describe('fromNetwork', () => {
  const typeError = new TypeError('Failed to fetch');

  it('reports our own cancel as cancelled, whatever the error and the network', () => {
    expect(fromNetwork(typeError, { stoppedBy: 'cancel' })).toEqual({ kind: 'cancelled' });
    expect(fromNetwork(typeError, { stoppedBy: 'cancel', online: false })).toEqual({
      kind: 'cancelled',
    });
  });

  it('reports our deadline as a timeout', () => {
    const controller = new AbortController();
    controller.abort();
    expect(fromNetwork(controller.signal.reason, { stoppedBy: 'deadline' })).toEqual({
      kind: 'timeout',
    });
  });

  it('tells an abort and a timeout apart by name when no context says which fired', () => {
    const userAbort = new AbortController();
    userAbort.abort();
    expect(fromNetwork(userAbort.signal.reason)).toEqual({ kind: 'cancelled' });
    expect(fromNetwork(new DOMException('Wire test: late', 'TimeoutError'))).toEqual({
      kind: 'timeout',
    });
  });

  it('reports offline when the device says so', () => {
    expect(fromNetwork(typeError, { online: false })).toEqual({ kind: 'offline' });
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    expect(fromNetwork(typeError)).toEqual({ kind: 'offline' });
  });

  it('reports any other failure as a connection failure, never showing its text', () => {
    expect(fromNetwork(typeError, { online: true })).toEqual({ kind: 'connection' });
    expect(fromNetwork(new Error('Wire test: socket reset'))).toEqual({ kind: 'connection' });
    expect(fromNetwork('a thrown string')).toEqual({ kind: 'connection' });
    expect(failureMessage(fromNetwork(new Error('Wire test: socket reset')))).not.toContain(
      'socket',
    );
  });

  it('adds the refused-key hint for providers whose errors look like lost connections (R03.2)', () => {
    expect(fromNetwork(typeError, { provider: 'cerebras', keySent: true })).toEqual({
      kind: 'connection',
      keyMayBeRefused: true,
    });
    expect(fromNetwork(typeError, { provider: 'huggingface', keySent: false })).toEqual({
      kind: 'connection',
      keyMayBeRefused: true,
    });
    expect(fromNetwork(typeError, { provider: 'huggingface', keySent: true })).toEqual({
      kind: 'connection',
    });
    expect(fromNetwork(typeError, { provider: 'gemini', keySent: true })).toEqual({
      kind: 'connection',
    });
  });

  it('passes a failure of ours through unchanged', () => {
    const failure: AiFailure = { kind: 'invalidResponse' };
    expect(fromNetwork(new AiFailureError(failure), { online: false })).toBe(failure);
  });
});

describe('failureMessage', () => {
  const plainKinds = AI_FAILURE_KINDS.filter(
    (kind): kind is Exclude<SingleFailureKind, 'cancelled'> =>
      kind !== 'cancelled' && kind !== 'bothFailed',
  );

  it('gives every kind except cancelled one sentence of ours from the ai catalogue', () => {
    expect(plainKinds).toHaveLength(18);
    for (const kind of plainKinds) {
      const key = FAILURE_MESSAGE_KEYS[kind];
      expect(key).toBe(`ai.failure.${kind}`);
      const text = failureMessage({ kind });
      expect(text).toBe(t(key));
      expect(text?.length).toBeGreaterThan(10);
    }
  });

  it('shows nothing for a cancel', () => {
    expect(failureMessage({ kind: 'cancelled' })).toBeNull();
  });

  it('shows the paste-a-valid-key sentence for a refused key', () => {
    const failure = classify(401, json(openAiError('Wire test: bad key xk-123456789.')));
    expect(failureMessage(failure)).toBe(t('ai.failure.keyRejected'));
    expect(failureMessage(failure)).toContain('Paste a valid key');
  });

  it('never shows the provider body, which is kept only as detail (R03.18)', () => {
    const secret = 'Wire test: echoed prompt and key xk-SECRET-0042';
    const cases: [number, unknown][] = [
      [400, openAiError(secret)],
      [401, stringError(secret)],
      [418, secret],
      [429, detailError(`${secret} quota exceeded`)],
      [500, anthropicError('api_error', secret)],
      [0, openAiError(secret)],
    ];
    for (const [status, body] of cases) {
      const failure = classify(status, typeof body === 'string' ? body : json(body));
      expect(failure.detail).toContain('xk-SECRET-0042');
      const text = failureMessage(failure);
      expect(text).not.toContain('SECRET');
      expect(text).not.toContain('echoed');
      expect(text).toBe(t(FAILURE_MESSAGE_KEYS[failure.kind as keyof typeof FAILURE_MESSAGE_KEYS]));
    }
  });

  it('names both providers and gives the advice for the standby failure', () => {
    const failure = bothFailed('Gemini', 'OpenRouter', classify(402, ''));
    expect(failure).toMatchObject({
      kind: 'bothFailed',
      primary: 'Gemini',
      standby: 'OpenRouter',
      standbyFailure: { kind: 'credits' },
    });
    expect(failureMessage(failure)).toBe(
      t('ai.failure.bothFailed', {
        primary: 'Gemini',
        standby: 'OpenRouter',
        reason: t('ai.failure.credits'),
      }),
    );
    expect(failureMessage(failure)).toMatch(/^Gemini and the standby, OpenRouter, both failed\. /);
  });

  it('adds the key hint to the connection sentence', () => {
    expect(failureMessage({ kind: 'connection', keyMayBeRefused: true })).toBe(
      t('ai.failure.connectionOrKey'),
    );
    expect(failureMessage({ kind: 'connection' })).toBe(t('ai.failure.connection'));
  });
});

describe('bothFailed', () => {
  it('keeps a cancelled standby as a cancel, so nothing is shown', () => {
    expect(bothFailed('Gemini', 'Groq', { kind: 'cancelled' })).toEqual({ kind: 'cancelled' });
  });

  it('keeps only the standby failure of a nested combination', () => {
    const inner = bothFailed('Groq', 'Mistral', { kind: 'timeout' });
    expect(bothFailed('Gemini', 'Groq', inner)).toEqual({
      kind: 'bothFailed',
      primary: 'Gemini',
      standby: 'Groq',
      standbyFailure: { kind: 'timeout' },
    });
  });
});

describe('redactKeys', () => {
  it('masks every stored key, longest first, and ignores blank or short values', () => {
    const text =
      'Wire test: key sk-wire-abcdef123 and sk-wire-abcdef123-long were refused; ab too.';
    expect(redactKeys(text, ['sk-wire-abcdef123', ' sk-wire-abcdef123-long ', '', 'ab'])).toBe(
      'Wire test: key •••• and •••• were refused; ab too.',
    );
  });
});

describe('AiFailureError', () => {
  it('carries the failure and names only its kind', () => {
    const failure = classify(500, 'Wire test: private upstream text');
    const error = new AiFailureError(failure);
    expect(isAiFailureError(error)).toBe(true);
    expect(isAiFailureError(new Error('x'))).toBe(false);
    expect(error.failure).toBe(failure);
    expect(error.message).toBe('AI request failed (generic)');
    expect(error.name).toBe('AiFailureError');
  });
});
