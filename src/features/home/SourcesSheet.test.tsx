import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { DiaryEntry, Targets } from '../../domain/model';
import { DEFAULT_GOAL_VALUES, type GoalValues } from '../../domain/nutrients/goalDefaults';
import type { SourceNutrient } from '../../domain/nutrients/sources';
import type { EnergyDisplayUnit } from '../../domain/units/energy';
import { common } from '../../i18n/en/common';
import { home } from '../../i18n/en/home';
import { formatTime } from '../../i18n/format';
import { FACTORY_NOW, makeEntry } from '../../test/factories';
import { inSentence, SourcesSheet } from './SourcesSheet';

const words = home.home;
const PLAN: Targets = { kcal: 2_000, protein: 150, carbs: 220, fat: 70 };
const HOUR = 60 * 60 * 1000;

function renderSheet({
  nutrient = 'sugar',
  entries = [],
  targets = PLAN,
  goals = DEFAULT_GOAL_VALUES,
  unit = 'kcal',
  day = '2026-10-26',
  isToday = true,
  onOpenEntry = () => undefined,
  onClose = () => undefined,
}: {
  nutrient?: SourceNutrient;
  entries?: DiaryEntry[];
  targets?: Targets | null;
  goals?: Readonly<GoalValues>;
  unit?: EnergyDisplayUnit;
  day?: string;
  isToday?: boolean;
  onOpenEntry?: (entry: DiaryEntry) => void;
  onClose?: () => void;
} = {}) {
  return render(
    <SourcesSheet
      nutrient={nutrient}
      day={day}
      isToday={isToday}
      entries={entries}
      targets={targets}
      goals={goals}
      energyUnit={unit}
      onOpenEntry={onOpenEntry}
      onClose={onClose}
    />,
  );
}

const hook = (name: string) => document.querySelector<HTMLElement>(`[data-ui="${name}"]`);
const rows = () => screen.queryAllByRole('button').filter((b) => b.dataset.ui === 'sources.row');
const names = () => rows().map((row) => row.textContent);

/** A sweet day: juice and muesli at breakfast, dal at lunch, and a food with no sugar figure. */
function sweetDay(): DiaryEntry[] {
  return [
    makeEntry({
      id: 'muesli',
      name: 'Muesli',
      emoji: '🥣',
      meal: 'breakfast',
      loggedAt: FACTORY_NOW - 4 * HOUR,
      nutrients: { sugar: 6, fibre: 7 },
    }),
    makeEntry({
      id: 'dal',
      name: 'Dal and rice',
      meal: 'lunch',
      loggedAt: FACTORY_NOW,
      nutrients: { sugar: 3, fibre: 9 },
    }),
    makeEntry({
      id: 'juice',
      name: 'Orange juice',
      emoji: '🧃',
      meal: 'breakfast',
      loggedAt: FACTORY_NOW - 3 * HOUR,
      nutrients: { sugar: 21 },
    }),
    makeEntry({ id: 'wrap', name: 'Paneer wrap', meal: 'dinner', nutrients: { fibre: 5 } }),
  ];
}

describe('SourcesSheet (D-16.105)', () => {
  it("lists the foods that gave the nutrient, largest first, each with its amount, meal and time and share of the day's total", () => {
    const entries = sweetDay();
    renderSheet({ entries });

    expect(screen.getByRole('dialog', { name: 'Sugar by food' })).toBeVisible();
    expect(hook('sources.day')).toHaveTextContent(words.nutrients.today);
    expect(hook('sources.body')).toHaveAttribute('data-nutrient', 'sugar');
    expect(hook('sources.total')).toHaveTextContent('30 g of 50 g limit');

    const at = (id: string) => formatTime(entries.find((entry) => entry.id === id)!.loggedAt);
    expect(rows().map((row) => row.dataset.entry)).toEqual(['juice', 'muesli', 'dal']);
    // Each row is one button named by its words, in reading order; the tile and bar are drawing.
    expect(rows()[0]).toHaveAccessibleName(`Orange juice 21 g Breakfast, ${at('juice')} 70%`);
    expect(rows()[1]).toHaveAccessibleName(`Muesli 6 g Breakfast, ${at('muesli')} 20%`);
    expect(rows()[2]).toHaveAccessibleName(`Dal and rice 3 g Lunch, ${at('dal')} 10%`);
    expect(names()[0]).toContain('🧃');
    const bars = rows().map((row) => row.querySelector<HTMLElement>('[data-ui="sources.row.bar"]'));
    expect(bars.map((bar) => bar?.getAttribute('aria-hidden'))).toEqual(['true', 'true', 'true']);
    expect(bars.map((bar) => (bar?.firstElementChild as HTMLElement).style.inlineSize)).toEqual([
      '70%',
      '20%',
      '10%',
    ]);
    // A food without an emoji shows how it was logged.
    expect(rows()[2]!.querySelector('svg')).not.toBeNull();

    // The wrap has no sugar figure: counted apart, never as 0 g.
    expect(hook('sources.noFigure')).toHaveTextContent('1 food has no sugar figure');
    expect(hook('sources.empty')).toBeNull();
  });

  it('says how far over a limit the day is, in the warning colour', () => {
    renderSheet({
      entries: [
        makeEntry({ nutrients: { sugar: 41.25 } }),
        makeEntry({ nutrients: { sugar: 17 } }),
      ],
    });
    expect(hook('sources.total')).toHaveTextContent('58.3 g of 50 g limit 8.3 g over');
    expect(hook('sources.total')).toHaveAttribute('data-over', 'true');
    expect(hook('sources.over')).toHaveTextContent('8.3 g over');
  });

  it('is not over exactly at the limit, compared as shown', () => {
    renderSheet({
      nutrient: 'sodium',
      entries: [
        makeEntry({ nutrients: { sodium: 2_000 } }),
        makeEntry({ nutrients: { sodium: 300.04 } }),
      ],
    });
    expect(hook('sources.total')).toHaveTextContent(/^2,300 mg of 2,300 mg limit$/);
    expect(hook('sources.total')).not.toHaveAttribute('data-over');
    expect(hook('sources.over')).toBeNull();
  });

  it('reads the total against a goal to reach: an optional goal, and a macro against the targets', () => {
    const { unmount } = renderSheet({ nutrient: 'fibre', entries: sweetDay() });
    expect(screen.getByRole('dialog', { name: 'Fibre by food' })).toBeVisible();
    expect(hook('sources.total')).toHaveTextContent(/^21 g of 30 g goal$/);
    expect(rows().map((row) => row.dataset.entry)).toEqual(['dal', 'muesli', 'wrap']);
    expect(hook('sources.noFigure')).toHaveTextContent('1 food has no fibre figure');
    unmount();

    renderSheet({
      nutrient: 'protein',
      entries: [makeEntry({ protein: 31.25 }), makeEntry({ protein: 9 })],
    });
    expect(hook('sources.total')).toHaveTextContent(/^40.3 g of 150 g goal$/);
    expect(names()[0]).toContain('31.3 g');
    expect(hook('sources.noFigure')).toBeNull();
  });

  it('shows the total alone without a goal: one turned off, a fat that never has one, no profile', () => {
    const entries = [makeEntry({ protein: 20, nutrients: { sugar: 12, monounsaturatedFat: 3.5 } })];
    const { unmount } = renderSheet({ entries, goals: { ...DEFAULT_GOAL_VALUES, sugar: 0 } });
    expect(hook('sources.total')).toHaveTextContent(/^12 g$/);
    unmount();

    const fat = renderSheet({ nutrient: 'monounsaturatedFat', entries });
    expect(screen.getByRole('dialog', { name: 'Monounsaturated fat by food' })).toBeVisible();
    expect(hook('sources.total')).toHaveTextContent(/^3.5 g$/);
    fat.unmount();

    renderSheet({ nutrient: 'protein', entries, targets: null });
    expect(hook('sources.total')).toHaveTextContent(/^20 g$/);
  });

  it('never counts a food without a figure as 0: no total when none has one, the foods counted apart', () => {
    renderSheet({
      nutrient: 'vitaminC',
      entries: [makeEntry({ nutrients: {} }), makeEntry({ nutrients: { fibre: 2 } })],
    });
    expect(screen.getByRole('dialog', { name: 'Vitamin C by food' })).toBeVisible();
    expect(hook('sources.total')).toBeNull();
    expect(hook('sources.list')).toBeNull();
    expect(hook('sources.empty')).toHaveTextContent('No vitamin C counted on this day.');
    expect(hook('sources.noFigure')).toHaveTextContent('2 foods have no vitamin C figure');
  });

  it('lists no food that gave 0, though its 0 counts in the total', () => {
    renderSheet({ entries: [makeEntry({ nutrients: { sugar: 0 } })] });
    expect(hook('sources.total')).toHaveTextContent('0 g of 50 g limit');
    expect(rows()).toEqual([]);
    expect(hook('sources.empty')).toHaveTextContent('No sugar counted on this day.');
    expect(hook('sources.noFigure')).toBeNull();
  });

  it('says nothing was counted on a day without food', () => {
    renderSheet({ nutrient: 'kcal' });
    expect(hook('sources.total')).toBeNull();
    expect(hook('sources.empty')).toHaveTextContent('No calories counted on this day.');
    expect(hook('sources.noFigure')).toBeNull();
  });

  it("shows energy in the person's unit against the day's target", () => {
    renderSheet({
      nutrient: 'kcal',
      unit: 'kJ',
      entries: [makeEntry({ id: 'soup', kcal: 400 }), makeEntry({ id: 'cake', kcal: 100 })],
    });
    expect(screen.getByRole('dialog', { name: 'Kilojoules by food' })).toBeVisible();
    expect(hook('sources.total')).toHaveTextContent(/^2,092 kJ of 8,368 kJ goal$/);
    expect(rows().map((row) => row.dataset.entry)).toEqual(['soup', 'cake']);
    expect(names()[0]).toContain('1,674 kJ');
    expect(names()[0]).toContain('80%');
  });

  it('names the day it shows when it is not today', () => {
    renderSheet({ day: '2026-10-25', isToday: false, entries: sweetDay() });
    expect(hook('sources.day')).toHaveTextContent('Sunday, October 25, 2026');
  });

  it("opens a food's entry from its row, and closes with Done", () => {
    const onOpenEntry = vi.fn();
    const onClose = vi.fn();
    const entries = sweetDay();
    renderSheet({ entries, onOpenEntry, onClose });
    fireEvent.click(rows()[1]!);
    expect(onOpenEntry).toHaveBeenCalledWith(entries[0]);

    const sheet = screen.getByRole('dialog', { name: 'Sugar by food' });
    fireEvent.click(within(sheet).getByRole('button', { name: common.common.done }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('inSentence', () => {
  it('lower-cases a name inside a sentence, unless its second letter is not lower case', () => {
    expect(inSentence('Sugar')).toBe('sugar');
    expect(inSentence('Vitamin C')).toBe('vitamin C');
    expect(inSentence('Omega-3')).toBe('omega-3');
    expect(inSentence('Calories')).toBe('calories');
    expect(inSentence('HMB')).toBe('HMB');
    expect(inSentence('L-arginine')).toBe('L-arginine');
  });
});
