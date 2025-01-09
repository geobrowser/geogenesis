import path from 'path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'happy-dom',
    env: {
      NEXT_PUBLIC_APP_ENV: "production",
      NEXT_PUBLIC_LIVEBLOCKS_PUBLIC_KEY: 'banana',
      NEXT_PUBLIC_PRIVY_APP_ID: 'banana',
      NEXT_PUBLIC_GEOGENESIS_RPC: 'banana',
      NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID: 'banana',
      NEXT_PUBLIC_PIMLICO_API_KEY: 'banana',
      NEXT_PUBLIC_ONBOARD_FLAG: 'banana',
      NEXT_PUBLIC_ONBOARD_CODE: 'banana'
    },
    alias: {
      '~': path.resolve(__dirname, './'),
    },
    deps: {
      inline: [
        "@privy-io/js-sdk-core"
      ]
    }
  },
});
