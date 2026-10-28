import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ActivityDay, ActivitySession } from '../../data/hooks';
import { health } from '../../i18n/en/health';
import { walk as walkWords } from '../../i18n/en/walk';
import { makeWalk } from '../../test/factories';
import { ActivityCard, workoutName } from './ActivityCard';
import { distanceUnitOf } from './distance';

const words = health.health.home;
const START = Date.parse('2026-10-26T07:00:00-04:00');

function session(overrides: Partial<ActivitySession> = {}): ActivitySession {
  return {
    id: 'run',
    start: START,
    end: START + 42 * 60_000,
    type: 'running',
    title: null,
    activeKcal: 380,
    source: 'org.example.watch',
    ...overrides,
  };
}

function day(overrides: Partial<ActivityDay> = {}): ActivityDay {
  return {
    day: '2026-10-26',
    steps: 9_412,
    activeKcal: 512.6,
    totalKcal: 2_390,
    distanceM: 7_100,
    sessions: [],
    syncedAt: START,
    ...overrides,
  };
}

const card = () => screen.getByRole('region', { name: words.title });

describe('ActivityCard (P11-04)', () => {
  it("shows the day's steps and active calories under its heading", () => {
    render(<ActivityCard day={day()} energyUnit="kcal" lengthUnit="cm" />);
    expect(within(card()).getByText('9,412 steps')).toBeVisible();
    expect(within(card()).getByText('513 kcal active')).toBeVisible();
    expect(document.querySelector('[data-ui="home.activity.workouts"]')).toBeNull();
  });

  it('lists the workouts with their length and energy', () => {
    render(
      <ActivityCard
        day={day({
          sessions: [
            session(),
            session({ id: 'yoga', type: 'yoga', title: 'Evening flow', activeKcal: null }),
          ],
        })}
        energyUnit="kcal"
        lengthUnit="cm"
      />,
    );
    const workouts = within(card()).getByRole('list', { name: words.workouts });
    expect(
      within(workouts)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual(['Running, 42m, 380 kcal', 'Evening flow, 42m']);
    expect(within(card()).getByRole('heading', { name: words.workouts })).toBeVisible();
  });

  it('writes energy in kJ for a kJ user, steps as counts', () => {
    render(
      <ActivityCard
        day={day({ steps: 1, activeKcal: 100, totalKcal: 2_000 })}
        energyUnit="kJ"
        lengthUnit="cm"
      />,
    );
    expect(within(card()).getByText('1 step')).toBeVisible();
    expect(within(card()).getByText('418 kJ active')).toBeVisible();
    expect(within(card()).getByText('8,368 kJ total')).toBeVisible();
  });

  it('shows the total burn and the distance under steps and active calories, in km beside cm', () => {
    render(<ActivityCard day={day()} energyUnit="kcal" lengthUnit="cm" />);
    const lists = within(card())
      .getAllByRole('list')
      .map((list) =>
        within(list)
          .getAllByRole('listitem')
          .map((item) => item.textContent),
      );
    expect(lists).toEqual([
      ['9,412 steps', '513 kcal active'],
      ['2,390 kcal total', '7.1 km'],
    ]);
    expect(
      within(card()).getByRole('listitem', { name: 'Distance 7.1 kilometres' }),
    ).toHaveTextContent('7.1 km');
  });

  it('writes the distance in miles for a person who reads feet and inches', () => {
    render(
      <ActivityCard day={day({ distanceM: 1_609.344 })} energyUnit="kcal" lengthUnit="ftIn" />,
    );
    expect(within(card()).getByRole('listitem', { name: 'Distance 1.0 miles' })).toHaveTextContent(
      '1.0 mi',
    );
  });

  it('leaves out the total and the distance when Health Connect gave none', () => {
    render(
      <ActivityCard
        day={day({ totalKcal: null, distanceM: null })}
        energyUnit="kcal"
        lengthUnit="cm"
      />,
    );
    expect(within(card()).getByText('9,412 steps')).toBeVisible();
    expect(document.querySelector('[data-ui="home.activity.more"]')).toBeNull();
    expect(within(card()).queryByText(/total/)).toBeNull();
  });

  it('shows a day that has only a total burn or only a distance, not the empty line', () => {
    const only = { steps: null, activeKcal: null, totalKcal: null, distanceM: null };
    const { rerender } = render(
      <ActivityCard day={day({ ...only, totalKcal: 1_650 })} energyUnit="kcal" lengthUnit="cm" />,
    );
    expect(within(card()).getByText('1,650 kcal total')).toBeVisible();
    expect(within(card()).queryByText(words.empty)).toBeNull();
    expect(document.querySelector('[data-ui="home.activity.distance"]')).toBeNull();

    rerender(
      <ActivityCard day={day({ ...only, distanceM: 0 })} energyUnit="kcal" lengthUnit="cm" />,
    );
    expect(within(card()).getByText('0.0 km')).toBeVisible();
    expect(document.querySelector('[data-ui="home.activity.total"]')).toBeNull();
  });

  it('says Health Connect has nothing for the day, with no row or an empty one', () => {
    const { rerender } = render(<ActivityCard day={null} energyUnit="kcal" lengthUnit="cm" />);
    expect(within(card()).getByText(words.empty)).toBeVisible();
    rerender(
      <ActivityCard
        day={day({ steps: null, activeKcal: null, totalKcal: null, distanceM: null })}
        energyUnit="kcal"
        lengthUnit="cm"
      />,
    );
    expect(within(card()).getByText(words.empty)).toBeVisible();
  });
});

describe('distanceUnitOf', () => {
  it('follows the length unit: km beside cm, miles beside feet and inches', () => {
    expect(distanceUnitOf('cm')).toBe('km');
    expect(distanceUnitOf('ftIn')).toBe('mi');
  });
});

describe('workoutName', () => {
  it('uses the title, else names common types in our words, else Workout', () => {
    expect(workoutName(session({ title: 'Park run' }))).toBe('Park run');
    expect(workoutName(session({ type: 'RUNNING_TREADMILL' }))).toBe(words.type.running);
    expect(workoutName(session({ type: 'hiking' }))).toBe(words.type.walking);
    expect(workoutName(session({ type: 'biking_stationary' }))).toBe(words.type.cycling);
    expect(workoutName(session({ type: 'swimming_pool' }))).toBe(words.type.swimming);
    expect(workoutName(session({ type: 'weightlifting' }))).toBe(words.type.strength);
    expect(workoutName(session({ type: 'fencing' }))).toBe(words.type.other);
  });
});

describe('ActivityCard: walks (P15-03)', () => {
  const walkAt = Date.parse('2026-10-26T08:05:00-04:00');

  it('lists the day’s walks without Health Connect and has the Walk button, in miles for feet', () => {
    const onWalk = vi.fn();
    render(
      <ActivityCard
        day={null}
        energyUnit="kJ"
        lengthUnit="ftIn"
        healthConnected={false}
        walks={[makeWalk({ startedAt: walkAt, distanceM: 2_600, activeKcal: 90 })]}
        onWalk={onWalk}
      />,
    );
    expect(within(card()).queryByText(words.empty)).toBeNull();
    expect(
      within(card()).getByRole('list', { name: walkWords.walk.home.heading }),
    ).toHaveTextContent('8:05 AM: 30m, 1.6 mi, 377 kJ active');
    fireEvent.click(within(card()).getByRole('button', { name: walkWords.walk.home.start }));
    expect(onWalk).toHaveBeenCalledTimes(1);
  });

  it('says there are no walks without Health Connect, and adds no line with it', () => {
    const { unmount } = render(
      <ActivityCard
        day={null}
        energyUnit="kcal"
        lengthUnit="cm"
        healthConnected={false}
        walks={[]}
      />,
    );
    expect(within(card()).getByText(walkWords.walk.home.none)).toBeVisible();
    expect(screen.queryByRole('button')).toBeNull();
    unmount();

    render(
      <ActivityCard
        day={day()}
        energyUnit="kcal"
        lengthUnit="cm"
        walks={[]}
        walking
        onWalk={vi.fn()}
      />,
    );
    expect(within(card()).queryByText(walkWords.walk.home.none)).toBeNull();
    expect(within(card()).getByRole('button', { name: walkWords.walk.home.back })).toBeVisible();
  });

  it('leaves out the distance of a walk without a route', () => {
    render(
      <ActivityCard
        day={null}
        energyUnit="kcal"
        lengthUnit="cm"
        healthConnected={false}
        walks={[
          makeWalk({ startedAt: walkAt, distanceM: null, activeKcal: 61, activeSeconds: 1_260 }),
        ]}
      />,
    );
    expect(
      within(card()).getByRole('list', { name: walkWords.walk.home.heading }),
    ).toHaveTextContent('8:05 AM: 21m, 61 kcal active');
  });
});
