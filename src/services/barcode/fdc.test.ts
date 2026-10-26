import { describe, expect, it, vi } from 'vitest';
import { fakeFetch, type FakeStep } from '../../ai/testing/fakeFetch';
import { FDC_SLOT } from '../../data/repos/secretsRepo';
import { advanceAsync, useFakeTime } from '../../test/time';
import searchReply from './__fixtures__/fdc-search.json';
import {
  englishTitleCase,
  FDC_SEARCH_URL,
  FDC_TIMEOUT_MS,
  gtinSpellings,
  lookupFdc,
  sameGtin,
  type FdcDeps,
} from './fdc';
import { LABEL_EMOJI } from './product';

const START = '2026-10-26T12:00:00Z';
const CODE = '012345678905';
const KEY = 'pw-fdc-test-4821';

const unnamed = (code: string): string => `Unnamed ${code}`;

/** A secrets store holding `key` in the food-database slot. */
function secretsWith(key: string | null): FdcDeps['secrets'] {
  return { get: async (slot) => (slot === FDC_SLOT ? key : null) };
}

/** A fake with one FoodData Central route, and the deps that use it. */
function setup(
  steps: readonly FakeStep[],
  key: string | null = KEY,
): { fake: ReturnType<typeof fakeFetch>; deps: FdcDeps } {
  const fake = fakeFetch().on(FDC_SEARCH_URL, ...steps);
  return { fake, deps: { fetch: fake.fetch, secrets: secretsWith(key), unnamed } };
}

/** A search reply holding these foods. */
function foods(...list: readonly Record<string, unknown>[]): FakeStep {
  return { json: { totalHits: list.length, foods: list } };
}

/** A Branded food with the test code and these fields. */
function food(fields: Record<string, unknown>): Record<string, unknown> {
  return { dataType: 'Branded', gtinUpc: '00012345678905', description: 'Oat Bar', ...fields };
}

/** The draft of a lookup that must succeed. */
async function draftOf(step: FakeStep) {
  const { deps } = setup([step]);
  const result = await lookupFdc(CODE, deps);
  if (!result.ok) throw new Error(`lookup failed: ${result.error.kind}`);
  return result.value.draft;
}

/** The failure kind of a lookup that must fail, and how many requests it sent. */
async function failureOf(
  steps: readonly FakeStep[],
  key: string | null = KEY,
  code = CODE,
): Promise<{ kind: string; requests: number }> {
  const { fake, deps } = setup(steps, key);
  const result = await lookupFdc(code, deps);
  if (result.ok) throw new Error('lookup succeeded');
  return { kind: result.error.kind, requests: fake.requests.length };
}

const LABEL_SERVING = {
  calories: { value: 210 },
  protein: { value: 6 },
  carbohydrates: { value: 30 },
  fat: { value: 8 },
  sodium: { value: 140 },
};

const PER_100G = [
  { nutrientId: 1008, unitName: 'KCAL', value: 470 },
  { nutrientId: 1003, unitName: 'G', value: 13 },
  { nutrientId: 1005, unitName: 'G', value: 66 },
  { nutrientId: 1004, unitName: 'G', value: 18 },
  { nutrientId: 1079, unitName: 'G', value: 8 },
  { nutrientId: 1093, unitName: 'MG', value: 520 },
];

describe('lookupFdc: nothing is sent without a key and a GTIN (R02.18)', () => {
  it('sends nothing without a stored key', async () => {
    expect(await failureOf([], null)).toEqual({ kind: 'noKey', requests: 0 });
    expect(await failureOf([], ' \n')).toEqual({ kind: 'noKey', requests: 0 });

    const fake = fakeFetch();
    const broken: FdcDeps['secrets'] = { get: () => Promise.reject(new Error('closed')) };
    const result = await lookupFdc(CODE, { fetch: fake.fetch, secrets: broken, unnamed });
    expect(result).toEqual({ ok: false, error: { kind: 'noKey' } });
    expect(fake.requests).toHaveLength(0);
  });

  it('sends nothing for a code that cannot be a GTIN', async () => {
    for (const code of ['', 'ABC-123', '12 34', '0000', '123456789012345', '١٢٣٤']) {
      expect(await failureOf([], KEY, code)).toEqual({ kind: 'invalid', requests: 0 });
    }
  });

  it('refuses a key with a character a header cannot carry, without a request', async () => {
    for (const key of ['pw​fdc', 'pw\nfdc', 'pw fdc', 'clé-fdc', 'pw fdc']) {
      expect(await failureOf([], key)).toEqual({ kind: 'keyRefused', requests: 0 });
    }
  });
});

describe('lookupFdc: the request (R02.18)', () => {
  it('puts the key in the X-Api-Key header and nowhere else', async () => {
    const { fake, deps } = setup([{ json: searchReply }], `  ${KEY}\n`);

    await lookupFdc(CODE, deps);

    expect(fake.requests).toHaveLength(1);
    const [request] = fake.requests;
    expect(request?.method).toBe('POST');
    expect(request?.url).toBe(FDC_SEARCH_URL);
    expect(request?.url).not.toContain(KEY);
    expect(request?.headers['x-api-key']).toBe(KEY);
    expect(request?.headers['content-type']).toBe('application/json');
    expect(JSON.stringify(request?.body)).not.toContain(KEY);
    expect(request?.body).toEqual({
      query: '012345678905 12345678905 0012345678905 00012345678905',
      dataType: ['Branded'],
      requireAllWords: false,
      pageSize: 25,
    });
  });
});

describe('gtinSpellings and sameGtin (R02.14)', () => {
  it('spells 012345678905 as scanned, without zeros and padded to 13 and 14 digits', () => {
    expect(gtinSpellings('012345678905')).toEqual([
      '012345678905',
      '12345678905',
      '0012345678905',
      '00012345678905',
    ]);
  });

  it('pads an 8-digit code to 8, 12, 13 and 14 digits and drops spellings over 14', () => {
    expect(gtinSpellings('40123455')).toEqual([
      '40123455',
      '000040123455',
      '0000040123455',
      '00000040123455',
    ]);
    const long = gtinSpellings('0000000000000000042');
    expect(long[0]).toBe('42');
    expect(long.every((spelling) => spelling.length <= 14)).toBe(true);
  });

  it('has no spelling for letters, spaces, all zeros or more than 14 significant digits', () => {
    for (const code of ['', 'abc', '12 34', '000000', '123456789012345', '١٢٣٤']) {
      expect(gtinSpellings(code)).toEqual([]);
    }
  });

  it('matches GTINs that differ only in leading zeros', () => {
    expect(sameGtin('00012345678905', '012345678905')).toBe(true);
    expect(sameGtin('012345678905', '0012345678905')).toBe(true);
    expect(sameGtin('00012345678906', '012345678905')).toBe(false);
    expect(sameGtin('123456789050', '012345678905')).toBe(false);
    expect(sameGtin(undefined, '012345678905')).toBe(false);
    expect(sameGtin(12345678905, '012345678905')).toBe(false);
  });
});

describe('lookupFdc: the exact Branded match (R02.14, R02.16)', () => {
  it('maps our fixture: per-100 g values scaled to the 30 g serving, first entry per id', async () => {
    const { deps } = setup([{ json: searchReply }]);

    const result = await lookupFdc(` ${CODE} `, deps);

    if (!result.ok) throw new Error(result.error.kind);
    const { draft, source } = result.value;
    expect(source).toBe('barcode');
    // The first food has another GTIN and the second is not Branded: the third is used.
    expect(draft.name).toBe('Brightfield Maple Oat Rings');
    expect(draft.kcal).toBe(114);
    expect(draft.protein).toBeCloseTo(3.6, 10);
    expect(draft.carbs).toBeCloseTo(21.6, 10);
    expect(draft.fat).toBeCloseTo(1.8, 10);
    expect(draft.nutrients).toEqual({
      addedSugar: 4.5,
      fibre: 2.7,
      sugar: 6,
      transFat: 0,
      calcium: 120,
      cholesterol: 0,
      iron: 3.6,
      // 120 mg per 100 g; an older panel's 999 later in the list does not count.
      magnesium: 36,
      sodium: 150,
      // The 1177 fallback id; 1190 is absent.
      folate: 90,
      vitaminB12: 0.6,
      // Only International Units: 400 IU × 0.025 µg per 100 g, scaled to 30 g.
      vitaminD: 3,
    });
    expect(draft.extras).toEqual({});
    expect(draft.basis).toEqual({ kind: 'grams', grams: 30 });
    expect(draft.units).toEqual([{ unit: 'serving', gramsEach: 30, count: 1 }]);
    expect(draft.chosenUnit).toBe('serving');
    expect(draft.chosenCount).toBe(1);
    expect(draft.emoji).toBe(LABEL_EMOJI);
    expect(draft.product).toEqual({
      barcode: CODE,
      ingredients: 'WHOLE GRAIN OATS, MAPLE SYRUP, CORN STARCH, SALT, CALCIUM CARBONATE.',
      allergens: [],
      traces: [],
      labels: [],
      categories: ['Cereal'],
      source: 'fdc',
    });
  });

  it('ignores a fuzzy hit with another GTIN', async () => {
    const [fuzzy] = searchReply.foods;

    expect(await failureOf([foods(fuzzy ?? {})])).toEqual({ kind: 'notFound', requests: 1 });
    expect(await failureOf([foods()])).toEqual({ kind: 'notFound', requests: 1 });
  });

  it('skips a matching food without nutrition and takes the next one; an untyped food counts', async () => {
    const draft = await draftOf(
      foods(
        food({
          description: 'First',
          foodNutrients: [{ nutrientId: 1079, unitName: 'G', value: 3 }],
        }),
        food({ description: 'Survey', dataType: 'Survey (FNDDS)', labelNutrients: LABEL_SERVING }),
        food({ description: 'Second', dataType: undefined, labelNutrients: LABEL_SERVING }),
      ),
    );

    expect(draft.name).toBe('Second');
  });
});

describe('lookupFdc: serving weight and the two value sets (R02.16)', () => {
  it('lets label values win and reads the weight from the household text', async () => {
    const draft = await draftOf(
      foods(
        food({
          servingSize: 1,
          servingSizeUnit: 'PIECE',
          householdServingFullText: '1 bar (45 g)',
          labelNutrients: {
            calories: { value: 200 },
            protein: { value: 5 },
            fat: { value: 8 },
            sodium: { value: 110 },
          },
          foodNutrients: PER_100G,
        }),
      ),
    );

    expect(draft.basis).toEqual({ kind: 'grams', grams: 45 });
    expect([draft.kcal, draft.protein, draft.fat]).toEqual([200, 5, 8]);
    expect(draft.nutrients.sodium).toBe(110);
    // No label value for carbs or fibre: per 100 g, scaled to 45 g.
    expect(draft.carbs).toBeCloseTo(29.7, 10);
    expect(draft.nutrients.fibre).toBe(3.6);
  });

  it('keeps a serving under 1 g as given', async () => {
    const draft = await draftOf(
      foods(
        food({
          servingSize: 0.4,
          servingSizeUnit: 'g',
          labelNutrients: { calories: { value: 1 } },
          foodNutrients: [{ nutrientId: 1005, unitName: 'G', value: 100 }],
        }),
      ),
    );

    expect(draft.basis).toEqual({ kind: 'grams', grams: 0.4 });
    expect(draft.units).toEqual([{ unit: 'serving', gramsEach: 0.4, count: 1 }]);
    expect(draft.kcal).toBe(1);
    expect(draft.carbs).toBeCloseTo(0.4, 10);
  });

  it('keeps label values without a serving weight as one serving of unknown weight', async () => {
    const draft = await draftOf(
      foods(food({ labelNutrients: LABEL_SERVING, foodNutrients: PER_100G })),
    );

    expect(draft.basis).toEqual({ kind: 'servings', count: 1 });
    expect(draft.units).toEqual([]);
    expect(draft.chosenUnit).toBeUndefined();
    expect([draft.kcal, draft.protein, draft.carbs, draft.fat]).toEqual([210, 6, 30, 8]);
    // Fibre is given only per 100 g, which cannot be turned into this serving.
    expect(draft.nutrients).toEqual({ sodium: 140 });
  });

  it('uses exactly 100 g of the per-100 g values when they cover more than the label', async () => {
    const draft = await draftOf(
      foods(
        food({
          labelNutrients: { calories: { value: 210 }, sodium: { value: 140 } },
          foodNutrients: PER_100G,
        }),
      ),
    );

    expect(draft.basis).toEqual({ kind: 'grams', grams: 100 });
    expect(draft.units).toEqual([]);
    expect(draft.chosenUnit).toBeUndefined();
    expect([draft.kcal, draft.protein, draft.carbs, draft.fat]).toEqual([470, 13, 66, 18]);
    expect(draft.nutrients).toEqual({ fibre: 8, sodium: 520 });
  });

  it('reads the serving unit codes in any case', async () => {
    const cases: [string, number][] = [
      ['g', 2],
      ['GRM', 2],
      ['MLT', 2],
      ['kg', 2000],
      ['LTR', 2000],
      ['mg', 0.002],
      ['ONZ', 56.699],
      ['fl oz', 59.147],
      ['FOZ', 59.147],
    ];
    for (const [unit, grams] of cases) {
      const draft = await draftOf(
        foods(food({ servingSize: 2, servingSizeUnit: unit, foodNutrients: PER_100G })),
      );
      expect(draft.basis.kind === 'grams' ? draft.basis.grams : NaN).toBeCloseTo(grams, 6);
    }
  });

  it('turns kJ into kcal only without a kcal entry, and ignores negative values', async () => {
    const draft = await draftOf(
      foods(
        food({
          servingSize: 100,
          servingSizeUnit: 'g',
          foodNutrients: [
            { nutrientId: 1062, unitName: 'kJ', value: 1046 },
            { nutrientId: 1003, unitName: 'G', value: -2 },
            { nutrientId: 1003, unitName: 'G', value: 4 },
          ],
        }),
      ),
    );

    expect(draft.kcal).toBe(250);
    expect(draft.protein).toBe(4);
  });
});

describe('lookupFdc: failures', () => {
  it('maps 401 and 403 to keyRefused', async () => {
    const body = { error: { code: 'API_KEY_INVALID' } };

    expect(await failureOf([{ status: 401, json: body }])).toEqual({
      kind: 'keyRefused',
      requests: 1,
    });
    expect(await failureOf([{ status: 403, json: body }])).toEqual({
      kind: 'keyRefused',
      requests: 1,
    });
  });

  it('maps a rate limit, a server error and an unreadable reply to unavailable', async () => {
    const replies: FakeStep[] = [
      { status: 429, json: { error: { code: 'OVER_RATE_LIMIT' } } },
      { status: 503, text: 'unavailable' },
      { status: 302, text: '' },
      { text: 'not json' },
      { json: { totalHits: 0 } },
      { json: { foods: 'none' } },
    ];
    for (const reply of replies) {
      expect((await failureOf([reply])).kind).toBe('unavailable');
    }
  });

  it('maps a failed request to unavailable, offline or not', async () => {
    expect((await failureOf([{ fail: 'network' }])).kind).toBe('unavailable');
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    expect((await failureOf([{ fail: 'network' }])).kind).toBe('unavailable');
  });

  it('stops at its 15 s limit with unavailable', async () => {
    useFakeTime(START);
    const { deps } = setup([{ json: searchReply, delayMs: 20_000 }]);
    let settled = false;
    const result = lookupFdc(CODE, deps).finally(() => (settled = true));

    await advanceAsync(FDC_TIMEOUT_MS - 1);
    expect(settled).toBe(false);
    await advanceAsync(1);

    expect(await result).toEqual({ ok: false, error: { kind: 'unavailable' } });
  });

  it("stops at the person's Cancel with cancelled", async () => {
    useFakeTime(START);
    const cancel = new AbortController();
    const { deps } = setup([{ json: searchReply, delayMs: 5_000 }]);
    const result = lookupFdc(CODE, { ...deps, signal: cancel.signal });

    await advanceAsync(1_000);
    cancel.abort();

    expect(await result).toEqual({ ok: false, error: { kind: 'cancelled' } });
  });
});

describe('englishTitleCase (R02.18)', () => {
  /** Makes the default locale Turkish for `toLocale…Case()` calls that name no locale. */
  function turkishDefault(): void {
    vi.spyOn(navigator, 'language', 'get').mockReturnValue('tr-TR');
    const lower = String.prototype.toLocaleLowerCase;
    const upper = String.prototype.toLocaleUpperCase;
    vi.spyOn(String.prototype, 'toLocaleLowerCase').mockImplementation(function (
      this: string,
      locales?: Intl.LocalesArgument,
    ) {
      return lower.call(this, locales ?? 'tr');
    });
    vi.spyOn(String.prototype, 'toLocaleUpperCase').mockImplementation(function (
      this: string,
      locales?: Intl.LocalesArgument,
    ) {
      return upper.call(this, locales ?? 'tr');
    });
  }

  it('gives "GREEK YOGURT" as "Greek Yogurt" and keeps the dotted i under a Turkish locale', async () => {
    turkishDefault();
    // The trap is live: casing without a locale now follows Turkish rules.
    expect('MINI'.toLocaleLowerCase()).toBe('mını');

    expect(englishTitleCase('GREEK YOGURT')).toBe('Greek Yogurt');
    expect(englishTitleCase('MINI RICE CAKES')).toBe('Mini Rice Cakes');
    expect(englishTitleCase("O'NEIL'S CHEESE-AND-ONION")).toBe("O'neil's Cheese-And-Onion");

    const draft = await draftOf(
      foods(
        food({
          description: 'MINI RICE CAKES',
          brandOwner: 'HILLTOP PANTRY INC',
          labelNutrients: LABEL_SERVING,
        }),
      ),
    );
    expect(draft.name).toBe('Hilltop Pantry Inc Mini Rice Cakes');
  });

  it('keeps a name with any lower-case letter, and does not repeat a brand the name holds', async () => {
    expect(englishTitleCase('Greek YOGURT')).toBe('Greek YOGURT');

    const draft = await draftOf(
      foods(
        food({
          description: 'Hilltop GREEK Yogurt',
          brandName: 'HILLTOP',
          brandOwner: 'OTHER OWNER',
          labelNutrients: LABEL_SERVING,
        }),
      ),
    );
    expect(draft.name).toBe('Hilltop GREEK Yogurt');
  });

  it('names a food with no description or brand with the caller’s word', async () => {
    const draft = await draftOf(foods(food({ description: ' ', labelNutrients: LABEL_SERVING })));

    expect(draft.name).toBe(`Unnamed ${CODE}`);
  });
});
