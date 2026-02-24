import path from 'path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    alias: {
      '~': path.resolve(__dirname, './'),
    },
    environment: 'jsdom',
    env: {
      NEXT_PUBLIC_APP_ENV: 'production',
      NEXT_PUBLIC_PRIVY_APP_ID: 'clpsvsqpt005fl70fe775owo5',
      NEXT_PUBLIC_GEOGENESIS_RPC: 'https://test.example.com',
      NEXT_PUBLIC_GEOGENESIS_RPC_TESTNET: 'https://test.example.com',
      NEXT_PUBLIC_API_ENDPOINT: 'https://test.example.com',
      NEXT_PUBLIC_API_ENDPOINT_TESTNET: 'https://test.example.com',
      NEXT_PUBLIC_BUNDLER_RPC: 'https://test.example.com',
      NEXT_PUBLIC_BUNDLER_RPC_TESTNET: 'https://test.example.com',
      NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID: 'a',
      NEXT_PUBLIC_PIMLICO_API_KEY: 'a',
      NEXT_PUBLIC_ONBOARD_FLAG: 'a',
      NEXT_PUBLIC_ONBOARD_CODE: 'a',
    },
  },
});
