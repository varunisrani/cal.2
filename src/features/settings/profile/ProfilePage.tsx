import type { ReactNode } from 'react';
import { useToday } from '../../../app/TodayProvider';
import { useRouter, useSheets } from '../../../app/useRoute';
import { useProfile, useSettings } from '../../../data/hooks';
import { ACTIVITIES, GOAL_KINDS, SEXES, type Profile } from '../../../domain/model';
import {
  DEFAULT_WEEKLY_KG,
  PACE_IDS,
  PACE_PRESETS,
  paceIdOf,
} from '../../../domain/profile/editRules';
import type { HeightDisplayUnit, WeightDisplayUnit } from '../../../domain/units/body';
import { t, type TKey } from '../../../i18n/t';
import { Card } from '../../../ui/Card';
import { Icon } from '../../../ui/icons';
import { ListPicker } from '../../../ui/ListPicker';
import { AllergensSheet } from './AllergensSheet';
import { BirthdaySheet } from './BirthdaySheet';
import { BodyFatSheet } from './BodyFatSheet';
import { HeightSheet } from './HeightSheet';
import styles from './profile.module.css';
import { useProfileEdits, useSaveFailed } from './useProfileEdits';
import {
  ACTIVITY_KEYS,
  birthdayText,
  GOAL_KEYS,
  heightText,
  PACE_KEYS,
  paceText,
  percentText,
  SEX_KEYS,
  weightText,
} from './values';
import { WeightSheet } from './WeightSheet';

const SETTINGS = ['units.weight', 'units.height'] as const;

/** Each row's editor is a sheet with its own history entry, so Back closes it first. */
export const PROFILE_SHEETS = {
  sex: 'profile-sex',
  birthday: 'profile-birthday',
  height: 'profile-height',
  weight: 'profile-weight',
  bodyFat: 'profile-body-fat',
  goalBodyFat: 'profile-goal-body-fat',
  activity: 'profile-activity',
  goal: 'profile-goal',
  pace: 'profile-pace',
  goalWeight: 'profile-goal-weight',
  allergens: 'profile-allergens',
} as const;

type Field = keyof typeof PROFILE_SHEETS;

interface RowProps {
  readonly field: Field;
  readonly value: string;
  readonly onOpen: (field: Field) => void;
}

/** One field: its name, its value in the person's units, and a chevron to its editor. */
function Row({ field, value, onOpen }: RowProps) {
  const name = t(`profile.rows.${field}`);
  return (
    <li className={styles.rowItem}>
      <button
        type="button"
        className={styles.row}
        aria-label={t('profile.rowName', { name, value })}
        data-ui={`profile.${field}`}
        onClick={() => onOpen(field)}
      >
        <span className={styles.rowLabel}>{name}</span>
        <span className={styles.rowValue}>{value}</span>
        <Icon name="chevronRight" size={18} className={styles.chevron} />
      </button>
    </li>
  );
}

interface GroupProps {
  readonly heading: TKey;
  readonly ui: string;
  readonly children: ReactNode;
}

function Group({ heading, ui, children }: GroupProps) {
  return (
    <Card heading={t(heading)} className={styles.group} data-ui={ui}>
      <ul className={styles.rows}>{children}</ul>
    </Card>
  );
}

/**
 * Settings › Personal info (01 §3.9): body data, the goal and the allergen list as rows, each
 * opening its editor. Pace and goal weight show only for lose and gain, goal body fat only with
 * body fat. No edit changes the saved targets or the locks (R01.12); an edit to a plan input
 * makes the rebuild nudge on Goals appear instead, as the line at the top says.
 */
export function ProfilePage() {
  const profile = useProfile();
  const settings = useSettings(SETTINGS);

  const read = profile.status === 'ready' ? profile.value : null;
  if (profile.status === 'error' || settings.status === 'error' || (read && read.kind !== 'ok')) {
    return (
      <p className={styles.note} data-ui="profile.unavailable">
        {t(read?.kind === 'missing' ? 'profile.missing' : 'profile.unreadable')}
      </p>
    );
  }
  if (read?.kind !== 'ok' || settings.status !== 'ready') return null;
  return (
    <ProfileRows
      profile={read.value}
      weightUnit={settings.value['units.weight']}
      heightUnit={settings.value['units.height']}
    />
  );
}

interface ProfileRowsProps {
  readonly profile: Profile;
  readonly weightUnit: WeightDisplayUnit;
  readonly heightUnit: HeightDisplayUnit;
}

function ProfileRows({ profile, weightUnit, heightUnit }: ProfileRowsProps) {
  const edits = useProfileEdits();
  const saveFailed = useSaveFailed();
  const router = useRouter();
  const sheets = useSheets();
  const today = useToday();

  const open = (field: Field): void => router.openSheet(PROFILE_SHEETS[field]);
  const isOpen = (field: Field): boolean => sheets.includes(PROFILE_SHEETS[field]);
  const closer = (field: Field) => () => router.closeSheet(PROFILE_SHEETS[field]);
  const write = (action: Promise<unknown>): void => {
    action.catch(saveFailed);
  };

  const pacing = profile.goal !== 'maintain';
  const weeklyKg = profile.weeklyKg ?? DEFAULT_WEEKLY_KG;
  const bodyFat = profile.bodyFat;
  const notSet = t('profile.value.notSet');

  return (
    <div className={styles.page} data-ui="profile">
      <p className={styles.note} data-ui="profile.planNote">
        {t('profile.planNote')}
      </p>

      <Group heading="profile.groups.body" ui="profile.group.body">
        <Row field="sex" value={t(SEX_KEYS[profile.sex])} onOpen={open} />
        <Row field="birthday" value={birthdayText(profile.birthDate, today)} onOpen={open} />
        <Row field="height" value={heightText(profile.heightCm, heightUnit)} onOpen={open} />
        <Row field="weight" value={weightText(profile.weightKg, weightUnit)} onOpen={open} />
        <Row
          field="bodyFat"
          value={bodyFat === undefined ? notSet : percentText(bodyFat)}
          onOpen={open}
        />
        {bodyFat === undefined ? null : (
          <Row
            field="goalBodyFat"
            value={profile.goalBodyFat === undefined ? notSet : percentText(profile.goalBodyFat)}
            onOpen={open}
          />
        )}
      </Group>

      <Group heading="profile.groups.goal" ui="profile.group.goal">
        <Row field="activity" value={t(ACTIVITY_KEYS[profile.activity].name)} onOpen={open} />
        <Row field="goal" value={t(GOAL_KEYS[profile.goal])} onOpen={open} />
        {pacing ? (
          <>
            <Row field="pace" value={paceText(weeklyKg, weightUnit)} onOpen={open} />
            <Row
              field="goalWeight"
              value={
                profile.goalWeightKg === undefined
                  ? notSet
                  : weightText(profile.goalWeightKg, weightUnit)
              }
              onOpen={open}
            />
          </>
        ) : null}
      </Group>

      <Group heading="profile.groups.food" ui="profile.group.food">
        <Row
          field="allergens"
          value={
            profile.allergens.length === 0 ? t('profile.value.none') : profile.allergens.join(', ')
          }
          onOpen={open}
        />
      </Group>

      <ListPicker
        open={isOpen('sex')}
        title={t('profile.rows.sex')}
        options={SEXES.map((value) => ({ value, label: t(SEX_KEYS[value]) }))}
        value={profile.sex}
        onSelect={(sex) => write(edits.setSex(sex))}
        onClose={closer('sex')}
        data-ui="profile.sex.picker"
      />
      <BirthdaySheet open={isOpen('birthday')} profile={profile} onClose={closer('birthday')} />
      <HeightSheet
        open={isOpen('height')}
        profile={profile}
        unit={heightUnit}
        onClose={closer('height')}
      />
      <WeightSheet
        open={isOpen('weight')}
        kind="current"
        profile={profile}
        unit={weightUnit}
        onClose={closer('weight')}
      />
      <BodyFatSheet
        open={isOpen('bodyFat')}
        kind="current"
        profile={profile}
        onClose={closer('bodyFat')}
      />
      <BodyFatSheet
        open={isOpen('goalBodyFat') && bodyFat !== undefined}
        kind="goal"
        profile={profile}
        onClose={closer('goalBodyFat')}
      />
      <ListPicker
        open={isOpen('activity')}
        title={t('profile.rows.activity')}
        options={ACTIVITIES.map((value) => ({
          value,
          label: t(ACTIVITY_KEYS[value].name),
          description: t(ACTIVITY_KEYS[value].about),
        }))}
        value={profile.activity}
        onSelect={(activity) => write(edits.setActivity(activity))}
        onClose={closer('activity')}
        data-ui="profile.activity.picker"
      />
      <ListPicker
        open={isOpen('goal')}
        title={t('profile.rows.goal')}
        options={GOAL_KINDS.map((value) => ({ value, label: t(GOAL_KEYS[value]) }))}
        value={profile.goal}
        onSelect={(goal) => write(edits.setGoal(goal))}
        onClose={closer('goal')}
        data-ui="profile.goal.picker"
      />
      <ListPicker
        open={isOpen('pace') && pacing}
        title={t('profile.rows.pace')}
        options={PACE_IDS.map((value) => ({
          value,
          label: t(PACE_KEYS[value]),
          description: paceText(PACE_PRESETS[value], weightUnit),
        }))}
        value={paceIdOf(weeklyKg) ?? undefined}
        onSelect={(pace) => write(edits.setPace(pace))}
        onClose={closer('pace')}
        data-ui="profile.pace.picker"
      />
      <WeightSheet
        open={isOpen('goalWeight') && pacing}
        kind="goal"
        profile={profile}
        unit={weightUnit}
        onClose={closer('goalWeight')}
      />
      <AllergensSheet
        open={isOpen('allergens')}
        allergens={profile.allergens}
        onClose={closer('allergens')}
      />
    </div>
  );
}
