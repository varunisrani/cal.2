// Lint fixture (P00-07, rule 1): linted as a file in src/domain, where React is out of bounds.
import { createContext } from 'react';

/** The day being looked at: a screen concern that a domain module must not hold. */
export const ViewedDay = createContext<string | null>(null);
