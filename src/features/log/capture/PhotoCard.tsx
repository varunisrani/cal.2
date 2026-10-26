import { useEffect, useState } from 'react';
import { t } from '../../../i18n/t';
import { useServices } from '../../../services/context';
import { IconButton } from '../../../ui/Button';
import { Icon } from '../../../ui/icons';
import styles from './capture.module.css';

export interface PhotoCardProps {
  readonly photoId: string;
  /** Its place in the meal, from 1; shown on the badge. */
  readonly number: number;
  readonly onRemove: () => void;
  readonly removeDisabled?: boolean;
}

function usePhotoService() {
  const { photos } = useServices();
  if (!photos) throw new Error('PhotoCard: no photos service above it');
  return photos;
}

/**
 * One stored photo of the capture sheet at card size (the photo service's 720 px preview), with a
 * "Photo k" badge and a remove button. A photo that cannot be shown keeps an empty frame.
 */
export function PhotoCard({ photoId, number, onRemove, removeDisabled = false }: PhotoCardProps) {
  const photos = usePhotoService();
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    let url: string | null = null;
    photos.preview(photoId).then(
      (blob) => {
        if (!live || !blob) return;
        url = URL.createObjectURL(blob);
        setSrc(url);
      },
      (error: unknown) => console.error('A photo preview could not be made', error),
    );
    return () => {
      live = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [photos, photoId]);

  const name = t('capture.photo', { number });
  return (
    <figure className={styles.card} data-ui="capture.card">
      {src ? (
        <img className={styles.image} src={src} alt={name} />
      ) : (
        <div className={styles.frame} role="img" aria-label={name} />
      )}
      <figcaption className={styles.badge} aria-hidden="true">
        {name}
      </figcaption>
      <IconButton
        className={styles.remove}
        icon={<Icon name="close" size={20} />}
        label={t('capture.remove', { number })}
        disabled={removeDisabled}
        onClick={onRemove}
        data-ui="capture.card.remove"
      />
    </figure>
  );
}
