import { Suspense, useId, useState, useSyncExternalStore, type MouseEvent } from 'react';
import { onDemand } from '../../app/onDemand';
import { routeHash, tabRoute } from '../../app/router';
import { useRouter, useSheet } from '../../app/useRoute';
import { useSettings } from '../../data/hooks';
import type { Settings } from '../../data/settingsSchema';
import type { CoachReminderCard } from '../../domain/model';
import { withPartitions } from '../../i18n/onDemand';
import { t, type TKey } from '../../i18n/t';
import type { CoachSession } from '../../services/coach/session';
import type { ReminderCardProblem } from '../../services/coach/reminderCards';
import { useServices } from '../../services/context';
import type { NotificationState } from '../../services/reminders/notifier';
import { Button } from '../../ui/Button';
import { Icon } from '../../ui/icons';
import { useToast } from '../../ui/Toast';
import styles from './coach.module.css';
import { reminderTiming } from './reminderTiming';

const SETTINGS = ['remind.master', 'remind.custom', 'display.weekStart'] as const;

// The reminder's own editor, as Settings › Tracking & reminders has it: fetched on Edit (P17).
const ReminderSheet = onDemand(() =>
  withPartitions(['reminders'], import('../settings/tracking/CustomReminders')).then(
    (module) => module.ReminderSheet,
  ),
);

/** Settings › Tracking & reminders, where "Your reminders" lists what Add added. */
export const TRACKING_ROUTE = tabRoute('settings', 'tracking');

const noSubscription = (): (() => void) => () => undefined;
const noPermission = (): NotificationState => 'unsupported';

/** The words for why a card's reminder was not added. */
function problemKey(problem: ReminderCardProblem): TKey {
  switch (problem) {
    case 'past':
    case 'full':
    case 'gone':
    case 'unavailable':
      return `coach.reminder.problems.${problem}`;
    default:
      return 'coach.reminder.problems.invalid';
  }
}

export interface ReminderCardProps {
  /** The reply the card sits under. */
  readonly messageId: string;
  /** The card's place in the reply's `reminders`. */
  readonly index: number;
  readonly card: CoachReminderCard;
}

/**
 * A reminder the Coach proposed, under its reply (P13, D-16.93): the words, when it comes (in the
 * person's locale), and Add and Dismiss. Add first asks for notifications when they are not on
 * (inside the press, as Settings does), then adds the reminder, switched off when they were
 * refused; the card then says it was added, with a link to Settings › Tracking & reminders, or
 * says why it could not be. Dismiss hides the card for good. What became of the card is stored on
 * the reply, so it shows the same after a reload, and Add never adds it twice. A reminder the Coach
 * set itself (P17, D-16.102) shows as set, with Undo and Edit.
 */
export function ReminderCard({ messageId, index, card }: ReminderCardProps) {
  const { coachSession, trackingSettings } = useServices();
  const settings = useSettings(SETTINGS);
  const permission = useSyncExternalStore(
    trackingSettings?.subscribe ?? noSubscription,
    trackingSettings?.permission ?? noPermission,
  );
  const router = useRouter();
  const toast = useToast();
  const [problem, setProblem] = useState<ReminderCardProblem | null>(null);
  // Added in this press even if the card's stored mark has not come back yet.
  const [addedHere, setAddedHere] = useState(false);

  if (card.status === 'dismissed' || !coachSession) return null;
  const session: CoachSession = coachSession;
  const added = card.status === 'added' || addedHere;
  const notificationsOn =
    settings.status === 'ready' && settings.value['remind.master'] && permission === 'granted';
  if (card.status === 'set') {
    return (
      <SetReminder
        messageId={messageId}
        index={index}
        card={card}
        settings={settings.status === 'ready' ? settings.value : null}
        notificationsOn={notificationsOn}
      />
    );
  }

  const add = async (): Promise<void> => {
    setProblem(null);
    // Asked before anything is awaited: browsers prompt only inside the press.
    const allowed =
      notificationsOn || !trackingSettings
        ? Promise.resolve(true)
        : trackingSettings.turnRemindersOn().then(
            (answer) => answer === 'granted',
            () => false,
          );
    try {
      const outcome = await session.addReminder(messageId, index, await allowed);
      if (outcome.ok) setAddedHere(true);
      else setProblem(outcome.problem);
    } catch (error) {
      console.error('A reminder could not be added', error);
      toast.show(t('coach.reminder.failed'));
    }
  };

  const dismiss = async (): Promise<void> => {
    try {
      await session.dismissReminder(messageId, index);
    } catch (error) {
      console.error('A reminder card could not be dismissed', error);
      toast.show(t('coach.reminder.failed'));
    }
  };

  const openSettings = (event: MouseEvent<HTMLAnchorElement>): void => {
    event.preventDefault();
    router.navigate(TRACKING_ROUTE);
  };

  return (
    <section
      className={styles.reminderCard}
      aria-label={t('coach.reminder.label', { text: card.text })}
      data-ui="coach.reminderCard"
      data-status={added ? 'added' : 'proposed'}
    >
      <div className={styles.reminderHead}>
        <span className={styles.reminderIcon} aria-hidden="true">
          <Icon name="clock" size={18} />
        </span>
        <div className={styles.reminderWords}>
          <p className={styles.reminderText} data-ui="coach.reminderCard.text">
            {card.text}
          </p>
          <p className={styles.reminderWhen} data-ui="coach.reminderCard.when">
            {reminderTiming(card)}
          </p>
        </div>
      </div>
      {added ? (
        <div className={styles.reminderDone}>
          <p className={styles.reminderAdded} data-ui="coach.reminderCard.added">
            <Icon name="check" size={16} />
            {t('coach.reminder.added')}
          </p>
          {notificationsOn ? null : (
            <p className={styles.reminderNote} data-ui="coach.reminderCard.off">
              {t('coach.reminder.notificationsOff')}
            </p>
          )}
          <a
            className={styles.reminderLink}
            href={routeHash(TRACKING_ROUTE)}
            onClick={openSettings}
            data-ui="coach.reminderCard.settings"
          >
            {t('coach.reminder.settings')}
          </a>
        </div>
      ) : (
        <>
          {problem === null ? null : (
            <p role="alert" className={styles.reminderProblem} data-ui="coach.reminderCard.problem">
              {t(problemKey(problem))}
            </p>
          )}
          <div className={styles.reminderActions}>
            <Button variant="quiet" onClick={dismiss} data-ui="coach.reminderCard.dismiss">
              {t('coach.reminder.dismiss')}
            </Button>
            <Button variant="primary" onClick={add} data-ui="coach.reminderCard.add">
              {t('coach.reminder.add')}
            </Button>
          </div>
        </>
      )}
    </section>
  );
}

interface SetReminderProps extends ReminderCardProps {
  /** The settings as read; null until they are. */
  readonly settings: Pick<Settings, (typeof SETTINGS)[number]> | null;
  readonly notificationsOn: boolean;
}

/**
 * A reminder the Coach set itself (P17, D-16.102): as it stands in Your reminders (an edit shows
 * here), "Reminder set", Undo (the reminder goes, and the card waits for Add again) and Edit (its
 * own editor, while it is still kept).
 */
function SetReminder({ messageId, index, card, settings, notificationsOn }: SetReminderProps) {
  const { coachSession, customReminders } = useServices();
  const toast = useToast();
  const ids = useId();
  const editor = useSheet(`reminder-${card.reminderId ?? ''}`);
  const kept = settings?.['remind.custom'].find((each) => each.id === card.reminderId);
  const shown = kept ?? card;

  const undo = async (): Promise<void> => {
    try {
      await coachSession?.undoReminder(messageId, index);
    } catch (error) {
      console.error('A reminder could not be taken back', error);
      toast.show(t('coach.reminder.failed'));
    }
  };

  return (
    <section
      className={styles.reminderCard}
      aria-labelledby={`${ids}-set ${ids}-text`}
      data-ui="coach.reminderCard"
      data-status="set"
    >
      <div className={styles.reminderHead}>
        <span className={styles.reminderIcon} aria-hidden="true">
          <Icon name="clock" size={18} />
        </span>
        <div className={styles.reminderWords}>
          <p id={`${ids}-text`} className={styles.reminderText} data-ui="coach.reminderCard.text">
            {shown.text}
          </p>
          <p className={styles.reminderWhen} data-ui="coach.reminderCard.when">
            {reminderTiming(shown)}
          </p>
        </div>
      </div>
      <div className={styles.reminderDone}>
        <p id={`${ids}-set`} className={styles.reminderAdded} data-ui="coach.reminderCard.set">
          <Icon name="check" size={16} />
          {t('coach.reminder.set')}
        </p>
        {notificationsOn || settings === null ? null : (
          <p className={styles.reminderNote} data-ui="coach.reminderCard.off">
            {t('coach.reminder.notificationsOff')}
          </p>
        )}
      </div>
      <div className={styles.reminderActions}>
        <Button variant="quiet" onClick={undo} data-ui="coach.reminderCard.undo">
          {t('coach.reminder.undo')}
        </Button>
        {kept && customReminders ? (
          <Button variant="secondary" onClick={editor.show} data-ui="coach.reminderCard.edit">
            {t('common.edit')}
          </Button>
        ) : null}
      </div>
      <Suspense fallback={null}>
        {editor.open && kept && customReminders && settings ? (
          <ReminderSheet
            reminder={kept}
            weekStart={settings['display.weekStart']}
            service={customReminders}
            allowed={() => Promise.resolve(true)}
            onClose={editor.close}
            onDeleted={() => toast.show(t('reminders.yours.deleted'))}
          />
        ) : null}
      </Suspense>
    </section>
  );
}
