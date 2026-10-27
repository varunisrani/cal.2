import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { DiaryEntry, Targets } from '../../domain/model';
import type { PillarKey } from '../../domain/nutrients/catalogue';
import { DEFAULT_GOAL_VALUES, type GoalValues } from '../../domain/nutrients/goalDefaults';
import { home } from '../../i18n/en/home';
import { makeEntry } from '../../test/factories';
import type { WaterDay } from './dayNutrients';
import { PillarRow } from './PillarRow';

const words = home.home;
const PLAN: Targets = { kcal: 2_000, protein: 150, carbs: 220, fat: 70 };

function renderRow({
  entries = [],
  pillars = ['protein', 'carbs', 'fat', 'fibre'],
  targets = PLAN,
  goals = DEFAULT_GOAL_VALUES,
  water = null,
}: {
  entries?: DiaryEntry[];
  pillars?: readonly PillarKey[];
  targets?: Targets;
  goals?: Readonly<GoalValues>;
  water?: WaterDay | null;
} = {}) {
  return render(
    <PillarRow entries={entries} pillars={pillars} targets={targets} goals={goals} water={water} />,
  );
}

const pillar = (name: string) => screen.getByRole('group', { name });
const shownPillars = () =>
  Array.from(document.querySelectorAll('[data-ui^="home.pillar."]')).map((node) =>
    node.getAttribute('data-ui'),
  );

describe('PillarRow', () => {
  it('shows 200 mg over on a sodium pillar with a goal of 2 300 and 2 500 eaten (ACC-F4-2)', () => {
    renderRow({
      pillars: ['sodium'],
      entries: [
        makeEntry({ nutrients: { sodium: 1_700 } }),
        makeEntry({ nutrients: { sodium: 800 } }),
      ],
    });
    expect(DEFAULT_GOAL_VALUES.sodium).toBe(2_300);
    expect(pillar(words.pillar.sodium)).toHaveAccessibleDescription('2,500 200 mg over');
    // Over the goal the status takes the accent, and the tube is full.
    expect(pillar(words.pillar.sodium)).toHaveAttribute('data-over', 'true');
  });

  it('shows No goal for a nutrient whose goal is 0', () => {
    renderRow({
      pillars: ['transFat', 'creatine', 'iron'],
      entries: [makeEntry({ nutrients: { transFat: 0.5, iron: 3 }, extras: { creatine: 5 } })],
      goals: { ...DEFAULT_GOAL_VALUES, iron: 0 },
    });
    expect(DEFAULT_GOAL_VALUES.transFat).toBe(0);
    expect(DEFAULT_GOAL_VALUES.creatine).toBe(0);
    expect(pillar(words.pillar.transFat)).toHaveAccessibleDescription(`0.5 ${words.pillar.noGoal}`);
    expect(pillar(words.pillar.creatine)).toHaveAccessibleDescription(`5 ${words.pillar.noGoal}`);
    expect(pillar(words.pillar.iron)).toHaveAccessibleDescription(`3 ${words.pillar.noGoal}`);
    expect(pillar(words.pillar.iron)).not.toHaveAttribute('data-over');
  });

  it('fills the macros toward the targets and the rest toward their optional goals, in each unit', () => {
    renderRow({
      pillars: ['carbs', 'vitaminD', 'calcium', 'omega3'],
      entries: [
        makeEntry({ carbs: 100.25, nutrients: { vitaminD: 7.5, calcium: 1_000, omega3: 1.26 } }),
      ],
      goals: { ...DEFAULT_GOAL_VALUES, vitaminD: 15 },
    });
    expect(pillar(words.pillar.carbs)).toHaveAccessibleDescription('100.3 119.7 g left');
    expect(pillar(words.pillar.vitaminD)).toHaveAccessibleDescription('7.5 7.5 mcg left');
    expect(pillar(words.pillar.calcium)).toHaveAccessibleDescription(
      `1,000 ${words.pillar.reached}`,
    );
    expect(pillar(words.pillar.omega3)).toHaveAccessibleDescription('1.3 0.7 g left');
  });

  it('keeps the chosen order, from one pillar up to four', () => {
    renderRow({ pillars: ['zinc'] });
    expect(shownPillars()).toEqual(['home.pillar.zinc']);
  });

  it('shows the water pillar only while tracking is on, after the chosen ones', () => {
    const { rerender } = renderRow({ pillars: ['protein', 'sodium', 'fibre', 'iron'] });
    expect(shownPillars()).not.toContain('home.pillar.water');
    expect(screen.queryByRole('group', { name: words.pillar.water })).toBeNull();

    rerender(
      <PillarRow
        entries={[]}
        pillars={['protein', 'sodium', 'fibre', 'iron']}
        targets={PLAN}
        goals={DEFAULT_GOAL_VALUES}
        water={{ totalMl: 0, goalMl: 2_000, unit: 'ml' }}
      />,
    );
    expect(shownPillars()).toEqual([
      'home.pillar.protein',
      'home.pillar.sodium',
      'home.pillar.fibre',
      'home.pillar.iron',
      'home.pillar.water',
    ]);
  });

  it("shows the day's water against the daily goal in the water unit (ACC-H4-1)", () => {
    const { rerender } = renderRow({ water: { totalMl: 1_250, goalMl: 2_000, unit: 'ml' } });
    expect(pillar(words.pillar.water)).toHaveAccessibleDescription('1,250 750 ml left');

    rerender(
      <PillarRow
        entries={[]}
        pillars={['protein']}
        targets={PLAN}
        goals={DEFAULT_GOAL_VALUES}
        water={{ totalMl: 2_250, goalMl: 2_000, unit: 'flOz' }}
      />,
    );
    // 2 250 ml is 76.1 fl oz; 2 000 ml is 67.6 fl oz.
    expect(pillar(words.pillar.water)).toHaveAccessibleDescription('76.1 8.5 fl oz over');

    rerender(
      <PillarRow
        entries={[]}
        pillars={['protein']}
        targets={PLAN}
        goals={DEFAULT_GOAL_VALUES}
        water={{ totalMl: 2_000, goalMl: 2_000, unit: 'flOz' }}
      />,
    );
    expect(pillar(words.pillar.water)).toHaveAccessibleDescription(`67.6 ${words.pillar.reached}`);
  });

  it('never counts food toward water, nor water toward food (R05.4)', () => {
    renderRow({
      pillars: ['protein'],
      entries: [makeEntry({ protein: 30 })],
      water: { totalMl: 500, goalMl: 2_000, unit: 'ml' },
    });
    expect(pillar(words.pillar.protein)).toHaveAccessibleDescription('30 120 g left');
    expect(pillar(words.pillar.water)).toHaveAccessibleDescription('500 1,500 ml left');
  });
});
