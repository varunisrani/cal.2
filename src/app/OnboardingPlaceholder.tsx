import { t } from '../i18n/t';
import styles from './shell.module.css';

/** What onboarding shows until the quick start (P04-09) takes its place: the app's name. */
export function OnboardingPlaceholder() {
  return (
    <main className={styles.onboarding} data-ui="screen.onboarding">
      <h1>{t('common.appName')}</h1>
    </main>
  );
}
