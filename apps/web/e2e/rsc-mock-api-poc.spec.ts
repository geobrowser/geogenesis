import { type Page, expect, test } from '@playwright/test';

import { mockSpaceIds } from './mock-api/handlers';

test.setTimeout(120_000);

async function gotoWithRetry(page: Page, path: string, attempts = 3) {
  let lastError: unknown = null;

  for (let index = 0; index < attempts; index++) {
    try {
      await page.goto(path, { waitUntil: 'domcontentloaded' });
      return;
    } catch (error) {
      lastError = error;
      await page.waitForTimeout(250);
    }
  }

  throw lastError;
}

test('uses mock api and can force upstream failure by route id', async ({ page }) => {
  const successResponse = await page.goto(`/space/${mockSpaceIds.success}`, { waitUntil: 'domcontentloaded' });
  expect(successResponse?.status()).toBe(200);

  await gotoWithRetry(page, `/space/${mockSpaceIds.failure}`);

  const html = await page.content();
  expect(html).toContain('Application error: a server-side exception has occurred');
});
