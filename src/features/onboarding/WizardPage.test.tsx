import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { common } from '../../i18n/en/common';
import { onboarding } from '../../i18n/en/onboarding';
import type { StepProps } from './steps/stepProps';
import { renderWizard, TEST_TODAY, wizardAt } from './testing/renderWizard';
import { WizardPage } from './WizardPage';

const words = onboarding.onboarding;

function heading(): HTMLElement {
  return screen.getByRole('heading', { level: 1 });
}

function continueButton(): HTMLElement {
  return screen.getByRole('button', { name: words.wizard.continue });
}

describe('WizardPage', () => {
  it('opens a fresh wizard on Welcome without Back or progress, and Get started begins it (ACC-B1-1)', async () => {
    const user = userEvent.setup();
    const { latest } = renderWizard();

    expect(heading()).toHaveTextContent(words.welcome.headlineTop);
    expect(latest().step).toBe('welcome');
    expect(screen.queryByRole('button', { name: common.common.back })).toBeNull();
    expect(screen.queryByRole('progressbar')).toBeNull();
    expect(screen.queryByRole('button', { name: words.wizard.continue })).toBeNull();

    await user.click(screen.getByRole('button', { name: words.welcome.start }));

    expect(heading()).toHaveTextContent(words.sex.title);
    expect(latest().step).toBe('sex');
    expect(screen.getByRole('button', { name: common.common.back })).toHaveAttribute(
      'data-ui',
      'wizard.back',
    );
    const progress = screen.getByRole('progressbar', { name: words.wizard.progress });
    expect(progress).toHaveAttribute('aria-valuetext', 'Step 1 of 12');
    expect(progress).toHaveAttribute('aria-valuenow', String(Math.round(100 / 12)));
  });

  it('walks from Welcome to Body fat with the keyboard only, each step keeping its answer (ACC-B2-1)', async () => {
    const user = userEvent.setup();
    const { latest } = renderWizard();

    // Welcome: the first stop is Get started.
    await user.tab();
    expect(document.activeElement).toHaveAttribute('data-ui', 'wizard.start');
    await user.keyboard('{Enter}');

    // Sex: focus lands on the heading; the cards are one stop; arrows change the choice.
    expect(document.activeElement).toBe(heading());
    await user.tab();
    expect(document.activeElement).toHaveAttribute('data-ui', 'wizard.sex.male');
    await user.keyboard('{ArrowDown}');
    expect(latest().sex).toBe('female');
    await user.tab();
    expect(document.activeElement).toBe(continueButton());
    await user.keyboard('{Enter}');

    // Birthday: keep the default and move on.
    expect(heading()).toHaveTextContent(words.birthday.title);
    await user.tab();
    expect(document.activeElement).toHaveAttribute('data-ui', 'wizard.birthday.date');
    await user.tab();
    await user.keyboard('{Enter}');

    // Body: switch to imperial, then one inch taller and one pound heavier.
    expect(heading()).toHaveTextContent(words.body.title);
    await user.tab();
    expect(document.activeElement).toHaveAttribute('data-ui', 'wizard.body.units.metric');
    await user.keyboard('{ArrowRight}');
    expect(latest().units).toEqual({ height: 'ftIn', weight: 'lb' });
    await user.tab();
    expect(document.activeElement).toHaveAttribute('data-ui', 'wizard.body.height.feet');
    await user.tab();
    await user.keyboard('{ArrowDown}');
    await user.tab();
    expect(document.activeElement).toHaveAttribute('data-ui', 'wizard.body.weight.whole');
    await user.keyboard('{ArrowDown}');
    await user.tab();
    await user.tab();
    expect(document.activeElement).toBe(continueButton());
    await user.keyboard('{Enter}');

    // Body fat: say yes; the wheel opens on 20 %.
    expect(heading()).toHaveTextContent(words.bodyFat.title);
    await user.tab();
    expect(document.activeElement).toHaveAttribute('data-ui', 'wizard.bodyFat.known.no');
    await user.keyboard('{ArrowUp}');

    const state = latest();
    expect(state).toMatchObject({
      step: 'bodyFat',
      sex: 'female',
      birthDate: '2001-10-26',
      bodyFat: 0.2,
    });
    // 175 cm is 5′9″ and 70 kg is 154.3 lb; one row down on each wheel.
    expect(state.heightCm).toBeCloseTo(70 * 2.54, 6);
    expect(state.weightKg).toBeCloseTo(155.3 / 2.20462, 6);
    expect(screen.getByRole('combobox', { name: words.bodyFat.wheel })).toHaveValue('20');
  });

  it('walks from Activity to AI access, each step starting on its default (ACC-B2-1)', async () => {
    const user = userEvent.setup();
    const { latest } = renderWizard({ state: wizardAt('activity') });

    // Activity: moderate to start, each level with its line and steps guide.
    expect(screen.getAllByRole('radio')).toHaveLength(6);
    expect(screen.getByRole('radio', { name: words.activity.levels.moderate.name })).toBeChecked();
    expect(
      screen.getByRole('radio', { name: words.activity.levels.moderate.name }),
    ).toHaveAccessibleDescription(
      `${words.activity.levels.moderate.about} 7,500 to 9,999 steps a day`,
    );
    expect(screen.getByText('Under 5,000 steps a day')).toBeVisible();
    expect(screen.getByText('15,000 or more steps a day')).toBeVisible();
    await user.click(screen.getByRole('radio', { name: words.activity.levels.active.name }));
    await user.click(continueButton());

    // Goal: keep to start; losing seeds the target 5 kg lower.
    expect(screen.getByRole('radio', { name: words.goal.maintain })).toBeChecked();
    await user.click(screen.getByRole('radio', { name: words.goal.lose }));
    await user.click(continueButton());

    expect(heading()).toHaveTextContent(words.target.title);
    expect(screen.getByRole('combobox', { name: words.wizard.weight.wholeKg })).toHaveValue('65');
    await user.click(continueButton());

    expect(heading()).toHaveTextContent(words.pace.title);
    expect(screen.getByRole('region', { name: words.pace.daysTitle })).toHaveTextContent(
      'About 70 days',
    );
    await user.click(continueButton());

    expect(heading()).toHaveTextContent(words.reminders.title);
    await user.click(continueButton());

    expect(heading()).toHaveTextContent(words.wizard.pending.aiAccess);
    expect(continueButton()).toBeDisabled();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuetext', 'Step 10 of 12');
    expect(latest()).toMatchObject({
      step: 'aiAccess',
      activity: 'active',
      goal: 'lose',
      targetKg: 65,
      pace: 'steady',
      reminders: null,
    });
  });

  it('shows weight in pounds in a fresh wizard in an en-US browser (ACC-B11-2)', async () => {
    const language = vi.spyOn(navigator, 'language', 'get').mockReturnValue('en-US');
    const user = userEvent.setup();
    const toBody = async (): Promise<void> => {
      await user.click(screen.getByRole('button', { name: words.welcome.start }));
      await user.click(continueButton());
      await user.click(continueButton());
      expect(heading()).toHaveTextContent(words.body.title);
    };
    const first = render(
      <WizardPage today={TEST_TODAY} requestNotifications={async () => 'granted'} />,
    );
    await toBody();

    expect(screen.getByRole('radio', { name: words.body.imperial })).toBeChecked();
    expect(screen.getByRole('combobox', { name: words.wizard.weight.wholeLb })).toHaveValue('154');
    expect(screen.getByRole('combobox', { name: words.body.feet })).toHaveValue('5');
    expect(screen.queryByRole('combobox', { name: words.wizard.weight.wholeKg })).toBeNull();
    first.unmount();

    // The same fresh wizard in a British browser reads kilograms and centimetres.
    language.mockReturnValue('en-GB');
    render(<WizardPage today={TEST_TODAY} requestNotifications={async () => 'granted'} />);
    await toBody();
    expect(screen.getByRole('radio', { name: words.body.metric })).toBeChecked();
    expect(screen.getByRole('combobox', { name: words.wizard.weight.wholeKg })).toHaveValue('70');
  });

  it('goes back with the chevron and keeps the answers given', async () => {
    const user = userEvent.setup();
    const { latest } = renderWizard({ state: wizardAt('goal') });

    await user.click(screen.getByRole('radio', { name: words.goal.gain }));
    await user.click(continueButton());
    expect(latest().step).toBe('target');

    await user.click(screen.getByRole('button', { name: common.common.back }));
    expect(heading()).toHaveTextContent(words.goal.title);
    expect(document.activeElement).toBe(heading());
    expect(screen.getByRole('radio', { name: words.goal.gain })).toBeChecked();
  });

  it('shows Back but no progress on Plan ready, and neither while the plan is built', () => {
    const { unmount } = renderWizard({
      state: wizardAt('planReady', {
        plan: {
          draft: { plan: { kcal: 2_000, protein: 120, carbs: 230, fat: 70 }, touched: false },
          aiUnavailable: false,
        },
      }),
    });
    expect(heading()).toHaveTextContent(words.wizard.pending.planReady);
    expect(screen.getByRole('button', { name: common.common.back })).toBeVisible();
    expect(screen.queryByRole('progressbar')).toBeNull();
    expect(screen.queryByRole('button', { name: words.wizard.continue })).toBeNull();
    unmount();

    renderWizard({ state: wizardAt('buildingPlan', { buildRun: 1 }) });
    expect(heading()).toHaveTextContent(words.wizard.pending.buildingPlan);
    expect(screen.queryByRole('button', { name: common.common.back })).toBeNull();
    expect(screen.queryByRole('progressbar')).toBeNull();
    expect(screen.queryByRole('button', { name: words.wizard.continue })).toBeNull();
  });

  it('holds Continue on AI access until the step reports ready, then builds with the view it is given', async () => {
    const user = userEvent.setup();
    let finish: (() => void) | undefined;
    function Access({ dispatch }: StepProps) {
      return (
        <button type="button" onClick={() => dispatch({ type: 'aiReady', ready: true })}>
          ready
        </button>
      );
    }
    function Building({ state, dispatch }: StepProps) {
      finish = () =>
        dispatch({
          type: 'planBuilt',
          run: state.buildRun,
          plan: { kcal: 2_000, protein: 120, carbs: 230, fat: 70 },
          aiUnavailable: true,
        });
      return null;
    }
    const { latest } = renderWizard({
      state: wizardAt('aiAccess'),
      lateSteps: { aiAccess: Access, buildingPlan: Building },
    });

    expect(continueButton()).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'ready' }));
    expect(continueButton()).toBeEnabled();
    await user.click(continueButton());
    expect(latest()).toMatchObject({ step: 'buildingPlan', buildRun: 1 });

    act(() => finish?.());
    expect(latest().step).toBe('planReady');
    expect(heading()).toHaveTextContent(words.wizard.pending.planReady);
  });
});
