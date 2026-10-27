import { useState } from 'react';
import type { DiaryEntry } from '../../domain/model';
import type { CombineResult } from '../../services/combine';
import { useServices } from '../../services/context';
import { Button, IconButton } from '../../ui/Button';
import { Icon } from '../../ui/icons';
import { useToast } from '../../ui/Toast';
import { useFasting } from '../fasting/hours';
import { PausedDialog } from '../fasting/PausedDialog';
import sel from './selection.module.css';
import { tx } from './text';

/** Combine needs at least this many rows. */
const COMBINE_MIN = 2;

export interface SelectionBarProps {
  /** The picked entries, in the order picked. */
  readonly entries: readonly DiaryEntry[];
  /** Cancel: picking ends and nothing changes. */
  readonly onCancel: () => void;
  /** After the combined entry was stored: picking ends. */
  readonly onCombined: () => void;
}

/**
 * The bar that takes the "+" button's place while food rows are picked (02 §3.15, 05 §3.4): how
 * many are picked, Cancel, and Combine once two are. Combine stores one entry in place of the
 * picked ones (P01-11, D-16.20). A running fast refuses it before anything is written: the paused
 * dialog says so and picking stays; its "End fast and log" ends the fast and combines (D-16.35).
 */
export function SelectionBar({ entries, onCancel, onCombined }: SelectionBarProps) {
  const { combine } = useServices();
  const fasting = useFasting();
  const toast = useToast();
  /** The running fast that refused the combine, while the paused dialog asks. */
  const [pausedBy, setPausedBy] = useState<string | null>(null);

  const run = async (): Promise<CombineResult> => {
    if (!combine) throw new Error('No combine service above Home');
    return combine.combine(entries);
  };

  /** What a refused or failed combine says; picking stays as it was. */
  const failed = (error: unknown): void => {
    console.error('Combining diary entries failed', error);
    toast.show(tx('home.selection.failed'));
  };

  const combineNow = async (): Promise<void> => {
    try {
      const result = await run();
      if (result.kind === 'combined') onCombined();
      else if (result.kind === 'fastActive') setPausedBy(result.fast.id);
      else if (result.kind === 'missing') toast.show(tx('home.selection.missing'));
    } catch (error) {
      failed(error);
    }
  };

  // "End fast and log": ends the fast, then combines (a fast already ended elsewhere is fine).
  const endFastAndCombine = async (): Promise<void> => {
    if (pausedBy === null) return;
    try {
      await fasting().end(pausedBy);
      const result = await run();
      if (result.kind === 'combined') {
        onCombined();
        return;
      }
      if (result.kind === 'fastActive') toast.show(tx('fasting.paused.failed'));
      else if (result.kind === 'missing') toast.show(tx('home.selection.missing'));
    } catch (error) {
      failed(error);
    }
    setPausedBy(null);
  };

  return (
    <>
      <section className={sel.bar} aria-label={tx('home.selection.label')} data-ui="home.selection">
        <IconButton
          label={tx('common.cancel')}
          icon={<Icon name="close" size={20} />}
          onClick={onCancel}
          data-ui="home.selection.cancel"
        />
        <p className={sel.count} aria-live="polite" data-ui="home.selection.count">
          {tx('home.selection.count', { count: entries.length })}
        </p>
        <Button
          variant="primary"
          disabled={entries.length < COMBINE_MIN}
          onClick={combineNow}
          data-ui="home.selection.combine"
        >
          {tx('home.selection.combine')}
        </Button>
      </section>
      <PausedDialog
        open={pausedBy !== null}
        onEndAndLog={endFastAndCombine}
        onCancel={() => setPausedBy(null)}
      />
    </>
  );
}
