import { describe, expect, it } from 'vitest';
import type { PresetUpgradeStep } from './catalog/presets';
import {
  DEFAULT_AI_SETTINGS,
  clampMaxTokens,
  clampTimeoutSec,
  decodeAiSettings,
  keyFor,
  loadAiSettings,
  roleFor,
  serverUrlFor,
  standbyFor,
  standbyProblem,
  targetProblem,
  type AiSettings,
  type KeyRing,
} from './settings';

const settingsWith = (changes: Partial<AiSettings>): AiSettings => ({
  ...DEFAULT_AI_SETTINGS,
  ...changes,
});

const PHOTO = { images: ['jpeg'] };
const TEXT = { images: [] };
const KEYS: KeyRing = { gemini: 'gm-test-key-0001', openai: 'oa-test-key-0002' };

describe('DEFAULT_AI_SETTINGS', () => {
  it('starts on Gemini with every optional role off and the documented limits', () => {
    expect(DEFAULT_AI_SETTINGS).toEqual({
      primary: { provider: 'gemini', model: 'gemini-3.5-flash-lite' },
      textRole: { on: false, provider: 'gemini', model: 'gemini-3.5-flash-lite' },
      imageStandby: { on: false, provider: 'gemini', model: 'gemini-3.5-flash-lite' },
      textStandby: { on: false, provider: 'gemini', model: 'gemini-3.5-flash-lite' },
      endpoints: {},
      instructions: '',
      maxTokens: 1024,
      timeoutSec: 180,
      openRouterEffort: 'auto',
    });
  });
});

describe('decodeAiSettings', () => {
  it('reads anything that is not a settings object as the defaults', () => {
    for (const raw of [undefined, null, 'ai', 42, [], true]) {
      expect(decodeAiSettings(raw)).toEqual(DEFAULT_AI_SETTINGS);
    }
    expect(decodeAiSettings({})).toEqual(DEFAULT_AI_SETTINGS);
  });

  it('reads back a complete record unchanged and drops fields it does not know', () => {
    const stored: AiSettings = {
      primary: { provider: 'ollama', model: 'qwen3-vl:8b' },
      textRole: { on: true, provider: 'deepseek', model: 'deepseek-v4-pro' },
      imageStandby: { on: true, provider: 'anthropic', model: 'claude-haiku-5-5' },
      textStandby: { on: true, provider: 'custom', model: 'relay-model' },
      endpoints: {
        ollama: { main: 'http://localhost:11434/v1', standby: 'https://gpu.home.example/v1' },
        custom: { standby: 'https://relay.example.org/v1' },
      },
      instructions: 'Vegetarian; portions are small.',
      maxTokens: 4096,
      timeoutSec: 300,
      openRouterEffort: 'high',
    };
    expect(decodeAiSettings(stored)).toEqual(stored);
    expect(
      decodeAiSettings({
        ...stored,
        theme: 'dark',
        primary: { ...stored.primary, colour: 'red' },
      }),
    ).toEqual(stored);
  });

  it('reads an unknown or photo-blind primary provider as the default primary', () => {
    for (const primary of [
      { provider: 'lmstudio', model: 'x' },
      { provider: 'deepseek', model: 'deepseek-v4-pro' },
      { model: 'gpt-6-luna' },
      'gemini',
    ]) {
      expect(decodeAiSettings({ primary }).primary).toEqual(DEFAULT_AI_SETTINGS.primary);
    }
  });

  it('reads a model the provider does not offer for that role as its default model', () => {
    const decoded = decodeAiSettings({
      primary: { provider: 'gemini', model: 'gemini-2.5-flash' },
      textRole: { on: true, provider: 'groq', model: 'qwen/qwen3.8-27b-vision-only' },
      imageStandby: { on: true, provider: 'groq', model: 'openai/gpt-oss-20b' },
    });
    expect(decoded.primary).toEqual({ provider: 'gemini', model: 'gemini-3.5-flash-lite' });
    expect(decoded.textRole).toEqual({ on: true, provider: 'groq', model: 'openai/gpt-oss-20b' });
    expect(decoded.imageStandby).toEqual({
      on: true,
      provider: 'groq',
      model: 'qwen/qwen3.8-27b',
    });
  });

  it('keeps typed models trimmed for typed-id providers, and a blank Custom model blank', () => {
    const decoded = decodeAiSettings({
      primary: { provider: 'custom', model: '   ' },
      textRole: { on: true, provider: 'openrouter', model: ' vendor/some-model ' },
    });
    expect(decoded.primary).toEqual({ provider: 'custom', model: '' });
    expect(decoded.textRole.model).toBe('vendor/some-model');
  });

  it('switches off a text role or standby whose provider is unknown or cannot see photos', () => {
    const decoded = decodeAiSettings({
      textRole: { on: true, provider: 'lmstudio', model: 'x' },
      imageStandby: { on: true, provider: 'cerebras', model: 'gpt-oss-120b' },
      textStandby: { on: true, provider: 'cerebras', model: 'gpt-oss-120b' },
    });
    expect(decoded.textRole).toEqual(DEFAULT_AI_SETTINGS.textRole);
    expect(decoded.imageStandby).toEqual(DEFAULT_AI_SETTINGS.imageStandby);
    expect(decoded.textStandby).toEqual({ on: true, provider: 'cerebras', model: 'gpt-oss-120b' });
  });

  it('reads a switch as on only when it is true', () => {
    for (const on of ['yes', 1, null, undefined, false]) {
      const decoded = decodeAiSettings({
        textRole: { on, provider: 'openai', model: 'gpt-6-luna' },
      });
      expect(decoded.textRole.on, String(on)).toBe(false);
      expect(decoded.textRole.provider).toBe('openai');
    }
  });

  it('keeps cleaned, allowed addresses for Ollama and Custom only (D-16.26)', () => {
    const decoded = decodeAiSettings({
      endpoints: {
        ollama: { main: ' http://localhost:11434/v1/ ', standby: 'http://192.168.1.5:11434/v1' },
        custom: { main: 'https://relay.example.org/v1', standby: 42 },
        gemini: { main: 'https://my-proxy.example.org/v1beta' },
        lmstudio: { main: 'http://localhost:1234/v1' },
      },
    });
    expect(decoded.endpoints).toEqual({
      ollama: { main: 'http://localhost:11434/v1' },
      custom: { main: 'https://relay.example.org/v1' },
    });
    expect(decodeAiSettings({ endpoints: { ollama: { main: 'ftp://x' } } }).endpoints).toEqual({});
    expect(decodeAiSettings({ endpoints: 'http://localhost' }).endpoints).toEqual({});
  });

  it('clamps the timeout to 30–600 seconds and defaults it to 180', () => {
    const timeout = (timeoutSec: unknown) => decodeAiSettings({ timeoutSec }).timeoutSec;
    expect(timeout(10)).toBe(30);
    expect(timeout(900)).toBe(600);
    expect(timeout(45.6)).toBe(46);
    expect(timeout('60')).toBe(180);
    expect(timeout(Number.NaN)).toBe(180);
  });

  it('keeps the answer limit at 1 or more, without a maximum, and defaults it to 1 024', () => {
    const limit = (maxTokens: unknown) => decodeAiSettings({ maxTokens }).maxTokens;
    expect(limit(0)).toBe(1);
    expect(limit(-5)).toBe(1);
    expect(limit(65_536)).toBe(65_536);
    expect(limit('2048')).toBe(1024);
    expect(limit(Number.POSITIVE_INFINITY)).toBe(1024);
  });

  it('reads an unknown reasoning effort as auto and keeps the notes trimmed', () => {
    expect(decodeAiSettings({ openRouterEffort: 'extreme' }).openRouterEffort).toBe('auto');
    expect(decodeAiSettings({ openRouterEffort: 'xhigh' }).openRouterEffort).toBe('xhigh');
    expect(decodeAiSettings({ instructions: '  No dairy.\n' }).instructions).toBe('No dairy.');
    expect(decodeAiSettings({ instructions: 7 }).instructions).toBe('');
  });
});

describe('clampTimeoutSec and clampMaxTokens', () => {
  it('apply the same limits when a value is typed', () => {
    expect(clampTimeoutSec(10)).toBe(30);
    expect(clampTimeoutSec(900)).toBe(600);
    expect(clampTimeoutSec(180)).toBe(180);
    expect(clampMaxTokens(0.4)).toBe(1);
    expect(clampMaxTokens(1024)).toBe(1024);
    expect(clampMaxTokens(Number.NaN)).toBe(1024);
  });
});

describe('roleFor', () => {
  const split = settingsWith({
    primary: { provider: 'openai', model: 'gpt-6-luna' },
    textRole: { on: true, provider: 'deepseek', model: 'deepseek-v4-pro' },
  });

  it('sends a typed description to the text role when it is on, and photos always to the primary (ACC-E3-1)', () => {
    expect(roleFor(split, TEXT)).toEqual({
      source: 'textRole',
      standby: 'textStandby',
      provider: 'deepseek',
      model: 'deepseek-v4-pro',
      baseUrl: 'https://api.deepseek.com',
    });
    expect(roleFor(split, PHOTO)).toEqual({
      source: 'primary',
      standby: 'imageStandby',
      provider: 'openai',
      model: 'gpt-6-luna',
      baseUrl: 'https://api.openai.com/v1',
    });
    expect(roleFor(split, {}).source).toBe('textRole');
  });

  it('sends text to the primary while the text role is off, backed by the text standby', () => {
    const off = { ...split, textRole: { ...split.textRole, on: false } };
    expect(roleFor(off, TEXT)).toMatchObject({
      source: 'primary',
      standby: 'textStandby',
      provider: 'openai',
    });
  });

  it('uses the main address slot of a self-run provider, or its default', () => {
    const ollama = settingsWith({
      primary: { provider: 'ollama', model: 'qwen3-vl' },
      endpoints: { ollama: { standby: 'https://gpu.home.example/v1' } },
    });
    expect(roleFor(ollama, PHOTO).baseUrl).toBe('http://localhost:11434/v1');
    const typed = { ...ollama, endpoints: { ollama: { main: 'https://box.home.example/v1/' } } };
    expect(roleFor(typed, PHOTO).baseUrl).toBe('https://box.home.example/v1');
    expect(serverUrlFor(typed, 'ollama', 'standby')).toBe('http://localhost:11434/v1');
    // A cloud provider always uses its own address.
    const proxied = settingsWith({ endpoints: { gemini: { main: 'https://proxy.example/v1' } } });
    expect(serverUrlFor(proxied, 'gemini', 'main')).toBe(
      'https://generativelanguage.googleapis.com/v1beta',
    );
  });
});

describe('keyFor and targetProblem', () => {
  it('trims a saved key and treats a blank one as missing (R03.20)', () => {
    expect(keyFor('openai', { openai: '  sk-test-0003\n' })).toBe('sk-test-0003');
    expect(keyFor('openai', { openai: ' \n ' })).toBeUndefined();
    expect(keyFor('openai', {})).toBeUndefined();
  });

  it('sends no key to Ollama even when one is saved', () => {
    expect(keyFor('ollama', { ollama: 'left-over-key-0004' })).toBeUndefined();
  });

  it('reports a Custom role without a model or an address as incomplete (R03.20)', () => {
    const custom = (model: string, main?: string) =>
      roleFor(
        settingsWith({
          primary: { provider: 'custom', model },
          endpoints: main === undefined ? {} : { custom: { main } },
        }),
        PHOTO,
      );
    expect(targetProblem(custom('', 'http://127.0.0.1:4320/v1'), {})).toBe('noModel');
    expect(targetProblem(custom('relay-model'), {})).toBe('noServer');
    // The key is optional: the e2e fake server needs none.
    expect(targetProblem(custom('relay-model', 'http://127.0.0.1:4320/v1'), {})).toBeUndefined();
  });

  it('needs a key for every cloud provider and none for Ollama', () => {
    const role = roleFor(DEFAULT_AI_SETTINGS, PHOTO);
    expect(targetProblem(role, {})).toBe('noKey');
    expect(targetProblem(role, { gemini: '   ' })).toBe('noKey');
    expect(targetProblem(role, KEYS)).toBeUndefined();
    const ollama = roleFor(
      settingsWith({ primary: { provider: 'ollama', model: 'gemma4' } }),
      PHOTO,
    );
    expect(targetProblem(ollama, {})).toBeUndefined();
  });
});

describe('standbyFor', () => {
  const primary = { provider: 'gemini', model: 'gemini-3.8-flash' } as const;
  const withImageStandby = (imageStandby: AiSettings['imageStandby'], changes = {}) =>
    settingsWith({ primary, imageStandby, ...changes });

  it('offers nothing while the standby is off', () => {
    const settings = withImageStandby({ on: false, provider: 'openai', model: 'gpt-6-luna' });
    const role = roleFor(settings, PHOTO);
    expect(standbyProblem(role, settings, KEYS)).toBe('off');
    expect(standbyFor(role, settings, KEYS)).toBeNull();
  });

  it('refuses a standby identical to the role it backs, and accepts the same provider with another model (R03.5)', () => {
    const same = withImageStandby({ on: true, ...primary });
    expect(standbyProblem(roleFor(same, PHOTO), same, KEYS)).toBe('sameAsRole');
    expect(standbyFor(roleFor(same, PHOTO), same, KEYS)).toBeNull();

    const other = withImageStandby({
      on: true,
      provider: 'gemini',
      model: 'gemini-3.1-pro-preview',
    });
    expect(standbyFor(roleFor(other, PHOTO), other, KEYS)).toEqual({
      slot: 'imageStandby',
      provider: 'gemini',
      model: 'gemini-3.1-pro-preview',
      baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    });
  });

  it('lets two Ollama servers be primary and standby at once (ACC-E3-2)', () => {
    const settings = settingsWith({
      primary: { provider: 'ollama', model: 'qwen3-vl:8b' },
      imageStandby: { on: true, provider: 'ollama', model: 'qwen3-vl:8b' },
      endpoints: {
        ollama: { main: 'http://localhost:11434/v1', standby: 'https://gpu.home.example/v1' },
      },
    });
    const role = roleFor(settings, PHOTO);
    expect(role.baseUrl).toBe('http://localhost:11434/v1');
    expect(standbyFor(role, settings, {})).toEqual({
      slot: 'imageStandby',
      provider: 'ollama',
      model: 'qwen3-vl:8b',
      baseUrl: 'https://gpu.home.example/v1',
    });
  });

  it('counts one Ollama server typed two ways as the same target', () => {
    const settings = settingsWith({
      primary: { provider: 'ollama', model: 'gemma4' },
      imageStandby: { on: true, provider: 'ollama', model: 'gemma4' },
      endpoints: {
        ollama: { main: 'http://localhost:11434/v1', standby: 'HTTP://LOCALHOST:11434/v1/' },
      },
    });
    expect(standbyProblem(roleFor(settings, PHOTO), settings, {})).toBe('sameAsRole');
    // Neither slot typed: both use the default address, so the standby is the primary again.
    const untyped = { ...settings, endpoints: {} };
    expect(standbyProblem(roleFor(untyped, PHOTO), untyped, {})).toBe('sameAsRole');
  });

  it('needs a saved key unless the provider takes none or only an optional one', () => {
    const cloud = withImageStandby({ on: true, provider: 'openai', model: 'gpt-6-luna' });
    const role = roleFor(cloud, PHOTO);
    expect(standbyProblem(role, cloud, { gemini: KEYS.gemini })).toBe('noKey');
    expect(standbyProblem(role, cloud, { ...KEYS, openai: ' \n' })).toBe('noKey');
    expect(standbyFor(role, cloud, KEYS)?.provider).toBe('openai');

    const ollama = withImageStandby({ on: true, provider: 'ollama', model: 'gemma4' });
    expect(standbyProblem(roleFor(ollama, PHOTO), ollama, {})).toBeUndefined();

    const custom = withImageStandby(
      { on: true, provider: 'custom', model: 'relay-model' },
      { endpoints: { custom: { standby: 'https://relay.example.org/v1' } } },
    );
    expect(standbyFor(roleFor(custom, PHOTO), custom, {})).toMatchObject({
      provider: 'custom',
      baseUrl: 'https://relay.example.org/v1',
    });
  });

  it('refuses a Custom standby without an address or a model', () => {
    const noServer = withImageStandby({ on: true, provider: 'custom', model: 'relay-model' });
    expect(standbyProblem(roleFor(noServer, PHOTO), noServer, KEYS)).toBe('noServer');
    // The main slot belongs to the primary and the text role, never to a standby.
    const mainOnly = {
      ...noServer,
      endpoints: { custom: { main: 'https://relay.example.org/v1' } },
    };
    expect(standbyProblem(roleFor(mainOnly, PHOTO), mainOnly, KEYS)).toBe('noServer');
    const noModel = withImageStandby(
      { on: true, provider: 'custom', model: '' },
      { endpoints: { custom: { standby: 'https://relay.example.org/v1' } } },
    );
    expect(standbyProblem(roleFor(noModel, PHOTO), noModel, KEYS)).toBe('noModel');
  });

  it('compares the text standby with the role that served the text request', () => {
    const settings = settingsWith({
      primary,
      textRole: { on: true, provider: 'openai', model: 'gpt-6-luna' },
      textStandby: { on: true, provider: 'openai', model: 'gpt-6-luna' },
    });
    expect(standbyProblem(roleFor(settings, TEXT), settings, KEYS)).toBe('sameAsRole');

    const backsPrimary = {
      ...settings,
      textStandby: { on: true, provider: 'gemini', model: 'gemini-3.8-flash' },
    } as const;
    expect(standbyFor(roleFor(backsPrimary, TEXT), backsPrimary, KEYS)?.provider).toBe('gemini');
    const textRoleOff = { ...backsPrimary, textRole: { ...backsPrimary.textRole, on: false } };
    expect(standbyProblem(roleFor(textRoleOff, TEXT), textRoleOff, KEYS)).toBe('sameAsRole');
  });

  it('never offers the text standby to a photo request, nor the image standby to a text one', () => {
    const settings = settingsWith({
      primary,
      imageStandby: { on: false, provider: 'openai', model: 'gpt-6-luna' },
      textStandby: { on: true, provider: 'deepseek', model: 'deepseek-v4-pro' },
    });
    const keys = { ...KEYS, deepseek: 'ds-test-key-0005' };
    expect(standbyFor(roleFor(settings, PHOTO), settings, keys)).toBeNull();
    expect(standbyFor(roleFor(settings, TEXT), settings, keys)?.slot).toBe('textStandby');

    const imageOnly = {
      ...settings,
      imageStandby: { ...settings.imageStandby, on: true },
      textStandby: { ...settings.textStandby, on: false },
    };
    expect(standbyFor(roleFor(imageOnly, TEXT), imageOnly, keys)).toBeNull();
    expect(standbyFor(roleFor(imageOnly, PHOTO), imageOnly, keys)?.slot).toBe('imageStandby');
  });

  it('refuses an image standby that cannot see photos', () => {
    const settings = withImageStandby({ on: true, provider: 'deepseek', model: 'deepseek-v4-pro' });
    expect(standbyProblem(roleFor(settings, PHOTO), settings, { deepseek: 'ds-key-0006' })).toBe(
      'noVision',
    );
  });
});

describe('loadAiSettings', () => {
  const ROUND: readonly PresetUpgradeStep[] = [
    {
      version: 1,
      renames: {
        gemini: {
          'gemini-3.1-pro-preview': 'gemini-3.8-flash',
          'gemini-retired': 'gemini-3.8-flash',
        },
        openrouter: { 'vendor/retired-model': 'vendor/new-model' },
      },
    },
  ];
  const stored = {
    primary: { provider: 'gemini', model: 'gemini-retired' },
    textRole: { on: true, provider: 'openrouter', model: 'vendor/retired-model' },
    imageStandby: { on: true, provider: 'gemini', model: 'gemini-3.1-pro-preview' },
    textStandby: { on: true, provider: 'openrouter', model: 'vendor/retired-model' },
  };

  it('renames retired presets in every role once, then leaves a re-picked old id alone (R03.28)', () => {
    const first = loadAiSettings(stored, undefined, ROUND);
    expect(first.upgradeMarker).toBe(1);
    expect(first.settings.primary.model).toBe('gemini-3.8-flash');
    expect(first.settings.imageStandby.model).toBe('gemini-3.8-flash');
    expect(first.settings.textRole.model).toBe('vendor/new-model');
    expect(first.settings.textStandby.model).toBe('vendor/new-model');
    // Only model ids change: switches and providers stay as stored.
    expect(first.settings.textRole).toMatchObject({ on: true, provider: 'openrouter' });
    expect(first.settings.imageStandby).toMatchObject({ on: true, provider: 'gemini' });

    // The person picks the older, still listed model again; the next start keeps it.
    const repicked = {
      ...first.settings,
      imageStandby: { ...first.settings.imageStandby, model: 'gemini-3.1-pro-preview' },
      textStandby: { ...first.settings.textStandby, model: 'vendor/retired-model' },
    };
    const second = loadAiSettings(repicked, first.upgradeMarker, ROUND);
    expect(second.upgradeMarker).toBe(1);
    expect(second.settings).toEqual(repicked);
  });

  it('renames before checking the lists, so a retired preset reaches its replacement', () => {
    // Without the round, the unlisted id would read as the default instead.
    expect(decodeAiSettings(stored).primary.model).toBe('gemini-3.5-flash-lite');
    expect(loadAiSettings(stored, 0, ROUND).settings.primary.model).toBe('gemini-3.8-flash');
  });

  it('changes nothing and keeps the marker while no round exists', () => {
    expect(loadAiSettings(stored, undefined)).toEqual({
      settings: decodeAiSettings(stored),
      upgradeMarker: 0,
    });
    expect(loadAiSettings(stored, 3).upgradeMarker).toBe(3);
  });
});
