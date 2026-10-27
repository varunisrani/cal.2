import { useEffect, useRef } from 'react';
import type { CoachMessage } from '../../domain/model';
import { t } from '../../i18n/t';
import { AssistantBadge, Bubble } from './Bubble';
import styles from './coach.module.css';
import { ErrorBanner } from './ErrorBanner';
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
}

/** The newest message when it is a question whose turn failed, and nothing is pending. */
function failedQuestion(messages: readonly CoachMessage[], pending: boolean): CoachMessage | null {
  const newest = messages[messages.length - 1];
  if (pending || newest === undefined) return null;
  return newest.role === 'user' && newest.state?.status === 'failed' ? newest : null;
}

/** This close to the bottom (px) still counts as reading the end of the conversation. */
export const END_SLACK_PX = 24;

/**
 * The conversation (P08-10): every message as a bubble, then the typing dots while a reply is on
 * its way, then the banner when the newest question failed. It scrolls itself to the end when a
 * message arrives, when a reply starts and when the keyboard opens or closes; the first time at
 * once, later smoothly. While the person is at the end it stays there when the list gets shorter
 * (the field grows, a photo is attached) or its content taller (Details opens).
 */
export function MessageList({ messages, pending, onRetry, keyboardInset }: MessageListProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const threadRef = useRef<HTMLDivElement>(null);
  const failed = failedQuestion(messages, pending);

  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    list.scrollTop = list.scrollHeight;
    // From now on the jumps glide (unless motion is reduced, see the stylesheet).
    list.dataset.settled = '';
  }, [messages.length, pending, keyboardInset]);

  useEffect(() => {
    const list = listRef.current;
    const thread = threadRef.current;
    if (!list || !thread || typeof ResizeObserver !== 'function') return undefined;
    let atEnd = true;
    const onScroll = (): void => {
      atEnd = list.scrollHeight - list.clientHeight - list.scrollTop <= END_SLACK_PX;
    };
    const observer = new ResizeObserver(() => {
      if (atEnd) list.scrollTop = list.scrollHeight;
    });
    observer.observe(list);
    observer.observe(thread);
    list.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      observer.disconnect();
      list.removeEventListener('scroll', onScroll);
    };
  }, []);

  return (
    <div
      ref={listRef}
      role="log"
      aria-label={t('coach.page.conversation')}
      className={styles.list}
      data-ui="coach.list"
    >
      <div ref={threadRef} className={styles.thread}>
        {messages.map((message) => (
          <Bubble key={message.id} message={message} />
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
  );
}
