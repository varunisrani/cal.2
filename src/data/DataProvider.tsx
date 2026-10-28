import { createContext, useContext, type ReactNode } from 'react';
import type { Clock } from '../lib/clock';
import type { Bus } from './bus';
import type { BodyFatRepo } from './repos/bodyFatRepo';
import type { CoachRepo } from './repos/coachRepo';
import type { DiaryRepo } from './repos/diaryRepo';
import type { FastRepo } from './repos/fastRepo';
import type { HealthRepo } from './repos/healthRepo';
import type { ProfileRepo } from './repos/profileRepo';
import type { SavedMealsRepo } from './repos/savedMealsRepo';
import type { SettingsRepo } from './repos/settingsRepo';
import type { WalkRepo } from './repos/walkRepo';
import type { WaterRepo } from './repos/waterRepo';
import type { WeightRepo } from './repos/weightRepo';

/**
 * What the read hooks in `hooks.ts` read from: the read methods of the repositories, built once by
 * `main.tsx` (tests build their own over a test database). Writes are not part of it; screens act
 * through `src/services`.
 */
export interface DataSources {
  readonly profileRepo: Pick<ProfileRepo, 'get'>;
  readonly settingsRepo: Pick<SettingsRepo, 'snapshot' | 'loaded'>;
  readonly diaryRepo: Pick<DiaryRepo, 'byDay' | 'between'>;
  readonly waterRepo: Pick<WaterRepo, 'byDay'>;
  readonly fastRepo: Pick<FastRepo, 'between' | 'active'>;
  readonly weightRepo: Pick<WeightRepo, 'between'>;
  readonly bodyFatRepo: Pick<BodyFatRepo, 'between'>;
  readonly savedMealsRepo: Pick<SavedMealsRepo, 'list'>;
  readonly coachRepo: Pick<CoachRepo, 'list' | 'chats' | 'summaries'>;
  /** Health Connect's activity copy (P11-03): only the Android app has one. */
  readonly activityRepo?: Pick<HealthRepo, 'between'>;
  /** The recorded walks (P15-02): only the Android app records them. */
  readonly walkRepo?: Pick<WalkRepo, 'between' | 'list'>;
  /** Reads `meta.unreadableData`: true once anything stored could not be read. */
  readonly unreadableFlag: () => Promise<boolean>;
  /** Where "today" comes from when a hook is not given a day. */
  readonly clock: Clock;
  /** Where app messages such as `goal-reached` are heard; the app's own bus when left out. */
  readonly bus?: Pick<Bus, 'subscribe'>;
}

const DataContext = createContext<DataSources | null>(null);

export interface DataProviderProps {
  readonly sources: DataSources;
  readonly children?: ReactNode;
}

export function DataProvider({ sources, children }: DataProviderProps) {
  return <DataContext value={sources}>{children}</DataContext>;
}

/** The data sources from the nearest `DataProvider`. Screens read through `hooks.ts` instead. */
export function useDataSources(): DataSources {
  const sources = useContext(DataContext);
  if (!sources) throw new Error('useDataSources: no DataProvider above this component');
  return sources;
}
