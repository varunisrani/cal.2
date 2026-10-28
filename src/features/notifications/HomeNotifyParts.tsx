import { useEffect, useSyncExternalStore, type ReactNode } from 'react';
import { useSheet } from '../../app/useRoute';
import { t } from '../../i18n/t';
import { useOptionalServices } from '../../services/context';
import type { NotifyService, NotifyView } from '../../services/notifications/contract';
import type { TrackingSettingsService } from '../../services/trackingSettings';
import { Button, IconButton } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { NotificationPanel } from './NotificationPanel';
import styles from './notifications.module.css';

/** The panel's place on the sheet stack. */
export const PANEL_SHEET = 'notifications';

/** A bell, drawn like the icon set's shapes. */
export function BellIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width={24}
      height={24}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      focusable="false"
      aria-hidden="true"
    >
      <path d="M6.5 16.5V11a5.5 5.5 0 0 1 11 0v5.5l1.5 2h-14z" />
      <path d="M10 20.5a2.2 2.2 0 0 0 4 0" />
    </svg>
  );
}

/**
 * Home's notification parts in the Android app (P17, D-16.101/103): the title with a bell that
 * shows the unread count and opens the panel, the one-time card asking for Android's permission,
 * and the panel itself.
 */
export function HomeNotifyParts({
  notify,
  children,
}: {
  readonly notify: NotifyService;
  readonly children: ReactNode;
}) {
  const view = useSyncExternalStore(notify.subscribe, notify.getSnapshot);
  const panel = useSheet(PANEL_SHEET);
  const tracking = useOptionalServices()?.trackingSettings;
  const { unread } = view;
  return (
    <>
      <div className={styles.header}>
        {children}
        <span className={styles.bellSlot}>
          <IconButton
            label={
              unread > 0
                ? t('reminders.inbox.bell', { count: unread })
                : t('reminders.settings.heading')
            }
            icon={<BellIcon />}
            onClick={panel.show}
            data-ui="notify.bell"
          />
          {unread > 0 ? (
            <span className={styles.badge} aria-hidden="true" data-ui="notify.bell.count">
              {unread > 99 ? '99+' : unread}
            </span>
          ) : null}
        </span>
      </div>
      {tracking ? <NudgeCard notify={notify} tracking={tracking} view={view} /> : null}
      <NotificationPanel open={panel.open} onClose={panel.close} notify={notify} view={view} />
    </>
  );
}

/**
 * "Let Platewise nudge you" (P17): while Android does not allow notifications, until Not now (or
 * a refusal, after which Android would no longer ask) hides it for good. Turn on asks Android.
 */
function NudgeCard({
  notify,
  tracking,
  view,
}: {
  readonly notify: NotifyService;
  readonly tracking: TrackingSettingsService;
  readonly view: NotifyView;
}) {
  const permission = useSyncExternalStore(tracking.subscribe, tracking.permission);
  // Read again on the way back from Android's settings, where it may have been allowed.
  useEffect(() => {
    const reread = (): void => {
      tracking.recheck().catch((error: unknown) => {
        console.error('The notification permission could not be read', error);
      });
    };
    reread();
    document.addEventListener('visibilitychange', reread);
    return () => document.removeEventListener('visibilitychange', reread);
  }, [tracking]);
  if (!view.ready || view.cardDone || permission === 'granted' || permission === 'unsupported') {
    return null;
  }

  const dismiss = (): Promise<void> =>
    notify.dismissCard().catch((error: unknown) => {
      console.error('The notification card could not be hidden', error);
    });

  const turnOn = (): Promise<void> =>
    // Asked inside the press: Android shows its dialog only from one.
    tracking.requestPermission().then((answer) => (answer === 'granted' ? undefined : dismiss()));

  return (
    <Card className={styles.card} data-ui="notify.card">
      <div className={styles.cardText}>
        <h2 className={styles.cardTitle}>{t('reminders.card.title')}</h2>
        <p className={styles.cardBody}>{t('reminders.card.body')}</p>
      </div>
      <div className={styles.cardActions}>
        <Button variant="quiet" onClick={dismiss} data-ui="notify.card.later">
          {t('reminders.card.later')}
        </Button>
        <Button variant="primary" onClick={turnOn} data-ui="notify.card.turnOn">
          {t('reminders.card.turnOn')}
        </Button>
      </div>
    </Card>
  );
}
