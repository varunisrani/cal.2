import { describe, expect, it, onTestFinished, vi } from 'vitest';
import {
  appBus,
  createBus,
  isAppMessage,
  type AppBus,
  type AppMessage,
  type MessageOrigin,
} from './bus';

let channels = 0;

/** A channel name of its own for each test. */
function channelName(): string {
  channels += 1;
  return `platewise-bus-test-${channels}`;
}

/** A bus that records what it hears and lets a test wait for the next message. */
function tab(name: string) {
  const bus = createBus(name);
  onTestFinished(() => bus.close());
  const heard: [AppMessage, MessageOrigin][] = [];
  const waiters: ((message: AppMessage) => void)[] = [];
  bus.subscribe((message, origin) => {
    heard.push([message, origin]);
    waiters.shift()?.(message);
  });
  const next = () => new Promise<AppMessage>((resolve) => waiters.push(resolve));
  return { bus, heard, next };
}

describe('createBus', () => {
  it('delivers a posted message to this tab and to another tab', async () => {
    const name = channelName();
    const here = tab(name);
    const there = tab(name);
    const arrived = there.next();

    here.bus.post({ type: 'erase' });

    expect(here.heard).toEqual([[{ type: 'erase' }, 'this-tab']]);
    expect(await arrived).toEqual({ type: 'erase' });
    expect(there.heard).toEqual([[{ type: 'erase' }, 'other-tab']]);
  });

  it('carries every app message from one tab to the other', async () => {
    const name = channelName();
    const here = tab(name);
    const there = tab(name);
    const messages: AppMessage[] = [
      { type: 'reload-needed', reason: 'upgrade' },
      { type: 'goal-reached', weighInId: 'weigh-3', kg: 64.8 },
      { type: 'settings-loaded' },
    ];
    for (const message of messages) {
      const arrived = there.next();
      here.bus.post(message);
      expect(await arrived).toEqual(message);
    }
  });

  it('ignores malformed messages from other tabs', async () => {
    const name = channelName();
    const there = tab(name);
    const olderBuild = new BroadcastChannel(name);
    onTestFinished(() => olderBuild.close());
    const arrived = there.next();

    olderBuild.postMessage({ type: 'reload-needed', reason: 'because' });
    olderBuild.postMessage({ type: 'shutdown' });
    olderBuild.postMessage('erase');
    olderBuild.postMessage({ type: 'settings-loaded' });

    expect(await arrived).toEqual({ type: 'settings-loaded' });
    expect(there.heard).toHaveLength(1);
  });

  it('stops sending and receiving once closed', async () => {
    const name = channelName();
    const here = tab(name);
    const there = tab(name);
    const third = tab(name);

    there.bus.close();
    there.bus.post({ type: 'erase' });
    expect(there.heard).toEqual([]);

    const arrived = third.next();
    here.bus.post({ type: 'settings-loaded' });
    await arrived;
    expect(there.heard).toEqual([]);
  });

  it('removes one listener without touching the others', () => {
    const bus = createBus(channelName());
    onTestFinished(() => bus.close());
    const first: AppMessage[] = [];
    const second: AppMessage[] = [];
    const stopFirst = bus.subscribe((message) => first.push(message));
    bus.subscribe((message) => second.push(message));
    stopFirst();
    bus.post({ type: 'erase' });
    expect([first, second]).toEqual([[], [{ type: 'erase' }]]);
  });

  it('still delivers in this tab when the browser has no BroadcastChannel', () => {
    vi.stubGlobal('BroadcastChannel', undefined);
    onTestFinished(() => {
      vi.unstubAllGlobals();
    });
    const bus: AppBus = createBus(channelName());
    const heard: AppMessage[] = [];
    bus.subscribe((message) => heard.push(message));
    bus.post({ type: 'reload-needed', reason: 'deleted' });
    expect(heard).toEqual([{ type: 'reload-needed', reason: 'deleted' }]);
    bus.close();
  });
});

describe('isAppMessage', () => {
  it('accepts the four app messages', () => {
    expect(isAppMessage({ type: 'erase' })).toBe(true);
    expect(isAppMessage({ type: 'reload-needed', reason: 'deleted' })).toBe(true);
    expect(isAppMessage({ type: 'goal-reached', weighInId: 'weigh-1', kg: 60 })).toBe(true);
    expect(isAppMessage({ type: 'settings-loaded' })).toBe(true);
  });

  it('rejects unknown types, missing or wrong fields and non-objects', () => {
    expect(isAppMessage({ type: 'reload-needed' })).toBe(false);
    expect(isAppMessage({ type: 'goal-reached', weighInId: 'weigh-1', kg: Number.NaN })).toBe(
      false,
    );
    expect(isAppMessage({ type: 'goal-reached', kg: 60 })).toBe(false);
    expect(isAppMessage({ type: 'Erase' })).toBe(false);
    for (const value of [null, undefined, 'erase', 3, []]) expect(isAppMessage(value)).toBe(false);
  });
});

describe('appBus', () => {
  it('is one shared bus for the app', () => {
    expect(appBus()).toBe(appBus());
  });
});
