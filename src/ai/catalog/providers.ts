/**
 * The AI providers a person can bring a key for (spec 03 §3.1), in the order the provider picker
 * shows them, and what the rest of the AI layer needs to know about each one. Names and addresses
 * are data, not copy; the help sentences around them come with the screens (P05-04, P09-07).
 */

/** Our provider ids (17 §1.4), in picker order. */
export const PROVIDER_IDS = [
  'gemini',
  'openai',
  'anthropic',
  'xai',
  'openrouter',
  'together',
  'groq',
  'huggingface',
  'fireworks',
  'deepinfra',
  'mistral',
  'deepseek',
  'qwen',
  'cerebras',
  'ollama',
  'custom',
] as const;

export type ProviderId = (typeof PROVIDER_IDS)[number];

/** Which wire protocol a provider speaks: Gemini, OpenAI-compatible chat, or Anthropic. */
export type WireFormat = 'gemini' | 'openai' | 'anthropic';

/** How the key travels: Gemini's key header, a Bearer token, Anthropic's key header, or not at all. */
export type KeyStyle = 'googleHeader' | 'bearer' | 'anthropicHeader' | 'none';

/** Whether a key must be saved before a request (`optional`: sent only when one is saved). */
export type KeyNeed = 'required' | 'optional' | 'none';

/** `userServer`: the person gives the address (Ollama, Custom); `fixed`: the vendor's own. */
export type EndpointKind = 'fixed' | 'userServer';

/**
 * How a browser page reaches the provider (spec 03 §3.15): straight away, only with Anthropic's
 * direct-browser header, through a server the person runs, or not at all (reserved for a vendor
 * that starts refusing browsers).
 */
export type BrowserAccess = 'direct' | 'directWithHeader' | 'userServer' | 'unsupported';

/**
 * Whether the provider's error replies lack CORS headers, so that in a browser a refused key looks
 * like a lost connection (spec 03 §3.15 item 4): always, only when no key was sent, or never.
 */
export type KeyRefusalHidden = 'always' | 'withoutKey' | 'never';

export interface Provider {
  readonly id: ProviderId;
  /** The name shown in pickers and in the both-failed message. */
  readonly name: string;
  /** The vendor's address; empty when the person must supply one (Custom). */
  readonly baseUrl: string;
  readonly format: WireFormat;
  readonly auth: KeyStyle;
  readonly key: KeyNeed;
  readonly endpoint: EndpointKind;
  /** Accepts photos, so it may serve the primary and the image standby. */
  readonly vision: boolean;
  /** Any model id may be typed; it is kept as typed (trimmed) and never checked against a list. */
  readonly freeFormModel: boolean;
  readonly browserAccess: BrowserAccess;
  readonly hidesKeyRefusal: KeyRefusalHidden;
}

/** A vendor-hosted OpenAI-compatible provider; the other kinds start from it and differ. */
function hosted(
  id: ProviderId,
  name: string,
  baseUrl: string,
  differences: Partial<Omit<Provider, 'id' | 'name' | 'baseUrl'>> = {},
): Provider {
  return {
    id,
    name,
    baseUrl,
    format: 'openai',
    auth: 'bearer',
    key: 'required',
    endpoint: 'fixed',
    vision: true,
    freeFormModel: false,
    browserAccess: 'direct',
    hidesKeyRefusal: 'never',
    ...differences,
  };
}

/** A server the person runs, spoken to in the OpenAI-compatible format. */
const ownServer = {
  endpoint: 'userServer',
  browserAccess: 'userServer',
  freeFormModel: true,
} as const;

/** Every provider, in picker order. Vendor addresses were checked on 2026-10-26 (spec 03 §3.15). */
export const PROVIDERS: readonly Provider[] = [
  hosted('gemini', 'Gemini', 'https://generativelanguage.googleapis.com/v1beta', {
    format: 'gemini',
    auth: 'googleHeader',
  }),
  hosted('openai', 'OpenAI', 'https://api.openai.com/v1'),
  hosted('anthropic', 'Anthropic', 'https://api.anthropic.com/v1', {
    format: 'anthropic',
    auth: 'anthropicHeader',
    browserAccess: 'directWithHeader',
  }),
  hosted('xai', 'xAI', 'https://api.x.ai/v1'),
  hosted('openrouter', 'OpenRouter', 'https://openrouter.ai/api/v1', { freeFormModel: true }),
  hosted('together', 'Together AI', 'https://api.together.xyz/v1'),
  hosted('groq', 'Groq', 'https://api.groq.com/openai/v1'),
  hosted('huggingface', 'Hugging Face', 'https://router.huggingface.co/v1', {
    freeFormModel: true,
    hidesKeyRefusal: 'withoutKey',
  }),
  hosted('fireworks', 'Fireworks AI', 'https://api.fireworks.ai/inference/v1'),
  hosted('deepinfra', 'DeepInfra', 'https://api.deepinfra.com/v1/openai'),
  hosted('mistral', 'Mistral AI', 'https://api.mistral.ai/v1'),
  // DeepSeek serves its OpenAI-compatible routes at the root: no `/v1` here on purpose.
  hosted('deepseek', 'DeepSeek', 'https://api.deepseek.com', { vision: false }),
  // The international (Singapore) endpoint of Alibaba Cloud's compatible mode.
  hosted('qwen', 'Qwen (Alibaba Cloud)', 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1'),
  hosted('cerebras', 'Cerebras', 'https://api.cerebras.ai/v1', {
    vision: false,
    hidesKeyRefusal: 'always',
  }),
  // Ollama ignores keys, so none is asked for or sent; its default is this device (D-16.26).
  hosted('ollama', 'Ollama', 'http://localhost:11434/v1', {
    ...ownServer,
    auth: 'none',
    key: 'none',
  }),
  // Custom has no address of its own; a key is sent only when the person saved one (R03.20).
  hosted('custom', 'Custom server', '', { ...ownServer, key: 'optional' }),
];

const BY_ID = new Map<string, Provider>(PROVIDERS.map((entry) => [entry.id, entry]));

export function isProviderId(value: unknown): value is ProviderId {
  return typeof value === 'string' && BY_ID.has(value);
}

export function providerById(id: ProviderId): Provider {
  const entry = BY_ID.get(id);
  if (entry === undefined) throw new RangeError(`Unknown AI provider: ${id}`);
  return entry;
}
