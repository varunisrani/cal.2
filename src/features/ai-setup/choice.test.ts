import { describe, expect, it } from 'vitest';
import { DEFAULT_AI_SETTINGS, type AiSettings } from '../../ai/settings';
import type { AiChoice } from '../../services/aiSetup';
import { checkChoice, primaryChoice, providerGroups, savedServersOf, withProvider } from './choice';

const ids = (list: readonly { id: string }[]) => list.map((entry) => entry.id);

const custom: AiChoice = {
  provider: 'custom',
  model: 'my-model',
  serverUrl: 'https://llm.example/v1',
  key: '',
};

describe('providerGroups', () => {
  it('offers the 14 providers that read photos to a photo role, servers people run last', () => {
    const { cloud, ownServer } = providerGroups('image');
    expect(cloud).toHaveLength(12);
    expect(ids(cloud)).not.toContain('deepseek');
    expect(ids(cloud)).not.toContain('cerebras');
    expect(ids(ownServer)).toEqual(['ollama', 'custom']);
  });

  it('offers all 16 to a text role', () => {
    const { cloud, ownServer } = providerGroups('text');
    expect(cloud.length + ownServer.length).toBe(16);
    expect(ids(cloud)).toContain('deepseek');
  });
});

describe('withProvider and primaryChoice', () => {
  it("resets the model to the provider's default and starts its server from the saved one", () => {
    expect(withProvider('gemini', 'image')).toEqual({
      provider: 'gemini',
      model: 'gemini-3.5-flash-lite',
      serverUrl: '',
      key: '',
    });
    expect(withProvider('ollama', 'image').serverUrl).toBe('http://localhost:11434/v1');
    expect(withProvider('ollama', 'image', { ollama: 'https://ollama.example/v1' })).toEqual({
      provider: 'ollama',
      model: 'gemma4',
      serverUrl: 'https://ollama.example/v1',
      key: '',
    });
    expect(withProvider('custom', 'image')).toEqual({
      provider: 'custom',
      model: '',
      serverUrl: '',
      key: '',
    });
  });

  it('reads the saved primary back as a choice with no key typed', () => {
    const settings: AiSettings = {
      ...DEFAULT_AI_SETTINGS,
      primary: { provider: 'custom', model: 'my-model' },
      endpoints: { custom: { main: 'https://llm.example/v1', standby: '' } },
    };
    expect(primaryChoice(settings)).toEqual(custom);
    expect(savedServersOf(settings)).toEqual({ custom: 'https://llm.example/v1' });
    expect(primaryChoice(DEFAULT_AI_SETTINGS)).toEqual(withProvider('gemini', 'image'));
  });
});

describe('checkChoice', () => {
  it('needs a key for a cloud vendor: typed or saved', () => {
    const gemini = withProvider('gemini', 'image');
    expect(checkChoice(gemini, null)).toMatchObject({ missing: ['key'], ready: false });
    expect(checkChoice({ ...gemini, key: '   ' }, null).ready).toBe(false);
    expect(checkChoice({ ...gemini, key: 'AIza-typed' }, null).ready).toBe(true);
    expect(checkChoice(gemini, 'AIza…dF4').ready).toBe(true);
  });

  it('needs no key for Ollama, and a model but no key for Custom (R03.20)', () => {
    expect(checkChoice(withProvider('ollama', 'image'), null)).toEqual({
      missing: [],
      urlProblem: null,
      urlHint: null,
      ready: true,
    });
    expect(checkChoice(custom, null).ready).toBe(true);
    expect(checkChoice({ ...custom, model: ' ' }, null)).toMatchObject({
      missing: ['model'],
      ready: false,
    });
  });

  it('refuses plain http to another machine and gives the reason (D-16.26, R03.3)', () => {
    const lan = { ...withProvider('ollama', 'image'), serverUrl: 'http://10.0.0.2:11434/v1' };
    expect(checkChoice(lan, null)).toEqual({
      missing: ['server'],
      urlProblem: 'plainHttp',
      urlHint: null,
      ready: false,
    });
    expect(checkChoice({ ...custom, serverUrl: '' }, null)).toMatchObject({
      urlProblem: 'empty',
      ready: false,
    });
  });

  it('accepts an Ollama address without /v1 but hints at it (R03.22)', () => {
    const local = { ...withProvider('ollama', 'image'), serverUrl: 'http://localhost:11434/' };
    expect(checkChoice(local, null)).toEqual({
      missing: [],
      urlProblem: null,
      urlHint: 'addV1',
      ready: true,
    });
  });
});
