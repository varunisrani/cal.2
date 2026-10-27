import type { MessageTree } from '../catalogue';

/**
 * Words of Settings › App settings and the pages it links to (src/features/settings/app): the look,
 * grams first, the week start, the units, the Tab bar page and the Product details page. Choice
 * names come from where they live already: appearance and accent names from `appearance`, tab names
 * from `common.tabs`, unit words from `home.unit` and `profile.units`, product details from
 * `review.product.field`.
 */
export const appSettings = {
  appSettings: {
    title: 'App settings',
    unavailable: "These settings can't be read right now. Reload the page to try again.",
    saveFailed: "That change wasn't saved. Please try again.",
    look: {
      heading: 'Look',
      appearance: 'Appearance',
      accent: 'Accent',
    },
    days: {
      heading: 'Logging and days',
      gramsFirst: 'Grams first',
      gramsFirstHint:
        'Food reviews open with the amount in grams; any other unit stays one tap away.',
      weekStart: 'Week starts on',
      mon: 'Monday',
      sun: 'Sunday',
    },
    units: {
      heading: 'Units',
      energy: 'Energy',
      height: 'Height',
      note: 'Units change only how numbers are shown and typed. Nothing you logged is changed. Weight is always in kg.',
    },
    pages: {
      heading: 'More',
    },
    tabBar: {
      title: 'Tab bar',
      heading: 'Tabs in the bar',
      note: "Home and Settings can't be hidden.",
    },
    product: {
      title: 'Product details',
      show: 'Show product details',
      showHint: 'The package, scores, allergens and label of a scanned product, under its review.',
      fields: 'Details shown',
      allergenNote:
        'Allergen warnings are not switched here: they show whenever Personal info lists allergens.',
    },
  },
} as const satisfies MessageTree;
