import { useSettings } from '../../../data/hooks';
import { PRODUCT_FIELDS, type ProductField } from '../../../data/settingsSchema';
import { productLabel } from '../../../domain/food/labelText';
import type { ProductInfo } from '../../../domain/model';
import { formatInt } from '../../../i18n/format';
import { t } from '../../../i18n/t';
import { Card } from '../../../ui/Card';
import { useSensitivities } from './AllergenLine';
import { LabelText } from './LabelText';
import styles from './product.module.css';

const SETTINGS = ['product.show', 'product.hiddenFields'] as const;

/** Fields shown as a list under their name rather than beside it. */
const LIST_FIELDS: ReadonlySet<ProductField> = new Set([
  'allergens',
  'traces',
  'labels',
  'categories',
]);

function filled(text: string | undefined): boolean {
  return text !== undefined && text.trim() !== '';
}

/** Whether the product has something to show for `field`. */
function hasData(product: ProductInfo, field: ProductField): boolean {
  switch (field) {
    case 'barcode':
      return filled(product.barcode);
    case 'source':
      return product.source === 'fdc';
    case 'package':
      return filled(product.package);
    case 'nutri':
      return filled(product.nutri);
    case 'nova':
      return product.nova !== undefined;
    case 'eco':
      return filled(product.eco);
    case 'allergens':
    case 'traces':
    case 'labels':
    case 'categories':
      return product[field].length > 0;
    case 'ingredients':
      return productLabel(product) !== undefined;
  }
}

/**
 * The fields the block shows, in its fixed order (`PRODUCT_FIELDS`): those with data and not
 * hidden; none when the block is switched off (02 §3.13, D22).
 */
export function shownFields(
  product: ProductInfo,
  show: boolean,
  hidden: readonly ProductField[],
): ProductField[] {
  if (!show) return [];
  return PRODUCT_FIELDS.filter((field) => !hidden.includes(field) && hasData(product, field));
}

/** The text of a field that sits beside its name. */
function valueOf(product: ProductInfo, field: ProductField): string {
  switch (field) {
    case 'source':
      return t('review.product.fdc');
    case 'nova':
      return product.nova === undefined ? '' : formatInt(product.nova);
    case 'allergens':
    case 'traces':
    case 'labels':
    case 'categories':
      return product[field].join(', ');
    case 'barcode':
    case 'package':
    case 'nutri':
    case 'eco':
    case 'ingredients':
      return product[field] ?? '';
  }
}

/**
 * The product block at the end of the review (02 §3.13, D22): a packaged product's details in a
 * fixed order (barcode, the source for a FoodData Central product, package, the three scores,
 * allergens, may contain, labels, categories, the ingredient list), only the ones with data that
 * the person has not hidden, and nothing when the block is switched off. Lists stack under their
 * name; the ingredient list comes last as a paragraph with its allergens bold (`LabelText`).
 */
export function ProductBlock({ product }: { readonly product: ProductInfo }) {
  const settings = useSettings(SETTINGS);
  const sensitivities = useSensitivities();
  if (settings.status !== 'ready') return null;
  const fields = shownFields(
    product,
    settings.value['product.show'],
    settings.value['product.hiddenFields'],
  );
  if (fields.length === 0) return null;
  const rows = fields.filter((field) => field !== 'ingredients');
  const label = fields.includes('ingredients') ? productLabel(product) : undefined;

  return (
    <Card heading={t('review.product.heading')} data-ui="review.product">
      {rows.length > 0 ? (
        <dl className={styles.fields}>
          {rows.map((field) => (
            <div
              key={field}
              className={LIST_FIELDS.has(field) ? styles.listField : styles.field}
              data-ui={`review.product.${field}`}
            >
              <dt className={styles.fieldName}>{t(`review.product.field.${field}`)}</dt>
              <dd className={styles.fieldValue}>{valueOf(product, field)}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      {label === undefined ? null : (
        <div className={styles.labelSection} data-ui="review.product.ingredients">
          <h3 className={styles.fieldName}>{t('review.product.field.ingredients')}</h3>
          <LabelText text={label} sensitivities={sensitivities} />
        </div>
      )}
    </Card>
  );
}
