// Lint fixture: a screen that keeps every rule. Its text comes from t(); strings without a letter
// (an empty alt, numbers, punctuation, entities) and attributes that are not copy stay legal.
// Linted only by scripts/lint-rules.test.ts, as a file in src/features/.
import { t } from '../../i18n/t';

export function TodayCard({ kcal, busy }: { kcal: number; busy: boolean }) {
  return (
    <section data-ui="today-card" className="card" aria-labelledby="today-title">
      <h2 id="today-title" title={t('common.tabs.home')}>
        {t('common.tabs.home')}
      </h2>
      <img src="/icons/plate.svg" alt="" />
      <p>
        {kcal} · {busy ? t('common.save') : t('common.done')}&nbsp;{'—'}
      </p>
      <input type="search" placeholder={t('common.add')} aria-label={t('common.add')} />
      <button type="button" aria-label={t('common.close')}>
        &times;
      </button>
    </section>
  );
}
