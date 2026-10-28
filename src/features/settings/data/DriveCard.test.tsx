import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DriveBackupState, DriveUploadProblem } from '../../../data/settingsSchema';
import { backup as words } from '../../../i18n/en/backup';
import { createDriveBackup, type DriveBackupService } from '../../../services/backup/drive';
import type { DriveErrorCode } from '../../../services/backup/drivePlugin';
import { fakeDrive, fakeDrivePlugin } from '../../../services/backup/testing/fakeDrive';
import { ServicesProvider } from '../../../services/context';
import { FACTORY_NOW } from '../../../test/factories';
import { closeHarnesses } from '../../../test/screenHarness';
import { DataPage } from './DataPage';
import { DriveCard } from './DriveCard';
import { seededBackupFile } from './testing/openBackup';
import { openDataPage } from './testing/openDataPage';

afterEach(closeHarnesses);

const card = words.backup.drive;
const HOUR = 3_600_000;

const textOf = (hook: string): string =>
  document.querySelector(`[data-ui="${hook}"]`)?.textContent ?? '';

/** One turn of queued tasks inside act (a message, not a timer), so what they set is drawn. */
function nextTask(): Promise<void> {
  return act(
    () =>
      new Promise<void>((resolve) => {
        const channel = new MessageChannel();
        channel.port1.onmessage = () => {
          channel.port1.close();
          resolve();
        };
        channel.port2.postMessage(null);
      }),
  );
}

/**
 * Runs tasks until `check()` holds. The limit is a time, not a count of rounds: checking a backup
 * hashes it with WebCrypto, which answers on a thread of its own, and a loaded machine runs any
 * number of rounds before it does.
 */
async function settle(check: () => boolean): Promise<void> {
  const deadline = performance.now() + 3_000;
  while (!check()) {
    if (performance.now() > deadline) throw new Error('The page never reached the expected state');
    await nextTask();
  }
}

const shown = (hook: string) =>
  settle(() => document.querySelector(`[data-ui="${hook}"]`) !== null);

/** A backup Platewise put into Drive earlier, with real backup bytes, from `install`. */
async function putBackup(
  drive: ReturnType<typeof fakeDrive>,
  createdAt = FACTORY_NOW,
  install = 'old-phone',
) {
  const file = await seededBackupFile();
  return drive.put({
    name: 'platewise-backup-2026-10-26-1230.zip',
    appProperties: { platewise: 'backup', platewiseInstall: install },
    data: new Blob([new Uint8Array(await file.arrayBuffer())]),
    createdAt,
  });
}

/** Your data as in the Android app: the real backup service, the Drive copies over a fake Drive. */
async function openCard(state?: Partial<DriveBackupState>) {
  const user = userEvent.setup();
  const h = await openDataPage();
  const settingsRepo = h.repos.settingsRepo;
  await settingsRepo.set('onboarding.done', true);
  if (state) {
    await settingsRepo.set('backup.drive', {
      connected: false,
      email: null,
      lastUploadAt: null,
      problem: null,
      installId: null,
      ...state,
    });
  }
  const drive = fakeDrive(h.clock);
  const plugin = fakeDrivePlugin();
  const service: DriveBackupService = createDriveBackup({
    plugin,
    fetch: drive.fetch,
    backup: h.backup,
    settingsRepo,
    clock: h.clock,
    onError: () => undefined,
  });
  /** The card alone, or the whole page. */
  const show = async (page = false) => {
    h.mount(
      <ServicesProvider services={{ ...h.services, drive: service }}>
        {page ? <DataPage /> : <DriveCard />}
      </ServicesProvider>,
    );
    await shown(state?.connected ? 'data.drive.account' : 'data.drive.connect');
  };
  return { ...h, user, drive, plugin, service, settingsRepo, show };
}

describe('DriveCard (P15-04)', () => {
  it('draws nothing on the web, where there is no Google Drive backup (ACC-M16-5)', async () => {
    const h = await openDataPage();
    h.mount(<DataPage />);

    await shown('backup.last');

    expect(document.querySelector('[data-ui="data.drive"]')).toBeNull();
    expect(screen.queryByText(card.heading)).toBeNull();
  });

  it('connects through Google, then shows the account, no upload yet and an empty Drive', async () => {
    const s = await openCard();
    await s.show();
    const region = screen.getByRole('region', { name: card.heading });
    expect(within(region).getByText(card.intro)).toBeVisible();

    await s.user.click(within(region).getByRole('button', { name: card.connect }));

    await shown('data.drive.empty');
    expect(textOf('data.drive.account')).toBe('Connected as sam@example.com');
    expect(textOf('data.drive.last')).toBe(card.never);
    expect(textOf('data.drive.empty')).toBe(card.empty);
    expect(s.plugin.calls).toEqual(['authorize interactive']);
    expect(within(region).getByRole('button', { name: card.uploadNow })).toBeEnabled();
    expect(within(region).getByRole('button', { name: card.disconnect })).toBeEnabled();
  });

  it('says plainly when this copy of Platewise is not registered with Google (ACC-M16-5)', async () => {
    const s = await openCard();
    s.plugin.refuse = 'notConfigured';
    await s.show();

    await s.user.click(screen.getByRole('button', { name: card.connect }));

    await shown('data.drive.connectProblem');
    expect(screen.getByRole('alert')).toHaveTextContent(card.connectProblem.notConfigured);
    expect(card.connectProblem.notConfigured).toContain('docs/user/backup.md');
    expect(screen.getByRole('button', { name: card.connect })).toBeEnabled();
    expect(await s.settingsRepo.get('backup.drive')).toMatchObject({ connected: false });
  });

  it.each([
    ['unavailable', card.connectProblem.unavailable],
    ['unknown', card.connectProblem.failed],
  ] as const)('says why Google refused (%s)', async (code: DriveErrorCode, message) => {
    const s = await openCard();
    s.plugin.refuse = code;
    await s.show();

    await s.user.click(screen.getByRole('button', { name: card.connect }));

    await shown('data.drive.connectProblem');
    expect(textOf('data.drive.connectProblem')).toBe(message);
  });

  it('says nothing when the person closes Google’s screens', async () => {
    const s = await openCard();
    s.plugin.refuse = 'cancelled';
    await s.show();

    await s.user.click(screen.getByRole('button', { name: card.connect }));

    await settle(() => s.plugin.calls.length === 1);
    expect(document.querySelector('[data-ui="data.drive.connectProblem"]')).toBeNull();
  });

  it.each(['offline', 'signIn', 'quota', 'failed'] as const)(
    'shows the last upload and why the last one failed (%s, ACC-M16-3)',
    async (kind: DriveUploadProblem) => {
      const s = await openCard({
        connected: true,
        email: 'sam@example.com',
        lastUploadAt: FACTORY_NOW - 2 * HOUR,
        problem: { kind, at: FACTORY_NOW },
      });
      await s.show();

      await shown('data.drive.problem');
      expect(textOf('data.drive.last')).toBe('Last upload: Oct 26, 2026 at 10:30 AM');
      expect(textOf('data.drive.problem')).toBe(card.problem[kind]);
      expect(screen.getByText(card.problem[kind])).toHaveAttribute('role', 'status');
      expect(document.querySelector('[data-ui="data.drive.reconnect"]') !== null).toBe(
        kind === 'signIn',
      );
    },
  );

  it('Upload now sends a backup and lists it with its date, size, This phone and Restore', async () => {
    const s = await openCard({ connected: true, email: 'sam@example.com' });
    // A copy an old phone left two days ago: listed, not marked as this phone's.
    await putBackup(s.drive, FACTORY_NOW - 48 * HOUR);
    await s.show();
    await shown('data.drive.list');

    await s.user.click(screen.getByRole('button', { name: card.uploadNow }));

    await shown('data.drive.thisPhone');
    expect(textOf('data.drive.last')).toBe('Last upload: Oct 26, 2026 at 12:30 PM');
    const list = screen.getByRole('list', { name: card.list });
    const rows = within(list).getAllByRole('listitem');
    expect(rows.map((row) => row.textContent)).toEqual([
      expect.stringMatching(/^Oct 26, 2026 at 12:30 PM[\d.,]+ (?:bytes|kB)This phoneRestore$/),
      expect.stringMatching(/^Oct 24, 2026 at 12:30 PM[\d.,]+ (?:bytes|kB)Restore$/),
    ]);
    expect(within(rows[0]!).getByRole('button')).toHaveAccessibleName(
      'Restore the Google Drive backup from Oct 26, 2026 at 12:30 PM',
    );
    expect(s.drive.backups()).toHaveLength(2);
    expect(document.querySelectorAll('[data-ui="data.drive.thisPhone"]')).toHaveLength(1);
    expect(document.querySelector('[data-ui="data.drive.uploading"]')).toBeNull();
  });

  it('copies a backup made with Back up now to Google Drive (ACC-M16-1)', async () => {
    const s = await openCard({ connected: true, email: 'sam@example.com' });
    await s.show(true);
    await shown('data.drive.empty');

    await s.user.click(screen.getByRole('button', { name: words.backup.now }));

    await shown('data.drive.list');
    expect(s.downloads).toHaveLength(1);
    expect(s.drive.backups().map((file) => file.name)).toEqual([
      'platewise-backup-2026-10-26-1230.zip',
    ]);
  });

  it('restores a Drive backup through the restore sheet’s check and question (ACC-M16-4)', async () => {
    const s = await openCard({ connected: true, email: 'sam@example.com' });
    await putBackup(s.drive);
    await s.show();
    await shown('data.drive.restore');

    await s.user.click(
      screen.getByRole('button', {
        name: 'Restore the Google Drive backup from Oct 26, 2026 at 12:30 PM',
      }),
    );

    await shown('restore.madeAt');
    expect(textOf('restore.madeAt')).toBe('Backup from Oct 26, 2026 at 12:30 PM');
    expect(textOf('restore.replaces')).toBe(words.backup.restoreSheet.replaces);
    expect(screen.getByRole('button', { name: words.backup.restoreSheet.confirm })).toBeVisible();
    expect(s.drive.log.some((line) => line.startsWith('download '))).toBe(true);
    // Nothing is replaced before Restore is pressed.
    expect(await s.db.entries.count()).toBe(0);
  });

  it('says so when a backup can no longer be downloaded', async () => {
    const s = await openCard({ connected: true, email: 'sam@example.com' });
    const stored = await putBackup(s.drive);
    await s.show();
    await shown('data.drive.restore');
    s.drive.files.delete(stored.id);

    await s.user.click(screen.getByRole('button', { name: /^Restore the Google Drive backup/ }));

    await shown('toast.message');
    expect(textOf('toast.message')).toBe(card.openProblem.missing);
    expect(document.querySelector('[data-ui="restore"]')).toBeNull();
  });

  it('says when the list cannot be read', async () => {
    const s = await openCard({ connected: true, email: 'sam@example.com' });
    s.drive.offline = true;
    await s.show();

    await shown('data.drive.listProblem');
    expect(textOf('data.drive.listProblem')).toBe(card.listProblem);
  });

  it('disconnects and says the backups stay in Google Drive', async () => {
    const s = await openCard({ connected: true, email: 'sam@example.com' });
    await putBackup(s.drive);
    await s.show();
    await shown('data.drive.list');

    await s.user.click(screen.getByRole('button', { name: card.disconnect }));

    await shown('toast.message');
    expect(textOf('toast.message')).toBe(card.disconnected);
    await shown('data.drive.connect');
    expect(s.plugin.calls).toContain('signOut');
    expect(s.drive.backups()).toHaveLength(1);
  });

  it('connects again after Google stopped letting Platewise in, and sends the copy owed', async () => {
    const s = await openCard({
      connected: true,
      email: 'sam@example.com',
      problem: { kind: 'signIn', at: FACTORY_NOW - HOUR },
    });
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await s.show();

    await s.user.click(screen.getByRole('button', { name: card.reconnect }));

    await shown('data.drive.list');
    expect(document.querySelector('[data-ui="data.drive.problem"]')).toBeNull();
    expect(s.drive.backups()).toHaveLength(1);
  });
});
