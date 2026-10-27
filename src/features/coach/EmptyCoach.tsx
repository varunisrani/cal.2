import { t } from '../../i18n/t';
import { Icon } from '../../ui/icons';
import { ChipRow } from './ChipRow';
import type { CoachChip } from './chips';
import styles from './coach.module.css';

export interface EmptyCoachProps {
  readonly chips: readonly CoachChip[];
  readonly pending: boolean;
  /** The photo waiting in the composer: a card sends it too (D-16.33). */
  readonly photo: Blob | null;
  readonly onSend: (text: string, photo?: Blob) => unknown;
  readonly onPhotoUsed: () => void;
}

/**
 * The chat before the first message (P08-10): a round chat mark, a title, one sentence on what
 * the Coach can see, and up to four suggested questions as cards in two columns. A card sends at
 * once; every card waits while a reply is on its way.
 */
export function EmptyCoach({ chips, pending, photo, onSend, onPhotoUsed }: EmptyCoachProps) {
  return (
    <div className={styles.empty} data-ui="coach.empty">
      <span className={styles.hero} aria-hidden="true">
        <Icon name="chat" size={40} />
      </span>
      <h2 className={styles.emptyTitle}>{t('coach.empty.title')}</h2>
      <p className={styles.emptyLead}>{t('coach.empty.lead')}</p>
      <div className={styles.cards}>
        <ChipRow
          chips={chips}
          layout="cards"
          pending={pending}
          photo={photo}
          onSend={onSend}
          onPhotoUsed={onPhotoUsed}
        />
      </div>
    </div>
  );
}
