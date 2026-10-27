import { useSettings } from '../../../data/hooks';
import { PRODUCT_FIELDS, type ProductField, type Settings } from '../../../data/settingsSchema';
import { t } from '../../../i18n/t';
import { Card } from '../../../ui/Card';
import { Switch } from '../../../ui/Switch';
import styles from './appSettings.module.css';
import { useAppSettingsService, usePendingWrites, useSaveFailed } from './writes';

const SETTINGS = ['product.show', 'product.hiddenFields'] as const;

/**
 * Settings › Product details (06 §3.8): what the product block at the end of a scanned product's
 * review shows. "Show product details" (on by default) turns the whole block on or off; while it
 * is on, one switch per detail in the block's own order, on while the detail is shown. A hidden
 * detail is stored by its key, one detail per write; keys this build does not know are dropped
 * when the list is read. Allergen warnings are not here: they follow the allergens in Personal
 * info, as the note says. Nothing is drawn until the settings are read (R06.22).
 */
export function ProductFieldsPage() {
  const settings = useSettings(SETTINGS);
  if (settings.status === 'loading') return null;
  if (settings.status === 'error') {
    return (
      <p className={styles.note} data-ui="productFields.unavailable">
        {t('appSettings.unavailable')}
      </p>
    );
  }
  return <ProductSwitches stored={settings.value} />;
}

type Shown = { readonly show: boolean } & { readonly [F in ProductField]: boolean };

function ProductSwitches({
  stored,
}: {
  readonly stored: Pick<Settings, (typeof SETTINGS)[number]>;
}) {
  const service = useAppSettingsService();
  const failed = useSaveFailed();
  const hidden = stored['product.hiddenFields'];
  // One plain value per switch, so a change to one detail never holds back another.
  const shown = {
    show: stored['product.show'],
    ...Object.fromEntries(PRODUCT_FIELDS.map((field) => [field, !hidden.includes(field)])),
  } as Shown;
  const pending = usePendingWrites(shown);
  const blockOn = pending.shown('show');

  const showBlock = (on: boolean): void => {
    pending.write('show', on, () => service.set('product.show', on)).catch(failed);
  };
  const showField = (field: ProductField, on: boolean): void => {
    pending.write(field, on, () => service.setProductFieldHidden(field, !on)).catch(failed);
  };

  return (
    <div className={styles.page} data-ui="productFields">
      <Card>
        <Switch
          label={t('appSettings.product.show')}
          description={t('appSettings.product.showHint')}
          checked={blockOn}
          onChange={showBlock}
          data-ui="productFields.show"
        />
      </Card>
      {blockOn ? (
        <Card
          heading={t('appSettings.product.fields')}
          className={styles.card}
          data-ui="productFields.fields"
        >
          <ul className={styles.rows}>
            {PRODUCT_FIELDS.map((field) => (
              <li key={field} className={`${styles.rowItem} ${styles.switchItem}`}>
                <Switch
                  label={t(`review.product.field.${field}`)}
                  checked={pending.shown(field)}
                  onChange={(on) => showField(field, on)}
                  data-ui={`productFields.field.${field}`}
                />
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
      <p className={styles.note} data-ui="productFields.allergenNote">
        {t('appSettings.product.allergenNote')}
      </p>
    </div>
  );
}
