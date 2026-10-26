import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from 'react';
import styles from './display.module.css';
import { t } from '../i18n/t';
import { Icon } from './icons';

/** A row that does something. With `selected` set it is a radio row and shows a check mark. */
export interface MenuAction {
  readonly kind: 'action';
  readonly id: string;
  readonly label: string;
  readonly icon?: ReactNode;
  readonly selected?: boolean;
  readonly onSelect: () => void;
}

/** A row that opens a nested page in place; the page ends with a Back row. */
export interface MenuPage {
  readonly kind: 'page';
  readonly id: string;
  readonly label: string;
  readonly icon?: ReactNode;
  readonly entries: readonly MenuEntry[];
}

/** A hairline between groups of rows. */
export interface MenuSeparator {
  readonly kind: 'separator';
  readonly id: string;
}

export type MenuEntry = MenuAction | MenuPage | MenuSeparator;

export interface MenuProps {
  /** Names the button and the menu's top page. Shown on the button unless `hideLabel`. */
  readonly label: string;
  readonly icon?: ReactNode;
  /** Show only the icon; the label stays the button's accessible name. */
  readonly hideLabel?: boolean;
  readonly entries: readonly MenuEntry[];
  /** Where the menu opens: under the button (default) or over it (a button near the bottom). */
  readonly placement?: 'below' | 'above';
  /** The button edge the menu lines up with (default the start edge). */
  readonly align?: 'start' | 'end';
  /** The Back row's words (default from the catalogue). */
  readonly backLabel?: string;
  /** Extra class for the button, e.g. a floating round button. */
  readonly triggerClassName?: string;
  /** Hook for the button; each row gets `<hook>.<entry id>`, the Back row `<hook>.back`. */
  readonly 'data-ui'?: string;
}

/** One focusable row of the page on screen. */
type Row =
  { readonly kind: 'entry'; readonly entry: MenuAction | MenuPage } | { readonly kind: 'back' };

/** The entries of the page reached by following `path` (page ids) from the top. */
function pageAt(entries: readonly MenuEntry[], path: readonly string[]): readonly MenuEntry[] {
  let current = entries;
  for (const id of path) {
    const page = current.find(
      (entry): entry is MenuPage => entry.kind === 'page' && entry.id === id,
    );
    if (!page) return current;
    current = page.entries;
  }
  return current;
}

function rowsOf(entries: readonly MenuEntry[], nested: boolean): Row[] {
  const rows: Row[] = [];
  for (const entry of entries) if (entry.kind !== 'separator') rows.push({ kind: 'entry', entry });
  if (nested) rows.push({ kind: 'back' });
  return rows;
}

/**
 * A drop-down menu anchored to its button, with nested pages. The arrow keys move the focus
 * over the rows (Home and End jump to the ends); Enter or Space activates; Right opens a page;
 * Left or Escape go back a page, and Escape on the top page closes. Tab and a press outside
 * close it. Choosing an action closes the menu and gives the focus back to the button before
 * the action runs.
 */
export function Menu({
  label,
  icon,
  hideLabel = false,
  entries,
  placement = 'below',
  align = 'start',
  backLabel,
  triggerClassName,
  'data-ui': dataUi,
}: MenuProps) {
  const id = useId();
  const triggerId = `${id}-button`;
  const menuId = `${id}-menu`;
  const anchorRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const rowRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [open, setOpen] = useState(false);
  const [path, setPath] = useState<readonly string[]>([]);
  const [active, setActive] = useState(0);

  const nested = path.length > 0;
  const pageEntries = pageAt(entries, path);
  const rows = rowsOf(pageEntries, nested);
  const openPage = nested
    ? pageAt(entries, path.slice(0, -1)).find(
        (entry): entry is MenuPage => entry.kind === 'page' && entry.id === path[path.length - 1],
      )
    : undefined;

  // The focus follows the active row while the menu is open.
  useEffect(() => {
    if (open) rowRefs.current[active]?.focus();
  }, [open, path, active]);

  // A press anywhere outside closes the menu and leaves the focus where the press put it.
  useEffect(() => {
    if (!open) return undefined;
    const onPress = (event: PointerEvent) => {
      if (!anchorRef.current?.contains(event.target as Node)) {
        setOpen(false);
        setPath([]);
      }
    };
    document.addEventListener('pointerdown', onPress, true);
    return () => document.removeEventListener('pointerdown', onPress, true);
  }, [open]);

  const openAt = (which: 'first' | 'last') => {
    const top = rowsOf(entries, false);
    setPath([]);
    setActive(which === 'last' ? Math.max(top.length - 1, 0) : 0);
    setOpen(true);
  };

  const close = (refocus: boolean) => {
    setOpen(false);
    setPath([]);
    if (refocus) triggerRef.current?.focus();
  };

  const enter = (page: MenuPage) => {
    setPath([...path, page.id]);
    setActive(0);
  };

  const back = () => {
    const parentPath = path.slice(0, -1);
    const openedFrom = path[path.length - 1];
    const parentRows = rowsOf(pageAt(entries, parentPath), parentPath.length > 0);
    const index = parentRows.findIndex(
      (row) => row.kind === 'entry' && row.entry.id === openedFrom,
    );
    setPath(parentPath);
    setActive(Math.max(index, 0));
  };

  const activate = (row: Row) => {
    if (row.kind === 'back') back();
    else if (row.entry.kind === 'page') enter(row.entry);
    else {
      close(true);
      row.entry.onSelect();
    }
  };

  const onTriggerKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      openAt(event.key === 'ArrowUp' ? 'last' : 'first');
    }
  };

  const onMenuKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const count = Math.max(rows.length, 1);
    const row = rows[active];
    switch (event.key) {
      case 'ArrowDown':
        setActive((active + 1) % count);
        break;
      case 'ArrowUp':
        setActive((active - 1 + count) % count);
        break;
      case 'Home':
        setActive(0);
        break;
      case 'End':
        setActive(count - 1);
        break;
      case 'ArrowRight':
        if (row?.kind === 'entry' && row.entry.kind === 'page') enter(row.entry);
        break;
      case 'ArrowLeft':
        if (nested) back();
        break;
      case 'Escape':
        if (nested) back();
        else close(true);
        break;
      case 'Tab':
        // The focus goes back to the button first, so the browser moves it on from there.
        close(true);
        return;
      default:
        return;
    }
    event.preventDefault();
    event.stopPropagation();
  };

  const hookFor = (part: string) => (dataUi ? `${dataUi}.${part}` : undefined);

  let rowIndex = -1;
  const renderRow = (row: Row, key: string) => {
    rowIndex += 1;
    const index = rowIndex;
    const ref = (element: HTMLButtonElement | null) => {
      rowRefs.current[index] = element;
    };
    if (row.kind === 'back') {
      return (
        <button
          key={key}
          ref={ref}
          type="button"
          role="menuitem"
          tabIndex={-1}
          className={styles.menuRow}
          data-ui={hookFor('back')}
          onClick={() => activate(row)}
        >
          <Icon name="chevronLeft" className={styles.menuRowIcon} size={20} />
          <span className={styles.menuRowLabel}>{backLabel ?? t('display.menu.back')}</span>
        </button>
      );
    }
    const { entry } = row;
    const radio = entry.kind === 'action' && entry.selected !== undefined;
    return (
      <button
        key={key}
        ref={ref}
        type="button"
        role={radio ? 'menuitemradio' : 'menuitem'}
        aria-checked={radio ? entry.selected : undefined}
        aria-haspopup={entry.kind === 'page' ? 'menu' : undefined}
        tabIndex={-1}
        className={styles.menuRow}
        data-ui={hookFor(entry.id)}
        onClick={() => activate(row)}
      >
        {entry.icon ? <span className={styles.menuRowIcon}>{entry.icon}</span> : null}
        <span className={styles.menuRowLabel}>{entry.label}</span>
        {entry.kind === 'page' ? (
          <Icon name="chevronRight" className={styles.menuRowEnd} size={18} />
        ) : null}
        {radio && entry.selected ? (
          <Icon name="check" className={styles.menuRowEnd} size={18} />
        ) : null}
      </button>
    );
  };

  return (
    <div ref={anchorRef} className={styles.menuAnchor}>
      <button
        ref={triggerRef}
        id={triggerId}
        type="button"
        className={
          triggerClassName ? `${styles.menuTrigger} ${triggerClassName}` : styles.menuTrigger
        }
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={hideLabel ? label : undefined}
        data-ui={dataUi}
        onClick={() => (open ? close(false) : openAt('first'))}
        onKeyDown={onTriggerKeyDown}
      >
        {icon}
        {hideLabel ? null : <span>{label}</span>}
      </button>
      {open ? (
        <div
          id={menuId}
          role="menu"
          aria-labelledby={nested ? undefined : triggerId}
          aria-label={openPage?.label}
          className={styles.menu}
          data-placement={placement}
          data-align={align}
          onKeyDown={onMenuKeyDown}
        >
          {pageEntries.map((entry) =>
            entry.kind === 'separator' ? (
              <div key={entry.id} role="separator" className={styles.menuSeparator} />
            ) : (
              renderRow({ kind: 'entry', entry }, entry.id)
            ),
          )}
          {nested ? (
            <>
              <div role="separator" className={styles.menuSeparator} />
              {renderRow({ kind: 'back' }, 'back')}
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
