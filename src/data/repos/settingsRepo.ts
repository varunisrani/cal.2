// The settings table: one row per key (`{key, value}`), read and written only here.
//
// A stored value its reader cannot use shows as the default and is kept aside in the quarantine,
// never replaced without that copy (P02-02). Changes that depend on the stored value read it
// inside the writing transaction, so two callers never undo each other (R06.2, R05.13). Screens
// wait for `loaded`: the in-memory snapshot exists only once the table has really been read, so
// defaults never stand in for values that are still loading (R06.22).

import { appBus, type AppBus } from '../bus';
import { transact, type PlatewiseDb } from '../db';
import { guardKey, readAll, readOne, writeOne, type Codec, type GuardOptions } from '../guard';
import { live, type LiveFeed } from '../live';
import type { KeyedRow } from '../schema';
import {
  defaultOf,
  defaultSettings,
  isHideableTab,
  isSettingKey,
  readSetting,
  type HideableTab,
  type SettingKey,
  type SettingValue,
  type Settings,
} from '../settingsSchema';

export interface SettingsRepoOptions extends GuardOptions {
  /** Where `settings-loaded` is posted; the app's bus by default. */
  bus?: AppBus;
}

export interface SettingsRepo {
  /** The stored value of `key`, or its default when nothing usable is stored. */
  get<K extends SettingKey>(key: K): Promise<SettingValue<K>>;
  /** Stores `value` in its normal form. TypeError (and nothing written) when it is not valid. */
  set<K extends SettingKey>(key: K, value: NoInfer<SettingValue<K>>): Promise<void>;
  /**
   * Reads `key`, applies `change` and writes the result in one transaction; returns what was
   * stored. `change` must not await anything: the transaction ends with the first outside wait.
   */
  update<K extends SettingKey>(
    key: K,
    change: (current: SettingValue<K>) => NoInfer<SettingValue<K>>,
  ): Promise<SettingValue<K>>;
  /** Hides or shows one tab, keeping the stored state of every other tab. Returns the hidden set. */
  toggleHiddenTab(tab: HideableTab, hidden: boolean): Promise<readonly HideableTab[]>;
  /** The latest snapshot read from the table, or null while the first read has not finished. */
  snapshot(): Settings | null;
  /** Resolves with the first snapshot read from the table. */
  readonly loaded: Promise<Settings>;
  /** Every setting, live: loading until the first read, then each committed change. */
  readonly feed: LiveFeed<Settings>;
  /** Stops keeping the snapshot up to date. */
  close(): void;
}

/**
 * The row codec the guard reads with. A row of a key this build does not know (a newer build, a
 * removed setting) reads as it is and is left alone; only a known key whose value cannot be used,
 * or a row without a key, cannot be read.
 */
const decodeRow: Codec<KeyedRow> = (raw) => {
  if (typeof raw !== 'object' || raw === null) return null;
  const { key, value } = raw as Partial<KeyedRow>;
  if (typeof key !== 'string') return null;
  if (!isSettingKey(key)) return { key, value };
  const read = readSetting(key, value);
  return read === undefined ? null : { key, value: read };
};

/** Every setting as stored now, with defaults for the keys that hold nothing usable. */
export async function readSettings(db: PlatewiseDb, options: GuardOptions = {}): Promise<Settings> {
  const { items } = await readAll(db, 'settings', decodeRow, options);
  const values: Record<string, unknown> = defaultSettings();
  for (const row of items) {
    if (isSettingKey(row.key)) values[row.key] = row.value;
  }
  return values as Settings;
}

function invalid(key: SettingKey): TypeError {
  return new TypeError(`Not a valid value for the setting ${key}`);
}

/** Opens the settings repository and starts reading the snapshot. */
export function createSettingsRepo(
  db: PlatewiseDb,
  options: SettingsRepoOptions = {},
): SettingsRepo {
  const guard: GuardOptions = options.clock ? { clock: options.clock } : {};
  const feed = live(() => readSettings(db, guard));

  let latest: Settings | null = null;
  let announce: ((settings: Settings) => void) | null = null;
  const loaded = new Promise<Settings>((resolve) => {
    announce = (settings) => {
      resolve(settings);
      (options.bus ?? appBus()).post({ type: 'settings-loaded' });
    };
  });

  const stop = feed.subscribe(() => {
    const state = feed.current();
    if (state.status !== 'ready') return;
    latest = state.value;
    const first = announce;
    announce = null;
    first?.(state.value);
  });

  async function get<K extends SettingKey>(key: K): Promise<SettingValue<K>> {
    const found = await readOne(db, 'settings', key, decodeRow, guard);
    // The codec has already put a known key's value into its normal form.
    return found.kind === 'ok' ? (found.value.value as SettingValue<K>) : defaultOf(key);
  }

  async function set<K extends SettingKey>(key: K, value: NoInfer<SettingValue<K>>): Promise<void> {
    const normal = readSetting(key, value);
    if (normal === undefined) throw invalid(key);
    await writeOne(db, 'settings', { key, value: normal }, decodeRow, guard);
  }

  function update<K extends SettingKey>(
    key: K,
    change: (current: SettingValue<K>) => NoInfer<SettingValue<K>>,
  ): Promise<SettingValue<K>> {
    return transact(db, 'rw', ['settings'], async () => {
      // An unusable stored value is kept aside before it is replaced (or the write is refused).
      await guardKey(db, 'settings', key, decodeRow, guard);
      const stored = await db.settings.get(key);
      const read = stored === undefined ? undefined : readSetting(key, stored.value);
      const current = read === undefined ? defaultOf(key) : read;
      const next = readSetting(key, change(current));
      if (next === undefined) throw invalid(key);
      await db.settings.put({ key, value: next });
      return next;
    });
  }

  function toggleHiddenTab(tab: HideableTab, hidden: boolean): Promise<readonly HideableTab[]> {
    if (!isHideableTab(tab)) {
      return Promise.reject(new RangeError(`The ${String(tab)} tab cannot be hidden`));
    }
    return update('tabs.hidden', (current) =>
      hidden ? [...current, tab] : current.filter((each) => each !== tab),
    );
  }

  return {
    get,
    set,
    update,
    toggleHiddenTab,
    snapshot: () => latest,
    loaded,
    feed,
    close: stop,
  };
}
