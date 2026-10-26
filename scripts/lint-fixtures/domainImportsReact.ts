// Lint fixture for rule 1: the domain is pure, so it may not import React. The src/lib import is
// allowed. Linted only by scripts/lint-rules.test.ts, as a file in src/domain/.
import { useMemo } from 'react';
import { ok, type Result } from '../lib/result';

export function useRoundedGrams(grams: number): Result<number, never> {
  return useMemo(() => ok(Math.round(grams)), [grams]);
}
