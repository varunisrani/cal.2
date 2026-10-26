// Typed access to the `settings` table. Every change is one read-write transaction that reads the
// stored row, changes it and writes it (R06.2), so two screens changing one setting at once both
// keep their change, and hiding one tab never undoes another (R05.13). A stored value the schema
// cannot use reads as its default and is kept aside in `quarantine`; a write over it copies it
// aside first, in the same transaction, or is refused (R06.1, R05.6). `loaded` resolves once the
// first snapshot has been read, so pages never show switches at their defaults (R06.22).

import { systemClock, type Clock } from '../../lib/clock';
import { appBus, type Bus } from '../bus';
import type { Codec } from '../codecs';
import {
  GUARD_TABLES,
  WriteBlockedError,
  decodeRows,
  keepAside,
  readOne,
  writeOne,
} from '../guard';
import type { KeyValueRow, PlatewiseDb } from '../schema';
import {
  HIDEABLE_TABS,
  defaultSettings,
  isSettingKey,
  readSetting,
  settingDefault,
  type HideableTab,
  type SettingKey,
  type SettingValue,
  type Settings,
  type SettingsEnv,
} from '../settingsSchema';

/** A value the settings schema refuses for its key. Nothing is written. */
export class InvalidSettingError extends TypeError {
  override readonly name = 'InvalidSettingError';
  readonly key: SettingKey;

  constructor(key: SettingKey) {
    super(`Refused: not a usable value for the setting "${key}"`);
    this.key = key;
  }
}

export interface SettingsRepo {
  /** One setting: the stored value, or its default when nothing usable is stored. */
  get<K extends SettingKey>(key: K): Promise<SettingValue<K>>;
  /** Stores one setting after checking it; resolves with the value as stored (tidied). */
  set<K extends SettingKey>(key: K, value: SettingValue<NoInfer<K>>): Promise<SettingValue<K>>;
  /**
   * Reads one setting, applies `change` and stores the result in one transaction; resolves with
   * the stored value. `change` must be synchronous.
   */
  update<K extends SettingKey>(
    key: K,
    change: (current: SettingValue<NoInfer<K>>) => SettingValue<NoInfer<K>>,
  ): Promise<SettingValue<K>>;
  /** Hides or shows one tab, reading the stored set inside the write; resolves with the new set. */
  toggleHiddenTab(tab: HideableTab, hidden: boolean): Promise<readonly HideableTab[]>;
  /** Every setting, defaults filled in. Usable inside a live query. */
  snapshot(): Promise<Settings>;
  /** The first snapshot, once it has been read. Rejects only when that read fails. */
  readonly loaded: Promise<Settings>;
}

export interface SettingsRepoOptions {
  /** The locale the unit defaults follow; defaults to the browser's language. */
  locale?: string;
  /** The time quarantine copies are stamped with. */
  clock?: Clock;
  /** Where `settings-loaded` is posted; defaults to the app bus. */
  bus?: Bus;
}

/** A setting's value in a box, so a value that is null on purpose never looks unreadable. */
interface Boxed<K extends SettingKey> {
  key: K;
  value: SettingValue<K>;
}

function isRow(raw: unknown): raw is KeyValueRow {
  return typeof raw === 'object' && raw !== null && 'key' in raw && 'value' in raw;
}

function codecFor<K extends SettingKey>(key: K): Codec<Boxed<K>> {
  return (raw) => {
    if (!isRow(raw) || raw.key !== key) return null;
    const value = readSetting(key, raw.value);
    return value === undefined ? null : { key, value };
  };
}

// Reads any v1 setting row; rows of other keys never reach it.
const anySetting: Codec<Boxed<SettingKey>> = (raw) => {
  if (!isRow(raw) || !isSettingKey(raw.key)) return null;
  const value = readSetting(raw.key, raw.value);
  return value === undefined ? null : { key: raw.key, value };
};

function browserLocale(): string {
  return typeof navigator === 'undefined' ? '' : navigator.language;
}

export function createSettingsRepo(
  db: PlatewiseDb,
  options: SettingsRepoOptions = {},
): SettingsRepo {
  const env: SettingsEnv = { locale: options.locale ?? browserLocale() };
  const clock = options.clock ?? systemClock;
  const bus = options.bus ?? appBus();

  async function snapshot(): Promise<Settings> {
    const rows: unknown[] = await db.settings.toArray();
    // A row of a key this build does not know (an older build's setting) is ignored, not damage.
    const known = rows.filter((row) => isSettingKey((row as { key?: unknown } | null)?.key));
    const { items } = decodeRows(db, 'settings', known, anySetting, clock);
    const values: Record<SettingKey, unknown> = { ...defaultSettings(env) };
    for (const item of items) values[item.key] = item.value;
    return values as Settings;
  }

  async function update<K extends SettingKey>(
    key: K,
    change: (current: SettingValue<NoInfer<K>>) => SettingValue<NoInfer<K>>,
  ): Promise<SettingValue<K>> {
    const codec = codecFor(key);
    return db.transaction('rw', [db.settings, ...GUARD_TABLES], async () => {
      const stored: unknown = await db.settings.get(key);
      let current = settingDefault(key, env);
      if (stored !== undefined) {
        const boxed = codec(stored);
        if (boxed) {
          current = boxed.value;
        } else {
          // Unusable: start from the default, but keep the stored value before replacing it.
          try {
            await keepAside(db, 'settings', key, stored, clock);
          } catch (cause) {
            throw new WriteBlockedError('settings', key, cause);
          }
        }
      }
      const next = readSetting(key, change(current));
      if (next === undefined) throw new InvalidSettingError(key);
      await db.settings.put({ key, value: next });
      return next;
    });
  }

  const loaded = snapshot().then((first) => {
    bus.post({ type: 'settings-loaded' }, 'this-tab');
    return first;
  });
  // The boot gate awaits this; a failure nobody awaited yet must not surface as unhandled.
  loaded.catch(() => undefined);

  return {
    async get(key) {
      const result = await readOne(db, 'settings', key, codecFor(key), clock);
      return result.kind === 'ok' ? result.value.value : settingDefault(key, env);
    },

    async set(key, value) {
      const tidy = readSetting(key, value);
      if (tidy === undefined) throw new InvalidSettingError(key);
      await writeOne(db, 'settings', { key, value: tidy }, codecFor(key), clock);
      return tidy;
    },

    update,

    toggleHiddenTab(tab, hidden) {
      return update('tabs.hidden', (current) =>
        HIDEABLE_TABS.filter((each) => (each === tab ? hidden : current.includes(each))),
      );
    },

    snapshot,
    loaded,
  };
}
