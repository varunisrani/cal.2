import styles from '../onboarding.module.css';

export interface StepHeaderProps {
  readonly title: string;
  readonly subtitle?: string;
}

/**
 * A step's title and its line of explanation. The title is the page heading; the wizard moves
 * focus to it whenever the step changes (it is focusable from script only).
 */
export function StepHeader({ title, subtitle }: StepHeaderProps) {
  return (
    <div className={styles.stepHeader}>
      <h1 className={styles.title} tabIndex={-1} data-step-heading="">
        {title}
      </h1>
      {subtitle ? <p className={styles.subtitle}>{subtitle}</p> : null}
    </div>
  );
}
