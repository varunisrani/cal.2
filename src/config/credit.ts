/** The app whose features and flows inspired Platewise, credited on the About pages (P09-16). */
export interface InspirationCredit {
  /** Its name. */
  readonly name: string;
  /** Its home on the web. */
  readonly url: string;
  /** Its licence notice, as THIRD_PARTY_NOTICES.md reproduces it. */
  readonly notice: string;
}

/**
 * Read out of THIRD_PARTY_NOTICES.md when the app is built (vite.config.ts), so this repository
 * keeps one copy of the credit and product code never spells the name. Import it only from the
 * About pages: it stays in their on-demand download.
 */
export const INSPIRATION: InspirationCredit = __PLATEWISE_CREDIT__;
