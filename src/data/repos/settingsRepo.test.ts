import { Dexie } from 'dexie';
import { afterEach, describe, expect, it } from 'vitest';
import { fixedClock } from '../../lib/clock';
import { openTestDb } from '../../test/db';
import { FACTORY_NOW } from '../../test/factories';
import type { Bus, BusMessage } from '../bus';
import { WriteBlockedError, hasUnreadableData, settleQuarantine } from '../guard';
import { live, type LiveState } from '../live';
import type { PlatewiseDb } from '../schema';
import { defaultSettings, type AccentSetting, type Settings } from '../settingsSchema';
import { InvalidSettingError, createSettingsRepo, type SettingsRepo } from './settingsRepo';

const env = { locale: 'en-GB' };
const clock = fixedClock(FACTORY_NOW, 'America/New_York');
const stops: Array<() => void> = [];

afterEach(() => {
  for (const stop of stops.splice(0)) stop();
});

/** A repository the way boot makes one; waits for its first read so no read is left running. */
async function repoOn(db: PlatewiseDb, bus?: Bus): Promise<SettingsRepo> {
  const repo = createSettingsRepo(db, { ...env, clock, ...(bus ? { bus } : {}) });
  await repo.loaded;
  return repo;
}

/** Puts raw rows straight into `settings`, as damaged storage or an older build would. */
async function plant(db: PlatewiseDb, rows: Array<{ key: string; value: unknown }>) {
  await db.settings.bulkPut(rows);
}

/** Makes every add to `quarantine` on this connection fail, like a full disk would. */
function breakQuarantine(db: PlatewiseDb): void {
  db.quarantine.hook('creating', () => {
    throw new DOMException('The quota has been exceeded', 'QuotaExceededError');
  });
}

async function finish(db: PlatewiseDb): Promise<void> {
  await settleQuarantine(db);
  db.close();
}

describe('get and set', () => {
  it('reads every default when nothing is stored, and writes nothing', async () => {
    const { db } = await openTestDb();
    const repo = await repoOn(db);
    expect(await repo.snapshot()).toEqual(defaultSettings(env));
    expect(await repo.get('display.accent')).toBe('orange');
    expect(await repo.get('tuneUp.on')).toBe(true);
    expect(await repo.get('remind.dinner')).toEqual({ on: false, at: '19:00' });
    expect(await db.settings.count()).toBe(0);
    await finish(db);
  });

  it('stores a checked value, tidied, and reads it back', async () => {
    const { db } = await openTestDb();
    const repo = await repoOn(db);
    expect(await repo.set('water.goalMl', 2_500)).toBe(2_500);
    expect(await repo.set('water.quickAddMl', [750, 250, 500])).toEqual([250, 500, 750]);
    expect(await repo.set('backup.lastAt', null)).toBeNull();

    expect(await repo.get('water.goalMl')).toBe(2_500);
    expect(await db.settings.get('water.quickAddMl')).toEqual({
      key: 'water.quickAddMl',
      value: [250, 500, 750],
    });
    expect(await repo.get('backup.lastAt')).toBeNull();
    await finish(db);
  });

  it('refuses a value the schema cannot use and writes nothing', async () => {
    const { db } = await openTestDb();
    const repo = await repoOn(db);
    await expect(repo.set('display.accent', 'magenta' as AccentSetting)).rejects.toBeInstanceOf(
      InvalidSettingError,
    );
    await expect(repo.set('water.goalMl', 20_000)).rejects.toMatchObject({ key: 'water.goalMl' });
    expect(await db.settings.count()).toBe(0);
    await finish(db);
  });

  it('reads and writes the fasting switch as a plain boolean row', async () => {
    const { db } = await openTestDb();
    const repo = await repoOn(db);
    // The fasting repository writes this row itself, in its own transactions.
    await db.settings.put({ key: 'fasting.on', value: true });
    expect(await repo.get('fasting.on')).toBe(true);
    await repo.set('fasting.on', false);
    expect(await db.settings.get('fasting.on')).toEqual({ key: 'fasting.on', value: false });
    await finish(db);
  });
});

describe('unusable stored values', () => {
  it('reads an invalid stored accent as the default and keeps it aside, untouched (R06.1)', async () => {
    const { db } = await openTestDb();
    const bad = { key: 'display.accent', value: 'magenta' };
    await plant(db, [bad]);
    const repo = await repoOn(db);

    expect(await repo.get('display.accent')).toBe('orange');
    expect(await repo.get('display.accent')).toBe('orange');
    await settleQuarantine(db);

    expect(await db.settings.get('display.accent')).toEqual(bad);
    expect(await db.quarantine.toArray()).toEqual([
      expect.objectContaining({
        table: 'settings',
        key: 'display.accent',
        at: FACTORY_NOW,
        raw: bad,
      }),
    ]);
    expect(await hasUnreadableData(db)).toBe(true);
    await finish(db);
  });

  it('fills a snapshot around an unusable row and ignores keys it does not know', async () => {
    const { db } = await openTestDb();
    await plant(db, [
      { key: 'display.accent', value: 'lagoon' },
      { key: 'water.goalMl', value: 'lots' },
      { key: 'old.setting', value: 5 },
      { key: 'tabs.hidden', value: ['home', 'coach'] },
    ]);
    // A row of a known key that lost its value is unreadable too.
    await db.table('settings').put({ key: 'water.unit' });
    const repo = await repoOn(db);

    const settings = await repo.snapshot();
    expect(settings).toEqual({
      ...defaultSettings(env),
      'display.accent': 'lagoon',
      'tabs.hidden': ['coach'],
    });
    expect(settings).not.toHaveProperty('old.setting');
    await settleQuarantine(db);
    // Only unusable values are kept aside: an unknown key and a tidied list are not damage.
    expect((await db.quarantine.toArray()).map((row) => row.key).sort()).toEqual([
      'water.goalMl',
      'water.unit',
    ]);
    expect(await db.settings.count()).toBe(5);
    await finish(db);
  });

  it('keeps an unusable value aside before a set replaces it (R05.6)', async () => {
    const { db } = await openTestDb();
    const bad = { key: 'tabs.hidden', value: 'coach' };
    await plant(db, [bad]);
    const repo = createSettingsRepo(db, { ...env, clock });

    await repo.set('tabs.hidden', ['progress']);
    expect(await db.settings.get('tabs.hidden')).toEqual({
      key: 'tabs.hidden',
      value: ['progress'],
    });
    expect(await db.quarantine.toArray()).toEqual([
      expect.objectContaining({ table: 'settings', key: 'tabs.hidden', raw: bad }),
    ]);
    await repo.loaded;
    await finish(db);
  });

  it('refuses a set over an unusable value that cannot be kept aside, leaving it in place', async () => {
    const { db } = await openTestDb();
    const bad = { key: 'water.unit', value: 'pints' };
    await plant(db, [bad]);
    const repo = await repoOn(db);
    await settleQuarantine(db);
    await db.quarantine.clear();
    breakQuarantine(db);

    await expect(repo.set('water.unit', 'flOz')).rejects.toBeInstanceOf(WriteBlockedError);
    await expect(repo.update('water.unit', () => 'flOz')).rejects.toBeInstanceOf(WriteBlockedError);
    expect(await db.settings.get('water.unit')).toEqual(bad);
    expect(await db.quarantine.count()).toBe(0);
    await finish(db);
  });
});

describe('values an earlier build stored', () => {
  it('rewrites a stored lb weight unit as kg on the first read, keeping nothing aside (D-16.91)', async () => {
    const { db } = await openTestDb();
    await plant(db, [{ key: 'units.weight', value: 'lb' }]);
    const repo = createSettingsRepo(db, { ...env, clock });
    expect((await repo.loaded)['units.weight']).toBe('kg');
    await settleQuarantine(db);

    expect(await db.settings.get('units.weight')).toEqual({ key: 'units.weight', value: 'kg' });
    expect(await repo.get('units.weight')).toBe('kg');
    expect(await db.quarantine.count()).toBe(0);
    expect(await hasUnreadableData(db)).toBe(false);
    await finish(db);
  });

  it('reads any other stored weight unit as kg as well, and writes no row that was not there', async () => {
    const { db } = await openTestDb();
    await plant(db, [{ key: 'units.weight', value: 42 }]);
    await repoOn(db);
    expect(await db.settings.get('units.weight')).toEqual({ key: 'units.weight', value: 'kg' });

    const empty = await openTestDb();
    const repo = await repoOn(empty.db);
    expect(await repo.get('units.weight')).toBe('kg');
    expect(await empty.db.settings.count()).toBe(0);
    await finish(db);
    await finish(empty.db);
  });

  it('reads a stored lb as kg even before a rewrite, as a restored older backup would hold it', async () => {
    const { db } = await openTestDb();
    const repo = await repoOn(db);
    await plant(db, [{ key: 'units.weight', value: 'lb' }]);
    expect(await repo.get('units.weight')).toBe('kg');
    expect((await repo.snapshot())['units.weight']).toBe('kg');
    expect(await hasUnreadableData(db)).toBe(false);
    await finish(db);
  });
});

describe('update', () => {
  it('keeps both changes when two updates run at once (R06.2)', async () => {
    const { db } = await openTestDb();
    const repo = await repoOn(db);
    await repo.set('water.goalMl', 2_000);

    const results = await Promise.all([
      repo.update('water.goalMl', (goal) => goal + 100),
      repo.update('water.goalMl', (goal) => goal + 250),
    ]);
    expect(results).toEqual([2_100, 2_350]);
    expect(await repo.get('water.goalMl')).toBe(2_350);
    await finish(db);
  });

  it('starts from the default over an unusable value and keeps that value aside', async () => {
    const { db } = await openTestDb();
    const bad = { key: 'water.goalMl', value: -5 };
    await plant(db, [bad]);
    const repo = createSettingsRepo(db, { ...env, clock });

    expect(await repo.update('water.goalMl', (goal) => goal + 100)).toBe(2_100);
    expect(await db.quarantine.toArray()).toEqual([
      expect.objectContaining({ key: 'water.goalMl', raw: bad }),
    ]);
    await repo.loaded;
    await finish(db);
  });

  it('refuses a change the schema cannot use and leaves the stored value', async () => {
    const { db } = await openTestDb();
    const repo = await repoOn(db);
    await repo.set('water.goalMl', 1_500);

    await expect(repo.update('water.goalMl', () => 5)).rejects.toBeInstanceOf(InvalidSettingError);
    expect(await repo.get('water.goalMl')).toBe(1_500);
    await finish(db);
  });
});

describe('toggleHiddenTab', () => {
  it('hides Coach without undoing Progress hidden since the screen last read (R05.13)', async () => {
    const { db, factory, name } = await openTestDb();
    const other = await openTestDb({ indexedDB: factory, name });
    const screen = await repoOn(db);
    const elsewhere = await repoOn(other.db);

    const staleCopy = await screen.get('tabs.hidden');
    await elsewhere.toggleHiddenTab('progress', true);
    expect(staleCopy).toEqual([]);

    expect(await screen.toggleHiddenTab('coach', true)).toEqual(['progress', 'coach']);
    expect(await elsewhere.get('tabs.hidden')).toEqual(['progress', 'coach']);
    await finish(other.db);
    await finish(db);
  });

  it('shows Progress again without touching Coach hidden by a newer change (R05.13)', async () => {
    const { db } = await openTestDb();
    const screen = await repoOn(db);
    const elsewhere = await repoOn(db);
    await screen.toggleHiddenTab('progress', true);

    const staleCopy = await screen.get('tabs.hidden');
    await elsewhere.toggleHiddenTab('coach', true);
    expect(staleCopy).toEqual(['progress']);

    expect(await screen.toggleHiddenTab('progress', false)).toEqual(['coach']);
    await finish(db);
  });

  it('keeps both tabs when both are hidden at once, and hides a tab only once', async () => {
    const { db } = await openTestDb();
    const repo = await repoOn(db);
    await Promise.all([
      repo.toggleHiddenTab('coach', true),
      repo.toggleHiddenTab('progress', true),
    ]);
    expect(await repo.get('tabs.hidden')).toEqual(['progress', 'coach']);
    expect(await repo.toggleHiddenTab('coach', true)).toEqual(['progress', 'coach']);
    await finish(db);
  });
});

describe('loaded', () => {
  it('resolves with the first snapshot only after a write in flight has landed (R06.22)', async () => {
    const { db, bus } = await openTestDb();
    const posted: BusMessage[] = [];
    bus.subscribe((message) => posted.push(message));

    let release!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    let started!: () => void;
    const writing = new Promise<void>((resolve) => (started = resolve));
    const write = db.transaction('rw', db.settings, async () => {
      await db.settings.put({ key: 'water.on', value: true });
      // Signal from outside the transaction's scope so the test does not run inside it.
      Dexie.ignoreTransaction(() => started());
      await Dexie.waitFor(held);
      await db.settings.put({ key: 'display.accent', value: 'ink' });
    });
    await writing;

    const repo = createSettingsRepo(db, { ...env, clock, bus });
    let first: Settings | null = null;
    void repo.loaded.then((settings) => (first = settings));
    // Other tables stay reachable meanwhile; the settings read waits for the write.
    await db.water.count();
    expect(first).toBeNull();
    expect(posted).toEqual([]);

    release();
    await write;
    const settings = await repo.loaded;
    expect(settings['water.on']).toBe(true);
    expect(settings['display.accent']).toBe('ink');
    expect(posted).toEqual([{ type: 'settings-loaded' }]);
    await finish(db);
  });

  it('never writes its first snapshot back, so an edit made while loading stays', async () => {
    const { db } = await openTestDb();
    const repo = createSettingsRepo(db, { ...env, clock });
    const edit = repo.set('display.accent', 'ink');
    await repo.loaded;
    await edit;
    expect(await repo.get('display.accent')).toBe('ink');
    expect(await db.settings.toArray()).toEqual([{ key: 'display.accent', value: 'ink' }]);
    await finish(db);
  });

  it('rejects when the first read fails, without an unhandled rejection', async () => {
    const { db } = await openTestDb();
    db.close();
    const repo = createSettingsRepo(db, { ...env, clock });
    await expect(repo.loaded).rejects.toBeInstanceOf(Error);
  });
});

describe('snapshot', () => {
  it('follows a write from another tab when read live', async () => {
    const { db, factory, name } = await openTestDb();
    const other = await openTestDb({ indexedDB: factory, name });
    const repo = await repoOn(db);
    const elsewhere = await repoOn(other.db);

    const source = live(() => repo.snapshot());
    const accents: string[] = [];
    let waiting: { accent: string; resolve: () => void } | null = null;
    const onChange = (state: LiveState<Settings>) => {
      if (state.status !== 'ready') return;
      accents.push(state.value['display.accent']);
      if (waiting && state.value['display.accent'] === waiting.accent) waiting.resolve();
    };
    const until = (accent: string) =>
      new Promise<void>((resolve) => {
        waiting = { accent, resolve };
        onChange(source.getSnapshot());
      });
    stops.push(source.subscribe(() => onChange(source.getSnapshot())));

    await until('orange');
    await elsewhere.set('display.accent', 'ember');
    await until('ember');
    expect(accents.at(0)).toBe('orange');
    expect(accents.at(-1)).toBe('ember');
    await finish(other.db);
    await finish(db);
  });
});
