import { ai } from './en/ai';
import { appearance } from './en/appearance';
import { appSettings } from './en/appSettings';
import { capture } from './en/capture';
import { coach } from './en/coach';
import { common } from './en/common';
import { display } from './en/display';
import { fasting } from './en/fasting';
import { goalReached } from './en/goalReached';
import { healthBudget } from './en/healthBudget';
import { home } from './en/home';
import { log } from './en/log';
import { menu } from './en/menu';
import { reminderTexts } from './en/reminderTexts';
import { reuse } from './en/reuse';
import { scan } from './en/scan';
import { shell } from './en/shell';
import { storageNudge } from './en/storageNudge';
import { trackers } from './en/trackers';

/**
 * The partitions in the start-up download (P18-00): the words of the screens and services that
 * come with the app (the shell, Home and its add flows, the reminder engine…). The app's `t()`
 * starts from these; every other partition is fetched with the screen or service that uses it
 * (`onDemandPartitions` in en.ts). A partition goes here only when a start-up module uses it.
 */
export const startupPartitions = {
  common,
  appearance,
  display,
  ai,
  shell,
  home,
  log,
  menu,
  capture,
  reuse,
  scan,
  goalReached,
  trackers,
  coach,
  fasting,
  reminderTexts,
  appSettings,
  storageNudge,
  healthBudget,
} as const;
