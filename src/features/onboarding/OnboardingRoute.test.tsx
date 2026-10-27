import { act, fireEvent, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Targets } from '../../domain/model';
import { aiSetup } from '../../i18n/en/aiSetup';
import { onboarding } from '../../i18n/en/onboarding';
import type { OnboardingService } from '../../services/onboarding';
import { FACTORY_NOW } from '../../test/factories';
import { closeHarnesses, openHarness, untilShown, type Harness } from '../../test/screenHarness';
import { answersOf, OnboardingRoute } from './OnboardingRoute';
import { BUILD_ANIMATION_MS } from './steps/BuildingPlan';
import { wizardAt } from './testing/renderWizard';
import { WIZARD_STEPS } from './wizard';

afterEach(async () => {
  vi.useRealTimers();
  await closeHarnesses();
});

const words = onboarding.onboarding;

/** The formula plan of the wizard's defaults (male, 25, 175 cm, 70 kg, moderate, maintain). */
const FORMULA: Targets = { kcal: 2_452, protein: 112, carbs: 406, fat: 42 };

/** One turn of the event loop (a message, not a timer), for the test database's callbacks. */
function nextTurn(): Promise<void> {
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    channel.port1.onmessage = () => {
      channel.port1.close();
      resolve();
    };
    channel.port2.postMessage(null);
  });
}

/**
 * Waits for `check` while the timers are fake: each turn fires the zero-delay timers the live
 * queries start with (no time passes) and gives the database one turn.
 */
async function untilOnFakeTimers(check: () => boolean | Promise<boolean>): Promise<void> {
  for (let turn = 0; turn < 500; turn++) {
    if (await check()) return;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
      await nextTurn();
    });
  }
  throw new Error('untilOnFakeTimers: never got there');
}

const onStep = (step: string) => () =>
  document.querySelector(`[data-ui="screen.onboarding"][data-step="${step}"]`) !== null;

/**
 * Walks the wizard's shortest path from Welcome to Plan ready: Get started, Continue on every
 * step's default, "Set up later" on AI access, then the plan being built (fake timers from there).
 */
async function walkToPlanReady(h: Harness): Promise<void> {
  const user = userEvent.setup();
  h.mount(<OnboardingRoute />);
  await user.click(screen.getByRole('button', { name: words.welcome.start }));
  for (const step of WIZARD_STEPS.slice(1, WIZARD_STEPS.indexOf('aiAccess'))) {
    expect(onStep(step)()).toBe(true);
    await user.click(screen.getByRole('button', { name: words.wizard.continue }));
  }
  await untilShown('[data-ui="wizard.ai.later"]');

  vi.useFakeTimers({
    now: FACTORY_NOW,
    toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'],
  });
  fireEvent.click(screen.getByRole('button', { name: aiSetup.aiSetup.access.later }));
  await untilOnFakeTimers(onStep('buildingPlan'));
  await act(() => vi.advanceTimersByTimeAsync(BUILD_ANIMATION_MS));
  await untilOnFakeTimers(() => document.querySelector('[data-ui="wizard.plan.finish"]') !== null);
}

const finishButton = () => screen.getByRole('button', { name: words.planReady.finish });

describe('OnboardingRoute', () => {
  it('walks the shortest path and finishes: the plan, one weigh-in, the units and the done flag are stored (ACC-B9-1)', async () => {
    const h = await openHarness({ hash: '#/onboarding' });
    await walkToPlanReady(h);
    expect(screen.getByText(words.planReady.aiUnavailable)).toBeVisible();

    fireEvent.click(finishButton());
    const { settingsRepo, profileRepo, weightRepo } = h.repos;
    await untilOnFakeTimers(() => settingsRepo.get('onboarding.done'));

    const stored = await profileRepo.get();
    expect(stored.kind === 'ok' && stored.value).toMatchObject({
      sex: 'male',
      heightCm: 175,
      weightKg: 70,
      goal: 'maintain',
      saved: FORMULA,
    });
    expect(await weightRepo.history()).toEqual([
      { id: expect.any(String), at: FACTORY_NOW, kg: 70 },
    ]);
    const settings = await settingsRepo.snapshot();
    // The test browser reads en-US, so the wizard started in feet and inches, and in kg.
    expect(settings['units.weight']).toBe('kg');
    expect(settings['units.height']).toBe('ftIn');
    expect(settings['tuneUp.on']).toBe(true);
    expect(settings['ai.settings']).toBeNull();
  });

  it('says so when the save fails, opens Plan ready again, and a second press finishes', async () => {
    const complete = vi
      .fn<OnboardingService['complete']>()
      .mockRejectedValueOnce(new Error('The disk is full'))
      .mockResolvedValueOnce(undefined);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const h = await openHarness({ hash: '#/onboarding', onboarding: { complete } });
    await walkToPlanReady(h);

    fireEvent.click(finishButton());
    await untilOnFakeTimers(() => screen.queryByText(words.finishFailed) !== null);
    expect(complete).toHaveBeenCalledTimes(1);
    // Plan ready opens again from the same answers, its button live.
    await untilOnFakeTimers(
      () => document.querySelector('[data-ui="wizard.plan.finish"]') !== null,
    );
    expect(finishButton()).toBeEnabled();

    fireEvent.click(finishButton());
    await untilOnFakeTimers(() => complete.mock.calls.length === 2);
    expect(complete.mock.calls[1]).toEqual(complete.mock.calls[0]);
    expect(complete.mock.calls[1]?.[0]).toMatchObject({
      plan: FORMULA,
      planEdited: false,
      remindersOn: false,
      units: { height: 'ftIn', weight: 'kg' },
    });
    expect(complete.mock.calls[1]?.[1]).toEqual({ now: FACTORY_NOW });
    expect(finishButton()).toBeDisabled();
  });
});

describe('answersOf', () => {
  const plan = { draft: { plan: FORMULA, touched: true }, aiUnavailable: false };

  it('maps a finished wizard to what onboarding stores', () => {
    const state = wizardAt('planReady', {
      plan,
      finished: true,
      reminders: 'granted',
      units: { height: 'ftIn', weight: 'kg' },
    });

    expect(answersOf(state)).toEqual({
      profile: expect.objectContaining({ saved: FORMULA, weightKg: 70 }),
      plan: FORMULA,
      planEdited: true,
      remindersOn: true,
      units: { height: 'ftIn', weight: 'kg' },
    });
  });

  it('has nothing to store before the wizard finished', () => {
    expect(answersOf(wizardAt('planReady', { plan }))).toBeNull();
  });
});
