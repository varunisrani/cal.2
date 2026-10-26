import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_AI_SETTINGS, type AiSettings } from '../ai/settings';
import { createSecretsRepo, FDC_SLOT } from '../data/repos/secretsRepo';
import { createSettingsRepo } from '../data/repos/settingsRepo';
import { openTestDb } from '../test/db';
import { createAiSetupService, ServerUrlRefusedError, type AiChoice } from './aiSetup';

const GEMINI_KEY = 'AIzaSyD-4fA9xQ2mZ7bW1cR8tY5uI3oP6aS0dF4';
const GEMINI_MASK = 'AIza…0dF4';

const closers: Array<() => void> = [];
afterEach(() => {
  for (const close of closers.splice(0)) close();
});

async function setUp() {
  const { db, bus } = await openTestDb();
  closers.push(() => db.close());
  const settingsRepo = createSettingsRepo(db, { locale: 'en-GB', bus });
  const secretsRepo = createSecretsRepo(db);
  const service = createAiSetupService({ settingsRepo, secretsRepo });
  return { settingsRepo, secretsRepo, service };
}

const gemini: AiChoice = {
  provider: 'gemini',
  model: 'gemini-3.8-flash',
  serverUrl: '',
  key: GEMINI_KEY,
};

const ollama: AiChoice = {
  provider: 'ollama',
  model: 'qwen3.5:9b',
  serverUrl: 'https://ollama.home.example/v1/',
  key: '',
};

describe('saveChoice', () => {
  it('stores the primary in ai.settings and the key, trimmed, in its provider slot (R03.20)', async () => {
    const { settingsRepo, secretsRepo, service } = await setUp();

    const saved = await service.saveChoice({ ...gemini, key: `  ${GEMINI_KEY}\n` });

    expect(saved).toEqual({ keyMask: GEMINI_MASK, missing: [] });
    expect(await secretsRepo.get('gemini')).toBe(GEMINI_KEY);
    expect(await settingsRepo.get('ai.settings')).toEqual({
      ...DEFAULT_AI_SETTINGS,
      primary: { provider: 'gemini', model: 'gemini-3.8-flash' },
    });
  });

  it('keeps the saved key when no key is typed, and reports a key still missing', async () => {
    const { secretsRepo, service } = await setUp();
    await service.saveChoice(gemini);

    expect(await service.saveChoice({ ...gemini, key: '  ' })).toEqual({
      keyMask: GEMINI_MASK,
      missing: [],
    });
    expect(await secretsRepo.get('gemini')).toBe(GEMINI_KEY);
    expect(
      await service.saveChoice({ ...gemini, provider: 'openai', model: 'gpt-6-luna', key: '' }),
    ).toEqual({ keyMask: null, missing: ['key'] });
  });

  it('keeps every other AI setting and the standby address of a server', async () => {
    const { settingsRepo, service } = await setUp();
    const before: AiSettings = {
      ...DEFAULT_AI_SETTINGS,
      textRole: { on: true, provider: 'groq', model: 'openai/gpt-oss-120b' },
      endpoints: { ollama: { main: 'http://localhost:11434/v1', standby: 'https://b.example/v1' } },
      instructions: 'I am vegetarian.',
      maxTokens: 2_048,
    };
    await settingsRepo.set('ai.settings', before);

    await service.saveChoice(ollama);

    expect(await settingsRepo.get('ai.settings')).toEqual({
      ...before,
      primary: { provider: 'ollama', model: 'qwen3.5:9b' },
      endpoints: {
        ollama: { main: 'https://ollama.home.example/v1', standby: 'https://b.example/v1' },
      },
    });
  });

  it('stores no key for Ollama, which never takes one, and finds nothing missing', async () => {
    const { secretsRepo, service } = await setUp();

    expect(await service.saveChoice({ ...ollama, key: 'ignored' })).toEqual({
      keyMask: null,
      missing: [],
    });
    expect(await secretsRepo.slots()).toEqual([]);
  });

  it('reports a Custom server without a model as missing it (R03.20)', async () => {
    const { service } = await setUp();

    const saved = await service.saveChoice({
      provider: 'custom',
      model: ' ',
      serverUrl: 'https://llm.example/v1',
      key: '',
    });

    expect(saved).toEqual({ keyMask: null, missing: ['model'] });
  });

  it('refuses plain http to another machine and saves nothing (D-16.26, R03.3)', async () => {
    const { settingsRepo, service } = await setUp();

    const saving = service.saveChoice({ ...ollama, serverUrl: 'http://10.0.0.2:11434/v1' });

    await expect(saving).rejects.toBeInstanceOf(ServerUrlRefusedError);
    await expect(saving).rejects.toMatchObject({ problem: 'plainHttp' });
    expect(await settingsRepo.get('ai.settings')).toBeNull();
  });

  it('refuses a provider that cannot read photos as the primary', async () => {
    const { service } = await setUp();

    await expect(
      service.saveChoice({ ...gemini, provider: 'deepseek', model: 'deepseek-flash' }),
    ).rejects.toBeInstanceOf(TypeError);
  });
});

describe('savedKeyMask', () => {
  it('shows a saved key as its first and last four characters, or null', async () => {
    const { secretsRepo, service } = await setUp();
    await secretsRepo.set('gemini', GEMINI_KEY);

    expect(await service.savedKeyMask('gemini')).toBe(GEMINI_MASK);
    expect(await service.savedKeyMask('openai')).toBeNull();
  });
});

describe('setTermsAccepted', () => {
  it('records the terms box', async () => {
    const { settingsRepo, service } = await setUp();

    await service.setTermsAccepted(true);
    expect(await settingsRepo.get('onboarding.termsAccepted')).toBe(true);
    await service.setTermsAccepted(false);
    expect(await settingsRepo.get('onboarding.termsAccepted')).toBe(false);
  });
});

describe('setUpLater', () => {
  it('stores no provider: the AI settings go back to null and the AI keys are removed (D-16.49)', async () => {
    const { settingsRepo, secretsRepo, service } = await setUp();
    await service.saveChoice(gemini);
    await secretsRepo.set('openai', 'sk-proj-1234567890abcdef');
    await secretsRepo.set(FDC_SLOT, 'fdc-key-1234567890');

    await service.setUpLater();

    expect(await settingsRepo.get('ai.settings')).toBeNull();
    expect(await secretsRepo.slots()).toEqual([FDC_SLOT]);
  });
});
