import { openAppData, type AppOpening } from '../services/appData';
import { ToastProvider } from '../ui/Toast';
import { Boot } from './Boot';
import { ErrorBoundary } from './ErrorBoundary';
import { appRouter, type Router } from './router';
import { Shell } from './Shell';
import { TodayProvider } from './TodayProvider';
import { RouterContext } from './useRoute';

export interface AppProps {
  /** Opens the app's data; the page's database by default. */
  readonly open?: () => Promise<AppOpening>;
  /** The router; the page's by default. */
  readonly router?: Router;
}

/** The whole app: crash guard, router, today clock, toasts, start-up gate and the shell. */
export function App({ open = openAppData, router }: AppProps) {
  return (
    <ErrorBoundary>
      <RouterContext.Provider value={router ?? appRouter()}>
        <TodayProvider>
          <ToastProvider>
            <Boot open={open}>
              <Shell />
            </Boot>
          </ToastProvider>
        </TodayProvider>
      </RouterContext.Provider>
    </ErrorBoundary>
  );
}
