import { useState } from 'react';
import { useToday } from '../../../app/TodayProvider';
import { ageOn } from '../../../domain/dates/age';
import { isDayKey, type DayKey } from '../../../domain/dates/dayKey';
import type { Profile } from '../../../domain/model';
import { birthDateYearsBefore } from '../../../domain/profile/profile';
import { t } from '../../../i18n/t';
import { Button } from '../../../ui/Button';
import { DateTimeField } from '../../../ui/DateTimeField';
import { Sheet } from '../../../ui/Sheet';
import { OLDEST_AGE_YEARS } from '../../onboarding/wizard';
import styles from './profile.module.css';
import { useProfileEdits, useSaveFailed } from './useProfileEdits';

export interface BirthdaySheetProps {
  readonly open: boolean;
  readonly profile: Profile;
  readonly onClose: () => void;
}

const UI = 'profile.birthday.sheet';

/**
 * The date of birth in the browser's own date input, never after today and at most 120 years
 * back, with the age it gives today. Renders nothing while closed.
 */
export function BirthdaySheet(props: BirthdaySheetProps) {
  return props.open ? <OpenBirthdaySheet {...props} /> : null;
}

function OpenBirthdaySheet({ profile, onClose }: BirthdaySheetProps) {
  const edits = useProfileEdits();
  const saveFailed = useSaveFailed();
  const today = useToday();
  const [date, setDate] = useState<DayKey>(profile.birthDate);

  const save = async (): Promise<void> => {
    try {
      await edits.setBirthDate(date);
      onClose();
    } catch (error) {
      saveFailed(error);
    }
  };

  return (
    <Sheet
      open
      title={t('profile.rows.birthday')}
      onClose={onClose}
      data-ui={UI}
      leading={
        <Button variant="quiet" data-ui={`${UI}.cancel`} onClick={onClose}>
          {t('common.cancel')}
        </Button>
      }
      trailing={
        <Button variant="primary" data-ui={`${UI}.save`} onClick={save}>
          {t('common.save')}
        </Button>
      }
    >
      <div className={styles.editor}>
        <DateTimeField
          kind="date"
          label={t('profile.birthday.label')}
          value={date}
          min={birthDateYearsBefore(today, OLDEST_AGE_YEARS)}
          max={today}
          onChange={(next) => {
            if (isDayKey(next)) setDate(next);
          }}
          data-ui={`${UI}.date`}
        />
        <p className={styles.note} aria-live="polite">
          {t('profile.birthday.age', { age: ageOn(date, today) })}
        </p>
      </div>
    </Sheet>
  );
}
