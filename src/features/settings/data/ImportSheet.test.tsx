import { act, fireEvent, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createPhotoRepo } from '../../../data/repos/photoRepo';
import { createTransferRepo } from '../../../data/repos/transferRepo';
import { common } from '../../../i18n/en/common';
import { transfer as words } from '../../../i18n/en/transfer';
import type { IdSource } from '../../../lib/ids';
import { ServicesProvider, type Services } from '../../../services/context';
import { MAX_IMPORT_BYTES, type PickedFile } from '../../../services/transfer/importDiary';
import { createTransferService, type TransferService } from '../../../services/transfer/transfer';
import { storableBlob } from '../../../test/blobs';
import { makeEntry, makeWater } from '../../../test/factories';
import {
  closeHarnesses,
  openHarness,
  until,
  untilGone,
  untilShown,
  type Harness,
} from '../../../test/screenHarness';
import { ImportSheet } from './ImportSheet';

afterEach(closeHarnesses);

const text = words.transfer.import;
const MON = '2026-10-26';
const SUN = '2026-10-25';
const at = (day: string, time: string) => Date.parse(`${day}T${time}:00-04:00`);
const uuid = (n: number) => `aaaaaaaa-0000-4000-8000-${String(n).padStart(12, '0')}`;

function newIds(): IdSource {
  let next = 0;
  return () => `ffffffff-0000-4000-8000-${String(++next).padStart(12, '0')}`;
}

function food(overrides: Record<string, unknown> = {}) {
  return {
    id: uuid(1),
    name: 'Rice bowl',
    grams: 250,
    kcal: 500,
    protein: 20,
    carbs: 70,
    fat: 12,
    nutrients: { fibreG: 8.5 },
    extras: {},
    time: '12:30',
    source: 'ai',
    lines: [],
    ...overrides,
  };
}

/** Sunday and Monday: Monday has two foods and a water log. */
function diaryText(
  items: unknown[] = [food(), food({ id: uuid(2), name: 'Soup', time: '13:00' })],
) {
  return JSON.stringify({
    format: 'platewise-diary',
    version: '1.0',
    range: { start: SUN, end: MON },
    days: [
      {
        date: MON,
        meals: [{ meal: 'lunch', items }],
        water: [{ id: uuid(3), time: '09:00', ml: 300 }],
      },
    ],
  });
}

function Host() {
  const [open, setOpen] = useState(true);
  return <ImportSheet open={open} onClose={() => setOpen(false)} />;
}

type Spied = TransferService & {
  readImport: ReturnType<typeof vi.fn<TransferService['readImport']>>;
  importDiary: ReturnType<typeof vi.fn<TransferService['importDiary']>>;
};

async function openSheet(
  before?: (h: Harness) => Promise<unknown>,
  change?: (real: TransferService) => Partial<TransferService>,
) {
  const h = await openHarness();
  await before?.(h);
  const real = createTransferService({
    transferRepo: createTransferRepo(h.db),
    photoRepo: createPhotoRepo(h.db),
    newId: newIds(),
  });
  const swapped = { ...real, ...change?.(real) };
  const transfer: Spied = {
    ...swapped,
    readImport: vi.fn((picked) => swapped.readImport(picked)),
    importDiary: vi.fn((file, mode) => swapped.importDiary(file, mode)),
  };
  const services: Services = { ...h.services, transfer };
  h.mount(
    <ServicesProvider services={services}>
      <Host />
    </ServicesProvider>,
  );
  await untilShown('[data-ui="importDiary.choose"]');
  return { h, transfer };
}

/** Picks a file in the hidden input and waits until the sheet has read it. */
async function pick(transfer: Spied, picked: PickedFile | File): Promise<void> {
  const input = document.querySelector<HTMLInputElement>('[data-ui="importDiary.file"]');
  if (!input) throw new Error('no file input');
  fireEvent.change(input, { target: { files: [picked] } });
  await act(async () => {
    await transfer.readImport.mock.results.at(-1)?.value;
  });
}

const asFile = (body: string) => new File([body], 'diary.json', { type: 'application/json' });

async function press(ui: string): Promise<void> {
  const button = document.querySelector<HTMLButtonElement>(`[data-ui="${ui}"]`);
  if (!button) throw new Error(`no ${ui}`);
  fireEvent.click(button);
}

describe('ImportSheet', () => {
  it('shows how many foods and water logs a picked file holds and its days', async () => {
    const { transfer } = await openSheet();
    expect(screen.getByText(text.intro)).toBeTruthy();

    await pick(transfer, asFile(diaryText()));

    expect(document.querySelector('[data-ui="importDiary.foods"]')?.textContent).toBe('2');
    expect(document.querySelector('[data-ui="importDiary.water"]')?.textContent).toBe('1');
    expect(document.querySelector('[data-ui="importDiary.days"]')?.textContent).toBe('Oct 25 – 26');
    expect(screen.getByRole('button', { name: text.replace })).toBeTruthy();
    expect(screen.getByRole('button', { name: text.add })).toBeTruthy();
  });

  it('refuses a file with one invalid value, says why, and changes nothing (ACC-K2-1)', async () => {
    const { h, transfer } = await openSheet(async (h) => {
      await h.repos.diaryRepo.add(makeEntry({ id: uuid(9), loggedAt: at(MON, '08:00') }));
    });
    const before = await h.db.entries.toArray();

    await pick(transfer, asFile(diaryText([food(), food({ id: uuid(2), name: 'Soup', fat: -2 })])));

    expect(screen.getByRole('alert').textContent).toBe(
      text.problem.food.replace('{detail}', 'Soup, 2026-10-26'),
    );
    expect(screen.queryByRole('button', { name: text.replace })).toBeNull();
    expect(transfer.importDiary).not.toHaveBeenCalled();
    expect(await h.db.entries.toArray()).toEqual(before);
  });

  it("refuses another app's file", async () => {
    const { transfer } = await openSheet();
    await pick(transfer, asFile(JSON.stringify({ export: { app: 'Another app' }, days: [] })));
    expect(screen.getByRole('alert').textContent).toBe(text.problem.notDiary);
  });

  it('refuses a file over 20 MiB before reading it', async () => {
    const { transfer } = await openSheet();
    const read = vi.fn(async () => diaryText());

    await pick(transfer, { size: MAX_IMPORT_BYTES + 1, text: read });

    expect(screen.getByRole('alert').textContent).toBe(text.problem.tooLarge);
    expect(read).not.toHaveBeenCalled();
  });

  it("replaces the dates, keeps a matched entry's photos, then closes and says so (ACC-K2-2)", async () => {
    let photo = '';
    const { h, transfer } = await openSheet(async (h) => {
      photo = await createPhotoRepo(h.db).put(await storableBlob(16), { width: 4, height: 3 });
      await h.repos.diaryRepo.add(
        makeEntry({
          id: uuid(1),
          name: 'Rice bowl',
          photoIds: [photo],
          loggedAt: at(MON, '12:30'),
        }),
      );
      await h.repos.diaryRepo.add(
        makeEntry({ id: uuid(8), name: 'Cake', loggedAt: at(MON, '16:00') }),
      );
      await h.db.water.put(makeWater({ id: uuid(7), at: at(SUN, '10:00') }));
    });
    await pick(transfer, asFile(diaryText()));

    await press('importDiary.replace');
    await act(async () => {
      await transfer.importDiary.mock.results.at(-1)?.value;
    });

    await untilGone('[data-ui="importDiary"]');
    expect(screen.getByText('2 foods and 1 water log imported.')).toBeTruthy();
    const rice = await h.db.entries.get(uuid(1));
    expect(rice).toMatchObject({ photoIds: [photo], nutrients: { fibre: 8.5 } });
    expect(await h.db.entries.get(uuid(8))).toBeUndefined();
    expect((await h.db.water.toArray()).map((log) => log.id)).toEqual([uuid(3)]);
  });

  it('adds every food and water log as new with Add as new', async () => {
    const { h, transfer } = await openSheet(async (h) => {
      await h.repos.diaryRepo.add(
        makeEntry({ id: uuid(1), name: 'Rice bowl', loggedAt: at(MON, '12:30') }),
      );
    });
    await pick(transfer, asFile(diaryText()));

    await press('importDiary.add');
    await act(async () => {
      await transfer.importDiary.mock.results.at(-1)?.value;
    });

    await untilGone('[data-ui="importDiary"]');
    expect(await h.db.entries.count()).toBe(3);
    expect(await h.db.entries.get(uuid(1))).toMatchObject({ kcal: 410 });
    expect(await h.db.water.count()).toBe(1);
  });

  it('cannot be closed while the import runs', async () => {
    let finish: () => void = () => undefined;
    const { transfer } = await openSheet(undefined, (real) => ({
      importDiary: async (file, mode) => {
        await new Promise<void>((resolve) => {
          finish = resolve;
        });
        return real.importDiary(file, mode);
      },
    }));
    await pick(transfer, asFile(diaryText()));

    await press('importDiary.replace');
    await until(() => document.querySelector('[data-ui="importDiary.done"]') === null);

    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
    await press('importDiary.scrim');
    expect(screen.queryByRole('button', { name: common.common.done })).toBeNull();
    expect(document.querySelector('[data-ui="importDiary"]')).not.toBeNull();
    expect(screen.getByRole('button', { name: text.add }).hasAttribute('disabled')).toBe(true);

    await act(async () => {
      finish();
      await transfer.importDiary.mock.results.at(-1)?.value;
    });
    await untilGone('[data-ui="importDiary"]');
  });

  it('says so when the import fails, and the file can be imported again', async () => {
    let fail = true;
    const { h, transfer } = await openSheet(undefined, (real) => ({
      importDiary: async (file, mode) => {
        if (fail) throw new DOMException('The quota has been exceeded', 'QuotaExceededError');
        return real.importDiary(file, mode);
      },
    }));
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await pick(transfer, asFile(diaryText()));

    await press('importDiary.replace');
    await act(async () => {
      await transfer.importDiary.mock.results.at(-1)?.value.catch(() => undefined);
    });

    expect(screen.getByRole('alert').textContent).toBe(text.failed);
    expect(await h.db.entries.count()).toBe(0);

    fail = false;
    await press('importDiary.replace');
    await act(async () => {
      await transfer.importDiary.mock.results.at(-1)?.value;
    });
    await untilGone('[data-ui="importDiary"]');
    expect(await h.db.entries.count()).toBe(2);
  });
});
