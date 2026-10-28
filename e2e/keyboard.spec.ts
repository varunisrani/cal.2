/**
 * The on-screen keyboard (P14, the owner's "the chat box must show on top of the keyboard"). A
 * keyboard is stood in for by making the page 300 px shorter, as the Android app's WebView now
 * is while the keyboard is up. With a field focused: the field stays wholly in view, the tab bar
 * and Home's + button step aside, and they come back with the full height. Checked on the Coach's
 * composer and on the manual entry sheet's fields. Every request off loopback is routed; any
 * other host fails the test.
 */
import { devices, expect, test, type Locator, type Page } from '@playwright/test';
import { LOCALE, routeFoodDatabases, ui, words, type FoodDatabaseLog } from './support';

test.use({ ...devices['Pixel 7'], locale: LOCALE, timezoneId: 'UTC', reducedMotion: 'reduce' });

/** About what a phone's keyboard takes, in CSS px. */
const KEYBOARD_PX = 300;

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
});

test.afterEach(() => {
  expect(pageErrors).toEqual([]);
  expect(net.strays).toEqual([]);
});

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

/** The page's height changes by `by` px: down as the keyboard comes up, back as it goes. */
async function changeHeight(page: Page, by: number): Promise<void> {
  const size = page.viewportSize();
  if (size === null) throw new Error('The page has no viewport size');
  await page.setViewportSize({ width: size.width, height: size.height + by });
}

/** How far the element's box is from the viewport's bottom edge; negative when it runs past. */
async function roomBelow(page: Page, element: Locator): Promise<number> {
  const box = await element.boundingBox();
  const size = page.viewportSize();
  if (box === null || size === null) return Number.NaN;
  return size.height - (box.y + box.height);
}

/** The element's box lies wholly inside the viewport, and nothing scrolls it out of sight. */
async function expectWhollyInView(page: Page, element: Locator): Promise<void> {
  await expect.poll(async () => (await element.boundingBox())?.y ?? -1).toBeGreaterThanOrEqual(0);
  await expect.poll(() => roomBelow(page, element)).toBeGreaterThanOrEqual(0);
  await expect(element).toBeInViewport({ ratio: 1 });
}

test.describe('the on-screen keyboard (P14)', () => {
  test('puts the Coach composer right on the keyboard, with the tab bar away until it closes', async ({
    page,
  }) => {
    await onboard(page);
    await ui(page, 'shell.tabbar.coach').click();
    await expect(page).toHaveURL(/#\/coach$/);
    const composer = page.getByRole('textbox', { name: words('coach.composer.label') });
    const tabBar = ui(page, 'shell.tabbar');

    let barHeight = 0;
    await test.step('the composer focused: still above the tab bar', async () => {
      await composer.click();
      await expect(composer).toBeFocused();
      await expect(tabBar).toBeVisible();
      await expectWhollyInView(page, composer);
      barHeight = (await tabBar.boundingBox())?.height ?? 0;
      expect(barHeight).toBeGreaterThan(0);
    });

    await test.step('the keyboard comes up: the composer sits on it, the tab bar is away', async () => {
      await changeHeight(page, -KEYBOARD_PX);
      await expect(tabBar).toBeHidden();
      await expectWhollyInView(page, composer);
      // Right on the keyboard: less room below it than the tab bar it replaced took.
      await expect.poll(() => roomBelow(page, composer)).toBeLessThan(barHeight);
      await expect(composer).toBeFocused();
    });

    await test.step('the keyboard goes: the tab bar is back, the composer above it', async () => {
      await changeHeight(page, KEYBOARD_PX);
      await expect(tabBar).toBeVisible();
      await expectWhollyInView(page, composer);
      const bar = await tabBar.boundingBox();
      const field = await composer.boundingBox();
      expect(bar && field && field.y + field.height <= bar.y).toBe(true);
    });
  });

  test('keeps the manual entry fields in view over the keyboard, with the tab bar and + away', async ({
    page,
  }) => {
    await onboard(page);
    const tabBar = ui(page, 'shell.tabbar');
    const add = ui(page, 'home.add');
    await add.click();
    await page.getByRole('menuitem', { name: words('menu.group.describe') }).click();
    await page.getByRole('menuitem', { name: words('menu.method.manual') }).click();
    const sheet = page.getByRole('dialog', { name: words('log.manual.title') });
    const name = sheet.getByRole('textbox', { name: words('log.manual.name') });

    await test.step('the name field has the focus on open', async () => {
      await expect(name).toBeFocused();
      await expect(tabBar).toBeVisible();
      await expect(add).toBeVisible();
    });

    await test.step('the keyboard comes up: the name field stays in view', async () => {
      await changeHeight(page, -KEYBOARD_PX);
      await expect(tabBar).toBeHidden();
      await expect(add).toBeHidden();
      await expectWhollyInView(page, name);
      await expect(name).toBeFocused();
    });

    const fibre = sheet.getByRole('textbox', { name: words('log.manual.fibre') });
    await test.step('the last field, focused with the keyboard up, is in view too', async () => {
      await fibre.focus();
      await expectWhollyInView(page, fibre);
      await expect(tabBar).toBeHidden();
    });

    await test.step('the keyboard goes: the tab bar and + are back', async () => {
      await changeHeight(page, KEYBOARD_PX);
      await expect(tabBar).toBeVisible();
      await expect(add).toBeVisible();
    });

    await test.step('on a small phone the sheet scrolls to the focused last field as the keyboard comes up', async () => {
      // 640 px tall: with the keyboard up the sheet no longer fits, and its body must scroll.
      await fibre.blur();
      await page.setViewportSize({ width: 412, height: 640 });
      await fibre.focus();
      await expectWhollyInView(page, fibre);
      await expect(tabBar).toBeVisible();
      await changeHeight(page, -KEYBOARD_PX);
      await expect(tabBar).toBeHidden();
      await expectWhollyInView(page, fibre);
      await changeHeight(page, KEYBOARD_PX);
      await expect(tabBar).toBeVisible();
    });
  });
});
