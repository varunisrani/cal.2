import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { onboarding } from '../../../i18n/en/onboarding';
import { FEET_INCHES, METRIC, renderWizard, wizardAt } from '../testing/renderWizard';

const words = onboarding.onboarding;

function wheel(name: string): HTMLElement {
  return screen.getByRole('combobox', { name });
}

describe('Body', () => {
  it('toggles the height unit: converts the shown height and keeps the weight in kg', async () => {
    const user = userEvent.setup();
    const { latest } = renderWizard({ state: wizardAt('body', { heightCm: 170 }) });

    expect(screen.getByRole('radiogroup', { name: words.body.heightUnit })).toBeVisible();
    expect(screen.getByRole('radio', { name: words.body.cm })).toBeChecked();
    expect(wheel(words.body.centimetres)).toHaveValue('170');
    expect(wheel(words.wizard.weight.wholeKg)).toHaveValue('70');
    expect(wheel(words.wizard.weight.tenths)).toHaveValue('0');

    await user.click(screen.getByRole('radio', { name: words.body.ftIn }));

    expect(latest().units).toEqual(FEET_INCHES);
    // 170 cm is 66.9 in, read as 5′7″ (rounded, not cut to 5′6″).
    expect(wheel(words.body.feet)).toHaveValue('5');
    expect(wheel(words.body.inches)).toHaveValue('7');
    expect(wheel(words.wizard.weight.wholeKg)).toHaveValue('70');
    expect(wheel(words.wizard.weight.tenths)).toHaveValue('0');
    expect(screen.queryByRole('combobox', { name: words.body.centimetres })).toBeNull();
    expect(latest()).toMatchObject({ heightCm: 170, weightKg: 70 });
  });

  it('offers no weight unit: only the height unit can be switched (D-16.91)', () => {
    renderWizard({ state: wizardAt('body') });

    expect(screen.getAllByRole('radio').map((radio) => radio.textContent)).toEqual([
      words.body.cm,
      words.body.ftIn,
    ]);
    expect(document.body.textContent).not.toMatch(/\blb\b|pound/i);
  });

  it('reads 170 cm and 70.0 kg again after cm → ft and in → cm (R01.3)', async () => {
    const user = userEvent.setup();
    const { latest } = renderWizard({ state: wizardAt('body', { heightCm: 170 }) });

    await user.click(screen.getByRole('radio', { name: words.body.ftIn }));
    await user.click(screen.getByRole('radio', { name: words.body.cm }));

    expect(latest().units).toEqual(METRIC);
    expect(latest()).toMatchObject({ heightCm: 170, weightKg: 70 });
    expect(wheel(words.body.centimetres)).toHaveValue('170');
    expect(wheel(words.wizard.weight.wholeKg)).toHaveValue('70');
    expect(wheel(words.wizard.weight.tenths)).toHaveValue('0');
  });

  it('stores what the wheels pick in cm and kg', async () => {
    const user = userEvent.setup();
    const { latest } = renderWizard({ state: wizardAt('body', { units: FEET_INCHES }) });

    await user.selectOptions(wheel(words.body.feet), '6');
    await user.selectOptions(wheel(words.body.inches), '0');
    await user.selectOptions(wheel(words.wizard.weight.wholeKg), '81');
    await user.selectOptions(wheel(words.wizard.weight.tenths), '5');

    expect(latest().heightCm).toBeCloseTo(72 * 2.54, 9);
    expect(latest().weightKg).toBe(81.5);
    expect(latest().units).toEqual(FEET_INCHES);
  });

  it('offers the decided ranges: 100–250 cm or 3–8 ft, and 20–250 kg in both', async () => {
    const user = userEvent.setup();
    renderWizard({ state: wizardAt('body') });

    const options = (name: string): string[] =>
      Array.from(wheel(name).querySelectorAll('option'), (option) => option.value);
    const kgEnds = (): string[] => {
      const kg = options(words.wizard.weight.wholeKg);
      return [kg[0] ?? '', kg.at(-1) ?? ''];
    };
    expect(options(words.body.centimetres).slice(0, 1)).toEqual(['100']);
    expect(options(words.body.centimetres).at(-1)).toBe('250');
    expect(kgEnds()).toEqual(['20', '250']);

    await user.click(screen.getByRole('radio', { name: words.body.ftIn }));
    expect(options(words.body.feet)).toEqual(['3', '4', '5', '6', '7', '8']);
    expect(options(words.body.inches)).toHaveLength(12);
    expect(kgEnds()).toEqual(['20', '250']);
  });
});
