import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createSettingsRepo } from '../../../data/repos/settingsRepo';
import { data as words } from '../../../i18n/en/data';
import { transfer as transferWords } from '../../../i18n/en/transfer';
import type { ShareEnv } from '../../../services/backup/backup';
import { seedStore, storedTables } from '../../../services/backup/testing/seed';
import { FACTORY_NOW } from '../../../test/factories';
import { untilLoaded } from '../../../test/lazy';
import { closeHarnesses } from '../../../test/screenHarness';
import { settle } from '../../water/testing/openWater';
import { SettingsScreen } from '../SettingsScreen';
import { DataPage, EXPORT_SHEET, IMPORT_SHEET } from './DataPage';
import { openDataPage, type DataPageSetup } from './testing/openDataPage';

afterEach(closeHarnesses);

beforeAll(async () => {
  // The page is fetched on demand; its first transform stays out of the waits.
  await import('./DataPage');
});

const page = words.data;
const DAY = 86_400_000;

const textOf = (hook: string): string =>
  document.querySelector(`[data-ui="${hook}"]`)?.textContent ?? '';

const shown = (hook: string) =>
  settle(() => document.querySelector(`[data-ui="${hook}"]`) !== null);

const gone = (hook: string) => settle(() => document.querySelector(`[data-ui="${hook}"]`) === null);

const button = (hook: string): HTMLButtonElement => {
  const found = document.querySelector<HTMLButtonElement>(`[data-ui="${hook}"]`);
  if (!found) throw new Error(`no ${hook}`);
  return found;
};

/** The page over a seeded diary (two entries, two photos, a saved meal, weights, water…). */
async function openPage(setup: DataPageSetup = {}) {
  const user = userEvent.setup();
  const h = await openDataPage(setup);
  const seeded = await seedStore(h.db);
  h.mount(<DataPage />);
  await shown('backup.last');
  await settle(() => textOf('storage.persistence') !== page.storage.measuring);
  return { ...h, ...seeded, user };
}

describe('DataPage', () => {
  it('shows the Backup card, the diary file, Storage and Start over, in that order', async () => {
    await openPage();

    const cards = [...document.querySelectorAll('[data-ui="data"] > [data-ui]')].map((card) =>
      card.getAttribute('data-ui'),
    );
    expect(cards).toEqual(['backup', 'data.file', 'storage', 'data.reset']);
    expect(textOf('data.file')).toContain(transferWords.transfer.export.title);
    expect(textOf('data.file')).toContain(transferWords.transfer.import.title);
    expect(textOf('data.reset')).toContain(page.clear.row);
    expect(textOf('data.reset')).toContain(page.erase.row);
  });

  it('opens Export diary and Import diary in their own sheets', async () => {
    const s = await openPage();

    await s.user.click(button('data.export'));
    await shown('exportDiary');
    expect(s.router.current().sheets).toEqual([EXPORT_SHEET]);
    s.router.closeSheet(EXPORT_SHEET);
    await gone('exportDiary');

    await s.user.click(button('data.import'));
    await shown('importDiary');
    expect(s.router.current().sheets).toEqual([IMPORT_SHEET]);
  });

  it('asks before clearing the diary, and Cancel keeps everything', async () => {
    const s = await openPage();
    const before = await storedTables(s.db);

    await s.user.click(button('data.clear'));
    await shown('data.clearDialog');
    expect(screen.getByRole('alertdialog')).toHaveTextContent(page.clear.message);
    await s.user.click(button('data.clearDialog.cancel'));

    await gone('data.clearDialog');
    expect(await storedTables(s.db)).toEqual(before);
  });

  it('clears the diary: entries go; saved meals with their photos, weights, water and settings stay (ACC-K5-1)', async () => {
    const s = await openPage();
    const [meal] = s.photoIds;
    const before = await storedTables(s.db);

    await s.user.click(button('data.clear'));
    await shown('data.clearDialog');
    await s.user.click(button('data.clearDialog.confirm'));

    await gone('data.clearDialog');
    await shown('toast.message');
    expect(textOf('toast.message')).toBe(page.clear.done);
    const after = await storedTables(s.db);
    expect(after.entries).toEqual([]);
    expect(await s.db.photos.toCollection().primaryKeys()).toEqual([meal]);
    for (const table of ['savedMeals', 'weighIns', 'bodyFat', 'water', 'fasts', 'profile']) {
      expect(after[table], table).toEqual(before[table]);
    }
    const settings = createSettingsRepo(s.db, { locale: 'en-US' });
    expect(await settings.get('display.accent')).toBe('ember');
    expect(s.steps).toEqual([]);
  });

  it('asks before erasing everything, then tells the backup, stops the reminders, erases and starts again (R06.5, ACC-K6-1)', async () => {
    const s = await openPage();

    await s.user.click(button('data.erase'));
    await shown('data.eraseDialog');
    expect(screen.getByRole('alertdialog')).toHaveTextContent(page.erase.message);
    expect(s.steps).toEqual([]);

    await s.user.click(button('data.eraseDialog.confirm'));

    await settle(() => s.steps.length === 4);
    expect(s.steps).toEqual(['invalidate', 'stop', 'erase', 'restart']);
  });

  it('never records a backup whose share sheet was open when everything was erased (R06.5)', async () => {
    let finishShare!: () => void;
    const share = vi.fn<NonNullable<ShareEnv['share']>>(
      () => new Promise<void>((resolve) => (finishShare = resolve)),
    );
    const s = await openPage({
      share: (downloads) => ({
        share,
        canShare: () => true,
        download: (file) => downloads.push(file),
      }),
    });
    const settings = createSettingsRepo(s.db, { locale: 'en-US' });
    const lastAt = await settings.get('backup.lastAt');
    expect(lastAt).toBe(FACTORY_NOW - 30 * DAY);

    await s.user.click(button('backup.now'));
    await settle(() => share.mock.calls.length === 1);
    await s.user.click(button('data.erase'));
    await shown('data.eraseDialog');
    await s.user.click(button('data.eraseDialog.confirm'));
    await settle(() => s.steps.includes('restart'));
    finishShare();

    await settle(() => !button('backup.now').hasAttribute('aria-busy'));
    // The file did reach the share sheet, but the erase came first: no success is recorded.
    expect(await settings.get('backup.lastAt')).toBe(lastAt);
  });

  it('says another tab holds the data and waits, with no way to press Erase again', async () => {
    const s = await openPage({
      eraseResult: async () => ({ status: 'blocked', finished: new Promise(() => {}) }),
    });

    await s.user.click(button('data.erase'));
    await shown('data.eraseDialog');
    await s.user.click(button('data.eraseDialog.confirm'));

    await shown('data.erase.blocked');
    expect(textOf('data.erase.blocked')).toBe(page.erase.blocked);
    expect(button('data.eraseDialog.confirm')).toBeDisabled();
    expect(s.steps).toEqual(['invalidate', 'stop', 'erase']);
  });

  it('says a refused erase failed and offers Reload', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const s = await openPage({
      eraseResult: async () => ({ status: 'failed', cause: new Error('Refused') }),
    });

    await s.user.click(button('data.erase'));
    await shown('data.eraseDialog');
    await s.user.click(button('data.eraseDialog.confirm'));

    await shown('data.erase.failed');
    expect(screen.getByRole('alert')).toHaveTextContent(page.erase.failed);
    expect(s.steps).toEqual(['invalidate', 'stop', 'erase']);
    await s.user.click(screen.getByRole('button', { name: page.erase.reload }));
    expect(s.steps).toEqual(['invalidate', 'stop', 'erase', 'restart']);
    error.mockRestore();
  });

  it('is the Settings page at #/settings/data', async () => {
    const h = await openDataPage({});
    h.mount(<SettingsScreen nested={['data']} />);

    await untilLoaded();
    await shown('backup.last');
    expect(document.querySelector('[data-ui="screen.settings.data"] h1')).toHaveTextContent(
      page.page.title,
    );
    expect(document.querySelector('[data-ui="data"]')).not.toBeNull();
  });
});
