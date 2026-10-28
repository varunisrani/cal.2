import {
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
} from 'react';
import { onDemand } from '../../app/onDemand';
import { useCoachChats, useCoachMessages, useSettings } from '../../data/hooks';
import type { CoachChat } from '../../domain/model';
import { t } from '../../i18n/t';
import { readCheckIns, type CheckIn } from '../../services/coach/checkIns';
import { coachScreen } from '../../services/coach/onScreen';
import type { CoachSession } from '../../services/coach/session';
import { useServices } from '../../services/context';
import { IconButton } from '../../ui/Button';
import { Dialog } from '../../ui/Dialog';
import { Icon } from '../../ui/icons';
import { useToast } from '../../ui/Toast';
import { ChipRow } from './ChipRow';
import { chatName, nextOpen, type OpenChat } from './chatsList';
import { useCoachChips } from './chips';
import styles from './coach.module.css';
import { Composer, EMPTY_DRAFT, type CoachDraft } from './Composer';
import { EmptyCoach } from './EmptyCoach';
import { useKeyboardInset } from './keyboard';
import { MessageList } from './MessageList';

// The Chats list and Rename are fetched the first time they open.
const ChatsSheet = onDemand(() => import('./ChatsSheet').then((module) => module.ChatsSheet));
const RenameChatSheet = onDemand(() =>
  import('./RenameChatSheet').then((module) => module.RenameChatSheet),
);

const NO_CHATS: readonly CoachChat[] = [];

const CHECK_INS = ['coach.checkIns'] as const;

/** The waiting check-ins by the reply that set them (P17, D-16.102). */
function useCheckIns(): ReadonlyMap<string, readonly CheckIn[]> {
  const stored = useSettings(CHECK_INS);
  const list = stored.status === 'ready' ? stored.value['coach.checkIns'] : null;
  return useMemo(() => {
    const byReply = new Map<string, CheckIn[]>();
    for (const checkIn of readCheckIns(list ?? [])) {
      if (checkIn.messageId === undefined) continue;
      byReply.set(checkIn.messageId, [...(byReply.get(checkIn.messageId) ?? []), checkIn]);
    }
    return byReply;
  }, [list]);
}

function useCoachSession(): CoachSession {
  const { coachSession } = useServices();
  if (!coachSession) throw new Error('CoachPage: no coach session above it');
  return coachSession;
}

/**
 * The Coach tab (P08-10, 04 §3.1; several chats since P16-03, D-16.99): a heading with the open
 * chat's name, New chat, Chats and Delete chat; then a new chat's suggested questions or the
 * conversation, the suggested questions in a row once there are messages, and the composer
 * (P08-11). The tab opens the most recent chat, or a new one when there is none. Only the
 * conversation scrolls: the heading and the composer stay put, the composer above the tab bar, or
 * with the on-screen keyboard open just above it (P13, P14). Replies in flight live in the app's
 * coach session, one per chat, so they survive switching tabs and chats, and the open chat's reply
 * shows as it is written (D-16.106); the messages come from storage, live. In the Android app (P17) the screen says which chat it shows, so a reply there is
 * not announced, opens the chat a notification's tap asked for, and shows the waiting check-ins
 * under the replies that set them.
 */
export function CoachPage() {
  const session = useCoachSession();
  // Two reads of the session: the waiting chats change with turns, the open chat's reply with
  // every piece of it, so the rest of the page is not drawn again for each word.
  const waiting = useSyncExternalStore(session.subscribe, () => session.getState().waiting);
  const chats = useCoachChats();
  const [open, setOpen] = useState<OpenChat | null>(null);
  const messages = useCoachMessages(open?.id ?? '');
  const chips = useCoachChips();
  const toast = useToast();
  const keyboardInset = useKeyboardInset();
  const fieldRef = useRef<HTMLTextAreaElement>(null);
  const [draft, setDraft] = useState<CoachDraft>(EMPTY_DRAFT);
  const [photoProblem, setPhotoProblem] = useState(false);
  const [listing, setListing] = useState(false);
  const [renaming, setRenaming] = useState<CoachChat | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  // Chats that cannot be read still let the person start new ones; those never show as stored.
  const stored =
    chats.status === 'ready' ? chats.value : chats.status === 'error' ? NO_CHATS : null;
  useEffect(() => {
    if (stored !== null) setOpen((now) => nextOpen(now, stored, session.newChatId));
  }, [stored, session]);

  // A tap on a reply's or a check-in's notification asked for its chat (P17).
  const asked = useSyncExternalStore(coachScreen.subscribe, coachScreen.asked);
  useEffect(() => {
    if (asked === null) return;
    coachScreen.take();
    setOpen({ id: asked, stored: true });
  }, [asked]);

  const chatId = open?.id ?? null;
  const checkIns = useCheckIns();
  useEffect(() => {
    coachScreen.show(chatId);
    return () => coachScreen.show(null);
  }, [chatId]);
  const openChat = open?.stored ? stored?.find((chat) => chat.id === open.id) : undefined;
  const pending = chatId !== null && waiting.includes(chatId);
  const live = useSyncExternalStore(session.subscribe, () =>
    chatId === null ? undefined : session.getState().live[chatId],
  );
  const conversation = chatId !== null && messages.status === 'ready' ? messages.value : null;
  const hasMessages = conversation !== null && conversation.length > 0;

  /**
   * Asks a question in the open chat. When nothing was sent (the photo could not be read, or a
   * turn was already running there) what the send took comes back: the photo unless another one
   * was attached meanwhile, and typed words into a field that is still empty.
   */
  const ask = async (text: string, photo: Blob | undefined, typed: boolean): Promise<void> => {
    if (chatId === null) return;
    setPhotoProblem(false);
    const outcome = await session.send(chatId, text, photo);
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

  const startNew = (): void => setOpen({ id: session.newChatId(), stored: false });

  const pick = (chat: CoachChat): void => {
    setListing(false);
    if (chat.id !== chatId) setOpen({ id: chat.id, stored: true });
  };

  // Rename is a sheet of its own: the list makes way for it and comes back after.
  const rename = (chat: CoachChat): void => {
    setListing(false);
    setRenaming(chat);
  };

  const renamed = (): void => {
    setRenaming(null);
    setListing(true);
  };

  const remove = async (): Promise<void> => {
    const id = deleting;
    if (id === null) return;
    try {
      await session.deleteChat(id);
      // The open chat went: a new one takes its place, as the empty chat after Clear chat did.
      if (id === chatId) startNew();
    } catch {
      toast.show(t('coach.page.deleteFailed'));
    } finally {
      setDeleting(null);
    }
  };

  const keyboardStyle =
    keyboardInset > 0 ? ({ '--coach-keyboard': `${keyboardInset}px` } as CSSProperties) : undefined;

  return (
    <section
      className={styles.page}
      style={keyboardStyle}
      aria-busy={chatId === null || messages.status === 'loading' || undefined}
      data-keyboard={keyboardInset > 0 ? 'open' : undefined}
      data-ui="screen.coach"
    >
      <header className={styles.header}>
        <div className={styles.heading}>
          <h1 className={styles.title}>{t('common.tabs.coach')}</h1>
          {chatId === null ? null : (
            <p className={styles.openChatName} data-ui="coach.chatTitle">
              {openChat ? chatName(openChat) : t('coach.page.newChat')}
            </p>
          )}
        </div>
        <div className={styles.actions}>
          <IconButton
            label={t('coach.page.newChat')}
            icon={<Icon name="plus" size={20} />}
            disabled={!open?.stored}
            onClick={startNew}
            data-ui="coach.chats.new"
          />
          <IconButton
            label={t('coach.page.chats')}
            icon={<Icon name="text" size={20} />}
            onClick={() => setListing(true)}
            data-ui="coach.chats.open"
          />
          {/* Delete chat keeps the hooks of Clear chat, which it replaces (P16-03). */}
          <IconButton
            label={t('coach.page.deleteChat')}
            icon={<Icon name="trash" size={20} />}
            disabled={!open?.stored}
            onClick={() => setDeleting(chatId)}
            data-ui="coach.reset"
          />
        </div>
      </header>
      {/* A drag or a tap here (not a scroll the page makes) closes the on-screen keyboard. */}
      <div className={styles.body} onTouchMove={releaseField} onClick={releaseField}>
        {messages.status === 'error' ? (
          <p className={styles.unreadable} data-ui="coach.unreadable">
            {t('coach.page.unreadable')}
          </p>
        ) : conversation === null ? null : hasMessages ? (
          <MessageList
            key={chatId}
            messages={conversation}
            pending={pending}
            live={live}
            onRetry={(id) => {
              if (chatId !== null) void session.retry(chatId, id);
            }}
            keyboardInset={keyboardInset}
            checkIns={checkIns}
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
      <Suspense fallback={null}>
        {listing ? (
          <ChatsSheet
            openChatId={chatId}
            waiting={waiting}
            onClose={() => setListing(false)}
            onPick={pick}
            onRename={rename}
            onDelete={(chat) => setDeleting(chat.id)}
          />
        ) : null}
        {renaming ? <RenameChatSheet chat={renaming} onClose={renamed} /> : null}
      </Suspense>
      <Dialog
        open={deleting !== null}
        title={t('coach.page.confirm.title')}
        message={t('coach.page.confirm.message')}
        confirmLabel={t('common.delete')}
        destructive
        onConfirm={remove}
        onCancel={() => setDeleting(null)}
        data-ui="coach.resetDialog"
      />
    </section>
  );
}
