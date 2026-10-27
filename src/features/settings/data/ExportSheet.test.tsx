import { act, fireEvent, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createPhotoRepo } from '../../../data/repos/photoRepo';
import { createTransferRepo } from '../../../data/repos/transferRepo';
import { transfer as words } from '../../../i18n/en/transfer';
import { ServicesProvider, type Services } from '../../../services/context';
import type { FileHandOver } from '../../../services/transfer/exportDiary';
import { createTransferService, type TransferService } from '../../../services/transfer/transfer';
import { makeEntry, makeWater } from '../../../test/factories';
import {
  closeHarnesses,
  openHarness,
  until,
  untilGone,
  untilShown,
  type Harness,
} from '../../../test/screenHarness';
import { ExportSheet } from './ExportSheet';

afterEach(closeHarnesses);

const text = words.transfer.export;
/** The harness clock: Monday 26 October 2026, 12:30 in New York. */
const MON = '2026-10-26';
const SUN = '2026-10-25';
const SAT = '2026-10-24';
const at = (day: string, time: string) => Date.parse(`${day}T${time}:00-04:00`);

function Host() {
  const [open, setOpen] = useState(true);
  return <ExportSheet open={open} onClose={() => setOpen(false)} />;
}

type Spied = TransferService & {
  exportDiary: ReturnType<typeof vi.fn<TransferService['exportDiary']>>;
  deliver: ReturnType<typeof vi.fn<TransferService['deliver']>>;
};

/** The sheet over the harness with the real transfer service and a stand-in share sheet. */
async function openSheet(before?: (h: Harness) => Promise<unknown>, canShare = true) {
  const h = await openHarness();
  await before?.(h);
  const browser = {
    canShare: vi.fn(() => canShare),
    share: vi.fn(async (_data: ShareData) => undefined),
    download: vi.fn((_file: File) => undefined),
  } satisfies FileHandOver;
  const real = createTransferService({
    transferRepo: createTransferRepo(h.db),
    photoRepo: createPhotoRepo(h.db),
    handOver: browser,
  });
  const transfer: Spied = {
    ...real,
    exportDiary: vi.fn((request) => real.exportDiary(request)),
    deliver: vi.fn((file) => real.deliver(file)),
  };
  const services: Services = { ...h.services, transfer };
  h.mount(
    <ServicesProvider services={services}>
      <Host />
    </ServicesProvider>,
  );
  await until(() => !exportButton().disabled);
  return { h, transfer, browser };
}

function exportButton(): HTMLButtonElement {
  const button = document.querySelector<HTMLButtonElement>('[data-ui="exportDiary.export"]');
  if (!button) throw new Error('no Export button');
  return button;
}

function radio(ui: string): HTMLInputElement {
  const input = document.querySelector<HTMLInputElement>(`[data-ui="${ui}"] input`);
  if (!input) throw new Error(`no choice ${ui}`);
  return input;
}

/** Presses Export and waits until the file was made and handed over (or not). */
async function exportNow(transfer: Spied): Promise<void> {
  fireEvent.click(exportButton());
  await act(async () => {
    await transfer.exportDiary.mock.results.at(-1)?.value;
    await transfer.deliver.mock.results.at(-1)?.value;
  });
}

/** The one file the share sheet was given. */
async function sharedFile(browser: { share: { mock: { calls: [ShareData][] } } }) {
  const [data] = browser.share.mock.calls[0] ?? [];
  const [file] = data?.files ?? [];
  if (!file) throw new Error('nothing was shared');
  return { name: file.name, type: file.type, text: await file.text() };
}

describe('ExportSheet', () => {
  it('opens on This week and JSON, with the five ranges and three formats', async () => {
    await openSheet();

    expect(screen.getByRole('dialog', { name: text.title })).toBeTruthy();
    expect(radio('exportDiary.range.week').checked).toBe(true);
    expect(radio('exportDiary.format.json').checked).toBe(true);
    for (const range of ['today', 'week', 'month', 'all', 'custom']) {
      expect(screen.getByRole('radio', { name: text.range[range as 'today'] })).toBeTruthy();
    }
    for (const format of ['JSON', 'Markdown', 'CSV']) {
      expect(screen.getByRole('radio', { name: format })).toBeTruthy();
    }
    expect(document.querySelector('[data-ui="exportDiary.from"]')).toBeNull();
  });

  it('says there is nothing to export and makes no file when the days are empty', async () => {
    const { transfer, browser } = await openSheet();

    await exportNow(transfer);

    expect(screen.getByRole('alert').textContent).toBe(text.empty);
    expect(transfer.deliver).not.toHaveBeenCalled();
    expect(browser.share).not.toHaveBeenCalled();
    expect(browser.download).not.toHaveBeenCalled();
    expect(document.querySelector('[data-ui="exportDiary"]')).not.toBeNull();
  });

  it('shares this week from a Sunday week start, with a water-only day, and closes (R06.17)', async () => {
    const { transfer, browser } = await openSheet(async (h) => {
      await h.repos.settingsRepo.set('display.weekStart', 'sun');
      await h.repos.diaryRepo.add(makeEntry({ name: 'Saturday soup', loggedAt: at(SAT, '12:00') }));
      await h.db.water.put(makeWater({ at: at(SUN, '09:00'), ml: 300 }));
      await h.repos.diaryRepo.add(makeEntry({ name: 'Monday soup', loggedAt: at(MON, '12:00') }));
    });

    await exportNow(transfer);

    const file = await sharedFile(browser);
    expect(file.name).toBe('platewise-diary-2026-10-25_to_2026-10-26.json');
    expect(file.type).toBe('application/json');
    const document = JSON.parse(file.text);
    expect(document.days.map((day: { date: string }) => day.date)).toEqual([SUN, MON]);
    expect(document.days[0].waterTotalMl).toBe(300);
    await untilGone('[data-ui="exportDiary"]');
  });

  it("keeps kcal in a kJ reader's CSV and names the column in kcal (R06.14, ACC-K1-2)", async () => {
    const { transfer, browser } = await openSheet(async (h) => {
      await h.repos.settingsRepo.set('units.energy', 'kJ');
      await h.repos.diaryRepo.add(makeEntry({ kcal: 410, loggedAt: at(MON, '12:00') }));
    });

    fireEvent.click(radio('exportDiary.format.csv'));
    await exportNow(transfer);

    const file = await sharedFile(browser);
    expect(file.name).toBe('platewise-diary-2026-10-26_to_2026-10-26.csv');
    const [header, food] = file.text.split('\r\n').map((line) => line.split(','));
    expect(header?.[6]).toBe('energy_kcal');
    expect(food?.[6]).toBe('410');
  });

  it('exports the Custom days picked in From and To', async () => {
    const { transfer, browser } = await openSheet(async (h) => {
      await h.repos.diaryRepo.add(makeEntry({ loggedAt: at('2026-10-10', '12:00') }));
    });

    fireEvent.click(radio('exportDiary.range.custom'));
    await untilShown('[data-ui="exportDiary.from"]');
    const from = screen.getByLabelText(text.from) as HTMLInputElement;
    const to = screen.getByLabelText(text.to) as HTMLInputElement;
    expect([from.value, to.value]).toEqual(['2026-10-19', MON]);
    fireEvent.change(from, { target: { value: '2026-10-12' } });
    fireEvent.change(to, { target: { value: '2026-10-05' } });
    fireEvent.click(radio('exportDiary.format.markdown'));
    await exportNow(transfer);

    const file = await sharedFile(browser);
    // From after To: the two are swapped.
    expect(file.name).toBe('platewise-diary-2026-10-05_to_2026-10-12.md');
    expect(file.type).toBe('text/markdown');
    expect(file.text).toContain('## Saturday, October 10, 2026');
  });

  it('downloads when the browser cannot share the file, and says so', async () => {
    const { transfer, browser } = await openSheet(async (h) => {
      await h.repos.diaryRepo.add(makeEntry({ loggedAt: at(MON, '12:00') }));
    }, false);

    await exportNow(transfer);

    expect(browser.share).not.toHaveBeenCalled();
    expect(browser.download).toHaveBeenCalledOnce();
    // A Monday start: this week is Monday alone.
    expect(browser.download.mock.calls[0]?.[0].name).toBe(
      'platewise-diary-2026-10-26_to_2026-10-26.json',
    );
    await untilGone('[data-ui="exportDiary"]');
    expect(screen.getByText(text.downloaded)).toBeTruthy();
  });

  it('stays open when the person closes the share sheet', async () => {
    const { transfer, browser } = await openSheet(async (h) => {
      await h.repos.diaryRepo.add(makeEntry({ loggedAt: at(MON, '12:00') }));
    });
    browser.share.mockRejectedValueOnce(new DOMException('closed', 'AbortError'));

    await exportNow(transfer);

    expect(browser.download).not.toHaveBeenCalled();
    expect(document.querySelector('[data-ui="exportDiary"]')).not.toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
