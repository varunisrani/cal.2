import { fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { LB_PER_KG } from '../../domain/units/body';
import { common } from '../../i18n/en/common';
import { onboarding } from '../../i18n/en/onboarding';
import { progress } from '../../i18n/en/progress';
import { FACTORY_NOW, makeProfile } from '../../test/factories';
import { closeHarnesses, until, untilGone, untilShown } from '../../test/screenHarness';
import { FALLBACK_LOG_KG, seedWeightKg } from './LogWeightSheet';
import { ProgressPage } from './ProgressPage';
import { openProgress, type ProgressSetup } from './testing/openProgress';

afterEach(closeHarnesses);

const words = progress.progress;
const wheelWords = onboarding.onboarding.wizard.weight;
const HOUR = 60 * 60 * 1000;
const SHEET = '[data-ui="progress.logWeight"]';

/** The figure of a weight-card badge, or '' when it is not there. */
const badge = (name: string): string =>
  document.querySelector(`[data-ui="progress.weight.${name}"]`)?.firstElementChild?.textContent ??
  '';

/** Progress with the Log weight sheet open. */
async function openSheet(setup: ProgressSetup) {
  const user = userEvent.setup();
  const h = await openProgress(setup);
  h.mount(<ProgressPage />);
  await untilShown('[data-ui="progress.weight.log"]');
  await user.click(screen.getByRole('button', { name: words.weight.log }));
  const sheet = within(screen.getByRole('dialog', { name: words.logWeight.title }));
  const wheel = (unit: 'kg' | 'lb') =>
    sheet.getByRole('combobox', { name: unit === 'kg' ? wheelWords.wholeKg : wheelWords.wholeLb });
  const tenths = () => sheet.getByRole('combobox', { name: wheelWords.tenths });
  const date = () => sheet.getByLabelText(common.common.date);
  const save = () => user.click(sheet.getByRole('button', { name: common.common.save }));
  return { ...h, user, sheet, wheel, tenths, date, save };
}

describe('LogWeightSheet', () => {
  it('opens on the newest weigh-in by date, not the last one added', async () => {
    const s = await openSheet({
      weighIns: [
        { at: FACTORY_NOW - 2 * HOUR, kg: 71.3 },
        { at: FACTORY_NOW - 48 * HOUR, kg: 72.8 },
      ],
    });
    expect(s.wheel('kg')).toHaveValue('71');
    expect(s.tenths()).toHaveValue('3');
    expect(s.date()).toHaveValue('2026-10-26');
  });

  it('opens on the profile weight without weigh-ins, and on 70 kg without either', async () => {
    const s = await openSheet({ profile: makeProfile({ weightKg: 64 }) });
    expect(s.wheel('kg')).toHaveValue('64');
    expect(s.tenths()).toHaveValue('0');

    expect(seedWeightKg(undefined, undefined)).toBe(FALLBACK_LOG_KG);
    expect(FALLBACK_LOG_KG).toBe(70);
    expect(seedWeightKg(71.3, 64)).toBe(71.3);
  });

  it('converts 70.0 kg to 154.3 lb on the toggle and changes the unit of the whole app (ACC-G4-2, R05.11)', async () => {
    const s = await openSheet({
      profile: makeProfile({ goal: 'maintain', goalWeightKg: undefined, weightKg: 70 }),
      weighIns: [{ at: FACTORY_NOW - 2 * HOUR, kg: 70 }],
    });
    expect(badge('current')).toBe('70.0 kg');

    await s.user.click(s.sheet.getByRole('radio', { name: words.logWeight.lb }));

    expect(s.wheel('lb')).toHaveValue('154');
    expect(s.tenths()).toHaveValue('3');
    // The card behind the sheet follows the app-wide unit.
    await until(() => badge('current') === '154.3 lb');
    expect(await s.repos.settingsRepo.get('units.weight')).toBe('lb');

    // An unmoved wheel stores the exact weight it opened on.
    await s.save();
    await untilGone(SHEET);
    const [newest] = await s.repos.weightRepo.history();
    expect(newest?.kg).toBe(70);
  });

  it('holds a weight the pound wheels cannot show at their 50 lb end, and stores that', async () => {
    const s = await openSheet({ profile: makeProfile({ weightKg: 21 }) });

    // 21 kg is 46.3 lb.
    await s.user.click(s.sheet.getByRole('radio', { name: words.logWeight.lb }));
    expect(s.wheel('lb')).toHaveValue('50');
    expect(s.tenths()).toHaveValue('0');

    await s.save();
    await untilGone(SHEET);
    const [newest] = await s.repos.weightRepo.history();
    expect(newest?.kg).toBeCloseTo(50 / LB_PER_KG, 9);
  });

  it('offers no day after today and holds a later typed date at today', async () => {
    const s = await openSheet({});
    expect(s.date()).toHaveAttribute('max', '2026-10-26');

    fireEvent.change(s.date(), { target: { value: '2026-10-28' } });

    expect(s.date()).toHaveValue('2026-10-26');
  });

  it('logs a weight for last week on that day at the current clock time, keeping the current weight (ACC-G4-1)', async () => {
    const s = await openSheet({
      profile: makeProfile({ weightKg: 64 }),
      weighIns: [{ at: FACTORY_NOW - 2 * HOUR, kg: 64 }],
    });

    await s.user.selectOptions(s.wheel('kg'), '66');
    await s.user.selectOptions(s.tenths(), '5');
    fireEvent.change(s.date(), { target: { value: '2026-10-21' } });
    await s.save();

    await untilGone(SHEET);
    expect(await s.repos.weightRepo.history()).toEqual([
      { id: expect.any(String), at: FACTORY_NOW - 2 * HOUR, kg: 64 },
      { id: expect.any(String), at: Date.parse('2026-10-21T12:30:00-04:00'), kg: 66.5 },
    ]);
    expect((await s.stored()).weightKg).toBe(64);
    await until(() => badge('average') === '65.3 kg');
    expect(badge('current')).toBe('64.0 kg');
  });

  it("stamps today's weight now and moves the current weight to it", async () => {
    const s = await openSheet({ profile: makeProfile({ weightKg: 64 }) });

    await s.user.selectOptions(s.wheel('kg'), '63');
    await s.user.selectOptions(s.tenths(), '2');
    await s.save();

    await untilGone(SHEET);
    expect(await s.repos.weightRepo.history()).toEqual([
      { id: expect.any(String), at: FACTORY_NOW, kg: 63.2 },
    ]);
    expect((await s.stored()).weightKg).toBe(63.2);
    await until(() => badge('current') === '63.2 kg');
  });

  it('closes on Cancel without storing anything', async () => {
    const s = await openSheet({});
    await s.user.selectOptions(s.wheel('kg'), '80');

    await s.user.click(s.sheet.getByRole('button', { name: common.common.cancel }));

    await untilGone(SHEET);
    expect(await s.repos.weightRepo.history()).toEqual([]);
    expect(s.router.current().sheets).toEqual([]);
  });
});
