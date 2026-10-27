// The rules behind the AI settings page's role cards (03 §3.3–3.4): what each role shows when the
// page opens, which role a standby backs, when a standby would only repeat that role, and which
// rows the page adds for OpenRouter. The checks are the AI layer's own (`effectiveBaseUrl`,
// `sameServerUrl`), so the page never offers what a request would skip.

import { presetsFor, type ModelUse } from '../../../ai/catalog/presets';
import { PROVIDERS, type ProviderId } from '../../../ai/catalog/providers';
import { normaliseBaseUrl, sameServerUrl } from '../../../ai/endpoint';
import {
  effectiveBaseUrl,
  type AiSettings,
  type EndpointSlot,
  type RoleName,
} from '../../../ai/settings';
import type { AiChoice, SwitchableRole } from '../../../services/aiSetup';
import type { SavedServers } from '../../ai-setup/choice';

/** The two standbys. */
export type StandbyRole = 'imageStandby' | 'textStandby';

/** The roles in page order. */
export const ROLES: readonly RoleName[] = ['primary', 'textRole', 'imageStandby', 'textStandby'];

/** The roles with a switch, in page order. */
export const SWITCHABLE_ROLES: readonly SwitchableRole[] = [
  'textRole',
  'imageStandby',
  'textStandby',
];

/** Which requests a role serves: the photo roles list only providers that read photos. */
export function roleUse(role: RoleName): ModelUse {
  return role === 'primary' || role === 'imageStandby' ? 'image' : 'text';
}

/** The address slot a role uses: the main one for the primary and the text model. */
export function roleSlot(role: RoleName): EndpointSlot {
  return role === 'imageStandby' || role === 'textStandby' ? 'standby' : 'main';
}

export function isStandby(role: RoleName): role is StandbyRole {
  return role === 'imageStandby' || role === 'textStandby';
}

/** A role of saved settings as its card's form holds it, with no key typed. */
export function roleChoice(settings: AiSettings, role: RoleName): AiChoice {
  const { provider, model } = settings[role];
  const own = PROVIDERS[provider].endpoint === 'userServer';
  return {
    provider,
    model,
    serverUrl: own ? effectiveBaseUrl(settings, provider, roleSlot(role)) : '',
    key: '',
  };
}

/** The addresses saved in a role's slot, where a provider switch in its card starts from. */
export function serversFor(settings: AiSettings, role: RoleName): SavedServers {
  const slot = roleSlot(role);
  const servers: Partial<Record<ProviderId, string>> = {};
  for (const [id, slots] of Object.entries(settings.endpoints)) {
    if (slots && slots[slot] !== '') servers[id as ProviderId] = slots[slot];
  }
  return servers;
}

/** The role a standby backs, as requests reach it: provider, model and address. */
export interface BackedRole {
  readonly provider: ProviderId;
  readonly model: string;
  readonly baseUrl: string;
}

/**
 * The role a standby backs: the photo standby backs the primary; the text standby backs the text
 * model when it is on, else the primary (03 §3.3).
 */
export function backedRole(settings: AiSettings, standby: StandbyRole): BackedRole {
  const role: RoleName = standby === 'textStandby' && settings.textRole.on ? 'textRole' : 'primary';
  const { provider, model } = settings[role];
  return { provider, model, baseUrl: effectiveBaseUrl(settings, provider, roleSlot(role)) };
}

/** The address a choice sends to: the typed one for Ollama and Custom (their default if blank). */
function choiceServer(choice: AiChoice): string {
  const entry = PROVIDERS[choice.provider];
  if (entry.endpoint !== 'userServer') return entry.baseUrl;
  const typed = normaliseBaseUrl(choice.serverUrl);
  return typed === '' ? entry.baseUrl : typed;
}

/** Whether a choice reaches the same provider at the same server as the role it backs. */
export function sharesServer(choice: AiChoice, backed: BackedRole): boolean {
  return choice.provider === backed.provider && sameServerUrl(choiceServer(choice), backed.baseUrl);
}

/** The model a standby's list leaves out: the backed role's, when provider and server match. */
export function hiddenModel(choice: AiChoice, backed: BackedRole): string | undefined {
  return sharesServer(choice, backed) ? backed.model : undefined;
}

/** A standby that would only repeat the role it backs, so it would never be tried (R03.5). */
export function isDuplicate(choice: AiChoice, backed: BackedRole): boolean {
  return sharesServer(choice, backed) && choice.model.trim() === backed.model.trim();
}

/**
 * A standby choice that does not repeat the role it backs: a duplicate moves to the provider's
 * next preset; one with no other preset stays as it is (its card says so).
 */
export function avoidDuplicate(choice: AiChoice, backed: BackedRole, use: ModelUse): AiChoice {
  if (!isDuplicate(choice, backed)) return choice;
  const other = presetsFor(choice.provider, use).find((model) => model !== backed.model.trim());
  return other === undefined ? choice : { ...choice, model: other };
}

/**
 * Whether OpenRouter fills a role the page shows: the primary, or a role whose switch is on. Its
 * reasoning effort applies to every OpenRouter request, so the row shows while any does.
 */
export function usesOpenRouter(
  choices: Readonly<Record<RoleName, AiChoice>>,
  ons: Readonly<Record<SwitchableRole, boolean>>,
): boolean {
  return ROLES.some(
    (role) =>
      choices[role].provider === 'openrouter' &&
      (role === 'primary' || ons[role as SwitchableRole]),
  );
}

/** A whole number typed in a field: digits only, else null (blank, letters, decimals). */
export function wholeNumber(text: string): number | null {
  const trimmed = text.trim();
  return /^\d+$/.test(trimmed) ? Number(trimmed) : null;
}
