import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { WALK_ROUTE } from '../../app/router';
import { DataProvider } from '../../data/DataProvider';
import { createWalkRepo } from '../../data/repos/walkRepo';
import { walk as walkWords } from '../../i18n/en/walk';
import { ServicesProvider } from '../../services/context';
import { createWalkService } from '../../services/walks/service';
import {
  fakeWalkTracker,
  type FakeWalkTracker,
} from '../../services/walks/testing/fakeWalkTracker';
import { movableClock, testPage, WALKER } from '../../services/walks/testing/walkHarness';
import { closeHarnesses, openHarness, until, untilShown } from '../../test/screenHarness';
import { WalkScreen } from './WalkScreen';

afterEach(closeHarnesses);

const words = walkWords.walk;

beforeAll(async () => {
  // Parts the summary draws on: loaded once, so no wait includes their first transform.
  await import('./WalkSummary');
});

function textOf(hook: string): string {
  return document.querySelector(`[data-ui="${hook}"]`)?.textContent ?? '';
}

function phase(): string | null {
  return document.querySelector('[data-ui="screen.walk"]')?.getAttribute('data-phase') ?? null;
}

async function untilPhase(kind: string): Promise<void> {
  await until(() => phase() === kind);
}

/** The Walk screen over a test database, a movable clock and the stand-in tracker. */
async function openWalk(
  options: { permissions?: Parameters<typeof fakeWalkTracker>[0]['permissions'] } = {},
) {
  const clock = movableClock();
  const h = await openHarness({ clock, hash: '#/home' });
  await h.repos.profileRepo.save(WALKER);
  await h.repos.settingsRepo.set('units.height', 'cm');
  const tracker: FakeWalkTracker = fakeWalkTracker({
    now: clock.now,
    tick: clock.move,
    ...(options.permissions ? { permissions: options.permissions } : {}),
  });
  const walkRepo = createWalkRepo(h.db);
  const service = createWalkService({
    plugin: tracker,
    walkRepo,
    profileRepo: h.repos.profileRepo,
    clock,
    visibility: testPage(),
  });
  h.router.navigate(WALK_ROUTE);
  h.mount(
    <ServicesProvider services={{ ...h.services, walks: service }}>
      <DataProvider sources={{ ...h.sources, walkRepo }}>
        <WalkScreen />
      </DataProvider>
    </ServicesProvider>,
  );
  await untilShown('[data-ui="walk.start"]');
  return { ...h, clock, tracker, walkRepo, service };
}

/** Moves the walk on and lets the tracker report it. */
async function walkOn(tracker: FakeWalkTracker, seconds: number): Promise<void> {
  await act(async () => {
    tracker.walk(seconds);
    tracker.emit();
  });
}

describe('WalkScreen (P15-03)', () => {
  it('explains each permission before Android asks, then starts the walk', async () => {
    await openWalk({ permissions: { location: 'prompt', activity: 'prompt' } });
    fireEvent.click(screen.getByRole('button', { name: words.idle.start }));
    await untilShown('[data-ui="walk.ask"]');
    const ask = within(screen.getByRole('region', { name: words.ask.title }));
    for (const reason of [
      words.ask.locationWhy,
      words.ask.activityWhy,
      words.ask.notificationsWhy,
    ]) {
      expect(ask.getByText(reason)).toBeVisible();
    }
    fireEvent.click(ask.getByRole('button', { name: words.ask.continue }));
    await untilPhase('active');
    expect(screen.getByRole('timer', { name: words.live.time })).toHaveTextContent('0:00');
  });

  it('goes back to Start from the explanation', async () => {
    await openWalk({ permissions: { location: 'prompt' } });
    fireEvent.click(screen.getByRole('button', { name: words.idle.start }));
    await untilShown('[data-ui="walk.ask"]');
    fireEvent.click(screen.getByRole('button', { name: words.ask.cancel }));
    await untilPhase('idle');
  });

  it('shows the time, distance, pace, steps, cadence, active calories and the route live', async () => {
    const w = await openWalk();
    fireEvent.click(screen.getByRole('button', { name: words.idle.start }));
    await untilPhase('active');
    await walkOn(w.tracker, 600);
    await until(() => textOf('walk.live.time') === '10:00');

    expect(textOf('walk.live.distance')).toBe(`${words.live.distance}0.9 km`);
    // 1.5 m/s is 11:07 a km.
    expect(textOf('walk.live.pace')).toBe(`${words.live.pace}11:07 /km`);
    expect(textOf('walk.live.steps')).toBe(`${words.live.steps}1,100`);
    expect(textOf('walk.live.cadence')).toBe(`${words.live.cadence}110 steps/min`);
    // 3.8 METs: (3.8 − 1) × 70 kg × 1/6 h.
    expect(textOf('walk.live.active')).toBe(`${words.live.active}33 kcal`);
    const route = screen.getByRole('img', { name: /^Route of the walk/ });
    expect(route.getAttribute('data-points')).toBe('301');
    expect(route.querySelector('path')?.getAttribute('d')).toMatch(/^M/);
  });

  it('pauses and resumes', async () => {
    const w = await openWalk();
    fireEvent.click(screen.getByRole('button', { name: words.idle.start }));
    await untilPhase('active');
    await walkOn(w.tracker, 30);
    fireEvent.click(screen.getByRole('button', { name: words.live.pause }));
    await until(
      () =>
        document.querySelector('[data-ui="walk.live"]')?.getAttribute('data-state') === 'paused',
    );
    expect(screen.getByText(words.live.paused)).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: words.live.resume }));
    await until(
      () =>
        document.querySelector('[data-ui="walk.live"]')?.getAttribute('data-state') === 'running',
    );
  });

  it('says what is missing without location and steps', async () => {
    const w = await openWalk({ permissions: { location: 'denied', activity: 'denied' } });
    fireEvent.click(screen.getByRole('button', { name: words.idle.start }));
    await untilPhase('active');
    await walkOn(w.tracker, 60);
    expect(screen.getByText(words.live.noRoute)).toBeVisible();
    expect(screen.getByText(words.live.noSteps)).toBeVisible();
    expect(screen.getByText(words.route.none)).toBeVisible();
    expect(textOf('walk.live.distance')).toBe(`${words.live.distance}–`);
  });

  it('asks before stopping, keeps walking on Keep walking, and shows the summary on Stop', async () => {
    const w = await openWalk();
    fireEvent.click(screen.getByRole('button', { name: words.idle.start }));
    await untilPhase('active');
    await walkOn(w.tracker, 20 * 60);

    fireEvent.click(screen.getByRole('button', { name: words.live.stop }));
    const confirm = screen.getByRole('alertdialog', { name: words.live.stopTitle });
    fireEvent.click(within(confirm).getByRole('button', { name: words.live.keepWalking }));
    expect(phase()).toBe('active');

    fireEvent.click(screen.getByRole('button', { name: words.live.stop }));
    fireEvent.click(screen.getByRole('button', { name: words.live.stopConfirm }));
    await untilPhase('finished');
    await untilShown('[data-ui="walk.summary"]');
    expect(screen.getByRole('heading', { level: 1, name: words.summary.title })).toBeVisible();
    const stored = await w.walkRepo.list();
    expect(stored).toHaveLength(1);
    expect(textOf('walk.summary.score')).toContain(String(stored[0]!.score));
  });

  it('saves on Save and goes Home', async () => {
    const w = await openWalk();
    fireEvent.click(screen.getByRole('button', { name: words.idle.start }));
    await untilPhase('active');
    await walkOn(w.tracker, 300);
    await act(() => w.service.stop());
    await untilShown('[data-ui="walk.save"]');
    fireEvent.click(screen.getByRole('button', { name: words.summary.save }));
    await waitFor(() =>
      expect(w.router.current().route).toEqual({ kind: 'tab', tab: 'home', nested: [] }),
    );
    expect(await w.walkRepo.list()).toHaveLength(1);
    expect(w.service.getSnapshot()).toEqual({ kind: 'idle' });
  });

  it('removes the walk on Discard, after asking', async () => {
    const w = await openWalk();
    fireEvent.click(screen.getByRole('button', { name: words.idle.start }));
    await untilPhase('active');
    await walkOn(w.tracker, 300);
    await act(() => w.service.stop());
    await untilShown('[data-ui="walk.discard"]');
    fireEvent.click(screen.getByRole('button', { name: words.summary.discard }));
    const confirm = screen.getByRole('alertdialog', { name: words.summary.discardTitle });
    fireEvent.click(within(confirm).getByRole('button', { name: words.summary.discardConfirm }));
    await waitFor(() => expect(w.router.current().route.kind).toBe('tab'));
    expect(await w.walkRepo.list()).toEqual([]);
  });

  it('keeps the walk when the summary is left with Back (Save is the default)', async () => {
    const w = await openWalk();
    fireEvent.click(screen.getByRole('button', { name: words.idle.start }));
    await untilPhase('active');
    await walkOn(w.tracker, 300);
    await act(() => w.service.stop());
    await untilShown('[data-ui="walk.summary"]');
    fireEvent.click(screen.getByRole('button', { name: words.back }));
    await waitFor(() => expect(w.router.current().route.kind).toBe('tab'));
    expect(await w.walkRepo.list()).toHaveLength(1);
  });
});
