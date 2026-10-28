// Walks at start-up (P15-02, D-16.96): in the Android app only. The platform is checked before
// anything is fetched, so the web build never downloads the walk service, its repository, the walk
// maths, the native adapter or Capacitor's core: they all sit behind the dynamic import below, in
// chunks only the Android app asks for.
//
// A browser test (the screenshots, an e2e) may put a stand-in tracker on the page as
// `globalThis.__platewiseWalkTracker` before the app starts; the walk parts are then built over it
// on any platform. The app itself never sets it.

import type { WalkRepo } from '../../data/repos/walkRepo';
import { isHealthAvailable } from '../health/platform';
import type { WalkTrackerPlugin } from './contract';
import type { WalkService } from './service';
import type { WalksBase } from './setup';

export type { WalksBase } from './setup';

/** What the composition root hands out: the service, and the walks for the read hooks. */
export interface WalkParts {
  readonly service: WalkService;
  readonly walkRepo: Pick<WalkRepo, 'between' | 'list'>;
}

/** Fetches the module that builds the parts; tests pass their own to see whether it was fetched. */
export type WalksSetupModule = () => Promise<{
  setUpWalks(base: WalksBase, plugin: WalkTrackerPlugin): WalkParts;
  setUpNativeWalks(base: WalksBase): Promise<WalkParts>;
}>;

const APP_SETUP: WalksSetupModule = () => import('./setup');

/** The name of the stand-in tracker a browser test may put on the page. */
export const TEST_TRACKER_GLOBAL = '__platewiseWalkTracker';

/** The stand-in tracker a browser test put on the page, if any. */
export function pageTestTracker(): WalkTrackerPlugin | undefined {
  const candidate = (globalThis as Record<string, unknown>)[TEST_TRACKER_GLOBAL];
  return typeof candidate === 'object' &&
    candidate !== null &&
    typeof (candidate as { start?: unknown }).start === 'function'
    ? (candidate as WalkTrackerPlugin)
    : undefined;
}

/** The walk parts, or undefined outside the Android app (nothing is fetched then). */
export async function loadWalks(
  base: WalksBase,
  setup: WalksSetupModule = APP_SETUP,
  // The Android shell is where Health Connect is: the same probe tells the app it runs there.
  inAndroidApp: () => boolean = isHealthAvailable,
  testTracker: () => WalkTrackerPlugin | undefined = pageTestTracker,
): Promise<WalkParts | undefined> {
  const standIn = testTracker();
  if (standIn) return (await setup()).setUpWalks(base, standIn);
  if (!inAndroidApp()) return undefined;
  return (await setup()).setUpNativeWalks(base);
}
