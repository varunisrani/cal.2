// The rules behind the provider form: which providers a role may pick, what picking one resets,
// and whether a choice is complete. The form shows the result; the onboarding step and the AI
// settings page decide from it when to save. All the checks are the AI layer's own (`missingFor`,
// `checkServerUrl`), so the form can never accept what a request would refuse.

import { defaultModel, type ModelUse } from '../../ai/catalog/presets';
import {
  PROVIDERS,
  imageProviders,
  textProviders,
  type Provider,
  type ProviderId,
} from '../../ai/catalog/providers';
import { checkServerUrl, type UrlHint, type UrlProblem } from '../../ai/endpoint';
import { effectiveBaseUrl, missingFor, type AiSettings, type Missing } from '../../ai/settings';
import type { AiChoice } from '../../services/aiSetup';

/** Server addresses saved per provider (the main slot of Ollama and Custom). */
export type SavedServers = Readonly<Partial<Record<ProviderId, string>>>;

/** The providers a role may pick, in picker order: vendors' clouds, then servers people run. */
export function providerGroups(use: ModelUse): {
  readonly cloud: readonly Provider[];
  readonly ownServer: readonly Provider[];
} {
  const all = use === 'image' ? imageProviders() : textProviders();
  return {
    cloud: all.filter((entry) => entry.endpoint === 'fixed'),
    ownServer: all.filter((entry) => entry.endpoint === 'userServer'),
  };
}

/** The address a provider starts from in the form: the saved one, else its default. */
function startingServer(provider: ProviderId, servers: SavedServers): string {
  if (PROVIDERS[provider].endpoint !== 'userServer') return '';
  const saved = servers[provider] ?? '';
  return saved === '' ? PROVIDERS[provider].baseUrl : saved;
}

/** The main-slot addresses of saved settings. */
export function savedServersOf(settings: AiSettings): SavedServers {
  const servers: Partial<Record<ProviderId, string>> = {};
  for (const [id, slots] of Object.entries(settings.endpoints)) {
    if (slots && slots.main !== '') servers[id as ProviderId] = slots.main;
  }
  return servers;
}

/** The primary role of saved settings as the form holds it, with no key typed. */
export function primaryChoice(settings: AiSettings): AiChoice {
  const { provider, model } = settings.primary;
  const own = PROVIDERS[provider].endpoint === 'userServer';
  return {
    provider,
    model,
    serverUrl: own ? effectiveBaseUrl(settings, provider, 'main') : '',
    key: '',
  };
}

/**
 * The choice after picking `provider`: its default model (03 §3.3), the address saved for it or
 * its default, and no key typed (its saved key, if any, still counts).
 */
export function withProvider(
  provider: ProviderId,
  use: ModelUse,
  servers: SavedServers = {},
): AiChoice {
  return {
    provider,
    model: defaultModel(provider, use),
    serverUrl: startingServer(provider, servers),
    key: '',
  };
}

export interface ChoiceCheck {
  /** What the role still lacks (`missingFor`): a required key, a model id, a server address. */
  readonly missing: readonly Missing[];
  /** Why the typed server address cannot be saved; null when it can or none is needed. */
  readonly urlProblem: UrlProblem | null;
  /** Advice on an accepted address (Ollama without `/v1`). */
  readonly urlHint: UrlHint | null;
  /** Nothing missing: the choice can be saved and requests can be sent. */
  readonly ready: boolean;
}

/**
 * Whether a choice is complete. A key counts when one is typed or one is saved
 * (`savedKeyMask` not null); Ollama never needs one and Custom only if its server asks (R03.20).
 * Ollama and Custom need an address `checkServerUrl` accepts: plain http only for this device
 * (D-16.26). Custom needs a model id.
 */
export function checkChoice(choice: AiChoice, savedKeyMask: string | null): ChoiceCheck {
  const entry = PROVIDERS[choice.provider];
  let baseUrl = entry.baseUrl;
  let urlProblem: UrlProblem | null = null;
  let urlHint: UrlHint | null = null;
  if (entry.endpoint === 'userServer') {
    const checked = checkServerUrl(choice.serverUrl, choice.provider);
    baseUrl = checked.ok ? checked.value.url : '';
    urlProblem = checked.ok ? null : checked.error;
    urlHint = checked.ok ? (checked.value.hint ?? null) : null;
  }
  // `missingFor` only asks whether a key is there; the mask stands in for the saved key.
  const key = choice.key.trim() === '' ? (savedKeyMask ?? '') : choice.key;
  const missing = missingFor(
    { provider: choice.provider, model: choice.model, baseUrl },
    { [choice.provider]: key },
  );
  return { missing, urlProblem, urlHint, ready: missing.length === 0 };
}
