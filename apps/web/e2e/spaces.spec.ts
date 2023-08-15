import { test, expect } from '@playwright/test';

test('has title', async ({ page }) => {
  await page.goto('https://geobrowser.io/spaces');

  // Expect a title "to contain" a substring.
  await expect(page).toHaveTitle(/Geo Genesis/);
});

test('connect button', async ({ page }) => {
  await page.goto('https://geobrowser.io/spaces');

  // Click the get started link.
  await expect(page.getByRole('button', { name: 'Connect' })).toBeVisible();
});
