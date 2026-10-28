import { useRef, useState, type FormEvent } from 'react';
import type { CoachChat } from '../../domain/model';
import { t } from '../../i18n/t';
import { useServices } from '../../services/context';
import { Button } from '../../ui/Button';
import { Field } from '../../ui/Field';
import { Sheet } from '../../ui/Sheet';
import { useToast } from '../../ui/Toast';
import styles from './coach.module.css';

export interface RenameChatSheetProps {
  readonly chat: CoachChat;
  /** After Cancel, and after Save has stored the name (or said why not). */
  readonly onClose: () => void;
}

/**
 * The longest name the field takes: the store's `CHAT_TITLE_MAX` (src/domain/coach/chats.ts),
 * written here because importing that module into this lazy sheet makes the bundler split it out
 * of the start-up chunk into a file of its own; a test keeps the two equal.
 */
export const NAME_MAX = 60;

/** The words as they would be stored: on one line, trimmed. */
function oneLine(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/**
 * Rename (P16-03, D-16.99): a short sheet with the chat's name in a field, focused. Save is on
 * once the field holds words that differ from the name; the person's name then stays, whatever
 * is asked in the chat later. A name that could not be stored is said in a toast. Loaded when it
 * is first opened.
 */
export function RenameChatSheet({ chat, onClose }: RenameChatSheetProps) {
  const { coachSession } = useServices();
  const toast = useToast();
  const fieldRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState(chat.title);
  const words = oneLine(text);
  const ready = words !== '' && words !== chat.title;

  const save = async (): Promise<void> => {
    try {
      const renamed = await coachSession?.renameChat(chat.id, words);
      if (!renamed) toast.show(t('coach.chats.renameFailed'));
    } catch {
      toast.show(t('coach.chats.renameFailed'));
    }
    onClose();
  };

  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (ready) void save();
  };

  return (
    <Sheet
      open
      title={t('coach.chats.renameTitle')}
      onClose={onClose}
      initialFocus={fieldRef}
      data-ui="coach.chats.renameSheet"
      leading={
        <Button variant="quiet" onClick={onClose} data-ui="coach.chats.renameSheet.cancel">
          {t('common.cancel')}
        </Button>
      }
      trailing={
        <Button
          variant="primary"
          disabled={!ready}
          onClick={save}
          data-ui="coach.chats.renameSheet.save"
        >
          {t('common.save')}
        </Button>
      }
    >
      <form className={styles.renameForm} onSubmit={submit}>
        <Field
          ref={fieldRef}
          label={t('coach.chats.name')}
          value={text}
          onChange={setText}
          maxLength={NAME_MAX}
          autoComplete="off"
          enterKeyHint="done"
          data-ui="coach.chats.renameSheet.field"
        />
      </form>
    </Sheet>
  );
}
