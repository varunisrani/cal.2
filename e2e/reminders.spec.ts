/**
 * The reminders the person writes, end to end (P13, D-16.93). An empty browser that allows
 * notifications walks the wizard on its defaults (the AI set up later) and lands on Home on
 * Tuesday 2026-10-27 at 08:30 UTC. Then: Settings › Tracking & reminders › Your reminders adds
 * one for 08:35 every day (which also switches Notifications on, the browser having allowed
 * them); back on Home, the page clock runs to 08:35 and the reminder shows while the app is open
 * (as a banner here: the tests block the service worker that shows system notifications); then it
 * is edited and deleted. Every request off loopback is routed; any other host fails the test.
 */
import { devices, expect, test, type Locator, type Page } from '@playwright/test';
import { LOCALE, routeFoodDatabases, ui, words, type FoodDatabaseLog } from './support';

test.use({ ...devices['Pixel 7'], locale: LOCALE, timezoneId: 'UTC', reducedMotion: 'reduce' });

/** 08:30 UTC on a Tuesday. */
const START = new Date('2026-10-27T08:30:00Z');

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
let net: FoodDatabaseLog;

test.beforeEach(async ({ page, context }) => {
  pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  net = await routeFoodDatabases(context);
  await allowNotifications(page);
  await page.clock.install({ time: START });
});

test.afterEach(() => {
  expect(pageErrors).toEqual([]);
  expect(net.strays).toEqual([]);
});

/**
 * Makes the browser allow notifications from each document's start, as a person who pressed
 * Allow: headless Chromium reads `denied` from `Notification.permission` even after
 * `grantPermissions`, so the permission and its prompt are stood in for.
 */
async function allowNotifications(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const prompt = window.Notification as typeof Notification | undefined;
    if (prompt === undefined) return;
    Object.defineProperty(prompt, 'permission', { configurable: true, get: () => 'granted' });
    Object.defineProperty(prompt, 'requestPermission', {
      configurable: true,
      value: (): Promise<NotificationPermission> => Promise.resolve('granted'),
    });
  });
}

/** The wizard on its defaults, the AI set up later, to Home. */
async function onboard(page: Page): Promise<void> {
  await test.step('onboard with the AI set up later', async () => {
    await page.goto('/');
    const wizard = ui(page, 'screen.onboarding');
    await ui(wizard, 'wizard.start').click();
    for (const step of BODY_STEPS) {
      await expect(wizard).toHaveAttribute('data-step', step);
      await ui(wizard, 'wizard.continue').click();
    }
    await expect(wizard).toHaveAttribute('data-step', 'aiAccess');
    await wizard.getByRole('button', { name: words('aiSetup.access.later'), exact: true }).click();
    await expect(wizard).toHaveAttribute('data-step', 'planReady');
    await ui(wizard, 'wizard.plan.finish').click();
    await expect(page).toHaveURL(/#\/home$/);
  });
}

/** Settings tab → the hub → Tracking & reminders → its "Your reminders" card. */
async function openYourReminders(page: Page): Promise<Locator> {
  await ui(page, 'shell.tabbar.settings').click();
  await ui(page, 'settings.category.tracking').click();
  const card = ui(ui(page, 'screen.settings.tracking'), 'reminders.yours');
  await expect(card).toBeVisible();
  return card;
}

/** Back to the hub, then Home. */
async function leaveSettings(page: Page): Promise<void> {
  await ui(ui(page, 'screen.settings.tracking'), 'settings.back').click();
  await ui(page, 'shell.tabbar.home').click();
  await expect(ui(page, 'home.add')).toBeVisible();
}

test.describe('reminders of your own (P13)', () => {
  test('adds a reminder of your own, shows it at its time while open, edits and deletes it (D-16.93)', async ({
    page,
  }) => {
    await onboard(page);

    await test.step('Your reminders: add "Pack the gym bag" for 08:35 every day', async () => {
      const card = await openYourReminders(page);
      await expect(ui(card, 'reminders.yours.empty')).toHaveText(words('reminders.yours.empty'));
      await card.getByRole('button', { name: words('reminders.yours.add') }).click();

      const sheet = page.getByRole('dialog', { name: words('reminders.yours.newTitle') });
      await sheet.getByLabel(words('reminders.yours.text')).fill('Pack the gym bag');
      await sheet.getByLabel(words('reminders.yours.time')).fill('08:35');
      await ui(sheet, 'reminders.yours.save').click();
      await expect(sheet).toBeHidden();

      const row = card.getByRole('switch', { name: 'Pack the gym bag' });
      await expect(row).toHaveAttribute('aria-checked', 'true');
      await expect(row).toHaveAccessibleDescription(
        words('reminders.yours.everyDay', { time: '8:35 AM' }),
      );
      // The browser allowed notifications already: adding one turned the switch on.
      await expect(
        page.getByRole('switch', { name: words('reminders.settings.master') }),
      ).toHaveAttribute('aria-checked', 'true');
      await leaveSettings(page);
    });

    await test.step('08:35 with the app open: the reminder shows with its own words', async () => {
      await page.clock.runFor(5 * 60_000);
      const shown = page.locator('[role="status"][data-ui^="shell.reminder.custom-"]');
      await expect(shown).toContainText(words('reminders.custom.title'));
      await expect(shown).toContainText('Pack the gym bag');
      await shown.getByRole('button', { name: words('reminders.banner.dismiss') }).click();
      await expect(shown).toHaveCount(0);
    });

    await test.step('edited to Mondays and Fridays at 07:00, then deleted', async () => {
      const card = await openYourReminders(page);
      await card
        .getByRole('button', { name: words('reminders.yours.edit', { text: 'Pack the gym bag' }) })
        .click();
      const sheet = page.getByRole('dialog', { name: words('reminders.yours.editTitle') });
      await sheet.getByLabel(words('reminders.yours.time')).fill('07:00');
      for (const day of ['Tuesday', 'Wednesday', 'Thursday', 'Saturday', 'Sunday']) {
        await sheet.getByRole('button', { name: day }).click();
      }
      await ui(sheet, 'reminders.yours.save').click();
      await expect(sheet).toBeHidden();
      await expect(
        card.getByRole('switch', { name: 'Pack the gym bag' }),
      ).toHaveAccessibleDescription(
        words('reminders.yours.onDays', { days: 'Mon, Fri', time: '7:00 AM' }),
      );

      await card
        .getByRole('button', { name: words('reminders.yours.edit', { text: 'Pack the gym bag' }) })
        .click();
      await ui(
        page.getByRole('dialog', { name: words('reminders.yours.editTitle') }),
        'reminders.yours.delete',
      ).click();
      await expect(page.getByText(words('reminders.yours.deleted'))).toBeVisible();
      await expect(ui(card, 'reminders.yours.empty')).toBeVisible();
    });
  });
});
