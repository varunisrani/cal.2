// The add menu's layout (02 §3.18, R02.23): up to three named groups of logging methods, each a
// page under "+", and the methods placed straight on the menu ("loose"), drawn under the groups.
// What is stored is tidied before it is shown or saved: at most three groups, unknown method ids
// gone, every method in one place only (the first place wins, groups before loose), groups left
// without methods gone, names trimmed. Nothing readable stored gives the default menu, and so does
// a stored menu that only came out empty because none of its ids is known (a newer version's
// methods, say); a menu emptied on purpose stays empty. The words a person reads come from the
// screen: a group name is the person's own text, one of our preset names, or blank (the screen's
// generic label).

/** Every method the add menu knows, in the default menu's order; `voice` is reserved. */
export const ADD_METHODS = [
  'camera',
  'library',
  'barcode',
  'describe',
  'manual',
  'recent',
  'often',
  'saved',
  'copyDay',
  'voice',
] as const;

export type AddMethod = (typeof ADD_METHODS)[number];

/**
 * Known methods v1 never shows: kept where a stored layout has them (they are not unknown ids),
 * left off the menu. Voice input is a later phase (L4).
 */
export const RESERVED_METHODS = ['voice'] as const satisfies readonly AddMethod[];

export type ReservedMethod = (typeof RESERVED_METHODS)[number];

/** A method v1 can show. */
export type OfferedMethod = Exclude<AddMethod, ReservedMethod>;

/** Groups a menu holds at most. */
export const MAX_MENU_GROUPS = 3;

/** Names the default groups carry: the screen puts each into words. */
export const PRESET_GROUP_NAMES = ['snapScan', 'describe', 'reuse'] as const;

export type PresetGroupName = (typeof PRESET_GROUP_NAMES)[number];

export interface MenuGroup {
  /** Unique within the layout. */
  readonly id: string;
  /** Trimmed: the person's text, a preset name, or blank for the generic label. */
  readonly name: string;
  /** Never empty once tidied. */
  readonly methods: readonly AddMethod[];
}

/** The stored setting `menu.layout`, as tidied. */
export interface AddMenuLayout {
  readonly version: 1;
  readonly groups: readonly MenuGroup[];
  /** Shown directly on the menu, under the groups; with no group it is the whole menu. */
  readonly loose: readonly AddMethod[];
}

/** A layout before it is tidied: what the store or an editor may hold, unknown ids included. */
export interface LayoutDraft {
  readonly groups: readonly {
    readonly id?: string;
    readonly name?: string;
    readonly methods: readonly unknown[];
  }[];
  readonly loose: readonly unknown[];
}

/** Where a restored method goes: a group by its id, or straight on the menu. */
export type RestoreTarget = { readonly group: string } | 'loose';

export const DEFAULT_MENU_LAYOUT: AddMenuLayout = {
  version: 1,
  groups: [
    { id: 'snapScan', name: 'snapScan', methods: ['camera', 'library', 'barcode'] },
    { id: 'describe', name: 'describe', methods: ['describe', 'manual'] },
    { id: 'reuse', name: 'reuse', methods: ['recent', 'often', 'saved', 'copyDay'] },
  ],
  loose: [],
};

export function isAddMethod(value: unknown): value is AddMethod {
  return ADD_METHODS.some((method) => method === value);
}

export function isOffered(method: AddMethod): method is OfferedMethod {
  return !RESERVED_METHODS.some((reserved) => reserved === method);
}

export function isPresetGroupName(name: string): name is PresetGroupName {
  return PRESET_GROUP_NAMES.some((preset) => preset === name);
}

/** Every method on the menu: the groups' in order, then the loose ones. */
export function layoutMethods(layout: AddMenuLayout): AddMethod[] {
  return [...layout.groups.flatMap((group) => group.methods), ...layout.loose];
}

/**
 * Gives each group an id no other group has: an id seen first keeps it; a blank or repeated one
 * takes the first free `g1`, `g2`, … (ids that were asked for are never handed out again).
 */
function withUniqueIds(groups: readonly MenuGroup[]): MenuGroup[] {
  const taken = new Set<string>();
  const kept = groups.map(({ id }) => {
    if (id.trim() === '' || taken.has(id)) return null;
    taken.add(id);
    return id;
  });
  let next = 1;
  return groups.map((group, index) => {
    let id = kept[index] ?? null;
    if (id === null) {
      while (taken.has(`g${next}`)) next += 1;
      id = `g${next}`;
      taken.add(id);
    }
    return { ...group, id };
  });
}

/**
 * The layout as it is shown and saved: the first three groups, known methods only, each method
 * at its first place (groups before loose), groups without methods dropped, names trimmed and ids
 * unique.
 */
export function sanitiseLayout(draft: LayoutDraft): AddMenuLayout {
  const placed = new Set<AddMethod>();
  const place = (ids: readonly unknown[]): AddMethod[] => {
    const methods: AddMethod[] = [];
    for (const id of ids) {
      if (!isAddMethod(id) || placed.has(id)) continue;
      placed.add(id);
      methods.push(id);
    }
    return methods;
  };

  const groups = draft.groups.slice(0, MAX_MENU_GROUPS).flatMap((group) => {
    const methods = place(group.methods);
    if (methods.length === 0) return [];
    return [{ id: group.id ?? '', name: (group.name ?? '').trim(), methods }];
  });
  return { version: 1, groups: withUniqueIds(groups), loose: place(draft.loose) };
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** The stored value as a draft, or null when it is not a layout we can read. */
function readDraft(stored: unknown): LayoutDraft | null {
  if (!isRecord(stored)) return null;
  const { groups, loose } = stored;
  if (!Array.isArray(groups) || !Array.isArray(loose)) return null;
  const read: LayoutDraft['groups'][number][] = [];
  for (const group of groups) {
    if (!isRecord(group) || !Array.isArray(group.methods)) return null;
    read.push({
      ...(typeof group.id === 'string' ? { id: group.id } : {}),
      ...(typeof group.name === 'string' ? { name: group.name } : {}),
      methods: group.methods,
    });
  }
  return { groups: read, loose };
}

/**
 * The menu from the stored setting (R02.23). Nothing stored or nothing readable → the default. A
 * layout that comes out empty only because its ids are unknown → the default too; one that held
 * no method at all (emptied on purpose) stays empty.
 */
export function decodeLayout(stored: unknown): AddMenuLayout {
  const draft = readDraft(stored);
  if (draft === null) return DEFAULT_MENU_LAYOUT;
  const layout = sanitiseLayout(draft);
  if (layout.groups.length > 0 || layout.loose.length > 0) return layout;
  const heldSomething =
    draft.groups.some((group) => group.methods.length > 0) || draft.loose.length > 0;
  return heldSomething ? DEFAULT_MENU_LAYOUT : layout;
}

/**
 * Puts a hidden method back (the settings editor): into the group the target names, or straight
 * on the menu; without a target (or with a group that is gone), straight on the menu when there
 * are no groups, else into the last group, or the first group with methods when the last has
 * none (judged before the method leaves its old place, so a method that is the last group's
 * only one stays there). A method already on the menu moves. Empty groups stay: the editor
 * tidies on save.
 */
export function restoreMethod(
  layout: AddMenuLayout,
  method: AddMethod,
  target?: RestoreTarget,
): AddMenuLayout {
  const index = destination(layout.groups, target);
  const groups = layout.groups.map((group) => ({
    ...group,
    methods: group.methods.filter((each) => each !== method),
  }));
  const loose = layout.loose.filter((each) => each !== method);
  if (index === null) return { ...layout, groups, loose: [...loose, method] };
  return {
    ...layout,
    groups: groups.map((group, at) =>
      at === index ? { ...group, methods: [...group.methods, method] } : group,
    ),
    loose,
  };
}

/** The index of the group a restored method joins, or null for straight on the menu. */
function destination(groups: readonly MenuGroup[], target?: RestoreTarget): number | null {
  if (target === 'loose') return null;
  if (target !== undefined) {
    const named = groups.findIndex((group) => group.id === target.group);
    if (named >= 0) return named;
  }
  if (groups.length === 0) return null;
  const last = groups.length - 1;
  if ((groups[last]?.methods.length ?? 0) > 0) return last;
  const filled = groups.findIndex((group) => group.methods.length > 0);
  return filled >= 0 ? filled : last;
}

/** The layout without `hidden` methods and without the groups that leaves empty. */
export function withoutMethods(layout: AddMenuLayout, hidden: readonly AddMethod[]): AddMenuLayout {
  const shown = (method: AddMethod) => !hidden.includes(method);
  return {
    ...layout,
    groups: layout.groups
      .map((group) => ({ ...group, methods: group.methods.filter(shown) }))
      .filter((group) => group.methods.length > 0),
    loose: layout.loose.filter(shown),
  };
}
