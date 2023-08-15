import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // @ts-expect-error -- Not sure why these types are mismatched. Fix later.
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    alias: {
      '~': path.resolve(__dirname, './'),
    },
    setupFiles: ['./setupTests.ts'],
    exclude: ['**/node_modules/**', '**/dist/**', '**/e2e/*', '**/cypress/**', '**/.{idea,git,cache,output,temp}/**', '**/{karma,rollup,webpack,vite,vitest,jest,ava,babel,nyc,cypress,tsup,build}.config.*']
  },
});
