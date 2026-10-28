import { useRef, type MouseEvent } from 'react';
import type { CoachMessage } from '../../domain/model';
import { t } from '../../i18n/t';
import type { CheckIn } from '../../services/coach/checkIns';
import { Icon } from '../../ui/icons';
import { AssistantBadge, Bubble } from './Bubble';
import styles from './coach.module.css';
import { ErrorBanner } from './ErrorBanner';
import { useFollowEnd } from './followEnd';
import { TypingDots } from './TypingDots';

export interface MessageListProps {
  /** The stored conversation, oldest first. */
  readonly messages: readonly CoachMessage[];
  /** A reply is on its way: the dots show and the banner waits. */
  readonly pending: boolean;
  /** Asks a failed question again. */
  readonly onRetry: (id: string) => void;
  /** How much of the screen the on-screen keyboard covers; the list follows the end when it moves. */
  readonly keyboardInset: number;
  /** The waiting check-ins, by the reply that set them (P17). */
  readonly checkIns?: ReadonlyMap<string, readonly CheckIn[]>;
}

/** The newest message when it is a question whose turn failed, and nothing is pending. */
function failedQuestion(messages: readonly CoachMessage[], pending: boolean): CoachMessage | null {
  const newest = messages[messages.length - 1];
  if (pending || newest === undefined) return null;
  return newest.role === 'user' && newest.state?.status === 'failed' ? newest : null;
}

/**
 * The conversation (P08-10): every message as a bubble, then the typing dots while a reply is on
 * its way, then the banner when the newest question failed. It is a polite log: replies arrive
 * whole, so each is announced once. It opens at the newest message and follows what arrives while
 * the person is at the end (or within 80 px of it); once they scroll up to read it stays put and
 * "Jump to latest" floats over its bottom edge with the count of new messages (P13). Their own
 * question always brings the end back.
 */
export function MessageList({
  messages,
  pending,
  onRetry,
  keyboardInset,
  checkIns,
}: MessageListProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const threadRef = useRef<HTMLDivElement>(null);
  const failed = failedQuestion(messages, pending);
  const { away, unseen, jump } = useFollowEnd({
    listRef,
    threadRef,
    messages,
    pending,
    keyboardInset,
  });

  const jumpPressed = (event: MouseEvent<HTMLButtonElement>): void => {
    // The page lets go of the field on a tap in the conversation; this tap keeps the keyboard.
    event.stopPropagation();
    jump();
  };

  return (
    <div className={styles.listFrame}>
      <div
        ref={listRef}
        role="log"
        aria-live="polite"
        aria-relevant="additions"
        aria-label={t('coach.page.conversation')}
        className={styles.list}
        data-ui="coach.list"
      >
        <div ref={threadRef} className={styles.thread}>
          {messages.map((message) => (
            <Bubble key={message.id} message={message} checkIns={checkIns?.get(message.id)} />
          ))}
          {pending ? (
            <div className={styles.assistantRow}>
              <AssistantBadge />
              <div className={styles.typingBubble}>
                <TypingDots />
              </div>
            </div>
          ) : null}
          {failed?.state ? (
            <ErrorBanner
              key={failed.id}
              kind={failed.state.kind}
              details={failed.state.details}
              pending={pending}
              onRetry={() => onRetry(failed.id)}
            />
          ) : null}
        </div>
      </div>
      {away ? (
        <button
          type="button"
          className={styles.jump}
          aria-label={
            unseen > 0 ? t('coach.jump.labelWithCount', { count: unseen }) : t('coach.jump.label')
          }
          onClick={jumpPressed}
          data-ui="coach.jumpLatest"
          data-unseen={unseen}
        >
          <Icon name="chevronDown" size={18} />
          <span aria-hidden="true">{t('coach.jump.label')}</span>
          {unseen > 0 ? (
            <span className={styles.jumpCount} aria-hidden="true">
              {t('coach.jump.count', { count: unseen })}
            </span>
          ) : null}
        </button>
      ) : null}
    </div>
  );
}
