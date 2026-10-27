import { t } from '../../../i18n/t';
import { Icon } from '../../../ui/icons';
import styles from './scan.module.css';

/**
 * The review's line for a draft reopened from a saved label (02 §3.12, P06-17): the values come
 * from a label photographed earlier for this barcode, and deleting those entries forgets it. The
 * review (P06-06) shows it in its notice slot when the draft is `fromSavedLabel`.
 */
export function SavedLabelNotice() {
  return (
    <p className={styles.notice} role="note" data-ui="review.savedLabel">
      <Icon name="info" size={18} className={styles.noticeIcon} />
      <span>{t('scan.savedLabel')}</span>
    </p>
  );
}
