import { useId } from 'react';
import { t } from '../../i18n/t';
import { Icon } from '../../ui/icons';
import styles from './readings.module.css';

/**
 * The row on Progress that opens Progress › Spending (D-16.108): a mark, "Spending", a word on
 * what it holds, and a chevron. The button holds only the name, so its name is all the text it
 * shows; its hit area and focus ring cover the whole row, and the line under it describes it.
 */
export function SpendingLink({ onOpen }: { readonly onOpen: () => void }) {
  const detailId = `${useId()}-detail`;
  return (
    <div className={styles.link}>
      <span className={styles.linkIcon} aria-hidden="true">
        <Icon name="chart" size={18} />
      </span>
      <span className={styles.linkText}>
        <button
          type="button"
          className={styles.linkButton}
          aria-describedby={detailId}
          data-ui="spending.link"
          onClick={onOpen}
        >
          <span className={styles.linkTitle}>{t('spending.title')}</span>
        </button>
        <span id={detailId} className={styles.linkDetail}>
          {t('spending.link')}
        </span>
      </span>
      <Icon name="chevronRight" size={18} className={styles.chevron} />
    </div>
  );
}
