import { expect, test } from '@playwright/test';

test('has title', async ({ page }) => {
  await page.goto('/spaces');

  // Expect a title "to contain" a substring.
  await expect(page).toHaveTitle(/Geo Genesis/);
});

test('connect button', async ({ page }) => {
  await page.goto('/spaces');

  // Check that the Connect button is visible.
  await expect(page.getByRole('button', { name: 'Connect' })).toBeVisible();
});
