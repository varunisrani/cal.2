// What walks need from Health Connect (P15, D-16.96): the heart rate during a walk, for its zones,
// and writing a finished walk (an exercise session of type walking with its distance, active
// calories and steps). Heart rate is read while Health Connect is connected; a walk is written
// only while it is connected and write-back is on, and Health Connect refuses it without the
// `walk` write kind (asked with the other write kinds when write-back is turned on). Nothing here
// ever throws into the app: a refusal or failure is logged and reads as "no samples" or "not
// written".

import type { SettingsRepo } from '../../data/repos/settingsRepo';
import type { HeartSample } from '../../domain/walks/heartRate';
import type { Walk } from '../../domain/walks/model';
import type { HealthConnectPlugin } from '../health/contract';

export interface WalkHealthLink {
  /** Heart-rate samples between two instants; none when not connected or not allowed. */
  heartRate(start: number, end: number): Promise<HeartSample[]>;
  /** Health Connect is connected and writing is on. */
  canWrite(): Promise<boolean>;
  /** Writes a finished walk under its own id; true once written. */
  writeWalk(walk: Walk): Promise<boolean>;
}

export interface WalkHealthLinkDeps {
  readonly plugin: Pick<HealthConnectPlugin, 'writeWalk' | 'readHeartRate'>;
  readonly settingsRepo: Pick<SettingsRepo, 'loaded' | 'snapshot'>;
}

const DAY_MS = 86_400_000;

function iso(ms: number): string {
  return new Date(ms).toISOString();
}

export function healthWalkLink({ plugin, settingsRepo }: WalkHealthLinkDeps): WalkHealthLink {
  async function settings() {
    await settingsRepo.loaded;
    return settingsRepo.snapshot();
  }

  async function connected(): Promise<boolean> {
    return (await settings().catch(() => null))?.['health.connected'] === true;
  }

  return {
    async heartRate(start, end) {
      if (!(await connected())) return [];
      try {
        // Health Connect answers at most 24 h at a time: a longer walk reads its first day.
        const until = Math.min(end, start + DAY_MS);
        const { samples } = await plugin.readHeartRate({ start: iso(start), end: iso(until) });
        return (Array.isArray(samples) ? samples : []).flatMap((sample) => {
          const at = Date.parse(sample.t);
          return Number.isFinite(at) && typeof sample.bpm === 'number'
            ? [{ at, bpm: sample.bpm }]
            : [];
        });
      } catch (error) {
        console.error('Health Connect: reading heart rate for a walk failed', error);
        return [];
      }
    },

    async canWrite() {
      const stored = await settings().catch(() => null);
      return stored?.['health.connected'] === true && stored['health.writeBack'] === true;
    },

    async writeWalk(walk) {
      try {
        await plugin.writeWalk({
          clientId: walk.id,
          start: iso(walk.startedAt),
          end: iso(walk.endedAt),
          // The contract has no "unknown": a walk without a route sends 0.
          distanceM: walk.distanceM ?? 0,
          activeKcal: walk.activeKcal,
          steps: walk.steps,
        });
        return true;
      } catch (error) {
        console.error('Health Connect: writing a walk failed', error);
        return false;
      }
    },
  };
}
