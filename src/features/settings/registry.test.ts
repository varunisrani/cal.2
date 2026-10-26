import { describe, expect, it } from 'vitest';
import { parseHash, routeHash, tabRoute } from '../../app/router';
import {
  categoryFor,
  defineCategories,
  groupsOf,
  SETTINGS_CATEGORIES,
  type CategorySpec,
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

describe('groupsOf', () => {
  it('lists preferences, then about, each in registry order', () => {
    const groups = groupsOf(defineCategories(SPECS));
    expect(groups.map(({ group, categories }) => [group, categories.map((c) => c.id)])).toEqual([
      ['prefs', ['units', 'tab-bar']],
      ['info', ['about-app']],
    ]);
  });

  it('leaves out a group with no category', () => {
    const groups = groupsOf(defineCategories(SPECS.filter((spec) => spec.group === 'info')));
    expect(groups.map(({ group }) => group)).toEqual(['info']);
    expect(groupsOf([])).toEqual([]);
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
});
