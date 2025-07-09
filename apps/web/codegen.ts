import type { CodegenConfig } from '@graphql-codegen/cli';

const config: CodegenConfig = {
  schema: 'https://v2-postgraphile.up.railway.app/graphql',
  documents: ['./**/*.tsx'],
  generates: {
    './core/gql/': {
      preset: 'client',
    },
  },
};
export default config;
