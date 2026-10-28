import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { DataProvider } from '../../data/DataProvider';
import { createWalkRepo } from '../../data/repos/walkRepo';
import type { Walk } from '../../domain/walks/model';
import { walk as walkWords } from '../../i18n/en/walk';
import { ServicesProvider } from '../../services/context';
import type { WalkService } from '../../services/walks/service';
import { FACTORY_NOW, makeWalk } from '../../test/factories';
import { closeHarnesses, openHarness, until, untilShown } from '../../test/screenHarness';
import { WalksCard } from './WalksCard';
import { WalkSummary } from './WalkSummary';

afterEach(closeHarnesses);

const words = walkWords.walk;
const DAY = 86_400_000;
const TODAY = '2026-10-26';

function textOf(hook: string): string {
  return document.querySelector(`[data-ui="${hook}"]`)?.textContent ?? '';
}

/** The walks stored, the person's units set, and `ui` drawn with the walk recorder present. */
async function openWith(
  walks: readonly Walk[],
  render: () => React.ReactNode,
  units: { energy?: 'kcal' | 'kJ'; height?: 'cm' | 'ftIn' } = {},
) {
  const h = await openHarness();
  await h.repos.settingsRepo.set('units.height', units.height ?? 'cm');
  await h.repos.settingsRepo.set('units.energy', units.energy ?? 'kcal');
  const walkRepo = createWalkRepo(h.db);
  for (const walk of walks) await walkRepo.put(walk);
  const service = { subscribe: () => () => undefined } as unknown as WalkService;
  h.mount(
    <ServicesProvider services={{ ...h.services, walks: service }}>
      <DataProvider sources={{ ...h.sources, walkRepo }}>{render()}</DataProvider>
    </ServicesProvider>,
  );
  return { ...h, walkRepo };
}

// Monday 26 October 2026, a 30-minute walk; one more this week, one the week before.
const THIS_WALK = makeWalk({
  id: 'this',
  startedAt: FACTORY_NOW,
  heartRate: { avgBpm: 121, maxBpm: 146, maxHr: 188, zoneSeconds: [120, 900, 600, 180, 0] },
});
const EARLIER_THIS_WEEK = makeWalk({ id: 'earlier', startedAt: FACTORY_NOW - 2 * 3_600_000 });
const LAST_WEEK = makeWalk({
  id: 'last-week',
  startedAt: FACTORY_NOW - 7 * DAY,
  activeSeconds: 2_400,
  distanceM: 3_400,
  speedKmh: 5.1,
  score: 70,
  briskMinutes: 10,
});

describe('WalkSummary (P15-03)', () => {
  it('shows the score large with its four parts and what each means', async () => {
    await openWith([LAST_WEEK, THIS_WALK], () => <WalkSummary walk={THIS_WALK} today={TODAY} />);
    await untilShown('[data-ui="walk.summary"]');
    expect(textOf('walk.summary.score')).toBe(`81${words.summary.score} ${words.summary.outOf}`);
    const parts = within(screen.getByRole('region', { name: words.summary.parts }));
    const part = (key: string) => textOf(`walk.summary.part.${key}`);
    expect(part('brisk')).toContain('33 of 40');
    expect(part('brisk')).toContain(
      '25 of 30 min were brisk: 100 steps a minute or more counts as moderate activity.',
    );
    expect(part('duration')).toContain('25 of 25');
    expect(part('duration')).toContain(words.summary.explain.durationFull);
    expect(part('intensity')).toContain('About 3.8 METs from your speed: a moderate effort.');
    expect(part('pace')).toContain(words.summary.explain.paceNone);
    expect(parts.getAllByRole('listitem')).toHaveLength(4);
  });

  it("explains brisk minutes by speed when there were no steps, in the person's unit", async () => {
    const walk = makeWalk({
      steps: null,
      cadence: null,
      paceRatio: 0.92,
      parts: { brisk: 20, duration: 25, intensity: 9.4, pace: 10.2 },
    });
    await openWith([walk], () => <WalkSummary walk={walk} today={TODAY} />, { height: 'ftIn' });
    await untilShown('[data-ui="walk.summary"]');
    expect(textOf('walk.summary.part.brisk')).toContain(
      '25 of 30 min were brisk: 3.0 mph or faster counts as moderate activity.',
    );
    expect(textOf('walk.summary.part.pace')).toContain('92 % of your average walking speed.');
    expect(textOf('walk.summary.distance')).toBe(`${words.summary.distance}1.6 mi`);
  });

  it('shows the figures in the person’s units and the week’s moderate minutes as a ring', async () => {
    await openWith(
      [LAST_WEEK, EARLIER_THIS_WEEK, THIS_WALK],
      () => <WalkSummary walk={THIS_WALK} today={TODAY} />,
      { energy: 'kJ' },
    );
    await untilShown('[data-ui="walk.summary"]');
    expect(textOf('walk.summary.time')).toBe(`${words.summary.time}30:00`);
    expect(textOf('walk.summary.distance')).toBe(`${words.summary.distance}2.6 km`);
    // 1 800 s over 2.6 km.
    expect(textOf('walk.summary.pace')).toBe(`${words.summary.pace}11:32 /km`);
    expect(textOf('walk.summary.steps')).toBe(`${words.summary.steps}3,300`);
    expect(textOf('walk.summary.active')).toBe(`${words.summary.active}377 kJ`);
    // Two walks this week with 25 brisk minutes each; last week's is not counted.
    await until(
      () => document.querySelector('[data-ui="walk.week"]')?.getAttribute('data-minutes') === '50',
    );
    const ring = screen.getByRole('progressbar', { name: words.summary.week });
    expect(ring).toHaveAttribute(
      'aria-valuetext',
      '50 of 150 minutes of moderate activity this week',
    );
    expect(ring).toHaveAttribute('aria-valuemax', '150');
  });

  it('shows the heart-rate zones only when Health Connect had heart rate for the walk', async () => {
    await openWith([THIS_WALK], () => <WalkSummary walk={THIS_WALK} today={TODAY} />);
    await untilShown('[data-ui="walk.summary.heart"]');
    expect(screen.getByText('Average 121 bpm, highest 146 bpm')).toBeVisible();
    expect(textOf('walk.summary.zone.2')).toBe('Zone 2 (60–70 %)15 min');
    expect(textOf('walk.summary.zone.5')).toBe(`${words.summary.zoneTop}0 min`);
    expect(screen.getByText('Zones by share of 188 bpm (220 minus your age).')).toBeVisible();
  });

  it('has no zones without heart rate', async () => {
    await openWith([EARLIER_THIS_WEEK], () => (
      <WalkSummary walk={EARLIER_THIS_WEEK} today={TODAY} />
    ));
    await untilShown('[data-ui="walk.summary"]');
    expect(document.querySelector('[data-ui="walk.summary.heart"]')).toBeNull();
  });

  it('compares the walk with the walks before it, or says it is the first', async () => {
    await openWith([LAST_WEEK, THIS_WALK], () => <WalkSummary walk={THIS_WALK} today={TODAY} />);
    await untilShown('[data-ui="walk.summary.compare"]');
    const table = within(screen.getByRole('table'));
    expect(table.getByRole('row', { name: /Time/ })).toHaveTextContent('30:0040:00');
    expect(table.getByRole('row', { name: /Distance/ })).toHaveTextContent('2.6 km3.4 km');
    expect(table.getByRole('row', { name: /Walk score/ })).toHaveTextContent('8170');
    expect(screen.getByText('Your walk before this one')).toBeVisible();
  });

  it('says this is the first walk when there is none before it', async () => {
    await openWith([LAST_WEEK], () => <WalkSummary walk={LAST_WEEK} today={TODAY} />);
    await untilShown('[data-ui="walk.summary.compare.none"]');
    expect(screen.getByText(words.summary.compareNone)).toBeVisible();
    expect(screen.getByRole('heading', { name: /Week of/ })).toBeVisible();
  });

  it('says why there is no score when nothing about the effort was measured', async () => {
    const walk = makeWalk({
      score: null,
      distanceM: null,
      steps: null,
      briskKnown: false,
      route: '',
    });
    await openWith([walk], () => <WalkSummary walk={walk} today={TODAY} />);
    await untilShown('[data-ui="walk.summary"]');
    expect(screen.getByText(words.summary.noScore)).toBeVisible();
    expect(screen.getByText(words.route.none)).toBeVisible();
  });
});

describe('Progress › Walks (P15-03)', () => {
  it('lists every walk newest first with its date, time, distance and score, and the week ring', async () => {
    await openWith([LAST_WEEK, THIS_WALK, EARLIER_THIS_WEEK], () => <WalksCard today={TODAY} />);
    await untilShown('[data-ui="progress.walks"]');
    const list = within(screen.getByRole('list', { name: words.walks.list }));
    expect(list.getAllByRole('button').map((row) => row.getAttribute('aria-label'))).toEqual([
      'Oct 26, 2026: 30:00, 2.6 km, score 81',
      'Oct 26, 2026: 30:00, 2.6 km, score 81',
      'Oct 19, 2026: 40:00, 3.4 km, score 70',
    ]);
    await until(
      () =>
        document.querySelector('[data-ui="progress.walks.week"]')?.getAttribute('data-minutes') ===
        '50',
    );
  });

  it('opens a walk’s summary in a sheet', async () => {
    await openWith([LAST_WEEK, THIS_WALK], () => <WalksCard today={TODAY} />);
    await untilShown('[data-ui="progress.walks"]');
    fireEvent.click(screen.getByRole('button', { name: 'Oct 19, 2026: 40:00, 3.4 km, score 70' }));
    const sheet = await screen.findByRole('dialog', { name: words.walks.summary });
    await waitFor(() => expect(within(sheet).getByText('70')).toBeVisible());
    expect(within(sheet).queryByRole('button', { name: words.summary.save })).toBeNull();
  });

  it('says there are no walks yet', async () => {
    await openWith([], () => <WalksCard today={TODAY} />);
    await untilShown('[data-ui="progress.walks.empty"]');
    expect(screen.getByText(words.walks.empty)).toBeVisible();
  });
});
