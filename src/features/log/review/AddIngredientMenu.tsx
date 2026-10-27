import { useId, useRef, useState, type ChangeEvent } from 'react';
import { useSheet } from '../../../app/useRoute';
import { t, type TKey } from '../../../i18n/t';
import { Button } from '../../../ui/Button';
import { Icon, type IconName } from '../../../ui/icons';
import { Menu, type MenuAction } from '../../../ui/Menu';
import { Sheet } from '../../../ui/Sheet';
import type { ReusableFood } from '../reuse/ReuseRow';
import { ReuseSheet, type ReuseList } from '../reuse/ReuseSheet';
import { ScanSheet } from '../scan/ScanSheet';
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

/** Sources whose flows are not built yet: left off the menu until their slice lands. */
export const SOURCES_NOT_BUILT_YET: readonly IngredientSource[] = [];

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
/** The scanner's place on the sheet stack, above the review. */
export const SCAN_INGREDIENT_SHEET = 'review-ingredient-scan';
/** The reuse lists' places on the sheet stack, above the review. */
export const REUSE_INGREDIENT_SHEETS: Readonly<Record<ReuseList, string>> = {
  recent: 'review-ingredient-recent',
  often: 'review-ingredient-often',
  saved: 'review-ingredient-saved',
};

const REUSE_LISTS: readonly ReuseList[] = ['recent', 'often', 'saved'];

function isReuseList(source: IngredientSource): source is ReuseList {
  return (REUSE_LISTS as readonly string[]).includes(source);
}

export interface AddIngredientMenuProps {
  /** Whether the AI sources can be offered (an intake session exists). */
  readonly canAnalyse: boolean;
  /** Whether barcode can be offered (a scanner, and an intake session to look codes up). */
  readonly canScan: boolean;
  /** One photo from the camera or the library. */
  readonly onPhoto: (file: Blob) => void;
  /** A typed description, trimmed and not blank. */
  readonly onDescribe: (text: string) => void;
  /** Opens an empty part editor. */
  readonly onManual: () => void;
  /** A scanned or typed code, once the scanner has closed. */
  readonly onCode: (code: string) => void;
  /** A food picked from Recent, Often eaten or Saved, once its list has closed. */
  readonly onPick: (food: ReusableFood) => void;
  /** Sources to leave off; the ones not built yet by default. */
  readonly withheld?: readonly IngredientSource[];
}

/**
 * "Add ingredient" (02 §3.15): a menu of the sources a new part can come from. Camera and photo
 * open the device's picker for one photo; barcode opens the scanner; describe opens a short text
 * sheet; manual opens the part editor; Recent, Often eaten and Saved open their lists, where a tap
 * hands the food back instead of opening its review. Sources not built yet, the AI ones without an
 * intake session and barcode without a scanner are left off.
 */
export function AddIngredientMenu({
  canAnalyse,
  canScan,
  onPhoto,
  onDescribe,
  onManual,
  onCode,
  onPick,
  withheld = SOURCES_NOT_BUILT_YET,
}: AddIngredientMenuProps) {
  const cameraRef = useRef<HTMLInputElement>(null);
  const libraryRef = useRef<HTMLInputElement>(null);
  const describeSheet = useSheet(DESCRIBE_INGREDIENT_SHEET);
  const scanSheet = useSheet(SCAN_INGREDIENT_SHEET);
  const reuseSheets = {
    recent: useSheet(REUSE_INGREDIENT_SHEETS.recent),
    often: useSheet(REUSE_INGREDIENT_SHEETS.often),
    saved: useSheet(REUSE_INGREDIENT_SHEETS.saved),
  };

  const choose = (source: IngredientSource): void => {
    if (source === 'camera') cameraRef.current?.click();
    else if (source === 'library') libraryRef.current?.click();
    else if (source === 'barcode') scanSheet.show();
    else if (source === 'describe') describeSheet.show();
    else if (source === 'manual') onManual();
    else if (isReuseList(source)) reuseSheets[source].show();
  };

  const available = (source: IngredientSource): boolean => {
    if (AI_SOURCES.includes(source)) return canAnalyse;
    return source === 'barcode' ? canScan : true;
  };
  const offered = INGREDIENT_SOURCES.filter(
    (source) => !withheld.includes(source) && available(source),
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
      <ScanSheet
        open={scanSheet.open && canScan}
        onCode={(code) => {
          scanSheet.close();
          onCode(code);
        }}
        onClose={scanSheet.close}
      />
      {REUSE_LISTS.map((list) => (
        <ReuseSheet
          key={list}
          list={list}
          open={reuseSheets[list].open}
          onClose={reuseSheets[list].close}
          onPick={onPick}
        />
      ))}
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
