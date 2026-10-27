import { afterEach, describe, expect, it, vi } from 'vitest';
import { fakeFetch, type FakeFetch, type FakeStep } from '../../ai/testing/fakeFetch';
import { createDiaryRepo, type DiaryRepo } from '../../data/repos/diaryRepo';
import { createDraftsRepo, type DraftsRepo } from '../../data/repos/draftsRepo';
import { createPhotoRepo, type PhotoRepo } from '../../data/repos/photoRepo';
import { createSecretsRepo, FDC_SLOT } from '../../data/repos/secretsRepo';
import type { PlatewiseDb } from '../../data/schema';
import type { AnalysisDraft, DiaryEntry } from '../../domain/model';
import { fixedClock } from '../../lib/clock';
import { storableBlob } from '../../test/blobs';
import { openTestDb } from '../../test/db';
import { FACTORY_NOW, makeEntry, makeProduct } from '../../test/factories';
import type { Scanner } from './decoder';
import { FDC_SEARCH_URL } from './fdc';
import {
  createBarcodeService,
  createLabelScanHold,
  lookupBarcode,
  offersLabelScan,
  type BarcodeLookupDeps,
  type BarcodeState,
  type LookupFailureKind,
} from './lookup';
import { OFF_PRODUCT_URL } from './off';

/** One product in its 13-digit EAN form, and the same code as a 12-digit UPC-A. */
const CODE = '0712345000108';
const UPC = '712345000108';
const OTHER_CODE = '5012345678900';
const KEY = 'fdc-key-for-tests-77';
const PHOTO_URL =
  'https://images.openfoodfacts.org/images/products/071/234/500/0108/front_en.7.400.jpg';
const DAY = 24 * 60 * 60 * 1000;

const unnamed = (code: string): string => `No name ${code}`;

// ---- Replies (our own fixtures) --------------------------------------------------------------

/** Open Food Facts knows the product with nutrition; `fields` go on top of the product. */
const offProduct = (fields: Record<string, unknown> = {}): FakeStep => ({
  json: {
    status: 1,
    product: {
      product_name: 'Rye Crackers',
      brands: 'Northmill',
      serving_quantity: 25,
      nutriments: {
        'energy-kcal_100g': 410,
        proteins_100g: 11,
        carbohydrates_100g: 68,
        fat_100g: 9,
      },
      ...fields,
    },
  },
});
const OFF_NOT_FOUND: FakeStep = { status: 404, json: { status: 0 } };
const OFF_NO_NUTRITION: FakeStep = { json: { status: 1, product: { product_name: 'Rice Cakes' } } };

/** FoodData Central has one Branded food with this GTIN. */
const fdcFood = (gtinUpc = UPC): FakeStep => ({
  json: {
    foods: [
      {
        fdcId: 912001,
        description: 'SPICED LENTIL CHIPS',
        dataType: 'Branded',
        gtinUpc,
        brandName: 'HILLTOP',
        servingSize: 28,
        servingSizeUnit: 'g',
        foodNutrients: [
          { nutrientId: 1008, unitName: 'KCAL', value: 480 },
          { nutrientId: 1003, unitName: 'G', value: 14 },
          { nutrientId: 1005, unitName: 'G', value: 60 },
          { nutrientId: 1004, unitName: 'G', value: 20 },
        ],
      },
    ],
  },
});
const PHOTO: FakeStep = { text: 'jpeg-bytes', headers: { 'content-type': 'image/jpeg' } };

// ---- Set-up ----------------------------------------------------------------------------------

const opened: PlatewiseDb[] = [];
afterEach(() => {
  for (const db of opened.splice(0)) db.close();
});

interface Repos {
  readonly diaryRepo: DiaryRepo;
  readonly draftsRepo: DraftsRepo;
  readonly photoRepo: PhotoRepo;
  readonly secretsRepo: ReturnType<typeof createSecretsRepo>;
}

/** Repositories over a fresh test database, with a FoodData Central key when one is given. */
async function openRepos(key?: string): Promise<Repos> {
  const { db } = await openTestDb();
  opened.push(db);
  const secretsRepo = createSecretsRepo(db);
  if (key !== undefined) await secretsRepo.set(FDC_SLOT, key);
  return {
    diaryRepo: createDiaryRepo(db),
    draftsRepo: createDraftsRepo(db),
    photoRepo: createPhotoRepo(db),
    secretsRepo,
  };
}

/** A label entry logged `daysAgo` days ago for `code`. */
function labelEntry(name: string, code: string, daysAgo: number, photoIds: string[] = []) {
  return makeEntry({
    name,
    kcal: 150,
    source: 'label',
    loggedAt: FACTORY_NOW - daysAgo * DAY,
    product: makeProduct({ barcode: code }),
    photoIds,
  });
}

function depsOf(fake: FakeFetch, repos: Repos, signal?: AbortSignal): BarcodeLookupDeps {
  return {
    fetch: fake.fetch,
    unnamed,
    language: 'en',
    secrets: repos.secretsRepo,
    labels: repos.diaryRepo,
    ...(signal ? { signal } : {}),
  };
}

const fdcRequests = (fake: FakeFetch) =>
  fake.requests.filter((request) => request.url.startsWith(FDC_SEARCH_URL));

// ---- The order -------------------------------------------------------------------------------

describe('lookupBarcode: the order (R02.15)', () => {
  it('takes an Open Food Facts product and never asks the saved label or FoodData Central (ACC-D20-1)', async () => {
    const repos = await openRepos(KEY);
    await repos.diaryRepo.add(labelEntry('My crackers label', CODE, 1));
    const labels = { latestLabelFor: vi.fn(repos.diaryRepo.latestLabelFor) };
    const fake = fakeFetch().on(OFF_PRODUCT_URL, offProduct());

    const result = await lookupBarcode(CODE, { ...depsOf(fake, repos), labels });

    if (!result.ok || result.value.source !== 'openFoodFacts') throw new Error('not OFF');
    expect(result.value.product.draft.name).toBe('Northmill Rye Crackers');
    expect(fake.requests).toHaveLength(1);
    expect(labels.latestLabelFor).not.toHaveBeenCalled();
  });

  it.each([
    ['rateLimited', { status: 429, json: { status: 0 } }],
    ['unavailable', { status: 503, text: 'down for maintenance' }],
    ['unexpected', { text: 'not json at all' }],
    ['network', { fail: 'network' }],
  ] satisfies [LookupFailureKind, FakeStep][])(
    'stops at Open Food Facts when it fails with %s, saved label and key or not',
    async (kind, step) => {
      const repos = await openRepos(KEY);
      await repos.diaryRepo.add(labelEntry('My crackers label', CODE, 1));
      const fake = fakeFetch().on(OFF_PRODUCT_URL, step);

      const result = await lookupBarcode(CODE, depsOf(fake, repos));

      expect(result).toEqual({ ok: false, error: { kind } });
      expect(fake.requests).toHaveLength(1);
      expect(offersLabelScan(kind)).toBe(false);
    },
  );

  it('sends nothing at all for a code that is not 1–24 digits', async () => {
    const repos = await openRepos(KEY);
    const fake = fakeFetch();

    const result = await lookupBarcode('ABC-0042', depsOf(fake, repos));

    expect(result).toEqual({ ok: false, error: { kind: 'invalid' } });
    expect(fake.requests).toHaveLength(0);
  });

  it('reopens the newest label saved for the code after a not-found, without asking FoodData Central (ACC-D21-1)', async () => {
    const repos = await openRepos(KEY);
    await repos.diaryRepo.addMany([
      labelEntry('Crackers label, first try', CODE, 9),
      labelEntry('Crackers label, again', CODE, 2),
      // Newer, but not a label, or not this product.
      makeEntry({
        name: 'Scanned crackers',
        source: 'barcode',
        loggedAt: FACTORY_NOW - DAY,
        product: makeProduct({ barcode: CODE }),
      }),
      labelEntry('Another product', OTHER_CODE, 0),
      // A label photo logged with no product details is tied to no barcode.
      makeEntry({ name: 'Label without details', source: 'label', loggedAt: FACTORY_NOW }),
    ]);
    const fake = fakeFetch().on(OFF_PRODUCT_URL, OFF_NOT_FOUND);

    const result = await lookupBarcode(CODE, depsOf(fake, repos));

    if (!result.ok || result.value.source !== 'savedLabel') throw new Error('no saved label');
    expect(result.value.entry.name).toBe('Crackers label, again');
    expect(fdcRequests(fake)).toHaveLength(0);
  });

  it('finds a label saved under the UPC-A form when the EAN-13 form is scanned, and back (R02.14)', async () => {
    const repos = await openRepos();
    await repos.diaryRepo.add(labelEntry('Saved as UPC-A', UPC, 1));
    const fake = fakeFetch().on(OFF_PRODUCT_URL, OFF_NO_NUTRITION, OFF_NO_NUTRITION);

    const asEan = await lookupBarcode(CODE, depsOf(fake, repos));
    const asUpc = await lookupBarcode(UPC, depsOf(fake, repos));

    for (const result of [asEan, asUpc]) {
      if (!result.ok || result.value.source !== 'savedLabel') throw new Error('no saved label');
      expect(result.value.entry.name).toBe('Saved as UPC-A');
    }
    // Open Food Facts is still asked with the code exactly as scanned.
    expect(fake.requests.map((request) => new URL(request.url).pathname)).toEqual([
      `/api/v2/product/${CODE}.json`,
      `/api/v2/product/${UPC}.json`,
    ]);
  });

  it('asks FoodData Central after no nutrition and no saved label, with a stored key (ACC-J9-1)', async () => {
    const repos = await openRepos(KEY);
    const fake = fakeFetch().on(OFF_PRODUCT_URL, OFF_NO_NUTRITION).on(FDC_SEARCH_URL, fdcFood());

    const result = await lookupBarcode(CODE, depsOf(fake, repos));

    if (!result.ok || result.value.source !== 'foodDataCentral') throw new Error('not FDC');
    expect(result.value.product.draft.name).toBe('Hilltop Spiced Lentil Chips');
    expect(result.value.product.draft.product?.source).toBe('fdc');
    expect(fake.requests).toHaveLength(2);
    expect(fdcRequests(fake)[0]?.headers['x-api-key']).toBe(KEY);
  });

  it('sends nothing to FoodData Central without a key or with a blank one, and keeps Open Food Facts’ not-found', async () => {
    for (const key of [undefined, '', '   ']) {
      const repos = await openRepos(key);
      const fake = fakeFetch().on(OFF_PRODUCT_URL, OFF_NOT_FOUND);

      const result = await lookupBarcode(CODE, depsOf(fake, repos));

      expect(result).toEqual({ ok: false, error: { kind: 'notFound' } });
      expect(fdcRequests(fake)).toHaveLength(0);
    }
  });

  it('keeps Open Food Facts’ own miss when FoodData Central is down or has no exact match', async () => {
    const cases: [FakeStep, FakeStep, LookupFailureKind][] = [
      [OFF_NOT_FOUND, { status: 503, text: 'unavailable' }, 'notFound'],
      [OFF_NO_NUTRITION, { status: 429, text: 'slow down' }, 'noNutrition'],
      [OFF_NOT_FOUND, { json: { foods: [] } }, 'notFound'],
      [OFF_NO_NUTRITION, fdcFood('00099999999999'), 'noNutrition'],
    ];
    for (const [offStep, fdcStep, kind] of cases) {
      const repos = await openRepos(KEY);
      const fake = fakeFetch().on(OFF_PRODUCT_URL, offStep).on(FDC_SEARCH_URL, fdcStep);

      expect(await lookupBarcode(CODE, depsOf(fake, repos))).toEqual({
        ok: false,
        error: { kind },
      });
      expect(fdcRequests(fake)).toHaveLength(1);
    }
  });

  it('reports a key FoodData Central refuses as its own failure, which offers a label scan', async () => {
    const repos = await openRepos(KEY);
    const fake = fakeFetch()
      .on(OFF_PRODUCT_URL, OFF_NOT_FOUND)
      .on(FDC_SEARCH_URL, { status: 403, json: { error: { code: 'API_KEY_INVALID' } } });

    const result = await lookupBarcode(CODE, depsOf(fake, repos));

    expect(result).toEqual({ ok: false, error: { kind: 'keyRefused' } });
    expect(offersLabelScan('keyRefused')).toBe(true);
  });

  it('goes on to FoodData Central when the diary cannot be read', async () => {
    const repos = await openRepos(KEY);
    const fake = fakeFetch().on(OFF_PRODUCT_URL, OFF_NOT_FOUND).on(FDC_SEARCH_URL, fdcFood());
    const labels = { latestLabelFor: () => Promise.reject(new Error('unreadable diary')) };

    const result = await lookupBarcode(CODE, { ...depsOf(fake, repos), labels });

    expect(result.ok && result.value.source).toBe('foodDataCentral');
  });

  it('ends quietly when the person cancels', async () => {
    const repos = await openRepos(KEY);
    const controller = new AbortController();
    controller.abort();

    const result = await lookupBarcode(CODE, depsOf(fakeFetch(), repos, controller.signal));

    expect(result).toEqual({ ok: false, error: { kind: 'cancelled' } });
  });

  it('offers a label scan only for not found, no nutrition and a refused key', () => {
    const kinds: LookupFailureKind[] = [
      'invalid',
      'notFound',
      'noNutrition',
      'rateLimited',
      'unavailable',
      'unexpected',
      'offline',
      'timeout',
      'network',
      'keyRefused',
      'generic',
    ];
    expect(kinds.filter(offersLabelScan)).toEqual(['notFound', 'noNutrition', 'keyRefused']);
  });
});

// ---- The hand-off ----------------------------------------------------------------------------

describe('createLabelScanHold (R02.20)', () => {
  it('gives the held code once, trimmed', () => {
    const hold = createLabelScanHold();
    hold.arm(` ${CODE} `);
    expect(hold.armed()).toBe(CODE);
    expect(hold.take()).toBe(CODE);
    expect(hold.take()).toBeNull();
  });

  it('forgets the code when cleared, and holds nothing for a blank code', () => {
    const hold = createLabelScanHold();
    hold.arm(CODE);
    hold.clear();
    expect(hold.take()).toBeNull();
    hold.arm('   ');
    expect(hold.armed()).toBeNull();
  });

  it('holds only the latest code', () => {
    const hold = createLabelScanHold();
    hold.arm(CODE);
    hold.arm(OTHER_CODE);
    expect(hold.take()).toBe(OTHER_CODE);
  });
});

// ---- The service -----------------------------------------------------------------------------

/** A scanner the service never uses here. */
const idleScanner: Scanner = {
  openCamera: () => Promise.resolve({ ok: false, error: 'unavailable' }),
  watch: () => () => undefined,
};

interface ServiceOptions {
  readonly key?: string;
  readonly fetch?: (fake: FakeFetch) => typeof fetch;
  readonly draftsRepo?: (real: DraftsRepo) => DraftsRepo;
  /** Runs inside the photo store, after the photo is written and before it reports back. */
  readonly whileStoring?: () => Promise<void>;
}

async function openService(options: ServiceOptions = {}) {
  const repos = await openRepos(options.key);
  const fake = fakeFetch();
  const reviews: (AnalysisDraft | undefined)[] = [];
  const openReview = vi.fn(async () => {
    reviews.push((await repos.draftsRepo.load())?.draft);
  });
  const stored: string[] = [];
  const photos = {
    store: vi.fn(async (_blob: Blob) => {
      const id = await repos.photoRepo.put(await storableBlob(32), { width: 8, height: 8 });
      stored.push(id);
      await options.whileStoring?.();
      return { kind: 'stored' as const, id };
    }),
  };
  const draftsRepo = options.draftsRepo ? options.draftsRepo(repos.draftsRepo) : repos.draftsRepo;
  const barcode = createBarcodeService({
    fetch: options.fetch ? options.fetch(fake) : fake.fetch,
    secretsRepo: repos.secretsRepo,
    diaryRepo: repos.diaryRepo,
    draftsRepo,
    photoRepo: repos.photoRepo,
    photos,
    openReview,
    unnamed,
    language: 'en',
    scanner: idleScanner,
    clock: fixedClock(FACTORY_NOW, 'America/New_York'),
  });
  const phases: BarcodeState['phase'][] = [];
  barcode.subscribe(() => phases.push(barcode.getSnapshot().phase));
  return { ...repos, fake, barcode, openReview, reviews, photos, stored, phases };
}

/** A `fetch` that never answers requests to `prefix` until they are aborted. */
function hangingOn(prefix: string, fake: FakeFetch) {
  let started: () => void = () => undefined;
  const requested = new Promise<void>((resolve) => (started = resolve));
  const fetch: typeof globalThis.fetch = (input, init) => {
    const url = typeof input === 'string' ? input : 'href' in input ? input.href : input.url;
    if (!url.startsWith(prefix)) return fake.fetch(input, init);
    started();
    return new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(init.signal?.reason));
    });
  };
  return { fetch, requested };
}

describe('createBarcodeService', () => {
  it('stores an Open Food Facts product with its photo as the analysis draft, then opens its review (ACC-D20-1)', async () => {
    const s = await openService();
    s.fake.on(OFF_PRODUCT_URL, offProduct({ image_front_url: PHOTO_URL })).on(PHOTO_URL, PHOTO);

    await s.barcode.lookup(` ${CODE}`);

    expect(s.phases).toEqual(['looking', 'idle']);
    expect(s.openReview).toHaveBeenCalledOnce();
    const stored = await s.draftsRepo.load();
    expect(stored?.draft).toMatchObject({
      source: 'barcode',
      fromSavedLabel: false,
      photoIds: s.stored,
      createdAt: FACTORY_NOW,
    });
    expect(s.stored).toHaveLength(1);
    expect(stored?.draft.draft.name).toBe('Northmill Rye Crackers');
    expect(stored?.draft.draft.product?.barcode).toBe(CODE);
    expect(s.reviews).toEqual([stored?.draft]);
  });

  /** A service that keeps every draft it hands the drafts repository. */
  async function openSavingService() {
    const saved: AnalysisDraft[] = [];
    const s = await openService({
      draftsRepo: (real) => ({
        ...real,
        saveResult: (generation, draft) => {
          saved.push(draft);
          return real.saveResult(generation, draft);
        },
      }),
    });
    return { ...s, saved };
  }

  it("marks Open Food Facts' allergens on the stored product's ingredient list (P06-18)", async () => {
    const s = await openSavingService();
    s.fake.on(
      OFF_PRODUCT_URL,
      offProduct({
        ingredients_text: 'Rye flour, sesame seeds, salt',
        ingredients_text_with_allergens:
          '<span class="allergen">Rye</span> flour, <span class="allergen">sesame</span> seeds, salt',
      }),
    );

    await s.barcode.lookup(CODE);

    expect(s.saved).toHaveLength(1);
    expect(s.saved[0]?.draft.product).toMatchObject({
      ingredients: 'Rye flour, sesame seeds, salt',
      markedIngredients: '_Rye_ flour, _sesame_ seeds, salt',
    });
  });

  it.each([
    ['marks nothing', 'Rye flour, salt'],
    ['says other words', '<span class="allergen">Wheat</span> flour, salt'],
  ])('adds no marked list when the markup %s', async (_case, markup) => {
    const s = await openSavingService();
    s.fake.on(
      OFF_PRODUCT_URL,
      offProduct({ ingredients_text: 'Rye flour, salt', ingredients_text_with_allergens: markup }),
    );

    await s.barcode.lookup(CODE);

    expect(s.saved[0]?.draft.product?.ingredients).toBe('Rye flour, salt');
    expect(s.saved[0]?.draft.product).not.toHaveProperty('markedIngredients');
  });

  it('opens the product without a photo when the photo cannot be had', async () => {
    const s = await openService();
    s.fake
      .on(OFF_PRODUCT_URL, offProduct({ image_front_url: PHOTO_URL }))
      .on(PHOTO_URL, { status: 404, text: 'gone' });

    await s.barcode.lookup(CODE);

    expect((await s.draftsRepo.load())?.draft.photoIds).toEqual([]);
    expect(s.photos.store).not.toHaveBeenCalled();
    expect(s.openReview).toHaveBeenCalledOnce();
  });

  it('opens a saved label as a label draft marked as such, with its own photo (ACC-D21-1)', async () => {
    const s = await openService();
    const labelPhoto = await s.photoRepo.put(await storableBlob(16), { width: 8, height: 8 });
    const entry = {
      ...labelEntry('Crackers from the label', UPC, 3, [labelPhoto]),
      nutrients: { fibre: 4.5, sodium: 310 },
      basis: { kind: 'grams', grams: 45 },
      units: [{ unit: 'slice', gramsEach: 15 }],
      chosenUnit: 'slice',
      chosenCount: 3,
    } satisfies DiaryEntry;
    await s.diaryRepo.add(entry);
    s.fake.on(OFF_PRODUCT_URL, OFF_NOT_FOUND);

    await s.barcode.lookup(CODE);

    const draft = (await s.draftsRepo.load())?.draft;
    expect(draft).toMatchObject({ source: 'label', fromSavedLabel: true, photoIds: [labelPhoto] });
    // Its values, amount and units, as logged.
    expect(draft?.draft).toMatchObject({
      name: 'Crackers from the label',
      kcal: 150,
      nutrients: { fibre: 4.5, sodium: 310 },
      basis: { kind: 'grams', grams: 45 },
      units: [{ unit: 'slice', gramsEach: 15 }],
      chosenUnit: 'slice',
      chosenCount: 3,
    });
    expect(draft?.draft.product?.barcode).toBe(UPC);
    expect(draft?.draft).not.toHaveProperty('id');
    expect(draft?.draft).not.toHaveProperty('meal');
    expect(s.openReview).toHaveBeenCalledOnce();
  });

  it('stores FoodData Central’s product without a photo (ACC-J9-1)', async () => {
    const s = await openService({ key: KEY });
    s.fake.on(OFF_PRODUCT_URL, OFF_NOT_FOUND).on(FDC_SEARCH_URL, fdcFood());

    await s.barcode.lookup(CODE);

    const draft = (await s.draftsRepo.load())?.draft;
    expect(draft).toMatchObject({ source: 'barcode', photoIds: [], fromSavedLabel: false });
    expect(draft?.draft.product?.source).toBe('fdc');
  });

  it('offers Scan label after a miss everywhere and holds the code for one analysis (ACC-D20-2, R02.20)', async () => {
    const s = await openService();
    s.fake.on(OFF_PRODUCT_URL, OFF_NOT_FOUND);

    await s.barcode.lookup(CODE);

    expect(s.barcode.getSnapshot()).toEqual({ phase: 'failed', code: CODE, failure: 'notFound' });
    expect(s.openReview).not.toHaveBeenCalled();
    expect(await s.draftsRepo.load()).toBeNull();
    expect(s.barcode.armLabelScan()).toBe(CODE);
    expect(s.barcode.getSnapshot()).toEqual({ phase: 'idle' });
    expect(s.barcode.takeArmedLabel()).toBe(CODE);
    expect(s.barcode.takeArmedLabel()).toBeNull();
  });

  it('offers Scan label when FoodData Central refuses the key', async () => {
    const s = await openService({ key: KEY });
    s.fake.on(OFF_PRODUCT_URL, OFF_NO_NUTRITION).on(FDC_SEARCH_URL, { status: 401, text: 'no' });

    await s.barcode.lookup(CODE);

    expect(s.barcode.getSnapshot()).toEqual({ phase: 'failed', code: CODE, failure: 'keyRefused' });
    expect(s.barcode.armLabelScan()).toBe(CODE);
  });

  it('forgets a held code when it is cleared, or when another lookup starts (R02.20)', async () => {
    const s = await openService();
    s.fake.on(OFF_PRODUCT_URL, OFF_NOT_FOUND, OFF_NOT_FOUND, offProduct());

    await s.barcode.lookup(CODE);
    s.barcode.armLabelScan();
    s.barcode.clearArmedLabel();
    expect(s.barcode.takeArmedLabel()).toBeNull();

    await s.barcode.lookup(CODE);
    s.barcode.armLabelScan();
    await s.barcode.lookup(OTHER_CODE);
    expect(s.barcode.takeArmedLabel()).toBeNull();
  });

  it('offers Retry, not Scan label, when Open Food Facts is rate limited, and Retry asks again', async () => {
    const s = await openService();
    s.fake.on(OFF_PRODUCT_URL, { status: 429, text: 'slow down' }, offProduct());

    await s.barcode.lookup(CODE);
    expect(s.barcode.getSnapshot()).toEqual({
      phase: 'failed',
      code: CODE,
      failure: 'rateLimited',
    });
    expect(s.barcode.armLabelScan()).toBeNull();
    expect(s.barcode.getSnapshot().phase).toBe('failed');

    await s.barcode.retry();

    expect(s.fake.requests).toHaveLength(2);
    expect(s.openReview).toHaveBeenCalledOnce();
    expect(s.barcode.takeArmedLabel()).toBeNull();
  });

  it('shows nothing and stores nothing when Cancel comes while looking', async () => {
    const s = await openService({ fetch: (fake) => hangingOn(OFF_PRODUCT_URL, fake).fetch });

    const done = s.barcode.lookup(CODE);
    expect(s.barcode.getSnapshot()).toEqual({ phase: 'looking', code: CODE });
    s.barcode.cancel();
    await done;

    expect(s.phases).toEqual(['looking', 'idle']);
    expect(s.openReview).not.toHaveBeenCalled();
    expect(await s.draftsRepo.load()).toBeNull();
  });

  it('lets the product photo go when Cancel comes while it is being stored', async () => {
    let cancel: () => void = () => undefined;
    const s = await openService({
      whileStoring: () => {
        cancel();
        return Promise.resolve();
      },
    });
    cancel = () => s.barcode.cancel();
    s.fake.on(OFF_PRODUCT_URL, offProduct({ image_front_url: PHOTO_URL })).on(PHOTO_URL, PHOTO);

    await s.barcode.lookup(CODE);

    expect(s.stored).toHaveLength(1);
    expect(await s.photoRepo.get(s.stored[0] ?? '')).toBeNull();
    expect(await s.draftsRepo.load()).toBeNull();
    expect(s.openReview).not.toHaveBeenCalled();
    expect(s.barcode.getSnapshot()).toEqual({ phase: 'idle' });
  });

  it('stops a lookup still running when a newer one starts, and opens only the newer', async () => {
    let hanging: ReturnType<typeof hangingOn> | undefined;
    const s = await openService({
      fetch: (fake) => {
        hanging = hangingOn(PHOTO_URL, fake);
        return hanging.fetch;
      },
    });
    s.fake.on(OFF_PRODUCT_URL, offProduct({ image_front_url: PHOTO_URL }), offProduct());

    const first = s.barcode.lookup(CODE);
    await hanging?.requested;
    await s.barcode.lookup(OTHER_CODE);
    await first;

    expect(s.openReview).toHaveBeenCalledOnce();
    const draft = (await s.draftsRepo.load())?.draft;
    expect(draft?.draft.product?.barcode).toBe(OTHER_CODE);
    expect(s.photos.store).not.toHaveBeenCalled();
  });

  it('says so with the generic message when the draft cannot be stored', async () => {
    const s = await openService({
      draftsRepo: (real) => ({ ...real, begin: () => Promise.reject(new Error('disk full')) }),
    });
    s.fake.on(OFF_PRODUCT_URL, offProduct());

    await s.barcode.lookup(CODE);

    expect(s.barcode.getSnapshot()).toEqual({ phase: 'failed', code: CODE, failure: 'generic' });
    expect(s.barcode.armLabelScan()).toBeNull();
    expect(s.openReview).not.toHaveBeenCalled();
  });
});
