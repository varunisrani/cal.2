// Constants vite.config.ts writes into the build (`define`); product code reads them through
// src/config/build.ts and src/config/credit.ts, never by these names.

/** package.json's version. */
declare const __PLATEWISE_VERSION__: string;

/** The credit section of THIRD_PARTY_NOTICES.md (scripts/notices.ts `readCredit`). */
declare const __PLATEWISE_CREDIT__: {
  readonly name: string;
  readonly url: string;
  readonly notice: string;
};
