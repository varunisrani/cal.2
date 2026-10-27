import { describe, expect, it } from 'vitest';
import { fitCheckPrompt } from '../ai/prompts/fitCheck';
import { DEFAULT_AI_SETTINGS } from '../ai/settings';
import { fakeFetch, type RecordedRequest } from '../ai/testing/fakeFetch';
import { geminiAnswer, geminiError } from '../ai/testing/wire';
import { makeProfile } from '../test/factories';
import type { StoredAiAccess } from './aiAccess';
import { createFitCheckService, type FitCheckInput } from './fitCheck';

const GEMINI = 'https://generativelanguage.googleapis.com/';
const KEYS = { gemini: 'gm-fit-key-8812' };

const INPUT: FitCheckInput = {
  profile: makeProfile(),
  today: '2026-10-26',
  units: { energy: 'kcal', weight: 'kg', height: 'cm' },
  targets: { kcal: 2_000, protein: 110, carbs: 230, fat: 65 },
  eaten: { kcal: 1_500, protein: 70, carbs: 180, fat: 50 },
  meal: { name: 'Pasta bake', kcal: 700, protein: 30, carbs: 80, fat: 28 },
  todaysMeals: [{ name: 'Granola', kcal: 1_500, protein: 70, carbs: 180, fat: 50 }],
};

const SET_UP: StoredAiAccess = { settings: DEFAULT_AI_SETTINGS, keys: KEYS, configured: true };

interface GeminiBody {
  readonly contents: readonly { readonly parts: readonly { readonly text?: string }[] }[];
  readonly generationConfig?: { readonly responseMimeType?: string };
}
const bodyOf = (request: RecordedRequest | undefined) => request?.body as GeminiBody | undefined;

function serviceWith(access: StoredAiAccess = SET_UP) {
  const fake = fakeFetch();
  const service = createFitCheckService({ aiAccess: async () => access, fetch: fake.fetch });
  return { fake, service };
}

describe('createFitCheckService (03 §3.11)', () => {
  it('sends our fit-check prompt as prose and gives back the trimmed answer', async () => {
    const { fake, service } = serviceWith();
    fake.on(GEMINI, { json: geminiAnswer('  It fits if dinner stays light.  ') });

    const outcome = await service.suggest(INPUT, new AbortController().signal);
    expect(outcome).toEqual({ kind: 'text', text: 'It fits if dinner stays light.' });
    const body = bodyOf(fake.requests[0]);
    expect(body?.generationConfig?.responseMimeType).toBeUndefined();
    const prompt = body?.contents[0]?.parts.map((part) => part.text ?? '').join('') ?? '';
    expect(prompt).toContain(fitCheckPrompt(INPUT).prompt);
  });

  it('treats an answer with only spaces as unusable, never as text to show', async () => {
    const { fake, service } = serviceWith();
    fake.on(GEMINI, { json: geminiAnswer('   ') });
    expect(await service.suggest(INPUT, new AbortController().signal)).toEqual({
      kind: 'failed',
      messages: [{ key: 'ai.failure.invalidResponse' }],
    });
  });

  it('sends nothing without an AI set up, and nothing for a provider without a key', async () => {
    const notSetUp = serviceWith({ ...SET_UP, configured: false });
    expect(await notSetUp.service.suggest(INPUT, new AbortController().signal)).toEqual({
      kind: 'noKey',
    });
    expect(notSetUp.fake.requests).toHaveLength(0);

    const noKey = serviceWith({ ...SET_UP, keys: {} });
    expect(await noKey.service.suggest(INPUT, new AbortController().signal)).toEqual({
      kind: 'noKey',
    });
    expect(noKey.fake.requests).toHaveLength(0);
  });

  it('gives a failure its messages', async () => {
    const { fake, service } = serviceWith();
    fake.on(GEMINI, { status: 401, json: geminiError(401, 'UNAUTHENTICATED', 'Refused.') });
    expect(await service.suggest(INPUT, new AbortController().signal)).toEqual({
      kind: 'failed',
      messages: [{ key: 'ai.failure.keyRejected' }],
    });
  });

  it('is cancelled, silently, when the caller stops it before or during the request', async () => {
    const before = serviceWith();
    const stopped = new AbortController();
    stopped.abort();
    expect(await before.service.suggest(INPUT, stopped.signal)).toEqual({ kind: 'cancelled' });
    expect(before.fake.requests).toHaveLength(0);

    const stop = new AbortController();
    const service = createFitCheckService({
      aiAccess: async () => SET_UP,
      fetch: (_input, init) => {
        stop.abort();
        return Promise.reject(init?.signal?.reason ?? new DOMException('Stopped', 'AbortError'));
      },
    });
    expect(await service.suggest(INPUT, stop.signal)).toEqual({ kind: 'cancelled' });
  });
});
