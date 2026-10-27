import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MENU_LAYOUT,
  sanitiseLayout,
  type AddMenuLayout,
  type MenuGroup,
} from '../../../domain/food/addMenu';
import {
  hiddenMethods,
  layoutKey,
  moveGroup,
  moveMethod,
  removeMethod,
  renameGroup,
  withGroupCount,
} from './menuEdits';

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

/** Each group as [id, name, methods], then the loose list. */
const shape = (layout: AddMenuLayout) => [
  layout.groups.map((group) => [group.id, group.name, group.methods]),
  layout.loose,
];

const FLAT_EMPTY = layoutOf([]);

describe('withGroupCount', () => {
  it('puts every method straight on the menu at 0, the groups first, then the loose ones', () => {
    const layout = layoutOf(
      [
        ['a', 'Snap', ['camera', 'barcode']],
        ['b', '', ['recent']],
      ],
      ['manual'],
    );
    expect(shape(withGroupCount(layout, 0))).toEqual([
      [],
      ['camera', 'barcode', 'recent', 'manual'],
    ]);
  });

  it('rebuilds the default groups going up from 0 with nothing loose, keeping as many as asked', () => {
    expect(shape(withGroupCount(FLAT_EMPTY, 1))).toEqual([
      [['snapScan', 'snapScan', ['camera', 'library', 'barcode']]],
      [],
    ]);
    expect(withGroupCount(FLAT_EMPTY, 3)).toEqual(DEFAULT_MENU_LAYOUT);
  });

  it('wraps the loose methods in one unnamed group going up from 0', () => {
    const flat = layoutOf([], ['manual', 'camera']);
    expect(shape(withGroupCount(flat, 1))).toEqual([[['g1', '', ['manual', 'camera']]], []]);
    expect(shape(withGroupCount(flat, 2))).toEqual([
      [
        ['g1', '', ['manual', 'camera']],
        ['g2', '', []],
      ],
      [],
    ]);
  });

  it('counts only offered methods as loose: a reserved one alone still rebuilds the defaults', () => {
    const flat = layoutOf([], ['voice']);
    expect(shape(withGroupCount(flat, 1))).toEqual([
      [['snapScan', 'snapScan', ['camera', 'library', 'barcode']]],
      ['voice'],
    ]);
  });

  it('adds empty unnamed groups with ids no group has, and keeps the loose list', () => {
    const layout = layoutOf([['g2', 'Snap', ['camera']]], ['manual']);
    expect(shape(withGroupCount(layout, 3))).toEqual([
      [
        ['g2', 'Snap', ['camera']],
        ['g1', '', []],
        ['g3', '', []],
      ],
      ['manual'],
    ]);
  });

  it('drops the last groups going down, and their methods become hidden', () => {
    const fewer = withGroupCount(DEFAULT_MENU_LAYOUT, 2);
    expect(fewer.groups.map((group) => group.id)).toEqual(['snapScan', 'describe']);
    expect(hiddenMethods(fewer)).toEqual(['recent', 'often', 'saved', 'copyDay']);
  });

  it('holds the count to 0…3', () => {
    expect(withGroupCount(DEFAULT_MENU_LAYOUT, 5).groups).toHaveLength(3);
    expect(withGroupCount(DEFAULT_MENU_LAYOUT, -1).groups).toHaveLength(0);
  });
});

describe('moveGroup', () => {
  it('swaps a group with the one before or after it, and leaves the ends alone', () => {
    const up = moveGroup(DEFAULT_MENU_LAYOUT, 'reuse', -1);
    expect(up.groups.map((group) => group.id)).toEqual(['snapScan', 'reuse', 'describe']);
    const down = moveGroup(DEFAULT_MENU_LAYOUT, 'snapScan', 1);
    expect(down.groups.map((group) => group.id)).toEqual(['describe', 'snapScan', 'reuse']);
    expect(moveGroup(DEFAULT_MENU_LAYOUT, 'snapScan', -1)).toBe(DEFAULT_MENU_LAYOUT);
    expect(moveGroup(DEFAULT_MENU_LAYOUT, 'reuse', 1)).toBe(DEFAULT_MENU_LAYOUT);
    expect(moveGroup(DEFAULT_MENU_LAYOUT, 'gone', 1)).toBe(DEFAULT_MENU_LAYOUT);
  });
});

describe('renameGroup', () => {
  it('keeps the name as typed, spaces and blanks included; the save trims it', () => {
    const renamed = renameGroup(DEFAULT_MENU_LAYOUT, 'describe', '  Words  ');
    expect(renamed.groups[1]).toEqual({
      id: 'describe',
      name: '  Words  ',
      methods: ['describe', 'manual'],
    });
    expect(sanitiseLayout(renamed).groups[1]?.name).toBe('Words');
    expect(sanitiseLayout(renameGroup(renamed, 'describe', '   ')).groups[1]?.name).toBe('');
  });
});

describe('removeMethod', () => {
  it('takes the method off the menu, where it was, and keeps a group it leaves empty', () => {
    const layout = layoutOf([['a', '', ['barcode']]], ['manual', 'camera']);
    expect(shape(removeMethod(layout, 'barcode'))).toEqual([[['a', '', []]], ['manual', 'camera']]);
    expect(shape(removeMethod(layout, 'manual'))).toEqual([[['a', '', ['barcode']]], ['camera']]);
    expect(hiddenMethods(removeMethod(DEFAULT_MENU_LAYOUT, 'copyDay'))).toEqual(['copyDay']);
  });
});

describe('moveMethod', () => {
  it('moves a method one row within its group or the loose list', () => {
    const layout = layoutOf([['a', '', ['camera', 'library', 'barcode']]], ['manual', 'recent']);
    expect(shape(moveMethod(layout, 'barcode', -1))).toEqual([
      [['a', '', ['camera', 'barcode', 'library']]],
      ['manual', 'recent'],
    ]);
    expect(shape(moveMethod(layout, 'manual', 1))).toEqual([
      [['a', '', ['camera', 'library', 'barcode']]],
      ['recent', 'manual'],
    ]);
  });

  it('leaves the first row up and the last row down where they are', () => {
    const layout = layoutOf([['a', '', ['camera', 'library']]]);
    expect(shape(moveMethod(layout, 'camera', -1))).toEqual(shape(layout));
    expect(shape(moveMethod(layout, 'library', 1))).toEqual(shape(layout));
  });

  it('steps over a reserved method, which is never drawn', () => {
    const layout = layoutOf([['a', '', ['camera', 'voice', 'library']]]);
    expect(shape(moveMethod(layout, 'library', -1))).toEqual([
      [['a', '', ['library', 'voice', 'camera']]],
      [],
    ]);
  });
});

describe('hiddenMethods', () => {
  it("lists the offered methods not on the menu in the default menu's order, never voice", () => {
    expect(hiddenMethods(DEFAULT_MENU_LAYOUT)).toEqual([]);
    expect(hiddenMethods(FLAT_EMPTY)).toEqual([
      'camera',
      'library',
      'barcode',
      'describe',
      'manual',
      'recent',
      'often',
      'saved',
      'copyDay',
    ]);
    expect(hiddenMethods(layoutOf([], ['copyDay', 'voice', 'camera', 'often']))).toEqual([
      'library',
      'barcode',
      'describe',
      'manual',
      'recent',
      'saved',
    ]);
  });
});

describe('layoutKey', () => {
  it('is the same for two copies that store alike, and differs when the stored menu would', () => {
    const untidy = layoutOf(
      [
        ['a', '  Snap ', ['camera']],
        ['b', 'Empty', []],
      ],
      ['manual'],
    );
    const tidy = layoutOf([['a', 'Snap', ['camera']]], ['manual']);
    expect(layoutKey(untidy)).toBe(layoutKey(tidy));
    expect(layoutKey(tidy)).not.toBe(layoutKey(layoutOf([['a', 'Snap', ['camera']]])));
  });
});
