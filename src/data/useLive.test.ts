import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { WaterLog } from '../domain/model';
import { countRuns, openTestDb } from '../test/db';
import { makeWater } from '../test/factories';
import type { LiveState } from './live';
import type { PlatewiseDb } from './schema';
import { useLive } from './useLive';

/** Renders a hook, records every render's state, and waits (inside act) for a state. */
function track<T, P>(hook: (props: P) => LiveState<T>, initialProps: NoInfer<P>) {
  const renders: LiveState<T>[] = [];
  const waiters: Array<{ matches: (state: LiveState<T>) => boolean; resolve: () => void }> = [];
  const view = renderHook(
    (props: P) => {
      const state = hook(props);
      renders.push(state);
      for (const waiter of [...waiters]) {
        if (waiter.matches(state)) {
          waiters.splice(waiters.indexOf(waiter), 1);
          waiter.resolve();
        }
      }
      return state;
    },
    { initialProps },
  );
  return {
    ...view,
    renders,
    async until(matches: (state: LiveState<T>) => boolean): Promise<void> {
      await act(async () => {
        if (matches(view.result.current)) return;
        await new Promise<void>((resolve) => waiters.push({ matches, resolve }));
      });
    },
  };
}

function ready<T>(predicate: (value: T) => boolean = () => true) {
  return (state: LiveState<T>) => state.status === 'ready' && predicate(state.value);
}

const closers: Array<() => void> = [];

afterEach(() => {
  for (const close of closers.splice(0)) close();
});

/** Water logs of one day; every hook made by the returned function shares one run counter. */
function waterOnDay(db: PlatewiseDb) {
  const counted = countRuns((dayKey: string) =>
    db.water.where('dayKey').equals(dayKey).sortBy('id'),
  );
  closers.push(() => counted.close());
  const useWater = (day: string) => useLive(() => counted.query(day), [day]);
  return { hook: useWater, counted };
}

describe('useLive', () => {
  it('renders loading first, then the rows', async () => {
    const { db } = await openTestDb();
    const log = makeWater({ dayKey: '2026-10-26' });
    await db.water.put(log);
    const view = track(waterOnDay(db).hook, '2026-10-26');
    expect(view.renders[0]).toEqual({ status: 'loading' });
    await view.until(ready());
    expect(view.result.current).toEqual({ status: 'ready', value: [log] });
    view.unmount();
    db.close();
  });

  it('renders again with the new rows after a write', async () => {
    const { db } = await openTestDb();
    const view = track(waterOnDay(db).hook, '2026-10-26');
    await view.until(ready());
    const log = makeWater({ dayKey: '2026-10-26' });
    await act(async () => {
      await db.water.put(log);
    });
    await view.until(ready<WaterLog[]>((rows) => rows.length === 1));
    expect(view.result.current).toEqual({ status: 'ready', value: [log] });
    view.unmount();
    db.close();
  });

  it('does not render again when an identical row is written', async () => {
    const { db } = await openTestDb();
    const log = makeWater({ dayKey: '2026-10-26' });
    await db.water.put(log);
    const { hook, counted } = waterOnDay(db);
    const view = track(hook, '2026-10-26');
    await view.until(ready());
    const renders = view.renders.length;
    const runs = counted.runs();

    await act(async () => {
      await db.water.put({ ...log });
      await counted.untilRuns(runs + 1);
    });
    expect(view.renders).toHaveLength(renders);
    view.unmount();
    db.close();
  });

  it('renders the error state of a thrown query', async () => {
    const { db } = await openTestDb();
    const view = track(
      () =>
        useLive(async () => {
          await db.water.count();
          throw new Error('bad query');
        }, []),
      null,
    );
    await view.until((state) => state.status === 'error');
    expect(view.result.current).toEqual({ status: 'error', error: new Error('bad query') });
    view.unmount();
    db.close();
  });

  it('runs a new query when its deps change', async () => {
    const { db } = await openTestDb();
    const monday = makeWater({ dayKey: '2026-10-26' });
    const tuesday = makeWater({ dayKey: '2026-10-27' });
    await db.water.bulkPut([monday, tuesday]);
    const view = track(waterOnDay(db).hook, '2026-10-26');
    await view.until(ready<WaterLog[]>((rows) => rows[0]?.id === monday.id));

    view.rerender('2026-10-27');
    await view.until(ready<WaterLog[]>((rows) => rows[0]?.id === tuesday.id));
    expect(view.result.current).toEqual({ status: 'ready', value: [tuesday] });
    view.unmount();
    db.close();
  });

  it('keeps the same query when it re-renders with equal deps', async () => {
    const { db } = await openTestDb();
    const view = track(waterOnDay(db).hook, '2026-10-26');
    await view.until(ready());
    const shown = view.result.current;
    view.rerender('2026-10-26');
    // A new query would start over from loading.
    expect(view.result.current).toBe(shown);
    view.unmount();
    db.close();
  });

  it('stops the query when the component unmounts', async () => {
    const { db } = await openTestDb();
    const { hook, counted } = waterOnDay(db);
    const view = track(hook, '2026-10-26');
    await view.until(ready());
    view.unmount();
    const runs = counted.runs();

    // A component still mounted sees the next write; the unmounted one must not run for it.
    const witness = waterOnDay(db);
    const other = track(witness.hook, '2026-10-26');
    await other.until(ready());
    await act(async () => {
      await db.water.put(makeWater({ dayKey: '2026-10-26' }));
      await witness.counted.untilRuns(2);
    });
    expect(counted.runs()).toBe(runs);
    other.unmount();
    db.close();
  });
});
