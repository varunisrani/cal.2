/**
 * The AI settings (spec 03 §3.3–3.4) as one typed record, `ai.settings` (17 §1.3), with the rules
 * read from it: which provider answers a request (its role), whether the role's standby may be
 * tried, and which server address each one uses. Pure: storage, keys at rest and the network live
 * elsewhere (P02, P03-05, P03-17).
 */
import {
  PRESET_UPGRADES,
  defaultModel,
  imagePickerProviders,
  readUpgradeMarker,
  resolveModel,
  textPickerProviders,
  upgradeVersion,
  upgradedModel,
  type ModelUse,
  type PresetUpgradeStep,
} from './catalog/presets';
import { isProviderId, providerById, type ProviderId } from './catalog/providers';
import { checkServerUrl, normaliseBaseUrl, sameServer } from './endpoint';

/** OpenRouter's reasoning effort; `auto` sends none and lets the model decide. */
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

export function isOpenRouterEffort(value: unknown): value is OpenRouterEffort {
  return (OPENROUTER_EFFORTS as readonly unknown[]).includes(value);
}

export interface ModelChoice {
  readonly provider: ProviderId;
  readonly model: string;
}

/** A role that can be switched off: the text role and the two standbys. */
export interface SwitchedChoice extends ModelChoice {
  readonly on: boolean;
}

/**
 * Addresses typed for a provider that runs on the person's own server (Ollama, Custom): `main`
 * serves the primary and the text role, `standby` both standbys, so the same provider can be
 * reached on two servers at once (R03.5). A missing slot means the provider's default address.
 */
export interface ServerSlots {
  readonly main?: string;
  readonly standby?: string;
}

export type ServerSlot = keyof ServerSlots;

export interface AiSettings {
  /** Answers every request with photos, and text requests while the text role is off. */
  readonly primary: ModelChoice;
  /** "Different model for text": answers requests without photos while on. */
  readonly textRole: SwitchedChoice;
  /** Tried once when a request with photos fails. */
  readonly imageStandby: SwitchedChoice;
  /** Tried once when a request without photos fails, whichever role served it. */
  readonly textStandby: SwitchedChoice;
  readonly endpoints: Readonly<Partial<Record<ProviderId, ServerSlots>>>;
  /** Notes for the AI, sent with every request (D-16.24); empty when off. */
  readonly instructions: string;
  /** The answer length limit in tokens, sent with every request (D-16.65). */
  readonly maxTokens: number;
  /** "Give up after": the deadline of one action in seconds (D-16.23). */
  readonly timeoutSec: number;
  readonly openRouterEffort: OpenRouterEffort;
}

export const TIMEOUT_SEC = { min: 30, max: 600, initial: 180 } as const;
export const DEFAULT_MAX_TOKENS = 1024;

/** The roles and the model list each one picks from. */
const ROLE_USE = {
  primary: 'image',
  textRole: 'text',
  imageStandby: 'image',
  textStandby: 'text',
} as const satisfies Record<string, ModelUse>;

function switchedOff(use: ModelUse): SwitchedChoice {
  return { on: false, provider: 'gemini', model: defaultModel('gemini', use) };
}

export const DEFAULT_AI_SETTINGS: AiSettings = {
  primary: { provider: 'gemini', model: defaultModel('gemini', 'image') },
  textRole: switchedOff(ROLE_USE.textRole),
  imageStandby: switchedOff(ROLE_USE.imageStandby),
  textStandby: switchedOff(ROLE_USE.textStandby),
  endpoints: {},
  instructions: '',
  maxTokens: DEFAULT_MAX_TOKENS,
  timeoutSec: TIMEOUT_SEC.initial,
  openRouterEffort: 'auto',
};

/** Seconds as a whole number within 30–600; anything not finite reads as 180. */
export function clampTimeoutSec(seconds: number): number {
  if (!Number.isFinite(seconds)) return TIMEOUT_SEC.initial;
  return Math.min(TIMEOUT_SEC.max, Math.max(TIMEOUT_SEC.min, Math.round(seconds)));
}

/** Tokens as a whole number of at least 1 (no upper limit); anything not finite reads as 1 024. */
export function clampMaxTokens(tokens: number): number {
  if (!Number.isFinite(tokens)) return DEFAULT_MAX_TOKENS;
  return Math.min(Number.MAX_SAFE_INTEGER, Math.max(1, Math.round(tokens)));
}

// ---------------------------------------------------------------------------------------------
// Reading a stored record

/** A model id as saved, before it is checked against the lists (preset upgrades hook in here). */
type SavedModel = (provider: ProviderId, model: string) => string;

const asSaved: SavedModel = (_provider, model) => model;

/**
 * The settings in a stored value. Never throws: a missing or malformed field reads as its
 * default, unknown fields are dropped, a model id the provider does not offer reads as its
 * default model, and a text role or standby whose provider is unknown (or cannot see photos, for
 * the image standby) reads as switched off.
 */
export function decodeAiSettings(raw: unknown): AiSettings {
  return decode(raw, asSaved);
}

/**
 * `decodeAiSettings` after the preset retirements newer than the stored marker
 * (`meta.presetUpgradeVersion`) have renamed the saved models (R03.28). Store both results: the
 * new marker keeps a later choice of an old id from being renamed again.
 */
export function loadAiSettings(
  raw: unknown,
  upgradeMarker: unknown,
  steps: readonly PresetUpgradeStep[] = PRESET_UPGRADES,
): { readonly settings: AiSettings; readonly upgradeMarker: number } {
  const done = readUpgradeMarker(upgradeMarker);
  const settings = decode(raw, (provider, model) => upgradedModel(provider, model, done, steps));
  return { settings, upgradeMarker: upgradeVersion(done, steps) };
}

function decode(raw: unknown, saved: SavedModel): AiSettings {
  const stored = isRecord(raw) ? raw : {};
  const fallback = DEFAULT_AI_SETTINGS;
  return {
    primary: readChoice(stored.primary, ROLE_USE.primary, saved) ?? fallback.primary,
    textRole: readSwitched(stored.textRole, ROLE_USE.textRole, saved),
    imageStandby: readSwitched(stored.imageStandby, ROLE_USE.imageStandby, saved),
    textStandby: readSwitched(stored.textStandby, ROLE_USE.textStandby, saved),
    endpoints: readEndpoints(stored.endpoints),
    instructions: typeof stored.instructions === 'string' ? stored.instructions.trim() : '',
    maxTokens:
      typeof stored.maxTokens === 'number' ? clampMaxTokens(stored.maxTokens) : fallback.maxTokens,
    timeoutSec:
      typeof stored.timeoutSec === 'number'
        ? clampTimeoutSec(stored.timeoutSec)
        : fallback.timeoutSec,
    openRouterEffort: isOpenRouterEffort(stored.openRouterEffort)
      ? stored.openRouterEffort
      : fallback.openRouterEffort,
  };
}

function offeredFor(use: ModelUse): readonly ProviderId[] {
  return use === 'image' ? imagePickerProviders() : textPickerProviders();
}

function readChoice(raw: unknown, use: ModelUse, saved: SavedModel): ModelChoice | undefined {
  if (!isRecord(raw)) return undefined;
  const { provider, model } = raw;
  if (!isProviderId(provider) || !offeredFor(use).includes(provider)) return undefined;
  const named = typeof model === 'string' ? saved(provider, model) : model;
  return { provider, model: resolveModel(provider, named, use) };
}

function readSwitched(raw: unknown, use: ModelUse, saved: SavedModel): SwitchedChoice {
  const choice = readChoice(raw, use, saved);
  if (choice === undefined || !isRecord(raw)) return switchedOff(use);
  return { on: raw.on === true, ...choice };
}

/** Only providers on the person's own server keep addresses, and only addresses that pass. */
function readEndpoints(raw: unknown): Partial<Record<ProviderId, ServerSlots>> {
  const endpoints: Partial<Record<ProviderId, ServerSlots>> = {};
  if (!isRecord(raw)) return endpoints;
  for (const [id, slots] of Object.entries(raw)) {
    if (!isProviderId(id) || providerById(id).endpoint !== 'userServer' || !isRecord(slots)) {
      continue;
    }
    const main = readAddress(slots.main, id);
    const standby = readAddress(slots.standby, id);
    if (main === undefined && standby === undefined) continue;
    endpoints[id] = {
      ...(main === undefined ? {} : { main }),
      ...(standby === undefined ? {} : { standby }),
    };
  }
  return endpoints;
}

function readAddress(value: unknown, provider: ProviderId): string | undefined {
  if (typeof value !== 'string') return undefined;
  const check = checkServerUrl(value, provider);
  return check.ok ? check.url : undefined;
}

// ---------------------------------------------------------------------------------------------
// Roles and standbys

/** Where one request goes: a provider, the model it runs and the address it is sent to. */
export interface Target {
  readonly provider: ProviderId;
  readonly model: string;
  readonly baseUrl: string;
}

export type StandbySlot = 'imageStandby' | 'textStandby';

/** The role that answers a request, and the standby that backs it. */
export interface Role extends Target {
  readonly source: 'primary' | 'textRole';
  readonly standby: StandbySlot;
}

export interface Standby extends Target {
  readonly slot: StandbySlot;
}

/** Saved API keys by provider, as read from the secrets store (P02-12). */
export type KeyRing = Readonly<Partial<Record<ProviderId, string>>>;

/**
 * The address a provider is called at in a slot: a vendor's own address for cloud providers;
 * for Ollama and Custom the slot's typed address, else the provider's default (none for Custom).
 */
export function serverUrlFor(settings: AiSettings, provider: ProviderId, slot: ServerSlot): string {
  const entry = providerById(provider);
  if (entry.endpoint === 'fixed') return entry.baseUrl;
  const typed = normaliseBaseUrl(settings.endpoints[provider]?.[slot] ?? '');
  return typed === '' ? entry.baseUrl : typed;
}

function targetOf(
  settings: AiSettings,
  choice: ModelChoice,
  use: ModelUse,
  slot: ServerSlot,
): Target {
  return {
    provider: choice.provider,
    model: resolveModel(choice.provider, choice.model, use),
    baseUrl: serverUrlFor(settings, choice.provider, slot),
  };
}

/**
 * Who answers a request: the primary whenever it carries photos, the text role for a request
 * without photos while that role is on, else the primary again. The image standby backs requests
 * with photos; the text standby backs every request without them.
 */
export function roleFor(
  settings: AiSettings,
  request: { readonly images?: readonly unknown[] },
): Role {
  const withImages = (request.images?.length ?? 0) > 0;
  if (!withImages && settings.textRole.on) {
    return {
      source: 'textRole',
      standby: 'textStandby',
      ...targetOf(settings, settings.textRole, ROLE_USE.textRole, 'main'),
    };
  }
  return {
    source: 'primary',
    standby: withImages ? 'imageStandby' : 'textStandby',
    ...targetOf(settings, settings.primary, ROLE_USE.primary, 'main'),
  };
}

/**
 * The key to send to a provider: the saved one trimmed (a pasted newline would break the header,
 * R03.20), or nothing when none is saved or the provider takes none (Ollama).
 */
export function keyFor(provider: ProviderId, keys: KeyRing): string | undefined {
  if (providerById(provider).key === 'none') return undefined;
  const key = keys[provider]?.trim() ?? '';
  return key === '' ? undefined : key;
}

/** What keeps a target from being called: no address (Custom), no model (Custom), no key. */
export type TargetProblem = 'noServer' | 'noModel' | 'noKey';

/** The first thing that keeps `target` from being called, or `undefined` when it is complete. */
export function targetProblem(target: Target, keys: KeyRing): TargetProblem | undefined {
  if (target.baseUrl.trim() === '') return 'noServer';
  if (target.model.trim() === '') return 'noModel';
  const needsKey = providerById(target.provider).key === 'required';
  return needsKey && keyFor(target.provider, keys) === undefined ? 'noKey' : undefined;
}

/**
 * Why a role's standby may not be tried: switched off, unable to see photos (image standby),
 * incomplete, or the very provider, model and address of the role it backs (R03.5).
 */
export type StandbyProblem = 'off' | 'noVision' | TargetProblem | 'sameAsRole';

export function standbyProblem(
  role: Role,
  settings: AiSettings,
  keys: KeyRing,
): StandbyProblem | undefined {
  return checkStandby(role, settings, keys).problem;
}

/** The standby to try once when `role` fails, or `null` when there is none to try. */
export function standbyFor(role: Role, settings: AiSettings, keys: KeyRing): Standby | null {
  const { problem, target } = checkStandby(role, settings, keys);
  return problem === undefined ? { slot: role.standby, ...target } : null;
}

function checkStandby(
  role: Role,
  settings: AiSettings,
  keys: KeyRing,
): { readonly problem: StandbyProblem | undefined; readonly target: Target } {
  const slot = role.standby;
  const choice = settings[slot];
  const target = targetOf(settings, choice, ROLE_USE[slot], 'standby');
  if (!choice.on) return { problem: 'off', target };
  if (slot === 'imageStandby' && !providerById(choice.provider).vision) {
    return { problem: 'noVision', target };
  }
  const problem =
    targetProblem(target, keys) ?? (sameTarget(target, role) ? 'sameAsRole' : undefined);
  return { problem, target };
}

function sameTarget(a: Target, b: Target): boolean {
  return a.provider === b.provider && a.model === b.model && sameServer(a.baseUrl, b.baseUrl);
}

/** A plain stored object (an array or null is not a record of fields). */
function isRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || Array.isArray(value)) return false;
  return typeof value === 'object';
}
