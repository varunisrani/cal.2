import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { backup as words } from '../../../i18n/en/backup';
import { common } from '../../../i18n/en/common';
import type { BackupSummary, CheckedBackup } from '../../../services/backup/service';
import { makeEntry } from '../../../test/factories';
import { closeHarnesses } from '../../../test/screenHarness';
import { settle } from '../../water/testing/openWater';
import { BackupSection, RESTORE_SHEET } from './BackupSection';
import { RestoreSheet } from './RestoreSheet';
import { openBackup, seededBackupFile, type BackupSetup } from './testing/openBackup';

afterEach(closeHarnesses);

const sheet = words.backup.restoreSheet;

/** Waits, one task at a time, until an element matching `selector` is on the page. */
const shown = (selector: string) => settle(() => document.querySelector(selector) !== null);

const textOf = (hook: string): string =>
  document.querySelector(`[data-ui="${hook}"]`)?.textContent ?? '';

/** The restore sheet over a store holding one entry of its own, open on `file`. */
async function openSheet(file: Blob, setup: BackupSetup = {}) {
  const user = userEvent.setup();
  const h = await openBackup(setup);
  await h.db.entries.put(makeEntry({ id: 'mine' }));
  const onClose = vi.fn();
  const onRestored = vi.fn<(summary: BackupSummary) => void>();
  h.mount(<RestoreSheet file={file} onClose={onClose} onRestored={onRestored} />);
  const entryIds = async () => (await h.db.entries.toArray()).map((row) => row.id).sort();
  return { ...h, user, onClose, onRestored, entryIds };
}

describe('RestoreSheet', () => {
  it('shows when the backup was made and what it holds, and changes nothing before Restore (R06.8, ACC-K4-1)', async () => {
    const s = await openSheet(await seededBackupFile());

    await shown('[data-ui="restore.madeAt"]');

    expect(textOf('restore.madeAt')).toBe('Backup from Oct 26, 2026 at 12:30 PM');
    expect(
      Array.from(
        document.querySelectorAll('[data-ui="restore.counts"] li'),
        (item) => item.textContent,
      ),
    ).toEqual(['2 diary entries', '2 photos', '2 Coach messages']);
    expect(textOf('restore.replaces')).toBe(sheet.replaces);
    expect(await s.entryIds()).toEqual(['mine']);

    await s.user.click(screen.getByRole('button', { name: sheet.confirm }));

    await shown('[data-ui="restore.restored"]');
    expect(textOf('restore.restored')).toBe(sheet.done);
    expect(await s.entryIds()).toEqual(['entry-lunch', 'entry-yoghurt']);
    expect(s.onRestored).toHaveBeenCalledWith(
      expect.objectContaining({ entries: 2, photos: 2, messages: 2, onboardingDone: true }),
    );
  });

  it('closes on Cancel and leaves everything as it was', async () => {
    const s = await openSheet(await seededBackupFile());
    await shown('[data-ui="restore.madeAt"]');

    await s.user.click(screen.getByRole('button', { name: common.common.cancel }));

    expect(s.onClose).toHaveBeenCalledTimes(1);
    expect(await s.entryIds()).toEqual(['mine']);
  });

  it('says a file is not a backup and changes nothing (ACC-K4-2)', async () => {
    const s = await openSheet(new Blob(['a shopping list, not a backup']));

    await shown('[data-ui="restore.problem"]');

    expect(screen.getByRole('alert')).toHaveTextContent(sheet.problem.notBackup);
    expect(screen.queryByRole('button', { name: sheet.confirm })).toBeNull();
    expect(await s.entryIds()).toEqual(['mine']);
  });

  it('says a damaged file changed nothing (ACC-K4-2)', async () => {
    const file = await seededBackupFile();
    const bytes = new Uint8Array(await file.arrayBuffer());
    // A byte inside payload.json, past its local header and name.
    bytes[60]! ^= 0xff;
    const s = await openSheet(new Blob([bytes]));

    await shown('[data-ui="restore.problem"]');

    expect(screen.getByRole('alert')).toHaveTextContent(sheet.problem.damaged);
    expect(await s.entryIds()).toEqual(['mine']);
  });

  it('says when there is not enough storage, before anything changes', async () => {
    const s = await openSheet(await seededBackupFile(), {
      estimate: async () => ({ usage: 900, quota: 1_000 }),
    });

    await shown('[data-ui="restore.problem"]');

    expect(screen.getByRole('alert')).toHaveTextContent(sheet.problem.noSpace);
    expect(await s.entryIds()).toEqual(['mine']);
  });
});

describe('RestoreSheet from the Backup card', () => {
  /** A restore held at its start until `release` is called; `finished` gives its result. */
  function heldRestore() {
    let release = () => {};
    const gate = new Promise<void>((resolve) => (release = resolve));
    let finish: (value: unknown) => void = () => {};
    const finished = new Promise((resolve) => (finish = resolve));
    const setup: BackupSetup = {
      wrap: (real) => ({
        ...real,
        async apply(checked: CheckedBackup) {
          await gate;
          const result = await real.apply(checked);
          finish(result);
          return result;
        },
      }),
    };
    return { setup, release, finished };
  }

  it('cannot be dismissed while restoring, and the restore finishes when the sheet is gone (R06.6)', async () => {
    const user = userEvent.setup();
    const held = heldRestore();
    const h = await openBackup(held.setup);
    await h.db.entries.put(makeEntry({ id: 'mine' }));
    h.mount(<BackupSection />);
    await shown('[data-ui="backup.last"]');

    await user.upload(
      document.querySelector<HTMLInputElement>('[data-ui="backup.file"]')!,
      new File([await seededBackupFile()], 'platewise-backup-2026-10-26.zip'),
    );
    await shown('[data-ui="restore.madeAt"]');
    await user.click(screen.getByRole('button', { name: sheet.confirm }));
    await shown('[data-ui="restore.restoring"]');

    await user.keyboard('{Escape}');
    expect(document.querySelector('[data-ui="restore"]')).not.toBeNull();
    expect(screen.queryByRole('button', { name: common.common.done })).toBeNull();

    // Back while it runs: the sheet goes, the restore does not.
    act(() => h.router.closeSheet(RESTORE_SHEET));
    expect(document.querySelector('[data-ui="restore"]')).toBeNull();
    held.release();
    expect(await held.finished).toMatchObject({ ok: true });

    expect((await h.db.entries.toArray()).map((row) => row.id).sort()).toEqual([
      'entry-lunch',
      'entry-yoghurt',
    ]);
    await shown('[data-ui="toast.message"]');
    expect(textOf('toast.message')).toBe(sheet.done);
  });
});
