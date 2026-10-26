import { describe, expect, it } from 'vitest';
import {
  PRESETS_CHECKED_ON,
  PRESET_UPGRADES,
  defaultModel,
  imagePickerProviders,
  presetsFor,
  readUpgradeMarker,
  resolveModel,
  textPickerProviders,
  upgradeVersion,
  upgradedModel,
  type ModelUse,
  type PresetUpgradeStep,
} from './presets';
import { PROVIDER_IDS, providerById } from './providers';

const USES: readonly ModelUse[] = ['image', 'text'];

describe('presetsFor', () => {
  it('offers at most three presets per list, without repeats or stray spaces', () => {
    for (const id of PROVIDER_IDS) {
      for (const use of USES) {
        const presets = presetsFor(id, use);
        expect(presets.length, `${id} ${use}`).toBeLessThanOrEqual(3);
        expect(new Set(presets).size, `${id} ${use}`).toBe(presets.length);
        expect(
          presets.every((model) => /^\S+$/.test(model)),
          `${id} ${use}`,
        ).toBe(true);
      }
    }
  });

  it('uses the photo presets for text unless the provider keeps its own text list', () => {
    expect(presetsFor('gemini', 'text')).toEqual(presetsFor('gemini', 'image'));
    expect(presetsFor('ollama', 'text')).toEqual(presetsFor('ollama', 'image'));
    expect(presetsFor('groq', 'text')).not.toEqual(presetsFor('groq', 'image'));
    expect(presetsFor('groq', 'text')).toContain('openai/gpt-oss-120b');
    expect(presetsFor('mistral', 'text')).toContain('mistral-small-2603');
    expect(presetsFor('mistral', 'image')).not.toContain('mistral-small-2603');
  });

  it('offers no photo presets for DeepSeek and Cerebras, and none at all for Custom', () => {
    expect(presetsFor('deepseek', 'image')).toEqual([]);
    expect(presetsFor('cerebras', 'image')).toEqual([]);
    expect(presetsFor('deepseek', 'text')).toEqual(['deepseek-flash', 'deepseek-v4-pro']);
    expect(presetsFor('cerebras', 'text').length).toBeGreaterThan(0);
    expect(presetsFor('custom', 'image')).toEqual([]);
    expect(presetsFor('custom', 'text')).toEqual([]);
  });

  it('records the day the lists were checked against the vendors', () => {
    expect(PRESETS_CHECKED_ON).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('pickers', () => {
  it('lists 14 providers for photos and all 16 for text, each offering its presets (ACC-E1-1)', () => {
    const forPhotos = imagePickerProviders();
    const forText = textPickerProviders();
    expect(forPhotos).toHaveLength(14);
    expect(forPhotos).not.toContain('deepseek');
    expect(forPhotos).not.toContain('cerebras');
    expect(forText).toEqual([...PROVIDER_IDS]);
    // Every listed provider offers presets for the picker it is in; Custom takes a typed id.
    for (const id of forPhotos.filter((provider) => provider !== 'custom')) {
      expect(presetsFor(id, 'image').length, id).toBeGreaterThan(0);
    }
    for (const id of forText.filter((provider) => provider !== 'custom')) {
      expect(presetsFor(id, 'text').length, id).toBeGreaterThan(0);
    }
    expect(providerById('custom').freeFormModel).toBe(true);
  });
});

describe('defaultModel', () => {
  it('is the first preset of the list, nothing for Custom', () => {
    expect(defaultModel('gemini', 'image')).toBe('gemini-3.5-flash-lite');
    expect(defaultModel('groq', 'image')).toBe('qwen/qwen3.8-27b');
    expect(defaultModel('groq', 'text')).toBe('openai/gpt-oss-20b');
    expect(defaultModel('deepseek', 'text')).toBe('deepseek-flash');
    expect(defaultModel('deepseek', 'image')).toBe('');
    expect(defaultModel('custom', 'image')).toBe('');
    expect(defaultModel('custom', 'text')).toBe('');
    for (const id of PROVIDER_IDS) {
      for (const use of USES) {
        expect(defaultModel(id, use)).toBe(presetsFor(id, use)[0] ?? '');
      }
    }
  });
});

describe('resolveModel', () => {
  it('reads an unknown saved model on Gemini as its default', () => {
    expect(resolveModel('gemini', 'gemini-2.5-pro', 'image')).toBe('gemini-3.5-flash-lite');
    expect(resolveModel('openai', 'company/private-vision-v7', 'image')).toBe('gpt-6-luna');
    expect(resolveModel('deepseek', 'retired-model', 'text')).toBe('deepseek-flash');
  });

  it('keeps a listed model, trimmed, and is exact about letter case', () => {
    expect(resolveModel('gemini', ' gemini-3.8-flash\n', 'image')).toBe('gemini-3.8-flash');
    expect(resolveModel('together', 'Qwen/Qwen3.5-9B', 'image')).toBe('Qwen/Qwen3.5-9B');
    expect(resolveModel('together', 'qwen/qwen3.5-9b', 'image')).toBe('Qwen/Qwen3.5-9B');
    expect(resolveModel('together', 'moonshotai/kimi-k3', 'text')).toBe('openai/gpt-oss-120b');
  });

  it('reads a model from the other list as the default of the list in use', () => {
    expect(resolveModel('groq', 'openai/gpt-oss-20b', 'image')).toBe('qwen/qwen3.8-27b');
    expect(resolveModel('groq', 'openai/gpt-oss-20b', 'text')).toBe('openai/gpt-oss-20b');
    expect(resolveModel('mistral', 'mistral-small-2603', 'image')).toBe('mistral-medium-3-5');
  });

  it('reads a blank, missing or non-text saved model as the default', () => {
    for (const saved of ['', '   ', undefined, null, 42, { model: 'x' }]) {
      expect(resolveModel('anthropic', saved, 'image')).toBe('claude-sonnet-5-5');
      expect(resolveModel('ollama', saved, 'text')).toBe('qwen3-vl');
    }
  });

  it('keeps a typed Ollama model tag such as qwen3-vl:8b (R03.21, ACC-E13-2)', () => {
    expect(resolveModel('ollama', 'qwen3-vl:8b', 'image')).toBe('qwen3-vl:8b');
    expect(resolveModel('ollama', '  gemma4:e4b-mlx ', 'text')).toBe('gemma4:e4b-mlx');
    expect(resolveModel('ollama', 'my-own/finetune:latest', 'image')).toBe(
      'my-own/finetune:latest',
    );
  });

  it('keeps typed ids for OpenRouter, Hugging Face and Custom as typed, trimmed', () => {
    const typed = 'company/private-vision-v7';
    expect(resolveModel('openrouter', typed, 'image')).toBe(typed);
    expect(resolveModel('huggingface', `${typed}\t`, 'text')).toBe(typed);
    expect(resolveModel('custom', ` ${typed}`, 'image')).toBe(typed);
  });

  it('leaves a blank Custom model blank, since Custom has no default (R03.20)', () => {
    expect(resolveModel('custom', '  ', 'image')).toBe('');
    expect(resolveModel('custom', undefined, 'text')).toBe('');
  });
});

/** Two test rounds: a retired Gemini preset, then a rename of its replacement and an OpenRouter id. */
const ROUNDS: readonly PresetUpgradeStep[] = [
  { version: 2, renames: { gemini: { 'gemini-old-b': 'gemini-3.8-flash' } } },
  {
    version: 1,
    renames: {
      gemini: { 'gemini-old-a': 'gemini-old-b' },
      openrouter: { 'vendor/retired-model': 'vendor/new-model' },
    },
  },
];

describe('preset upgrades', () => {
  it('ships without retirements in v1, so nothing is renamed and the marker stays', () => {
    expect(PRESET_UPGRADES).toEqual([]);
    expect(upgradeVersion(0)).toBe(0);
    expect(upgradeVersion(3)).toBe(3);
    expect(upgradedModel('gemini', 'gemini-2.5-pro', 0)).toBe('gemini-2.5-pro');
  });

  it('renames a retired id once, and not again after the marker has moved (R03.28)', () => {
    const marker = upgradeVersion(0, ROUNDS);
    expect(marker).toBe(2);
    expect(upgradedModel('openrouter', 'vendor/retired-model', 0, ROUNDS)).toBe('vendor/new-model');
    // The person picks the old id again later: the rounds at or below the marker do not run.
    expect(upgradedModel('openrouter', 'vendor/retired-model', marker, ROUNDS)).toBe(
      'vendor/retired-model',
    );
    expect(upgradedModel('gemini', 'gemini-old-b', 1, ROUNDS)).toBe('gemini-3.8-flash');
    expect(upgradedModel('gemini', 'gemini-old-b', 2, ROUNDS)).toBe('gemini-old-b');
  });

  it('runs the rounds oldest first, so an id renamed twice ends at the newest name', () => {
    expect(upgradedModel('gemini', 'gemini-old-a', 0, ROUNDS)).toBe('gemini-3.8-flash');
    expect(upgradedModel('gemini', ' gemini-old-a ', 0, ROUNDS)).toBe('gemini-3.8-flash');
  });

  it('renames only under the provider the round names, typed-id providers included', () => {
    expect(upgradedModel('openrouter', 'gemini-old-a', 0, ROUNDS)).toBe('gemini-old-a');
    expect(upgradedModel('huggingface', 'vendor/retired-model', 0, ROUNDS)).toBe(
      'vendor/retired-model',
    );
    expect(upgradedModel('gemini', 'gemini-3.5-flash-lite', 0, ROUNDS)).toBe(
      'gemini-3.5-flash-lite',
    );
  });

  it('never reads a saved id as an inherited object key', () => {
    for (const saved of ['constructor', 'toString', '__proto__', 'hasOwnProperty']) {
      expect(upgradedModel('gemini', saved, 0, ROUNDS)).toBe(saved);
    }
  });

  it('reads a missing or malformed marker as 0', () => {
    expect(readUpgradeMarker(4)).toBe(4);
    for (const value of [undefined, null, '2', -1, 1.5, Number.NaN, {}]) {
      expect(readUpgradeMarker(value), String(value)).toBe(0);
    }
  });
});
