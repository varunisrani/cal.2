// The Coach conversation, one row per message (D-16.29, R04.8). Only the newest 200 messages are
// kept: each append deletes the oldest ones beyond that in its own transaction. Reset deletes every
// message and moves the conversation generation (`coachGeneration` in `meta`) on, so a reply that
// was still on its way when the person reset can be recognised and dropped (D-16.34).
//
// Writes from this tab run one at a time, in the order they were asked for, so a reply, a retry
// marker and a reset cannot overtake each other. The list is ordered by `at`, and an append keeps
// `at` strictly increasing, so oldest first is also the order of the appends.
//
// A row that cannot be read is left out of the list and kept aside in the quarantine (R04.7). No
// append replaces it and the 200 cap never deletes it; only Reset clears it, after its copy is safe.

import type { IndexableType } from 'dexie';
import type { CoachMessage, CoachMessageState } from '../../domain/model';
import type { Clock } from '../../lib/clock';
import { decodeCoachMessage } from '../codecs';
import { transact, type PlatewiseDb } from '../db';
import { guardKey, readAll, readOne, type Codec, type GuardOptions } from '../guard';
import { live, type LiveFeed } from '../live';

/** How many messages are kept (D-16.29). */
export const COACH_HISTORY_LIMIT = 200;

/** The `meta` key of the conversation generation. */
export const COACH_GENERATION_KEY = 'coachGeneration';

export interface CoachRepoOptions {
  /** Stamps the quarantine copies of unreadable rows; the device clock by default. */
  clock?: Clock;
}

export interface AppendOptions {
  /** The conversation the message belongs to. When Reset has moved on since, nothing is stored. */
  generation?: number;
}

export type AppendResult =
  /** Stored as `message` (its `at` may have moved forward to keep the order). */
  | { kind: 'added'; message: CoachMessage }
  /** The conversation was reset since `generation`: nothing was stored. */
  | { kind: 'stale' };

export interface CoachPatch {
  /** The failure marker for Retry; null clears it. Left out: unchanged. */
  state?: CoachMessageState | null;
}

export type PatchResult = 'patched' | 'missing' | 'unreadable';

export interface CoachRepo {
  /** Readable messages, oldest first. Unreadable rows are left out and kept aside. */
  list(): Promise<CoachMessage[]>;
  /** `list()`, pushed again after every committed change. */
  feed(): LiveFeed<CoachMessage[]>;
  /**
   * Stores a new message after every earlier one and trims the conversation to the newest
   * `COACH_HISTORY_LIMIT` messages. Rejects (changing nothing) when the id is already stored.
   */
  append(message: CoachMessage, options?: AppendOptions): Promise<AppendResult>;
  /** Changes the failure marker of a stored message. An unreadable row is left as it is. */
  patch(id: string, changes: CoachPatch): Promise<PatchResult>;
  /** Deletes every message and returns the new generation. */
  reset(): Promise<number>;
  /** The current generation (0 before the first reset), after this tab's earlier writes. */
  generation(): Promise<number>;
}

/** A stored generation: a whole number from 0 up. */
const decodeGeneration: Codec<number> = (raw) => {
  const value = typeof raw === 'object' && raw !== null ? (raw as { value?: unknown }).value : null;
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;
};

function oldestFirst(a: CoachMessage, b: CoachMessage): number {
  if (a.at !== b.at) return a.at - b.at;
  if (a.id === b.id) return 0;
  return a.id < b.id ? -1 : 1;
}

/** Per connection: the end of this tab's line of Coach operations. */
const lines = new WeakMap<PlatewiseDb, Promise<unknown>>();

/** Runs `task` once every operation queued before it on `db` has settled. */
function inTurn<T>(db: PlatewiseDb, task: () => Promise<T>): Promise<T> {
  const before = lines.get(db) ?? Promise.resolve();
  const run = before.then(task);
  // A failed operation must not stop the ones after it.
  lines.set(
    db,
    run.catch(() => undefined),
  );
  return run;
}

export function coachRepo(db: PlatewiseDb, options: CoachRepoOptions = {}): CoachRepo {
  const guard: GuardOptions = { clock: options.clock };

  async function readList(): Promise<CoachMessage[]> {
    const { items } = await readAll(db, 'coachMessages', decodeCoachMessage, guard);
    return items.sort(oldestFirst);
  }

  /** An unreadable generation reads as 0 (and is kept aside by the guard). */
  async function storedGeneration(): Promise<number> {
    const found = await readOne(db, 'meta', COACH_GENERATION_KEY, decodeGeneration, guard);
    return found.kind === 'ok' ? found.value : 0;
  }

  return {
    list: readList,

    feed: () => live(readList),

    async append(message, { generation } = {}) {
      if (decodeCoachMessage(message) === null) {
        throw new TypeError('Refusing to store a Coach message that would not read back');
      }
      return inTurn(db, () =>
        transact(db, 'rw', ['coachMessages'], async (): Promise<AppendResult> => {
          if (generation !== undefined && generation !== (await storedGeneration())) {
            return { kind: 'stale' };
          }
          const earlier = await readList();
          const newest = earlier.at(-1);
          const at = newest && message.at <= newest.at ? newest.at + 1 : message.at;
          const stored = decodeCoachMessage({ ...message, at });
          if (!stored)
            throw new TypeError('Refusing to store a Coach message that would not read back');
          // `add`, never `put`: an append never replaces a stored row, readable or not.
          await db.coachMessages.add(stored);
          const excess = earlier.length + 1 - COACH_HISTORY_LIMIT;
          if (excess > 0) {
            await db.coachMessages.bulkDelete(earlier.slice(0, excess).map((old) => old.id));
          }
          return { kind: 'added', message: stored };
        }),
      );
    },

    patch(id, changes) {
      return inTurn(db, () =>
        transact(db, 'rw', ['coachMessages'], async (): Promise<PatchResult> => {
          const found = await readOne(db, 'coachMessages', id, decodeCoachMessage, guard);
          if (found.kind === 'missing') return 'missing';
          if (found.kind === 'corrupt') return 'unreadable';
          const next: CoachMessage = { ...found.value };
          if (changes.state === null) delete next.state;
          else if (changes.state !== undefined) next.state = changes.state;
          const stored = decodeCoachMessage(next);
          if (!stored)
            throw new TypeError('Refusing to store a Coach message that would not read back');
          await db.coachMessages.put(stored);
          return 'patched';
        }),
      );
    },

    reset() {
      return inTurn(db, () =>
        transact(db, 'rw', ['coachMessages'], async () => {
          // Unreadable rows are copied aside before the table is cleared; when a copy fails the
          // whole reset is refused (WriteBlockedError) and nothing is deleted.
          const keys: IndexableType[] = await db.coachMessages.toCollection().primaryKeys();
          for (const key of keys)
            await guardKey(db, 'coachMessages', key, decodeCoachMessage, guard);
          await db.coachMessages.clear();
          const next = (await storedGeneration()) + 1;
          await guardKey(db, 'meta', COACH_GENERATION_KEY, decodeGeneration, guard);
          await db.meta.put({ key: COACH_GENERATION_KEY, value: next });
          return next;
        }),
      );
    },

    generation() {
      return inTurn(db, async () => storedGeneration());
    },
  };
}
