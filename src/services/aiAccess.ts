// The stored AI setup, read the same way by every service that asks a model: the `ai.settings`
// row (null until set up) and the keys in the secrets table, one slot per provider id.

import { isProviderId } from '../ai/catalog/providers';
import { DEFAULT_AI_SETTINGS, type AiSettings, type ProviderKeys } from '../ai/settings';
import type { SecretsRepo } from '../data/repos/secretsRepo';
import type { SettingsRepo } from '../data/repos/settingsRepo';

export interface StoredAiAccess {
  readonly settings: AiSettings;
  readonly keys: ProviderKeys;
  /** False while the person has not set up an AI ("Set up later", or never asked). */
  readonly configured: boolean;
}

export interface AiAccessDeps {
  readonly settingsRepo: Pick<SettingsRepo, 'get'>;
  readonly secretsRepo: Pick<SecretsRepo, 'get' | 'slots'>;
}

/**
 * Reads the AI setup each time it is called, so a key saved a moment ago is used. A slot whose
 * key cannot be read is left out, which the client reports as a missing key.
 */
export function createAiAccess(deps: AiAccessDeps): () => Promise<StoredAiAccess> {
  return async () => {
    const stored = await deps.settingsRepo.get('ai.settings');
    const keys: Partial<Record<string, string>> = {};
    for (const slot of await deps.secretsRepo.slots()) {
      if (!isProviderId(slot)) continue;
      const key = await deps.secretsRepo.get(slot);
      if (key !== null) keys[slot] = key;
    }
    return {
      settings: stored ?? DEFAULT_AI_SETTINGS,
      keys: keys as ProviderKeys,
      configured: stored !== null,
    };
  };
}
