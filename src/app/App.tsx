import { Suspense, useSyncExternalStore } from 'react';
import { GoalReachedDialog } from '../features/goals/GoalReachedDialog';
import { OnboardingRoute } from '../features/onboarding/OnboardingRoute';
import { systemClock, type Clock } from '../lib/clock';
import type { AnalysisService } from '../services/analysis';
import type { TuneUpRunner } from '../services/goals/tuneUp';
import { useOptionalServices } from '../services/context';
import { ToastProvider } from '../ui/Toast';
import { appState as sharedAppState, AppStateContext, type AppStateStore } from './appState';
import { Boot } from './Boot';
import { ErrorBoundary } from './ErrorBoundary';
import { InstallPrompt } from './InstallPrompt';
import { onDemand } from './onDemand';
import { ReminderBanners } from './ReminderBanners';
import { ShellPortsContext, type ShellPorts } from './ports';
import type { Router } from './router';
import { Screen } from './Screen';
import styles from './shell.module.css';
import { TabBar } from './TabBar';
import { ThemeProvider } from './ThemeProvider';
import { TodayProvider } from './TodayProvider';
import { UpdateBanner } from './UpdateBanner';
import { RouterProvider, useRoute } from './useRoute';
import { useTuneUp } from './useTuneUp';

export interface AppProps {
  /** What the shell reads: the settings snapshot and the start-up state. */
  readonly ports: ShellPorts;
  readonly router: Router;
  readonly clock?: Clock;
  readonly appState?: AppStateStore;
  /** What Reload on the recovery and crash cards does (tests pass their own). */
  readonly onReload?: () => void;
}

// Fetched the first time an analysis starts or a draft waits for review.
const AnalysisOverlay = onDemand(() =>
  import('../features/log/AnalysisOverlay').then((module) => module.AnalysisOverlay),
);
const AnalysisReview = onDemand(() =>
  import('../features/log/review/ReviewSheet').then((module) => module.AnalysisReview),
);

/**
 * The food analysis's layers: the overlay while it runs or after it failed, the review while a
 * draft waits; nothing at other times, so neither is fetched before it is needed. The tab bar
 * hides through the app state the service sets, not through the overlay, so it hides at once.
 */
function AnalysisLayers({ analysis }: { readonly analysis: AnalysisService }) {
  const { phase } = useSyncExternalStore(analysis.subscribe, analysis.getSnapshot);
  return (
    <>
      <Suspense fallback={null}>
        {phase === 'analysing' || phase === 'failed' ? <AnalysisOverlay /> : null}
      </Suspense>
      <Suspense fallback={null}>{phase === 'reviewReady' ? <AnalysisReview /> : null}</Suspense>
    </>
  );
}

/** The weekly tune-up's triggers (P05-09): the tab frame shows only once onboarding is done. */
function TuneUp({ runner }: { readonly runner: TuneUpRunner }) {
  useTuneUp({ runner, ready: true });
  return null;
}

/**
 * The screen for the route: the onboarding wizard alone, or a tab screen over the tab bar with
 * the goal-reached dialog, which every weigh-in path raises (R01.11), the weekly tune-up, and the
 * one food-analysis overlay, whichever tab started it.
 */
function Shell() {
  const route = useRoute();
  const services = useOptionalServices();
  const tuneUp = services?.tuneUp;
  if (route.kind === 'onboarding') return <OnboardingRoute />;
  return (
    <div className={styles.shell}>
      <main className={styles.content} data-ui="shell.content">
        {/* A waiting update (P09-17) and the install card (P09-18), above the screen. */}
        <UpdateBanner />
        <InstallPrompt />
        {/* Reminders shown in the app rather than by the browser (P09-09). */}
        <ReminderBanners />
        <Screen route={route} />
      </main>
      <TabBar />
      <GoalReachedDialog />
      {tuneUp ? <TuneUp runner={tuneUp} /> : null}
      {services?.analysis ? <AnalysisLayers analysis={services.analysis} /> : null}
    </div>
  );
}

/** The whole app: crash guard, data ports, theme, toasts, router, today, start-up gate. */
export function App({
  ports,
  router,
  clock = systemClock,
  appState = sharedAppState,
  onReload,
}: AppProps) {
  return (
    <ErrorBoundary onReload={onReload}>
      <ShellPortsContext value={ports}>
        <AppStateContext value={appState}>
          <ThemeProvider>
            <ToastProvider>
              <RouterProvider router={router}>
                <TodayProvider clock={clock}>
                  <Boot onReload={onReload}>
                    <Shell />
                  </Boot>
                </TodayProvider>
              </RouterProvider>
            </ToastProvider>
          </ThemeProvider>
        </AppStateContext>
      </ShellPortsContext>
    </ErrorBoundary>
  );
}
