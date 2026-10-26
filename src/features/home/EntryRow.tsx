import { useId, useState } from 'react';
import type { DiaryEntry, EntrySource } from '../../domain/model';
import type { EnergyDisplayUnit } from '../../domain/units/energy';
import { formatTime } from '../../i18n/format';
import { useServices } from '../../services/context';
import { Dialog } from '../../ui/Dialog';
import { Icon, type IconName } from '../../ui/icons';
import { SwipeRow } from '../../ui/SwipeRow';
import { useToast } from '../../ui/Toast';
import { energyText } from './energy';
import styles from './home.module.css';
import { tx } from './text';

/** The tile's icon for an entry without an emoji: how it was logged. */
const SOURCE_ICONS: Readonly<Record<EntrySource, IconName>> = {
  photo: 'camera',
  label: 'text',
  barcode: 'barcode',
  text: 'chat',
  manual: 'pencil',
};

export interface EntryRowProps {
  readonly entry: DiaryEntry;
  readonly energyUnit: EnergyDisplayUnit;
}

/**
 * One food entry in the diary: its emoji (or an icon for how it was logged), name, time, energy
 * in the person's unit and whole grams of protein, carbs and fat. Swiping it toward the leading
 * edge, or its delete button, asks before anything is deleted. Tapping does nothing yet (the
 * editor comes in P06).
 */
export function EntryRow({ entry, energyUnit }: EntryRowProps) {
  const { diary } = useServices();
  const toast = useToast();
  const [asking, setAsking] = useState(false);
  const id = useId();
  const nameId = `${id}-name`;
  const energyId = `${id}-energy`;

  const remove = async (): Promise<void> => {
    try {
      await diary.deleteEntry(entry.id);
    } catch (error) {
      console.error('Deleting a diary entry failed', error);
      toast.show(tx('home.entry.deleteFailed'));
    }
    // Once deleted, the row usually leaves with its dialog before this runs.
    setAsking(false);
  };

  return (
    <>
      <SwipeRow
        onRequestDelete={() => setAsking(true)}
        deleteLabel={tx('home.entry.deleteLabel', { name: entry.name })}
        data-ui="entry.row"
      >
        <div role="group" aria-labelledby={`${nameId} ${energyId}`} className={styles.entry}>
          <span className={styles.tile} aria-hidden="true">
            {entry.emoji ? (
              <span className={styles.emoji}>{entry.emoji}</span>
            ) : (
              <Icon name={SOURCE_ICONS[entry.source]} size={22} />
            )}
          </span>
          <span className={styles.entryText}>
            <span className={styles.entryLine}>
              <span id={nameId} className={styles.entryName}>
                {entry.name}
              </span>
              <time className={styles.entryTime} dateTime={new Date(entry.loggedAt).toISOString()}>
                {formatTime(entry.loggedAt)}
              </time>
            </span>
            <span className={styles.entryLine}>
              <span id={energyId} className={styles.entryEnergy}>
                {energyText(entry.kcal, energyUnit)}
              </span>
              <span className={styles.entryMacros}>
                {tx('home.entry.macros', {
                  protein: Math.round(entry.protein),
                  carbs: Math.round(entry.carbs),
                  fat: Math.round(entry.fat),
                })}
              </span>
            </span>
          </span>
        </div>
      </SwipeRow>
      <Dialog
        open={asking}
        title={tx('home.entry.deleteTitle')}
        message={tx('home.entry.deleteMessage', { name: entry.name })}
        confirmLabel={tx('common.delete')}
        destructive
        onConfirm={remove}
        onCancel={() => setAsking(false)}
        data-ui="entry.delete"
      />
    </>
  );
}
