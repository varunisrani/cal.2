import { afterEach, describe, expect, it, vi } from 'vitest';
import { appBus, createBus, isBusMessage, type Bus, type BusMessage } from './bus';

const NAME = 'platewise-bus-test';
const opened: Array<{ close(): void }> = [];

afterEach(() => {
  for (const item of opened.splice(0)) item.close();
  vi.unstubAllGlobals();
});

function tab(): Bus {
  const bus = createBus({ name: NAME });
  opened.push(bus);
  return bus;
}

/** Resolves with the first message a bus hears, and whether it came from another tab. */
function firstHeard(bus: Bus): Promise<[BusMessage, boolean]> {
  return new Promise((resolve) => {
    const stop = bus.subscribe((message, fromOtherTab) => {
      stop();
      resolve([message, fromOtherTab]);
    });
  });
}

describe('bus', () => {
  it('reaches another tab and the listeners of this tab', async () => {
    const here = tab();
    const there = tab();
    const heardHere: Array<[BusMessage, boolean]> = [];
    here.subscribe((message, fromOtherTab) => heardHere.push([message, fromOtherTab]));
    const heardThere = firstHeard(there);

    here.post({ type: 'goal-reached', kg: 59.8 });

    expect(heardHere).toEqual([[{ type: 'goal-reached', kg: 59.8 }, false]]);
    expect(await heardThere).toEqual([{ type: 'goal-reached', kg: 59.8 }, true]);
  });

  it('keeps a this-tab post away from other tabs', async () => {
    const here = tab();
    const there = tab();
    const heardThere = firstHeard(there);
    const heardHere: BusMessage[] = [];
    here.subscribe((message) => heardHere.push(message));

    here.post({ type: 'reload-needed' }, 'this-tab');
    here.post({ type: 'settings-loaded' });

    expect(heardHere).toEqual([{ type: 'reload-needed' }, { type: 'settings-loaded' }]);
    // Messages from one sender arrive in order, so the first one there is the second post.
    expect(await heardThere).toEqual([{ type: 'settings-loaded' }, true]);
  });

  it('ignores malformed messages from other tabs', async () => {
    const there = tab();
    const heard = firstHeard(there);
    const stranger = new BroadcastChannel(NAME);
    opened.push(stranger);

    stranger.postMessage('erase');
    stranger.postMessage({ type: 'wipe' });
    stranger.postMessage({ type: 'goal-reached', kg: 'sixty' });
    stranger.postMessage({ type: 'erase' });

    expect(await heard).toEqual([{ type: 'erase' }, true]);
  });

  it('still reaches this tab when the browser has no BroadcastChannel', () => {
    vi.stubGlobal('BroadcastChannel', undefined);
    const bus = createBus();
    const heard: BusMessage[] = [];
    bus.subscribe((message) => heard.push(message));
    bus.post({ type: 'erase' });
    expect(heard).toEqual([{ type: 'erase' }]);
  });

  it('delivers to the next listener when one throws', () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const bus = createBus({ channel: null });
    const heard: BusMessage[] = [];
    bus.subscribe(() => {
      throw new Error('broken screen');
    });
    bus.subscribe((message) => heard.push(message));
    bus.post({ type: 'settings-loaded' });
    expect(heard).toEqual([{ type: 'settings-loaded' }]);
    expect(errors).toHaveBeenCalledOnce();
  });

  it('stops delivering to a listener that unsubscribed, and posts nothing after close', () => {
    const bus = createBus({ channel: null });
    const heard: BusMessage[] = [];
    const stop = bus.subscribe((message) => heard.push(message));
    bus.post({ type: 'erase' });
    stop();
    bus.post({ type: 'erase' });
    bus.subscribe((message) => heard.push(message));
    bus.close();
    bus.post({ type: 'reload-needed' });
    expect(heard).toEqual([{ type: 'erase' }]);
  });

  it('closes its channel', () => {
    const channel = { postMessage: vi.fn(), close: vi.fn(), onmessage: null };
    const bus = createBus({ channel });
    expect(channel.onmessage).toBeTypeOf('function');
    bus.close();
    bus.close();
    expect(channel.close).toHaveBeenCalledOnce();
    expect(channel.onmessage).toBeNull();
  });

  it('gives the app one shared bus', () => {
    const bus = appBus();
    opened.push(bus);
    expect(appBus()).toBe(bus);
  });
});

describe('isBusMessage', () => {
  it('accepts the four message types with valid payloads', () => {
    for (const message of [
      { type: 'erase' },
      { type: 'reload-needed' },
      { type: 'settings-loaded' },
      { type: 'goal-reached', kg: 72.5 },
    ]) {
      expect(isBusMessage(message), JSON.stringify(message)).toBe(true);
    }
  });

  it('rejects anything else', () => {
    for (const value of [
      null,
      'erase',
      {},
      { type: 'Erase' },
      { type: 'goal-reached' },
      { type: 'goal-reached', kg: Number.NaN },
      [{ type: 'erase' }],
    ]) {
      expect(isBusMessage(value), JSON.stringify(value)).toBe(false);
    }
  });
});
