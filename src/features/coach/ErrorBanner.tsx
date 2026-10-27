import { useId, useState } from 'react';
import { FAILURE_KINDS, failureMessages, type SingleFailure } from '../../ai/errors';
import { t } from '../../i18n/t';
import { Button } from '../../ui/Button';
import { Icon } from '../../ui/icons';
import styles from './coach.module.css';

/**
 * The kind to explain a stored failure with. Kinds this build does not know (a mark left by
 * another version), a cancel (never stored, never shown) and both-failed (which needs the
 * provider names the mark does not keep) read as the generic failure.
 */
function shownKind(kind: string): SingleFailure['kind'] {
  const known = (FAILURE_KINDS as readonly string[]).includes(kind);
  if (!known || kind === 'cancelled' || kind === 'bothFailed') return 'generic';
  return kind as SingleFailure['kind'];
}

/** The friendly lines for a stored failure kind, in reading order (never the provider's text). */
export function failureLines(kind: string): string[] {
  return failureMessages({ kind: shownKind(kind) }).map((message) =>
    t(message.key, message.params),
  );
}

export interface ErrorBannerProps {
  /** The failure kind stored on the question (`AiFailure.kind`). */
  readonly kind: string;
  /** The provider's own message, keys already cut out; no Details without it. */
  readonly details?: string;
  /** A reply is on its way: Retry waits. */
  readonly pending: boolean;
  readonly onRetry: () => void;
}

/**
 * What went wrong with the newest question (P08-10, D-16.31): a warning, our message for the
 * failure's kind, the provider's own words behind Details, and Retry, which asks the same question
 * again without storing it twice. It sits inline at the end of the conversation.
 */
export function ErrorBanner({ kind, details, pending, onRetry }: ErrorBannerProps) {
  const detailsId = useId();
  const [open, setOpen] = useState(false);
  const detail = details?.trim() ?? '';

  return (
    <div className={styles.banner} data-ui="coach.error" data-kind={kind}>
      <div role="alert" className={styles.bannerMessage}>
        <Icon name="warning" size={18} className={styles.bannerIcon} />
        <div className={styles.bannerLines}>
          {failureLines(kind).map((line, index) => (
            <p key={index} className={styles.bannerLine}>
              {line}
            </p>
          ))}
        </div>
      </div>
      {open && detail !== '' ? (
        <p id={detailsId} className={styles.bannerDetails} data-ui="coach.details.text">
          {detail}
        </p>
      ) : null}
      <div className={styles.bannerActions}>
        {detail === '' ? null : (
          <Button
            variant="quiet"
            aria-expanded={open}
            aria-controls={open ? detailsId : undefined}
            onClick={() => setOpen((shown) => !shown)}
            data-ui="coach.details"
          >
            {t('coach.error.details')}
          </Button>
        )}
        <Button variant="secondary" disabled={pending} onClick={onRetry} data-ui="coach.retry">
          {t('common.retry')}
        </Button>
      </div>
    </div>
  );
}
