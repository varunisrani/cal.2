import { Suspense, useLayoutEffect, useSyncExternalStore } from 'react';
import { GoalReachedDialog } from '../features/goals/GoalReachedDialog';
import { StorageNudge } from '../features/settings/data/StorageNudge';
import { withPartitions } from '../i18n/onDemand';
import { systemClock, type Clock } from '../lib/clock';
import type { AnalysisService } from '../services/analysis';
import type { TuneUpRunner } from '../services/goals/tuneUp';
import { useOptionalServices } from '../services/context';
import { ToastProvider } from '../ui/Toast';
import { appState as sharedAppState, AppStateContext, type AppStateStore } from './appState';
import { Boot } from './Boot';
import { DamagedDataNotice } from './DamagedDataNotice';
import { ErrorBoundary } from './ErrorBoundary';
import { InstallPrompt } from './InstallPrompt';
import { onDemand } from './onDemand';
import { ReminderBanners } from './ReminderBanners';
import { ShellPortsContext, type ShellPorts } from './ports';
import { HOME_ROUTE, type Router } from './router';
import { Screen } from './Screen';
import styles from './shell.module.css';
import { Skeleton } from './Skeleton';
import { TabBar } from './TabBar';
import { ThemeProvider } from './ThemeProvider';
import { TodayProvider } from './TodayProvider';
import { UpdateBanner } from './UpdateBanner';
import { useKeyboardOpen } from './useKeyboardOpen';
import { RouterProvider, useRoute, useRouter } from './useRoute';
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

// Onboarding runs once, on the first start: fetched then, with its words (P18-00).
const OnboardingRoute = onDemand(() =>
  withPartitions(
    ['onboarding', 'aiSetup', 'about'],
    import('../features/onboarding/OnboardingRoute'),
  ).then((module) => module.OnboardingRoute),
);

// Fetched the first time an analysis starts or a draft waits for review.
const AnalysisOverlay = onDemand(() =>
  import('../features/log/AnalysisOverlay').then((module) => module.AnalysisOverlay),
);
const AnalysisReview = onDemand(() =>
  withPartitions(
    ['review', 'editor', 'ingredients', 'fitCheck', 'price'],
    import('../features/log/review/ReviewSheet'),
  ).then((module) => module.AnalysisReview),
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

// The walk recorder (P15): only the Android app has it; fetched the first time it opens.
const WalkScreen = onDemand(() =>
  withPartitions(['walk', 'health'], import('../features/walk/WalkScreen')).then(
    (module) => module.WalkScreen,
  ),
);

/** `#/walk` where nothing records walks (the web): Home instead, and nothing is fetched. */
function NoWalks() {
  const router = useRouter();
  useLayoutEffect(() => {
    router.navigate(HOME_ROUTE, { replace: true });
  }, [router]);
  return null;
}

/** The weekly tune-up's triggers (P05-09): the tab frame shows only once onboarding is done. */
function TuneUp({ runner }: { readonly runner: TuneUpRunner }) {
  useTuneUp({ runner, ready: true });
  return null;
}

/**
 * The screen for the route: the onboarding wizard alone, or a tab screen over the tab bar with
 * the goal-reached dialog, which every weigh-in path raises (R01.11), the weekly tune-up, and the
 * one food-analysis overlay, whichever tab started it. While the on-screen keyboard is open the
 * frame says so (`data-keyboard="open"`), and the tab bar steps aside (P14). The walk recorder
 * (`#/walk`, P15) takes the screen's place without a tab bar, in the Android app only.
 */
function Shell() {
  const route = useRoute();
  const services = useOptionalServices();
  const keyboard = useKeyboardOpen();
  const tuneUp = services?.tuneUp;
  if (route.kind === 'onboarding') {
    return (
      <Suspense fallback={<Skeleton page data-ui="shell.screenLoading" />}>
        <OnboardingRoute />
      </Suspense>
    );
  }
  return (
    <div className={styles.shell} data-keyboard={keyboard ? 'open' : undefined}>
      <main className={styles.content} data-ui="shell.content">
        {/* Some saved data could not be read and was kept aside (K9), above the screen. */}
        <DamagedDataNotice />
        {/* A waiting update (P09-17) and the install card (P09-18), above the screen. */}
        <UpdateBanner />
        <InstallPrompt />
        {/* Reminders shown in the app rather than by the browser (P09-09). */}
        <ReminderBanners />
        {route.kind === 'walk' ? (
          services?.walks ? (
            <Suspense fallback={null}>
              <WalkScreen />
            </Suspense>
          ) : (
            <NoWalks />
          )
        ) : (
          <Screen route={route} />
        )}
        {/* Keep your diary safe, or time for a backup, under Home's diary (P09-15). */}
        <StorageNudge />
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
