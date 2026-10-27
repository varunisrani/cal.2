import {
  useLayoutEffect,
  useRef,
  type ChangeEvent,
  type KeyboardEvent,
  type RefObject,
} from 'react';
import { t } from '../../i18n/t';
import { IconButton } from '../../ui/Button';
import { Icon } from '../../ui/icons';
import { Menu, type MenuAction } from '../../ui/Menu';
import { useBlobUrl } from './Bubble';
import styles from './coach.module.css';

/** What the person is about to send: the words as typed and at most one photo. */
export interface CoachDraft {
  readonly text: string;
  readonly photo: Blob | null;
}

export const EMPTY_DRAFT: CoachDraft = Object.freeze({ text: '', photo: null });

/** Send is on when no reply is pending and there are words (not only spaces) or a photo. */
export function canSend(draft: CoachDraft, pending: boolean): boolean {
  return !pending && (draft.text.trim() !== '' || draft.photo !== null);
}

/**
 * Whether key presses come from a physical keyboard. Browsers do not say, so a mouse or trackpad
 * being present stands in for it; touch-only devices keep Enter as a new line.
 */
function physicalKeyboard(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(any-pointer: fine)').matches;
}

export interface ComposerProps {
  /** Held by the page, which the chips share it with. */
  readonly draft: CoachDraft;
  readonly onDraftChange: (draft: CoachDraft) => void;
  /** A reply is on its way: Send and the photo button wait; typing goes on. */
  readonly pending: boolean;
  /** Sends the draft as typed, with its photo when there is one. */
  readonly onSend: (text: string, photo?: Blob) => void;
  /** The last photo could not be read: says so until the next pick, remove or send. */
  readonly photoProblem?: boolean;
  /** The text field, for the page to take the focus away (a drag on the list). */
  readonly fieldRef?: RefObject<HTMLTextAreaElement | null>;
}

/**
 * Where the person writes to the Coach (P08-11): a rounded field that grows to five lines and
 * then scrolls, a button that adds one photo from the camera or the photo library (shown as a
 * thumbnail with a remove button; a new pick replaces it), and Send. With a physical keyboard
 * Enter sends and Shift+Enter starts a new line.
 */
export function Composer({
  draft,
  onDraftChange,
  pending,
  onSend,
  photoProblem = false,
  fieldRef,
}: ComposerProps) {
  const ownFieldRef = useRef<HTMLTextAreaElement>(null);
  const field = fieldRef ?? ownFieldRef;
  const cameraRef = useRef<HTMLInputElement>(null);
  const libraryRef = useRef<HTMLInputElement>(null);
  const preview = useBlobUrl(draft.photo);
  const ready = canSend(draft, pending);

  // The field is as tall as its text; the stylesheet caps it at five lines, then it scrolls.
  useLayoutEffect(() => {
    const element = field.current;
    if (!element) return;
    element.style.height = 'auto';
    if (element.scrollHeight > 0) element.style.height = `${element.scrollHeight}px`;
  }, [field, draft.text]);

  const send = (): void => {
    if (!ready) return;
    if (draft.photo) onSend(draft.text, draft.photo);
    else onSend(draft.text);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return;
    if (!physicalKeyboard()) return;
    event.preventDefault();
    send();
  };

  const picked = (event: ChangeEvent<HTMLInputElement>): void => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    // Cleared, so picking the same photo again still counts as a change.
    input.value = '';
    if (file) onDraftChange({ ...draft, photo: file });
  };

  const sources: MenuAction[] = [
    {
      kind: 'action',
      id: 'camera',
      label: t('coach.composer.camera'),
      icon: <Icon name="camera" size={20} />,
      onSelect: () => cameraRef.current?.click(),
    },
    {
      kind: 'action',
      id: 'library',
      label: t('coach.composer.library'),
      icon: <Icon name="photos" size={20} />,
      onSelect: () => libraryRef.current?.click(),
    },
  ];

  return (
    <div className={styles.composer} data-ui="coach.composer">
      {photoProblem ? (
        <p role="alert" className={styles.photoProblem} data-ui="coach.photoProblem">
          {t('coach.composer.photoUnreadable')}
        </p>
      ) : null}
      <div className={styles.capsule}>
        {draft.photo ? (
          <div className={styles.preview} data-ui="coach.preview">
            {preview ? (
              <img
                className={styles.previewImage}
                src={preview}
                alt={t('coach.composer.preview')}
              />
            ) : (
              <span
                className={styles.previewImage}
                role="img"
                aria-label={t('coach.composer.preview')}
              />
            )}
            <IconButton
              className={styles.previewRemove}
              label={t('coach.composer.remove')}
              icon={<Icon name="close" size={16} />}
              onClick={() => onDraftChange({ ...draft, photo: null })}
              data-ui="coach.preview.remove"
            />
          </div>
        ) : null}
        <div className={styles.inputRow}>
          <Menu
            label={t('coach.composer.attach')}
            icon={<Icon name={draft.photo ? 'photos' : 'plus'} size={22} />}
            hideLabel
            entries={sources}
            placement="above"
            triggerClassName={styles.attach}
            disabled={pending}
            data-ui="coach.attach"
          />
          <textarea
            ref={field}
            rows={1}
            className={styles.field}
            value={draft.text}
            placeholder={t('coach.composer.placeholder')}
            aria-label={t('coach.composer.label')}
            onChange={(event) => onDraftChange({ ...draft, text: event.target.value })}
            onKeyDown={onKeyDown}
            data-ui="coach.input"
          />
          <IconButton
            variant="primary"
            className={styles.send}
            label={t('coach.composer.send')}
            icon={<Icon name="chevronUp" size={20} />}
            disabled={!ready}
            onClick={send}
            data-ui="coach.send"
          />
        </div>
      </div>
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={picked}
        data-ui="coach.camera"
      />
      <input
        ref={libraryRef}
        type="file"
        accept="image/*"
        hidden
        onChange={picked}
        data-ui="coach.library"
      />
    </div>
  );
}
