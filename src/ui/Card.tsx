import { useId, type HTMLAttributes, type ReactNode } from 'react';
import { cx } from './classes';
import styles from './primitives.module.css';

export interface CardProps extends HTMLAttributes<HTMLElement> {
  /** The element to draw; a `section` when there is a heading, else a `div`. */
  as?: 'div' | 'section' | 'article' | 'li';
  /** A heading at the top; it also names the card for assistive tech. */
  heading?: ReactNode;
  headingLevel?: 2 | 3;
  children?: ReactNode;
}

/** The rounded surface sections and lists sit on. */
export function Card({ as, heading, headingLevel = 2, className, children, ...rest }: CardProps) {
  const headingId = useId();
  const hasHeading = heading !== undefined && heading !== null;
  const Element = as ?? (hasHeading ? 'section' : 'div');
  const Heading = headingLevel === 3 ? 'h3' : 'h2';
  return (
    <Element
      aria-labelledby={hasHeading ? headingId : undefined}
      {...rest}
      className={cx(styles.card, className)}
    >
      {hasHeading ? (
        <Heading id={headingId} className={styles.cardHeading}>
          {heading}
        </Heading>
      ) : null}
      {children}
    </Element>
  );
}
