import { expect, test } from '@playwright/test';

test.describe('app shell', () => {
  test('loads the product name on a phone viewport', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Platewise' })).toBeVisible();
    expect(errors).toEqual([]);
  });
});
