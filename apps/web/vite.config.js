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
      NEXT_PUBLIC_GEOGENESIS_RPC: 'a',
      NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID: 'a',
      NEXT_PUBLIC_PIMLICO_API_KEY: 'a',
      NEXT_PUBLIC_ONBOARD_FLAG: 'a',
      NEXT_PUBLIC_ONBOARD_CODE: 'a',
      GEO_PK: '0x904403559d04da2d63089de2f903aa6cebe19cb3dc6490ad3a885261880ee874',
      IPFS_KEY: 'a',
    },
  },
});
