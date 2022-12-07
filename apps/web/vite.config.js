import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // @ts-expect-error -- Not sure why these types are mismatched. Fix later.
  plugins: [react()],
  test: {
    environment: 'jsdom',
  },
});
