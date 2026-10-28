import { mergePartitions } from './catalogue';
import { about } from './en/about';
import { aiSetup } from './en/aiSetup';
import { backup } from './en/backup';
import { charts } from './en/charts';
import { data } from './en/data';
import { editor } from './en/editor';
import { fitCheck } from './en/fitCheck';
import { goals } from './en/goals';
import { health } from './en/health';
import { ingredients } from './en/ingredients';
import { onboarding } from './en/onboarding';
import { profile } from './en/profile';
import { progress } from './en/progress';
import { reminders } from './en/reminders';
import { review } from './en/review';
import { settings } from './en/settings';
import { sources } from './en/sources';
import { transfer } from './en/transfer';
import { walk } from './en/walk';
import { startupPartitions } from './startup';

/**
 * The partitions fetched on demand (P18-00): words that only screens or services fetched on
 * demand use (lazily loaded screens, the Android app's services). Each is rooted at its own name
 * and has a loader in onDemand.ts; the code that fetches a chunk names the ones its modules use:
 * `withPartitions(['walk'], import('…'))`. Listed here, statically, for the tools and the types.
 */
export const onDemandPartitions = {
  onboarding,
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
  reminders,
  transfer,
  backup,
  data,
  health,
  walk,
  sources,
} as const;

/** The name of a partition fetched on demand. */
export type OnDemandPartition = keyof typeof onDemandPartitions;

/**
 * The English catalogue's partitions, one per area or slice (D-16.55): the start-up ones
 * (startup.ts) and the ones fetched on demand. A slice owns its partition file; only the lead adds
 * a partition, when the slice lands: to `startupPartitions` when a start-up module uses it, else
 * to `onDemandPartitions` here plus its loader line in onDemand.ts. Tools and tests read this whole
 * list; the app's `t()` reads the partitions registered so far (t.ts).
 */
export const enPartitions = { ...startupPartitions, ...onDemandPartitions } as const;

/** The one English catalogue: every user-visible string of the app (for tools, tests, types). */
export const en = mergePartitions(enPartitions);
