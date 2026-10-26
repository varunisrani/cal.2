import { Dexie } from 'dexie';
import { describe, expect, it, onTestFinished } from 'vitest';
import type { DiaryEntry, WaterLog } from '../domain/model';
import { freshDbOptions, openTestDb, type TestDbOptions } from '../test/db';
import { factories } from '../test/factories';
import { manualSource, ready, tappedQuery, watch } from '../test/live';
import { transact } from './db';
import { feedOf, live } from './live';

const make = factories();

/** Dexie 4 announces every commit to other tabs on this channel. If an upgrade renames it, the
 *  cross-tab test below fails and the claim that table changes need no bus must be checked again. */
const DEXIE_CROSS_TAB_CHANNEL = 'x-storagemutated-1';

/** A promise and the function that settles it. */
function signal(): { promise: Promise<void>; fire: () => void } {
  let fire!: () => void;
  const promise = new Promise<void>((resolve) => (fire = resolve));
  return { promise, fire };
}

/** Writes a row with plain IndexedDB, unseen by this tab's Dexie (as another tab's write is). */
async function writeBehindDexie(options: TestDbOptions, table: string, row: unknown) {
  const connection = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = options.indexedDB.open(options.name);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  await new Promise<void>((resolve, reject) => {
    const tx = connection.transaction(table, 'readwrite');
    tx.objectStore(table).put(row);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  connection.close();
}

const mlOf = (rows: WaterLog[]) => rows.map((row) => row.ml);

describe('live', () => {
  it('a subscriber that starts during an open write ends on the committed value (R06.3)', async () => {
    const db = await openTestDb();
    const glass = make.water({ ml: 250 });
    await db.water.put(glass);
    const begun = signal();
    const release = signal();

    const writing = transact(db, 'rw', ['water'], async () => {
      await db.water.put({ ...glass, ml: 300 });
      begun.fire();
      await Dexie.waitFor(release.promise);
      await db.water.put({ ...glass, ml: 500 });
    });
    await begun.promise;
    const feed = watch(live(() => db.water.toArray()));
    release.fire();
    await writing;

    await feed.until(ready((rows: WaterLog[]) => rows[0]?.ml === 500));
    // The late reader waited for the commit: it never saw the old or the half-written value.
    expect(feed.values().map(mlOf)).toEqual([[500]]);
  });

  it('stays on the committed value when the write in flight rolls back', async () => {
    const db = await openTestDb();
    const glass = make.water({ ml: 250 });
    await db.water.put(glass);
    const begun = signal();
    const release = signal();

    const writing = transact(db, 'rw', ['water'], async () => {
      await db.water.put({ ...glass, ml: 300 });
      begun.fire();
      await Dexie.waitFor(release.promise);
      throw new Error('cancelled');
    });
    await begun.promise;
    const feed = watch(live(() => db.water.toArray()));
    release.fire();
    await expect(writing).rejects.toThrow('cancelled');

    await feed.until(ready());
    expect(feed.values().map(mlOf)).toEqual([[250]]);
  });

  it('shows an entry added in one tab in another open tab (ACC-L7-1, R06.3)', async () => {
    const options = freshDbOptions();
    const tabA = await openTestDb(options);
    const tabB = await openTestDb(options);
    const feed = watch(live(() => tabB.entries.toArray()));
    await feed.until(ready((rows: DiaryEntry[]) => rows.length === 0));

    const added = make.entry({ name: 'Pear' });
    await transact(tabA, 'rw', ['entries'], () => tabA.entries.add(added));

    await feed.until(ready((rows: DiaryEntry[]) => rows.length === 1));
    expect(feed.values().at(-1)).toEqual([added]);
  });

  it('re-reads when another tab announces its write on the channel Dexie shares between tabs', async () => {
    const options = freshDbOptions();
    const db = await openTestDb(options);
    const feed = watch(live(() => db.entries.toArray()));
    await feed.until(ready((rows: DiaryEntry[]) => rows.length === 0));

    // Every commit here is announced to other tabs; keep one announcement to replay.
    const otherTab = new BroadcastChannel(DEXIE_CROSS_TAB_CHANNEL);
    onTestFinished(() => otherTab.close());
    const announced = new Promise<Record<string, unknown>>((resolve) => {
      otherTab.onmessage = (event: MessageEvent<Record<string, unknown>>) => resolve(event.data);
    });
    await db.entries.put(make.entry());
    const announcement = await announced;
    expect(Object.keys(announcement)).toContain(`idb://${options.name}/entries/`);
    await feed.until(ready((rows: DiaryEntry[]) => rows.length === 1));

    // Another tab writes (this tab's Dexie cannot see it) and announces its commit.
    await writeBehindDexie(options, 'entries', make.entry({ name: 'From the other tab' }));
    otherTab.postMessage(announcement);

    const latest = await feed.until(ready((rows: DiaryEntry[]) => rows.length === 2));
    expect(latest).toMatchObject({
      value: expect.arrayContaining([expect.objectContaining({ name: 'From the other tab' })]),
    });
  });

  it('does not publish again after an identical row is written', async () => {
    const db = await openTestDb();
    const entry = make.entry();
    await db.entries.put(entry);
    const query = tappedQuery(() => db.entries.toArray());
    const feed = watch(feedOf(query.open));
    await query.answered(1);

    await db.entries.put({ ...entry });
    // Dexie ran the query again and delivered a fresh copy of the same rows; the feed kept quiet.
    await query.answered(2);
    expect(query.answers[1]).not.toBe(query.answers[0]);
    expect(query.answers[1]).toEqual(query.answers[0]);
    expect(feed.values()).toEqual([[entry]]);

    const other = make.entry({ name: 'Plum' });
    await db.entries.put(other);
    await feed.until(ready((rows: DiaryEntry[]) => rows.length === 2));
    expect(feed.values().map((rows) => rows.length)).toEqual([1, 2]);
  });

  it('turns a failing query into an error value and recovers after the next change', async () => {
    const db = await openTestDb();
    let broken = true;
    const feed = watch(
      live(async () => {
        if (broken) throw new Error('query failed');
        return db.water.toArray();
      }),
    );
    const failed = await feed.until((state) => state.status === 'error');
    expect(failed).toMatchObject({ error: new Error('query failed') });

    broken = false;
    await db.water.put(make.water({ ml: 330 }));
    await feed.until(ready((rows: WaterLog[]) => rows.length === 1));
    expect(feed.states.map((state) => state.status)).toEqual(['error', 'ready']);
  });

  it('stops re-running the query after the last listener leaves', async () => {
    const db = await openTestDb();
    let runs = 0;
    const feed = live(async () => {
      runs += 1;
      return db.water.count();
    });
    const first = watch(feed);
    await first.until(ready());
    // A second feed on the same table, still listening, shows when live queries re-ran.
    const probe = watch(live(() => db.water.count()));
    await probe.until(ready((count: number) => count === 0));
    first.stop();
    const runsWhenStopped = runs;

    await db.water.put(make.water());
    await probe.until(ready((count: number) => count === 1));
    expect(runs).toBe(runsWhenStopped);
  });
});

describe('feedOf', () => {
  it('starts loading, publishes a new answer and skips an equal copy', () => {
    const source = manualSource<{ id: string; ml: number }[]>();
    const feed = feedOf(source.open);
    const seen = watch(feed);
    expect(feed.current()).toEqual({ status: 'loading' });

    const rows = [{ id: 'water-1', ml: 250 }];
    source.emit(rows);
    const first = feed.current();
    source.emit(structuredClone(rows));
    expect(feed.current()).toBe(first);
    source.emit([{ id: 'water-1', ml: 300 }]);

    expect(seen.values()).toEqual([rows, [{ id: 'water-1', ml: 300 }]]);
  });

  it('shares one source between listeners and closes it after the last one leaves', () => {
    const source = manualSource<number>();
    const feed = feedOf(source.open);
    const stopA = feed.subscribe(() => {});
    const stopB = feed.subscribe(() => {});
    expect([source.opened(), source.active()]).toEqual([1, 1]);
    stopA();
    expect(source.active()).toBe(1);
    stopB();
    expect(source.active()).toBe(0);
    // React's StrictMode subscribes again after cleaning up.
    feed.subscribe(() => {});
    expect([source.opened(), source.active()]).toEqual([2, 1]);
  });

  it('turns a source failure into an error value and closes that source', () => {
    const source = manualSource<number>();
    const feed = feedOf(source.open);
    watch(feed);
    source.emit(3);
    source.fail(new Error('gone'));
    expect(feed.current()).toEqual({ status: 'error', error: new Error('gone') });
    expect(source.active()).toBe(0);
  });
});
