import type { ReadStore } from '../ports';

/** A read store a test fills in by hand: not loaded until `set` is called (a deferred read). */
export interface ControlledStore<T> extends ReadStore<T> {
  set(value: T | undefined): void;
  /** How many components are listening right now. */
  listeners(): number;
}

export function controlledStore<T>(initial?: T): ControlledStore<T> {
  let value = initial;
  const listeners = new Set<() => void>();
  return {
    getSnapshot: () => value,
    subscribe(onChange) {
      listeners.add(onChange);
      return () => {
        listeners.delete(onChange);
      };
    },
    set(next) {
      value = next;
      for (const listener of [...listeners]) listener();
    },
    listeners: () => listeners.size,
  };
}
