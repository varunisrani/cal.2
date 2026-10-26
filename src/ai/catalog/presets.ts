/**
 * Our curated model presets (D-16.25) and the rules that turn a saved model id into the one used.
 *
 * Each provider offers at most three presets for photo requests and three for text requests; the
 * first of a list is its default, and a provider without its own text list uses its photo list
 * for text. The ids were checked on 2026-10-26 against each vendor's public model page (Gemini
 * models page, OpenAI models page, Anthropic models overview, xAI models page, OpenRouter model
 * pages, Together AI serverless models, Groq models and vision pages, the Hugging Face router's
 * model list, Fireworks AI model pages, DeepInfra model pages, Mistral AI model pages, the DeepSeek
 * pricing page, Alibaba Cloud Model Studio models, Cerebras models overview and the Ollama
 * library); a model offered for photos was listed there as taking images, except xAI's two, whose
 * page does not say (kept from research spec 03 §3.1). Refresh the lists, the date and, when an id
 * disappears, add a `PRESET_UPGRADES` step.
 */
import { PROVIDERS, providerById, type ProviderId } from './providers';

/** The date the presets were last checked against the vendors' lists. */
export const PRESETS_CHECKED_ON = '2026-10-26';

/** What a model is picked for: requests with photos, or requests with text only. */
export type ModelUse = 'image' | 'text';

interface PresetLists {
  readonly image: readonly string[];
  /** Left out when the photo presets also serve text. */
  readonly text?: readonly string[];
}

const PRESETS: Readonly<Record<ProviderId, PresetLists>> = {
  gemini: { image: ['gemini-3.5-flash-lite', 'gemini-3.8-flash', 'gemini-3.1-pro-preview'] },
  openai: { image: ['gpt-6-luna', 'gpt-6.1-terra', 'gpt-6.1-sol'] },
  anthropic: { image: ['claude-sonnet-5-5', 'claude-haiku-5-5', 'claude-opus-5-5'] },
  xai: { image: ['grok-4.6', 'grok-4.3'] },
  openrouter: { image: ['google/gemini-3.5-flash-lite', 'openrouter/free'] },
  together: {
    image: ['Qwen/Qwen3.5-9B', 'moonshotai/Kimi-K3'],
    text: ['openai/gpt-oss-120b', 'Qwen/Qwen3.8-Flash', 'moonshotai/Kimi-K3'],
  },
  groq: {
    image: ['qwen/qwen3.8-27b'],
    text: ['openai/gpt-oss-20b', 'openai/gpt-oss-120b', 'llama-3.3-70b-versatile'],
  },
  huggingface: { image: ['google/gemma-4-31B-it', 'Qwen/Qwen3.8-27B', 'moonshotai/Kimi-K3'] },
  fireworks: { image: ['accounts/fireworks/models/kimi-k3'] },
  deepinfra: { image: ['google/gemma-4-31B-it', 'Qwen/Qwen3.8-27B'] },
  mistral: {
    image: ['mistral-medium-3-5', 'mistral-large-2512'],
    text: ['mistral-small-2603', 'mistral-medium-3-5', 'mistral-large-2512'],
  },
  deepseek: { image: [], text: ['deepseek-flash', 'deepseek-v4-pro'] },
  qwen: {
    image: ['qwen3.7-plus', 'qwen3.8-max'],
    text: ['qwen3.8-flash', 'qwen3.7-plus', 'qwen3.8-max'],
  },
  cerebras: { image: [], text: ['gpt-oss-120b', 'qwen-3.8-27b'] },
  ollama: { image: ['qwen3-vl', 'gemma4', 'qwen3.8'] },
  // Custom has no presets: the person always types the model id.
  custom: { image: [] },
};

/** The presets offered for `use`, first being the default. */
export function presetsFor(provider: ProviderId, use: ModelUse): readonly string[] {
  const lists = PRESETS[provider];
  return use === 'text' ? (lists.text ?? lists.image) : lists.image;
}

/** The model picked for `use` when none is saved; empty for Custom, which has no presets. */
export function defaultModel(provider: ProviderId, use: ModelUse): string {
  return presetsFor(provider, use)[0] ?? '';
}

/**
 * The model used for a saved choice. A typed id (OpenRouter, Hugging Face, Ollama, Custom) is
 * kept as typed, trimmed. Any other provider keeps a saved id only when it is one of its presets
 * for `use`; anything else (a retired id, an id from the other list, blank, not text) reads as
 * the default.
 */
export function resolveModel(provider: ProviderId, saved: unknown, use: ModelUse): string {
  const typed = typeof saved === 'string' ? saved.trim() : '';
  if (typed === '') return defaultModel(provider, use);
  if (providerById(provider).freeFormModel) return typed;
  return presetsFor(provider, use).includes(typed) ? typed : defaultModel(provider, use);
}

/** The providers the primary and image standby pickers offer: those that accept photos. */
export function imagePickerProviders(): readonly ProviderId[] {
  return PROVIDERS.filter((entry) => entry.vision).map((entry) => entry.id);
}

/** The providers the text role and text standby pickers offer: a text preset or a typed id. */
export function textPickerProviders(): readonly ProviderId[] {
  return PROVIDERS.filter(
    (entry) => entry.freeFormModel || presetsFor(entry.id, 'text').length > 0,
  ).map((entry) => entry.id);
}

// ---------------------------------------------------------------------------------------------
// Retiring presets (R03.28)

/**
 * One round of preset retirements: per provider, the old id and its replacement. A round runs
 * once, when the stored marker (`meta.presetUpgradeVersion`) is below its version, for every role
 * that has a saved choice, typed-id providers included.
 */
export interface PresetUpgradeStep {
  readonly version: number;
  readonly renames: Readonly<Partial<Record<ProviderId, Readonly<Record<string, string>>>>>;
}

/** Every round so far, oldest first. None yet: v1 shipped with today's lists. */
export const PRESET_UPGRADES: readonly PresetUpgradeStep[] = [];

/** The stored marker as a number: anything that is not a whole number ≥ 0 counts as 0. */
export function readUpgradeMarker(value: unknown): number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : 0;
}

/** The marker to store once every round in `steps` has run. */
export function upgradeVersion(
  doneVersion: number,
  steps: readonly PresetUpgradeStep[] = PRESET_UPGRADES,
): number {
  return steps.reduce((latest, step) => Math.max(latest, step.version), doneVersion);
}

/**
 * `model` after the rounds newer than `doneVersion`, oldest round first, so a retired id renamed
 * twice ends at the newest name. Only renames for `provider` apply; the id is compared trimmed.
 */
export function upgradedModel(
  provider: ProviderId,
  model: string,
  doneVersion: number,
  steps: readonly PresetUpgradeStep[] = PRESET_UPGRADES,
): string {
  const pending = steps
    .filter((step) => step.version > doneVersion)
    .sort((a, b) => a.version - b.version);
  return pending.reduce((current, step) => {
    const renames = step.renames[provider];
    const key = current.trim();
    // Own keys only: a saved id such as `constructor` must not reach the object's prototype.
    return renames !== undefined && Object.hasOwn(renames, key)
      ? (renames[key] ?? current)
      : current;
  }, model);
}
