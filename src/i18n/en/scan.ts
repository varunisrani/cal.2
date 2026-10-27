import type { MessageTree } from '../catalogue';

/**
 * Words of scanning a barcode (src/features/log/scan): the camera layer and its states, the typed
 * digits (D-16.18), the lookup layer and one message per way a lookup can fail, the name of a
 * product no database names, and the review's line for values reused from a saved label (P06-17).
 */
export const scan = {
  scan: {
    title: 'Scan a barcode',
    close: 'Close the scanner',
    preview: 'Camera view. Tap to focus.',
    hint: 'Point the camera at the barcode',
    source: 'Product details come from Open Food Facts.',
    starting: 'Opening the camera…',
    denied: {
      title: 'Camera access is off',
      body: 'Allow the camera for this site in your browser settings, or type the digits below.',
    },
    unavailable: "The camera can't scan barcodes here. Type the digits below.",
    digits: {
      label: 'Type the digits',
      placeholder: 'Digits under the barcode',
      submit: 'Look up',
      empty: 'Type the digits printed under the barcode.',
      notDigits: 'Use digits only, as printed under the barcode.',
      tooLong: 'A barcode has at most 24 digits.',
    },
    unnamed: 'Barcode {code}',
    looking: 'Looking up the barcode…',
    failedTitle: "Couldn't find this product",
    scanLabel: 'Scan label',
    failure: {
      invalid:
        'This code is not one the food databases can look up: only codes of 1 to 24 digits work.',
      notFound:
        "This product wasn't found. Scan its nutrition label instead, and it will be found the next time you scan it.",
      noNutrition:
        'This product has no nutrition values in Open Food Facts. Scan its nutrition label instead, and it will be found the next time you scan it.',
      rateLimited: 'Open Food Facts had too many requests just now. Wait a minute and try again.',
      unavailable: "Open Food Facts isn't available right now. Try again later.",
      unexpected: "Open Food Facts sent an answer that couldn't be read. Try again.",
      offline: "You're offline. Connect to the internet and try again.",
      timeout: "Open Food Facts didn't answer in time. Try again.",
      network: "Open Food Facts couldn't be reached. Make sure you're online, then try again.",
      keyRefused:
        'FoodData Central refused your API key. Check the key in settings, or scan the nutrition label instead.',
      generic: "The product couldn't be opened. Try again.",
    },
    savedLabel:
      'These values come from the label you scanned for this barcode before. Delete those entries to forget the label.',
  },
} as const satisfies MessageTree;
