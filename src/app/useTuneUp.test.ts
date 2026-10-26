import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  GEMINI,
  goalsHarness,
  planReply,
  useFakeClock,
} from '../services/goals/__fixtures__/harness';
import { createTuneUpRunner, type TuneUpCheck, type TuneUpOutcome } from '../services/goals/tuneUp';
import { useTuneUp, type PageVisibility, type TuneUpLifecycle } from './useTuneUp';

beforeEach(() => {
  useFakeClock();
});

/** A page whose visibility the test sets; every change tells the listeners. */
function testPage(visible = true) {
  let shown = visible;
  const listeners = new Set<() => void>();
  const page: PageVisibility = {
    isVisible: () => shown,
    subscribe(onChange) {
      listeners.add(onChange);
      return () => listeners.delete(onChange);
    },
  };
  return {
    page,
    listeners,
    show(next: boolean) {
      shown = next;
      for (const listener of [...listeners]) listener();
    },
  };
}

const NOTHING: TuneUpOutcome = { kind: 'unchanged', why: 'notDue' };

/** A runner that records the triggers it gets. */
function recordingRunner() {
  const triggers: TuneUpCheck[] = [];
  const runner = {
    check: vi.fn(async (trigger: TuneUpCheck) => {
      triggers.push(trigger);
      return NOTHING;
    }),
  };
  return { runner, triggers };
}

function renderTuneUp(props: TuneUpLifecycle) {
  return renderHook((current: TuneUpLifecycle) => useTuneUp(current), { initialProps: props });
}

describe('useTuneUp', () => {
  it('sends open once when it mounts with onboarding done', () => {
    const { runner, triggers } = recordingRunner();
    const { page } = testPage();

    const { rerender } = renderTuneUp({ runner, ready: true, visibility: page });
    rerender({ runner, ready: true, visibility: page });

    expect(triggers).toEqual(['open']);
  });

  it('sends nothing before onboarding is done, then open once it is', () => {
    const { runner, triggers } = recordingRunner();
    const { page, show } = testPage();

    const { rerender } = renderTuneUp({ runner, ready: false, visibility: page });
    show(false);
    show(true);
    expect(triggers).toEqual([]);

    rerender({ runner, ready: true, visibility: page });
    expect(triggers).toEqual(['open']);
  });

  it('sends visible each time the page comes back to the front, never when it is hidden', () => {
    const { runner, triggers } = recordingRunner();
    const { page, show } = testPage();
    renderTuneUp({ runner, ready: true, visibility: page });

    show(false);
    show(true);
    show(false);
    show(true);

    expect(triggers).toEqual(['open', 'visible', 'visible']);
  });

  it('stops listening when it unmounts', () => {
    const { runner, triggers } = recordingRunner();
    const { page, show, listeners } = testPage();
    const { unmount } = renderTuneUp({ runner, ready: true, visibility: page });

    unmount();
    show(true);

    expect(listeners.size).toBe(0);
    expect(triggers).toEqual(['open']);
  });

  it('follows the document by default', () => {
    const { runner, triggers } = recordingRunner();
    renderTuneUp({ runner, ready: true });

    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    document.dispatchEvent(new Event('visibilitychange'));

    expect(triggers).toEqual(['open', 'visible']);
  });

  it('logs a run that failed instead of leaving the rejection unhandled', async () => {
    const error = new Error('storage is gone');
    let failing: Promise<TuneUpOutcome> | undefined;
    const runner = { check: vi.fn(() => (failing = Promise.reject(error))) };
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});

    renderTuneUp({ runner, ready: true, visibility: testPage().page });
    // The hook's handler was attached first, so it has run once this one runs.
    await failing?.catch(() => undefined);

    expect(logged).toHaveBeenCalledWith('The weekly tune-up failed', error);
  });

  it('turns an open and three visible events during its run into one AI call (R01.5)', async () => {
    const h = await goalsHarness({
      settings: { 'tuneUp.on': true, 'tuneUp.lastCheckDay': '2026-10-19' },
    });
    h.fake.on(GEMINI, planReply());
    const real = createTuneUpRunner(h.deps);
    const outcomes: Promise<TuneUpOutcome>[] = [];
    const runner = {
      check(trigger: TuneUpCheck) {
        const outcome = real.check(trigger);
        outcomes.push(outcome);
        return outcome;
      },
    };
    const { page, show } = testPage();
    const hold = h.holdRequests();

    renderTuneUp({ runner, ready: true, visibility: page });
    await hold.reached;
    show(true);
    show(true);
    show(true);
    // Each visible trigger has read the stored state and found the run in flight.
    const skipped = await Promise.all(outcomes.slice(1));
    hold.release();
    const opened = await outcomes[0];

    expect(opened).toMatchObject({ kind: 'changed', kcal: 2_300 });
    expect(skipped).toEqual([
      { kind: 'unchanged', why: 'running' },
      { kind: 'unchanged', why: 'running' },
      { kind: 'unchanged', why: 'running' },
    ]);
    expect(h.fake.requests).toHaveLength(1);
  });
});
