import type { MessageTree } from '../catalogue';

/** Words the charts show or read out on their own (src/ui/charts: LineChart, BarChart). */
export const charts = {
  charts: {
    date: 'Date',
    value: 'Value',
    goal: 'Goal: {value}',
    averaged: 'Each point is the average of nearby days.',
  },
} as const satisfies MessageTree;
