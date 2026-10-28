// The Health Connect plugin's contract (P11, D-16.89): the TypeScript side of the native plugin
// the Android app registers as `HealthConnect`. Both slices code to it; the types below are the
// phase file's, word for word, and the lists and helpers after them are ours. P15 (D-16.96) adds
// the `heartRate` read kind, the `walk` write kind, `writeWalk` and `readHeartRate`, as its phase
// file has them.

export type HealthReadKind =
  'steps' | 'activeCalories' | 'totalCalories' | 'distance' | 'exercise' | 'weight' | 'heartRate';
// P15: 'walk' is needed by writeWalk (exercise, distance, active calories; steps are asked with it
// and optional).
export type HealthWriteKind = 'nutrition' | 'weight' | 'walk';
export interface HealthConnectPlugin {
  availability(): Promise<{
    status: 'available' | 'notInstalled' | 'updateRequired' | 'notSupported';
  }>;
  grantedPermissions(): Promise<{ read: HealthReadKind[]; write: HealthWriteKind[] }>;
  requestPermissions(o: {
    read: HealthReadKind[];
    write: HealthWriteKind[];
  }): Promise<{ read: HealthReadKind[]; write: HealthWriteKind[] }>;
  openHealthConnectSettings(): Promise<void>;
  // Inclusive day keys (YYYY-MM-DD) in the phone's zone; a value is null when that kind is not granted or has no data.
  readDailyTotals(o: { from: string; to: string }): Promise<{
    days: {
      day: string;
      steps: number | null;
      activeKcal: number | null;
      totalKcal: number | null;
      distanceM: number | null;
    }[];
  }>;
  readExerciseSessions(o: { from: string; to: string }): Promise<{
    sessions: {
      id: string;
      day: string;
      start: string;
      end: string;
      type: string;
      title: string | null;
      activeKcal: number | null;
      source: string;
    }[];
  }>;
  readWeights(o: {
    from: string;
    to: string;
  }): Promise<{ weights: { id: string; time: string; kg: number; source: string }[] }>;
  writeNutrition(o: {
    records: {
      clientId: string;
      time: string;
      name: string;
      mealType: 'breakfast' | 'lunch' | 'dinner' | 'snack' | null;
      kcal: number;
      proteinG: number | null;
      carbsG: number | null;
      fatG: number | null;
    }[];
  }): Promise<void>;
  deleteNutrition(o: { clientIds: string[] }): Promise<void>;
  writeWeight(o: { clientId: string; time: string; kg: number }): Promise<void>;
  deleteWeight(o: { clientIds: string[] }): Promise<void>;
  // P15: a finished walk as an exercise session of type walking, with its distance, active
  // calories and (when given) steps, under client ids made from `clientId`.
  writeWalk(o: {
    clientId: string;
    start: string;
    end: string;
    distanceM: number;
    activeKcal: number;
    steps: number | null;
  }): Promise<void>;
  readHeartRate(o: {
    start: string;
    end: string;
  }): Promise<{ samples: { t: string; bpm: number }[] }>;
}

// ---- Shapes named for the service ----------------------------------------------------------------

/** Whether Health Connect can be used on this phone. */
export type HealthAvailability = Awaited<ReturnType<HealthConnectPlugin['availability']>>['status'];

/** What Platewise may read and write. */
export type HealthGrants = Awaited<ReturnType<HealthConnectPlugin['grantedPermissions']>>;

export type DailyTotals = Awaited<
  ReturnType<HealthConnectPlugin['readDailyTotals']>
>['days'][number];
export type ExerciseSession = Awaited<
  ReturnType<HealthConnectPlugin['readExerciseSessions']>
>['sessions'][number];
export type HealthWeight = Awaited<
  ReturnType<HealthConnectPlugin['readWeights']>
>['weights'][number];
export type NutritionRecord = Parameters<
  HealthConnectPlugin['writeNutrition']
>[0]['records'][number];
export type WeightRecord = Parameters<HealthConnectPlugin['writeWeight']>[0];
export type WalkRecord = Parameters<HealthConnectPlugin['writeWalk']>[0];
export type HeartRateSample = Awaited<
  ReturnType<HealthConnectPlugin['readHeartRate']>
>['samples'][number];

/** Every kind Platewise reads, in the order the Settings page lists them. */
export const HEALTH_READ_KINDS: readonly HealthReadKind[] = [
  'steps',
  'activeCalories',
  'totalCalories',
  'distance',
  'exercise',
  'weight',
  // P15: for the heart-rate zones of a recorded walk.
  'heartRate',
];

/** Every kind Platewise may write (only while write-back is on). */
export const HEALTH_WRITE_KINDS: readonly HealthWriteKind[] = ['nutrition', 'weight', 'walk'];

/** The codes a plugin call rejects with. */
export const HEALTH_ERROR_CODES = [
  'notAvailable',
  'permissionDenied',
  'rateLimited',
  'invalidInput',
  'unknown',
] as const;
export type HealthErrorCode = (typeof HEALTH_ERROR_CODES)[number];

/** The code a plugin rejection carries; `unknown` for anything else. */
export function healthErrorCode(error: unknown): HealthErrorCode {
  const code =
    typeof error === 'object' && error !== null ? (error as { code?: unknown }).code : undefined;
  return HEALTH_ERROR_CODES.find((known) => known === code) ?? 'unknown';
}
