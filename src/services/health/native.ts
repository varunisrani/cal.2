// The native Health Connect plugin of the Android app (P11-02 builds it, P11-03 calls it). This
// module is only ever fetched by `load.ts` inside the Android app, so neither it nor
// @capacitor/core is part of the web download.

import { registerPlugin } from '@capacitor/core';
import type { HealthConnectPlugin } from './contract';

/** The plugin the Android shell registers under the name `HealthConnect`. */
export function nativeHealthPlugin(): HealthConnectPlugin {
  return registerPlugin<HealthConnectPlugin>('HealthConnect');
}
