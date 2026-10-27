// A Health Connect stand-in for tests (P11-03): it answers like the native plugin from data the
// test sets, keeps what is written to it by client id, records every call, and can be told to
// refuse access or to fail a call with one of the contract's codes. No timers, no platform.

import type {
  DailyTotals,
  ExerciseSession,
  HealthAvailability,
  HealthConnectPlugin,
  HealthErrorCode,
  HealthGrants,
  HealthReadKind,
  HealthWeight,
  HealthWriteKind,
  NutritionRecord,
  WeightRecord,
} from '../contract';

export interface FakeHealthState {
  availability: HealthAvailability;
  /** What is allowed now. */
  granted: HealthGrants;
  /** Whether a permission request allows what it asks for (true) or nothing new (false). */
  grantOnRequest: boolean;
  days: DailyTotals[];
  sessions: ExerciseSession[];
  weights: HealthWeight[];
}

export interface FakeCall {
  readonly method: keyof HealthConnectPlugin;
  readonly arg: unknown;
}

export interface FakeHealthPlugin extends HealthConnectPlugin {
  /** Every call, oldest first. */
  readonly calls: FakeCall[];
  /** The arguments of every call of one method, oldest first. */
  callsOf(method: keyof HealthConnectPlugin): unknown[];
  /** Nutrition records as Health Connect would hold them, by client id. */
  readonly nutrition: Map<string, NutritionRecord>;
  /** Weight records written by Platewise, by client id. */
  readonly weightRecords: Map<string, WeightRecord>;
  /** Changes what the fake answers from now on. */
  set(changes: Partial<FakeHealthState>): void;
  /** The next call of `method` rejects with `code` (once). */
  failNext(method: keyof HealthConnectPlugin, code: HealthErrorCode): void;
}

const EVERYTHING: HealthGrants = {
  read: ['steps', 'activeCalories', 'totalCalories', 'distance', 'exercise', 'weight'],
  write: ['nutrition', 'weight'],
};

/** The totals' value kinds and the permission each needs. */
const TOTAL_KINDS: ReadonlyArray<[keyof DailyTotals, HealthReadKind]> = [
  ['steps', 'steps'],
  ['activeKcal', 'activeCalories'],
  ['totalKcal', 'totalCalories'],
  ['distanceM', 'distance'],
];

function rejection(code: HealthErrorCode): Error {
  return Object.assign(new Error(`Health Connect stand-in: ${code}`), { code });
}

/** A fake plugin; everything is allowed and available unless `initial` says otherwise. */
export function fakeHealthPlugin(initial: Partial<FakeHealthState> = {}): FakeHealthPlugin {
  const state: FakeHealthState = {
    availability: 'available',
    granted: { read: [...EVERYTHING.read], write: [...EVERYTHING.write] },
    grantOnRequest: true,
    days: [],
    sessions: [],
    weights: [],
    ...initial,
  };
  const calls: FakeCall[] = [];
  const failures = new Map<keyof HealthConnectPlugin, HealthErrorCode>();
  const nutrition = new Map<string, NutritionRecord>();
  const weightRecords = new Map<string, WeightRecord>();

  /** Records the call and throws a failure set for it. */
  function enter(method: keyof HealthConnectPlugin, arg?: unknown): void {
    calls.push({ method, arg });
    const code = failures.get(method);
    if (code) {
      failures.delete(method);
      throw rejection(code);
    }
  }

  const canRead = (kind: HealthReadKind) => state.granted.read.includes(kind);
  const canWrite = (kind: HealthWriteKind) => state.granted.write.includes(kind);
  const inRange = (day: string, o: { from: string; to: string }) => day >= o.from && day <= o.to;

  return {
    calls,
    callsOf: (method) => calls.filter((call) => call.method === method).map((call) => call.arg),
    nutrition,
    weightRecords,
    set(changes) {
      Object.assign(state, changes);
    },
    failNext(method, code) {
      failures.set(method, code);
    },

    async availability() {
      enter('availability');
      return { status: state.availability };
    },
    async grantedPermissions() {
      enter('grantedPermissions');
      return { read: [...state.granted.read], write: [...state.granted.write] };
    },
    async requestPermissions(o) {
      enter('requestPermissions', o);
      if (state.availability !== 'available') throw rejection('notAvailable');
      if (state.grantOnRequest) {
        state.granted = {
          read: [...new Set([...state.granted.read, ...o.read])],
          write: [...new Set([...state.granted.write, ...o.write])],
        };
      }
      return {
        read: state.granted.read.filter((kind) => o.read.includes(kind)),
        write: state.granted.write.filter((kind) => o.write.includes(kind)),
      };
    },
    async openHealthConnectSettings() {
      enter('openHealthConnectSettings');
    },
    async readDailyTotals(o) {
      enter('readDailyTotals', o);
      const days = state.days
        .filter((day) => inRange(day.day, o))
        .map((day) => {
          const shown = { ...day };
          for (const [field, kind] of TOTAL_KINDS) {
            if (!canRead(kind)) (shown as Record<string, unknown>)[field] = null;
          }
          return shown;
        });
      return { days };
    },
    async readExerciseSessions(o) {
      enter('readExerciseSessions', o);
      if (!canRead('exercise')) throw rejection('permissionDenied');
      return { sessions: state.sessions.filter((session) => inRange(session.day, o)) };
    },
    async readWeights(o) {
      enter('readWeights', o);
      if (!canRead('weight')) throw rejection('permissionDenied');
      // The fake's days are the UTC dates of the times, which is enough for a 30-day window.
      return { weights: state.weights.filter((weight) => inRange(weight.time.slice(0, 10), o)) };
    },
    async writeNutrition(o) {
      enter('writeNutrition', o);
      if (!canWrite('nutrition')) throw rejection('permissionDenied');
      for (const record of o.records) nutrition.set(record.clientId, record);
    },
    async deleteNutrition(o) {
      enter('deleteNutrition', o);
      if (!canWrite('nutrition')) throw rejection('permissionDenied');
      for (const id of o.clientIds) nutrition.delete(id);
    },
    async writeWeight(o) {
      enter('writeWeight', o);
      if (!canWrite('weight')) throw rejection('permissionDenied');
      weightRecords.set(o.clientId, o);
    },
    async deleteWeight(o) {
      enter('deleteWeight', o);
      if (!canWrite('weight')) throw rejection('permissionDenied');
      for (const id of o.clientIds) weightRecords.delete(id);
    },
  };
}
