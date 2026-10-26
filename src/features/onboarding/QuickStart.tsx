import { currentLocale } from '../../i18n/locale';
import { t } from '../../i18n/t';
import { useServices } from '../../services/context';
import { Button } from '../../ui/Button';
import { useToast } from '../../ui/Toast';
import styles from './quickStart.module.css';

/**
 * The onboarding address until P05 builds the real onboarding (P05-07 deletes this file): the
 * app's name, one line, and a button that sets the person up with the first-run defaults. The
 * screen never navigates: once the profile and the done flag are stored, the boot gate moves the
 * app to Home.
 */
export function QuickStart() {
  const { onboarding, clock } = useServices();
  const toast = useToast();

  // The button stays busy until this settles, so a second press cannot start a second run.
  const start = async (): Promise<void> => {
    try {
      await onboarding.startWithDefaults(clock.now(), currentLocale());
    } catch (error) {
      console.error('Starting with the defaults failed', error);
      toast.show(t('onboarding.quickStart.failed'));
    }
  };

  return (
    <main className={styles.screen} data-ui="screen.onboarding">
      <div className={styles.panel}>
        <h1 className={styles.title}>{t('common.appName')}</h1>
        <p className={styles.lead}>{t('onboarding.quickStart.lead')}</p>
        <Button variant="primary" block data-ui="onboarding.start" onClick={start}>
          {t('onboarding.quickStart.start')}
        </Button>
      </div>
    </main>
  );
}
