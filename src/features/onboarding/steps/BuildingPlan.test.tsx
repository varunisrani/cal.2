import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { DEFAULT_AI_SETTINGS } from '../../../ai/settings';
import { fakeFetch, type FakeStep } from '../../../ai/testing/fakeFetch';
import { geminiAnswer } from '../../../ai/testing/wire';
import type { Targets } from '../../../domain/model';
import { common } from '../../../i18n/en/common';
import { onboarding } from '../../../i18n/en/onboarding';
import { fixedClock } from '../../../lib/clock';
import { ServicesProvider, type Services } from '../../../services/context';
import {
  createPlanBuilder,
  type BuiltPlan,
  type PlanBuilder,
  type PlanRequest,
} from '../../../services/goals/planBuilder';
import { FACTORY_NOW } from '../../../test/factories';
import { closeHarnesses, openHarness } from '../../../test/screenHarness';
import { advanceAsync, useFakeTime } from '../../../test/time';
import { STAND_IN_STEPS, standInTitle, TEST_TODAY, wizardAt } from '../testing/renderWizard';
import { WizardPage } from '../WizardPage';
import type { WizardAction, WizardState } from '../wizard';
import { BUILD_ANIMATION_MS, BUILD_LINE_MS, BuildingPlan } from './BuildingPlan';
import { PlanReady } from './PlanReady';

afterEach(async () => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  await closeHarnesses();
});

const words = onboarding.onboarding.building;

/** The formula plan of the wizard's default answers (male, 25, 175 cm, 70 kg, moderate). */
const FORMULA: Targets = { kcal: 2_452, protein: 112, carbs: 406, fat: 42 };
const AI_PLAN: Targets = { kcal: 2_300, protein: 120, carbs: 320, fat: 60 };

/** A plan builder answering `plan` after `ms` (on the test's timers), recording its requests. */
function builderAfter(
  ms: number,
  plan: BuiltPlan | Error = { plan: AI_PLAN, aiUnavailable: false },
) {
  const requests: PlanRequest[] = [];
  const builder: PlanBuilder = {
    build: (request) => {
      requests.push(request);
      return new Promise((resolve, reject) => {
        setTimeout(() => (plan instanceof Error ? reject(plan) : resolve(plan)), ms);
      });
    },
  };
  return { builder, requests };
}

function servicesWith(planBuilder: PlanBuilder): Services {
  return {
    diary: { logEntry: vi.fn(), deleteEntry: vi.fn() },
    onboarding: { complete: vi.fn() },
    aiSetup: {
      saveChoice: vi.fn(),
      savedKeyMask: vi.fn(),
      setTermsAccepted: vi.fn(),
      setUpLater: vi.fn(),
    },
    planBuilder,
    clock: fixedClock(FACTORY_NOW, 'America/New_York'),
  };
}

/** The wizard on Building plan (run 1) with a stand-in Plan ready, and every state it reports. */
function showBuilding(planBuilder: PlanBuilder) {
  const states: WizardState[] = [];
  const view = render(
    <ServicesProvider services={servicesWith(planBuilder)}>
      <WizardPage
        today={TEST_TODAY}
        locale="en-GB"
        requestNotifications={vi.fn()}
        lateSteps={{ ...STAND_IN_STEPS, buildingPlan: BuildingPlan }}
        initialState={wizardAt('buildingPlan', { buildRun: 1 })}
        onStateChange={(state) => states.push(state)}
      />
    </ServicesProvider>,
  );
  const latest = (): WizardState => states.at(-1) as WizardState;
  return { ...view, latest };
}

const percentShown = () => document.querySelector('[data-ui="wizard.building.percent"]');
const linesDone = () => document.querySelectorAll('[data-ui="wizard.building.line"][data-done]');
const backButton = () => screen.queryByRole('button', { name: common.common.back });

/** Moves fake time on, letting promises and React catch up. */
const wait = (ms: number) => act(() => advanceAsync(ms));

describe('BuildingPlan', () => {
  it('counts to 100 % and ticks one line every 700 ms while the plan is built', async () => {
    useFakeTime('2026-10-26T09:00:00');
    const { builder, requests } = builderAfter(10_000);
    showBuilding(builder);

    expect(screen.getByRole('heading', { level: 1, name: words.title })).toBeVisible();
    expect(percentShown()).toHaveTextContent('0%');
    expect(linesDone()).toHaveLength(0);
    expect(screen.getAllByRole('listitem')).toHaveLength(5);

    await wait(350);
    expect(percentShown()).toHaveTextContent('10%');
    expect(linesDone()).toHaveLength(0);

    await wait(BUILD_LINE_MS - 350);
    expect(percentShown()).toHaveTextContent('20%');
    expect(linesDone()).toHaveLength(1);
    expect(screen.getAllByRole('img', { name: words.done })).toHaveLength(1);

    await wait(BUILD_LINE_MS * 4);
    expect(percentShown()).toHaveTextContent('100%');
    expect(screen.getByRole('progressbar', { name: words.progress })).toHaveAttribute(
      'aria-valuenow',
      '100',
    );
    expect(linesDone()).toHaveLength(5);

    // The wizard's answers went out once, as a profile without a plan.
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({
      profile: { sex: 'male', heightCm: 175, weightKg: 70, goal: 'maintain', saved: {} },
      today: TEST_TODAY,
      units: { height: 'cm', weight: 'kg' },
    });
  });

  it('moves on only once the 4 s animation is over when the plan came at 2 s, for the run it started (ACC-B7-2)', async () => {
    useFakeTime('2026-10-26T09:00:00');
    const { latest } = showBuilding(builderAfter(2_000).builder);

    await wait(BUILD_ANIMATION_MS - 1);
    expect(latest().step).toBe('buildingPlan');

    await wait(1);
    expect(latest()).toMatchObject({
      step: 'planReady',
      plan: { draft: { plan: AI_PLAN, touched: false }, aiUnavailable: false },
    });
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(standInTitle('planReady'));
  });

  it('moves on the moment a plan that is slower than the animation lands', async () => {
    useFakeTime('2026-10-26T09:00:00');
    const { latest } = showBuilding(builderAfter(9_000).builder);

    await wait(8_999);
    expect(latest().step).toBe('buildingPlan');
    expect(linesDone()).toHaveLength(5);

    await wait(1);
    expect(latest().step).toBe('planReady');
  });

  it('shows no Back while it builds (R01.8)', async () => {
    useFakeTime('2026-10-26T09:00:00');
    showBuilding(builderAfter(9_000).builder);

    for (const step of [0, 2_000, 2_000, 4_000]) {
      await wait(step);
      expect(backButton()).toBeNull();
      expect(
        screen.queryByRole('button', { name: onboarding.onboarding.wizard.continue }),
      ).toBeNull();
    }
  });

  it('drops a plan that lands after the step went away, and stops its request (R01.8)', async () => {
    useFakeTime('2026-10-26T09:00:00');
    const { builder, requests } = builderAfter(6_000);
    const dispatch = vi.fn<(action: WizardAction) => void>();
    const { unmount } = render(
      <ServicesProvider services={servicesWith(builder)}>
        <BuildingPlan state={wizardAt('buildingPlan', { buildRun: 3 })} dispatch={dispatch} />
      </ServicesProvider>,
    );

    await wait(1_000);
    unmount();
    expect(requests[0]?.cancel?.aborted).toBe(true);

    await wait(10_000);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('builds for the run it started with, even if the run number moves on meanwhile', async () => {
    useFakeTime('2026-10-26T09:00:00');
    const dispatch = vi.fn<(action: WizardAction) => void>();
    const services = servicesWith(builderAfter(1_000).builder);
    const { rerender } = render(
      <ServicesProvider services={services}>
        <BuildingPlan state={wizardAt('buildingPlan', { buildRun: 3 })} dispatch={dispatch} />
      </ServicesProvider>,
    );
    rerender(
      <ServicesProvider services={services}>
        <BuildingPlan state={wizardAt('buildingPlan', { buildRun: 4 })} dispatch={dispatch} />
      </ServicesProvider>,
    );

    await wait(BUILD_ANIMATION_MS);

    // The wizard drops a plan for any run but the current one (wizard.test.ts).
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledWith({
      type: 'planBuilt',
      run: 3,
      plan: AI_PLAN,
      aiUnavailable: false,
    });
  });

  it('ends on the formula plan when the plan builder itself fails', async () => {
    useFakeTime('2026-10-26T09:00:00');
    const { latest } = showBuilding(builderAfter(500, new Error('broken builder')).builder);

    await wait(BUILD_ANIMATION_MS);

    expect(latest()).toMatchObject({
      step: 'planReady',
      plan: { draft: { plan: FORMULA }, aiUnavailable: true },
    });
  });

  it('with reduced motion, steps the counter with the lines, in order and at the same pace', async () => {
    vi.stubGlobal(
      'matchMedia',
      (query: string) =>
        ({ matches: query === '(prefers-reduced-motion: reduce)' }) as MediaQueryList,
    );
    useFakeTime('2026-10-26T09:00:00');
    const { latest } = showBuilding(builderAfter(0).builder);

    await wait(BUILD_LINE_MS - 50);
    expect(percentShown()).toHaveTextContent('0%');
    expect(linesDone()).toHaveLength(0);

    await wait(50);
    expect(percentShown()).toHaveTextContent('20%');
    expect(linesDone()).toHaveLength(1);

    await wait(BUILD_LINE_MS);
    expect(percentShown()).toHaveTextContent('40%');
    const done = Array.from(linesDone(), (line) => line.textContent);
    expect(done).toEqual([words.lines.energy, words.lines.protein]);

    await wait(BUILD_ANIMATION_MS - 2 * BUILD_LINE_MS - 1);
    expect(latest().step).toBe('buildingPlan');
    await wait(1);
    expect(latest().step).toBe('planReady');
  });
});

describe('BuildingPlan with the real plan builder and Plan ready', () => {
  // The builder fetches the AI tasks on first use (P10-08): load them before any clock is faked,
  // so fake time measures the request alone.
  beforeAll(async () => {
    await import('../../../ai/tasks/planning');
  });

  const GEMINI = 'https://generativelanguage.googleapis.com/v1beta/models/';
  const planReply = (delayMs: number): FakeStep => ({
    json: geminiAnswer(
      JSON.stringify({ kcal: 2_300, protein: 120, carbs: 300, fat: 60, why: 'Slightly under.' }),
    ),
    delayMs,
  });

  /** The wizard on Building plan in the app's providers; the AI is Gemini with a key. */
  async function showWithAi(step: FakeStep) {
    const fake = fakeFetch().on(GEMINI, step);
    const planBuilder = createPlanBuilder({
      aiAccess: async () => ({ settings: DEFAULT_AI_SETTINGS, keys: { gemini: 'gm-key-8642' } }),
      energyUnit: async () => 'kcal',
      fetch: fake.fetch,
    });
    const h = await openHarness({ hash: '#/onboarding', planBuilder });
    // Timers and the clock only: the test database runs on real immediates.
    vi.useFakeTimers({
      now: Date.parse('2026-10-26T09:00:00'),
      toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'],
    });
    h.mount(
      <WizardPage
        today={TEST_TODAY}
        locale="en-US"
        requestNotifications={vi.fn()}
        lateSteps={{ ...STAND_IN_STEPS, buildingPlan: BuildingPlan, planReady: PlanReady }}
        initialState={wizardAt('buildingPlan', { buildRun: 1 })}
      />,
    );
    return fake;
  }

  /** One turn of the event loop (a message, not a timer), for the test database's callbacks. */
  const nextTurn = () =>
    new Promise<void>((resolve) => {
      const channel = new MessageChannel();
      channel.port1.onmessage = () => {
        channel.port1.close();
        resolve();
      };
      channel.port2.postMessage(null);
    });

  /**
   * Waits for `selector` while the timers are fake: each turn fires the zero-delay timers the
   * live queries start with (no time passes) and gives the database one turn.
   */
  async function untilShownOnFakeTimers(selector: string): Promise<void> {
    for (let turn = 0; turn < 500; turn++) {
      if (document.querySelector(selector) !== null) return;
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
        await nextTurn();
      });
    }
    throw new Error(`untilShownOnFakeTimers: ${selector} never showed`);
  }

  const planWords = onboarding.onboarding.planReady;
  const shown = (ui: string) => document.querySelector(`[data-ui="${ui}"]`);

  it('shows the AI plan on Plan ready after the animation when the AI answered at 2 s (ACC-B7-2)', async () => {
    await showWithAi(planReply(2_000));

    await wait(BUILD_ANIMATION_MS - 1);
    expect(shown('wizard.building')).not.toBeNull();
    await wait(1);
    await untilShownOnFakeTimers('[data-ui="wizard.plan.kcal"]');

    expect(shown('wizard.plan.kcal')).toHaveTextContent(`2,300 ${planWords.energyCaption.kcal}`);
    expect(screen.getByRole('button', { name: 'Carbs 320 g' })).toBeVisible();
    expect(shown('wizard.plan.aiUnavailable')).toBeNull();
  });

  it('shows the formula plan with the AI-unavailable note at 60 s when the AI never answers (ACC-B7-1, R01.8, D-16.14)', async () => {
    const fake = await showWithAi(planReply(600_000));

    await wait(59_999);
    expect(shown('wizard.building')).not.toBeNull();
    expect(backButton()).toBeNull();

    await wait(1);
    await untilShownOnFakeTimers('[data-ui="wizard.plan.kcal"]');

    expect(shown('wizard.plan.kcal')).toHaveTextContent(`2,452 ${planWords.energyCaption.kcal}`);
    expect(shown('wizard.plan.aiUnavailable')).toHaveTextContent(planWords.aiUnavailable);
    expect(fake.requests[0]?.signal?.aborted).toBe(true);
  });
});
