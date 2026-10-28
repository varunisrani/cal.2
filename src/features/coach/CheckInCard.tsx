import { dayKeyOf } from '../../domain/dates/dayKey';
import { formatDay, formatTime } from '../../i18n/format';
import { t } from '../../i18n/t';
import type { CheckIn } from '../../services/coach/checkIns';
import { useOptionalServices } from '../../services/context';
import { Button } from '../../ui/Button';
import { Icon } from '../../ui/icons';
import { useToast } from '../../ui/Toast';
import styles from './coach.module.css';

/** When a check-in comes, in the person's locale: "Thu, Oct 29, 7:00 PM". */
export function checkInWhen(at: number): string {
  return `${formatDay(dayKeyOf(at), 'weekday')}, ${formatTime(at)}`;
}

/**
 * A check-in the Coach scheduled, under the reply that set it (P17, D-16.102): its message, when
 * it comes, and Cancel. It shows while the check-in waits: once cancelled (here or in Settings) or
 * once it came, it is gone, and the message itself is then in the chat.
 */
export function CheckInCard({ checkIn }: { readonly checkIn: CheckIn }) {
  const notify = useOptionalServices()?.notify;
  const toast = useToast();
  if (!notify) return null;
  const when = t('coach.checkIn.set', { when: checkInWhen(checkIn.at) });

  const cancel = async (): Promise<void> => {
    try {
      await notify.cancelCheckIn(checkIn.id);
    } catch (error) {
      console.error('A check-in could not be cancelled', error);
      toast.show(t('reminders.settings.saveFailed'));
    }
  };

  return (
    <section className={styles.reminderCard} aria-label={when} data-ui="coach.checkInCard">
      <div className={styles.reminderHead}>
        <span className={styles.reminderIcon} aria-hidden="true">
          <Icon name="chat" size={18} />
        </span>
        <div className={styles.reminderWords}>
          <p className={styles.reminderText} data-ui="coach.checkInCard.text">
            {checkIn.text}
          </p>
          <p className={styles.reminderWhen} data-ui="coach.checkInCard.when">
            {when}
          </p>
        </div>
      </div>
      <div className={styles.reminderActions}>
        <Button variant="quiet" onClick={cancel} data-ui="coach.checkInCard.cancel">
          {t('common.cancel')}
        </Button>
      </div>
    </section>
  );
}
