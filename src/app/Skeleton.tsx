import { t } from '../i18n/t';
import { cx } from '../ui/classes';
import styles from './shell.module.css';

export interface SkeletonProps {
  /** Stands in for the whole app (start-up): a page of its own with the page's padding. */
  readonly page?: boolean;
  /** A title bar first; off under a title that is already drawn. */
  readonly heading?: boolean;
  readonly 'data-ui': string;
}

/**
 * Grey shapes where the screen will be: no numbers, no switches, nothing to tap. The start-up
 * gate shows it while the data is read, and screens fetched on demand while their chunk loads.
 */
export function Skeleton({ page = false, heading = true, 'data-ui': ui }: SkeletonProps) {
  const Frame = page ? 'main' : 'div';
  return (
    <Frame
      className={page ? styles.skeleton : styles.skeletonInline}
      role="status"
      aria-busy="true"
      aria-label={t('shell.loading')}
      data-ui={ui}
    >
      {heading ? <div className={cx(styles.block, styles.blockTitle)} /> : null}
      <div className={cx(styles.block, styles.blockHero)} />
      <div className={cx(styles.block, styles.blockRow)} />
      <div className={cx(styles.block, styles.blockRow)} />
    </Frame>
  );
}
