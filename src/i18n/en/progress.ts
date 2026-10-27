import type { MessageTree } from '../catalogue';

/**
 * Words of the Progress tab (src/features/progress): the range and period controls, the metric
 * switch, the Count today switch, the weight and body-fat cards with their log sheets, and the
 * history links and sheets. A weight with its unit word ("70.0 kg") uses `onboarding.wizard.weight`
 * until a shared units partition exists.
 */
export const progress = {
  progress: {
    loadFailed: "Your progress can't be shown right now. Reload the page to try again.",
    range: {
      label: 'Time range',
      week: '1W',
      month: '1M',
      quarter: '3M',
      half: '6M',
      year: '1Y',
      all: 'All',
    },
    period: {
      earlier: 'Earlier period',
      later: 'Later period',
    },
    metric: {
      label: 'Measurement',
      weight: 'Weight',
      bodyFat: 'Body fat',
    },
    countToday: {
      label: 'Count today',
      on: "Calories and averages include what you've logged today.",
      off: 'Calories and averages stop at yesterday.',
      offWindow: 'Calories and averages cover {period}.',
      failed: "That change wasn't saved. Please try again.",
    },
    weight: {
      title: 'Weight',
      log: 'Log weight',
      empty: 'No weigh-ins in this period. Log one to start the chart.',
      current: 'Current',
      goal: 'Goal',
      change: 'Net change',
      average: 'Average',
      chart: 'Weight chart',
    },
    logWeight: {
      title: 'Log weight',
      unit: 'Weight unit',
      kg: 'kg',
      lb: 'lb',
      saveFailed: "That weight wasn't saved. Please try again.",
      unitFailed: "The weight unit wasn't changed. Please try again.",
    },
    bodyFat: {
      title: 'Body fat',
      log: 'Log body fat',
      empty: 'No body fat logged yet. Add a reading to start the chart.',
      current: 'Current',
      goal: 'Goal',
      change: 'Net change',
      average: 'Average',
      chart: 'Body-fat chart',
      amount: '{value}%',
    },
    logBodyFat: {
      title: 'Log body fat',
      wheel: 'Body fat percentage',
      note: 'The reading is saved with the current date and time.',
      saveFailed: "That reading wasn't saved. Please try again.",
    },
    history: {
      weight: {
        title: 'Weight history',
        count: '{count, plural, one {# weigh-in} other {# weigh-ins}}. See them all or remove one.',
        deleteTitle: 'Delete this weigh-in?',
      },
      bodyFat: {
        title: 'Body-fat history',
        count: '{count, plural, one {# reading} other {# readings}}. See them all or remove one.',
        deleteTitle: 'Delete this reading?',
      },
      delete: 'Delete {value} from {date}',
      deleteMessage: '{value} from {date} will be removed for good.',
      deleteFailed: "That reading couldn't be deleted. Please try again.",
      empty: 'Nothing left in this list.',
    },
  },
} as const satisfies MessageTree;
