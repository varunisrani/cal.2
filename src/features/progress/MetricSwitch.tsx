import type { BodyMetric } from '../../domain/progress/ranges';
import { t, type TKey } from '../../i18n/t';
import { Segmented } from '../../ui/Segmented';

const METRIC_LABELS: Readonly<Record<BodyMetric, TKey>> = {
  weight: 'progress.metric.weight',
  bodyFat: 'progress.metric.bodyFat',
};

export interface MetricSwitchProps {
  /** The metrics on offer, in their fixed order (`availableMetrics`). */
  readonly metrics: readonly BodyMetric[];
  readonly value: BodyMetric;
  readonly onChange: (metric: BodyMetric) => void;
}

/**
 * Picks the body metric whose card shows below. Drawn only when there is a choice: with weight
 * alone the weight card's own heading says it all.
 */
export function MetricSwitch({ metrics, value, onChange }: MetricSwitchProps) {
  if (metrics.length < 2) return null;
  return (
    <Segmented
      label={t('progress.metric.label')}
      options={metrics.map((metric) => ({ value: metric, label: t(METRIC_LABELS[metric]) }))}
      value={value}
      onChange={onChange}
      data-ui="progress.metric"
    />
  );
}
