// Test helpers: a database holding one or more of everything a backup covers, written through the
// repositories (so rows look exactly as the app stores them), plus what a backup must never carry:
// a stored API key, a row kept aside and this device's own settings. `storedTables` reads every
// table a backup carries back, Blobs as their type and bytes, for comparing two databases. Screen
// tests get the real service over their database from `testBackupService`, and a ready backup file
// from `seededBackupFile`.

import { createBackupRepo } from '../../../data/repos/backupRepo';
import { createCoachRepo } from '../../../data/repos/coachRepo';
import { createDiaryRepo } from '../../../data/repos/diaryRepo';
import { createDraftsRepo } from '../../../data/repos/draftsRepo';
import { createFastRepo } from '../../../data/repos/fastRepo';
import { createPhotoRepo } from '../../../data/repos/photoRepo';
import { createProfileRepo } from '../../../data/repos/profileRepo';
import { createSecretsRepo } from '../../../data/repos/secretsRepo';
import { createSettingsRepo } from '../../../data/repos/settingsRepo';
import { isBlobLike } from '../../../data/codecs';
import type { PlatewiseDb } from '../../../data/schema';
import type { StorageEstimateResult } from '../../../data/storage';
import { fixedClock, type Clock } from '../../../lib/clock';
import { withIdSequence } from '../../../lib/ids';
import { bytesOf, storableBlob } from '../../../test/blobs';
import { openTestDb } from '../../../test/db';
import {
  FACTORY_NOW,
  makeBodyFat,
  makeEntry,
  makeFast,
  makeLine,
  makeProduct,
  makeProfile,
  makeSavedMeal,
  makeWalk,
  makeWater,
  makeWeighIn,
} from '../../../test/factories';
import { makeBackup, type ShareEnv } from '../backup';
import { BACKUP_TABLES } from '../payload';
import { createBackupService, type BackupService } from '../service';

export const SEED_CLOCK = fixedClock(FACTORY_NOW, 'America/New_York');

/** The API key stored in the seeded database; a backup must never hold it. */
export const KNOWN_KEY = 'AIzaSyB-platewise-known-test-key-0042';

const DAY = 86_400_000;

export interface Seeded {
  /** The two photos, in the order they were stored. */
  readonly photoIds: readonly string[];
}

/** Fills `db` with a small but complete diary. */
export async function seedStore(db: PlatewiseDb): Promise<Seeded> {
  const clock = SEED_CLOCK;
  const photoRepo = createPhotoRepo(db, { clock, newId: withIdSequence('photo') });
  const meal = await photoRepo.put(await storableBlob(3_000, 7), {
    width: 1600,
    height: 1200,
    thumb: await storableBlob(300, 2),
  });
  const side = await photoRepo.put(await storableBlob(1_200, 90, 'image/png'), {
    width: 800,
    height: 800,
  });

  await createProfileRepo(db, { clock }).save(makeProfile());
  const diary = createDiaryRepo(db, { clock });
  await diary.add(makeEntry({ id: 'entry-lunch', photoIds: [meal] }));
  await diary.add(
    makeEntry({
      id: 'entry-yoghurt',
      loggedAt: FACTORY_NOW - DAY,
      meal: 'breakfast',
      source: 'label',
      product: makeProduct({ barcode: '04006381333931' }),
      lines: [makeLine({ photoIds: [side] })],
    }),
  );
  await db.savedMeals.put(
    makeSavedMeal({ id: 'saved-lunch', photoIds: [meal], originEntryId: 'entry-lunch' }),
  );
  await db.weighIns.bulkPut([makeWeighIn({ id: 'weigh-1', at: FACTORY_NOW - 7 * DAY, kg: 65 })]);
  await db.bodyFat.put(makeBodyFat({ id: 'bodyfat-1' }));
  await db.water.bulkPut([makeWater({ id: 'water-1' }), makeWater({ id: 'water-2', ml: 500 })]);
  await db.fasts.put(makeFast({ id: 'fast-1' }));
  // A recorded walk travels in backups (P15-02); Health Connect's activity copy never does.
  await db.walks.put(makeWalk({ id: 'walk-1', startedAt: FACTORY_NOW - 2 * DAY }));
  await db.activity.put({
    day: '2026-10-26',
    steps: 9_000,
    activeKcal: 320,
    totalKcal: 2_350,
    distanceM: 6_800,
    sessions: [],
    syncedAt: FACTORY_NOW,
  });

  const coach = createCoachRepo(db, { clock, newId: withIdSequence('message') });
  await coach.append(
    {
      chatId: 'chat-lunch',
      role: 'user',
      text: 'Was this lunch balanced?',
      at: FACTORY_NOW,
      thumb: await storableBlob(400, 33),
    },
    { start: true },
  );
  await coach.append({
    chatId: 'chat-lunch',
    role: 'assistant',
    text: 'Mostly: add some greens.',
    at: FACTORY_NOW,
  });

  const settings = createSettingsRepo(db, { locale: 'en-US', clock });
  await settings.set('display.accent', 'ember');
  await settings.set('water.on', true);
  await settings.set('onboarding.done', true);
  await settings.set('tabs.hidden', ['coach']);
  await settings.set('storage.persistAsked', true);
  await settings.set('backup.lastAt', FACTORY_NOW - 30 * DAY);

  await createDraftsRepo(db, { clock }).saveCapture({
    photoIds: [],
    note: 'half a sandwich',
    progressive: false,
  });
  await createSecretsRepo(db, { clock }).set('gemini', KNOWN_KEY);
  await db.quarantine.add({
    table: 'entries',
    key: 'lost',
    at: FACTORY_NOW,
    raw: { id: 'lost' },
    hash: 'aside',
  } as never);

  return { photoIds: [meal, side] };
}

/** A value with every Blob in it replaced by its type and bytes. */
async function plain(value: unknown): Promise<unknown> {
  if (isBlobLike(value)) return { type: value.type, bytes: await bytesOf(value) };
  if (Array.isArray(value)) return Promise.all(value.map(plain));
  if (typeof value !== 'object' || value === null) return value;
  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) out[key] = await plain(item);
  return out;
}

/** Every table a backup carries, as stored, Blobs as type and bytes. */
export async function storedTables(db: PlatewiseDb): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = {};
  for (const table of BACKUP_TABLES) out[table] = await plain(await db.table(table).toArray());
  return out;
}

export interface TestServiceOptions {
  readonly clock: Clock;
  /** Free storage; plenty by default. */
  readonly estimate?: () => Promise<StorageEstimateResult | null>;
  /** The share sheet and download. */
  readonly share: ShareEnv;
  /** `null` for a page without WebCrypto. */
  readonly crypto?: null;
}

/** The real backup service over `db`, its own repositories made here. */
export function testBackupService(db: PlatewiseDb, options: TestServiceOptions): BackupService {
  return createBackupService({
    backupRepo: createBackupRepo(db),
    settingsRepo: createSettingsRepo(db, { locale: 'en-US' }),
    fastRepo: createFastRepo(db),
    photoRepo: createPhotoRepo(db),
    storage: { estimate: options.estimate ?? (async () => ({ usage: 0, quota: 1e12 })) },
    clock: options.clock,
    appVersion: '0.1.0',
    share: options.share,
    ...(options.crypto === null ? { crypto: null } : {}),
  });
}

/** A backup file of a seeded store of its own: two entries, two photos, two Coach messages. */
export async function seededBackupFile(): Promise<File> {
  const { db } = await openTestDb();
  try {
    await seedStore(db);
    const made = await makeBackup({
      backupRepo: createBackupRepo(db),
      clock: SEED_CLOCK,
      appVersion: '0.1.0',
    });
    if (!made.ok) throw new Error(`no backup: ${made.error}`);
    return made.value.file;
  } finally {
    db.close();
  }
}
