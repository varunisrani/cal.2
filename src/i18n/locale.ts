/** The locale used when the browser names none, or names one `Intl` cannot use. */
export const FALLBACK_LOCALE = 'en';

let lastTag: string | undefined;
let lastLocale = FALLBACK_LOCALE;

/**
 * The locale numbers and dates follow: the browser's language as a canonical tag, else `en`.
 * UI text stays English in v1 whatever this returns. Read on every call, so a language change
 * in the browser applies without a reload.
 */
export function currentLocale(): string {
  const tag = typeof navigator === 'undefined' ? undefined : navigator.language;
  if (!tag) return FALLBACK_LOCALE;
  if (tag !== lastTag) {
    lastTag = tag;
    lastLocale = canonical(tag);
  }
  return lastLocale;
}

function canonical(tag: string): string {
  try {
    return Intl.getCanonicalLocales(tag)[0] ?? FALLBACK_LOCALE;
  } catch {
    return FALLBACK_LOCALE;
  }
}
