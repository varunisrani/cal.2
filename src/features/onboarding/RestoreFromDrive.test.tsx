import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { Boot } from '../../app/Boot';
import { ShellPortsContext } from '../../app/ports';
import { useRoute } from '../../app/useRoute';
import { backup as backupWords } from '../../i18n/en/backup';
import { common } from '../../i18n/en/common';
import { onboarding } from '../../i18n/en/onboarding';
import { createDriveBackup, type DriveBackupService } from '../../services/backup/drive';
import {
  fakeDrive,
  fakeDrivePlugin,
  type FakeDrive,
} from '../../services/backup/testing/fakeDrive';
import { seededBackupFile, testBackupService } from '../../services/backup/testing/seed';
import { ServicesProvider } from '../../services/context';
import { createShellPorts } from '../../services/shell';
import { FACTORY_NOW } from '../../test/factories';
import { untilLoaded } from '../../test/lazy';
import { closeHarnesses, openHarness } from '../../test/screenHarness';
import { HomePage } from '../home/HomePage';
import { OnboardingRoute } from './OnboardingRoute';

beforeAll(async () => {
  // Both screens are fetched on demand: their first transform stays out of every wait.
  await import('./RestoreFromDrive');
  await import('./RestoreFromFile');
});

afterEach(closeHarnesses);

const words = onboarding.onboarding;
const drive = backupWords.backup.drive;
const sheet = backupWords.backup.restoreSheet;

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

const shown = (selector: string) => settle(() => document.querySelector(selector) !== null);
const textOf = (hook: string): string =>
  document.querySelector(`[data-ui="${hook}"]`)?.textContent ?? '';
const button = (name: string) => screen.getByRole('button', { name });

/** A backup Platewise put into Drive earlier, holding `file`'s bytes. */
async function putBackup(into: FakeDrive, file: Blob, createdAt = FACTORY_NOW) {
  return into.put({
    name: 'platewise-backup-2026-10-26-1230.zip',
    appProperties: { platewise: 'backup' },
    data: new Blob([new Uint8Array(await file.arrayBuffer())]),
    createdAt,
  });
}

/** What the app shows for the route, as the shell does: onboarding, or Home for any tab. */
function Routed() {
  const route = useRoute();
  return route.kind === 'onboarding' ? <OnboardingRoute /> : <HomePage />;
}

/**
 * A new install on Welcome: the live start-up gate over the test database, the onboarding route
 * and Home, the real backup service, and in the Android app (`android`) the Drive copies over a
 * fake Drive and a fake sign-in plugin.
 */
async function openWelcome(android = true) {
  const user = userEvent.setup();
  const h = await openHarness({ hash: '#/onboarding' });
  const backup = testBackupService(h.db, { clock: h.clock, share: { download: () => {} } });
  const files = fakeDrive(h.clock);
  const plugin = fakeDrivePlugin();
  const service: DriveBackupService = createDriveBackup({
    plugin,
    fetch: files.fetch,
    backup,
    settingsRepo: h.repos.settingsRepo,
    clock: h.clock,
    onError: () => undefined,
  });
  const ports = createShellPorts(h.repos);
  h.mount(
    <ServicesProvider services={{ ...h.services, backup, ...(android ? { drive: service } : {}) }}>
      <ShellPortsContext value={ports}>
        <Boot>
          <Routed />
        </Boot>
      </ShellPortsContext>
    </ServicesProvider>,
  );
  await shown('[data-ui="wizard.restore"]');

  /** Welcome's Drive link, then Connect; waits for the list (or what stands in its place). */
  const openDrive = async (): Promise<void> => {
    await user.click(button(words.welcome.restoreDrive));
    await untilLoaded();
    await shown('[data-ui="welcomeDrive.connect"]');
  };
  const entryIds = async () => (await h.db.entries.toArray()).map((row) => row.id).sort();
  return { ...h, user, files, plugin, service, openDrive, entryIds };
}

describe('RestoreFromDrive on Welcome (P15-04)', () => {
  it('is not offered on the web (ACC-M16-5)', async () => {
    await openWelcome(false);

    expect(screen.queryByRole('button', { name: words.welcome.restoreDrive })).toBeNull();
    expect(button(words.welcome.restore)).toBeVisible();
  });

  it('is offered next to the backup file in the Android app, asking Google nothing yet', async () => {
    const s = await openWelcome();

    expect(button(words.welcome.restoreDrive)).toBeVisible();
    expect(button(words.welcome.restore)).toBeVisible();
    expect(s.plugin.calls).toEqual([]);
  });

  it('connects, lists the Drive backups and restores the one picked through the same check and question (ACC-M16-4)', async () => {
    const s = await openWelcome();
    await putBackup(s.files, await seededBackupFile());
    await s.openDrive();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(words.restoreDrive.title);

    await s.user.click(button(drive.connect));
    await shown('[data-ui="welcomeDrive.list"]');

    expect(textOf('welcomeDrive.account')).toBe('Connected as sam@example.com');
    const list = screen.getByRole('list', { name: drive.list });
    expect(within(list).getAllByRole('listitem')).toHaveLength(1);

    await s.user.click(button('Restore the Google Drive backup from Oct 26, 2026 at 12:30 PM'));
    await shown('[data-ui="restore.madeAt"]');
    // The preview changes nothing.
    expect(await s.entryIds()).toEqual([]);
    expect(textOf('restore.madeAt')).toBe('Backup from Oct 26, 2026 at 12:30 PM');

    await s.user.click(button(sheet.confirm));
    await shown('[data-ui="welcomeRestore.open"]');
    expect(await s.entryIds()).toEqual(['entry-lunch', 'entry-yoghurt']);
    // Connecting to restore sent nothing to Drive.
    expect(s.files.log.filter((line) => line.startsWith('multipart'))).toEqual([]);
    expect(s.files.backups()).toHaveLength(1);
    // The connection stays on this device after the restore.
    expect(await s.repos.settingsRepo.get('backup.drive')).toMatchObject({ connected: true });
  });

  it('says plainly when this copy of Platewise is not registered with Google', async () => {
    const s = await openWelcome();
    s.plugin.refuse = 'notConfigured';
    await s.openDrive();

    await s.user.click(button(drive.connect));

    await shown('[data-ui="welcomeDrive.problem"]');
    expect(screen.getByRole('alert')).toHaveTextContent(drive.connectProblem.notConfigured);
    expect(button(drive.connect)).toBeEnabled();
  });

  it('says when the Drive holds no backups, and Back returns to Welcome', async () => {
    const s = await openWelcome();
    await s.openDrive();
    await s.user.click(button(drive.connect));

    await shown('[data-ui="welcomeDrive.empty"]');
    expect(textOf('welcomeDrive.empty')).toBe(drive.empty);

    await s.user.click(button(common.common.back));
    await shown('[data-ui="wizard.restoreDrive"]');
    expect(document.querySelector('[data-ui="screen.welcomeDrive"]')).toBeNull();
  });

  it('after a refused file, Try again returns to the Drive list', async () => {
    const s = await openWelcome();
    await putBackup(s.files, new Blob(['not a backup at all']));
    await s.openDrive();
    await s.user.click(button(drive.connect));
    await shown('[data-ui="welcomeDrive.restore"]');

    await s.user.click(button('Restore the Google Drive backup from Oct 26, 2026 at 12:30 PM'));

    await shown('[data-ui="welcomeRestore.problem"]');
    expect(textOf('welcomeRestore.problem')).toBe(sheet.problem.notBackup);
    await s.user.click(button(words.restore.tryAgain));
    await shown('[data-ui="welcomeDrive.list"]');
    expect(await s.entryIds()).toEqual([]);
  });

  it('says when a backup could not be downloaded', async () => {
    const s = await openWelcome();
    await putBackup(s.files, await seededBackupFile());
    await s.openDrive();
    await s.user.click(button(drive.connect));
    await shown('[data-ui="welcomeDrive.restore"]');
    // Connecting lists the copies twice (the service, then the screen on seeing the connection):
    // going offline before the second listing has gone out would fail it and take the list away.
    await settle(() => s.files.log.filter((line) => line === 'list backups').length === 2);
    s.files.offline = true;

    await s.user.click(button('Restore the Google Drive backup from Oct 26, 2026 at 12:30 PM'));

    await shown('[data-ui="welcomeDrive.problem"]');
    expect(textOf('welcomeDrive.problem')).toBe(drive.openProblem.offline);
    expect(document.querySelector('[data-ui="screen.welcomeRestore"]')).toBeNull();
  });
});
