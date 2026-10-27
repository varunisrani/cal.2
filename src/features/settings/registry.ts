// The Settings categories: one record per category page, in the hub's order. A later
// phase registers its pages by adding records to SETTINGS_CATEGORIES (one task per phase owns that
// edit: P05-10, P07-06, P09-01); the hub and the router need no change. A page is named through
// `onDemand(() => import(...))`, never imported here, so it stays out of the start-up download.
// The hub's own order is HUB_ORDER, so a page registered later lands in its slot wherever it is
// added; the hub's two link rows (help, privacy) are SETTINGS_LINKS.

import type { ComponentType } from 'react';
import { onDemand } from '../../app/onDemand';
import { tabRoute, type TabRoute } from '../../app/router';
import { LINKS } from '../../config/links';
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
  /**
   * The id of the page this one is opened from (App settings for its sub-pages). A sub-page is not
   * listed on the hub, and its back link carries the parent's title and goes back to it.
   */
  readonly parent?: string;
  /**
   * Whether the page waits for the stored settings: until they are read a spinner stands in its
   * place, so no switch ever shows a default in place of a stored value (R06.22). On unless set to
   * `false`, which only a page that shows no stored setting does.
   */
  readonly waitForSettings?: boolean;
}

/** A category as written in the registry; its route follows from its id. */
export type CategorySpec = Omit<SettingsCategory, 'route'>;

const PAGE_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * The registry's records in the order given, each with its route. Throws for an id that is not a
 * page segment or that two categories share, and for a parent that is not a registered page listed
 * on the hub: a mistake in the registry, not a runtime state.
 */
export function defineCategories(specs: readonly CategorySpec[]): readonly SettingsCategory[] {
  const seen = new Set<string>();
  const categories = specs.map((spec) => {
    if (!PAGE_ID.test(spec.id)) throw new Error(`Settings category id "${spec.id}" is not a page`);
    if (seen.has(spec.id)) throw new Error(`Settings category "${spec.id}" is registered twice`);
    seen.add(spec.id);
    return { ...spec, route: tabRoute('settings', spec.id) };
  });
  for (const { id, parent } of categories) {
    if (parent === undefined) continue;
    const found = categories.find((category) => category.id === parent);
    if (!found || found.id === id || found.parent !== undefined) {
      throw new Error(`Settings category "${id}" names "${parent}", which is not a hub page`);
    }
  }
  return categories;
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
    parent: 'app',
    page: onDemand(() => import('./app/MenuEditorPage').then((module) => module.MenuEditorPage)),
  },
  // Opened from App settings: what the product block of a review shows (P09-06).
  {
    id: 'product-fields',
    titleKey: 'appSettings.product.title',
    icon: 'barcode',
    group: 'prefs',
    parent: 'app',
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
    parent: 'app',
    page: onDemand(() => import('./app/TabsPage').then((module) => module.TabsPage)),
  },
  // Your data (P09-15) registers as `data`; HUB_ORDER puts each entry in its slot wherever it is added.
  // The mark, version, update status, sharing, help links and the pages below (P09-16).
  {
    id: 'about',
    titleKey: 'about.page.title',
    icon: 'info',
    group: 'info',
    page: onDemand(() => import('../about/AboutPage').then((module) => module.AboutPage)),
    // It shows no stored setting, so it opens without waiting for them.
    waitForSettings: false,
  },
  // Opened from About: third-party licences and the credit to the app that inspired us (P09-16).
  {
    id: 'credits',
    titleKey: 'about.credits.title',
    icon: 'text',
    group: 'info',
    page: onDemand(() => import('../about/CreditsPage').then((module) => module.CreditsPage)),
    parent: 'about',
    waitForSettings: false,
  },
  // How the plan is worked out (P05-13); Plan ready opens the same page in a sheet. It shows no
  // stored setting, so it opens without waiting for them.
  {
    id: 'methods',
    titleKey: 'about.methods.title',
    icon: 'info',
    group: 'info',
    waitForSettings: false,
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

/** A hub row that opens an address outside the app in a new tab (D-16.66). */
export interface SettingsLink {
  readonly id: string;
  readonly titleKey: TxKey;
  readonly icon: IconName;
  readonly group: SettingsGroup;
  /** Where the row goes; `null` until the address is supplied, which leaves the row out. */
  readonly href: string | null;
}

/** The hub's link rows; their addresses are Platewise's own (`src/config/links.ts`). */
export const SETTINGS_LINKS: readonly SettingsLink[] = [
  { id: 'help', titleKey: 'settings.links.help', icon: 'pencil', group: 'info', href: LINKS.help },
  {
    id: 'privacy',
    titleKey: 'settings.links.privacy',
    icon: 'lock',
    group: 'info',
    href: LINKS.privacy,
  },
];

/**
 * The hub's rows in order (06 §3.1, D-16.66): Personal info, Goals & nutrition, Tracking &
 * reminders, AI providers, App settings, Your data; then About Platewise, Help & feedback, Privacy
 * & terms. A row whose id is missing here follows these, in registry order.
 */
export const HUB_ORDER: readonly string[] = [
  'profile',
  'goals',
  'tracking',
  'ai',
  'app',
  'data',
  'about',
  'help',
  'privacy',
];

/** The row that carries the update dot while a new version waits (P09-17). */
export const UPDATE_ROW = 'about';

/** One row of the hub: a page of the app or a link out of it. */
export type HubRow =
  | { readonly kind: 'page'; readonly category: SettingsCategory }
  | { readonly kind: 'link'; readonly link: SettingsLink & { readonly href: string } };

function rowId(row: HubRow): string {
  return row.kind === 'page' ? row.category.id : row.link.id;
}

function rowGroup(row: HubRow): SettingsGroup {
  return row.kind === 'page' ? row.category.group : row.link.group;
}

/**
 * The hub's cards: the pages that have no parent and the links that have an address, by group in
 * group order, each group in HUB_ORDER (rows it does not name after, pages then links, in the
 * order given). Groups with no row are left out.
 */
export function hubGroups(
  categories: readonly SettingsCategory[],
  links: readonly SettingsLink[] = [],
): { readonly group: SettingsGroup; readonly rows: readonly HubRow[] }[] {
  const rows: HubRow[] = [
    ...categories
      .filter((category) => category.parent === undefined)
      .map((category): HubRow => ({ kind: 'page', category })),
    ...links.flatMap((link): HubRow[] =>
      link.href === null ? [] : [{ kind: 'link', link: { ...link, href: link.href } }],
    ),
  ];
  const rank = (row: HubRow): number => {
    const at = HUB_ORDER.indexOf(rowId(row));
    return at < 0 ? HUB_ORDER.length : at;
  };
  // A stable sort: rows of equal rank keep the order given.
  const ordered = [...rows].sort((a, b) => rank(a) - rank(b));
  return SETTINGS_GROUPS.map((group) => ({
    group,
    rows: ordered.filter((row) => rowGroup(row) === group),
  })).filter((entry) => entry.rows.length > 0);
}
