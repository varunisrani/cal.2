import { GoalReachedDialog } from '../features/goals/GoalReachedDialog';
import { QuickStart } from '../features/onboarding/QuickStart';
import { systemClock, type Clock } from '../lib/clock';
import type { TuneUpRunner } from '../services/goals/tuneUp';
import { useOptionalServices } from '../services/context';
import { ToastProvider } from '../ui/Toast';
import { appState as sharedAppState, AppStateContext, type AppStateStore } from './appState';
import { Boot } from './Boot';
import { ErrorBoundary } from './ErrorBoundary';
import { ShellPortsContext, type ShellPorts } from './ports';
import type { Router } from './router';
import { Screen } from './Screen';
import styles from './shell.module.css';
import { TabBar } from './TabBar';
import { ThemeProvider } from './ThemeProvider';
import { TodayProvider } from './TodayProvider';
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

/** The weekly tune-up's triggers (P05-09): the tab frame shows only once onboarding is done. */
function TuneUp({ runner }: { readonly runner: TuneUpRunner }) {
  useTuneUp({ runner, ready: true });
  return null;
}

/**
 * The screen for the route: onboarding alone, or a tab screen over the tab bar with the
 * goal-reached dialog, which every weigh-in path raises (R01.11), and the weekly tune-up.
 */
function Shell() {
  const route = useRoute();
  const tuneUp = useOptionalServices()?.tuneUp;
  if (route.kind === 'onboarding') return <QuickStart />;
  return (
    <div className={styles.shell}>
      <main className={styles.content} data-ui="shell.content">
        <Screen route={route} />
      </main>
      <TabBar />
      <GoalReachedDialog />
      {tuneUp ? <TuneUp runner={tuneUp} /> : null}
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
