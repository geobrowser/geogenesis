import path from 'path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    alias: {
      '~': path.resolve(__dirname, './'),
    },
  },
});
