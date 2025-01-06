import { expect, test } from '@playwright/test';

test('has title', async ({ page }) => {
  await page.goto('/root');

  // Expect a title "to contain" a substring.
  await expect(page).toHaveTitle(/Geo/);
});

test('connect button', async ({ page }) => {
  await page.goto('/root');

  // Check that the Connect button is visible.
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
});
