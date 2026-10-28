import type { MessageTree } from '../catalogue';

/**
 * Words of a food's price (D-16.107): the Price field of the review and the entry editor
 * (src/features/log), and the Currency choice in Settings › App settings › Units. Only screens
 * fetched on demand use them. Currency names come from the browser (`Intl.DisplayNames`).
 */
export const price = {
  price: {
    label: 'Price',
    hint: 'Leave empty for no price.',
    invalid: 'Type an amount, like 120 or 4.50.',
    currency: 'Currency',
  },
} as const satisfies MessageTree;
