import { useState } from 'react';
import { tabRoute } from '../../app/router';
import { useRouter } from '../../app/useRoute';
import { dayKeyOf } from '../../domain/dates/dayKey';
import { formatDay, formatTime } from '../../i18n/format';
import { t } from '../../i18n/t';
import type {
  InboxItem,
  InboxKind,
  NotifyService,
  NotifyView,
} from '../../services/notifications/contract';
import { Button } from '../../ui/Button';
import { Dialog } from '../../ui/Dialog';
import { Icon, type IconName } from '../../ui/icons';
import { Sheet } from '../../ui/Sheet';
import { SwipeRow } from '../../ui/SwipeRow';
import { useToast } from '../../ui/Toast';
import { groupByDay, type InboxGroup } from './groups';
import styles from './notifications.module.css';

/** The icon of each kind in the list. */
const ICONS: Readonly<Record<InboxKind, IconName>> = {
  reminder: 'clock',
  mealCheck: 'plate',
  waterPace: 'drop',
  emptyDay: 'pencil',
  weighIn: 'scale',
  sugarOver: 'warning',
  caloriesOver: 'warning',
  proteinReached: 'check',
  activeWeek: 'walk',
  fastGoal: 'hourglass',
  analysisReady: 'camera',
  backupFailed: 'info',
  coachReplied: 'chat',
  coachCheckIn: 'chat',
};

const GROUP_WORDS = {
  today: 'reminders.inbox.today',
  yesterday: 'reminders.inbox.yesterday',
  earlier: 'reminders.inbox.earlier',
} as const satisfies Record<InboxGroup, string>;

export interface NotificationPanelProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly notify: NotifyService;
  readonly view: NotifyView;
  /** "Now" for the groups (tests pass their own). */
  readonly now?: () => number;
}

/**
 * The notification panel (P17, D-16.103): a tall sheet over Home with the inbox by Today,
 * Yesterday and Earlier, newest first: each item's icon, title, text, time and unread mark. A tap
 * opens what it is about and marks it read; each can be deleted (its button, or a swipe); Mark all
 * as read; Clear all asks first; a link to Smart notifications. Opening it marks nothing read.
 */
export function NotificationPanel({
  open,
  onClose,
  notify,
  view,
  now = Date.now,
}: NotificationPanelProps) {
  const router = useRouter();
  const toast = useToast();
  const [asking, setAsking] = useState(false);
  const { items, unread } = view;

  const failed = (error: unknown): void => {
    console.error('A notification could not be changed', error);
    toast.show(t('reminders.settings.saveFailed'));
  };

  const openItem = (item: InboxItem): void => {
    notify.markRead(item.ref).catch(failed);
    notify.open(item.open);
  };

  const groups = groupByDay(items, now());

  return (
    <Sheet
      open={open}
      title={t('reminders.settings.heading')}
      onClose={onClose}
      data-ui="notify.panel"
    >
      <div className={styles.panel}>
        <div className={styles.tools}>
          <Button
            variant="quiet"
            disabled={unread === 0}
            onClick={() => notify.markAllRead().catch(failed)}
            data-ui="notify.panel.readAll"
          >
            {t('reminders.inbox.readAll')}
          </Button>
          <Button
            variant="quiet"
            disabled={items.length === 0}
            onClick={() => setAsking(true)}
            data-ui="notify.panel.clear"
          >
            {t('reminders.inbox.clear')}
          </Button>
        </div>

        {groups.length === 0 ? (
          <p className={styles.empty} data-ui="notify.panel.empty">
            {t('reminders.inbox.empty')}
          </p>
        ) : (
          groups.map(({ group, items: inGroup }) => (
            <section key={group} className={styles.group} data-ui={`notify.panel.${group}`}>
              <h3 className={styles.groupHeading}>{t(GROUP_WORDS[group])}</h3>
              <ul className={styles.list}>
                {inGroup.map((item) => (
                  <li key={item.ref}>
                    <SwipeRow
                      onRequestDelete={() => void notify.remove(item.ref).catch(failed)}
                      deleteLabel={t('reminders.inbox.delete', { title: item.title })}
                      data-ui="notify.panel.item"
                    >
                      <button
                        type="button"
                        className={styles.item}
                        data-unread={item.read ? undefined : 'true'}
                        onClick={() => openItem(item)}
                      >
                        <span className={styles.itemIcon}>
                          <Icon name={ICONS[item.kind]} size={20} />
                        </span>
                        <span className={styles.itemText}>
                          <span className={styles.itemTitle}>{item.title}</span>
                          <span className={styles.itemBody}>{item.body}</span>
                        </span>
                        <span className={styles.itemEnd}>
                          <time
                            className={styles.itemTime}
                            dateTime={new Date(item.at).toISOString()}
                          >
                            {group === 'earlier'
                              ? `${formatDay(dayKeyOf(item.at), 'short')}, ${formatTime(item.at)}`
                              : formatTime(item.at)}
                          </time>
                          {item.read ? null : (
                            <span className={styles.dot} data-ui="notify.panel.unread">
                              <span className={styles.hidden}>{t('reminders.inbox.unread')}</span>
                            </span>
                          )}
                        </span>
                      </button>
                    </SwipeRow>
                  </li>
                ))}
              </ul>
            </section>
          ))
        )}

        <button
          type="button"
          className={styles.link}
          onClick={() => router.navigate(tabRoute('settings', 'tracking'))}
          data-ui="notify.panel.settings"
        >
          {t('reminders.smart.heading')}
          <Icon name="chevronRight" size={18} />
        </button>
      </div>

      <Dialog
        open={asking}
        title={t('reminders.inbox.clearAsk')}
        confirmLabel={t('reminders.inbox.clearYes')}
        destructive
        onConfirm={() => {
          setAsking(false);
          return notify.clear().catch(failed);
        }}
        onCancel={() => setAsking(false)}
        data-ui="notify.panel.clearDialog"
      />
    </Sheet>
  );
}
