import { act, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { PRODUCT_FIELDS } from '../../../data/settingsSchema';
import { appSettings } from '../../../i18n/en/appSettings';
import { review } from '../../../i18n/en/review';
import { makeProduct } from '../../../test/factories';
import { untilLoaded } from '../../../test/lazy';
import { closeHarnesses, untilGone, untilShown } from '../../../test/screenHarness';
import { ProductBlock } from '../../log/review/ProductBlock';
import { settle } from '../../water/testing/openWater';
import { categoryFor } from '../registry';
import { SettingsScreen } from '../SettingsScreen';
import { ProductFieldsPage } from './ProductFieldsPage';
import { deferred, openAppSettings } from './testing/openAppSettings';

afterEach(closeHarnesses);

beforeAll(async () => {
  // Fetched on first open in the app; loaded here first so no wait includes its transform.
  await import('./ProductFieldsPage');
});

const words = appSettings.appSettings;
const fields = review.review.product.field;
const PAGE = '[data-ui="productFields"]';
const FIELDS = '[data-ui="productFields.fields"]';
const BLOCK = '[data-ui="review.product"]';
const HASH = '#/settings/product-fields';

/** A FoodData Central product with every detail filled in. */
const FULL = makeProduct({
  barcode: '4012345000017',
  source: 'fdc',
  package: '250 g',
  nutri: 'B',
  nova: 2,
  eco: 'A',
  allergens: ['Oats'],
  traces: ['Sesame'],
  labels: ['Organic'],
  categories: ['Breakfast cereals'],
  ingredients: 'Rolled oats, honey, sunflower seeds',
});

const blockSwitch = () => screen.getByRole('switch', { name: words.product.show });
const fieldSwitch = (name: string) => screen.getByRole('switch', { name });
const fieldSwitches = () =>
  [...document.querySelectorAll<HTMLElement>(`${FIELDS} [role="switch"]`)].map((each) => ({
    name: each.textContent,
    on: each.getAttribute('aria-checked') === 'true',
  }));
/** The details the review's product block shows, by hook, in order. */
const blockRows = () =>
  [...document.querySelectorAll(`${BLOCK} [data-ui^="review.product."]`)]
    .map((row) => row.getAttribute('data-ui'))
    .filter((hook) => hook !== 'review.product.label');

describe('ProductFieldsPage', () => {
  it('opens at #/settings/product-fields under its title', async () => {
    expect(categoryFor(['product-fields'])).toMatchObject({
      id: 'product-fields',
      titleKey: 'appSettings.product.title',
    });
    const h = await openAppSettings({ hash: HASH });
    h.mount(<SettingsScreen nested={['product-fields']} />);

    expect(screen.getByRole('heading', { level: 1, name: words.product.title })).toBeVisible();
    await untilLoaded();
    await untilShown(PAGE);
  });

  it('shows the block switched on and the 11 details in the block order, each on, with the allergen note', async () => {
    const h = await openAppSettings({ hash: HASH });
    h.mount(<ProductFieldsPage />);
    await untilShown(PAGE);

    expect(blockSwitch()).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('heading', { level: 2, name: words.product.fields })).toBeVisible();
    expect(fieldSwitches()).toEqual(
      PRODUCT_FIELDS.map((field) => ({ name: fields[field], on: true })),
    );
    expect(fieldSwitches().map(({ name }) => name)).toEqual([
      fields.barcode,
      fields.source,
      fields.package,
      fields.nutri,
      fields.nova,
      fields.eco,
      fields.allergens,
      fields.traces,
      fields.labels,
      fields.categories,
      fields.ingredients,
    ]);
    expect(screen.getByText(words.product.allergenNote)).toBeVisible();
  });

  it("takes NOVA out of the review's product block and keeps the rest (ACC-J6-1)", async () => {
    const h = await openAppSettings({ hash: HASH });
    h.mount(
      <>
        <ProductFieldsPage />
        <ProductBlock product={FULL} />
      </>,
    );
    await untilShown(PAGE);
    await untilShown('[data-ui="review.product.nova"]');

    fireEvent.click(fieldSwitch(fields.nova));

    expect(fieldSwitch(fields.nova)).toHaveAttribute('aria-checked', 'false');
    await untilGone('[data-ui="review.product.nova"]');
    expect(blockRows()).toEqual(
      PRODUCT_FIELDS.filter((field) => field !== 'nova').map((field) => `review.product.${field}`),
    );
    expect(await h.repos.settingsRepo.get('product.hiddenFields')).toEqual(['nova']);
  });

  it('hides the whole block and the detail list when switched off, and keeps the hidden details', async () => {
    const h = await openAppSettings({ hash: HASH });
    await h.repos.settingsRepo.set('product.hiddenFields', ['labels']);
    h.mount(
      <>
        <ProductFieldsPage />
        <ProductBlock product={FULL} />
      </>,
    );
    await untilShown(PAGE);
    await untilShown(BLOCK);
    expect(blockRows()).not.toContain('review.product.labels');

    fireEvent.click(blockSwitch());

    expect(blockSwitch()).toHaveAttribute('aria-checked', 'false');
    expect(document.querySelector(FIELDS)).toBeNull();
    await untilGone(BLOCK);
    expect(await h.repos.settingsRepo.get('product.show')).toBe(false);
    expect(await h.repos.settingsRepo.get('product.hiddenFields')).toEqual(['labels']);

    fireEvent.click(blockSwitch());
    await untilShown(BLOCK);
    expect(blockRows()).toContain('review.product.nova');
    expect(blockRows()).not.toContain('review.product.labels');
    expect(fieldSwitch(fields.labels)).toHaveAttribute('aria-checked', 'false');
  });

  it('ignores a stored detail this build does not know, and drops it with the next change', async () => {
    const h = await openAppSettings({ hash: HASH });
    await h.db.settings.put({ key: 'product.hiddenFields', value: ['nova', 'shelfLife'] });
    h.mount(
      <>
        <ProductFieldsPage />
        <ProductBlock product={FULL} />
      </>,
    );
    await untilShown(PAGE);
    await untilShown(BLOCK);

    expect(fieldSwitches()).toHaveLength(11);
    expect(fieldSwitches().filter(({ on }) => !on)).toEqual([{ name: fields.nova, on: false }]);
    expect(blockRows()).not.toContain('review.product.nova');

    fireEvent.click(fieldSwitch(fields.eco));
    await untilGone('[data-ui="review.product.eco"]');
    expect(await h.db.settings.get('product.hiddenFields')).toEqual({
      key: 'product.hiddenFields',
      value: ['nova', 'eco'],
    });
  });

  it('flips a switch at once and goes back with a message when the change fails', async () => {
    const save = deferred<never>();
    const h = await openAppSettings({
      hash: HASH,
      wrap: (real) => ({ ...real, setProductFieldHidden: () => save.promise }),
    });
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    h.mount(<ProductFieldsPage />);
    await untilShown(PAGE);

    fireEvent.click(fieldSwitch(fields.barcode));
    expect(fieldSwitch(fields.barcode)).toHaveAttribute('aria-checked', 'false');

    save.reject(new Error('disk full'));
    await settle(() => document.querySelector('[data-ui="toast.message"]') !== null);
    expect(screen.getByText(words.saveFailed)).toBeVisible();
    expect(logged).toHaveBeenCalledOnce();
    expect(fieldSwitch(fields.barcode)).toHaveAttribute('aria-checked', 'true');
    expect(await h.repos.settingsRepo.get('product.hiddenFields')).toEqual([]);
  });

  it('draws nothing until the settings are read (R06.22)', async () => {
    const read = deferred<void>();
    const h = await openAppSettings({
      hash: HASH,
      sources: (real) => ({
        ...real,
        settingsRepo: {
          loaded: read.promise.then(() => real.settingsRepo.loaded),
          snapshot: () => real.settingsRepo.snapshot(),
        },
      }),
    });
    await h.repos.settingsRepo.set('product.show', false);
    h.mount(<ProductFieldsPage />);

    await act(async () => undefined);
    expect(screen.queryByRole('switch')).toBeNull();

    read.resolve();
    await untilShown(PAGE);
    expect(blockSwitch()).toHaveAttribute('aria-checked', 'false');
    expect(document.querySelector(FIELDS)).toBeNull();
  });
});
