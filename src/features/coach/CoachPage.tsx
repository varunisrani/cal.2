import { t } from '../../i18n/t';
import styles from './coach.module.css';

/** The Coach tab: a titled placeholder until P08 builds the chat. */
export function CoachPage() {
  return (
    <section className={styles.page} data-ui="screen.coach">
      <h1 className={styles.title}>{t('common.tabs.coach')}</h1>
    </section>
  );
}
