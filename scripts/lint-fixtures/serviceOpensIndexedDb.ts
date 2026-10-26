// Lint fixture for rule 4: a service opens IndexedDB itself instead of going through a
// repository. Linted only by scripts/lint-rules.test.ts, as a file in src/services/.
export function openRawDatabase(name: string): IDBOpenDBRequest {
  return indexedDB.open(name, 1);
}
