import { afterEach, describe, expect, it, vi } from 'vitest';
import { fixedClock } from '../lib/clock';
import { openTestDb } from '../test/db';
import { FACTORY_NOW, makeEntry, makeProfileRow } from '../test/factories';
import { createBus, type Bus, type BusMessage } from './bus';
import { createSecretsRepo } from './repos/secretsRepo';
import { TABLE_NAMES, type PlatewiseDb } from './schema';
import { RETRY_WINDOW_MS, closeOnErase, eraseEverything, type EraseResult } from './wipe';

const clock = fixedClock(FACTORY_NOW, 'America/New_York');
const closers: Array<{ close(): void }> = [];
let channels = 0;

afterEach(() => {
  for (const item of closers.splice(0)) item.close();
  localStorage.clear();
});

/** Two buses joined like two tabs of the app. */
function twoTabs(): [Bus, Bus] {
  const name = `platewise-wipe-test-${++channels}`;
  const tabs: [Bus, Bus] = [createBus({ name }), createBus({ name })];
  closers.push(...tabs);
  return tabs;
}

/** Cache Storage holding the named entries. */
function fakeCaches(names: string[]) {
  const entries = new Set(names);
  return {
    entries,
    keys: async () => [...entries],
    delete: async (name: string) => entries.delete(name),
  };
}

/** localStorage holding the given keys. */
function fakeLocalStorage(keys: string[]) {
  const items = new Map(keys.map((key) => [key, 'x']));
  return {
    items,
    get length() {
      return items.size;
    },
    key: (index: number) => [...items.keys()][index] ?? null,
    removeItem: (key: string) => void items.delete(key),
  };
}

/** A connection that ignores every request to let go, like a stuck tab of an older build. */
function stuckConnection(factory: IDBFactory, name: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = factory.open(name);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function databaseNames(factory: IDBFactory): Promise<string[]> {
  return (await factory.databases()).map((info) => info.name ?? '');
}

/** One row in every table, a key in the secrets table and its device key in meta. */
async function fillEveryTable(db: PlatewiseDb): Promise<void> {
  await db.profile.put(makeProfileRow());
  await db.entries.put(makeEntry());
  for (const table of TABLE_NAMES) {
    if ((await db.table(table).count()) > 0) continue;
    const keyPath = db.table(table).schema.primKey.keyPath as string;
    const row =
      table === 'quarantine'
        ? { table: 'entries', key: 'x', at: FACTORY_NOW, raw: 'x', hash: 'x' }
        : { [keyPath]: `${table}-row`, value: 1 };
    await db.table(table).put(row);
  }
  await createSecretsRepo(db, { clock }).set('openai', 'sk-0123456789abcdef');
}

describe('eraseEverything', () => {
  it('deletes every table and our cache entries and storage keys, but not foreign ones', async () => {
    const { db, factory, name, bus } = await openTestDb();
    await fillEveryTable(db);
    for (const table of TABLE_NAMES) expect(await db.table(table).count()).toBeGreaterThan(0);
    const caches = fakeCaches(['platewise-shell-v3', 'platewise-photos', 'other-app', 'workbox']);
    const storage = fakeLocalStorage(['platewise-theme', 'platewise-tab', 'platewise', 'foreign']);

    const result = await eraseEverything({
      db,
      bus,
      indexedDB: factory,
      caches,
      localStorage: storage,
    });

    expect(result).toEqual({ status: 'erased' });
    expect(await databaseNames(factory)).not.toContain(name);
    expect([...caches.entries]).toEqual(['other-app', 'workbox']);
    expect([...storage.items.keys()]).toEqual(['platewise', 'foreign']);
    const reopened = await openTestDb({ indexedDB: factory, name });
    for (const table of TABLE_NAMES) expect(await reopened.db.table(table).count()).toBe(0);
    reopened.db.close();
  });

  it('posts erase before it lets go of the database', async () => {
    const { db, factory, bus } = await openTestDb();
    const heard: Array<{ type: string; open: boolean }> = [];
    bus.subscribe((message) => heard.push({ type: message.type, open: db.isOpen() }));

    await eraseEverything({ db, bus, indexedDB: factory, caches: null, localStorage: null });
    expect(heard).toEqual([{ type: 'erase', open: true }]);
    expect(db.isOpen()).toBe(false);
  });

  it('makes a second open connection hear erase and close', async () => {
    const [here, there] = twoTabs();
    const mine = await openTestDb({ bus: here });
    const other = await openTestDb({ indexedDB: mine.factory, name: mine.name, bus: there });
    const noticed = new Promise<void>((resolve) => closeOnErase(other.db, resolve, there));

    const result = await eraseEverything({
      db: mine.db,
      bus: here,
      indexedDB: mine.factory,
      caches: null,
      localStorage: null,
    });
    await noticed;

    expect(result).toEqual({ status: 'erased' });
    expect(other.db.isOpen()).toBe(false);
    expect(await databaseNames(mine.factory)).not.toContain(mine.name);
  });

  it('reports a blocked delete after one retry, and finishes once the other connection lets go', async () => {
    const { db, factory, name, bus } = await openTestDb();
    const stuck = await stuckConnection(factory, name);
    const posted: BusMessage[] = [];
    bus.subscribe((message) => posted.push(message));
    const waits: number[] = [];

    const result = await eraseEverything({
      db,
      bus,
      indexedDB: factory,
      caches: null,
      localStorage: null,
      wait: async (ms) => {
        waits.push(ms);
      },
    });

    expect(result.status).toBe('blocked');
    expect(posted).toEqual([{ type: 'erase' }, { type: 'erase' }]);
    expect(waits).toEqual([RETRY_WINDOW_MS]);
    expect(await databaseNames(factory)).toContain(name);

    stuck.close();
    expect(await (result as Extract<EraseResult, { status: 'blocked' }>).finished).toBe(true);
    expect(await databaseNames(factory)).not.toContain(name);
  });

  it('erases when the other connection lets go after the second broadcast', async () => {
    const { db, factory, name, bus } = await openTestDb();
    const stuck = await stuckConnection(factory, name);
    let erases = 0;
    bus.subscribe((message) => {
      if (message.type === 'erase' && ++erases === 2) stuck.close();
    });

    const result = await eraseEverything({
      db,
      bus,
      indexedDB: factory,
      caches: null,
      localStorage: null,
      // The window never closes on its own: only the delete can end the wait.
      wait: () => new Promise(() => {}),
    });

    expect(result).toEqual({ status: 'erased' });
    expect(await databaseNames(factory)).not.toContain(name);
  });

  it('reports a refused delete and still clears our cache entries and storage keys', async () => {
    const { db, factory, bus } = await openTestDb();
    const refusal = new DOMException('Storage is blocked', 'SecurityError');
    vi.spyOn(factory, 'deleteDatabase').mockImplementation(() => {
      throw refusal;
    });
    const caches = fakeCaches(['platewise-shell-v3', 'other-app']);
    const storage = fakeLocalStorage(['platewise-theme', 'foreign']);

    const result = await eraseEverything({
      db,
      bus,
      indexedDB: factory,
      caches,
      localStorage: storage,
    });

    expect(result).toEqual({ status: 'failed', cause: refusal });
    expect([...caches.entries]).toEqual(['other-app']);
    expect([...storage.items.keys()]).toEqual(['foreign']);
  });

  it('reports a cache that cannot be cleared, after the database is gone', async () => {
    const { db, factory, name, bus } = await openTestDb();
    const refusal = new DOMException('Denied', 'SecurityError');
    const caches = { keys: () => Promise.reject(refusal), delete: async () => true };
    const storage = fakeLocalStorage(['platewise-theme']);

    const result = await eraseEverything({
      db,
      bus,
      indexedDB: factory,
      caches,
      localStorage: storage,
    });

    expect(result).toEqual({ status: 'failed', cause: refusal });
    expect(await databaseNames(factory)).not.toContain(name);
    expect(storage.items.size).toBe(0);
  });

  it("uses the browser's localStorage and skips Cache Storage where there is none", async () => {
    const { db, factory, name, bus } = await openTestDb();
    localStorage.setItem('platewise-theme', 'dark');
    localStorage.setItem('platewise-last-tab', 'home');
    localStorage.setItem('someone-else', 'keep');
    expect(typeof (globalThis as { caches?: unknown }).caches).toBe('undefined');

    const result = await eraseEverything({ db, bus, indexedDB: factory });

    expect(result).toEqual({ status: 'erased' });
    expect(await databaseNames(factory)).not.toContain(name);
    expect(Object.keys(localStorage)).toEqual(['someone-else']);
  });
});

describe('closeOnErase', () => {
  it('closes on an erase from another tab and gives the notice once', async () => {
    const [here, there] = twoTabs();
    const other = await openTestDb({ bus: there });
    const notices = vi.fn();
    let heardBoth!: () => void;
    const bothHeard = new Promise<void>((resolve) => (heardBoth = resolve));
    let count = 0;
    there.subscribe((message) => {
      if (message.type === 'erase' && ++count === 2) heardBoth();
    });
    closeOnErase(other.db, notices, there);

    here.post({ type: 'erase' });
    here.post({ type: 'erase' });
    await bothHeard;

    expect(other.db.isOpen()).toBe(false);
    expect(notices).toHaveBeenCalledTimes(1);
  });

  it("ignores this tab's own erase and other messages", async () => {
    const { db, bus } = await openTestDb();
    const notices = vi.fn();
    const stop = closeOnErase(db, notices, bus);

    bus.post({ type: 'erase' });
    bus.post({ type: 'settings-loaded' });
    expect(db.isOpen()).toBe(true);
    expect(notices).not.toHaveBeenCalled();
    stop();
    db.close();
  });
});
