import {
  useEffect,
  useId,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import type { DiaryEntry, EntrySource } from '../../domain/model';
import type { EnergyDisplayUnit } from '../../domain/units/energy';
import { formatTime } from '../../i18n/format';
import { useServices } from '../../services/context';
import { IconButton } from '../../ui/Button';
import { Dialog } from '../../ui/Dialog';
import { Icon, type IconName } from '../../ui/icons';
import { SwipeRow } from '../../ui/SwipeRow';
import { useToast } from '../../ui/Toast';
import { energyText } from './energy';
import styles from './home.module.css';
import sel from './selection.module.css';
import { tx } from './text';

/** The tile's icon for an entry without an emoji: how it was logged. */
const SOURCE_ICONS: Readonly<Record<EntrySource, IconName>> = {
  photo: 'camera',
  label: 'text',
  barcode: 'barcode',
  text: 'chat',
  manual: 'pencil',
};

/** How long a press must be held still, in ms, to start picking rows. */
export const LONG_PRESS_MS = 500;
/** Movement in px that makes a press a swipe or a scroll instead (as the swipe row reads it). */
const PRESS_SLOP = 10;

/** What Home does with a food row besides deleting it. */
export interface FoodRowActions {
  /** The picked entries' ids while rows are picked for a combine; null otherwise. */
  readonly picked: ReadonlySet<string> | null;
  /** Ids of the entries with a saved copy; null until the saved meals have been read. */
  readonly saved: ReadonlySet<string> | null;
  /** A tap outside picking: opens the entry in the editor. */
  readonly onOpen: (entry: DiaryEntry) => void;
  /** A long-press or the Select button: starts picking with the entry, or adds it. */
  readonly onPick: (entry: DiaryEntry) => void;
  /** A tap while picking: picks the entry, or lets it go. */
  readonly onToggle: (entry: DiaryEntry) => void;
}

export interface EntryRowProps {
  readonly entry: DiaryEntry;
  readonly energyUnit: EnergyDisplayUnit;
  /** Tap, long-press, Select and the heart (Home); without them the row shows and deletes. */
  readonly actions?: FoodRowActions;
}

interface Press {
  readonly pointerId: number;
  readonly x: number;
  readonly y: number;
  readonly timer: ReturnType<typeof setTimeout>;
}

/**
 * A press held still for `LONG_PRESS_MS` calls `onLongPress`; moving, letting go or leaving
 * before then keeps it an ordinary press. `takeFired` says, once, that the click ending the press
 * belongs to a long-press and must do nothing more.
 */
function useLongPress(onLongPress: () => void) {
  const press = useRef<Press | null>(null);
  const fired = useRef(false);

  const stop = (): void => {
    if (press.current === null) return;
    clearTimeout(press.current.timer);
    press.current = null;
  };
  useEffect(() => stop, []);

  return {
    handlers: {
      onPointerDown(event: ReactPointerEvent<HTMLElement>): void {
        stop();
        fired.current = false;
        if (event.button !== 0) return;
        const timer = setTimeout(() => {
          press.current = null;
          fired.current = true;
          onLongPress();
        }, LONG_PRESS_MS);
        press.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, timer };
      },
      onPointerMove(event: ReactPointerEvent<HTMLElement>): void {
        const current = press.current;
        if (current === null || event.pointerId !== current.pointerId) return;
        const dx = Math.abs(event.clientX - current.x);
        const dy = Math.abs(event.clientY - current.y);
        if (dx >= PRESS_SLOP || dy >= PRESS_SLOP) stop();
      },
      onPointerUp: stop,
      onPointerCancel: stop,
      onPointerLeave: stop,
      // A touch held still opens the browser's own menu; this hold is ours.
      onContextMenu(event: ReactMouseEvent<HTMLElement>): void {
        if (press.current !== null || fired.current) event.preventDefault();
      },
      // A key press never ends a long-press.
      onKeyDown(): void {
        fired.current = false;
      },
    },
    takeFired(): boolean {
      const was = fired.current;
      fired.current = false;
      return was;
    },
  };
}

/**
 * One food entry in the diary: its emoji (or an icon for how it was logged), name, time, energy
 * in the person's unit and whole grams of protein, carbs and fat. Swiping it toward the leading
 * edge, or its delete button, asks before anything is deleted. On Home a tap also opens the
 * entry's editor, a long-press (or its Select button, shown on keyboard focus) starts picking rows
 * for a combine, and a heart adds a copy to the saved meals or takes it out. While rows are picked
 * a tap picks this one or lets it go, and the row can be neither swiped nor deleted. The tap
 * target is a button holding the name only, so its name ("Edit Toast") holds all the text it
 * shows (WCAG 2.5.3); its hit area and focus ring cover the tile and both lines.
 */
export function EntryRow({ entry, energyUnit, actions }: EntryRowProps) {
  const { diary } = useServices();
  const toast = useToast();
  const [asking, setAsking] = useState(false);
  const id = useId();
  const nameId = `${id}-name`;
  const energyId = `${id}-energy`;
  const pressRef = useRef<HTMLButtonElement>(null);
  const longPress = useLongPress(() => actions?.onPick(entry));

  const picking = actions !== undefined && actions.picked !== null;
  const picked = picking && actions.picked?.has(entry.id) === true;
  const saved = actions?.saved ? actions.saved.has(entry.id) : null;
  const toggleSaved = diary.toggleSaved;

  const remove = async (): Promise<void> => {
    try {
      await diary.deleteEntry(entry.id);
    } catch (error) {
      console.error('Deleting a diary entry failed', error);
      toast.show(tx('home.entry.deleteFailed'));
    }
    // Once deleted, the row usually leaves with its dialog before this runs.
    setAsking(false);
  };

  const press = (): void => {
    if (longPress.takeFired() || !actions) return;
    if (picking) actions.onToggle(entry);
    else actions.onOpen(entry);
  };

  const select = (): void => {
    actions?.onPick(entry);
    // The Select button goes once picking starts; the row itself keeps the focus.
    pressRef.current?.focus();
  };

  const flipSaved = async (): Promise<void> => {
    if (!toggleSaved) return;
    try {
      await toggleSaved(entry);
    } catch (error) {
      console.error('Changing the saved meals failed', error);
      toast.show(tx('home.entry.saveFailed'));
    }
  };

  const nameText = (
    <span id={nameId} className={styles.entryName}>
      {entry.name}
    </span>
  );

  /** The tile and the two lines, with `name` (the name, or the button holding it) first. */
  const content = (name: ReactNode): ReactNode => (
    <>
      <span className={styles.tile} aria-hidden="true">
        {entry.emoji ? (
          <span className={styles.emoji}>{entry.emoji}</span>
        ) : (
          <Icon name={SOURCE_ICONS[entry.source]} size={22} />
        )}
      </span>
      <span className={styles.entryText}>
        <span className={styles.entryLine}>
          {name}
          <time className={styles.entryTime} dateTime={new Date(entry.loggedAt).toISOString()}>
            {formatTime(entry.loggedAt)}
          </time>
        </span>
        <span className={styles.entryLine}>
          <span id={energyId} className={styles.entryEnergy}>
            {energyText(entry.kcal, energyUnit)}
          </span>
          <span className={styles.entryMacros}>
            {tx('home.entry.macros', {
              protein: Math.round(entry.protein),
              carbs: Math.round(entry.carbs),
              fat: Math.round(entry.fat),
            })}
          </span>
        </span>
      </span>
    </>
  );

  return (
    <>
      <SwipeRow
        onRequestDelete={() => setAsking(true)}
        deleteLabel={tx('home.entry.deleteLabel', { name: entry.name })}
        disabled={picking}
        data-ui="entry.row"
      >
        {actions ? (
          <div
            role="group"
            aria-labelledby={`${nameId} ${energyId}`}
            className={sel.row}
            data-picked={picked || undefined}
          >
            <div className={sel.press} data-picking={picking || undefined}>
              {picking ? (
                <span className={sel.check} aria-hidden="true" data-picked={picked || undefined}>
                  {picked ? <Icon name="check" size={16} /> : null}
                </span>
              ) : null}
              {content(
                <button
                  ref={pressRef}
                  type="button"
                  className={sel.pressTarget}
                  aria-label={tx(picking ? 'home.entry.select' : 'home.entry.open', {
                    name: entry.name,
                  })}
                  aria-pressed={picking ? picked : undefined}
                  onClick={press}
                  {...longPress.handlers}
                  data-ui="entry.row.open"
                >
                  {nameText}
                </button>,
              )}
            </div>
            {!picking && saved !== null && toggleSaved ? (
              <IconButton
                label={tx('home.entry.save', { name: entry.name })}
                icon={<Icon name="heart" size={20} />}
                aria-pressed={saved}
                className={sel.heart}
                onClick={flipSaved}
                data-ui="entry.row.saved"
              />
            ) : null}
            {!picking ? (
              <button
                type="button"
                className={sel.select}
                onClick={select}
                data-ui="entry.row.select"
              >
                {tx('home.entry.select', { name: entry.name })}
              </button>
            ) : null}
          </div>
        ) : (
          <div role="group" aria-labelledby={`${nameId} ${energyId}`} className={styles.entry}>
            {content(nameText)}
          </div>
        )}
      </SwipeRow>
      <Dialog
        open={asking}
        title={tx('home.entry.deleteTitle')}
        message={tx('home.entry.deleteMessage', { name: entry.name })}
        confirmLabel={tx('common.delete')}
        destructive
        onConfirm={remove}
        onCancel={() => setAsking(false)}
        data-ui="entry.delete"
      />
    </>
  );
}
