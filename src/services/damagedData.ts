// The "some saved data could not be read" notice (K9, R06.1): its one action. Dismiss lowers the
// flag the record guard sets when it keeps a damaged record aside. The record stays in its table
// and its copy stays in `quarantine`; the flag comes back only when something new is kept aside.

export interface DamagedDataService {
  /** The person has read the notice: lowers the flag. Rejects when the write is refused. */
  dismiss(): Promise<void>;
}

export interface DamagedDataDeps {
  /** Lowers `meta.unreadableData` (`clearUnreadableFlag` of src/data/guard.ts). */
  readonly clearFlag: () => Promise<void>;
}

export function createDamagedDataService({ clearFlag }: DamagedDataDeps): DamagedDataService {
  return { dismiss: () => clearFlag() };
}
