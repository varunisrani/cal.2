import { describe, expect, it, onTestFinished } from 'vitest';
import { freshDbOptions, openTestDb } from '../../test/db';
import { FACTORY_NOW, factories } from '../../test/factories';
import { ready, watch } from '../../test/live';
import { createBus, type AppMessage } from '../bus';
import type { PlatewiseDb } from '../db';
import { WriteBlockedError, hasUnreadableData, keptAside } from '../guard';
import { live } from '../live';
import { defaultSettings, type ProductField, type Settings } from '../settingsSchema';
import { createSettingsRepo, readSettings, type SettingsRepoOptions } from './settingsRepo';

const clock = factories().clock;

let buses = 0;

/** A settings repository on `db` with a bus of its own that records what it hears. */
function openRepo(db: PlatewiseDb, options: SettingsRepoOptions = {}) {
  buses += 1;
  const bus = createBus(`settings-repo-test-${buses}`);
  const heard: AppMessage[] = [];
  bus.subscribe((message) => heard.push(message));
  const repo = createSettingsRepo(db, { bus, clock, ...options });
  onTestFinished(() => {
    repo.close();
    bus.close();
  });
  return { repo, heard };
}

async function quarantined(db: PlatewiseDb) {
  return (await db.quarantine.toArray()).map(({ table, key, at, raw }) => ({
    table,
    key,
    at,
    raw,
  }));
}

/** Makes the quarantine refuse every new copy, as a full disk would. */
function failQuarantine(db: PlatewiseDb): void {
  const diskFull = () => {
    throw new Error('quota exceeded');
  };
  db.quarantine.hook('creating', diskFull);
  onTestFinished(() => db.quarantine.hook('creating').unsubscribe(diskFull));
}

describe('settings: reading', () => {
  it('reads every setting as its default when nothing is stored, and writes nothing', async () => {
    const db = await openTestDb();
    const { repo } = openRepo(db);
    expect(await repo.get('display.accent')).toBe('basil');
    expect(await repo.get('remind.lunch')).toEqual({ on: false, at: '12:00' });
    expect(await repo.get('tuneUp.on')).toBe(true);
    expect(await repo.loaded).toEqual(defaultSettings());
    expect(await db.settings.count()).toBe(0);
  });

  it('reads an invalid stored accent as the default and keeps it aside, never deleting it (R06.1)', async () => {
    const db = await openTestDb();
    const raw = { key: 'display.accent', value: 'magenta' };
    await db.settings.put(raw);
    const { repo } = openRepo(db);

    expect(await repo.get('display.accent')).toBe('basil');
    expect((await repo.loaded)['display.accent']).toBe('basil');
    await keptAside();

    expect(await quarantined(db)).toEqual([
      { table: 'settings', key: 'display.accent', at: FACTORY_NOW, raw },
    ]);
    expect(await hasUnreadableData(db)).toBe(true);
    expect(await db.settings.get('display.accent')).toEqual(raw);
  });

  it('leaves a key it does not know alone: not shown, not kept aside, not removed', async () => {
    const db = await openTestDb();
    const foreign = { key: 'display.sparkles', value: 3 };
    await db.settings.put(foreign);
    const { repo } = openRepo(db);

    const loaded = await repo.loaded;
    expect(Object.keys(loaded)).not.toContain('display.sparkles');
    await repo.set('display.weekStart', 'sun');
    await keptAside();

    expect(await db.quarantine.count()).toBe(0);
    expect(await db.settings.get('display.sparkles')).toEqual(foreign);
  });

  it('reads the whole table once with readSettings', async () => {
    const db = await openTestDb();
    await db.settings.bulkPut([
      { key: 'units.energy', value: 'kJ' },
      { key: 'water.quickAddMl', value: [500, 200, 300] },
    ]);
    const settings = await readSettings(db);
    expect(settings['units.energy']).toBe('kJ');
    expect(settings['water.quickAddMl']).toEqual([200, 300, 500]);
    expect(settings['display.accent']).toBe('basil');
  });
});

describe('settings: writing', () => {
  it('stores a value in its normal form and reads it back', async () => {
    const db = await openTestDb();
    const { repo } = openRepo(db);
    await repo.set('tabs.hidden', ['coach', 'progress']);
    await repo.set('water.goalMl', 2_499.6);
    expect(await repo.get('tabs.hidden')).toEqual(['progress', 'coach']);
    expect(await db.settings.get('water.goalMl')).toEqual({ key: 'water.goalMl', value: 2_500 });
  });

  it('refuses an invalid value and writes nothing', async () => {
    const db = await openTestDb();
    const { repo } = openRepo(db);
    // A caller outside TypeScript's reach, e.g. a value from an old screen state.
    const colour = 'magenta' as Settings['display.accent'];
    await expect(repo.set('display.accent', colour)).rejects.toBeInstanceOf(TypeError);
    await expect(repo.update('water.goalMl', () => 20)).rejects.toBeInstanceOf(TypeError);
    expect(await db.settings.count()).toBe(0);
  });

  it('keeps an invalid stored value aside before writing over it (R06.1)', async () => {
    const db = await openTestDb();
    const raw = { key: 'display.accent', value: 'magenta' };
    await db.settings.put(raw);
    const { repo } = openRepo(db);

    await repo.set('display.accent', 'ember');

    expect((await quarantined(db)).map((copy) => copy.raw)).toEqual([raw]);
    expect(await repo.get('display.accent')).toBe('ember');
  });

  it('refuses an update and changes nothing when the invalid stored value cannot be kept aside', async () => {
    const db = await openTestDb();
    const raw = { key: 'tabs.hidden', value: 'progress' };
    await db.settings.put(raw);
    failQuarantine(db);
    const { repo } = openRepo(db);

    await expect(repo.toggleHiddenTab('coach', true)).rejects.toBeInstanceOf(WriteBlockedError);
    expect(await db.settings.get('tabs.hidden')).toEqual(raw);
  });

  it('starts an update from the default when the stored value is unusable, after keeping it aside', async () => {
    const db = await openTestDb();
    const raw = { key: 'product.hiddenFields', value: 'nova' };
    await db.settings.put(raw);
    const { repo } = openRepo(db);

    const eco: ProductField = 'eco';
    const stored = await repo.update('product.hiddenFields', (fields) => [...fields, eco]);

    expect(stored).toEqual(['eco']);
    expect((await quarantined(db)).map((copy) => copy.raw)).toEqual([raw]);
  });

  it('keeps both changes when two callers update one setting at the same time (R06.2)', async () => {
    const db = await openTestDb();
    const { repo } = openRepo(db);

    const nova: ProductField = 'nova';
    const eco: ProductField = 'eco';
    // Both start before either has read: each must read inside its own write.
    const hidingNova = repo.update('product.hiddenFields', (fields) => [...fields, nova]);
    const hidingEco = repo.update('product.hiddenFields', (fields) => [...fields, eco]);
    await Promise.all([hidingNova, hidingEco]);

    expect(await repo.get('product.hiddenFields')).toEqual(['nova', 'eco']);
  });

  it('writes nothing when the change throws', async () => {
    const db = await openTestDb();
    const { repo } = openRepo(db);
    await repo.set('water.goalMl', 2_500);
    const failing = repo.update('water.goalMl', () => {
      throw new Error('changed my mind');
    });
    await expect(failing).rejects.toThrow('changed my mind');
    expect(await repo.get('water.goalMl')).toBe(2_500);
  });
});

describe('settings: hidden tabs', () => {
  it('hiding Coach while a stale copy shows Progress visible keeps both hidden (R05.13)', async () => {
    const options = freshDbOptions();
    const settingsPage = openRepo(await openTestDb(options)).repo;
    const otherTab = openRepo(await openTestDb(options)).repo;

    const stale = await settingsPage.loaded;
    await otherTab.toggleHiddenTab('progress', true);
    expect(stale['tabs.hidden']).toEqual([]);

    expect(await settingsPage.toggleHiddenTab('coach', true)).toEqual(['progress', 'coach']);
    expect(await otherTab.get('tabs.hidden')).toEqual(['progress', 'coach']);
  });

  it('keeps both tabs hidden when two tabs hide one each at the same time (R05.13)', async () => {
    const options = freshDbOptions();
    const here = openRepo(await openTestDb(options)).repo;
    const there = openRepo(await openTestDb(options)).repo;

    await Promise.all([
      here.toggleHiddenTab('coach', true),
      there.toggleHiddenTab('progress', true),
    ]);

    expect(await here.get('tabs.hidden')).toEqual(['progress', 'coach']);
  });

  it('shows one tab again without touching the other, and repeats change nothing', async () => {
    const db = await openTestDb();
    const { repo } = openRepo(db);
    await repo.toggleHiddenTab('coach', true);
    await repo.toggleHiddenTab('coach', true);
    await repo.toggleHiddenTab('progress', true);
    expect(await repo.toggleHiddenTab('coach', false)).toEqual(['progress']);
    expect(await repo.toggleHiddenTab('coach', false)).toEqual(['progress']);
  });

  it('refuses to hide Home or Settings (R05.13)', async () => {
    const db = await openTestDb();
    const { repo } = openRepo(db);
    for (const tab of ['home', 'settings']) {
      // Typed callers cannot pass these; the check guards untyped ones.
      const hiding = repo.toggleHiddenTab(tab as 'coach', true);
      await expect(hiding).rejects.toBeInstanceOf(RangeError);
    }
    expect(await db.settings.count()).toBe(0);
  });
});

describe('settings: the loaded snapshot', () => {
  it('has no snapshot until the first read, then resolves loaded with stored values, never defaults first (R06.22)', async () => {
    const db = await openTestDb();
    await db.settings.bulkPut([
      { key: 'display.accent', value: 'ember' },
      { key: 'remind.master', value: true },
    ]);
    const { repo, heard } = openRepo(db);
    expect(repo.snapshot()).toBeNull();
    expect(repo.feed.current()).toEqual({ status: 'loading' });
    const states = watch(repo.feed);

    const first = await repo.loaded;

    expect(first['display.accent']).toBe('ember');
    expect(first['remind.master']).toBe(true);
    expect(repo.snapshot()).toEqual(first);
    expect(states.values().map((settings) => settings['display.accent'])).toEqual(['ember']);
    expect(heard).toEqual([{ type: 'settings-loaded' }]);
  });

  it('follows later writes from this tab and another, and says loaded only once', async () => {
    const options = freshDbOptions();
    const { repo, heard } = openRepo(await openTestDb(options));
    const otherTab = openRepo(await openTestDb(options)).repo;
    await repo.loaded;
    const states = watch(repo.feed);

    await repo.set('display.weekStart', 'sun');
    await states.until(ready((settings: Settings) => settings['display.weekStart'] === 'sun'));
    await otherTab.set('water.on', true);
    await states.until(ready((settings: Settings) => settings['water.on']));

    expect(repo.snapshot()?.['display.weekStart']).toBe('sun');
    expect(repo.snapshot()?.['water.on']).toBe(true);
    expect(heard.filter((message) => message.type === 'settings-loaded')).toHaveLength(1);
  });

  it('stops following the table after close', async () => {
    const db = await openTestDb();
    const { repo } = openRepo(db);
    const first = await repo.loaded;
    repo.close();
    // Another live reader of the table: once it sees the write, an open snapshot would have too.
    const witness = watch(live(() => readSettings(db)));
    await witness.until(ready());
    await repo.set('log.gramsFirst', true);
    await witness.until(ready((settings: Settings) => settings['log.gramsFirst']));
    expect(repo.snapshot()).toBe(first);
  });
});
