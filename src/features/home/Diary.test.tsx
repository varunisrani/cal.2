import { fireEvent, render, screen, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { DiarySortMode } from '../../domain/meals/diary';
import { DEFAULT_MEAL_TIMES } from '../../domain/meals/times';
import type { DiaryEntry, Fast } from '../../domain/model';
import type { EnergyDisplayUnit } from '../../domain/units/energy';
import { home } from '../../i18n/en/home';
import { log } from '../../i18n/en/log';
import { fixedClock } from '../../lib/clock';
import { ServicesProvider, type Services } from '../../services/context';
import { FACTORY_NOW, makeEntry, makeFast, makeWater } from '../../test/factories';
import { ToastProvider } from '../../ui/Toast';
import { Diary, type DiaryProps } from './Diary';
import type { FoodRowActions } from './EntryRow';

const words = home.home;
const meals = log.log.meal;

/** 26 October 2026 at `hh:mm` in the test zone. */
const at = (time: string) => Date.parse(`2026-10-26T${time}:00-04:00`);

const services: Services = {
  diary: { logEntry: vi.fn(), deleteEntry: vi.fn() },
  onboarding: { complete: vi.fn() },
  aiSetup: {
    saveChoice: vi.fn(),
    savedKeyMask: vi.fn(),
    setTermsAccepted: vi.fn(),
    setUpLater: vi.fn(),
  },
  planBuilder: { build: vi.fn() },
  clock: fixedClock(FACTORY_NOW, 'America/New_York'),
};

function Providers({ children }: { children: ReactNode }) {
  return (
    <ServicesProvider services={services}>
      <ToastProvider>{children}</ToastProvider>
    </ServicesProvider>
  );
}

function renderDiary(
  entries: DiaryEntry[],
  unit: EnergyDisplayUnit = 'kcal',
  isToday = true,
  foodActions?: FoodRowActions,
) {
  return render(
    <Diary
      entries={entries}
      energyUnit={unit}
      times={DEFAULT_MEAL_TIMES}
      isToday={isToday}
      foodActions={foodActions}
    />,
    { wrapper: Providers },
  );
}

/** The diary with its tracker rows and sort control: today, kcal, the default meal times. */
function renderWith(props: Partial<DiaryProps>) {
  return render(
    <Diary
      entries={[]}
      energyUnit="kcal"
      times={DEFAULT_MEAL_TIMES}
      isToday
      onSortChange={vi.fn()}
      {...props}
    />,
    { wrapper: Providers },
  );
}

/** Each section's meal name with the names of its rows (food, Water, a fast's title), top to bottom. */
function layout(): string[][] {
  return Array.from(document.querySelectorAll<HTMLElement>('[data-ui^="home.meal."]'))
    .filter((section) => section.tagName === 'SECTION')
    .map((section) => [
      section.querySelector('h3')?.textContent ?? '',
      ...Array.from(section.querySelectorAll('li')).map(
        (row) =>
          row.querySelector('[id$="-name"], [id$="-title"]')?.textContent ?? row.textContent ?? '',
      ),
    ]);
}

/** The meal sections' names, top to bottom. */
const sectionNames = () =>
  screen.getAllByRole('heading', { level: 3 }).map((heading) => heading.textContent);

/** The entry names in the section `data-ui` names, top to bottom. */
function namesIn(hook: string): string[] {
  const section = document.querySelector<HTMLElement>(`[data-ui="${hook}"]`);
  if (!section) throw new Error(`no section ${hook}`);
  return within(section)
    .getAllByRole('group')
    .map((row) => row.querySelector('[id$="-name"]')?.textContent ?? '');
}

describe('Diary', () => {
  it('shows the empty card on a day with nothing logged (ACC-F10-1)', () => {
    renderDiary([]);
    expect(screen.getByRole('heading', { level: 2, name: words.diary.today })).toBeVisible();
    expect(screen.getByText(words.diary.empty)).toBeVisible();
    expect(document.querySelector('[data-ui="home.diary.empty"]')).not.toBeNull();
    expect(screen.queryAllByRole('heading', { level: 3 })).toEqual([]);
  });

  it('shows a 300 kcal breakfast under Breakfast with the section total 300 (ACC-F7-1)', () => {
    renderDiary([
      makeEntry({ name: 'Porridge', kcal: 300, protein: 11, carbs: 52, fat: 7, meal: 'breakfast' }),
    ]);
    const breakfast = screen.getByRole('region', { name: meals.breakfast });
    expect(within(breakfast).getByRole('group', { name: 'Porridge 300 kcal' })).toBeVisible();
    const totals = document.querySelector('[data-ui="home.meal.breakfast.totals"]');
    expect(totals).toHaveTextContent('300 kcal');
    expect(totals).toHaveTextContent('P 11 g · C 52 g · F 7 g');
    expect(screen.queryByText(words.diary.empty)).toBeNull();
  });

  it('lists the meals in their fixed order and the rows of each newest first', () => {
    renderDiary([
      makeEntry({ name: 'Crisps', meal: 'snack', loggedAt: at('21:30') }),
      makeEntry({ name: 'Toast', meal: 'breakfast', loggedAt: at('08:00') }),
      makeEntry({ name: 'Curry', meal: 'dinner', loggedAt: at('19:00') }),
      makeEntry({ name: 'Supplement', meal: 'other', loggedAt: at('10:00') }),
      makeEntry({ name: 'Yoghurt', meal: 'breakfast', loggedAt: at('09:30') }),
    ]);
    expect(sectionNames()).toEqual([meals.breakfast, meals.dinner, meals.snack, meals.other]);
    expect(namesIn('home.meal.breakfast')).toEqual(['Yoghurt', 'Toast']);
  });

  it('files an entry under the meal it was logged with, whatever its time', () => {
    renderDiary([makeEntry({ name: 'Late lunch', meal: 'lunch', loggedAt: at('16:45') })]);
    expect(sectionNames()).toEqual([meals.lunch]);
    expect(namesIn('home.meal.lunch')).toEqual(['Late lunch']);
  });

  it('totals a section in the display unit with whole grams', () => {
    renderDiary(
      [
        makeEntry({ meal: 'lunch', kcal: 250, protein: 3.4, carbs: 30.2, fat: 2.4 }),
        makeEntry({ meal: 'lunch', kcal: 410, protein: 24.4, carbs: 58, fat: 9.5 }),
      ],
      'kJ',
    );
    // 660 kcal is 2 761 kJ; 27.8 g, 88.2 g and 11.9 g round to whole grams.
    const totals = document.querySelector('[data-ui="home.meal.lunch.totals"]');
    expect(totals).toHaveTextContent('2,761 kJ');
    expect(totals).toHaveTextContent('P 28 g · C 88 g · F 12 g');
  });

  it('heads the list Today on today and Diary on another day', () => {
    renderDiary([], 'kcal', false);
    expect(screen.getByRole('heading', { level: 2, name: words.diary.day })).toBeVisible();
  });

  it("hands Home's row actions to every food row: a tap opens that entry, and picking shows on each (P06-19)", () => {
    const toast = makeEntry({ name: 'Toast', meal: 'breakfast', loggedAt: at('08:00') });
    const soup = makeEntry({ name: 'Soup', meal: 'lunch', loggedAt: at('12:30') });
    const actions: FoodRowActions = {
      picked: null,
      saved: null,
      onOpen: vi.fn(),
      onPick: vi.fn(),
      onToggle: vi.fn(),
    };
    const { rerender } = renderDiary([toast, soup], 'kcal', true, actions);

    fireEvent.click(screen.getByRole('button', { name: 'Edit Soup' }));
    expect(actions.onOpen).toHaveBeenCalledExactlyOnceWith(soup);
    fireEvent.click(screen.getByRole('button', { name: 'Select Toast' }));
    expect(actions.onPick).toHaveBeenCalledExactlyOnceWith(toast);

    rerender(
      <Diary
        entries={[toast, soup]}
        energyUnit="kcal"
        times={DEFAULT_MEAL_TIMES}
        isToday
        foodActions={{ ...actions, picked: new Set([toast.id]) }}
      />,
    );
    const pressed = screen
      .getAllByRole('button', { pressed: true })
      .map((button) => button.getAttribute('aria-label'));
    expect(pressed).toEqual(['Select Toast']);
    expect(screen.getByRole('button', { name: 'Select Soup', pressed: false })).toBeVisible();
  });
});

describe('Diary: water, fasts and the sort order (P07-05)', () => {
  it('puts water in the meal of its time and a fast in the meal it ended in, never in the totals (R05.4)', () => {
    renderWith({
      entries: [
        makeEntry({
          name: 'Porridge',
          kcal: 300,
          protein: 11,
          meal: 'breakfast',
          loggedAt: at('08:00'),
        }),
      ],
      water: [makeWater({ at: at('09:00'), ml: 500 }), makeWater({ at: at('19:30'), ml: 250 })],
      fasts: [makeFast({ start: at('12:15') - 16 * 3_600_000, end: at('12:15') })],
    });

    expect(layout()).toEqual([
      [meals.breakfast, words.water.title, 'Porridge'],
      [meals.lunch, '16h fast'],
      [meals.dinner, words.water.title],
    ]);
    // Water beside the porridge leaves its totals alone; a section of water or a fast has none.
    expect(document.querySelector('[data-ui="home.meal.breakfast.totals"]')).toHaveTextContent(
      '300 kcalP 11 g',
    );
    expect(document.querySelector('[data-ui="home.meal.lunch.totals"]')).toBeNull();
    expect(document.querySelector('[data-ui="home.meal.dinner.totals"]')).toBeNull();
  });

  it('places a running fast where it started and shows it as fasting now', () => {
    renderWith({ fasts: [makeFast({ start: at('06:30'), end: null })] });

    expect(layout()).toEqual([[meals.breakfast, words.fast.running]]);
  });

  it('shows repeated meal sections in time order when sorted newest first (ACC-F7-2)', () => {
    const entries = [
      makeEntry({ name: 'Toast', meal: 'breakfast', loggedAt: at('08:00') }),
      makeEntry({ name: 'Soup', meal: 'lunch', loggedAt: at('12:30') }),
      makeEntry({ name: 'Apple', meal: 'snack', loggedAt: at('15:00') }),
      makeEntry({ name: 'Sandwich', meal: 'lunch', loggedAt: at('16:00') }),
    ];
    const water = [makeWater({ at: at('12:45') })];
    const byMeal = renderWith({ entries, water, sort: 'byMeal' });
    expect(layout()).toEqual([
      [meals.breakfast, 'Toast'],
      [meals.lunch, 'Sandwich', words.water.title, 'Soup'],
      [meals.snack, 'Apple'],
    ]);
    byMeal.unmount();

    renderWith({ entries, water, sort: 'newestFirst' });
    expect(layout()).toEqual([
      [meals.lunch, 'Sandwich'],
      [meals.snack, 'Apple'],
      [meals.lunch, words.water.title, 'Soup'],
      [meals.breakfast, 'Toast'],
    ]);
  });

  it('draws the sort control in the first header only, and hands on the mode chosen', () => {
    const onSortChange = vi.fn<(mode: DiarySortMode) => void>();
    renderWith({
      entries: [
        makeEntry({ name: 'Toast', meal: 'breakfast', loggedAt: at('08:00') }),
        makeEntry({ name: 'Soup', meal: 'lunch', loggedAt: at('12:30') }),
      ],
      water: [makeWater({ at: at('19:00') })],
      sort: 'byMeal',
      onSortChange,
    });

    const sort = screen.getAllByRole('button', { name: words.sort.label });
    expect(sort).toHaveLength(1);
    const first = screen.getByRole('region', { name: meals.breakfast });
    expect(within(first).getByRole('button', { name: words.sort.label })).toBe(sort[0]);

    fireEvent.click(sort[0] as HTMLElement);
    fireEvent.click(screen.getByRole('menuitemradio', { name: words.sort.newestFirst }));
    expect(onSortChange).toHaveBeenCalledWith('newestFirst');
  });

  it('has no sort control on an empty day', () => {
    renderWith({});

    expect(screen.queryByRole('button', { name: words.sort.label })).toBeNull();
  });

  it('hands a tapped fast to its editor', () => {
    const onOpenFast = vi.fn<(fast: Fast) => void>();
    const fast = makeFast({ start: at('00:00'), end: at('10:00'), goalMin: 600 });
    renderWith({ fasts: [fast], onOpenFast });

    fireEvent.click(screen.getByRole('button', { name: '10h fast' }));
    expect(onOpenFast).toHaveBeenCalledWith(fast);
  });
});
