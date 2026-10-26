// App messages that are not table changes, delivered to this tab's listeners and, through a
// BroadcastChannel, to every other open tab of the app. Table changes reach other tabs through
// Dexie's own broadcast, so they never go through here.

export type BusMessage =
  /** Everything is being erased: close the database connection and show a notice (P02-14). */
  | { type: 'erase' }
  /** The database moved on under this tab (another tab upgraded or deleted it): reload. */
  | { type: 'reload-needed' }
  /** A new latest weigh-in crossed the goal weight (P02-08). */
  | { type: 'goal-reached'; kg: number }
  /** The first settings snapshot is in memory (P02-04). */
  | { type: 'settings-loaded' };

/** `fromOtherTab` is false for messages this tab posted itself. */
export type BusListener = (message: BusMessage, fromOtherTab: boolean) => void;

/** Who receives a post: every tab including this one, or this tab only. */
export type BusReach = 'all-tabs' | 'this-tab';

export interface Bus {
  post(message: BusMessage, reach?: BusReach): void;
  subscribe(listener: BusListener): () => void;
  /** Stops receiving from and posting to other tabs; later posts do nothing. */
  close(): void;
}

/** The part of a BroadcastChannel the bus uses. */
export interface ChannelLike {
  postMessage(message: unknown): void;
  close(): void;
  onmessage: ((event: MessageEvent) => void) | null;
}

export const BUS_NAME = 'platewise';

/** True for a well-formed bus message (messages from other tabs are checked with this). */
export function isBusMessage(value: unknown): value is BusMessage {
  if (typeof value !== 'object' || value === null) return false;
  const { type } = value as { type?: unknown };
  switch (type) {
    case 'erase':
    case 'reload-needed':
    case 'settings-loaded':
      return true;
    case 'goal-reached': {
      const { kg } = value as { kg?: unknown };
      return typeof kg === 'number' && Number.isFinite(kg);
    }
    default:
      return false;
  }
}

function openChannel(name: string): ChannelLike | null {
  if (typeof BroadcastChannel === 'undefined') return null;
  try {
    return new BroadcastChannel(name);
  } catch {
    return null;
  }
}

export interface BusOptions {
  /** The channel name (tests use their own). */
  name?: string;
  /** The channel to other tabs; `null` keeps the bus inside this tab. Defaults to a new one. */
  channel?: ChannelLike | null;
}

export function createBus(options: BusOptions = {}): Bus {
  const channel =
    options.channel === undefined ? openChannel(options.name ?? BUS_NAME) : options.channel;
  const listeners = new Set<BusListener>();
  let closed = false;

  function deliver(message: BusMessage, fromOtherTab: boolean): void {
    for (const listener of [...listeners]) {
      try {
        listener(message, fromOtherTab);
      } catch (error) {
        // One broken listener must not keep the message from the others.
        console.error('A bus listener failed', error);
      }
    }
  }

  if (channel) {
    channel.onmessage = (event) => {
      if (!closed && isBusMessage(event.data)) deliver(event.data, true);
    };
  }

  return {
    post(message, reach = 'all-tabs') {
      if (closed) return;
      if (reach === 'all-tabs' && channel) channel.postMessage(message);
      deliver(message, false);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    close() {
      if (closed) return;
      closed = true;
      listeners.clear();
      if (channel) {
        channel.onmessage = null;
        channel.close();
      }
    },
  };
}

let shared: Bus | null = null;

/** The app's one bus, created on first use. */
export function appBus(): Bus {
  shared ??= createBus();
  return shared;
}
