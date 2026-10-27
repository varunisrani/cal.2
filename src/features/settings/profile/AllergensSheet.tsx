import { useRef, useState, type FormEvent } from 'react';
import { allergenName } from '../../../services/profileEdits';
import { t } from '../../../i18n/t';
import { Button, IconButton } from '../../../ui/Button';
import { Field } from '../../../ui/Field';
import { Icon } from '../../../ui/icons';
import { Sheet } from '../../../ui/Sheet';
import styles from './profile.module.css';
import { useProfileEdits, useSaveFailed } from './useProfileEdits';

export interface AllergensSheetProps {
  readonly open: boolean;
  /** The stored list, in the order the names were added. */
  readonly allergens: readonly string[];
  readonly onClose: () => void;
}

const UI = 'profile.allergens.sheet';

/**
 * The allergen sensitivities: a free list of names the person types. Each name is stored as it
 * is added (trimmed, single spaces) and each Remove takes it out at once, so Done only closes. A
 * name already on the list, in any case, is not added twice. Renders nothing while closed.
 */
export function AllergensSheet(props: AllergensSheetProps) {
  return props.open ? <OpenAllergensSheet {...props} /> : null;
}

function OpenAllergensSheet({ allergens, onClose }: AllergensSheetProps) {
  const edits = useProfileEdits();
  const saveFailed = useSaveFailed();
  const [typed, setTyped] = useState('');
  const [duplicate, setDuplicate] = useState<string | null>(null);
  const adding = useRef(false);

  const add = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    // A second Enter while the first add is still being stored would read as a duplicate.
    if (adding.current) return;
    adding.current = true;
    try {
      const outcome = await edits.addAllergen(typed);
      if (outcome.kind === 'added') setTyped('');
      setDuplicate(outcome.kind === 'duplicate' ? allergenName(typed) : null);
    } catch (error) {
      saveFailed(error);
    } finally {
      adding.current = false;
    }
  };

  const remove = (name: string) => async (): Promise<void> => {
    try {
      await edits.removeAllergen(name);
    } catch (error) {
      saveFailed(error);
    }
  };

  return (
    <Sheet open title={t('profile.rows.allergens')} onClose={onClose} data-ui={UI}>
      <div className={styles.editor}>
        <p className={styles.note}>{t('profile.allergens.intro')}</p>
        {allergens.length === 0 ? (
          <p className={styles.note} data-ui={`${UI}.empty`}>
            {t('profile.allergens.empty')}
          </p>
        ) : (
          <ul className={styles.names} aria-label={t('profile.allergens.listLabel')}>
            {allergens.map((name) => (
              <li key={name} className={styles.name} data-ui={`${UI}.name`}>
                <span>{name}</span>
                <IconButton
                  label={t('profile.allergens.remove', { name })}
                  icon={<Icon name="close" size={16} />}
                  data-ui={`${UI}.remove`}
                  onClick={remove(name)}
                />
              </li>
            ))}
          </ul>
        )}
        <form className={styles.addRow} onSubmit={(event) => void add(event)}>
          <Field
            label={t('profile.allergens.field')}
            value={typed}
            onChange={(next) => {
              setTyped(next);
              setDuplicate(null);
            }}
            autoComplete="off"
            enterKeyHint="done"
            data-ui={`${UI}.field`}
          />
          <Button
            variant="secondary"
            type="submit"
            disabled={allergenName(typed) === ''}
            data-ui={`${UI}.add`}
          >
            {t('common.add')}
          </Button>
        </form>
        {duplicate === null ? null : (
          <p className={styles.note} role="status" data-ui={`${UI}.duplicate`}>
            {t('profile.allergens.duplicate', { name: duplicate })}
          </p>
        )}
      </div>
    </Sheet>
  );
}
