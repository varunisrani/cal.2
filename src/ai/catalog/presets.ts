/**
 * Our own model presets (D-16.25): a short list per provider, at most three models for photo
 * requests and three for text requests, the first of each list being the default.
 *
 * Checked on 2026-10-26 (the build date) against each vendor's public model list: the Gemini
 * API models page, OpenAI's and Anthropic's model overviews, xAI's models page, OpenRouter's
 * public model list, Together's serverless models, Groq's supported models, the Hugging Face
 * router's model list, the Fireworks model library, DeepInfra's model list, Mistral's model
 * pages, DeepSeek's API docs, Alibaba Model Studio's recommended models, Cerebras' model catalog
 * and the Ollama library. Photo lists hold only models the vendor lists with image input;
 * quick, low-cost models come first. Refresh with the live provider check before a release
 * (P10-12), and add a `PRESET_UPGRADES` step for every preset that a vendor retires.
 */
import { PROVIDERS, type ProviderId } from './providers';

/** The build date the presets were checked against the vendors' lists. */
export const PRESETS_CHECKED_ON = '2026-10-26';

/** Which picker a model is for: photo requests (primary, photo standby) or text requests. */
export type ModelUse = 'image' | 'text';

interface PresetLists {
  readonly image: readonly string[];
  /** Left out when the text pickers offer the photo list. */
  readonly text?: readonly string[];
}

const PRESETS: Readonly<Record<ProviderId, PresetLists>> = {
  gemini: { image: ['gemini-3.5-flash-lite', 'gemini-3.8-flash', 'gemini-4-argon'] },
  openai: { image: ['gpt-6-luna', 'gpt-6.1-terra', 'gpt-6.1-sol'] },
  anthropic: { image: ['claude-haiku-5-5', 'claude-sonnet-5-5', 'claude-opus-5-5'] },
  xai: { image: ['grok-4.3', 'grok-4.20-0309-non-reasoning', 'grok-4.7'] },
  openrouter: {
    image: ['google/gemini-3.5-flash-lite', 'openai/gpt-6-luna', 'anthropic/claude-haiku-5.5'],
  },
  together: {
    image: ['Qwen/Qwen3.5-9B', 'nvidia/NVIDIA-Nemotron-3.5-Super-VL', 'moonshotai/Kimi-K3'],
    text: [
      'deepseek-ai/DeepSeek-V4.1-Flash',
      'openai/gpt-oss-120b',
      'MiniMaxAI/MiniMax-M3.1-Flash',
    ],
  },
  groq: {
    image: ['qwen/qwen3.8-27b'],
    text: ['openai/gpt-oss-120b', 'openai/gpt-oss-20b', 'qwen/qwen3.8-27b'],
  },
  huggingface: {
    image: ['Qwen/Qwen3.8-27B', 'google/gemma-4-26B-A4B-it', 'MiniMaxAI/MiniMax-M3.1-Flash'],
  },
  fireworks: {
    image: [
      'accounts/fireworks/models/minimax-m3p1-flash',
      'accounts/fireworks/models/glm-5p3-flash',
    ],
  },
  deepinfra: {
    image: [
      'google/gemma-4-26B-A4B-it',
      'Qwen/Qwen3-VL-30B-A3B-Instruct',
      'nvidia/NVIDIA-Nemotron-3.5-Super-VL',
    ],
  },
  mistral: { image: ['mistral-small-2603', 'ministral-14b-2512', 'mistral-medium-3-5'] },
  deepseek: { image: [], text: ['deepseek-flash', 'deepseek-v4-pro'] },
  qwen: { image: ['qwen3.7-plus', 'qwen3.8-max'], text: ['qwen3.8-flash', 'qwen3.8-max'] },
  cerebras: { image: [], text: ['gpt-oss-120b', 'qwen-3.8-27b'] },
  // Library names without a size tag pull the default size; any tag can be typed instead.
  ollama: { image: ['gemma4', 'qwen3.5', 'ministral-3'], text: ['gemma4', 'qwen3.5', 'gpt-oss'] },
  // The person always types the model of their own server.
  custom: { image: [] },
};

/** The presets a picker offers for a provider, default first; may be empty. */
export function presetsFor(id: ProviderId, use: ModelUse): readonly string[] {
  const lists = PRESETS[id];
  return use === 'text' ? (lists.text ?? lists.image) : lists.image;
}

/** The model a provider starts with in a picker: its first preset, or '' when it has none. */
export function defaultModel(id: ProviderId, use: ModelUse): string {
  return presetsFor(id, use)[0] ?? '';
}

/**
 * The model id to use for a saved pick: trimmed; a provider that takes typed ids keeps any
 * non-blank id (an Ollama tag such as `qwen3.5:9b`, R03.21); a provider with a fixed list keeps
 * only an id it still lists. Anything else becomes the default.
 */
export function resolveModel(id: ProviderId, saved: unknown, use: ModelUse): string {
  const model = typeof saved === 'string' ? saved.trim() : '';
  if (model === '') return defaultModel(id, use);
  if (PROVIDERS[id].freeFormModel) return model;
  return presetsFor(id, use).includes(model) ? model : defaultModel(id, use);
}

// ---- Upgrades of retired presets (R03.28) ------------------------------------------------------

/** A saved pick: one provider and one of its models. */
export interface ModelChoice {
  readonly provider: ProviderId;
  readonly model: string;
}

/**
 * One release's renames: per provider, a retired model id and the model that replaces it. Steps
 * run once each, in order, under a version marker the data layer keeps, so a person who picks a
 * renamed model again later on purpose keeps it.
 */
export interface PresetUpgradeStep {
  /** The marker value once this step has run; steps are listed in increasing order. */
  readonly version: number;
  readonly renames: Readonly<Partial<Record<ProviderId, Readonly<Record<string, string>>>>>;
}

/** Nothing retired yet in v1. */
export const PRESET_UPGRADES: readonly PresetUpgradeStep[] = [];

/** The marker value after every step has run; 0 when there are none. */
export function upgradeVersion(steps: readonly PresetUpgradeStep[] = PRESET_UPGRADES): number {
  return steps.reduce((newest, step) => Math.max(newest, step.version), 0);
}

/**
 * Runs every step newer than `doneVersion` over each pick, by the pick's own provider, free-form
 * providers included. Returns the picks (unchanged ones as they were) and the version to store.
 */
export function upgradeChoices<K extends string>(
  choices: Readonly<Record<K, ModelChoice>>,
  doneVersion: number,
  steps: readonly PresetUpgradeStep[] = PRESET_UPGRADES,
): { readonly choices: Readonly<Record<K, ModelChoice>>; readonly version: number } {
  const pending = steps
    .filter((step) => step.version > doneVersion)
    .sort((a, b) => a.version - b.version);
  if (pending.length === 0) return { choices, version: doneVersion };
  const upgraded: Record<K, ModelChoice> = { ...choices };
  for (const name of Object.keys(choices) as K[]) {
    const choice = choices[name];
    const before = choice.model.trim();
    const after = pending.reduce((model, step) => renamed(step, choice.provider, model), before);
    if (after !== before) upgraded[name] = { ...choice, model: after };
  }
  return { choices: upgraded, version: upgradeVersion(pending) };
}

function renamed(step: PresetUpgradeStep, id: ProviderId, model: string): string {
  const table = step.renames[id];
  return table !== undefined && Object.hasOwn(table, model) ? (table[model] ?? model) : model;
}
