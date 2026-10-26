import { useId, useState } from 'react';
import { t } from '../../i18n/t';
import { Button } from '../../ui/Button';
import styles from './onboarding.module.css';

export interface QuickStartProps {
  /** Stores the starting setup (built from `src/services/quickStart.ts`); rejects when it could not. */
  readonly onStart: () => Promise<unknown>;
  /** Called once the setup is stored: the caller shows Home. */
  readonly onDone: () => void;
}

/**
 * The temporary first-run screen (P04-09) until the onboarding wizard (P05) replaces it: the app
 * name and one button that starts with the defaults. It never touches storage or the router.
 */
export function QuickStart({ onStart, onDone }: QuickStartProps) {
  const headingId = useId();
  const [failed, setFailed] = useState(false);

  // Returns its promise, so the button stays busy (and ignores presses) until it settles.
  const start = async () => {
    setFailed(false);
    try {
      await onStart();
    } catch {
      setFailed(true);
      return;
    }
    onDone();
  };

  return (
    <section
      className={styles.quickStart}
      aria-labelledby={headingId}
      data-ui="onboarding.quickStart"
    >
      <h1 id={headingId} className={styles.title}>
        {t('common.appName')}
      </h1>
      <p className={styles.intro}>{t('onboarding.quickStart.intro')}</p>
      {failed && (
        <p className={styles.failed} role="alert" data-ui="onboarding.quickStart.failed">
          {t('onboarding.quickStart.failed')}
        </p>
      )}
      <Button variant="primary" wide data-ui="onboarding.quickStart.start" onClick={start}>
        {t('onboarding.quickStart.start')}
      </Button>
    </section>
  );
}
