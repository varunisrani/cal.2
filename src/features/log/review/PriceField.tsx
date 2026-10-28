import type { NutritionDraft } from '../../../domain/model';
import { readPriceText } from '../../../domain/money/priceText';
import { currentLocale } from '../../../i18n/locale';
import { t } from '../../../i18n/t';
import { Field } from '../../../ui/Field';

/** True while the field holds text that is not an amount (empty is fine: no price). */
export function priceTextInvalid(text: string): boolean {
  return readPriceText(text, currentLocale()).kind === 'invalid';
}

/**
 * The draft with the price the field holds, in `currency`; without one when the field is empty
 * (or not an amount, which the field already flags and the sheet does not store).
 */
export function withTypedPrice<D extends NutritionDraft>(
  draft: D,
  text: string,
  currency: string,
): D {
  const next = { ...draft };
  delete next.price;
  const typed = readPriceText(text, currentLocale());
  if (typed.kind === 'amount') next.price = { amount: typed.amount, currency };
  return next;
}

export interface PriceFieldProps {
  /** The amount as typed; empty for no price. */
  readonly value: string;
  /** The ISO code the amount is in, shown after it. */
  readonly currency: string;
  readonly onChange: (text: string) => void;
  readonly 'data-ui': string;
}

/**
 * A food's price (D-16.107) in the review and the editor: an amount in the currency shown after
 * it, empty for no price. Text that is not an amount of 0 or more says so under the field.
 */
export function PriceField({ value, currency, onChange, 'data-ui': ui }: PriceFieldProps) {
  const invalid = priceTextInvalid(value);
  return (
    <Field
      label={t('price.label')}
      value={value}
      onChange={onChange}
      unit={currency}
      hint={invalid ? undefined : t('price.hint')}
      error={invalid ? t('price.invalid') : undefined}
      inputMode="decimal"
      autoComplete="off"
      enterKeyHint="done"
      data-ui={ui}
    />
  );
}
