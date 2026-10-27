import { useId, useState } from 'react';
import { unitOf, type PillarKey } from '../../domain/nutrients/catalogue';
import { DEFAULT_PILLARS, MAX_PILLARS, togglePillar } from '../../domain/nutrients/pillars';
import { formatInt } from '../../i18n/format';
import { Button } from '../../ui/Button';
import { Icon } from '../../ui/icons';
import { Sheet } from '../../ui/Sheet';
import { useToast } from '../../ui/Toast';
import { nutrientName, PICKER_ORDER, unitWord } from './dayNutrients';
import styles from './nutrients.module.css';
import { tx } from './text';

export interface PillarPickerProps {
  readonly open: boolean;
  /** The stored choice: every opening starts its draft from it. */
  readonly chosen: readonly PillarKey[];
  /** Water tracking is on: water is shown, locked, after the chosen pillars. */
  readonly waterOn: boolean;
  /** Stores the draft (Done). A rejection keeps the picker open and says so. */
  readonly onSave: (keys: readonly PillarKey[]) => Promise<unknown>;
  /** Cancel, Back, Escape or the scrim: the draft is dropped. */
  readonly onClose: () => void;
}

/**
 * Chooses the nutrients Home shows as pillars (05 §3.2.3): the chosen order with positions (water
 * last and locked while it is tracked), then all 32 nutrients with a check on the chosen ones.
 * Taps follow the P01-07 rules: one to four, the last one stays, a fifth takes the place of the
 * latest pick. "Reset to default" puts back protein, carbs, fat and fibre. Nothing is stored
 * until Done. Renders nothing while closed.
 */
export function PillarPicker(props: PillarPickerProps) {
  return props.open ? <OpenPillarPicker {...props} /> : null;
}

function OpenPillarPicker({ chosen, waterOn, onSave, onClose }: PillarPickerProps) {
  const [draft, setDraft] = useState<readonly PillarKey[]>(() => chosen.slice(0, MAX_PILLARS));
  const toast = useToast();
  const orderId = useId();

  const done = async (): Promise<void> => {
    try {
      await onSave(draft);
    } catch (error) {
      console.error('Saving the Home pillars failed', error);
      toast.show(tx('home.picker.saveFailed'));
      return;
    }
    onClose();
  };

  return (
    <Sheet
      open
      title={tx('home.picker.title')}
      onClose={onClose}
      data-ui="home.picker"
      leading={
        <Button variant="quiet" data-ui="home.picker.cancel" onClick={onClose}>
          {tx('common.cancel')}
        </Button>
      }
      trailing={
        <Button variant="primary" data-ui="home.picker.done" onClick={done}>
          {tx('common.done')}
        </Button>
      }
    >
      <div className={styles.body}>
        <p className={styles.note}>{tx('home.picker.intro')}</p>

        <section aria-labelledby={orderId} className={styles.section}>
          <h3 id={orderId} className={styles.heading}>
            {tx('home.picker.orderHeading')}
          </h3>
          <ol className={styles.lines} data-ui="home.picker.order">
            {draft.map((key, index) => (
              <li key={key} className={styles.line} data-ui={`home.picker.order.${key}`}>
                <span className={styles.position} aria-hidden="true">
                  {formatInt(index + 1)}
                </span>
                <span className={styles.lineLabel}>{nutrientName(key)}</span>
              </li>
            ))}
            {waterOn ? (
              <li className={styles.line} data-ui="home.picker.order.water">
                <span className={styles.position} aria-hidden="true">
                  {formatInt(draft.length + 1)}
                </span>
                <span className={styles.lineText}>
                  <span className={styles.lineLabel}>{tx('home.pillar.water')}</span>{' '}
                  <span className={styles.lineSub}>{tx('home.picker.waterLast')}</span>
                </span>
                <Icon
                  name="lock"
                  size={18}
                  label={tx('home.picker.waterLocked')}
                  className={styles.mark}
                />
              </li>
            ) : null}
          </ol>
        </section>

        <fieldset className={styles.section}>
          <legend className={styles.heading}>{tx('home.picker.listHeading')}</legend>
          <ul className={styles.lines}>
            {PICKER_ORDER.map((key) => (
              <Choice
                key={key}
                id={key}
                checked={draft.includes(key)}
                onToggle={() => setDraft((current) => togglePillar(current, key))}
              />
            ))}
          </ul>
        </fieldset>

        <Button
          variant="quiet"
          block
          data-ui="home.picker.reset"
          onClick={() => setDraft(DEFAULT_PILLARS)}
        >
          {tx('home.picker.reset')}
        </Button>
      </div>
    </Sheet>
  );
}

interface ChoiceProps {
  readonly id: PillarKey;
  readonly checked: boolean;
  readonly onToggle: () => void;
}

/** One nutrient to tick: its name, with its unit as the description. */
function Choice({ id, checked, onToggle }: ChoiceProps) {
  const nameId = useId();
  const unitId = useId();
  return (
    <li className={styles.choiceItem}>
      <label className={styles.choice}>
        <input
          type="checkbox"
          className={styles.check}
          checked={checked}
          onChange={onToggle}
          aria-labelledby={nameId}
          aria-describedby={unitId}
          data-ui={`home.picker.option.${id}`}
        />
        <span className={styles.lineText}>
          <span id={nameId} className={styles.lineLabel}>
            {nutrientName(id)}
          </span>{' '}
          <span id={unitId} className={styles.lineSub}>
            {unitWord(unitOf(id))}
          </span>
        </span>
      </label>
    </li>
  );
}
