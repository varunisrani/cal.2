import { mergePartitions } from './catalogue';
import { common } from './en/common';

/**
 * The English catalogue's partitions, one per area or slice (D-16.55). A slice owns its
 * partition file; only the lead adds a partition here, when the slice lands.
 */
export const enPartitions = { common } as const;

/** The one English catalogue: every user-visible string of the app. */
export const en = mergePartitions(enPartitions);
