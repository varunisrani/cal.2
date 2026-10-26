/**
 * What the person chose for AI (03 §3.3–3.4), as one record: the `ai.settings` row of the
 * settings table (17 §1.3). Keys are not in it: they live in the `secrets` table, one per
 * provider, and every role using a provider shares its key.
 *
 * Four roles can serve a request. The primary reads photos and serves every request that has
 * them; an optional text provider serves requests without photos; a photo standby and a text
 * standby are each tried once when the role they back fails (D-16.22). Ollama and Custom keep
 * their server addresses in two slots, one for the primary and text roles and one for the
 * standbys, so the same model on two servers can back itself up (R03.5).
 */
import { normaliseBaseUrl, sameServerUrl } from './endpoint';
import {
  defaultModel,
  resolveModel,
  upgradeChoices,
  PRESET_UPGRADES,
  type ModelChoice,
  type ModelUse,
  type PresetUpgradeStep,
} from './catalog/presets';
import { PROVIDER_IDS, PROVIDERS, isProviderId, type ProviderId } from './catalog/providers';

/** A role that can be switched off: the text provider and both standbys. */
export interface SwitchableChoice extends ModelChoice {
  readonly on: boolean;
}

/** Server addresses for one provider; '' means the provider's default. */
export interface EndpointSlots {
  /** Used by the primary and the text provider. */
  readonly main: string;
  /** Used by both standbys. */
  readonly standby: string;
}

/** OpenRouter's reasoning effort; `auto` sends none and leaves it to the model. */
export const OPENROUTER_EFFORTS = [
  'auto',
  'none',
  'minimal',
  'low',
  'medium',
  'high',
  'xhigh',
  'max',
] as const;

export type OpenRouterEffort = (typeof OPENROUTER_EFFORTS)[number];

export interface AiSettings {
  /** Reads photos; serves every request with photos, and the others unless `textRole` is on. */
  readonly primary: ModelChoice;
  /** When on, serves every request without photos. */
  readonly textRole: SwitchableChoice;
  /** Tried once when a request with photos fails; always a provider that reads photos. */
  readonly imageStandby: SwitchableChoice;
  /** Tried once when a request without photos fails, whichever role served it. */
  readonly textStandby: SwitchableChoice;
  /** Addresses for the providers people run themselves (Ollama, Custom), already tidied. */
  readonly endpoints: Readonly<Partial<Record<ProviderId, EndpointSlots>>>;
  /** Notes for the AI, sent with every request (D-16.24); '' sends none. */
  readonly instructions: string;
  /** The answer token limit, sent with every request (D-16.65). */
  readonly maxTokens: number;
  /** The time limit of one action, in seconds (D-16.23). */
  readonly timeoutSec: number;
  readonly openRouterEffort: OpenRouterEffort;
}

export const DEFAULT_MAX_TOKENS = 1_024;
export const MIN_MAX_TOKENS = 1;
export const DEFAULT_TIMEOUT_SEC = 180;
export const MIN_TIMEOUT_SEC = 30;
export const MAX_TIMEOUT_SEC = 600;

const START_PROVIDER: ProviderId = 'gemini';

const pick = (provider: ProviderId, use: ModelUse): ModelChoice => ({
  provider,
  model: defaultModel(provider, use),
});

/** A first start: Gemini with its default model, everything optional switched off. */
export const DEFAULT_AI_SETTINGS: AiSettings = {
  primary: pick(START_PROVIDER, 'image'),
  textRole: { on: false, ...pick(START_PROVIDER, 'text') },
  imageStandby: { on: false, ...pick(START_PROVIDER, 'image') },
  textStandby: { on: false, ...pick(START_PROVIDER, 'text') },
  endpoints: {},
  instructions: '',
  maxTokens: DEFAULT_MAX_TOKENS,
  timeoutSec: DEFAULT_TIMEOUT_SEC,
  openRouterEffort: 'auto',
};

// ---- Reading a stored record -------------------------------------------------------------------

type Fields = Readonly<Record<string, unknown>>;

function fieldsOf(value: unknown): Fields | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Fields)
    : undefined;
}

/**
 * A stored pick: its provider when the role may use it (photo roles only take providers that
 * read photos), else the role's default provider; its model through the catalogue (a retired
 * preset becomes the default, a typed id on a free-form provider is kept).
 */
function readChoice(stored: unknown, use: ModelUse, fallback: ModelChoice): ModelChoice {
  const fields = fieldsOf(stored);
  const id = fields?.provider;
  if (!isProviderId(id) || (use === 'image' && !PROVIDERS[id].vision)) return fallback;
  return { provider: id, model: resolveModel(id, fields?.model, use) };
}

function readSwitchable(
  stored: unknown,
  use: ModelUse,
  fallback: SwitchableChoice,
): SwitchableChoice {
  const on = fieldsOf(stored)?.on;
  const { provider, model } = readChoice(stored, use, fallback);
  return { on: typeof on === 'boolean' ? on : fallback.on, provider, model };
}

function readEndpoints(stored: unknown): AiSettings['endpoints'] {
  const fields = fieldsOf(stored);
  const endpoints: Partial<Record<ProviderId, EndpointSlots>> = {};
  if (fields === undefined) return endpoints;
  // Only the providers people run themselves keep an address: no proxy for cloud vendors.
  for (const id of PROVIDER_IDS) {
    const slots = fieldsOf(fields[id]);
    if (PROVIDERS[id].endpoint !== 'userServer' || slots === undefined) continue;
    const main = typeof slots.main === 'string' ? normaliseBaseUrl(slots.main) : '';
    const standby = typeof slots.standby === 'string' ? normaliseBaseUrl(slots.standby) : '';
    if (main !== '' || standby !== '') endpoints[id] = { main, standby };
  }
  return endpoints;
}

/** A whole number from a stored number; undefined for anything else. */
function readInteger(stored: unknown, round: (value: number) => number): number | undefined {
  return typeof stored === 'number' && Number.isFinite(stored) ? round(stored) : undefined;
}

/** The answer token limit: whole, at least 1, no upper bound; 1 024 when unreadable. */
export function readMaxTokens(stored: unknown): number {
  const value = readInteger(stored, Math.floor);
  return value === undefined ? DEFAULT_MAX_TOKENS : Math.max(MIN_MAX_TOKENS, value);
}

/** The time limit: whole seconds within 30–600; 180 when unreadable. */
export function readTimeoutSec(stored: unknown): number {
  const value = readInteger(stored, Math.round);
  if (value === undefined) return DEFAULT_TIMEOUT_SEC;
  return Math.min(MAX_TIMEOUT_SEC, Math.max(MIN_TIMEOUT_SEC, value));
}

function readEffort(stored: unknown): OpenRouterEffort {
  return (
    OPENROUTER_EFFORTS.find((effort) => effort === stored) ?? DEFAULT_AI_SETTINGS.openRouterEffort
  );
}

/**
 * The settings in a stored `ai.settings` record. Nothing stored (null) or something unreadable
 * gives the defaults; otherwise each field is read on its own and a bad field takes its default,
 * so callers always get a complete, valid record. The data layer can use it as the row's reader.
 */
export function decodeAiSettings(raw: unknown): AiSettings {
  const fields = fieldsOf(raw);
  if (fields === undefined) return DEFAULT_AI_SETTINGS;
  const defaults = DEFAULT_AI_SETTINGS;
  return {
    primary: readChoice(fields.primary, 'image', defaults.primary),
    textRole: readSwitchable(fields.textRole, 'text', defaults.textRole),
    imageStandby: readSwitchable(fields.imageStandby, 'image', defaults.imageStandby),
    textStandby: readSwitchable(fields.textStandby, 'text', defaults.textStandby),
    endpoints: readEndpoints(fields.endpoints),
    instructions: typeof fields.instructions === 'string' ? fields.instructions.trim() : '',
    maxTokens: readMaxTokens(fields.maxTokens),
    timeoutSec: readTimeoutSec(fields.timeoutSec),
    openRouterEffort: readEffort(fields.openRouterEffort),
  };
}

// ---- Roles -------------------------------------------------------------------------------------

/** Which slot of a provider's addresses a role uses. */
export type EndpointSlot = keyof EndpointSlots;

/**
 * The address a role sends to: for Ollama and Custom the slot's address when one is set, else
 * the provider's default ('' for Custom, which then cannot run); for a cloud vendor its own.
 */
export function effectiveBaseUrl(
  settings: AiSettings,
  provider: ProviderId,
  slot: EndpointSlot,
): string {
  const entry = PROVIDERS[provider];
  const own = entry.endpoint === 'userServer' ? (settings.endpoints[provider]?.[slot] ?? '') : '';
  return normaliseBaseUrl(own === '' ? entry.baseUrl : own);
}

/** Which kind of request a role serves: one with photos, or one without. */
export type Route = 'photo' | 'text';

export type RoleName = 'primary' | 'textRole' | 'imageStandby' | 'textStandby';

/** A role made concrete for one request: who serves it, with which model, at which address. */
export interface RoleTarget {
  readonly route: Route;
  readonly role: RoleName;
  readonly provider: ProviderId;
  readonly model: string;
  readonly baseUrl: string;
}

/** The part of a request that decides its role. */
export interface RoleRequest {
  /** The photos sent with the request; none or empty means a text request. */
  readonly images?: readonly unknown[];
}

function target(
  settings: AiSettings,
  route: Route,
  role: RoleName,
  choice: ModelChoice,
): RoleTarget {
  const slot: EndpointSlot = role === 'imageStandby' || role === 'textStandby' ? 'standby' : 'main';
  return {
    route,
    role,
    provider: choice.provider,
    model: choice.model,
    baseUrl: effectiveBaseUrl(settings, choice.provider, slot),
  };
}

/**
 * Who serves a request: one with photos always goes to the primary; one without goes to the text
 * provider when it is switched on, else to the primary (ACC-E3-1).
 */
export function roleFor(request: RoleRequest, settings: AiSettings): RoleTarget {
  const hasPhotos = (request.images?.length ?? 0) > 0;
  if (hasPhotos) return target(settings, 'photo', 'primary', settings.primary);
  return settings.textRole.on
    ? target(settings, 'text', 'textRole', settings.textRole)
    : target(settings, 'text', 'primary', settings.primary);
}

/** The person's keys by provider, as the key store holds them. */
export type ProviderKeys = Readonly<Partial<Record<ProviderId, string>>>;

/** A provider's key, trimmed (a pasted newline would break the header); undefined when blank. */
export function keyFor(provider: ProviderId, keys: ProviderKeys): string | undefined {
  const key = keys[provider]?.trim() ?? '';
  return key === '' ? undefined : key;
}

/** What a role still lacks: a key it requires, a model id (Custom), or a server address. */
export type Missing = 'key' | 'model' | 'server';

/**
 * What stops a role from sending. Custom needs no key but needs a model and an address;
 * Ollama never needs a key (R03.20).
 */
export function missingFor(
  role: Pick<RoleTarget, 'provider' | 'model' | 'baseUrl'>,
  keys: ProviderKeys,
): readonly Missing[] {
  const missing: Missing[] = [];
  if (PROVIDERS[role.provider].key === 'required' && keyFor(role.provider, keys) === undefined) {
    missing.push('key');
  }
  if (role.model.trim() === '') missing.push('model');
  if (role.baseUrl === '') missing.push('server');
  return missing;
}

/**
 * The standby that backs a role, or null when there is none to try. Requests with photos are
 * backed by the photo standby, requests without by the text standby. A standby may run only when
 * it is switched on, has everything it needs (`missingFor`), and is not the very role it backs:
 * the same provider with another model, or the same model at another address, is a real backup
 * (R03.5, ACC-E3-2).
 */
export function standbyFor(
  role: RoleTarget,
  settings: AiSettings,
  keys: ProviderKeys,
): RoleTarget | null {
  const name: RoleName = role.route === 'photo' ? 'imageStandby' : 'textStandby';
  const choice = settings[name];
  if (!choice.on) return null;
  const standby = target(settings, role.route, name, choice);
  if (missingFor(standby, keys).length > 0) return null;
  const same =
    standby.provider === role.provider &&
    standby.model.trim() === role.model.trim() &&
    sameServerUrl(standby.baseUrl, role.baseUrl);
  return same ? null : standby;
}

// ---- Retired presets ---------------------------------------------------------------------------

const PICKS = ['primary', 'textRole', 'imageStandby', 'textStandby'] as const;

export interface UpgradedSettings {
  readonly settings: AiSettings;
  /** The marker to store once the settings are saved. */
  readonly version: number;
  /** Whether a pick was renamed, so the record needs saving. */
  readonly changed: boolean;
}

/**
 * Reads a stored record like `decodeAiSettings`, after running the preset upgrades newer than
 * `doneVersion` (the data layer's marker) over all four picks, each by its own provider
 * (R03.28). The renames run on the stored ids first: once decoded, a retired preset would already
 * have become the provider's default instead of its replacement.
 */
export function upgradeAiSettings(
  raw: unknown,
  doneVersion: number,
  steps: readonly PresetUpgradeStep[] = PRESET_UPGRADES,
): UpgradedSettings {
  const fields = fieldsOf(raw);
  const stored: Record<string, ModelChoice> = {};
  for (const name of PICKS) {
    const provider = fieldsOf(fields?.[name])?.provider;
    const model = fieldsOf(fields?.[name])?.model;
    if (isProviderId(provider) && typeof model === 'string') stored[name] = { provider, model };
  }
  const { choices, version } = upgradeChoices(stored, doneVersion, steps);
  const renamed = PICKS.filter((name) => choices[name] !== stored[name]);
  if (fields === undefined || renamed.length === 0) {
    return { settings: decodeAiSettings(raw), version, changed: false };
  }
  const upgraded: Record<string, unknown> = { ...fields };
  for (const name of renamed) upgraded[name] = { ...fieldsOf(fields[name]), ...choices[name] };
  return { settings: decodeAiSettings(upgraded), version, changed: true };
}
