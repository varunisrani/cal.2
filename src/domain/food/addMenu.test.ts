import { describe, expect, it } from 'vitest';
import {
  ADD_METHODS,
  DEFAULT_MENU_LAYOUT,
  decodeLayout,
  isOffered,
  layoutMethods,
  MAX_MENU_GROUPS,
  restoreMethod,
  sanitiseLayout,
  withoutMethods,
  type AddMenuLayout,
  type MenuGroup,
} from './addMenu';

/** A tidied layout from groups given as `[id, name, methods]`. */
function layoutOf(
  groups: readonly (readonly [string, string, MenuGroup['methods']])[],
  loose: AddMenuLayout['loose'] = [],
): AddMenuLayout {
  return {
    version: 1,
    groups: groups.map(([id, name, methods]) => ({ id, name, methods })),
    loose,
  };
}

const methodsOf = (layout: AddMenuLayout) => layout.groups.map((group) => group.methods);

describe('DEFAULT_MENU_LAYOUT', () => {
  it('has three groups and 9 methods: Snap & scan, Describe and Reuse, nothing loose', () => {
    expect(DEFAULT_MENU_LAYOUT.groups.map((group) => [group.id, group.name])).toEqual([
      ['snapScan', 'snapScan'],
      ['describe', 'describe'],
      ['reuse', 'reuse'],
    ]);
    expect(methodsOf(DEFAULT_MENU_LAYOUT)).toEqual([
      ['camera', 'library', 'barcode'],
      ['describe', 'manual'],
      ['recent', 'often', 'saved', 'copyDay'],
    ]);
    expect(DEFAULT_MENU_LAYOUT.loose).toEqual([]);
    expect(layoutMethods(DEFAULT_MENU_LAYOUT)).toHaveLength(9);
  });

  it('holds every method v1 offers, and never the reserved voice', () => {
    expect(layoutMethods(DEFAULT_MENU_LAYOUT)).toEqual(ADD_METHODS.filter(isOffered));
    expect(layoutMethods(DEFAULT_MENU_LAYOUT)).not.toContain('voice');
    expect(isOffered('voice')).toBe(false);
  });

  it('is already tidy: it decodes to itself', () => {
    expect(sanitiseLayout(DEFAULT_MENU_LAYOUT)).toEqual(DEFAULT_MENU_LAYOUT);
    expect(decodeLayout(DEFAULT_MENU_LAYOUT)).toEqual(DEFAULT_MENU_LAYOUT);
    expect(decodeLayout(JSON.parse(JSON.stringify(DEFAULT_MENU_LAYOUT)))).toEqual(
      DEFAULT_MENU_LAYOUT,
    );
  });
});

describe('decodeLayout (R02.23)', () => {
  it('gives the default when nothing is stored', () => {
    expect(decodeLayout(null)).toBe(DEFAULT_MENU_LAYOUT);
    expect(decodeLayout(undefined)).toBe(DEFAULT_MENU_LAYOUT);
  });

  it('gives the default for anything it cannot read', () => {
    for (const stored of [
      'camera',
      42,
      [],
      {},
      { groups: [] },
      { loose: [] },
      { groups: 'camera', loose: [] },
      { groups: [], loose: 'camera' },
      { groups: ['camera'], loose: [] },
      { groups: [{ id: 'g1', name: 'Quick' }], loose: [] },
      { groups: [{ id: 'g1', name: 'Quick', methods: 'camera' }], loose: [] },
    ]) {
      expect(decodeLayout(stored)).toBe(DEFAULT_MENU_LAYOUT);
    }
  });

  it('gives the default when a stored menu is empty only because its ids are unknown', () => {
    const inGroup = { version: 1, groups: [{ id: 'g1', name: 'Quick', methods: ['teleport'] }] };
    expect(decodeLayout({ ...inGroup, loose: [] })).toBe(DEFAULT_MENU_LAYOUT);
    expect(decodeLayout({ version: 1, groups: [], loose: ['teleport', 7] })).toBe(
      DEFAULT_MENU_LAYOUT,
    );
    // A known id in a fourth group is cut with the group: the menu still held something.
    const fourth = [1, 2, 3].map((n) => ({ id: `g${n}`, name: '', methods: [] as string[] }));
    fourth.push({ id: 'g4', name: '', methods: ['camera'] });
    expect(decodeLayout({ version: 1, groups: fourth, loose: [] })).toBe(DEFAULT_MENU_LAYOUT);
  });

  it('keeps a menu that was emptied on purpose empty, with or without empty groups', () => {
    const empty: AddMenuLayout = { version: 1, groups: [], loose: [] };
    expect(decodeLayout(empty)).toEqual(empty);
    expect(
      decodeLayout({ version: 1, groups: [{ id: 'g1', name: 'Quick', methods: [] }], loose: [] }),
    ).toEqual(empty);
  });

  it('drops unknown ids and keeps the known ones in their order', () => {
    const stored = {
      version: 1,
      groups: [{ id: 'g1', name: 'Quick', methods: ['camera', 'teleport', 12, 'manual'] }],
      loose: [null, 'describe', 'hologram'],
    };
    expect(decodeLayout(stored)).toEqual(
      layoutOf([['g1', 'Quick', ['camera', 'manual']]], ['describe']),
    );
  });

  it('keeps the reserved voice where it is stored, though v1 never shows it', () => {
    const stored = { version: 1, groups: [], loose: ['voice'] };
    expect(decodeLayout(stored)).toEqual(layoutOf([], ['voice']));
  });

  it('reads the loose list beside groups, under them, whatever the stored version says', () => {
    const stored = {
      version: 7,
      groups: [{ id: 'g1', name: 'Quick', methods: ['camera'] }],
      loose: ['manual'],
    };
    expect(decodeLayout(stored)).toEqual(layoutOf([['g1', 'Quick', ['camera']]], ['manual']));
  });

  it('gives a group without a readable id or name a fresh id and a blank name', () => {
    const stored = { version: 1, groups: [{ id: 5, name: false, methods: ['camera'] }], loose: [] };
    expect(decodeLayout(stored)).toEqual(layoutOf([['g1', '', ['camera']]]));
  });
});

describe('sanitiseLayout', () => {
  it('keeps a method listed in two groups only in the first', () => {
    const tidy = sanitiseLayout({
      groups: [
        { id: 'a', name: 'Scan', methods: ['camera', 'barcode', 'camera'] },
        { id: 'b', name: 'Type', methods: ['barcode', 'describe'] },
      ],
      loose: [],
    });
    expect(methodsOf(tidy)).toEqual([['camera', 'barcode'], ['describe']]);
  });

  it('keeps a method that is in a group and loose only in the group', () => {
    const tidy = sanitiseLayout({
      groups: [{ id: 'a', name: 'Scan', methods: ['camera'] }],
      loose: ['manual', 'camera', 'manual'],
    });
    expect(tidy.groups[0]?.methods).toEqual(['camera']);
    expect(tidy.loose).toEqual(['manual']);
  });

  it('keeps at most 3 groups, and the methods of the others go with them', () => {
    const tidy = sanitiseLayout({
      groups: [
        { id: 'a', name: 'A', methods: ['camera'] },
        { id: 'b', name: 'B', methods: ['library'] },
        { id: 'c', name: 'C', methods: ['describe'] },
        { id: 'd', name: 'D', methods: ['manual'] },
      ],
      loose: [],
    });
    expect(tidy.groups.map((group) => group.id)).toEqual(['a', 'b', 'c']);
    expect(tidy.groups).toHaveLength(MAX_MENU_GROUPS);
    expect(layoutMethods(tidy)).not.toContain('manual');
  });

  it('drops groups that end up without methods', () => {
    const tidy = sanitiseLayout({
      groups: [
        { id: 'a', name: 'Empty', methods: [] },
        { id: 'b', name: 'Gone', methods: ['teleport'] },
        { id: 'c', name: 'Quick', methods: ['camera'] },
      ],
      loose: [],
    });
    expect(tidy).toEqual(layoutOf([['c', 'Quick', ['camera']]]));
  });

  it('trims names, and a blank name stays blank for the generic label', () => {
    const tidy = sanitiseLayout({
      groups: [
        { id: 'a', name: '  Snacks ', methods: ['camera'] },
        { id: 'b', name: ' \n\t', methods: ['manual'] },
        { id: 'c', methods: ['describe'] },
      ],
      loose: [],
    });
    expect(tidy.groups.map((group) => group.name)).toEqual(['Snacks', '', '']);
  });

  it('gives every group its own id: a blank or repeated one takes a free g-number', () => {
    const tidy = sanitiseLayout({
      groups: [
        { id: 'g1', name: 'A', methods: ['camera'] },
        { id: 'g1', name: 'B', methods: ['library'] },
        { id: ' ', name: 'C', methods: ['manual'] },
      ],
      loose: [],
    });
    expect(tidy.groups.map((group) => group.id)).toEqual(['g1', 'g2', 'g3']);
  });

  it('keeps ids that were asked for, even after a group that needed a fresh one', () => {
    const tidy = sanitiseLayout({
      groups: [
        { name: 'A', methods: ['camera'] },
        { id: 'g1', name: 'B', methods: ['library'] },
      ],
      loose: [],
    });
    expect(tidy.groups.map((group) => group.id)).toEqual(['g2', 'g1']);
  });

  it('always writes version 1', () => {
    expect(sanitiseLayout({ groups: [], loose: ['camera'] }).version).toBe(1);
  });
});

describe('restoreMethod', () => {
  const twoGroups = layoutOf([
    ['g1', 'Scan', ['camera']],
    ['g2', 'Type', ['describe']],
  ]);

  it('puts a method into the group the target names', () => {
    const restored = restoreMethod(twoGroups, 'manual', { group: 'g1' });
    expect(methodsOf(restored)).toEqual([['camera', 'manual'], ['describe']]);
    expect(restored.loose).toEqual([]);
  });

  it('puts a method straight on the menu, under the groups, when asked to', () => {
    const restored = restoreMethod(twoGroups, 'manual', 'loose');
    expect(methodsOf(restored)).toEqual([['camera'], ['describe']]);
    expect(restored.loose).toEqual(['manual']);
  });

  it('adds to the flat list when the menu has no groups', () => {
    const flat = layoutOf([], ['camera', 'describe']);
    expect(restoreMethod(flat, 'manual')).toEqual(layoutOf([], ['camera', 'describe', 'manual']));
  });

  it('adds to the last group without a target, and keeps the group ids', () => {
    const restored = restoreMethod(twoGroups, 'manual');
    expect(methodsOf(restored)).toEqual([['camera'], ['describe', 'manual']]);
    expect(restored.groups.map((group) => group.id)).toEqual(['g1', 'g2']);
  });

  it('adds to the first group with methods when the last one is empty, keeping the empty one', () => {
    const editing = layoutOf([
      ['g1', 'Empty', []],
      ['g2', 'Scan', ['camera']],
      ['g3', 'New', []],
    ]);
    const restored = restoreMethod(editing, 'manual');
    expect(methodsOf(restored)).toEqual([[], ['camera', 'manual'], []]);
    // The editor keeps the empty groups until it saves.
    expect(sanitiseLayout(restored)).toEqual(layoutOf([['g2', 'Scan', ['camera', 'manual']]]));
  });

  it('adds to the last group when every group is empty', () => {
    const editing = layoutOf([
      ['g1', 'A', []],
      ['g2', 'B', []],
    ]);
    expect(methodsOf(restoreMethod(editing, 'camera'))).toEqual([[], ['camera']]);
  });

  it("leaves a method that is the last group's only one where it is", () => {
    const editing = layoutOf([
      ['g1', 'Scan', ['camera']],
      ['g2', 'Type', ['manual']],
    ]);
    expect(restoreMethod(editing, 'manual')).toEqual(editing);
  });

  it('treats a target group that is gone as no target', () => {
    const restored = restoreMethod(twoGroups, 'manual', { group: 'g9' });
    expect(methodsOf(restored)).toEqual([['camera'], ['describe', 'manual']]);
  });

  it('moves a method that is already on the menu instead of listing it twice', () => {
    const withLoose = layoutOf([['g1', 'Scan', ['camera', 'barcode']]], ['manual']);
    const toLoose = restoreMethod(withLoose, 'barcode', 'loose');
    expect(methodsOf(toLoose)).toEqual([['camera']]);
    expect(toLoose.loose).toEqual(['manual', 'barcode']);
    const toGroup = restoreMethod(toLoose, 'manual', { group: 'g1' });
    expect(methodsOf(toGroup)).toEqual([['camera', 'manual']]);
    expect(toGroup.loose).toEqual(['barcode']);
  });
});

describe('withoutMethods', () => {
  it('leaves out the hidden methods and the groups that leaves empty', () => {
    const shown = withoutMethods(DEFAULT_MENU_LAYOUT, [
      'barcode',
      'recent',
      'often',
      'saved',
      'copyDay',
    ]);
    expect(shown.groups.map((group) => group.id)).toEqual(['snapScan', 'describe']);
    expect(methodsOf(shown)).toEqual([
      ['camera', 'library'],
      ['describe', 'manual'],
    ]);
  });

  it('leaves out hidden loose methods too', () => {
    const layout = layoutOf([], ['voice', 'manual']);
    expect(withoutMethods(layout, ['voice']).loose).toEqual(['manual']);
  });
});
