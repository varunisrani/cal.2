// AI setup: saving the person's AI choice (the primary role) where the rest of the app reads it.
// The provider, model and server address go into the `ai.settings` row (read through
// `decodeAiSettings`); the key goes into the provider's slot of the secrets table, trimmed and
// sealed (D-16.7). The onboarding step (P05-04) and the AI settings page (P09) both save here, so
// Building plan, food analysis and the Coach read the same settings and the same key.

import { PROVIDERS, isProviderId, type ProviderId } from '../ai/catalog/providers';
import { checkServerUrl, type UrlProblem } from '../ai/endpoint';
import {
  DEFAULT_AI_SETTINGS,
  effectiveBaseUrl,
  missingFor,
  type AiSettings,
  type Missing,
} from '../ai/settings';
import { mask, type SecretsRepo } from '../data/repos/secretsRepo';
import type { SettingsRepo } from '../data/repos/settingsRepo';

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

export interface AiSetupService {
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

function maskOf(key: string | null): string | null {
  return key === null ? null : mask(key);
}

/** The settings with `choice` as the primary; Ollama and Custom also keep its main address. */
function withPrimary(
  settings: AiSettings,
  provider: ProviderId,
  model: string,
  server: string,
): AiSettings {
  if (PROVIDERS[provider].endpoint !== 'userServer') {
    return { ...settings, primary: { provider, model } };
  }
  const standby = settings.endpoints[provider]?.standby ?? '';
  return {
    ...settings,
    primary: { provider, model },
    endpoints: { ...settings.endpoints, [provider]: { main: server, standby } },
  };
}

export function createAiSetupService(deps: AiSetupServiceDeps): AiSetupService {
  const { settingsRepo, secretsRepo } = deps;

  return {
    async saveChoice(choice) {
      const entry = PROVIDERS[choice.provider];
      if (!entry.vision) throw new TypeError(`${choice.provider} cannot read photos`);
      let server = '';
      if (entry.endpoint === 'userServer') {
        const checked = checkServerUrl(choice.serverUrl, choice.provider);
        if (!checked.ok) throw new ServerUrlRefusedError(checked.error);
        server = checked.value.url;
      }
      // The key first: anyone who reads the new settings then also finds their key.
      const key = choice.key.trim();
      if (key !== '' && entry.key !== 'none') await secretsRepo.set(choice.provider, key);
      const stored =
        (await settingsRepo.update('ai.settings', (current) =>
          withPrimary(current ?? DEFAULT_AI_SETTINGS, choice.provider, choice.model.trim(), server),
        )) ?? DEFAULT_AI_SETTINGS;
      const { provider, model } = stored.primary;
      const saved = await secretsRepo.get(provider);
      const missing = missingFor(
        { provider, model, baseUrl: effectiveBaseUrl(stored, provider, 'main') },
        saved === null ? {} : { [provider]: saved },
      );
      return { keyMask: maskOf(saved), missing };
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
