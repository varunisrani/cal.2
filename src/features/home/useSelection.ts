import { useEffect, useRef, useState } from 'react';
import { useSheet } from '../../app/useRoute';
import type { DayKey } from '../../domain/dates/dayKey';
import type { DiaryEntry } from '../../domain/model';

/**
 * Picking rows has a place on the sheet stack, like a sheet: the browser's Back ends it, and a
 * reload never brings it back.
 */
export const SELECT_SHEET = 'select';

export interface DiarySelection {
  /** Rows are being picked: the bar shows instead of the "+" button. */
  readonly active: boolean;
  /** The picked entries still in the day's diary, in the order picked. */
  readonly chosen: readonly DiaryEntry[];
  /** The picked ids while picking, else null (the rows draw their state from it). */
  readonly picked: ReadonlySet<string> | null;
  /** A long-press or a Select button: starts picking with `entry`, or adds it. */
  readonly pick: (entry: DiaryEntry) => void;
  /** A tap while picking: picks `entry`, or lets it go. */
  readonly toggle: (entry: DiaryEntry) => void;
  /** Cancel, or after a combine: picking ends. */
  readonly end: () => void;
}

interface Picks {
  /** The day the rows were picked on. */
  readonly day: DayKey;
  readonly ids: readonly string[];
}

/**
 * Home's picking of food rows for a combine, over the day shown and its entries. Picking ends
 * when nothing picked is left (the last row let go, every picked row deleted elsewhere, another
 * day shown: a combine joins rows of one day) and when its place on the sheet stack goes (Back).
 */
export function useSelection(day: DayKey, entries: readonly DiaryEntry[]): DiarySelection {
  const { open, show, close } = useSheet(SELECT_SHEET);
  const [picks, setPicks] = useState<Picks>({ day, ids: [] });

  const ids = picks.day === day ? picks.ids : [];
  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  const chosen = ids.flatMap((id) => byId.get(id) ?? []);
  const active = chosen.length > 0;

  // The two halves of a first pick (the picks and the stack) can be drawn one render apart, so
  // each side reacts only to the other one going away, never to it not having arrived yet.
  const wasOpen = useRef(open);
  const wasActive = useRef(active);
  useEffect(() => {
    if (wasOpen.current && !open) setPicks((current) => ({ day: current.day, ids: [] }));
    wasOpen.current = open;
  }, [open]);
  useEffect(() => {
    if (wasActive.current && !active && open) close();
    wasActive.current = active;
  }, [active, open, close]);

  const pick = (entry: DiaryEntry): void => {
    if (!active) {
      setPicks({ day, ids: [entry.id] });
      show();
      return;
    }
    setPicks((current) =>
      current.ids.includes(entry.id) ? current : { day, ids: [...current.ids, entry.id] },
    );
  };

  const toggle = (entry: DiaryEntry): void => {
    if (!active) return;
    setPicks((current) => ({
      day,
      ids: current.ids.includes(entry.id)
        ? current.ids.filter((id) => id !== entry.id)
        : [...current.ids, entry.id],
    }));
  };

  return {
    active,
    chosen,
    picked: active ? new Set(chosen.map((entry) => entry.id)) : null,
    pick,
    toggle,
    end: () => {
      setPicks({ day, ids: [] });
      close();
    },
  };
}
