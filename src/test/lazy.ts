/**
 * Waiting for pieces fetched on demand (`src/app/onDemand.ts`, P10-08). A lazy piece suspends on
 * its first draw and React draws it once its module is in; while a test waits inside `act` (as
 * `until` in screenHarness does) that draw is held back until the wait ends, so the wait never
 * ends. `untilLoaded` waits with Testing Library's `waitFor` instead, which runs outside `act`.
 * Import the lazy module in a `beforeAll` first, so the wait never includes its first transform.
 */
import { waitFor } from '@testing-library/react';

/** The fallbacks a screen or a Settings page shows while its module loads. */
const LOADING = '[data-ui="shell.screenLoading"], [data-ui="settings.pageLoading"]';

/** Waits until no screen or Settings page on the page is still loading. */
export async function untilLoaded(): Promise<void> {
  await waitFor(() => {
    if (document.querySelector(LOADING) !== null) throw new Error('A page is still loading');
  });
}
