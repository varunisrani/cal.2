import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_SHELL_SETTINGS, type ReadStore } from '../app/ports';
import { settleQuarantine } from '../data/guard';
import { createProfileRepo } from '../data/repos/profileRepo';
import { createSettingsRepo } from '../data/repos/settingsRepo';
import { PROFILE_KEY } from '../data/schema';
import { openTestDb } from '../test/db';
import { makeProfile } from '../test/factories';
import { createShellPorts, openErrorPorts, openingPorts, type ShellSources } from './shell';

const stops: Array<() => void> = [];

afterEach(() => {
  for (const stop of stops.splice(0)) stop();
});

/** Listens to a store like a component would, recording every value it announces. */
function watch<T>(store: ReadStore<T>) {
  const announced: Array<T | undefined> = [];
  const waiters: Array<{ matches: (value: T | undefined) => boolean; resolve: () => void }> = [];
  stops.push(
    store.subscribe(() => {
      const value = store.getSnapshot();
      announced.push(value);
      for (const waiter of [...waiters]) {
        if (!waiter.matches(value)) continue;
        waiters.splice(waiters.indexOf(waiter), 1);
        waiter.resolve();
      }
    }),
  );
  return {
    announced,
    /** Resolves with the current or a later value that passes `matches`. */
    async until(matches: (value: T | undefined) => boolean): Promise<T> {
      if (!matches(store.getSnapshot())) {
        await new Promise<void>((resolve) => waiters.push({ matches, resolve }));
      }
      return store.getSnapshot() as T;
    },
  };
}

const read = <T>(value: T | undefined) => value !== undefined;

async function setUp() {
  const { db, bus } = await openTestDb();
  const profileRepo = createProfileRepo(db);
  const settingsRepo = createSettingsRepo(db, { locale: 'en-GB', bus });
  const ports = createShellPorts({ profileRepo, settingsRepo });
  return { db, profileRepo, settingsRepo, ports };
}

describe('boot store', () => {
  it('reads nothing before anyone listens, then needs onboarding with nothing stored', async () => {
    const { ports } = await setUp();
    expect(ports.boot.getSnapshot()).toBeUndefined();
    const boot = watch(ports.boot);
    expect(await boot.until(read)).toEqual({ status: 'needsOnboarding' });
  });

  it('needs onboarding with a profile but no done flag, and with the flag but no profile', async () => {
    const first = await setUp();
    await first.profileRepo.save(makeProfile());
    expect(await watch(first.ports.boot).until(read)).toEqual({ status: 'needsOnboarding' });

    const second = await setUp();
    await second.settingsRepo.set('onboarding.done', true);
    expect(await watch(second.ports.boot).until(read)).toEqual({ status: 'needsOnboarding' });
  });

  it('turns ready once the profile and the done flag are stored', async () => {
    const { profileRepo, settingsRepo, ports } = await setUp();
    const boot = watch(ports.boot);
    await boot.until(read);

    await profileRepo.save(makeProfile());
    await settingsRepo.set('onboarding.done', true);

    expect(await boot.until((value) => value?.status === 'ready')).toEqual({ status: 'ready' });
    expect(boot.announced.filter(read).map((value) => value?.status)).toEqual([
      'needsOnboarding',
      'ready',
    ]);
  });

  it('counts a stored profile that cannot be read, so damaged data never reopens onboarding', async () => {
    const { db, settingsRepo, ports } = await setUp();
    await db.profile.put({ ...makeProfile(), id: PROFILE_KEY, sex: 'robot' } as never);
    await settingsRepo.set('onboarding.done', true);

    expect(await watch(ports.boot).until(read)).toEqual({ status: 'ready' });
    await settleQuarantine(db);
  });

  it('shows the recovery card when the read fails', async () => {
    const { settingsRepo } = await setUp();
    const failing: ShellSources = {
      profileRepo: { get: () => Promise.reject(new Error('The read failed')) },
      settingsRepo,
    };
    const ports = createShellPorts(failing);
    expect(await watch(ports.boot).until(read)).toEqual({ status: 'openError' });
  });
});

describe('settings store', () => {
  it('reads the appearance, the accent and the hidden tabs, defaults filled in', async () => {
    const { ports } = await setUp();
    expect(await watch(ports.settings).until(read)).toEqual(DEFAULT_SHELL_SETTINGS);

    const second = await setUp();
    await second.settingsRepo.set('display.appearance', 'dark');
    await second.settingsRepo.set('display.accent', 'ember');
    await second.settingsRepo.set('tabs.hidden', ['coach']);
    expect(await watch(second.ports.settings).until(read)).toEqual({
      appearance: 'dark',
      accent: 'ember',
      hiddenTabs: ['coach'],
    });
  });

  it('follows a change, and keeps its object while only other settings change', async () => {
    const { settingsRepo, ports } = await setUp();
    const settings = watch(ports.settings);
    const first = await settings.until(read);
    expect(ports.settings.getSnapshot()).toBe(first);

    await settingsRepo.set('water.on', true);
    await settingsRepo.set('display.accent', 'lagoon');
    const next = await settings.until((value) => value?.accent === 'lagoon');

    // The water switch re-ran the query, but announced nothing and kept the same object.
    expect(settings.announced.filter(read)).toEqual([first, next]);
    expect(settings.announced[0]).toBe(first);
    expect(ports.settings.getSnapshot()).toBe(next);
  });

  it('falls back to the default settings when the read fails', async () => {
    const { profileRepo } = await setUp();
    const ports = createShellPorts({
      profileRepo,
      settingsRepo: {
        get: () => Promise.reject(new Error('The read failed')),
        snapshot: () => Promise.reject(new Error('The read failed')),
      },
    });
    expect(await watch(ports.settings).until(read)).toBe(DEFAULT_SHELL_SETTINGS);
  });
});

describe('fixed ports', () => {
  it('shows the recovery card in the default theme when the database cannot be opened', () => {
    const ports = openErrorPorts();
    expect(ports.boot.getSnapshot()).toEqual({ status: 'openError' });
    expect(ports.settings.getSnapshot()).toEqual(DEFAULT_SHELL_SETTINGS);
  });

  it('reads nothing while the database is opening', () => {
    const ports = openingPorts();
    expect(ports.boot.getSnapshot()).toBeUndefined();
    expect(ports.settings.getSnapshot()).toBeUndefined();
    const stop = ports.boot.subscribe(() => {
      throw new Error('nothing should be announced');
    });
    stop();
  });
});
