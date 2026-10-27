/**
 * Onboarding and goals end to end (P05-15, Demo 2). Each test starts from an empty browser and
 * walks the wizard with every body answer on its default, whose formula plan is 2,452 kcal,
 * 112 g protein, 406 g carbs and 42 g fat. The AI is the fake provider (e2e/fake-ai/server.ts)
 * set up as the Custom provider at loopback http (D-16.26) with no key and a model id (R03.20);
 * its `plan-ok` script answers 2,400 kcal, 125 g protein, 340 g carbs and 60 g fat.
 */
import { devices, expect, test, type Locator, type Page } from '@playwright/test';
import { CHAT_PATH } from './fake-ai/server';
import { FAKE_AI_BASE_URL, LOCALE, fakeAi, ui, words } from './support';

test.use({ ...devices['Pixel 7'], locale: LOCALE, timezoneId: 'UTC', reducedMotion: 'reduce' });

/** A fixed morning, so "today" and the default birthday (and so the age) never move. */
const START = new Date('2026-10-27T09:00:00Z');

/** The model id typed for the Custom provider; the fake answers whatever it is asked for. */
const MODEL = 'platewise-e2e';

/** The reason `plan-ok` gives with its plan. */
const PLAN_OK_REASON = 'Your daily burn for keeping your weight, with a little more protein.';

/** A plan as Plan ready and Home write it: kcal grouped the en-US way, macros in grams. */
interface ShownPlan {
  readonly kcal: string;
  readonly protein: number;
  readonly carbs: number;
  readonly fat: number;
}

const FORMULA_PLAN: ShownPlan = { kcal: '2,452', protein: 112, carbs: 406, fat: 42 };
const AI_PLAN: ShownPlan = { kcal: '2,400', protein: 125, carbs: 340, fat: 60 };

const MACROS = ['protein', 'carbs', 'fat'] as const;

/** The steps Continue walks through on their defaults, Sex to Reminders. */
const BODY_STEPS = [
  'sex',
  'birthday',
  'body',
  'bodyFat',
  'activity',
  'goal',
  'target',
  'pace',
  'reminders',
] as const;

let pageErrors: string[] = [];

test.beforeEach(async ({ page }) => {
  pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  // The fake outlives tests: nothing scripted or recorded carries over.
  await fakeAi.reset();
  await page.clock.install({ time: START });
});

test.afterEach(() => {
  expect(pageErrors).toEqual([]);
});

/** The wizard's Continue button. */
function continueButton(wizard: Locator): Locator {
  return wizard.getByRole('button', { name: words('onboarding.wizard.continue'), exact: true });
}

/** A fresh load → Get started → Continue on every step up to AI access; returns the wizard. */
async function walkToAiAccess(page: Page): Promise<Locator> {
  const wizard = ui(page, 'screen.onboarding');
  await test.step('a fresh load opens the wizard; Continue up to AI access', async () => {
    await page.goto('/');
    await expect(wizard).toHaveAttribute('data-step', 'welcome');
    await wizard
      .getByRole('button', { name: words('onboarding.welcome.start'), exact: true })
      .click();
    const next = continueButton(wizard);
    await expect(next).toHaveAttribute('data-ui', 'wizard.continue');
    for (const step of BODY_STEPS) {
      await expect(wizard).toHaveAttribute('data-step', step);
      await next.click();
    }
    await expect(wizard).toHaveAttribute('data-step', 'aiAccess');
  });
  return wizard;
}

/**
 * AI access: the Custom provider at the fake's loopback address, no key, the model typed last so
 * Continue is seen waiting for it, the terms accepted; then Continue.
 */
async function connectFakeAi(wizard: Locator): Promise<void> {
  await test.step('AI access: Custom at loopback, no key, a model, the terms; Continue', async () => {
    const next = continueButton(wizard);
    await expect(next).toBeDisabled();

    const provider = wizard.getByRole('combobox', { name: words('aiSetup.provider.label') });
    await expect(provider).toHaveAttribute('data-ui', 'wizard.ai.provider');
    await provider.selectOption('custom');

    const server = wizard.getByRole('textbox', { name: words('aiSetup.server.label') });
    await expect(server).toHaveAttribute('data-ui', 'wizard.ai.server');
    await server.fill(FAKE_AI_BASE_URL);
    // The key is optional for Custom: its field says so and stays empty.
    const key = wizard.getByLabel(words('aiSetup.key.labelOptional'), { exact: true });
    await expect(key).toHaveAttribute('data-ui', 'wizard.ai.key');
    await expect(key).toHaveValue('');

    const terms = wizard.getByRole('checkbox', { name: words('aiSetup.access.terms.accept') });
    await expect(terms).toHaveAttribute('data-ui', 'wizard.ai.terms');
    await terms.check();
    // Everything but the model: Continue waits and says what is missing.
    await expect(ui(wizard, 'wizard.ai.model.missing')).toHaveText(words('aiSetup.model.missing'));
    await expect(next).toBeDisabled();

    const model = wizard.getByRole('textbox', { name: words('aiSetup.model.label'), exact: true });
    await expect(model).toHaveAttribute('data-ui', 'wizard.ai.model.id');
    await model.fill(MODEL);
    await expect(ui(wizard, 'wizard.ai.model.missing')).toHaveCount(0);
    await expect(next).toBeEnabled();
    await next.click();
  });
}

/** Building plan shows (with no Back), then Plan ready. */
async function waitForPlanReady(wizard: Locator): Promise<void> {
  await expect(wizard).toHaveAttribute('data-step', 'buildingPlan');
  await expect(ui(wizard, 'wizard.building')).toBeVisible();
  await expect(wizard.getByRole('button', { name: words('common.back') })).toHaveCount(0);
  await expect(wizard).toHaveAttribute('data-step', 'planReady');
}

/** Plan ready shows `plan`: the energy target and the three macro cards. */
async function expectPlanReady(wizard: Locator, plan: ShownPlan): Promise<void> {
  await expect(ui(wizard, 'wizard.plan.kcal')).toHaveAccessibleName(
    `${plan.kcal} ${words('onboarding.planReady.energyCaption.kcal')}`,
  );
  for (const macro of MACROS) {
    await expect(ui(wizard, `wizard.plan.${macro}`)).toHaveAccessibleName(
      `${words(`onboarding.planReady.macro.${macro}`)} ${words('onboarding.planReady.grams', {
        amount: plan[macro],
      })}`,
    );
  }
}

/** Opens a value's wheel on Plan ready, picks `value` and saves. */
async function editPlanValue(
  page: Page,
  wizard: Locator,
  field: 'kcal' | 'protein',
  value: number,
): Promise<void> {
  await ui(wizard, `wizard.plan.${field}`).click();
  const title = words(`onboarding.planReady.edit.${field}`);
  const sheet = page.getByRole('dialog', { name: title });
  await expect(sheet).toHaveAttribute('data-ui', 'wizard.plan.edit');
  const wheel = sheet.getByRole('combobox', { name: title });
  await expect(wheel).toHaveAttribute('data-ui', 'wizard.plan.edit.wheel');
  await wheel.selectOption(String(value));
  const save = ui(sheet, 'wizard.plan.edit.save');
  await expect(save).toHaveAccessibleName(words('common.save'));
  await save.click();
  await expect(sheet).toBeHidden();
}

/** Start tracking → Home. */
async function finish(page: Page, wizard: Locator): Promise<void> {
  const finishButton = wizard.getByRole('button', {
    name: words('onboarding.planReady.finish'),
    exact: true,
  });
  await expect(finishButton).toHaveAttribute('data-ui', 'wizard.plan.finish');
  await finishButton.click();
  await expect(page).toHaveURL(/#\/home$/);
}

/** Settings › Goals and nutrition from the tab bar; returns the page. */
async function openGoals(page: Page): Promise<Locator> {
  const tabs = page.getByRole('navigation', { name: words('shell.tabBar.label') });
  const settingsTab = tabs.getByRole('button', { name: words('common.tabs.settings') });
  await expect(settingsTab).toHaveAttribute('data-ui', 'shell.tabbar.settings');
  await settingsTab.click();
  const category = page.getByRole('button', { name: words('goals.page.title') });
  await expect(category).toHaveAttribute('data-ui', 'settings.category.goals');
  await category.click();
  const goals = ui(page, 'screen.settings.goals');
  await expect(goals.getByRole('heading', { name: words('goals.page.title') })).toBeVisible();
  return goals;
}

/** The Goals page's target rows read `plan`. */
async function expectGoalRows(goals: Locator, plan: ShownPlan): Promise<void> {
  await expect(ui(goals, 'goals.target.kcal')).toContainText(
    words('goals.page.amount.kcal', { amount: plan.kcal }),
  );
  for (const macro of MACROS) {
    await expect(ui(goals, `goals.target.${macro}`)).toContainText(
      words('goals.page.amount.g', { amount: String(plan[macro]) }),
    );
  }
}

test.describe('onboarding and goals (Demo 2)', () => {
  test('walks the wizard with the AI as a Custom provider at loopback, edits protein on Plan ready and finds those targets on Home (ACC-B7-2, ACC-B8-1, ACC-B9-1, R01.7, R03.20)', async ({
    page,
  }) => {
    await fakeAi.useScript('plan-ok');
    const wizard = await walkToAiAccess(page);
    await connectFakeAi(wizard);

    await test.step('Building plan, then Plan ready with the AI plan', async () => {
      await waitForPlanReady(wizard);
      await expectPlanReady(wizard, AI_PLAN);
      await expect(ui(wizard, 'wizard.plan.aiUnavailable')).toHaveCount(0);
      await expect(ui(wizard, 'wizard.plan.tuneUp')).toHaveText(
        words('onboarding.planReady.tuneUp'),
      );
      const requests = await fakeAi.requests();
      expect(requests).toHaveLength(1);
      expect(requests[0]).toMatchObject({
        method: 'POST',
        path: CHAT_PATH,
        body: { model: MODEL },
      });
    });

    const edited: ShownPlan = { ...AI_PLAN, protein: 150, carbs: 315 };

    await test.step('protein to 150 g: carbs follow, calories stay', async () => {
      await editPlanValue(page, wizard, 'protein', 150);
      await expectPlanReady(wizard, edited);
      await expect(ui(wizard, 'wizard.plan.tuneUp')).toHaveText(
        words('onboarding.planReady.tuneUpEdited'),
      );
    });

    await test.step('Start tracking: Home shows those targets with nothing eaten', async () => {
      await finish(page, wizard);
      const gauge = ui(page, 'home.gauge');
      await expect(gauge).toHaveAccessibleName(words('home.gauge.heading.kcal'));
      await expect(gauge).toHaveAccessibleDescription(
        `0 ${words('home.gauge.left', { amount: edited.kcal })}`,
      );
      for (const macro of MACROS) {
        const pillar = ui(page, `home.pillar.${macro}`);
        await expect(pillar).toHaveAccessibleName(words(`home.pillar.${macro}`));
        await expect(pillar).toHaveAccessibleDescription(
          `0 ${words('home.pillar.left', { amount: String(edited[macro]) })}`,
        );
      }
    });
  });

  test('falls back to the formula plan with the AI-unavailable note when the AI answer cannot be read (ACC-B7-1)', async ({
    page,
  }) => {
    await fakeAi.useScript('garbage');
    const wizard = await walkToAiAccess(page);
    await connectFakeAi(wizard);

    await test.step('Plan ready: the formula plan and the note, after one request', async () => {
      await waitForPlanReady(wizard);
      await expectPlanReady(wizard, FORMULA_PLAN);
      await expect(ui(wizard, 'wizard.plan.aiUnavailable')).toHaveText(
        words('onboarding.planReady.aiUnavailable'),
      );
      expect(await fakeAi.requests()).toHaveLength(1);
    });
  });

  test('uses the formula plan and sends nothing when AI is set up later (ACC-B6-2)', async ({
    page,
  }) => {
    const wizard = await walkToAiAccess(page);

    await test.step('AI access: Set up later', async () => {
      const later = wizard.getByRole('button', {
        name: words('aiSetup.access.later'),
        exact: true,
      });
      await expect(later).toHaveAttribute('data-ui', 'wizard.ai.later');
      await later.click();
    });

    await test.step('Plan ready: the formula plan and the note; the AI was never asked', async () => {
      await waitForPlanReady(wizard);
      await expectPlanReady(wizard, FORMULA_PLAN);
      await expect(ui(wizard, 'wizard.plan.aiUnavailable')).toHaveText(
        words('onboarding.planReady.aiUnavailable'),
      );
      expect(await fakeAi.requests()).toEqual([]);
    });
  });

  test('rebuilds the plan from Settings › Goals and nutrition and names the new daily target (ACC-C4-1)', async ({
    page,
  }) => {
    await fakeAi.useScript('plan-ok');
    const wizard = await walkToAiAccess(page);
    await connectFakeAi(wizard);

    const lowered: ShownPlan = { ...AI_PLAN, kcal: '2,000', carbs: 240 };

    await test.step('Plan ready: the AI plan, calories down to 2,000; Start tracking', async () => {
      await waitForPlanReady(wizard);
      await expectPlanReady(wizard, AI_PLAN);
      await editPlanValue(page, wizard, 'kcal', 2000);
      await expectPlanReady(wizard, lowered);
      await finish(page, wizard);
    });

    const goals =
      await test.step('Settings › Goals and nutrition shows the edited plan', async () => {
        const screen = await openGoals(page);
        await expectGoalRows(screen, lowered);
        return screen;
      });

    await test.step('Rebuild plan: the new daily target and the reason', async () => {
      await fakeAi.useScript('plan-ok');
      const rebuild = goals.getByRole('button', { name: words('goals.page.plan.rebuild') });
      await expect(rebuild).toHaveAttribute('data-ui', 'goals.rebuild');
      await rebuild.click();
      const notice = page.getByRole('alertdialog', { name: words('goals.page.plan.rebuiltTitle') });
      await expect(notice).toHaveAttribute('data-ui', 'goals.notice');
      await expect(notice).toContainText(
        words('goals.page.plan.rebuilt', {
          amount: words('goals.page.amount.kcal', { amount: AI_PLAN.kcal }),
        }),
      );
      await expect(notice).toContainText(PLAN_OK_REASON);
      const ok = ui(notice, 'goals.notice.confirm');
      await expect(ok).toHaveAccessibleName(words('goals.page.ok'));
      await ok.click();
      await expect(notice).toBeHidden();
    });

    await test.step('the target rows show the AI plan again', async () => {
      await expectGoalRows(goals, AI_PLAN);
    });
  });
});
