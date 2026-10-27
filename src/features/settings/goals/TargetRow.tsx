import { t } from '../../../i18n/t';
import styles from './goals.module.css';

export interface TargetRowProps {
  /** "Calories", "Protein". */
  readonly label: string;
  /** The target in its unit, written for the eye ("2,452 kcal", "112 g"). */
  readonly value: string;
  /** The person set this value: it stays put while the others rebalance. */
  readonly locked: boolean;
  /**
   * The weekly tune-up owns the targets: the glyph is dimmed and the row explains instead of
   * opening a picker (the page decides what a tap does).
   */
  readonly readOnly: boolean;
  /** The id of a line that describes the row, such as why it is read-only. */
  readonly describedBy?: string;
  readonly onSelect: () => void;
  readonly 'data-ui': string;
}

/** A closed or open padlock, drawn in the icon set's stroke style. */
function LockGlyph({ locked, dimmed }: { readonly locked: boolean; readonly dimmed: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={18}
      height={18}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      focusable="false"
      role="img"
      aria-label={t(locked ? 'goals.page.targets.locked' : 'goals.page.targets.auto')}
      className={styles.lock}
      data-locked={locked || undefined}
      data-dimmed={dimmed || undefined}
    >
      <rect x="5.5" y="10.5" width="13" height="9.5" rx="2.25" />
      <path
        d={
          locked ? 'M8.5 10.5V7.75a3.5 3.5 0 0 1 7 0v2.75' : 'M8.5 10.5V7.75a3.5 3.5 0 0 1 6.6-1.6'
        }
      />
    </svg>
  );
}

/**
 * One daily target on the Goals page: its name, its value and a lock glyph that shows whether the
 * person fixed it. The glyph only reports; saving a value locks it and "Reset to auto" in the
 * picker frees it. While the weekly tune-up is on the glyph is dimmed.
 */
export function TargetRow({
  label,
  value,
  locked,
  readOnly,
  describedBy,
  onSelect,
  'data-ui': ui,
}: TargetRowProps) {
  return (
    <button
      type="button"
      className={styles.row}
      aria-describedby={describedBy}
      data-ui={ui}
      onClick={onSelect}
    >
      <span className={styles.rowLabel}>{label}</span>{' '}
      <span className={styles.rowValue}>{value}</span>{' '}
      <LockGlyph locked={locked} dimmed={readOnly} />
    </button>
  );
}
