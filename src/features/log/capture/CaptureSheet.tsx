import { useEffect, useId, useRef, useState, type ChangeEvent } from 'react';
import { t, type TKey } from '../../../i18n/t';
import { MAX_CAPTURE_PHOTOS, type PickRefusal } from '../../../services/captureDrafts';
import { useServices } from '../../../services/context';
import { Button, IconButton } from '../../../ui/Button';
import { Dialog } from '../../../ui/Dialog';
import { Icon } from '../../../ui/icons';
import { Sheet } from '../../../ui/Sheet';
import { Switch } from '../../../ui/Switch';
import styles from './capture.module.css';
import { PhotoCard } from './PhotoCard';

/** What Analyse hands to the opener. */
export interface CaptureRequest {
  /** The stored photos, in the order taken. */
  readonly photoIds: readonly string[];
  /** The note, trimmed; empty when there is none. */
  readonly note: string;
  /** The photos show one plate built in steps; only ever true with two or more photos. */
  readonly progressive: boolean;
}

/** What "Add photo" opens. */
export type CapturePicker = 'camera' | 'library';

export interface CaptureSheetProps {
  readonly open: boolean;
  readonly picker: CapturePicker;
  /**
   * Analyse: the opener starts the analysis and closes the sheet. The capture draft is left as it
   * is; the analysis decides when it owns the photos (P06-04).
   */
  readonly onAnalyse: (request: CaptureRequest) => void;
  /** After Cancel (the draft is being cleared) and after the last photo was removed. */
  readonly onClose: () => void;
}

const REFUSALS: Record<PickRefusal, TKey> = {
  tooLarge: 'capture.refused.tooLarge',
  unreadable: 'capture.refused.unreadable',
  unsupportedImage: 'capture.refused.unsupportedImage',
  storageFailed: 'capture.refused.storageFailed',
};

/** A line under the photos: how many a pick left out (status), or why it was refused (alert). */
type Notice = { readonly role: 'status' | 'alert'; readonly text: string };

function useCaptureDrafts() {
  const { captureDrafts } = useServices();
  if (!captureDrafts) throw new Error('CaptureSheet: no captureDrafts service above it');
  return captureDrafts;
}

/** Writes of the note and switch that fail are left alone: the sheet still sends what it shows. */
function ignoreFailure(error: unknown): void {
  console.error('Saving the capture note or switch failed', error);
}

/**
 * The meal-photos sheet (02 §3.9): up to 10 photos from the camera or the photo library, each
 * stored as it is picked and kept in the capture draft, so a reload brings them back with the
 * note and the switch (D-16.46). A pick with a file that is too large, unreadable or not a photo
 * this browser can open is refused whole (R02.17). Analyse is off while photos are still being
 * stored. Only Cancel, Analyse and removing the last photo close it: Escape, the scrim and a pull
 * do nothing. Renders nothing while closed.
 */
export function CaptureSheet(props: CaptureSheetProps) {
  return props.open ? <OpenCaptureSheet {...props} /> : null;
}

function OpenCaptureSheet({ picker, onAnalyse, onClose }: CaptureSheetProps) {
  const captureDrafts = useCaptureDrafts();
  const noteId = useId();
  const cameraRef = useRef<HTMLInputElement>(null);
  const libraryRef = useRef<HTMLInputElement>(null);
  /** Set once the person changes the note or the switch, so a late load does not undo it. */
  const touched = useRef(false);
  const [photoIds, setPhotoIds] = useState<readonly string[]>([]);
  const [note, setNote] = useState('');
  const [progressive, setProgressive] = useState(false);
  /** Loads, picks and removals still running. */
  const [running, setRunning] = useState(0);
  const [adding, setAdding] = useState(0);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [aboutOpen, setAboutOpen] = useState(false);

  /** Counts `work` as running until it settles. */
  function track<T>(work: Promise<T>, counter = setRunning): Promise<T> {
    counter((count) => count + 1);
    const done = () => counter((count) => count - 1);
    work.then(done, done);
    return work;
  }

  // The draft is read once per opening; picks made meanwhile are queued behind the read.
  useEffect(() => {
    let live = true;
    setRunning((count) => count + 1);
    captureDrafts
      .load()
      .then(
        (draft) => {
          if (!live) return;
          setPhotoIds(draft.photoIds);
          if (touched.current) return;
          setNote(draft.note);
          setProgressive(draft.progressive);
        },
        (error: unknown) => {
          console.error('The capture draft could not be loaded', error);
          if (live) setNotice({ role: 'alert', text: t('capture.loadFailed') });
        },
      )
      .finally(() => setRunning((count) => count - 1));
    return () => {
      live = false;
    };
  }, [captureDrafts]);

  const count = photoIds.length;
  const busy = running > 0 || adding > 0;
  const stepsAllowed = count >= 2;

  const addFiles = (files: readonly Blob[]): void => {
    if (files.length === 0) return;
    setNotice(null);
    track(captureDrafts.add(files), setAdding).then(
      (result) => {
        if (result.kind === 'added') {
          setPhotoIds(result.photoIds);
          if (result.leftOut > 0) {
            setNotice({ role: 'status', text: t('capture.leftOut', { count: result.leftOut }) });
          }
        } else if (result.kind === 'refused') {
          setNotice({ role: 'alert', text: t(REFUSALS[result.reason]) });
        }
      },
      (error: unknown) => {
        console.error('Adding photos failed', error);
        setNotice({ role: 'alert', text: t('capture.refused.storageFailed') });
      },
    );
  };

  const picked = (event: ChangeEvent<HTMLInputElement>): void => {
    const input = event.currentTarget;
    const files = Array.from(input.files ?? []);
    // Cleared, so picking the same photo again still reports a change.
    input.value = '';
    addFiles(files);
  };

  const removePhoto = (photoId: string): void => {
    setNotice(null);
    track(captureDrafts.remove(photoId)).then(
      (left) => {
        setPhotoIds(left);
        if (left.length === 0) onClose();
      },
      (error: unknown) => {
        console.error('Removing a photo failed', error);
        setNotice({ role: 'alert', text: t('capture.refused.storageFailed') });
      },
    );
  };

  const changeNote = (value: string): void => {
    touched.current = true;
    setNote(value);
    captureDrafts.update({ note: value }).catch(ignoreFailure);
  };

  const changeSteps = (on: boolean): void => {
    touched.current = true;
    setProgressive(on);
    captureDrafts.update({ progressive: on }).catch(ignoreFailure);
  };

  const cancel = (): void => {
    captureDrafts.clear().catch((error: unknown) => {
      // The draft stays and comes back next time; nothing is lost.
      console.error('Clearing the capture draft failed', error);
    });
    onClose();
  };

  const analyse = (): void => {
    onAnalyse({ photoIds, note: note.trim(), progressive: progressive && stepsAllowed });
  };

  const openPicker = (): void => {
    (picker === 'camera' ? cameraRef : libraryRef).current?.click();
  };

  return (
    <Sheet
      open
      title={t('capture.title')}
      onClose={onClose}
      dismissable={false}
      data-ui="capture"
      leading={
        <Button variant="quiet" data-ui="capture.cancel" onClick={cancel}>
          {t('common.cancel')}
        </Button>
      }
      trailing={
        <Button
          variant="primary"
          disabled={count === 0 || busy}
          onClick={analyse}
          data-ui="capture.analyse"
        >
          {t('capture.analyse')}
        </Button>
      }
    >
      <div className={styles.body}>
        <p className={styles.count} data-ui="capture.count">
          {t('capture.count', { count })}
        </p>

        {count > 0 ? (
          <ul className={styles.strip}>
            {photoIds.map((photoId, index) => (
              <li key={photoId} className={styles.slot}>
                <PhotoCard
                  photoId={photoId}
                  number={index + 1}
                  removeDisabled={busy}
                  onRemove={() => removePhoto(photoId)}
                />
              </li>
            ))}
          </ul>
        ) : null}

        {adding > 0 ? (
          <p className={styles.notice} role="status">
            {t('capture.adding')}
          </p>
        ) : null}
        {notice ? (
          <p
            className={notice.role === 'alert' ? styles.alert : styles.notice}
            role={notice.role}
            data-ui="capture.notice"
          >
            {notice.text}
          </p>
        ) : null}

        {count < MAX_CAPTURE_PHOTOS ? (
          <Button
            variant="secondary"
            className={styles.add}
            disabled={busy}
            onClick={openPicker}
            data-ui="capture.add"
          >
            <Icon name={picker === 'camera' ? 'camera' : 'photos'} size={20} />
            {t(picker === 'camera' ? 'capture.addPhoto' : 'capture.addPhotos')}
          </Button>
        ) : null}
        <input
          ref={cameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          hidden
          onChange={picked}
          data-ui="capture.camera"
        />
        <input
          ref={libraryRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={picked}
          data-ui="capture.library"
        />

        <div className={styles.steps}>
          <Switch
            label={t('capture.steps.label')}
            description={t('capture.steps.description')}
            checked={progressive && stepsAllowed}
            disabled={!stepsAllowed}
            onChange={changeSteps}
            data-ui="capture.steps"
          />
          <IconButton
            icon={<Icon name="info" size={20} />}
            label={t('capture.steps.about')}
            onClick={() => setAboutOpen(true)}
            data-ui="capture.steps.about"
          />
        </div>

        <div className={styles.note}>
          <label htmlFor={noteId} className={styles.noteLabel}>
            {t('capture.note.label')}
          </label>
          <textarea
            id={noteId}
            className={styles.noteInput}
            rows={4}
            value={note}
            placeholder={t('capture.note.placeholder')}
            onChange={(event) => changeNote(event.target.value)}
            data-ui="capture.note"
          />
        </div>
      </div>

      <Dialog
        open={aboutOpen}
        title={t('capture.steps.label')}
        message={t('capture.steps.aboutBody')}
        confirmLabel={t('capture.steps.gotIt')}
        cancelLabel={null}
        onConfirm={() => setAboutOpen(false)}
        onCancel={() => setAboutOpen(false)}
        data-ui="capture.steps.dialog"
      />
    </Sheet>
  );
}
