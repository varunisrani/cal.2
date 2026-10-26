import { describe, expect, it } from 'vitest';
import presetsSource from './presets.ts?raw';
import {
  PRESETS_CHECKED_ON,
  PRESET_UPGRADES,
  defaultModel,
  presetsFor,
  resolveModel,
  upgradeChoices,
  upgradeVersion,
  type ModelChoice,
  type PresetUpgradeStep,
} from './presets';
import { PROVIDER_IDS, imageProviders, provider, textProviders } from './providers';

describe('presets per provider (D-16.25, ACC-E1-1)', () => {
  it('offers presets for every provider in each picker it appears in, except Custom', () => {
    const photoPickers = imageProviders().map((entry) => entry.id);
    const textPickers = textProviders().map((entry) => entry.id);
    expect(photoPickers).toHaveLength(14);
    expect(textPickers).toHaveLength(16);
    for (const id of photoPickers.filter((name) => name !== 'custom')) {
      expect(presetsFor(id, 'image').length, id).toBeGreaterThan(0);
    }
    for (const id of textPickers.filter((name) => name !== 'custom')) {
      expect(presetsFor(id, 'text').length, id).toBeGreaterThan(0);
    }
    expect(presetsFor('custom', 'image')).toEqual([]);
    expect(presetsFor('custom', 'text')).toEqual([]);
  });

  it('keeps each list short and free of repeats, with its first entry as the default', () => {
    for (const id of PROVIDER_IDS) {
      for (const use of ['image', 'text'] as const) {
        const list = presetsFor(id, use);
        expect(list.length, `${id} ${use}`).toBeLessThanOrEqual(3);
        expect(new Set(list).size).toBe(list.length);
        expect(list.every((model) => model.trim() === model && model !== '')).toBe(true);
        expect(defaultModel(id, use)).toBe(list[0] ?? '');
      }
    }
  });

  it('offers no photo models for the text-only providers', () => {
    expect(presetsFor('deepseek', 'image')).toEqual([]);
    expect(presetsFor('cerebras', 'image')).toEqual([]);
    expect(defaultModel('deepseek', 'text')).not.toBe('');
  });

  it('falls back to the photo list in a text picker when a provider has no text list', () => {
    expect(presetsFor('gemini', 'text')).toEqual(presetsFor('gemini', 'image'));
    expect(presetsFor('groq', 'text')).not.toEqual(presetsFor('groq', 'image'));
  });

  it('records the date the lists were checked, in the data file header too', () => {
    expect(PRESETS_CHECKED_ON).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const header = presetsSource.slice(0, presetsSource.indexOf('import'));
    expect(header).toContain(`Checked on ${PRESETS_CHECKED_ON}`);
  });
});

describe('resolveModel: a saved pick', () => {
  it('turns a model Gemini no longer lists into its default', () => {
    expect(resolveModel('gemini', 'gemini-0-retired', 'image')).toBe(
      defaultModel('gemini', 'image'),
    );
  });

  it('keeps a listed model, trimmed', () => {
    const second = presetsFor('anthropic', 'image')[1]!;
    expect(resolveModel('anthropic', `  ${second}\n`, 'image')).toBe(second);
  });

  it('checks the list of the picker it is for', () => {
    const textOnly = presetsFor('groq', 'text').find(
      (model) => !presetsFor('groq', 'image').includes(model),
    )!;
    expect(resolveModel('groq', textOnly, 'text')).toBe(textOnly);
    expect(resolveModel('groq', textOnly, 'image')).toBe(defaultModel('groq', 'image'));
  });

  it('keeps any typed id on OpenRouter, Hugging Face and Custom', () => {
    expect(resolveModel('openrouter', 'someone/house-vision-7', 'image')).toBe(
      'someone/house-vision-7',
    );
    expect(resolveModel('huggingface', 'someone/house-vision-7', 'text')).toBe(
      'someone/house-vision-7',
    );
    expect(resolveModel('custom', ' plate-reader-v2 ', 'image')).toBe('plate-reader-v2');
  });

  it('keeps an Ollama tag typed freely (R03.21, ACC-E13-2)', () => {
    expect(provider('ollama').freeFormModel).toBe(true);
    expect(resolveModel('ollama', 'qwen3.5:9b', 'image')).toBe('qwen3.5:9b');
    expect(resolveModel('ollama', 'my-tuned-model:latest', 'text')).toBe('my-tuned-model:latest');
  });

  it('gives the default for a blank or missing id, which for Custom is nothing', () => {
    expect(resolveModel('ollama', '   ', 'image')).toBe(defaultModel('ollama', 'image'));
    expect(resolveModel('openai', undefined, 'image')).toBe(defaultModel('openai', 'image'));
    expect(resolveModel('openai', 42, 'image')).toBe(defaultModel('openai', 'image'));
    expect(resolveModel('custom', '', 'image')).toBe('');
  });
});

describe('upgradeChoices: retired presets (R03.28)', () => {
  // A made-up release that retires two models; v1 itself retires nothing.
  const steps: readonly PresetUpgradeStep[] = [
    {
      version: 1,
      renames: {
        gemini: { 'gemini-old-lite': 'gemini-new-lite' },
        ollama: { 'old-vision': 'new-vision' },
      },
    },
  ];
  const picks = (model: string, standbyModel = model): Record<string, ModelChoice> => ({
    primary: { provider: 'gemini', model },
    standby: { provider: 'gemini', model: standbyModel },
  });

  it('ships no upgrades in v1', () => {
    expect(PRESET_UPGRADES).toEqual([]);
    expect(upgradeVersion()).toBe(0);
    const choices = picks('gemini-old-lite');
    expect(upgradeChoices(choices, 0)).toEqual({ choices, version: 0 });
  });

  it('rewrites the primary and the standby once, and not on the second run', () => {
    const first = upgradeChoices(picks('gemini-old-lite'), 0, steps);
    expect(first.version).toBe(1);
    expect(first.choices.primary!.model).toBe('gemini-new-lite');
    expect(first.choices.standby!.model).toBe('gemini-new-lite');

    // The second launch stores the old ids again by hand: the marker says the step has run.
    const second = upgradeChoices(picks('gemini-old-lite'), first.version, steps);
    expect(second.version).toBe(1);
    expect(second.choices.primary!.model).toBe('gemini-old-lite');
    expect(second.choices.standby!.model).toBe('gemini-old-lite');
  });

  it('does not rewrite a model the person picks again after the upgrade ran', () => {
    const { version } = upgradeChoices(picks('gemini-3.8-flash'), 0, steps);
    const later = upgradeChoices(picks('gemini-old-lite', 'gemini-3.8-flash'), version, steps);
    expect(later.choices.primary!.model).toBe('gemini-old-lite');
  });

  it('renames each pick only by its own provider, typed ids on free-form providers too', () => {
    const { choices } = upgradeChoices(
      {
        primary: { provider: 'ollama', model: ' old-vision ' },
        standby: { provider: 'openrouter', model: 'old-vision' },
        text: { provider: 'gemini', model: 'old-vision' },
      },
      0,
      steps,
    );
    expect(choices.primary).toEqual({ provider: 'ollama', model: 'new-vision' });
    expect(choices.standby).toEqual({ provider: 'openrouter', model: 'old-vision' });
    expect(choices.text).toEqual({ provider: 'gemini', model: 'old-vision' });
  });

  it('runs several pending steps in order, and only those newer than the marker', () => {
    const chain: readonly PresetUpgradeStep[] = [
      { version: 3, renames: { mistral: { 'm-two': 'm-three' } } },
      { version: 2, renames: { mistral: { 'm-one': 'm-two' } } },
    ];
    const start = { primary: { provider: 'mistral', model: 'm-one' } } as const;
    expect(upgradeChoices(start, 0, chain)).toEqual({
      choices: { primary: { provider: 'mistral', model: 'm-three' } },
      version: 3,
    });
    expect(upgradeChoices(start, 2, chain).choices.primary.model).toBe('m-one');
    expect(upgradeVersion(chain)).toBe(3);
  });

  it('keeps unchanged picks as they were and ignores names an object inherits', () => {
    const choices = { primary: { provider: 'gemini', model: 'toString' } } as const;
    const result = upgradeChoices(choices, 0, steps);
    expect(result.choices.primary).toBe(choices.primary);
    expect(result.version).toBe(1);
  });
});
