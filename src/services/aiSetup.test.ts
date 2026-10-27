import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_AI_SETTINGS, type AiSettings } from '../ai/settings';
import { createSecretsRepo, FDC_SLOT } from '../data/repos/secretsRepo';
import { createSettingsRepo } from '../data/repos/settingsRepo';
import { openTestDb } from '../test/db';
import {
  createAiSetupService,
  hasSettingsEdits,
  ServerUrlRefusedError,
  type AiChoice,
  type AiSetupService,
} from './aiSetup';

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

// ---- The AI settings page's writes (P09-07) ------------------------------------------------------

const OPENAI_KEY = 'sk-proj-4fA9xQ2mZ7bW1cR8tY5u';

describe('saveRole', () => {
  it('stores a text standby with its own provider and key, keeping its switch and the rest', async () => {
    const { settingsRepo, secretsRepo, service } = await setUp();
    await service.saveChoice(gemini);
    await service.setRoleOn('textStandby', true);

    const saved = await service.saveRole('textStandby', {
      provider: 'cerebras',
      model: ' qwen-3.8-27b ',
      serverUrl: '',
      key: ` ${OPENAI_KEY} `,
    });

    expect(saved).toEqual({ keyMask: 'sk-p…tY5u', missing: [] });
    expect(await secretsRepo.get('cerebras')).toBe(OPENAI_KEY);
    expect(await settingsRepo.get('ai.settings')).toEqual({
      ...DEFAULT_AI_SETTINGS,
      primary: { provider: 'gemini', model: 'gemini-3.8-flash' },
      textStandby: { on: true, provider: 'cerebras', model: 'qwen-3.8-27b' },
    });
  });

  it('keeps a standby address in the standby slot and the main address as it was (R03.5)', async () => {
    const { settingsRepo, service } = await setUp();
    await service.saveChoice(ollama);

    await service.saveRole('imageStandby', {
      ...ollama,
      model: 'gemma4',
      serverUrl: 'http://localhost:11434/v1/',
    });

    const stored = await settingsRepo.get('ai.settings');
    expect(stored?.endpoints).toEqual({
      ollama: { main: 'https://ollama.home.example/v1', standby: 'http://localhost:11434/v1' },
    });
    expect(stored?.imageStandby).toEqual({ on: false, provider: 'ollama', model: 'gemma4' });
    expect(stored?.primary).toEqual({ provider: 'ollama', model: 'qwen3.5:9b' });
  });

  it('shares one key per provider: a key saved for a standby is the primary’s key too', async () => {
    const { service } = await setUp();
    await service.saveChoice({ ...gemini, key: '' });

    await service.saveRole('imageStandby', { ...gemini, model: 'gemini-4-argon' });

    expect(await service.savedKeyMask('gemini')).toBe(GEMINI_MASK);
    expect(await service.saveChoice({ ...gemini, key: '' })).toEqual({
      keyMask: GEMINI_MASK,
      missing: [],
    });
  });

  it('refuses a provider that cannot read photos for the photo standby, but not for text', async () => {
    const { service } = await setUp();
    const deepseek: AiChoice = { ...gemini, provider: 'deepseek', model: 'deepseek-flash' };

    await expect(service.saveRole('imageStandby', deepseek)).rejects.toBeInstanceOf(TypeError);
    await expect(service.saveRole('textRole', deepseek)).resolves.toEqual({
      keyMask: GEMINI_MASK,
      missing: [],
    });
  });

  it('refuses plain http to another machine for a standby (D-16.26)', async () => {
    const { service } = await setUp();

    await expect(
      service.saveRole('textStandby', { ...ollama, serverUrl: 'http://192.168.1.20:11434/v1' }),
    ).rejects.toMatchObject({ problem: 'plainHttp' });
  });
});

describe('setRoleOn', () => {
  it('switches a role on and off and keeps its provider and model', async () => {
    const { settingsRepo, service } = await setUp();
    await service.saveRole('textRole', { ...gemini, provider: 'openai', model: 'gpt-6-luna' });

    await service.setRoleOn('textRole', true);
    expect((await settingsRepo.get('ai.settings'))?.textRole).toEqual({
      on: true,
      provider: 'openai',
      model: 'gpt-6-luna',
    });
    await service.setRoleOn('textRole', false);
    expect((await settingsRepo.get('ai.settings'))?.textRole.on).toBe(false);
  });
});

describe('limits and notes', () => {
  it('clamps the time limit to 30–600 whole seconds', async () => {
    const { settingsRepo, service } = await setUp();

    expect(await service.setTimeoutSec(10)).toBe(30);
    expect(await service.setTimeoutSec(9_000)).toBe(600);
    expect(await service.setTimeoutSec(240.4)).toBe(240);
    expect((await settingsRepo.get('ai.settings'))?.timeoutSec).toBe(240);
  });

  it('keeps the answer token limit whole and at least 1, with no upper bound (D-16.25)', async () => {
    const { service } = await setUp();

    expect(await service.setMaxTokens(0)).toBe(1);
    expect(await service.setMaxTokens(2_048.9)).toBe(2_048);
    expect(await service.setMaxTokens(65_536)).toBe(65_536);
  });

  it('stores the OpenRouter effort and the notes trimmed; blank notes send none', async () => {
    const { settingsRepo, service } = await setUp();

    await service.setOpenRouterEffort('high');
    expect(await service.setInstructions('  I eat halal.\n')).toBe('I eat halal.');
    let stored = await settingsRepo.get('ai.settings');
    expect(stored).toMatchObject({ openRouterEffort: 'high', instructions: 'I eat halal.' });

    expect(await service.setInstructions(' \n ')).toBe('');
    stored = await settingsRepo.get('ai.settings');
    expect(stored?.instructions).toBe('');
  });
});

describe('forgetting keys', () => {
  it('removes one provider’s key and leaves the others', async () => {
    const { secretsRepo, service } = await setUp();
    await service.saveChoice(gemini);
    await secretsRepo.set('openai', OPENAI_KEY);

    await service.forgetKey('gemini');

    expect(await secretsRepo.slots()).toEqual(['openai']);
    expect(await service.savedKeyMask('gemini')).toBeNull();
  });
});

describe('the food-database key', () => {
  const FDC_KEY = 'DEMO4fA9xQ2mZ7bW1cR8tY5uI3oP6aS0dF4gH2jK';

  it('stores the key trimmed in the fdc slot and shows it masked', async () => {
    const { secretsRepo, service } = await setUp();

    expect(await service.foodDbKeyMask()).toBeNull();
    expect(await service.saveFoodDbKey(`  ${FDC_KEY}\n`)).toEqual({ ok: true, value: 'DEMO…H2jK' });
    expect(await secretsRepo.get(FDC_SLOT)).toBe(FDC_KEY);
    expect(await service.foodDbKeyMask()).toBe('DEMO…H2jK');
  });

  it('refuses a blank key and one a request header cannot carry, storing nothing (R02.18)', async () => {
    const { secretsRepo, service } = await setUp();

    expect(await service.saveFoodDbKey('  ')).toEqual({ ok: false, error: 'empty' });
    expect(await service.saveFoodDbKey(`DEMO\u200b${FDC_KEY}`)).toEqual({
      ok: false,
      error: 'unsafe',
    });
    expect(await service.saveFoodDbKey('DEMO key 1234')).toEqual({ ok: false, error: 'unsafe' });
    expect(await secretsRepo.slots()).toEqual([]);
  });

  it('forgets the food-database key and leaves the AI keys', async () => {
    const { secretsRepo, service } = await setUp();
    await service.saveChoice(gemini);
    await service.saveFoodDbKey(FDC_KEY);

    await service.forgetFoodDbKey();

    expect(await secretsRepo.slots()).toEqual(['gemini']);
  });
});

describe('hasSettingsEdits', () => {
  it('tells the real service from a stand-in without the settings page’s writes', async () => {
    const { service } = await setUp();
    const standIn: AiSetupService = {
      saveChoice: service.saveChoice,
      savedKeyMask: service.savedKeyMask,
      setTermsAccepted: service.setTermsAccepted,
      setUpLater: service.setUpLater,
    };

    expect(hasSettingsEdits(service)).toBe(true);
    expect(hasSettingsEdits(standIn)).toBe(false);
  });
});
