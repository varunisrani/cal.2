import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { ActivityDay, ActivitySession } from '../../data/hooks';
import { health } from '../../i18n/en/health';
import { ActivityCard, workoutName } from './ActivityCard';

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
    render(<ActivityCard day={day()} energyUnit="kcal" />);
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
    render(<ActivityCard day={day({ steps: 1, activeKcal: 100 })} energyUnit="kJ" />);
    expect(within(card()).getByText('1 step')).toBeVisible();
    expect(within(card()).getByText('418 kJ active')).toBeVisible();
  });

  it('says Health Connect has nothing for the day, with no row or an empty one', () => {
    const { rerender } = render(<ActivityCard day={null} energyUnit="kcal" />);
    expect(within(card()).getByText(words.empty)).toBeVisible();
    rerender(
      <ActivityCard
        day={day({ steps: null, activeKcal: null, totalKcal: 2_000, distanceM: null })}
        energyUnit="kcal"
      />,
    );
    expect(within(card()).getByText(words.empty)).toBeVisible();
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
