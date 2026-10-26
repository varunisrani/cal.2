import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import type { Targets } from '../../../domain/model';
import { about } from '../../../i18n/en/about';
import { common } from '../../../i18n/en/common';
import { onboarding } from '../../../i18n/en/onboarding';
import { closeHarnesses, openHarness, untilShown } from '../../../test/screenHarness';
import { STAND_IN_STEPS, TEST_TODAY, wizardAt } from '../testing/renderWizard';
import { WizardPage } from '../WizardPage';
import type { WizardState } from '../wizard';
import { planWheel, PlanReady } from './PlanReady';

afterEach(closeHarnesses);

const words = onboarding.onboarding.planReady;

/** The formula plan of the default profile (male, 25, 175 cm, 70 kg, moderate, maintain). */
const PLAN: Targets = { kcal: 2_452, protein: 112, carbs: 406, fat: 42 };

function planAt(plan: Targets = PLAN, aiUnavailable = false): WizardState {
  return wizardAt('planReady', { plan: { draft: { plan, touched: false }, aiUnavailable } });
}

/** The wizard on Plan ready inside the app's providers, with every state it reports. */
async function showPlan(state: WizardState = planAt(), energy: 'kcal' | 'kJ' = 'kcal') {
  const h = await openHarness({ hash: '#/onboarding' });
  if (energy === 'kJ') await h.repos.settingsRepo.set('units.energy', 'kJ');
  const states: WizardState[] = [];
  h.mount(
    <WizardPage
      today={TEST_TODAY}
      locale="en-GB"
      requestNotifications={async () => 'granted'}
      lateSteps={{ ...STAND_IN_STEPS, planReady: PlanReady }}
      initialState={state}
      onStateChange={(next) => states.push(next)}
    />,
  );
  await untilShown('[data-ui="wizard.plan.kcal"]');
  const latest = (): WizardState => {
    const last = states.at(-1);
    if (!last) throw new Error('the wizard reported no state');
    return last;
  };
  return { ...h, latest, user: userEvent.setup() };
}

function shownPart(ui: string): HTMLElement {
  const found = document.querySelector<HTMLElement>(`[data-ui="${ui}"]`);
  if (!found) throw new Error(`nothing drawn for ${ui}`);
  return found;
}

const wheel = () => screen.getByRole('combobox');
const save = () => screen.getByRole('button', { name: common.common.save });

describe('PlanReady', () => {
  it('shows the plan in kcal with a card per macro', async () => {
    await showPlan();

    expect(screen.getByRole('heading', { level: 1, name: words.title })).toBeVisible();
    expect(shownPart('wizard.plan.kcal')).toHaveTextContent(`2,452 ${words.energyCaption.kcal}`);
    expect(screen.getByRole('button', { name: 'Protein 112 g' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Carbs 406 g' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Fat 42 g' })).toBeVisible();
    expect(shownPart('wizard.plan.tuneUp')).toHaveTextContent(words.tuneUp);
    expect(document.querySelector('[data-ui="wizard.plan.low"]')).toBeNull();
    expect(document.querySelector('[data-ui="wizard.plan.aiUnavailable"]')).toBeNull();
    expect(screen.getByRole('button', { name: words.finish })).toBeEnabled();
    // Plan ready finishes through its own button; the wizard's Continue is not there.
    expect(document.querySelector('[data-ui="wizard.continue"]')).toBeNull();
  });

  it('opens each wheel on the Settings ranges, snapped down (D-16.12)', async () => {
    const { user } = await showPlan();
    const ends = async (card: string) => {
      await user.click(screen.getByRole('button', { name: card }));
      const options = Array.from(wheel().querySelectorAll('option'), (option) => option.value);
      const opened = (wheel() as HTMLSelectElement).value;
      await user.click(screen.getByRole('button', { name: common.common.cancel }));
      return [options[0], options.at(-1), opened, options[1]];
    };

    // kcal: 800 is below protein and fat's 826 kcal, so the wheel starts at 850.
    expect(await ends(`2,452 ${words.energyCaption.kcal}`)).toEqual(['850', '6000', '2450', '900']);
    expect(await ends('Protein 112 g')).toEqual(['10', '500', '110', '15']);
    expect(await ends('Carbs 406 g')).toEqual(['0', '800', '405', '5']);
    expect(await ends('Fat 42 g')).toEqual(['10', '220', '40', '15']);
  });

  it('re-derives carbs when protein changes to 150 (ACC-B8-1, R01.7)', async () => {
    const { user, latest } = await showPlan();

    await user.click(screen.getByRole('button', { name: 'Protein 112 g' }));
    expect(screen.getByRole('dialog', { name: words.edit.protein })).toBeVisible();
    await user.selectOptions(wheel(), '150');
    await user.click(save());

    // (2 452 − 4 × 150 − 9 × 42) ÷ 4 = 368.5 → 368 g carbs; kcal stays.
    expect(latest().plan?.draft.plan).toEqual({ kcal: 2_452, protein: 150, carbs: 368, fat: 42 });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('button', { name: 'Carbs 368 g' })).toBeVisible();
    expect(shownPart('wizard.plan.kcal')).toHaveTextContent('2,452');
  });

  it('re-derives kcal when carbs change to 300 (R01.7)', async () => {
    const { user, latest } = await showPlan();

    await user.click(screen.getByRole('button', { name: 'Carbs 406 g' }));
    await user.selectOptions(wheel(), '300');
    await user.click(save());

    // 4 × 112 + 4 × 300 + 9 × 42 = 2 026 kcal.
    expect(latest().plan?.draft.plan).toEqual({ kcal: 2_026, protein: 112, carbs: 300, fat: 42 });
    expect(shownPart('wizard.plan.kcal')).toHaveTextContent('2,026');
  });

  it('warns under 1 200 kcal: 1 150 shows it, 1 200 does not (ACC-B8-2)', async () => {
    const { user, latest } = await showPlan();
    const setKcal = async (value: string) => {
      await user.click(shownPart('wizard.plan.kcal'));
      await user.selectOptions(wheel(), value);
      await user.click(save());
    };

    await setKcal('1200');
    expect(latest().plan?.draft.plan.kcal).toBe(1_200);
    expect(document.querySelector('[data-ui="wizard.plan.low"]')).toBeNull();

    await setKcal('1150');
    expect(latest().plan?.draft.plan).toEqual({ kcal: 1_150, protein: 112, carbs: 81, fat: 42 });
    const warning = shownPart('wizard.plan.low');
    expect(warning).toHaveTextContent(words.low.title);
    expect(warning).toHaveTextContent(words.low.body.replace('{amount}', '1,200 kcal'));
  });

  it('marks the plan edited and says the tune-up will start off (R01.7)', async () => {
    const { user, latest } = await showPlan();

    // Cancel, and a Save with the wheel where it opened, change nothing.
    await user.click(screen.getByRole('button', { name: 'Fat 42 g' }));
    await user.selectOptions(wheel(), '60');
    await user.click(screen.getByRole('button', { name: common.common.cancel }));
    await user.click(screen.getByRole('button', { name: 'Fat 42 g' }));
    await user.click(save());
    expect(latest().plan?.draft).toEqual({ plan: PLAN, touched: false });
    expect(shownPart('wizard.plan.tuneUp')).toHaveTextContent(words.tuneUp);

    await user.click(screen.getByRole('button', { name: 'Fat 42 g' }));
    await user.selectOptions(wheel(), '60');
    await user.click(save());
    expect(latest().plan?.draft.touched).toBe(true);
    expect(latest().plan?.draft.plan).toEqual({ kcal: 2_452, protein: 112, carbs: 366, fat: 60 });
    expect(shownPart('wizard.plan.tuneUp')).toHaveTextContent(words.tuneUpEdited);
  });

  it('shows kJ to a kJ reader and keeps the exact kcal when the wheel is saved untouched (R06.20)', async () => {
    const { user, latest } = await showPlan(planAt(), 'kJ');

    // 2 452 kcal × 4.184 = 10 259 kJ.
    expect(shownPart('wizard.plan.kcal')).toHaveTextContent(`10,259 ${words.energyCaption.kJ}`);
    await user.click(shownPart('wizard.plan.kcal'));
    expect(screen.getByRole('dialog', { name: words.edit.kJ })).toBeVisible();
    expect(wheel()).toHaveValue('10200');
    await user.click(save());
    expect(latest().plan?.draft).toEqual({ plan: PLAN, touched: false });

    // A moved wheel converts: 10 300 kJ → 2 462 kcal, and carbs follow.
    await user.click(shownPart('wizard.plan.kcal'));
    await user.selectOptions(wheel(), '10300');
    await user.click(save());
    expect(latest().plan?.draft.plan).toEqual({ kcal: 2_462, protein: 112, carbs: 409, fat: 42 });
    expect(shownPart('wizard.plan.kcal')).toHaveTextContent('10,301');
  });

  it('notes when the formulas stood in for the AI (D-16.14)', async () => {
    await showPlan(planAt(PLAN, true));
    expect(shownPart('wizard.plan.aiUnavailable')).toHaveTextContent(words.aiUnavailable);
  });

  it('stops protein and fat where carbs reach 0, and kcal where protein and fat fit', async () => {
    // 4 × 100 + 9 × 60 = 940 kcal of the 1 000 are protein and fat.
    const tight = { kcal: 1_000, protein: 100, carbs: 15, fat: 60 };
    const { user, latest } = await showPlan(planAt(tight));

    await user.click(screen.getByRole('button', { name: 'Protein 100 g' }));
    const proteinRows = Array.from(wheel().querySelectorAll('option'), (option) => option.value);
    expect(proteinRows.at(-1)).toBe('115');
    expect(document.querySelector('[data-ui="wizard.plan.edit.held"]')).toBeNull();
    await user.selectOptions(wheel(), '115');
    expect(shownPart('wizard.plan.edit.held')).toHaveTextContent(words.edit.highest);
    await user.click(save());
    expect(latest().plan?.draft.plan).toEqual({ kcal: 1_000, protein: 115, carbs: 0, fat: 60 });

    // Now protein and fat hold 1 000 kcal: the energy wheel starts there.
    await user.click(shownPart('wizard.plan.kcal'));
    expect(wheel()).toHaveValue('1000');
    expect(wheel().querySelector('option')?.value).toBe('1000');
    expect(shownPart('wizard.plan.edit.held')).toHaveTextContent(
      words.edit.lowest.replace('{amount}', '1,000 kcal'),
    );
  });

  it('opens the calculation methods in a sheet and closes it with Done', async () => {
    const { user } = await showPlan();

    await user.click(screen.getByRole('button', { name: words.methods }));
    const sheet = screen.getByRole('dialog', { name: about.about.methods.title });
    expect(
      within(sheet).getByRole('heading', { level: 3, name: about.about.methods.resting.heading }),
    ).toBeVisible();
    expect(within(sheet).getByText('× 1.465')).toBeVisible();

    await user.click(within(sheet).getByRole('button', { name: common.common.done }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('finishes with the last button, once', async () => {
    const { user, latest } = await showPlan();

    await user.click(screen.getByRole('button', { name: words.finish }));
    expect(latest().finished).toBe(true);
    expect(latest().plan?.draft.plan).toEqual(PLAN);
    expect(screen.getByRole('button', { name: words.finish })).toBeDisabled();
  });
});

describe('planWheel', () => {
  it('keeps the Settings ranges when nothing else holds a value', () => {
    const roomy = { kcal: 6_000, protein: 10, carbs: 1_000, fat: 10 };
    expect(planWheel('protein', roomy, 'kcal')).toEqual({
      range: { min: 10, max: 500, step: 5 },
      held: null,
    });
    expect(planWheel('fat', roomy, 'kcal')).toEqual({
      range: { min: 10, max: 300, step: 5 },
      held: null,
    });
    expect(planWheel('kcal', roomy, 'kJ')).toEqual({
      range: { min: 3_400, max: 25_100, step: 100 },
      held: null,
    });
  });

  it('starts the kJ wheel at a step that still holds protein and fat', () => {
    // 4 × 150 + 9 × 80 = 1 320 kcal = 5 522.9 kJ → 5 600 on the wheel.
    const { range, held } = planWheel('kcal', { ...PLAN, protein: 150, fat: 80 }, 'kJ');
    expect(range.min).toBe(5_600);
    expect(held).toBe('min');
  });
});
