import { render, screen, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_MEAL_TIMES } from '../../domain/meals/times';
import type { DiaryEntry } from '../../domain/model';
import type { EnergyDisplayUnit } from '../../domain/units/energy';
import { home } from '../../i18n/en/home';
import { log } from '../../i18n/en/log';
import { fixedClock } from '../../lib/clock';
import { ServicesProvider, type Services } from '../../services/context';
import { FACTORY_NOW, makeEntry } from '../../test/factories';
import { ToastProvider } from '../../ui/Toast';
import { Diary } from './Diary';

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

function renderDiary(entries: DiaryEntry[], unit: EnergyDisplayUnit = 'kcal', isToday = true) {
  return render(
    <Diary entries={entries} energyUnit={unit} times={DEFAULT_MEAL_TIMES} isToday={isToday} />,
    { wrapper: Providers },
  );
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
});
