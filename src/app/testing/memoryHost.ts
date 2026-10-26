import type { HistoryHost } from '../router';

/**
 * A browser history in memory, for router tests: entries with a hash and a state, an index,
 * `popstate` and `hashchange` after a step (both, like a browser, when the hash differs), and a
 * window scroll offset. With `async`, steps wait until `flush()`, the way a browser reports a
 * `history.go` later.
 */
export interface MemoryHost extends HistoryHost {
  /** The browser's Back button. */
  back(): void;
  /** The browser's Forward button. */
  forward(): void;
  /** The person types a new hash in the address bar: a new entry with no state. */
  type(hash: string): void;
  /** Delivers the steps an `async` host is holding. */
  flush(): void;
  setScroll(y: number): void;
  /** The hashes of every entry, oldest first, and the index of the one on screen. */
  entries(): { hashes: string[]; index: number };
  /** How many scroll moves the router asked for. */
  scrollCalls(): number;
}

interface Entry {
  readonly hash: string;
  readonly state: unknown;
}

export function memoryHost(initialHash = '', options: { async?: boolean } = {}): MemoryHost {
  let entries: Entry[] = [{ hash: initialHash, state: null }];
  let index = 0;
  let scroll = 0;
  let scrollCalls = 0;
  const queued: number[] = [];
  const listeners = new Set<() => void>();

  const current = (): Entry => entries[index] as Entry;
  const emit = (): void => {
    for (const listener of [...listeners]) listener();
  };
  const step = (delta: number): void => {
    const target = index + delta;
    if (delta === 0 || target < 0 || target >= entries.length) return;
    const before = current().hash;
    index = target;
    emit(); // popstate
    if (current().hash !== before) emit(); // hashchange
  };

  return {
    hash: () => current().hash,
    // A browser hands back a copy of the stored state, never the object that was pushed.
    state: () => structuredClone(current().state),
    length: () => entries.length,
    push(state, hash) {
      entries = entries.slice(0, index + 1);
      entries.push({ hash, state: structuredClone(state) });
      index = entries.length - 1;
    },
    replace(state, hash) {
      entries[index] = { hash, state: structuredClone(state) };
    },
    go(delta) {
      if (options.async) queued.push(delta);
      else step(delta);
    },
    listen(onMove) {
      listeners.add(onMove);
      return () => {
        listeners.delete(onMove);
      };
    },
    scrollY: () => scroll,
    scrollTo(y) {
      scrollCalls += 1;
      scroll = y;
    },
    back() {
      this.go(-1);
    },
    forward() {
      this.go(1);
    },
    type(hash) {
      entries = entries.slice(0, index + 1);
      entries.push({ hash, state: null });
      index = entries.length - 1;
      emit();
      emit();
    },
    flush() {
      while (queued.length > 0) step(queued.shift() as number);
    },
    setScroll(y) {
      scroll = y;
    },
    entries: () => ({ hashes: entries.map((entry) => entry.hash), index }),
    scrollCalls: () => scrollCalls,
  };
}
