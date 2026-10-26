import { describe, expect, it } from 'vitest';
import { fromNetwork } from '../errors';
import { PROVIDERS, PROVIDER_IDS, isProviderId, providerById, type Provider } from './providers';

const idsWhere = (test: (entry: Provider) => boolean) =>
  PROVIDERS.filter(test).map((entry) => entry.id);

describe('PROVIDERS', () => {
  it('lists the 16 providers once each, in picker order', () => {
    expect(PROVIDERS).toHaveLength(16);
    expect(PROVIDERS.map((entry) => entry.id)).toEqual([...PROVIDER_IDS]);
    expect(PROVIDER_IDS.slice(0, 3)).toEqual(['gemini', 'openai', 'anthropic']);
    expect(PROVIDER_IDS.slice(-2)).toEqual(['ollama', 'custom']);
    const names = PROVIDERS.map((entry) => entry.name);
    expect(new Set(names).size).toBe(16);
    expect(names.every((name) => name.trim() === name && name !== '')).toBe(true);
  });

  it('marks 14 providers as seeing photos: every one but DeepSeek and Cerebras', () => {
    expect(idsWhere((entry) => entry.vision)).toHaveLength(14);
    expect(idsWhere((entry) => !entry.vision)).toEqual(['deepseek', 'cerebras']);
  });

  it('names the wire format and the way the key travels for each provider', () => {
    expect(providerById('gemini')).toMatchObject({ format: 'gemini', auth: 'googleHeader' });
    expect(providerById('anthropic')).toMatchObject({
      format: 'anthropic',
      auth: 'anthropicHeader',
    });
    expect(providerById('ollama')).toMatchObject({ format: 'openai', auth: 'none' });
    const bearer = idsWhere((entry) => entry.format === 'openai' && entry.auth === 'bearer');
    expect(bearer).toHaveLength(13);
    expect(bearer).not.toContain('ollama');
    expect(bearer).toContain('custom');
  });

  it('keeps the vendor addresses, DeepSeek at its root without /v1', () => {
    expect(providerById('deepseek').baseUrl).toBe('https://api.deepseek.com');
    expect(providerById('gemini').baseUrl).toBe('https://generativelanguage.googleapis.com/v1beta');
    expect(providerById('deepinfra').baseUrl).toBe('https://api.deepinfra.com/v1/openai');
    expect(providerById('qwen').baseUrl).toBe(
      'https://dashscope-intl.aliyuncs.com/compatible-mode/v1',
    );
    // Ollama defaults to this device over plain http (allowed for loopback, D-16.26).
    expect(providerById('ollama').baseUrl).toBe('http://localhost:11434/v1');
    expect(providerById('custom').baseUrl).toBe('');
    const cloud = PROVIDERS.filter((entry) => entry.endpoint === 'fixed');
    expect(cloud).toHaveLength(14);
    for (const entry of cloud) {
      expect(entry.baseUrl, entry.id).toMatch(/^https:\/\/[a-z0-9.-]+\.[a-z]+(\/[\w./-]*)?$/);
      expect(entry.baseUrl.endsWith('/'), entry.id).toBe(false);
    }
  });

  it('asks for a key everywhere but Ollama, and only optionally for Custom (R03.20)', () => {
    expect(providerById('ollama').key).toBe('none');
    expect(providerById('custom').key).toBe('optional');
    expect(idsWhere((entry) => entry.key === 'required')).toHaveLength(14);
  });

  it('takes the server address from the person for Ollama and Custom only', () => {
    expect(idsWhere((entry) => entry.endpoint === 'userServer')).toEqual(['ollama', 'custom']);
  });

  it('accepts typed model ids for OpenRouter, Hugging Face, Ollama and Custom (R03.21)', () => {
    expect(idsWhere((entry) => entry.freeFormModel)).toEqual([
      'openrouter',
      'huggingface',
      'ollama',
      'custom',
    ]);
  });

  it('records how a browser reaches each provider (spec 03 §3.15)', () => {
    expect(idsWhere((entry) => entry.browserAccess === 'directWithHeader')).toEqual(['anthropic']);
    expect(idsWhere((entry) => entry.browserAccess === 'userServer')).toEqual(['ollama', 'custom']);
    expect(idsWhere((entry) => entry.browserAccess === 'direct')).toHaveLength(13);
    expect(idsWhere((entry) => entry.browserAccess === 'unsupported')).toEqual([]);
  });

  it('marks the providers whose refused keys look like lost connections, as errors.ts does', () => {
    expect(providerById('cerebras').hidesKeyRefusal).toBe('always');
    expect(providerById('huggingface').hidesKeyRefusal).toBe('withoutKey');
    expect(idsWhere((entry) => entry.hidesKeyRefusal === 'never')).toHaveLength(14);
    // The failure mapping keeps its own list for now; both must agree for every provider.
    for (const entry of PROVIDERS) {
      const hint = (keySent: boolean) => {
        const failure = fromNetwork(new TypeError('Failed to fetch'), {
          provider: entry.id,
          keySent,
          online: true,
        });
        return 'keyMayBeRefused' in failure && failure.keyMayBeRefused === true;
      };
      expect(hint(true), entry.id).toBe(entry.hidesKeyRefusal === 'always');
      expect(hint(false), entry.id).toBe(entry.hidesKeyRefusal !== 'never');
    }
  });
});

describe('isProviderId and providerById', () => {
  it('accepts our ids only', () => {
    expect(PROVIDER_IDS.every((id) => isProviderId(id))).toBe(true);
    for (const value of ['Gemini', 'lmstudio', '', ' gemini', 'constructor', '__proto__', 42]) {
      expect(isProviderId(value), String(value)).toBe(false);
    }
    expect(isProviderId(undefined)).toBe(false);
    expect(isProviderId(null)).toBe(false);
  });

  it('finds an entry by id and refuses an id it does not know', () => {
    expect(providerById('mistral').name).toBe('Mistral AI');
    expect(providerById('custom').name).toBe('Custom server');
    expect(() => providerById('lmstudio' as never)).toThrow(RangeError);
  });
});
