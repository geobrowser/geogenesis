import turbo from 'eslint-config-turbo/flat';
import { defineConfig } from 'eslint/config';

export default defineConfig([
  ...turbo,
  {
    rules: {
      'turbo/no-undeclared-env-vars': 'off',
    },
  },
]);
