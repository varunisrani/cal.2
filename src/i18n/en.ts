import { mergePartitions } from './catalogue';
import { about } from './en/about';
import { ai } from './en/ai';
import { aiSetup } from './en/aiSetup';
import { appearance } from './en/appearance';
import { capture } from './en/capture';
import { charts } from './en/charts';
import { common } from './en/common';
import { display } from './en/display';
import { fitCheck } from './en/fitCheck';
import { goals } from './en/goals';
import { home } from './en/home';
import { ingredients } from './en/ingredients';
import { log } from './en/log';
import { menu } from './en/menu';
import { onboarding } from './en/onboarding';
import { profile } from './en/profile';
import { progress } from './en/progress';
import { review } from './en/review';
import { reuse } from './en/reuse';
import { scan } from './en/scan';
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
  menu,
  capture,
  reuse,
  scan,
  settings,
  charts,
  about,
  goals,
  aiSetup,
  profile,
  review,
  ingredients,
  fitCheck,
  progress,
} as const;

/** The one English catalogue: every user-visible string of the app. */
export const en = mergePartitions(enPartitions);
