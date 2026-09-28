import { defineConfig } from 'vitest/config';

/**
 * This package had no test setup at all until `useEnsureEmbeddedWallet` earned it.
 *
 * It cannot be covered from `apps/web`: this package resolves its own copy of `@privy-io/wagmi`, so
 * a `vi.mock` over there never reaches the module this code actually imports, and every attempt
 * fell through to the real hook and died on `WagmiProviderNotFoundError`. Tests have to live beside
 * the source that imports those modules.
 *
 * Worth the setup: the hook decides whether an authenticated session ends up with a wallet, and
 * each time it has been wrong the symptom was the same unhelpful one — onboarding simply never
 * appeared, with nothing in the app pointing at the cause.
 */
export default defineConfig({
  test: {
    environment: 'jsdom',
    // `dist` holds compiled copies of everything; without this vitest collects each test twice.
    exclude: ['node_modules/**', 'dist/**'],
  },
});
