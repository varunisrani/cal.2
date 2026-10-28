import { describe, expect, it, vi } from 'vitest';
import { createCoachScreen } from './onScreen';

describe('the Coach screen as notifications see it (P17-03, D-16.102)', () => {
  it('says which chat it shows, and none once it is gone', () => {
    const screen = createCoachScreen();
    expect(screen.shown()).toBeNull();
    screen.show('chat-1');
    expect(screen.shown()).toBe('chat-1');
    screen.show(null);
    expect(screen.shown()).toBeNull();
  });

  it('keeps the chat a tap asked for until the screen takes it, telling its listeners', () => {
    const screen = createCoachScreen();
    const heard = vi.fn();
    const stop = screen.subscribe(heard);

    screen.ask('chat-2');
    screen.ask('chat-2');
    expect(screen.asked()).toBe('chat-2');
    screen.take();
    expect(screen.asked()).toBeNull();
    expect(heard).toHaveBeenCalledTimes(2);

    stop();
    screen.ask('chat-3');
    expect(heard).toHaveBeenCalledTimes(2);
  });
});
