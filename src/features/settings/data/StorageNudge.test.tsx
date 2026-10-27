import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { routeHash } from '../../../app/router';
import { createStorageAccess } from '../../../data/storage';
import { data as words } from '../../../i18n/en/data';
import { ServicesProvider, type Services } from '../../../services/context';
import { createStorageNudge, localNudgeMemory } from '../../../services/storageNudge';
import { FACTORY_NOW } from '../../../test/factories';
import { closeHarnesses, openHarness } from '../../../test/screenHarness';
import { settle } from '../../water/testing/openWater';
import { StorageNudge } from './StorageNudge';

afterEach(closeHarnesses);

const nudgeWords = words.data.nudge;
const DAY = 86_400_000;

const textOf = (hook: string): string =>
  document.querySelector(`[data-ui="${hook}"]`)?.textContent ?? '';

const shown = (hook: string) =>
  settle(() => document.querySelector(`[data-ui="${hook}"]`) !== null);

interface NudgeSetup {
  readonly hash?: string;
  readonly persistent?: boolean;
  readonly installed?: boolean;
}

/** The Home card over the harness's database, with the real nudge service. */
async function openNudge(setup: NudgeSetup = {}) {
  const user = userEvent.setup();
  const h = await openHarness({ hash: setup.hash ?? '#/home' });
  const settingsRepo = h.repos.settingsRepo;
  const storage = createStorageAccess({
    settings: settingsRepo,
    storage: {
      persist: async () => setup.persistent ?? false,
      persisted: async () => setup.persistent ?? false,
    },
  });
  const values = new Map<string, string>();
  const nudge = createStorageNudge({
    storage,
    settingsRepo,
    clock: h.clock,
    installed: () => setup.installed ?? false,
    memory: localNudgeMemory(() => ({
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => void values.set(key, value),
    })),
  });
  const services: Services = { ...h.services, storageNudge: nudge };
  const mount = () =>
    h.mount(
      <ServicesProvider services={services}>
        <StorageNudge />
      </ServicesProvider>,
    );
  /** A visit after the first entry: the app works the card out as it opens. */
  const nextVisit = async () => {
    await nudge.afterFirstEntry();
    await nudge.check();
  };
  return { ...h, user, nudge, settingsRepo, values, mount, nextVisit };
}

describe('StorageNudge', () => {
  it('shows keep safe under Home’s diary on the visit after the first entry (R06.19)', async () => {
    const s = await openNudge();
    await s.nudge.check();
    s.mount();
    expect(document.querySelector('[data-ui^="storageNudge"]')).toBeNull();

    // The first entry adds no card to the visit it was logged in.
    await s.nudge.afterFirstEntry();
    expect(document.querySelector('[data-ui^="storageNudge"]')).toBeNull();

    await s.nudge.check();
    await shown('storageNudge.keepSafe');
    expect(screen.getByRole('group', { name: nudgeWords.keepSafe.title })).toHaveTextContent(
      nudgeWords.keepSafe.install,
    );
  });

  it('is marked done when dismissed after it was drawn, and does not come back (R06.15)', async () => {
    const s = await openNudge();
    await s.nextVisit();
    s.mount();
    expect(document.querySelector('[data-ui="storageNudge.keepSafe"]')).not.toBeNull();

    await s.user.click(screen.getByRole('button', { name: nudgeWords.later }));

    await settle(() => document.querySelector('[data-ui^="storageNudge"]') === null);
    await settle(() => s.values.size > 0);
    expect(await s.settingsRepo.get('storage.nudgeDone')).toBe(true);
    expect(await s.nudge.check()).toBeNull();
  });

  it('opens Your data from Back up, and that counts as done', async () => {
    const s = await openNudge({ installed: true });
    await s.nextVisit();
    s.mount();
    await shown('storageNudge.keepSafe');
    expect(textOf('storageNudge.keepSafe')).toContain(nudgeWords.keepSafe.backUp);

    await s.user.click(screen.getByRole('button', { name: nudgeWords.open }));

    await settle(() => s.host.entries().hashes.at(-1) === '#/settings/data');
    expect(routeHash(s.router.current().route)).toBe('#/settings/data');
    expect(await s.settingsRepo.get('storage.nudgeDone')).toBe(true);
  });

  it('draws nothing away from Home, so a card never drawn is never marked done (R06.15)', async () => {
    const s = await openNudge({ hash: '#/coach' });
    await s.nextVisit();
    s.mount();

    expect(document.querySelector('[data-ui^="storageNudge"]')).toBeNull();
    expect(await s.nudge.dismiss(s.nudge.current()!)).toBe(false);
    expect(await s.settingsRepo.get('storage.nudgeDone')).toBe(false);
    expect(await s.nudge.check()).toMatchObject({ kind: 'keepSafe' });
  });

  it('says how long ago the last backup was when one is due', async () => {
    const s = await openNudge({ persistent: true, installed: true });
    await s.nudge.afterFirstEntry();
    s.values.set('platewise-backup-quiet', String(FACTORY_NOW - 40 * DAY));
    await s.settingsRepo.set('backup.lastAt', FACTORY_NOW - 20 * DAY);
    await s.nudge.check();
    s.mount();

    await shown('storageNudge.backupDue');
    expect(screen.getByRole('group', { name: nudgeWords.backupDue.title })).toHaveTextContent(
      'Your last backup was 20 days ago.',
    );
  });
});
