// App messages between this tab and the app's other open tabs. Table changes do not travel here:
// Dexie announces every committed write to other tabs itself, and live queries re-run on it.

export const BUS_NAME = 'platewise';

/** Why a tab must reload: the database was upgraded by a newer build, or deleted. */
export type ReloadReason = 'upgrade' | 'deleted';

export type AppMessage =
  /** Everything is being erased: close the database connection and show a notice. */
  | { type: 'erase' }
  /** The database connection was closed under us; the page must reload. */
  | { type: 'reload-needed'; reason: ReloadReason }
  /** A new latest weigh-in reached the goal weight (P02-08). */
  | { type: 'goal-reached'; weighInId: string; kg: number }
  /** The first settings snapshot is in memory (P02-04). */
  | { type: 'settings-loaded' };

/** Where a message was posted: by this tab or by another one. */
export type MessageOrigin = 'this-tab' | 'other-tab';

export type BusListener = (message: AppMessage, origin: MessageOrigin) => void;

export interface AppBus {
  /** Delivers `message` to this tab's listeners and to every other tab's. */
  post(message: AppMessage): void;
  /** Returns the function that removes the listener. */
  subscribe(listener: BusListener): () => void;
  /** Stops sending and receiving; later posts are dropped. */
  close(): void;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** True for a well-formed app message. Other tabs may run an older build, so check everything. */
export function isAppMessage(value: unknown): value is AppMessage {
  if (!isRecord(value)) return false;
  switch (value.type) {
    case 'erase':
    case 'settings-loaded':
      return true;
    case 'reload-needed':
      return value.reason === 'upgrade' || value.reason === 'deleted';
    case 'goal-reached':
      return (
        typeof value.weighInId === 'string' &&
        typeof value.kg === 'number' &&
        Number.isFinite(value.kg)
      );
    default:
      return false;
  }
}

/** Opens a bus on a `BroadcastChannel`; without one (old browsers) it works in this tab only. */
export function createBus(name: string = BUS_NAME): AppBus {
  const listeners = new Set<BusListener>();
  let closed = false;
  const channel = typeof BroadcastChannel === 'function' ? new BroadcastChannel(name) : null;

  const deliver = (message: AppMessage, origin: MessageOrigin): void => {
    // A copy, so a listener that unsubscribes while being called does not skip the next one.
    for (const listener of [...listeners]) listener(message, origin);
  };

  if (channel) {
    channel.onmessage = (event: MessageEvent<unknown>) => {
      if (!closed && isAppMessage(event.data)) deliver(event.data, 'other-tab');
    };
  }

  return {
    post(message) {
      if (closed) return;
      channel?.postMessage(message);
      deliver(message, 'this-tab');
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    close() {
      closed = true;
      listeners.clear();
      channel?.close();
    },
  };
}

let shared: AppBus | null = null;

/** The app's bus, opened on first use. */
export function appBus(): AppBus {
  shared ??= createBus();
  return shared;
}
