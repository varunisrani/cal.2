/**
 * The AI providers Platewise can talk to (03 §3.1): sixteen, in the order the pickers show them.
 * Each entry says how a request reaches the vendor (address, wire format, where the key goes),
 * what the person must supply (a key, a server address, a model id) and what the provider can
 * do (read photos). Model presets live in `presets.ts`. Vendor names, addresses and header names
 * are third-party protocol facts, spelled as each vendor documents them.
 */

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

/** The three wire protocols; each has one adapter in `src/ai/adapters`. */
export type WireFormat = 'gemini' | 'openai' | 'anthropic';

/**
 * Where the key travels: Google's `x-goog-api-key` header, an `Authorization: Bearer` header,
 * Anthropic's `x-api-key` header, or nowhere (Ollama). Never in the address.
 */
export type AuthStyle = 'googApiKey' | 'bearer' | 'xApiKey' | 'none';

/** Whether the person must paste a key: always, only if their server wants one, or never. */
export type KeyRule = 'required' | 'optional' | 'none';

/** A vendor's fixed address, or a server the person runs and names (Ollama, Custom). */
export type EndpointKind = 'fixed' | 'userServer';

/**
 * How the page reaches the provider from the browser (03 §3.15, measured 2026-10-26, D-04.1):
 * straight away; straight away but only with Anthropic's opt-in header; through a server the
 * person runs, which must allow our origin; or not at all (kept for a vendor that stops allowing
 * cross-origin calls; no entry uses it today).
 */
export type BrowserAccess = 'direct' | 'directWithHeader' | 'userServer' | 'unsupported';

export interface Provider {
  readonly id: ProviderId;
  /** The vendor's name as shown in pickers and in "both failed" messages. */
  readonly name: string;
  /** The default base address, without a trailing slash; '' when the person must supply one. */
  readonly baseUrl: string;
  readonly format: WireFormat;
  readonly auth: AuthStyle;
  readonly key: KeyRule;
  readonly endpoint: EndpointKind;
  /** Whether it can read photos; only these appear in the photo pickers. */
  readonly vision: boolean;
  /** Whether any model id may be typed; otherwise only the presets are offered. */
  readonly freeFormModel: boolean;
  readonly browserAccess: BrowserAccess;
  /** A server the person runs: one attempt may use the whole time limit (D-16.60). */
  readonly selfHosted: boolean;
}

/** A vendor's own cloud: fixed address, key required, photos, presets only, reached directly. */
function cloud(
  id: ProviderId,
  name: string,
  baseUrl: string,
  extra: Partial<Pick<Provider, 'format' | 'auth' | 'vision' | 'freeFormModel' | 'browserAccess'>>,
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
    selfHosted: false,
    ...extra,
  };
}

/** A server the person runs, spoken to in the OpenAI-compatible format. */
function ownServer(
  id: ProviderId,
  name: string,
  baseUrl: string,
  auth: AuthStyle,
  key: KeyRule,
): Provider {
  return {
    id,
    name,
    baseUrl,
    format: 'openai',
    auth,
    key,
    endpoint: 'userServer',
    vision: true,
    freeFormModel: true,
    browserAccess: 'userServer',
    selfHosted: true,
  };
}

const ENTRIES: readonly Provider[] = [
  cloud('gemini', 'Gemini', 'https://generativelanguage.googleapis.com/v1beta', {
    format: 'gemini',
    auth: 'googApiKey',
  }),
  cloud('openai', 'OpenAI', 'https://api.openai.com/v1', {}),
  // Without `anthropic-dangerous-direct-browser-access: true` its replies carry no CORS header.
  cloud('anthropic', 'Anthropic', 'https://api.anthropic.com/v1', {
    format: 'anthropic',
    auth: 'xApiKey',
    browserAccess: 'directWithHeader',
  }),
  cloud('xai', 'xAI', 'https://api.x.ai/v1', {}),
  cloud('openrouter', 'OpenRouter', 'https://openrouter.ai/api/v1', { freeFormModel: true }),
  cloud('together', 'Together AI', 'https://api.together.xyz/v1', {}),
  cloud('groq', 'Groq', 'https://api.groq.com/openai/v1', {}),
  cloud('huggingface', 'Hugging Face', 'https://router.huggingface.co/v1', {
    freeFormModel: true,
  }),
  cloud('fireworks', 'Fireworks AI', 'https://api.fireworks.ai/inference/v1', {}),
  cloud('deepinfra', 'DeepInfra', 'https://api.deepinfra.com/v1/openai', {}),
  cloud('mistral', 'Mistral AI', 'https://api.mistral.ai/v1', {}),
  // The vendor's documented base has no version segment.
  cloud('deepseek', 'DeepSeek', 'https://api.deepseek.com', { vision: false }),
  // Alibaba Cloud Model Studio, international (Singapore) region.
  cloud('qwen', 'Qwen', 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1', {}),
  cloud('cerebras', 'Cerebras', 'https://api.cerebras.ai/v1', { vision: false }),
  // Ollama's own default; on a phone that is the phone itself, so people usually change it.
  ownServer('ollama', 'Ollama', 'http://localhost:11434/v1', 'none', 'none'),
  // Any OpenAI-compatible server; a key is sent only when one is set (R03.20).
  ownServer('custom', 'Custom server', '', 'bearer', 'optional'),
];

/** Every provider by id. */
export const PROVIDERS: Readonly<Record<ProviderId, Provider>> = Object.fromEntries(
  ENTRIES.map((entry) => [entry.id, entry]),
) as Record<ProviderId, Provider>;

export function provider(id: ProviderId): Provider {
  return PROVIDERS[id];
}

export function isProviderId(value: unknown): value is ProviderId {
  return typeof value === 'string' && (PROVIDER_IDS as readonly string[]).includes(value);
}

/** The providers the photo pickers offer (the primary and the photo standby): 14. */
export function imageProviders(): readonly Provider[] {
  return ENTRIES.filter((entry) => entry.vision);
}

/** The providers the text pickers offer (the text provider and the text standby): all 16. */
export function textProviders(): readonly Provider[] {
  return ENTRIES;
}
