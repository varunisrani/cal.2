// Working out the nutrition cards' numbers without holding up the page (P07-16): the domain's
// step-by-step computation runs in short slices, the page getting a turn between them, and a
// newer request cancels the older one between two slices, so an old result never replaces a newer
// one. The last finished result stays on offer while a newer one is being worked out.

import { useEffect, useState, useSyncExternalStore } from 'react';
import {
  windowNutritionSteps,
  type WindowNutrition,
  type WindowNutritionInput,
} from '../../domain/progress/averages';

/** How long one slice may run before the page gets a turn, in ms. */
const SLICE_MS = 8;

export interface SliceOptions {
  /** At most this many steps in one slice (tests); otherwise only the time limit applies. */
  readonly stepsPerSlice?: number;
}

/**
 * Runs `steps` in slices of about 8 ms, each slice in its own task, and hands the final value to
 * `onDone`. The returned function cancels: no further slice runs and `onDone` is never called.
 */
export function runInSlices<T>(
  steps: Iterator<unknown, T, undefined>,
  onDone: (value: T) => void,
  { stepsPerSlice = Number.POSITIVE_INFINITY }: SliceOptions = {},
): () => void {
  let cancelled = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const slice = (): void => {
    timer = undefined;
    const started = performance.now();
    let taken = 0;
    for (;;) {
      const step = steps.next();
      if (step.done) {
        onDone(step.value);
        return;
      }
      taken += 1;
      if (taken >= stepsPerSlice || performance.now() - started >= SLICE_MS) break;
    }
    if (!cancelled) timer = setTimeout(slice, 0);
  };

  timer = setTimeout(slice, 0);
  return () => {
    cancelled = true;
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
  };
}

export interface NutritionStatsView {
  /** The newest finished numbers, which may belong to an earlier input; null before any. */
  readonly stats: WindowNutrition | null;
  /** True while `stats` are not (yet) the numbers of the current input. */
  readonly stale: boolean;
}

interface Finished {
  readonly input: WindowNutritionInput;
  readonly stats: WindowNutrition;
}

/**
 * One screen's runs as a small store, read like the live data (`useSyncExternalStore`): the newest
 * finished result, and at most one run in progress.
 */
function statsTask() {
  let finished: Finished | null = null;
  let cancel: (() => void) | null = null;
  const listeners = new Set<() => void>();
  return {
    subscribe(onChange: () => void): () => void {
      listeners.add(onChange);
      return () => listeners.delete(onChange);
    },
    snapshot: (): Finished | null => finished,
    /** Works out `input`, cancelling the run in progress. */
    start(input: WindowNutritionInput): void {
      cancel?.();
      cancel = runInSlices(windowNutritionSteps(input), (stats) => {
        cancel = null;
        finished = { input, stats };
        for (const listener of [...listeners]) listener();
      });
    },
    /** Cancels the run in progress; the last finished result stays. */
    stop(): void {
      cancel?.();
      cancel = null;
    },
  };
}

/**
 * The nutrition numbers of `input`, worked out in slices. Null input (its data still being read)
 * starts nothing. A new input (another window, entry list or goal list: compared by identity, so
 * pass a memoised one) cancels the run in progress; until the new run ends the previous numbers
 * stay, marked stale.
 */
export function useNutritionStats(input: WindowNutritionInput | null): NutritionStatsView {
  const [task] = useState(statsTask);
  const finished = useSyncExternalStore(task.subscribe, task.snapshot);

  useEffect(() => {
    if (input === null) return undefined;
    task.start(input);
    return task.stop;
  }, [task, input]);

  return { stats: finished?.stats ?? null, stale: finished === null || finished.input !== input };
}
