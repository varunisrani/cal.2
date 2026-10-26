import { mergePartitions } from './catalogue';
import { appearance } from './en/appearance';
import { common } from './en/common';
import { display } from './en/display';

/**
 * The English catalogue's partitions, one per area or slice (D-16.55). A slice owns its
 * partition file; only the lead adds a partition here, when the slice lands.
 */
export const enPartitions = { common, appearance, display } as const;

/** The one English catalogue: every user-visible string of the app. */
export const en = mergePartitions(enPartitions);
