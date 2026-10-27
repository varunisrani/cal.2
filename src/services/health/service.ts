// Health Connect on the Android app (P11-03, D-16.89): the status the Settings page shows, the
// connect and switch actions, the sync of the last 30 days and the write-back of entries and
// weigh-ins.
//
// A sync runs when the service starts, each time the page comes back to the front and when the
// person asks. It reads the daily totals and the workouts into the activity copy, imports other
// apps' weigh-ins when that is on, and then sends what changed when write-back is on. Write-back
// also runs after every change to the stored entries or weigh-ins (the watch). One sync and one
// send run at a time; a change during a send runs one more after it.
//
// Nothing here ever throws into the app: a failed call is logged, its code is kept in the status
// for the Settings page, and the diary goes on as before. Only the actions the person starts on
// the Settings page say how they went.

import type { HealthRepo, SentLedger, SentRecord } from '../../data/repos/healthRepo';
import type { DiaryRepo } from '../../data/repos/diaryRepo';
import type { SettingsRepo } from '../../data/repos/settingsRepo';
import type { WeightRepo } from '../../data/repos/weightRepo';
import type { Settings } from '../../data/settingsSchema';
import { dayKeyOf } from '../../domain/dates/dayKey';
import type { Clock } from '../../lib/clock';
import type { PageVisibility } from '../reminders/engine';
import {
  HEALTH_READ_KINDS,
  HEALTH_WRITE_KINDS,
  healthErrorCode,
  type HealthAvailability,
  type HealthConnectPlugin,
  type HealthErrorCode,
  type HealthGrants,
} from './contract';
import {
  activityDays,
  importedReadings,
  syncWindow,
  writeBackPlan,
  type WriteBackPlan,
} from './records';
import type { HealthWatch } from './watch';

/** What the Settings page shows. */
export interface HealthStatus {
  /** Whether Health Connect can be used here; null until checked. */
  readonly availability: HealthAvailability | null;
  /** What Platewise may read and write; null until read, or while Health Connect is missing. */
  readonly granted: HealthGrants | null;
  /** A sync is running. */
  readonly syncing: boolean;
  /** When the last sync ended, epoch ms; null before the first. */
  readonly lastSyncAt: number | null;
  /** Why the last sync or send failed; null once one succeeds. */
  readonly failure: HealthErrorCode | null;
}

export type ConnectOutcome =
  | { readonly kind: 'connected' }
  /** Nothing was allowed: still not connected. */
  | { readonly kind: 'refused' }
  /** Health Connect is missing, needs an update or is not supported. */
  | { readonly kind: 'unavailable' }
  | { readonly kind: 'failed'; readonly code: HealthErrorCode };

export type SyncOutcome =
  | { readonly kind: 'synced'; readonly days: number; readonly weighIns: number }
  /** Not connected: nothing read. */
  | { readonly kind: 'off' }
  /** Connected, but every read permission was taken away: nothing read. */
  | { readonly kind: 'revoked' }
  | { readonly kind: 'unavailable' }
  | { readonly kind: 'failed'; readonly code: HealthErrorCode };

export type WriteBackOutcome =
  | { readonly kind: 'on' }
  | { readonly kind: 'off' }
  /** No write permission was given: write-back stays off. */
  | { readonly kind: 'refused' }
  | { readonly kind: 'failed'; readonly code: HealthErrorCode };

export interface HealthService {
  /** Reads the status and the last sync time, syncs once, and listens for the page and changes. */
  start(): void;
  /** Stops listening (the page's visibility and the watch). */
  stop(): void;
  subscribe(onChange: () => void): () => void;
  getSnapshot(): HealthStatus;
  /** Reads again whether Health Connect is there and what is allowed. Never rejects. */
  refresh(): Promise<void>;
  /** Asks for read access; connects and syncs when anything was allowed. Never rejects. */
  connect(): Promise<ConnectOutcome>;
  /** Stops reading and counting; the stored days stay. Access is removed in Health Connect. */
  disconnect(): Promise<void>;
  /** Syncs now (joins a sync already running). Never rejects. */
  sync(): Promise<SyncOutcome>;
  setCountActiveCalories(on: boolean): Promise<void>;
  /** Turning it on imports at once. */
  setImportWeights(on: boolean): Promise<void>;
  /** Turning it on asks for write access first and sends the window's records. Never rejects. */
  setWriteBack(on: boolean): Promise<WriteBackOutcome>;
  /** Opens Health Connect's own settings, where access is managed. */
  openHealthConnect(): Promise<void>;
  /** Resolves once no sync or send is running or waiting. */
  idle(): Promise<void>;
}

export interface HealthServiceDeps {
  readonly plugin: HealthConnectPlugin;
  readonly healthRepo: HealthRepo;
  readonly settingsRepo: Pick<SettingsRepo, 'loaded' | 'snapshot' | 'set'>;
  readonly diaryRepo: Pick<DiaryRepo, 'between'>;
  readonly weightRepo: Pick<WeightRepo, 'between'>;
  readonly clock: Clock;
  readonly visibility: PageVisibility;
  /** Calls back after every change to the stored entries or weigh-ins (`storedHealthWatch`). */
  readonly watch: HealthWatch;
}

const INITIAL: HealthStatus = {
  availability: null,
  granted: null,
  syncing: false,
  lastSyncAt: null,
  failure: null,
};

/** Only the kinds of the contract, whatever the plugin answers. */
function cleanGrants(grants: HealthGrants): HealthGrants {
  const read = Array.isArray(grants.read) ? grants.read : [];
  const write = Array.isArray(grants.write) ? grants.write : [];
  return {
    read: HEALTH_READ_KINDS.filter((kind) => read.includes(kind)),
    write: HEALTH_WRITE_KINDS.filter((kind) => write.includes(kind)),
  };
}

/** The plan's ledger records of `records`. */
function sentFor(plan: WriteBackPlan, records: readonly { clientId: string }[]): SentLedger {
  const sent: Record<string, SentRecord> = {};
  for (const { clientId } of records) {
    const record = plan.sent[clientId];
    if (record) sent[clientId] = record;
  }
  return sent;
}

export function createHealthService(deps: HealthServiceDeps): HealthService {
  const { plugin, healthRepo, settingsRepo, clock } = deps;
  let status = INITIAL;
  const listeners = new Set<() => void>();
  let syncRun: Promise<SyncOutcome> | null = null;
  let sendRun: Promise<void> | null = null;
  // Work started by a trigger rather than awaited by a caller; `idle` waits for it too.
  const background = new Set<Promise<unknown>>();
  let sendAgain = false;
  let stops: Array<() => void> = [];

  function patch(changes: Partial<HealthStatus>): void {
    status = { ...status, ...changes };
    for (const listener of [...listeners]) listener();
  }

  function failed(what: string, error: unknown): HealthErrorCode {
    const code = healthErrorCode(error);
    console.error(`Health Connect: ${what} failed (${code})`, error);
    return code;
  }

  async function settings(): Promise<Settings> {
    await settingsRepo.loaded;
    return settingsRepo.snapshot();
  }

  /** Reads availability and, when available, the grants; throws what the plugin throws. */
  async function readStatus(): Promise<HealthAvailability> {
    const { status: availability } = await plugin.availability();
    if (availability !== 'available') {
      patch({ availability, granted: null });
      return availability;
    }
    const granted = cleanGrants(await plugin.grantedPermissions());
    patch({ availability, granted });
    return availability;
  }

  async function runSync(): Promise<SyncOutcome> {
    const stored = await settings().catch(() => null);
    if (!stored?.['health.connected']) return { kind: 'off' };
    patch({ syncing: true });
    let outcome: SyncOutcome;
    try {
      if ((await readStatus()) !== 'available') return { kind: 'unavailable' };
      const granted = status.granted;
      if (!granted || granted.read.length === 0) return { kind: 'revoked' };
      const window = syncWindow(dayKeyOf(clock.now()));
      const range = { from: window.first, to: window.last };
      const { days } = await plugin.readDailyTotals(range);
      const sessions = granted.read.includes('exercise')
        ? (await plugin.readExerciseSessions(range)).sessions
        : [];
      const now = clock.now();
      const written = await healthRepo.putDays(activityDays(window, days, sessions, now));
      let weighIns = 0;
      if (stored['health.importWeights'] && granted.read.includes('weight')) {
        const { weights } = await plugin.readWeights(range);
        const imported = await healthRepo.importWeighIns(importedReadings(weights));
        weighIns = imported.added + imported.replaced;
      }
      await healthRepo.setLastSyncAt(now);
      patch({ lastSyncAt: now, failure: null });
      outcome = { kind: 'synced', days: written, weighIns };
    } catch (error) {
      const code = failed('the sync', error);
      patch({ failure: code });
      return { kind: 'failed', code };
    } finally {
      patch({ syncing: false });
    }
    if (stored['health.writeBack']) await send();
    return outcome;
  }

  function sync(): Promise<SyncOutcome> {
    syncRun ??= runSync().finally(() => {
      syncRun = null;
    });
    return syncRun;
  }

  /** One write-back pass: sends what changed in the window, removes what was deleted. */
  async function sendOnce(): Promise<void> {
    const stored = await settings();
    if (!stored['health.connected'] || !stored['health.writeBack']) return;
    const granted = status.granted ?? cleanGrants(await plugin.grantedPermissions());
    const now = clock.now();
    const window = syncWindow(dayKeyOf(now));
    const [entries, weighIns, ledger] = await Promise.all([
      deps.diaryRepo.between(window.first, window.last),
      deps.weightRepo.between(window.first, window.last),
      healthRepo.sent(),
    ]);
    // Records dated after `now` wait for a later pass (start, return, change or sync).
    const plan = writeBackPlan({ entries, weighIns, ledger, window, now });
    if (plan.forget.length > 0) await healthRepo.updateSent({ remove: plan.forget });

    // Each call's ledger change is stored only after the call succeeded, so a failure is retried.
    let calls = 0;
    if (granted.write.includes('nutrition')) {
      if (plan.nutrition.length > 0) {
        calls++;
        await plugin.writeNutrition({ records: plan.nutrition });
        await healthRepo.updateSent({ set: sentFor(plan, plan.nutrition) });
      }
      if (plan.removeNutrition.length > 0) {
        calls++;
        await plugin.deleteNutrition({ clientIds: plan.removeNutrition });
        await healthRepo.updateSent({ remove: plan.removeNutrition });
      }
    }
    if (granted.write.includes('weight')) {
      for (const record of plan.weights) {
        calls++;
        await plugin.writeWeight(record);
        await healthRepo.updateSent({ set: sentFor(plan, [record]) });
      }
      if (plan.removeWeights.length > 0) {
        calls++;
        await plugin.deleteWeight({ clientIds: plan.removeWeights });
        await healthRepo.updateSent({ remove: plan.removeWeights });
      }
    }
    if (calls > 0 && status.failure !== null) patch({ failure: null });
  }

  /** Runs a pass, or marks one more after the pass already running. Never rejects. */
  function send(): Promise<void> {
    if (sendRun) {
      sendAgain = true;
      return sendRun;
    }
    sendRun = (async () => {
      do {
        sendAgain = false;
        try {
          await sendOnce();
        } catch (error) {
          patch({ failure: failed('sending to Health Connect', error) });
        }
      } while (sendAgain);
    })().finally(() => {
      sendRun = null;
    });
    return sendRun;
  }

  /** Keeps a trigger's work in view of `idle`; it never rejects. */
  function track(work: Promise<unknown>): void {
    background.add(work);
    void work.finally(() => background.delete(work));
  }

  async function refresh(): Promise<void> {
    try {
      await readStatus();
    } catch (error) {
      failed('reading the status', error);
    }
  }

  return {
    start() {
      track(
        healthRepo.lastSyncAt().then(
          (lastSyncAt) => {
            if (status.lastSyncAt === null) patch({ lastSyncAt });
          },
          (error: unknown) => failed('reading the last sync time', error),
        ),
      );
      // A sync reads the status itself; without one (not connected) the page still needs it.
      const begin = (): void => {
        track(sync().then((outcome) => (outcome.kind === 'off' ? refresh() : undefined)));
      };
      begin();
      stops = [
        deps.visibility.subscribe(() => {
          if (deps.visibility.isVisible()) begin();
        }),
        deps.watch(() => void send()),
      ];
    },

    stop() {
      for (const stop of stops) stop();
      stops = [];
    },

    subscribe(onChange) {
      listeners.add(onChange);
      return () => {
        listeners.delete(onChange);
      };
    },

    getSnapshot: () => status,

    refresh,

    async connect() {
      try {
        if ((await readStatus()) !== 'available') return { kind: 'unavailable' };
        const stored = await settings();
        const write = stored['health.writeBack'] ? [...HEALTH_WRITE_KINDS] : [];
        const granted = cleanGrants(
          await plugin.requestPermissions({ read: [...HEALTH_READ_KINDS], write }),
        );
        patch({ granted });
        if (granted.read.length === 0) return { kind: 'refused' };
        await settingsRepo.set('health.connected', true);
      } catch (error) {
        return { kind: 'failed', code: failed('connecting', error) };
      }
      void sync();
      return { kind: 'connected' };
    },

    async disconnect() {
      await settingsRepo.set('health.connected', false);
    },

    sync,

    async setCountActiveCalories(on) {
      await settingsRepo.set('health.countActiveCalories', on);
    },

    async setImportWeights(on) {
      await settingsRepo.set('health.importWeights', on);
      if (on) void sync();
    },

    async setWriteBack(on) {
      try {
        if (!on) {
          await settingsRepo.set('health.writeBack', false);
          return { kind: 'off' };
        }
        const answer = cleanGrants(
          await plugin.requestPermissions({ read: [], write: [...HEALTH_WRITE_KINDS] }),
        );
        // The answer may name only what was asked: read the whole picture again.
        await readStatus();
        const write = new Set([...answer.write, ...(status.granted?.write ?? [])]);
        if (write.size === 0) return { kind: 'refused' };
        await settingsRepo.set('health.writeBack', true);
      } catch (error) {
        return { kind: 'failed', code: failed('turning write-back on', error) };
      }
      void send();
      return { kind: 'on' };
    },

    async openHealthConnect() {
      await plugin.openHealthConnectSettings();
    },

    async idle() {
      while (syncRun || sendRun || background.size > 0) {
        await Promise.all([syncRun, sendRun, ...background]);
      }
    },
  };
}
