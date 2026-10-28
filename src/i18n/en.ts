import { mergePartitions } from './catalogue';
import { about } from './en/about';
import { ai } from './en/ai';
import { aiSetup } from './en/aiSetup';
import { appearance } from './en/appearance';
import { appSettings } from './en/appSettings';
import { backup } from './en/backup';
import { capture } from './en/capture';
import { charts } from './en/charts';
import { coach } from './en/coach';
import { common } from './en/common';
import { data } from './en/data';
import { display } from './en/display';
import { editor } from './en/editor';
import { fasting } from './en/fasting';
import { fitCheck } from './en/fitCheck';
import { goals } from './en/goals';
import { health } from './en/health';
import { home } from './en/home';
import { ingredients } from './en/ingredients';
import { log } from './en/log';
import { menu } from './en/menu';
import { onboarding } from './en/onboarding';
import { profile } from './en/profile';
import { progress } from './en/progress';
import { reminders } from './en/reminders';
import { review } from './en/review';
import { reuse } from './en/reuse';
import { scan } from './en/scan';
import { settings } from './en/settings';
import { shell } from './en/shell';
import { trackers } from './en/trackers';
import { transfer } from './en/transfer';
import { walk } from './en/walk';

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
  editor,
  progress,
  trackers,
  coach,
  fasting,
  reminders,
  transfer,
  appSettings,
  backup,
  data,
  health,
  walk,
} as const;

/** The one English catalogue: every user-visible string of the app. */
export const en = mergePartitions(enPartitions);
