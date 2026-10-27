// A harness for screen tests (Home and the sheets it opens, the onboarding wizard): real
// repositories over a fresh test database, the real diary, onboarding and AI setup services (a
// test may pass its own diary, onboarding and plan builder), a router over an in-memory history,
// its own shared UI state, and the providers the app puts around a tab screen.

import { act, render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { AppStateContext, createAppState } from '../app/appState';
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
import { createSecretsRepo } from '../data/repos/secretsRepo';
import { createSettingsRepo } from '../data/repos/settingsRepo';
import { createWaterRepo } from '../data/repos/waterRepo';
import { createWeightRepo } from '../data/repos/weightRepo';
import { fixedClock, type Clock } from '../lib/clock';
import { createAiSetupService } from '../services/aiSetup';
import { ServicesProvider, type Services } from '../services/context';
import { createDiaryService, type DiaryService } from '../services/diary';
import { formulaStandIn, type PlanBuilder } from '../services/goals/planBuilder';
import { createOnboardingService, type OnboardingService } from '../services/onboarding';
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
  /** Replaces the plan builder, which otherwise gives the formula plan at once (no AI here). */
  readonly planBuilder?: PlanBuilder;
  /** Replaces the real onboarding service. */
  readonly onboarding?: OnboardingService;
  /** Changes what the read hooks see (a deferred or failing read). */
  readonly sources?: (real: DataSources) => DataSources;
}

export type Harness = Awaited<ReturnType<typeof openHarness>>;

const closers: Array<() => Promise<void>> = [];

/** The stops of the `until` waits still open: a test that timed out leaves its wait here. */
const openWaits = new Set<() => void>();

/**
 * Closes every database opened since the last call and stops any wait still open; call it after
 * each test (after cleanup).
 */
export async function closeHarnesses(): Promise<void> {
  for (const stop of [...openWaits]) stop();
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
    onboarding: options.onboarding ?? createOnboardingService(repos),
    aiSetup: createAiSetupService({
      settingsRepo: repos.settingsRepo,
      secretsRepo: createSecretsRepo(test.db),
    }),
    planBuilder: options.planBuilder ?? { build: async (request) => formulaStandIn(request) },
    clock,
  };
  const host = memoryHost(options.hash ?? '#/home');
  const router = createRouter(host);
  // A fresh start of the app: no day picked (Home's selected day lives here).
  const appState = createAppState();
  closers.push(async () => {
    await settleQuarantine(test.db);
    test.db.close();
  });

  /** Renders `ui` inside the providers a tab screen has in the app. */
  const mount = (ui: ReactNode) =>
    render(
      <ServicesProvider services={services}>
        <DataProvider sources={sources}>
          <AppStateContext value={appState}>
            <ToastProvider>
              <RouterProvider router={router}>
                <TodayProvider clock={clock}>{ui}</TodayProvider>
              </RouterProvider>
            </ToastProvider>
          </AppStateContext>
        </DataProvider>
      </ServicesProvider>,
    );

  return { db: test.db, repos, sources, services, clock, host, router, appState, mount };
}

/**
 * Waits until `check()` passes: checked now and after every change to the page; then lets React
 * finish, inside act, what that change started. The wait itself is outside act: while an act
 * scope is open React holds back every draw that is not urgent (one for a state set when a promise
 * settles, say) until the scope ends, so a wait inside act for such a draw would never end. Live
 * reads land through IndexedDB callbacks, so no timer is involved.
 */
export async function until(check: () => boolean): Promise<void> {
  if (!check()) {
    await new Promise<void>((resolve) => {
      const observer = new MutationObserver(() => {
        if (!check()) return;
        stop();
        resolve();
      });
      const stop = (): void => {
        observer.disconnect();
        openWaits.delete(stop);
      };
      openWaits.add(stop);
      observer.observe(document.body, {
        attributes: true,
        characterData: true,
        childList: true,
        subtree: true,
      });
    });
  }
  await act(async () => undefined);
}

/** `until` for an element matching `selector`. */
export function untilShown(selector: string): Promise<void> {
  return until(() => document.querySelector(selector) !== null);
}

/** `until` for no element matching `selector`. */
export function untilGone(selector: string): Promise<void> {
  return until(() => document.querySelector(selector) === null);
}
