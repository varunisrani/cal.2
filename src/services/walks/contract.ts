// The walk tracker plugin's contract (P15, D-16.96): the TypeScript side of the native plugin the
// Android app registers as `WalkTracker`. Both slices code to it; the types below are the phase
// file's, word for word, and the helpers after them are ours.

import type { PermissionState } from '@capacitor/core';

export type { PermissionState };

export type WalkState = 'running' | 'paused';
export interface WalkPoint {
  t: string;
  lat: number;
  lon: number;
  accuracyM: number;
}
export interface StepSample {
  t: string;
  steps: number;
} // cumulative steps since the walk started
export interface WalkSnapshot {
  id: string;
  state: WalkState;
  startedAt: string;
  activeSeconds: number;
  points: WalkPoint[];
  steps: StepSample[];
  locationGranted: boolean;
  stepsGranted: boolean;
}
export interface WalkTrackerPlugin {
  checkPermissions(): Promise<{
    location: PermissionState;
    activity: PermissionState;
    notifications: PermissionState;
  }>;
  requestPermissions(o: { location: boolean; activity: boolean }): Promise<{
    location: PermissionState;
    activity: PermissionState;
    notifications: PermissionState;
  }>;
  start(o: { withRoute: boolean }): Promise<WalkSnapshot>;
  pause(): Promise<WalkSnapshot>;
  resume(): Promise<WalkSnapshot>;
  stop(): Promise<WalkSnapshot & { endedAt: string }>;
  discard(): Promise<void>; // call after saving or throwing away; an ended walk (state 'paused' plus endedAt) is kept until then
  current(): Promise<WalkSnapshot | null>; // a walk in progress, e.g. after the app was reopened; no walk resolves undefined, read it as null
  addListener(
    event: 'walkUpdate',
    fn: (s: WalkSnapshot) => void,
  ): Promise<{ remove(): Promise<void> }>; // about every 2 s while in front
}

// ---- Shapes named for the service ----------------------------------------------------------------

/** What Android allows, as the plugin reports it. */
export type WalkPermissions = Awaited<ReturnType<WalkTrackerPlugin['checkPermissions']>>;

/**
 * A walk `current()` hands back: one in progress, or one stopped from the notification while the
 * app was away, which then carries its end (D-16.96).
 */
export type CurrentWalk = WalkSnapshot & { readonly endedAt?: string };

/** True once Android allows it. */
export function isGranted(state: PermissionState | undefined): boolean {
  return state === 'granted';
}

/** True while Android has not been asked yet (or would ask again). */
export function canAsk(state: PermissionState | undefined): boolean {
  return state === 'prompt' || state === 'prompt-with-rationale';
}
