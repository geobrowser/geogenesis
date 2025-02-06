import path from 'path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    alias: {
      '~': path.resolve(__dirname, './'),
    },
    env: {
      NEXT_PUBLIC_APP_ENV: 'production',
      NEXT_PUBLIC_PRIVY_APP_ID: 'a',
      NEXT_PUBLIC_GEOGENESIS_RPC: 'a',
      NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID: 'a',
      NEXT_PUBLIC_PIMLICO_API_KEY: 'a',
      NEXT_PUBLIC_ONBOARD_FLAG: 'a',
      NEXT_PUBLIC_ONBOARD_CODE: 'a',
    }
  },
});
