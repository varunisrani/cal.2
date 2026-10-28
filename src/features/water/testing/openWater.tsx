// Test helper: the water screens over a fresh test database, with the real water service and the
// screen harness's repositories, router, toasts and providers. The clock is the harness's: Monday
// 26 October 2026, 12:30 in New York.

import { act } from '@testing-library/react';
import type { ReactNode } from 'react';
import type { WaterDisplayUnit } from '../../../domain/units/water';
import { ServicesProvider } from '../../../services/context';
import { createWaterService, type WaterService } from '../../../services/water';
import { openHarness, type HarnessOptions } from '../../../test/screenHarness';

export interface WaterSetup {
  /** Water tracking; off by default, as in the app. */
  readonly on?: boolean;
  readonly unit?: WaterDisplayUnit;
  readonly goalMl?: number;
  readonly quickAddMl?: readonly number[];
  /** The address the harness opens on. */
  readonly hash?: string;
  /** Changes what the read hooks see (a held or failing read). */
  readonly sources?: HarnessOptions['sources'];
  /** Wraps the real water service (a failing log). */
  readonly wrap?: (real: WaterService) => WaterService;
}

export async function openWater({
  on,
  unit,
  goalMl,
  quickAddMl,
  hash = '#/settings/tracking',
  sources,
  wrap,
}: WaterSetup = {}) {
  const h = await openHarness({ hash, sources });
  const { settingsRepo, waterRepo } = h.repos;
  if (on !== undefined) await settingsRepo.set('water.on', on);
  if (unit) await settingsRepo.set('water.unit', unit);
  if (goalMl !== undefined) await settingsRepo.set('water.goalMl', goalMl);
  if (quickAddMl) await settingsRepo.set('water.quickAddMl', [...quickAddMl]);
  const real = createWaterService({ waterRepo, settingsRepo, clock: h.clock });
  const water = wrap ? wrap(real) : real;
  const services = { ...h.services, water };

  /** Renders `ui` in the harness's providers with the water service. */
  const mount = (ui: ReactNode) =>
    h.mount(<ServicesProvider services={services}>{ui}</ServicesProvider>);

  /** The ml of the water logs of `day`, newest first. */
  const loggedOn = async (day: string): Promise<number[]> =>
    (await waterRepo.byDay(day)).map((log) => log.ml);

  return { ...h, water, services, mount, loggedOn };
}

export type WaterHarness = Awaited<ReturnType<typeof openWater>>;

/** Lets one round of queued tasks run (IndexedDB callbacks) inside act. No timer is involved. */
function nextTask(): Promise<void> {
  return act(
    () =>
      new Promise<void>((resolve) => {
        const channel = new MessageChannel();
        channel.port1.onmessage = () => {
          channel.port1.close();
          resolve();
        };
        channel.port2.postMessage(null);
      }),
  );
}

/**
 * Waits until `check()` passes, one task at a time. Unlike `until`, every round ends its act, so
 * a plain state update made after a write (a toast, a sheet closing itself) is drawn before the
 * next check instead of waiting for the act that holds it. The limit is a time, not a count of
 * rounds: a backup hashes with WebCrypto, which answers on a thread of its own, and a loaded
 * machine runs any number of rounds before it does.
 */
export async function settle(check: () => boolean): Promise<void> {
  const deadline = performance.now() + 5_000;
  while (!check()) {
    if (performance.now() > deadline) {
      throw new Error('settle: the page never reached the expected state');
    }
    await nextTask();
  }
}
