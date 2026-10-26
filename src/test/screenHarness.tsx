// A harness for screen tests (Home and the sheets it opens): real repositories over a fresh test
// database, the real diary service (unless a test passes its own), a router over an in-memory
// history, and the providers the app puts around a tab screen.

import { act, render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { createRouter } from '../app/router';
import { memoryHost } from '../app/testing/memoryHost';
import { TodayProvider } from '../app/TodayProvider';
import { RouterProvider } from '../app/useRoute';
import { DataProvider, type DataSources } from '../data/DataProvider';
import { hasUnreadableData, settleQuarantine } from '../data/guard';
import { createBodyFatRepo } from '../data/repos/bodyFatRepo';
import { createCoachRepo } from '../data/repos/coachRepo';
import { createDiaryRepo } from '../data/repos/diaryRepo';
import { createFastRepo } from '../data/repos/fastRepo';
import { createPhotoRepo } from '../data/repos/photoRepo';
import { createProfileRepo } from '../data/repos/profileRepo';
import { createSavedMealsRepo } from '../data/repos/savedMealsRepo';
import { createSettingsRepo } from '../data/repos/settingsRepo';
import { createWaterRepo } from '../data/repos/waterRepo';
import { createWeightRepo } from '../data/repos/weightRepo';
import { fixedClock, type Clock } from '../lib/clock';
import { ServicesProvider, type Services } from '../services/context';
import { createDiaryService, type DiaryService } from '../services/diary';
import { ToastProvider } from '../ui/Toast';
import { openTestDb } from './db';
import { FACTORY_NOW } from './factories';

export interface HarnessOptions {
  /** Defaults to FACTORY_NOW (Monday 26 October 2026, 12:30 in New York). */
  readonly clock?: Clock;
  /** The address the app opens on; `#/home` by default. */
  readonly hash?: string;
  /** Replaces the real diary service. */
  readonly diary?: DiaryService;
  /** Changes what the read hooks see (a deferred or failing read). */
  readonly sources?: (real: DataSources) => DataSources;
}

export type Harness = Awaited<ReturnType<typeof openHarness>>;

const closers: Array<() => Promise<void>> = [];

/** Closes every database opened since the last call; call it after each test (after cleanup). */
export async function closeHarnesses(): Promise<void> {
  for (const close of closers.splice(0)) await close();
}

export async function openHarness(options: HarnessOptions = {}) {
  const test = await openTestDb();
  const clock = options.clock ?? fixedClock(FACTORY_NOW, 'America/New_York');
  const repos = {
    profileRepo: createProfileRepo(test.db),
    settingsRepo: createSettingsRepo(test.db, { locale: 'en-US', bus: test.bus }),
    diaryRepo: createDiaryRepo(test.db),
    waterRepo: createWaterRepo(test.db),
    fastRepo: createFastRepo(test.db),
    weightRepo: createWeightRepo(test.db, { bus: test.bus }),
    bodyFatRepo: createBodyFatRepo(test.db),
    savedMealsRepo: createSavedMealsRepo(test.db),
    coachRepo: createCoachRepo(test.db),
  };
  const real: DataSources = {
    ...repos,
    unreadableFlag: () => hasUnreadableData(test.db),
    clock,
  };
  const sources = options.sources ? options.sources(real) : real;
  const services: Services = {
    diary:
      options.diary ??
      createDiaryService({ diaryRepo: repos.diaryRepo, photoRepo: createPhotoRepo(test.db) }),
    onboarding: { startWithDefaults: async () => undefined },
    clock,
  };
  const host = memoryHost(options.hash ?? '#/home');
  const router = createRouter(host);
  closers.push(async () => {
    await settleQuarantine(test.db);
    test.db.close();
  });

  /** Renders `ui` inside the providers a tab screen has in the app. */
  const mount = (ui: ReactNode) =>
    render(
      <ServicesProvider services={services}>
        <DataProvider sources={sources}>
          <ToastProvider>
            <RouterProvider router={router}>
              <TodayProvider clock={clock}>{ui}</TodayProvider>
            </RouterProvider>
          </ToastProvider>
        </DataProvider>
      </ServicesProvider>,
    );

  return { db: test.db, repos, sources, services, clock, host, router, mount };
}

/**
 * Waits, inside act, until `check()` passes: checked now and after every change to the page.
 * Live reads land through IndexedDB callbacks, so no timer is involved.
 */
export async function until(check: () => boolean): Promise<void> {
  await act(async () => {
    if (check()) return;
    await new Promise<void>((resolve) => {
      const observer = new MutationObserver(() => {
        if (!check()) return;
        observer.disconnect();
        resolve();
      });
      observer.observe(document.body, {
        attributes: true,
        characterData: true,
        childList: true,
        subtree: true,
      });
    });
  });
}

/** `until` for an element matching `selector`. */
export function untilShown(selector: string): Promise<void> {
  return until(() => document.querySelector(selector) !== null);
}

/** `until` for no element matching `selector`. */
export function untilGone(selector: string): Promise<void> {
  return until(() => document.querySelector(selector) === null);
}
