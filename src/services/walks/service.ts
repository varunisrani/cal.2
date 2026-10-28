// The walk service (P15-02, D-16.96): the app's side of the native walk tracker. It holds the
// phase the Walk screen shows and does the steps between them:
//
// - idle → Start: the permissions are read; when Android has not been asked about location or
//   physical activity yet, the screen first explains why each is asked (`asking`), and Continue
//   asks. The walk starts with whatever was allowed: without location it has no route, without
//   physical activity no steps.
// - active: the tracker's snapshots (about every 2 s while the app is in front, and once more each
//   time the page comes back) keep the screen live; Pause, Resume and Stop go to the tracker.
// - stopping → finished: the stopped walk is worked out (`buildWalk`) with the person's height,
//   weight and age and their earlier walks, with the heart rate Health Connect holds for its time,
//   and stored; then the tracker's own copy is let go. A store that fails keeps that copy, so the
//   next open finds the walk again.
// - finished → Save (the default) writes the walk to Health Connect when it is connected and
//   writing is on, then idle; Discard removes the stored walk.
//
// `open` at start-up picks up a walk in progress, or one stopped from the notification while the
// app was away (the tracker keeps it, paused with its end, until it is let go: it is finished and
// shown; "no walk" may come as undefined, read as null), and writes the walks of the last
// 30 days that Health Connect has not been given yet, when writing is allowed. Failures never
// throw into the app: the phase says what the screen needs.

import type { ProfileRepo } from '../../data/repos/profileRepo';
import type { WalkRepo } from '../../data/repos/walkRepo';
import { ageOn } from '../../domain/dates/age';
import { dayKeyOf } from '../../domain/dates/dayKey';
import { heartRateSummary } from '../../domain/walks/heartRate';
import type { RoutePoint, StepCount, Walk } from '../../domain/walks/model';
import { buildWalk } from '../../domain/walks/record';
import type { Clock } from '../../lib/clock';
import type { PageVisibility } from '../reminders/engine';
import {
  canAsk,
  isGranted,
  type CurrentWalk,
  type WalkPermissions,
  type WalkSnapshot,
  type WalkTrackerPlugin,
} from './contract';
import type { WalkHealthLink } from './healthLink';

/** A walk in progress as the screen shows it; times in epoch ms. */
export interface LiveWalk {
  readonly id: string;
  readonly state: 'running' | 'paused';
  readonly startedAt: number;
  readonly activeSeconds: number;
  /** When this snapshot arrived: while running, the screen adds the time since. */
  readonly receivedAt: number;
  readonly points: readonly RoutePoint[];
  readonly steps: readonly StepCount[];
  readonly locationGranted: boolean;
  readonly stepsGranted: boolean;
}

export type WalkPhase =
  | { readonly kind: 'idle' }
  /** Android has not been asked yet: the screen explains why, then Continue asks. */
  | { readonly kind: 'asking'; readonly permissions: WalkPermissions }
  | { readonly kind: 'starting' }
  | { readonly kind: 'active'; readonly walk: LiveWalk }
  | { readonly kind: 'stopping' }
  /** Stopped and stored: the summary, with Save and Discard. */
  | { readonly kind: 'finished'; readonly walk: Walk }
  /** The walk could not be started, or a stopped walk could not be stored (Try again). */
  | { readonly kind: 'failed'; readonly step: 'start' | 'store' };

export interface SaveOutcome {
  /** The walk went to Health Connect. */
  readonly written: boolean;
}

export interface WalkService {
  subscribe(onChange: () => void): () => void;
  getSnapshot(): WalkPhase;
  /**
   * At start-up (and Try again): picks up a walk in progress or one stopped from the
   * notification, then writes the walks Health Connect has not been given. Never rejects.
   */
  open(): Promise<'none' | 'active' | 'finished'>;
  /** Start: asks first (`asking`) when Android has not been asked yet. Never rejects. */
  start(): Promise<void>;
  /** Continue after the explanation: asks Android, then starts. Never rejects. */
  confirmStart(): Promise<void>;
  /** Back from the explanation without starting. */
  cancelStart(): void;
  pause(): Promise<void>;
  resume(): Promise<void>;
  /** Stops and stores the walk; the phase becomes `finished`. Never rejects. */
  stop(): Promise<void>;
  /** Keeps the finished walk (it is stored already) and writes it to Health Connect if allowed. */
  save(): Promise<SaveOutcome>;
  /** Removes the finished walk. */
  discard(): Promise<void>;
  /** Back to idle after a failure. */
  dismiss(): void;
  /** Stops listening to the page and the tracker. */
  close(): void;
  /** Resolves once nothing started by a trigger is still running (tests). */
  idle(): Promise<void>;
}

export interface WalkServiceDeps {
  readonly plugin: WalkTrackerPlugin;
  readonly walkRepo: Pick<WalkRepo, 'put' | 'list' | 'remove' | 'markWritten'>;
  readonly profileRepo: Pick<ProfileRepo, 'get'>;
  /** Health Connect's part (heart rate, writing); absent when it is not there. */
  readonly health?: WalkHealthLink;
  readonly clock: Clock;
  readonly visibility: PageVisibility;
}

/** Walks older than this are not written to Health Connect afterwards (its sync window). */
export const CATCH_UP_DAYS = 30;
/** Used when no readable profile is stored (never after onboarding). */
const FALLBACK_BODY = { heightCm: 170, weightKg: 70, ageYears: 40 };

const IDLE: WalkPhase = { kind: 'idle' };

function instant(text: unknown): number {
  return typeof text === 'string' ? Date.parse(text) : Number.NaN;
}

/** The snapshot with times as instants; fixes and counts whose time does not read are left out. */
export function liveWalkOf(snapshot: WalkSnapshot, receivedAt: number): LiveWalk {
  const points = (Array.isArray(snapshot.points) ? snapshot.points : []).flatMap((point) => {
    const at = instant(point.t);
    return Number.isFinite(at)
      ? [{ at, lat: point.lat, lon: point.lon, accuracyM: point.accuracyM }]
      : [];
  });
  const steps = (Array.isArray(snapshot.steps) ? snapshot.steps : []).flatMap((sample) => {
    const at = instant(sample.t);
    return Number.isFinite(at) ? [{ at, steps: sample.steps }] : [];
  });
  return {
    id: snapshot.id,
    state: snapshot.state === 'paused' ? 'paused' : 'running',
    startedAt: instant(snapshot.startedAt),
    activeSeconds: Math.max(0, Number(snapshot.activeSeconds) || 0),
    receivedAt,
    points,
    steps,
    locationGranted: snapshot.locationGranted === true,
    stepsGranted: snapshot.stepsGranted === true,
  };
}

export function createWalkService(deps: WalkServiceDeps): WalkService {
  const { plugin, walkRepo, clock } = deps;
  let phase: WalkPhase = IDLE;
  const listeners = new Set<() => void>();
  let updates: Promise<{ remove(): Promise<void> }> | null = null;
  let stopPage: (() => void) | null = null;
  const background = new Set<Promise<unknown>>();

  function set(next: WalkPhase): void {
    phase = next;
    for (const listener of [...listeners]) listener();
  }

  function track(work: Promise<unknown>): void {
    background.add(work);
    void work.finally(() => background.delete(work));
  }

  function logged(what: string): (error: unknown) => void {
    return (error) => console.error(`Walks: ${what} failed`, error);
  }

  function show(snapshot: WalkSnapshot): void {
    set({ kind: 'active', walk: liveWalkOf(snapshot, clock.now()) });
  }

  /** Follows the tracker's updates and the page's returns while a walk runs. */
  function follow(): void {
    updates ??= plugin
      .addListener('walkUpdate', (snapshot) => {
        if (phase.kind === 'active' && snapshot.id === phase.walk.id) show(snapshot);
      })
      .catch((error: unknown) => {
        logged('listening to the walk')(error);
        updates = null;
        return { remove: async () => undefined };
      });
    stopPage ??= deps.visibility.subscribe(() => {
      if (deps.visibility.isVisible() && phase.kind === 'active') track(refresh());
    });
  }

  function unfollow(): void {
    const handle = updates;
    updates = null;
    if (handle) track(handle.then((listener) => listener.remove()).catch(logged('unlistening')));
    stopPage?.();
    stopPage = null;
  }

  /** Reads the tracker's walk again: still going, stopped from the notification, or gone. */
  async function refresh(): Promise<void> {
    let current: CurrentWalk | null;
    try {
      current = (await plugin.current()) ?? null;
    } catch (error) {
      logged('reading the walk')(error);
      return;
    }
    if (phase.kind !== 'active') return;
    if (current === null) {
      unfollow();
      set(IDLE);
    } else if (typeof current.endedAt === 'string') {
      await finish(current as WalkSnapshot & { endedAt: string });
    } else {
      show(current);
    }
  }

  async function body() {
    const read = await deps.profileRepo.get().catch(() => null);
    if (read?.kind !== 'ok') return FALLBACK_BODY;
    const profile = read.value;
    return {
      heightCm: profile.heightCm,
      weightKg: profile.weightKg,
      ageYears: ageOn(profile.birthDate, dayKeyOf(clock.now())),
    };
  }

  /** Works out, stores and shows a stopped walk; lets the tracker's copy go once stored. */
  async function finish(stopped: WalkSnapshot & { endedAt: string }): Promise<void> {
    unfollow();
    set({ kind: 'stopping' });
    const live = liveWalkOf(stopped, clock.now());
    const endedAt = Math.max(live.startedAt, instant(stopped.endedAt) || clock.now());
    try {
      const [person, stored, samples] = await Promise.all([
        body(),
        walkRepo.list(),
        deps.health?.heartRate(live.startedAt, endedAt) ?? Promise.resolve([]),
      ]);
      const walk = buildWalk(
        { ...live, endedAt },
        {
          heightCm: person.heightCm,
          weightKg: person.weightKg,
          stored,
          heartRate: heartRateSummary(samples, live.startedAt, endedAt, person.ageYears),
        },
      );
      await walkRepo.put(walk);
      set({ kind: 'finished', walk });
    } catch (error) {
      logged('storing the walk')(error);
      set({ kind: 'failed', step: 'store' });
      return;
    }
    await plugin.discard().catch(logged("letting the tracker's copy go"));
  }

  async function begin(withRoute: boolean): Promise<void> {
    set({ kind: 'starting' });
    try {
      show(await plugin.start({ withRoute }));
      follow();
    } catch (error) {
      logged('starting the walk')(error);
      set({ kind: 'failed', step: 'start' });
    }
  }

  /** Writes the walks of the last 30 days Health Connect has not been given, but `except`. */
  async function catchUp(except: string | null): Promise<void> {
    const health = deps.health;
    if (!health || !(await health.canWrite())) return;
    const since = clock.now() - CATCH_UP_DAYS * 86_400_000;
    const waiting = (await walkRepo.list()).filter(
      (walk) => !walk.writtenToHealth && walk.endedAt >= since && walk.id !== except,
    );
    for (const walk of waiting) {
      if (await health.writeWalk(walk)) await walkRepo.markWritten(walk.id);
    }
  }

  async function changeState(change: 'pause' | 'resume'): Promise<void> {
    if (phase.kind !== 'active') return;
    try {
      const snapshot = await plugin[change]();
      if (phase.kind === 'active') show(snapshot);
    } catch (error) {
      logged(change === 'pause' ? 'pausing' : 'resuming')(error);
      await refresh();
    }
  }

  return {
    subscribe(onChange) {
      listeners.add(onChange);
      return () => {
        listeners.delete(onChange);
      };
    },

    getSnapshot: () => phase,

    async open() {
      let found: 'none' | 'active' | 'finished' = 'none';
      if (phase.kind === 'idle' || phase.kind === 'failed') {
        let current: CurrentWalk | null = null;
        try {
          current = (await plugin.current()) ?? null;
        } catch (error) {
          logged('reading the walk at start')(error);
        }
        if (current !== null && typeof current.endedAt === 'string') {
          await finish(current as WalkSnapshot & { endedAt: string });
          // `finish` moved the phase on (TypeScript cannot see it through the call).
          found = (phase as WalkPhase).kind === 'finished' ? 'finished' : 'none';
        } else if (current !== null) {
          show(current);
          follow();
          found = 'active';
        } else if (phase.kind === 'failed') {
          set(IDLE);
        }
      }
      const shown = phase.kind === 'finished' ? phase.walk.id : null;
      await catchUp(shown).catch(logged('writing earlier walks to Health Connect'));
      return found;
    },

    async start() {
      if (phase.kind !== 'idle' && phase.kind !== 'failed') return;
      set({ kind: 'starting' });
      let permissions: WalkPermissions | null = null;
      try {
        permissions = await plugin.checkPermissions();
      } catch (error) {
        logged('reading the permissions')(error);
      }
      if (permissions && (canAsk(permissions.location) || canAsk(permissions.activity))) {
        set({ kind: 'asking', permissions });
        return;
      }
      await begin(isGranted(permissions?.location));
    },

    async confirmStart() {
      if (phase.kind !== 'asking') return;
      const asked = phase.permissions;
      set({ kind: 'starting' });
      let answer = asked;
      try {
        answer = await plugin.requestPermissions({
          location: canAsk(asked.location),
          activity: canAsk(asked.activity),
        });
      } catch (error) {
        logged('asking for the permissions')(error);
      }
      await begin(isGranted(answer.location));
    },

    cancelStart() {
      if (phase.kind === 'asking') set(IDLE);
    },

    pause: () => changeState('pause'),
    resume: () => changeState('resume'),

    async stop() {
      if (phase.kind !== 'active') return;
      set({ kind: 'stopping' });
      let stopped: WalkSnapshot & { endedAt: string };
      try {
        stopped = await plugin.stop();
      } catch (error) {
        logged('stopping the walk')(error);
        // Still running, stopped after all, or gone: read it again.
        const current = (await plugin.current().catch(() => null)) ?? null;
        if (current === null) {
          unfollow();
          set(IDLE);
        } else if (typeof (current as CurrentWalk).endedAt === 'string') {
          await finish(current as WalkSnapshot & { endedAt: string });
        } else {
          show(current);
        }
        return;
      }
      await finish(stopped);
    },

    async save() {
      if (phase.kind !== 'finished') return { written: false };
      const { walk } = phase;
      set(IDLE);
      const health = deps.health;
      if (!health || !(await health.canWrite())) return { written: false };
      if (!(await health.writeWalk(walk))) return { written: false };
      await walkRepo.markWritten(walk.id).catch(logged('marking the walk written'));
      return { written: true };
    },

    async discard() {
      if (phase.kind !== 'finished') return;
      const { walk } = phase;
      await walkRepo.remove(walk.id);
      set(IDLE);
    },

    dismiss() {
      if (phase.kind === 'failed') set(IDLE);
    },

    close() {
      unfollow();
    },

    async idle() {
      while (background.size > 0) await Promise.all([...background]);
    },
  };
}
