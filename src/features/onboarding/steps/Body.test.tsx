import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { onboarding } from '../../../i18n/en/onboarding';
import { IMPERIAL, METRIC, renderWizard, wizardAt } from '../testing/renderWizard';

const words = onboarding.onboarding;

function wheel(name: string): HTMLElement {
  return screen.getByRole('combobox', { name });
}

describe('Body', () => {
  it('toggles units: converts the shown height and weight and writes both unit settings', async () => {
    const user = userEvent.setup();
    const { latest } = renderWizard({ state: wizardAt('body', { heightCm: 170 }) });

    expect(screen.getByRole('radio', { name: words.body.metric })).toBeChecked();
    expect(wheel(words.body.centimetres)).toHaveValue('170');
    expect(wheel(words.wizard.weight.wholeKg)).toHaveValue('70');
    expect(wheel(words.wizard.weight.tenths)).toHaveValue('0');

    await user.click(screen.getByRole('radio', { name: words.body.imperial }));

    expect(latest().units).toEqual(IMPERIAL);
    // 170 cm is 66.9 in, read as 5′7″ (rounded, not cut to 5′6″); 70 kg is 154.3 lb.
    expect(wheel(words.body.feet)).toHaveValue('5');
    expect(wheel(words.body.inches)).toHaveValue('7');
    expect(wheel(words.wizard.weight.wholeLb)).toHaveValue('154');
    expect(wheel(words.wizard.weight.tenths)).toHaveValue('3');
    expect(screen.queryByRole('combobox', { name: words.body.centimetres })).toBeNull();
    expect(latest()).toMatchObject({ heightCm: 170, weightKg: 70 });
  });

  it('reads 70.0 kg again after kg → lb → kg (R01.3)', async () => {
    const user = userEvent.setup();
    const { latest } = renderWizard({ state: wizardAt('body') });

    await user.click(screen.getByRole('radio', { name: words.body.imperial }));
    await user.click(screen.getByRole('radio', { name: words.body.metric }));

    expect(latest().units).toEqual(METRIC);
    expect(latest().weightKg).toBe(70);
    expect(wheel(words.wizard.weight.wholeKg)).toHaveValue('70');
    expect(wheel(words.wizard.weight.tenths)).toHaveValue('0');
  });

  it('stores what the wheels pick in cm and kg', async () => {
    const user = userEvent.setup();
    const { latest } = renderWizard({ state: wizardAt('body', { units: IMPERIAL }) });

    await user.selectOptions(wheel(words.body.feet), '6');
    await user.selectOptions(wheel(words.body.inches), '0');
    await user.selectOptions(wheel(words.wizard.weight.wholeLb), '180');
    await user.selectOptions(wheel(words.wizard.weight.tenths), '5');

    expect(latest().heightCm).toBeCloseTo(72 * 2.54, 9);
    expect(latest().weightKg).toBeCloseTo(180.5 / 2.20462, 9);
    expect(latest().units).toEqual(IMPERIAL);
  });

  it('offers the decided ranges: 100–250 cm and 20–250 kg, or 3–8 ft and 50–500 lb', async () => {
    const user = userEvent.setup();
    renderWizard({ state: wizardAt('body') });

    const options = (name: string): string[] =>
      Array.from(wheel(name).querySelectorAll('option'), (option) => option.value);
    expect(options(words.body.centimetres).slice(0, 1)).toEqual(['100']);
    expect(options(words.body.centimetres).at(-1)).toBe('250');
    expect([
      options(words.wizard.weight.wholeKg)[0],
      options(words.wizard.weight.wholeKg).at(-1),
    ]).toEqual(['20', '250']);

    await user.click(screen.getByRole('radio', { name: words.body.imperial }));
    expect(options(words.body.feet)).toEqual(['3', '4', '5', '6', '7', '8']);
    expect(options(words.body.inches)).toHaveLength(12);
    expect([
      options(words.wizard.weight.wholeLb)[0],
      options(words.wizard.weight.wholeLb).at(-1),
    ]).toEqual(['50', '500']);
  });
});
