import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { DiaryEntry, Targets } from '../../domain/model';
import { DEFAULT_GOAL_VALUES } from '../../domain/nutrients/goalDefaults';
import type { EnergyDisplayUnit } from '../../domain/units/energy';
import { home } from '../../i18n/en/home';
import { makeEntry } from '../../test/factories';
import { amountIn, DaySummary } from './DaySummary';

const words = home.home;
const PLAN: Targets = { kcal: 2_000, protein: 150, carbs: 220, fat: 70 };

function renderSummary({
  entries = [],
  targets = PLAN,
  goals = DEFAULT_GOAL_VALUES,
  unit = 'kcal',
}: {
  entries?: DiaryEntry[];
  targets?: Targets | null;
  goals?: typeof DEFAULT_GOAL_VALUES;
  unit?: EnergyDisplayUnit;
} = {}) {
  return render(<DaySummary entries={entries} targets={targets} goals={goals} energyUnit={unit} />);
}

/** Entries adding up to `kcal`, split over two meals. */
function eaten(kcal: number): DiaryEntry[] {
  const first = Math.floor(kcal / 3);
  return [makeEntry({ kcal: first }), makeEntry({ kcal: kcal - first, meal: 'dinner' })];
}

const gauge = (unit: EnergyDisplayUnit = 'kcal') =>
  screen.getByRole('group', { name: words.gauge.heading[unit] });
/** The gauge's filled arc (the pillars have fills of their own). */
const fill = () => document.querySelector('[data-ui="home.gauge"] [data-part="fill"]');

describe('DaySummary gauge', () => {
  it('reads 800 left with 1 200 of 2 000 kcal eaten, and sweeps 108° (ACC-F3-1)', () => {
    renderSummary({ entries: eaten(1_200) });
    expect(gauge()).toHaveAccessibleDescription('1,200 800 left');
    expect(fill()).toHaveAttribute('data-sweep', '108');
  });

  it('stays full and reads 100 over at 2 100 of 2 000 kcal (ACC-F3-2)', () => {
    renderSummary({ entries: eaten(2_100) });
    expect(gauge()).toHaveAccessibleDescription('2,100 100 over');
    expect(fill()).toHaveAttribute('data-sweep', '180');
  });

  it('reads goal reached when the day meets the goal exactly', () => {
    renderSummary({ entries: eaten(2_000) });
    expect(gauge()).toHaveAccessibleDescription(`2,000 ${words.gauge.reached}`);
  });

  it('reads no goal and fills nothing without a readable profile', () => {
    renderSummary({ entries: eaten(450), targets: null });
    expect(gauge()).toHaveAccessibleDescription(`450 ${words.gauge.noGoal}`);
    expect(fill()).toBeNull();
  });

  it('shows 0 eaten on an empty day', () => {
    renderSummary();
    expect(gauge()).toHaveAccessibleDescription('0 2,000 left');
    expect(fill()).toHaveAttribute('data-sweep', '0');
  });

  it('names Kilojoules and shows kJ numbers while comparing in kcal', () => {
    const { rerender } = renderSummary({ entries: eaten(1_200), unit: 'kJ' });
    // 1 200 kcal = 5 021 kJ eaten; 800 kcal = 3 347 kJ left.
    expect(gauge('kJ')).toHaveAccessibleDescription('5,021 3,347 left');
    expect(screen.queryByText(words.gauge.heading.kcal)).toBeNull();

    // One kcal short is still "left" (4 kJ), and an exact kcal match is reached, whatever the
    // rounding of the kJ numbers.
    rerender(
      <DaySummary
        entries={eaten(1_999)}
        targets={PLAN}
        goals={DEFAULT_GOAL_VALUES}
        energyUnit="kJ"
      />,
    );
    expect(gauge('kJ')).toHaveAccessibleDescription('8,364 4 left');
    rerender(
      <DaySummary
        entries={eaten(2_000)}
        targets={PLAN}
        goals={DEFAULT_GOAL_VALUES}
        energyUnit="kJ"
      />,
    );
    expect(gauge('kJ')).toHaveAccessibleDescription(`8,368 ${words.gauge.reached}`);
  });
});

describe('DaySummary pillars', () => {
  it('shows protein, carbs, fat and fibre against their goals, in that order (ACC-F4-1)', () => {
    renderSummary({
      entries: [
        makeEntry({ protein: 24, carbs: 58, fat: 9.5, nutrients: { fibre: 14 } }),
        makeEntry({ protein: 136, carbs: 100.25, fat: 0, nutrients: { fibre: 16 } }),
      ],
    });
    const pillars = Array.from(document.querySelectorAll('[data-ui^="home.pillar."]'));
    expect(pillars.map((pillar) => pillar.getAttribute('data-ui'))).toEqual([
      'home.pillar.protein',
      'home.pillar.carbs',
      'home.pillar.fat',
      'home.pillar.fibre',
    ]);
    expect(screen.getByRole('group', { name: words.pillar.protein })).toHaveAccessibleDescription(
      '160 10 g over',
    );
    expect(screen.getByRole('group', { name: words.pillar.carbs })).toHaveAccessibleDescription(
      '158.3 61.7 g left',
    );
    expect(screen.getByRole('group', { name: words.pillar.fat })).toHaveAccessibleDescription(
      '9.5 60.5 g left',
    );
    // Fibre's goal is the optional nutrient goal (30 g by default).
    expect(screen.getByRole('group', { name: words.pillar.fibre })).toHaveAccessibleDescription(
      `30 ${words.pillar.reached}`,
    );
  });

  it('counts an entry that does not know its fibre as 0 toward the fibre pillar', () => {
    renderSummary({
      entries: [makeEntry({ nutrients: { fibre: 4.5 } }), makeEntry({ nutrients: {} })],
    });
    expect(screen.getByRole('group', { name: words.pillar.fibre })).toHaveAccessibleDescription(
      '4.5 25.5 g left',
    );
  });

  it('reaches a goal met by a sum of decimals', () => {
    renderSummary({
      entries: [makeEntry({ nutrients: { fibre: 0.1 } }), makeEntry({ nutrients: { fibre: 0.2 } })],
      goals: { ...DEFAULT_GOAL_VALUES, fibre: 0.3 },
    });
    expect(screen.getByRole('group', { name: words.pillar.fibre })).toHaveAccessibleDescription(
      `0.3 ${words.pillar.reached}`,
    );
  });

  it('reads no goal for the macros without a profile, and for a goal of 0', () => {
    renderSummary({ targets: null, goals: { ...DEFAULT_GOAL_VALUES, fibre: 0 } });
    for (const name of [
      words.pillar.protein,
      words.pillar.carbs,
      words.pillar.fat,
      words.pillar.fibre,
    ]) {
      expect(screen.getByRole('group', { name })).toHaveAccessibleDescription(
        `0 ${words.pillar.noGoal}`,
      );
    }
  });
});

describe('amountIn', () => {
  it('reads macros, optional nutrients and extras, and counts an unknown one as 0', () => {
    const entry = makeEntry({ protein: 12, nutrients: { sodium: 820 }, extras: { creatine: 5 } });
    expect(amountIn(entry, 'protein')).toBe(12);
    expect(amountIn(entry, 'sodium')).toBe(820);
    expect(amountIn(entry, 'creatine')).toBe(5);
    expect(amountIn(entry, 'fibre')).toBe(0);
    expect(amountIn(entry, 'taurine')).toBe(0);
  });
});
