import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type FocusEvent,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { t } from '../i18n/t';
import { Button, IconButton, type ButtonVariant } from './Button';
import styles from './display.module.css';
import { Icon } from './icons';
import { cx, partHook } from './primitives';

export interface MenuAction {
  readonly kind: 'action';
  /** Stable within its page; the row's hook is `<menu hook>[.<page id>…].<id>`. */
  readonly id: string;
  readonly label: string;
  /** A drawing before the label; screen readers skip it. */
  readonly icon?: ReactNode;
  /** Set on rows that pick one of several modes: a check mark shows on the chosen one. */
  readonly checked?: boolean;
  /** The row stays reachable but does nothing. */
  readonly disabled?: boolean;
  /** Runs once the menu has closed and focus is back on the button. */
  readonly onSelect: () => void;
}

export interface MenuPage {
  readonly kind: 'page';
  readonly id: string;
  readonly label: string;
  readonly icon?: ReactNode;
  /** The rows of the page this row opens; a Back row follows them. */
  readonly entries: readonly MenuEntry[];
}

export interface MenuSeparator {
  readonly kind: 'separator';
  readonly id: string;
}

export type MenuEntry = MenuAction | MenuPage | MenuSeparator;

export interface MenuProps {
  /** The button's hook; the list gets `<hook>.menu` and each row its own (see the entries). */
  readonly 'data-ui': string;
  /** Names the button and the menu's first page. */
  readonly label: string;
  /** Draws the button as this icon alone; `label` stays its accessible name. */
  readonly icon?: ReactNode;
  readonly variant?: ButtonVariant;
  /** An extra class for the button, e.g. a floating round button. */
  readonly buttonClassName?: string;
  /** Opens above the button (for a button near the bottom of the screen) or below it. */
  readonly placement?: 'above' | 'below';
  /** Lines the menu up with the button's start edge or its end edge. */
  readonly align?: 'start' | 'end';
  readonly entries: readonly MenuEntry[];
  /** A class for the anchor that holds the button and the menu, e.g. to fix it in place. */
  readonly className?: string;
}

interface Page {
  /** The ids of the page rows followed from the first page; empty on the first page. */
  readonly trail: readonly string[];
  readonly label: string;
  readonly entries: readonly MenuEntry[];
}

type Row =
  | { readonly kind: 'action'; readonly hook: string; readonly entry: MenuAction }
  | { readonly kind: 'page'; readonly hook: string; readonly entry: MenuPage }
  | { readonly kind: 'back'; readonly hook: string };

type Slot = Row | { readonly kind: 'separator'; readonly hook: string };

/** Follows `trail` down from the first page, stopping where a page no longer exists. */
function pageAt(first: Page, trail: readonly string[]): Page {
  let page = first;
  for (const id of trail) {
    const next = page.entries.find(
      (entry): entry is MenuPage => entry.kind === 'page' && entry.id === id,
    );
    if (!next) break;
    page = { trail: [...page.trail, id], label: next.label, entries: next.entries };
  }
  return page;
}

/** The page's slots in drawing order, each with its hook; sub-pages end with Back. */
function slotsOf(page: Page, hook: string): Slot[] {
  const base = page.trail.reduce<string>((prefix, id) => partHook(prefix, id), hook);
  const slots: Slot[] = page.entries.map((entry): Slot => {
    const own = partHook(base, entry.id);
    if (entry.kind === 'action') return { kind: 'action', hook: own, entry };
    if (entry.kind === 'page') return { kind: 'page', hook: own, entry };
    return { kind: 'separator', hook: own };
  });
  if (page.trail.length > 0) slots.push({ kind: 'back', hook: partHook(base, 'back') });
  return slots;
}

const isRow = (slot: Slot): slot is Row => slot.kind !== 'separator';

/**
 * A drop-down menu anchored to its button. A row with a chevron opens a sub-page in place of
 * the list, and the sub-page's Back row returns to the row that opened it. Focus moves through
 * the rows with the arrow keys (rows are not in the tab order); ArrowRight opens a sub-page,
 * ArrowLeft goes back, Escape closes the menu onto its button, Tab closes it and moves on.
 */
export function Menu({
  'data-ui': hook,
  label,
  icon,
  variant = 'secondary',
  buttonClassName,
  placement = 'below',
  align = 'start',
  entries,
  className,
}: MenuProps) {
  const menuId = useId();
  const anchorRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const rowRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [open, setOpen] = useState(false);
  const [trail, setTrail] = useState<readonly string[]>([]);
  const [active, setActive] = useState(0);

  const first: Page = { trail: [], label, entries };
  const page = pageAt(first, trail);
  const slots = slotsOf(page, hook);
  const rows = slots.filter(isRow);
  const current = Math.max(0, Math.min(active, rows.length - 1));
  const pageKey = page.trail.join('\n');

  // Roving focus: the active row takes focus whenever it, the page or the open state changes.
  useLayoutEffect(() => {
    if (open) rowRefs.current[current]?.focus();
  }, [open, current, pageKey]);

  // A press anywhere outside closes the menu and leaves focus where the press put it.
  useEffect(() => {
    if (!open) return;
    const onPress = (event: PointerEvent) => {
      if (event.target instanceof Node && anchorRef.current?.contains(event.target)) return;
      setOpen(false);
    };
    document.addEventListener('pointerdown', onPress);
    return () => document.removeEventListener('pointerdown', onPress);
  }, [open]);

  const openOn = (end: 'first' | 'last') => {
    const firstRows = slotsOf(first, hook).filter(isRow);
    setTrail([]);
    setActive(end === 'first' ? 0 : Math.max(0, firstRows.length - 1));
    setOpen(true);
  };

  const close = (refocus: boolean) => {
    setOpen(false);
    if (refocus) buttonRef.current?.focus();
  };

  const enter = (target: MenuPage) => {
    setTrail([...page.trail, target.id]);
    setActive(0);
  };

  const goBack = () => {
    const leaving = page.trail[page.trail.length - 1];
    const parent = pageAt(first, page.trail.slice(0, -1));
    const opener = slotsOf(parent, hook)
      .filter(isRow)
      .findIndex((row) => row.kind === 'page' && row.entry.id === leaving);
    setTrail(parent.trail);
    setActive(Math.max(0, opener));
  };

  const activate = (row: Row) => {
    if (row.kind === 'back') return goBack();
    if (row.kind === 'page') return enter(row.entry);
    if (row.entry.disabled) return;
    close(true);
    row.entry.onSelect();
  };

  const onMenuKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Tab') {
      // Focus goes back to the button first, so Tab then moves on from there.
      close(true);
      return;
    }
    const count = rows.length;
    const row = rows[current];
    const keys: Record<string, () => void> = {
      ArrowDown: () => setActive((current + 1) % count),
      ArrowUp: () => setActive((current - 1 + count) % count),
      Home: () => setActive(0),
      End: () => setActive(count - 1),
      ArrowRight: () => {
        if (row?.kind === 'page') enter(row.entry);
      },
      ArrowLeft: () => {
        if (page.trail.length > 0) goBack();
      },
      Escape: () => close(true),
    };
    const act = keys[event.key];
    if (!act || count === 0) return;
    event.preventDefault();
    // Stops here, so Escape in a menu inside a sheet never closes the sheet too.
    event.stopPropagation();
    act();
  };

  const onMenuBlur = (event: FocusEvent<HTMLDivElement>) => {
    const next = event.relatedTarget;
    if (next instanceof Node && !anchorRef.current?.contains(next)) setOpen(false);
  };

  const buttonProps = {
    ref: buttonRef,
    'data-ui': hook,
    variant,
    className: buttonClassName,
    'aria-haspopup': 'menu' as const,
    'aria-expanded': open,
    'aria-controls': open ? menuId : undefined,
    onClick: () => (open ? close(false) : openOn('first')),
    onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => {
      if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
      event.preventDefault();
      openOn(event.key === 'ArrowDown' ? 'first' : 'last');
    },
  };

  const drawRow = (row: Row, index: number) => {
    const checked = row.kind === 'action' ? row.entry.checked : undefined;
    const lead = row.kind === 'back' ? <Icon name="chevron-left" /> : row.entry.icon;
    const end =
      row.kind === 'page' ? (
        <Icon name="chevron-right" />
      ) : checked ? (
        <Icon name="check" />
      ) : undefined;
    return (
      <button
        key={row.hook}
        ref={(element) => {
          rowRefs.current[index] = element;
        }}
        type="button"
        role={checked === undefined ? 'menuitem' : 'menuitemradio'}
        aria-checked={checked}
        aria-haspopup={row.kind === 'page' ? 'menu' : undefined}
        aria-disabled={(row.kind === 'action' && row.entry.disabled) || undefined}
        tabIndex={-1}
        data-ui={row.hook}
        data-back={row.kind === 'back' || undefined}
        className={styles.menuRow}
        onClick={() => activate(row)}
        onFocus={() => setActive(index)}
      >
        {lead !== undefined && (
          <span className={styles.menuRowIcon} aria-hidden="true">
            {lead}
          </span>
        )}
        <span className={styles.menuRowLabel}>
          {row.kind === 'back' ? t('common.back') : row.entry.label}
        </span>
        {end !== undefined && (
          <span className={styles.menuRowEnd} aria-hidden="true">
            {end}
          </span>
        )}
      </button>
    );
  };

  return (
    <div ref={anchorRef} className={cx(styles.menuAnchor, className)}>
      {icon === undefined ? (
        <Button {...buttonProps}>{label}</Button>
      ) : (
        <IconButton {...buttonProps} label={label} icon={icon} />
      )}
      {open && (
        <div
          id={menuId}
          role="menu"
          aria-label={page.label}
          data-ui={partHook(hook, 'menu')}
          data-placement={placement}
          data-align={align}
          className={styles.menu}
          onKeyDown={onMenuKeyDown}
          onBlur={onMenuBlur}
        >
          {slots.map((slot) =>
            slot.kind === 'separator' ? (
              <div key={slot.hook} role="separator" className={styles.menuSeparator} />
            ) : (
              drawRow(slot, rows.indexOf(slot))
            ),
          )}
        </div>
      )}
    </div>
  );
}
