import { useEffect, useState } from 'react';
import type { CoachMessage } from '../../domain/model';
import { t } from '../../i18n/t';
import type { CheckIn } from '../../services/coach/checkIns';
import { Icon } from '../../ui/icons';
import { CheckInCard } from './CheckInCard';
import styles from './coach.module.css';
import { CopyButton } from './CopyButton';
import { MarkdownReply } from './markdown';
import { ReminderCard } from './ReminderCard';

/** An address for showing `blob` in an image while it is mounted; null without a blob. */
export function useBlobUrl(blob: Blob | null | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!blob) {
      setUrl(null);
      return undefined;
    }
    const made = URL.createObjectURL(blob);
    setUrl(made);
    return () => URL.revokeObjectURL(made);
  }, [blob]);

  return url;
}

/** The small round mark in front of everything the Coach says; decoration only. */
export function AssistantBadge() {
  return (
    <span className={styles.badge} aria-hidden="true">
      <Icon name="chat" size={14} />
    </span>
  );
}

/**
 * The photo that went with a question, on top of its bubble. Its frame shows from the first draw
 * (the address comes a moment later), so the conversation keeps its height; a photo that cannot
 * be drawn hides.
 */
function SentPhoto({ photo }: { readonly photo: Blob }) {
  const src = useBlobUrl(photo);
  const [broken, setBroken] = useState(false);
  if (broken) return null;
  if (src === null) return <span className={styles.sentPhoto} aria-hidden="true" />;
  return (
    <img
      className={styles.sentPhoto}
      src={src}
      alt={t('coach.photo')}
      onError={() => setBroken(true)}
      data-ui="coach.message.photo"
    />
  );
}

export interface BubbleProps {
  readonly message: CoachMessage;
  /** The waiting check-ins this reply set (P17). */
  readonly checkIns?: readonly CheckIn[];
}

/**
 * One message of the conversation (P08-10). The person's sit on the right in the accent colour,
 * their words exactly as typed, under the photo they attached. The Coach's sit on the left behind
 * a small badge, drawn from Markdown, with a button that copies the reply as written, and under
 * it a card for each reminder the reply proposed (P13), until the person dismisses it, and for each
 * check-in it set that still waits (P17).
 */
export function Bubble({ message, checkIns }: BubbleProps) {
  if (message.role === 'user') {
    return (
      <div className={styles.userRow} data-ui="coach.message" data-role="user">
        <div className={styles.userBubble}>
          {message.thumb ? <SentPhoto photo={message.thumb} /> : null}
          <p className={styles.userText}>{message.text}</p>
        </div>
      </div>
    );
  }
  return (
    <div className={styles.assistantRow} data-ui="coach.message" data-role="assistant">
      <AssistantBadge />
      <div className={styles.assistantColumn}>
        <div className={styles.assistantBubble}>
          <MarkdownReply text={message.text} />
          <CopyButton text={message.text} className={styles.copy} />
        </div>
        {message.reminders?.map((card, index) => (
          <ReminderCard key={index} messageId={message.id} index={index} card={card} />
        ))}
        {checkIns?.map((checkIn) => (
          <CheckInCard key={checkIn.id} checkIn={checkIn} />
        ))}
      </div>
    </div>
  );
}
