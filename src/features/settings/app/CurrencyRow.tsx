import { useSheet } from '../../../app/useRoute';
import { currentLocale } from '../../../i18n/locale';
import { t } from '../../../i18n/t';
import { Icon } from '../../../ui/icons';
import { ListPicker } from '../../../ui/ListPicker';
import styles from './appSettings.module.css';

/** The currency picker's place on the sheet stack. */
export const CURRENCY_SHEET = 'currency';

/** The currencies offered, by code: the most used ones; the stored one is always added. */
export const OFFERED_CURRENCIES = [
  'AED',
  'AUD',
  'BDT',
  'BRL',
  'CAD',
  'CHF',
  'CNY',
  'DKK',
  'EGP',
  'EUR',
  'GBP',
  'HKD',
  'IDR',
  'INR',
  'JPY',
  'KES',
  'KRW',
  'LKR',
  'MXN',
  'MYR',
  'NGN',
  'NOK',
  'NPR',
  'NZD',
  'PHP',
  'PKR',
  'PLN',
  'SAR',
  'SEK',
  'SGD',
  'THB',
  'TRY',
  'USD',
  'VND',
  'ZAR',
] as const;

/** The browser's name for a currency ("Indian Rupee"), or none when it has no name for it. */
function currencyName(code: string): string | undefined {
  try {
    const name = new Intl.DisplayNames(currentLocale(), { type: 'currency' }).of(code);
    return name === code ? undefined : name;
  } catch {
    return undefined;
  }
}

/** "INR · Indian Rupee", or the code alone. */
function currencyLabel(code: string): string {
  const name = currencyName(code);
  return name === undefined ? code : `${code} · ${name}`;
}

export interface CurrencyRowProps {
  /** The stored currency code (setting `money.currency`). */
  readonly value: string;
  readonly onChange: (code: string) => void;
}

/**
 * The Currency row of Settings › App settings › Units (D-16.107): the currency a price is typed
 * in, shown by its code and name, picked from a list of common currencies (the stored one always
 * among them). Prices already logged keep their own currency.
 */
export function CurrencyRow({ value, onChange }: CurrencyRowProps) {
  const picker = useSheet(CURRENCY_SHEET);
  const codes = OFFERED_CURRENCIES.includes(value as (typeof OFFERED_CURRENCIES)[number])
    ? OFFERED_CURRENCIES
    : [...OFFERED_CURRENCIES, value].sort();
  return (
    <li className={styles.rowItem}>
      <button
        type="button"
        className={styles.pickRow}
        aria-haspopup="dialog"
        onClick={picker.show}
        data-ui="price.currency"
      >
        <span className={styles.choiceLabel}>{t('price.currency')}</span>{' '}
        <span className={styles.pickValue}>{currencyLabel(value)}</span>
        <Icon name="chevronRight" size={18} />
      </button>
      <ListPicker
        open={picker.open}
        title={t('price.currency')}
        options={codes.map((code) => ({
          value: code,
          label: code,
          ...(currencyName(code) === undefined ? {} : { description: currencyName(code) }),
        }))}
        value={value}
        onSelect={onChange}
        onClose={picker.close}
        data-ui="price.currency.picker"
      />
    </li>
  );
}
