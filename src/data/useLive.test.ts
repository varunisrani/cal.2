import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { DiaryEntry, WaterLog } from '../domain/model';
import { openTestDb } from '../test/db';
import { factories } from '../test/factories';
import { ready, tappedQuery, watch } from '../test/live';
import { feedOf, live, type LiveFeed } from './live';
import { useFeed, useLive } from './useLive';

// The real `live`, recorded, so a test can wait on the feed a hook made (an event, not a timer).
vi.mock('./live', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./live')>();
  return { ...actual, live: vi.fn(actual.live) };
});

/** The feed the most recent `live()` call made (inside useLive). */
function lastFeed<T>(): LiveFeed<T> {
  const made = vi.mocked(live).mock.results.at(-1);
  if (made?.type !== 'return') throw new Error('useLive has not made a feed yet');
  return made.value as LiveFeed<T>;
}

const make = factories();
const totalMl = (rows: WaterLog[]) => rows.reduce((sum, row) => sum + row.ml, 0);

describe('useLive', () => {
  it('starts loading and renders the answer once it arrives', async () => {
    const db = await openTestDb();
    await db.water.put(make.water({ ml: 250 }));
    const { result } = renderHook(() => useLive(() => db.water.toArray(), [db]));
    expect(result.current).toEqual({ status: 'loading' });

    await act(() => watch(lastFeed<WaterLog[]>()).until(ready()));
    expect(result.current).toMatchObject({ status: 'ready', value: [{ ml: 250 }] });
  });

  it('renders again when a write changes the answer, and only then', async () => {
    const db = await openTestDb();
    let renders = 0;
    const { result } = renderHook(() => {
      renders += 1;
      return useLive(() => db.water.toArray(), [db]);
    });
    const feed = watch(lastFeed<WaterLog[]>());
    await act(() => feed.until(ready()));
    const rendersWhenReady = renders;

    await act(async () => {
      await db.water.put(make.water({ ml: 400 }));
      await feed.until(ready((rows: WaterLog[]) => totalMl(rows) === 400));
    });
    expect(result.current).toMatchObject({ status: 'ready', value: [{ ml: 400 }] });
    expect(renders).toBe(rendersWhenReady + 1);
  });

  it('shows a failing query as an error value instead of throwing', async () => {
    const { result } = renderHook(() =>
      useLive(async (): Promise<number> => {
        throw new Error('no such index');
      }, []),
    );
    await act(() => watch(lastFeed<number>()).until((state) => state.status === 'error'));
    expect(result.current).toEqual({ status: 'error', error: new Error('no such index') });
  });

  it('rebuilds the query when a dependency changes', async () => {
    const db = await openTestDb();
    const today = make.entry();
    const yesterday = make.entry({ loggedAt: today.loggedAt - 86_400_000 });
    await db.entries.bulkPut([today, yesterday]);
    const { result, rerender } = renderHook(
      ({ dayKey }: { dayKey: string }) =>
        useLive(() => db.entries.where('dayKey').equals(dayKey).toArray(), [db, dayKey]),
      { initialProps: { dayKey: today.dayKey } },
    );
    await act(() => watch(lastFeed<DiaryEntry[]>()).until(ready()));
    expect(result.current).toMatchObject({ value: [{ id: today.id }] });

    rerender({ dayKey: yesterday.dayKey });
    expect(result.current).toEqual({ status: 'loading' });
    await act(() => watch(lastFeed<DiaryEntry[]>()).until(ready()));
    expect(result.current).toMatchObject({ value: [{ id: yesterday.id }] });
  });

  it('stops the subscription when the component unmounts', async () => {
    const db = await openTestDb();
    let runs = 0;
    const { unmount } = renderHook(() =>
      useLive(async () => {
        runs += 1;
        return db.water.count();
      }, [db]),
    );
    const onHookFeed = watch(lastFeed<number>());
    await act(() => onHookFeed.until(ready()));
    // Another feed on the same table shows when live queries have re-run after a write.
    const probe = watch(live(() => db.water.count()));
    await probe.until(ready((count: number) => count === 0));

    onHookFeed.stop();
    unmount();
    const runsAtUnmount = runs;
    await db.water.put(make.water());
    await probe.until(ready((count: number) => count === 1));
    expect(runs).toBe(runsAtUnmount);
  });
});

describe('useFeed', () => {
  it('does not render again when an identical row is written', async () => {
    const db = await openTestDb();
    const entry = make.entry();
    await db.entries.put(entry);
    const query = tappedQuery(() => db.entries.toArray());
    const feed = feedOf(query.open);
    let renders = 0;
    const { result } = renderHook(() => {
      renders += 1;
      return useFeed(feed);
    });
    await act(() => query.answered(1));
    expect(result.current).toEqual({ status: 'ready', value: [entry] });
    const rendersWhenReady = renders;

    // Dexie delivers a fresh, equal copy of the rows; the component does not render.
    await act(async () => {
      await db.entries.put({ ...entry });
      await query.answered(2);
    });
    expect(renders).toBe(rendersWhenReady);

    await act(async () => {
      await db.entries.put(make.entry({ name: 'Fig' }));
      await query.answered(3);
    });
    expect(renders).toBe(rendersWhenReady + 1);
  });
});
