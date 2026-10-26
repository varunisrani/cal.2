// Lint fixture (P00-07, rule 2): linted as a screen, which must not reach a repository directly.
import { diaryRepo } from '../../data/repos/diaryRepo';
import { t } from '../../i18n/t';

export function ClearDayButton({ dayKey }: { dayKey: string }) {
  return (
    <button type="button" onClick={() => void diaryRepo.removeDay(dayKey)}>
      {t('common.delete')}
    </button>
  );
}
