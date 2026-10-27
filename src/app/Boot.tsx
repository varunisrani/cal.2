import { useLayoutEffect, type ReactNode } from 'react';
import { t } from '../i18n/t';
import { useBootState, useShellSettings, type BootState } from './ports';
import { HOME_ROUTE, ONBOARDING_ROUTE, type Route } from './router';
import { reloadPage, ShellNotice } from './ShellNotice';
import { Skeleton } from './Skeleton';
import { useRoute, useRouter } from './useRoute';

/** Where start-up must send the person from `route`, or `null` to stay. */
function redirectFor(boot: BootState, route: Route): Route | null {
  const onOnboarding = route.kind === 'onboarding';
  if (boot.status === 'needsOnboarding') return onOnboarding ? null : ONBOARDING_ROUTE;
  if (boot.status === 'ready') return onOnboarding ? HOME_ROUTE : null;
  return null;
}

export interface BootProps {
  readonly children?: ReactNode;
  /** What the recovery card's Reload does (tests pass their own). */
  readonly onReload?: () => void;
}

/**
 * The start-up gate. Shows a skeleton until both the profile state and the settings are known,
 * so fallback goals and default switches never flash (R05.12, R06.22); a recovery card when the
 * database could not be opened; else the app, after sending a person without a completed profile
 * to onboarding and one with a profile away from it. Any other address (a tab) is kept.
 */
export function Boot({ children, onReload = reloadPage }: BootProps) {
  const boot = useBootState();
  const settings = useShellSettings();
  const route = useRoute();
  const router = useRouter();
  const redirect = boot && settings ? redirectFor(boot, route) : null;

  // Before paint, and replacing the address, so Back never returns to the wrong side.
  useLayoutEffect(() => {
    if (redirect) router.navigate(redirect, { replace: true });
  }, [redirect, router]);

  if (!boot || !settings || redirect) return <Skeleton page data-ui="shell.skeleton" />;
  if (boot.status === 'openError') {
    return (
      <ShellNotice
        title={t('shell.recovery.title')}
        body={t('shell.recovery.body')}
        actionLabel={t('shell.recovery.reload')}
        onAction={onReload}
        data-ui="shell.recovery"
      />
    );
  }
  return children;
}
