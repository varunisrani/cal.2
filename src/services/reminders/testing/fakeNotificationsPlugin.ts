// A stand-in for `@capacitor/local-notifications` as the Android shell has it, kept in memory:
// `schedule` replaces a notification by id and keeps those with a schedule (one shown at once is
// not kept, as on Android), `cancel` takes them back, `getPending` lists what waits, the
// permission is a field, and a tap made before any listener waits for one. P17: `shown` reports a
// notification Android showed while the app runs.

import type { NativeRequest } from '../nativePlan';
import type { NotificationsPlugin, PluginAction, PluginEvent } from '../nativeSync';

/** The plugin as the Android shell has it, kept in memory. */
export class FakeNotificationsPlugin implements NotificationsPlugin {
  /** What the system holds, by id (notifications shown at once are not kept, as on Android). */
  readonly held = new Map<number, NativeRequest>();
  readonly shownAtOnce: NativeRequest[] = [];
  readonly scheduled: number[][] = [];
  readonly cancelled: number[][] = [];
  readonly channels: unknown[] = [];
  display = 'granted';
  answer = 'granted';
  failSchedule: Error | null = null;
  private listener: ((action: PluginAction) => void) | null = null;
  private shownListener: ((action: PluginAction) => void) | null = null;
  /** A tap from before any listener: the plugin keeps it until one comes. */
  private kept: PluginAction | null = null;

  async schedule({ notifications }: { notifications: NativeRequest[] }) {
    if (this.failSchedule) throw this.failSchedule;
    if (this.display !== 'granted') throw new Error('Notifications not enabled on this device');
    this.scheduled.push(notifications.map((each) => each.id));
    for (const each of notifications) {
      if (each.schedule) this.held.set(each.id, each);
      else this.shownAtOnce.push(each);
    }
    return { notifications: notifications.map(({ id }) => ({ id })) };
  }

  async cancel({ notifications }: { notifications: { id: number }[] }) {
    this.cancelled.push(notifications.map(({ id }) => id));
    for (const { id } of notifications) this.held.delete(id);
  }

  async getPending() {
    return {
      notifications: [...this.held.values()].map(({ id, extra }) => ({ id, extra })),
    };
  }

  async checkPermissions() {
    return { display: this.display };
  }

  async requestPermissions() {
    this.display = this.answer;
    return { display: this.answer };
  }

  async createChannel(channel: unknown) {
    this.channels.push(channel);
  }

  async addListener(event: PluginEvent, listener: (action: PluginAction) => void) {
    if (event === 'localNotificationReceived') {
      this.shownListener = listener;
      return {
        remove: async () => {
          if (this.shownListener === listener) this.shownListener = null;
        },
      };
    }
    this.listener = listener;
    if (this.kept) listener(this.kept);
    this.kept = null;
    return {
      remove: async () => {
        if (this.listener === listener) this.listener = null;
      },
    };
  }

  tap(extra: unknown, id?: number): void {
    const action = {
      actionId: 'tap',
      notification: { extra, ...(id === undefined ? {} : { id }) },
    };
    if (this.listener) this.listener(action);
    else this.kept = action;
  }

  /** Android showed a notification while the app runs. */
  shown(id: number): void {
    this.shownListener?.({ notification: { id } });
  }

  ids(): number[] {
    return [...this.held.keys()].sort((a, b) => a - b);
  }
}
