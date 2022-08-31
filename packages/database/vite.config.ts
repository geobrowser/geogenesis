// Used to extend vite's defineConfig with vitest's defineConfig
// https://vitest.dev/config/#configuration
/// <reference types="vitest" />

import react from '@vitejs/plugin-react'
import { resolve } from 'path'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  build: {
    lib: {
      entry: resolve(__dirname, 'index.ts'),
      name: 'some-cool-name',
      // the proper extensions will be added
      fileName: 'index',
    },
    rollupOptions: {
      external: ['react', 'react-dom'],
      output: {
        globals: {
          react: 'React',
          'react-dom': 'ReactDOM',
        },
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
  },
})
