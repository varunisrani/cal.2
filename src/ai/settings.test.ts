import { describe, expect, it } from 'vitest';
import { defaultModel, presetsFor, type PresetUpgradeStep } from './catalog/presets';
import {
  DEFAULT_AI_SETTINGS,
  decodeAiSettings,
  effectiveBaseUrl,
  keyFor,
  missingFor,
  readMaxTokens,
  readTimeoutSec,
  roleFor,
  standbyFor,
  upgradeAiSettings,
  type AiSettings,
  type ProviderKeys,
} from './settings';

const PHOTO = { images: ['a meal photo'] };
const TEXT = { images: [] };

/** Settings from a stored record, the way the app reads them. */
const settingsOf = (raw: Record<string, unknown>): AiSettings => decodeAiSettings(raw);

const geminiDefault = defaultModel('gemini', 'image');
const geminiOther = presetsFor('gemini', 'image')[1]!;

describe('defaults (03 §3.3)', () => {
  it('starts with Gemini as the primary and everything optional switched off', () => {
    expect(DEFAULT_AI_SETTINGS).toEqual({
      primary: { provider: 'gemini', model: geminiDefault },
      textRole: { on: false, provider: 'gemini', model: defaultModel('gemini', 'text') },
      imageStandby: { on: false, provider: 'gemini', model: geminiDefault },
      textStandby: { on: false, provider: 'gemini', model: defaultModel('gemini', 'text') },
      endpoints: {},
      instructions: '',
      maxTokens: 1024,
      timeoutSec: 180,
      openRouterEffort: 'auto',
    });
  });

  it('gives the defaults for nothing stored or something that is not a record', () => {
    for (const raw of [null, undefined, 'gemini', 42, [], true]) {
      expect(decodeAiSettings(raw)).toEqual(DEFAULT_AI_SETTINGS);
    }
    expect(decodeAiSettings({})).toEqual(DEFAULT_AI_SETTINGS);
  });
});

describe('decodeAiSettings: each field on its own', () => {
  it('reads a complete record back as it was saved', () => {
    const saved: AiSettings = {
      primary: { provider: 'ollama', model: 'qwen3.5:9b' },
      textRole: { on: true, provider: 'deepseek', model: defaultModel('deepseek', 'text') },
      imageStandby: { on: true, provider: 'openrouter', model: 'someone/house-vision-7' },
      textStandby: { on: false, provider: 'custom', model: 'plate-reader-v2' },
      endpoints: {
        ollama: { main: 'http://localhost:11434/v1', standby: 'https://ollama.example.org/v1' },
        custom: { main: '', standby: 'https://relay.example.org/v1' },
      },
      instructions: 'Vegetarian; portions are usually small.',
      maxTokens: 2048,
      timeoutSec: 300,
      openRouterEffort: 'high',
    };
    expect(decodeAiSettings(JSON.parse(JSON.stringify(saved)))).toEqual(saved);
  });

  it('clamps the time limit to 30–600 s and rounds it: 10 → 30, 900 → 600', () => {
    expect(settingsOf({ timeoutSec: 10 }).timeoutSec).toBe(30);
    expect(settingsOf({ timeoutSec: 900 }).timeoutSec).toBe(600);
    expect(readTimeoutSec(45.6)).toBe(46);
    for (const junk of ['120', null, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(readTimeoutSec(junk)).toBe(180);
    }
  });

  it('keeps the answer token limit whole and at least 1, with no upper bound (D-16.65)', () => {
    expect(readMaxTokens(0)).toBe(1);
    expect(readMaxTokens(-50)).toBe(1);
    expect(readMaxTokens(1500.9)).toBe(1500);
    expect(readMaxTokens(65_536)).toBe(65_536);
    for (const junk of ['2048', undefined, Number.NaN]) expect(readMaxTokens(junk)).toBe(1024);
  });

  it('reads the reasoning effort, auto for anything unknown', () => {
    expect(settingsOf({ openRouterEffort: 'minimal' }).openRouterEffort).toBe('minimal');
    expect(settingsOf({ openRouterEffort: 'extreme' }).openRouterEffort).toBe('auto');
  });

  it('trims the notes for the AI', () => {
    expect(settingsOf({ instructions: '  No pork.\n' }).instructions).toBe('No pork.');
    expect(settingsOf({ instructions: 7 }).instructions).toBe('');
  });

  it('keeps photo roles on providers that read photos', () => {
    const settings = settingsOf({
      primary: { provider: 'deepseek', model: 'anything' },
      imageStandby: { on: true, provider: 'cerebras', model: 'anything' },
      textRole: { on: true, provider: 'cerebras', model: defaultModel('cerebras', 'text') },
    });
    expect(settings.primary).toEqual(DEFAULT_AI_SETTINGS.primary);
    expect(settings.imageStandby).toEqual({ ...DEFAULT_AI_SETTINGS.imageStandby, on: true });
    expect(settings.textRole.provider).toBe('cerebras');
  });

  it('replaces an unknown provider and a model the provider no longer lists', () => {
    const settings = settingsOf({
      primary: { provider: 'acme', model: 'x' },
      textStandby: { on: true, provider: 'gemini', model: 'gemini-0-retired' },
    });
    expect(settings.primary).toEqual(DEFAULT_AI_SETTINGS.primary);
    expect(settings.textStandby).toEqual({
      on: true,
      provider: 'gemini',
      model: defaultModel('gemini', 'text'),
    });
  });

  it('keeps addresses only for Ollama and Custom, tidied (no proxy for cloud vendors)', () => {
    const settings = settingsOf({
      endpoints: {
        ollama: { main: ' http://localhost:11434/v1/ ', standby: 5 },
        custom: { main: '', standby: '' },
        openai: { main: 'https://relay.example.org/v1', standby: '' },
        nobody: { main: 'https://x.example.org' },
      },
    });
    expect(settings.endpoints).toEqual({
      ollama: { main: 'http://localhost:11434/v1', standby: '' },
    });
    expect(effectiveBaseUrl(settings, 'openai', 'main')).toBe('https://api.openai.com/v1');
  });
});

describe('effectiveBaseUrl', () => {
  it('uses the slot of the role, else the provider default (Custom has none)', () => {
    const settings = settingsOf({
      endpoints: { ollama: { main: '', standby: 'https://ollama.example.org/v1' } },
    });
    expect(effectiveBaseUrl(settings, 'ollama', 'main')).toBe('http://localhost:11434/v1');
    expect(effectiveBaseUrl(settings, 'ollama', 'standby')).toBe('https://ollama.example.org/v1');
    expect(effectiveBaseUrl(settings, 'custom', 'main')).toBe('');
  });
});

describe('roleFor: who serves a request (03 §3.3, ACC-E3-1)', () => {
  const withText = (on: boolean): AiSettings =>
    settingsOf({
      primary: { provider: 'openai', model: defaultModel('openai', 'image') },
      textRole: { on, provider: 'deepseek', model: 'deepseek-v4-pro' },
    });

  it('sends a photo request to the primary even with a text provider switched on', () => {
    expect(roleFor(PHOTO, withText(true))).toEqual({
      route: 'photo',
      role: 'primary',
      provider: 'openai',
      model: defaultModel('openai', 'image'),
      baseUrl: 'https://api.openai.com/v1',
    });
  });

  it('sends a typed description to the text provider when one is switched on', () => {
    expect(roleFor(TEXT, withText(true))).toEqual({
      route: 'text',
      role: 'textRole',
      provider: 'deepseek',
      model: 'deepseek-v4-pro',
      baseUrl: 'https://api.deepseek.com',
    });
    expect(roleFor({}, withText(true)).role).toBe('textRole');
  });

  it('sends a typed description to the primary when the text provider is off', () => {
    expect(roleFor(TEXT, withText(false))).toMatchObject({
      route: 'text',
      role: 'primary',
      provider: 'openai',
    });
  });

  it("reads Ollama's address from the main slot", () => {
    const settings = settingsOf({
      primary: { provider: 'ollama', model: 'gemma4' },
      endpoints: { ollama: { main: 'https://ollama.example.org/v1', standby: '' } },
    });
    expect(roleFor(PHOTO, settings).baseUrl).toBe('https://ollama.example.org/v1');
  });
});

describe('missingFor and keyFor: what a role still needs (R03.20)', () => {
  const role = (provider: string, model: string, baseUrl: string) =>
    ({ provider, model, baseUrl }) as Parameters<typeof missingFor>[0];

  it('trims keys, so a pasted newline or spaces never reach a header; blank is no key', () => {
    const keys: ProviderKeys = { openai: '  sk-test-1234\n', gemini: '   ' };
    expect(keyFor('openai', keys)).toBe('sk-test-1234');
    expect(keyFor('gemini', keys)).toBeUndefined();
    expect(keyFor('mistral', keys)).toBeUndefined();
  });

  it('asks for a key where one is required, never for Ollama, and only optionally for Custom', () => {
    const url = 'https://relay.example.org/v1';
    expect(missingFor(role('openai', 'gpt-6-luna', 'https://api.openai.com/v1'), {})).toEqual([
      'key',
    ]);
    expect(missingFor(role('ollama', 'gemma4', 'http://localhost:11434/v1'), {})).toEqual([]);
    expect(missingFor(role('custom', 'plate-reader-v2', url), {})).toEqual([]);
  });

  it('calls Custom without a model, or without an address, incomplete', () => {
    expect(missingFor(role('custom', '  ', 'https://relay.example.org/v1'), {})).toEqual(['model']);
    expect(missingFor(role('custom', 'plate-reader-v2', ''), {})).toEqual(['server']);
    const settings = settingsOf({ primary: { provider: 'custom', model: '' } });
    expect(missingFor(roleFor(PHOTO, settings), {})).toEqual(['model', 'server']);
  });
});

describe('standbyFor: when a standby may run (R03.5)', () => {
  const keys: ProviderKeys = { gemini: 'g-key', openai: 'o-key', deepseek: 'd-key' };

  const photoStandby = (standby: Record<string, unknown>, extra: Record<string, unknown> = {}) =>
    settingsOf({
      primary: { provider: 'gemini', model: geminiDefault },
      imageStandby: { on: true, ...standby },
      ...extra,
    });

  it('is invalid when it is the same provider, model and address as the primary', () => {
    const settings = photoStandby({ provider: 'gemini', model: geminiDefault });
    expect(standbyFor(roleFor(PHOTO, settings), settings, keys)).toBeNull();
  });

  it('is valid for the same provider with another model', () => {
    const settings = photoStandby({ provider: 'gemini', model: geminiOther });
    expect(standbyFor(roleFor(PHOTO, settings), settings, keys)).toEqual({
      route: 'photo',
      role: 'imageStandby',
      provider: 'gemini',
      model: geminiOther,
      baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    });
  });

  it('lets two Ollama servers run the same model as primary and standby (ACC-E3-2)', () => {
    const settings = settingsOf({
      primary: { provider: 'ollama', model: 'qwen3.5:9b' },
      imageStandby: { on: true, provider: 'ollama', model: 'qwen3.5:9b' },
      endpoints: {
        ollama: { main: 'http://localhost:11434/v1', standby: 'https://ollama.example.org/v1' },
      },
    });
    const primary = roleFor(PHOTO, settings);
    expect(primary.baseUrl).toBe('http://localhost:11434/v1');
    expect(standbyFor(primary, settings, {})).toMatchObject({
      provider: 'ollama',
      model: 'qwen3.5:9b',
      baseUrl: 'https://ollama.example.org/v1',
    });
  });

  it('treats an empty standby slot as the default server, not as the main slot', () => {
    const settings = settingsOf({
      primary: { provider: 'ollama', model: 'gemma4' },
      imageStandby: { on: true, provider: 'ollama', model: 'gemma4' },
      endpoints: { ollama: { main: 'https://ollama.example.org/v1', standby: '' } },
    });
    expect(standbyFor(roleFor(PHOTO, settings), settings, {})?.baseUrl).toBe(
      'http://localhost:11434/v1',
    );
  });

  it('is invalid when the two addresses differ only in spelling', () => {
    const settings = settingsOf({
      primary: { provider: 'ollama', model: 'gemma4' },
      imageStandby: { on: true, provider: 'ollama', model: 'gemma4' },
      endpoints: {
        ollama: { main: 'http://LOCALHOST:11434/v1/', standby: 'http://localhost:11434/v1' },
      },
    });
    expect(standbyFor(roleFor(PHOTO, settings), settings, {})).toBeNull();
  });

  it('is invalid when switched off or without a key it requires; Ollama needs none', () => {
    const off = settingsOf({ imageStandby: { on: false, provider: 'openai', model: '' } });
    expect(standbyFor(roleFor(PHOTO, off), off, keys)).toBeNull();
    const noKey = photoStandby({ provider: 'mistral', model: '' });
    expect(standbyFor(roleFor(PHOTO, noKey), noKey, keys)).toBeNull();
    expect(standbyFor(roleFor(PHOTO, noKey), noKey, { mistral: ' \n' })).toBeNull();
    expect(standbyFor(roleFor(PHOTO, noKey), noKey, { mistral: 'm-key' })?.provider).toBe(
      'mistral',
    );
    const ollama = photoStandby({ provider: 'ollama', model: 'gemma4' });
    expect(standbyFor(roleFor(PHOTO, ollama), ollama, {})?.provider).toBe('ollama');
  });

  it('is invalid for Custom without a model or an address, and valid with both and no key', () => {
    const custom = (model: string, standbyUrl: string) =>
      photoStandby(
        { provider: 'custom', model },
        { endpoints: { custom: { main: '', standby: standbyUrl } } },
      );
    const noModel = custom('', 'https://relay.example.org/v1');
    expect(standbyFor(roleFor(PHOTO, noModel), noModel, keys)).toBeNull();
    const noUrl = custom('plate-reader-v2', '');
    expect(standbyFor(roleFor(PHOTO, noUrl), noUrl, keys)).toBeNull();
    const ready = custom('plate-reader-v2', 'https://relay.example.org/v1');
    expect(standbyFor(roleFor(PHOTO, ready), ready, {})).toMatchObject({
      provider: 'custom',
      baseUrl: 'https://relay.example.org/v1',
    });
  });

  it('backs a photo request with the photo standby and never with the text standby', () => {
    const settings = settingsOf({
      primary: { provider: 'gemini', model: geminiDefault },
      textStandby: { on: true, provider: 'openai', model: defaultModel('openai', 'text') },
    });
    expect(standbyFor(roleFor(PHOTO, settings), settings, keys)).toBeNull();
    expect(standbyFor(roleFor(TEXT, settings), settings, keys)?.role).toBe('textStandby');
  });

  it('backs a text request with the text standby, compared with the role that served it', () => {
    const textOn = settingsOf({
      primary: { provider: 'gemini', model: geminiDefault },
      textRole: { on: true, provider: 'deepseek', model: 'deepseek-v4-pro' },
      imageStandby: { on: true, provider: 'openai', model: defaultModel('openai', 'image') },
      textStandby: { on: true, provider: 'deepseek', model: 'deepseek-v4-pro' },
    });
    // The text standby equals the text provider that served the request.
    expect(standbyFor(roleFor(TEXT, textOn), textOn, keys)).toBeNull();

    const textOff = settingsOf({
      primary: { provider: 'gemini', model: geminiDefault },
      textStandby: { on: true, provider: 'deepseek', model: 'deepseek-v4-pro' },
    });
    expect(standbyFor(roleFor(TEXT, textOff), textOff, keys)).toEqual({
      route: 'text',
      role: 'textStandby',
      provider: 'deepseek',
      model: 'deepseek-v4-pro',
      baseUrl: 'https://api.deepseek.com',
    });
  });
});

describe('upgradeAiSettings: retired presets in stored settings (R03.28)', () => {
  // A made-up release: Gemini retires one id; its replacement is not the default.
  const steps: readonly PresetUpgradeStep[] = [
    { version: 1, renames: { gemini: { 'gemini-old-flash': geminiOther } } },
  ];
  const stored = {
    primary: { provider: 'gemini', model: 'gemini-old-flash' },
    textRole: { on: true, provider: 'gemini', model: 'gemini-old-flash' },
    imageStandby: { on: true, provider: 'gemini', model: 'gemini-old-flash' },
    textStandby: { on: false, provider: 'gemini', model: 'gemini-old-flash' },
    timeoutSec: 240,
  };

  it('renames all four picks to the replacement, not to the default, once', () => {
    const first = upgradeAiSettings(stored, 0, steps);
    expect(first.changed).toBe(true);
    expect(first.version).toBe(1);
    expect(first.settings.primary.model).toBe(geminiOther);
    expect(first.settings.textRole).toEqual({ on: true, provider: 'gemini', model: geminiOther });
    expect(first.settings.imageStandby.model).toBe(geminiOther);
    expect(first.settings.textStandby).toEqual({
      on: false,
      provider: 'gemini',
      model: geminiOther,
    });
    expect(first.settings.timeoutSec).toBe(240);

    // With the marker stored, the old id is read as any unlisted model: the default.
    const again = upgradeAiSettings(stored, first.version, steps);
    expect(again.changed).toBe(false);
    expect(again.version).toBe(1);
    expect(again.settings.primary.model).toBe(geminiDefault);
  });

  it('changes nothing in v1 and reads the record like decodeAiSettings', () => {
    expect(upgradeAiSettings(stored, 0)).toEqual({
      settings: decodeAiSettings(stored),
      version: 0,
      changed: false,
    });
    expect(upgradeAiSettings(null, 0, steps)).toEqual({
      settings: DEFAULT_AI_SETTINGS,
      version: 1,
      changed: false,
    });
  });

  it('does not guess the provider of a pick stored without one', () => {
    const result = upgradeAiSettings({ imageStandby: { model: 'gemini-old-flash' } }, 0, steps);
    expect(result.changed).toBe(false);
    expect(result.settings.imageStandby).toEqual(DEFAULT_AI_SETTINGS.imageStandby);
  });
});
