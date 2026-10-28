// The icon a food's tile shows when it has no emoji: how it was logged. The diary's rows and the
// Sources sheet (D-16.105) share it.

import type { EntrySource } from '../../domain/model';
import type { IconName } from '../../ui/icons';

export const SOURCE_ICONS: Readonly<Record<EntrySource, IconName>> = {
  photo: 'camera',
  label: 'text',
  barcode: 'barcode',
  text: 'chat',
  manual: 'pencil',
};
