import { mergePartitions } from './catalogue';
import { ai } from './en/ai';
import { appearance } from './en/appearance';
import { common } from './en/common';
import { onboarding } from './en/onboarding';
import { shell } from './en/shell';

/**
 * The English catalogue's partitions, one per area or slice (D-16.55). A slice owns its
 * partition file; only the lead adds a partition here, when the slice lands.
 */
export const enPartitions = { common, appearance, ai, onboarding, shell } as const;

/** The one English catalogue: every user-visible string of the app. */
export const en = mergePartitions(enPartitions);
