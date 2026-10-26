// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import {
  DIRECT_BROWSER_HEADER,
  corsReason,
  differsFromCatalogue,
  envName,
  formatTable,
  judgeAttempt,
  judgeWithHeaderCheck,
  main,
  planProbes,
  probeProvider,
  probeSecrets,
  redact,
  type Attempt,
  type Judgement,
  type NetworkClue,
  type OpenSession,
  type Probe,
  type ProbeSession,
  type Row,
} from './ai-cors-probe';
import type { PageOutcome, PageRequest } from './ai-cors-probe/page';
import { PROVIDER_IDS } from '../src/ai/catalog/providers';

const URL_SENT = 'https://api.example.test/v1/chat/completions';

function reply(status: number, extra: Partial<Extract<PageOutcome, { kind: 'reply' }>> = {}) {
  return {
    outcome: {
      kind: 'reply',
      url: URL_SENT,
      status,
      blankBody: false,
      hasMessage: true,
      read: status === 200 ? 'answer' : 'keyRejected',
      ...extra,
    },
    clue: {},
  } satisfies Attempt;
}

function noReply(
  clue: NetworkClue = {},
  failure: 'connection' | 'offline' | 'timeout' = 'connection',
) {
  return { outcome: { kind: 'noReply', url: URL_SENT, failure }, clue } satisfies Attempt;
}

// Chromium's console lines for a refused call, as the browser words them.
const PREFLIGHT_REFUSED =
  `Access to fetch at '${URL_SENT}' from origin 'http://127.0.0.1:4173' has been blocked by CORS ` +
  "policy: Response to preflight request doesn't pass access control check: No " +
  "'Access-Control-Allow-Origin' header is present on the requested resource.";
const REPLY_REFUSED =
  `Access to fetch at '${URL_SENT}' from origin 'http://127.0.0.1:4173' has been blocked by CORS ` +
  "policy: No 'Access-Control-Allow-Origin' header is present on the requested resource.";
const HEADER_REFUSED =
  `Access to fetch at '${URL_SENT}' from origin 'http://127.0.0.1:4173' has been blocked by CORS ` +
  'policy: Request header field X-Title is not allowed by Access-Control-Allow-Headers in ' +
  'preflight response.';

describe('redact: keys never reach the output', () => {
  it('hides a configured key wherever it appears', () => {
    expect(redact('sent sk-live-123 to sk-live-123/x', ['sk-live-123'])).toBe(
      'sent [redacted] to [redacted]/x',
    );
  });

  it('hides a longer key whole when a shorter one is part of it', () => {
    expect(redact('a=abc-123-xyz b=abc', ['abc', 'abc-123-xyz'])).toBe('a=[redacted] b=[redacted]');
  });

  it('hides the trimmed and the URL-encoded forms of a key', () => {
    const key = ' k/ey+1 ';
    expect(redact('raw k/ey+1, encoded k%2Fey%2B1', [key])).toBe(
      'raw [redacted], encoded [redacted]',
    );
  });

  it('hides the values of the key headers in every spelling, configured or not', () => {
    expect(redact('Authorization: Bearer sk-anything', [])).toBe(
      'Authorization: Bearer [redacted]',
    );
    expect(redact('{"x-api-key":"ant-1","model":"m"}', [])).toBe(
      '{"x-api-key":"[redacted]","model":"m"}',
    );
    expect(redact('x-goog-api-key=AIza-9&alt=json', [])).toBe('x-goog-api-key=[redacted]&alt=json');
    expect(redact("{ AUTHORIZATION: 'Basic dXNlcg==' }", [])).toBe(
      "{ AUTHORIZATION: 'Basic [redacted]' }",
    );
    expect(redact('X-Api-Key: plain', [])).toBe('X-Api-Key: [redacted]');
  });

  it('leaves other text alone and ignores blank keys', () => {
    const text = 'Gemini  direct  HTTP 200, answer';
    expect(redact(text, ['', '   ', 'unrelated'])).toBe(text);
  });

  it('collects every PLATEWISE_PROBE_KEY_* value as a secret, and nothing else', () => {
    expect(
      probeSecrets({
        PLATEWISE_PROBE_KEY_GEMINI: 'g-key',
        PLATEWISE_PROBE_KEY_OLLAMA: 'unused-but-hidden',
        PLATEWISE_PROBE_KEY_GROQ: '  ',
        PLATEWISE_PROBE_URL_CUSTOM: 'https://llm.example.test/v1',
        HOME: '/root',
      }),
    ).toEqual(['g-key', 'unused-but-hidden']);
  });
});

describe('planProbes: what the environment asks for', () => {
  it('names one key variable per catalogue id, in capitals', () => {
    expect(PROVIDER_IDS.map((id) => envName('KEY', id))).toEqual([
      'PLATEWISE_PROBE_KEY_GEMINI',
      'PLATEWISE_PROBE_KEY_OPENAI',
      'PLATEWISE_PROBE_KEY_ANTHROPIC',
      'PLATEWISE_PROBE_KEY_XAI',
      'PLATEWISE_PROBE_KEY_OPENROUTER',
      'PLATEWISE_PROBE_KEY_TOGETHER',
      'PLATEWISE_PROBE_KEY_GROQ',
      'PLATEWISE_PROBE_KEY_HUGGINGFACE',
      'PLATEWISE_PROBE_KEY_FIREWORKS',
      'PLATEWISE_PROBE_KEY_DEEPINFRA',
      'PLATEWISE_PROBE_KEY_MISTRAL',
      'PLATEWISE_PROBE_KEY_DEEPSEEK',
      'PLATEWISE_PROBE_KEY_QWEN',
      'PLATEWISE_PROBE_KEY_CEREBRAS',
      'PLATEWISE_PROBE_KEY_OLLAMA',
      'PLATEWISE_PROBE_KEY_CUSTOM',
    ]);
    expect(envName('URL', 'ollama')).toBe('PLATEWISE_PROBE_URL_OLLAMA');
    expect(envName('MODEL', 'custom')).toBe('PLATEWISE_PROBE_MODEL_CUSTOM');
  });

  it('skips all sixteen, in catalogue order, when nothing is set', () => {
    const plan = planProbes({});
    expect(plan.map((step) => step.id)).toEqual([...PROVIDER_IDS]);
    expect(plan.every((step) => step.kind === 'skip')).toBe(true);
    expect(plan[0]).toEqual({
      kind: 'skip',
      id: 'gemini',
      reason: 'no key (set PLATEWISE_PROBE_KEY_GEMINI)',
    });
    expect(plan.at(-2)).toMatchObject({
      reason: 'no server address (set PLATEWISE_PROBE_URL_OLLAMA)',
    });
    expect(plan.at(-1)).toMatchObject({
      reason: 'no server address (set PLATEWISE_PROBE_URL_CUSTOM)',
    });
  });

  it('probes a cloud vendor with a key at its catalogue address and default text model', () => {
    const plan = planProbes({
      PLATEWISE_PROBE_KEY_GROQ: '  gsk-1  ',
      PLATEWISE_PROBE_KEY_XAI: ' ',
    });
    expect(plan.find((step) => step.id === 'groq')).toEqual({
      kind: 'probe',
      id: 'groq',
      baseUrl: 'https://api.groq.com/openai/v1',
      model: 'openai/gpt-oss-120b',
      key: 'gsk-1',
    });
    expect(plan.find((step) => step.id === 'xai')?.kind).toBe('skip');
  });

  it('takes a model from PLATEWISE_PROBE_MODEL_<ID>', () => {
    const plan = planProbes({
      PLATEWISE_PROBE_KEY_OPENAI: 'sk-1',
      PLATEWISE_PROBE_MODEL_OPENAI: ' gpt-test ',
    });
    expect(plan.find((step) => step.id === 'openai')).toMatchObject({ model: 'gpt-test' });
  });

  it('probes Ollama and Custom only at a server address, Ollama never with a key', () => {
    const plan = planProbes({
      PLATEWISE_PROBE_URL_OLLAMA: 'http://localhost:11434/v1/',
      PLATEWISE_PROBE_KEY_OLLAMA: 'ignored',
      PLATEWISE_PROBE_URL_CUSTOM: 'https://llm.example.test/v1',
    });
    expect(plan.find((step) => step.id === 'ollama')).toEqual({
      kind: 'probe',
      id: 'ollama',
      baseUrl: 'http://localhost:11434/v1',
      model: 'gemma4',
    });
    expect(plan.find((step) => step.id === 'custom')).toEqual({
      kind: 'probe',
      id: 'custom',
      baseUrl: 'https://llm.example.test/v1',
      model: '',
    });
    expect(
      planProbes({
        PLATEWISE_PROBE_URL_CUSTOM: 'https://llm.example.test/v1',
        PLATEWISE_PROBE_KEY_CUSTOM: 'c-1',
      }).find((step) => step.id === 'custom'),
    ).toMatchObject({ key: 'c-1' });
  });

  it('refuses a server address the app would refuse, without printing it', () => {
    const plan = planProbes({
      PLATEWISE_PROBE_URL_CUSTOM: 'https://me:hunter2@llm.example.test/v1',
      PLATEWISE_PROBE_URL_OLLAMA: 'http://192.168.1.20:11434/v1',
    });
    expect(plan.find((step) => step.id === 'custom')).toEqual({
      kind: 'skip',
      id: 'custom',
      reason: 'server address refused: credentials',
    });
    expect(plan.find((step) => step.id === 'ollama')).toMatchObject({
      reason: 'server address refused: plainHttp',
    });
  });
});

describe('judgeAttempt: one request, one verdict (R03.2)', () => {
  it('calls a readable answer or a readable error direct', () => {
    expect(judgeAttempt(reply(200))).toEqual({ verdict: 'direct', detail: 'HTTP 200, answer' });
    expect(judgeAttempt(reply(401))).toEqual({
      verdict: 'direct',
      detail: 'HTTP 401, keyRejected',
    });
    expect(judgeAttempt(reply(200, { hasMessage: false, read: 'truncated' }))).toEqual({
      verdict: 'direct',
      detail: 'HTTP 200, truncated',
    });
  });

  it('calls a status without a readable body an opaque error', () => {
    expect(judgeAttempt(reply(401, { hasMessage: false }))).toEqual({
      verdict: 'opaque error',
      detail: 'HTTP 401, no message in the body',
    });
    expect(judgeAttempt(reply(200, { blankBody: true, hasMessage: false }))).toEqual({
      verdict: 'opaque error',
      detail: 'HTTP 200, blank body',
    });
  });

  it('calls a CORS refusal blocked, with our own short reason', () => {
    expect(
      judgeAttempt(noReply({ errorText: 'net::ERR_FAILED', corsMessage: REPLY_REFUSED })),
    ).toEqual({
      verdict: 'blocked',
      detail: 'CORS: no Access-Control-Allow-Origin',
    });
    expect(judgeAttempt(noReply({ errorText: 'net::ERR_FAILED' }))).toEqual({
      verdict: 'blocked',
      detail: 'net::ERR_FAILED',
    });
    expect(judgeAttempt(noReply())).toEqual({
      verdict: 'blocked',
      detail: 'TypeError, cause unknown',
    });
  });

  it('tells the environment refusing the connection apart from CORS', () => {
    expect(judgeAttempt(noReply({ errorText: 'net::ERR_TUNNEL_CONNECTION_FAILED' }))).toEqual({
      verdict: 'blocked by environment',
      detail:
        'net::ERR_TUNNEL_CONNECTION_FAILED (the proxy refused the host or could not resolve it)',
    });
    expect(judgeAttempt(noReply({ errorText: 'net::ERR_CONNECTION_REFUSED' })).verdict).toBe(
      'blocked by environment',
    );
    expect(judgeAttempt(noReply({ errorText: 'net::ERR_CERT_AUTHORITY_INVALID' })).detail).toBe(
      'net::ERR_CERT_AUTHORITY_INVALID (TLS failed)',
    );
    expect(judgeAttempt(noReply({}, 'offline'))).toEqual({
      verdict: 'blocked by environment',
      detail: 'the browser reports no connection',
    });
  });

  it('reports a request our deadline stopped as a timeout, not a CORS answer', () => {
    expect(judgeAttempt(noReply({ errorText: 'net::ERR_ABORTED' }, 'timeout'))).toEqual({
      verdict: 'timeout',
      detail: 'no answer in 30 s',
    });
  });

  it('shortens Chromium CORS lines to our phrases', () => {
    expect(corsReason(PREFLIGHT_REFUSED)).toBe('preflight refused, no Access-Control-Allow-Origin');
    expect(corsReason(REPLY_REFUSED)).toBe('no Access-Control-Allow-Origin');
    expect(corsReason(HEADER_REFUSED)).toBe('preflight refused, header not allowed: x-title');
    expect(
      corsReason(
        "blocked by CORS policy: The 'Access-Control-Allow-Origin' header has a value " +
          "'https://other.example' that is not equal to the supplied origin.",
      ),
    ).toBe('Access-Control-Allow-Origin does not match');
    expect(corsReason('blocked by CORS policy: something new')).toBe('refused by CORS policy');
  });
});

describe('the direct-browser header check (R03.1)', () => {
  const direct: Judgement = { verdict: 'direct', detail: 'HTTP 200, answer' };

  it('needs the header when the same request without it is refused', () => {
    expect(
      judgeWithHeaderCheck(direct, {
        verdict: 'blocked',
        detail: 'CORS: no Access-Control-Allow-Origin',
      }),
    ).toEqual({
      verdict: 'needs header',
      detail: 'HTTP 200, answer; without the header: CORS: no Access-Control-Allow-Origin',
    });
  });

  it('is direct when the request without the header gets through too', () => {
    expect(judgeWithHeaderCheck(direct, direct)).toEqual({
      verdict: 'direct',
      detail: 'HTTP 200, answer; works without the header too',
    });
  });

  it('stays direct, with a note, when the control request found no answer', () => {
    expect(
      judgeWithHeaderCheck(direct, { verdict: 'timeout', detail: 'no answer in 30 s' }),
    ).toEqual({
      verdict: 'direct',
      detail: 'HTTP 200, answer; without the header: timeout (no answer in 30 s)',
    });
  });

  it('keeps the first verdict when the request with the header was not readable', () => {
    const blocked: Judgement = { verdict: 'blocked', detail: 'net::ERR_FAILED' };
    expect(judgeWithHeaderCheck(blocked, direct)).toBe(blocked);
  });
});

/** A session that answers from a script and records what the page was asked. */
function fakeSession(answers: Attempt[], extra: Partial<ProbeSession> = {}) {
  const sent: PageRequest[] = [];
  const session: ProbeSession = {
    origin: 'http://127.0.0.1:4173',
    browser: 'Chromium test',
    send: vi.fn(async (request: PageRequest) => {
      sent.push(request);
      const next = answers.shift();
      if (next === undefined) throw new Error('no scripted answer left');
      return next;
    }),
    close: vi.fn(async () => undefined),
    ...extra,
  };
  return { session, sent };
}

describe('probeProvider', () => {
  const anthropic: Probe = {
    kind: 'probe',
    id: 'anthropic',
    baseUrl: 'https://api.anthropic.com/v1',
    model: 'claude-haiku-5-5',
    key: 'ant-key',
  };

  it('sends Anthropic twice, the second time without the opt-in header', async () => {
    const { session, sent } = fakeSession([reply(200), noReply({ corsMessage: REPLY_REFUSED })]);
    await expect(probeProvider(session, anthropic)).resolves.toEqual({
      id: 'anthropic',
      verdict: 'needs header',
      detail: 'HTTP 200, answer; without the header: CORS: no Access-Control-Allow-Origin',
    });
    expect(sent).toEqual([
      {
        provider: 'anthropic',
        baseUrl: 'https://api.anthropic.com/v1',
        model: 'claude-haiku-5-5',
        key: 'ant-key',
        timeoutSeconds: 30,
      },
      expect.objectContaining({ withoutHeaders: [DIRECT_BROWSER_HEADER] }),
    ]);
  });

  it('sends Anthropic once when the request with the header is not readable', async () => {
    const { session, sent } = fakeSession([noReply({ errorText: 'net::ERR_FAILED' })]);
    await expect(probeProvider(session, anthropic)).resolves.toMatchObject({ verdict: 'blocked' });
    expect(sent).toHaveLength(1);
  });

  it('sends every other provider once', async () => {
    const { session, sent } = fakeSession([reply(401)]);
    const groq: Probe = { ...anthropic, id: 'groq', baseUrl: 'https://api.groq.com/openai/v1' };
    await expect(probeProvider(session, groq)).resolves.toMatchObject({ verdict: 'direct' });
    expect(sent).toHaveLength(1);
    expect(sent[0]).not.toHaveProperty('withoutHeaders');
  });
});

describe('the table and the catalogue', () => {
  const row = (id: Row['id'], verdict: Row['verdict'], detail = '-'): Row => ({
    id,
    verdict,
    detail,
  });

  it('compares each CORS answer with the catalogue, and nothing else', () => {
    expect(differsFromCatalogue(row('anthropic', 'needs header'))).toBe(false);
    expect(differsFromCatalogue(row('anthropic', 'direct'))).toBe(true);
    expect(differsFromCatalogue(row('openai', 'direct'))).toBe(false);
    expect(differsFromCatalogue(row('cerebras', 'opaque error'))).toBe(true);
    expect(differsFromCatalogue(row('ollama', 'blocked'))).toBe(true);
    expect(differsFromCatalogue(row('gemini', 'timeout'))).toBe(false);
    expect(differsFromCatalogue(row('gemini', 'blocked by environment'))).toBe(false);
    expect(differsFromCatalogue(row('xai', 'skipped'))).toBe(false);
  });

  it('prints one aligned row per provider and a closing line', () => {
    const text = formatTable([
      row('gemini', 'direct', 'HTTP 200, answer'),
      row('anthropic', 'needs header', 'HTTP 200, answer; without the header: CORS'),
      row('custom', 'skipped', 'no server address'),
    ]);
    expect(text.split('\n')).toEqual([
      'provider       catalogue         verdict       detail',
      'Gemini         direct            direct        HTTP 200, answer',
      'Anthropic      directWithHeader  needs header  HTTP 200, answer; without the header: CORS',
      'Custom server  userServer        skipped       no server address',
      '',
      'All 2 measured providers match the catalogue.',
    ]);
  });

  it('names the providers that differ, and says when nothing gave an answer', () => {
    expect(formatTable([row('cerebras', 'blocked', 'CORS')])).toMatch(
      /Differs from the catalogue: Cerebras \(catalogue says direct, found blocked\)\.$/,
    );
    expect(formatTable([row('gemini', 'timeout')])).toMatch(/No provider gave a CORS answer/);
    expect(formatTable([row('gemini', 'skipped')])).toMatch(/^Nothing was probed\./m);
  });
});

describe('main', () => {
  function capture() {
    const out: string[] = [];
    const errors: string[] = [];
    return {
      out,
      errors,
      all: () => [...out, ...errors].join('\n'),
      options: {
        write: (text: string) => out.push(text),
        writeError: (text: string) => errors.push(text),
      },
    };
  }

  it('prints "skipped" and starts nothing without PLATEWISE_PROBE=1', async () => {
    for (const flag of [undefined, '0', 'true', ' 1']) {
      const io = capture();
      const open = vi.fn<OpenSession>();
      const env = { PLATEWISE_PROBE: flag, PLATEWISE_PROBE_KEY_OPENAI: 'sk-1' };
      await expect(main(env, { ...io.options, open })).resolves.toBe(0);
      expect(io.out).toHaveLength(1);
      expect(io.out[0]).toMatch(/^CORS probe skipped/);
      expect(open).not.toHaveBeenCalled();
    }
  });

  it('lists every provider as skipped and opens no browser when no key is set', async () => {
    const io = capture();
    const open = vi.fn<OpenSession>();
    await expect(main({ PLATEWISE_PROBE: '1' }, { ...io.options, open })).resolves.toBe(0);
    expect(open).not.toHaveBeenCalled();
    const lines = io.out.join('\n').split('\n');
    expect(lines.filter((line) => /\sskipped\s/.test(line))).toHaveLength(16);
    expect(io.errors).toEqual([]);
  });

  it('probes the configured providers and never prints a key, whoever writes it', async () => {
    const io = capture();
    const key = 'sk-very-secret-42';
    const { session } = fakeSession([reply(401), noReply({ errorText: 'net::ERR_FAILED' })], {
      browser: `Chromium (launched with ${key})`,
    });
    const open: OpenSession = async (log) => {
      log(`request headers: { authorization: 'Bearer ${key}', 'x-goog-api-key': 'AIza-other' }`);
      return session;
    };
    const env = {
      PLATEWISE_PROBE: '1',
      PLATEWISE_PROBE_KEY_OPENAI: key,
      PLATEWISE_PROBE_KEY_DEEPSEEK: 'ds-key',
    };
    await expect(main(env, { ...io.options, open })).resolves.toBe(0);
    const printed = io.all();
    expect(printed).not.toContain(key);
    expect(printed).not.toContain('AIza-other');
    expect(printed).toContain('[redacted]');
    expect(printed).toMatch(/OpenAI\s+direct\s+direct\s+HTTP 401, keyRejected/);
    expect(printed).toMatch(/DeepSeek\s+direct\s+blocked\s+net::ERR_FAILED/);
    expect(session.close).toHaveBeenCalledOnce();
  });

  it('exits 1 with a redacted error when the browser cannot start', async () => {
    const io = capture();
    const open: OpenSession = async () => {
      throw new Error('launch failed for gsk-secret-7');
    };
    const env = { PLATEWISE_PROBE: '1', PLATEWISE_PROBE_KEY_GROQ: 'gsk-secret-7' };
    await expect(main(env, { ...io.options, open })).resolves.toBe(1);
    expect(io.errors.join('\n')).toMatch(
      /^CORS probe failed: Error: launch failed for \[redacted\]/,
    );
    expect(io.all()).not.toContain('gsk-secret-7');
  });

  it('exits 1 and still closes the session when a request breaks the page', async () => {
    const io = capture();
    const { session } = fakeSession([]);
    const env = { PLATEWISE_PROBE: '1', PLATEWISE_PROBE_KEY_GEMINI: 'g-1' };
    await expect(main(env, { ...io.options, open: async () => session })).resolves.toBe(1);
    expect(session.close).toHaveBeenCalledOnce();
    expect(io.errors.join('\n')).toMatch(/no scripted answer left/);
  });

  it('exits 1 when the browser or the server cannot be closed', async () => {
    const io = capture();
    const { session } = fakeSession([reply(200)], {
      close: vi.fn(async () => {
        throw new Error('still running');
      }),
    });
    const env = { PLATEWISE_PROBE: '1', PLATEWISE_PROBE_KEY_GEMINI: 'g-1' };
    await expect(main(env, { ...io.options, open: async () => session })).resolves.toBe(1);
    expect(io.errors.join('\n')).toMatch(/could not close .*still running/);
  });
});
