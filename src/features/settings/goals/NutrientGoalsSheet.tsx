import { useId, useState } from 'react';
import { useSheet } from '../../../app/useRoute';
import { useSettings } from '../../../data/hooks';
import type { GoalKey } from '../../../domain/nutrients/catalogue';
import { GOAL_SPECS, vitaminDIu } from '../../../domain/nutrients/goalDefaults';
import { formatInt } from '../../../i18n/format';
import { currentLocale } from '../../../i18n/locale';
import { t } from '../../../i18n/t';
import { useServices } from '../../../services/context';
import { Icon } from '../../../ui/icons';
import { Sheet } from '../../../ui/Sheet';
import { useToast } from '../../../ui/Toast';
import styles from './goals.module.css';
import { goalAmount, NutrientGoalEditor } from './NutrientGoalEditor';

/** The editor opens over the list, so Back closes it first. */
export const NUTRIENT_GOAL_SHEET = 'nutrient-goal';

export type NutrientGroup = 'sugarsAndFats' | 'minerals' | 'vitamins' | 'sports';

/** The 29 goals in the sheet's four groups, in reading order (a test keeps it complete). */
export const NUTRIENT_GROUPS: readonly {
  readonly group: NutrientGroup;
  readonly keys: readonly GoalKey[];
}[] = [
  {
    group: 'sugarsAndFats',
    keys: ['sugar', 'addedSugar', 'fibre', 'saturatedFat', 'transFat', 'cholesterol', 'omega3'],
  },
  { group: 'minerals', keys: ['sodium', 'potassium', 'calcium', 'iron', 'magnesium', 'zinc'] },
  {
    group: 'vitamins',
    keys: ['vitaminA', 'vitaminC', 'vitaminD', 'vitaminE', 'vitaminK', 'vitaminB12', 'folate'],
  },
  {
    group: 'sports',
    keys: [
      'caffeine',
      'creatine',
      'taurine',
      'betaine',
      'hmb',
      'betaAlanine',
      'arginine',
      'carnitine',
      'citrulline',
    ],
  },
];

const SETTINGS = ['goals.nutrients'] as const;

export interface NutrientGoalsSheetProps {
  readonly open: boolean;
  readonly onClose: () => void;
}

function useTargetEdits() {
  const { targetEdits } = useServices();
  if (!targetEdits) throw new Error('NutrientGoalsSheet: no targetEdits service above it');
  return targetEdits;
}

interface GroupProps {
  readonly group: NutrientGroup;
  readonly keys: readonly GoalKey[];
  readonly goals: Readonly<Record<GoalKey, number>>;
  readonly onEdit: (key: GoalKey) => void;
}

function NutrientGroupList({ group, keys, goals, onEdit }: GroupProps) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className={styles.group}>
      <h3 id={headingId} className={styles.groupHeading}>
        {t(`goals.nutrients.group.${group}`)}
      </h3>
      <ul className={styles.rows}>
        {keys.map((key) => (
          <li key={key} className={styles.rowItem}>
            <button
              type="button"
              className={styles.row}
              data-ui={`goals.nutrients.row.${key}`}
              onClick={() => onEdit(key)}
            >
              <span className={styles.rowText}>
                <span className={styles.rowLabel}>{t(`goals.nutrients.name.${key}`)}</span>{' '}
                <span className={styles.rowSub}>
                  {t(`goals.nutrients.kind.${GOAL_SPECS[key].kind}`)}
                </span>
              </span>{' '}
              <span className={styles.rowText}>
                <span className={styles.rowValue}>{goalAmount(key, goals[key])}</span>{' '}
                {key === 'vitaminD' ? (
                  <span className={styles.rowSub}>
                    {t('goals.nutrients.iu', {
                      amount: formatInt(vitaminDIu(goals[key]), currentLocale()),
                    })}
                  </span>
                ) : null}
              </span>
              <Icon name="chevronRight" size={18} className={styles.chevron} />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * The optional nutrient goals (01 §3.11): the 29 goals in four groups, each with its kind (a
 * limit to stay under or a target to reach) and its value in its unit, vitamin D also in IU.
 * Tapping one opens its editor over the list. Renders nothing while closed.
 */
export function NutrientGoalsSheet(props: NutrientGoalsSheetProps) {
  return props.open ? <OpenNutrientGoalsSheet {...props} /> : null;
}

function OpenNutrientGoalsSheet({ onClose }: NutrientGoalsSheetProps) {
  const targetEdits = useTargetEdits();
  const settings = useSettings(SETTINGS);
  const editorSheet = useSheet(NUTRIENT_GOAL_SHEET);
  const toast = useToast();
  const [editing, setEditing] = useState<GoalKey>('sodium');
  const goals = settings.status === 'ready' ? settings.value['goals.nutrients'] : null;

  const edit = (key: GoalKey): void => {
    setEditing(key);
    editorSheet.show();
  };

  const save = async (value: number): Promise<void> => {
    try {
      await targetEdits.setNutrientGoal(editing, value);
      editorSheet.close();
    } catch (error) {
      console.error('Saving a nutrient goal failed', error);
      toast.show(t('goals.page.saveFailed'));
    }
  };

  return (
    <>
      <Sheet open title={t('goals.nutrients.title')} onClose={onClose} data-ui="goals.nutrients">
        <div className={styles.sheetBody}>
          <p className={styles.note}>{t('goals.nutrients.intro')}</p>
          {goals
            ? NUTRIENT_GROUPS.map(({ group, keys }) => (
                <NutrientGroupList
                  key={group}
                  group={group}
                  keys={keys}
                  goals={goals}
                  onEdit={edit}
                />
              ))
            : null}
        </div>
      </Sheet>
      {editorSheet.open && goals ? (
        <NutrientGoalEditor
          key={editing}
          goalKey={editing}
          value={goals[editing]}
          onSave={save}
          onClose={editorSheet.close}
        />
      ) : null}
    </>
  );
}
