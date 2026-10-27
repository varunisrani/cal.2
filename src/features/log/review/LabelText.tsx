import { Fragment } from 'react';
import { mentionsSensitivity } from '../../../domain/food/allergens';
import { labelPieces, labelWords } from '../../../domain/food/labelText';
import { t } from '../../../i18n/t';
import { cx } from '../../../ui/classes';
import { Icon } from '../../../ui/icons';
import styles from './product.module.css';

export interface LabelTextProps {
  /** The ingredient list, with `_x_` markers on the allergens the database flags. */
  readonly text: string;
  /** The profile's sensitivities: a list that names one gets the warning. */
  readonly sensitivities: readonly string[];
}

/**
 * The printed ingredient list as one paragraph (02 §3.13, v1-lite D23): the allergens the
 * database flags in bold; a warning icon and stronger text when it names one of the person's
 * sensitivities. Either kind of emphasis is announced to screen readers as a possible allergen,
 * since bold text is not read out.
 */
export function LabelText({ text, sensitivities }: LabelTextProps) {
  const pieces = labelPieces(text);
  const warned = mentionsSensitivity(labelWords(text), sensitivities);
  const flagged = warned || pieces.some((piece) => piece.allergen);
  return (
    <p className={cx(styles.label, warned && styles.labelWarned)} data-ui="review.product.label">
      {warned ? <Icon name="warning" size={16} className={styles.labelIcon} /> : null}
      {flagged ? <span className={styles.unseen}>{`${t('review.product.flagged')} `}</span> : null}
      {pieces.map((piece, index) => (
        <Fragment key={index}>
          {piece.allergen ? <strong className={styles.allergen}>{piece.text}</strong> : piece.text}
        </Fragment>
      ))}
    </p>
  );
}
