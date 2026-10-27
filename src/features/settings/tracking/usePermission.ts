import { useEffect, useSyncExternalStore } from 'react';
import type { NotificationState } from '../../../services/reminders/notifier';
import type { TrackingSettingsService } from '../../../services/trackingSettings';

/**
 * The permission as the service last read it, read again on every return of focus to the page.
 * Every card of the page follows the same value (the custom reminders card asks for it too).
 */
export function usePermission(service: TrackingSettingsService): NotificationState {
  const state = useSyncExternalStore(service.subscribe, service.permission);
  useEffect(() => {
    const reread = (): void => {
      service.recheck().catch((error: unknown) => {
        console.error('The notification permission could not be read', error);
      });
    };
    const onVisibility = (): void => {
      if (document.visibilityState === 'visible') reread();
    };
    // Also once on opening: it may have changed since it was last read.
    reread();
    window.addEventListener('focus', reread);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('focus', reread);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [service]);
  return state;
}
