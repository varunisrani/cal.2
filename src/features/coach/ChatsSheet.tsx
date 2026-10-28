import { useToday } from '../../app/TodayProvider';
import { useCoachChatSummaries } from '../../data/hooks';
import type { CoachChat } from '../../domain/model';
import { t } from '../../i18n/t';
import { IconButton } from '../../ui/Button';
import { Icon } from '../../ui/icons';
import { Sheet } from '../../ui/Sheet';
import { chatName, lastUsed, preview } from './chatsList';
import styles from './coach.module.css';

export interface ChatsSheetProps {
  /** The chat on screen, marked in the list. */
  readonly openChatId: string | null;
  /** The chats with a reply on its way. */
  readonly waiting: readonly string[];
  readonly onClose: () => void;
  /** A tap on a chat: open it. */
  readonly onPick: (chat: CoachChat) => void;
  readonly onRename: (chat: CoachChat) => void;
  readonly onDelete: (chat: CoachChat) => void;
}

/**
 * The Chats list (P16-03, D-16.99), a sheet over the Coach: every stored chat, newest activity
 * first, with its name, when it was last used and the start of its last message, and "Replying…"
 * while a reply for it is on its way. The open chat is marked. A tap opens a chat; each row has
 * Rename and Delete. Loaded when it is first opened.
 */
export function ChatsSheet({
  openChatId,
  waiting,
  onClose,
  onPick,
  onRename,
  onDelete,
}: ChatsSheetProps) {
  const summaries = useCoachChatSummaries();
  const today = useToday();

  return (
    <Sheet open title={t('coach.page.chats')} onClose={onClose} data-ui="coach.chats">
      {summaries.status !== 'ready' ? null : summaries.value.length === 0 ? (
        <p className={styles.chatsEmpty} data-ui="coach.chats.empty">
          {t('coach.chats.empty')}
        </p>
      ) : (
        <ul className={styles.chatList} data-ui="coach.chats.list">
          {summaries.value.map(({ chat, last }) => {
            const name = chatName(chat);
            const replying = waiting.includes(chat.id);
            const current = chat.id === openChatId;
            return (
              <li
                key={chat.id}
                className={styles.chatItem}
                data-ui="coach.chats.item"
                data-current={current || undefined}
                data-waiting={replying || undefined}
              >
                <button
                  type="button"
                  className={styles.chatOpen}
                  aria-current={current || undefined}
                  onClick={() => onPick(chat)}
                  data-ui="coach.chats.item.open"
                >
                  <span className={styles.chatTop}>
                    <span className={styles.chatTitle} data-ui="coach.chats.item.title">
                      {name}
                    </span>
                    <span className={styles.chatWhen} data-ui="coach.chats.item.when">
                      {lastUsed(chat.updatedAt, today)}
                    </span>
                  </span>
                  <span className={styles.chatLine}>
                    {replying ? (
                      <span className={styles.chatWaiting} data-ui="coach.chats.item.waiting">
                        <span className={styles.chatDot} aria-hidden="true" />
                        {t('coach.chats.waiting')}
                      </span>
                    ) : null}
                    {last ? (
                      <span className={styles.chatLast} data-ui="coach.chats.item.last">
                        {preview(last.text)}
                      </span>
                    ) : null}
                  </span>
                </button>
                <IconButton
                  label={t('coach.chats.rename', { title: name })}
                  icon={<Icon name="pencil" size={18} />}
                  onClick={() => onRename(chat)}
                  data-ui="coach.chats.item.rename"
                />
                <IconButton
                  label={t('coach.chats.delete', { title: name })}
                  icon={<Icon name="trash" size={18} />}
                  onClick={() => onDelete(chat)}
                  data-ui="coach.chats.item.delete"
                />
              </li>
            );
          })}
        </ul>
      )}
    </Sheet>
  );
}
