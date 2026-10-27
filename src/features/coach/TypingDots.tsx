import { useEffect, useState } from 'react';
import { t } from '../../i18n/t';
import styles from './coach.module.css';

/** How long each dot stays lit before the next one takes over. */
export const TYPING_STEP_MS = 350;

const DOTS = [0, 1, 2] as const;

/**
 * Three dots that say a reply is on its way (P08-10): one is lit and full size, the others faint,
 * and the lit one moves on every 350 ms, back to the first after the third. Screen readers hear
 * the status once, not every step.
 */
export function TypingDots() {
  const [lit, setLit] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => setLit((at) => (at + 1) % DOTS.length), TYPING_STEP_MS);
    return () => clearInterval(timer);
  }, []);

  return (
    <div role="status" className={styles.dots} data-ui="coach.typing" data-lit={lit}>
      <span className={styles.hidden}>{t('coach.typing')}</span>
      {DOTS.map((dot) => (
        <span
          key={dot}
          aria-hidden="true"
          className={styles.dot}
          data-on={dot === lit ? '' : undefined}
        />
      ))}
    </div>
  );
}
