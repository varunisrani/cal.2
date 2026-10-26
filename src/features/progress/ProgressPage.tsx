import { t } from '../../i18n/t';
import styles from './progress.module.css';

/** The Progress tab: a titled placeholder until P07 builds the recap, charts and histories. */
export function ProgressPage() {
  return (
    <section className={styles.page} data-ui="screen.progress">
      <h1 className={styles.title}>{t('common.tabs.progress')}</h1>
    </section>
  );
}
