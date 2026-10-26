import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRouter } from '../../app/router';
import { memoryHost } from '../../app/testing/memoryHost';
import { RouterProvider, useRoute } from '../../app/useRoute';
import { ageOn } from '../../domain/dates/age';
import { ACTIVITY_FACTORS, bmr, paceAdjustment } from '../../domain/goals/formulas';
import { ACTIVITIES } from '../../domain/model';
import { PACE_PRESETS } from '../../domain/profile/editRules';
import { about } from '../../i18n/en/about';
import { onboarding } from '../../i18n/en/onboarding';
import { settings } from '../../i18n/en/settings';
import { makeProfile } from '../../test/factories';
import { SETTINGS_CATEGORIES } from '../settings/registry';
import { SettingsScreen } from '../settings/SettingsScreen';
import { katchFigures, mifflinFigures } from './methodsFigures';
import { METHOD_SOURCES, MethodsPage } from './MethodsPage';

const words = about.about.methods;
const TODAY = '2026-10-26';

function part(ui: string): HTMLElement {
  const found = document.querySelector<HTMLElement>(`[data-ui="${ui}"]`);
  if (!found) throw new Error(`nothing drawn for ${ui}`);
  return found;
}

afterEach(() => {
  vi.doUnmock('../../domain/goals/formulas');
  vi.resetModules();
});

describe('MethodsPage', () => {
  it('lists every activity multiplier and protein rate from the domain table', () => {
    render(<MethodsPage />);
    const table = part('methods.activity');
    expect(within(table).getAllByRole('row')).toHaveLength(ACTIVITIES.length + 1);
    for (const activity of ACTIVITIES) {
      const { multiplier, proteinPerKg } = ACTIVITY_FACTORS[activity];
      const row = part(`methods.activity.${activity}`);
      expect(row).toHaveTextContent(onboarding.onboarding.activity.levels[activity].name);
      expect(row).toHaveTextContent(`× ${multiplier}`);
      expect(row).toHaveTextContent(`${proteinPerKg} g per kg`);
    }
    // Moderate is the app's own 1.465, not the textbook 1.55.
    expect(part('methods.activity.moderate')).toHaveTextContent('× 1.465');
  });

  it('follows the domain when its numbers change, so none is copied into the page', async () => {
    vi.resetModules();
    vi.doMock('../../domain/goals/formulas', async (importOriginal) => {
      const real = await importOriginal<typeof import('../../domain/goals/formulas')>();
      return {
        ...real,
        KCAL_PER_KG: 7_000,
        FAT_PER_KG: 0.7,
        ACTIVITY_FACTORS: {
          ...real.ACTIVITY_FACTORS,
          moderate: { ...real.ACTIVITY_FACTORS.moderate, multiplier: 1.5, proteinPerKg: 1.7 },
        },
      };
    });
    const { MethodsPage: Changed } = await import('./MethodsPage');
    render(<Changed />);

    expect(part('methods.activity.moderate')).toHaveTextContent('× 1.5');
    expect(part('methods.activity.moderate')).toHaveTextContent('1.7 g per kg');
    expect(part('methods.pace')).toHaveTextContent('7,000 kcal for every kilogram');
    expect(part('methods.macros')).toHaveTextContent('Fat: 0.7 g per kg');
  });

  it('writes both resting-burn equations with coefficients that reproduce the domain’s bmr', () => {
    render(<MethodsPage />);
    expect(part('methods.mifflin.male')).toHaveTextContent(
      'Male: 10 × kg + 6.25 × cm − 5 × years + 5',
    );
    expect(part('methods.mifflin.other')).toHaveTextContent(
      'Female or other: 10 × kg + 6.25 × cm − 5 × years − 161',
    );
    expect(part('methods.katch')).toHaveTextContent('370 + 21.6 × lean mass in kg');

    // The figures the page prints rebuild the app's own resting burn for real people.
    const mifflin = mifflinFigures();
    const katch = katchFigures();
    const people = [
      makeProfile(),
      makeProfile({ sex: 'female', birthDate: '1980-03-02', heightCm: 162, weightKg: 58.4 }),
      makeProfile({ sex: 'other', birthDate: '1999-12-31', heightCm: 181.5, weightKg: 95 }),
    ];
    for (const person of people) {
      const age = ageOn(person.birthDate, TODAY);
      const constant = person.sex === 'male' ? mifflin.male : mifflin.other;
      const written =
        mifflin.perKg * person.weightKg +
        mifflin.perCm * person.heightCm -
        mifflin.perYear * age +
        constant;
      expect(written).toBeCloseTo(bmr(person, TODAY), 9);
    }
    const lean = makeProfile({ weightKg: 80, bodyFat: 0.2 });
    expect(katch.base + katch.perLeanKg * 80 * (1 - 0.2)).toBeCloseTo(bmr(lean, TODAY), 9);
  });

  it('explains the pace maths with the domain’s energy per kg and each pace’s daily change', () => {
    render(<MethodsPage />);
    const pace = part('methods.pace');
    expect(pace).toHaveTextContent('7,700 kcal for every kilogram');
    expect(pace).toHaveTextContent('about 3,500 kcal for every pound');
    expect(pace).toHaveTextContent('One kcal is 4.184 kJ.');

    const paces = within(part('methods.paces')).getAllByRole('listitem');
    expect(paces.map((item) => item.textContent)).toEqual([
      `Slow ${PACE_PRESETS.slow} kg a week: ${paceAdjustment({ goal: 'gain', weeklyKg: 0.25 })} kcal a day`,
      'Steady 0.5 kg a week: 550 kcal a day',
      'Fast 1 kg a week: 1,100 kcal a day',
    ]);
  });

  it('explains protein, fat and carbs with the domain’s rates', () => {
    render(<MethodsPage />);
    const macros = part('methods.macros');
    expect(macros).toHaveTextContent('Protein: 0.8 to 2.2 g per kg of body weight');
    expect(macros).toHaveTextContent('plus 0.2 g per kg while you lose weight');
    expect(macros).toHaveTextContent('Fat: 0.6 g per kg of body weight.');
    expect(macros).toHaveTextContent('at 4 kcal per gram');
    expect(macros).toHaveTextContent('Protein also gives 4 kcal per gram and fat 9.');
  });

  it('says what the AI gets for the plan and what it never gets', () => {
    render(<MethodsPage />);
    const sent = within(part('methods.ai.sent')).getAllByRole('listitem');
    expect(sent.map((item) => item.textContent)).toEqual([
      words.ai.sentProfile,
      words.ai.sentDays,
      words.ai.sentReadings,
      words.ai.sentTargets,
    ]);
    const never = within(part('methods.ai.never')).getAllByRole('listitem');
    expect(never.map((item) => item.textContent)).toEqual([
      words.ai.neverNames,
      words.ai.neverNotes,
      words.ai.neverPhotos,
      words.ai.neverIngredients,
    ]);
    expect(part('methods.meals')).toHaveTextContent(words.meals.body);
  });

  it('cites its sources with links that open safely in a new tab', () => {
    render(<MethodsPage />);
    const sources = part('methods.sources');
    const links = within(sources).getAllByRole('link');
    expect(links).toHaveLength(METHOD_SOURCES.filter((source) => source.url !== null).length);
    for (const link of links) {
      expect(link).toHaveAttribute('target', '_blank');
      expect(link.getAttribute('rel')).toContain('noopener');
      expect(link.getAttribute('href')).toMatch(/^https:\/\//);
    }
    expect(within(sources).getByRole('link', { name: words.sources.mifflin.what })).toHaveAttribute(
      'href',
      'https://doi.org/10.1093/ajcn/51.2.241',
    );
    // The textbook has no single address; it is named without a link.
    expect(part('methods.source.katch')).toHaveTextContent(words.sources.katch.what);
  });

  it('ends with the not-medical-advice note', () => {
    render(<MethodsPage />);
    const headings = screen.getAllByRole('heading', { level: 2 });
    expect(headings.at(-1)).toHaveTextContent(words.advice.heading);
    expect(part('methods.advice')).toHaveTextContent(words.advice.body);
  });

  it('puts its headings one level under a sheet title when asked', () => {
    render(<MethodsPage headingLevel={3} />);
    expect(screen.queryAllByRole('heading', { level: 2 })).toHaveLength(0);
    expect(screen.getByRole('heading', { level: 3, name: words.resting.heading })).toBeVisible();
  });

  it('is registered as an About page in Settings at #/settings/methods', () => {
    expect(SETTINGS_CATEGORIES.find((category) => category.id === 'methods')).toMatchObject({
      group: 'info',
      titleKey: 'about.methods.title',
    });

    function SettingsTab() {
      const route = useRoute();
      return route.kind === 'tab' ? <SettingsScreen nested={route.nested} /> : null;
    }
    const host = memoryHost('#/settings');
    render(
      <RouterProvider router={createRouter(host)}>
        <SettingsTab />
      </RouterProvider>,
    );
    const group = screen.getByRole('region', { name: settings.settings.group.info });
    fireEvent.click(within(group).getByRole('button', { name: words.title }));

    expect(host.hash()).toBe('#/settings/methods');
    expect(screen.getByRole('heading', { level: 1, name: words.title })).toBeVisible();
    expect(screen.getByRole('heading', { level: 2, name: words.resting.heading })).toBeVisible();
  });
});
