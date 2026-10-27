import { t } from '../../i18n/t';
import { Icon } from '../../ui/icons';
import { CARD_CHIPS, type CoachChip } from './chips';
import styles from './chips.module.css';

export interface ChipRowProps {
  readonly chips: readonly CoachChip[];
  /**
   * `row` scrolls sideways under a conversation and shows every chip; `cards` is the empty
   * chat's two-column grid of the first four.
   */
  readonly layout?: 'row' | 'cards';
  /** While a reply is on its way every chip is disabled. */
  readonly pending: boolean;
  /** The photo waiting in the composer: a chip sends it too (D-16.33). */
  readonly photo?: Blob | null;
  /** Sends a chip's words as the person's question, with the waiting photo when there is one. */
  readonly onSend: (text: string, photo?: Blob) => unknown;
  /** Called after a chip took the waiting photo, so the composer can let go of it. */
  readonly onPhotoUsed?: () => void;
}

/** The Coach's suggested questions; a tap sends one at once (P08-12, R04.14). */
export function ChipRow({
  chips,
  layout = 'row',
  pending,
  photo,
  onSend,
  onPhotoUsed,
}: ChipRowProps) {
  const cards = layout === 'cards';
  const shown = cards ? chips.slice(0, CARD_CHIPS) : chips;
  if (shown.length === 0) return null;

  const send = (chip: CoachChip): void => {
    if (pending) return;
    if (photo) {
      onSend(chip.text, photo);
      onPhotoUsed?.();
    } else {
      onSend(chip.text);
    }
  };

  return (
    <div
      role="group"
      aria-label={t('coach.chips.label')}
      className={cards ? styles.cards : styles.row}
      data-ui={cards ? 'coach.cards' : 'coach.chips'}
    >
      {cards ? null : (
        <span className={styles.disc}>
          <Icon name="chat" size={16} />
        </span>
      )}
      {shown.map((chip, index) => (
        <button
          key={chip.id}
          type="button"
          className={cards ? styles.card : styles.chip}
          disabled={pending}
          onClick={() => send(chip)}
          data-ui={`${cards ? 'coach.card' : 'coach.chip'}.${index + 1}`}
          data-chip={chip.id}
        >
          {cards ? (
            <>
              <Icon name="chevronRight" size={14} className={styles.cardIcon} />
              <span className={styles.cardText}>{chip.text}</span>
            </>
          ) : (
            chip.text
          )}
        </button>
      ))}
    </div>
  );
}
