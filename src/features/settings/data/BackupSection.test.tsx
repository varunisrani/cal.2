import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { backup as words } from '../../../i18n/en/backup';
import type { ShareEnv } from '../../../services/backup/backup';
import { FACTORY_NOW } from '../../../test/factories';
import { closeHarnesses } from '../../../test/screenHarness';
import { settle } from '../../water/testing/openWater';
import { BackupSection } from './BackupSection';
import { openBackup, type BackupSetup } from './testing/openBackup';

afterEach(closeHarnesses);

const card = words.backup;

const textOf = (hook: string): string =>
  document.querySelector(`[data-ui="${hook}"]`)?.textContent ?? '';

const shown = (hook: string) =>
  settle(() => document.querySelector(`[data-ui="${hook}"]`) !== null);

async function openCard(setup: BackupSetup = {}) {
  const user = userEvent.setup();
  const h = await openBackup(setup);
  h.mount(<BackupSection />);
  await shown('backup.last');
  const lastAt = () => h.repos.settingsRepo.get('backup.lastAt');
  return { ...h, user, lastAt };
}

describe('BackupSection', () => {
  it('says there is no backup yet, then hands one file over and shows its time (ACC-K3-1)', async () => {
    const s = await openCard();
    expect(textOf('backup.last')).toBe(card.never);
    expect(textOf('backup')).toContain(card.intro);

    await s.user.click(screen.getByRole('button', { name: card.now }));

    await settle(() => textOf('backup.last') !== card.never);
    expect(textOf('backup.last')).toBe('Last backup: Oct 26, 2026 at 12:30 PM');
    expect(s.downloads.map((file) => file.name)).toEqual(['platewise-backup-2026-10-26.zip']);
    expect(await s.lastAt()).toBe(FACTORY_NOW);
    await shown('toast.message');
    expect(textOf('toast.message')).toBe(card.saved);
  });

  it('offers the file again on a new tap when the share sheet refused the old one', async () => {
    const share = vi.fn<NonNullable<ShareEnv['share']>>();
    share.mockRejectedValueOnce(new DOMException('No user activation', 'NotAllowedError'));
    share.mockResolvedValueOnce(undefined);
    const s = await openCard({
      share: (downloads) => ({
        share,
        canShare: () => true,
        download: (file) => downloads.push(file),
      }),
    });

    await s.user.click(screen.getByRole('button', { name: card.now }));
    await shown('backup.save');
    expect(textOf('backup.ready')).toBe(card.ready);
    expect(await s.lastAt()).toBeNull();

    await s.user.click(screen.getByRole('button', { name: card.save }));

    await settle(() => document.querySelector('[data-ui="backup.save"]') === null);
    expect(share).toHaveBeenCalledTimes(2);
    expect(share.mock.calls[1]![0]).toEqual(share.mock.calls[0]![0]);
    expect(s.downloads).toEqual([]);
    expect(await s.lastAt()).toBe(FACTORY_NOW);
  });

  it('says why no backup was made, and records nothing', async () => {
    const s = await openCard({ crypto: null });
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await s.user.click(screen.getByRole('button', { name: card.now }));

    await shown('backup.problem');
    expect(screen.getByRole('alert')).toHaveTextContent(card.problem.insecure);
    expect(s.downloads).toEqual([]);
    expect(await s.lastAt()).toBeNull();
  });

  it('opens the restore sheet on the picked file', async () => {
    const s = await openCard();

    await s.user.upload(
      document.querySelector<HTMLInputElement>('[data-ui="backup.file"]')!,
      new File(['not a backup at all'], 'notes.zip', { type: 'application/zip' }),
    );

    await shown('restore.problem');
    expect(screen.getByRole('alert')).toHaveTextContent(card.restoreSheet.problem.notBackup);
  });
});
