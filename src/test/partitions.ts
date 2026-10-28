import type { MessageTree } from '../i18n/catalogue';
import { onDemandPartitions, type OnDemandPartition } from '../i18n/en';

/** Registers every on-demand partition with `register`: tests see the whole catalogue. */
export function registerEvery(
  register: (name: OnDemandPartition, tree: MessageTree) => void,
): void {
  for (const name of Object.keys(onDemandPartitions) as OnDemandPartition[]) {
    register(name, onDemandPartitions[name]);
  }
}

/**
 * The same for the i18n modules a test imports from now on. The test setup registers every
 * partition once; a test that calls `vi.resetModules()` and then imports a screen again gets fresh
 * i18n modules with only the start-up partitions (P18-00), so it calls this after the reset.
 */
export async function registerEveryPartition(): Promise<void> {
  const { registerPartition } = await import('../i18n/onDemand');
  registerEvery(registerPartition);
}
