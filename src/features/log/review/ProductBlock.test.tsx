import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PRODUCT_FIELDS } from '../../../data/settingsSchema';
import { markAllergens } from '../../../domain/food/labelText';
import type { ProductInfo } from '../../../domain/model';
import { review } from '../../../i18n/en/review';
import { scan } from '../../../i18n/en/scan';
import type { AnalysisService, AnalysisState } from '../../../services/analysis';
import { ServicesProvider } from '../../../services/context';
import { makeAnalysisDraft, makeDraft, makeProfile } from '../../../test/factories';
import { closeHarnesses, openHarness, untilGone, untilShown } from '../../../test/screenHarness';
import { LabelText } from './LabelText';
import { ProductBlock, shownFields } from './ProductBlock';
import { AnalysisReview } from './ReviewSheet';

afterEach(async () => {
  cleanup();
  await closeHarnesses();
});

const words = review.review.product;
const BLOCK = '[data-ui="review.product"]';
const LABEL = '[data-ui="review.product.label"]';

/** A product with nothing on it but what `fields` gives. */
function product(fields: Partial<ProductInfo> = {}): ProductInfo {
  return {
    barcode: '4012345000017',
    allergens: [],
    traces: [],
    labels: [],
    categories: [],
    ...fields,
  };
}

/** A FoodData Central product with every field filled in. */
const FULL = product({
  source: 'fdc',
  package: '400 g',
  nutri: 'C',
  nova: 3,
  eco: 'B',
  allergens: ['Milk', 'Soybeans'],
  traces: ['Hazelnuts'],
  labels: ['Organic', 'Fair trade'],
  categories: ['Snacks', 'Biscuits'],
  ingredients: 'Wheat flour, sugar, milk powder, soy lecithin',
});

const hooked = (hook: string) => document.querySelector<HTMLElement>(`[data-ui="${hook}"]`);

/** The hooks of the block's rows, in page order. */
const rowsShown = () =>
  [...document.querySelectorAll(`${BLOCK} [data-ui^="review.product."]`)]
    .map((row) => row.getAttribute('data-ui'))
    .filter((hook) => hook !== 'review.product.label');

/** The block for `shown` over a test database, after `prepare` set the stored rows up. */
async function openBlock(
  shown: ProductInfo,
  prepare: (h: Awaited<ReturnType<typeof openHarness>>) => Promise<unknown> = async () => undefined,
) {
  const h = await openHarness();
  await prepare(h);
  h.mount(<ProductBlock product={shown} />);
  await untilShown(BLOCK);
  return h;
}

describe('shownFields (D22)', () => {
  it('lists every field with data in the fixed order', () => {
    expect(shownFields(FULL, true, [])).toEqual([...PRODUCT_FIELDS]);
  });

  it('leaves out the fields without data', () => {
    expect(shownFields(product({ package: '330 ml', nutri: ' ' }), true, [])).toEqual([
      'barcode',
      'package',
    ]);
  });

  it('drops hidden fields and keeps the order of the rest', () => {
    expect(shownFields(FULL, true, ['barcode', 'categories', 'eco'])).toEqual([
      'source',
      'package',
      'nutri',
      'nova',
      'allergens',
      'traces',
      'labels',
      'ingredients',
    ]);
  });

  it('draws nothing when switched off, or when the only fields with values are switched off', () => {
    expect(shownFields(FULL, false, [])).toEqual([]);
    expect(shownFields(product(), true, ['barcode'])).toEqual([]);
  });

  it('shows the source only for a FoodData Central product', () => {
    const { source: _source, ...openFoodFacts } = FULL;
    expect(shownFields(openFoodFacts, true, [])).not.toContain('source');
    expect(shownFields(FULL, true, ['source'])).not.toContain('source');
  });

  it('counts a marked ingredient list without plain text, and not a blank one', () => {
    expect(shownFields(product({ markedIngredients: '_Soy_ sauce' }), true, [])).toContain(
      'ingredients',
    );
    expect(shownFields(product({ ingredients: '  ' }), true, [])).not.toContain('ingredients');
  });
});

describe('ProductBlock', () => {
  it('shows every field with data in order, lists stacked under their name', async () => {
    await openBlock(FULL);
    expect(screen.getByRole('heading', { name: words.heading })).toBeInTheDocument();
    expect(rowsShown()).toEqual(PRODUCT_FIELDS.map((field) => `review.product.${field}`));
    expect(hooked('review.product.barcode')).toHaveTextContent(
      `${words.field.barcode}4012345000017`,
    );
    expect(hooked('review.product.source')).toHaveTextContent(words.fdc);
    expect(hooked('review.product.nova')).toHaveTextContent(`${words.field.nova}3`);
    expect(hooked('review.product.allergens')).toHaveTextContent(
      `${words.field.allergens}Milk, Soybeans`,
    );
    expect(hooked('review.product.ingredients')).toHaveTextContent(
      'Wheat flour, sugar, milk powder, soy lecithin',
    );
  });

  it('shows only the fields with data that are not hidden: a hidden NOVA group stays out (ACC-D22-1)', async () => {
    const shown = product({ package: '500 g', nova: 4, labels: ['Vegan'] });
    await openBlock(shown, (h) => h.repos.settingsRepo.set('product.hiddenFields', ['nova']));
    expect(rowsShown()).toEqual([
      'review.product.barcode',
      'review.product.package',
      'review.product.labels',
    ]);
    expect(hooked('review.product.nova')).toBeNull();
    expect(screen.queryByText(words.field.nova)).toBeNull();
  });

  it('hides everything, heading included, when the block is switched off', async () => {
    const h = await openBlock(FULL);
    await act(() => h.repos.settingsRepo.set('product.show', false));
    await untilGone(BLOCK);
    expect(screen.queryByRole('heading', { name: words.heading })).toBeNull();
  });

  it("shows Open Food Facts' marked allergens in bold in the label (ACC-D23-1)", async () => {
    const plain = 'Cocoa, sugar & milk powder, emulsifier (soy lecithin)';
    const markup =
      'Cocoa, sugar &amp; <span class="allergen">milk</span> powder, emulsifier ' +
      '(<span class="allergen">soy</span> lecithin)';
    const marked = product({ ingredients: plain, markedIngredients: markAllergens(plain, markup) });
    await openBlock(marked);
    const label = hooked('review.product.label') as HTMLElement;
    expect([...label.querySelectorAll('strong')].map((bold) => bold.textContent)).toEqual([
      'milk',
      'soy',
    ]);
    expect(label).toHaveTextContent(`${words.flagged} ${plain}`);
  });

  it("warns on a label that names one of the profile's sensitivities", async () => {
    await openBlock(product({ ingredients: 'Rolled oats, water, salt' }), (h) =>
      h.repos.profileRepo.save(makeProfile({ allergens: ['gluten'] })),
    );
    await untilShown(`${LABEL} [data-icon="warning"]`);
    expect(hooked('review.product.label')).toHaveTextContent(
      `${words.flagged} Rolled oats, water, salt`,
    );
  });
});

describe('LabelText (D23)', () => {
  it('is one plain paragraph without a warning when nothing is flagged', () => {
    render(<LabelText text="Rolled oats, water, salt" sensitivities={['milk']} />);
    const label = document.querySelector(LABEL) as HTMLElement;
    expect(label.tagName).toBe('P');
    expect(label.textContent).toBe('Rolled oats, water, salt');
    expect(label.querySelector('svg')).toBeNull();
  });

  it('bolds the marked allergens and tells screen readers, with no warning when no sensitivity is named', () => {
    render(<LabelText text="_Barley_ malt, water" sensitivities={['milk']} />);
    const label = document.querySelector(LABEL) as HTMLElement;
    expect(label.querySelector('strong')).toHaveTextContent('Barley');
    expect(label.textContent).toBe(`${words.flagged} Barley malt, water`);
    expect(label.querySelector('[data-icon="warning"]')).toBeNull();
  });

  it('warns when the paragraph names a sensitivity, through its aliases too', () => {
    render(<LabelText text="Water, whey powder" sensitivities={['dairy']} />);
    const label = document.querySelector(LABEL) as HTMLElement;
    expect(label.querySelector('[data-icon="warning"]')).not.toBeNull();
    expect(label.textContent).toBe(`${words.flagged} Water, whey powder`);
  });
});

// ---- In the review --------------------------------------------------------------------------

/** An analysis that only holds a state. */
function standInAnalysis(state: AnalysisState): AnalysisService {
  return {
    getSnapshot: () => state,
    subscribe: () => () => undefined,
    start: vi.fn(),
    cancel: vi.fn(),
    retry: vi.fn(),
    closeReview: vi.fn(),
    restore: vi.fn(),
  };
}

/** The analysis review over a test database, showing `draft`, for a profile with `allergens`. */
async function openAnalysisReview(
  draft: ReturnType<typeof makeAnalysisDraft>,
  allergens: readonly string[],
) {
  const h = await openHarness();
  await h.repos.profileRepo.save(makeProfile({ allergens }));
  const analysis = standInAnalysis({ phase: 'reviewReady', draft, generation: 1 });
  h.mount(
    <ServicesProvider services={{ ...h.services, analysis }}>
      <AnalysisReview />
    </ServicesProvider>,
  );
  await untilShown('[data-ui="review.amount"]');
  return h;
}

/** True when `first` comes before `second` on the page. */
function before(first: string, second: string): boolean {
  const a = hooked(first);
  const b = hooked(second);
  if (!a || !b) throw new Error(`${first} or ${second} is not on the page`);
  return (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
}

describe('AnalysisReview: the slots of P06-18', () => {
  it('shows the allergen line under the name and the product block at the end', async () => {
    const draft = makeAnalysisDraft({
      draft: makeDraft({
        name: 'Greek yoghurt',
        lines: [],
        product: product({ package: '500 g', allergens: ['Milk'] }),
      }),
      source: 'barcode',
    });
    await openAnalysisReview(draft, ['dairy']);
    await untilShown(BLOCK);
    await untilShown('[data-ui="review.allergens"]');
    expect(hooked('review.allergens')).toHaveTextContent(
      `${review.review.allergens.verdict.declared}: dairy`,
    );
    expect(before('review.name', 'review.allergens')).toBe(true);
    expect(before('review.allergens', 'review.serving')).toBe(true);
    expect(before('review.when', 'review.product')).toBe(true);
    expect(hooked('review.savedLabel')).toBeNull();
  });

  it('shows the saved-label notice over a draft from a saved label', async () => {
    const draft = makeAnalysisDraft({
      draft: makeDraft({ product: product() }),
      source: 'label',
      fromSavedLabel: true,
    });
    await openAnalysisReview(draft, []);
    expect(hooked('review.savedLabel')).toHaveTextContent(scan.scan.savedLabel);
    expect(before('review.savedLabel', 'review.name')).toBe(true);
  });

  it('leaves the product block out for a food without product details', async () => {
    await openAnalysisReview(makeAnalysisDraft(), ['dairy']);
    await untilShown('[data-ui="review.allergens"]');
    expect(hooked('review.product')).toBeNull();
  });
});
