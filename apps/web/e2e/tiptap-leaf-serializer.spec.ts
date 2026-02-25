import { expect, test } from '@playwright/test';

test('serializes custom TipTap leaf nodes without content-hole range errors', async ({ page }) => {
  const runtimeErrors: string[] = [];

  page.on('pageerror', error => {
    runtimeErrors.push(error.message);
  });

  page.on('console', message => {
    if (message.type() === 'error') {
      runtimeErrors.push(message.text());
    }
  });

  await page.goto('/test/tiptap-leaf-serializer');

  await expect(page.getByTestId('leaf-serializer-status')).toHaveText('pass');

  expect(runtimeErrors.join('\n')).not.toContain('Content hole not allowed in a leaf node spec');
});
