import { Dexie } from 'dexie';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { countRuns, openTestDb } from '../test/db';
import { makeEntry, makeWater } from '../test/factories';
import { decodeEntry } from './codecs';
import { readAll } from './guard';
import { live, sameData, type LiveSource, type LiveState } from './live';
import type { PlatewiseDb } from './schema';

const stops: Array<() => void> = [];

afterEach(() => {
  for (const stop of stops.splice(0)) stop();
});

/** Subscribes to a source, records every announced state, and waits for states on demand. */
function watch<T>(source: LiveSource<T>) {
  const states: LiveState<T>[] = [];
  const waiters: Array<{ matches: (state: LiveState<T>) => boolean; resolve: () => void }> = [];
  const stop = source.subscribe(() => {
    const state = source.getSnapshot();
    states.push(state);
    for (const waiter of [...waiters]) {
      if (waiter.matches(state)) {
        waiters.splice(waiters.indexOf(waiter), 1);
        waiter.resolve();
      }
    }
  });
  stops.push(stop);
  return {
    states,
    stop,
    /** The values of the ready states, in order. */
    values: () => states.flatMap((state) => (state.status === 'ready' ? [state.value] : [])),
    /** Resolves once the current or a later state passes `matches`. */
    until(matches: (state: LiveState<T>) => boolean): Promise<void> {
      if (matches(source.getSnapshot())) return Promise.resolve();
      return new Promise((resolve) => waiters.push({ matches, resolve }));
    },
  };
}

function ready<T>(predicate: (value: T) => boolean = () => true) {
  return (state: LiveState<T>) => state.status === 'ready' && predicate(state.value);
}

/** Lets requests already queued in the fake database finish (no Dexie re-run is awaited). */
async function settle(db: PlatewiseDb): Promise<void> {
  await db.water.count();
}

/** The water table in id order, counting runs; closed after the test. */
function countedWater(db: PlatewiseDb) {
  const counted = countRuns(() => db.water.orderBy('id').toArray());
  stops.push(() => counted.close());
  return counted;
}

describe('live', () => {
  it('starts loading, then holds the result, then follows a committed write', async () => {
    const { db } = await openTestDb();
    const first = makeWater({ id: 'w1' });
    await db.water.put(first);

    const source = live(() => db.water.orderBy('id').toArray());
    expect(source.getSnapshot()).toEqual({ status: 'loading' });
    const seen = watch(source);
    await seen.until(ready());

    const second = makeWater({ id: 'w2' });
    await db.water.put(second);
    await seen.until(ready((rows) => rows.length === 2));
    expect(seen.values()).toEqual([[first], [first, second]]);
    db.close();
  });

  it('ends a subscriber that starts during an open write on the committed value (R06.3)', async () => {
    const { db } = await openTestDb();
    const before = makeWater({ id: 'w1' });
    await db.water.put(before);
    // A screen that is already open keeps the query warm, as in the app.
    const open = watch(live(() => db.water.orderBy('id').toArray()));
    await open.until(ready());

    let release!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    let started!: () => void;
    const writing = new Promise<void>((resolve) => (started = resolve));
    const added = [makeWater({ id: 'w2' }), makeWater({ id: 'w3' })];
    const write = db.transaction('rw', db.water, async () => {
      await db.water.put(added[0]!);
      // Signal from outside the transaction's scope so the test does not run inside it.
      Dexie.ignoreTransaction(() => started());
      await Dexie.waitFor(held);
      await db.water.put(added[1]!);
    });
    await writing;

    // A screen opened mid-write reads before the write has committed…
    const late = watch(live(() => db.water.orderBy('id').toArray()));
    await late.until(ready());
    expect(late.values()).toEqual([[before]]);

    // …and must still end on the committed value once it lands.
    release();
    await write;
    const committed = [before, ...added];
    await late.until(ready((rows) => rows.length === 3));
    expect(late.values().at(-1)).toEqual(committed);
    expect(open.values().at(-1)).toEqual(committed);
    db.close();
  });

  it('ends on the old value when a write fails and rolls back', async () => {
    const { db } = await openTestDb();
    const kept = makeWater({ id: 'w1' });
    await db.water.put(kept);
    const seen = watch(live(() => db.water.orderBy('id').toArray()));
    await seen.until(ready());

    await expect(
      db.transaction('rw', db.water, async () => {
        await db.water.put(makeWater({ id: 'w-lost' }));
        throw new Error('the write failed half way');
      }),
    ).rejects.toThrow('the write failed half way');
    const next = makeWater({ id: 'w2' });
    await db.water.put(next);
    await seen.until(ready((rows) => rows.length === 2));

    expect(seen.values()).toEqual([[kept], [kept, next]]);
    db.close();
  });

  it('does not announce a re-run whose result equals the last one', async () => {
    const { db } = await openTestDb();
    const row = makeWater({ id: 'w1' });
    await db.water.put(row);
    const counted = countedWater(db);
    const seen = watch(live(counted.query));
    await seen.until(ready());
    const runs = counted.runs();

    await db.water.put({ ...row });
    await counted.untilRuns(runs + 1);
    expect(seen.states).toHaveLength(1);

    await db.water.put({ ...row, ml: 500 });
    await seen.until(ready((rows) => rows[0]?.ml === 500));
    expect(seen.states).toHaveLength(2);
    db.close();
  });

  it('delivers a thrown query as an error state', async () => {
    const { db } = await openTestDb();
    const seen = watch(
      live(async () => {
        await db.water.count();
        throw new Error('bad query');
      }),
    );
    await seen.until((state) => state.status === 'error');
    expect(seen.states).toEqual([{ status: 'error', error: new Error('bad query') }]);
    db.close();
  });

  it('starts again for a new first listener after an error', async () => {
    const { db } = await openTestDb();
    let fail = true;
    const source = live(async () => {
      const count = await db.water.count();
      if (fail) throw new Error('not yet');
      return count;
    });
    const first = watch(source);
    await first.until((state) => state.status === 'error');
    first.stop();

    fail = false;
    const second = watch(source);
    await second.until(ready());
    expect(source.getSnapshot()).toEqual({ status: 'ready', value: 0 });
    db.close();
  });

  it('stops re-running once the last listener leaves', async () => {
    const { db } = await openTestDb();
    const counted = countedWater(db);
    const source = live(counted.query);
    const one = watch(source);
    const two = watch(source);
    await one.until(ready());
    one.stop();

    await db.water.put(makeWater());
    await two.until(ready((rows) => rows.length === 1));
    two.stop();
    const runs = counted.runs();

    // A query still subscribed sees the next write; the stopped one must not run for it.
    const witness = countedWater(db);
    const witnessed = watch(live(witness.query));
    await witnessed.until(ready());
    await db.water.put(makeWater());
    await witness.untilRuns(2);
    expect(counted.runs()).toBe(runs);
    expect(source.getSnapshot()).toMatchObject({ status: 'ready' });
    db.close();
  });
});

describe('other tabs', () => {
  it('shows an entry added in one tab in another open tab (ACC-L7-1)', async () => {
    const first = await openTestDb();
    const second = await openTestDb({ indexedDB: first.factory, name: first.name });
    const shown = watch(live(() => readAll(second.db, 'entries', decodeEntry)));
    await shown.until(ready());

    const entry = makeEntry();
    await first.db.entries.put(entry);
    await shown.until(ready((result) => result.items.length === 1));
    expect(shown.values().at(-1)).toEqual({ items: [entry], dropped: 0 });
    first.db.close();
    second.db.close();
  });

  it('re-reads when Dexie announces a change from another tab', async () => {
    const { db, factory, name } = await openTestDb();
    const seen = watch(live(() => db.entries.orderBy('id').toArray()));
    await seen.until(ready());

    // Dexie announces every committed write to other tabs on a BroadcastChannel; catch one.
    const posts = vi.spyOn(BroadcastChannel.prototype, 'postMessage');
    const local = makeEntry({ id: 'a' });
    await db.entries.put(local);
    const channels = posts.mock.contexts as BroadcastChannel[];
    const index = channels.findIndex((channel) => channel.name.includes('storagemutated'));
    expect(index).toBeGreaterThanOrEqual(0);
    const channelName = channels[index]!.name;
    const announcement = posts.mock.calls[index]![0];
    posts.mockRestore();
    await seen.until(ready((rows) => rows.length === 1));

    // Another tab writes straight to IndexedDB: nothing in this tab hears of it…
    const remote = makeEntry({ id: 'b' });
    await new Promise<void>((resolve, reject) => {
      const request = factory.open(name);
      request.onsuccess = () => {
        const tx = request.result.transaction('entries', 'readwrite');
        tx.objectStore('entries').put(remote);
        tx.oncomplete = () => {
          request.result.close();
          resolve();
        };
        tx.onerror = () => reject(tx.error);
      };
      request.onerror = () => reject(request.error);
    });
    await settle(db);
    expect(seen.values().at(-1)).toEqual([local]);

    // …until that tab's Dexie announces it on the shared channel.
    const otherTab = new BroadcastChannel(channelName);
    otherTab.postMessage(announcement);
    await seen.until(ready((rows) => rows.length === 2));
    otherTab.close();
    expect(seen.values().at(-1)).toEqual([local, remote]);
    db.close();
  });
});

describe('sameData', () => {
  it('compares plain data deeply', () => {
    expect(sameData({ a: [1, { b: 'x' }], c: undefined }, { a: [1, { b: 'x' }] })).toBe(true);
    expect(sameData([new Date(1)], [new Date(1)])).toBe(true);
    expect(sameData(new Uint8Array([1, 2]), new Uint8Array([1, 2]))).toBe(true);
    expect(sameData(Number.NaN, Number.NaN)).toBe(true);
    expect(sameData({ items: [], dropped: 0 }, { items: [], dropped: 0 })).toBe(true);
  });

  it('tells different data apart', () => {
    expect(sameData({ a: 1 }, { a: 2 })).toBe(false);
    expect(sameData([1, 2], [2, 1])).toBe(false);
    expect(sameData([1], { 0: 1 })).toBe(false);
    expect(sameData(new Date(1), new Date(2))).toBe(false);
    expect(sameData(new Uint8Array([1]), new Uint8Array([1, 0]))).toBe(false);
    expect(sameData(null, {})).toBe(false);
    expect(sameData(0, -0)).toBe(false);
  });

  it('compares blobs and other class instances by identity only', () => {
    const blob = new Blob(['a']);
    expect(sameData({ thumb: blob }, { thumb: blob })).toBe(true);
    expect(sameData({ thumb: blob }, { thumb: new Blob(['a']) })).toBe(false);
    expect(sameData(new Map(), new Map())).toBe(false);
  });
});
