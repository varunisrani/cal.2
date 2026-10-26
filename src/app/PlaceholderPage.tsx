import { useId } from 'react';
import styles from './shell.module.css';

export interface PlaceholderPageProps {
  readonly heading: string;
  readonly 'data-ui': string;
}

/** A titled stand-in for a screen that a later task builds. */
export function PlaceholderPage({ heading, 'data-ui': hook }: PlaceholderPageProps) {
  const headingId = useId();
  return (
    <section className={styles.page} aria-labelledby={headingId} data-ui={hook}>
      <h1 id={headingId} className={styles.pageHeading}>
        {heading}
      </h1>
    </section>
  );
}
