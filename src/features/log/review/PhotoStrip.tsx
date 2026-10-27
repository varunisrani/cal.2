import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { t } from '../../../i18n/t';
import { useServices } from '../../../services/context';
import { IconButton } from '../../../ui/Button';
import { cx } from '../../../ui/classes';
import { Icon } from '../../../ui/icons';
import { useModalLayer } from '../../../ui/modalLayer';
import styles from './review.module.css';

type PhotoSize = 'preview' | 'viewer';

/**
 * An object URL for a stored photo at card (720 px) or viewer (2 048 px) size: undefined while it
 * is read and decoded, null when it is missing, cannot be decoded or there is no photo service.
 */
function usePhotoUrl(id: string, size: PhotoSize): string | null | undefined {
  const { photos } = useServices();
  const [loaded, setLoaded] = useState<{ readonly for: string; readonly url: string | null }>();
  const wanted = `${size}:${id}`;

  useEffect(() => {
    if (!photos) return undefined;
    let live = true;
    let url: string | null = null;
    photos[size](id).then(
      (blob) => {
        if (!live) return;
        url = blob ? URL.createObjectURL(blob) : null;
        setLoaded({ for: wanted, url });
      },
      (error: unknown) => {
        console.error('A photo of the meal could not be shown', error);
        if (live) setLoaded({ for: wanted, url: null });
      },
    );
    return () => {
      live = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [photos, id, size, wanted]);

  if (!photos) return null;
  return loaded?.for === wanted ? loaded.url : undefined;
}

interface PhotoProps {
  readonly id: string;
  readonly size: PhotoSize;
  readonly className: string | undefined;
  readonly alt: string;
}

/** The photo, a spinner while it decodes, or an empty frame when it cannot be shown. */
function Photo({ id, size, className, alt }: PhotoProps) {
  const url = usePhotoUrl(id, size);
  if (url) return <img className={className} src={url} alt={alt} />;
  return (
    <span className={className} aria-busy={url === undefined || undefined}>
      {url === undefined ? <span className={styles.photoSpinner} /> : null}
    </span>
  );
}

export interface PhotoStripProps {
  /** Stored photos, the primary first. */
  readonly photoIds: readonly string[];
  /** Shown large when there is no photo; a plate icon stands in when there is none either. */
  readonly emoji?: string;
  /** Gives each photo a remove button (the entry editor, P06-11); called with its index. */
  readonly onRemove?: (index: number) => void;
  /** Turns the remove buttons off (while the editor reprocesses). */
  readonly removeDisabled?: boolean;
}

/**
 * The meal's photos in a sideways strip (02 §3.5), each with an "i/n" badge when there are
 * several; a tap opens the full-screen viewer on that photo. Without photos, the food's emoji
 * or a plate. Given `onRemove`, each photo also has a remove button on its corner.
 */
export function PhotoStrip({ photoIds, emoji, onRemove, removeDisabled = false }: PhotoStripProps) {
  const [viewing, setViewing] = useState<number | null>(null);
  const count = photoIds.length;

  if (count === 0) {
    const symbol = emoji?.trim() ?? '';
    return (
      <div className={styles.noPhoto} aria-hidden="true" data-ui="review.photos.none">
        {symbol !== '' ? (
          <span className={styles.emoji} data-ui="review.emoji">
            {symbol}
          </span>
        ) : (
          <Icon name="plate" size={96} className={styles.plate} />
        )}
      </div>
    );
  }

  return (
    <>
      <ul className={styles.strip} aria-label={t('review.photos.label')} data-ui="review.photos">
        {photoIds.map((id, index) => {
          const place = { number: index + 1, count };
          return (
            <li
              key={`${index}:${id}`}
              className={cx(styles.stripItem, onRemove && styles.removableItem)}
            >
              <button
                type="button"
                className={styles.photoButton}
                aria-label={t('review.photos.open', place)}
                onClick={() => setViewing(index)}
                data-ui={`review.photo.${index + 1}`}
              >
                <Photo id={id} size="preview" className={styles.stripPhoto} alt="" />
                {count > 1 ? (
                  <span className={styles.badge} aria-hidden="true">
                    {t('review.photos.badge', place)}
                  </span>
                ) : null}
              </button>
              {onRemove ? (
                <IconButton
                  className={styles.removePhoto}
                  icon={<Icon name="close" size={20} />}
                  label={t('editor.photos.remove', place)}
                  disabled={removeDisabled}
                  onClick={() => onRemove(index)}
                  data-ui={`review.photo.${index + 1}.remove`}
                />
              ) : null}
            </li>
          );
        })}
      </ul>
      {viewing !== null ? (
        <PhotoViewer
          photoIds={photoIds}
          index={Math.min(viewing, count - 1)}
          onIndexChange={setViewing}
          onClose={() => setViewing(null)}
        />
      ) : null}
    </>
  );
}

interface PhotoViewerProps {
  readonly photoIds: readonly string[];
  readonly index: number;
  readonly onIndexChange: (index: number) => void;
  readonly onClose: () => void;
}

/** One photo over everything at viewer size, with Close and, for several, Previous and Next. */
function PhotoViewer({ photoIds, index, onIndexChange, onClose }: PhotoViewerProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  useModalLayer(rootRef, panelRef, { onEscape: onClose, initialFocus: closeRef });

  const count = photoIds.length;
  const id = photoIds[index] ?? '';
  const caption = t('review.photos.viewer', { number: index + 1, count });
  // Previous from the first goes to the last, and Next from the last to the first.
  const step = (by: number): void => onIndexChange((index + by + count) % count);

  return createPortal(
    <div ref={rootRef} className={styles.viewerLayer}>
      <div
        ref={panelRef}
        className={styles.viewer}
        role="dialog"
        aria-modal="true"
        aria-label={caption}
        tabIndex={-1}
        data-ui="review.viewer"
      >
        <div className={styles.viewerBar}>
          <p className={styles.viewerCaption} data-ui="review.viewer.caption">
            {caption}
          </p>
          <IconButton
            ref={closeRef}
            label={t('common.close')}
            icon={<Icon name="close" />}
            onClick={onClose}
            data-ui="review.viewer.close"
          />
        </div>
        <Photo key={id} id={id} size="viewer" className={styles.viewerPhoto} alt={caption} />
        {count > 1 ? (
          <div className={styles.viewerNav}>
            <IconButton
              label={t('review.photos.previous')}
              icon={<Icon name="chevronLeft" />}
              onClick={() => step(-1)}
              data-ui="review.viewer.previous"
            />
            <IconButton
              label={t('review.photos.next')}
              icon={<Icon name="chevronRight" />}
              onClick={() => step(1)}
              data-ui="review.viewer.next"
            />
          </div>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
