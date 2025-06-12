import type { CodegenConfig } from '@graphql-codegen/cli';

const config: CodegenConfig = {
  schema: 'https://hypergraph-v2.up.railway.app/graphql',
  documents: ['./**/*.tsx'],
  generates: {
    './core/gql/': {
      preset: 'client',
    },
  },
};
export default config;
