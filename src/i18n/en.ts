import { mergePartitions } from './catalogue';
import { ai } from './en/ai';
import { appearance } from './en/appearance';
import { charts } from './en/charts';
import { common } from './en/common';
import { display } from './en/display';
import { home } from './en/home';
import { log } from './en/log';
import { onboarding } from './en/onboarding';
import { settings } from './en/settings';
import { shell } from './en/shell';

/**
 * The English catalogue's partitions, one per area or slice (D-16.55). A slice owns its
 * partition file; only the lead adds a partition here, when the slice lands.
 */
export const enPartitions = {
  common,
  appearance,
  display,
  ai,
  shell,
  onboarding,
  home,
  log,
  settings,
  charts,
} as const;

/** The one English catalogue: every user-visible string of the app. */
export const en = mergePartitions(enPartitions);
