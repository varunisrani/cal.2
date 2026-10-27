// Write-back's trigger in the running app (P11-03): live queries over the diary entries and the
// weigh-ins, so every change from any screen, a restore, an import or another tab starts a pass.
// The pass itself compares what is stored with what was last sent, so the watch only says "look
// again" and never what changed.

import type { LiveSource } from '../../data/live';
import { dayKeyOf, startOfDay } from '../../domain/dates/dayKey';
import type { Clock } from '../../lib/clock';
import { syncWindow } from './records';

/** The reads the watch keeps live; only that they changed matters, not what they hold. */
export interface WatchRepos {
  /** The diary repository's `since`. */
  readonly diaryRepo: { since(ms: number): Promise<unknown> };
  /** The weight repository's `history`. */
  readonly weightRepo: { history(): Promise<unknown> };
  readonly clock: Clock;
  /**
   * `live` from src/data/live.ts. Handed in by the start-up code, which has it already, so the
   * health chunk never pulls the database library into a chunk of its own.
   */
  readonly live: <T>(query: () => Promise<T>) => LiveSource<T>;
}

/** Calls `onChange` after each change to the stored entries or weigh-ins; returns the stop. */
export type HealthWatch = (onChange: () => void) => () => void;

/**
 * A watch over the entries logged since the start of the write-back window (when it starts) and
 * every weigh-in. The first answer of each query is not a change and is not reported.
 */
export function storedHealthWatch({ diaryRepo, weightRepo, clock, live }: WatchRepos): HealthWatch {
  return (onChange) => {
    const since = startOfDay(syncWindow(dayKeyOf(clock.now())).first);
    const sources: LiveSource<unknown>[] = [
      live(() => diaryRepo.since(since)),
      live(() => weightRepo.history()),
    ];
    const stops = sources.map((source) => {
      let seen = false;
      return source.subscribe(() => {
        if (source.getSnapshot().status !== 'ready') return;
        if (seen) onChange();
        seen = true;
      });
    });
    return () => {
      for (const stop of stops) stop();
    };
  };
}
