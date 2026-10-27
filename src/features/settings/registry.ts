// The Settings categories: one record per category page, in the order the hub lists them. A later
// phase registers its pages by adding records to SETTINGS_CATEGORIES (one task per phase owns that
// edit: P05-10, P07-06, P09-01); the hub and the router need no change. A page is named through
// `onDemand(() => import(...))`, never imported here, so it stays out of the start-up download.

import type { ComponentType } from 'react';
import { onDemand } from '../../app/onDemand';
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
  /**
   * The page's content, drawn under the back link and the title. Registered pages are fetched on
   * first open (`onDemand`), so the hub never downloads them.
   */
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

/** Every category, in hub order. */
export const SETTINGS_CATEGORIES: readonly SettingsCategory[] = defineCategories([
  // Body data, the goal and allergens (P05-10); the goal-reached dialog links here.
  {
    id: 'profile',
    titleKey: 'profile.title',
    icon: 'heart',
    group: 'prefs',
    page: onDemand(() => import('./profile/ProfilePage').then((module) => module.ProfilePage)),
  },
  // Targets and locks, the rebuild, the weekly tune-up, nutrient goals and alerts (P05-11).
  {
    id: 'goals',
    titleKey: 'goals.page.title',
    icon: 'chart',
    group: 'prefs',
    page: onDemand(() => import('./goals/GoalsPage').then((module) => module.GoalsPage)),
  },
  // Water and fasting tracking (P07-06, P07-07); meal times and reminders join in P09.
  {
    id: 'tracking',
    titleKey: 'trackers.page.title',
    icon: 'clock',
    group: 'prefs',
    page: onDemand(() => import('./tracking/TrackingPage').then((module) => module.TrackingPage)),
  },
  // The AI providers and standbys, the request limits, notes and the food-database key (P09-07).
  {
    id: 'ai',
    titleKey: 'aiSetup.page.title',
    icon: 'chat',
    group: 'prefs',
    page: onDemand(() => import('./ai/AiPage').then((module) => module.AiPage)),
  },
  // Look, grams first, week start and units, with links to the pages below it (P09-02).
  {
    id: 'app',
    titleKey: 'appSettings.title',
    icon: 'gear',
    group: 'prefs',
    page: onDemand(() => import('./app/AppPage').then((module) => module.AppPage)),
  },
  // Opened from App settings: the groups and methods of the + menu (P09-05).
  {
    id: 'menu',
    titleKey: 'settings.menuEditor.title',
    icon: 'plus',
    group: 'prefs',
    page: onDemand(() => import('./app/MenuEditorPage').then((module) => module.MenuEditorPage)),
  },
  // Opened from App settings: what the product block of a review shows (P09-06).
  {
    id: 'product-fields',
    titleKey: 'appSettings.product.title',
    icon: 'barcode',
    group: 'prefs',
    page: onDemand(() =>
      import('./app/ProductFieldsPage').then((module) => module.ProductFieldsPage),
    ),
  },
  // Opened from App settings: hide Progress or Coach (P09-04).
  {
    id: 'tab-bar',
    titleKey: 'appSettings.tabBar.title',
    icon: 'sort',
    group: 'prefs',
    page: onDemand(() => import('./app/TabsPage').then((module) => module.TabsPage)),
  },
  // How the plan is worked out (P05-13); Plan ready opens the same page in a sheet.
  {
    id: 'methods',
    titleKey: 'about.methods.title',
    icon: 'info',
    group: 'info',
    page: onDemand(() => import('../about/MethodsPage').then((module) => module.MethodsPage)),
  },
]);

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
