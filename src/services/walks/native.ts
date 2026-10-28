// The native walk tracker of the Android app (P15, D-16.96; S1 builds it). This module is only ever
// fetched through `load.ts` inside the Android app, so neither it nor @capacitor/core is part of
// the web download.

import { registerPlugin } from '@capacitor/core';
import type { WalkTrackerPlugin } from './contract';

/** The plugin the Android shell registers under the name `WalkTracker`. */
export function nativeWalkPlugin(): WalkTrackerPlugin {
  return registerPlugin<WalkTrackerPlugin>('WalkTracker');
}
