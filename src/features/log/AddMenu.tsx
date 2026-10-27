import {
  isOffered,
  isPresetGroupName,
  RESERVED_METHODS,
  withoutMethods,
  type AddMenuLayout,
  type AddMethod,
  type OfferedMethod,
  type PresetGroupName,
} from '../../domain/food/addMenu';
import { t, type TKey } from '../../i18n/t';
import { Icon, type IconName } from '../../ui/icons';
import { Menu, type MenuAction, type MenuEntry } from '../../ui/Menu';

/**
 * Methods whose sheets are not built yet. They stay in the layout (and the default) but are left
 * off the drawn menu; each slice deletes its own here when its sheet lands: barcode (P06-14),
 * recent, often and saved (P06-12), copyDay (P06-13).
 */
export const METHODS_NOT_BUILT_YET: readonly AddMethod[] = [
  'barcode',
  'recent',
  'often',
  'saved',
  'copyDay',
];

const GROUP_WORDS: Record<PresetGroupName, TKey> = {
  snapScan: 'menu.group.snapScan',
  describe: 'menu.group.describe',
  reuse: 'menu.group.reuse',
};

const METHOD_LOOKS: Record<OfferedMethod, { readonly label: TKey; readonly icon: IconName }> = {
  camera: { label: 'menu.method.camera', icon: 'camera' },
  library: { label: 'menu.method.library', icon: 'photos' },
  barcode: { label: 'menu.method.barcode', icon: 'barcode' },
  describe: { label: 'menu.method.describe', icon: 'text' },
  manual: { label: 'menu.method.manual', icon: 'pencil' },
  recent: { label: 'menu.method.recent', icon: 'clock' },
  often: { label: 'menu.method.often', icon: 'chart' },
  saved: { label: 'menu.method.saved', icon: 'heart' },
  copyDay: { label: 'menu.method.copyDay', icon: 'copy' },
};

/** A group's name in words: a preset's label, the person's text, or the generic label. */
export function groupLabel(name: string): string {
  if (isPresetGroupName(name)) return t(GROUP_WORDS[name]);
  return name === '' ? t('menu.group.unnamed') : name;
}

export interface AddMenuProps {
  /** The "+" button's accessible name. */
  readonly label: string;
  /** The tidied layout (`decodeLayout` of the stored setting). */
  readonly layout: AddMenuLayout;
  /**
   * Runs before every method: a label scan armed after a barcode miss (P06-17) must not reach
   * any other method, or a stale code would link an unrelated meal to a product (R02.20).
   */
  readonly clearArmedLabelScan: () => void;
  /** Opens the chosen method's sheet. */
  readonly onChoose: (method: OfferedMethod) => void;
  /** Methods to leave off the menu; the ones not built yet by default. */
  readonly withheld?: readonly AddMethod[];
  readonly triggerClassName?: string;
  /** Hook for the button; a method row is `<hook>.<method>`, a group row `<hook>.group.<id>`. */
  readonly 'data-ui'?: string;
}

/**
 * The add menu (02 §3.18): each group of the layout is a page with its methods and a Back row,
 * and the loose methods follow the groups. Reserved methods and withheld ones (those not built
 * yet) are left off, and so is a group left with none. With nothing to offer there is no button.
 */
export function AddMenu({
  label,
  layout,
  clearArmedLabelScan,
  onChoose,
  withheld = METHODS_NOT_BUILT_YET,
  triggerClassName,
  'data-ui': dataUi,
}: AddMenuProps) {
  const shown = withoutMethods(layout, [...RESERVED_METHODS, ...withheld]);

  const rowFor = (method: AddMethod): MenuAction[] => {
    if (!isOffered(method)) return [];
    const look = METHOD_LOOKS[method];
    return [
      {
        kind: 'action',
        id: method,
        label: t(look.label),
        icon: <Icon name={look.icon} size={20} />,
        onSelect: () => {
          clearArmedLabelScan();
          onChoose(method);
        },
      },
    ];
  };

  const groups: MenuEntry[] = shown.groups.flatMap((group) => {
    const rows = group.methods.flatMap(rowFor);
    const first = rows[0];
    if (!first) return [];
    return [
      {
        kind: 'page',
        id: `group.${group.id}`,
        label: groupLabel(group.name),
        icon: first.icon,
        entries: rows,
      },
    ];
  });
  const loose = shown.loose.flatMap(rowFor);
  const entries: MenuEntry[] = [
    ...groups,
    ...(groups.length > 0 && loose.length > 0 ? [{ kind: 'separator', id: 'loose' } as const] : []),
    ...loose,
  ];
  if (entries.length === 0) return null;

  return (
    <Menu
      label={label}
      icon={<Icon name="plus" size={28} />}
      hideLabel
      placement="above"
      align="end"
      entries={entries}
      triggerClassName={triggerClassName}
      data-ui={dataUi}
    />
  );
}
