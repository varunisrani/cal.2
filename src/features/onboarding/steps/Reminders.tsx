import { t, type TKey } from '../../../i18n/t';
import { isHealthAvailable } from '../../../services/health/platform';
import { Button } from '../../../ui/Button';
import { Icon } from '../../../ui/icons';
import styles from '../onboarding.module.css';
import {
  reminderAnswerOf,
  type AskNotifications,
  type PermissionReply,
  type ReminderAnswer,
} from '../wizard';
import { StepHeader } from './StepHeader';
import type { StepProps } from './stepProps';

const ANSWER_KEYS: Readonly<Record<ReminderAnswer, TKey>> = {
  granted: 'onboarding.reminders.granted',
  denied: 'onboarding.reminders.denied',
  dismissed: 'onboarding.reminders.dismissed',
  unsupported: 'onboarding.reminders.unsupported',
};

/**
 * The line for an answer. The Android app's page has no notifications at all, so there the
 * browser's advice (add it to the home screen) cannot help, and the line says so instead.
 */
function answerKey(answer: ReminderAnswer): TKey {
  return answer === 'unsupported' && isHealthAvailable()
    ? 'onboarding.reminders.unsupportedAndroid'
    : ANSWER_KEYS[answer];
}

/**
 * Inside the Android app, whose page has no notifications (probed as the route asks), there is
 * nothing to turn on: the step offers no button. A browser keeps it, with or without them.
 */
function appWithoutNotifications(): boolean {
  return isHealthAvailable() && typeof Notification === 'undefined';
}

export interface RemindersProps extends StepProps {
  /** Asks the browser for notification permission. */
  readonly requestNotifications: AskNotifications;
}

/**
 * Step 9 (D-16.15): what meal reminders do and a button that asks the browser for permission.
 * Only a grant turns reminders on; a block says how to allow them later, and Continue skips the
 * step. Nothing is scheduled here. Inside the Android app without notifications the button is
 * left out and the line says reminders are not available there yet.
 */
export function Reminders({ state, dispatch, requestNotifications }: RemindersProps) {
  const ask = async (): Promise<void> => {
    let reply: PermissionReply;
    try {
      reply = await requestNotifications();
    } catch {
      // A browser without the API can throw instead of answering.
      reply = 'unsupported';
    }
    dispatch({ type: 'remindersAnswered', answer: reminderAnswerOf(reply) });
  };

  const answer = state.reminders;
  const unavailable = appWithoutNotifications();
  // Asking again only helps when the last prompt was closed without a choice.
  const canAsk = !unavailable && (answer === null || answer === 'dismissed');
  let line: TKey;
  if (answer !== null) line = answerKey(answer);
  else if (unavailable) line = 'onboarding.reminders.unsupportedAndroid';
  else line = 'onboarding.reminders.skip';
  return (
    <>
      <StepHeader
        title={t('onboarding.reminders.title')}
        subtitle={t('onboarding.reminders.body')}
      />
      <div className={styles.confirm}>
        <Icon name="clock" size={48} className={styles.tourIcon} />
      </div>
      {canAsk ? (
        <Button variant="secondary" block data-ui="wizard.reminders.ask" onClick={ask}>
          {t('onboarding.reminders.ask')}
        </Button>
      ) : null}
      <p className={styles.note} role="status" data-ui="wizard.reminders.status">
        {t(line)}
      </p>
    </>
  );
}
