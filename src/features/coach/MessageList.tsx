import { useRef, type MouseEvent } from 'react';
import type { CoachMessage } from '../../domain/model';
import { t } from '../../i18n/t';
import type { CheckIn } from '../../services/coach/checkIns';
import { Icon } from '../../ui/icons';
import { Bubble, PendingReply } from './Bubble';
import styles from './coach.module.css';
import { ErrorBanner } from './ErrorBanner';
import { useFollowEnd } from './followEnd';

export interface MessageListProps {
  /** The stored conversation, oldest first. */
  readonly messages: readonly CoachMessage[];
  /** A reply is on its way: the dots show and the banner waits. */
  readonly pending: boolean;
  /** The reply as far as it came while it streams in (D-16.106); undefined before its first word. */
  readonly live?: string;
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

/** The words of a reply streaming in, and the newest message when they began. */
interface Shown {
  readonly text: string;
  readonly since: string | undefined;
}

/**
 * The reply to show as it streams in. When its turn ends the session lets the words go a moment
 * before the stored reply (or the failure) comes back from storage; the words stay until then, so
 * the conversation never shrinks and grows again. A stored reply that comes back first shows in
 * their place.
 */
function useShownReply(
  live: string | undefined,
  pending: boolean,
  newest: CoachMessage | undefined,
  failed: boolean,
): string | undefined {
  // A ref, not state: kept from the last draw for the next, never a draw of its own.
  const shown = useRef<Shown | null>(null);
  if (live !== undefined) {
    shown.current = { text: live, since: shown.current?.since ?? newest?.id };
  } else if (pending || failed || shown.current?.since !== newest?.id) {
    shown.current = null;
  }
  const text = shown.current?.text;
  return newest?.role === 'assistant' && newest.text === text ? undefined : text;
}

/**
 * The conversation (P08-10): every message as a bubble, then the reply on its way (the typing
 * dots, then its words as they stream in, D-16.106), then the banner when the newest question
 * failed. It is a polite log of what is added: a reply is announced once, when it is stored, never
 * word by word. It opens at the newest message and follows what arrives, a growing reply included,
 * while the person is at the end (or within 80 px of it); once they scroll up to read it stays put
 * and "Jump to latest" floats over its bottom edge with the count of new messages (P13). Their own
 * question always brings the end back.
 */
export function MessageList({
  messages,
  pending,
  live,
  onRetry,
  keyboardInset,
  checkIns,
}: MessageListProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const threadRef = useRef<HTMLDivElement>(null);
  const failed = failedQuestion(messages, pending);
  const shown = useShownReply(live, pending, messages.at(-1), failed !== null);
  const { away, unseen, jump } = useFollowEnd({
    listRef,
    threadRef,
    messages,
    pending,
    live: shown,
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
          {pending || shown !== undefined ? <PendingReply text={shown} working={pending} /> : null}
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
