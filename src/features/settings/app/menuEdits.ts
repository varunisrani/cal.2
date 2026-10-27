// The add-menu editor's changes (P09-05, 06 §3.6): each takes the editor's copy of the layout and
// gives the next one. The copy may hold empty groups and names as typed; the service tidies it on
// save (R06.21). A method sits in one place only, so a method names its own row. Reserved methods
// (voice) are kept where a stored layout has them but never drawn, so moves step over them.

import {
  ADD_METHODS,
  DEFAULT_MENU_LAYOUT,
  isOffered,
  layoutMethods,
  MAX_MENU_GROUPS,
  sanitiseLayout,
  type AddMenuLayout,
  type AddMethod,
  type MenuGroup,
  type OfferedMethod,
} from '../../../domain/food/addMenu';

/** The layout as it would be stored, as text: two copies that store alike have the same key. */
export function layoutKey(layout: AddMenuLayout): string {
  return JSON.stringify(sanitiseLayout(layout));
}

/** The methods v1 offers that are not on the menu, in the default menu's order. */
export function hiddenMethods(layout: AddMenuLayout): OfferedMethod[] {
  const shown = new Set(layoutMethods(layout));
  return ADD_METHODS.filter(isOffered).filter((method) => !shown.has(method));
}

/** The first `g1`, `g2`, … no group has. */
function freeGroupId(groups: readonly MenuGroup[]): string {
  let next = 1;
  while (groups.some((group) => group.id === `g${next}`)) next += 1;
  return `g${next}`;
}

/**
 * The layout with `count` groups (held to 0…3). None: every method on the menu goes straight on
 * it, the groups' first. Up from none: the default groups again when nothing offered sits straight
 * on the menu, else one unnamed group holding what does. Groups beyond those start empty and
 * unnamed; going down drops the last groups, and their methods become hidden.
 */
export function withGroupCount(layout: AddMenuLayout, count: number): AddMenuLayout {
  const target = Math.min(Math.max(Math.trunc(count), 0), MAX_MENU_GROUPS);
  if (target === 0) {
    return { ...layout, groups: [], loose: [...new Set(layoutMethods(layout))] };
  }
  let groups: MenuGroup[] = [...layout.groups];
  let loose = layout.loose;
  if (groups.length === 0) {
    if (loose.some(isOffered)) {
      groups = [{ id: freeGroupId([]), name: '', methods: loose }];
      loose = [];
    } else {
      groups = [...DEFAULT_MENU_LAYOUT.groups];
    }
  }
  while (groups.length < target) groups.push({ id: freeGroupId(groups), name: '', methods: [] });
  return { ...layout, groups: groups.slice(0, target), loose };
}

/** The layout with group `id` one place earlier (`by` -1) or later (1); unchanged at an end. */
export function moveGroup(layout: AddMenuLayout, id: string, by: -1 | 1): AddMenuLayout {
  const from = layout.groups.findIndex((group) => group.id === id);
  const to = from + by;
  const moving = layout.groups[from];
  const other = layout.groups[to];
  if (from < 0 || !moving || !other) return layout;
  const groups = [...layout.groups];
  groups[from] = other;
  groups[to] = moving;
  return { ...layout, groups };
}

/** The layout with group `id` named `name`, kept as typed (the save trims it). */
export function renameGroup(layout: AddMenuLayout, id: string, name: string): AddMenuLayout {
  return {
    ...layout,
    groups: layout.groups.map((group) => (group.id === id ? { ...group, name } : group)),
  };
}

/** The layout without `method`, which becomes hidden. An empty group stays until the save. */
export function removeMethod(layout: AddMenuLayout, method: AddMethod): AddMenuLayout {
  const others = (methods: readonly AddMethod[]) => methods.filter((each) => each !== method);
  return {
    ...layout,
    groups: layout.groups.map((group) => ({ ...group, methods: others(group.methods) })),
    loose: others(layout.loose),
  };
}

/**
 * `methods` with `method` swapped with the nearest offered method before it (`by` -1) or after it
 * (1); unchanged when there is none.
 */
function stepWithin(methods: readonly AddMethod[], method: AddMethod, by: -1 | 1): AddMethod[] {
  const from = methods.indexOf(method);
  const moved = [...methods];
  if (from < 0) return moved;
  for (let to = from + by; to >= 0 && to < methods.length; to += by) {
    const other = methods[to];
    if (other === undefined || !isOffered(other)) continue;
    moved[from] = other;
    moved[to] = method;
    break;
  }
  return moved;
}

/** The layout with `method` one row up (`by` -1) or down (1) in its group or the loose list. */
export function moveMethod(layout: AddMenuLayout, method: AddMethod, by: -1 | 1): AddMenuLayout {
  if (layout.loose.includes(method)) {
    return { ...layout, loose: stepWithin(layout.loose, method, by) };
  }
  return {
    ...layout,
    groups: layout.groups.map((group) =>
      group.methods.includes(method)
        ? { ...group, methods: stepWithin(group.methods, method, by) }
        : group,
    ),
  };
}
