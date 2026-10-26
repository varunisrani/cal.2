import { Dexie } from 'dexie';
import { describe, expect, it, onTestFinished } from 'vitest';
import { appBus, createBus } from '../data/bus';
import { defaultSettings } from '../data/settingsSchema';
import { freshDbOptions, openTestDb, type TestDbOptions } from '../test/db';
import { factories } from '../test/factories';
import { ready, watch } from '../test/live';
import { connectAppData, openAppData, type AppData } from './appData';

let buses = 0;

/** Opens the app's data on `options` with a bus of its own; closed when the test ends. */
async function connect(options: TestDbOptions): Promise<AppData> {
  buses += 1;
  const bus = createBus(`app-data-test-${buses}`);
  const opening = await connectAppData({ ...options, bus });
  onTestFinished(() => {
    if (opening.kind === 'open') opening.close();
    bus.close();
  });
  if (opening.kind !== 'open') throw new Error(`expected the database to open: ${opening.problem}`);
  return opening.data;
}

describe('connectAppData', () => {
  it('opens an empty database with every setting at its default and no profile', async () => {
    const data = await connect(freshDbOptions());
    const settings = await watch(data.settings.feed).until(ready());
    expect(settings).toEqual({ status: 'ready', value: defaultSettings() });
    expect(data.settings.snapshot()).toEqual(defaultSettings());
    expect(await data.profile.get()).toEqual({ kind: 'missing' });
    expect(await watch(data.profile.feed).until(ready())).toEqual({
      status: 'ready',
      value: { kind: 'missing' },
    });
  });

  it('reads the stored profile and settings', async () => {
    const options = freshDbOptions();
    const seed = await openTestDb(options);
    const profile = factories().profile();
    await seed.profile.put({ ...profile, id: 'me' });
    await seed.settings.put({ key: 'onboarding.done', value: true });

    const data = await connect(options);
    expect(await data.profile.get()).toEqual({ kind: 'ok', value: profile });
    const settings = await watch(data.settings.feed).until(ready());
    expect(settings.status === 'ready' && settings.value['onboarding.done']).toBe(true);
  });

  it('hides one tab while keeping the stored state of the other (R05.13)', async () => {
    const data = await connect(freshDbOptions());
    expect(await data.settings.toggleHiddenTab('coach', true)).toEqual(['coach']);
    expect(await data.settings.toggleHiddenTab('progress', true)).toEqual(['progress', 'coach']);
    expect(await data.settings.toggleHiddenTab('coach', false)).toEqual(['progress']);
  });

  it('answers newer-schema for a database a newer build wrote, and leaves it alone', async () => {
    const options = freshDbOptions();
    const newer = new Dexie(options.name, {
      indexedDB: options.indexedDB,
      IDBKeyRange: options.IDBKeyRange,
    });
    newer.version(9).stores({ settings: 'key' });
    await newer.open();
    newer.close();

    expect(await connectAppData(options)).toEqual({ kind: 'failed', problem: 'newer-schema' });
    const found = (await options.indexedDB.databases()).find((db) => db.name === options.name);
    expect(found?.version).toBe(90);
  });
});

describe('openAppData', () => {
  it("opens the page's database once, whoever asks", async () => {
    const first = openAppData();
    expect(openAppData()).toBe(first);
    const opening = await first;
    onTestFinished(() => {
      if (opening.kind === 'open') opening.close();
      appBus().close();
    });
    expect(opening.kind).toBe('open');
  });
});
