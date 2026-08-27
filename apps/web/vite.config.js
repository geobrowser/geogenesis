import path from 'path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    alias: {
      '~': path.resolve(__dirname, './'),
    },
    environment: 'jsdom',
    // Refuses network by default. See vitest.setup.ts — the endpoints below are unreachable on
    // purpose, and a *slow* failure is what made unmocked calls log after their test had finished.
    setupFiles: ['./vitest.setup.ts'],
    env: {
      NEXT_PUBLIC_APP_ENV: 'production',
      NEXT_PUBLIC_PRIVY_APP_ID: 'clpsvsqpt005fl70fe775owo5',
      // Required: environment.ts has no default chain id, by design.
      NEXT_PUBLIC_CHAIN_ID: '55516',
      NEXT_PUBLIC_GEOGENESIS_RPC: 'https://test.example.com',
      NEXT_PUBLIC_GEOGENESIS_RPC_TESTNET: 'https://test.example.com',
      NEXT_PUBLIC_API_ENDPOINT: 'https://test.example.com',
      NEXT_PUBLIC_API_ENDPOINT_TESTNET: 'https://test.example.com',
      NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID: 'a',
    },
  },
});
