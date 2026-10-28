// Reminders in the Android app (P13, D-16.92): Android shows them at their time, with Platewise
// closed too, from the list the app hands it. This module is the app's side: the notification
// permission (`access`) and an engine with the web engine's interface (`engine`) whose check hands
// the system the whole plan (`nativePlan.ts`) instead of showing anything itself.
//
// A check runs when the engine starts (the app opens), when the page comes back to the front
// (a permission changed in Android's settings, the clock or zone moved), after a stored change
// that may move a reminder (a switch, a time, the running fast, a written reminder, the diary for
// the summary), and when asked. It reads the permission afresh; when Android does not allow
// notifications or the switch is off, it takes back everything the system holds. Otherwise it
// takes back what is no longer wanted and hands over only what is new or changed; the check when
// the app starts hands everything over again, since Android drops the alarms of an app that was
// force-stopped while the plugin still lists them. Checks never overlap, and those requested
// during one become one more. `stop` (erase everything) takes back every notification at once.
//
// The plugin is the only way to the system, so tests pass a stand-in; `native.ts` passes the real
// one, inside the Android app only.
//
// P17: with `nudgeFacts` the plan also holds the nudges Platewise works out (D-16.100), each kind in
// its own channel (`channels`); every plan handed over is reported (`onHandedOver`) and so is every
// notification Android shows while the app runs (`onShown`), for the inbox (D-16.103).

import type { DayKey } from '../../domain/dates/dayKey';
import type { Fast } from '../../domain/model';
import type { Clock } from '../../lib/clock';
import { targetOf } from '../notifications/open';
import type { PageVisibility, ReminderEngine, ReminderSettings } from './engine';
import { fastGoalWanted } from './engine';
import {
  NATIVE_IDS,
  CHANNEL_ID,
  immediateRequest,
  nativePlan,
  summaryDays,
  type NativeRequest,
  type NudgeFacts,
  type OpenTarget,
  type WriteMessage,
} from './nativePlan';
import type { NotificationAccess, NotificationState, NotificationWorker } from './notifier';
import type { DayTotals } from './schedule';

// ---- The plugin -------------------------------------------------------------------------------

/** The plugin's permission answer for showing notifications. */
export interface PluginPermission {
  readonly display: string;
}

/** A notification the plugin already holds. */
export interface PendingNotification {
  readonly id: number;
  readonly extra?: unknown;
}

/** What a tap on a notification reports. */
export interface PluginAction {
  readonly actionId?: string;
  readonly notification?: { readonly id?: unknown; readonly extra?: unknown } | null;
}

/** The plugin's events used here: a tap, and a notification shown while the app runs (P17). */
export type PluginEvent = 'localNotificationActionPerformed' | 'localNotificationReceived';

export interface PluginChannel {
  readonly id: string;
  readonly name: string;
  readonly description?: string;
  /** Android's importance, 1–5; 3 makes a sound without popping up. */
  readonly importance?: 1 | 2 | 3 | 4 | 5;
}

/** The parts of `@capacitor/local-notifications` used here. */
export interface NotificationsPlugin {
  schedule(options: { notifications: NativeRequest[] }): Promise<unknown>;
  cancel(options: { notifications: { id: number }[] }): Promise<void>;
  getPending(): Promise<{ notifications: PendingNotification[] }>;
  checkPermissions(): Promise<PluginPermission>;
  requestPermissions(): Promise<PluginPermission>;
  createChannel(channel: PluginChannel): Promise<void>;
  addListener(
    eventName: PluginEvent,
    listener: (action: PluginAction) => void,
  ): Promise<{ remove(): Promise<void> }>;
}

// ---- The permission ---------------------------------------------------------------------------

/**
 * The plugin's answer as the app reads it. "Asked before and refused" (`prompt-with-rationale`)
 * counts as refused, so the pointer to Android's settings shows; pressing the switch still asks.
 */
export function permissionOf(display: string): NotificationState {
  if (display === 'granted') return 'granted';
  if (display === 'denied' || display === 'prompt-with-rationale') return 'denied';
  return 'default';
}

/** Android's permission, kept as last read so `state()` can answer at once. */
export interface NativeAccess extends NotificationAccess {
  readonly system: 'android';
  refresh(): Promise<NotificationState>;
}

// ---- The engine -------------------------------------------------------------------------------

export interface NativeReminderDeps {
  readonly plugin: NotificationsPlugin;
  readonly clock: Clock;
  readonly visibility: PageVisibility;
  /** The stored reminder, tracking and energy-unit settings, once they have been read. */
  settings(): Promise<ReminderSettings>;
  /** The running fast, or null. */
  activeFast(): Promise<Fast | null>;
  /** One day's energy for the summary. */
  todayTotals(day: DayKey): Promise<DayTotals>;
  /** Calls `onChange` after each stored change that may move a reminder; returns the stop. */
  watch?(onChange: () => void): () => void;
  readonly write: WriteMessage;
  /** The channel's name and description in Android's settings. */
  readonly channel: { readonly name: string; readonly description: string };
  /** A notification was tapped: show what it is about (`id` is the notification's, when known). */
  onOpen(target: OpenTarget, id?: number): void;
  /** P17: what the nudges are planned from; without it none are planned. */
  nudgeFacts?(settings: ReminderSettings, now: number): Promise<NudgeFacts>;
  /** P17: the other channels to make (one per kind Platewise sends by itself). */
  readonly channels?: readonly PluginChannel[];
  /** P17: called with every plan handed over in full, and the time it was handed over. */
  onHandedOver?(plan: readonly NativeRequest[], now: number): void | Promise<void>;
  /** P17: Android showed a notification while the app runs. */
  onShown?(): void;
  /** A check or a plugin call that failed; defaults to the console. */
  onError?(error: unknown): void;
}

export interface NativeReminders {
  readonly access: NativeAccess;
  readonly engine: ReminderEngine;
}

function reportToConsole(error: unknown): void {
  console.error('Platewise: reminders could not be handed to Android', error);
}

function keyOf(extra: unknown): string | null {
  if (typeof extra !== 'object' || extra === null) return null;
  const key = (extra as { key?: unknown }).key;
  return typeof key === 'string' ? key : null;
}

function tapped(action: PluginAction): { open: OpenTarget; id: number | undefined } {
  const extra = action.notification?.extra;
  const open =
    typeof extra === 'object' && extra !== null ? (extra as { open?: unknown }).open : undefined;
  const id = action.notification?.id;
  return { open: targetOf(open), id: typeof id === 'number' ? id : undefined };
}

export function createNativeReminders(deps: NativeReminderDeps): NativeReminders {
  const { plugin, clock, visibility } = deps;
  const onError = deps.onError ?? reportToConsole;

  let permission: NotificationState = 'default';

  const access: NativeAccess = {
    system: 'android',

    state: () => permission,

    async refresh() {
      try {
        permission = permissionOf((await plugin.checkPermissions()).display);
      } catch (error) {
        onError(error);
      }
      return permission;
    },

    async request() {
      try {
        // Android shows its dialog once or twice; after that it answers without asking.
        const answer = (await plugin.requestPermissions()).display;
        permission = answer === 'granted' ? 'granted' : 'denied';
      } catch (error) {
        onError(error);
      }
      return permission;
    },

    async worker(): Promise<NotificationWorker> {
      return {
        async showNotification(title, options) {
          const shown = immediateRequest(NATIVE_IDS.goalReached, title, options?.body ?? '');
          await plugin.schedule({ notifications: [shown] });
        },
      };
    },
  };

  let running = false;
  // Bumped by start and stop: a check from before the bump drops what it found.
  let generation = 0;
  let stops: (() => void)[] = [];
  let tail: Promise<void> = Promise.resolve();
  // A check requested but not begun, and whether one of its requests wants everything handed over.
  let waiting: { all: boolean } | null = null;
  // A full hand-over that has not gone through yet (it failed, or was dropped by a stop).
  let fullOwed = false;
  // The ids the system held after the last check, for `stop` to take back at once.
  let held = new Set<number>();
  let channelReady: Promise<void> | null = null;

  /** Our channels, made once (Android keeps them; making one again only renames it). */
  function ensureChannel(): Promise<void> {
    channelReady ??= Promise.all(
      [{ id: CHANNEL_ID, importance: 3 as const, ...deps.channel }, ...(deps.channels ?? [])].map(
        (channel) => plugin.createChannel(channel).catch((error: unknown) => onError(error)),
      ),
    ).then(() => undefined);
    return channelReady;
  }

  async function totalsFor(settings: ReminderSettings, now: number) {
    const totals = new Map<DayKey, DayTotals | null>();
    if (!settings['remind.summary'].on) return totals;
    for (const day of summaryDays(settings['remind.summary'].at, now)) {
      let read: DayTotals | null = null;
      try {
        read = await deps.todayTotals(day);
      } catch (error) {
        onError(error);
      }
      totals.set(day, read);
    }
    return totals;
  }

  async function check(all: boolean): Promise<void> {
    const run = generation;
    fullOwed ||= all;
    await ensureChannel();
    const permitted = (await access.refresh()) === 'granted';
    const settings = await deps.settings();
    const wanted = permitted && settings['remind.master'];
    const nudging = permitted && deps.nudgeFacts !== undefined;
    const fast = (wanted && fastGoalWanted(settings)) || nudging ? await deps.activeFast() : null;
    const now = clock.now();
    const totals = wanted ? await totalsFor(settings, now) : new Map<DayKey, null>();
    const nudges = nudging ? await deps.nudgeFacts!(settings, now) : undefined;
    const plan = nativePlan(
      { settings, permitted, fast, totals, now, ...(nudges ? { nudges } : {}) },
      deps.write,
    );
    const pending = (await plugin.getPending()).notifications;
    if (run !== generation) return;

    const planned = new Set(plan.map((each) => each.id));
    const stale = pending.filter((each) => !planned.has(each.id)).map(({ id }) => ({ id }));
    const heldKeys = new Map(pending.map((each) => [each.id, keyOf(each.extra)]));
    const fresh = fullOwed ? plan : plan.filter((each) => heldKeys.get(each.id) !== each.extra.key);
    held = planned;
    if (stale.length > 0) await plugin.cancel({ notifications: stale });
    if (fresh.length > 0) await plugin.schedule({ notifications: fresh });
    fullOwed = false;
    await deps.onHandedOver?.(plan, now);
  }

  function request(all: boolean): Promise<void> {
    if (!running) return tail;
    if (waiting !== null) {
      waiting.all ||= all;
      return tail;
    }
    const next = { all };
    waiting = next;
    tail = tail.then(async () => {
      if (waiting === next) waiting = null;
      if (!running) return;
      try {
        await check(next.all);
      } catch (error) {
        onError(error);
      }
    });
    return tail;
  }

  function listen(run: number, event: PluginEvent, onEvent: (action: PluginAction) => void) {
    plugin
      .addListener(event, (action) => {
        if (run === generation) onEvent(action);
      })
      .then(
        (handle) => {
          // Stopped before the listener was in place: take it out again.
          if (run !== generation) void handle.remove();
          else stops.push(() => void handle.remove());
        },
        (error: unknown) => onError(error),
      );
  }

  function listenForTaps(run: number): void {
    listen(run, 'localNotificationActionPerformed', (action) => {
      const { open, id } = tapped(action);
      if (id === undefined) deps.onOpen(open);
      else deps.onOpen(open, id);
    });
    const { onShown } = deps;
    if (onShown) listen(run, 'localNotificationReceived', () => onShown());
  }

  const engine: ReminderEngine = {
    start() {
      if (running) return;
      running = true;
      generation += 1;
      stops = [
        visibility.subscribe(() => {
          if (visibility.isVisible()) void request(false);
        }),
      ];
      if (deps.watch) stops.push(deps.watch(() => void request(false)));
      // A tap that opened the app waits in the plugin until this listener comes.
      listenForTaps(generation);
      void request(true);
    },

    refresh: () => request(false),

    stop() {
      if (!running) return;
      running = false;
      generation += 1;
      waiting = null;
      for (const stopOne of stops) stopOne();
      stops = [];
      // Erase everything: nothing may come after it. Sent at once, before any await.
      const ids = new Set(held);
      held = new Set();
      if (ids.size > 0) {
        plugin
          .cancel({ notifications: [...ids].map((id) => ({ id })) })
          .catch((error: unknown) => onError(error));
      }
      // And whatever the system holds that no check has seen yet.
      tail = tail.then(async () => {
        try {
          const { notifications } = await plugin.getPending();
          if (notifications.length > 0) {
            await plugin.cancel({ notifications: notifications.map(({ id }) => ({ id })) });
          }
        } catch (error) {
          onError(error);
        }
      });
    },

    async settled() {
      let seen: Promise<void>;
      do {
        seen = tail;
        await seen;
      } while (seen !== tail);
    },
  };

  return { access, engine };
}
