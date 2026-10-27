/**
 * The hosts the built app contacts (P10-08, L6). One session that touches everything that talks
 * to the network: the wizard's plan and the Coach (the AI provider: the Custom provider at the
 * fake's loopback address), a product found by Open Food Facts with its photo, a code it does not
 * know searched in FoodData Central with the person's key, and then Progress and every Settings
 * page, so each lazy chunk is fetched. Every request the browser makes is recorded by origin; the
 * set must be the app's own origin, the provider and the food databases, each of them reached, and
 * nothing else. The hosts are written out here, not imported, so the test holds the promise of
 * `docs/internals/ship-inventory-v1.0.md` rather than whatever the code says. Starts from an empty
 * browser on Tuesday 2026-10-27 at 08:30 UTC; as in the logging spec, a request off loopback goes
 * to our routed food databases or is aborted.
 */
import { devices, expect, test, type Page } from '@playwright/test';
import {
  FAKE_AI_BASE_URL,
  LOCALE,
  OFF_MISSING_CODE,
  OFF_PRODUCT_CODE,
  fakeAi,
  routeFoodDatabases,
  textScript,
  ui,
  words,
  type FoodDatabaseLog,
} from './support';

test.use({ ...devices['Pixel 7'], locale: LOCALE, timezoneId: 'UTC', reducedMotion: 'reduce' });

const START = new Date('2026-10-27T08:30:00Z');

/** The model id typed for the Custom provider; the fake answers whatever it is asked for. */
const MODEL = 'platewise-e2e';

/** The wizard's steps that Continue walks through on their defaults, Sex to Reminders. */
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

/** The Settings pages opened from another page (App settings, About) rather than the list. */
const SUB_PAGES = ['menu', 'product-fields', 'tab-bar', 'credits'] as const;

/** The food databases, as the shipped inventory lists them. */
const FOOD_DATABASES = [
  'https://world.openfoodfacts.org',
  'https://images.openfoodfacts.org',
  'https://api.nal.usda.gov',
];

let pageErrors: string[] = [];
let net: FoodDatabaseLog;
/** Every http(s) request the browser made, in order: its origin, and `METHOD url`. */
let requests: { origin: string; line: string }[] = [];

test.beforeEach(async ({ page, context }) => {
  pageErrors = [];
  requests = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  context.on('request', (request) => {
    const url = new URL(request.url());
    if (url.protocol === 'http:' || url.protocol === 'https:') {
      requests.push({ origin: url.origin, line: `${request.method()} ${url.href}` });
    }
  });
  await fakeAi.reset();
  net = await routeFoodDatabases(context);
  await page.clock.install({ time: START });
});

test.afterEach(() => {
  expect(pageErrors).toEqual([]);
  expect(net.strays).toEqual([]);
});

/** A fresh load → the wizard on its defaults, the fake AI as the Custom provider → Home. */
async function onboard(page: Page): Promise<void> {
  await fakeAi.useScript('plan-ok');
  await page.goto('/');
  const wizard = ui(page, 'screen.onboarding');
  await wizard
    .getByRole('button', { name: words('onboarding.welcome.start'), exact: true })
    .click();
  const next = wizard.getByRole('button', {
    name: words('onboarding.wizard.continue'),
    exact: true,
  });
  for (const step of BODY_STEPS) {
    await expect(wizard).toHaveAttribute('data-step', step);
    await next.click();
  }
  await expect(wizard).toHaveAttribute('data-step', 'aiAccess');
  await wizard
    .getByRole('combobox', { name: words('aiSetup.provider.label') })
    .selectOption('custom');
  await wizard.getByRole('textbox', { name: words('aiSetup.server.label') }).fill(FAKE_AI_BASE_URL);
  await wizard.getByRole('checkbox', { name: words('aiSetup.access.terms.accept') }).check();
  await wizard
    .getByRole('textbox', { name: words('aiSetup.model.label'), exact: true })
    .fill(MODEL);
  await next.click();
  await expect(wizard).toHaveAttribute('data-step', 'planReady');
  await wizard
    .getByRole('button', { name: words('onboarding.planReady.finish'), exact: true })
    .click();
  await expect(page).toHaveURL(/#\/home$/);
  await expect(ui(page, 'home.diary.empty')).toBeVisible();
}

/** "+" → Snap & scan → Barcode → typed digits → Look up. */
async function lookUp(page: Page, code: string): Promise<void> {
  await ui(page, 'home.add').click();
  await ui(page, 'home.add.group.snapScan').click();
  await ui(page, 'home.add.barcode').click();
  const scanner = page.getByRole('dialog', { name: words('scan.title') });
  await scanner.getByRole('textbox', { name: words('scan.digits.label') }).fill(code);
  await scanner.getByRole('button', { name: words('scan.digits.submit') }).click();
}

test.describe('the hosts the built app contacts (ACC-L6-2)', () => {
  test('only its own origin, the AI provider and the food databases, across every screen', async ({
    page,
    baseURL,
  }) => {
    await onboard(page);

    await test.step('a FoodData Central key, then a code Open Food Facts does not know', async () => {
      await ui(page, 'shell.tabbar.settings').click();
      await ui(page, 'settings.category.ai').click();
      const screen = ui(page, 'screen.settings.ai');
      const card = ui(screen, 'ai.foodDb');
      await card.getByLabel(words('aiSetup.page.foodDb.label')).fill('fdc-e2e-K3y-0042');
      await ui(card, 'ai.foodDb.save').click();
      await expect(ui(card, 'ai.foodDb.saved')).toBeVisible();
      await ui(screen, 'settings.back').click();
      await ui(page, 'shell.tabbar.home').click();

      await lookUp(page, OFF_MISSING_CODE);
      const failure = page.getByRole('alertdialog', { name: words('scan.failedTitle') });
      await expect(failure).toBeVisible();
      expect(net.fdcSearches).toHaveLength(1);
      await page.keyboard.press('Escape');
      await expect(failure).toBeHidden();
    });

    await test.step('a product Open Food Facts knows, with its photo', async () => {
      await lookUp(page, OFF_PRODUCT_CODE);
      const review = page.getByRole('dialog', { name: words('review.title') });
      await expect(ui(review, 'review.photo.1')).toBeVisible();
      expect(net.offPhotos).toHaveLength(1);
      await ui(review, 'review.cancel').click();
      await expect(review).toBeHidden();
    });

    await test.step('a question to the Coach', async () => {
      await ui(page, 'shell.tabbar.coach').click();
      await fakeAi.useReplies(textScript('Breakfast is a good start.'));
      await page
        .getByRole('textbox', { name: words('coach.composer.label') })
        .fill('How am I doing today?');
      await ui(page, 'coach.send').click();
      await expect(ui(page, 'coach.reply')).toContainText('Breakfast is a good start.');
    });

    await test.step('Progress, the Settings list and every Settings page', async () => {
      await ui(page, 'shell.tabbar.progress').click();
      await expect(ui(page, 'progress.weight')).toBeVisible();
      await ui(page, 'shell.tabbar.settings').click();
      await expect(ui(page, 'screen.settings')).toBeVisible();
      const listed = await page
        .locator('[data-ui^="settings.category."]')
        .evaluateAll((rows) =>
          rows.map((row) => row.getAttribute('data-ui')!.slice('settings.category.'.length)),
        );
      expect(listed).toContain('data');
      for (const id of [...listed, ...SUB_PAGES]) {
        await page.evaluate((hash) => {
          location.hash = hash;
        }, `#/settings/${id}`);
        const screen = ui(page, `screen.settings.${id}`);
        await expect(screen).toBeVisible();
        await expect(ui(screen, 'settings.pageLoading')).toHaveCount(0);
      }
    });

    await test.step('every request went to one of those hosts, and each was reached', async () => {
      const allowed = [
        new URL(baseURL!).origin,
        new URL(FAKE_AI_BASE_URL).origin,
        ...FOOD_DATABASES,
      ];
      const elsewhere = requests.filter((request) => !allowed.includes(request.origin));
      expect(elsewhere.map((request) => request.line)).toEqual([]);
      const reached = new Set(requests.map((request) => request.origin));
      expect([...reached].sort()).toEqual([...allowed].sort());
    });
  });
});
