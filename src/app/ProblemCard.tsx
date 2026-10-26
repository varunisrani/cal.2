import { useId, type ReactNode } from 'react';
import { Card } from '../ui/Card';
import styles from './shell.module.css';

export interface ProblemCardProps {
  readonly title: string;
  readonly body: string;
  /** The way out: Reload, and sometimes a second choice. */
  readonly actions: ReactNode;
  readonly 'data-ui': string;
}

/** A card that stands in for the whole app when it cannot go on (recovery or crash). */
export function ProblemCard({ title, body, actions, 'data-ui': hook }: ProblemCardProps) {
  const headingId = useId();
  return (
    <main className={styles.problem}>
      <Card as="section" aria-labelledby={headingId} className={styles.problemCard} data-ui={hook}>
        <h1 id={headingId} className={styles.pageHeading}>
          {title}
        </h1>
        <p className={styles.problemBody}>{body}</p>
        <div className={styles.problemActions}>{actions}</div>
      </Card>
    </main>
  );
}
