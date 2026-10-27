import { useRef, useState, useSyncExternalStore, type CSSProperties } from 'react';
import { useCoachMessages } from '../../data/hooks';
import { t } from '../../i18n/t';
import type { CoachSession } from '../../services/coach/session';
import { useServices } from '../../services/context';
import { IconButton } from '../../ui/Button';
import { Dialog } from '../../ui/Dialog';
import { Icon } from '../../ui/icons';
import { useToast } from '../../ui/Toast';
import { ChipRow } from './ChipRow';
import { useCoachChips } from './chips';
import styles from './coach.module.css';
import { Composer, EMPTY_DRAFT, type CoachDraft } from './Composer';
import { EmptyCoach } from './EmptyCoach';
import { useKeyboardInset } from './keyboard';
import { MessageList } from './MessageList';

function useCoachSession(): CoachSession {
  const { coachSession } = useServices();
  if (!coachSession) throw new Error('CoachPage: no coach session above it');
  return coachSession;
}

/**
 * The Coach tab (P08-10, 04 §3.1): a heading with Clear chat, then the empty chat's suggested
 * questions or the conversation, the suggested questions in a row once there are messages, and
 * the composer (P08-11). Only the conversation scrolls: the heading and the composer stay put,
 * the composer above the tab bar, or with the on-screen keyboard open just above it (P13). The
 * reply in flight lives in the app's coach session, so it survives switching tabs; the messages
 * come from storage, live.
 */
export function CoachPage() {
  const session = useCoachSession();
  const { pending } = useSyncExternalStore(session.subscribe, session.getState);
  const messages = useCoachMessages();
  const chips = useCoachChips();
  const toast = useToast();
  const keyboardInset = useKeyboardInset();
  const fieldRef = useRef<HTMLTextAreaElement>(null);
  const [draft, setDraft] = useState<CoachDraft>(EMPTY_DRAFT);
  const [photoProblem, setPhotoProblem] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const conversation = messages.status === 'ready' ? messages.value : null;
  const hasMessages = conversation !== null && conversation.length > 0;

  /**
   * Asks a question. When nothing was sent (the photo could not be read, or a turn was already
   * running) what the send took comes back: the photo unless another one was attached meanwhile,
   * and typed words into a field that is still empty.
   */
  const ask = async (text: string, photo: Blob | undefined, typed: boolean): Promise<void> => {
    setPhotoProblem(false);
    const outcome = await session.send(text, photo);
    if (outcome !== 'photoUnreadable' && outcome !== 'ignored') return;
    if (outcome === 'photoUnreadable') setPhotoProblem(true);
    setDraft((now) => ({
      text: typed && now.text === '' ? text : now.text,
      photo: now.photo ?? photo ?? null,
    }));
  };

  const sendDraft = (text: string, photo?: Blob): void => {
    setDraft(EMPTY_DRAFT);
    void ask(text, photo, true);
  };

  const sendChip = (text: string, photo?: Blob): void => {
    void ask(text, photo, false);
  };

  const dropPhoto = (): void => setDraft((now) => ({ ...now, photo: null }));

  const releaseField = (): void => fieldRef.current?.blur();

  const changeDraft = (next: CoachDraft): void => {
    if (next.photo !== draft.photo) setPhotoProblem(false);
    setDraft(next);
  };

  const clear = async (): Promise<void> => {
    try {
      await session.reset();
    } catch {
      toast.show(t('coach.page.resetFailed'));
    } finally {
      setConfirming(false);
    }
  };

  const keyboardStyle =
    keyboardInset > 0 ? ({ '--coach-keyboard': `${keyboardInset}px` } as CSSProperties) : undefined;

  return (
    <section
      className={styles.page}
      style={keyboardStyle}
      aria-busy={messages.status === 'loading' || undefined}
      data-keyboard={keyboardInset > 0 ? 'open' : undefined}
      data-ui="screen.coach"
    >
      <header className={styles.header}>
        <h1 className={styles.title}>{t('common.tabs.coach')}</h1>
        <IconButton
          label={t('coach.page.reset')}
          icon={<Icon name="trash" size={20} />}
          disabled={!hasMessages}
          onClick={() => setConfirming(true)}
          data-ui="coach.reset"
        />
      </header>
      {/* A drag or a tap here (not a scroll the page makes) closes the on-screen keyboard. */}
      <div className={styles.body} onTouchMove={releaseField} onClick={releaseField}>
        {messages.status === 'error' ? (
          <p className={styles.unreadable} data-ui="coach.unreadable">
            {t('coach.page.unreadable')}
          </p>
        ) : conversation === null ? null : hasMessages ? (
          <MessageList
            messages={conversation}
            pending={pending}
            onRetry={(id) => void session.retry(id)}
            keyboardInset={keyboardInset}
          />
        ) : (
          <EmptyCoach
            chips={chips}
            pending={pending}
            photo={draft.photo}
            onSend={sendChip}
            onPhotoUsed={dropPhoto}
          />
        )}
      </div>
      <div className={styles.dock}>
        {hasMessages ? (
          <div className={styles.chipRow}>
            <ChipRow
              chips={chips}
              pending={pending}
              photo={draft.photo}
              onSend={sendChip}
              onPhotoUsed={dropPhoto}
            />
          </div>
        ) : null}
        <Composer
          draft={draft}
          onDraftChange={changeDraft}
          pending={pending}
          onSend={sendDraft}
          photoProblem={photoProblem}
          fieldRef={fieldRef}
        />
      </div>
      <Dialog
        open={confirming}
        title={t('coach.page.confirm.title')}
        message={t('coach.page.confirm.message')}
        confirmLabel={t('coach.page.confirm.clear')}
        destructive
        onConfirm={clear}
        onCancel={() => setConfirming(false)}
        data-ui="coach.resetDialog"
      />
    </section>
  );
}
