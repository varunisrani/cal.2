import { expect, test } from '@playwright/test';

test.describe('app shell', () => {
  test('loads the product name on a phone viewport', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/');
    await expect(page).toHaveTitle('Platewise');
    // A fresh browser opens onboarding on its first step.
    await expect(page.locator('[data-ui="wizard.start"]')).toBeVisible();
    expect(errors).toEqual([]);
  });
});
