import { useId } from 'react';
import { cx } from '../../../ui/classes';
import { Icon } from '../../../ui/icons';
import styles from '../onboarding.module.css';

export interface CardChoice<V extends string> {
  readonly value: V;
  readonly title: string;
  /** A line under the title. */
  readonly detail?: string;
  /** A short extra line in the accent colour (a steps-a-day guide). */
  readonly extra?: string;
}

export interface ChoiceCardsProps<V extends string> {
  /** Names the group for assistive tech (the step title says it for the eye). */
  readonly label: string;
  readonly choices: readonly CardChoice<V>[];
  readonly value: V;
  readonly onChange: (value: V) => void;
  /** The group's hook; each card's radio gets `<data-ui>.<value>`. */
  readonly 'data-ui': string;
}

/**
 * One choice out of a few, drawn as tall cards. Each card is a native radio inside its label, so
 * the group is one tab stop and the arrow keys move the choice. The radio is named by the card's
 * title; the other lines describe it.
 */
export function ChoiceCards<V extends string>({
  label,
  choices,
  value,
  onChange,
  'data-ui': ui,
}: ChoiceCardsProps<V>) {
  const group = useId();
  return (
    <fieldset className={styles.choices} data-ui={ui}>
      <legend className={styles.hidden}>{label}</legend>
      {choices.map((choice) => {
        const checked = choice.value === value;
        const id = `${group}-${choice.value}`;
        const described = [
          choice.detail ? `${id}-detail` : null,
          choice.extra ? `${id}-extra` : null,
        ].filter((part) => part !== null);
        return (
          <label key={choice.value} className={cx(styles.choice, checked && styles.choiceChecked)}>
            <input
              type="radio"
              name={group}
              value={choice.value}
              checked={checked}
              className={styles.choiceInput}
              aria-labelledby={`${id}-title`}
              aria-describedby={described.length > 0 ? described.join(' ') : undefined}
              data-ui={`${ui}.${choice.value}`}
              onChange={() => onChange(choice.value)}
            />
            <span className={styles.choiceText}>
              <span id={`${id}-title`} className={styles.choiceTitle}>
                {choice.title}
              </span>
              {choice.detail ? (
                <span id={`${id}-detail`} className={styles.choiceDetail}>
                  {choice.detail}
                </span>
              ) : null}
              {choice.extra ? (
                <span id={`${id}-extra`} className={styles.choiceExtra}>
                  {choice.extra}
                </span>
              ) : null}
            </span>
            <span className={styles.choiceMark} aria-hidden="true">
              {checked ? <Icon name="check" size={16} /> : null}
            </span>
          </label>
        );
      })}
    </fieldset>
  );
}
