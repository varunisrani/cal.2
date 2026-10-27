// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import {
  CHECK_IDS,
  CHECK_TIMEOUT_SECONDS,
  checkInput,
  formatTable,
  judge,
  main,
  pickVariable,
  planChecks,
  unrun,
  type OpenSession,
  type PlannedCheck,
  type PlanStep,
} from './ai-live-check';
import type { CheckResult, LiveCheck } from './ai-live-check/page';
import type { LiveSession } from './ai-live-check/browser';

/** The step of `check` in a plan. */
function stepOf(plan: readonly PlanStep[], check: PlanStep['check']): PlanStep {
  return plan.find((step) => step.check === check)!;
}

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
      photo: () => '/9j/AAAA',
    },
  };
}

/** A session that answers each check with the next result, and records what it was asked. */
function fakeSession(results: CheckResult[], changes: Partial<LiveSession> = {}) {
  const asked: LiveCheck[] = [];
  const session: LiveSession = {
    origin: 'http://127.0.0.1:40001',
    browser: 'Chromium 1',
    run: vi.fn(async (check: LiveCheck) => {
      asked.push(check);
      const next = results.shift();
      if (next === undefined) throw new Error('no scripted result left');
      return next;
    }),
    close: vi.fn(async () => undefined),
    ...changes,
  };
  return { session, asked };
}

const PASS_PHOTO: CheckResult = {
  ok: true,
  ms: 2140,
  requests: 1,
  statuses: [200],
  kcal: 412,
  parts: 3,
};
const PASS_COACH: CheckResult = {
  ok: true,
  ms: 5310,
  requests: 3,
  statuses: [200, 200, 200],
  answerChars: 240,
};

describe('planChecks: one photo per wire format and one Coach turn (P10-12)', () => {
  it('skips all four, naming the variable to set, when nothing is set', () => {
    const plan = planChecks({});
    expect(plan.map((step) => step.check)).toEqual([...CHECK_IDS]);
    expect(plan.map((step) => [step.kind, step.kind === 'skip' ? step.reason : ''])).toEqual([
      ['skip', 'no keys: set PLATEWISE_PROBE_KEY_GEMINI'],
      ['skip', 'no keys: set PLATEWISE_PROBE_KEY_ANTHROPIC'],
      ['skip', 'no keys: set PLATEWISE_PROBE_KEY_<ID> of an OpenAI-compatible provider'],
      ['skip', 'no keys: set PLATEWISE_PROBE_KEY_<ID> of any provider'],
    ]);
  });

  it('takes the first set-up provider of each family, with its photo model, and of all for the Coach', () => {
    const plan = planChecks({
      PLATEWISE_PROBE_KEY_MISTRAL: 'mi-1',
      PLATEWISE_PROBE_KEY_GROQ: 'gq-1',
      PLATEWISE_PROBE_KEY_ANTHROPIC: 'an-1',
    });
    expect(stepOf(plan, 'photo-gemini').kind).toBe('skip');
    expect(stepOf(plan, 'photo-anthropic')).toEqual({
      kind: 'run',
      check: 'photo-anthropic',
      provider: 'anthropic',
      baseUrl: 'https://api.anthropic.com/v1',
      model: 'claude-haiku-5-5',
      key: 'an-1',
    });
    // Groq comes before Mistral in the catalogue.
    expect(stepOf(plan, 'photo-openai')).toMatchObject({
      kind: 'run',
      provider: 'groq',
      model: 'qwen/qwen3.8-27b',
      key: 'gq-1',
    });
    // The Coach takes the first set-up provider of the whole catalogue, with its text model.
    expect(stepOf(plan, 'coach')).toMatchObject({
      kind: 'run',
      provider: 'anthropic',
      model: 'claude-haiku-5-5',
    });
  });

  it('lets PLATEWISE_LIVE_<FAMILY> and PLATEWISE_LIVE_COACH pick, and PLATEWISE_PROBE_MODEL_<ID> the model', () => {
    expect(CHECK_IDS.map(pickVariable)).toEqual([
      'PLATEWISE_LIVE_GEMINI',
      'PLATEWISE_LIVE_ANTHROPIC',
      'PLATEWISE_LIVE_OPENAI',
      'PLATEWISE_LIVE_COACH',
    ]);
    const plan = planChecks({
      PLATEWISE_PROBE_KEY_GROQ: 'gq-1',
      PLATEWISE_PROBE_KEY_MISTRAL: 'mi-1',
      PLATEWISE_LIVE_OPENAI: 'mistral',
      PLATEWISE_LIVE_COACH: 'groq',
      PLATEWISE_PROBE_MODEL_MISTRAL: 'mistral-medium-3-5',
    });
    expect(stepOf(plan, 'photo-openai')).toMatchObject({
      provider: 'mistral',
      model: 'mistral-medium-3-5',
    });
    expect(stepOf(plan, 'coach')).toMatchObject({ provider: 'groq', model: 'openai/gpt-oss-120b' });
  });

  it('refuses a named provider from another family, one that reads no photos, or no provider at all', () => {
    const plan = planChecks({
      PLATEWISE_PROBE_KEY_MISTRAL: 'mi-1',
      PLATEWISE_PROBE_KEY_DEEPSEEK: 'ds-1',
      PLATEWISE_LIVE_GEMINI: 'mistral',
      PLATEWISE_LIVE_OPENAI: 'deepseek',
      PLATEWISE_LIVE_COACH: 'nobody',
    });
    expect(stepOf(plan, 'photo-gemini')).toMatchObject({
      kind: 'skip',
      provider: 'mistral',
      reason: 'Mistral AI speaks the openai format',
    });
    expect(stepOf(plan, 'photo-openai')).toMatchObject({
      kind: 'skip',
      reason: 'DeepSeek does not read photos',
    });
    expect(stepOf(plan, 'coach')).toEqual({
      kind: 'skip',
      check: 'coach',
      reason: 'PLATEWISE_LIVE_COACH names no provider',
    });
  });

  it('needs an address the app accepts for Custom and Ollama, and a model for Custom', () => {
    const refused = planChecks({
      PLATEWISE_LIVE_OPENAI: 'custom',
      PLATEWISE_PROBE_URL_CUSTOM: 'http://192.168.1.20:8080/v1',
    });
    expect(stepOf(refused, 'photo-openai')).toMatchObject({
      kind: 'skip',
      reason: 'server address refused: plainHttp',
    });
    const noModel = planChecks({
      PLATEWISE_LIVE_OPENAI: 'custom',
      PLATEWISE_PROBE_URL_CUSTOM: 'http://127.0.0.1:8080/v1',
    });
    expect(stepOf(noModel, 'photo-openai')).toMatchObject({
      kind: 'skip',
      reason: 'no photo model (set PLATEWISE_PROBE_MODEL_CUSTOM)',
    });
    const ollama = planChecks({ PLATEWISE_PROBE_URL_OLLAMA: 'http://localhost:11434/v1' });
    expect(stepOf(ollama, 'photo-openai')).toEqual({
      kind: 'run',
      check: 'photo-openai',
      provider: 'ollama',
      baseUrl: 'http://localhost:11434/v1',
      model: 'gemma4',
    });
  });

  it('gives the page a photo check or a Coach check under the app’s time limit', () => {
    const plan = planChecks({ PLATEWISE_PROBE_KEY_GEMINI: 'g-1' });
    const photo = checkInput(stepOf(plan, 'photo-gemini') as PlannedCheck, 'BASE64');
    expect(photo).toEqual({
      kind: 'photo',
      provider: 'gemini',
      baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
      model: 'gemini-3.5-flash-lite',
      key: 'g-1',
      timeoutSeconds: CHECK_TIMEOUT_SECONDS,
      photo: 'BASE64',
    });
    expect(checkInput(stepOf(plan, 'coach') as PlannedCheck, 'BASE64')).not.toHaveProperty('photo');
  });
});

describe('judge and the table', () => {
  const photoStep: PlannedCheck = {
    kind: 'run',
    check: 'photo-openai',
    provider: 'mistral',
    baseUrl: 'https://api.mistral.ai/v1',
    model: 'mistral-small-2603',
    key: 'mi-1',
  };
  const coachStep: PlannedCheck = { ...photoStep, check: 'coach' };

  it('passes a parsed photo answer and a Coach answer, with their facts', () => {
    expect(judge(photoStep, PASS_PHOTO)).toEqual({
      check: 'photo-openai',
      provider: 'Mistral AI',
      model: 'mistral-small-2603',
      result: 'pass',
      detail: 'parsed: 412 kcal, 3 parts; 1 request (HTTP 200); 2140 ms',
    });
    expect(judge(coachStep, PASS_COACH).detail).toBe(
      'answered in 240 characters, 2 tool rounds; 3 requests (HTTP 200, 200, 200); 5310 ms',
    );
  });

  it('fails with the kind and the status it was read from', () => {
    const row = judge(photoStep, {
      ok: false,
      ms: 820,
      requests: 2,
      statuses: [503, 401],
      failure: 'keyRejected',
      failureStatus: 401,
    });
    expect(row.result).toBe('fail');
    expect(row.detail).toBe('keyRejected at HTTP 401; 2 requests (HTTP 503, 401); 820 ms');
    expect(
      judge(photoStep, { ok: false, ms: 30_000, requests: 1, statuses: [], failure: 'timeout' })
        .detail,
    ).toBe('timeout; 1 request; 30000 ms');
  });

  it('prints aligned rows, planned ones with their address and never a key', () => {
    const text = formatTable(planChecks({ PLATEWISE_PROBE_KEY_ANTHROPIC: 'an-key-1' }).map(unrun));
    expect(text).not.toContain('an-key-1');
    expect(text.split('\n')).toEqual([
      'check            provider   model             result   detail',
      'photo-gemini     -          -                 skipped  no keys: set PLATEWISE_PROBE_KEY_GEMINI',
      'photo-anthropic  Anthropic  claude-haiku-5-5  planned  https://api.anthropic.com/v1',
      'photo-openai     -          -                 skipped  no keys: set PLATEWISE_PROBE_KEY_<ID> of an OpenAI-compatible provider',
      'coach            Anthropic  claude-haiku-5-5  planned  https://api.anthropic.com/v1',
    ]);
  });
});

describe('main (P10-12): opt-in, skipped without keys, never a key in the output', () => {
  it('prints "skipped" and starts nothing without PLATEWISE_LIVE=1', async () => {
    for (const flag of [undefined, '0', 'true', ' 1']) {
      const io = capture();
      const open = vi.fn<OpenSession>();
      const env = { PLATEWISE_LIVE: flag, PLATEWISE_PROBE_KEY_OPENAI: 'sk-1' };
      await expect(main(env, [], { ...io.options, open })).resolves.toBe(0);
      expect(io.out).toHaveLength(1);
      expect(io.out[0]).toMatch(/^Live provider check skipped: set PLATEWISE_LIVE=1/);
      expect(open).not.toHaveBeenCalled();
    }
  });

  it('says "skipped: no keys" and opens no browser when the flag is set but no key is', async () => {
    const io = capture();
    const open = vi.fn<OpenSession>();
    await expect(main({ PLATEWISE_LIVE: '1' }, [], { ...io.options, open })).resolves.toBe(0);
    expect(open).not.toHaveBeenCalled();
    expect(io.all()).toMatch(/Live provider check skipped: no keys\. Nothing was sent\.$/);
    expect(io.all().match(/\sskipped\s/g)).toHaveLength(4);
    expect(io.errors).toEqual([]);
  });

  it('prints the plan on --dry-run, with or without the flag, and starts nothing', async () => {
    for (const flag of [undefined, '1']) {
      const io = capture();
      const open = vi.fn<OpenSession>();
      const env = { PLATEWISE_LIVE: flag, PLATEWISE_PROBE_KEY_GEMINI: 'AIza-dry-1' };
      await expect(main(env, ['--dry-run'], { ...io.options, open })).resolves.toBe(0);
      expect(open).not.toHaveBeenCalled();
      expect(io.all()).toMatch(/photo-gemini\s+Gemini\s+gemini-3\.5-flash-lite\s+planned/);
      expect(io.all()).toMatch(/Dry run: 2 checks would run; nothing was sent\.$/);
      expect(io.all()).not.toContain('AIza-dry-1');
    }
  });

  it('runs the planned checks in order and never prints a key, whoever writes it', async () => {
    const io = capture();
    const key = 'sk-ant-live-secret-77';
    const { session, asked } = fakeSession([PASS_PHOTO, PASS_COACH], {
      browser: `Chromium (launched with ${key})`,
    });
    const open: OpenSession = async (log) => {
      log(`request headers: { 'x-api-key': '${key}', authorization: 'Bearer other-77' }`);
      return session;
    };
    const env = { PLATEWISE_LIVE: '1', PLATEWISE_PROBE_KEY_ANTHROPIC: key };
    await expect(main(env, [], { ...io.options, open })).resolves.toBe(0);

    expect(asked.map((check) => [check.kind, check.provider])).toEqual([
      ['photo', 'anthropic'],
      ['coach', 'anthropic'],
    ]);
    expect(asked[0]).toMatchObject({ photo: '/9j/AAAA', key });
    const printed = io.all();
    expect(printed).not.toContain(key);
    expect(printed).not.toContain('other-77');
    expect(printed).toContain('[redacted]');
    expect(printed).toMatch(
      /photo-anthropic\s+Anthropic\s+claude-haiku-5-5\s+pass\s+parsed: 412 kcal/,
    );
    expect(printed).toMatch(/coach\s+Anthropic\s+claude-haiku-5-5\s+pass\s+answered/);
    expect(printed).toMatch(/photo-gemini\s+-\s+-\s+skipped/);
    expect(session.close).toHaveBeenCalledOnce();
  });

  it('exits 1 with a redacted error, and closes the session, when a check breaks the page', async () => {
    const io = capture();
    const { session } = fakeSession([], {
      run: vi.fn(async () => {
        throw new Error('page crashed holding gsk-live-secret-9');
      }),
    });
    const env = { PLATEWISE_LIVE: '1', PLATEWISE_PROBE_KEY_GROQ: 'gsk-live-secret-9' };
    await expect(main(env, [], { ...io.options, open: async () => session })).resolves.toBe(1);
    expect(session.close).toHaveBeenCalledOnce();
    expect(io.errors.join('\n')).toMatch(
      /^Live provider check failed: Error: page crashed holding \[redacted\]/,
    );
    expect(io.all()).not.toContain('gsk-live-secret-9');
  });

  it('exits 1 when the browser cannot start or cannot be closed', async () => {
    const io = capture();
    const env = { PLATEWISE_LIVE: '1', PLATEWISE_PROBE_KEY_GEMINI: 'AIza-live-3' };
    const open: OpenSession = async () => {
      throw new Error('launch failed with AIza-live-3');
    };
    await expect(main(env, [], { ...io.options, open })).resolves.toBe(1);
    expect(io.all()).not.toContain('AIza-live-3');

    const io2 = capture();
    const { session } = fakeSession([PASS_PHOTO, PASS_COACH], {
      close: vi.fn(async () => {
        throw new Error('still running');
      }),
    });
    await expect(main(env, [], { ...io2.options, open: async () => session })).resolves.toBe(1);
    expect(io2.errors.join('\n')).toMatch(/could not close .*still running/);
  });
});
