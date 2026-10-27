import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { DiaryEntry, Targets } from '../../domain/model';
import { GOAL_KEYS, type PillarKey } from '../../domain/nutrients/catalogue';
import { DEFAULT_GOAL_VALUES } from '../../domain/nutrients/goalDefaults';
import { DEFAULT_PILLARS } from '../../domain/nutrients/pillars';
import type { EnergyDisplayUnit } from '../../domain/units/energy';
import { common } from '../../i18n/en/common';
import { home } from '../../i18n/en/home';
import { makeEntry } from '../../test/factories';
import { DETAIL_ORDER, type WaterDay } from './dayNutrients';
import { DayNutrientsSheet } from './DayNutrientsSheet';

const words = home.home;
const PLAN: Targets = { kcal: 2_000, protein: 150, carbs: 220, fat: 70 };

function renderSheet({
  entries = [],
  targets = PLAN,
  unit = 'kcal',
  pillars = DEFAULT_PILLARS,
  water = null,
  day = '2026-10-26',
  isToday = true,
  onChoosePillars = () => undefined,
  onClose = () => undefined,
}: {
  entries?: DiaryEntry[];
  targets?: Targets | null;
  unit?: EnergyDisplayUnit;
  pillars?: readonly PillarKey[];
  water?: WaterDay | null;
  day?: string;
  isToday?: boolean;
  onChoosePillars?: () => void;
  onClose?: () => void;
} = {}) {
  return render(
    <DayNutrientsSheet
      open
      onClose={onClose}
      day={day}
      isToday={isToday}
      entries={entries}
      targets={targets}
      goals={DEFAULT_GOAL_VALUES}
      energyUnit={unit}
      pillars={pillars}
      water={water}
      onChoosePillars={onChoosePillars}
    />,
  );
}

/** One row's text, as a screen reader runs through it. */
function row(id: string): string {
  return document.querySelector(`[data-ui="home.nutrients.row.${id}"]`)?.textContent ?? '';
}

const sheet = () => screen.getByRole('dialog', { name: words.nutrients.title });

describe('DayNutrientsSheet', () => {
  it('lists every nutrient of the day with its unit and its goal (ACC-F6-1)', () => {
    renderSheet({
      entries: [
        makeEntry({
          kcal: 640,
          protein: 31.25,
          carbs: 80,
          fat: 12,
          nutrients: { sodium: 1_700, vitaminD: 4.5, iron: 6, fibre: 9 },
          extras: { creatine: 5 },
        }),
        makeEntry({
          kcal: 410,
          protein: 24,
          carbs: 58,
          fat: 9.5,
          nutrients: { sodium: 800, fibre: 14 },
          extras: {},
        }),
      ],
    });

    const macros = within(sheet()).getByRole('region', { name: words.nutrients.macrosHeading });
    expect(within(macros).getAllByRole('listitem')).toHaveLength(4);
    expect(row('energy')).toBe('Calories 1,050 kcal / 2,000 kcal');
    expect(row('protein')).toBe('Protein 55.3 g / 150 g');
    expect(row('carbs')).toBe('Carbs 138 g / 220 g');
    expect(row('fat')).toBe('Fat 21.5 g / 70 g');

    const detail = within(sheet()).getByRole('region', { name: words.nutrients.detailHeading });
    const ids = within(detail)
      .getAllByRole('listitem')
      .map((item) => item.getAttribute('data-ui')?.replace('home.nutrients.row.', ''));
    expect(ids).toEqual([...DETAIL_ORDER]);
    expect(row('sodium')).toBe('Sodium 2,500 mg / 2,300 mg');
    expect(row('fibre')).toBe('Fibre 23 g / 30 g');
    expect(row('iron')).toBe('Iron 6 mg / 18 mg');
    expect(row('vitaminD')).toBe('Vitamin D 4.5 mcg / 20 mcg');
    // Every goal-bearing nutrient shows its goal, in its unit; a goal of 0 says so.
    for (const key of GOAL_KEYS) {
      const goal = DEFAULT_GOAL_VALUES[key];
      expect(row(key)).toMatch(goal > 0 ? / \/ [\d,.]+ (g|mg|mcg)$/ : / No goal$/);
    }
    expect(row('creatine')).toBe(`Creatine 5 g ${words.pillar.noGoal}`);
  });

  it('shows no goal at all for monounsaturated and polyunsaturated fat', () => {
    renderSheet({
      entries: [makeEntry({ nutrients: { monounsaturatedFat: 3.5, polyunsaturatedFat: 2 } })],
    });
    expect(row('monounsaturatedFat')).toBe('Monounsaturated fat 3.5 g');
    expect(row('polyunsaturatedFat')).toBe('Polyunsaturated fat 2 g');
    const mono = document.querySelector('[data-ui="home.nutrients.row.monounsaturatedFat"]');
    expect(mono?.textContent).not.toContain('/');
    expect(mono?.textContent).not.toContain(words.pillar.noGoal);
  });

  it('shows a dash for a detailed total of exactly 0, and 0 for an empty macro', () => {
    renderSheet({
      entries: [makeEntry({ kcal: 0, protein: 0, nutrients: { sodium: 0 }, extras: {} })],
    });
    expect(row('sodium')).toBe(`Sodium ${words.nutrients.none} / 2,300 mg`);
    expect(row('potassium')).toBe(`Potassium ${words.nutrients.none} / 3,500 mg`);
    expect(row('taurine')).toBe(`Taurine ${words.nutrients.none} ${words.pillar.noGoal}`);
    expect(row('protein')).toBe('Protein 0 g / 150 g');
    expect(row('energy')).toBe('Calories 0 kcal / 2,000 kcal');
  });

  it('names the day it shows: Today, or the date', () => {
    const { unmount } = renderSheet();
    expect(within(sheet()).getByText(words.nutrients.today)).toBeVisible();
    unmount();

    renderSheet({ day: '2026-10-25', isToday: false });
    expect(document.querySelector('[data-ui="home.nutrients.day"]')).toHaveTextContent(
      'Sunday, October 25, 2026',
    );
  });

  it('shows energy in kJ against the target, and no goal for the macros without a profile', () => {
    const { unmount } = renderSheet({ entries: [makeEntry({ kcal: 500 })], unit: 'kJ' });
    expect(row('energy')).toBe('Kilojoules 2,092 kJ / 8,368 kJ');
    unmount();

    renderSheet({ entries: [makeEntry({ kcal: 500 })], targets: null });
    expect(row('energy')).toBe(`Calories 500 kcal ${words.pillar.noGoal}`);
    expect(row('protein')).toBe(`Protein 24 g ${words.pillar.noGoal}`);
  });

  it('names the pillars Home shows, plus water while it is tracked, and opens the picker from them', () => {
    const onChoosePillars = vi.fn();
    const { unmount } = renderSheet({ pillars: ['sodium', 'protein'], onChoosePillars });
    const choose = within(sheet()).getByRole('button', { name: /Choose pillars/ });
    expect(choose).toHaveTextContent('Sodium, Protein');
    fireEvent.click(choose);
    expect(onChoosePillars).toHaveBeenCalledTimes(1);
    unmount();

    renderSheet({ water: { totalMl: 500, goalMl: 2_000, unit: 'ml' } });
    expect(within(sheet()).getByRole('button', { name: /Choose pillars/ })).toHaveTextContent(
      'Protein, Carbs, Fat, Fibre, Water',
    );
  });

  it("shows the day's water against its goal in the water unit only while tracking is on", () => {
    const { unmount } = renderSheet();
    expect(
      within(sheet()).queryByRole('region', { name: words.nutrients.waterHeading }),
    ).toBeNull();
    unmount();

    renderSheet({ water: { totalMl: 750, goalMl: 2_000, unit: 'flOz' } });
    const water = within(sheet()).getByRole('region', { name: words.nutrients.waterHeading });
    expect(row('water')).toBe('Water 25.4 fl oz / 67.6 fl oz');
    expect(water).toHaveTextContent(words.nutrients.waterNote);
    // In order: pillars, water, macros, details.
    const headings = within(sheet())
      .getAllByRole('heading', { level: 3 })
      .map((heading) => heading.textContent);
    expect(headings).toEqual([
      words.nutrients.pillarsHeading,
      words.nutrients.waterHeading,
      words.nutrients.macrosHeading,
      words.nutrients.detailHeading,
    ]);
  });

  it('closes with Done', () => {
    const onClose = vi.fn();
    renderSheet({ onClose });
    fireEvent.click(within(sheet()).getByRole('button', { name: common.common.done }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
