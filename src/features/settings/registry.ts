// The Settings categories: one record per category page, in the order the hub lists them. A later
// phase registers its pages by adding records to SETTINGS_CATEGORIES (one task per phase owns that
// edit: P05-10, P07-06, P09-01); the hub and the router need no change.

import type { ComponentType } from 'react';
import { tabRoute, type TabRoute } from '../../app/router';
import type { IconName } from '../../ui/icons';
import type { TxKey } from '../home/text';

/** The hub's two cards: the person's preferences, then information about the app. */
export const SETTINGS_GROUPS = ['prefs', 'info'] as const;
export type SettingsGroup = (typeof SETTINGS_GROUPS)[number];

export interface SettingsCategory {
  /** The page's segment in the address, `#/settings/<id>`: lower-case words joined by hyphens. */
  readonly id: string;
  readonly titleKey: TxKey;
  readonly icon: IconName;
  /** Where the hub's row goes. */
  readonly route: TabRoute;
  readonly group: SettingsGroup;
  /** The page's content, drawn under the back link and the title. */
  readonly page: ComponentType;
}

/** A category as written in the registry; its route follows from its id. */
export type CategorySpec = Omit<SettingsCategory, 'route'>;

const PAGE_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * The registry's records in the order given, each with its route. Throws for an id that is not a
 * page segment or that two categories share: a mistake in the registry, not a runtime state.
 */
export function defineCategories(specs: readonly CategorySpec[]): readonly SettingsCategory[] {
  const seen = new Set<string>();
  return specs.map((spec) => {
    if (!PAGE_ID.test(spec.id)) throw new Error(`Settings category id "${spec.id}" is not a page`);
    if (seen.has(spec.id)) throw new Error(`Settings category "${spec.id}" is registered twice`);
    seen.add(spec.id);
    return { ...spec, route: tabRoute('settings', spec.id) };
  });
}

/** Every category, in hub order. Empty until P05-10 registers the first pages. */
export const SETTINGS_CATEGORIES: readonly SettingsCategory[] = defineCategories([]);

/** The category whose page `nested` (the segments under `#/settings`) shows, if any. */
export function categoryFor(
  nested: readonly string[],
  categories: readonly SettingsCategory[] = SETTINGS_CATEGORIES,
): SettingsCategory | undefined {
  const [id] = nested;
  return id === undefined ? undefined : categories.find((category) => category.id === id);
}

/** The categories by group, in group order and registry order inside each; empty groups left out. */
export function groupsOf(
  categories: readonly SettingsCategory[],
): { readonly group: SettingsGroup; readonly categories: readonly SettingsCategory[] }[] {
  return SETTINGS_GROUPS.map((group) => ({
    group,
    categories: categories.filter((category) => category.group === group),
  })).filter((entry) => entry.categories.length > 0);
}
