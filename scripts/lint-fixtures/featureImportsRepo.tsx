// Lint fixture for rule 2: a screen reads a repository itself instead of using a data hook or a
// service. Linted only by scripts/lint-rules.test.ts, as a file in src/features/.
import { entryRepository } from '../../data/repos/entries';

export function EntryCount() {
  return <output>{entryRepository.countToday()}</output>;
}
