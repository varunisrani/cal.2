// A walk tracker stand-in for tests (P15-02): it answers like the native plugin, keeps one walk,
// moves it forward when the test says so (fixes north at a speed, steps at a cadence, active time
// only while running), sends updates to its listeners when told, and can be stopped "from the
// notification" or told to fail a call. No timers, no platform.

import type {
  PermissionState,
  StepSample,
  WalkPermissions,
  WalkPoint,
  WalkSnapshot,
  WalkTrackerPlugin,
} from '../contract';

/** Metres in one degree of latitude on the mean Earth radius. */
const METRES_PER_DEGREE = (Math.PI * 6_371_008.8) / 180;

export interface FakeWalkTracker extends WalkTrackerPlugin {
  /** Every call by method name, oldest first. */
  readonly calls: string[];
  /** Android's answers from now on. */
  setPermissions(changes: Partial<WalkPermissions>): void;
  /** What a request grants: everything asked (true, the default) or nothing new. */
  grantOnRequest(grant: boolean): void;
  /** Walks on for `seconds` (time passes on the test's clock too: pass `tick`). */
  walk(seconds: number, options?: { speed?: number; cadence?: number }): void;
  /** Sends the walk as it is to every listener. */
  emit(): void;
  /** Ends the walk the way the notification's Stop does: `current()` then carries its end. */
  stopFromNotification(): void;
  /** The walk the tracker holds, or null. */
  held(): (WalkSnapshot & { endedAt?: string }) | null;
  /** The next call of `method` rejects (once). */
  failNext(method: keyof WalkTrackerPlugin): void;
  /** Listeners attached now. */
  listenerCount(): number;
}

export interface FakeWalkOptions {
  /** The test's clock: every time the tracker writes comes from it. */
  readonly now: () => number;
  /** Moves the test's clock on by `ms` when the tracker walks (fake timers, a mutable clock). */
  readonly tick?: (ms: number) => void;
  readonly permissions?: Partial<WalkPermissions>;
  /** Where the route starts. */
  readonly start?: { readonly lat: number; readonly lon: number };
}

export function fakeWalkTracker(options: FakeWalkOptions): FakeWalkTracker {
  const { now } = options;
  let permissions: WalkPermissions = {
    location: 'granted',
    activity: 'granted',
    notifications: 'granted',
    ...options.permissions,
  };
  let grants = true;
  let held: (WalkSnapshot & { endedAt?: string }) | null = null;
  let walks = 0;
  let northM = 0;
  let stepped = 0;
  const calls: string[] = [];
  const failing = new Set<string>();
  const listeners = new Set<(snapshot: WalkSnapshot) => void>();
  const origin = options.start ?? { lat: 52.52, lon: 13.405 };

  const iso = (ms: number) => new Date(ms).toISOString();

  function enter(method: keyof WalkTrackerPlugin): void {
    calls.push(method);
    if (failing.delete(method)) throw new Error(`walk tracker stand-in: ${method} failed`);
  }

  function copy(): WalkSnapshot & { endedAt?: string } {
    if (!held) throw new Error('walk tracker stand-in: no walk');
    return { ...held, points: [...held.points], steps: [...held.steps] };
  }

  function point(): WalkPoint {
    return {
      t: iso(now()),
      lat: origin.lat + northM / METRES_PER_DEGREE,
      lon: origin.lon,
      accuracyM: 5,
    };
  }

  const granted = (state: PermissionState) => state === 'granted';

  return {
    calls,
    setPermissions(changes) {
      permissions = { ...permissions, ...changes };
    },
    grantOnRequest(grant) {
      grants = grant;
    },
    walk(seconds, { speed = 1.5, cadence = 110 } = {}) {
      if (!held) throw new Error('walk tracker stand-in: no walk to move');
      const running = held.state === 'running' && held.endedAt === undefined;
      for (let second = 1; second <= seconds; second++) {
        options.tick?.(1000);
        if (!running) continue;
        northM += speed;
        stepped += cadence / 60;
        held.activeSeconds += 1;
        if (held.locationGranted && second % 2 === 0) held.points.push(point());
        if (held.stepsGranted && held.activeSeconds % 10 === 0) {
          const sample: StepSample = { t: iso(now()), steps: Math.round(stepped) };
          held.steps.push(sample);
        }
      }
    },
    emit() {
      if (!held) return;
      for (const listener of [...listeners]) listener(copy());
    },
    stopFromNotification() {
      if (!held) return;
      held.endedAt = iso(now());
      held.state = 'paused';
    },
    held: () => (held ? copy() : null),
    failNext(method) {
      failing.add(method);
    },
    listenerCount: () => listeners.size,

    async checkPermissions() {
      enter('checkPermissions');
      return { ...permissions };
    },
    async requestPermissions(o) {
      enter('requestPermissions');
      if (grants) {
        if (o.location) permissions = { ...permissions, location: 'granted' };
        if (o.activity) permissions = { ...permissions, activity: 'granted' };
      } else {
        if (o.location) permissions = { ...permissions, location: 'denied' };
        if (o.activity) permissions = { ...permissions, activity: 'denied' };
      }
      return { ...permissions };
    },
    async start(o) {
      enter('start');
      // Like the native tracker: a walk it still holds is answered instead of a new one.
      if (held) return copy();
      walks += 1;
      northM = 0;
      stepped = 0;
      held = {
        id: `tracked-${walks}`,
        state: 'running',
        startedAt: iso(now()),
        activeSeconds: 0,
        points: [],
        steps: [],
        locationGranted: o.withRoute && granted(permissions.location),
        stepsGranted: granted(permissions.activity),
      };
      if (held.locationGranted) held.points.push(point());
      return copy();
    },
    async pause() {
      enter('pause');
      if (!held) throw new Error('walk tracker stand-in: no walk');
      held.state = 'paused';
      return copy();
    },
    async resume() {
      enter('resume');
      if (!held) throw new Error('walk tracker stand-in: no walk');
      held.state = 'running';
      return copy();
    },
    async stop() {
      enter('stop');
      if (!held) throw new Error('walk tracker stand-in: no walk');
      // Like the native tracker: an ended walk is paused with its end, kept until `discard`.
      held.endedAt ??= iso(now());
      held.state = 'paused';
      return copy() as WalkSnapshot & { endedAt: string };
    },
    async discard() {
      enter('discard');
      held = null;
    },
    async current() {
      enter('current');
      // Like the native tracker, "no walk" resolves undefined.
      return held ? copy() : (undefined as unknown as null);
    },
    async addListener(_event, fn) {
      enter('addListener');
      listeners.add(fn);
      return {
        remove: async () => {
          listeners.delete(fn);
        },
      };
    },
  };
}
