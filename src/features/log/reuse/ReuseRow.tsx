import { useEffect, useState, type ReactNode } from 'react';
import type { EntrySource, NutritionDraft } from '../../../domain/model';
import type { EnergyDisplayUnit } from '../../../domain/units/energy';
import { t } from '../../../i18n/t';
import { useServices } from '../../../services/context';
import { Icon, type IconName } from '../../../ui/icons';
import { energyText } from '../../home/energy';
import styles from './reuse.module.css';

/** A food a reuse list offers: a logged entry or a saved meal. */
export interface ReusableFood extends NutritionDraft {
  readonly id: string;
  readonly source: EntrySource;
  /** Photos in gallery order; the first is the primary one. */
  readonly photoIds: readonly string[];
}

/** The tile's icon for a food without a photo or an emoji: how it was logged. */
const SOURCE_ICONS: Readonly<Record<EntrySource, IconName>> = {
  photo: 'camera',
  label: 'text',
  barcode: 'barcode',
  text: 'chat',
  manual: 'pencil',
};

/** The photo a row shows: the food's primary photo, else the first photo of one of its parts. */
function thumbPhotoOf(food: ReusableFood): string | undefined {
  return food.photoIds[0] ?? food.lines.find((line) => line.photoIds.length > 0)?.photoIds[0];
}

/** An object URL of the photo's stored thumbnail, or null until there is one. */
function useThumbnail(photoId: string | undefined): string | null {
  const { photos } = useServices();
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    if (!photos || photoId === undefined) return undefined;
    let live = true;
    let url: string | null = null;
    photos.thumbnail(photoId).then(
      (blob) => {
        if (!live || !blob) return;
        url = URL.createObjectURL(blob);
        setSrc(url);
      },
      (error: unknown) => console.error('A thumbnail could not be made', error),
    );
    return () => {
      live = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [photos, photoId]);
  return src;
}

export interface ReuseRowProps {
  readonly food: ReusableFood;
  /** The food is among the saved meals: a heart follows its name. */
  readonly saved: boolean;
  /** How often it was eaten (Often eaten only). */
  readonly eatenCount?: number;
  readonly energyUnit: EnergyDisplayUnit;
  /** A tap on the row: the food goes to the review. */
  readonly onPick: () => void;
  /** Buttons beside the row (the saved list's moves and remove). */
  readonly controls?: ReactNode;
  /** Hook for the row; its tap target is `<hook>.pick`. */
  readonly 'data-ui': string;
}

/**
 * One food of a reuse list: a 56 px thumbnail (its photo, else its emoji, else how it was logged),
 * the name with a heart when saved, the energy in the person's unit, "N× eaten" on Often eaten,
 * whole grams of protein, carbs and fat, and a log mark. The whole row is one button that hands
 * the food to the review; `controls` sit beside it.
 */
export function ReuseRow({
  food,
  saved,
  eatenCount,
  energyUnit,
  onPick,
  controls,
  'data-ui': ui,
}: ReuseRowProps) {
  const thumb = useThumbnail(thumbPhotoOf(food));
  return (
    <div className={styles.row} data-ui={ui}>
      <button type="button" className={styles.pick} onClick={onPick} data-ui={`${ui}.pick`}>
        <span className={styles.thumb} aria-hidden="true">
          {thumb ? (
            <img className={styles.thumbImage} src={thumb} alt="" />
          ) : food.emoji ? (
            <span className={styles.emoji}>{food.emoji}</span>
          ) : (
            <Icon name={SOURCE_ICONS[food.source]} size={24} />
          )}
        </span>
        <span className={styles.text}>
          <span className={styles.nameLine}>
            <span className={styles.name}>{food.name}</span>
            {saved ? (
              <Icon name="heart" label={t('reuse.row.saved')} size={14} className={styles.heart} />
            ) : null}
          </span>
          <span className={styles.energyLine}>
            <span className={styles.energy}>{energyText(food.kcal, energyUnit)}</span>
            {eatenCount === undefined ? null : (
              <span className={styles.count}>{t('reuse.row.eaten', { count: eatenCount })}</span>
            )}
          </span>
          <span className={styles.tags}>
            <span className={styles.tag}>
              {t('reuse.row.protein', { amount: Math.round(food.protein) })}
            </span>
            <span className={styles.tag}>
              {t('reuse.row.carbs', { amount: Math.round(food.carbs) })}
            </span>
            <span className={styles.tag}>
              {t('reuse.row.fat', { amount: Math.round(food.fat) })}
            </span>
          </span>
        </span>
        <span className={styles.log} aria-hidden="true">
          <Icon name="plus" size={22} />
        </span>
      </button>
      {controls ? <div className={styles.controls}>{controls}</div> : null}
    </div>
  );
}
