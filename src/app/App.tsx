import { GoalReachedDialog } from '../features/goals/GoalReachedDialog';
import { QuickStart } from '../features/onboarding/QuickStart';
import { systemClock, type Clock } from '../lib/clock';
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

export interface AppProps {
  /** What the shell reads: the settings snapshot and the start-up state. */
  readonly ports: ShellPorts;
  readonly router: Router;
  readonly clock?: Clock;
  readonly appState?: AppStateStore;
  /** What Reload on the recovery and crash cards does (tests pass their own). */
  readonly onReload?: () => void;
}

/**
 * The screen for the route: onboarding alone, or a tab screen over the tab bar with the
 * goal-reached dialog, which every weigh-in path raises (R01.11).
 */
function Shell() {
  const route = useRoute();
  if (route.kind === 'onboarding') return <QuickStart />;
  return (
    <div className={styles.shell}>
      <main className={styles.content} data-ui="shell.content">
        <Screen route={route} />
      </main>
      <TabBar />
      <GoalReachedDialog />
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
