import { resolve } from 'path'
import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, 'index.ts'),
      name: 'some-cool-name',
      // the proper extensions will be added
      fileName: 'index',
    },
  },
})
