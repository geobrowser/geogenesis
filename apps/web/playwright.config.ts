import { defineConfig, devices } from '@playwright/test';

/**
 * Read environment variables from file.
 * https://github.com/motdotla/dotenv
 */
// require('dotenv').config();

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  testDir: './e2e',
  /* Run tests in files in parallel */
  fullyParallel: true,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,
  /* Opt out of parallel tests on CI. */
  workers: process.env.CI ? 1 : undefined,
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: 'html',
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Base URL to use in actions like `await page.goto('/')`. */
    baseURL: 'http://127.0.0.1:3000',

    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: 'on-first-retry',
  },

  /* Configure projects for major browsers */
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },

    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },

    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },

    /* Test against mobile viewports. */
    // {
    //   name: 'Mobile Chrome',
    //   use: { ...devices['Pixel 5'] },
    // },
    // {
    //   name: 'Mobile Safari',
    //   use: { ...devices['iPhone 12'] },
    // },

    /* Test against branded browsers. */
    // {
    //   name: 'Microsoft Edge',
    //   use: { ...devices['Desktop Edge'], channel: 'msedge' },
    // },
    // {
    //   name: 'Google Chrome',
    //   use: { ...devices['Desktop Chrome'], channel: 'chrome' },
    // },
  ],

  /* Run your local dev server before starting the tests */
  webServer: {
    command: 'bun start',
    url: 'http://127.0.0.1:3000',
    reuseExistingServer: !process.env.CI,
    env: {
      NEXT_PUBLIC_IS_TEST_ENV: 'true',
      NEXT_PUBLIC_PRIVY_APP_ID: 'playwright-privy-app-id',
      NEXT_PUBLIC_GEOGENESIS_RPC: 'http://127.0.0.1:8545',
      NEXT_PUBLIC_GEOGENESIS_RPC_TESTNET: 'http://127.0.0.1:8545',
      NEXT_PUBLIC_API_ENDPOINT: 'http://127.0.0.1:4000/graphql',
      NEXT_PUBLIC_API_ENDPOINT_TESTNET: 'http://127.0.0.1:4000/graphql',
      NEXT_PUBLIC_BUNDLER_RPC: 'http://127.0.0.1:4337',
      NEXT_PUBLIC_BUNDLER_RPC_TESTNET: 'http://127.0.0.1:4337',
      NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID: 'playwright-walletconnect-project-id',
      NEXT_PUBLIC_PIMLICO_API_KEY: 'playwright-pimlico-key',
      NEXT_PUBLIC_ONBOARD_FLAG: 'false',
      NEXT_PUBLIC_ONBOARD_CODE: 'playwright-onboard-code',
    },
  },
});
