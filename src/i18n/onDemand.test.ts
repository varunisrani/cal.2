import { afterEach, describe, expect, it, vi } from 'vitest';
import { createLiveCatalogue, lookupMessage, type MessageTree } from './catalogue';
import { enPartitions, onDemandPartitions } from './en';
import { walk } from './en/walk';
import { startupPartitions } from './startup';

// Every partition file, read as the tools read them.
const FILES = import.meta.glob<Readonly<Record<string, MessageTree>>>('./en/*.ts', {
  eager: true,
});

/**
 * The app's catalogue modules as a fresh start finds them: only the start-up partitions are
 * registered (the test setup registers every partition in the modules every other test uses).
 */
async function freshApp() {
  vi.resetModules();
  const onDemand = await import('./onDemand');
  const { t } = await import('./t');
  // A key the compiler checks; the run-time catalogue may not have it yet.
  const loose = t as unknown as (key: string, params?: Record<string, string | number>) => string;
  return { ...onDemand, t: loose };
}

afterEach(() => {
  vi.resetModules();
});

describe('createLiveCatalogue (P18-00)', () => {
  it('starts from its partitions and merges each one registered later into the same tree', () => {
    const live = createLiveCatalogue({ first: { area: { a: 'A' } } });
    const tree = live.tree;
    expect(lookupMessage(tree, 'area.a')).toBe('A');
    expect(lookupMessage(tree, 'later.b')).toBeUndefined();

    live.register('second', { area: { c: 'C' }, later: { b: 'B' } });
    expect(live.tree).toBe(tree);
    expect(lookupMessage(tree, 'area.a')).toBe('A');
    expect(lookupMessage(tree, 'area.c')).toBe('C');
    expect(lookupMessage(tree, 'later.b')).toBe('B');
    expect(live.has('first')).toBe(true);
    expect(live.has('second')).toBe(true);
    expect(live.has('third')).toBe(false);
  });

  it('does nothing when a name is registered again, and leaves the partitions as they were', () => {
    const second = { later: { b: 'B' } };
    const live = createLiveCatalogue({});
    live.register('second', second);
    live.register('second', { later: { b: 'Other', d: 'D' } });
    expect(lookupMessage(live.tree, 'later.b')).toBe('B');
    expect(lookupMessage(live.tree, 'later.d')).toBeUndefined();
    expect(second).toEqual({ later: { b: 'B' } });
  });
});

describe("the app's catalogue on demand (P18-00)", () => {
  it('starts with the start-up partitions only', async () => {
    const app = await freshApp();
    expect(app.t('common.save')).toBe('Save');
    for (const name of Object.keys(startupPartitions))
      expect(app.appCatalogue.has(name)).toBe(true);
    for (const name of Object.keys(onDemandPartitions)) {
      expect(app.appCatalogue.has(name)).toBe(false);
    }
  });

  it('throws in tests for a key of a partition not registered yet, naming it', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const app = await freshApp();
    expect(app.pendingPartition('walk.title')).toBe('walk');
    expect(() => app.t('walk.title')).toThrow(
      'Message "walk.title" is in the partition "walk", which is not registered yet',
    );
  });

  it('hands over a chunk only once its partitions are registered', async () => {
    const app = await freshApp();
    let resolveChunk!: (module: { readonly name: string }) => void;
    const chunk = new Promise<{ readonly name: string }>((resolve) => (resolveChunk = resolve));
    const handed = app.withPartitions(['walk', 'charts'], chunk);
    resolveChunk({ name: 'screen' });
    await expect(handed).resolves.toEqual({ name: 'screen' });
    expect(app.appCatalogue.has('walk')).toBe(true);
    expect(app.appCatalogue.has('charts')).toBe(true);
    expect(app.pendingPartition('walk.title')).toBeUndefined();
    expect(app.t('walk.title')).toBe(walk.walk.title);
  });

  it('rejects like the chunk when the chunk cannot be fetched', async () => {
    const app = await freshApp();
    const failed = new TypeError('Failed to fetch dynamically imported module');
    await expect(app.withPartitions(['walk'], Promise.reject(failed))).rejects.toBe(failed);
  });

  it('keeps the first registration when a partition comes twice', async () => {
    const app = await freshApp();
    app.registerPartition('walk', walk);
    app.registerPartition('walk', { walk: { title: 'Other' } });
    await app.loadPartitions(['walk']);
    expect(app.t('walk.title')).toBe(walk.walk.title);
  });

  it('after a draw asked for words not fetched yet, says so once and fetches them', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    const app = await freshApp();
    expect(() => app.t('progress.recap.title')).toThrow('partition "progress"');
    expect(() => app.t('progress.recap.title')).toThrow('partition "progress"');
    expect(logged).toHaveBeenCalledTimes(1);
    expect(logged).toHaveBeenCalledWith(
      'Platewise: the words of "progress" were used before they were fetched',
    );
    await vi.waitFor(() => expect(app.appCatalogue.has('progress')).toBe(true));
    expect(app.t('progress.recap.title')).toBe(enPartitions.progress.progress.recap.title);
  });

  it('fetches every on-demand partition by its loader, as the tools list it', async () => {
    const app = await freshApp();
    await app.loadPartitions(
      Object.keys(onDemandPartitions) as Array<keyof typeof onDemandPartitions>,
    );
    for (const [name, tree] of Object.entries(onDemandPartitions)) {
      expect(app.appCatalogue.has(name)).toBe(true);
      expect(app.appCatalogue.tree).toMatchObject(tree);
    }
  });
});

describe('the partition lists (P18-00)', () => {
  it('splits every partition file into start-up and on-demand, never both', () => {
    const startup = Object.keys(startupPartitions);
    const onDemand = Object.keys(onDemandPartitions);
    expect(startup.filter((name) => onDemand.includes(name))).toEqual([]);
    const files = Object.keys(FILES).map((file) => file.replace(/^\.\/en\/(.*)\.ts$/, '$1'));
    expect([...startup, ...onDemand].sort()).toEqual(files.sort());
    expect(Object.keys(enPartitions).sort()).toEqual(files.sort());
  });

  it('names each partition after its file and its export', () => {
    for (const [file, module] of Object.entries(FILES)) {
      const name = file.replace(/^\.\/en\/(.*)\.ts$/, '$1');
      expect(enPartitions[name as keyof typeof enPartitions]).toBe(module[name]);
    }
  });

  it('roots each on-demand partition at its own name, so a missing key names its partition', () => {
    for (const [name, tree] of Object.entries(onDemandPartitions)) {
      expect(Object.keys(tree)).toEqual([name]);
    }
  });
});
