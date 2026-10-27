// AI setup: saving the person's AI choice (the primary role) where the rest of the app reads it.
// The provider, model and server address go into the `ai.settings` row (read through
// `decodeAiSettings`); the key goes into the provider's slot of the secrets table, trimmed and
// sealed (D-16.7). The onboarding step (P05-04) and the AI settings page (P09) both save here, so
// Building plan, food analysis and the Coach read the same settings and the same key. The AI
// settings page (P09-07) also sets the other roles, the limits and the notes here, forgets keys,
// and keeps the food-database key (the `fdc` slot).

import { PROVIDERS, isProviderId, type ProviderId } from '../ai/catalog/providers';
import { checkServerUrl, type UrlProblem } from '../ai/endpoint';
import {
  DEFAULT_AI_SETTINGS,
  effectiveBaseUrl,
  missingFor,
  readMaxTokens,
  readTimeoutSec,
  type AiSettings,
  type EndpointSlot,
  type Missing,
  type OpenRouterEffort,
  type RoleName,
} from '../ai/settings';
import { FDC_SLOT, mask, type SecretsRepo } from '../data/repos/secretsRepo';
import type { SettingsRepo } from '../data/repos/settingsRepo';
import { err, ok, type Result } from '../lib/result';

/** One role's choice as the form holds it. */
export interface AiChoice {
  readonly provider: ProviderId;
  readonly model: string;
  /** The server address as typed (Ollama, Custom); ignored for the vendors' own clouds. */
  readonly serverUrl: string;
  /** A key typed now; blank keeps the key already saved for the provider. */
  readonly key: string;
}

/** What is stored after a save, read back from storage. */
export interface SavedChoice {
  /** The provider's saved key as Settings shows it, or null when none is saved. */
  readonly keyMask: string | null;
  /** What the stored primary still lacks (`missingFor`); empty when AI requests can be sent. */
  readonly missing: readonly Missing[];
}

/** A server address `checkServerUrl` refuses; nothing was saved (D-16.26). */
export class ServerUrlRefusedError extends Error {
  override readonly name = 'ServerUrlRefusedError';
  readonly problem: UrlProblem;

  constructor(problem: UrlProblem) {
    super(`Refused: the server address cannot be saved (${problem})`);
    this.problem = problem;
  }
}

/** The roles a person can switch on and off: the text model and both standbys. */
export type SwitchableRole = Exclude<RoleName, 'primary'>;

/** Why a food-database key cannot be saved: nothing typed, or a character a header cannot carry. */
export type FoodDbKeyProblem = 'empty' | 'unsafe';

/** The AI settings page's writes (P09-07). Each keeps every AI setting it does not name. */
export interface AiSettingsEdits {
  /**
   * Saves one role as `saveChoice` saves the primary: the key first (trimmed; one per provider,
   * shared by every role on it), then provider, model and the address in the role's slot (the
   * main slot for the primary and the text model, the standby slot for both standbys). The
   * role's switch stays as it is. The photo roles (primary, photo standby) take only providers
   * that read photos (`TypeError`); a refused address rejects with `ServerUrlRefusedError`.
   */
  saveRole(role: RoleName, choice: AiChoice): Promise<SavedChoice>;
  /** Switches the text model or a standby on or off, keeping its provider and model. */
  setRoleOn(role: SwitchableRole, on: boolean): Promise<void>;
  /** Stores the time limit in whole seconds within 30–600; resolves with the stored value. */
  setTimeoutSec(seconds: number): Promise<number>;
  /** Stores the answer token limit, whole and at least 1; resolves with the stored value. */
  setMaxTokens(tokens: number): Promise<number>;
  setOpenRouterEffort(effort: OpenRouterEffort): Promise<void>;
  /** Stores the notes for the AI trimmed ('' sends none); resolves with the stored text. */
  setInstructions(text: string): Promise<string>;
  /** Removes a provider's key, so no role on that provider has one any more. */
  forgetKey(provider: ProviderId): Promise<void>;
  /** The FoodData Central key, masked, or null when none is saved. */
  foodDbKeyMask(): Promise<string | null>;
  /**
   * Stores the FoodData Central key trimmed and resolves with its mask; refuses a blank key and
   * one holding a character a request header cannot carry, such as a pasted zero-width space
   * (R02.18), storing nothing.
   */
  saveFoodDbKey(key: string): Promise<Result<string, FoodDbKeyProblem>>;
  forgetFoodDbKey(): Promise<void>;
}

/**
 * The onboarding step's writes, and the settings page's (`AiSettingsEdits`). The page's are
 * optional only until every test's stand-in service carries them; `createAiSetupService` always
 * provides them (`hasSettingsEdits`).
 */
export interface AiSetupService extends Partial<AiSettingsEdits> {
  /**
   * Saves the primary role: the key first (trimmed, in the provider's slot; a blank key keeps the
   * saved one), then provider, model and address in `ai.settings`, keeping every other AI
   * setting. Rejects with `ServerUrlRefusedError` for an address that cannot be saved, and with a
   * `TypeError` for a provider that cannot read photos (the primary serves photo requests).
   */
  saveChoice(choice: AiChoice): Promise<SavedChoice>;
  /** A provider's saved key, masked (first four … last four), or null when none is saved. */
  savedKeyMask(provider: ProviderId): Promise<string | null>;
  /** Records the onboarding terms box (`onboarding.termsAccepted`). */
  setTermsAccepted(accepted: boolean): Promise<void>;
  /**
   * "Set up later" (Proposed D-16.49): stores no provider. `ai.settings` goes back to null and
   * every AI key stored so far is removed, so nothing can be sent until the person sets AI up.
   * The food-database key stays.
   */
  setUpLater(): Promise<void>;
}

export interface AiSetupServiceDeps {
  readonly settingsRepo: Pick<SettingsRepo, 'set' | 'update'>;
  readonly secretsRepo: Pick<SecretsRepo, 'set' | 'get' | 'slots' | 'remove'>;
}

const EDITS: readonly (keyof AiSettingsEdits)[] = [
  'saveRole',
  'setRoleOn',
  'setTimeoutSec',
  'setMaxTokens',
  'setOpenRouterEffort',
  'setInstructions',
  'forgetKey',
  'foodDbKeyMask',
  'saveFoodDbKey',
  'forgetFoodDbKey',
];

/** Whether a service carries the settings page's writes (a test's stand-in may not). */
export function hasSettingsEdits(
  service: AiSetupService,
): service is AiSetupService & AiSettingsEdits {
  return EDITS.every((name) => typeof service[name] === 'function');
}

function maskOf(key: string | null): string | null {
  return key === null ? null : mask(key);
}

/** The roles that serve photo requests, so only providers that read photos may fill them. */
const PHOTO_ROLES: ReadonlySet<RoleName> = new Set<RoleName>(['primary', 'imageStandby']);

/** Which address slot a role uses: the standbys have their own (R03.5). */
function slotOf(role: RoleName): EndpointSlot {
  return role === 'imageStandby' || role === 'textStandby' ? 'standby' : 'main';
}

/**
 * The settings with `role` on `provider` and `model`, its switch unchanged; Ollama and Custom also
 * keep `server` in the role's slot.
 */
function withRole(
  settings: AiSettings,
  role: RoleName,
  provider: ProviderId,
  model: string,
  server: string,
): AiSettings {
  const next: AiSettings =
    role === 'primary'
      ? { ...settings, primary: { provider, model } }
      : { ...settings, [role]: { on: settings[role].on, provider, model } };
  if (PROVIDERS[provider].endpoint !== 'userServer') return next;
  const slots = settings.endpoints[provider] ?? { main: '', standby: '' };
  return {
    ...next,
    endpoints: { ...settings.endpoints, [provider]: { ...slots, [slotOf(role)]: server } },
  };
}

/** Every character of a key a request header can carry: printable ASCII, no spaces (R02.18). */
const HEADER_SAFE = /^[\x21-\x7E]+$/;

export function createAiSetupService(deps: AiSetupServiceDeps): AiSetupService & AiSettingsEdits {
  const { settingsRepo, secretsRepo } = deps;

  /** Changes the AI settings in one read-modify-write; nothing stored yet reads as the defaults. */
  async function change(edit: (settings: AiSettings) => AiSettings): Promise<AiSettings> {
    const stored = await settingsRepo.update('ai.settings', (current) =>
      edit(current ?? DEFAULT_AI_SETTINGS),
    );
    return stored ?? DEFAULT_AI_SETTINGS;
  }

  async function saveRole(role: RoleName, choice: AiChoice): Promise<SavedChoice> {
    const entry = PROVIDERS[choice.provider];
    if (PHOTO_ROLES.has(role) && !entry.vision) {
      throw new TypeError(`${choice.provider} cannot read photos`);
    }
    let server = '';
    if (entry.endpoint === 'userServer') {
      const checked = checkServerUrl(choice.serverUrl, choice.provider);
      if (!checked.ok) throw new ServerUrlRefusedError(checked.error);
      server = checked.value.url;
    }
    // The key first: anyone who reads the new settings then also finds their key.
    const key = choice.key.trim();
    if (key !== '' && entry.key !== 'none') await secretsRepo.set(choice.provider, key);
    const stored = await change((settings) =>
      withRole(settings, role, choice.provider, choice.model.trim(), server),
    );
    const { provider, model } = stored[role];
    const saved = await secretsRepo.get(provider);
    const missing = missingFor(
      { provider, model, baseUrl: effectiveBaseUrl(stored, provider, slotOf(role)) },
      saved === null ? {} : { [provider]: saved },
    );
    return { keyMask: maskOf(saved), missing };
  }

  return {
    saveChoice(choice) {
      return saveRole('primary', choice);
    },

    saveRole,

    async setRoleOn(role, on) {
      await change((settings) => ({ ...settings, [role]: { ...settings[role], on } }));
    },

    async setTimeoutSec(seconds) {
      return (await change((settings) => ({ ...settings, timeoutSec: readTimeoutSec(seconds) })))
        .timeoutSec;
    },

    async setMaxTokens(tokens) {
      return (await change((settings) => ({ ...settings, maxTokens: readMaxTokens(tokens) })))
        .maxTokens;
    },

    async setOpenRouterEffort(effort) {
      await change((settings) => ({ ...settings, openRouterEffort: effort }));
    },

    async setInstructions(text) {
      return (await change((settings) => ({ ...settings, instructions: text.trim() })))
        .instructions;
    },

    async forgetKey(provider) {
      await secretsRepo.remove(provider);
    },

    async foodDbKeyMask() {
      return maskOf(await secretsRepo.get(FDC_SLOT));
    },

    async saveFoodDbKey(key) {
      const trimmed = key.trim();
      if (trimmed === '') return err('empty');
      if (!HEADER_SAFE.test(trimmed)) return err('unsafe');
      await secretsRepo.set(FDC_SLOT, trimmed);
      return ok(mask(trimmed));
    },

    async forgetFoodDbKey() {
      await secretsRepo.remove(FDC_SLOT);
    },

    async savedKeyMask(provider) {
      return maskOf(await secretsRepo.get(provider));
    },

    async setTermsAccepted(accepted) {
      await settingsRepo.set('onboarding.termsAccepted', accepted);
    },

    async setUpLater() {
      await settingsRepo.set('ai.settings', null);
      for (const slot of await secretsRepo.slots()) {
        if (isProviderId(slot)) await secretsRepo.remove(slot);
      }
    },
  };
}
