// The walk parts over a test database (P15-02): a movable clock, a page whose visibility the test
// flips, the stand-in tracker, a stand-in Health Connect, the real walks repository and the real
// service. Shared by the service and screen tests.

import { createProfileRepo } from '../../../data/repos/profileRepo';
import { createSettingsRepo } from '../../../data/repos/settingsRepo';
import { createWalkRepo, type WalkRepo } from '../../../data/repos/walkRepo';
import type { PlatewiseDb } from '../../../data/schema';
import type { SettingKey, Settings } from '../../../data/settingsSchema';
import type { Clock } from '../../../lib/clock';
import { openTestDb } from '../../../test/db';
import { FACTORY_NOW, makeProfile } from '../../../test/factories';
import { fakeHealthPlugin, type FakeHealthPlugin } from '../../health/testing/fakeHealthPlugin';
import type { WalkPermissions } from '../contract';
import { healthWalkLink } from '../healthLink';
import { createWalkService, type WalkService } from '../service';
import { fakeWalkTracker, type FakeWalkTracker } from './fakeWalkTracker';

export interface MovableClock extends Clock {
  move(ms: number): void;
}

export function movableClock(start = FACTORY_NOW): MovableClock {
  let now = start;
  return {
    now: () => now,
    timeZone: () => 'America/New_York',
    move(ms) {
      now += ms;
    },
  };
}

/** A page whose visibility the test flips. */
export function testPage() {
  let visible = true;
  const listeners = new Set<() => void>();
  const emit = () => {
    for (const listener of [...listeners]) listener();
  };
  return {
    isVisible: () => visible,
    subscribe(onChange: () => void) {
      listeners.add(onChange);
      return () => {
        listeners.delete(onChange);
      };
    },
    hide() {
      visible = false;
      emit();
    },
    show() {
      visible = true;
      emit();
    },
  };
}

export interface WalkHarness {
  readonly db: PlatewiseDb;
  readonly clock: MovableClock;
  readonly page: ReturnType<typeof testPage>;
  readonly tracker: FakeWalkTracker;
  readonly health: FakeHealthPlugin;
  readonly walkRepo: WalkRepo;
  readonly service: WalkService;
  readonly settingsRepo: ReturnType<typeof createSettingsRepo>;
  close(): void;
}

export interface WalkHarnessOptions {
  readonly permissions?: Partial<WalkPermissions>;
  /** Stored settings (Health Connect connected, writing on …). */
  readonly settings?: Partial<Settings>;
  /** No Health Connect at all (the link is not built). */
  readonly withoutHealth?: boolean;
  /** The database to use; a fresh one by default. */
  readonly db?: PlatewiseDb;
}

/** A 40-year-old, 175 cm, 70 kg person on `FACTORY_NOW`. */
export const WALKER = makeProfile({ birthDate: '1986-05-01', heightCm: 175, weightKg: 70 });

export async function walkHarness(options: WalkHarnessOptions = {}): Promise<WalkHarness> {
  const db = options.db ?? (await openTestDb()).db;
  const clock = movableClock();
  const page = testPage();
  const settingsRepo = createSettingsRepo(db, { locale: 'en-US', clock });
  for (const [key, value] of Object.entries(options.settings ?? {})) {
    await settingsRepo.set(key as SettingKey, value as never);
  }
  const profileRepo = createProfileRepo(db, { clock });
  await profileRepo.save(WALKER);
  const tracker = fakeWalkTracker({
    now: clock.now,
    tick: clock.move,
    ...(options.permissions ? { permissions: options.permissions } : {}),
  });
  const health = fakeHealthPlugin({ now: clock.now });
  const walkRepo = createWalkRepo(db, { clock });
  const service = createWalkService({
    plugin: tracker,
    walkRepo,
    profileRepo,
    health: options.withoutHealth ? undefined : healthWalkLink({ plugin: health, settingsRepo }),
    clock,
    visibility: page,
  });
  return {
    db,
    clock,
    page,
    tracker,
    health,
    walkRepo,
    service,
    settingsRepo,
    close() {
      service.close();
      db.close();
    },
  };
}
