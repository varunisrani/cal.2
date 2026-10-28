import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { DiaryEntry, Targets } from '../../domain/model';
import type { PillarKey } from '../../domain/nutrients/catalogue';
import { DEFAULT_GOAL_VALUES } from '../../domain/nutrients/goalDefaults';
import { DEFAULT_PILLARS } from '../../domain/nutrients/pillars';
import type { EnergyDisplayUnit } from '../../domain/units/energy';
import { home } from '../../i18n/en/home';
import { makeEntry } from '../../test/factories';
import type { WaterDay } from './dayNutrients';
import { DaySummary, type DaySummaryProps } from './DaySummary';

const words = home.home;
const PLAN: Targets = { kcal: 2_000, protein: 150, carbs: 220, fat: 70 };

function summaryProps({
  entries = [],
  targets = PLAN,
  goals = DEFAULT_GOAL_VALUES,
  unit = 'kcal',
  pillars = DEFAULT_PILLARS,
  water = null,
  sugarLine = true,
  onShowAll = () => undefined,
}: {
  entries?: DiaryEntry[];
  targets?: Targets | null;
  goals?: typeof DEFAULT_GOAL_VALUES;
  unit?: EnergyDisplayUnit;
  pillars?: readonly PillarKey[];
  water?: WaterDay | null;
  sugarLine?: boolean;
  onShowAll?: () => void;
} = {}): DaySummaryProps {
  return { entries, targets, goals, energyUnit: unit, pillars, water, sugarLine, onShowAll };
}

function renderSummary(options: Parameters<typeof summaryProps>[0] = {}) {
  return render(<DaySummary {...summaryProps(options)} />);
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
    rerender(<DaySummary {...summaryProps({ entries: eaten(1_999), unit: 'kJ' })} />);
    expect(gauge('kJ')).toHaveAccessibleDescription('8,364 4 left');
    rerender(<DaySummary {...summaryProps({ entries: eaten(2_000), unit: 'kJ' })} />);
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

describe('DaySummary pillars, chosen (P07-03)', () => {
  it('shows the stored pillars in their order, then water while it is tracked', () => {
    renderSummary({
      entries: [makeEntry({ nutrients: { sodium: 1_250, iron: 4.25 } })],
      pillars: ['sodium', 'protein', 'iron'],
      water: { totalMl: 750, goalMl: 2_000, unit: 'ml' },
    });
    const pillars = Array.from(document.querySelectorAll('[data-ui^="home.pillar."]'));
    expect(pillars.map((pillar) => pillar.getAttribute('data-ui'))).toEqual([
      'home.pillar.sodium',
      'home.pillar.protein',
      'home.pillar.iron',
      'home.pillar.water',
    ]);
    expect(screen.getByRole('group', { name: words.pillar.sodium })).toHaveAccessibleDescription(
      '1,250 1,050 mg left',
    );
    expect(screen.getByRole('group', { name: words.pillar.water })).toHaveAccessibleDescription(
      '750 1,250 ml left',
    );
  });

  it('opens every nutrient of the day from the All nutrients link under the pillars', () => {
    const onShowAll = vi.fn();
    renderSummary({ onShowAll });

    const link = screen.getByRole('button', { name: words.nutrients.link });
    expect(document.querySelector('[data-ui="home.pillars"]')?.nextElementSibling).toBe(link);
    fireEvent.click(link);
    expect(onShowAll).toHaveBeenCalledTimes(1);
  });
});

describe('DaySummary Sugar line (D-16.98)', () => {
  const sugarLine = () => document.querySelector('[data-ui="home.sugar"]');
  /** A day of three foods, two with sugar figures: 32 g known. */
  const sweetDay = () => [
    makeEntry({ nutrients: { sugar: 20 } }),
    makeEntry({ nutrients: { sugar: 12, fibre: 2 } }),
    makeEntry({ nutrients: { fibre: 6 } }),
  ];

  it('sits under the pillars, above All nutrients, against the Sugar limit of the goals', () => {
    renderSummary({ entries: sweetDay(), goals: { ...DEFAULT_GOAL_VALUES, sugar: 40 } });

    const line = screen.getByRole('button', { name: 'Sugar 32 g of 40 g from 2 of 3 foods' });
    expect(document.querySelector('[data-ui="home.pillars"]')?.nextElementSibling).toBe(line);
    expect(line.nextElementSibling).toBe(
      screen.getByRole('button', { name: words.nutrients.link }),
    );
  });

  it("opens the day's nutrients on a tap, as All nutrients does", () => {
    const onShowAll = vi.fn();
    renderSummary({ entries: sweetDay(), onShowAll });
    fireEvent.click(screen.getByRole('button', { name: /^Sugar 32 g of 50 g/ }));
    expect(onShowAll).toHaveBeenCalledTimes(1);
  });

  it('is hidden while Sugar is one of the pillars, which shows it instead', () => {
    renderSummary({ entries: sweetDay(), pillars: ['protein', 'sugar'] });
    expect(sugarLine()).toBeNull();
    expect(screen.getByRole('group', { name: words.pillar.sugar })).toHaveAccessibleDescription(
      '32 18 g left',
    );
  });

  it('shows while Sugar is only past the fourth stored pillar, which Home never draws', () => {
    renderSummary({
      entries: sweetDay(),
      pillars: ['protein', 'carbs', 'fat', 'fibre', 'sugar'],
    });
    expect(screen.queryByRole('group', { name: words.pillar.sugar })).toBeNull();
    expect(sugarLine()).not.toBeNull();
  });

  it('is hidden while its switch is off', () => {
    renderSummary({ entries: sweetDay(), sugarLine: false });
    expect(sugarLine()).toBeNull();
  });

  it('is not drawn on a day without food', () => {
    renderSummary({ entries: [] });
    expect(sugarLine()).toBeNull();
  });

  it('says No sugar figures, never 0 g, on a day whose foods have none', () => {
    renderSummary({ entries: [makeEntry({ nutrients: { fibre: 14 } })] });
    expect(sugarLine()).toHaveAccessibleName(`Sugar ${words.sugar.noFigures}`);
  });
});

describe('DaySummary counted burn (P11-04)', () => {
  const burnLine = () => document.querySelector('[data-ui="home.burn"]');

  it('reads goal + burned under the gauge, which counts against the raised target', () => {
    render(
      <DaySummary
        {...summaryProps({ entries: eaten(1_200), targets: { ...PLAN, kcal: 2_350 } })}
        burn={{ goalKcal: 2_000, burnedKcal: 350 }}
      />,
    );
    expect(gauge()).toHaveAccessibleDescription('1,200 1,150 left');
    expect(burnLine()).toHaveTextContent('2,000 goal + 350 burned');
    expect(screen.getByText('2,000 goal + 350 burned')).toBeVisible();
  });

  it('writes both amounts in kJ for a kJ user', () => {
    render(
      <DaySummary
        {...summaryProps({ unit: 'kJ', targets: { ...PLAN, kcal: 2_350 } })}
        burn={{ goalKcal: 2_000, burnedKcal: 350 }}
      />,
    );
    // 2 000 kcal = 8 368 kJ; 350 kcal = 1 464 kJ.
    expect(burnLine()).toHaveTextContent('8,368 goal + 1,464 burned');
  });

  it('shows no line when no burn is counted', () => {
    renderSummary({ entries: eaten(1_200) });
    expect(burnLine()).toBeNull();
  });
});
