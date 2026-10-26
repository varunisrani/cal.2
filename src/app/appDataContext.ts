// The app's data as the shell received it from Boot. Screens read settings and the profile
// through this until the data hooks of P02-15 take over; tests provide small fakes.

import { createContext, useContext } from 'react';
import type { AppData } from '../services/appData';

export const AppDataContext = createContext<AppData | null>(null);

/** The opened app data; only below Boot, which provides it once the database is open. */
export function useAppData(): AppData {
  const data = useContext(AppDataContext);
  if (data === null) throw new Error('useAppData() needs the app data that Boot provides');
  return data;
}
