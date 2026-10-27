import { act, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAppState } from '../../../app/appState';
import { createDraftsRepo } from '../../../data/repos/draftsRepo';
import { createPhotoRepo } from '../../../data/repos/photoRepo';
import { createSecretsRepo } from '../../../data/repos/secretsRepo';
import type { DiaryEntry } from '../../../domain/model';
import { lintCatalogue } from '../../../i18n/lint';
import { enPartitions } from '../../../i18n/en';
import { reuse } from '../../../i18n/en/reuse';
import { createAnalysisService, type AnalysisService } from '../../../services/analysis';
import { ServicesProvider, type Services } from '../../../services/context';
import type { PhotoService } from '../../../services/photos';
import { createSavedMealsService } from '../../../services/savedMeals';
import { storableBlob } from '../../../test/blobs';
import { FACTORY_NOW, makeEntry, makeSavedMeal } from '../../../test/factories';
import {
  closeHarnesses,
  openHarness,
  until,
  untilShown,
  type Harness,
} from '../../../test/screenHarness';
import { ReuseSheet, type ReuseList } from './ReuseSheet';

const words = reuse.reuse;
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

// ---- Object URLs: jsdom has none, so each thumbnail's blob is recorded here --------------------

let thumbs = new Map<string, Blob>();
const urlMethods = ['createObjectURL', 'revokeObjectURL'] as const;
const savedUrlMethods = urlMethods.map((name) => Object.getOwnPropertyDescriptor(URL, name));

beforeEach(() => {
  thumbs = new Map();
  let made = 0;
  Object.defineProperty(URL, 'createObjectURL', {
    configurable: true,
    value: (blob: Blob) => {
      const url = `blob:reuse-test/${++made}`;
      thumbs.set(url, blob);
      return url;
    },
  });
  Object.defineProperty(URL, 'revokeObjectURL', {
    configurable: true,
    value: (url: string) => void thumbs.delete(url),
  });
});

afterEach(async () => {
  urlMethods.forEach((name, index) => {
    const saved = savedUrlMethods[index];
    if (saved) Object.defineProperty(URL, name, saved);
    else Reflect.deleteProperty(URL, name);
  });
  await closeHarnesses();
});

// ---- Set-up --------------------------------------------------------------------------------------

/** Thumbnails come straight from the photo store (a missing photo has none). */
function photosOver(h: Harness): PhotoService {
  const photoRepo = createPhotoRepo(h.db);
  return {
    store: vi.fn(),
    thumbnail: (id) => photoRepo.get(id).then((row) => row?.blob ?? null),
    preview: () => Promise.resolve(null),
    viewer: () => Promise.resolve(null),
  };
}

interface Opened {
  readonly h: Harness;
  readonly analysis: AnalysisService;
  readonly onClose: ReturnType<typeof vi.fn>;
}

/** One reuse sheet, open over the harness with the real analysis and saved-meals services. */
async function openSheet(list: ReuseList, before?: (h: Harness) => Promise<unknown>) {
  const h = await openHarness();
  await before?.(h);
  const photoRepo = createPhotoRepo(h.db);
  const analysis = createAnalysisService({
    draftsRepo: createDraftsRepo(h.db),
    photoRepo,
    settingsRepo: h.repos.settingsRepo,
    secretsRepo: createSecretsRepo(h.db),
    overlay: createAppState(),
    fetch: () => Promise.reject(new Error('No request is expected here')),
    clock: h.clock,
  });
  const services: Services = {
    ...h.services,
    analysis,
    photos: photosOver(h),
    savedMeals: createSavedMealsService({ savedMealsRepo: h.repos.savedMealsRepo, photoRepo }),
  };
  const onClose = vi.fn();
  h.mount(
    <ServicesProvider services={services}>
      <ReuseSheet list={list} open onClose={onClose} />
    </ServicesProvider>,
  );
  await until(() => document.querySelector('[data-ui="reuse.search"]') !== null);
  await until(
    () =>
      document.querySelector('[data-ui="reuse.list"], [data-ui="reuse.empty"]') !== null ||
      document.querySelector('[aria-busy="true"]') === null,
  );
  return { h, analysis, onClose } satisfies Opened;
}

/** The names of the rows, in order. */
function rowNames(): string[] {
  return [...document.querySelectorAll('[data-ui="reuse.row"]')].map(
    (row) => row.querySelector('[data-ui="reuse.row.pick"] span span span')?.textContent ?? '',
  );
}

function rowOf(name: string): HTMLElement {
  const row = [...document.querySelectorAll<HTMLElement>('[data-ui="reuse.row"]')].find(
    (candidate) => within(candidate).queryByText(name) !== null,
  );
  if (!row) throw new Error(`No row for ${name}`);
  return row;
}

/** The button that hands the row's food to the review. */
function pickOf(name: string): HTMLElement {
  const pick = rowOf(name).querySelector<HTMLElement>('[data-ui="reuse.row.pick"]');
  if (!pick) throw new Error(`No pick button for ${name}`);
  return pick;
}

/** Waits until the analysis service shows a review, and returns it. */
async function reviewOf(analysis: AnalysisService) {
  await act(
    () =>
      new Promise<void>((resolve) => {
        const ready = () => analysis.getSnapshot().phase === 'reviewReady';
        if (ready()) return resolve();
        const stop = analysis.subscribe(() => {
          if (!ready()) return;
          stop();
          resolve();
        });
      }),
  );
  const state = analysis.getSnapshot();
  if (state.phase !== 'reviewReady') throw new Error('No review');
  return state;
}

function search(query: string): void {
  fireEvent.change(screen.getByLabelText(words.search), { target: { value: query } });
}

const emptyText = () => document.querySelector('[data-ui="reuse.empty"]')?.textContent ?? null;

// ---- Recent ------------------------------------------------------------------------------------

describe('ReuseSheet: Recent', () => {
  it('lists every entry of the last 30 days newest first, leaving out one from 31 days ago', async () => {
    await openSheet('recent', (h) =>
      h.repos.diaryRepo.addMany([
        makeEntry({ name: 'Toast', loggedAt: FACTORY_NOW - HOUR }),
        makeEntry({ name: 'Lentil soup', loggedAt: FACTORY_NOW - 2 * DAY }),
        makeEntry({ name: 'Toast', loggedAt: FACTORY_NOW - 3 * DAY }),
        makeEntry({ name: 'Old stew', loggedAt: FACTORY_NOW - 31 * DAY }),
      ]),
    );
    await untilShown('[data-ui="reuse.list"]');

    expect(screen.getByRole('dialog', { name: words.title.recent })).toBeVisible();
    expect(rowNames()).toEqual(['Toast', 'Lentil soup', 'Toast']);
  });

  it('says so when nothing was logged in the last 30 days', async () => {
    await openSheet('recent', (h) =>
      h.repos.diaryRepo.add(makeEntry({ loggedAt: FACTORY_NOW - 40 * DAY })),
    );
    await untilShown('[data-ui="reuse.empty"]');
    expect(emptyText()).toBe(words.empty.recent);
  });

  it("opens the review with the entry's grams, units, photos and source, and logs nothing (ACC-D16-2)", async () => {
    let entry: DiaryEntry | undefined;
    let photoId = '';
    const { h, analysis, onClose } = await openSheet('recent', async (harness) => {
      photoId = await createPhotoRepo(harness.db).put(await storableBlob(500), {
        width: 800,
        height: 600,
      });
      entry = await harness.repos.diaryRepo.add(
        makeEntry({
          name: 'Rye bread',
          loggedAt: FACTORY_NOW - DAY,
          source: 'barcode',
          photoIds: [photoId],
          basis: { kind: 'grams', grams: 60 },
          units: [{ unit: 'slice', gramsEach: 30, count: 2 }],
          chosenUnit: 'slice',
          chosenCount: 2,
        }),
      );
    });
    await untilShown('[data-ui="reuse.row"]');

    fireEvent.click(pickOf('Rye bread'));
    expect(onClose).toHaveBeenCalledTimes(1);

    const state = await reviewOf(analysis);
    expect(state.draft.photoIds).toEqual([photoId]);
    expect(state.draft.source).toBe('barcode');
    expect(state.draft.draft).toMatchObject({
      name: 'Rye bread',
      basis: { kind: 'grams', grams: 60 },
      units: [{ unit: 'slice', gramsEach: 30, count: 2 }],
      chosenUnit: 'slice',
      chosenCount: 2,
    });
    expect(state.draft.draft).not.toHaveProperty('id');
    expect(await h.repos.diaryRepo.count()).toBe(1);
    expect(await h.repos.diaryRepo.byDay('2026-10-25')).toEqual([entry]);
  });

  it('opens an entry of unknown weight as servings (R02.1)', async () => {
    const { analysis } = await openSheet('recent', (h) =>
      h.repos.diaryRepo.add(
        makeEntry({ name: 'Curry', basis: { kind: 'servings', count: 1.5 }, units: [] }),
      ),
    );
    await untilShown('[data-ui="reuse.row"]');
    fireEvent.click(pickOf('Curry'));

    const state = await reviewOf(analysis);
    expect(state.draft.draft.basis).toEqual({
      kind: 'servings',
      count: 1.5,
    });
  });

  it('shows the photo as a thumbnail, else the emoji, and a heart on a saved food', async () => {
    let photoId = '';
    await openSheet('recent', async (h) => {
      photoId = await createPhotoRepo(h.db).put(await storableBlob(700), {
        width: 800,
        height: 600,
      });
      const [withPhoto] = await h.repos.diaryRepo.addMany([
        makeEntry({ name: 'Salad', photoIds: [photoId], loggedAt: FACTORY_NOW - HOUR }),
        makeEntry({ name: 'Apple', emoji: '🍎', loggedAt: FACTORY_NOW - 2 * HOUR }),
      ]);
      if (withPhoto) await h.repos.savedMealsRepo.toggleFromEntry(withPhoto);
    });
    await untilShown('[data-ui="reuse.list"]');
    await until(() => rowOf('Salad').querySelector('img') !== null);

    const image = rowOf('Salad').querySelector('img');
    expect(thumbs.get(image?.getAttribute('src') ?? '')?.size).toBe(700);
    expect(within(rowOf('Salad')).getByRole('img', { name: words.row.saved })).toBeTruthy();
    expect(within(rowOf('Apple')).getByText('🍎')).toBeTruthy();
    expect(within(rowOf('Apple')).queryByRole('img', { name: words.row.saved })).toBeNull();
    expect(rowOf('Apple').textContent).toContain('410 kcal');
    expect(rowOf('Apple').textContent).toContain('P 24 g');
  });
});

// ---- Often eaten -------------------------------------------------------------------------------

describe('ReuseSheet: Often eaten', () => {
  it('puts "Café latte" and "cafe latte " with 120 kcal together under the latest, with its count (R02.7)', async () => {
    await openSheet('often', (h) =>
      h.repos.diaryRepo.addMany([
        makeEntry({ name: 'Café latte', kcal: 120, loggedAt: FACTORY_NOW - 5 * DAY }),
        makeEntry({ name: 'cafe latte ', kcal: 120, loggedAt: FACTORY_NOW - DAY }),
        makeEntry({ name: 'Toast', kcal: 250, loggedAt: FACTORY_NOW - 2 * DAY }),
        makeEntry({ name: 'Old stew', kcal: 500, loggedAt: FACTORY_NOW - 91 * DAY }),
      ]),
    );
    await untilShown('[data-ui="reuse.list"]');

    expect(screen.getByRole('dialog', { name: words.title.often })).toBeVisible();
    expect(rowNames()).toEqual(['cafe latte ', 'Toast']);
    expect(rowOf('cafe latte').textContent).toContain('2× eaten');
    expect(rowOf('Toast').textContent).toContain('1× eaten');
  });

  it('says so when nothing was logged in the last 90 days', async () => {
    await openSheet('often');
    await untilShown('[data-ui="reuse.empty"]');
    expect(emptyText()).toBe(words.empty.often);
  });
});

// ---- Search ------------------------------------------------------------------------------------

describe('ReuseSheet: search', () => {
  it('finds "Café latte" for "cafe", ignoring case, accents and the spaces around (ACC-D16-1)', async () => {
    await openSheet('recent', (h) =>
      h.repos.diaryRepo.addMany([
        makeEntry({ name: 'Café latte', loggedAt: FACTORY_NOW - HOUR }),
        makeEntry({ name: 'Toast', loggedAt: FACTORY_NOW - 2 * HOUR }),
      ]),
    );
    await untilShown('[data-ui="reuse.list"]');

    search('  CAFE ');
    expect(rowNames()).toEqual(['Café latte']);
    search('');
    expect(rowNames()).toEqual(['Café latte', 'Toast']);
  });

  it('says nothing matches, naming the query', async () => {
    await openSheet('saved', (h) => h.db.savedMeals.add(makeSavedMeal({ name: 'Porridge' })));
    await untilShown('[data-ui="reuse.list"]');

    search('pizza ');
    expect(emptyText()).toBe('Nothing matches “pizza”.');
  });
});

// ---- Saved -------------------------------------------------------------------------------------

/** Saved meals in this order, with their own ids. */
function savedMeals(...names: string[]) {
  return (h: Harness) =>
    h.db.savedMeals.bulkAdd(
      names.map((name, order) => makeSavedMeal({ id: `s${order + 1}`, name, order })),
    );
}

async function storedOrder(h: Harness): Promise<string[]> {
  return (await h.repos.savedMealsRepo.list()).map((meal) => meal.id);
}

describe('ReuseSheet: Saved', () => {
  it('lists the saved meals in their order, each with a heart', async () => {
    await openSheet('saved', savedMeals('Porridge', 'Toast', 'Soup'));
    await untilShown('[data-ui="reuse.list"]');

    expect(screen.getByRole('dialog', { name: words.title.saved })).toBeVisible();
    expect(rowNames()).toEqual(['Porridge', 'Toast', 'Soup']);
    expect(screen.getAllByRole('img', { name: words.row.saved })).toHaveLength(3);
  });

  it('says how to save one when there are none', async () => {
    await openSheet('saved');
    await untilShown('[data-ui="reuse.empty"]');
    expect(emptyText()).toBe(words.empty.saved);
  });

  it('keeps two saved meals with the same name and kcal apart, and removes only the one asked (R02.7, D-16.17)', async () => {
    const { h } = await openSheet('saved', (harness) =>
      harness.db.savedMeals.bulkAdd([
        makeSavedMeal({ id: 'oats-plain', name: 'Porridge', kcal: 320, order: 0 }),
        makeSavedMeal({ id: 'oats-berries', name: 'Porridge', kcal: 320, order: 1, note: 'b' }),
      ]),
    );
    await untilShown('[data-ui="reuse.list"]');
    expect(rowNames()).toEqual(['Porridge', 'Porridge']);

    const second = document.querySelectorAll<HTMLElement>('[data-ui="reuse.row.remove"]')[1];
    if (!second) throw new Error('No second remove button');
    fireEvent.click(second);
    await until(() => rowNames().length === 1);

    expect(await storedOrder(h)).toEqual(['oats-plain']);
  });

  it('hides the reorder buttons while searching, and keeps remove (ACC-D17-2)', async () => {
    await openSheet('saved', savedMeals('Porridge', 'Toast', 'Pot roast'));
    await untilShown('[data-ui="reuse.list"]');
    const count = (hook: string) => document.querySelectorAll(`[data-ui="${hook}"]`).length;
    expect([count('reuse.row.up'), count('reuse.row.down'), count('reuse.row.remove')]).toEqual([
      3, 3, 3,
    ]);

    search('po');
    expect(rowNames()).toEqual(['Porridge', 'Pot roast']);
    expect([count('reuse.row.up'), count('reuse.row.down'), count('reuse.row.remove')]).toEqual([
      0, 0, 2,
    ]);

    search(' ');
    expect(count('reuse.row.up')).toBe(3);
  });

  it('moves a meal up and down; the first cannot go up, the last cannot go down', async () => {
    const { h } = await openSheet('saved', savedMeals('Porridge', 'Toast', 'Soup'));
    await untilShown('[data-ui="reuse.list"]');

    expect(screen.getByRole('button', { name: 'Move Porridge up' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Move Soup down' })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Move Porridge down' }));
    await until(() => rowNames()[0] === 'Toast');
    expect(rowNames()).toEqual(['Toast', 'Porridge', 'Soup']);

    fireEvent.click(screen.getByRole('button', { name: 'Move Soup up' }));
    await until(() => rowNames()[1] === 'Soup');
    expect(await storedOrder(h)).toEqual(['s2', 's3', 's1']);
  });

  it('removes a saved meal with a swipe toward the leading edge', async () => {
    const { h } = await openSheet('saved', savedMeals('Porridge', 'Toast'));
    await untilShown('[data-ui="reuse.list"]');

    const slide = rowOf('Toast').closest<HTMLElement>('[data-part="slide"]');
    if (!slide) throw new Error('The saved row cannot be swiped');
    vi.spyOn(slide, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 400, 72));
    fireEvent.pointerDown(slide, { pointerId: 1, clientX: 350, clientY: 30, button: 0 });
    for (const x of [330, 200, 100]) {
      fireEvent.pointerMove(slide, { pointerId: 1, clientX: x, clientY: 30 });
    }
    fireEvent.pointerUp(slide, { pointerId: 1, clientX: 100, clientY: 30, button: 0 });
    await until(() => rowNames().length === 1);

    expect(rowNames()).toEqual(['Porridge']);
    expect(await storedOrder(h)).toEqual(['s1']);
  });

  it('opens a saved meal in the review with its own photos and source', async () => {
    const { analysis, onClose } = await openSheet('saved', (h) =>
      h.db.savedMeals.add(
        makeSavedMeal({ name: 'Porridge', photoIds: ['p-saved'], source: 'photo' }),
      ),
    );
    await untilShown('[data-ui="reuse.row"]');

    fireEvent.click(pickOf('Porridge'));

    const state = await reviewOf(analysis);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect([state.draft.photoIds, state.draft.source]).toEqual([['p-saved'], 'photo']);
  });
});

describe('ReuseSheet: words', () => {
  it('draws its words from a catalogue partition that passes the lint', () => {
    expect(lintCatalogue(enPartitions)).toEqual([]);
    expect(enPartitions.reuse).toBe(reuse);
  });
});
