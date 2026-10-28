import { t, type TKey } from '../../../i18n/t';
import { Button } from '../../../ui/Button';
import { Icon, type IconName } from '../../../ui/icons';
import styles from '../onboarding.module.css';
import type { StepProps } from './stepProps';

/** The short tour on the first screen, in the order it is read. */
const TOUR: readonly { readonly key: TKey; readonly icon: IconName }[] = [
  { key: 'onboarding.welcome.tour.photo', icon: 'camera' },
  { key: 'onboarding.welcome.tour.coach', icon: 'chat' },
  { key: 'onboarding.welcome.tour.key', icon: 'gear' },
  { key: 'onboarding.welcome.tour.device', icon: 'check' },
];

export interface WelcomeProps extends StepProps {
  /** Opens restoring from a backup file (P09-14); the link does nothing until it is passed. */
  readonly onRestore?: () => void;
  /** Opens restoring from Google Drive (P15-04); only the Android app passes it. */
  readonly onRestoreDrive?: () => void;
}

/**
 * Step 0: the Platewise mark, a two-line headline, one line about the app, a four-point tour,
 * "Get started" into the wizard and a text button for restoring a backup instead (and, in the
 * Android app, one for restoring from Google Drive).
 */
export function Welcome({ dispatch, onRestore, onRestoreDrive }: WelcomeProps) {
  return (
    <div className={styles.welcome}>
      <img className={styles.mark} src={`${import.meta.env.BASE_URL}icons/mark.svg`} alt="" />
      <h1 className={styles.headline} tabIndex={-1} data-step-heading="">
        <span>{t('onboarding.welcome.headlineTop')}</span>{' '}
        <span className={styles.headlineAccent}>{t('onboarding.welcome.headlineBottom')}</span>
      </h1>
      <p className={styles.lead}>{t('onboarding.welcome.lead')}</p>
      <ul className={styles.tour} aria-label={t('onboarding.welcome.tourLabel')}>
        {TOUR.map(({ key, icon }) => (
          <li key={key} className={styles.tourItem}>
            <Icon name={icon} size={20} className={styles.tourIcon} />
            {t(key)}
          </li>
        ))}
      </ul>
      <div className={styles.welcomeActions}>
        <Button
          variant="primary"
          block
          data-ui="wizard.start"
          onClick={() => dispatch({ type: 'next' })}
        >
          {t('onboarding.welcome.start')}
        </Button>
        <Button variant="quiet" block data-ui="wizard.restore" onClick={() => onRestore?.()}>
          {t('onboarding.welcome.restore')}
        </Button>
        {onRestoreDrive ? (
          <Button variant="quiet" block data-ui="wizard.restoreDrive" onClick={onRestoreDrive}>
            {t('onboarding.welcome.restoreDrive')}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
