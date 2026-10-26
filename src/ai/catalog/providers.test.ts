import { describe, expect, it } from 'vitest';
import {
  PROVIDERS,
  PROVIDER_IDS,
  imageProviders,
  isProviderId,
  provider,
  textProviders,
  type ProviderId,
} from './providers';

const ids = (list: readonly { id: ProviderId }[]): ProviderId[] => list.map((entry) => entry.id);
const where = (test: (id: ProviderId) => boolean): ProviderId[] => PROVIDER_IDS.filter(test);

describe('the provider list (03 §3.1)', () => {
  it('holds 16 providers in picker order, each under its own id', () => {
    expect(PROVIDER_IDS).toHaveLength(16);
    expect(new Set(PROVIDER_IDS).size).toBe(16);
    expect(ids(textProviders())).toEqual([...PROVIDER_IDS]);
    for (const id of PROVIDER_IDS) expect(provider(id).id).toBe(id);
    expect(Object.keys(PROVIDERS).sort()).toEqual([...PROVIDER_IDS].sort());
  });

  it('gives every provider a name of its own', () => {
    const names = PROVIDER_IDS.map((id) => provider(id).name);
    expect(names.every((name) => name.trim() !== '')).toBe(true);
    expect(new Set(names).size).toBe(16);
  });

  it('lets 14 providers read photos: all but DeepSeek and Cerebras', () => {
    expect(imageProviders()).toHaveLength(14);
    expect(where((id) => !provider(id).vision)).toEqual(['deepseek', 'cerebras']);
    expect(ids(imageProviders())).toEqual(where((id) => id !== 'deepseek' && id !== 'cerebras'));
  });

  it('speaks Gemini to Gemini, Messages to Anthropic and the OpenAI format to the other 14', () => {
    expect(provider('gemini').format).toBe('gemini');
    expect(provider('anthropic').format).toBe('anthropic');
    expect(where((id) => provider(id).format === 'openai')).toHaveLength(14);
  });

  it("sends the key in each format's own header, and none to Ollama", () => {
    expect(provider('gemini').auth).toBe('googApiKey');
    expect(provider('anthropic').auth).toBe('xApiKey');
    expect(provider('ollama').auth).toBe('none');
    expect(where((id) => provider(id).auth === 'bearer')).toEqual(
      where((id) => !['gemini', 'anthropic', 'ollama'].includes(id)),
    );
  });

  it('requires a key everywhere except Ollama (never asked) and Custom (optional, R03.20)', () => {
    expect(provider('ollama').key).toBe('none');
    expect(provider('custom').key).toBe('optional');
    expect(where((id) => provider(id).key === 'required')).toHaveLength(14);
  });
});

describe('addresses', () => {
  it("keeps DeepSeek's default base without a /v1 segment", () => {
    expect(provider('deepseek').baseUrl).toBe('https://api.deepseek.com');
  });

  it('uses https for every vendor address and no trailing slash anywhere', () => {
    for (const id of where((name) => provider(name).endpoint === 'fixed')) {
      expect(provider(id).baseUrl).toMatch(/^https:\/\/[^/]+/);
    }
    for (const id of PROVIDER_IDS) expect(provider(id).baseUrl).not.toMatch(/\/$/);
  });

  it("lets the person run Ollama and Custom: Ollama starts at this device's /v1, Custom at nothing", () => {
    expect(where((id) => provider(id).endpoint === 'userServer')).toEqual(['ollama', 'custom']);
    expect(provider('ollama').baseUrl).toBe('http://localhost:11434/v1');
    expect(provider('custom').baseUrl).toBe('');
  });

  it('marks only Ollama and Custom as self-hosted, for the per-attempt cap (D-16.60)', () => {
    expect(where((id) => provider(id).selfHosted)).toEqual(['ollama', 'custom']);
  });
});

describe('models and browser access', () => {
  it('takes typed model ids for OpenRouter, Hugging Face, Ollama (R03.21) and Custom only', () => {
    expect(where((id) => provider(id).freeFormModel)).toEqual([
      'openrouter',
      'huggingface',
      'ollama',
      'custom',
    ]);
  });

  it("reaches Anthropic only with its opt-in header, people's own servers through them, the rest directly (D-04.1)", () => {
    expect(provider('anthropic').browserAccess).toBe('directWithHeader');
    expect(provider('ollama').browserAccess).toBe('userServer');
    expect(provider('custom').browserAccess).toBe('userServer');
    expect(where((id) => provider(id).browserAccess === 'direct')).toHaveLength(13);
    expect(where((id) => provider(id).browserAccess === 'unsupported')).toEqual([]);
  });

  it('knows its own ids and nothing else', () => {
    expect(isProviderId('ollama')).toBe(true);
    expect(isProviderId('OLLAMA')).toBe(false);
    expect(isProviderId('toString')).toBe(false);
    expect(isProviderId(3)).toBe(false);
    expect(isProviderId(undefined)).toBe(false);
  });
});
