import { describe, expect, it } from 'vitest';
import { parseHash, routeHash, tabRoute } from '../../app/router';
import {
  categoryFor,
  defineCategories,
  HUB_ORDER,
  hubGroups,
  SETTINGS_CATEGORIES,
  SETTINGS_LINKS,
  type CategorySpec,
  type HubRow,
  type SettingsLink,
} from './registry';

const Blank = () => null;

/** Three made-up categories (titles borrowed from catalogue words that exist). */
const SPECS: readonly CategorySpec[] = [
  { id: 'units', titleKey: 'appearance.accent.basil', icon: 'scale', group: 'prefs', page: Blank },
  {
    id: 'about-app',
    titleKey: 'appearance.accent.saffron',
    icon: 'info',
    group: 'info',
    page: Blank,
  },
  {
    id: 'tab-bar',
    titleKey: 'appearance.accent.lagoon',
    icon: 'gear',
    group: 'prefs',
    page: Blank,
  },
];

describe('defineCategories', () => {
  it('keeps the order given and gives each category its #/settings/<id> route', () => {
    const categories = defineCategories(SPECS);
    expect(categories.map((category) => category.id)).toEqual(['units', 'about-app', 'tab-bar']);
    expect(categories.map((category) => routeHash(category.route))).toEqual([
      '#/settings/units',
      '#/settings/about-app',
      '#/settings/tab-bar',
    ]);
    expect(categories[0]).toMatchObject({ titleKey: 'appearance.accent.basil', icon: 'scale' });
  });

  it('refuses an id registered twice', () => {
    expect(() =>
      defineCategories([...SPECS, { ...SPECS[0], id: 'units' } as CategorySpec]),
    ).toThrow(/registered twice/);
  });

  it('keeps a sub-page with the parent it names', () => {
    const categories = defineCategories([
      ...SPECS,
      { ...(SPECS[0] as CategorySpec), id: 'energy', parent: 'units' },
    ]);
    expect(categories.find((category) => category.id === 'energy')).toMatchObject({
      parent: 'units',
      route: tabRoute('settings', 'energy'),
    });
  });

  it.each<[string, string]>([
    ['a parent that is not registered', 'kitchen'],
    ['itself as parent', 'energy'],
    ['a parent that is a sub-page itself', 'deeper'],
  ])('refuses a sub-page naming %s', (_case, parent) => {
    const specs: CategorySpec[] = [
      ...SPECS,
      { ...(SPECS[0] as CategorySpec), id: 'deeper', parent: 'units' },
      { ...(SPECS[0] as CategorySpec), id: 'energy', parent },
    ];
    expect(() => defineCategories(specs)).toThrow(/not a hub page/);
  });

  it.each(['', 'Units', 'tab bar', 'units/more', '-units', 'units-'])(
    'refuses %j, which is not a page segment',
    (id) => {
      expect(() => defineCategories([{ ...(SPECS[0] as CategorySpec), id }])).toThrow(
        /is not a page/,
      );
    },
  );
});

describe('categoryFor', () => {
  const categories = defineCategories(SPECS);

  it('finds the category named by the first segment under #/settings', () => {
    expect(categoryFor(['tab-bar'], categories)?.id).toBe('tab-bar');
    expect(categoryFor(['units', 'energy'], categories)?.id).toBe('units');
  });

  it('finds nothing for the hub or an unregistered page', () => {
    expect(categoryFor([], categories)).toBeUndefined();
    expect(categoryFor(['reminders'], categories)).toBeUndefined();
  });
});

/** Each group's row ids, in order. */
function ids(groups: ReturnType<typeof hubGroups>): [string, string[]][] {
  const idOf = (row: HubRow) => (row.kind === 'page' ? row.category.id : row.link.id);
  return groups.map(({ group, rows }) => [group, rows.map(idOf)]);
}

const LINK: SettingsLink = {
  id: 'help',
  titleKey: 'appearance.accent.ember',
  icon: 'pencil',
  group: 'info',
  href: 'https://example.org/help',
};

describe('hubGroups', () => {
  it('lists preferences, then about, each in registry order for ids the hub order does not name', () => {
    expect(ids(hubGroups(defineCategories(SPECS)))).toEqual([
      ['prefs', ['units', 'tab-bar']],
      ['info', ['about-app']],
    ]);
  });

  it('puts the rows it names in the hub order, wherever they were registered', () => {
    const late = defineCategories([
      { ...(SPECS[0] as CategorySpec), id: 'about', group: 'info' },
      { ...(SPECS[0] as CategorySpec), id: 'data' },
      ...SPECS,
      { ...(SPECS[0] as CategorySpec), id: 'profile' },
      { ...(SPECS[0] as CategorySpec), id: 'app' },
    ]);
    expect(ids(hubGroups(late, [LINK]))).toEqual([
      ['prefs', ['profile', 'app', 'data', 'units', 'tab-bar']],
      ['info', ['about', 'help', 'about-app']],
    ]);
  });

  it('leaves out sub-pages and links without an address', () => {
    const categories = defineCategories([
      ...SPECS,
      { ...(SPECS[0] as CategorySpec), id: 'energy', parent: 'units' },
    ]);
    const links: SettingsLink[] = [LINK, { ...LINK, id: 'privacy', href: null }];
    const groups = hubGroups(categories, links);
    expect(ids(groups)).toEqual([
      ['prefs', ['units', 'tab-bar']],
      ['info', ['help', 'about-app']],
    ]);
    expect(groups[1]?.rows[0]).toEqual({ kind: 'link', link: LINK });
  });

  it('leaves out a group with no row', () => {
    const groups = hubGroups(defineCategories(SPECS.filter((spec) => spec.group === 'info')));
    expect(groups.map(({ group }) => group)).toEqual(['info']);
    expect(hubGroups([], [{ ...LINK, href: null }])).toEqual([]);
  });
});

describe('the registered categories', () => {
  it('have distinct ids and titles, and routes the router reads back as themselves', () => {
    const ids = SETTINGS_CATEGORIES.map((category) => category.id);
    const titles = SETTINGS_CATEGORIES.map((category) => category.titleKey);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(titles).size).toBe(titles.length);
    for (const category of SETTINGS_CATEGORIES) {
      expect(category.route).toEqual(tabRoute('settings', category.id));
      expect(parseHash(routeHash(category.route))).toEqual(category.route);
    }
  });

  it('nest Add menu, Product details and Tab bar under App settings, and Credits under About', () => {
    const nested = SETTINGS_CATEGORIES.filter((category) => category.parent !== undefined);
    expect(nested.map(({ id, parent }) => [id, parent])).toEqual([
      ['menu', 'app'],
      ['product-fields', 'app'],
      ['tab-bar', 'app'],
      ['credits', 'about'],
    ]);
  });

  it('wait for the stored settings, except About, Credits and the methods page, which show none', () => {
    const open = SETTINGS_CATEGORIES.filter((category) => category.waitForSettings === false);
    expect(open.map((category) => category.id)).toEqual(['about', 'credits', 'methods']);
  });

  it('name every hub row of v1 in the hub order, and link to help and privacy', () => {
    expect(HUB_ORDER).toEqual([
      'profile',
      'goals',
      'tracking',
      'ai',
      'app',
      'data',
      'about',
      'help',
      'privacy',
    ]);
    expect(SETTINGS_LINKS.map(({ id, group }) => [id, group])).toEqual([
      ['help', 'info'],
      ['privacy', 'info'],
    ]);
  });
});
