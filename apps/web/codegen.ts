import type { CodegenConfig } from '@graphql-codegen/cli';

const config: CodegenConfig = {
  schema: 'https://api-testnet.geobrowser.io/graphql',
  documents: ['./**/*.tsx'],
  generates: {
    './core/gql/': {
      preset: 'client',
    },
  },
};
export default config;
