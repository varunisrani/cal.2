// Lint fixture (P00-07): a screen that keeps every rule; its text comes from the catalogue.
import { useLiveTotal } from '../../data/hooks';
import { formatInt } from '../../i18n/format';
import { t } from '../../i18n/t';
import { logQuickEntry } from '../../services/diary';

export function TotalBadge({ dayKey }: { dayKey: string }) {
  const kcal = useLiveTotal(dayKey);
  return (
    <p data-ui="home.total" title={t('common.appName')}>
      <img src="/icons/mark.svg" alt="" />
      {formatInt(kcal)} ·{' '}
      <button type="button" aria-label={t('common.add')} onClick={() => logQuickEntry(dayKey)}>
        +
      </button>
    </p>
  );
}
