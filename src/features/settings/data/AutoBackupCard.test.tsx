import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AutoBackupProblem, AutoBackupState } from '../../../data/settingsSchema';
import { backup as words } from '../../../i18n/en/backup';
import { createAutoBackup, type AutoBackupService } from '../../../services/backup/auto';
import type { BackupService } from '../../../services/backup/service';
import { fakeFolder } from '../../../services/backup/testing/fakeFolder';
import { ServicesProvider } from '../../../services/context';
import { FACTORY_NOW } from '../../../test/factories';
import { closeHarnesses, until, untilShown } from '../../../test/screenHarness';
import { AutoBackupCard } from './AutoBackupCard';
import { DataPage } from './DataPage';
import { openBackup, seededBackupFile } from './testing/openBackup';
import { openDataPage } from './testing/openDataPage';

afterEach(closeHarnesses);

const card = words.backup.auto;
const HOUR = 3_600_000;
const NEWEST = 'platewise-backup-2026-10-26-1230.zip';
const OLDER = 'platewise-backup-2026-10-25-0900.zip';

const textOf = (hook: string): string =>
  document.querySelector(`[data-ui="${hook}"]`)?.textContent ?? '';

interface CardSetup {
  /** The device state the card starts with. */
  readonly state?: Partial<AutoBackupState>;
  /** Wraps the real backup service (a held `make`). */
  readonly wrap?: (real: BackupService) => BackupService;
}

/** The card as in the Android app: the real backup service, the automatic one on a fake folder. */
async function openCard(setup: CardSetup = {}) {
  const user = userEvent.setup();
  const h = await openBackup(setup.wrap ? { wrap: setup.wrap } : {});
  const settingsRepo = h.repos.settingsRepo;
  await settingsRepo.set('onboarding.done', true);
  if (setup.state) {
    await settingsRepo.set('backup.autoState', {
      files: [],
      lastAt: null,
      problem: null,
      asked: false,
      ...setup.state,
    });
  }
  const folder = fakeFolder(h.clock);
  const autoBackup: AutoBackupService = createAutoBackup({
    backup: h.backup,
    folder,
    settingsRepo,
    clock: h.clock,
    visibility: { isVisible: () => true, subscribe: () => () => undefined },
    onError: () => undefined,
  });
  const show = async () => {
    h.mount(
      <ServicesProvider services={{ ...h.services, autoBackup }}>
        <AutoBackupCard />
      </ServicesProvider>,
    );
    await untilShown('[data-ui="data.autoBackup.last"]');
  };
  return { ...h, user, folder, autoBackup, settingsRepo, show };
}

describe('AutoBackupCard (P14-02)', () => {
  it('draws nothing on the web, where there is no automatic backup', async () => {
    const h = await openDataPage();
    h.mount(<DataPage />);

    await untilShown('[data-ui="backup.last"]');

    expect(document.querySelector('[data-ui="data.autoBackup"]')).toBeNull();
    expect(document.querySelector('[data-ui="data.file"]')).not.toBeNull();
  });

  it('shows the switch on, Daily, no automatic backup yet and where the files go (ACC-K3-3)', async () => {
    const s = await openCard();
    await s.show();

    const region = screen.getByRole('region', { name: card.heading });
    const toggle = within(region).getByRole('switch', { name: card.switch });
    expect(toggle).toHaveAttribute('aria-checked', 'true');
    expect(toggle).toHaveAccessibleDescription(card.switchHint);
    const every = within(region).getByRole('radiogroup', { name: card.every });
    expect(within(every).getByRole('radio', { name: card.daily })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect(textOf('data.autoBackup.last')).toBe(card.never);
    expect(textOf('data.autoBackup.where')).toBe(card.where);
    expect(document.querySelector('[data-ui="data.autoBackup.list"]')).toBeNull();
    expect(document.querySelector('[data-ui="data.autoBackup.problem"]')).toBeNull();
  });

  it('turns automatic backup off and on, and keeps Daily or Weekly', async () => {
    const s = await openCard({ state: { lastAt: FACTORY_NOW - HOUR } });
    await s.settingsRepo.set('backup.lastAt', FACTORY_NOW - HOUR);
    await s.show();

    await s.user.click(screen.getByRole('switch', { name: card.switch }));
    await until(() => screen.getByRole('switch').getAttribute('aria-checked') === 'false');
    expect(await s.settingsRepo.get('backup.auto')).toBe(false);
    expect(screen.getByRole('radio', { name: card.weekly })).toBeDisabled();

    await s.user.click(screen.getByRole('switch', { name: card.switch }));
    await until(() => screen.getByRole('switch').getAttribute('aria-checked') === 'true');
    await s.user.click(screen.getByRole('radio', { name: card.weekly }));
    await until(
      () =>
        screen.getByRole('radio', { name: card.weekly }).getAttribute('aria-checked') === 'true',
    );
    expect(await s.settingsRepo.get('backup.autoEvery')).toBe('weekly');
    // The last backup is an hour old: nothing was due, so nothing was written.
    expect(s.folder.names()).toEqual([]);
  });

  it('lists this install’s automatic backups, newest first, with their date and size (ACC-K3-6)', async () => {
    const s = await openCard({
      state: {
        files: [
          { name: NEWEST, madeAt: FACTORY_NOW },
          { name: OLDER, madeAt: FACTORY_NOW - 27.5 * HOUR },
        ],
        lastAt: FACTORY_NOW,
      },
    });
    s.folder.put(NEWEST, new Blob([new Uint8Array(2_400_000)]));
    s.folder.put(OLDER, new Blob([new Uint8Array(512)]));
    s.folder.put('notes.txt', 'the person’s own file');
    await s.show();

    await untilShown('[data-ui="data.autoBackup.list"]');

    expect(textOf('data.autoBackup.last')).toBe('Last automatic backup: Oct 26, 2026 at 12:30 PM');
    const list = screen.getByRole('list', { name: card.list });
    expect(
      within(list)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual([
      `Oct 26, 2026 at 12:30 PM2.4 MB${card.restore}`,
      `Oct 25, 2026 at 9:00 AM512 bytes${card.restore}`,
    ]);
    expect(
      within(list)
        .getAllByRole('button')
        .map((button) => button.getAttribute('aria-label')),
    ).toEqual([
      'Restore the backup from Oct 26, 2026 at 12:30 PM',
      'Restore the backup from Oct 25, 2026 at 9:00 AM',
    ]);
  });

  it('restores a listed backup through the restore sheet’s check and question (ACC-K3-6)', async () => {
    const file = await seededBackupFile();
    const s = await openCard({ state: { files: [{ name: NEWEST, madeAt: FACTORY_NOW }] } });
    s.folder.put(NEWEST, new Blob([new Uint8Array(await file.arrayBuffer())]));
    await s.show();
    await untilShown('[data-ui="data.autoBackup.restore"]');

    await s.user.click(
      screen.getByRole('button', { name: 'Restore the backup from Oct 26, 2026 at 12:30 PM' }),
    );

    await untilShown('[data-ui="restore.madeAt"]');
    expect(textOf('restore.madeAt')).toBe('Backup from Oct 26, 2026 at 12:30 PM');
    expect(textOf('restore.replaces')).toBe(words.backup.restoreSheet.replaces);
    expect(screen.getByRole('button', { name: words.backup.restoreSheet.confirm })).toBeVisible();
    expect(s.folder.log).toContain(`read ${NEWEST}`);
    // Nothing is replaced before Restore is pressed.
    expect(await s.db.entries.count()).toBe(0);
  });

  it('says so when a listed file can no longer be opened', async () => {
    const s = await openCard({ state: { files: [{ name: NEWEST, madeAt: FACTORY_NOW }] } });
    s.folder.put(NEWEST, 'a backup');
    await s.show();
    await untilShown('[data-ui="data.autoBackup.restore"]');
    s.folder.files.delete(NEWEST);

    await s.user.click(screen.getByRole('button', { name: /^Restore the backup from/ }));

    await untilShown('[data-ui="toast.message"]');
    expect(textOf('toast.message')).toBe(card.openFailed);
    expect(document.querySelector('[data-ui="restore"]')).toBeNull();
  });

  it.each(['noSpace', 'denied', 'photoUnreadable', 'tooLarge', 'failed'] as const)(
    'says why the last automatic backup failed and what to do (%s, ACC-K3-5)',
    async (kind: AutoBackupProblem) => {
      const s = await openCard({ state: { problem: { kind, at: FACTORY_NOW } } });
      await s.show();

      await untilShown('[data-ui="data.autoBackup.problem"]');
      expect(textOf('data.autoBackup.problem')).toBe(card.problem[kind]);
      expect(screen.getByText(card.problem[kind])).toHaveAttribute('role', 'status');

      await s.settingsRepo.set('backup.auto', false);
      await until(() => document.querySelector('[data-ui="data.autoBackup.problem"]') === null);
    },
  );

  it('says it is backing up while a run is in flight, then shows the new backup', async () => {
    let release = () => {};
    const gate = new Promise<void>((resolve) => (release = resolve));
    const s = await openCard({
      wrap: (real) => ({
        ...real,
        make: async () => {
          const made = real.make();
          await gate;
          return made;
        },
      }),
    });
    await s.show();

    let running!: Promise<unknown>;
    act(() => {
      running = s.autoBackup.check();
    });
    await untilShown('[data-ui="data.autoBackup.running"]');
    expect(textOf('data.autoBackup.running')).toBe(card.running);

    release();
    await act(async () => {
      await running;
    });
    await untilShown('[data-ui="data.autoBackup.list"]');
    expect(document.querySelector('[data-ui="data.autoBackup.running"]')).toBeNull();
    expect(textOf('data.autoBackup.last')).toBe('Last automatic backup: Oct 26, 2026 at 12:30 PM');
    expect(s.folder.names()).toEqual([NEWEST]);
  });

  it('says when a setting could not be saved', async () => {
    const s = await openCard();
    await s.show();
    vi.spyOn(s.autoBackup, 'setEvery').mockRejectedValueOnce(new Error('the database is gone'));
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await s.user.click(screen.getByRole('radio', { name: card.weekly }));

    await untilShown('[data-ui="toast.message"]');
    expect(textOf('toast.message')).toBe(card.saveFailed);
  });
});
