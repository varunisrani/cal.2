import { useId, useRef, useState, type ChangeEvent } from 'react';
import { useSheet } from '../../../app/useRoute';
import { t, type TKey } from '../../../i18n/t';
import { Button } from '../../../ui/Button';
import { Icon, type IconName } from '../../../ui/icons';
import { Menu, type MenuAction } from '../../../ui/Menu';
import { Sheet } from '../../../ui/Sheet';
import styles from './ingredients.module.css';

/** Where a new part can come from, in menu order (02 §3.15; voice is a later phase). */
export const INGREDIENT_SOURCES = [
  'camera',
  'library',
  'barcode',
  'describe',
  'manual',
  'recent',
  'often',
  'saved',
] as const;
export type IngredientSource = (typeof INGREDIENT_SOURCES)[number];

/**
 * Sources whose flows are not built yet: left off the menu until their slice lands and deletes
 * them here: barcode (P06-14, P06-17), recent, often and saved (P06-12).
 */
export const SOURCES_NOT_BUILT_YET: readonly IngredientSource[] = [
  'barcode',
  'recent',
  'often',
  'saved',
];

/** The sources the AI serves: offered only when there is an intake session. */
export const AI_SOURCES: readonly IngredientSource[] = ['camera', 'library', 'describe'];

const SOURCE_LOOKS: Record<IngredientSource, { readonly label: TKey; readonly icon: IconName }> = {
  camera: { label: 'ingredients.add.camera', icon: 'camera' },
  library: { label: 'ingredients.add.library', icon: 'photos' },
  barcode: { label: 'ingredients.add.barcode', icon: 'barcode' },
  describe: { label: 'ingredients.add.describe', icon: 'text' },
  manual: { label: 'ingredients.add.manual', icon: 'pencil' },
  recent: { label: 'ingredients.add.recent', icon: 'clock' },
  often: { label: 'ingredients.add.often', icon: 'chart' },
  saved: { label: 'ingredients.add.saved', icon: 'heart' },
};

/** The describe sheet's place on the sheet stack, above the review. */
export const DESCRIBE_INGREDIENT_SHEET = 'review-ingredient-describe';

export interface AddIngredientMenuProps {
  /** Whether the AI sources can be offered (an intake session exists). */
  readonly canAnalyse: boolean;
  /** One photo from the camera or the library. */
  readonly onPhoto: (file: Blob) => void;
  /** A typed description, trimmed and not blank. */
  readonly onDescribe: (text: string) => void;
  /** Opens an empty part editor. */
  readonly onManual: () => void;
  /** Sources to leave off; the ones not built yet by default. */
  readonly withheld?: readonly IngredientSource[];
}

/**
 * "Add ingredient" (02 §3.15): a menu of the sources a new part can come from. Camera and photo
 * open the device's picker for one photo; describe opens a short text sheet; manual opens the
 * part editor. Sources not built yet, and the AI ones without an intake session, are left off.
 */
export function AddIngredientMenu({
  canAnalyse,
  onPhoto,
  onDescribe,
  onManual,
  withheld = SOURCES_NOT_BUILT_YET,
}: AddIngredientMenuProps) {
  const cameraRef = useRef<HTMLInputElement>(null);
  const libraryRef = useRef<HTMLInputElement>(null);
  const describeSheet = useSheet(DESCRIBE_INGREDIENT_SHEET);

  const choose = (source: IngredientSource): void => {
    if (source === 'camera') cameraRef.current?.click();
    else if (source === 'library') libraryRef.current?.click();
    else if (source === 'describe') describeSheet.show();
    else if (source === 'manual') onManual();
  };

  const offered = INGREDIENT_SOURCES.filter(
    (source) => !withheld.includes(source) && (canAnalyse || !AI_SOURCES.includes(source)),
  );
  const entries = offered.map((source): MenuAction => ({
    kind: 'action',
    id: source,
    label: t(SOURCE_LOOKS[source].label),
    icon: <Icon name={SOURCE_LOOKS[source].icon} size={20} />,
    onSelect: () => choose(source),
  }));

  const picked = (event: ChangeEvent<HTMLInputElement>): void => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    // Cleared, so picking the same photo again still reports a change.
    input.value = '';
    if (file) onPhoto(file);
  };

  return (
    <>
      <Menu
        label={t('ingredients.add.label')}
        icon={<Icon name="plus" size={20} />}
        entries={entries}
        triggerClassName={styles.addRow}
        data-ui="ingredients.add"
      />
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={picked}
        data-ui="ingredients.camera"
      />
      <input
        ref={libraryRef}
        type="file"
        accept="image/*"
        hidden
        onChange={picked}
        data-ui="ingredients.library"
      />
      <DescribeIngredientSheet
        open={describeSheet.open}
        onClose={describeSheet.close}
        onDescribe={onDescribe}
      />
    </>
  );
}

interface DescribeIngredientSheetProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly onDescribe: (text: string) => void;
}

/** A few lines of text for one part; Analyse is on once it holds more than spaces. */
function DescribeIngredientSheet(props: DescribeIngredientSheetProps) {
  return props.open ? <OpenDescribeIngredientSheet {...props} /> : null;
}

function OpenDescribeIngredientSheet({ onClose, onDescribe }: DescribeIngredientSheetProps) {
  const fieldId = useId();
  const fieldRef = useRef<HTMLTextAreaElement>(null);
  const [text, setText] = useState('');
  const description = text.trim();

  const analyse = (): void => {
    if (description === '') return;
    onClose();
    onDescribe(description);
  };

  return (
    <Sheet
      open
      title={t('ingredients.describe.title')}
      onClose={onClose}
      dismissable={false}
      initialFocus={fieldRef}
      data-ui="ingredients.describe"
      leading={
        <Button variant="quiet" onClick={onClose} data-ui="ingredients.describe.cancel">
          {t('common.cancel')}
        </Button>
      }
      trailing={
        <Button
          variant="primary"
          disabled={description === ''}
          onClick={analyse}
          data-ui="ingredients.describe.analyse"
        >
          {t('ingredients.describe.analyse')}
        </Button>
      }
    >
      <div className={styles.form}>
        <label htmlFor={fieldId} className={styles.describeLabel}>
          {t('ingredients.describe.label')}
        </label>
        <textarea
          ref={fieldRef}
          id={fieldId}
          className={styles.describeInput}
          rows={3}
          value={text}
          placeholder={t('ingredients.describe.placeholder')}
          onChange={(event) => setText(event.target.value)}
          data-ui="ingredients.describe.text"
        />
      </div>
    </Sheet>
  );
}
