import { useId, type HTMLAttributes } from 'react';
import styles from './primitives.module.css';
import { cx } from './primitives';

export interface CardProps extends HTMLAttributes<HTMLElement> {
  /** A visible title; it also names the card, which then is a region landmark. */
  readonly heading?: string;
  /** The heading's level in the page outline. */
  readonly headingLevel?: 2 | 3;
  /** The element to draw: a section when titled, a div otherwise. */
  readonly as?: 'section' | 'div' | 'article' | 'li';
  readonly 'data-ui'?: string;
}

/** The rounded surface sections sit on. */
export function Card({ heading, headingLevel = 2, as, className, children, ...native }: CardProps) {
  const headingId = useId();
  const Element = as ?? (heading === undefined ? 'div' : 'section');
  const Heading = headingLevel === 3 ? 'h3' : 'h2';
  return (
    <Element
      {...native}
      className={cx(styles.card, className)}
      aria-labelledby={heading === undefined ? native['aria-labelledby'] : headingId}
    >
      {heading !== undefined && (
        <Heading id={headingId} className={styles.cardHeading}>
          {heading}
        </Heading>
      )}
      {children}
    </Element>
  );
}
