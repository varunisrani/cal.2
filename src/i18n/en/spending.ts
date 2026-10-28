import type { MessageTree } from '../catalogue';

/**
 * Words of Progress › Spending (src/features/progress/spending, D-16.108) and its row on Progress.
 * Meal names are logging words (`log.meal`); amounts are formatted by `formatMoney`.
 */
export const spending = {
  spending: {
    title: 'Spending',
    link: 'What your food cost',
    loadFailed: "Spending can't be shown right now. Reload the page to try again.",
    empty:
      'No prices yet. Type a price when you log a food, or in its editor, and your spending shows here.',
    period: {
      label: 'Days shown',
      week: '7 days',
      month: '30 days',
    },
    days: {
      title: 'By day',
      chart: 'Spending by day',
      total: '{amount} in all',
      none: 'No prices',
    },
    month: {
      title: 'This month',
      average: 'Average per day with a price',
      days: '{count, plural, one {# day} other {# days}} with a price',
    },
    months: 'By month',
    meals: 'By meal',
    top: {
      title: 'Cost the most',
      times: '{count, plural, one {# time} other {# times}}',
    },
    others: 'Also {amounts} in other currencies',
  },
} as const satisfies MessageTree;
