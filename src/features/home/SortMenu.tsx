import { DIARY_SORT_MODES, type DiarySortMode } from '../../domain/meals/diary';
import { Icon } from '../../ui/icons';
import { Menu, type MenuEntry } from '../../ui/Menu';
import { tx, type TxKey } from './text';

const MODE_WORDS: Readonly<Record<DiarySortMode, TxKey>> = {
  byMeal: 'home.sort.byMeal',
  newestFirst: 'home.sort.newestFirst',
};

export interface SortMenuProps {
  /** The stored mode, shown checked. */
  readonly mode: DiarySortMode;
  /** Another mode was chosen; the caller stores it. */
  readonly onChange: (mode: DiarySortMode) => void;
}

/**
 * The diary's Sort control (05 §3.3.1): a small menu with the two ways sections form, by meal or
 * newest first, the current one checked. Choosing the current one again changes nothing.
 */
export function SortMenu({ mode, onChange }: SortMenuProps) {
  const entries: MenuEntry[] = DIARY_SORT_MODES.map((each) => ({
    kind: 'action',
    id: each,
    label: tx(MODE_WORDS[each]),
    selected: each === mode,
    onSelect: () => {
      if (each !== mode) onChange(each);
    },
  }));
  return (
    <Menu
      label={tx('home.sort.label')}
      icon={<Icon name="sort" size={18} />}
      align="end"
      entries={entries}
      data-ui="home.sort"
    />
  );
}
