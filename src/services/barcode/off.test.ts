import { describe, expect, it, vi } from 'vitest';
import { fakeFetch, type FakeReply, type FakeStep } from '../../ai/testing/fakeFetch';
import { advanceAsync, useFakeTime } from '../../test/time';
import notFoundReply from './__fixtures__/off-not-found.json';
import productReply from './__fixtures__/off-product.json';
import {
  displayTags,
  downloadProductPhoto,
  lookupOff,
  MAX_PHOTO_BYTES,
  OFF_FIELDS,
  OFF_PRODUCT_URL,
  OFF_TIMEOUT_MS,
  offCode,
  type OffDeps,
} from './off';
import { LABEL_EMOJI } from './product';

const START = '2026-10-26T12:00:00Z';
const CODE = '0071234567896';
const PHOTO_URL = productReply.product.image_front_url;

const unnamed = (code: string): string => `Unnamed ${code}`;

/** A fake with one Open Food Facts route, and the deps that use it. */
function setup(...steps: readonly FakeStep[]): {
  fake: ReturnType<typeof fakeFetch>;
  deps: OffDeps;
} {
  const fake = fakeFetch().on(OFF_PRODUCT_URL, ...steps);
  return { fake, deps: { fetch: fake.fetch, unnamed, language: 'en-GB' } };
}

/** A reply holding one product: a name, a 100 g serving and these fields on top. */
function product(fields: Record<string, unknown>): FakeReply {
  return { json: { status: 1, product: { product_name: 'Test Bar', ...fields } } };
}

/** The draft of a lookup that must succeed. */
async function draftOf(step: FakeStep, code = CODE) {
  const { deps } = setup(step);
  const result = await lookupOff(code, deps);
  if (!result.ok) throw new Error(`lookup failed: ${result.error.kind}`);
  return result.value.draft;
}

/** The failure kind of a lookup that must fail. */
async function kindOf(step: FakeStep): Promise<string> {
  const { deps } = setup(step);
  const result = await lookupOff(CODE, deps);
  if (result.ok) throw new Error('lookup succeeded');
  return result.error.kind;
}

describe('lookupOff: the request', () => {
  it('sends the code as scanned with leading zeros, the field list, lc and app_name', async () => {
    const { fake, deps } = setup({ json: productReply });

    await lookupOff(` ${CODE}\n`, deps);

    expect(fake.requests).toHaveLength(1);
    const [request] = fake.requests;
    const url = new URL(request?.url ?? '');
    expect(request?.method).toBe('GET');
    expect(url.origin + url.pathname).toBe(`${OFF_PRODUCT_URL}${CODE}.json`);
    expect(url.searchParams.get('fields')?.split(',').sort()).toEqual([...OFF_FIELDS].sort());
    expect(OFF_FIELDS).toHaveLength(19);
    expect(url.searchParams.get('lc')).toBe('en');
    expect(url.searchParams.get('app_name')).toBe('Platewise');
    expect(request?.headers.accept).toBe('application/json');
    // Browsers forbid setting it; the app never fakes one.
    expect(request?.headers['user-agent']).toBeUndefined();
  });

  it("asks in the browser's language when none is given", async () => {
    vi.spyOn(navigator, 'language', 'get').mockReturnValue('pt-BR');
    const { fake, deps } = setup({ json: productReply });

    await lookupOff(CODE, { fetch: deps.fetch, unnamed });

    expect(new URL(fake.requests[0]?.url ?? '').searchParams.get('lc')).toBe('pt');
  });

  it('refuses a code that is not 1–24 ASCII digits and sends nothing', async () => {
    const { fake, deps } = setup();
    const refused = ['', '   ', '123 456', '123/456', 'ABC123', '١٢٣٤٥٦٧٨', '1'.repeat(25)];

    for (const code of refused) {
      expect(await lookupOff(code, deps)).toEqual({ ok: false, error: { kind: 'invalid' } });
    }
    expect(fake.requests).toHaveLength(0);
    expect(offCode('1'.repeat(24))).toBe('1'.repeat(24));
    expect(offCode(' 007 ')).toBe('007');
  });
});

describe('lookupOff: replies', () => {
  it('maps 404 to notFound whatever the body, 429 to rateLimited and 5xx to unavailable', async () => {
    expect(await kindOf({ status: 404, json: notFoundReply })).toBe('notFound');
    expect(await kindOf({ status: 404, text: 'gone' })).toBe('notFound');
    expect(await kindOf({ status: 429, text: 'slow down' })).toBe('rateLimited');
    expect(await kindOf({ status: 500, text: 'down' })).toBe('unavailable');
    expect(await kindOf({ status: 503, json: { status: 0 } })).toBe('unavailable');
  });

  it('maps any other non-2xx status and an unreadable body to unexpected', async () => {
    expect(await kindOf({ status: 301, text: '' })).toBe('unexpected');
    expect(await kindOf({ status: 403, json: {} })).toBe('unexpected');
    expect(await kindOf({ text: 'not json' })).toBe('unexpected');
    expect(await kindOf({ json: [productReply] })).toBe('unexpected');
  });

  it('maps status 0, also written as text, and a missing product to notFound', async () => {
    expect(await kindOf({ json: notFoundReply })).toBe('notFound');
    expect(await kindOf({ json: { status: '0', product: productReply.product } })).toBe('notFound');
    expect(await kindOf({ json: { status: 1, product: null } })).toBe('notFound');
    expect(await kindOf({ json: { status: 1 } })).toBe('notFound');
  });

  it('maps a product without kcal, protein, carbs or fat to noNutrition', async () => {
    expect(await kindOf(product({}))).toBe('noNutrition');
    expect(await kindOf(product({ nutriments: {} }))).toBe('noNutrition');
    expect(await kindOf(product({ nutriments: { sugars_100g: 12, salt_100g: 1 } }))).toBe(
      'noNutrition',
    );
  });
});

describe('lookupOff: network', () => {
  it('reports a failed request as network, or offline when the device is offline', async () => {
    expect(await kindOf({ fail: 'network' })).toBe('network');

    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    expect(await kindOf({ fail: 'network' })).toBe('offline');
  });

  it('stops at its 30 s limit with timeout, not before', async () => {
    useFakeTime(START);
    const { deps } = setup({ json: productReply, delayMs: 60_000 });
    let settled = false;
    const result = lookupOff(CODE, deps).finally(() => (settled = true));

    await advanceAsync(OFF_TIMEOUT_MS - 1);
    expect(settled).toBe(false);
    await advanceAsync(1);

    expect(await result).toEqual({ ok: false, error: { kind: 'timeout' } });
  });

  it("stops at the person's Cancel with cancelled, and sends nothing when already cancelled", async () => {
    useFakeTime(START);
    const cancel = new AbortController();
    const { fake, deps } = setup({ json: productReply, delayMs: 5_000 });
    const result = lookupOff(CODE, { ...deps, signal: cancel.signal });

    await advanceAsync(1_000);
    cancel.abort();

    expect(await result).toEqual({ ok: false, error: { kind: 'cancelled' } });
    expect(await lookupOff(CODE, { ...deps, signal: cancel.signal })).toEqual({
      ok: false,
      error: { kind: 'cancelled' },
    });
    expect(fake.requests).toHaveLength(1);
  });
});

describe('lookupOff: one serving (R02.16)', () => {
  it('reads our fixture per serving, preferring per-serving values to scaled per-100 g ones', async () => {
    const { deps } = setup({ json: productReply });

    const result = await lookupOff(CODE, deps);

    if (!result.ok) throw new Error(result.error.kind);
    const { draft, source, ingredientsMarkup } = result.value;
    expect(source).toBe('barcode');
    expect(draft.name).toBe('Kestrel Valley Toasted Barley Crisps');
    // kcal and fat per serving as given (not 455 × 0.3 and 18 × 0.3).
    expect(draft.kcal).toBe(136);
    expect(draft.fat).toBe(5.2);
    // Protein and carbs only per 100 g, scaled to the 30 g serving; "61,5" is 61.5.
    expect(draft.protein).toBeCloseTo(2.82, 10);
    expect(draft.carbs).toBeCloseTo(18.45, 10);
    expect(draft.nutrients).toEqual({
      sugar: 1.2,
      fibre: 2.2,
      saturatedFat: 0.6,
      // Per serving as given: 0.4 g is 400 mg.
      sodium: 400,
      calcium: 15,
      vitaminD: 1.2,
    });
    expect(draft.extras).toEqual({ betaAlanine: 0.8 });
    expect(draft.basis).toEqual({ kind: 'grams', grams: 30 });
    expect(draft.units).toEqual([
      { unit: 'serving', gramsEach: 30, count: 1 },
      { unit: 'package', gramsEach: 180, count: 30 / 180 },
    ]);
    expect(draft.chosenUnit).toBe('serving');
    expect(draft.chosenCount).toBe(1);
    expect(draft.emoji).toBe(LABEL_EMOJI);
    expect(draft.lines).toEqual([]);
    expect(draft.progressive).toBe(false);
    expect(draft.product).toEqual({
      barcode: CODE,
      package: '180 g',
      ingredients: 'Barley flour, sunflower oil, oat flakes, sea salt',
      allergens: ['Gluten', 'Avoine'],
      traces: ['Sesame seeds'],
      labels: ['Vegan', 'No added sugar'],
      categories: ['Snacks', 'Salty snacks', 'Crisps'],
      nutri: 'C',
      nova: 3,
      imageUrl: PHOTO_URL,
    });
    expect(ingredientsMarkup).toBe(productReply.product.ingredients_text_with_allergens);
  });

  it('scales per-100 g values by 0.3 for a 30 g serving', async () => {
    const draft = await draftOf(
      product({
        serving_quantity: 30,
        nutriments: {
          'energy-kcal_100g': 200,
          proteins_100g: 10,
          carbohydrates_100g: 50,
          fat_100g: 20,
        },
      }),
    );

    expect(draft.kcal).toBe(60);
    expect(draft.protein).toBeCloseTo(3, 10);
    expect(draft.carbs).toBeCloseTo(15, 10);
    expect(draft.fat).toBeCloseTo(6, 10);
  });

  it('converts kJ-only energy to kcal and rounds kcal to a whole number', async () => {
    const perHundred = await draftOf(product({ nutriments: { energy_100g: 1046 } }));
    const perServing = await draftOf(
      product({ serving_quantity: 50, nutriments: { energy_serving: 500 } }),
    );

    expect(perHundred.kcal).toBe(250);
    // 500 kJ is 119.5 kcal.
    expect(perServing.kcal).toBe(120);
    expect(perServing.protein).toBe(0);
  });

  it('turns grams into mg and mcg and rounds optional values to 0.1', async () => {
    const draft = await draftOf(
      product({
        nutriments: {
          proteins_100g: 3,
          sodium_100g: 0.4,
          potassium_100g: 0.1234,
          iron_100g: '0,0021',
          'vitamin-b12_100g': 0.0000025,
          'vitamin-a_100g': 0.00009,
          'omega-3-fat_100g': 0.123,
          'added-sugars_100g': 2.04,
          taurine_100g: 1.04,
          'l-carnitine_100g': 0.25,
        },
      }),
    );

    expect(draft.nutrients).toEqual({
      sodium: 400,
      potassium: 123.4,
      iron: 2.1,
      vitaminB12: 2.5,
      vitaminA: 90,
      omega3: 0.1,
      addedSugar: 2,
    });
    expect(draft.extras).toEqual({ taurine: 1, carnitine: 0.3 });
  });

  it('takes the serving from its quantity, else its text, else 100 g, and never below 1 g', async () => {
    const core = { nutriments: { 'energy-kcal_100g': 100 } };
    const tiny = await draftOf(product({ ...core, serving_quantity: 0.4 }));
    const fromText = await draftOf(product({ ...core, serving_size: '2 tbsp (32 g)' }));
    const zeroQuantity = await draftOf(
      product({ ...core, serving_quantity: 0, serving_size: '45g' }),
    );
    const fallback = await draftOf(product({ ...core, serving_size: 'one bowl' }));

    expect(tiny.basis).toEqual({ kind: 'grams', grams: 1 });
    expect(tiny.kcal).toBe(1);
    expect(fromText.basis).toEqual({ kind: 'grams', grams: 32 });
    expect(zeroQuantity.basis).toEqual({ kind: 'grams', grams: 45 });
    expect(fallback.basis).toEqual({ kind: 'grams', grams: 100 });
    expect(fallback.kcal).toBe(100);
  });

  it('offers a package unit only when its weight is known and differs from the serving', async () => {
    const core = { serving_quantity: 250, nutriments: { 'energy-kcal_100g': 40 } };
    const units = async (fields: Record<string, unknown>) =>
      (await draftOf(product({ ...core, ...fields }))).units.map((u) => [u.unit, u.gramsEach]);

    expect(await units({ product_quantity: 1, product_quantity_unit: 'KG' })).toEqual([
      ['serving', 250],
      ['package', 1000],
    ]);
    expect(await units({ quantity: '1,5 l' })).toEqual([
      ['serving', 250],
      ['package', 1500],
    ]);
    expect(await units({ quantity: '2 x 250 g' })).toEqual([['serving', 250]]);
    expect(await units({ product_quantity: '250.005', product_quantity_unit: 'g' })).toEqual([
      ['serving', 250],
    ]);
    expect(await units({})).toEqual([['serving', 250]]);
  });

  it('names the product brand first unless the name already holds it', async () => {
    const core = { nutriments: { fat_100g: 1 } };
    const name = async (fields: Record<string, unknown>) =>
      (await draftOf({ json: { status: 1, product: { ...core, ...fields } } })).name;

    expect(await name({ product_name: 'Rye Thins', brands: 'Hollow Oak, Other' })).toBe(
      'Hollow Oak Rye Thins',
    );
    expect(await name({ product_name: 'HOLLOW OAK rye thins', brands: 'Hollow Oak' })).toBe(
      'HOLLOW OAK rye thins',
    );
    expect(await name({ product_name: ' ', generic_name: 'Rye crackers' })).toBe('Rye crackers');
    expect(await name({ brands: 'Hollow Oak' })).toBe('Hollow Oak');
    expect(await name({ brands: ', Hollow Oak' })).toBe(`Unnamed ${CODE}`);
    expect(await name({})).toBe(`Unnamed ${CODE}`);
  });

  it('cleans tags: `en:gluten` → "Gluten", no repeats, at most 16, 16, 12 and 8', async () => {
    const many = (prefix: string) => Array.from({ length: 20 }, (_, i) => `en:${prefix}-${i}`);
    const draft = await draftOf(
      product({
        nutriments: { fat_100g: 1 },
        allergens_tags: ['en:gluten', 'EN:x', 'en:Gluten', 7, 'en:', 'en:peanut_oil'],
        traces_tags: many('trace'),
        labels_tags: many('label'),
        categories_tags: many('category'),
      }),
    );

    expect(draft.product?.allergens).toEqual(['Gluten', 'EN:x', 'Peanut oil']);
    expect(draft.product?.traces).toHaveLength(16);
    expect(draft.product?.labels).toHaveLength(12);
    expect(draft.product?.categories).toEqual(many('category').slice(0, 8).map(shownTag));
    expect(displayTags(['fr:sans-gluten', 'de:bio'], 1)).toEqual(['Sans gluten']);
    expect(displayTags('en:milk', 4)).toEqual([]);
  });

  it('upper-cases the scores unless unknown, and keeps NOVA only for 1–4', async () => {
    const info = async (fields: Record<string, unknown>) =>
      (await draftOf(product({ nutriments: { fat_100g: 1 }, ...fields }))).product;

    expect(await info({ nutriscore_grade: 'e', ecoscore_grade: 'b', nova_group: 4 })).toMatchObject(
      { nutri: 'E', eco: 'B', nova: 4 },
    );
    const unknown = await info({
      nutriscore_grade: 'unknown',
      ecoscore_grade: 'Not-Applicable',
      nova_group: 5,
    });
    expect(unknown).not.toHaveProperty('nutri');
    expect(unknown).not.toHaveProperty('eco');
    expect(unknown).not.toHaveProperty('nova');
    expect(await info({ nova_group: '2' })).toMatchObject({ nova: 2 });
    expect(await info({ nova_group: 2.5 })).not.toHaveProperty('nova');
    expect(await info({ nova_group: 0 })).not.toHaveProperty('nova');
  });
});

function shownTag(tag: string): string {
  const words = tag.slice(3).replaceAll('-', ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

describe('downloadProductPhoto', () => {
  const image = (fields: Partial<FakeReply> = {}): FakeReply => ({
    text: 'jpeg-bytes',
    headers: { 'content-type': 'image/jpeg' },
    ...fields,
  });

  it('downloads an image from the Open Food Facts image host', async () => {
    const fake = fakeFetch().on(PHOTO_URL, image());

    const photo = await downloadProductPhoto(PHOTO_URL, { fetch: fake.fetch });

    expect(photo?.type).toBe('image/jpeg');
    expect(photo?.size).toBe('jpeg-bytes'.length);
  });

  it('asks nothing of any other host, of http, or of a URL that is not one', async () => {
    const fake = fakeFetch();
    const urls = [
      undefined,
      'not a url',
      'http://images.openfoodfacts.org/x.jpg',
      'https://images.openfoodfacts.org.example.test/x.jpg',
      'https://example.test/x.jpg',
    ];

    for (const url of urls) {
      expect(await downloadProductPhoto(url, { fetch: fake.fetch })).toBeUndefined();
    }
    expect(fake.requests).toHaveLength(0);
  });

  it('skips silently a non-2xx reply, a non-image, an empty body and a failed request', async () => {
    const fake = fakeFetch().on(
      PHOTO_URL,
      image({ status: 404 }),
      image({ headers: { 'content-type': 'text/html' } }),
      image({ text: '' }),
      { fail: 'network' },
    );

    for (let i = 0; i < 4; i += 1) {
      expect(await downloadProductPhoto(PHOTO_URL, { fetch: fake.fetch })).toBeUndefined();
    }
    expect(fake.pending()).toBe(0);
  });

  it('skips an image over 5 000 000 bytes, declared or not, without an error', async () => {
    const fake = fakeFetch().on(
      PHOTO_URL,
      image({ headers: { 'content-type': 'image/jpeg', 'content-length': '5000001' } }),
      image({ text: 'x'.repeat(MAX_PHOTO_BYTES + 1) }),
      image({ text: 'x'.repeat(MAX_PHOTO_BYTES) }),
    );

    expect(await downloadProductPhoto(PHOTO_URL, { fetch: fake.fetch })).toBeUndefined();
    expect(await downloadProductPhoto(PHOTO_URL, { fetch: fake.fetch })).toBeUndefined();
    expect((await downloadProductPhoto(PHOTO_URL, { fetch: fake.fetch }))?.size).toBe(
      MAX_PHOTO_BYTES,
    );
  });

  it('gives no photo after the time limit or a Cancel', async () => {
    useFakeTime(START);
    const cancel = new AbortController();
    const fake = fakeFetch().on(PHOTO_URL, image({ delayMs: 60_000 }), image({ delayMs: 5_000 }));

    const late = downloadProductPhoto(PHOTO_URL, { fetch: fake.fetch });
    await advanceAsync(OFF_TIMEOUT_MS);
    const cancelled = downloadProductPhoto(PHOTO_URL, { fetch: fake.fetch, signal: cancel.signal });
    cancel.abort();

    expect(await late).toBeUndefined();
    expect(await cancelled).toBeUndefined();
  });
});
